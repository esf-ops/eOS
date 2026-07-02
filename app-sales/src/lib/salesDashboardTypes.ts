/** Shared types for GET /api/sales/dashboard */

export type SalesDashboardTab =
  | "command_center"
  | "sales_performance"
  | "forecasting"
  | "quote_pipeline"
  | "production_flow"
  | "accounts"
  | "colors_materials"
  | "data_explorer"
  | "data_quality";

export type QuickRange =
  | "ytd"
  | "this_month"
  | "this_quarter"
  | "rolling_30"
  | "rolling_60"
  | "rolling_90"
  | "custom";

export type DashboardFilters = {
  tab: SalesDashboardTab;
  quickRange: QuickRange;
  start?: string;
  end?: string;
  branch: string;
  salesperson: string;
  assignedRep: string;
  jobSalesperson: string;
  account: string;
  rawAccount: string;
  canonicalAccount: string;
  jobStatus: string;
  quoteStatus: string;
  quoteSource: string;
  forecastStatus: string;
  productionStatus: string;
  collectionStatus: string;
  eliteGroup: string;
  manufacturer: string;
  color: string;
  stone: string;
  roomKeyword: string;
  sqftMin: string;
  sqftMax: string;
  yoyMin: string;
  yoyMax: string;
  eliteShareMin: string;
  eliteShareMax: string;
  outShareMin: string;
  outShareMax: string;
  dormantOnly: boolean;
  behindPriorYearOnly: boolean;
  unmappedOnly: boolean;
  unknownColorsOnly: boolean;
  programSignalOnly: boolean;
  quotedNotProducedOnly: boolean;
  forecastWindow: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  tab: "command_center",
  quickRange: "ytd",
  branch: "",
  salesperson: "",
  assignedRep: "",
  jobSalesperson: "",
  account: "",
  rawAccount: "",
  canonicalAccount: "",
  jobStatus: "",
  quoteStatus: "",
  quoteSource: "",
  forecastStatus: "",
  productionStatus: "",
  collectionStatus: "",
  eliteGroup: "",
  manufacturer: "",
  color: "",
  stone: "",
  roomKeyword: "",
  sqftMin: "",
  sqftMax: "",
  yoyMin: "",
  yoyMax: "",
  eliteShareMin: "",
  eliteShareMax: "",
  outShareMin: "",
  outShareMax: "",
  dormantOnly: false,
  behindPriorYearOnly: false,
  unmappedOnly: false,
  unknownColorsOnly: false,
  programSignalOnly: false,
  quotedNotProducedOnly: false,
  forecastWindow: "",
  sortBy: "total_sqft",
  sortDir: "desc",
  page: 1,
  pageSize: 50
};

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
  eliteShare?: number | null;
  outShare?: number | null;
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

export type FilterChip = {
  key: string;
  label: string;
  clearParam?: string;
};

export type DataQualityIssue = {
  id: string;
  type: string;
  severity: "high" | "medium" | "low";
  title: string;
  count: number;
  sqftImpact: number;
  owner: string;
  suggestedFix: string;
  samples: unknown[];
  navigateTab?: SalesDashboardTab;
  filterPatch?: Partial<DashboardFilters>;
  actionLabel?: string;
};

export type ExecutiveSummary = {
  headline: string;
  highlights: string[];
  risks: string[];
  opportunities: string[];
  caveats: string[];
  suggestedActions: string[];
  copyText: string;
};

export type AccountDetail = {
  account: string;
  canonicalAccountName?: string | null;
  assignedRep?: string | null;
  branch?: string | null;
  currentSqft: number;
  priorSqft: number;
  yoySqft: number;
  yoyPct?: number | null;
  eliteShare?: number | null;
  outShare?: number | null;
  focusScore?: number;
  focusReasons?: string[];
  jobCount?: number;
  quoteCount?: number;
  attributionStatus?: string | null;
  lastJobDate?: string | null;
  forecastCount?: number;
  topColors?: Array<{ color: string; material: string; sqft: number }>;
  recentJobs?: Array<{ jobId: string; reportDate: string; sqft: number; status: string; color?: string | null }>;
  relatedQuotes?: Array<{ id: string; quoteNumber: string; status: string; grandTotal: number }>;
  mappingNotes?: string[];
};

export type ColorDetail = {
  key: string;
  color: string;
  material: string;
  sqft: number;
  priorSqft?: number;
  collectionStatus: string;
  eliteGroup?: string | null;
  manufacturer?: string | null;
  catalogDisplayName?: string | null;
  topAccounts?: Array<{ account: string; sqft: number }>;
  relatedJobs?: Array<{ jobId: string; account: string; sqft: number; reportDate: string; rep?: string }>;
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
    dataConfidenceScore?: number;
    activeFilters?: FilterChip[];
    worksheetFactsAvailable?: boolean;
    unmappedAccountCount?: number;
    unknownColorCount?: number;
    filteredRowCount?: number;
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
    charts?: Record<string, unknown>;
    insights?: SalesDashboardInsight[];
  };
  salesPerformance?: {
    monthlyYoY?: Array<{ month: string; currentSqft: number; priorSqft: number; yoyPct: number | null }>;
    repSummary?: SalesDashboardRepRow[];
    branchSummary?: Array<{ branch: string; sqft: number }>;
    accountRows?: SalesDashboardAccountRow[];
    activeAccountCount?: number;
    producedSqftTrend?: Array<{ month: string; sqft: number }>;
  };
  forecasting?: Record<string, unknown>;
  quotePipeline?: Record<string, unknown>;
  productionFlow?: Record<string, unknown>;
  accounts?: Record<string, unknown>;
  colorsMaterials?: Record<string, unknown>;
  dataQuality?: {
    dataConfidenceScore?: number;
    syncFreshness?: string | null;
    worksheetFactsAvailable?: boolean;
    issueCount?: number;
    issues?: DataQualityIssue[];
  };
  detailPanels?: {
    accounts?: Record<string, AccountDetail>;
    colors?: Record<string, ColorDetail>;
  };
  insightSummaryText?: string;
  executiveSummary?: ExecutiveSummary;
};

export type DashboardDetailResponse = {
  ok: boolean;
  type: "account" | "color";
  id: string;
  detail: AccountDetail | ColorDetail | null;
  meta?: { cacheHit?: boolean; debugTiming?: Record<string, number> };
};

export type DetailSelection =
  | { type: "account"; key: string; label: string }
  | { type: "color"; key: string; label: string }
  | null;
