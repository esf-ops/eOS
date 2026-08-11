/**
 * GET /api/sales/dashboard — Sales Command Center orchestration.
 */

import { parseDashboardFilters } from "./salesDashboardFilters.js";
import { loadDashboardDataSources, resolveDashboardOrganizationId } from "./salesDashboardDataSources.js";
import { buildSalesDashboardResponse } from "./salesDashboardAggregates.js";
import { buildDashboardInsights, buildInsightSummaryText, buildExecutiveSummary } from "./salesDashboardInsights.js";
import { sliceDashboardPayload } from "./salesDashboardPayload.js";
import { createDashboardTimer, isDashboardTimingEnabled } from "./salesDashboardTiming.js";
import {
  buildMetricsCacheKey,
  getCachedDashboardMetrics,
  setCachedDashboardMetrics
} from "./salesDashboardCache.js";
import { getQuickBooksFinancialTruthSafe } from "./quickbooksFinancialTruth/index.js";

export async function salesDashboardHandler(req, supabaseGetter) {
  const timer = createDashboardTimer();
  const supabase = supabaseGetter();
  timer.mark("auth_org_resolve");

  const organizationId = resolveDashboardOrganizationId(req);
  if (!organizationId) {
    return { status: 400, body: { ok: false, error: "Sales dashboard requires organization_id context." } };
  }

  const filters = parseDashboardFilters(req.query ?? {});
  if (!filters.ok) {
    return { status: 400, body: { ok: false, error: filters.error } };
  }

  const { mode, includeDetails, loadProfile } = filters;

  try {
    // Start QuickBooks prepared-facts read in parallel with Moraware source load.
    const quickbooksPromise = getQuickBooksFinancialTruthSafe({
      startDate: filters.dateRange?.start ?? null,
      endDate: filters.dateRange?.end ?? null,
      organizationId,
      supabase
    });

    const sources = await loadDashboardDataSources(supabase, organizationId, {
      loadProfile,
      includeDetails,
      filters
    });
    timer.mark("load_dashboard_sources");
    const loadStats = sources?._loadStats;
    if (loadStats?.jobFacts) {
      timer.note("job_facts_rows", loadStats.jobFacts.rows ?? 0);
      timer.note("worksheet_facts_rows", loadStats.worksheetFacts?.rows ?? 0);
      timer.note("date_scoped", loadStats.dateScoped ? 1 : 0);
    }
    if (loadStats?.timingsMs) {
      timer.note("prepared_moraware_sql_ms", loadStats.timingsMs.prepared_moraware_sql ?? 0);
      timer.note("worksheet_fact_reads_ms", loadStats.timingsMs.worksheet_fact_reads ?? 0);
      timer.note("enrichment_aggregation_ms", loadStats.timingsMs.enrichment_aggregation ?? 0);
      timer.note("intelligence_bundle_ms", loadStats.timingsMs.intelligence_bundle ?? 0);
    }

    const metricsKey = buildMetricsCacheKey(sources, filters, mode);
    let body = getCachedDashboardMetrics(metricsKey);
    if (body) {
      timer.mark("build_metrics_cache_hit");
    } else {
      body = buildSalesDashboardResponse({
        sources,
        filters,
        includeDetails,
        payloadMode: mode
      });
      timer.mark("build_metrics");
      setCachedDashboardMetrics(metricsKey, body);
    }

    const kpisFlat = {
      currentSqft: body.commandCenter.kpis.find((k) => k.id === "produced_sqft")?.value,
      priorSqft: body.salesPerformance.monthlyYoY.reduce((s, m) => s + (m.priorSqft || 0), 0) || null,
      yoyPct: body.commandCenter.kpis.find((k) => k.id === "yoy_pct")?.value,
      unknownColorShare: body.colorsMaterials?.unknownShare
    };

    body.commandCenter.insights = buildDashboardInsights({
      kpis: kpisFlat,
      repSummary: body.salesPerformance.repSummary,
      accountSummary: body.accounts,
      colorMix: body.colorsMaterials,
      quotePipeline: body.quotePipeline,
      forecast: body.forecasting,
      production: body.productionFlow
    });
    body.insightSummaryText = buildInsightSummaryText(body.commandCenter.insights);
    body.executiveSummary = buildExecutiveSummary({
      kpis: kpisFlat,
      repSummary: body.salesPerformance.repSummary,
      accountSummary: body.accounts,
      colorMix: body.colorsMaterials,
      quotePipeline: body.quotePipeline,
      forecast: body.forecasting,
      production: body.productionFlow
    });
    timer.mark("build_insights");

    const sliced = sliceDashboardPayload(body, { mode, tab: filters.tab, includeDetails });
    timer.mark("slice_payload");

    const quickbooksFinancialTruth = await quickbooksPromise;
    timer.mark("quickbooks_financial_truth");

    if (sliced.meta) {
      sliced.meta.cacheHit = Boolean(sources._cacheHit);
      if (sources._loadStats) {
        sliced.meta.loadStats = sources._loadStats;
      }
    }

    const responseBody = {
      ok: true,
      organization_id: organizationId,
      ...sliced,
      quickbooks_financial_truth: quickbooksFinancialTruth
    };
    timer.mark("serialize_ready");

    const debugTiming = timer.finish();
    if (responseBody.meta && isDashboardTimingEnabled()) {
      responseBody.meta.debugTiming = debugTiming;
    }

    return {
      status: 200,
      body: responseBody
    };
  } catch (e) {
    return {
      status: 500,
      body: { ok: false, error: String(e?.message ?? e) }
    };
  }
}
