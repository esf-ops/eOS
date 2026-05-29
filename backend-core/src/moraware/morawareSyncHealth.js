/**
 * Moraware sync health + mirror summaries (Operations Integration Switchboard — Moraware adapter).
 * Server-side only; no credentials; list endpoints avoid full raw payloads by default.
 */

import { loadSalesAttributionCoverage } from "../sales/salesAttributionCoverage.js";

const UNASSIGNED_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

function pickStr(v) {
  return v == null ? "" : String(v).trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pickStr(value));
}

function toIntEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const MIRROR_TABLE_BY_KEY = Object.freeze({
  accounts: "brain_moraware_accounts",
  jobs: "brain_moraware_jobs",
  activities: "brain_moraware_job_activities",
  resources: "brain_moraware_resources",
  raw_forms: "moraware_raw_job_forms",
  raw_files: "moraware_raw_job_files"
});

const ROW_COUNT_KEY_BY_MIRROR = Object.freeze({
  accounts: "accounts",
  jobs: "jobs",
  activities: "activities",
  resources: "resources",
  raw_forms: "job_forms",
  raw_files: "job_files"
});

export function parseCountMode(value, defaultMode = "none") {
  const m = pickStr(value).toLowerCase();
  if (m === "exact" || m === "estimated" || m === "none") return m;
  return defaultMode;
}

export function morawareApiDiagnostics(endpoint, fields = {}) {
  return {
    endpoint,
    total_compute_ms: Number(fields.total_compute_ms) || 0,
    query_compute_ms: fields.query_compute_ms ?? null,
    count_compute_ms: fields.count_compute_ms ?? null,
    page: fields.page ?? null,
    page_size: fields.page_size ?? null,
    used_exact_count: Boolean(fields.used_exact_count),
    count_mode: fields.count_mode ?? null,
    count_status: fields.count_status ?? null
  };
}

function addRowCounts(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  for (const key of keys) out[key] = (Number(a?.[key]) || 0) + (Number(b?.[key]) || 0);
  return out;
}

export function resolveMorawareOrganizationId(req) {
  const queryOrg = pickStr(req.query?.organization_id);
  if (isUuid(queryOrg)) return queryOrg;
  const userOrg = pickStr(req.user?.organization_id);
  if (isUuid(userOrg)) return userOrg;
  const defaultOrg = pickStr(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID);
  if (isUuid(defaultOrg)) return defaultOrg;
  return "";
}

export function summarizeImportGroupRows(groupRows, latestRun) {
  const expectedChunkCount =
    Math.max(
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
  const successfulSyncRunIds = latestChunkRows.filter(([, row]) => row.status === "success").map(([, row]) => row.id);
  const complete =
    Boolean(expectedChunkCount) && successfulChunks === expectedChunkCount && failedChunks === 0 && missingChunkIndices.length === 0;
  return {
    expectedChunkCount,
    attemptedRuns: groupRows.length,
    observedChunkCount: latestChunkRows.length,
    successfulChunks,
    failedChunks,
    missingChunkIndices,
    complete,
    totalRowCounts,
    successfulSyncRunIds,
    started_at: groupRows[0]?.started_at ?? null,
    finished_at: groupRows[groupRows.length - 1]?.finished_at ?? null
  };
}

/** API-facing import group shape (snake_case; chunk counts for UI). */
export function formatImportGroupForApi(importGroupId, summary, extra = {}) {
  const expected = summary?.expectedChunkCount ?? null;
  const successful = summary?.successfulChunks ?? null;
  let chunk_count_unavailable_reason = null;
  if (!expected) {
    chunk_count_unavailable_reason = "chunk_count not stored on sync run metadata (expected_chunk_count missing)";
  } else if (successful == null) {
    chunk_count_unavailable_reason = "chunk_index metadata missing on import runs";
  }
  return {
    import_group_id: importGroupId,
    expected_chunk_count: expected,
    observed_chunk_count: summary?.observedChunkCount ?? null,
    successful_chunks: successful,
    failed_chunks: summary?.failedChunks ?? null,
    missing_chunk_indices: summary?.missingChunkIndices ?? [],
    complete: Boolean(summary?.complete),
    attempted_runs: summary?.attemptedRuns ?? null,
    total_row_counts: summary?.totalRowCounts ?? {},
    successful_sync_run_ids: summary?.successfulSyncRunIds ?? [],
    started_at: summary?.started_at ?? null,
    finished_at: summary?.finished_at ?? null,
    chunk_count_unavailable_reason,
    ...extra
  };
}

function summarizeRun(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    organization_id: row.organization_id,
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
    chunk_count: metadata.chunk_count ?? null
  };
}

