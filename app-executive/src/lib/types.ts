export type MeResponse = {
  ok: true;
  user: {
    id: string;
    email: string;
    role: string;
    fullName: string;
    department: string;
  };
};

export type ExecutiveSummary = {
  ok?: boolean;
  year: number;
  latestSyncStatus: string | null;
  latestSyncFinishedAt: string | null;
  totalJobs: number;
  totalSqft: number;
  avgSqftPerJob: number;
  jobsWithSqft: number;
  jobsMissingSqft: number;
  totalForms: number;
  totalFields: number;
  unresolvedFailedJobCount: number;
  healthColor?: string;
};

export type SalespersonRow = {
  salesperson_name: string;
  jobs: number;
  worksheet_sqft: number;
  avg_sqft_per_job: number;
  first_job_date: string | null;
  latest_job_date: string | null;
};

export type AccountRow = {
  account_id: string;
  account_name: string;
  jobs: number;
  worksheet_sqft: number;
  avg_sqft_per_job: number;
  salesperson_names: string[];
};

export type ProductionFlow = {
  ok?: boolean;
  year: number;
  activityRowCount?: number;
  categories: { category: string; count: number }[];
  message?: string;
};

export type TitanSignals = {
  ok?: boolean;
  year: number;
  counts: Record<string, number>;
  topRiskJobs: Array<{
    job_id: string;
    job_name: string;
    account_name: string;
    salesperson_name: string;
    worksheet_sqft: number;
    has_slab_signal: boolean;
    has_change_signal: boolean;
    has_remake_signal: boolean;
    has_customer_service_signal: boolean;
  }>;
  message?: string;
};

export type FieldTrends = {
  ok?: boolean;
  year: number;
  trends: Record<string, Array<{ value: string; count: number }>>;
};

export type MonthlyTrendMonth = {
  month: string;
  monthLabel: string;
  jobs: number;
  worksheet_sqft: number;
  prior_jobs: number | null;
  prior_worksheet_sqft: number | null;
  sqft_delta: number | null;
  sqft_delta_pct: number | null;
};

export type MonthlyTrendResponse = {
  ok: boolean;
  year: number;
  priorYear: number;
  priorYearAvailable: boolean;
  months: MonthlyTrendMonth[];
};

export type SyncHealth = {
  ok?: boolean;
  latestSyncRun: Record<string, unknown> | null;
  lastSuccessSyncRun?: Record<string, unknown> | null;
  currentLock: Record<string, unknown> | null;
  lockExpired: boolean | null;
  unresolvedFailedJobCount: number;
  latestWorksheetSqft?: number | null;
  latestSyncStatus?: string | null;
};
