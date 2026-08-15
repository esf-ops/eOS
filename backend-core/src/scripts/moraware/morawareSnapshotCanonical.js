/**
 * Canonical Moraware snapshot row mapping shared by tiny (in-memory) and
 * chunked-on-disk generators. Do not change row meaning to make serialization easier.
 */

import path from "node:path";

export const BATCH_KEYS = Object.freeze([
  "accounts",
  "jobs",
  "job_activities",
  "job_forms",
  "job_files",
  "assignees"
]);

export const CHUNKED_MANIFEST_FORMAT = "eliteos.moraware.foundation.chunked";
export const CHUNKED_MANIFEST_VERSION = 1;

export function toIntEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function resolveSnapshotMode(raw = process.env.MORAWARE_SNAPSHOT_MODE) {
  const mode = String(raw || "tiny").trim().toLowerCase();
  return ["baseline", "baseline_2026"].includes(mode) ? mode : "tiny";
}

export function resolveSnapshotCaps(mode = resolveSnapshotMode()) {
  if (mode === "baseline_2026") {
    const jobs = toIntEnv("MORAWARE_BASELINE_MAX_JOBS", 5000);
    return Object.freeze({
      accounts: toIntEnv("MORAWARE_BASELINE_MAX_ACCOUNTS", jobs),
      jobs,
      job_activities: toIntEnv("MORAWARE_BASELINE_MAX_ACTIVITIES", 50000),
      job_forms: toIntEnv("MORAWARE_BASELINE_MAX_FORMS", 50000),
      job_files: toIntEnv("MORAWARE_BASELINE_MAX_FILES", 10000),
      assignees: toIntEnv("MORAWARE_BASELINE_MAX_ASSIGNEES", 1000)
    });
  }
  if (mode === "baseline") {
    const jobs = toIntEnv("MORAWARE_BASELINE_MAX_JOBS", 50);
    return Object.freeze({
      accounts: toIntEnv("MORAWARE_BASELINE_MAX_ACCOUNTS", jobs),
      jobs,
      job_activities: toIntEnv("MORAWARE_BASELINE_MAX_ACTIVITIES", 250),
      job_forms: toIntEnv("MORAWARE_BASELINE_MAX_FORMS", 250),
      job_files: toIntEnv("MORAWARE_BASELINE_MAX_FILES", 250),
      assignees: toIntEnv("MORAWARE_BASELINE_MAX_ASSIGNEES", 100)
    });
  }
  return Object.freeze({
    accounts: 5,
    jobs: 10,
    job_activities: 25,
    job_forms: 25,
    job_files: 25,
    assignees: 25
  });
}

export function emptyBatches() {
  return Object.fromEntries(BATCH_KEYS.map((key) => [key, []]));
}

export function emptyCounts() {
  return Object.fromEntries(BATCH_KEYS.map((key) => [key, 0]));
}

export function createSeenSets() {
  return Object.fromEntries(BATCH_KEYS.map((key) => [key, new Set()]));
}

export function pickStr(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return firstNonempty(v._text, v["#text"], v.name, v.value, v.label, v.id);
  }
  return v == null ? "" : String(v).trim();
}

export function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

export function firstNonempty(...values) {
  for (const v of values) {
    const s = pickStr(v);
    if (s) return s;
  }
  return "";
}

export function extractJobStatus(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row?.raw;
  const rawJob = raw?.job || raw?.jobNode || raw?.MorawareResponse?.jobQuery?.job;
  const info = row?.jobInfo && typeof row.jobInfo === "object" ? row.jobInfo : {};
  return firstNonempty(
    row?.status_name,
    row?.statusName,
    row?.job_status,
    row?.jobStatus,
    row?.status,
    row?.currentStatus,
    row?.processStatus,
    info.jobStatus,
    info.status,
    info.statusName,
    raw?.status_name,
    raw?.job_status,
    raw?.jobStatus,
    raw?.status,
    rawJob?._attributes?.jobStatus,
    rawJob?.jobStatus,
    rawJob?.status,
    rawJob?.processStatus
  );
}

