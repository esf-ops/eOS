/**
 * Sales Command Center aggregates — KPIs, bento cards, charts, tab payloads.
 */

import { rowMatchesDashboardFilters, sortRows, paginateRows } from "./salesDashboardFilters.js";
import { aggregateColorMix } from "./salesColorClassification.js";
import { rankAttentionAccounts, detectDormantAccounts, scoreAccountFocus } from "./salesAccountFocusScoring.js";
import { summarizeQuotePipeline, findQuotedNotProduced } from "./salesQuotePipelineSummary.js";
import { summarizeForecasts, forecastWindowSummary } from "./salesForecastingSummary.js";
import { summarizeProduction, buildMonthlyYoYTrend } from "./salesProductionSummary.js";
import { ACTIVE_SALES_REPS } from "./salesAttribution.js";
import { attachIntelligenceFieldsToJobs, buildColorAnalyticsFromIntelligenceRows } from "./salesIntelligenceFacts.js";
import {
  buildAccountDetailIndex,
  buildColorDetailIndex,
  buildDataQualityIssues,
  buildActiveFilterChips,
  pickAccountsForDetailIndex
} from "./salesDashboardDetails.js";

function sqft(job) {
  const n = Number(job?.worksheet_sqft ?? job?.sqft ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pct(cur, pri) {
  if (!Number.isFinite(pri) || pri === 0) return null;
  return ((cur - pri) / pri) * 100;
}

function accountKey(row) {
  return String(row.account_name ?? row.account ?? "").trim().toLowerCase() || "(unknown)";
}

/**
 * Build full dashboard response sections from loaded sources + filters.
 */
export function buildSalesDashboardResponse({ sources, filters }) {
  const { enrichedFacts, worksheet, intelligenceRows, quotes, forecasts, syncHealth, facts } = sources;
  const currentRange = filters.dateRange;
  const priorRange = filters.priorRange;

  const rows = intelligenceRows ?? [];
  const jobsWithWorksheet = attachIntelligenceFieldsToJobs(enrichedFacts, rows);
  const colorAnalytics = buildColorAnalyticsFromIntelligenceRows(rows, currentRange, priorRange);
  const accountShareMap = new Map((colorAnalytics.accountColorShares || []).map((a) => [a.accountKey, a]));

  const currentJobs = [];
  const priorJobs = [];
  for (const row of jobsWithWorksheet) {
    const d = String(row.reportDate ?? "").slice(0, 10);
    if (d >= currentRange.start && d <= currentRange.end) currentJobs.push(row);
    else if (d >= priorRange.start && d <= priorRange.end) priorJobs.push(row);
  }

  const filteredCurrent = currentJobs.filter((r) => rowMatchesDashboardFilters(r, filters));
  const filteredPrior = priorJobs.filter((r) => rowMatchesDashboardFilters(r, filters));

  const currentSqft = filteredCurrent.reduce((s, j) => s + sqft(j), 0);
  const priorSqft = filteredPrior.reduce((s, j) => s + sqft(j), 0);
  const yoySqft = currentSqft - priorSqft;
  const yoyPct = pct(currentSqft, priorSqft);

  const worksheetInRange = rows.filter((r) => {
    const d = String(r.report_date ?? r.job_creation_date ?? "").slice(0, 10);
    return d >= currentRange.start && d <= currentRange.end;
  });
  const colorMix = colorAnalytics.worksheetAvailable
    ? {
        ...aggregateColorMixFromAnalytics(colorAnalytics, filteredCurrent),
        colorTrendsByMonth: colorAnalytics.colorTrendsByMonth,
        worksheetEnriched: true,
        intelligenceDiagnostics: {
          jobFactSqft: filteredCurrent.reduce((s, j) => s + sqft(j), 0),
          worksheetClassifiedSqft: colorAnalytics.colorRows.reduce((s, r) => s + r.sqft, 0)
        }
      }
    : {
        ...aggregateColorMix(
          worksheetInRange.map((r) => ({
            color: r.color_raw,
            stone: r.stone,
            total_worksheet_sqft: r.worksheet_sqft
          }))
        ),
        worksheetEnriched: false
      };

  const quotePipeline = summarizeQuotePipeline(quotes, currentRange);
  const forecast = summarizeForecasts(forecasts, currentRange);
  const production = summarizeProduction(filteredCurrent, currentRange);
  const productionPrior = summarizeProduction(filteredPrior, priorRange);

  const currentYear = Number(currentRange.start.slice(0, 4));
  const priorYear = Number(priorRange.start.slice(0, 4));
  const monthlyYoY = buildMonthlyYoYTrend([...filteredCurrent, ...filteredPrior], currentYear, priorYear);

  const accountSummary = buildAccountSummary(filteredCurrent, filteredPrior, quotes, accountShareMap);
  const repSummary = buildRepSummary(filteredCurrent, filteredPrior);
  const allAccounts = accountSummary.allAccounts || [];

  const unmappedCount = filteredCurrent.filter((j) => j.attributionStatus !== "approved_mapped").length;
  const unknownColorCount = colorMix.unknownColorRows?.length ?? 0;
  const dataConfidence = computeDataConfidence({
    factsAvailable: facts.available,
    syncComplete: syncHealth.latestGroupComplete,
    unmappedShare: filteredCurrent.length ? unmappedCount / filteredCurrent.length : 0,
    sqftCoverage: production.jobCount
      ? (production.jobCount - production.jobsMissingSqft) / production.jobCount
      : 0
  });

  const producedAccountKeys = new Set(filteredCurrent.map((j) => accountKey(j)));
  const quotedNotProduced = findQuotedNotProduced(quotes, producedAccountKeys);

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
    productionPrior,
    unmappedCount,
    unknownColorCount,
    dataConfidence,
    syncHealth,
    filteredCount: filteredCurrent.length
  });

  const commandCenter = {
    kpis,
    bentoCards: buildBentoCards({ kpis, monthlyYoY, colorMix, repSummary, accountSummary, quotePipeline, forecast, production }),
    charts: buildCharts({ monthlyYoY, colorMix, quotePipeline, forecast, production, repSummary }),
    insights: []
  };

  const productionBySalesperson = buildProductionBySalesperson(filteredCurrent);

  return {
    meta: {
      tab: filters.tab,
      currentDateRange: currentRange,
      priorYearComparisonRange: priorRange,
      latestMorawareSync: syncHealth.lastSyncAt,
      latestQuoteSave: quotes[0]?.updated_at ?? quotes[0]?.created_at ?? null,
      latestProductionUpdate: syncHealth.lastSyncAt,
      rowCount: enrichedFacts.length,
      filteredRowCount: filteredCurrent.length,
      unmappedAccountCount: unmappedCount,
      unknownColorCount,
      dataConfidenceScore: dataConfidence,
      activeFilters: buildActiveFilterChips(filters),
      worksheetFactsAvailable: worksheet.available ?? false
    },
    filterOptions: buildFilterOptions(enrichedFacts, quotes),
    savedViews: defaultSavedViews(),
    commandCenter,
    salesPerformance: {
      monthlyYoY,
      repSummary,
      branchSummary: production.productionByBranch,
      accountRows: sortRows(allAccounts, filters.sortBy, filters.sortDir),
      accountSummary: accountSummary.topAccounts,
      activeAccountCount: accountSummary.activeAccountCount,
      producedSqftTrend: production.producedSqftTrend
    },
    forecasting: {
      forecastCards: [
        { label: "Forecast value", value: forecast.forecastValue },
        { label: "Forecast sqft", value: forecast.forecastSqft },
        { label: "Events", value: forecast.forecastEventCount }
      ],
      forecastByMonth: forecast.forecastByMonth,
      forecastByRep: forecast.forecastByRep,
      forecastByBranch: buildForecastByBranch(forecasts, quotes),
      quoteForecastRows: enrichForecastRows(forecasts, quotes),
      next30: forecastWindowSummary(forecasts, currentRange.end, 30),
      next60: forecastWindowSummary(forecasts, currentRange.end, 60),
      next90: forecastWindowSummary(forecasts, currentRange.end, 90),
      forecastVsActual: buildForecastVsActual(monthlyYoY, forecast.forecastByMonth),
      riskInsights: buildForecastRiskInsights(forecast, production, quotePipeline)
    },
    quotePipeline: {
      ...quotePipeline,
      quotedNotProducedRows: quotedNotProduced
    },
    productionFlow: {
      ...production,
      productionBySalesperson,
      productionVsForecast: {
        producedSqft: production.producedSqft,
        forecastSqft: forecast.forecastSqft,
        gapSqft: (forecast.forecastSqft || 0) - (production.producedSqft || 0)
      },
      backlogSummary: null,
      capacitySignal: null,
      installSummary: null
    },
    accounts: {
      ...accountSummary,
      quotedNotProduced: quotedNotProduced,
      lowEliteAdoption: allAccounts.filter((a) => (a.eliteShare ?? 100) < 25 && a.currentSqft >= 50).slice(0, 25),
      highOutOfCollection: allAccounts.filter((a) => (a.outShare ?? 0) >= 40 && a.currentSqft >= 50).slice(0, 25)
    },
    colorsMaterials: {
      ...colorMix,
      colorRows: colorAnalytics.colorRows?.slice(0, 100) ?? []
    },
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
    dataQuality: buildDataQualityIssues({
      filteredCurrent,
      priorJobs: filteredPrior,
      accountSummary,
      colorMix,
      colorAnalytics,
      syncHealth,
      dataConfidence,
      worksheet
    }),
    detailPanels: {
      accounts: buildAccountDetailIndex(
        pickAccountsForDetailIndex(allAccounts, filters, 100),
        filteredCurrent,
        quotes,
        forecasts,
        colorAnalytics
      ),
      colors: buildColorDetailIndex(colorAnalytics, filteredCurrent, worksheet.rows || [])
    }
  };
}

