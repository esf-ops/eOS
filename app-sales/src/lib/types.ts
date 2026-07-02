export type MeUser = {
  id: string;
  email: string;
  role: string;
  full_name?: string;
  department?: string;
  /** Optional human-facing title from /api/me; preferred for the topbar chip subtitle. */
  job_title?: string | null;
};

export type MeResp = { ok: boolean; user: MeUser };

export type CompareMode = "none" | "previous_period" | "previous_year";

export type SalesSummary = {
  ok: boolean;
  range: string;
  startDate: string;
  endDate: string;
  compare: CompareMode;
  metrics: {
    totalSqft: number;
    totalJobs: number;
    totalAccounts: number;
    totalSalespeople: number;
    avgSqftPerJob: number;
    totalRevenue: number | null;
    avgRevenuePerJob: number | null;
    avgRevenuePerSqft: number | null;
  };
  comparison: {
    previousTotalSqft: number | null;
    previousTotalJobs: number | null;
    previousRevenue: number | null;
    sqftDeltaPct: number | null;
    jobsDeltaPct: number | null;
    revenueDeltaPct: number | null;
  };
  dataNotes: string[];
};

export type TrendPoint = {
  period: string;
  totalSqft: number;
  jobCount: number;
  accountCount: number;
};

export type TrendResponse = {
  ok: boolean;
  range: string;
  startDate: string;
  endDate: string;
  compare: CompareMode;
  interval: string;
  series: TrendPoint[];
  comparisonSeries: TrendPoint[] | null;
  totalRevenueAvailable: boolean;
  dataNotes: string[];
};

export type SalespersonPerfRow = {
  salesperson: string;
  totalSqft: number;
  jobCount: number;
  accountCount: number;
  avgSqftPerJob: number;
  totalRevenue: number | null;
  avgRevenuePerJob: number | null;
  topAccounts: Array<{ account: string; totalSqft: number }>;
  trendVsCompare: {
    sqftDeltaPct: number | null;
    jobsDeltaPct: number | null;
    revenueDeltaPct: number | null;
  };
};

export type AccountPerfRow = {
  account: string;
  salesperson: string;
  totalSqft: number;
  jobCount: number;
  avgSqftPerJob: number;
  totalRevenue: number | null;
  firstJobDate: string | null;
  lastJobDate: string | null;
  cityPrimary: string | null;
  cityCounts: Record<string, number>;
  trendVsCompare: {
    sqftDeltaPct: number | null;
    jobsDeltaPct: number | null;
    revenueDeltaPct: number | null;
  };
  dormancyFlag: boolean;
};

export type JobRow = {
  jobId: string;
  jobName: string;
  account: string;
  salesperson: string;
  creationDate: string | null;
  status: string;
  process: string;
  materialColor: string | null;
  city: string | null;
  sqft: number;
  revenue: number | null;
  phaseSummary: string | null;
  missingInfoFlags: string[];
};

export type JobsResponse = {
  ok: boolean;
  total: number;
  limit: number;
  offset: number;
  sortBy: string;
  sortDir: string;
  rows: JobRow[];
  dataNotes: string[];
};

export type FiltersResponse = {
  ok: boolean;
  note?: string;
  salespeople: string[];
  accounts: string[];
  statuses: string[];
  processes: string[];
  materialColors: string[];
  cities: string[];
  dateBounds: { minCreationDate: string | null; maxCreationDate: string | null };
  revenueBounds: { available: boolean };
  branches?: string[];
  activeSalesReps?: string[];
  attributionSalespersonOptions?: string[];
  salespersonClassOptions?: Array<{ value: string; label: string }>;
  performancePeriodModes?: Array<{ value: string; label: string }>;
};

export type PerformanceIntelligenceExecutive = {
  currentSqft: number;
  priorSqft: number;
  netYoYChange: number;
  yoyPct: number | null;
  activeAccounts: number;
  jobCount: number;
  avgSqftPerJob: number;
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
  latestProductionDate: string | null;
  dataNotes: string[];
};

export type PerformanceIntelligenceResponse = {
  ok: boolean;
  periodMode: string;
  executiveSnapshot: PerformanceIntelligenceExecutive;
  monthlyYoY: {
    currentYear: number;
    priorYear: number;
    months: Array<{
      month: number;
      monthLabel: string;
      currentYearSqft: number;
      priorYearSqft: number;
      yoySqft: number;
      yoyPct: number | null;
      jobCountCurrent: number;
      jobCountPrior: number;
    }>;
  };
  volumeByLocationRep: Array<Record<string, unknown>>;
  repSummary: Array<Record<string, unknown>>;
  accountYoy: Array<Record<string, unknown>>;
  topCustomers: Array<Record<string, unknown>>;
  biggestYoYGrowers: Array<Record<string, unknown>>;
  largestYoYDeclines: Array<Record<string, unknown>>;
  focusAccounts: Array<Record<string, unknown>>;
  assignedAccountsView: {
    selectedSalesperson: string | null;
    assignedAccounts: Array<Record<string, unknown>>;
    focusAccountsForSelection: Array<Record<string, unknown>>;
  };
  classificationPanel: {
    title: string;
    appliedAccountRules: string[];
    disclaimer: string;
    methodTable: Array<{
      classificationMethod: string;
      classificationMethodLabel: string;
      volume: number;
      share: number;
      accountCount: number;
      jobCount: number;
    }>;
    mappedVolumePct: number | null;
    unmappedVolumePct: number | null;
    unknownSalespersonJobCount: number;
    unknownBranchJobCount: number;
  };
  activeSalesReps: string[];
  branches: string[];
  legacyQueryForJobs: { range: string; start: string; end: string; compare: string };
  dataNotes: string[];
  debug?: Record<string, unknown>;
};

