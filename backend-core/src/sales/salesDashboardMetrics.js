/**
 * Sales dashboard metric registry and server-side computation.
 * All tabs consume metrics derived from salesIntelligenceFacts bundle.
 */

import { rowMatchesDashboardFilters, sortRows, paginateRows, dateInInclusiveRange } from "./salesDashboardFilters.js";
import { rankAttentionAccounts, detectDormantAccounts, scoreAccountFocus } from "./salesAccountFocusScoring.js";
import { findQuotedNotProduced } from "./salesQuotePipelineSummary.js";
import { forecastWindowSummary } from "./salesForecastingSummary.js";
import { buildMonthlyYoYTrend } from "./salesProductionSummary.js";
import { ACTIVE_SALES_REPS } from "./salesAttribution.js";
import {
  attachIntelligenceFieldsToJobs,
  buildColorAnalyticsFromIntelligenceRows,
  buildDataCoverageReport,
  buildSalesIntelligenceBundle,
  metricUnavailable,
  metricValue
} from "./salesIntelligenceFacts.js";
import {
  buildAccountDetailIndex,
  buildColorDetailIndex,
  buildDataQualityIssues,
  buildActiveFilterChips,
  pickAccountsForDetailIndex
} from "./salesDashboardDetails.js";

/** @typedef {{ key: string, label: string, sources: string[], method: string, caveat?: string }} MetricDef */

export const SALES_DASHBOARD_METRICS = Object.freeze([
  { key: "produced_sqft", label: "Total produced sqft", sources: ["productionJobs"], method: "Sum job worksheet_sqft in current range" },
  { key: "job_count", label: "Job count", sources: ["productionJobs"], method: "Count jobs in current range" },
  { key: "jobs_with_sqft", label: "Jobs with sqft", sources: ["productionJobs"], method: "Jobs where worksheet_sqft > 0" },
  { key: "avg_sqft_per_job", label: "Average sqft/job", sources: ["productionJobs"], method: "produced_sqft / jobs_with_sqft" },
  { key: "prior_sqft", label: "Prior-year sqft", sources: ["productionJobs"], method: "Sum job sqft in prior range" },
  { key: "yoy_sqft_delta", label: "YoY sqft delta", sources: ["productionJobs"], method: "current - prior" },
  { key: "yoy_pct", label: "YoY percent", sources: ["productionJobs"], method: "(current - prior) / prior" },
  { key: "monthly_trend", label: "Monthly trend", sources: ["productionJobs"], method: "Group by report month" },
  { key: "branch_volume", label: "Branch volume", sources: ["productionJobs"], method: "Sum sqft by branch" },
  { key: "rep_volume", label: "Rep volume", sources: ["productionJobs"], method: "Sum sqft by assigned rep" },
  { key: "account_volume", label: "Account volume", sources: ["accountFacts"], method: "Sum sqft by account" },
  { key: "active_accounts", label: "Active accounts", sources: ["accountFacts"], method: "Accounts with current sqft > 0" },
  { key: "dormant_accounts", label: "Dormant accounts", sources: ["accountFacts"], method: "Prior sqft > threshold, current = 0" },
  { key: "elite_share", label: "Elite 100 share", sources: ["worksheetMaterial"], method: "Elite worksheet sqft / classified worksheet sqft", caveat: "Worksheet line sqft may exceed job rollup sqft" },
  { key: "out_share", label: "Out-of-collection share", sources: ["worksheetMaterial"], method: "OOC worksheet sqft / classified worksheet sqft" },
  { key: "unknown_color_share", label: "Unknown color share", sources: ["worksheetMaterial"], method: "Unknown worksheet sqft / classified worksheet sqft" },
  { key: "quote_pipeline_value", label: "Quote pipeline value", sources: ["quoteFacts"], method: "Sum open quote grand_total in range" },
  { key: "forecast_value", label: "Forecast value", sources: ["forecastFacts"], method: "Weighted sum of forecast_value", caveat: "Unavailable when forecast rows lack organization_id and quote linkage" },
  { key: "forecast_sqft", label: "Forecast sqft", sources: ["forecastFacts"], method: "Weighted estimated sqft from linked quotes" },
  { key: "data_confidence", label: "Data confidence", sources: ["dataQuality"], method: "Composite sync, mapping, sqft, worksheet coverage" },
  { key: "production_flow_install", label: "Install/schedule signals", sources: ["productionFlow"], method: "Calendar rows + job activities when synced", caveat: "Backlog/capacity unavailable until normalized" }
]);

