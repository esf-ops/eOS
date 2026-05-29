import express from "express";

import { logAction } from "../auth/auditLog.js";
import { resolveHeadAccessContext } from "../me/launcherHeads.js";

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
    rawJob?._attributes?.jobStatus,
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
    rawJob?._attributes?.process,
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

function dbUpsertChunkSize(table) {
  if (String(table).includes("job_forms")) return toIntEnv("MORAWARE_SYNC_DB_UPSERT_JOB_FORMS_CHUNK_SIZE", 100);
  if (String(table).includes("job_activities")) return toIntEnv("MORAWARE_SYNC_DB_UPSERT_JOB_ACTIVITIES_CHUNK_SIZE", 250);
  return toIntEnv("MORAWARE_SYNC_DB_UPSERT_CHUNK_SIZE", 250);
}

async function upsertRows(db, table, rows, onConflict) {
  if (!rows.length) return { count: 0 };
  const chunkSize = dbUpsertChunkSize(table);
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

function toIntEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function addRowCounts(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  for (const key of keys) out[key] = (Number(a?.[key]) || 0) + (Number(b?.[key]) || 0);
  return out;
}

function summarizeImportGroupRows(groupRows, latestRun) {
  const expectedChunkCount = Math.max(
    0,
    ...groupRows.map((r) => Number(r?.metadata?.chunk_count) || 0),
    Number(latestRun?.metadata?.chunk_count) || 0
  ) || null;
  const byChunkIndex = new Map();
  for (const row of groupRows) {
    const idx = Number(row?.metadata?.chunk_index) || null;
    if (!idx) continue;
    const prev = byChunkIndex.get(idx);
    if (!prev || String(row.started_at || "") >= String(prev.started_at || "")) byChunkIndex.set(idx, row);
  }
  const latestChunkRows = [...byChunkIndex.entries()].sort((a, b) => a[0] - b[0]);
  const totalRowCounts = latestChunkRows
    .filter(([, row]) => row.status === "success")
    .reduce((acc, [, row]) => addRowCounts(acc, row.row_counts || {}), {});
  const missingChunkIndices = [];
  if (expectedChunkCount) {
    for (let i = 1; i <= expectedChunkCount; i += 1) {
      if (!byChunkIndex.has(i)) missingChunkIndices.push(i);
    }
  }
  const successfulChunks = latestChunkRows.filter(([, row]) => row.status === "success").length;
  const failedChunks = latestChunkRows.filter(([, row]) => row.status === "failed").length;
  const complete = Boolean(expectedChunkCount) && successfulChunks === expectedChunkCount && failedChunks === 0 && missingChunkIndices.length === 0;
  return {
    expectedChunkCount,
    attemptedRuns: groupRows.length,
    observedChunkCount: latestChunkRows.length,
    successfulChunks,
    failedChunks,
    missingChunkIndices,
    complete,
    totalRowCounts,
    latestChunkRows: latestChunkRows.map(([, row]) => row)
  };
}

function summarizeRun(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    organization_id: row.organization_id,
    source_system: row.source_system,
    mode: row.mode,
    runner: row.runner,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    duration_ms: row.duration_ms,
    row_counts: row.row_counts || {},
    data_quality_counts: row.data_quality_counts || {},
    error_message: row.error_message || null,
    import_group_id: pickStr(metadata.import_group_id) || null,
    chunk_index: metadata.chunk_index ?? null,
    chunk_count: metadata.chunk_count ?? null,
    chunk_counts: metadata.chunk_counts || null,
    parent_snapshot_counts: metadata.parent_snapshot_counts || null,
    caps: metadata.caps || null,
    source_shape: metadata.source_shape || null
  };
}