// ── Sales Dashboard bento summary (Phase 1) ────────────────────────────────
// Mirrors GET /api/sales-dashboard/summary (quote_headers only; no Moraware
// branch/rep attribution in Phase 1).

export type SalesDashboardRangeKey = "ytd" | "rolling_30" | "this_month" | "this_week";

export type SalesDashboardSummaryMetrics = {
  open_pipeline_value: number;
  won_value: number;
  active_quote_count: number;
  total_quote_count: number;
  win_rate_pct: number;
  average_quote_value: number;
  new_quotes_today: number;
  new_quotes_this_week: number;
};

export type SalesDashboardOutcome = {
  label: string;
  value: number;
  count: number;
};

export type SalesDashboardActivity = {
  new_today: number;
  new_this_week: number;
  follow_up_queue: number;
  monday_handoff_needed: number;
  average_quote_value: number;
};

export type SalesDashboardRecentQuote = {
  id: string | null;
  quote_number: string | null;
  customer: string | null;
  project: string | null;
  salesperson: string | null;
  branch: string | null;
  value: number;
  status: string | null;
  created_at: string | null;
};

export type SalesDashboardTrendPoint = {
  period: string;
  period_start: string;
  quoted_value: number;
  won_value: number;
  quote_count: number;
};

export type SalesDashboardSummary = {
  ok: boolean;
  generated_at: string;
  range: {
    key: SalesDashboardRangeKey;
    start_date: string;
    end_date: string;
  };
  filters_applied: {
    branch: string | null;
    salesperson: string | null;
  };
  summary: SalesDashboardSummaryMetrics;
  estimate_outcomes: SalesDashboardOutcome[];
  quote_activity: SalesDashboardActivity;
  recent_quotes: SalesDashboardRecentQuote[];
  trend: SalesDashboardTrendPoint[];
  trust_notes: string[];
};

export type JobAttribution = {
  morawareSalesperson: string;
  normalizedSalesperson: string;
  branch: string;
  salespersonClass: string;
  classificationMethod: string;
  classificationConfidence: string;
  classificationNote: string;
};

export type JobRowWithAttribution = JobRow & { attribution?: JobAttribution };

// ── Ask Sales Data / Moraware query explorer ───────────────────────────────

export type SalesMorawareQueryFilters = {
  date_from?: string | null;
  date_to?: string | null;
  account?: string | null;
  salesperson?: string | null;
  text?: string | null;
  tags?: string[];
  min_sqft?: number | null;
  max_sqft?: number | null;
  missing_sqft?: boolean;
  limit?: number;
};

export type SalesMorawareQueryFilterChip = {
  key: string;
  label: string;
};

export type SalesMorawareQuerySummary = {
  job_count: number;
  jobs_with_sqft: number;
  total_sqft: number;
  avg_sqft_per_job: number;
  missing_sqft_count: number;
};

export type SalesMorawareQueryTopAccount = {
  account: string;
  job_count: number;
  total_sqft: number;
};

export type SalesMorawareQueryTopSalesperson = {
  salesperson: string;
  job_count: number;
  total_sqft: number;
};

export type SalesMorawareQueryTagBreakdown = {
  tag: string;
  label: string;
  job_count: number;
};

export type SalesMorawareQueryRow = {
  job_id: string | null;
  job_name: string | null;
  account: string | null;
  salesperson: string | null;
  date: string | null;
  worksheet_sqft: number | null;
  sqft_found: boolean;
  matched_tags: string[];
  match_reason: string | null;
  notes_excerpt: string | null;
};

export type SalesMorawareQueryMeta = {
  extraction_status?: string;
  sync_note?: string | null;
  fallback_used?: boolean;
  used_import_group_id?: string | null;
  latest_import_group_id?: string | null;
  latest_import_group_complete?: boolean | null;
  facts_rows_loaded?: number;
};

export type SalesMorawareQuerySuccess = {
  ok: true;
  source: "moraware";
  query?: string | null;
  summary: SalesMorawareQuerySummary;
  filters_applied: SalesMorawareQueryFilterChip[];
  top_accounts: SalesMorawareQueryTopAccount[];
  top_salespeople: SalesMorawareQueryTopSalesperson[];
  tag_breakdown: SalesMorawareQueryTagBreakdown[];
  total_count: number;
  rows: SalesMorawareQueryRow[];
  meta?: SalesMorawareQueryMeta;
};