function aggregateColorMixFromAnalytics(colorAnalytics, filteredJobs) {
  const totalSqft = colorAnalytics.colorRows.reduce((s, r) => s + r.sqft, 0) || 0;
  const eliteSqft = colorAnalytics.colorRows.filter((r) => r.collectionStatus === "elite100").reduce((s, r) => s + r.sqft, 0);
  const outSqft = colorAnalytics.colorRows.filter((r) => r.collectionStatus === "out_of_collection").reduce((s, r) => s + r.sqft, 0);
  const unknownSqft = Math.max(0, totalSqft - eliteSqft - outSqft);
  const pct = (n) => (totalSqft > 0 ? (n / totalSqft) * 100 : 0);
  const byGroup = new Map();
  const byMfg = new Map();
  for (const r of colorAnalytics.colorRows) {
    if (r.collectionStatus === "elite100" && r.eliteGroup) {
      byGroup.set(r.eliteGroup, (byGroup.get(r.eliteGroup) || 0) + r.sqft);
    }
    const m = r.manufacturer || "Unknown";
    byMfg.set(m, (byMfg.get(m) || 0) + r.sqft);
  }
  return {
    totalSqft,
    eliteSqft,
    outSqft,
    unknownSqft,
    eliteShare: pct(eliteSqft),
    outShare: pct(outSqft),
    unknownShare: pct(unknownSqft),
    eliteGroupBreakdown: [...byGroup.entries()].map(([group, sqftVal]) => ({ group, sqft: sqftVal, share: pct(sqftVal) })).sort((a, b) => b.sqft - a.sqft),
    manufacturerBreakdown: [...byMfg.entries()].map(([manufacturer, sqftVal]) => ({ manufacturer, sqft: sqftVal, share: pct(sqftVal) })).sort((a, b) => b.sqft - a.sqft),
    topEliteColors: colorAnalytics.topEliteColors,
    topOutOfCollectionColors: colorAnalytics.topOutOfCollectionColors,
    unknownColorRows: colorAnalytics.unknownColors
  };
}

