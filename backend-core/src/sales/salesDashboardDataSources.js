/**
 * Data loading for Sales Command Center — reads existing synced tables only.
 */

import { loadLatestCompleteImportGroup } from "../moraware/morawareSyncHealth.js";
import { loadApprovedSalesAttributionMappings, classifySalesJob } from "./salesAttribution.js";
import { normalizeAccountNameWithoutLocationPrefix } from "./salesAccountNameNormalizer.js";
import { dashboardReportDateForMorawareJob } from "./morawareSqftActuals.js";
import { dateInInclusiveRange } from "./salesDashboardFilters.js";

const PAGE = 1000;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

export function resolveDashboardOrganizationId(req) {
  const queryOrg = String(req.query?.organization_id ?? "").trim();
  if (isUuid(queryOrg)) return queryOrg;
  const userOrg = String(req.user?.organization_id ?? "").trim();
  if (isUuid(userOrg)) return userOrg;
  const defaultOrg = String(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID ?? "").trim();
  if (isUuid(defaultOrg)) return defaultOrg;
  return "";
}

function summarizeImportGroupRows(groupRows, latestRun) {
  const expectedChunkCount =
    Math.max(0, ...groupRows.map((r) => Number(r?.metadata?.chunk_count) || 0), Number(latestRun?.metadata?.chunk_count) || 0) ||
    null;
  const byChunkIndex = new Map();
  for (const row of groupRows) {
    const idx = Number(row?.metadata?.chunk_index) || null;
    if (!idx) continue;
    const prev = byChunkIndex.get(idx);
    if (!prev || String(row.started_at || "") >= String(prev.started_at || "")) byChunkIndex.set(idx, row);
  }
  const successfulRows = [...byChunkIndex.values()].filter((row) => row.status === "success");
  const complete =
    Boolean(expectedChunkCount) &&
    successfulRows.length === expectedChunkCount &&
    [...byChunkIndex.values()].every((row) => row.status === "success");
  return { complete, successfulRows, expectedChunkCount };
}

export async function loadMorawareSyncHealth(supabase, organizationId) {
  let latestQ = supabase.from("moraware_sync_runs").select("*").order("started_at", { ascending: false }).limit(1);
  let successQ = supabase.from("moraware_sync_runs").select("*").eq("status", "success").order("finished_at", { ascending: false }).limit(1);
  if (organizationId) {
    latestQ = latestQ.eq("organization_id", organizationId);
    successQ = successQ.eq("organization_id", organizationId);
  }
  const [latest, success] = await Promise.all([latestQ, successQ]);
  if (latest.error) throw latest.error;
  if (success.error) throw success.error;

  const latestRun = latest.data?.[0] ?? null;
  const lastSuccess = success.data?.[0] ?? null;
  const importGroupId = String(latestRun?.metadata?.import_group_id ?? lastSuccess?.metadata?.import_group_id ?? "").trim();

  let groupSummary = { complete: false };
  if (importGroupId) {
    let groupQ = supabase
      .from("moraware_sync_runs")
      .select("id,status,started_at,finished_at,row_counts,metadata")
      .filter("metadata->>import_group_id", "eq", importGroupId)
      .order("started_at", { ascending: true })
      .limit(1000);
    if (organizationId) groupQ = groupQ.eq("organization_id", organizationId);
    const group = await groupQ;
    if (group.error) throw group.error;
    groupSummary = summarizeImportGroupRows(group.data || [], latestRun);
  }

  let latestCompleteGroup = null;
  if (importGroupId && !groupSummary.complete) {
    try {
      latestCompleteGroup = await loadLatestCompleteImportGroup(supabase, organizationId);
    } catch {
      latestCompleteGroup = null;
    }
  }

  return {
    latestRun,
    lastSuccessfulRun: lastSuccess,
    latestGroupId: importGroupId || null,
    latestGroupComplete: groupSummary.complete,
    latestCompleteGroup,
    lastSyncAt: lastSuccess?.finished_at ?? latestRun?.finished_at ?? null
  };
}

export async function loadPreparedJobFacts(supabase, organizationId, syncHealth) {
  const group = syncHealth?.latestGroupComplete ? { id: syncHealth.latestGroupId } : syncHealth?.latestCompleteGroup;
  let effectiveGroupId = String(group?.import_group_id ?? syncHealth?.latestGroupId ?? "").trim();
  if (!effectiveGroupId && syncHealth?.latestCompleteGroup?.import_group_id) {
    effectiveGroupId = String(syncHealth.latestCompleteGroup.import_group_id).trim();
  }
  if (!effectiveGroupId) {
    return { rows: [], available: false, warning: "No complete Moraware import group available." };
  }

  const rows = [];
  try {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("sales_moraware_job_facts")
        .select(
          "source_job_id,source_account_id,account_name,status_name,process_name,salesperson_name,created_at_source,worksheet_sqft,sqft_found,report_month_created"
        )
        .eq("organization_id", organizationId)
        .eq("import_group_id", effectiveGroupId)
        .order("created_at_source", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { rows: [], available: false, warning: "sales_moraware_job_facts table not installed." };
    }
    throw e;
  }

  return {
    rows,
    available: rows.length > 0,
    importGroupId: effectiveGroupId,
    warning: rows.length ? null : "Prepared facts empty for latest import group."
  };
}

