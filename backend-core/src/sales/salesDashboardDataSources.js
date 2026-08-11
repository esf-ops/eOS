/**
 * Data loading for Sales Command Center — reads existing synced tables only.
 */

import { loadLatestCompleteImportGroup } from "../moraware/morawareSyncHealth.js";
import { loadApprovedSalesAttributionMappings, classifySalesJob } from "./salesAttribution.js";
import { normalizeAccountNameWithoutLocationPrefix } from "./salesAccountNameNormalizer.js";
import { dashboardReportDateForMorawareJob } from "./morawareSqftActuals.js";
import { dateInInclusiveRange, resolveRequiredLoadDateWindow } from "./salesDashboardFilters.js";
import { buildSalesIntelligenceBundle } from "./salesIntelligenceFacts.js";
import { configureSalesColorCatalog } from "./salesColorClassification.js";
import { loadSalesColorCatalog } from "./salesColorCatalogLoader.js";
import {
  buildDashboardCacheKey,
  getCachedDashboardSources,
  setCachedDashboardSources
} from "./salesDashboardCache.js";

const PAGE = 1000;
const WORKSHEET_JOB_ID_CHUNK = 200;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function chunkArray(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
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

function normalizeLoadWindows(options = {}) {
  if (Array.isArray(options.windows) && options.windows.length) {
    return options.windows
      .map((w) => ({
        label: String(w?.label ?? "range"),
        startDate: String(w?.startDate ?? "").slice(0, 10),
        endDate: String(w?.endDate ?? "").slice(0, 10)
      }))
      .filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(w.endDate));
  }
  const startDate = String(options.startDate ?? "").slice(0, 10);
  const endDate = String(options.endDate ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return [{ label: "range", startDate, endDate }];
  }
  return [];
}

async function pagePreparedJobFacts(supabase, organizationId, effectiveGroupId, window = null) {
  const rows = [];
  let pages = 0;
  let from = 0;
  while (true) {
    let q = supabase
      .from("sales_moraware_job_facts")
      .select(
        "source_job_id,source_account_id,account_name,status_name,process_name,salesperson_name,created_at_source,worksheet_sqft,sqft_found,report_month_created"
      )
      .eq("organization_id", organizationId)
      .eq("import_group_id", effectiveGroupId)
      .order("created_at_source", { ascending: true });
    if (window) {
      // Report date primary field is created_at_source (see dashboardReportDateForMorawareJob).
      q = q.gte("created_at_source", window.startDate).lte("created_at_source", `${window.endDate}T23:59:59.999`);
    }
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    pages += 1;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { rows, pages };
}

export async function loadPreparedJobFacts(supabase, organizationId, syncHealth, options = {}) {
  const group = syncHealth?.latestGroupComplete ? { id: syncHealth.latestGroupId } : syncHealth?.latestCompleteGroup;
  let effectiveGroupId = String(group?.import_group_id ?? syncHealth?.latestGroupId ?? "").trim();
  if (!effectiveGroupId && syncHealth?.latestCompleteGroup?.import_group_id) {
    effectiveGroupId = String(syncHealth.latestCompleteGroup.import_group_id).trim();
  }
  if (!effectiveGroupId) {
    return {
      rows: [],
      available: false,
      warning: "No complete Moraware import group available.",
      loadStats: { rows: 0, pages: 0, dateScoped: false, windows: [], startDate: null, endDate: null }
    };
  }

  const windows = normalizeLoadWindows(options);
  const dateScoped = windows.length > 0;

  let rows = [];
  let pages = 0;
  try {
    if (!dateScoped) {
      const page = await pagePreparedJobFacts(supabase, organizationId, effectiveGroupId, null);
      rows = page.rows;
      pages = page.pages;
    } else if (windows.length === 1) {
      const page = await pagePreparedJobFacts(supabase, organizationId, effectiveGroupId, windows[0]);
      rows = page.rows;
      pages = page.pages;
    } else {
      // Discrete current + prior windows (avoid gap months between prior-end and current-start).
      const parts = await Promise.all(
        windows.map((w) => pagePreparedJobFacts(supabase, organizationId, effectiveGroupId, w))
      );
      const byId = new Map();
      for (const part of parts) {
        pages += part.pages;
        for (const row of part.rows) {
          const id = String(row?.source_job_id ?? "").trim();
          if (id) byId.set(id, row);
          else rows.push(row);
        }
      }
      rows = [...byId.values(), ...rows];
    }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return {
        rows: [],
        available: false,
        warning: "sales_moraware_job_facts table not installed.",
        loadStats: {
          rows: 0,
          pages,
          dateScoped,
          windows,
          startDate: dateScoped ? windows.map((w) => w.startDate).sort()[0] : null,
          endDate: dateScoped ? windows.map((w) => w.endDate).sort().slice(-1)[0] : null
        }
      };
    }
    throw e;
  }

  return {
    rows,
    available: rows.length > 0,
    importGroupId: effectiveGroupId,
    warning: rows.length ? null : "Prepared facts empty for latest import group.",
    loadStats: {
      rows: rows.length,
      pages,
      dateScoped,
      windows,
      startDate: dateScoped ? windows.map((w) => w.startDate).sort()[0] : null,
      endDate: dateScoped ? windows.map((w) => w.endDate).sort().slice(-1)[0] : null
    }
  };
}