function buildProductionBySalesperson(jobs) {
  const byRep = new Map();
  for (const j of jobs) {
    const rep = j.normalizedSalesperson || "Unknown";
    byRep.set(rep, (byRep.get(rep) || 0) + sqft(j));
  }
  return [...byRep.entries()].map(([rep, sqftVal]) => ({ rep, sqft: Math.round(sqftVal * 100) / 100 })).sort((a, b) => b.sqft - a.sqft);
}

function buildForecastByBranch(forecasts, quotes) {
  const byBranch = new Map();
  for (const e of forecasts) {
    const branch = String(e.branch ?? "").trim() || "Unassigned";
    byBranch.set(branch, (byBranch.get(branch) || 0) + (Number(e.forecast_value) || 0));
  }
  return [...byBranch.entries()].map(([branch, value]) => ({ branch, value: Math.round(value) })).sort((a, b) => b.value - a.value);
}

function enrichForecastRows(forecasts, quotes) {
  const quoteById = new Map(quotes.map((q) => [String(q.id), q]));
  return forecasts.slice(0, 100).map((e) => {
    const q = quoteById.get(String(e.quote_id));
    return {
      quoteId: e.quote_id,
      quoteNumber: q?.quote_number ?? null,
      customerName: q?.customer_name ?? null,
      eventType: e.event_type,
      salesRep: e.sales_rep,
      branch: e.branch,
      quoteStatus: q?.quote_status ?? null,
      quoteSource: q?.quote_source ?? null,
      forecastValue: Number(e.forecast_value) || 0,
      quoteValue: Number(e.quote_value) || 0,
      probabilityPercent: Number(e.probability_percent) || 0,
      forecastDate: e.created_at,
      estimatedSqft: Number(q?.estimated_sqft) || 0
    };
  });
}