export async function loadWorksheetColorRows(supabase, organizationId) {
  try {
    const rows = [];
    let from = 0;
    while (true) {
      let q = supabase
        .from("moraware_prepared_sales_worksheet_facts")
        .select("account_name,color,stone,room,total_worksheet_sqft,job_creation_date,job_salesperson,branch_or_process,job_id,job_name,job_status")
        .eq("is_active", true)
        .order("job_creation_date", { ascending: true })
        .range(from, from + PAGE - 1);
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
      if (from >= 15000) break;
    }
    return { rows, available: rows.length > 0 };
  } catch (e) {
    if (isMissingRelationError(e)) return { rows: [], available: false };
    throw e;
  }
}

export async function loadQuoteHeaders(supabase, organizationId) {
  try {
    let q = supabase
      .from("quote_headers")
      .select(
        "id,quote_number,quote_status,quote_source,customer_name,project_name,sales_rep,branch,subtotal,grand_total,estimated_sqft,created_at,updated_at,partner_account_id"
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    if (isMissingRelationError(e)) return [];
    throw e;
  }
}

export async function loadForecastEvents(supabase, organizationId) {
  try {
    let q = supabase
      .from("quote_forecast_events")
      .select("quote_id,event_type,sales_rep,branch,quote_value,probability_percent,forecast_value,created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    if (isMissingRelationError(e)) return [];
    throw e;
  }
}

/**
 * Map prepared fact → enriched dashboard row with attribution.
 */
export function enrichPreparedFactRow(fact, mappings, aliasByNorm) {
  const jobShape = {
    account_name: fact.account_name,
    account_id: fact.source_account_id,
    salesperson_name: fact.salesperson_name,
    job_status: fact.status_name,
    process_name: fact.process_name,
    creation_date: String(fact.created_at_source ?? "").slice(0, 10),
    worksheet_sqft: fact.worksheet_sqft
  };
  const attr = classifySalesJob(jobShape, mappings);
  const norm = normalizeAccountNameWithoutLocationPrefix(fact.account_name);
  const alias =
    mappings?.aliasesByNormMoraware?.get(norm.toLowerCase()) ??
    mappings?.aliasesByNormMoraware?.get(String(fact.account_name ?? "").trim().toLowerCase()) ??
    null;
  const attributionStatus = attr.classificationMethod === "approved_mapping" ? "approved_mapped" : "needs_review_unmapped";

  return {
    ...fact,
    ...jobShape,
    ...attr,
    canonicalAccountName: alias?.monday_account_name ?? null,
    assignedSalesperson: alias?.assigned_salesperson ?? attr.normalizedSalesperson,
    attributionStatus,
    reportDate: dashboardReportDateForMorawareJob(fact) || jobShape.creation_date
  };
}

export function partitionJobsByRange(enrichedRows, currentRange, priorRange) {
  const current = [];
  const prior = [];
  for (const row of enrichedRows) {
    const d = String(row.reportDate ?? "").slice(0, 10);
    if (dateInInclusiveRange(d, currentRange)) current.push(row);
    else if (dateInInclusiveRange(d, priorRange)) prior.push(row);
  }
  return { current, prior };
}

export async function loadDashboardDataSources(supabase, organizationId) {
  const [syncHealth, mappings, quotes, forecasts] = await Promise.all([
    loadMorawareSyncHealth(supabase, organizationId),
    loadApprovedSalesAttributionMappings(supabase),
    loadQuoteHeaders(supabase, organizationId),
    loadForecastEvents(supabase, organizationId)
  ]);

  const facts = await loadPreparedJobFacts(supabase, organizationId, syncHealth);
  const worksheet = await loadWorksheetColorRows(supabase, organizationId);

  const aliasByNorm = mappings?.aliasesByNormMoraware ?? new Map();

  const enrichedFacts = facts.rows.map((f) => enrichPreparedFactRow(f, mappings, aliasByNorm));

  return {
    syncHealth,
    mappings,
    facts,
    enrichedFacts,
    worksheet,
    quotes,
    forecasts
  };
}
