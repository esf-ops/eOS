/**
 * GET /api/sales/dashboard — Sales Command Center orchestration.
 */

import { parseDashboardFilters } from "./salesDashboardFilters.js";
import { loadDashboardDataSources, resolveDashboardOrganizationId } from "./salesDashboardDataSources.js";
import { buildSalesDashboardResponse } from "./salesDashboardAggregates.js";
import { buildDashboardInsights, buildInsightSummaryText, buildExecutiveSummary } from "./salesDashboardInsights.js";

export async function salesDashboardHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const organizationId = resolveDashboardOrganizationId(req);
  if (!organizationId) {
    return { status: 400, body: { ok: false, error: "Sales dashboard requires organization_id context." } };
  }

  const filters = parseDashboardFilters(req.query ?? {});
  if (!filters.ok) {
    return { status: 400, body: { ok: false, error: filters.error } };
  }

  try {
    const sources = await loadDashboardDataSources(supabase, organizationId);
    const body = buildSalesDashboardResponse({ sources, filters });

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

    return {
      status: 200,
      body: {
        ok: true,
        organization_id: organizationId,
        ...body
      }
    };
  } catch (e) {
    return {
      status: 500,
      body: { ok: false, error: String(e?.message ?? e) }
    };
  }
}
