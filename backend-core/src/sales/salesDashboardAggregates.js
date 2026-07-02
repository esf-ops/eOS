/**
 * Sales Command Center aggregates — delegates to intelligence + metrics layer.
 */

import { buildIntelligenceFromSources, computeDashboardFromIntelligence } from "./salesDashboardMetrics.js";
import { buildSalesIntelligenceBundle, finalizeIntelligenceBundle } from "./salesIntelligenceFacts.js";

/**
 * Build full dashboard response sections from loaded sources + filters.
 */
export function buildSalesDashboardResponse({ sources, filters, includeDetails = false, payloadMode = "full" }) {
  const organizationId = sources.organizationId ?? sources.facts?.organizationId ?? "";
  const bundle = finalizeIntelligenceBundle(buildSalesIntelligenceBundle({ ...sources, organizationId }), filters);
  const response = computeDashboardFromIntelligence(bundle, filters, { includeDetails, payloadMode });

  response.commandCenter.bentoCards = buildBentoCards(response);
  response.commandCenter.charts = {
    ...response.commandCenter.charts,
    monthlyYoY: response.salesPerformance.monthlyYoY
  };
  response.forecasting.riskInsights = buildForecastRiskInsights(
    response.forecasting,
    response.productionFlow,
    response.quotePipeline
  );

  return response;
}

function buildBentoCards(response) {
  const kpis = response.commandCenter?.kpis ?? [];
  return [
    { id: "monthly_yoy", title: "Monthly YoY trend", type: "chart", chartKey: "monthlyYoY", span: "large" },
    { id: "forecast_vs_actual", title: "Forecast vs actual", type: "chart", chartKey: "forecastVsActual", span: "medium" },
    { id: "quote_pipeline", title: "Quote pipeline by status", type: "chart", chartKey: "quoteStatus", span: "medium" },
    { id: "rep_leaderboard", title: "Sales rep leaderboard", type: "table", dataKey: "repSummary", span: "medium" },
    { id: "production_branch", title: "Production by branch", type: "chart", chartKey: "productionBranch", span: "medium" },
    { id: "elite_mix", title: "Elite 100 mix", type: "chart", chartKey: "eliteMix", span: "medium" },
    { id: "manufacturer_mix", title: "Manufacturer mix", type: "chart", chartKey: "manufacturerMix", span: "medium" },
    { id: "top_accounts", title: "Top accounts", type: "table", dataKey: "topAccounts", span: "medium" },
    { id: "data_quality", title: "Data quality issues", type: "table", dataKey: "dataQuality", span: "medium" },
    { id: "quote_conversion", title: "Quote-to-production", type: "metric", value: kpis.find((k) => k.id === "quote_count")?.value, span: "small" }
  ];
}

function buildForecastRiskInsights(forecast, production, quotePipeline) {
  const insights = [];
  const fv = forecast.forecastCards?.[0]?.value;
  if (typeof fv === "number" && fv > 0 && production.producedSqft === 0) {
    insights.push({ severity: "info", text: "Forecast value exists but no production sqft in selected range." });
  }
  if (quotePipeline.openQuoteCount > 0 && production.producedSqft === 0) {
    insights.push({ severity: "info", text: "Open quotes exist but no production sqft in range — verify conversion timing." });
  }
  return insights;
}

/** Expose KPI flat object for insights builder. */
export function extractKpiFlat(response) {
  const kpis = response.commandCenter?.kpis ?? [];
  const byId = Object.fromEntries(kpis.map((k) => [k.id, k.value]));
  return {
    currentSqft: byId.produced_sqft,
    priorSqft: null,
    yoyPct: byId.yoy_pct,
    unknownColorShare: response.colorsMaterials?.unknownShare
  };
}
