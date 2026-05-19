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

async function countTable(db, table, organizationId) {
  try {
    let qb = db.from(table).select("id", { count: "exact", head: true });
    if (organizationId) qb = qb.eq("organization_id", organizationId);
    const { count, error } = await qb;
    if (error) return { ok: false, error: String(error.message) };
    return { ok: true, count: count ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
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
  return {
    import_group_id: importGroupId,
    ...summary,
    chunk_runs: groupRows.map((r) => summarizeRun(r))
  };
}

/**
 * Find the most recent **complete** import group (all chunks success).
 */
export async function loadLatestCompleteImportGroup(db, organizationId) {
  let q = db
    .from("moraware_sync_runs")
    .select("id,status,started_at,finished_at,metadata,mode,runner")
    .eq("status", "success")
    .not("metadata->>import_group_id", "is", null)
    .order("finished_at", { ascending: false })
    .limit(500);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  if (error) throw error;
  const groupIds = [...new Set((data || []).map((r) => pickStr(r.metadata?.import_group_id)).filter(Boolean))];
  let best = null;
  let bestFinished = "";
  for (const gid of groupIds) {
    const detail = await loadImportGroupDetail(db, organizationId, gid);
    if (!detail?.complete) continue;
    const fin = pickStr(detail.finished_at);
    if (!best || fin > bestFinished) {
      best = detail;
      bestFinished = fin;
    }
  }
  return best;
}

export async function loadMorawareSyncOverview(db, organizationId) {
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
  const latestCompleteGroup = await loadLatestCompleteImportGroup(db, organizationId);
  return {
    latest_run: summarizeRun(latestRun),
    last_successful_run: summarizeRun(lastSuccess),
    latest_import_group: latestGroup,
    latest_complete_import_group: latestCompleteGroup
  };
}

export async function loadPreparedFactsSummary(db, organizationId, latestCompleteGroup) {
  const completeGroupId = pickStr(latestCompleteGroup?.import_group_id);
  const [jobFactsCount, rollupsCount, jobFactsLatestGroup] = await Promise.all([
    countTable(db, "sales_moraware_job_facts", organizationId),
    countTable(db, "sales_moraware_account_rollups", organizationId),
    (async () => {
      if (!organizationId) return { import_group_id: null, updated_at: null, row_count: 0 };
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
        const { count } = await db
          .from("sales_moraware_job_facts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("import_group_id", row?.import_group_id ?? "");
        return {
          import_group_id: pickStr(row?.import_group_id) || null,
          updated_at: row?.updated_at ?? null,
          row_count: count ?? 0
        };
      } catch (e) {
        return { import_group_id: null, updated_at: null, error: String(e?.message || e) };
      }
    })()
  ]);

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
    rebuild_requires: "admin role + sales head access"
  };
}

export async function buildMorawareAdminHealth(db, organizationId) {
  const staleWarningHours = toIntEnv("MORAWARE_SYNC_STALE_WARNING_HOURS", 24);
  const staleWarningSeconds = staleWarningHours * 60 * 60;
  const overview = await loadMorawareSyncOverview(db, organizationId);
  const prepared = await loadPreparedFactsSummary(db, organizationId, overview.latest_complete_import_group);

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

  const mirrorCounts = {};
  for (const [key, table] of Object.entries({
    accounts: "brain_moraware_accounts",
    jobs: "brain_moraware_jobs",
    activities: "brain_moraware_job_activities",
    resources: "brain_moraware_resources",
    raw_forms: "moraware_raw_job_forms",
    raw_files: "moraware_raw_job_files"
  })) {
    mirrorCounts[key] = await countTable(db, table, organizationId);
  }

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
    warnings,
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
      implemented: false,
      moraware_admin_triggers_sync: false,
      existing_repo_patterns: [
        "POST /api/internal/sync/nightly (x-eos-cron-secret) → syncMoraware.js",
        "POST /api/internal/sync/recent (x-eos-cron-secret) → syncMoraware.js",
        "POST /api/internal/moraware-sync/import (x-moraware-sync-secret) — chunked Brain import (preferred for baseline)"
      ],
      optional_future_endpoint: "POST /api/internal/moraware-sync/run-scheduled",
      checklist: [
        "Reuse EOS_CRON_SECRET or MORAWARE_SYNC_RUN_SECRET — do not add unauthenticated triggers",
        "Small caps only (recent window, no baseline_2026)",
        "No-overlap lock per organization",
        "Post batches to existing POST /api/internal/moraware-sync/import",
        "Rebuild prepared facts after successful complete group",
        "Log run to moraware_sync_runs with mode=scheduled"
      ]
    }
  };
}

function clampPage(page, pageSize) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 25));
  return { page: p, pageSize: size, from: (p - 1) * size, to: (p - 1) * size + size - 1 };
}

function applySearchOr(q, columns, term) {
  const t = pickStr(term).slice(0, 80);
  if (!t) return q;
  const pat = `%${t.replace(/%/g, "")}%`;
  const parts = columns.map((col) => `${col}.ilike.${pat}`);
  return q.or(parts.join(","));
}