export async function loadWorksheetColorRows(supabase, organizationId, options = {}) {
  const jobIds = Array.isArray(options.jobIds) ? [...new Set(options.jobIds.map((id) => String(id ?? "").trim()).filter(Boolean))] : null;
  try {
    if (jobIds) {
      if (!jobIds.length) {
        return {
          rows: [],
          available: false,
          loadStats: { rows: 0, pages: 0, scopedByJobIds: true, jobIdCount: 0 }
        };
      }
      const rows = [];
      let pages = 0;
      for (const idChunk of chunkArray(jobIds, WORKSHEET_JOB_ID_CHUNK)) {
        let from = 0;
        while (true) {
          let q = supabase
            .from("moraware_prepared_sales_worksheet_facts")
            .select(
              "id,row_hash,account_name,color,stone,room,total_worksheet_sqft,job_creation_date,job_salesperson,branch_or_process,job_id,job_name,job_status"
            )
            .eq("is_active", true)
            .in("job_id", idChunk)
            .order("job_creation_date", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (organizationId) q = q.eq("organization_id", organizationId);
          const { data, error } = await q;
          if (error) throw error;
          pages += 1;
          if (!data?.length) break;
          rows.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }
      return {
        rows,
        available: rows.length > 0,
        loadStats: { rows: rows.length, pages, scopedByJobIds: true, jobIdCount: jobIds.length }
      };
    }

    const rows = [];
    let pages = 0;
    let from = 0;
    while (true) {
      let q = supabase
        .from("moraware_prepared_sales_worksheet_facts")
        .select(
          "id,row_hash,account_name,color,stone,room,total_worksheet_sqft,job_creation_date,job_salesperson,branch_or_process,job_id,job_name,job_status"
        )
        .eq("is_active", true)
        .order("job_creation_date", { ascending: true })
        .range(from, from + PAGE - 1);
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      pages += 1;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return {
      rows,
      available: rows.length > 0,
      loadStats: { rows: rows.length, pages, scopedByJobIds: false, jobIdCount: null }
    };
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { rows: [], available: false, loadStats: { rows: 0, pages: 0, scopedByJobIds: Boolean(jobIds), jobIdCount: jobIds?.length ?? null } };
    }
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

export async function loadForecastEvents(supabase, organizationId, quoteIds = []) {
  try {
    const cols =
      "id,quote_id,event_type,event_at,sales_rep,branch,quote_value,probability_percent,forecast_value,organization_id,metadata";
    let rows = [];
    let q = supabase.from("quote_forecast_events").select(cols).order("event_at", { ascending: false }).limit(5000);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) throw error;
    rows = data ?? [];

    if (!rows.length && quoteIds.length) {
      const { data: linked, error: linkErr } = await supabase
        .from("quote_forecast_events")
        .select(cols)
        .in("quote_id", quoteIds.slice(0, 500))
        .order("event_at", { ascending: false })
        .limit(5000);
      if (!linkErr && linked?.length) rows = linked;
    }

    return rows.map((e) => ({
      ...e,
      created_at: e.event_at,
      forecast_date: e.event_at,
      forecast_sqft: e.metadata?.forecast_sqft ?? e.metadata?.estimated_sqft ?? null
    }));
  } catch (e) {
    if (isMissingRelationError(e)) return [];
    throw e;
  }
}

export async function loadJobActivities(supabase, organizationId) {
  try {
    let q = supabase
      .from("brain_moraware_job_activities")
      .select("source_job_id,source_activity_id,activity_type_name,phase_name,scheduled_date,status_name")
      .order("scheduled_date", { ascending: false })
      .limit(5000);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    if (isMissingRelationError(e)) return [];
    throw e;
  }
}

export async function loadCalendarScheduleRows(supabase, organizationId) {
  try {
    let q = supabase
      .from("moraware_calendar_schedule_rows")
      .select("id,calendar_date,job_id,moraware_job_id,job_name,account_name,sqft,activity_type,activity_status,truck_or_crew_name,is_active")
      .eq("is_active", true)
      .order("calendar_date", { ascending: false })
      .limit(5000);
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

export async function loadDashboardDataSources(supabase, organizationId, options = {}) {
  const loadProfile = options.loadProfile === "full" ? "full" : "overview";
  const includeDetails = Boolean(options.includeDetails);
  const filters = options.filters && options.filters.ok !== false ? options.filters : null;
  const dateWindow = filters ? resolveRequiredLoadDateWindow(filters) : null;
  const dateScope = loadProfile === "overview" && dateWindow ? dateWindow : null;
  const skipExplorerSignals = loadProfile === "overview" && !includeDetails;

  const syncHealth = await loadMorawareSyncHealth(supabase, organizationId);
  const cacheKey = buildDashboardCacheKey(organizationId, syncHealth, {
    loadProfile,
    dateWindow: dateScope
  });
  const cached = getCachedDashboardSources(cacheKey);
  if (cached) {
    configureSalesColorCatalog(cached.colorCatalog);
    return { ...cached, _cacheHit: true, _cacheKey: cacheKey };
  }

  const t0 = performance.now();
  const [mappings, quotes] = await Promise.all([
    loadApprovedSalesAttributionMappings(supabase),
    loadQuoteHeaders(supabase, organizationId)
  ]);

  const quoteIds = quotes.map((q) => q.id).filter(Boolean);
  const jobFactsStarted = performance.now();
  const [forecasts, facts, colorCatalog, activities, calendarRows] = await Promise.all([
    loadForecastEvents(supabase, organizationId, quoteIds),
    loadPreparedJobFacts(supabase, organizationId, syncHealth, {
      windows: dateScope?.windows,
      startDate: dateScope?.startDate,
      endDate: dateScope?.endDate
    }),
    loadSalesColorCatalog(supabase, organizationId),
    skipExplorerSignals ? Promise.resolve([]) : loadJobActivities(supabase, organizationId),
    skipExplorerSignals ? Promise.resolve([]) : loadCalendarScheduleRows(supabase, organizationId)
  ]);
  const jobFactsMs = Math.round((performance.now() - jobFactsStarted) * 10) / 10;

  const jobIds = facts.rows.map((r) => r.source_job_id).filter(Boolean);
  const worksheetStarted = performance.now();
  const worksheet = dateScope
    ? await loadWorksheetColorRows(supabase, organizationId, { jobIds })
    : await loadWorksheetColorRows(supabase, organizationId);
  const worksheetFactsMs = Math.round((performance.now() - worksheetStarted) * 10) / 10;

  configureSalesColorCatalog(colorCatalog);

  const enrichStarted = performance.now();
  const aliasByNorm = mappings?.aliasesByNormMoraware ?? new Map();
  const enrichedFacts = facts.rows.map((f) => enrichPreparedFactRow(f, mappings, aliasByNorm));
  const enrichmentMs = Math.round((performance.now() - enrichStarted) * 10) / 10;

  const intelligenceStarted = performance.now();
  const intelligenceBundle = buildSalesIntelligenceBundle({
    organizationId,
    syncHealth,
    mappings,
    facts,
    enrichedFacts,
    worksheet,
    quotes,
    forecasts,
    activities,
    calendarRows,
    colorCatalog
  });
  const intelligenceBundleMs = Math.round((performance.now() - intelligenceStarted) * 10) / 10;

  const loadStats = {
    loadProfile,
    includeDetails,
    dateScoped: Boolean(dateScope),
    dateWindow: dateScope
      ? {
          startDate: dateScope.startDate,
          endDate: dateScope.endDate,
          windows: dateScope.windows
        }
      : null,
    jobFacts: facts.loadStats ?? { rows: facts.rows.length },
    worksheetFacts: worksheet.loadStats ?? { rows: worksheet.rows?.length ?? 0 },
    skippedActivities: skipExplorerSignals,
    skippedCalendar: skipExplorerSignals,
    quoteRows: quotes.length,
    forecastRows: forecasts.length,
    timingsMs: {
      prepared_moraware_sql: jobFactsMs,
      worksheet_fact_reads: worksheetFactsMs,
      enrichment_aggregation: enrichmentMs,
      intelligence_bundle: intelligenceBundleMs,
      source_load_total: Math.round((performance.now() - t0) * 10) / 10
    }
  };

  const sources = {
    organizationId,
    syncHealth,
    mappings,
    facts,
    enrichedFacts,
    worksheet,
    intelligenceRows: intelligenceBundle.worksheetMaterial,
    intelligenceBundle,
    quotes,
    forecasts,
    activities,
    calendarRows,
    colorCatalog,
    _loadStats: loadStats,
    _cacheHit: false,
    _cacheKey: cacheKey
  };

  setCachedDashboardSources(cacheKey, sources);
  return sources;
}
