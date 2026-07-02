/**
 * Slice dashboard API payloads by request mode to keep initial loads small.
 */

const OVERVIEW_REP_LIMIT = 15;
const OVERVIEW_COLOR_LIMIT = 25;
const OVERVIEW_ACCOUNT_LIMIT = 25;
const OVERVIEW_FORECAST_ROWS = 50;

/**
 * @param {object} full
 * @param {{ mode?: string, tab?: string, includeDetails?: boolean }} options
 */
export function sliceDashboardPayload(full, options = {}) {
  const mode = options.mode ?? "overview";
  const tab = options.tab ?? full?.meta?.tab ?? "command_center";
  const includeDetails = Boolean(options.includeDetails);

  if (mode === "full" && includeDetails) return full;

  const base = {
    meta: {
      ...full.meta,
      payloadMode: mode,
      payloadTab: tab,
      detailPanelsDeferred: !includeDetails
    },
    filterOptions: full.filterOptions,
    savedViews: full.savedViews,
    metrics: full.metrics,
    insightSummaryText: full.insightSummaryText,
    executiveSummary: full.executiveSummary
  };

  if (mode === "tab") {
    return sliceTabPayload(full, base, tab, includeDetails);
  }

  return sliceOverviewPayload(full, base, includeDetails);
}

function sliceOverviewPayload(full, base, includeDetails) {
  const repSummary = (full.salesPerformance?.repSummary ?? []).slice(0, OVERVIEW_REP_LIMIT);
  const colorRows = (full.colorsMaterials?.colorRows ?? []).slice(0, OVERVIEW_COLOR_LIMIT);

  const out = {
    ...base,
    commandCenter: full.commandCenter,
    salesPerformance: {
      monthlyYoY: full.salesPerformance?.monthlyYoY ?? [],
      repSummary,
      branchSummary: (full.salesPerformance?.branchSummary ?? []).slice(0, 15),
      accountSummary: (full.salesPerformance?.accountSummary ?? []).slice(0, OVERVIEW_ACCOUNT_LIMIT),
      activeAccountCount: full.salesPerformance?.activeAccountCount ?? 0,
      producedSqftTrend: full.salesPerformance?.producedSqftTrend ?? []
    },
    forecasting: {
      forecastCards: full.forecasting?.forecastCards ?? [],
      forecastByMonth: full.forecasting?.forecastByMonth ?? [],
      next30: full.forecasting?.next30 ?? null,
      next60: full.forecasting?.next60 ?? null,
      next90: full.forecasting?.next90 ?? null,
      riskInsights: full.forecasting?.riskInsights ?? []
    },
    quotePipeline: {
      quoteCount: full.quotePipeline?.quoteCount ?? 0,
      openQuoteCount: full.quotePipeline?.openQuoteCount ?? 0,
      openPipelineValue: full.quotePipeline?.openPipelineValue ?? 0,
      quoteStatusSummary: full.quotePipeline?.quoteStatusSummary ?? [],
      quotedNotProducedCount: full.quotePipeline?.quotedNotProducedRows?.length ?? 0
    },
    productionFlow: {
      producedSqft: full.productionFlow?.producedSqft ?? 0,
      productionByBranch: (full.productionFlow?.productionByBranch ?? []).slice(0, 15),
      availableSignals: full.productionFlow?.availableSignals ?? [],
      missingSignals: full.productionFlow?.missingSignals ?? [],
      backlogSummary: full.productionFlow?.backlogSummary ?? null,
      capacitySignal: full.productionFlow?.capacitySignal ?? null
    },
    accounts: {
      topAccounts: (full.accounts?.topAccounts ?? []).slice(0, OVERVIEW_ACCOUNT_LIMIT),
      attentionAccounts: (full.accounts?.attentionAccounts ?? []).slice(0, 15),
      dormantAccounts: (full.accounts?.dormantAccounts ?? []).slice(0, 10),
      activeAccountCount: full.accounts?.activeAccountCount ?? 0
    },
    colorsMaterials: {
      totalSqft: full.colorsMaterials?.totalSqft ?? null,
      eliteSqft: full.colorsMaterials?.eliteSqft ?? null,
      outSqft: full.colorsMaterials?.outSqft ?? null,
      unknownSqft: full.colorsMaterials?.unknownSqft ?? null,
      eliteShare: full.colorsMaterials?.eliteShare ?? null,
      outShare: full.colorsMaterials?.outShare ?? null,
      unknownShare: full.colorsMaterials?.unknownShare ?? null,
      eliteGroupBreakdown: (full.colorsMaterials?.eliteGroupBreakdown ?? []).slice(0, 12),
      manufacturerBreakdown: (full.colorsMaterials?.manufacturerBreakdown ?? []).slice(0, 12),
      topEliteColors: (full.colorsMaterials?.topEliteColors ?? []).slice(0, OVERVIEW_COLOR_LIMIT),
      colorRows
    },
    dataQuality: {
      dataConfidenceScore: full.dataQuality?.dataConfidenceScore ?? null,
      syncFreshness: full.dataQuality?.syncFreshness ?? null,
      worksheetFactsAvailable: full.dataQuality?.worksheetFactsAvailable ?? false,
      issueCount: full.dataQuality?.issueCount ?? 0,
      issues: (full.dataQuality?.issues ?? []).slice(0, 8)
    }
  };

  if (includeDetails) {
    out.detailPanels = full.detailPanels ?? { accounts: {}, colors: {} };
  } else {
    out.detailPanels = { accounts: {}, colors: {} };
  }

  return out;
}

function sliceTabPayload(full, base, tab, includeDetails) {
  const out = { ...base, detailPanels: { accounts: {}, colors: {} } };

  switch (tab) {
    case "sales_performance":
      out.salesPerformance = full.salesPerformance;
      out.commandCenter = { kpis: full.commandCenter?.kpis ?? [], charts: { monthlyYoY: full.commandCenter?.charts?.monthlyYoY ?? [] } };
      break;
    case "forecasting":
      out.forecasting = {
        ...full.forecasting,
        quoteForecastRows: (full.forecasting?.quoteForecastRows ?? []).slice(0, OVERVIEW_FORECAST_ROWS)
      };
      break;
    case "quote_pipeline":
      out.quotePipeline = full.quotePipeline;
      break;
    case "production_flow":
      out.productionFlow = full.productionFlow;
      break;
    case "accounts":
      out.accounts = full.accounts;
      out.salesPerformance = { accountRows: full.salesPerformance?.accountRows ?? [] };
      break;
    case "colors_materials":
      out.colorsMaterials = full.colorsMaterials;
      break;
    case "data_explorer":
      out.dataExplorer = full.dataExplorer;
      break;
    case "data_quality":
      out.dataQuality = full.dataQuality;
      break;
    case "command_center":
    default:
      return sliceOverviewPayload(full, base, includeDetails);
  }

  if (includeDetails) out.detailPanels = full.detailPanels ?? { accounts: {}, colors: {} };
  return out;
}