export type SalesMorawareQueryUnavailable = {
  ok: false;
  source: "moraware";
  unavailable: true;
  message: string;
};

export type SalesMorawareQueryResponse = SalesMorawareQuerySuccess | SalesMorawareQueryUnavailable;

/** GET /api/sales/dashboard — Sales Command Center */
export type SalesDashboardKpi = {
  id: string;
  label: string;
  value: number | string | null;
  format?: "sqft" | "currency" | "percent" | "count" | "datetime";
  delta?: number | null;
};

export type SalesDashboardInsight = {
  id: string;
  severity: "positive" | "warn" | "info";
  text: string;
};

export type SalesDashboardAccountRow = {
  account: string;
  branch?: string;
  normalizedSalesperson?: string;
  currentSqft: number;
  priorSqft: number;
  yoySqft?: number;
  yoyPct?: number | null;
  focusScore?: number;
  focusReasons?: string[];
  jobCount?: number;
  lastJobDate?: string | null;
  attributionStatus?: string;
  quoteCount?: number;
};

export type SalesDashboardRepRow = {
  salesperson: string;
  isActiveRep?: boolean;
  currentSqft: number;
  priorSqft: number;
  yoySqft: number;
  yoyPct: number | null;
  jobCount: number;
  accountCount: number;
  topAccounts?: Array<{ account: string; totalSqft: number }>;
};

export type SalesDashboardResponse = {
  ok: boolean;
  organization_id?: string;
  meta?: {
    tab?: string;
    currentDateRange?: { start: string; end: string; quickRange?: string };
    priorYearComparisonRange?: { start: string; end: string };
    latestMorawareSync?: string | null;
    latestQuoteSave?: string | null;
    latestProductionUpdate?: string | null;
    rowCount?: number;
    filteredRowCount?: number;
    unmappedAccountCount?: number;
    unknownColorCount?: number;
    dataConfidenceScore?: number;
  };
  filterOptions?: {
    salespeople?: string[];
    branches?: string[];
    accounts?: string[];
    jobStatuses?: string[];
    quoteStatuses?: string[];
  };
  savedViews?: Array<{ id: string; label: string; params: Record<string, string> }>;
  commandCenter?: {
    kpis?: SalesDashboardKpi[];
    bentoCards?: Array<{ id: string; title: string; type: string; span?: string }>;
    charts?: Record<string, unknown>;
    insights?: SalesDashboardInsight[];
  };
  salesPerformance?: {
    monthlyYoY?: Array<{ month: string; currentSqft: number; priorSqft: number; yoySqft: number; yoyPct: number | null }>;
    repSummary?: SalesDashboardRepRow[];
    branchSummary?: Array<{ branch: string; sqft: number }>;
    accountSummary?: SalesDashboardAccountRow[];
  };
  forecasting?: {
    forecastCards?: Array<{ label: string; value: number }>;
    forecastByMonth?: Array<{ month: string; value: number }>;
    forecastByRep?: Array<{ rep: string; value: number }>;
    quoteForecastRows?: unknown[];
    next30?: { days: number; forecastValue: number; forecastSqft: number };
  };
  quotePipeline?: {
    quoteCount?: number;
    openQuoteCount?: number;
    openPipelineValue?: number;
    quoteStatusSummary?: Array<{ status: string; count: number }>;
    quotedNotProducedRows?: Array<{ account: string; quoteCount: number; quoteValue: number }>;
  };
  productionFlow?: {
    producedSqft?: number;
    jobCount?: number;
    producedSqftTrend?: Array<{ month: string; sqft: number }>;
    productionByBranch?: Array<{ branch: string; sqft: number }>;
  };
  accounts?: {
    activeAccountCount?: number;
    topAccounts?: SalesDashboardAccountRow[];
    attentionAccounts?: SalesDashboardAccountRow[];
    dormantAccounts?: SalesDashboardAccountRow[];
    growthAccounts?: SalesDashboardAccountRow[];
    declineAccounts?: SalesDashboardAccountRow[];
  };
  colorsMaterials?: {
    eliteShare?: number;
    outShare?: number;
    unknownShare?: number;
    eliteGroupBreakdown?: Array<{ group: string; sqft: number; share: number }>;
    manufacturerBreakdown?: Array<{ manufacturer: string; sqft: number; share: number }>;
    topOutOfCollectionColors?: Array<{ color: string; material: string; sqft: number }>;
    unknownColorRows?: Array<{ color: string; sqft: number }>;
  };
  dataExplorer?: {
    paginatedRows?: { total: number; page: number; pageSize: number; rows: unknown[] };
  };
  dataQuality?: Record<string, unknown>;
  insightSummaryText?: string;
};

