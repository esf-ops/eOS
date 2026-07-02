/**
 * Sales Command Center backend tests — pure helpers only.
 * Run: node backend-core/src/sales/salesDashboard.test.mjs
 */

import assert from "node:assert/strict";
import {
  parseDashboardFilters,
  comparisonPreviousYear,
  dateInInclusiveRange,
  sortRows,
  paginateRows,
  rowMatchesDashboardFilters
} from "./salesDashboardFilters.js";
import { scoreAccountFocus, detectDormantAccounts } from "./salesAccountFocusScoring.js";
import { classifySalesColor, aggregateColorMix, resetElite100CatalogCache } from "./salesColorClassification.js";
import { summarizeQuotePipeline, findQuotedNotProduced } from "./salesQuotePipelineSummary.js";
import { summarizeForecasts } from "./salesForecastingSummary.js";
import { buildMonthlyYoYTrend } from "./salesProductionSummary.js";

// Date filtering + prior-year shift
{
  const f = parseDashboardFilters({ quickRange: "ytd" });
  assert.equal(f.ok, true);
  assert.ok(f.dateRange.start.endsWith("-01-01"));
  assert.ok(f.priorRange.start.endsWith("-01-01"));
  assert.equal(Number(f.priorRange.start.slice(0, 4)), Number(f.dateRange.start.slice(0, 4)) - 1);
  console.log("ok: parseDashboardFilters ytd + prior year");
}

{
  const f = parseDashboardFilters({ quickRange: "rolling_30" });
  assert.equal(f.ok, true);
  assert.ok(f.dateRange.start <= f.dateRange.end);
  console.log("ok: rolling_30 quick range");
}

{
  const pri = comparisonPreviousYear("2026-03-15", "2026-06-01");
  assert.deepEqual(pri?.startInclusive, "2025-03-15");
  assert.deepEqual(pri?.endInclusive, "2025-06-01");
  console.log("ok: comparisonPreviousYear");
}

// Worksheet enrichment + color analytics
{
  const { parseFlexibleDashboardDate, buildSalesIntelligenceRows, buildColorAnalyticsFromIntelligenceRows } =
    await import("./salesIntelligenceFacts.js");
  const { attachWorksheetFieldsToJobs, buildColorAnalytics } = await import("./salesDashboardWorksheetEnrichment.js");

  assert.equal(parseFlexibleDashboardDate("3/3/2026"), "2026-03-03");
  assert.equal(parseFlexibleDashboardDate("1/7/2026"), "2026-01-07");
  assert.equal(parseFlexibleDashboardDate("2026-05-01"), "2026-05-01");
  console.log("ok: parseFlexibleDashboardDate (M/D/YYYY + ISO)");

  const worksheetRows = [
    {
      id: "ws-1",
      job_id: "1",
      color: "Antique Gray",
      stone: "ESF",
      total_worksheet_sqft: 50,
      job_creation_date: "5/1/2026",
      account_name: "Fox"
    },
    {
      id: "ws-2",
      job_id: "1",
      color: "Antique Gray",
      stone: "ESF",
      total_worksheet_sqft: 50,
      job_creation_date: "5/1/2026",
      account_name: "Fox"
    }
  ];
  const jobs = [
    { source_job_id: "1", account_name: "Fox", created_at_source: "2026-05-01", worksheet_sqft: 100, reportDate: "2026-05-01" }
  ];
  const intelligenceRows = buildSalesIntelligenceRows({
    organizationId: "org",
    enrichedFacts: jobs,
    worksheetRows
  });
  assert.equal(intelligenceRows.length, 2);
  assert.equal(intelligenceRows.reduce((s, r) => s + r.worksheet_sqft, 0), 100);

  const enriched = attachWorksheetFieldsToJobs(jobs, worksheetRows, "org");
  assert.equal(enriched[0].colorCollectionStatus, "elite100");

  const analytics = buildColorAnalyticsFromIntelligenceRows(intelligenceRows, { start: "2026-01-01", end: "2026-12-31" }, { start: "2025-01-01", end: "2025-12-31" });
  assert.ok(analytics.topEliteColors.length >= 1);
  assert.ok(analytics.colorRows.reduce((s, r) => s + r.sqft, 0) > 0);

  const legacyAnalytics = buildColorAnalytics(
    [{ color: "Antique Gray", stone: "ESF", total_worksheet_sqft: 100, job_creation_date: "5/1/2026", account_name: "Fox", id: "x" }],
    { start: "2026-01-01", end: "2026-12-31" },
    { start: "2025-01-01", end: "2025-12-31" },
    "org"
  );
  assert.ok(legacyAnalytics.topEliteColors.length >= 1);
  console.log("ok: worksheet enrichment + color analytics");
}

