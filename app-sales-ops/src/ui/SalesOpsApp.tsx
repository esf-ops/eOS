import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import EliteosTopbar from "../../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../../shared/eliteos-ui/EliteosTopbar";
import { apiGet, apiPatch, apiPost, apiPut, ApiError } from "../lib/api";
import { accountListScopeCopy } from "../lib/accountListScopeCopy.mjs";
import { salespersonDisplayName } from "../lib/salespersonLabel";
import { getSupabase } from "../lib/supabase";
import PlanAdmin from "./PlanAdmin";
import IdentityReview from "./IdentityReview";
import BaselineGap from "./BaselineGap";
import PlanExperience, { type BookIntelligence, type PlanBundle as ExperienceBundle } from "./PlanExperience";
import Account360Workspace, {
  type Account,
  type AccountWorkspaceState,
  type WorkspaceSection
} from "./Account360Workspace";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

type Tab = "overview" | "performance" | "accounts" | "plan" | "team" | "setup";
type SetupPanel = "builder" | "identity" | "baseline";
const VIEWING_STORAGE_KEY = "eliteos.salesOps.viewingUserId";

type Insight = {
  eyebrow: string;
  title: string;
  lead: string;
  stat?: string;
  statLabel?: string;
  sections: { title: string; items: string[] }[];
};

type PeriodTarget = {
  period: string;
  label: string;
  year: string;
  installedTarget: number;
  rollingThreeMonthTarget: number;
  qualifiedPipelineTarget: number;
};

type Scorecard = {
  period: string;
  installed: number;
  pipeline: number;
  quoted: number;
  awarded: number;
  touches: number;
  meetings: number;
  opportunities: number;
  followUp: number;
  repeatShare: number;
  note: string;
  sources?: Record<string, string>;
};

type PerformanceMonth = {
  period: string;
  goalSf: number | null;
  actualSf: number | null;
  varianceSf: number | null;
  attainmentPct: number | null;
  actualStatus: string;
};

type PerformanceAccount = {
  accountDirectoryAccountId: string;
  salesOpsAccountId: string | null;
  accountName: string | null;
  creditedSf: number;
  sharePct: number | null;
  canOpenWorkspace: boolean;
};

type PerformanceDto = {
  period: string;
  currentMonth: PerformanceMonth;
  ytd: { goalSf: number | null; actualSf: number | null; varianceSf: number | null; attainmentPct: number | null };
  priorMonthActualSf: number | null;
  rollingThreeMonthActualSf: number | null;
  months: PerformanceMonth[];
  accounts?: PerformanceAccount[];
  ytdAccounts?: PerformanceAccount[];
  actualSfDefinition?: { status?: string; note?: string };
  readiness?: {
    identityCoverage?: { assignedCount?: number; linkedCount?: number; unresolvedCount?: number };
    attributionActive?: boolean;
    actualSfAvailable?: boolean;
    publishedPlanAvailable?: boolean;
    commissionEnabled?: boolean;
  };
};

type OperatingPerson = {
  userId: string;
  displayName: string;
  firstName?: string;
  managerDisplayName?: string | null;
  territoryName?: string | null;
};

type OperatingView = {
  person: OperatingPerson;
  readiness: NonNullable<PerformanceDto["readiness"]>;
  performance: PerformanceDto;
  assignedCount: number;
  plan: Record<string, unknown> | null;
  book: {
    roleCounts?: Record<string, number>;
    healthCounts?: Record<string, number>;
    identityGapCount?: number;
    priorities?: Array<{
      salesOpsAccountId: string;
      accountName: string;
      roleLabel?: string;
      healthLabel?: string;
      reasonCopy?: string;
      trailingCompletedSf?: number | null;
    }>;
  };
};

type BookAccountRow = {
  salesOpsAccountId: string;
  accountName: string;
  market?: string | null;
  branch?: string | null;
  appliedRole?: string | null;
  appliedHealth?: string | null;
  roleLabel?: string;
  healthLabel?: string;
  reasonCopy?: string;
  trailingCompletedSf?: number | null;
};

const ACCOUNT_BUCKETS: { key: string; kicker: string; title: string; match: (row: BookAccountRow) => boolean }[] = [
  {
    key: "priority-anchor",
    kicker: "PRIORITY",
    title: "Anchor + Needs Attention",
    match: (row) => row.appliedRole === "ANCHOR" && row.appliedHealth === "NEEDS_ATTENTION"
  },
  {
    key: "priority-growth",
    kicker: "PRIORITY",
    title: "Growth + Needs Attention",
    match: (row) => row.appliedRole === "GROWTH_OPPORTUNITY" && row.appliedHealth === "NEEDS_ATTENTION"
  },
  {
    key: "priority-reactivation",
    kicker: "PRIORITY",
    title: "Reactivation",
    match: (row) => row.appliedRole === "REACTIVATION"
  },
  {
    key: "protect",
    kicker: "PROTECT",
    title: "Anchor",
    match: (row) => row.appliedRole === "ANCHOR" && row.appliedHealth !== "NEEDS_ATTENTION" && row.appliedHealth !== "DATA_GAP"
  },
  {
    key: "grow",
    kicker: "GROW",
    title: "Growth Opportunity",
    match: (row) => row.appliedRole === "GROWTH_OPPORTUNITY" && row.appliedHealth !== "NEEDS_ATTENTION" && row.appliedHealth !== "DATA_GAP"
  },
  {
    key: "develop",
    kicker: "DEVELOP",
    title: "New / Unproven",
    match: (row) => row.appliedRole === "NEW_UNPROVEN"
  },
  {
    key: "data-gaps",
    kicker: "DATA GAPS",
    title: "Unresolved identity",
    match: (row) => row.appliedHealth === "DATA_GAP" || !row.appliedRole
  }
];

function fmtMaybe(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return fmt.format(Number(value));
}

function fmtPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}

const DEFAULT_INSIGHTS: Record<string, Insight> = {
  installed: {
    eyebrow: "01 / Result",
    title: "Monthly square-foot goal",
    lead: "The published plan stores an explicit SF target for every calendar month. Actual credited SF is a separate governed fact and is not implied by this coaching copy.",
    sections: [
      { title: "What the plan holds", items: ["One editable monthly SF goal per calendar month", "Ramp generation writes those months; it is not the runtime authority"] },
      { title: "What actuals require", items: ["An approved earned-sale event and date", "Exact Account Directory identity before Moraware square footage is attributed"] }
    ]
  },
  pipeline: {
    eyebrow: "02 / Signal",
    title: "Qualified 90-day pipeline",
    stat: "3×",
    statLabel: "Next 90-day target",
    lead: "Pipeline is open work with enough evidence to forecast a decision and a realistic installation window.",
    sections: [{ title: "Every opportunity needs", items: ["Named account and project", "Estimated square feet", "Next action, owner, and due date"] }]
  },
  engine: {
    eyebrow: "03 / Engine",
    title: "Activity that creates a next step",
    lead: "The engine measures useful movement, not busyness. Leading indicators stay manual until activity evidence is reliable.",
    sections: [{ title: "The weekly rhythm", items: ["Meaningful two-way account touches", "Discovery or project-planning meetings", "Newly qualified opportunities", "On-time quote follow-up"] }]
  }
};

