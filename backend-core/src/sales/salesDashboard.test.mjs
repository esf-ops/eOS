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
      organizationId: "org",
      enrichedFacts,
      intelligenceRows,
      worksheet: { rows: worksheetRows, available: true },
      quotes: [{ id: "q1", quote_status: "Open", grand_total: 5000, customer_name: "Fox", created_at: "2026-05-01" }],
      forecasts: [],
      activities: [],
      calendarRows: [],
      mappings: { aliasesByNormMoraware: new Map() },
      syncHealth: { latestGroupComplete: true, lastSyncAt: "2026-05-01" },
      facts: { available: true, rows: enrichedFacts }
    },
    filters
  });

  assert.equal(body.commandCenter.kpis.find((k) => k.id === "produced_sqft")?.value, 200);
  assert.ok((body.colorsMaterials?.eliteShare ?? 0) > 0);
  assert.ok((body.colorsMaterials?.colorRows?.length ?? 0) > 0);
  assert.ok((body.colorsMaterials?.totalSqft ?? 0) > 0);
  assert.ok(body.meta.dataCoverage?.worksheetFacts?.rows > 0);
  assert.ok(body.salesPerformance.repSummary.length >= 1);
  assert.ok(body.quotePipeline.quoteCount >= 1);
  assert.equal(body.productionFlow.backlogSummary?.status ?? "unavailable", "unavailable");
  console.log("ok: dashboard color rows + stable production total");
}

{
  const { buildSalesIntelligenceBundle, finalizeIntelligenceBundle, buildForecastFacts, buildQuoteFacts } = await import("./salesIntelligenceFacts.js");
  const quotes = [{ id: "q1", quote_status: "Open", grand_total: 1000, customer_name: "Fox", created_at: "2026-05-01" }];
  const forecastFacts = buildForecastFacts(
    [{ quote_id: "q1", event_type: "forecast", event_at: "2026-05-15T00:00:00Z", forecast_value: 5000, probability_percent: 50 }],
    buildQuoteFacts(quotes),
    "org"
  );
  assert.equal(forecastFacts[0].status, "included");
  assert.ok(forecastFacts[0].forecast_value > 0);

  const bundle = finalizeIntelligenceBundle(
    buildSalesIntelligenceBundle({
      organizationId: "org",
      enrichedFacts: [{ source_job_id: "j1", account_name: "Fox", created_at_source: "2026-05-01", worksheet_sqft: 100, reportDate: "2026-05-01", attributionStatus: "approved_mapped", normalizedSalesperson: "Casey" }],
      worksheet: { rows: [{ id: "w1", job_id: "j1", color: "Antique Gray", stone: "ESF", total_worksheet_sqft: 50, job_creation_date: "5/1/2026", account_name: "Fox" }], available: true },
      quotes,
      forecasts: [{ quote_id: "q1", event_type: "forecast", event_at: "2026-05-15T00:00:00Z", forecast_value: 5000, probability_percent: 50 }],
      mappings: { aliasesByNormMoraware: new Map() },
      syncHealth: { latestGroupComplete: true },
      facts: { available: true },
      activities: [],
      calendarRows: []
    }),
    parseDashboardFilters({ quickRange: "ytd" })
  );
  assert.ok(bundle.accountFacts.length >= 1);
  assert.ok(bundle.accountFacts[0].currentSqft > 0);
  console.log("ok: account facts current/prior from intelligence bundle");
}

