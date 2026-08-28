/**
 * Worksheet-grain COMPLETED_INSTALLATION_SF evidence from Moraware activities.
 *
 * Production `brain_moraware_job_activities` are job-grain. Observed payload keys
 * are status, activityType, job, jobPhases, _attributes, duration, startDate,
 * schedTime, notes, description. There is no form/worksheet id and no distinct
 * completed-at timestamp. scheduled_date / startDate are schedule, not credit dates.
 *
 * Job-grain install activity is never attributed onto a worksheet.
 */

function firstNonempty(...values) {
  for (const value of values) {
    const s = value == null ? "" : String(value).trim();
    if (s) return s;
  }
  return "";
}

function rawOf(row) {
  return row?.rawPayload && typeof row.rawPayload === "object"
    ? row.rawPayload
    : row?.raw_payload && typeof row.raw_payload === "object"
      ? row.raw_payload
      : {};
}

export const OBSERVED_INSTALL_ACTIVITY_SOURCE = Object.freeze({
  table: "brain_moraware_job_activities",
  grain: "job",
  eventTypeColumn: "activity_type_name",
  completionStateColumn: "activity_status_name",
  scheduledDateColumn: "scheduled_date",
  payloadKeys: Object.freeze([
    "status",
    "activityType",
    "job",
    "jobPhases",
    "duration",
    "startDate",
    "schedTime",
    "notes",
    "description"
  ]),
  worksheetRelationship: "none",
  formIdPresent: false,
  distinctCompletedTimestampPresent: false,
  scheduledDateIsNotCompletedAt: true
});

const REJECTED_SCHEDULE_KEYS = Object.freeze(["startDate", "scheduled_date", "scheduledDate", "schedTime", "start_date"]);

export function extractActivityFormId(activity) {
  const raw = rawOf(activity);
  return firstNonempty(
    activity?.sourceFormId,
    activity?.source_form_id,
    raw.formId,
    raw.form_id,
    raw.source_form_id,
    raw.formID
  );
}

export function extractCompletedAt(activity) {
  const raw = rawOf(activity);
  return firstNonempty(
    activity?.completedAtSource,
    activity?.completed_at_source,
    raw.completedDate,
    raw.completed_date,
    raw.completedAt,
    raw.completed_at,
    raw.dateCompleted
  );
}

export function isInstallActivityType(activity) {
  const type = firstNonempty(activity?.activityTypeName, activity?.activity_type_name, rawOf(activity).activityType);
  return /^install\b/i.test(type);
}

export function isCompletedInstallStatus(activity) {
  const status = firstNonempty(
    activity?.activityStatusName,
    activity?.activity_status_name,
    rawOf(activity).status
  ).toLowerCase();
  return status === "complete" || status === "installed";
}

export function evaluateInstallActivitySource(activities = []) {
  let withFormId = 0;
  let withCompletedAt = 0;
  let installCount = 0;
  for (const activity of activities) {
    if (!isInstallActivityType(activity)) continue;
    installCount += 1;
    if (extractActivityFormId(activity)) withFormId += 1;
    if (extractCompletedAt(activity)) withCompletedAt += 1;
  }
  const worksheetJoinSupported = installCount > 0 && withFormId === installCount && withCompletedAt === installCount;
  return {
    grain: "job",
    installCount,
    withFormId,
    withCompletedAt,
    worksheetJoinSupported,
    worksheetRelationship: withFormId === 0 ? "none" : "partial",
    rejectedScheduleKeys: REJECTED_SCHEDULE_KEYS,
    observed: OBSERVED_INSTALL_ACTIVITY_SOURCE
  };
}

/**
 * Batch join: one pass over activities, one pass over worksheets. No per-job fetch.
 * Missing form id or missing completed-at yields no worksheet fact (unavailable).
 * Duplicate complete activities on the same job+form keep the earliest date once.
 * sqft null → unavailable; sqft 0 is a sourced zero.
 */
export function joinInstallActivitiesToWorksheets({ activities = [], worksheets = [] } = {}) {
  const skipped = [];
  const earliestByJobForm = new Map();
  for (const activity of activities) {
    if (!isInstallActivityType(activity)) continue;
    const jobId = firstNonempty(activity.sourceJobId, activity.source_job_id, rawOf(activity).jobId, rawOf(activity).job);
    const formId = extractActivityFormId(activity);
    if (!formId) {
      skipped.push({ reason: "activity_missing_form_id", jobId, sourceActivityId: activity.sourceActivityId || activity.source_activity_id || null });
      continue;
    }
    if (!isCompletedInstallStatus(activity)) {
      skipped.push({ reason: "missing_qualifying_event", jobId, formId });
      continue;
    }
    const completedAt = extractCompletedAt(activity);
    if (!completedAt) {
      skipped.push({ reason: "missing_completed_timestamp", jobId, formId });
      continue;
    }
    const key = `${jobId}|${formId}`;
    const prev = earliestByJobForm.get(key);
    if (!prev || String(completedAt) < String(prev.completedAt)) {
      earliestByJobForm.set(key, {
        jobId,
        formId,
        completedAt: String(completedAt).slice(0, 10),
        sourceActivityId: activity.sourceActivityId || activity.source_activity_id || null,
        activityTypeName: firstNonempty(activity.activityTypeName, activity.activity_type_name, rawOf(activity).activityType),
        activityStatusName: firstNonempty(activity.activityStatusName, activity.activity_status_name, rawOf(activity).status)
      });
    } else {
      skipped.push({ reason: "duplicate_activity", jobId, formId });
    }
  }

  const worksheetByJobForm = new Map();
  for (const ws of worksheets) {
    const jobId = firstNonempty(ws.sourceJobId, ws.source_job_id);
    const formId = firstNonempty(ws.sourceFormId, ws.source_form_id);
    if (!jobId || !formId) continue;
    worksheetByJobForm.set(`${jobId}|${formId}`, ws);
  }

  const facts = [];
  for (const hit of earliestByJobForm.values()) {
    const ws = worksheetByJobForm.get(`${hit.jobId}|${hit.formId}`);
    if (!ws) {
      skipped.push({ reason: "missing_worksheet", jobId: hit.jobId, formId: hit.formId });
      continue;
    }
    if (ws.sqft == null || ws.sqft === "") {
      skipped.push({ reason: "missing_sqft", jobId: hit.jobId, formId: hit.formId });
      continue;
    }
    const sf = Number(ws.sqft);
    if (!Number.isFinite(sf)) {
      skipped.push({ reason: "missing_sqft", jobId: hit.jobId, formId: hit.formId });
      continue;
    }
    facts.push({
      sourceJobId: hit.jobId,
      sourceFormId: hit.formId,
      sourceActivityId: hit.sourceActivityId,
      installEventType: hit.activityTypeName,
      completedState: hit.activityStatusName,
      completedFirstInstallAtSource: hit.completedAt,
      sqft: Math.round(sf * 100) / 100
    });
  }

  const source = evaluateInstallActivitySource(activities);
  return {
    facts,
    skipped,
    scannedActivityCount: activities.length,
    nPlusOne: false,
    worksheetJoinSupported: source.worksheetJoinSupported,
    source
  };
}

export function reconcileInstallFacts(previousFacts, nextJoin) {
  const nextKeys = new Set((nextJoin.facts || []).map((f) => `${f.sourceJobId}|${f.sourceFormId}`));
  const reversed = (previousFacts || []).filter((f) => !nextKeys.has(`${f.sourceJobId}|${f.sourceFormId}`));
  return { facts: nextJoin.facts, reversed, nPlusOne: false };
}
