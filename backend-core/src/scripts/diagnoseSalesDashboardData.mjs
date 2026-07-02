#!/usr/bin/env node
/**
 * Read-only diagnostic for live data backing GET /api/sales/dashboard.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: MORAWARE_DEFAULT_ORGANIZATION_ID or --organization-id=<uuid>
 *
 * Usage:
 *   node backend-core/src/scripts/diagnoseSalesDashboardData.mjs
 *   node backend-core/src/scripts/diagnoseSalesDashboardData.mjs --organization-id=<uuid>
 *   node backend-core/src/scripts/diagnoseSalesDashboardData.mjs --json
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { loadDashboardDataSources, resolveDashboardOrganizationId, partitionJobsByRange } from "../sales/salesDashboardDataSources.js";
import { parseDashboardFilters } from "../sales/salesDashboardFilters.js";
import { buildDashboardInsights, buildExecutiveSummary } from "../sales/salesDashboardInsights.js";
import {
  buildColorAnalyticsFromIntelligenceRows,
  buildSalesIntelligenceBundle,
  finalizeIntelligenceBundle,
  parseFlexibleDashboardDate,
  summarizeIntelligenceJoinDiagnostics,
  topUnmatchedJobsBySqft,
  topWorksheetColorsBySqft
} from "../sales/salesIntelligenceFacts.js";
import { computeDashboardFromIntelligence } from "../sales/salesDashboardMetrics.js";
import { compareColorClassificationImpact } from "../sales/salesColorClassification.js";

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function parseOrgArg() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--organization-id=")) return arg.slice("--organization-id=".length).trim();
  }
  return "";
}

function sqft(job) {
  const n = Number(job?.worksheet_sqft ?? job?.sqft ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function ymdRange(rows, field = "created_at_source", parseFn = (v) => pickStr(v).slice(0, 10)) {
  const dates = rows.map((r) => parseFn(r[field])).filter(Boolean).sort();
  if (!dates.length) return { min: null, max: null };
  return { min: dates[0], max: dates[dates.length - 1] };
}

async function countTable(supabase, table, organizationId) {
  try {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { count, error } = await q;
    if (error) return { count: null, error: error.message };
    return { count: count ?? 0, error: null };
  } catch (e) {
    return { count: null, error: String(e?.message ?? e) };
  }
}

async function countAttributionMappings(supabase) {
  const out = { aliases: null, assignments: null, errors: [] };
  for (const [key, table] of [
    ["aliases", "sales_account_aliases"],
    ["assignments", "sales_account_assignments"]
  ]) {
    try {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) out.errors.push(`${table}: ${error.message}`);
      else out[key] = count ?? 0;
    } catch (e) {
      out.errors.push(`${table}: ${String(e?.message ?? e)}`);
    }
  }
  return out;
}

function summarizeDashboardPayload(body, filters) {
  const accountDetailCount = Object.keys(body.detailPanels?.accounts ?? {}).length;
  const colorDetailCount = Object.keys(body.detailPanels?.colors ?? {}).length;
  const explorerRows = body.dataExplorer?.paginatedRows?.rows?.length ?? 0;
  const jsonSize = JSON.stringify(body).length;

  return {
    tab: filters.tab,
    jsonBytes: jsonSize,
    meta: {
      worksheetFactsAvailable: body.meta?.worksheetFactsAvailable,
      dataConfidenceScore: body.meta?.dataConfidenceScore,
      activeFilterCount: body.meta?.activeFilters?.length ?? 0,
      latestMorawareSync: body.meta?.latestMorawareSync ?? null
    },
    executiveSummaryCopyLen: String(body.executiveSummary?.copyText ?? "").length,
    dataQualityIssuesWithActions: (body.dataQuality?.issues ?? []).filter((i) => i.navigateTab).length,
    bounded: {
      accountDetailPanels: accountDetailCount,
      colorDetailPanels: colorDetailCount,
      dataExplorerPageRows: explorerRows,
      colorRows: body.colorsMaterials?.colorRows?.length ?? 0,
      eliteShare: body.colorsMaterials?.eliteShare,
      classifiedSqft: body.colorsMaterials?.totalSqft
    }
  };
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const supabaseUrl = pickStr(process.env.SUPABASE_URL);
  const serviceKey = pickStr(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const orgArg = parseOrgArg();
  const organizationId =
    orgArg ||
    pickStr(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID) ||
    resolveDashboardOrganizationId({ query: {}, user: {} });

  if (!organizationId) {
    console.error("ERROR: Set MORAWARE_DEFAULT_ORGANIZATION_ID or pass --organization-id=<uuid>.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const sources = await loadDashboardDataSources(supabase, organizationId);
  const { syncHealth, facts, enrichedFacts, worksheet, quotes, forecasts, mappings, activities, calendarRows, colorCatalog } = sources;

  const filtersParsed = parseDashboardFilters({ quickRange: "ytd", tab: "command_center" });
  const intelligenceBundle = finalizeIntelligenceBundle(
    buildSalesIntelligenceBundle({ ...sources, organizationId }),
    filtersParsed
  );

  const jobRange = ymdRange(facts.rows);
  const wsRange = ymdRange(worksheet.rows, "job_creation_date", (v) => parseFlexibleDashboardDate(v) || pickStr(v).slice(0, 10));
  const wsWithColor = worksheet.rows.filter((r) => pickStr(r.color)).length;
  const wsWithStone = worksheet.rows.filter((r) => pickStr(r.stone)).length;
  const wsWithRoom = worksheet.rows.filter((r) => pickStr(r.room)).length;

  const joinDiagnostics = intelligenceBundle.joinDiagnostics;
  const intelligenceRows = intelligenceBundle.worksheetMaterial;
  const { current: currentJobs } = partitionJobsByRange(enrichedFacts, filtersParsed.dateRange, filtersParsed.priorRange);

  const colorAnalytics = buildColorAnalyticsFromIntelligenceRows(
    intelligenceRows,
    filtersParsed.dateRange,
    filtersParsed.priorRange
  );

  const totalCurrentSqft = currentJobs.reduce((s, j) => s + sqft(j), 0);
  const eliteSqft = currentJobs.filter((j) => j.colorCollectionStatus === "elite100").reduce((s, j) => s + sqft(j), 0);
  const unknownSqft = currentJobs.filter((j) => !j.colorCollectionStatus || j.colorCollectionStatus === "unknown").reduce((s, j) => s + sqft(j), 0);
  const missingSp = currentJobs.filter((j) => !j.normalizedSalesperson).length;
  const missingSqft = currentJobs.filter((j) => sqft(j) <= 0).length;

  const unmapped = currentJobs.filter((j) => j.attributionStatus !== "approved_mapped");
  const unmappedByAccount = new Map();
  for (const j of unmapped) {
    const k = pickStr(j.account_name) || "Unknown";
    unmappedByAccount.set(k, (unmappedByAccount.get(k) || 0) + sqft(j));
  }
  const topUnmappedAccounts = [...unmappedByAccount.entries()]
    .map(([account, sqftVal]) => ({ account, sqft: sqftVal }))
    .sort((a, b) => b.sqft - a.sqft)
    .slice(0, 10);

  const topRawColors = topWorksheetColorsBySqft(worksheet.rows, 10);
  const unknownColors = (colorAnalytics.unknownColors ?? []).slice(0, 10);
  const topUnmatched = topUnmatchedJobsBySqft(intelligenceRows, 10);

  const mappingCounts = await countAttributionMappings(supabase);
  const quoteCount = await countTable(supabase, "quote_headers", organizationId);
  const forecastCount = await countTable(supabase, "quote_forecast_events", organizationId);

  const dashboardBody = computeDashboardFromIntelligence(intelligenceBundle, filtersParsed);
  dashboardBody.commandCenter.insights = buildDashboardInsights({
    kpis: {
      currentSqft: dashboardBody.commandCenter.kpis.find((k) => k.id === "produced_sqft")?.value,
      priorSqft: dashboardBody.salesPerformance.monthlyYoY.reduce((s, m) => s + (m.priorSqft || 0), 0) || null,
      yoyPct: dashboardBody.commandCenter.kpis.find((k) => k.id === "yoy_pct")?.value,
      unknownColorShare: dashboardBody.colorsMaterials?.unknownShare
    },
    repSummary: dashboardBody.salesPerformance.repSummary,
    accountSummary: dashboardBody.accounts,
    colorMix: dashboardBody.colorsMaterials,
    quotePipeline: dashboardBody.quotePipeline,
    forecast: dashboardBody.forecasting,
    production: dashboardBody.productionFlow
  });
  dashboardBody.executiveSummary = buildExecutiveSummary({
    kpis: {
      currentSqft: dashboardBody.commandCenter.kpis.find((k) => k.id === "produced_sqft")?.value,
      yoyPct: dashboardBody.commandCenter.kpis.find((k) => k.id === "yoy_pct")?.value,
      unknownColorShare: dashboardBody.colorsMaterials?.unknownShare
    },
    repSummary: dashboardBody.salesPerformance.repSummary,
    accountSummary: dashboardBody.accounts,
    colorMix: dashboardBody.colorsMaterials,
    quotePipeline: dashboardBody.quotePipeline,
    forecast: dashboardBody.forecasting,
    production: dashboardBody.productionFlow
  });

  const payloadSummary = summarizeDashboardPayload(dashboardBody, filtersParsed);

  const colorClassificationComparison = compareColorClassificationImpact(intelligenceRows, colorCatalog);

  const report = {
    organizationId,
    morawareJobFacts: {
      rowCount: facts.rows.length,
      sqftTotal: joinDiagnostics.jobFactSqft,
      available: facts.available,
      importGroupId: facts.importGroupId ?? null,
      dateRange: jobRange,
      warning: facts.warning ?? null
    },
    worksheetFacts: {
      rowCount: worksheet.rows.length,
      sqftTotal: joinDiagnostics.worksheetSqft,
      available: worksheet.available,
      dateRange: wsRange,
      rawDateFormatNote: "job_creation_date is often M/D/YYYY — parsed to ISO for dashboard filters",
      rowsWithColor: wsWithColor,
      rowsWithStone: wsWithStone,
      rowsWithRoom: wsWithRoom,
      usefulForColorAnalytics: wsWithColor > 0 && joinDiagnostics.classifiedWorksheetSqft > 0
    },
    intelligenceJoin: joinDiagnostics,
    sync: {
      lastSyncAt: syncHealth?.lastSyncAt ?? null,
      latestGroupComplete: syncHealth?.latestGroupComplete ?? null,
      latestGroupId: syncHealth?.latestGroupId ?? null
    },
    quotes: { loadedForDashboard: quotes.length, tableCount: quoteCount.count, tableError: quoteCount.error },
    forecasts: {
      loadedForDashboard: intelligenceBundle.forecastFacts.filter((f) => f.status === "included").length,
      tableCount: forecastCount.count,
      tableError: forecastCount.error,
      rowsMissingOrg: intelligenceBundle.forecastFacts.filter((f) => f.status === "excluded_missing_org").length
    },
    productionFlow: dashboardBody.meta.dataCoverage?.productionFlow,
    dataCoverage: dashboardBody.meta.dataCoverage,
    attributionMappings: {
      aliasRows: mappingCounts.aliases,
      assignmentRows: mappingCounts.assignments,
      errors: mappingCounts.errors
    },
    currentPeriodYtd: {
      jobCount: currentJobs.length,
      totalSqft: Math.round(totalCurrentSqft),
      dashboardProducedSqft: dashboardBody.commandCenter.kpis.find((k) => k.id === "produced_sqft")?.value,
      worksheetClassifiedSqft: Math.round(colorAnalytics.colorRows.reduce((s, r) => s + r.sqft, 0)),
      dashboardClassifiedSqft: payloadSummary.bounded.classifiedSqft,
      dashboardEliteSharePct: payloadSummary.bounded.eliteShare,
      elite100SqftPct: pct(eliteSqft, totalCurrentSqft),
      unknownColorSqftPct: pct(unknownSqft, totalCurrentSqft),
      missingSalespersonPct: pct(missingSp, currentJobs.length),
      missingSqftPct: pct(missingSqft, currentJobs.length)
    },
    topRawWorksheetColorsBySqft: topRawColors,
    topUnknownColorsBySqft: unknownColors.map((c) => ({
      color: c.color ?? c.color_name,
      sqft: c.sqft
    })),
    topUnmappedAccountsBySqft: topUnmappedAccounts,
    topUnmatchedWorksheetJobsBySqft: topUnmatched,
    colorClassificationComparison,
    dashboardPayloadSanity: payloadSummary
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\n── eliteOS Sales Dashboard data diagnostic (read-only) ──\n");
  console.log(`Organization: ${organizationId}`);

  console.log("\nMoraware job facts (sales_moraware_job_facts)");
  console.log(`  Rows (latest import group): ${report.morawareJobFacts.rowCount}`);
  console.log(`  Sqft total: ${Math.round(report.morawareJobFacts.sqftTotal).toLocaleString()}`);
  console.log(`  Date range: ${report.morawareJobFacts.dateRange.min ?? "—"} → ${report.morawareJobFacts.dateRange.max ?? "—"}`);
  if (report.morawareJobFacts.warning) console.log(`  Note: ${report.morawareJobFacts.warning}`);

  console.log("\nWorksheet facts (moraware_prepared_sales_worksheet_facts)");
  console.log(`  Rows: ${report.worksheetFacts.rowCount} (available: ${report.worksheetFacts.available})`);
  console.log(`  Sqft total: ${Math.round(report.worksheetFacts.sqftTotal).toLocaleString()}`);
  console.log(`  Date range (parsed ISO): ${report.worksheetFacts.dateRange.min ?? "—"} → ${report.worksheetFacts.dateRange.max ?? "—"}`);
  console.log(`  With color/stone/room: ${report.worksheetFacts.rowsWithColor}/${report.worksheetFacts.rowsWithStone}/${report.worksheetFacts.rowsWithRoom}`);
  console.log(`  ${report.worksheetFacts.rawDateFormatNote}`);

  console.log("\nIntelligence join (worksheet → job facts)");
  console.log(`  Job facts with job_id overlap: ${report.intelligenceJoin.jobIdOverlapCount} distinct ids`);
  console.log(`  Worksheet rows matched by job_id: ${report.intelligenceJoin.worksheetRowsMatchedByJobId}`);
  console.log(`  Worksheet rows matched by fallback: ${report.intelligenceJoin.worksheetRowsMatchedByFallback}`);
  console.log(`  Worksheet sqft matched: ${Math.round(report.intelligenceJoin.worksheetSqftMatched).toLocaleString()}`);
  console.log(`  Worksheet sqft unmatched: ${Math.round(report.intelligenceJoin.worksheetSqftUnmatched).toLocaleString()}`);
  console.log(`  Classified worksheet sqft: ${Math.round(report.intelligenceJoin.classifiedWorksheetSqft).toLocaleString()}`);
  console.log(`  Elite 100 worksheet sqft: ${Math.round(report.intelligenceJoin.elite100WorksheetSqft).toLocaleString()}`);
  console.log(`  Out-of-collection worksheet sqft: ${Math.round(report.intelligenceJoin.outOfCollectionWorksheetSqft).toLocaleString()}`);

  console.log("\nSync health");
  console.log(`  Latest sync: ${report.sync.lastSyncAt ?? "—"}`);
  console.log(`  Latest import group complete: ${report.sync.latestGroupComplete ? "yes" : "no"}`);

  console.log("\nForecast events");
  console.log(`  Table / org-scoped loaded: ${report.forecasts.tableCount ?? "?"} / ${report.forecasts.loadedForDashboard}`);
  console.log(`  Missing organization_id: ${report.forecasts.rowsMissingOrg ?? 0}`);

  console.log("\nProduction flow signals");
  console.log(`  Available: ${(report.productionFlow?.availableSignals ?? []).join(", ") || "—"}`);
  console.log(`  Missing: ${(report.productionFlow?.missingSignals ?? []).join(", ") || "—"}`);

  console.log("\nData coverage caveats");
  for (const c of report.dataCoverage?.caveats ?? []) console.log(`  · ${c}`);
  if (!(report.dataCoverage?.caveats ?? []).length) console.log("  (none)");

  console.log("\nAccount mappings");
  console.log(`  Aliases: ${report.attributionMappings.aliasRows ?? "—"}`);
  console.log(`  Assignments: ${report.attributionMappings.assignmentRows ?? "—"}`);
  for (const err of report.attributionMappings.errors) console.log(`  Warning: ${err}`);

  console.log("\nYTD current-period trust metrics");
  console.log(`  Jobs in range: ${report.currentPeriodYtd.jobCount}`);
  console.log(`  Job-fact sqft (production total source): ${report.currentPeriodYtd.totalSqft.toLocaleString()}`);
  console.log(`  Dashboard produced sqft KPI: ${Math.round(Number(report.currentPeriodYtd.dashboardProducedSqft) || 0).toLocaleString()}`);
  console.log(`  Worksheet classified sqft (color analytics source): ${report.currentPeriodYtd.worksheetClassifiedSqft.toLocaleString()}`);
  console.log(`  Dashboard classified sqft: ${Math.round(Number(report.currentPeriodYtd.dashboardClassifiedSqft) || 0).toLocaleString()}`);
  console.log(`  Dashboard Elite 100 share: ${report.currentPeriodYtd.dashboardEliteSharePct ?? 0}%`);
  console.log(`  Unknown color sqft (job-attached legacy): ${report.currentPeriodYtd.unknownColorSqftPct}%`);
  console.log(`  Missing salesperson: ${report.currentPeriodYtd.missingSalespersonPct}% of jobs`);
  console.log(`  Missing sqft: ${report.currentPeriodYtd.missingSqftPct}% of jobs`);

  console.log("\nTop raw worksheet colors by sqft");
  for (const c of report.topRawWorksheetColorsBySqft) console.log(`  · ${c.color}: ${Math.round(c.sqft).toLocaleString()} sqft`);
  if (!report.topRawWorksheetColorsBySqft.length) console.log("  (none)");

  const cc = report.colorClassificationComparison;
  console.log("\nColor classification (fixture-only → Supabase catalog + normalization)");
  console.log(`  Catalog source: ${cc.catalogSource} (${cc.catalogItemCount} items)`);
  console.log(`  Classified sqft — before: ${Math.round(cc.before.totalSqft).toLocaleString()} → after: ${Math.round(cc.after.totalSqft).toLocaleString()}`);
  console.log(`  Elite 100 sqft — before: ${Math.round(cc.before.eliteSqft).toLocaleString()} (${cc.before.eliteShare.toFixed(2)}%) → after: ${Math.round(cc.after.eliteSqft).toLocaleString()} (${cc.after.eliteShare.toFixed(2)}%)`);
  console.log(`  Unknown sqft — before: ${Math.round(cc.before.unknownSqft).toLocaleString()} (${cc.before.unknownShare.toFixed(2)}%) → after: ${Math.round(cc.after.unknownSqft).toLocaleString()} (${cc.after.unknownShare.toFixed(2)}%)`);
  console.log(`  Out-of-collection sqft — before: ${Math.round(cc.before.outSqft).toLocaleString()} → after: ${Math.round(cc.after.outSqft).toLocaleString()}`);
  console.log("\n  Top newly matched colors (fixture-only → Elite 100):");
  for (const c of cc.topNewlyMatchedColors.slice(0, 10)) {
    console.log(`    · ${c.color}${c.stone ? ` / ${c.stone}` : ""}: ${Math.round(c.sqft).toLocaleString()} sqft (${c.match_reason})`);
  }
  if (!cc.topNewlyMatchedColors.length) console.log("    (none)");
  console.log("\n  Top still-unmatched colors:");
  for (const c of cc.topStillUnmatchedColors.slice(0, 10)) {
    console.log(`    · ${c.color}${c.stone ? ` / ${c.stone}` : ""}: ${Math.round(c.sqft).toLocaleString()} sqft (${c.match_reason})`);
  }
  if (!cc.topStillUnmatchedColors.length) console.log("    (none)");
  console.log("\n  Matches by reason/confidence (after, by sqft):");
  for (const r of cc.matchesByReasonAfter.slice(0, 10)) {
    console.log(`    · ${r.reason}: ${Math.round(r.sqft).toLocaleString()} sqft`);
  }

  console.log("\nTop unknown colors by sqft (YTD classified)");
  for (const c of report.topUnknownColorsBySqft) console.log(`  · ${c.color}: ${Math.round(c.sqft).toLocaleString()} sqft`);
  if (!report.topUnknownColorsBySqft.length) console.log("  (none in current YTD window)");

  console.log("\nTop unmatched worksheet jobs/accounts by sqft");
  for (const a of report.topUnmatchedWorksheetJobsBySqft) {
    console.log(`  · ${a.account ?? "—"} / ${a.jobName ?? a.jobId ?? "—"}: ${Math.round(a.sqft).toLocaleString()} sqft`);
  }
  if (!report.topUnmatchedWorksheetJobsBySqft.length) console.log("  (none)");

  console.log("\nTop unmapped accounts by sqft");
  for (const a of report.topUnmappedAccountsBySqft) console.log(`  · ${a.account}: ${Math.round(a.sqft).toLocaleString()} sqft`);
  if (!report.topUnmappedAccountsBySqft.length) console.log("  (none in current YTD window)");

  console.log("\nDashboard API payload sanity (YTD command_center)");
  console.log(`  JSON size: ${(report.dashboardPayloadSanity.jsonBytes / 1024).toFixed(1)} KB`);
  console.log(`  worksheetFactsAvailable meta: ${report.dashboardPayloadSanity.meta.worksheetFactsAvailable}`);
  console.log(`  colorRows in payload: ${report.dashboardPayloadSanity.bounded.colorRows}`);
  console.log(`  eliteShare in payload: ${report.dashboardPayloadSanity.bounded.eliteShare ?? 0}%`);
  console.log(`  executiveSummary.copyText length: ${report.dashboardPayloadSanity.executiveSummaryCopyLen}`);
  console.log(`  dataQuality issues with navigateTab: ${report.dashboardPayloadSanity.dataQualityIssuesWithActions}/${dashboardBody.dataQuality?.issueCount ?? 0}`);
  console.log(`  detailPanels accounts/colors: ${report.dashboardPayloadSanity.bounded.accountDetailPanels}/${report.dashboardPayloadSanity.bounded.colorDetailPanels}`);
  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error("Diagnostic failed:", e?.message ?? e);
  process.exit(1);
});