function sqft(job) {
  const n = Number(job?.worksheet_sqft ?? job?.sqft ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pct(cur, pri) {
  if (!Number.isFinite(pri) || pri === 0) return null;
  return ((cur - pri) / pri) * 100;
}

function accountKey(row) {
  return String(row.account_name ?? row.account ?? row.account_raw ?? "").trim().toLowerCase() || "(unknown)";
}

function partitionProductionJobs(productionJobs, currentRange, priorRange) {
  const current = [];
  const prior = [];
  for (const row of productionJobs) {
    const d = String(row.report_date ?? "").slice(0, 10);
    if (dateInInclusiveRange(d, currentRange)) current.push(row);
    else if (dateInInclusiveRange(d, priorRange)) prior.push(row);
  }
  return { current, prior };
}

function aggregateColorMixFromAnalytics(colorAnalytics) {
  const totalSqft = colorAnalytics.colorRows.reduce((s, r) => s + r.sqft, 0) || 0;
  const eliteSqft = colorAnalytics.colorRows.filter((r) => r.collectionStatus === "elite100").reduce((s, r) => s + r.sqft, 0);
  const outSqft = colorAnalytics.colorRows.filter((r) => r.collectionStatus === "out_of_collection").reduce((s, r) => s + r.sqft, 0);
  const unknownSqft = Math.max(0, totalSqft - eliteSqft - outSqft);
  const pctFn = (n) => (totalSqft > 0 ? (n / totalSqft) * 100 : 0);
  const byGroup = new Map();
  const byMfg = new Map();
  for (const r of colorAnalytics.colorRows) {
    if (r.collectionStatus === "elite100" && r.eliteGroup) byGroup.set(r.eliteGroup, (byGroup.get(r.eliteGroup) || 0) + r.sqft);
    byMfg.set(r.manufacturer || "Unknown", (byMfg.get(r.manufacturer || "Unknown") || 0) + r.sqft);
  }
  return {
    totalSqft,
    eliteSqft,
    outSqft,
    unknownSqft,
    eliteShare: totalSqft > 0 ? pctFn(eliteSqft) : null,
    outShare: totalSqft > 0 ? pctFn(outSqft) : null,
    unknownShare: totalSqft > 0 ? pctFn(unknownSqft) : null,
    eliteGroupBreakdown: [...byGroup.entries()].map(([group, sqftVal]) => ({ group, sqft: sqftVal, share: pctFn(sqftVal) })).sort((a, b) => b.sqft - a.sqft),
    manufacturerBreakdown: [...byMfg.entries()].map(([manufacturer, sqftVal]) => ({ manufacturer, sqft: sqftVal, share: pctFn(sqftVal) })).sort((a, b) => b.sqft - a.sqft),
    topEliteColors: colorAnalytics.topEliteColors,
    topOutOfCollectionColors: colorAnalytics.topOutOfCollectionColors,
    unknownColorRows: colorAnalytics.unknownColors
  };
}

function buildAccountSummaryFromFacts(accountFacts) {
  const accounts = accountFacts.map((a) => ({ ...a, ...scoreAccountFocus(a) }));
  return {
    activeAccountCount: accounts.filter((a) => (a.currentSqft ?? 0) > 0).length,
    allAccounts: accounts,
    topAccounts: [...accounts].sort((a, b) => (b.currentSqft ?? 0) - (a.currentSqft ?? 0)).slice(0, 25),
    growthAccounts: accounts.filter((a) => (a.yoySqft ?? 0) > 0).sort((a, b) => (b.yoySqft ?? 0) - (a.yoySqft ?? 0)).slice(0, 25),
    declineAccounts: accounts.filter((a) => (a.yoySqft ?? 0) < 0).sort((a, b) => (a.yoySqft ?? 0) - (b.yoySqft ?? 0)).slice(0, 25),
    attentionAccounts: rankAttentionAccounts(accounts, 25),
    dormantAccounts: detectDormantAccounts(accounts)
  };
}

function buildRepSummaryFromJobs(currentJobs, priorJobs) {
  const cur = new Map();
  const pri = new Map();
  for (const j of currentJobs) {
    const k = j.normalized_salesperson || j.assigned_rep || j.salesperson_raw || j.normalizedSalesperson || j.assignedSalesperson || "Unknown";
    const slot = cur.get(k) || { salesperson: k, currentSqft: 0, jobCount: 0, accounts: new Map() };
    slot.currentSqft += sqft(j);
    slot.jobCount += 1;
    slot.accounts.set(accountKey(j), (slot.accounts.get(accountKey(j)) || 0) + sqft(j));
    cur.set(k, slot);
  }
  for (const j of priorJobs) {
    const k = j.normalized_salesperson || j.assigned_rep || j.salesperson_raw || j.normalizedSalesperson || j.assignedSalesperson || "Unknown";
    pri.set(k, { priorSqft: (pri.get(k)?.priorSqft ?? 0) + sqft(j) });
  }
  return [...cur.entries()]
    .map(([k, c]) => {
      const p = pri.get(k) || { priorSqft: 0 };
      return {
        salesperson: k,
        isActiveRep: ACTIVE_SALES_REPS.includes(k),
        currentSqft: c.currentSqft,
        priorSqft: p.priorSqft,
        yoySqft: c.currentSqft - p.priorSqft,
        yoyPct: pct(c.currentSqft, p.priorSqft),
        jobCount: c.jobCount,
        accountCount: c.accounts.size,
        topAccounts: [...c.accounts.entries()].map(([account, totalSqft]) => ({ account, totalSqft })).sort((a, b) => b.totalSqft - a.totalSqft).slice(0, 5)
      };
    })
    .sort((a, b) => b.currentSqft - a.currentSqft);
}

function summarizeProductionFromJobs(filteredCurrent, filteredPrior, currentRange) {
  let totalSqft = 0;
  const byMonth = new Map();
  const byBranch = new Map();
  const byStatus = new Map();
  let jobCount = 0;
  let missingSqft = 0;
  for (const job of filteredCurrent) {
    jobCount += 1;
    const s = sqft(job);
    if (s <= 0) {
      missingSqft += 1;
      continue;
    }
    totalSqft += s;
    const month = String(job.report_date ?? "").slice(0, 7);
    if (month) byMonth.set(month, (byMonth.get(month) || 0) + s);
    byBranch.set(job.branch || "Unmapped", (byBranch.get(job.branch || "Unmapped") || 0) + s);
    byStatus.set(job.job_status || "Unknown", (byStatus.get(job.job_status || "Unknown") || 0) + s);
  }
  return {
    producedSqft: Math.round(totalSqft * 100) / 100,
    jobCount,
    jobsMissingSqft: missingSqft,
    producedSqftTrend: [...byMonth.entries()].map(([month, sqftVal]) => ({ month, sqft: Math.round(sqftVal * 100) / 100 })).sort((a, b) => a.month.localeCompare(b.month)),
    productionByBranch: [...byBranch.entries()].map(([branch, sqftVal]) => ({ branch, sqft: Math.round(sqftVal * 100) / 100 })).sort((a, b) => b.sqft - a.sqft),
    productionByStatus: [...byStatus.entries()].map(([status, sqftVal]) => ({ status, sqft: Math.round(sqftVal * 100) / 100 })).sort((a, b) => b.sqft - a.sqft),
    backlogSummary: null,
    capacitySignal: null,
    dateRange: currentRange
  };
}

function summarizeQuotePipelineFromFacts(quoteFacts, dateRange) {
  const filtered = quoteFacts.filter((q) => {
    const d = String(q.created_date ?? "").slice(0, 10);
    return !dateRange?.start || (d >= dateRange.start && d <= dateRange.end);
  });
  const byStatus = new Map();
  const bySource = new Map();
  let openValue = 0;
  let wonValue = 0;
  let openCount = 0;
  let draftCount = 0;
  let lostCount = 0;
  let totalValue = 0;
  for (const q of filtered) {
    const status = q.status || "Unknown";
    byStatus.set(status, (byStatus.get(status) || 0) + 1);
    bySource.set(q.quote_source || "Unknown", (bySource.get(q.quote_source || "Unknown") || 0) + 1);
    totalValue += q.quote_value || 0;
    if (q.is_open) {
      openValue += q.quote_value || 0;
      openCount += 1;
    }
    if (q.is_won) wonValue += q.quote_value || 0;
    if (q.is_draft) draftCount += 1;
    if (q.is_lost) lostCount += 1;
  }
  return {
    quoteCount: filtered.length,
    openQuoteCount: openCount,
    wonQuoteCount: filtered.filter((q) => q.is_won).length,
    draftQuoteCount: draftCount,
    lostQuoteCount: lostCount,
    openPipelineValue: Math.round(openValue),
    wonValue: Math.round(wonValue),
    totalQuoteValue: Math.round(totalValue),
    averageQuoteValue: filtered.length ? Math.round(totalValue / filtered.length) : null,
    quoteStatusSummary: [...byStatus.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    quoteSourceSummary: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    quoteRows: filtered.slice(0, 100)
  };
}

function summarizeForecastsFromFacts(forecastFacts, dateRange) {
  const scoped = forecastFacts.filter((f) => f.status !== "excluded_missing_org");
  const filtered = scoped.filter((e) => {
    const d = String(e.forecast_date ?? "").slice(0, 10);
    if (!dateRange?.start || !d) return Boolean(!dateRange?.start);
    return d >= dateRange.start && d <= dateRange.end;
  });
  if (!scoped.length) {
    return {
      forecastEventCount: 0,
      forecastValue: metricUnavailable("Missing quote_forecast_events.organization_id or quote linkage"),
      forecastSqft: metricUnavailable("Missing quote_forecast_events.organization_id or quote linkage"),
      forecastByMonth: [],
      forecastByRep: [],
      status: "unavailable",
      reason: forecastFacts.find((f) => f.status === "excluded_missing_org")?.reason ?? "No forecast events for organization"
    };
  }
  let forecastValue = 0;
  let forecastSqft = 0;
  const byMonth = new Map();
  const byRep = new Map();
  for (const e of filtered) {
    const prob = Number(e.probability_percent) / 100 || 1;
    forecastValue += (e.forecast_value || 0) * prob;
    forecastSqft += (e.forecast_sqft || 0) * prob;
    const month = String(e.forecast_date ?? "").slice(0, 7) || "Undated";
    byRep.set(e.sales_rep || "Unassigned", (byRep.get(e.sales_rep || "Unassigned") || 0) + (e.forecast_value || 0) * prob);
    byMonth.set(month, (byMonth.get(month) || 0) + (e.forecast_value || 0) * prob);
  }
  return {
    forecastEventCount: filtered.length,
    forecastValue: Math.round(forecastValue),
    forecastSqft: Math.round(forecastSqft * 100) / 100,
    forecastByMonth: [...byMonth.entries()].map(([month, value]) => ({ month, value: Math.round(value) })).sort((a, b) => a.month.localeCompare(b.month)),
    forecastByRep: [...byRep.entries()].map(([rep, value]) => ({ rep, value: Math.round(value) })).sort((a, b) => b.value - a.value),
    status: "available"
  };
}

function computeDataConfidence({ factsAvailable, syncComplete, unmappedShare, sqftCoverage, worksheetCoverage }) {
  let score = 100;
  if (!factsAvailable) score -= 40;
  if (!syncComplete) score -= 15;
  score -= Math.round(unmappedShare * 30);
  score -= Math.round((1 - sqftCoverage) * 25);
  if (worksheetCoverage < 0.5) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function buildFilterOptions(productionJobs, quoteFacts) {
  const salespeople = new Set();
  const branches = new Set();
  const accounts = new Set();
  const statuses = new Set();
  for (const j of productionJobs) {
    if (j.normalized_salesperson || j.assigned_rep) salespeople.add(j.normalized_salesperson || j.assigned_rep);
    if (j.branch) branches.add(j.branch);
    if (j.account_raw) accounts.add(j.account_raw);
    if (j.job_status) statuses.add(j.job_status);
  }
  const quoteStatuses = new Set(quoteFacts.map((q) => q.status).filter(Boolean));
  return {
    salespeople: [...salespeople].sort(),
    branches: [...branches].sort(),
    accounts: [...accounts].sort().slice(0, 200),
    jobStatuses: [...statuses].sort(),
    quoteStatuses: [...quoteStatuses].sort()
  };
}

function mapExplorerRow(j) {
  return {
    jobId: j.source_job_id,
    account: j.account_name,
    salesperson: j.normalizedSalesperson || j.assignedSalesperson,
    morawareSalesperson: j.morawareSalesperson,
    branch: j.branch,
    status: j.status_name,
    sqft: sqft(j),
    reportDate: j.reportDate,
    attributionStatus: j.attributionStatus
  };
}

function buildKpis(ctx) {
  const fv = ctx.forecast.forecastValue;
  const fs = ctx.forecast.forecastSqft;
  return [
    { id: "produced_sqft", label: "Produced sqft", value: ctx.currentSqft, format: "sqft" },
    { id: "yoy_sqft", label: "YoY sqft change", value: ctx.yoySqft, format: "sqft", delta: ctx.yoyPct },
    { id: "yoy_pct", label: "YoY %", value: ctx.yoyPct, format: "percent" },
    { id: "elite_share", label: "Elite 100 share", value: ctx.colorMix.eliteShare, format: "percent" },
    { id: "out_share", label: "Out-of-collection", value: ctx.colorMix.outShare, format: "percent" },
    { id: "active_accounts", label: "Active accounts", value: ctx.accountSummary.activeAccountCount, format: "count" },
    { id: "quote_count", label: "Quote volume", value: ctx.quotePipeline.quoteCount, format: "count" },
    { id: "pipeline_value", label: "Pipeline value", value: ctx.quotePipeline.openPipelineValue, format: "currency" },
    { id: "forecast_sqft", label: "Forecasted sqft", value: typeof fs === "object" ? null : fs, format: "sqft", status: typeof fs === "object" ? fs.status : "available", reason: typeof fs === "object" ? fs.reason : undefined },
    { id: "forecast_value", label: "Forecast value", value: typeof fv === "object" ? null : fv, format: "currency", status: typeof fv === "object" ? fv.status : "available", reason: typeof fv === "object" ? fv.reason : undefined },
    { id: "booked_production", label: "Booked production", value: ctx.production.producedSqft, format: "sqft" },
    { id: "attention_accounts", label: "Need attention", value: ctx.accountSummary.attentionAccounts.length, format: "count" },
    { id: "sync_freshness", label: "Last sync", value: ctx.syncHealth.lastSyncAt, format: "datetime" },
    { id: "data_confidence", label: "Data confidence", value: ctx.dataConfidence, format: "percent" },
    { id: "unmapped_count", label: "Unmapped rows", value: ctx.unmappedCount, format: "count" }
  ];
}

/**
 * Build intelligence bundle from raw sources (sync layer).
 */
export function buildIntelligenceFromSources(sources, organizationId) {
  return buildSalesIntelligenceBundle({ ...sources, organizationId });
}

/**
 * Compute full dashboard payload from intelligence bundle + filters.
 */
export function computeDashboardFromIntelligence(bundle, filters) {
  const rows = bundle.worksheetMaterial ?? [];
  const shapedJobs = bundle.productionJobs.map((p) => enrichedJobShape(p));
  const jobsWithColor = attachIntelligenceFieldsToJobs(shapedJobs, rows);

  const currentRange = filters.dateRange;
  const priorRange = filters.priorRange;

  const filteredCurrent = jobsWithColor.filter((r) => {
    const d = String(r.reportDate ?? r.report_date ?? "").slice(0, 10);
    return dateInInclusiveRange(d, currentRange) && rowMatchesDashboardFilters(r, filters);
  });
  const filteredPrior = jobsWithColor.filter((r) => {
    const d = String(r.reportDate ?? r.report_date ?? "").slice(0, 10);
    return dateInInclusiveRange(d, priorRange) && rowMatchesDashboardFilters(r, filters);
  });

  const productionCurrentFacts = filteredCurrent.map((j) => ({
    ...j,
    report_date: j.reportDate,
    worksheet_sqft: sqft(j),
    attribution_status: j.attributionStatus,
    normalized_salesperson: j.normalizedSalesperson,
    assigned_rep: j.assignedSalesperson,
    salesperson_raw: j.morawareSalesperson,
    account_raw: j.account_name,
    job_id: j.source_job_id,
    job_status: j.status_name
  }));
  const productionPriorFacts = filteredPrior.map((j) => ({
    ...j,
    report_date: j.reportDate,
    worksheet_sqft: sqft(j)
  }));

  const colorAnalytics = buildColorAnalyticsFromIntelligenceRows(rows, currentRange, priorRange);
  const accountShareMap = new Map((colorAnalytics.accountColorShares || []).map((a) => [a.accountKey, a]));

  const currentSqft = filteredCurrent.reduce((s, j) => s + sqft(j), 0);
  const priorSqft = filteredPrior.reduce((s, j) => s + sqft(j), 0);
  const yoySqft = currentSqft - priorSqft;
  const yoyPct = pct(currentSqft, priorSqft);

  const colorMix = colorAnalytics.worksheetAvailable
    ? { ...aggregateColorMixFromAnalytics(colorAnalytics), colorTrendsByMonth: colorAnalytics.colorTrendsByMonth, worksheetEnriched: true }
    : { totalSqft: null, eliteShare: null, outShare: null, unknownShare: null, worksheetEnriched: false, status: "unavailable", reason: "No worksheet material facts loaded" };

  const quotePipeline = summarizeQuotePipelineFromFacts(bundle.quoteFacts, currentRange);
  const forecast = summarizeForecastsFromFacts(bundle.forecastFacts, currentRange);
  const production = summarizeProductionFromJobs(productionCurrentFacts, productionPriorFacts, currentRange);

  const currentYear = Number(currentRange.start.slice(0, 4));
  const priorYear = Number(priorRange.start.slice(0, 4));
  const monthlyYoY = buildMonthlyYoYTrend(
    filteredCurrent.concat(filteredPrior).map((j) => ({
      ...j,
      created_at_source: j.reportDate,
      creation_date: j.reportDate
    })),
    currentYear,
    priorYear
  );

  const accountFactsFiltered = bundle.accountFacts.filter((a) => {
    if (!filters.account) return true;
    return String(a.account_raw ?? a.account ?? "").toLowerCase().includes(filters.account.toLowerCase());
  });
  const accountSummary = buildAccountSummaryFromFacts(accountFactsFiltered);
  const repSummary = buildRepSummaryFromJobs(productionCurrentFacts, productionPriorFacts);

  const unmappedCount = filteredCurrent.filter((j) => j.attributionStatus !== "approved_mapped").length;
  const unknownColorCount = colorMix.unknownColorRows?.length ?? 0;
  const worksheetCoverage = bundle.dataCoverage?.worksheetFacts?.rows
    ? (colorAnalytics.currentRowCount || 0) / Math.max(1, bundle.dataCoverage.worksheetFacts.rows)
    : 0;

  const dataConfidence = computeDataConfidence({
    factsAvailable: bundle.factsMeta?.available,
    syncComplete: bundle.syncHealth?.latestGroupComplete,
    unmappedShare: filteredCurrent.length ? unmappedCount / filteredCurrent.length : 0,
    sqftCoverage: production.jobCount ? (production.jobCount - production.jobsMissingSqft) / production.jobCount : 0,
    worksheetCoverage
  });

  const producedAccountKeys = new Set(filteredCurrent.map((j) => accountKey(j)));
  const quotedNotProduced = findQuotedNotProduced(
    bundle.quoteFacts.map((q) => ({ customer_name: q.customer_account, grand_total: q.quote_value, partner_account_id: q.partner_account_id })),
    producedAccountKeys
  );

  const productionBySalesperson = buildRepSummaryFromJobs(productionCurrentFacts, productionPriorFacts).map((r) => ({
    rep: r.salesperson,
    sqft: r.currentSqft
  }));
  const pf = bundle.productionFlow;

  const kpis = buildKpis({
    currentSqft,
    priorSqft,
    yoySqft,
    yoyPct,
    colorMix,
    accountSummary,
    quotePipeline,
    forecast,
    production,
    unmappedCount,
    dataConfidence,
    syncHealth: bundle.syncHealth
  });

  const dataCoverage = buildDataCoverageReport(bundle, {
    dataConfidence,
    colorMix,
    quotePipeline,
    forecast,
    productionFlow: pf
  });

  const dataQualityPayload = buildDataQualityIssues({
    filteredCurrent,
    priorJobs: filteredPrior,
    accountSummary,
    colorMix,
    colorAnalytics,
    syncHealth: bundle.syncHealth,
    dataConfidence,
    worksheet: bundle.worksheetMeta,
    intelligenceQuality: bundle.dataQuality
  });

  return {
    meta: {
      tab: filters.tab,
      currentDateRange: currentRange,
      priorYearComparisonRange: priorRange,
      latestMorawareSync: bundle.syncHealth?.lastSyncAt,
      latestQuoteSave: bundle.quoteFacts[0]?.updated_at ?? bundle.quoteFacts[0]?.created_date ?? null,
      latestProductionUpdate: bundle.syncHealth?.lastSyncAt,
      rowCount: bundle.productionJobs.length,
      filteredRowCount: filteredCurrent.length,
      unmappedAccountCount: unmappedCount,
      unknownColorCount,
      dataConfidenceScore: dataConfidence,
      activeFilters: buildActiveFilterChips(filters),
      worksheetFactsAvailable: bundle.worksheetMeta?.available ?? false,
      dataCoverage
    },
    filterOptions: buildFilterOptions(bundle.productionJobs, bundle.quoteFacts),
    savedViews: defaultSavedViews(),
    commandCenter: {
      kpis,
      bentoCards: [],
      charts: {
        monthlyYoY,
        forecastVsActual: monthlyYoY.map((m) => ({ month: m.month, actual: m.currentSqft, forecast: forecast.forecastByMonth?.find((f) => f.month === m.month)?.value ?? 0 })),
        quoteStatus: quotePipeline.quoteStatusSummary,
        productionBranch: production.productionByBranch,
        eliteMix: colorMix.eliteGroupBreakdown ?? [],
        manufacturerMix: colorMix.manufacturerBreakdown ?? [],
        forecastMonthly: forecast.forecastByMonth ?? []
      },
      insights: []
    },
    salesPerformance: {
      monthlyYoY,
      repSummary,
      branchSummary: production.productionByBranch,
      accountRows: sortRows(accountSummary.allAccounts, filters.sortBy, filters.sortDir),
      accountSummary: accountSummary.topAccounts,
      activeAccountCount: accountSummary.activeAccountCount,
      producedSqftTrend: production.producedSqftTrend
    },
    forecasting: {
      forecastCards: [
        { label: "Forecast value", value: metricValue(forecast.forecastValue), status: forecast.status ?? "available", reason: forecast.reason },
        { label: "Forecast sqft", value: metricValue(forecast.forecastSqft), status: forecast.status ?? "available", reason: forecast.reason },
        { label: "Events", value: forecast.forecastEventCount, status: forecast.status === "unavailable" ? "unavailable" : "available" }
      ],
      forecastByMonth: forecast.forecastByMonth ?? [],
      forecastByRep: forecast.forecastByRep ?? [],
      forecastByBranch: summarizeForecastByBranch(bundle.forecastFacts),
      quoteForecastRows: bundle.forecastFacts.slice(0, 100),
      next30: forecastWindowSummary(forecastEventsForWindows(bundle.forecastFacts), currentRange.end, 30),
      next60: forecastWindowSummary(forecastEventsForWindows(bundle.forecastFacts), currentRange.end, 60),
      next90: forecastWindowSummary(forecastEventsForWindows(bundle.forecastFacts), currentRange.end, 90),
      forecastVsActual: monthlyYoY.map((m) => ({ month: m.month, actualSqft: m.currentSqft, forecastValue: forecast.forecastByMonth?.find((f) => f.month === m.month)?.value ?? 0 })),
      riskInsights: []
    },
    quotePipeline: { ...quotePipeline, quotedNotProducedRows: quotedNotProduced },
    productionFlow: {
      ...production,
      productionBySalesperson,
      productionVsForecast: {
        producedSqft: production.producedSqft,
        forecastSqft: metricValue(forecast.forecastSqft),
        gapSqft: typeof forecast.forecastSqft === "number" ? forecast.forecastSqft - production.producedSqft : null,
        forecastStatus: forecast.status
      },
      scheduledInstallCount: pf.scheduledInstallCount,
      activeJobCount: pf.activeJobCount,
      completedJobCount: pf.completedJobCount,
      calendarRowsInRange: pf.calendarRowsInRange,
      installSummary: pf.installSummary,
      backlogSummary: metricUnavailable(pf.backlogReason ?? "Production backlog not normalized in synced tables"),
      capacitySignal: metricUnavailable(pf.capacityReason ?? "Capacity signal not normalized in synced tables"),
      availableSignals: pf.availableSignals,
      missingSignals: pf.missingSignals
    },
    accounts: {
      ...accountSummary,
      quotedNotProduced,
      lowEliteAdoption: accountSummary.allAccounts.filter((a) => (a.eliteShare ?? 100) < 25 && (a.currentSqft ?? 0) >= 50).slice(0, 25),
      highOutOfCollection: accountSummary.allAccounts.filter((a) => (a.outShare ?? 0) >= 40 && (a.currentSqft ?? 0) >= 50).slice(0, 25)
    },
    colorsMaterials: { ...colorMix, colorRows: colorAnalytics.colorRows?.slice(0, 100) ?? [] },
    dataExplorer: {
      paginatedRows: paginateRows(
        sortRows(
          filteredCurrent.map(mapExplorerRow),
          filters.sortBy,
          filters.sortDir
        ),
        filters.page,
        filters.pageSize
      )
    },
    dataQuality: dataQualityPayload,
    detailPanels: {
      accounts: buildAccountDetailIndex(
        pickAccountsForDetailIndex(accountSummary.allAccounts, filters, 100),
        filteredCurrent,
        bundle.quoteFacts,
        bundle.forecastFacts,
        colorAnalytics
      ),
      colors: buildColorDetailIndex(colorAnalytics, filteredCurrent, bundle.worksheetMeta?.rows ?? [])
    },
    metrics: {
      produced_sqft: metricValue(currentSqft),
      prior_sqft: metricValue(priorSqft),
      yoy_pct: metricValue(yoyPct),
      elite_share: colorMix.eliteShare != null ? metricValue(colorMix.eliteShare) : metricUnavailable(colorMix.reason),
      quote_pipeline_value: metricValue(quotePipeline.openPipelineValue),
      forecast_value: metricValue(forecast.forecastValue, forecast.reason),
      data_confidence: metricValue(dataConfidence)
    }
  };
}

function enrichedJobShape(j) {
  return {
    ...j,
    source_job_id: j.job_id,
    account_name: j.account_raw,
    normalizedSalesperson: j.normalized_salesperson || j.assigned_rep,
    assignedSalesperson: j.assigned_rep,
    morawareSalesperson: j.salesperson_raw,
    branch: j.branch,
    status_name: j.job_status,
    job_status: j.job_status,
    reportDate: j.report_date,
    attributionStatus: j.attribution_status,
    worksheet_sqft: j.worksheet_sqft,
    colorCollectionStatus: j.colorCollectionStatus,
    color: j.color,
    stone: j.stone,
    eliteGroup: j.eliteGroup,
    manufacturer: j.manufacturer,
    room: j.room
  };
}

function enrichedJobShapeList(list) {
  return list.map(enrichedJobShape);
}

function defaultSavedViews() {
  return [
    { id: "ytd-default", label: "YTD overview", params: { quickRange: "ytd" } },
    { id: "rolling-30", label: "Last 30 days", params: { quickRange: "rolling_30" } },
    { id: "attention", label: "Needs attention", params: { quickRange: "ytd", behindPriorYearOnly: "1" } },
    { id: "unmapped", label: "Unmapped accounts", params: { quickRange: "ytd", unmappedOnly: "1" } }
  ];
}

function summarizeForecastByBranch(forecastFacts) {
  const byBranch = new Map();
  for (const e of forecastFacts.filter((f) => f.status !== "excluded_missing_org")) {
    const branch = e.branch || "Unassigned";
    byBranch.set(branch, (byBranch.get(branch) || 0) + (e.forecast_value || 0));
  }
  return [...byBranch.entries()].map(([branch, value]) => ({ branch, value: Math.round(value) })).sort((a, b) => b.value - a.value);
}

function forecastEventsForWindows(forecastFacts) {
  return forecastFacts
    .filter((f) => f.status !== "excluded_missing_org")
    .map((f) => ({
      forecast_value: f.forecast_value,
      forecast_sqft: f.forecast_sqft,
      probability_percent: f.probability_percent,
      created_at: f.forecast_date,
      forecast_date: f.forecast_date
    }));
}