{
  const { buildSalesIntelligenceRows, buildColorAnalyticsFromIntelligenceRows } = await import("./salesIntelligenceFacts.js");
  const { buildSalesDashboardResponse } = await import("./salesDashboardAggregates.js");

  const enrichedFacts = [
    { source_job_id: "j1", account_name: "Fox", created_at_source: "2026-05-01", worksheet_sqft: 200, reportDate: "2026-05-01", attributionStatus: "approved_mapped", normalizedSalesperson: "Casey" }
  ];
  const worksheetRows = [
    { id: "a", job_id: "j1", color: "Antique Gray", stone: "ESF", total_worksheet_sqft: 120, job_creation_date: "5/1/2026", account_name: "Fox" },
    { id: "b", job_id: "j1", color: "Mystery Stone", stone: "Brand X", total_worksheet_sqft: 80, job_creation_date: "5/1/2026", account_name: "Fox" }
  ];
  const intelligenceRows = buildSalesIntelligenceRows({ organizationId: "org", enrichedFacts, worksheetRows });
  const unknown = intelligenceRows.find((r) => r.color_raw === "Mystery Stone");
  assert.equal(unknown?.collection_status, "out_of_collection");

  const filters = parseDashboardFilters({ quickRange: "ytd", tab: "command_center" });
  const body = buildSalesDashboardResponse({
    sources: {
      enrichedFacts,
      intelligenceRows,
      worksheet: { rows: worksheetRows, available: true },
      quotes: [],
      forecasts: [],
      syncHealth: { latestGroupComplete: true, lastSyncAt: "2026-05-01" },
      facts: { available: true, rows: enrichedFacts }
    },
    filters
  });

  assert.equal(body.commandCenter.kpis.find((k) => k.id === "produced_sqft")?.value, 200);
  assert.ok((body.colorsMaterials?.eliteShare ?? 0) > 0);
  assert.ok((body.colorsMaterials?.colorRows?.length ?? 0) > 0);
  assert.ok((body.colorsMaterials?.totalSqft ?? 0) > 0);
  console.log("ok: dashboard color rows + stable production total");
}

{
  const { buildSalesIntelligenceRows } = await import("./salesIntelligenceFacts.js");
  const rows = buildSalesIntelligenceRows({
    organizationId: "org",
    enrichedFacts: [],
    worksheetRows: [{ id: "dup", row_hash: "h1", color: "Antique Gray", stone: "ESF", total_worksheet_sqft: 50, job_creation_date: "5/1/2026" }]
  });
  assert.equal(rows.length, 1);
  console.log("ok: no double-counting worksheet rows");
}

{
  const { buildActiveFilterChips } = await import("./salesDashboardDetails.js");
  const f = parseDashboardFilters({ quickRange: "ytd", branch: "Lisbon" });
  const chips = buildActiveFilterChips(f);
  assert.ok(chips.some((c) => c.key === "branch"));
  console.log("ok: buildActiveFilterChips");
}

{
  const { buildDataQualityIssues } = await import("./salesDashboardDetails.js");
  const issues = buildDataQualityIssues({
    filteredCurrent: [{ attributionStatus: "needs_review_unmapped", account_name: "X", worksheet_sqft: 10 }],
    priorJobs: [],
    accountSummary: { topAccounts: [] },
    colorMix: {},
    colorAnalytics: { unknownColors: [] },
    syncHealth: { latestGroupComplete: true },
    dataConfidence: 80,
    worksheet: { available: false }
  });
  assert.ok(issues.issues.length >= 1);
  console.log("ok: buildDataQualityIssues");
}

{
  assert.equal(dateInInclusiveRange("2026-05-01", { start: "2026-01-01", end: "2026-12-31" }), true);
  assert.equal(dateInInclusiveRange("2025-05-01", { start: "2026-01-01", end: "2026-12-31" }), false);
  console.log("ok: dateInInclusiveRange");
}

// YoY / focus scoring
{
  const focus = scoreAccountFocus({ account: "Fox", currentSqft: 0, priorSqft: 500, outShare: 50, eliteShare: 5 });
  assert.ok(focus.focusScore > 0);
  assert.ok(focus.isDormant);
  assert.ok(focus.focusReasons.includes("dormant_vs_prior_year"));
  console.log("ok: scoreAccountFocus dormant");
}

{
  const dormant = detectDormantAccounts([
    { account: "A", priorSqft: 200, currentSqft: 0 },
    { account: "B", priorSqft: 50, currentSqft: 0 }
  ]);
  assert.equal(dormant.length, 1);
  console.log("ok: detectDormantAccounts threshold");
}

// Elite 100 classification
{
  resetElite100CatalogCache();
  const cls = classifySalesColor("Antique Gray", "ESF");
  assert.equal(cls.collectionStatus, "elite100");
  assert.equal(cls.eliteGroup, "Promo");
  console.log("ok: classifySalesColor elite100");
}

{
  const mix = aggregateColorMix([
    { color: "Antique Gray", stone: "ESF", total_worksheet_sqft: 100 },
    { color: "Random Color", stone: "Brand X", total_worksheet_sqft: 50 }
  ]);
  assert.ok(mix.eliteShare > 0);
  assert.ok(mix.outShare > 0);
  console.log("ok: aggregateColorMix");
}