function buildForecastVsActual(monthlyYoY, forecastByMonth) {
  return monthlyYoY.map((m) => ({
    month: m.month,
    actualSqft: m.currentSqft,
    forecastValue: forecastByMonth.find((f) => f.month === m.month)?.value ?? 0
  }));
}

function buildForecastRiskInsights(forecast, production, quotePipeline) {
  const insights = [];
  if (forecast.forecastSqft > production.producedSqft) {
    insights.push({ severity: "warn", text: "Forecasted sqft exceeds produced sqft for the selected period." });
  }
  if (quotePipeline.openQuoteCount > 0 && production.producedSqft === 0) {
    insights.push({ severity: "info", text: "Open quotes exist but no production sqft in range — verify conversion timing." });
  }
  return insights;
}

function buildKpis(ctx) {
  return [
    { id: "produced_sqft", label: "Produced sqft", value: ctx.currentSqft, format: "sqft" },
    { id: "yoy_sqft", label: "YoY sqft change", value: ctx.yoySqft, format: "sqft", delta: ctx.yoyPct },
    { id: "yoy_pct", label: "YoY %", value: ctx.yoyPct, format: "percent" },
    { id: "elite_share", label: "Elite 100 share", value: ctx.colorMix.eliteShare, format: "percent" },
    { id: "out_share", label: "Out-of-collection", value: ctx.colorMix.outShare, format: "percent" },
    { id: "active_accounts", label: "Active accounts", value: ctx.accountSummary.activeAccountCount, format: "count" },
    { id: "quote_count", label: "Quote volume", value: ctx.quotePipeline.quoteCount, format: "count" },
    { id: "pipeline_value", label: "Pipeline value", value: ctx.quotePipeline.openPipelineValue, format: "currency" },
    { id: "forecast_sqft", label: "Forecasted sqft", value: ctx.forecast.forecastSqft, format: "sqft" },
    { id: "forecast_value", label: "Forecast value", value: ctx.forecast.forecastValue, format: "currency" },
    { id: "booked_production", label: "Booked production", value: ctx.production.producedSqft, format: "sqft" },
    { id: "attention_accounts", label: "Need attention", value: ctx.accountSummary.attentionAccounts.length, format: "count" },
    { id: "sync_freshness", label: "Last sync", value: ctx.syncHealth.lastSyncAt, format: "datetime" },
    { id: "data_confidence", label: "Data confidence", value: ctx.dataConfidence, format: "percent" },
    { id: "unmapped_count", label: "Unmapped rows", value: ctx.unmappedCount, format: "count" }
  ];
}