export function extractJobProcess(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row?.raw;
  const rawJob = raw?.job || raw?.jobNode || raw?.MorawareResponse?.jobQuery?.job;
  const info = row?.jobInfo && typeof row.jobInfo === "object" ? row.jobInfo : {};
  return firstNonempty(
    row?.process_name,
    row?.processName,
    row?.process,
    row?.jobProcess,
    info.processName,
    info.process,
    raw?.process_name,
    raw?.processName,
    raw?.process,
    rawJob?._attributes?.process,
    rawJob?.process?.name,
    rawJob?.process,
    rawJob?.jobProcess
  );
}

export function jobIdFrom(row, fallback = "") {
  return firstNonempty(
    row?.source_record_id,
    row?.source_job_id,
    row?.job_id,
    row?.jobId,
    row?.source?.jobId,
    row?.jobInfo?.jobId,
    fallback
  );
}

export function accountIdFrom(row) {
  return firstNonempty(row?.source_account_id, row?.account_id, row?.accountId, row?.source?.accountId, row?.jobInfo?.accountId);
}

export function accountNameFrom(row) {
  return firstNonempty(row?.account_name, row?.accountName, row?.jobInfo?.accountName, row?.customer_name, row?.name);
}

export function mergeStatusFields(base, statusSource) {
  if (!statusSource || typeof statusSource !== "object") return base;
  const status = extractJobStatus(statusSource);
  const process = extractJobProcess(statusSource);
  if (!status && !process) return base;
  return {
    ...base,
    status_name: firstNonempty(base?.status_name, base?.statusName, base?.job_status, base?.jobStatus, base?.status, status),
    process_name: firstNonempty(base?.process_name, base?.processName, base?.process, process),
    raw_payload: {
      ...(base?.raw_payload && typeof base.raw_payload === "object" ? base.raw_payload : {}),
      status_source: {
        has_status: Boolean(status),
        has_process: Boolean(process),
        source_record_id: jobIdFrom(statusSource)
      }
    }
  };
}

export function mapAccountFromJob(job) {
  const accountId = accountIdFrom(job);
  const accountName = accountNameFrom(job);
  if (!accountId && !accountName) return null;
  return {
    source_record_id: accountId || `account-name:${accountName}`,
    account_id: accountId,
    account_name: accountName,
    raw_payload: {
      accountId,
      accountName,
      source: "derived-from-job-header"
    }
  };
}

export function mapJob(job, fallbackJobId = "") {
  const jobId = jobIdFrom(job, fallbackJobId);
  if (!jobId) return null;
  const info = job.jobInfo && typeof job.jobInfo === "object" ? job.jobInfo : {};
  const source = job.source && typeof job.source === "object" ? job.source : {};
  return {
    source_record_id: jobId,
    job_id: jobId,
    account_id: firstNonempty(job.account_id, job.accountId, source.accountId, info.accountId),
    account_name: firstNonempty(job.account_name, job.accountName, info.accountName),
    job_name: firstNonempty(job.job_name, job.jobName, info.jobName, job.name),
    job_number: firstNonempty(job.job_number, job.jobNumber),
    process_name: extractJobProcess(job),
    status_name: extractJobStatus(job),
    salesperson_name: firstNonempty(job.salesperson_name, job.salespersonName, info.salespersonName),
    created_at: firstNonempty(job.created_at, job.creation_date, job.creationDate, info.creationDate),
    modified_at: firstNonempty(job.modified_at, job.modifiedDate),
    raw_payload: job
  };
}

export function mapActivity(activity, fallbackJobId, index) {
  const jobId = firstNonempty(activity.jobId, activity.job_id, activity.source_job_id, fallbackJobId);
  const sourceId = firstNonempty(
    activity.source_record_id,
    activity.activity_id,
    activity.activityId,
    jobId ? `${jobId}:activity:${activity.activityIndex ?? index}` : ""
  );
  if (!sourceId) return null;
  return {
    source_record_id: sourceId,
    activity_id: sourceId,
    job_id: jobId,
    activity_type_name: firstNonempty(activity.activity_type_name, activity.activityTypeName, activity.activityType, activity.type),
    activity_status_name: firstNonempty(activity.activity_status_name, activity.activityStatusName, activity.activityStatus, activity.status),
    phase_name: firstNonempty(activity.phase_name, activity.phaseName),
    scheduled_date: firstNonempty(activity.scheduled_date, activity.startDate, activity.date),
    scheduled_time: firstNonempty(activity.scheduled_time, activity.schedTime),
    duration_minutes: firstNonempty(activity.duration_minutes, activity.duration),
    raw_payload: activity.raw && typeof activity.raw === "object" ? activity.raw : activity
  };
}