export async function listMorawareJobs(db, organizationId, query) {
  const { page, pageSize, from, to } = clampPage(query.page, query.page_size);
  const cols =
    "source_job_id,source_account_id,account_name,job_name,job_number,status_name,process_name,salesperson_name,created_at_source,modified_at_source,scheduled_at_source,completed_at_source,install_at_source,sync_run_id,updated_at";
  let qb = db
    .from("brain_moraware_jobs")
    .select(cols, { count: "exact" })
    .eq("organization_id", organizationId)
    .order("modified_at_source", { ascending: false, nullsFirst: false })
    .range(from, to);
  qb = applySearchOr(qb, ["account_name", "job_name", "job_number", "status_name", "source_job_id"], query.q);
  if (pickStr(query.status)) qb = qb.ilike("status_name", `%${pickStr(query.status).slice(0, 40)}%`);
  const { data, error, count } = await qb;
  if (error) throw error;
  return {
    ok: true,
    page,
    page_size: pageSize,
    total: count ?? 0,
    rows: (data || []).map((r) => ({ ...r, has_raw_payload: false }))
  };
}

export async function listMorawareAccounts(db, organizationId, query) {
  const { page, pageSize, from, to } = clampPage(query.page, query.page_size);
  let qb = db
    .from("brain_moraware_accounts")
    .select("source_account_id,account_name,sync_run_id,updated_at", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("account_name", { ascending: true })
    .range(from, to);
  qb = applySearchOr(qb, ["account_name", "source_account_id"], query.q);
  const { data, error, count } = await qb;
  if (error) throw error;
  return { ok: true, page, page_size: pageSize, total: count ?? 0, rows: data || [] };
}

export async function listMorawareActivities(db, organizationId, query) {
  const { page, pageSize, from, to } = clampPage(query.page, query.page_size);
  let qb = db
    .from("brain_moraware_job_activities")
    .select(
      "source_activity_id,source_job_id,activity_type_name,activity_status_name,phase_name,scheduled_date,scheduled_time,duration_minutes,sync_run_id",
      { count: "exact" }
    )
    .eq("organization_id", organizationId)
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .range(from, to);
  qb = applySearchOr(qb, ["activity_type_name", "source_job_id", "source_activity_id"], query.q);
  const { data, error, count } = await qb;
  if (error) throw error;
  return { ok: true, page, page_size: pageSize, total: count ?? 0, rows: data || [] };
}

export async function listMorawareResources(db, organizationId, query) {
  const { page, pageSize, from, to } = clampPage(query.page, query.page_size);
  let qb = db
    .from("brain_moraware_resources")
    .select("source_resource_id,resource_name,resource_type,is_active,sync_run_id", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("resource_name", { ascending: true })
    .range(from, to);
  qb = applySearchOr(qb, ["resource_name", "resource_type", "source_resource_id"], query.q);
  const { data, error, count } = await qb;
  if (error) throw error;
  return { ok: true, page, page_size: pageSize, total: count ?? 0, rows: data || [] };
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

export async function listMorawareFormsFields(db, organizationId, query) {
  const { page, pageSize, from, to } = clampPage(query.page, query.page_size);
  let qb = db
    .from("moraware_raw_job_forms")
    .select("source_record_id,source_modified_at,sync_run_id,updated_at", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (pickStr(query.q)) {
    const t = pickStr(query.q).slice(0, 60);
    qb = qb.filter("source_record_id", "ilike", `%${t}%`);
  }
  const { data, error, count } = await qb;
  if (error) throw error;

  const includePreview = pickStr(query.include_field_preview) === "1";
  const rows = [];
  for (const row of data || []) {
    const base = {
      source_record_id: row.source_record_id,
      source_modified_at: row.source_modified_at,
      sync_run_id: row.sync_run_id,
      updated_at: row.updated_at
    };
    if (includePreview && rows.length < 10) {
      const { data: rawRow } = await db
        .from("moraware_raw_job_forms")
        .select("raw_payload")
        .eq("organization_id", organizationId)
        .eq("source_record_id", row.source_record_id)
        .limit(1);
      base.form_summary = summarizeFormPayload(rawRow?.[0]?.raw_payload);
    }
    rows.push(base);
  }
  return { ok: true, page, page_size: pageSize, total: count ?? 0, rows, note: "Raw payloads omitted unless include_field_preview=1 (max 10 rows)." };
}

export async function buildMorawareDataQualitySummary(db, organizationId) {
  const overview = await loadMorawareSyncOverview(db, organizationId);
  const importGroupId = pickStr(overview.latest_complete_import_group?.import_group_id || overview.latest_import_group?.import_group_id);

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
  if (organizationId) {
    const { data: jobs } = await db
      .from("brain_moraware_jobs")
      .select("status_name,process_name")
      .eq("organization_id", organizationId)
      .limit(5000);
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
    latest_import_group_complete: overview.latest_import_group?.complete ?? null,
    unresolved_findings: { total: findings?.length ?? 0, by_type: byType, sample: (findings || []).slice(0, 25) },
    missing_sqft_jobs: missingSqft,
    status_breakdown: statusBreakdown.slice(0, 30),
    process_breakdown: processBreakdown.slice(0, 30),
    sales_account_mapping: attribution,
    blackstone_guardrail:
      attribution?.blackstone_guardrail ||
      "Blackstone remains unmapped/Moraware fallback unless an approved Sales Account Mapping row explicitly maps it.",
    sync_warnings: overview.latest_import_group?.complete === false ? ["Latest import group incomplete"] : []
  };
}