function buildBentoCards(ctx) {
  return [
    { id: "monthly_yoy", title: "Monthly YoY trend", type: "chart", chartKey: "monthlyYoY", span: "large" },
    { id: "forecast_vs_actual", title: "Forecast vs actual", type: "chart", chartKey: "forecastVsActual", span: "medium" },
    { id: "quote_pipeline", title: "Quote pipeline by status", type: "chart", chartKey: "quoteStatus", span: "medium" },
    { id: "rep_leaderboard", title: "Sales rep leaderboard", type: "table", dataKey: "repSummary", span: "medium" },
    { id: "production_branch", title: "Production by branch", type: "chart", chartKey: "productionBranch", span: "medium" },
    { id: "elite_mix", title: "Elite 100 mix", type: "chart", chartKey: "eliteMix", span: "medium" },
    { id: "manufacturer_mix", title: "Manufacturer mix", type: "chart", chartKey: "manufacturerMix", span: "medium" },
    { id: "top_accounts", title: "Top accounts", type: "table", dataKey: "topAccounts", span: "medium" },
    { id: "decliners", title: "Accounts falling behind", type: "table", dataKey: "decliners", span: "medium" },
    { id: "attention", title: "Accounts to call this week", type: "table", dataKey: "attentionAccounts", span: "large" },
    { id: "top_elite_colors", title: "Top Elite 100 colors", type: "table", dataKey: "topEliteColors", span: "medium" },
    { id: "top_ooc_colors", title: "Top out-of-collection", type: "table", dataKey: "topOutOfCollectionColors", span: "medium" },
    { id: "quote_conversion", title: "Quote-to-production", type: "metric", value: ctx.kpis.find((k) => k.id === "quote_count")?.value, span: "small" },
    { id: "forecast_monthly", title: "Forecasted work by month", type: "chart", chartKey: "forecastMonthly", span: "medium" },
    { id: "data_quality", title: "Data quality issues", type: "table", dataKey: "dataQuality", span: "medium" }
  ];
}

function buildCharts(ctx) {
  return {
    monthlyYoY: ctx.monthlyYoY,
    forecastVsActual: ctx.monthlyYoY.map((m) => ({
      month: m.month,
      actual: m.currentSqft,
      forecast: ctx.forecast.forecastByMonth.find((f) => f.month === m.month)?.value ?? 0
    })),
    quoteStatus: ctx.quotePipeline.quoteStatusSummary,
    productionBranch: ctx.production.productionByBranch,
    eliteMix: ctx.colorMix.eliteGroupBreakdown,
    manufacturerMix: ctx.colorMix.manufacturerBreakdown,
    forecastMonthly: ctx.forecast.forecastByMonth
  };
}

function buildAccountSummary(currentJobs, priorJobs, quotes, accountShareMap) {
  const curMap = new Map();
  const priMap = new Map();

  for (const j of currentJobs) {
    const k = accountKey(j);
    const slot = curMap.get(k) || { account: j.account_name, currentSqft: 0, jobCount: 0, branch: j.branch, normalizedSalesperson: j.normalizedSalesperson, attributionStatus: j.attributionStatus, lastJobDate: "" };
    slot.currentSqft += sqft(j);
    slot.jobCount += 1;
    const d = String(j.reportDate ?? "").slice(0, 10);
    if (d > slot.lastJobDate) slot.lastJobDate = d;
    curMap.set(k, slot);
  }
  for (const j of priorJobs) {
    const k = accountKey(j);
    const slot = priMap.get(k) || { priorSqft: 0, priorJobCount: 0 };
    slot.priorSqft += sqft(j);
    slot.priorJobCount += 1;
    priMap.set(k, slot);
  }

  const quoteCountByAccount = new Map();
  for (const q of quotes) {
    const k = String(q.customer_name ?? "").trim().toLowerCase();
    if (!k) continue;
    quoteCountByAccount.set(k, (quoteCountByAccount.get(k) || 0) + 1);
  }

  const accounts = [];
  const allKeys = new Set([...curMap.keys(), ...priMap.keys()]);
  for (const k of allKeys) {
    const c = curMap.get(k) || { account: k, currentSqft: 0, jobCount: 0 };
    const p = priMap.get(k) || { priorSqft: 0, priorJobCount: 0 };
    const share = accountShareMap?.get(k) || {};
    const merged = {
      account: c.account || k,
      branch: c.branch,
      normalizedSalesperson: c.normalizedSalesperson,
      currentSqft: c.currentSqft || 0,
      priorSqft: p.priorSqft || 0,
      jobCount: c.jobCount || 0,
      lastJobDate: c.lastJobDate || null,
      attributionStatus: c.attributionStatus,
      quoteCount: quoteCountByAccount.get(k) || 0,
      eliteShare: share.eliteShare ?? null,
      outShare: share.outShare ?? null
    };
    Object.assign(merged, scoreAccountFocus(merged));
    accounts.push(merged);
  }

  const topAccounts = [...accounts].sort((a, b) => b.currentSqft - a.currentSqft).slice(0, 25);
  const growthAccounts = [...accounts].filter((a) => a.yoySqft > 0).sort((a, b) => b.yoySqft - a.yoySqft).slice(0, 25);
  const declineAccounts = [...accounts].filter((a) => a.yoySqft < 0).sort((a, b) => a.yoySqft - b.yoySqft).slice(0, 25);
  const attentionAccounts = rankAttentionAccounts(accounts, 25);
  const dormantAccounts = detectDormantAccounts(accounts);

  return {
    activeAccountCount: curMap.size,
    allAccounts: accounts,
    topAccounts,
    growthAccounts,
    declineAccounts,
    attentionAccounts,
    dormantAccounts
  };
}