export function mapFormOrField(form, fallbackJobId, formIndex, field, fieldIndex) {
  const formId = firstNonempty(form.formId, form.form_id, form.id, form.source_record_id, `${fallbackJobId}:form:${formIndex}`);
  const fieldId = field ? firstNonempty(field.fieldId, field.field_id, field.id, `${formId}:field:${fieldIndex}`) : "";
  const sourceId = field ? `${formId}:${fieldId}` : formId;
  return {
    source_record_id: sourceId,
    form_id: formId,
    field_id: fieldId,
    job_id: firstNonempty(form.jobId, form.job_id, fallbackJobId),
    form_name: firstNonempty(form.formName, form.form_name, form.name),
    field_label: field ? firstNonempty(field.label, field.name, field.fieldName) : "",
    field_value: field ? firstNonempty(field.value, field.fieldValue) : "",
    raw_payload: field
      ? {
          form: {
            formId,
            formName: firstNonempty(form.formName, form.form_name, form.name)
          },
          field
        }
      : form
  };
}

function uniqEmit(ctx, key, row) {
  if (!row || typeof row !== "object") return false;
  if (ctx.counts[key] >= ctx.caps[key]) return false;
  const id = row.source_record_id;
  if (!id) return false;
  if (ctx.seen[key].has(id)) return false;
  ctx.seen[key].add(id);
  ctx.emit(key, row);
  ctx.counts[key] += 1;
  return true;
}

function pushEmit(ctx, key, row) {
  if (!row || typeof row !== "object") return false;
  if (ctx.counts[key] >= ctx.caps[key]) return false;
  ctx.emit(key, row);
  ctx.counts[key] += 1;
  return true;
}

export function collectFilesFromNode(node, fallbackJobId, ctx) {
  if (!node || typeof node !== "object" || ctx.counts.job_files >= ctx.caps.job_files) return;
  if (Array.isArray(node)) {
    for (const item of node) collectFilesFromNode(item, fallbackJobId, ctx);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const lower = key.toLowerCase();
    if ((lower === "file" || lower === "files" || lower.includes("attachment")) && value) {
      for (const file of asArray(value?.file ?? value?.attachment ?? value)) {
        if (!file || typeof file !== "object" || ctx.counts.job_files >= ctx.caps.job_files) continue;
        const fileId = firstNonempty(file.id, file.fileId, file.name, file.fileName, `${fallbackJobId}:file:${ctx.counts.job_files}`);
        uniqEmit(ctx, "job_files", {
          source_record_id: fileId,
          file_id: fileId,
          job_id: fallbackJobId,
          file_name: firstNonempty(file.fileName, file.name),
          raw_payload: file
        });
      }
    }
    if (value && typeof value === "object") collectFilesFromNode(value, fallbackJobId, ctx);
  }
}

export function collectAssigneesFromNode(node, ctx) {
  if (!node || typeof node !== "object" || ctx.counts.assignees >= ctx.caps.assignees) return;
  if (Array.isArray(node)) {
    for (const item of node) collectAssigneesFromNode(item, ctx);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const lower = key.toLowerCase();
    if ((lower.includes("assignee") || lower.includes("resource")) && value) {
      for (const resource of asArray(value?.assignee ?? value?.resource ?? value)) {
        if (!resource || typeof resource !== "object" || ctx.counts.assignees >= ctx.caps.assignees) continue;
        const id = firstNonempty(resource.id, resource.assigneeId, resource.resourceId, resource.name, `${lower}:${ctx.counts.assignees}`);
        uniqEmit(ctx, "assignees", {
          source_record_id: id,
          assignee_id: id,
          resource_name: firstNonempty(resource.name, resource.resourceName, resource.assigneeName),
          resource_type: firstNonempty(resource.type, resource.resourceType),
          raw_payload: resource
        });
      }
    }
    if (value && typeof value === "object") collectAssigneesFromNode(value, ctx);
  }
}

