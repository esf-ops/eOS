import express from "express";

import { logAction } from "../auth/auditLog.js";

const jsonParser = express.json({ limit: "15mb" });
const SOURCE_SYSTEM = "moraware";
const UNASSIGNED_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

function pickStr(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return firstNonempty(v._text, v["#text"], v.name, v.value, v.label, v.id);
  }
  return v == null ? "" : String(v).trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pickStr(value));
}

function toIsoOrNull(raw) {
  const s = pickStr(raw);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function toDateOrNull(raw) {
  const iso = toIsoOrNull(raw);
  return iso ? iso.slice(0, 10) : null;
}

function toNumberOrNull(raw) {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function rawPayload(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return {};
  return row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row.raw ?? row;
}

function firstNonempty(...values) {
  for (const v of values) {
    const s = pickStr(v);
    if (s) return s;
  }
  return "";
}

function rowRaw(row) {
  return row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row?.raw;
}

function rawJobNode(row) {
  const raw = rowRaw(row);
  return raw?.job || raw?.jobNode || raw?.MorawareResponse?.jobQuery?.job;
}

function extractJobStatus(row) {
  const raw = rowRaw(row);
  const rawJob = rawJobNode(row);
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
    rawJob?.jobStatus,
    rawJob?.status,
    rawJob?.processStatus
  );
}

function extractJobProcess(row) {
  const raw = rowRaw(row);
  const rawJob = rawJobNode(row);
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
    rawJob?.process?.name,
    rawJob?.process,
    rawJob?.jobProcess
  );
}

function sourceId(row, fallbackPrefix, index) {
  return firstNonempty(
    row.source_record_id,
    row.moraware_id,
    row.id,
    row.job_id,
    row.account_id,
    row.activity_id,
    row.form_id,
    row.file_id,
    row.assignee_id,
    `${fallbackPrefix}:${index}`
  );
}

function normalizeBatches(body) {
  const out = {
    accounts: [],
    jobs: [],
    job_activities: [],
    job_forms: [],
    job_files: [],
    assignees: []
  };
  const batches = body?.batches && typeof body.batches === "object" ? body.batches : body;
  for (const key of Object.keys(out)) {
    out[key] = Array.isArray(batches?.[key]) ? batches[key].filter((r) => r && typeof r === "object" && !Array.isArray(r)) : [];
  }
  const entity = pickStr(body?.entity);
  if (entity && Array.isArray(body?.rows) && Object.hasOwn(out, entity)) {
    out[entity].push(...body.rows.filter((r) => r && typeof r === "object" && !Array.isArray(r)));
  }
  return out;
}