function requireAnyHeadAccess(headSlugs, { getSupabase }) {
  return async function anyHeadAccessMiddleware(req, res, next) {
    try {
      const u = req.user;
      if (!u?.id) return res.status(401).json({ ok: false, error: "Unauthorized" });
      if (u.isActive === false) return res.status(403).json({ ok: false, error: "You do not have access to this head." });
      const role = String(u.role ?? "").trim();
      if (role === "admin" || role === "super_admin") return next();
      const ctx = await resolveHeadAccessContext(getSupabase(), u);
      if (!ctx.ok || !ctx.active) return res.status(403).json({ ok: false, error: "You do not have access to this head." });
      for (const slug of headSlugs) {
        if (ctx.actionableGrantSet?.has(slug)) return next();
      }
      return res.status(403).json({ ok: false, error: "You do not have access to this head." });
    } catch (e) {
      console.error("requireAnyHeadAccess failed", e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  };
}

export function attachMorawareSyncRoutes(app, deps) {
  const { requireAuth, requireRole, requireHeadAccess, getSupabase } = deps;
  const healthStack = [
    requireAuth(),
    requireRole(["admin", "executive", "super_admin"]),
    requireAnyHeadAccess(["system_admin", "brain_health"], { getSupabase })
  ];

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

  app.post("/api/internal/moraware-sync/rebuild-prepared-facts", jsonParser, async (req, res) => {
    if (!requireImportSecret(req, res)) return;
    const organizationId = resolveOrganizationId(req);
    if (!organizationId || organizationId === UNASSIGNED_ORGANIZATION_ID) {
      res.status(400).json({
        ok: false,
        error: "organization_id required (JSON body, x-organization-id header, or MORAWARE_DEFAULT_ORGANIZATION_ID)"
      });
      return;
    }
    try {
      const { rebuildSalesMorawarePreparedFacts } = await import("../sales/salesHead.js");
      const db = getSupabase();
      const result = await rebuildSalesMorawarePreparedFacts(db, organizationId);
      try {
        await logAction({
          user: null,
          head: "brain_health",
          actionType: "moraware_rebuild_prepared_facts",
          entityType: "sales_moraware_job_facts",
          entityId: result.import_group_id || null,
          outcome: result.ok ? "success" : result.status || "failed",
          metadata: {
            import_group_id: result.import_group_id || null,
            jobs_scanned: result.jobs_scanned ?? null,
            facts_upserted: result.facts_upserted ?? null,
            account_rollups_upserted: result.account_rollups_upserted ?? null,
            query_page_count: result.query_page_count ?? null,
            compute_ms: result.compute_ms ?? null
          },
          req
        });
      } catch {
        /* audit logging is non-fatal for rebuild */
      }
      res.status(result.ok ? 200 : 409).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/moraware-sync/status", ...healthStack, async (req, res) => {
    try {
      const db = getSupabase();
      const organizationId = isUuid(req.query.organization_id) ? pickStr(req.query.organization_id) : pickStr(req.user?.organization_id) || null;
      const staleWarningHours = toIntEnv("MORAWARE_SYNC_STALE_WARNING_HOURS", 24);
      const staleWarningSeconds = staleWarningHours * 60 * 60;
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
      const findingSeverityCounts = {};
      for (const f of findings.data || []) findingSeverityCounts[f.severity] = (findingSeverityCounts[f.severity] || 0) + 1;
      const latestGroupId = pickStr(latestRun?.metadata?.import_group_id) || pickStr(lastSuccessfulRun?.metadata?.import_group_id) || null;
      let latestGroup = null;
      let latestGroupDataQualityCount = 0;
      if (latestGroupId) {
        let groupQ = db
          .from("moraware_sync_runs")
          .select("id,status,started_at,finished_at,duration_ms,row_counts,data_quality_counts,metadata")
          .filter("metadata->>import_group_id", "eq", latestGroupId)
          .order("started_at", { ascending: true })
          .limit(1000);
        if (organizationId) groupQ = groupQ.eq("organization_id", organizationId);
        const group = await groupQ;
        if (group.error) throw group.error;
        const groupRows = group.data || [];
        const syncRunIds = groupRows.map((r) => r.id).filter(Boolean);
        const groupFindingCounts = {};
        if (syncRunIds.length) {
          let groupFindingsQ = db
            .from("moraware_data_quality_findings")
            .select("finding_type,severity")
            .in("sync_run_id", syncRunIds)
            .is("resolved_at", null)
            .limit(1000);
          if (organizationId) groupFindingsQ = groupFindingsQ.eq("organization_id", organizationId);
          const groupFindings = await groupFindingsQ;
          if (groupFindings.error) throw groupFindings.error;
          for (const f of groupFindings.data || []) groupFindingCounts[f.finding_type] = (groupFindingCounts[f.finding_type] || 0) + 1;
          latestGroupDataQualityCount = groupFindings.data?.length ?? 0;
        }
        const groupSummary = summarizeImportGroupRows(groupRows, latestRun);
        latestGroup = {
          import_group_id: latestGroupId,
          chunk_count: groupSummary.observedChunkCount,
          attempted_runs: groupSummary.attemptedRuns,
          expected_chunk_count: groupSummary.expectedChunkCount,
          successful_chunks: groupSummary.successfulChunks,
          failed_chunks: groupSummary.failedChunks,
          missing_chunk_indices: groupSummary.missingChunkIndices,
          complete: groupSummary.complete,
          started_at: groupRows[0]?.started_at ?? null,
          finished_at: groupRows[groupRows.length - 1]?.finished_at ?? null,
          total_row_counts: groupSummary.totalRowCounts,
          data_quality_counts: groupFindingCounts,
          chunk_runs: groupRows.map((r) => ({
            id: r.id,
            status: r.status,
            chunk_index: r.metadata?.chunk_index ?? null,
            chunk_count: r.metadata?.chunk_count ?? null,
            row_counts: r.row_counts || {},
            data_quality_counts: r.data_quality_counts || {},
            started_at: r.started_at,
            finished_at: r.finished_at,
            duration_ms: r.duration_ms
          }))
        };
      }
      const rowCounts = {
        accounts: await countTable(db, "brain_moraware_accounts", organizationId),
        jobs: await countTable(db, "brain_moraware_jobs", organizationId),
        activities: await countTable(db, "brain_moraware_job_activities", organizationId),
        resources: await countTable(db, "brain_moraware_resources", organizationId)
      };
      const syncFreshnessSeconds = freshnessMs == null ? null : Math.max(0, Math.round(freshnessMs / 1000));
      const staleWarning = syncFreshnessSeconds == null || syncFreshnessSeconds > staleWarningSeconds;
      const openHistoricalDataQualityCount = Math.max(0, (findings.count ?? findings.data?.length ?? 0) - latestGroupDataQualityCount);
      const failedChunks = Number(latestGroup?.failed_chunks) || 0;
      const incompleteGroup = Boolean(latestGroup) && latestGroup.complete === false;
      const latestGroupHealthStatus =
        !lastSuccessfulRun
          ? "no_success"
          : staleWarning
            ? "stale"
            : failedChunks > 0
              ? "failed_chunks"
              : incompleteGroup
                ? "incomplete_group"
                : latestGroupDataQualityCount > 0
                  ? "needs_review"
                  : "healthy";
      const latestGroupRows = latestGroup?.total_row_counts || {};
      const knownGaps = [
        "activity-level machine/resource assignment is not yet trusted",
        "material/inventory path is not unlocked",
        "live Machines calendar rows are not unlocked",
        "no Moraware writeback"
      ];
      if ((Number(latestGroupRows.job_files) || 0) === 0) knownGaps.unshift("file metadata is currently absent from latest import group");
      if ((Number(rowCounts.resources) || 0) === 0) knownGaps.unshift("assignee/resource catalog is currently absent from Brain rows");
      res.json({
        ok: true,
        source_system: SOURCE_SYSTEM,
        organization_id: organizationId,
        latest_run: summarizeRun(latestRun),
        last_successful_run: summarizeRun(lastSuccessfulRun),
        latest_import_group_id: latestGroupId,
        latest_group: latestGroup,
        last_sync_age_seconds: syncFreshnessSeconds,
        sync_freshness_seconds: syncFreshnessSeconds,
        stale_warning_threshold_seconds: staleWarningSeconds,
        stale_warning: staleWarning,
        latest_group_data_quality_count: latestGroupDataQualityCount,
        open_historical_data_quality_count: openHistoricalDataQualityCount,
        latest_group_health_status: latestGroupHealthStatus,
        row_counts: rowCounts,
        recent_error_count: errors.data?.length ?? 0,
        recent_errors: (errors.data || []).map((e) => ({
          id: e.id,
          sync_run_id: e.sync_run_id,
          entity_type: e.entity_type,
          severity: e.severity,
          message: e.message,
          created_at: e.created_at
        })),
        unresolved_data_quality_counts: findingCounts,
        data_quality_counts: findingCounts,
        data_quality_severity_counts: findingSeverityCounts,
        current_data_scope: [
          "accounts/customers",
          "jobs and identifiers",
          "job status/process/date fields",
          "job activities",
          "forms/custom fields",
          "file metadata",
          "assignee/resource catalog"
        ],
        known_gaps: knownGaps
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