/**
 * Map one job (+ optional operational artifact) into canonical rows via emit().
 * job_forms: one canonical row per form field when fields exist (do not collapse).
 */
export function appendCanonicalRowsFromJob({
  rawJob,
  operational = null,
  statusSource = null,
  fallbackJobId = "",
  extraActivities = [],
  skipJobEntities = false,
  caps,
  counts,
  seen,
  emit
}) {
  const ctx = { caps, counts, seen, emit };
  const jid = jobIdFrom(rawJob, fallbackJobId);
  const job = mergeStatusFields(rawJob, statusSource || operational);
  let actualFormCount = 0;
  if (!skipJobEntities) {
    uniqEmit(ctx, "jobs", mapJob(job, jid));
    uniqEmit(ctx, "accounts", mapAccountFromJob(job));

    for (const [formIndex, form] of asArray(job.forms).entries()) {
      if (ctx.counts.job_forms >= ctx.caps.job_forms) break;
      actualFormCount += 1;
      const fields = asArray(form?.fields);
      if (fields.length) {
        for (const [fieldIndex, field] of fields.entries()) {
          if (ctx.counts.job_forms >= ctx.caps.job_forms) break;
          pushEmit(ctx, "job_forms", mapFormOrField(form, jid, formIndex, field, fieldIndex));
        }
      } else {
        pushEmit(ctx, "job_forms", mapFormOrField(form, jid, formIndex));
      }
    }

    collectFilesFromNode(job.raw || job.raw_payload || job, jid, ctx);
    collectAssigneesFromNode(job.raw || job.raw_payload || job, ctx);
  }

  const op = operational;
  if (op) {
    for (const [activityIndex, activity] of asArray(op.activities).entries()) {
      if (ctx.counts.job_activities >= ctx.caps.job_activities) break;
      uniqEmit(ctx, "job_activities", mapActivity(activity, jid, activityIndex));
    }
    collectFilesFromNode(op.raw || op, jid, ctx);
    collectAssigneesFromNode(op.raw || op, ctx);
  }

  for (const [i, activity] of asArray(extraActivities).entries()) {
    if (ctx.counts.job_activities >= ctx.caps.job_activities) break;
    uniqEmit(ctx, "job_activities", mapActivity(activity, pickStr(rawJob?.jobId) || jid, i));
  }

  return { jobId: jid, actualFormCount };
}

export function capWarningsFromCounts(counts, caps) {
  return Object.entries(caps)
    .filter(([key, cap]) => Number(counts[key] || 0) >= cap)
    .map(
      ([key, cap]) =>
        `${key} reached cap ${cap}; snapshot may be truncated. Increase MORAWARE_BASELINE_MAX_* and regenerate before import.`
    );
}

export function sourceRootFor(sourceAbs) {
  const dir = path.dirname(sourceAbs);
  if (path.basename(sourceAbs) === "index.json" && path.basename(dir) === "jobs") return path.dirname(dir);
  return dir;
}

export function resolveArtifact(root, artifactPath) {
  const p = pickStr(artifactPath);
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.resolve(root, p);
}

export function collectStatusRows(node, rows = []) {
  if (!node) return rows;
  if (Array.isArray(node)) {
    rows.push(...node.filter((r) => r && typeof r === "object" && !Array.isArray(r)));
    return rows;
  }
  if (typeof node !== "object") return rows;
  if (Array.isArray(node.jobs)) return collectStatusRows(node.jobs, rows);
  if (Array.isArray(node.rows)) return collectStatusRows(node.rows, rows);
  if (node.batches?.jobs) return collectStatusRows(node.batches.jobs, rows);
  rows.push(node);
  return rows;
}

export function isChunkedManifest(json) {
  return Boolean(
    json &&
      typeof json === "object" &&
      json.format === CHUNKED_MANIFEST_FORMAT &&
      Array.isArray(json.chunks)
  );
}