function requireImportSecret(req, res) {
  const expected = pickStr(process.env.MORAWARE_SYNC_IMPORT_SECRET) || pickStr(process.env.EOS_CRON_SECRET);
  if (!expected) {
    res.status(500).json({ ok: false, error: "MORAWARE_SYNC_IMPORT_SECRET or EOS_CRON_SECRET not configured" });
    return false;
  }
  const got = pickStr(req.header("x-moraware-sync-secret")) || pickStr(req.header("x-eos-cron-secret"));
  if (!got || got !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

function resolveOrganizationId(req) {
  const candidate =
    pickStr(req.body?.organization_id) ||
    pickStr(req.header("x-organization-id")) ||
    pickStr(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID);
  return candidate && isUuid(candidate) ? candidate : UNASSIGNED_ORGANIZATION_ID;
}

async function safeInsertError(db, row) {
  try {
    await db.from("moraware_sync_errors").insert(row);
  } catch {
    /* non-fatal */
  }
}

async function upsertRows(db, table, rows, onConflict) {
  if (!rows.length) return { count: 0 };
  const chunkSize = 500;
  let count = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await db.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
    count += chunk.length;
  }
  return { count };
}

function buildRawRows(entity, rows, { organizationId, syncRunId }) {
  const now = new Date().toISOString();
  return rows.map((row, index) => {
    const payload = rawPayload(row);
    return {
      organization_id: organizationId,
      sync_run_id: syncRunId,
      source_system: SOURCE_SYSTEM,
      source_record_id: sourceId(row, entity, index),
      source_modified_at: toIsoOrNull(row.source_modified_at ?? row.modified_at ?? row.last_modified_at ?? payload.modifiedAt ?? payload.modified_at),
      raw_payload: payload,
      first_seen_at: now,
      last_seen_at: now,
      updated_at: now
    };
  });
}

function normalizeAccounts(rows, { organizationId, syncRunId }) {
  const now = new Date().toISOString();
  return rows.map((row, index) => ({
    organization_id: organizationId,
    sync_run_id: syncRunId,
    source_system: SOURCE_SYSTEM,
    source_account_id: sourceId(row, "account", index),
    account_name: firstNonempty(row.account_name, row.name, row.customer_name, rawPayload(row).name),
    raw_payload: rawPayload(row),
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now
  }));
}

function normalizeJobs(rows, { organizationId, syncRunId }) {
  const now = new Date().toISOString();
  return rows.map((row, index) => ({
    organization_id: organizationId,
    sync_run_id: syncRunId,
    source_system: SOURCE_SYSTEM,
    source_job_id: sourceId(row, "job", index),
    source_account_id: firstNonempty(row.source_account_id, row.account_id, row.jobInfo?.accountId, rawPayload(row).accountId),
    account_name: firstNonempty(row.account_name, row.jobInfo?.accountName, rawPayload(row).accountName),
    job_name: firstNonempty(row.job_name, row.name, row.jobInfo?.jobName, rawPayload(row).name),
    job_number: firstNonempty(row.job_number, row.number, row.jobInfo?.jobNumber, rawPayload(row).number),
    process_name: extractJobProcess(row),
    status_name: extractJobStatus(row),
    salesperson_name: firstNonempty(row.salesperson_name, row.sales_rep, row.jobInfo?.salespersonName),
    created_at_source: toIsoOrNull(row.created_at ?? row.creation_date ?? row.jobInfo?.creationDate),
    modified_at_source: toIsoOrNull(row.modified_at ?? row.source_modified_at ?? row.jobInfo?.modifiedDate),
    scheduled_at_source: toIsoOrNull(row.scheduled_at ?? row.schedule_date),
    completed_at_source: toIsoOrNull(row.completed_at ?? row.complete_date),
    install_at_source: toIsoOrNull(row.install_at ?? row.install_date),
    raw_payload: rawPayload(row),
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now
  }));
}

function normalizeActivities(rows, { organizationId, syncRunId }) {
  const now = new Date().toISOString();
  return rows.map((row, index) => ({
    organization_id: organizationId,
    sync_run_id: syncRunId,
    source_system: SOURCE_SYSTEM,
    source_activity_id: sourceId(row, "activity", index),
    source_job_id: firstNonempty(row.source_job_id, row.job_id, rawPayload(row).jobId),
    activity_type_name: firstNonempty(row.activity_type_name, row.activity_type, row.type, rawPayload(row).activityType),
    activity_status_name: firstNonempty(row.activity_status_name, row.activity_status, row.status, rawPayload(row).status),
    phase_name: firstNonempty(row.phase_name, rawPayload(row).phaseName),
    scheduled_date: toDateOrNull(row.scheduled_date ?? row.start_date ?? row.date),
    scheduled_time: firstNonempty(row.scheduled_time, row.sched_time, rawPayload(row).schedTime),
    duration_minutes: toNumberOrNull(row.duration_minutes ?? row.duration),
    raw_payload: rawPayload(row),
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now
  }));
}

function normalizeResources(rows, { organizationId, syncRunId }) {
  const now = new Date().toISOString();
  return rows.map((row, index) => ({
    organization_id: organizationId,
    sync_run_id: syncRunId,
    source_system: SOURCE_SYSTEM,
    source_resource_id: sourceId(row, "resource", index),
    resource_name: firstNonempty(row.resource_name, row.assignee_name, row.name, rawPayload(row).name),
    resource_type: firstNonempty(row.resource_type, row.assignee_type, row.type, rawPayload(row).type),
    is_active: row.is_active == null ? null : Boolean(row.is_active),
    raw_payload: rawPayload(row),
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now
  }));
}

function dataQualityFindings({ jobs, activities, accounts, assignees, organizationId, syncRunId }) {
  const now = new Date().toISOString();
  const findings = [];
  const add = (finding_type, severity, entity_type, entity_id, message, metadata = {}) => {
    findings.push({
      organization_id: organizationId,
      sync_run_id: syncRunId,
      finding_type,
      severity,
      entity_type,
      entity_id,
      message,
      metadata,
      detected_at: now,
      resolved_at: null
    });
  };
  for (const j of jobs) {
    if (!pickStr(j.source_account_id) && !pickStr(j.account_name)) add("job_missing_account", "warning", "job", j.source_job_id, "Job is missing account id/name.");
    if (!pickStr(j.status_name)) add("job_missing_status", "warning", "job", j.source_job_id, "Job is missing status.");
    if (!j.created_at_source && !j.modified_at_source) add("job_missing_dates", "warning", "job", j.source_job_id, "Job is missing created/modified dates.");
  }
  for (const a of activities) {
    if (!pickStr(a.source_job_id)) add("activity_missing_job_link", "warning", "job_activity", a.source_activity_id, "Activity is missing job link.");
    if (!pickStr(a.activity_type_name)) add("activity_missing_type", "info", "job_activity", a.source_activity_id, "Activity is missing type/name.");
  }
  for (const a of accounts) {
    if (!pickStr(a.account_name)) add("account_missing_name", "warning", "account", a.source_account_id, "Account is missing display name.");
  }
  for (const r of assignees) {
    if (!pickStr(r.resource_name)) add("resource_missing_name", "warning", "resource", r.source_resource_id, "Resource is missing name.");
  }
  return findings;
}

async function countTable(db, table, organizationId) {
  let qb = db.from(table).select("id", { count: "exact", head: true });
  if (organizationId) qb = qb.eq("organization_id", organizationId);
  const { count, error } = await qb;
  if (error) return null;
  return count ?? 0;
}

export function attachMorawareSyncRoutes(app, deps) {
  const { requireAuth, requireRole, requireHeadAccess, getSupabase } = deps;
  const healthStack = [requireAuth(), requireRole(["admin", "executive", "super_admin"]), requireHeadAccess("brain_health", { getSupabase })];

  app.post("/api/internal/moraware-sync/import", jsonParser, async (req, res) => {
    if (!requireImportSecret(req, res)) return;
    const startedAt = new Date().toISOString();
    const db = getSupabase();
    const organizationId = resolveOrganizationId(req);
    const batches = normalizeBatches(req.body);
    const mode = pickStr(req.body?.mode || req.body?.sync_run?.mode) || "manual-worker-import";
    const runner = pickStr(req.body?.runner || req.body?.sync_run?.runner) || "moraware-worker";
    const rowCounts = Object.fromEntries(Object.entries(batches).map(([k, v]) => [k, v.length]));
    let syncRunId = null;

    try {
      const runInsert = await db
        .from("moraware_sync_runs")
        .insert({
          organization_id: organizationId,
          source_system: SOURCE_SYSTEM,
          mode,
          runner,
          status: "running",
          started_at: startedAt,
          row_counts: rowCounts,
          metadata: req.body?.metadata ?? req.body?.sync_run?.metadata ?? {}
        })
        .select("id")
        .limit(1);
      if (runInsert.error) throw runInsert.error;
      syncRunId = runInsert.data?.[0]?.id ?? null;
      if (!syncRunId) throw new Error("Could not create moraware_sync_runs row");

      const rawTableByEntity = {
        accounts: "moraware_raw_accounts",
        jobs: "moraware_raw_jobs",
        job_activities: "moraware_raw_job_activities",
        job_forms: "moraware_raw_job_forms",
        job_files: "moraware_raw_job_files",
        assignees: "moraware_raw_assignees"
      };
      for (const [entity, rows] of Object.entries(batches)) {
        try {
          await upsertRows(db, rawTableByEntity[entity], buildRawRows(entity, rows, { organizationId, syncRunId }), "organization_id,source_record_id");
        } catch (e) {
          await safeInsertError(db, {
            organization_id: organizationId,
            sync_run_id: syncRunId,
            entity_type: entity,
            severity: "error",
            message: String(e?.message || e),
            raw_error: { entity }
          });
          throw e;
        }
      }

      const accounts = normalizeAccounts(batches.accounts, { organizationId, syncRunId });
      const jobs = normalizeJobs(batches.jobs, { organizationId, syncRunId });
      const activities = normalizeActivities(batches.job_activities, { organizationId, syncRunId });
      const resources = normalizeResources(batches.assignees, { organizationId, syncRunId });

      await upsertRows(db, "brain_moraware_accounts", accounts, "organization_id,source_account_id");
      await upsertRows(db, "brain_moraware_jobs", jobs, "organization_id,source_job_id");
      await upsertRows(db, "brain_moraware_job_activities", activities, "organization_id,source_activity_id");
      await upsertRows(db, "brain_moraware_resources", resources, "organization_id,source_resource_id");

      const findings = dataQualityFindings({ accounts, jobs, activities, assignees: resources, organizationId, syncRunId });
      if (findings.length) await upsertRows(db, "moraware_data_quality_findings", findings, "sync_run_id,finding_type,entity_type,entity_id");

      const finishedAt = new Date().toISOString();
      const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
      const status = "success";
      const patch = await db
        .from("moraware_sync_runs")
        .update({
          status,
          finished_at: finishedAt,
          duration_ms: durationMs,
          row_counts: rowCounts,
          data_quality_counts: findings.reduce((acc, f) => {
            acc[f.finding_type] = (acc[f.finding_type] || 0) + 1;
            return acc;
          }, {})
        })
        .eq("id", syncRunId);
      if (patch.error) throw patch.error;

      try {
        await logAction({
          user: null,
          head: "brain_health",
          actionType: "moraware_sync_import",
          entityType: "moraware_sync_run",
          entityId: syncRunId,
          outcome: status,
          metadata: { mode, runner, row_counts: rowCounts, data_quality_findings: findings.length },
          req
        });
      } catch {
        /* audit logging is non-fatal for import */
      }

      res.json({ ok: true, sync_run_id: syncRunId, status, row_counts: rowCounts, data_quality_findings: findings.length });
    } catch (e) {
      const finishedAt = new Date().toISOString();
      if (syncRunId) {
        await db
          .from("moraware_sync_runs")
          .update({
            status: "failed",
            finished_at: finishedAt,
            duration_ms: Date.parse(finishedAt) - Date.parse(startedAt),
            error_message: String(e?.message || e)
          })
          .eq("id", syncRunId);
      }
      res.status(500).json({ ok: false, sync_run_id: syncRunId, error: String(e?.message || e) });
    }
  });

  app.get("/api/moraware-sync/status", ...healthStack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = isUuid(req.query.organization_id) ? pickStr(req.query.organization_id) : pickStr(req.user?.organization_id) || null;
      let latestQ = db.from("moraware_sync_runs").select("*").order("started_at", { ascending: false }).limit(1);
      let successQ = db.from("moraware_sync_runs").select("*").eq("status", "success").order("finished_at", { ascending: false }).limit(1);
      let errorQ = db.from("moraware_sync_errors").select("*").order("created_at", { ascending: false }).limit(25);
      let findingQ = db.from("moraware_data_quality_findings").select("finding_type,severity", { count: "exact" }).is("resolved_at", null).limit(500);
      if (organizationId) {
        latestQ = latestQ.eq("organization_id", organizationId);
        successQ = successQ.eq("organization_id", organizationId);
        errorQ = errorQ.eq("organization_id", organizationId);
        findingQ = findingQ.eq("organization_id", organizationId);
      }
      const [latest, success, errors, findings] = await Promise.all([latestQ, successQ, errorQ, findingQ]);
      if (latest.error) throw latest.error;
      if (success.error) throw success.error;
      if (errors.error) throw errors.error;
      if (findings.error) throw findings.error;
      const latestRun = latest.data?.[0] ?? null;
      const lastSuccessfulRun = success.data?.[0] ?? null;
      const freshnessMs = lastSuccessfulRun?.finished_at ? Date.now() - Date.parse(String(lastSuccessfulRun.finished_at)) : null;
      const findingCounts = {};
      for (const f of findings.data || []) findingCounts[f.finding_type] = (findingCounts[f.finding_type] || 0) + 1;
      const rowCounts = {
        accounts: await countTable(db, "brain_moraware_accounts", organizationId),
        jobs: await countTable(db, "brain_moraware_jobs", organizationId),
        activities: await countTable(db, "brain_moraware_job_activities", organizationId),
        resources: await countTable(db, "brain_moraware_resources", organizationId)
      };
      res.json({
        ok: true,
        source_system: SOURCE_SYSTEM,
        organization_id: organizationId,
        latest_run: latestRun,
        last_successful_run: lastSuccessfulRun,
        sync_freshness_seconds: freshnessMs == null ? null : Math.max(0, Math.round(freshnessMs / 1000)),
        row_counts: rowCounts,
        recent_errors: errors.data || [],
        unresolved_data_quality_counts: findingCounts,
        current_data_scope: [
          "accounts/customers",
          "jobs and identifiers",
          "job status/process/date fields",
          "job activities",
          "forms/custom fields",
          "file metadata",
          "assignee/resource catalog"
        ],
        known_gaps: [
          "activity-level machine/resource assignment is not yet trusted",
          "material/inventory path is not unlocked",
          "live Machines calendar rows are not unlocked",
          "no Moraware writeback"
        ]
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
