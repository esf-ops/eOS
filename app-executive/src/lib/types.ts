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

export type TitansTodayJob = {
  jobId: string;
  jobName: string;
  account: string;
  materialColor: string | null;
  squareFootage: number | null;
  status: string;
  /** Brain-side Moraware activity grouping — heuristic, not a validated physical shop map. */
  activityGroupKey?: string;
  activityGroupLabel?: string;
  rawActivityType: string | null;
  rawActivityStatus: string | null;
  lastPhaseUpdate: string | null;
  signals: {
    hasSlabSignal: boolean;
    hasChangeSignal: boolean;
    hasRemakeSignal: boolean;
    hasCustomerServiceSignal: boolean;
    hasRepairSignal: boolean;
  };
};

export type TitansSyncFreshness = {
  lastBrainSyncAt?: string | null;
  ageSeconds?: number | null;
  freshnessLabel?: string | null;
};

export type TitansPace = {
  completedJobCount?: number | null;
  completedSqft?: number | null;
  averageMinutesBetweenCompletions?: number | null;
  longestGapMinutes?: number | null;
  firstCompletionAt?: string | null;
  lastCompletionAt?: string | null;
  completedSqftPerHour?: number | null;
};

export type TitansShopBreakdown = {
  shopKey?: string;
  shopName?: string;
  activeJobs?: number;
  completedToday?: number;
  heldOrNeedsReview?: number;
  totalSqftToday?: number;
  averageMinutesBetweenCompletions?: number | null;
  jobs?: TitansTodayJob[];
};

/** Present only when `GET /api/titans/today?debug=1` — no secrets, no raw_xml. */
export type TitansTodayDebug = {
  selectedDate?: string;
  candidateActivityCount?: number;
  candidateJobCount?: number;
  filterKeywordsUsed?: Array<{ slug: string; regexSource: string; regexFlags: string }>;
  rawActivityTypesSeen?: string[];
  rawStatusesSeen?: string[];
  activityGroupCounts?: Record<string, number>;
  timestampFieldsUsed?: string[];
  omittedReasonCounts?: Record<string, number>;
  brainSyncRowUsed?: {
    id?: string | null;
    mode?: string | null;
    status?: string | null;
    finished_at?: string | null;
    started_at?: string | null;
    ingest_operational?: boolean;
  } | null;
  syncFreshnessPickReason?: string;
  sampleCandidates?: Array<{
    jobId: string;
    activityType: string;
    activityStatus: string;
    phaseName?: string | null;
    startDate?: string | null;
    keywordSlugsMatched: string[];
  }>;
};

export type SawPolishChecklistJob = {
  activityRowId?: string | null;
  jobId: string;
  jobName: string;
  account: string;
  city?: string | null;
  activityType: string;
  status: string;
  phaseName?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  duration?: string | null;
  notesPreview?: string | null;
  hasNotes?: boolean;
  descriptionPreview?: string | null;
  hasDescription?: boolean;
  checklistState: "complete" | "needs_review" | "machine_unresolved";
  machineColumnLabel?: string;
  machineAssignmentUnresolved?: boolean;
};

export type SawPolishChecklist = {
  label: string;
  machineAssignmentStatus: string;
  machineAssignmentNote: string;
  date?: string;
  sourceFieldsUsed?: string[];
  jobs: SawPolishChecklistJob[];
  stats?: {
    totalSawPolish: number;
    complete: number;
    needsReview: number;
    machineUnresolved: number;
    missingStatus: number;
    missingScheduledTime: number;
    missingMachineAssignment: number;
  };
  developerDebug?: {
    machineAssignmentStatus?: string;
    sourceFieldsUsed?: string[];
    totalSawPolishRows?: number;
    missingStatusCount?: number;
    missingScheduledTimeCount?: number;
    missingMachineAssignmentCount?: number;
    checklistStateCounts?: Record<string, number>;
  };
};

export type TitansTodayResponse = {
  ok: boolean;
  label?: string;
  source?: string;
  lastUpdated?: string;
  localDate?: string;
  activeTitanJobs?: number;
  completedToday?: number;
  heldOrNeedsReview?: number;
  totalSqftToday?: number;
  averageCompletionPace?: number | null;
  syncFreshness?: TitansSyncFreshness;
  recommendedSyncCadence?: string;
  pace?: TitansPace;
  shops?: TitansShopBreakdown[];
  jobs?: TitansTodayJob[];
  sawPolishChecklist?: SawPolishChecklist;
  emptyStateMessage?: string | null;
  notes?: string[];
  debug?: TitansTodayDebug;
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
