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
    const sources = await loadDashboardDataSources(supabase, organizationId, { loadProfile });
    timer.mark("load_dashboard_sources");

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

    const debugTiming = timer.finish();
    if (sliced.meta) {
      sliced.meta.cacheHit = Boolean(sources._cacheHit);
      if (isDashboardTimingEnabled()) {
        sliced.meta.debugTiming = debugTiming;
      }
    }

    const responseBody = {
      ok: true,
      organization_id: organizationId,
      ...sliced
    };
    timer.mark("serialize_ready");

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
