export type MeUser = {
  id: string;
  email: string;
  role: string;
  full_name?: string;
  department?: string;
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