// Quote pipeline
{
  const summary = summarizeQuotePipeline(
    [
      { quote_status: "Open", quote_source: "internal", grand_total: 1000, created_at: "2026-05-01" },
      { quote_status: "Won", quote_source: "partner", grand_total: 2000, created_at: "2026-05-02" }
    ],
    { start: "2026-01-01", end: "2026-12-31" }
  );
  assert.equal(summary.quoteCount, 2);
  assert.ok(summary.openPipelineValue >= 1000);
  console.log("ok: summarizeQuotePipeline");
}

{
  const rows = findQuotedNotProduced(
    [{ customer_name: "No Production Co", grand_total: 5000 }],
    new Set(["other account"])
  );
  assert.equal(rows.length, 1);
  console.log("ok: findQuotedNotProduced");
}

// Forecast + production
{
  const fc = summarizeForecasts([{ forecast_value: 10000, probability_percent: 50, created_at: "2026-05-01" }], {
    start: "2026-01-01",
    end: "2026-12-31"
  });
  assert.ok(fc.forecastValue > 0);
  console.log("ok: summarizeForecasts");
}

{
  const trend = buildMonthlyYoYTrend(
    [
      { created_at_source: "2026-05-10", worksheet_sqft: 100 },
      { created_at_source: "2025-05-10", worksheet_sqft: 80 }
    ],
    2026,
    2025
  );
  assert.ok(trend.some((m) => m.month === "2026-05" && m.currentSqft === 100));
  console.log("ok: buildMonthlyYoYTrend");
}

// Sorting + pagination
{
  const sorted = sortRows(
    [
      { total_sqft: 10 },
      { total_sqft: 100 },
      { total_sqft: 50 }
    ],
    "total_sqft",
    "desc"
  );
  assert.equal(sorted[0].total_sqft, 100);
  const page = paginateRows(sorted, 1, 2);
  assert.equal(page.rows.length, 2);
  assert.equal(page.total, 3);
  console.log("ok: sortRows + paginateRows");
}

// Row filters
{
  const filters = parseDashboardFilters({ quickRange: "ytd", branch: "Lisbon" });
  assert.equal(rowMatchesDashboardFilters({ branch: "Lisbon" }, filters), true);
  assert.equal(rowMatchesDashboardFilters({ branch: "Dyersville" }, filters), false);
  console.log("ok: rowMatchesDashboardFilters");
}

{
  const { buildExecutiveSummary } = await import("./salesDashboardInsights.js");
  const summary = buildExecutiveSummary({
    kpis: { currentSqft: 1000, priorSqft: 900, yoyPct: 11.1, unknownColorShare: 3 },
    repSummary: [{ salesperson: "Casey", yoyPct: 15, topAccounts: [{ account: "Fox" }] }],
    accountSummary: {
      highOutOfCollection: [{ account: "Fox Countertops" }],
      attentionAccounts: [{ account: "Fox Countertops" }]
    },
    colorMix: { eliteShare: 76 },
    quotePipeline: { openQuoteCount: 5, openPipelineValue: 50000, quotedNotProducedRows: [{ id: 1 }] },
    forecast: { next60: { forecastSqft: 800 }, forecastSqft: 800 },
    production: { producedSqft: 700, backlogSummary: null, capacitySignal: null }
  });
  assert.ok(summary.headline);
  assert.ok(summary.copyText.includes("Casey") || summary.copyText.includes("production"));
  assert.ok(summary.highlights.length >= 1);
  console.log("ok: buildExecutiveSummary");
}

{
  const { buildDataQualityIssues } = await import("./salesDashboardDetails.js");
  const issues = buildDataQualityIssues({
    filteredCurrent: [{ attributionStatus: "needs_review", account_name: "X", worksheet_sqft: 10 }],
    priorJobs: [],
    accountSummary: { topAccounts: [] },
    colorMix: {},
    colorAnalytics: { unknownColors: [{ color: "Mystery", sqft: 20 }] },
    syncHealth: { latestGroupComplete: false, lastSyncAt: "2026-01-01" },
    dataConfidence: 70,
    worksheet: { available: false }
  });
  const unknown = issues.issues.find((i) => i.type === "unknown_color");
  assert.equal(unknown?.navigateTab, "colors_materials");
  assert.equal(unknown?.filterPatch?.unknownColorsOnly, true);
  console.log("ok: data quality issue actions");
}

{
  const { pickAccountsForDetailIndex } = await import("./salesDashboardDetails.js");
  const accounts = [
    { account: "A", currentSqft: 100, focusScore: 0 },
    { account: "B", currentSqft: 500, focusScore: 5 },
    { account: "C", currentSqft: 50, focusScore: 0 }
  ];
  const picked = pickAccountsForDetailIndex(accounts, { account: "c" }, 2);
  assert.equal(picked.length, 2);
  assert.ok(picked.some((a) => a.account === "B"));
  assert.ok(picked.some((a) => a.account === "C"));
  console.log("ok: pickAccountsForDetailIndex bounds detail panels");
}

console.log("salesDashboard.test.mjs — all passed");