function buildRepSummary(currentJobs, priorJobs) {
  const cur = new Map();
  const pri = new Map();

  for (const j of currentJobs) {
    const k = j.normalizedSalesperson || "Unknown";
    const slot = cur.get(k) || { salesperson: k, currentSqft: 0, jobCount: 0, accounts: new Map() };
    slot.currentSqft += sqft(j);
    slot.jobCount += 1;
    const ak = accountKey(j);
    slot.accounts.set(ak, (slot.accounts.get(ak) || 0) + sqft(j));
    cur.set(k, slot);
  }
  for (const j of priorJobs) {
    const k = j.normalizedSalesperson || "Unknown";
    const slot = pri.get(k) || { priorSqft: 0 };
    slot.priorSqft += sqft(j);
    pri.set(k, slot);
  }

  const reps = [];
  for (const [k, c] of cur) {
    const p = pri.get(k) || { priorSqft: 0 };
    const yoySqft = c.currentSqft - p.priorSqft;
    const topAccounts = [...c.accounts.entries()]
      .map(([account, sqftVal]) => ({ account, totalSqft: sqftVal }))
      .sort((a, b) => b.totalSqft - a.totalSqft)
      .slice(0, 5);
    reps.push({
      salesperson: k,
      isActiveRep: ACTIVE_SALES_REPS.includes(k),
      currentSqft: c.currentSqft,
      priorSqft: p.priorSqft,
      yoySqft,
      yoyPct: pct(c.currentSqft, p.priorSqft),
      jobCount: c.jobCount,
      accountCount: c.accounts.size,
      topAccounts
    });
  }
  return reps.sort((a, b) => b.currentSqft - a.currentSqft);
}

function buildFilterOptions(enrichedFacts, quotes) {
  const salespeople = new Set();
  const branches = new Set();
  const accounts = new Set();
  const statuses = new Set();
  for (const j of enrichedFacts) {
    if (j.normalizedSalesperson) salespeople.add(j.normalizedSalesperson);
    if (j.branch) branches.add(j.branch);
    if (j.account_name) accounts.add(j.account_name);
    if (j.status_name) statuses.add(j.status_name);
  }
  const quoteStatuses = new Set(quotes.map((q) => q.quote_status).filter(Boolean));
  return {
    salespeople: [...salespeople].sort(),
    branches: [...branches].sort(),
    accounts: [...accounts].sort().slice(0, 200),
    jobStatuses: [...statuses].sort(),
    quoteStatuses: [...quoteStatuses].sort()
  };
}

function defaultSavedViews() {
  return [
    { id: "ytd-default", label: "YTD overview", params: { quickRange: "ytd" } },
    { id: "rolling-30", label: "Last 30 days", params: { quickRange: "rolling_30" } },
    { id: "attention", label: "Needs attention", params: { quickRange: "ytd", behindPriorYearOnly: "1" } },
    { id: "unmapped", label: "Unmapped accounts", params: { quickRange: "ytd", unmappedOnly: "1" } }
  ];
}

function computeDataConfidence({ factsAvailable, syncComplete, unmappedShare, sqftCoverage }) {
  let score = 100;
  if (!factsAvailable) score -= 40;
  if (!syncComplete) score -= 15;
  score -= Math.round(unmappedShare * 30);
  score -= Math.round((1 - sqftCoverage) * 25);
  return Math.max(0, Math.min(100, score));
}

function mapExplorerRow(j) {
  return {
    jobId: j.source_job_id,
    account: j.account_name,
    salesperson: j.normalizedSalesperson,
    morawareSalesperson: j.morawareSalesperson,
    branch: j.branch,
    status: j.status_name,
    sqft: sqft(j),
    reportDate: j.reportDate,
    attributionStatus: j.attributionStatus
  };
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