const fmt = new Intl.NumberFormat("en-US");
const pct = (value: number) => `${Math.round(value)}%`;
const clamp = (value: number, max = 100) => Math.max(0, Math.min(max, value));

function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? import.meta.env.VITE_HOME_URL ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

function sourceLabel(source?: string) {
  const s = String(source || "manual").toLowerCase();
  if (s === "manual") return { cls: "manual", text: "Manual" };
  if (s === "calculated") return { cls: "automated", text: "Calculated" };
  return { cls: "automated", text: "Automated" };
}

function ArrowIcon() {
  return <span aria-hidden="true" className="arrow-icon">→</span>;
}

function StatusPill({ status }: { status: "green" | "yellow" | "red" | "pending" }) {
  const labels = { green: "On plan", yellow: "Recovery", red: "Intervention", pending: "Awaiting data" };
  return (
    <span className={`status-pill ${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}

function Meter({ value, tone = "red" }: { value: number; tone?: "red" | "gold" | "green" }) {
  return (
    <div className="meter" aria-label={`${Math.round(value)} percent`}>
      <span className={tone} style={{ width: `${clamp(value)}%` }} />
    </div>
  );
}

function blankScore(month: string): Scorecard {
  return {
    period: month,
    installed: 0,
    pipeline: 0,
    quoted: 0,
    awarded: 0,
    touches: 0,
    meetings: 0,
    opportunities: 0,
    followUp: 0,
    repeatShare: 0,
    note: ""
  };
}

export default function SalesOpsApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [me, setMe] = useState<Record<string, unknown> | null>(null);
  const [planBundle, setPlanBundle] = useState<{ plan: Record<string, unknown>; periodTargets: PeriodTarget[]; metricTargets: Array<Record<string, unknown>>; insights?: Record<string, Insight>; planCopy?: Record<string, string> } | null>(null);
  const [planBook, setPlanBook] = useState<BookIntelligence | null>(null);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsCursor, setAccountsCursor] = useState<string | null>(null);
  const [commission, setCommission] = useState<{
    enabled: boolean;
    snapshot?: Record<string, unknown> | null;
    reason?: string;
    compensation?: { finallyApproved?: boolean; workflow?: string[] };
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [setupPanel, setSetupPanel] = useState<SetupPanel>("builder");
  const [form, setForm] = useState<Scorecard>(blankScore("2026-09"));
  const [saved, setSaved] = useState(false);
  const [yearFilter, setYearFilter] = useState("all");
  const [insight, setInsight] = useState<Insight | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [workspace, setWorkspace] = useState<AccountWorkspaceState | null>(null);
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>("summary");
  const workspaceGen = useRef(0);
  const [accountTier, setAccountTier] = useState("All");
  const [accountQuery, setAccountQuery] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [followSummary, setFollowSummary] = useState("");
  const [followDate, setFollowDate] = useState("");
  const [writeError, setWriteError] = useState<string | null>(null);
  const [team, setTeam] = useState<{ reports: Array<Record<string, unknown>> } | null>(null);
  const [planHistory, setPlanHistory] = useState<Array<Record<string, unknown>>>([]);
  const [performance, setPerformance] = useState<PerformanceDto | null>(null);
  const [perfAccounts, setPerfAccounts] = useState<PerformanceAccount[]>([]);
  const [teamPerformance, setTeamPerformance] = useState<{
    period: string;
    rows: Array<Record<string, unknown>>;
  } | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(VIEWING_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [people, setPeople] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [operating, setOperating] = useState<OperatingView | null>(null);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);

  function persistViewing(userId: string | null) {
    setViewingUserId(userId);
    try {
      if (userId) sessionStorage.setItem(VIEWING_STORAGE_KEY, userId);
      else sessionStorage.removeItem(VIEWING_STORAGE_KEY);
    } catch {
      /* sessionStorage is a UI preference, not data authority */
    }
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSessionToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionToken(session?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const reload = useCallback(async () => {
    if (!sessionToken) return;
    setLoadError(null);
    try {
      const meRes = (await apiGet("/api/sales-ops/me", sessionToken)) as Record<string, unknown>;
      setMe(meRes);
      const access = meRes.access as {
        isManager?: boolean;
        isOrgAdmin?: boolean;
        canAdministerPlans?: boolean;
        canSelectSalesperson?: boolean;
      } | undefined;
      const canSelect = Boolean(access?.canSelectSalesperson || access?.isOrgAdmin || access?.isManager);
      const selfId = String((meRes.user as { id?: string } | undefined)?.id || "");
      let peopleList: Array<{ userId: string; displayName: string }> = [];
      if (canSelect) {
        try {
          const listed = (await apiGet("/api/sales-ops/team/people", sessionToken)) as {
            people?: Array<{ userId: string; displayName: string }>;
          };
          peopleList = listed.people || [];
        } catch {
          peopleList = [];
        }
        setPeople(peopleList);
      } else {
        setPeople([]);
      }
      const target = canSelect
        ? viewingUserId && peopleList.some((p) => p.userId === viewingUserId)
          ? viewingUserId
          : null
        : selfId;
      if (canSelect) {
        const t = (await apiGet("/api/sales-ops/team", sessionToken)) as { reports: Array<Record<string, unknown>> };
        setTeam(t);
        try {
          const tp = (await apiGet("/api/sales-ops/team/performance", sessionToken)) as {
            period: string;
            rows: Array<Record<string, unknown>>;
          };
          setTeamPerformance(tp);
        } catch {
          setTeamPerformance(null);
        }
      } else {
        setTeam(null);
        setTeamPerformance(null);
      }
      if (!target) {
        setOperating(null);
        setPerformance(null);
        setPerfAccounts([]);
        setPlanBundle(null);
        setPlanBook(null);
        setAccounts([]);
        setAccountsCursor(null);
        setAssignedCount(null);
        setCommission(null);
        setProgress(null);
        setPlanHistory([]);
        return;
      }
      const scoped = canSelect && target !== selfId;
      const op = (await apiGet(
        scoped ? `/api/sales-ops/team/${target}/operating-view` : "/api/sales-ops/me/operating-view",
        sessionToken
      )) as OperatingView;
      setOperating(op);
      setPerformance(op.performance);
      setPerfAccounts(op.performance?.ytdAccounts || op.performance?.accounts || []);
      setAssignedCount(op.assignedCount ?? null);
      const acc = (await apiGet(
        scoped ? `/api/sales-ops/team/${target}/accounts?limit=50` : "/api/sales-ops/me/accounts?limit=50",
        sessionToken
      )) as { accounts: Account[]; nextCursor?: string | null; assignedCount?: number | null };
      setAccounts(acc.accounts || []);
      setAccountsCursor(acc.nextCursor || null);
      if (acc.assignedCount != null) setAssignedCount(acc.assignedCount);
      try {
        const book = (await apiGet(
          scoped ? `/api/sales-ops/team/${target}/book-intelligence` : "/api/sales-ops/me/book-intelligence",
          sessionToken
        )) as BookIntelligence;
        setPlanBook(book);
      } catch {
        setPlanBook(null);
      }
      if (op.plan) {
        try {
          const planRes = (await apiGet(
            scoped ? `/api/sales-ops/team/${target}/plan` : "/api/sales-ops/me/plan",
            sessionToken
          )) as typeof planBundle;
          setPlanBundle(planRes);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
          setPlanBundle(null);
        }
        if (!scoped) {
          try {
            const prog = (await apiGet("/api/sales-ops/me/progress", sessionToken)) as Record<string, unknown>;
            setProgress(prog);
            setScorecards((prog.scorecards as Scorecard[]) || []);
          } catch {
            setProgress(null);
          }
        } else {
          setProgress(null);
        }
      } else {
        setPlanBundle(null);
        setProgress(null);
      }
      try {
        const hist = (await apiGet("/api/sales-ops/me/plans", sessionToken)) as { plans: Array<Record<string, unknown>> };
        setPlanHistory(scoped ? [] : hist.plans || []);
      } catch {
        setPlanHistory([]);
      }
      if (!scoped) {
        try {
          const comm = (await apiGet("/api/sales-ops/me/commission", sessionToken)) as typeof commission;
          setCommission(comm);
        } catch {
          setCommission(null);
        }
      } else {
        setCommission(null);
      }
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : String((e as Error)?.message || e));
    }
  }, [sessionToken, viewingUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!sessionToken) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 20000);
    return () => window.clearInterval(id);
  }, [sessionToken, reload]);

  const ramp: PeriodTarget[] = (planBundle?.periodTargets as PeriodTarget[]) || [];
  const user = (me?.user || {}) as { id?: string; firstName?: string; fullName?: string; email?: string; role?: string };
  const access = (me?.access || {}) as {
    isOrgAdmin?: boolean;
    isManager?: boolean;
    canAdministerPlans?: boolean;
    canSelectSalesperson?: boolean;
    canPublishPlans?: boolean;
  };
  const canSelect = Boolean(access.canSelectSalesperson || access.isOrgAdmin || access.isManager);
  const subject = operating?.person || null;
  const subjectPlan = operating?.plan || null;
  const readiness = operating?.readiness || performance?.readiness || null;
  const publishedPlan = Boolean(readiness?.publishedPlanAvailable && subjectPlan);
  const northStar = publishedPlan ? Number(subjectPlan?.northStarTarget) : null;
  const hasNorthStar = northStar != null && Number.isFinite(northStar) && northStar > 0;
  const subjectName = salespersonDisplayName(subject?.displayName || (canSelect ? "" : user.fullName) || "");
  const headline = hasNorthStar
    ? String(subjectPlan?.headline || `${subject?.firstName || subjectName || "Sales"}'s path to ${fmt.format(northStar as number)} sq ft`)
    : subjectName
      ? `${subjectName}`
      : "Sales Ops";
  const heroEm = hasNorthStar ? `${fmt.format(northStar as number)} sq ft.` : "Sales performance";
  const heroLead = hasNorthStar
    ? String(subjectPlan?.subtitle || "A measurable operating system from territory launch to repeatable, durable growth.")
    : subjectName
      ? "Actual production is tracked independently of a published plan."
      : "Select a salesperson to see the same operating view they would use.";
  const integration = (me?.integration || {}) as {
    stale?: boolean;
    lastSuccessAt?: string | null;
    mondayEnabled?: boolean;
    mondayWriteEnabled?: boolean;
  };
  const plan = (subjectPlan || me?.plan || planBundle?.plan || null) as Record<string, unknown> | null;
  const latest = (progress?.progress as { latest?: Scorecard; latestRamp?: PeriodTarget; attainment?: number; rollingAttainment?: number; pipelineCoverage?: number; closeRate?: number; closeRateStandard?: number; recentActual?: number; status?: "green" | "yellow" | "red" | "pending" }) || {};

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setAuthError("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
      if (error) throw error;
      setSessionToken(data.session?.access_token ?? null);
    } catch (err) {
      setAuthError(String((err as Error)?.message || err));
    } finally {
      setAuthBusy(false);
    }
  }

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setMe(null);
  }, [supabase]);

  const menuItems: EliteosTopbarMenuItem[] = [{ label: "Open Home", href: homeLauncherUrl() }];

  const filteredRamp = yearFilter === "all" ? ramp : ramp.filter((item) => item.year === yearFilter);
  const rampYears = useMemo(() => [...new Set(ramp.map((item) => item.year).filter(Boolean))], [ramp]);
  const maxChart = Math.max(1, ...filteredRamp.map((item) => Math.max(Number(item.installedTarget), Number(scorecards.find((r) => r.period === item.period)?.installed ?? 0))));
  const filteredAccounts = useMemo(() => {
    const query = accountQuery.trim().toLowerCase();
    const bookRows = ((planBook?.accounts || []) as BookAccountRow[]).filter((row) => {
      if (!query) return true;
      return [row.accountName, row.market, row.branch, row.roleLabel, row.healthLabel, row.reasonCopy]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
    if (bookRows.length) return bookRows;
    return accounts
      .filter((account) => !query || account.accountName.toLowerCase().includes(query))
      .map((account) => ({
        salesOpsAccountId: account.id,
        accountName: account.accountName,
        market: account.market,
        branch: account.branch,
        appliedRole: null,
        appliedHealth: account.accountDirectoryAccountId ? null : "DATA_GAP",
        roleLabel: "Role unavailable",
        healthLabel: account.accountDirectoryAccountId ? "Unknown" : "Data gap",
        reasonCopy: account.accountDirectoryAccountId
          ? ""
          : "Production history unavailable until account identity is resolved.",
        trailingCompletedSf: null
      }));
  }, [accounts, accountQuery, planBook]);

  function change(field: keyof Scorecard, value: string) {
    setSaved(false);
    setForm((current) => ({ ...current, [field]: field === "period" || field === "note" ? value : Number(value) }));
  }

  async function saveScorecard(event: FormEvent) {
    event.preventDefault();
    if (!sessionToken) return;
    await apiPut(`/api/sales-ops/me/scorecards/${form.period}`, sessionToken, form);
    setSaved(true);
    await reload();
    setTimeout(() => setSaved(false), 2600);
  }

  async function acknowledgePlan() {
    if (!sessionToken || !plan?.id) return;
    await apiPost(`/api/sales-ops/me/plans/${String(plan.id)}/acknowledge`, sessionToken, {});
    await reload();
  }

  async function loadMoreAccounts() {
    if (!sessionToken || !accountsCursor) return;
    const selfId = String(user.id || "");
    const scoped = canSelect && viewingUserId && viewingUserId !== selfId;
    const acc = (await apiGet(
      scoped
        ? `/api/sales-ops/team/${viewingUserId}/accounts?limit=50&cursor=${encodeURIComponent(accountsCursor)}`
        : `/api/sales-ops/me/accounts?limit=50&cursor=${encodeURIComponent(accountsCursor)}`,
      sessionToken
    )) as { accounts: Account[]; nextCursor?: string | null };
    setAccounts((current) => [...current, ...(acc.accounts || [])]);
    setAccountsCursor(acc.nextCursor || null);
  }

  function setAccountHash(accountId: string | null) {
    const next = accountId ? `#account=${accountId}` : "";
    const current = window.location.hash || "";
    if (current === next) return;
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
  }

  function closeAccount() {
    workspaceGen.current += 1;
    setSelectedAccount(null);
    setWorkspace(null);
    setWorkspaceSection("summary");
    setWriteError(null);
    setAccountHash(null);
  }

  async function loadWorkspaceSection(
    accountId: string,
    token: string,
    gen: number,
    key: "updates" | "subitems" | "files" | "docs" | "activities",
    path: string,
    append = false
  ) {
    try {
      const data = (await apiGet(path, token)) as Record<string, unknown>;
      if (gen !== workspaceGen.current) return;
      const rows = (data[key] as Array<Record<string, unknown>>) || [];
      const nextCursor = (data.nextCursor as string | null) || null;
      setWorkspace((current) => {
        if (!current) return current;
        const prior = append ? ((current[key] as Array<Record<string, unknown>>) || []) : [];
        return {
          ...current,
          [key]: [...prior, ...rows],
          cursors: { ...(current.cursors || {}), [key]: nextCursor },
          loading: { ...(current.loading || {}), [key]: false },
          errors: { ...(current.errors || {}), [key]: undefined }
        };
      });
    } catch (e) {
      if (gen !== workspaceGen.current) return;
      const status = e instanceof ApiError ? e.status : 0;
      setWorkspace((current) => ({
        ...(current || {}),
        loading: { ...(current?.loading || {}), [key]: false },
        errors: { ...(current?.errors || {}), [key]: status === 404 ? "not_found" : "error" }
      }));
    }
  }

  const openAccountById = useCallback(async (accountId: string, seed?: Account) => {
    if (!sessionToken || !accountId) return;
    const gen = workspaceGen.current + 1;
    workspaceGen.current = gen;
    setWriteError(null);
    setWorkspaceSection("summary");
    setSelectedAccount(seed || { id: accountId, accountName: "Account" });
    setAccountHash(accountId);
    setWorkspace({
      updates: [],
      subitems: [],
      files: [],
      docs: [],
      activities: [],
      cursors: {},
      loading: { detail: true, updates: true, subitems: true, files: true, docs: true, activities: true },
      errors: {},
      notFound: false
    });
    try {
      const data = (await apiGet(`/api/sales-ops/accounts/${accountId}`, sessionToken)) as Record<string, unknown>;
      if (gen !== workspaceGen.current) return;
      const acc = {
        ...((data.account as Account) || seed || { id: accountId, accountName: "Account" }),
        intelligence:
          (data.intelligence as Account["intelligence"]) ||
          ((data.account as Account | undefined)?.intelligence) ||
          seed?.intelligence
      };
      setSelectedAccount(acc);
      setWorkspace((current) => ({
        ...(current || {}),
        account: acc,
        intelligence: data.intelligence as Account["intelligence"],
        loading: { ...(current?.loading || {}), detail: false }
      }));
    } catch (e) {
      if (gen !== workspaceGen.current) return;
      const status = e instanceof ApiError ? e.status : 0;
      setWorkspace({
        notFound: true,
        loading: { detail: false },
        errors: { detail: status === 404 ? "not_found" : "error" }
      });
      return;
    }
    await Promise.all([
      loadWorkspaceSection(accountId, sessionToken, gen, "updates", `/api/sales-ops/accounts/${accountId}/updates?limit=50`),
      loadWorkspaceSection(accountId, sessionToken, gen, "subitems", `/api/sales-ops/accounts/${accountId}/subitems?limit=50`),
      loadWorkspaceSection(accountId, sessionToken, gen, "files", `/api/sales-ops/accounts/${accountId}/files?limit=50`),
      loadWorkspaceSection(accountId, sessionToken, gen, "docs", `/api/sales-ops/accounts/${accountId}/docs?limit=50`),
      loadWorkspaceSection(accountId, sessionToken, gen, "activities", `/api/sales-ops/accounts/${accountId}/activity?limit=50`)
    ]);
  }, [sessionToken]);

  async function openAccount(account: Account) {
    await openAccountById(account.id, account);
  }

  async function loadMoreWorkspace(key: "updates" | "subitems" | "files" | "docs" | "activities") {
    if (!sessionToken || !selectedAccount) return;
    const cursor = workspace?.cursors?.[key];
    if (!cursor) return;
    const gen = workspaceGen.current;
    const pathKey = key === "activities" ? "activity" : key;
    setWorkspace((current) => ({
      ...(current || {}),
      loading: { ...(current?.loading || {}), [key]: true }
    }));
    await loadWorkspaceSection(
      selectedAccount.id,
      sessionToken,
      gen,
      key,
      `/api/sales-ops/accounts/${selectedAccount.id}/${pathKey}?limit=50&cursor=${encodeURIComponent(cursor)}`,
      true
    );
  }

  useEffect(() => {
    if (!sessionToken) return;
    const readHash = () => {
      const match = /^#account=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(window.location.hash || "");
      return match?.[1] || null;
    };
    const id = readHash();
    if (id) void openAccountById(id);
    const onHash = () => {
      const next = readHash();
      if (next) void openAccountById(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [sessionToken, openAccountById]);

  async function saveFollowUp() {
    if (!sessionToken || !selectedAccount) return;
    setWriteError(null);
    try {
      const res = (await apiPost(`/api/sales-ops/accounts/${selectedAccount.id}/follow-ups`, sessionToken, {
        summary: followSummary,
        nextContact: followDate,
        fromRecommendation: false
      })) as { configurationNeeded?: boolean; message?: string };
      if (res.configurationNeeded) setWriteError(res.message || "Follow-up mapping is not configured.");
      else {
        setFollowSummary("");
        await openAccount(selectedAccount);
        await reload();
      }
    } catch (e) {
      setWriteError(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function saveNote() {
    if (!sessionToken || !selectedAccount) return;
    setWriteError(null);
    try {
      await apiPost(`/api/sales-ops/accounts/${selectedAccount.id}/notes`, sessionToken, { body: noteBody });
      setNoteBody("");
      await openAccount(selectedAccount);
    } catch (e) {
      setWriteError(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function patchField(field: string, value: string) {
    if (!sessionToken || !selectedAccount) return;
    setWriteError(null);
    try {
      await apiPatch(`/api/sales-ops/accounts/${selectedAccount.id}`, sessionToken, { [field]: value });
      await openAccount(selectedAccount);
      await reload();
    } catch (e) {
      setWriteError(e instanceof ApiError ? e.message : String(e));
    }
  }

  if (!sessionToken) {
    return (
      <div className="sales-ops-auth">
        <form className="sales-ops-auth-card" onSubmit={signIn}>
          <p className="kicker">eliteOS</p>
          <h1>Sales Ops</h1>
          <p>Sign in with your eliteOS account. You will only see your own plan and currently assigned accounts.</p>
          {authError && <div className="field-error">{authError}</div>}
          <input type="email" autoComplete="username" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
          <input type="password" autoComplete="current-password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
          <button type="submit" disabled={authBusy}>{authBusy ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    );
  }

  const tabs: [Tab, string, string, boolean][] = [
    ["overview", "01", "Overview", true],
    ["accounts", "02", "Accounts", true],
    ["plan", "03", "Plan", true],
    ["performance", "04", "Performance", true],
    ["team", "05", "Team", canSelect],
    ["setup", "06", "Setup", Boolean(access.canAdministerPlans || access.isOrgAdmin)]
  ];
  const ytdContributors = performance?.ytdAccounts || perfAccounts;
  const roleCounts = operating?.book?.roleCounts || {};
  const healthCounts = operating?.book?.healthCounts || {};

  return (
    <div className="sales-ops-root">
      <EliteosTopbar
        appName="Sales Ops"
        organizationName="eliteOS"
        logoSrc={EOS_LOGO_URL}
        homeHref={homeLauncherUrl()}
        userName={String(user.fullName || "")}
        userEmail={String(user.email || "")}
        initials={(String(user.fullName || user.email || "SO").match(/\b\w/g) || ["S", "O"]).slice(0, 2).join("").toUpperCase()}
        userSubtitle={String(user.role || "")}
        menuItems={menuItems}
        onSignOut={() => void signOut()}
      />
      <main>
        <header className={`site-header ${hasNorthStar ? "" : "compact-hero"}`}>
          <div className="header-glow" />
          <div className="hero-fallback" aria-hidden="true" />
          <div className="hero shell">
            <div className="hero-copy">
              <p className="eyebrow">{String(subject?.territoryName || subjectPlan?.territoryName || "Sales territory")}</p>
              <h1>
                {headline.replace(/(\d[\d,]*\s*sq ft)/i, "")}
                <br />
                <em>{heroEm}</em>
              </h1>
              <p>{heroLead}</p>
            </div>
            {hasNorthStar ? (
              <div className="hero-target">
                <span>North star</span>
                <strong>{fmt.format(northStar as number)}</strong>
                <small>
                  {String(subjectPlan?.northStarMetric || "installed sq ft / month")}
                  <br />
                  {subjectPlan?.northStarTargetDate ? `by ${String(subjectPlan.northStarTargetDate)}` : ""}
                </small>
              </div>
            ) : operating?.performance?.ytd?.actualSf != null ? (
              <div className="hero-target">
                <span>YTD actual</span>
                <strong>{fmt.format(Number(operating.performance.ytd.actualSf))}</strong>
                <small>Completed installation SF</small>
              </div>
            ) : null}
          </div>
        </header>

        <nav className="tabbar" aria-label="Sales Ops sections">
          <div className="shell tab-inner">
            {tabs.filter((t) => t[3]).map(([id, number, label]) => (
              <button key={id} onClick={() => setTab(id)} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined}>
                <span>{number}</span>
                {label}
              </button>
            ))}
          </div>
        </nav>

        <section className="shell page-shell">
          {canSelect ? (
            <div className="person-context">
              <div>
                <p className="kicker">Viewing</p>
                <strong>{subjectName || "Select a salesperson"}</strong>
              </div>
              <label>
                Salesperson
                <select
                  value={viewingUserId || ""}
                  onChange={(e) => persistViewing(e.target.value || null)}
                >
                  <option value="">Select a salesperson</option>
                  {people.map((row) => (
                    <option key={row.userId} value={row.userId}>
                      {salespersonDisplayName(row.displayName)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {loadError && <div className="stale-banner"><b>Could not load Sales Ops.</b> {loadError}</div>}
          {integration.stale && (
            <div className="stale-banner">
              <b>Monday cache may be stale.</b> Last successful sync: {integration.lastSuccessAt || "never"}. Plan and scorecards remain available.
            </div>
          )}

          {tab === "overview" && (
            <div className="tab-page">
              {canSelect && !operating ? (
                <div className="empty-banner">
                  <div>
                    <p className="kicker">Person context</p>
                    <h3>Select a salesperson to open the operating view.</h3>
                    <p>Overview, Accounts, Plan, and Performance all use this same person.</p>
                  </div>
                </div>
              ) : (
                <>
                  {!publishedPlan && (
                    <div className="empty-banner">
                      <div>
                        <p className="kicker">No published plan</p>
                        <h3>No published plan{subjectName ? ` for ${subjectName}` : ""}.</h3>
                        <p>Actual performance is already being tracked. Goal stays unavailable until a plan is published.</p>
                      </div>
                      {access.canAdministerPlans ? (
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => {
                            setSetupPanel("builder");
                            setTab("setup");
                          }}
                        >
                          Build plan
                        </button>
                      ) : null}
                    </div>
                  )}
                  {plan && !plan.acknowledgedAt && !canSelect && (
                    <div className="ack-banner">
                      <div>
                        <p className="kicker">Acknowledgment</p>
                        <h3>A new published plan is ready for you to acknowledge.</h3>
                      </div>
                      <button className="primary-button" type="button" onClick={() => void acknowledgePlan()}>Acknowledge plan</button>
                    </div>
                  )}
                  <div className="command-grid">
                    <article className="command-card">
                      <p className="kicker">Person</p>
                      <h3>{subjectName || "Salesperson"}</h3>
                      <p>Manager: {subject?.managerDisplayName ? salespersonDisplayName(subject.managerDisplayName) : "—"}</p>
                      <p>Territory: {subject?.territoryName || "—"}</p>
                    </article>
                    <article className="command-card">
                      <p className="kicker">Current performance · {performance?.period || "—"}</p>
                      <div className="command-metrics">
                        <div><span>Actual</span><strong>{fmtMaybe(performance?.currentMonth?.actualSf)}</strong></div>
                        <div><span>Goal</span><strong>{fmtMaybe(performance?.currentMonth?.goalSf)}</strong></div>
                        <div><span>Variance</span><strong>{fmtMaybe(performance?.currentMonth?.varianceSf)}</strong></div>
                        <div><span>Attainment</span><strong>{fmtPct(performance?.currentMonth?.attainmentPct)}</strong></div>
                      </div>
                    </article>
                    <article className="command-card">
                      <p className="kicker">YTD</p>
                      <div className="command-metrics">
                        <div><span>Actual</span><strong>{fmtMaybe(performance?.ytd?.actualSf)}</strong></div>
                        <div><span>Goal</span><strong>{fmtMaybe(performance?.ytd?.goalSf)}</strong></div>
                        <div><span>Variance</span><strong>{fmtMaybe(performance?.ytd?.varianceSf)}</strong></div>
                      </div>
                    </article>
                  </div>
                  <div className="command-grid">
                    <article className="command-card">
                      <p className="kicker">Account intelligence</p>
                      <div className="command-metrics">
                        <div><span>Anchor</span><strong>{fmt.format(Number(roleCounts.ANCHOR || 0))}</strong></div>
                        <div><span>Growth</span><strong>{fmt.format(Number(roleCounts.GROWTH_OPPORTUNITY || 0))}</strong></div>
                        <div><span>Reactivation</span><strong>{fmt.format(Number(roleCounts.REACTIVATION || 0))}</strong></div>
                        <div><span>Needs Attention</span><strong>{fmt.format(Number(healthCounts.NEEDS_ATTENTION || 0))}</strong></div>
                        <div><span>Identity / data gap</span><strong>{fmt.format(Number(operating?.book?.identityGapCount || healthCounts.DATA_GAP || 0))}</strong></div>
                      </div>
                    </article>
                    <article className="command-card">
                      <p className="kicker">Top contributing accounts</p>
                      {(ytdContributors || []).slice(0, 8).map((row) => (
                        <div className="workspace-line" key={row.accountDirectoryAccountId}>
                          <span>
                            {row.canOpenWorkspace && row.salesOpsAccountId ? (
                              <button type="button" className="text-link" onClick={() => { void openAccountById(row.salesOpsAccountId as string); setTab("accounts"); }}>
                                {row.accountName || "Assigned account"}
                              </button>
                            ) : (
                              row.accountName || "Account"
                            )}
                          </span>
                          <strong>{fmtMaybe(row.creditedSf)} SF</strong>
                        </div>
                      ))}
                      {(ytdContributors || []).length === 0 && <p className="workspace-muted">No credited YTD contribution yet.</p>}
                    </article>
                    <article className="command-card">
                      <p className="kicker">Priorities</p>
                      {(operating?.book?.priorities || []).map((row) => (
                        <div className="workspace-line" key={row.salesOpsAccountId}>
                          <span>
                            <button type="button" className="text-link" onClick={() => { void openAccountById(row.salesOpsAccountId); setTab("accounts"); }}>
                              {row.accountName}
                            </button>
                            <small>{[row.roleLabel, row.healthLabel].filter(Boolean).join(" · ")}</small>
                          </span>
                          <strong>{row.reasonCopy || ""}</strong>
                        </div>
                      ))}
                      {(operating?.book?.priorities || []).length === 0 && (
                        <p className="workspace-muted">No governed account-action priorities beyond identity gaps.</p>
                      )}
                    </article>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "performance" && (
            <div className="tab-page">
              <div className="section-heading split-heading progress-heading">
                <div>
                  <p className="kicker">
                    {subjectName ? `${subjectName} · ` : ""}Current month {performance?.period || ""}
                  </p>
                  <h2>Goal versus actual square feet.</h2>
                </div>
              </div>
              {readiness && !readiness.actualSfAvailable && (
                <div className="stale-banner">
                  <b>Actual SF is not available yet.</b>{" "}
                  {performance?.actualSfDefinition?.note || "Credited production appears here after attribution is active. Missing Goal does not hide Actual SF."}
                </div>
              )}
              <div className="score-grid">
                <article className="score-card hero-score">
                  <span>Monthly SF goal</span>
                  <div className="score-value">
                    <strong>{fmtMaybe(performance?.currentMonth?.goalSf)}</strong>
                  </div>
                </article>
                <article className="score-card">
                  <span>Actual SF</span>
                  <div className="score-value">
                    <strong>{fmtMaybe(performance?.currentMonth?.actualSf)}</strong>
                    <small>{performance?.currentMonth?.actualStatus || "—"}</small>
                  </div>
                </article>
                <article className="score-card">
                  <span>Variance SF</span>
                  <div className="score-value">
                    <strong>{fmtMaybe(performance?.currentMonth?.varianceSf)}</strong>
                  </div>
                </article>
                <article className="score-card">
                  <span>Attainment</span>
                  <div className="score-value">
                    <strong>{fmtPct(performance?.currentMonth?.attainmentPct)}</strong>
                    {performance?.currentMonth?.attainmentPct == null ? null : (
                      <Meter value={Number(performance.currentMonth.attainmentPct)} />
                    )}
                  </div>
                </article>
              </div>
              <div className="score-grid">
                <article className="score-card">
                  <span>YTD goal</span>
                  <strong>{fmtMaybe(performance?.ytd?.goalSf)}</strong>
                </article>
                <article className="score-card">
                  <span>YTD actual</span>
                  <strong>{fmtMaybe(performance?.ytd?.actualSf)}</strong>
                </article>
                <article className="score-card">
                  <span>YTD variance</span>
                  <strong>{fmtMaybe(performance?.ytd?.varianceSf)}</strong>
                </article>
                <article className="score-card">
                  <span>YTD attainment</span>
                  <strong>{fmtPct(performance?.ytd?.attainmentPct)}</strong>
                </article>
                <article className="score-card">
                  <span>Prior-month actual</span>
                  <strong>{fmtMaybe(performance?.priorMonthActualSf)}</strong>
                </article>
                <article className="score-card">
                  <span>Rolling 3-month actual</span>
                  <strong>{fmtMaybe(performance?.rollingThreeMonthActualSf)}</strong>
                  <small>Shown only when three months of actuals exist</small>
                </article>
              </div>
              <div className="chart-card">
                <div className="chart-head">
                  <div>
                    <p className="kicker">Monthly history</p>
                    <h3>Goal vs actual SF</h3>
                  </div>
                </div>
                <div
                  className="bar-chart"
                  style={{ gridTemplateColumns: `repeat(${Math.max((performance?.months || []).length, 1)}, minmax(18px, 1fr))` }}
                  aria-hidden="true"
                >
                  {(performance?.months || []).map((item) => {
                    const ceiling = Math.max(
                      1,
                      ...(performance?.months || []).map((m) =>
                        Math.max(Number(m.goalSf || 0), m.actualSf == null ? 0 : Number(m.actualSf))
                      )
                    );
                    return (
                      <div className="bar-group" key={item.period}>
                        <div className="bars">
                          {item.actualSf == null ? null : (
                            <i className="actual-bar" style={{ height: `${(Number(item.actualSf) / ceiling) * 100}%` }} />
                          )}
                          <i className="target-bar" style={{ height: `${(Number(item.goalSf || 0) / ceiling) * 100}%` }} />
                        </div>
                        <span>{item.period.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="month-goal-table" role="table" aria-label="Monthly goal versus actual">
                  <div className="month-goal-head" role="row">
                    <span>Month</span>
                    <span>Goal</span>
                    <span>Actual</span>
                    <span>Variance</span>
                    <span>Attainment</span>
                    <span>Status</span>
                  </div>
                  {(performance?.months || []).map((row) => (
                    <div key={row.period} className="month-goal-row" role="row">
                      <span>{row.period}</span>
                      <span>{fmtMaybe(row.goalSf)}</span>
                      <span>{fmtMaybe(row.actualSf)}</span>
                      <span>{fmtMaybe(row.varianceSf)}</span>
                      <span>{fmtPct(row.attainmentPct)}</span>
                      <span>{row.actualStatus}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-section">
                <p className="kicker">Account contribution</p>
                <h3>{performance?.period || "Selected month"}</h3>
                <p className="workspace-muted">Canonical Account Directory identity only. Unassigned accounts stay listed without a workspace link.</p>
                {(perfAccounts || []).map((row) => (
                  <div className="workspace-line" key={row.accountDirectoryAccountId}>
                    <span>
                      {row.canOpenWorkspace && row.salesOpsAccountId ? (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => {
                            void openAccountById(row.salesOpsAccountId as string);
                            setTab("accounts");
                          }}
                        >
                          {row.accountName || "Assigned account"}
                        </button>
                      ) : (
                        "Account"
                      )}
                    </span>
                    <strong>
                      {fmtMaybe(row.creditedSf)} SF · {fmtPct(row.sharePct)}
                    </strong>
                  </div>
                ))}
                {(perfAccounts || []).length === 0 && (
                  <p className="workspace-muted">No credited account contribution is available for this month.</p>
                )}
              </div>
            </div>
          )}

          {tab === "accounts" && (
            <div className="tab-page account-page">
              <div className="account-integrity">
                <div className="integrity-mark"><span>✓</span></div>
                <div>
                  <p className="kicker">Assigned book</p>
                  <h3>Monday owns assignment. Historical production is evidence—not ownership.</h3>
                  <p>{accountListScopeCopy(access, { viewingSelectedBook: Boolean(canSelect && viewingUserId) })}</p>
                </div>
                <small>
                  Assigned
                  <br />
                  <b>{assignedCount != null ? fmt.format(assignedCount) : "—"}</b>
                </small>
              </div>
              <div className="account-workbench">
                <div>
                  <p className="kicker">Account book</p>
                  <h2>
                    {assignedCount != null ? `${fmt.format(assignedCount)} assigned accounts` : "Assigned accounts"}
                    {assignedCount != null && filteredAccounts.length !== assignedCount ? (
                      <small className="showing-count"> Showing {fmt.format(filteredAccounts.length)}</small>
                    ) : null}
                  </h2>
                </div>
                <div className="account-controls">
                  <label>
                    <span>Find an account</span>
                    <input type="search" value={accountQuery} onChange={(e) => setAccountQuery(e.target.value)} placeholder="Search name, market…" />
                  </label>
                </div>
              </div>
              {ACCOUNT_BUCKETS.map((group) => {
                const used = new Set<string>();
                for (const prior of ACCOUNT_BUCKETS) {
                  if (prior.key === group.key) break;
                  for (const row of filteredAccounts) {
                    if (prior.match(row)) used.add(row.salesOpsAccountId);
                  }
                }
                const items = filteredAccounts.filter((row) => !used.has(row.salesOpsAccountId) && group.match(row));
                if (!items.length) return null;
                return (
                  <section className="account-group" key={group.key}>
                    <p className="kicker">{group.kicker}</p>
                    <h3>{group.title}</h3>
                    {group.key === "data-gaps" ? (
                      <p className="workspace-muted">
                        Production history unavailable until account identity is resolved.
                        {access.isOrgAdmin ? " Identity Review is in Setup." : " Sales does not administer identity from this view."}
                      </p>
                    ) : null}
                    <div className="account-line-list">
                      {items.map((row) => (
                        <button
                          type="button"
                          className="account-line"
                          key={row.salesOpsAccountId}
                          onClick={() => void openAccountById(row.salesOpsAccountId, { id: row.salesOpsAccountId, accountName: row.accountName })}
                        >
                          <span>
                            <strong>{row.accountName}</strong>
                            <small>{[row.roleLabel, row.healthLabel, row.market || row.branch].filter(Boolean).join(" · ")}</small>
                          </span>
                          <b>
                            {row.appliedHealth === "DATA_GAP"
                              ? "Identity unresolved"
                              : row.trailingCompletedSf != null
                                ? `${fmt.format(Number(row.trailingCompletedSf))} SF`
                                : "Open"}
                          </b>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
              {!filteredAccounts.length && <p className="workspace-muted">No assigned accounts in this book.</p>}
            </div>
          )}

          {tab === "plan" && (
            <div className="tab-page">
              {planBundle && publishedPlan ? (
                <PlanExperience
                  bundle={planBundle as ExperienceBundle}
                  book={planBook}
                  salespersonName={subjectName || salespersonDisplayName(user.fullName, user.firstName)}
                  performance={performance}
                  compensation={planBook?.compensation || null}
                  showCompensation={Boolean(plan?.commissionEnabled)}
                  onIdentityReview={access.isOrgAdmin ? () => { setSetupPanel("identity"); setTab("setup"); } : null}
                />
              ) : (
                <div className="empty-banner">
                  <div>
                    <p className="kicker">Plan</p>
                    <h3>No published plan{subjectName ? ` for ${subjectName}` : ""}.</h3>
                    <p>Actual performance is already being tracked. This page stays empty until a plan is published.</p>
                  </div>
                  {access.canAdministerPlans ? (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setSetupPanel("builder");
                        setTab("setup");
                      }}
                    >
                      Build draft plan
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {tab === "team" && (
            <div className="tab-page">
              <p className="kicker">Team performance</p>
              <h2>Organization / report scope.</h2>
              <p className="workspace-muted">
                Actual SF and Goal are independent. A blank Goal does not hide credited Actual SF. Click a salesperson to open their operating view.
              </p>
              <div className="month-goal-table" role="table" aria-label="Team performance">
                <div className="month-goal-head team-perf-head" role="row">
                  <span>Salesperson</span>
                  <span>Goal</span>
                  <span>Actual</span>
                  <span>Variance</span>
                  <span>Attainment</span>
                  <span>YTD goal</span>
                  <span>YTD actual</span>
                </div>
                {(teamPerformance?.rows || []).map((row) => (
                  <button
                    type="button"
                    className="month-goal-row team-perf-row"
                    key={String(row.userId)}
                    onClick={() => {
                      persistViewing(String(row.userId));
                      setTab("overview");
                    }}
                  >
                    <span>
                      {salespersonDisplayName(String(row.displayName || ""))}
                      {(row.territoryName || row.managerDisplayName) ? (
                        <small>
                          {[row.territoryName, row.managerDisplayName ? `Manager: ${salespersonDisplayName(String(row.managerDisplayName))}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      ) : null}
                    </span>
                    <span>{fmtMaybe(row.goalSf as number | null)}</span>
                    <span>{fmtMaybe(row.actualSf as number | null)}</span>
                    <span>{fmtMaybe(row.varianceSf as number | null)}</span>
                    <span>{fmtPct(row.attainmentPct as number | null)}</span>
                    <span>{fmtMaybe(row.ytdGoalSf as number | null)}</span>
                    <span>{fmtMaybe(row.ytdActualSf as number | null)}</span>
                  </button>
                ))}
              </div>
              {(teamPerformance?.rows || []).length === 0 && <p>No people are in your governed performance scope.</p>}
            </div>
          )}

          {tab === "setup" && sessionToken && (
            <div className="tab-page">
              <div className="setup-subnav">
                {access.canAdministerPlans ? (
                  <button type="button" className={setupPanel === "builder" ? "active" : ""} onClick={() => setSetupPanel("builder")}>
                    Plan Builder
                  </button>
                ) : null}
                {access.isOrgAdmin ? (
                  <>
                    <button type="button" className={setupPanel === "identity" ? "active" : ""} onClick={() => setSetupPanel("identity")}>
                      Identity Review
                    </button>
                    <button type="button" className={setupPanel === "baseline" ? "active" : ""} onClick={() => setSetupPanel("baseline")}>
                      Baseline Gap
                    </button>
                  </>
                ) : null}
              </div>
              {setupPanel === "builder" && access.canAdministerPlans ? (
                <PlanAdmin
                  token={sessionToken}
                  access={{ isOrgAdmin: access.isOrgAdmin, canPublishPlans: access.canPublishPlans }}
                  onChanged={() => void reload()}
                  onOpenIdentityReview={() => setSetupPanel("identity")}
                />
              ) : null}
              {setupPanel === "identity" && access.isOrgAdmin ? (
                <IdentityReview token={sessionToken} access={{ isOrgAdmin: access.isOrgAdmin }} />
              ) : null}
              {setupPanel === "baseline" && access.isOrgAdmin ? (
                <BaselineGap token={sessionToken} access={{ isOrgAdmin: access.isOrgAdmin }} />
              ) : null}
            </div>
          )}

        </section>
      </main>

      {insight && (
        <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setInsight(null)}>
          <section className="insight-modal" role="dialog">
            <button className="modal-close" type="button" onClick={() => setInsight(null)}>
              <span />Close
            </button>
            <div className="modal-rail"><span>ESF</span></div>
            <div className="modal-content">
              <p className="kicker">{insight.eyebrow}</p>
              <h2>{insight.title}</h2>
              <p className="modal-lead">{insight.lead}</p>
            </div>
          </section>
        </div>
      )}

      {selectedAccount && (
        <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && closeAccount()}>
          <section className="insight-modal account-modal" role="dialog">
            <button className="modal-close" type="button" onClick={closeAccount}>
              <span />Close
            </button>
            <div className="modal-rail"><span>ESF</span><small>Account workspace</small></div>
            <div className="modal-content">
              <p className="kicker">{selectedAccount.intelligence?.recommendedTier || "Account"} / {selectedAccount.intelligence?.strategicPlay || "Qualify"}</p>
              <h2>{workspace?.notFound ? "Account not found" : selectedAccount.accountName}</h2>
              <div className="account-facts">
                <div><span>Monday status</span><strong>{selectedAccount.status || "Not set"}</strong></div>
                <div><span>Next contact</span><strong>{selectedAccount.nextContact || "Needs a date"}</strong></div>
                <div><span>Market</span><strong>{selectedAccount.market || selectedAccount.branch || "Not set"}</strong></div>
                <div><span>Synced</span><strong>{selectedAccount.syncedAt ? String(selectedAccount.syncedAt).slice(0, 16) : "—"}</strong></div>
              </div>
              <Account360Workspace
                account={selectedAccount}
                workspace={workspace}
                section={workspaceSection}
                onSection={setWorkspaceSection}
                writeError={writeError}
                mondayWriteEnabled={integration.mondayWriteEnabled}
                noteBody={noteBody}
                followSummary={followSummary}
                followDate={followDate}
                onNoteBody={setNoteBody}
                onFollowSummary={setFollowSummary}
                onFollowDate={setFollowDate}
                onSaveNote={() => void saveNote()}
                onSaveFollowUp={() => void saveFollowUp()}
                onPatchStatus={(status) => void patchField("status", status)}
                onConvertFollowUp={(action) => { setFollowSummary(action); setTab("accounts"); }}
                onLoadMore={(key) => void loadMoreWorkspace(key)}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