{
  const { buildSalesIntelligenceBundle, finalizeIntelligenceBundle } = await import("./salesIntelligenceFacts.js");
  const { computeDashboardFromIntelligence } = await import("./salesDashboardMetrics.js");
  const filters = parseDashboardFilters({ quickRange: "ytd", tab: "command_center" });
  const bundle = finalizeIntelligenceBundle(
    buildSalesIntelligenceBundle({
      organizationId: "org",
      enrichedFacts: [
        { source_job_id: "j1", account_name: "Fox", created_at_source: "2026-05-01", worksheet_sqft: 200, reportDate: "2026-05-01", attributionStatus: "approved_mapped", normalizedSalesperson: "Casey", branch: "Lisbon" },
        { source_job_id: "j2", account_name: "Fox", created_at_source: "2025-05-01", worksheet_sqft: 150, reportDate: "2025-05-01", attributionStatus: "approved_mapped", normalizedSalesperson: "Casey", branch: "Lisbon" }
      ],
      worksheet: { rows: [], available: false },
      quotes: [],
      forecasts: [],
      mappings: { aliasesByNormMoraware: new Map() },
      syncHealth: { latestGroupComplete: true, lastSyncAt: "2026-05-01" },
      facts: { available: true },
      activities: [],
      calendarRows: []
    }),
    filters
  );
  const dash = computeDashboardFromIntelligence(bundle, filters);
  assert.ok(dash.salesPerformance.monthlyYoY.some((m) => m.currentSqft > 0));
  assert.ok(dash.salesPerformance.monthlyYoY.some((m) => m.priorSqft > 0));
  assert.ok(dash.commandCenter.kpis.find((k) => k.id === "yoy_pct"));
  assert.ok(dash.meta.dataCoverage);
  assert.ok(Array.isArray(dash.meta.dataCoverage.caveats));
  console.log("ok: YoY + data coverage from intelligence layer");
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

// Elite 100 classification + Moraware normalization
{
  resetElite100CatalogCache();
  const {
    classifySalesColor,
    classifySalesColorFixtureOnly,
    compareColorClassificationImpact
  } = await import("./salesColorClassification.js");
  const {
    stripThicknessPrefix,
    stripFinishSuffix,
    normalizeMorawareColorLabel,
    isExcludedColorNoise
  } = await import("./salesColorNormalization.js");
  const { loadElite100CatalogItems } = await import("./elite100CatalogFixture.js");

  assert.equal(stripThicknessPrefix("3cm Pacific Antique Gray"), "Pacific Antique Gray");
  assert.equal(stripThicknessPrefix("2 cm Moonflakes"), "Moonflakes");
  assert.equal(stripFinishSuffix("antique gray polished"), "antique gray");
  assert.equal(normalizeMorawareColorLabel("3cm Pacific Antique Gray Polished"), "pacific antique gray");
  console.log("ok: Moraware color normalization");

  const catalog = loadElite100CatalogItems();
  const clsSuffix = classifySalesColor("Pacific Antique Gray", "ESF", { catalogItems: catalog, aliases: [] });
  assert.equal(clsSuffix.collectionStatus, "elite100");
  assert.ok(String(clsSuffix.match_reason).startsWith("vendor_suffix_exact"));
  console.log("ok: vendor prefix exact remainder match");

  const clsThickness = classifySalesColor("3cm Antique Gray", "ESF", { catalogItems: catalog, aliases: [] });
  assert.equal(clsThickness.collectionStatus, "elite100");
  console.log("ok: thickness stripping");

  const clsFinish = classifySalesColor("Antique Gray Polished", "ESF", { catalogItems: catalog, aliases: [] });
  assert.equal(clsFinish.collectionStatus, "elite100");
  console.log("ok: finish suffix stripping");

  const clsAsmi = classifySalesColor("ASMI Moonflakes", "ASMI", { catalogItems: catalog, aliases: [] });
  assert.equal(clsAsmi.collectionStatus, "elite100");
  console.log("ok: ASMI Moonflakes vendor suffix");

  const clsCambria = classifySalesColor("Cambria Warwick", "Cambria", { catalogItems: catalog, aliases: [] });
  assert.equal(clsCambria.collectionStatus, "elite100");
  console.log("ok: Cambria Warwick vendor suffix");

  const clsFake = classifySalesColor("Pental Bianco Aspen", "Pental", { catalogItems: catalog, aliases: [] });
  assert.notEqual(clsFake.collectionStatus, "elite100");
  console.log("ok: non-catalog color remains unmatched");

  for (const noise of ["Remnant tagged at shop", "See below", "Shop only warehouse"]) {
    const n = classifySalesColor(noise, "ESF", { catalogItems: catalog, aliases: [] });
    assert.notEqual(n.collectionStatus, "elite100");
    assert.ok(isExcludedColorNoise(noise, "ESF"));
  }
  console.log("ok: remnant/shop/see below blocked from Elite 100");

  const before = classifySalesColorFixtureOnly("Pacific Antique Gray", "ESF");
  assert.notEqual(before.collectionStatus, "elite100");
  const after = classifySalesColor("Pacific Antique Gray", "ESF", { catalogItems: catalog, aliases: [] });
  assert.equal(after.collectionStatus, "elite100");
  const impact = compareColorClassificationImpact(
    [{ color_raw: "Pacific Antique Gray", stone: "ESF", worksheet_sqft: 100 }],
    { items: catalog, aliases: [], source: "fixture_elite100_2026", itemCount: catalog.length }
  );
  assert.ok(impact.after.eliteSqft > impact.before.eliteSqft);
  console.log("ok: compareColorClassificationImpact before/after");
}

// Elite 100 classification (fixture exact match)
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

{
  const { parseDashboardRequestOptions } = await import("./salesDashboardFilters.js");
  const opts = parseDashboardRequestOptions({ mode: "overview", includeDetails: "0" });
  assert.equal(opts.mode, "overview");
  assert.equal(opts.includeDetails, false);
  console.log("ok: parseDashboardRequestOptions");
}

{
  const { sliceDashboardPayload } = await import("./salesDashboardPayload.js");
  const full = {
    meta: { tab: "command_center" },
    filterOptions: {},
    savedViews: [],
    metrics: {},
    commandCenter: { kpis: [{ id: "produced_sqft", value: 100 }], charts: {} },
    salesPerformance: { repSummary: Array.from({ length: 30 }, (_, i) => ({ salesperson: `R${i}` })), monthlyYoY: [] },
    forecasting: {},
    quotePipeline: { quoteCount: 1 },
    productionFlow: { producedSqft: 100 },
    accounts: { topAccounts: [] },
    colorsMaterials: { colorRows: Array.from({ length: 50 }, (_, i) => ({ color: `C${i}`, sqft: i })), eliteShare: 10 },
    dataQuality: { issues: Array.from({ length: 20 }, (_, i) => ({ title: `I${i}` })) },
    detailPanels: { accounts: { a: { account: "A" } }, colors: { k: { color: "X" } } }
  };
  const sliced = sliceDashboardPayload(full, { mode: "overview", includeDetails: false });
  assert.equal(Object.keys(sliced.detailPanels?.accounts ?? {}).length, 0);
  assert.ok((sliced.salesPerformance?.repSummary?.length ?? 0) <= 15);
  assert.ok((sliced.colorsMaterials?.colorRows?.length ?? 0) <= 25);
  assert.ok(JSON.stringify(sliced).length < JSON.stringify(full).length);
  console.log("ok: sliceDashboardPayload overview");
}

{
  const { buildDashboardCacheKey, setCachedDashboardSources, getCachedDashboardSources, resetDashboardCache } = await import(
    "./salesDashboardCache.js"
  );
  resetDashboardCache();
  const key = buildDashboardCacheKey("org-1", { latestGroupId: "g1", lastSyncAt: "2026-01-01" });
  assert.ok(key.includes("org-1"));
  setCachedDashboardSources(key, { organizationId: "org-1", facts: { rows: [] } });
  const hit = getCachedDashboardSources(key);
  assert.equal(hit?.organizationId, "org-1");
  resetDashboardCache();
  console.log("ok: dashboard cache hit/miss");
}

console.log("salesDashboard.test.mjs — all passed");