async function countTableExact(db, table, organizationId) {
  const t0 = Date.now();
  try {
    let qb = db.from(table).select("id", { count: "exact", head: true });
    if (organizationId) qb = qb.eq("organization_id", organizationId);
    const { count, error } = await qb;
    if (error) return { ok: false, error: String(error.message), compute_ms: Date.now() - t0 };
    return { ok: true, count: count ?? 0, compute_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), compute_ms: Date.now() - t0 };
  }
}

function mirrorCountFromSyncMetadata(mirrorKey, totalRowCounts = {}) {
  const syncKey = ROW_COUNT_KEY_BY_MIRROR[mirrorKey];
  if (!syncKey) return null;
  const n = Number(totalRowCounts?.[syncKey]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function resolveMirrorRowCounts(db, organizationId, { countMode = "estimated", totalRowCounts = {} } = {}) {
  const t0 = Date.now();
  const out = {};
  let countComputeMs = 0;
  for (const [key, table] of Object.entries(MIRROR_TABLE_BY_KEY)) {
    const hint = mirrorCountFromSyncMetadata(key, totalRowCounts);
    if (countMode === "none") {
      out[key] = {
        count: hint,
        count_status: hint != null ? "estimated" : "unavailable",
        count_source: hint != null ? "sync_metadata" : "none",
        table
      };
      continue;
    }
    if (countMode === "estimated") {
      out[key] = {
        count: hint,
        count_status: hint != null ? "estimated" : "unavailable",
        count_source: hint != null ? "sync_metadata" : "none",
        table,
        note: hint == null ? "Set count_mode=exact for table scan (slow on large mirrors)" : undefined
      };
      continue;
    }
    const exact = await countTableExact(db, table, organizationId);
    countComputeMs += exact.compute_ms || 0;
    out[key] = {
      count: exact.ok ? exact.count : hint,
      count_status: exact.ok ? "exact" : hint != null ? "estimated" : "unavailable",
      count_source: exact.ok ? "exact_query" : hint != null ? "sync_metadata" : "none",
      table,
      error: exact.error || null
    };
  }
  return { counts: out, count_compute_ms: countComputeMs, compute_ms: Date.now() - t0 };
}

async function loadImportGroupDetail(db, organizationId, importGroupId) {
  if (!importGroupId) return null;
  let groupQ = db
    .from("moraware_sync_runs")
    .select("id,status,started_at,finished_at,duration_ms,row_counts,data_quality_counts,metadata,mode,runner")
    .filter("metadata->>import_group_id", "eq", importGroupId)
    .order("started_at", { ascending: true })
    .limit(1000);
  if (organizationId) groupQ = groupQ.eq("organization_id", organizationId);
  const { data, error } = await groupQ;
  if (error) throw error;
  const groupRows = data || [];
  const latestRun = groupRows[groupRows.length - 1] ?? null;
  const summary = summarizeImportGroupRows(groupRows, latestRun);
  return formatImportGroupForApi(importGroupId, summary, {
    chunk_runs: groupRows.map((r) => summarizeRun(r))
  });
}

/**
 * Find the most recent **complete** import group without scanning hundreds of groups.
 */
export async function loadLatestCompleteImportGroup(db, organizationId, { maxGroupsToCheck = 20 } = {}) {
  let q = db
    .from("moraware_sync_runs")
    .select("metadata,finished_at,status")
    .eq("status", "success")
    .not("metadata->>import_group_id", "is", null)
    .order("finished_at", { ascending: false })
    .limit(80);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  if (error) throw error;
  const seen = new Set();
  const orderedGroupIds = [];
  for (const row of data || []) {
    const gid = pickStr(row.metadata?.import_group_id);
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    orderedGroupIds.push({ gid, finished_at: pickStr(row.finished_at) });
  }
  let best = null;
  let bestFinished = "";
  for (const { gid, finished_at: finHint } of orderedGroupIds.slice(0, maxGroupsToCheck)) {
    const detail = await loadImportGroupDetail(db, organizationId, gid);
    if (!detail?.complete) continue;
    const fin = pickStr(detail.finished_at) || finHint;
    if (!best || fin > bestFinished) {
      best = detail;
      bestFinished = fin;
    }
  }
  return best;
}

/** Latest successful run + its import group (single group query). */
export async function loadLatestSuccessfulImportGroup(db, organizationId) {
  let q = db
    .from("moraware_sync_runs")
    .select("id,metadata,finished_at,started_at,status,row_counts,mode,runner")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  if (error) throw error;
  const latest = data?.[0] ?? null;
  const importGroupId = pickStr(latest?.metadata?.import_group_id);
  if (!importGroupId) return { latest_run: summarizeRun(latest), import_group: null };
  const import_group = await loadImportGroupDetail(db, organizationId, importGroupId);
  return { latest_run: summarizeRun(latest), import_group };
}

export async function loadMorawareSyncOverview(db, organizationId, { includeLatestComplete = true } = {}) {
  let latestQ = db.from("moraware_sync_runs").select("*").order("started_at", { ascending: false }).limit(1);
  let successQ = db.from("moraware_sync_runs").select("*").eq("status", "success").order("finished_at", { ascending: false }).limit(1);
  if (organizationId) {
    latestQ = latestQ.eq("organization_id", organizationId);
    successQ = successQ.eq("organization_id", organizationId);
  }
  const [latest, success] = await Promise.all([latestQ, successQ]);
  if (latest.error) throw latest.error;
  if (success.error) throw success.error;
  const latestRun = latest.data?.[0] ?? null;
  const lastSuccess = success.data?.[0] ?? null;
  const latestGroupId =
    pickStr(latestRun?.metadata?.import_group_id) || pickStr(lastSuccess?.metadata?.import_group_id) || "";
  const latestGroup = latestGroupId ? await loadImportGroupDetail(db, organizationId, latestGroupId) : null;
  let latestCompleteGroup = null;
  if (includeLatestComplete) {
    if (latestGroup?.complete) latestCompleteGroup = latestGroup;
    else latestCompleteGroup = await loadLatestCompleteImportGroup(db, organizationId);
  }
  return {
    latest_run: summarizeRun(latestRun),
    last_successful_run: summarizeRun(lastSuccess),
    latest_import_group: latestGroup,
    latest_complete_import_group: latestCompleteGroup
  };
}

export async function loadPreparedFactsSummary(db, organizationId, latestCompleteGroup, { countMode = "estimated" } = {}) {
  const completeGroupId = pickStr(latestCompleteGroup?.import_group_id);
  const completeJobHint = Number(latestCompleteGroup?.total_row_counts?.jobs);
  const jobFactsLatestGroup = await (async () => {
    if (!organizationId) return { import_group_id: null, updated_at: null, row_count: null };
    try {
      let q = db
        .from("sales_moraware_job_facts")
        .select("import_group_id,updated_at")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(1);
      const { data, error } = await q;
      if (error) return { import_group_id: null, updated_at: null, error: error.message };
      const row = data?.[0];
      const groupId = pickStr(row?.import_group_id);
      let rowCount = null;
      if (countMode === "exact" && groupId) {
        const { count, error: countErr } = await db
          .from("sales_moraware_job_facts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("import_group_id", groupId);
        rowCount = countErr ? null : count ?? 0;
      } else if (groupId === completeGroupId && Number.isFinite(completeJobHint)) {
        rowCount = completeJobHint;
      }
      return {
        import_group_id: groupId || null,
        updated_at: row?.updated_at ?? null,
        row_count: rowCount
      };
    } catch (e) {
      return { import_group_id: null, updated_at: null, error: String(e?.message || e) };
    }
  })();

  let jobFactsCount = { ok: true, count: jobFactsLatestGroup.row_count };
  let rollupsCount = { ok: true, count: null };
  if (countMode === "exact") {
    [jobFactsCount, rollupsCount] = await Promise.all([
      countTableExact(db, "sales_moraware_job_facts", organizationId),
      countTableExact(db, "sales_moraware_account_rollups", organizationId)
    ]);
  } else if (jobFactsLatestGroup.row_count != null) {
    jobFactsCount = { ok: true, count: jobFactsLatestGroup.row_count };
  }

  const factsGroupId = pickStr(jobFactsLatestGroup.import_group_id);
  let freshness = "missing";
  if (!completeGroupId) freshness = "no_complete_import_group";
  else if (!factsGroupId) freshness = "missing";
  else if (factsGroupId === completeGroupId) freshness = "fresh";
  else freshness = "stale";

  return {
    sales_moraware_job_facts: {
      table_count: jobFactsCount.ok ? jobFactsCount.count : null,
      source_import_group_id: factsGroupId,
      last_updated_at: jobFactsLatestGroup.updated_at,
      rows_for_source_group: jobFactsLatestGroup.row_count
    },
    sales_moraware_account_rollups: {
      table_count: rollupsCount.ok ? rollupsCount.count : null,
      source_import_group_id: factsGroupId
    },
    latest_complete_import_group_id: completeGroupId || null,
    freshness,
    rebuild_endpoint: "POST /api/sales/admin/rebuild-moraware-facts",
    internal_rebuild_endpoint: "POST /api/internal/moraware-sync/rebuild-prepared-facts",
    rebuild_requires: "admin role + sales head access (admin route); cron secret (internal route)"
  };
}

export async function buildMorawareAdminHealth(db, organizationId, { countMode = "estimated" } = {}) {
  const t0 = Date.now();
  let queryMs = 0;
  const staleWarningHours = toIntEnv("MORAWARE_SYNC_STALE_WARNING_HOURS", 24);
  const staleWarningSeconds = staleWarningHours * 60 * 60;
  const qOverviewStart = Date.now();
  const overview = await loadMorawareSyncOverview(db, organizationId);
  queryMs += Date.now() - qOverviewStart;
  const qPreparedStart = Date.now();
  const prepared = await loadPreparedFactsSummary(db, organizationId, overview.latest_complete_import_group, { countMode });
  queryMs += Date.now() - qPreparedStart;

  const lastSuccessAgeSeconds = overview.last_successful_run?.finished_at
    ? Math.max(0, Math.round((Date.now() - Date.parse(String(overview.last_successful_run.finished_at))) / 1000))
    : null;
  const staleWarning = lastSuccessAgeSeconds == null || lastSuccessAgeSeconds > staleWarningSeconds;

  const latestGroup = overview.latest_import_group;
  const latestComplete = overview.latest_complete_import_group;
  const incompleteLatest = Boolean(latestGroup) && latestGroup.complete === false;
  const failedChunks = Number(latestGroup?.failed_chunks) || 0;

  let healthStatus = "healthy";
  if (!overview.last_successful_run) healthStatus = "no_success";
  else if (staleWarning) healthStatus = "stale";
  else if (failedChunks > 0) healthStatus = "failed_chunks";
  else if (incompleteLatest) healthStatus = "incomplete_group";
  else if (prepared.freshness === "stale" || prepared.freshness === "missing") healthStatus = "prepared_facts_stale";
  else healthStatus = "healthy";

  const totalRowCounts = overview.latest_complete_import_group?.total_row_counts || {};
  const mirrorResolved = await resolveMirrorRowCounts(db, organizationId, { countMode, totalRowCounts });
  const mirrorCounts = mirrorResolved.counts;

  const warnings = [];
  if (incompleteLatest) warnings.push("Latest import group is incomplete — heads should use the latest complete group for prepared facts.");
  if (prepared.freshness === "stale") warnings.push("Prepared Sales facts were built for a different import group than the latest complete Moraware import.");
  if (prepared.freshness === "missing") warnings.push("Prepared Sales facts are missing — run rebuild after a complete import.");
  if (staleWarning) warnings.push(`Last successful Moraware sync is older than ${staleWarningHours}h.`);

  return {
    ok: true,
    adapter: "moraware",
    switchboard: "operations_integration",
    organization_id: organizationId || UNASSIGNED_ORGANIZATION_ID,
    health_status: healthStatus,
    stale_warning: staleWarning,
    sync_freshness_seconds: lastSuccessAgeSeconds,
    stale_warning_threshold_seconds: staleWarningSeconds,
    latest_run: overview.latest_run,
    last_successful_run: overview.last_successful_run,
    latest_import_group: latestGroup,
    latest_complete_import_group: latestComplete,
    prepared_facts: prepared,
    mirror_row_counts: mirrorCounts,
    mirror_count_mode: countMode,
    warnings,
    diagnostics: morawareApiDiagnostics("GET /api/admin/moraware/health", {
      total_compute_ms: Date.now() - t0,
      query_compute_ms: queryMs,
      count_compute_ms: mirrorResolved.count_compute_ms,
      used_exact_count: countMode === "exact",
      count_mode: countMode,
      count_status: countMode === "exact" ? "exact" : "estimated"
    }),
    organization_scoping: {
      filter_applied: true,
      mirror_tables_have_organization_id: true,
      schema_migration_in_v1: false,
      exceptions: [],
      notes: [
        "All Moraware foundation v1 mirror tables require organization_id; admin APIs filter with .eq(organization_id, …).",
        "Resolve org via MORAWARE_DEFAULT_ORGANIZATION_ID or authenticated org context; sentinel UUID may exist on legacy imports.",
        "No RLS on mirror tables in v1 — access is admin + requireHeadAccess(system_admin) only."
      ]
    },
    scheduled_sync: {
      implemented: true,
      moraware_admin_triggers_sync: false,
      phase: "phase_1_worker_pipeline",
      worker_command: "npm run eos:moraware:run-scheduled-pipeline",
      existing_repo_patterns: [
        "npm run eos:moraware:run-scheduled-pipeline (Mac launchd / self-hosted worker)",
        "POST /api/internal/moraware-sync/import (x-moraware-sync-secret or x-eos-cron-secret)",
        "POST /api/internal/moraware-sync/rebuild-prepared-facts (same secret headers)",
        "POST /api/internal/sync/nightly (x-eos-cron-secret) → legacy syncMoraware.js only"
      ],
      checklist: [
        "Run on a self-hosted worker — do not generate snapshots on Vercel",
        "Set worker env: Moraware creds, BACKEND_URL, MORAWARE_SYNC_IMPORT_SECRET or EOS_CRON_SECRET, MORAWARE_DEFAULT_ORGANIZATION_ID",
        "Schedule with Mac launchd or cron off-hours; disable by unloading the plist or removing the cron entry",
        "Use MORAWARE_IMPORT_DRY_RUN=1 for a safe import plan review",
        "Resume failed chunk groups with MORAWARE_IMPORT_RESUME_GROUP_ID + MORAWARE_IMPORT_START_CHUNK_INDEX",
        "Verify GET /api/admin/moraware/health prepared_facts.freshness=fresh after success"
      ]
    }
  };
}

function clampPage(page, pageSize, maxSize = 50) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(maxSize, Math.max(1, Number(pageSize) || 25));
  return { page: p, pageSize: size, from: (p - 1) * size, to: (p - 1) * size + size - 1 };
}

const SEARCH_MIN_CHARS = 3;

function searchTermAllowed(term) {
  const t = pickStr(term);
  if (!t) return { allowed: true, term: "" };
  if (t.length < SEARCH_MIN_CHARS) return { allowed: false, term: t, reason: `search_requires_${SEARCH_MIN_CHARS}_chars` };
  return { allowed: true, term: t };
}

async function paginatedSelect(db, { table, columns, organizationId, page, pageSize, order, countMode, applyFilters }) {
  const t0 = Date.now();
  const { page: p, pageSize: size, from, to } = clampPage(page, pageSize);
  const mode = parseCountMode(countMode, "none");
  const useExactCount = mode === "exact";
  let qb = db
    .from(table)
    .select(columns, useExactCount ? { count: "exact" } : undefined)
    .eq("organization_id", organizationId);
  if (applyFilters) qb = applyFilters(qb);
  if (order?.column) qb = qb.order(order.column, order.options || { ascending: true });
  qb = qb.range(from, to);
  const queryStart = Date.now();
  const { data, error, count } = await qb;
  const queryMs = Date.now() - queryStart;
  if (error) throw error;
  let total = null;
  let countStatus = "unavailable";
  let countComputeMs = 0;
  let usedExactCount = false;
  if (useExactCount) {
    total = count ?? 0;
    countStatus = "exact";
    usedExactCount = true;
  } else if (mode === "estimated" && data?.length === size) {
    total = null;
    countStatus = "estimated";
  } else if (data?.length != null) {
    total = from + (data?.length || 0);
    countStatus = data.length < size ? "exact_page" : "unavailable";
  }
  return {
    page: p,
    page_size: size,
    total,
    count_status: countStatus,
    count_mode: mode,
    rows: data || [],
    diagnostics: morawareApiDiagnostics(`list:${table}`, {
      total_compute_ms: Date.now() - t0,
      query_compute_ms: queryMs,
      count_compute_ms: countComputeMs,
      page: p,
      page_size: size,
      used_exact_count: usedExactCount,
      count_mode: mode,
      count_status: countStatus
    })
  };
}

function applySearchOr(q, columns, term) {
  const t = pickStr(term).slice(0, 80);
  if (!t) return q;
  const pat = `%${t.replace(/%/g, "")}%`;
  const parts = columns.map((col) => `${col}.ilike.${pat}`);
  return q.or(parts.join(","));
}

export async function listMorawareJobs(db, organizationId, query) {
  const search = searchTermAllowed(query.q);
  if (!search.allowed) {
    return {
      ok: true,
      page: 1,
      page_size: clampPage(query.page, query.page_size).pageSize,
      total: null,
      count_status: "unavailable",
      count_mode: parseCountMode(query.count_mode, "none"),
      rows: [],
      search_blocked: true,
      search_blocked_reason: search.reason,
      diagnostics: morawareApiDiagnostics("GET /api/admin/moraware/jobs", { total_compute_ms: 0, count_mode: parseCountMode(query.count_mode, "none") })
    };
  }
  const result = await paginatedSelect(db, {
    table: "brain_moraware_jobs",
    columns:
      "source_job_id,source_account_id,account_name,job_name,job_number,status_name,process_name,salesperson_name,created_at_source,modified_at_source,scheduled_at_source,completed_at_source,install_at_source,sync_run_id,updated_at",
    organizationId,
    page: query.page,
    pageSize: query.page_size,
    countMode: query.count_mode ?? "none",
    order: { column: "modified_at_source", options: { ascending: false, nullsFirst: false } },
    applyFilters: (qb) => {
      let q = applySearchOr(qb, ["account_name", "job_name", "job_number", "status_name", "source_job_id"], search.term);
      if (pickStr(query.status)) q = q.ilike("status_name", `%${pickStr(query.status).slice(0, 40)}%`);
      return q;
    }
  });
  return {
    ok: true,
    ...result,
    rows: result.rows.map((r) => ({ ...r, has_raw_payload: false })),
    diagnostics: { ...result.diagnostics, endpoint: "GET /api/admin/moraware/jobs" }
  };
}

export async function listMorawareAccounts(db, organizationId, query) {
  const search = searchTermAllowed(query.q);
  if (!search.allowed) {
    return {
      ok: true,
      page: 1,
      page_size: 25,
      total: null,
      count_status: "unavailable",
      rows: [],
      search_blocked: true,
      search_blocked_reason: search.reason
    };
  }
  const result = await paginatedSelect(db, {
    table: "brain_moraware_accounts",
    columns: "source_account_id,account_name,sync_run_id,updated_at",
    organizationId,
    page: query.page,
    pageSize: query.page_size,
    countMode: query.count_mode ?? "none",
    order: { column: "account_name", options: { ascending: true } },
    applyFilters: (qb) => applySearchOr(qb, ["account_name", "source_account_id"], search.term)
  });
  return { ok: true, ...result, diagnostics: { ...result.diagnostics, endpoint: "GET /api/admin/moraware/accounts" } };
}

export async function listMorawareActivities(db, organizationId, query) {
  const search = searchTermAllowed(query.q);
  if (!search.allowed) {
    return { ok: true, page: 1, page_size: 25, total: null, count_status: "unavailable", rows: [], search_blocked: true };
  }
  const result = await paginatedSelect(db, {
    table: "brain_moraware_job_activities",
    columns:
      "source_activity_id,source_job_id,activity_type_name,activity_status_name,phase_name,scheduled_date,scheduled_time,duration_minutes,sync_run_id",
    organizationId,
    page: query.page,
    pageSize: query.page_size,
    countMode: query.count_mode ?? "none",
    order: { column: "scheduled_date", options: { ascending: false, nullsFirst: false } },
    applyFilters: (qb) => applySearchOr(qb, ["activity_type_name", "source_job_id", "source_activity_id"], search.term)
  });
  return { ok: true, ...result, diagnostics: { ...result.diagnostics, endpoint: "GET /api/admin/moraware/activities" } };
}

export async function listMorawareResources(db, organizationId, query) {
  const search = searchTermAllowed(query.q);
  if (!search.allowed) {
    return { ok: true, page: 1, page_size: 25, total: null, count_status: "unavailable", rows: [], search_blocked: true };
  }
  const result = await paginatedSelect(db, {
    table: "brain_moraware_resources",
    columns: "source_resource_id,resource_name,resource_type,is_active,sync_run_id",
    organizationId,
    page: query.page,
    pageSize: query.page_size,
    countMode: query.count_mode ?? "none",
    order: { column: "resource_name", options: { ascending: true } },
    applyFilters: (qb) => applySearchOr(qb, ["resource_name", "resource_type", "source_resource_id"], search.term)
  });
  return { ok: true, ...result, diagnostics: { ...result.diagnostics, endpoint: "GET /api/admin/moraware/resources" } };
}

function summarizeFormPayload(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const fields = [];
  if (Array.isArray(p.fields)) {
    for (const f of p.fields.slice(0, 40)) {
      if (!f || typeof f !== "object") continue;
      fields.push({
        label: pickStr(f.label ?? f.name ?? f.fieldName),
        normalized_label: pickStr(f.normalizedLabel),
        value_preview: pickStr(f.value ?? f.text ?? f.answer).slice(0, 120)
      });
    }
  }
  return {
    form_name: pickStr(p.formName ?? p.name ?? p.formTemplateName),
    template_name: pickStr(p.formTemplateName ?? p.templateName),
    field_count: fields.length,
    fields
  };
}

function isNumericFieldValue(value) {
  const s = pickStr(value).replace(/,/g, "");
  if (!s) return false;
  return /^-?\d+(\.\d+)?$/.test(s);
}

function aggregateFormFieldsFromPayloads(rows) {
  const groups = new Map();
  for (const row of rows) {
    const summary = summarizeFormPayload(row.raw_payload);
    const formKey = summary.form_name || summary.template_name || "(unknown form)";
    for (const f of summary.fields) {
      const label = pickStr(f.label) || "(blank label)";
      const norm = pickStr(f.normalized_label) || label.toLowerCase().replace(/\s+/g, " ").trim();
      const key = `${formKey}\0${norm}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          form_name: formKey,
          template_name: summary.template_name || null,
          field_label: label,
          normalized_label: norm,
          count: 0,
          numeric_count: 0,
          sample_values: []
        };
        groups.set(key, g);
      }
      g.count += 1;
      const preview = pickStr(f.value_preview);
      if (preview && isNumericFieldValue(preview)) g.numeric_count += 1;
      if (preview && g.sample_values.length < 3 && !g.sample_values.includes(preview)) g.sample_values.push(preview);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.normalized_label.localeCompare(b.normalized_label));
}

/**
 * Grouped field discovery (default). Samples recent form rows server-side; does not return raw_payload.
 */
export async function discoverMorawareFormFields(db, organizationId, query = {}) {
  const t0 = Date.now();
  const sampleLimit = Math.min(2000, Math.max(100, Number(query.sample_limit) || 500));
  const countMode = parseCountMode(query.count_mode, "none");
  let totalHint = null;
  if (countMode === "estimated") {
    const { latest_run: _lr, import_group: ig } = await loadLatestSuccessfulImportGroup(db, organizationId);
    totalHint = mirrorCountFromSyncMetadata("raw_forms", ig?.total_row_counts || {});
  }
  const queryStart = Date.now();
  const { data, error } = await db
    .from("moraware_raw_job_forms")
    .select("raw_payload,updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(sampleLimit);
  const queryMs = Date.now() - queryStart;
  if (error) throw error;
  const groups = aggregateFormFieldsFromPayloads(data || []);
  return {
    ok: true,
    view_mode: "summary",
    sample_size: (data || []).length,
    sample_limit: sampleLimit,
    total_rows_hint: totalHint,
    count_status: totalHint != null ? "estimated" : "unavailable",
    count_mode: countMode,
    distinct_field_groups: groups.length,
    groups: groups.slice(0, 500),
    note: "Summarized from a recent sample of form rows. Use view_mode=raw for paginated row ids (no raw_payload).",
    diagnostics: morawareApiDiagnostics("GET /api/admin/moraware/forms-fields", {
      total_compute_ms: Date.now() - t0,
      query_compute_ms: queryMs,
      count_compute_ms: 0,
      used_exact_count: false,
      count_mode: countMode,
      count_status: totalHint != null ? "estimated" : "unavailable"
    })
  };
}

/** Paginated raw form row ids (no raw_payload). */
export async function listMorawareFormsFieldsRaw(db, organizationId, query) {
  const search = searchTermAllowed(query.q);
  if (!search.allowed) {
    return {
      ok: true,
      view_mode: "raw",
      page: 1,
      page_size: 25,
      total: null,
      count_status: "unavailable",
      rows: [],
      search_blocked: true,
      search_blocked_reason: search.reason
    };
  }
  const countMode = parseCountMode(query.count_mode, "none");
  const result = await paginatedSelect(db, {
    table: "moraware_raw_job_forms",
    columns: "source_record_id,source_modified_at,sync_run_id,updated_at",
    organizationId,
    page: query.page,
    pageSize: query.page_size,
    countMode,
    order: { column: "updated_at", options: { ascending: false } },
    applyFilters: (qb) => {
      if (!search.term) return qb;
      return qb.filter("source_record_id", "ilike", `%${search.term.slice(0, 60)}%`);
    }
  });
  let totalHint = null;
  if (countMode === "estimated") {
    const { import_group: ig } = await loadLatestSuccessfulImportGroup(db, organizationId);
    totalHint = mirrorCountFromSyncMetadata("raw_forms", ig?.total_row_counts || {});
  }
  return {
    ok: true,
    view_mode: "raw",
    ...result,
    total_rows_hint: totalHint,
    total: result.total ?? totalHint,
    rows: result.rows,
    note: "Raw payloads omitted. Server aggregates use view_mode=summary (default).",
    diagnostics: { ...result.diagnostics, endpoint: "GET /api/admin/moraware/forms-fields" }
  };
}

export async function listMorawareFormsFields(db, organizationId, query) {
  const viewMode = pickStr(query.view_mode).toLowerCase() || "summary";
  if (viewMode === "raw") return listMorawareFormsFieldsRaw(db, organizationId, query);
  return discoverMorawareFormFields(db, organizationId, query);
}

export async function buildMorawareDataQualitySummary(db, organizationId) {
  const t0 = Date.now();
  let queryMs = 0;
  const q0 = Date.now();
  const { import_group: latestGroup } = await loadLatestSuccessfulImportGroup(db, organizationId);
  const latestComplete =
    latestGroup?.complete === true ? latestGroup : await loadLatestCompleteImportGroup(db, organizationId, { maxGroupsToCheck: 10 });
  queryMs += Date.now() - q0;
  const importGroupId = pickStr(latestComplete?.import_group_id || latestGroup?.import_group_id);

  let findingsQ = db
    .from("moraware_data_quality_findings")
    .select("finding_type,severity,entity_type,entity_id,message,detected_at")
    .is("resolved_at", null)
    .order("detected_at", { ascending: false })
    .limit(200);
  if (organizationId) findingsQ = findingsQ.eq("organization_id", organizationId);
  const { data: findings, error: fErr } = await findingsQ;
  if (fErr) throw fErr;

  const byType = {};
  for (const f of findings || []) {
    const k = f.finding_type || "unknown";
    byType[k] = (byType[k] || 0) + 1;
  }

  let attribution = null;
  try {
    attribution = await loadSalesAttributionCoverage(db, { organizationId });
  } catch (e) {
    attribution = { ok: false, error: String(e?.message || e) };
  }

  let missingSqft = { count: null };
  if (organizationId && importGroupId) {
    try {
      const { count } = await db
        .from("sales_moraware_job_facts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("import_group_id", importGroupId)
        .eq("sqft_found", false);
      missingSqft = { count: count ?? 0, import_group_id: importGroupId };
    } catch {
      missingSqft = { count: null };
    }
  }

  let statusBreakdown = [];
  let processBreakdown = [];
  if (organizationId && importGroupId) {
    const qBreakStart = Date.now();
    const { data: jobs } = await db
      .from("sales_moraware_job_facts")
      .select("status_name,process_name")
      .eq("organization_id", organizationId)
      .eq("import_group_id", importGroupId)
      .limit(5000);
    queryMs += Date.now() - qBreakStart;
    const st = new Map();
    const pr = new Map();
    for (const j of jobs || []) {
      const s = pickStr(j.status_name) || "(blank)";
      const p = pickStr(j.process_name) || "(blank)";
      st.set(s, (st.get(s) || 0) + 1);
      pr.set(p, (pr.get(p) || 0) + 1);
    }
    statusBreakdown = [...st.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    processBreakdown = [...pr.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }

  return {
    ok: true,
    organization_id: organizationId,
    source_import_group_id: importGroupId || null,
    latest_import_group_complete: latestGroup?.complete ?? null,
    unresolved_findings: { total: findings?.length ?? 0, by_type: byType, sample: (findings || []).slice(0, 25) },
    missing_sqft_jobs: missingSqft,
    status_breakdown: statusBreakdown.slice(0, 30),
    process_breakdown: processBreakdown.slice(0, 30),
    sales_account_mapping: attribution,
    blackstone_guardrail:
      attribution?.blackstone_guardrail ||
      "Blackstone remains unmapped/Moraware fallback unless an approved Sales Account Mapping row explicitly maps it.",
    sync_warnings: latestGroup?.complete === false ? ["Latest import group incomplete"] : [],
    diagnostics: morawareApiDiagnostics("GET /api/admin/moraware/data-quality", {
      total_compute_ms: Date.now() - t0,
      query_compute_ms: queryMs,
      used_exact_count: false,
      count_mode: "none",
      count_status: "unavailable"
    })
  };
}
