function normalizeString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function creationDateYearPrefixFilter(creationDate, allowedPrefixes) {
  const s = normalizeString(creationDate);
  if (!s) return false;
  return allowedPrefixes.some((p) => s.startsWith(p));
}

/**
 * This status mapping is copied directly from the Make.com module (id: 18).
 * It converts Moraware status attribute IDs into a stable statusName string.
 */
export function mapActivityStatusName(statusId) {
  const id = String(statusId ?? "");
  switch (id) {
    case "3":
      return "Complete";
    case "2":
      return "Confirmed";
    case "4":
      return "Auto-Schedule";
    case "9":
      return "Scheduled";
    case "1":
      return "Estimate";
    case "8":
      return "Installed";
    case "5":
      return "Cancelled";
    case "10":
      return "Processing";
    case "11":
      return "Confirmed – Accessories";
    default:
      return "Unknown";
  }
}

/**
 * Transformation engine:
 * - Applies the same job-level filter gate as Make.com:
 *   creationDate startsWith 2025 OR startsWith 2026
 * - Renames fields into ESFN-friendly keys and drops irrelevant noise.
 *
 * Notes on "Developer Sheet mapping":
 * - Your attached markdown file is a general data dictionary, not a concrete field-id map.
 * - To avoid guessing, this transformer only maps fields explicitly present in the Make.com blueprint:
 *   jobId, jobName, jobStatus, jobCreationDate, and activity subfields.
 * - The implementation is intentionally centralized (below) so adding the real ID→name mapping
 *   later is a small, safe change.
 */
export function transformJobs({ jobs, activitiesByJobId, allowedYearPrefixes }) {
  const outJobs = [];

  for (const rawJob of jobs) {
    const jobId = normalizeString(rawJob?._attributes?.id);
    if (!jobId) continue;

    const jobCreationDate = normalizeString(rawJob?.creationDate);
    if (!creationDateYearPrefixFilter(jobCreationDate, allowedYearPrefixes)) continue;

    const jobName = normalizeString(rawJob?.name);
    const jobStatus = normalizeString(rawJob?._attributes?.jobStatus);

    const rawActs = activitiesByJobId.get(jobId) || [];
    const activities = rawActs.map((a) => {
      const activityId = normalizeString(a?._attributes?.id);
      const statusId = normalizeString(a?.status?._attributes?.id);

      return {
        activityId,
        statusId,
        statusName: mapActivityStatusName(statusId),
        startDate: normalizeString(a?.startDate),
        schedTime: normalizeString(a?.schedTime),
        duration: asNumber(a?.duration),
        notes: normalizeString(a?.notes)
      };
    });

    outJobs.push({
      jobId,
      jobName,
      jobStatus,
      jobCreationDate,
      activities
    });
  }

  return outJobs;
}

/**
 * Flattening for dashboards:
 * Converts `{ job, activities[] }` into a row-per-activity array, while preserving job context.
 * Jobs with no activities still produce one row (activity fields null) so counts don't disappear.
 */
export function flattenJobsToActivityRows(jobs) {
  const rows = [];
  for (const j of jobs) {
    if (!Array.isArray(j.activities) || j.activities.length === 0) {
      rows.push({
        jobId: j.jobId,
        jobName: j.jobName,
        jobStatus: j.jobStatus,
        jobCreationDate: j.jobCreationDate,
        activityId: null,
        statusId: null,
        statusName: null,
        startDate: null,
        schedTime: null,
        duration: null,
        notes: null
      });
      continue;
    }

    for (const a of j.activities) {
      rows.push({
        jobId: j.jobId,
        jobName: j.jobName,
        jobStatus: j.jobStatus,
        jobCreationDate: j.jobCreationDate,
        activityId: a.activityId,
        statusId: a.statusId,
        statusName: a.statusName,
        startDate: a.startDate,
        schedTime: a.schedTime,
        duration: a.duration,
        notes: a.notes
      });
    }
  }
  return rows;
}

