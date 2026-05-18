import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCE = "debug/moraware/latest/jobs/index.json";
const DEFAULT_OUT = "debug/moraware/import-tests/tiny-real-moraware-snapshot.json";
const CAPS = Object.freeze({
  accounts: 5,
  jobs: 10,
  job_activities: 25,
  job_forms: 25,
  job_files: 25,
  assignees: 25
});

function pickStr(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return firstNonempty(v._text, v["#text"], v.name, v.value, v.label, v.id);
  }
  return v == null ? "" : String(v).trim();
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function firstNonempty(...values) {
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

function mergeStatusFields(base, statusSource) {
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

function uniqPush(rows, row, keyFn, cap) {
  if (!row || typeof row !== "object" || rows.length >= cap) return;
  const key = keyFn(row);
  if (!key) return;
  if (rows.some((r) => keyFn(r) === key)) return;
  rows.push(row);
}

async function readJson(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  const text = await fs.readFile(abs, "utf8");
  return { abs, json: JSON.parse(text) };
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

function sourceRootFor(sourceAbs) {
  const dir = path.dirname(sourceAbs);
  if (path.basename(sourceAbs) === "index.json" && path.basename(dir) === "jobs") return path.dirname(dir);
  return dir;
}

function resolveArtifact(root, artifactPath) {
  const p = pickStr(artifactPath);
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.resolve(root, p);
}

function normalizeExistingBatches(input) {
  const batches = input?.batches && typeof input.batches === "object" ? input.batches : input;
  if (!batches || typeof batches !== "object") return null;
  const keys = Object.keys(CAPS);
  if (!keys.some((k) => Array.isArray(batches[k]))) return null;
  return Object.fromEntries(keys.map((k) => [k, asArray(batches[k]).slice(0, CAPS[k])]));
}

function jobIdFrom(row, fallback = "") {
  return firstNonempty(row?.source_record_id, row?.source_job_id, row?.job_id, row?.jobId, row?.source?.jobId, row?.jobInfo?.jobId, fallback);
}

function accountIdFrom(row) {
  return firstNonempty(row?.source_account_id, row?.account_id, row?.accountId, row?.source?.accountId, row?.jobInfo?.accountId);
}

function accountNameFrom(row) {
  return firstNonempty(row?.account_name, row?.accountName, row?.jobInfo?.accountName, row?.customer_name, row?.name);
}

function mapAccountFromJob(job) {
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

function mapJob(job, fallbackJobId = "") {
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

function mapActivity(activity, fallbackJobId, index) {
  const jobId = firstNonempty(activity.jobId, activity.job_id, activity.source_job_id, fallbackJobId);
  const sourceId = firstNonempty(activity.source_record_id, activity.activity_id, activity.activityId, jobId ? `${jobId}:activity:${activity.activityIndex ?? index}` : "");
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

function mapFormOrField(form, fallbackJobId, formIndex, field, fieldIndex) {
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

function collectFilesFromNode(node, fallbackJobId, out) {
  if (!node || typeof node !== "object" || out.length >= CAPS.job_files) return;
  if (Array.isArray(node)) {
    for (const item of node) collectFilesFromNode(item, fallbackJobId, out);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const lower = key.toLowerCase();
    if ((lower === "file" || lower === "files" || lower.includes("attachment")) && value) {
      for (const file of asArray(value?.file ?? value?.attachment ?? value)) {
        if (!file || typeof file !== "object" || out.length >= CAPS.job_files) continue;
        const fileId = firstNonempty(file.id, file.fileId, file.name, file.fileName, `${fallbackJobId}:file:${out.length}`);
        uniqPush(
          out,
          {
            source_record_id: fileId,
            file_id: fileId,
            job_id: fallbackJobId,
            file_name: firstNonempty(file.fileName, file.name),
            raw_payload: file
          },
          (r) => r.source_record_id,
          CAPS.job_files
        );
      }
    }
    if (value && typeof value === "object") collectFilesFromNode(value, fallbackJobId, out);
  }
}

function collectAssigneesFromNode(node, out) {
  if (!node || typeof node !== "object" || out.length >= CAPS.assignees) return;
  if (Array.isArray(node)) {
    for (const item of node) collectAssigneesFromNode(item, out);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const lower = key.toLowerCase();
    if ((lower.includes("assignee") || lower.includes("resource")) && value) {
      for (const resource of asArray(value?.assignee ?? value?.resource ?? value)) {
        if (!resource || typeof resource !== "object" || out.length >= CAPS.assignees) continue;
        const id = firstNonempty(resource.id, resource.assigneeId, resource.resourceId, resource.name, `${lower}:${out.length}`);
        uniqPush(
          out,
          {
            source_record_id: id,
            assignee_id: id,
            resource_name: firstNonempty(resource.name, resource.resourceName, resource.assigneeName),
            resource_type: firstNonempty(resource.type, resource.resourceType),
            raw_payload: resource
          },
          (r) => r.source_record_id,
          CAPS.assignees
        );
      }
    }
    if (value && typeof value === "object") collectAssigneesFromNode(value, out);
  }
}

async function loadJobsFromIndex(indexRows, sourceAbs) {
  const root = sourceRootFor(sourceAbs);
  const jobs = [];
  const operationalByJob = new Map();
  for (const row of indexRows.slice(0, CAPS.jobs)) {
    const jid = jobIdFrom(row);
    const artifact = resolveArtifact(root, row.artifactPath || (jid ? `jobs/${jid}.json` : ""));
    const loaded = artifact ? await readJsonIfExists(artifact) : null;
    jobs.push({ indexRow: row, job: loaded?.json ?? row, jobId: jid });
    const opPath = jid ? resolveArtifact(root, `jobs/${jid}.operational.json`) : "";
    const op = opPath ? await readJsonIfExists(opPath) : null;
    if (op?.json) operationalByJob.set(jid, op.json);
  }
  return { jobs, operationalByJob };
}

function collectStatusRows(node, rows = []) {
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

async function loadStatusSourceMap() {
  const statusSourceFile = process.env.MORAWARE_TINY_STATUS_SOURCE_FILE || "";
  if (!statusSourceFile) return { map: new Map(), sourceFile: "" };
  const loaded = await readJson(statusSourceFile);
  const map = new Map();
  for (const row of collectStatusRows(loaded.json)) {
    const id = jobIdFrom(row) || firstNonempty(row.id, row.source_record_id);
    if (!id) continue;
    const status = extractJobStatus(row);
    const process = extractJobProcess(row);
    if (status || process) map.set(id, row);
  }
  return { map, sourceFile: path.relative(process.cwd(), loaded.abs) };
}

async function buildSnapshotFromSource(sourceAbs, input, statusSourceMap = new Map()) {
  const existing = normalizeExistingBatches(input);
  if (existing) {
    return { batches: existing, sourceShape: "existing-import-batches" };
  }

  let jobEntries = [];
  let operationalByJob = new Map();
  let sourceShape = "generic-json";

  if (Array.isArray(input)) {
    const loaded = await loadJobsFromIndex(input, sourceAbs);
    jobEntries = loaded.jobs;
    operationalByJob = loaded.operationalByJob;
    sourceShape = "jobs-index-array";
  } else if (Array.isArray(input?.jobs)) {
    jobEntries = input.jobs.slice(0, CAPS.jobs).map((job) => ({ job, jobId: jobIdFrom(job) }));
    sourceShape = "jobs-array";
  } else if (input?.jobInfo || input?.source || input?.forms) {
    jobEntries = [{ job: input, jobId: jobIdFrom(input) }];
    sourceShape = "single-normalized-job";
  } else if (Array.isArray(input?.activities) || Array.isArray(input?.phases) || input?.summary) {
    const jid = pickStr(input.jobId);
    operationalByJob.set(jid, input);
    jobEntries = jid ? [{ job: { jobId: jid, raw_payload: input }, jobId: jid }] : [];
    sourceShape = "single-operational-job";
  }

  const batches = {
    accounts: [],
    jobs: [],
    job_activities: [],
    job_forms: [],
    job_files: [],
    assignees: []
  };

  for (const entry of jobEntries) {
    if (batches.jobs.length >= CAPS.jobs) break;
    const rawJob = entry.indexRow ? { ...entry.indexRow, ...(entry.job || {}) } : entry.job || {};
    const jid = jobIdFrom(rawJob, entry.jobId);
    const statusSource = statusSourceMap.get(jid) || operationalByJob.get(jid);
    const job = mergeStatusFields(rawJob, statusSource);
    const mappedJob = mapJob(job, jid);
    uniqPush(batches.jobs, mappedJob, (r) => r.source_record_id, CAPS.jobs);
    uniqPush(batches.accounts, mapAccountFromJob(job), (r) => r.source_record_id, CAPS.accounts);

    for (const [formIndex, form] of asArray(job.forms).entries()) {
      if (batches.job_forms.length >= CAPS.job_forms) break;
      const fields = asArray(form?.fields);
      if (fields.length) {
        for (const [fieldIndex, field] of fields.entries()) {
          if (batches.job_forms.length >= CAPS.job_forms) break;
          batches.job_forms.push(mapFormOrField(form, jid, formIndex, field, fieldIndex));
        }
      } else {
        batches.job_forms.push(mapFormOrField(form, jid, formIndex));
      }
    }

    collectFilesFromNode(job.raw || job.raw_payload || job, jid, batches.job_files);
    collectAssigneesFromNode(job.raw || job.raw_payload || job, batches.assignees);

    const op = operationalByJob.get(jid);
    if (op) {
      for (const [activityIndex, activity] of asArray(op.activities).entries()) {
        if (batches.job_activities.length >= CAPS.job_activities) break;
        const mapped = mapActivity(activity, jid, activityIndex);
        uniqPush(batches.job_activities, mapped, (r) => r.source_record_id, CAPS.job_activities);
      }
      collectFilesFromNode(op.raw || op, jid, batches.job_files);
      collectAssigneesFromNode(op.raw || op, batches.assignees);
    }
  }

  if (Array.isArray(input?.activities)) {
    for (const [i, activity] of input.activities.entries()) {
      if (batches.job_activities.length >= CAPS.job_activities) break;
      uniqPush(batches.job_activities, mapActivity(activity, pickStr(input.jobId), i), (r) => r.source_record_id, CAPS.job_activities);
    }
  }
  collectAssigneesFromNode(input, batches.assignees);

  return { batches, sourceShape };
}

async function main() {
  const sourceFile = process.env.MORAWARE_TINY_SOURCE_FILE || process.env.MORAWARE_SYNC_SOURCE_FILE || DEFAULT_SOURCE;
  const outFile = process.env.MORAWARE_TINY_OUTPUT_FILE || DEFAULT_OUT;
  const { abs: sourceAbs, json } = await readJson(sourceFile);
  const { map: statusSourceMap, sourceFile: statusSourceFile } = await loadStatusSourceMap();
  const { batches, sourceShape } = await buildSnapshotFromSource(sourceAbs, json, statusSourceMap);
  const body = {
    organization_id: process.env.MORAWARE_DEFAULT_ORGANIZATION_ID || undefined,
    mode: "tiny-real-snapshot",
    runner: "local-generator",
    metadata: {
      generated_by: "backend-core/src/scripts/moraware/generateTinySnapshot.js",
      generated_at: new Date().toISOString(),
      source_file: path.relative(process.cwd(), sourceAbs),
      status_source_file: statusSourceFile || null,
      source_shape: sourceShape,
      caps: CAPS
    },
    batches
  };

  const outAbs = path.resolve(process.cwd(), outFile);
  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await fs.writeFile(outAbs, JSON.stringify(body, null, 2), "utf8");
  const counts = Object.fromEntries(Object.entries(batches).map(([k, v]) => [k, v.length]));
  console.log("Tiny Moraware snapshot generated:", {
    source: path.relative(process.cwd(), sourceAbs),
    statusSource: statusSourceFile || "(per-job operational artifacts when present)",
    sourceShape,
    output: path.relative(process.cwd(), outAbs),
    caps: CAPS,
    counts
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => {
    console.error(e?.stack || e);
    process.exitCode = 1;
  });
}
