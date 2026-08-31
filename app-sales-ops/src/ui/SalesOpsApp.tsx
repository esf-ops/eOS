import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import EliteosTopbar from "../../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../../shared/eliteos-ui/EliteosTopbar";
import { apiGet, apiPatch, apiPost, apiPut, ApiError } from "../lib/api";
import { accountListScopeCopy } from "../lib/accountListScopeCopy.mjs";
import { salespersonDisplayName } from "../lib/salespersonLabel";
import { getSupabase } from "../lib/supabase";
import PlanAdmin from "./PlanAdmin";
import IdentityReview from "./IdentityReview";
import PlanExperience, { type BookIntelligence, type PlanBundle as ExperienceBundle } from "./PlanExperience";
import Account360Workspace, {
  type Account,
  type AccountWorkspaceState,
  type WorkspaceSection
} from "./Account360Workspace";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

type Tab = "overview" | "performance" | "entry" | "accounts" | "plan" | "commission" | "team" | "admin" | "identity";

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
  actualSfDefinition?: { status?: string; note?: string };
};

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
  const [scopedUserId, setScopedUserId] = useState<string | null>(null);

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
      try {
        const planRes = (await apiGet("/api/sales-ops/me/plan", sessionToken)) as typeof planBundle;
        setPlanBundle(planRes);
        const prog = (await apiGet("/api/sales-ops/me/progress", sessionToken)) as Record<string, unknown>;
        setProgress(prog);
        setScorecards((prog.scorecards as Scorecard[]) || []);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
        setPlanBundle(null);
      }
      try {
        const hist = (await apiGet("/api/sales-ops/me/plans", sessionToken)) as { plans: Array<Record<string, unknown>> };
        setPlanHistory(hist.plans || []);
      } catch {
        setPlanHistory([]);
      }
      const acc = (await apiGet("/api/sales-ops/me/accounts?limit=50", sessionToken)) as {
        accounts: Account[];
        nextCursor?: string | null;
      };
      setAccounts(acc.accounts || []);
      setAccountsCursor(acc.nextCursor || null);
      const comm = (await apiGet("/api/sales-ops/me/commission", sessionToken)) as typeof commission;
      setCommission(comm);
      try {
        const selfId = String((meRes.user as { id?: string } | undefined)?.id || "");
        const targetId = scopedUserId && scopedUserId !== selfId ? scopedUserId : "";
        if (targetId) {
          const perf = (await apiGet(
            `/api/sales-ops/team/${targetId}/performance?accounts=1`,
            sessionToken
          )) as PerformanceDto;
          setPerformance(perf);
          setPerfAccounts(perf.accounts || []);
        } else {
          const perf = (await apiGet("/api/sales-ops/me/performance", sessionToken)) as PerformanceDto;
          setPerformance(perf);
          const contrib = (await apiGet(
            `/api/sales-ops/me/performance/accounts${perf.period ? `?period=${encodeURIComponent(perf.period)}` : ""}`,
            sessionToken
          )) as { accounts?: PerformanceAccount[] };
          setPerfAccounts(contrib.accounts || []);
        }
      } catch {
        setPerformance(null);
        setPerfAccounts([]);
      }
      const access = meRes.access as { isManager?: boolean; canAdministerPlans?: boolean } | undefined;
      if (access?.isManager || access?.canAdministerPlans) {
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
      }
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : String((e as Error)?.message || e));
    }
  }, [sessionToken, scopedUserId]);

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

  useEffect(() => {
    if (!sessionToken || tab !== "plan") return;
    void apiGet("/api/sales-ops/me/plan/book-intelligence", sessionToken)
      .then((data) => setPlanBook(data as BookIntelligence))
      .catch(() => setPlanBook(null));
  }, [sessionToken, tab, planBundle?.plan]);

  const ramp: PeriodTarget[] = (planBundle?.periodTargets as PeriodTarget[]) || [];
  const user = (me?.user || {}) as { firstName?: string; fullName?: string; email?: string; role?: string };
  const plan = (me?.plan || planBundle?.plan || null) as Record<string, unknown> | null;
  const integration = (me?.integration || {}) as {
    stale?: boolean;
    lastSuccessAt?: string | null;
    mondayEnabled?: boolean;
    mondayWriteEnabled?: boolean;
  };
  const headline = String(plan?.headline || `${user.firstName || "Your"}'s path to ${fmt.format(Number(plan?.northStarTarget || 0))} sq ft`);
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
    return accounts.filter((account) => {
      const tier = account.intelligence?.recommendedTier || "Develop";
      const tierMatches = accountTier === "All" || tier === accountTier;
      const queryMatches =
        !query ||
        [account.accountName, account.accountType, account.market, account.status, account.intelligence?.strategicPlay]
          .some((value) => value?.toLowerCase().includes(query));
      return tierMatches && queryMatches;
    });
  }, [accounts, accountQuery, accountTier]);

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
    const acc = (await apiGet(`/api/sales-ops/me/accounts?limit=50&cursor=${encodeURIComponent(accountsCursor)}`, sessionToken)) as {
      accounts: Account[];
      nextCursor?: string | null;
    };
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

  const selectedRamp = ramp.find((item) => item.period === form.period) ?? ramp[0];
  const insights = { ...DEFAULT_INSIGHTS, ...(planBundle?.insights || {}) };
  const showInsight = (key: string) => {
    if (insights[key]) setInsight(insights[key]);
  };
  const tabs: [Tab, string, string, boolean][] = [
    ["overview", "01", "Overview", true],
    ["performance", "02", "Performance", true],
    ["accounts", "03", "Accounts", true],
    ["plan", "04", "Plan", true],
    ["entry", "05", "Scorecards", true],
    ["commission", "06", "Commission", true],
    ["team", "07", "Team Performance", Boolean((me?.access as { isManager?: boolean; isOrgAdmin?: boolean } | undefined)?.isManager || (me?.access as { isOrgAdmin?: boolean } | undefined)?.isOrgAdmin)],
    ["admin", "08", "Plan Builder", Boolean((me?.access as { canAdministerPlans?: boolean } | undefined)?.canAdministerPlans)],
    ["identity", "09", "Identity Review", Boolean((me?.access as { isOrgAdmin?: boolean } | undefined)?.isOrgAdmin)]
  ];

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
        <header className="site-header">
          <div className="header-glow" />
          <div className="hero-fallback" aria-hidden="true" />
          <div className="hero shell">
            <div className="hero-copy">
              <p className="eyebrow">{String(plan?.territoryName || "Sales territory")}</p>
              <h1>
                {headline.replace(/(\d[\d,]*\s*sq ft)/i, "")}
                <br />
                <em>{fmt.format(Number(plan?.northStarTarget || 0))} sq ft.</em>
              </h1>
              <p>{String(plan?.subtitle || "A measurable operating system from territory launch to repeatable, durable growth.")}</p>
            </div>
            <div className="hero-target">
              <span>North star</span>
              <strong>{fmt.format(Number(plan?.northStarTarget || 0))}</strong>
              <small>
                {String(plan?.northStarMetric || "installed sq ft / month")}
                <br />
                {plan?.northStarTargetDate ? `by ${String(plan.northStarTargetDate)}` : ""}
              </small>
            </div>
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
          {loadError && <div className="stale-banner"><b>Could not load Sales Ops.</b> {loadError}</div>}
          {integration.stale && (
            <div className="stale-banner">
              <b>Monday cache may be stale.</b> Last successful sync: {integration.lastSuccessAt || "never"}. Plan and scorecards remain available.
            </div>
          )}

          {tab === "overview" && (
            <div className="tab-page">
              {!plan && <div className="empty-banner"><div><p className="kicker">No active plan</p><h3>A manager or admin needs to publish your sales plan.</h3></div></div>}
              {Boolean((me as { upcomingPlan?: { planName?: string; effectiveStartDate?: string } } | null)?.upcomingPlan) && (
                <div className="stale-banner">
                  <b>Upcoming plan.</b> {(me as { upcomingPlan?: { planName?: string; effectiveStartDate?: string } }).upcomingPlan?.planName} is scheduled for {(me as { upcomingPlan?: { effectiveStartDate?: string } }).upcomingPlan?.effectiveStartDate}. It is not your active plan yet.
                </div>
              )}
              {plan && !plan.acknowledgedAt && (
                <div className="ack-banner">
                  <div>
                    <p className="kicker">Acknowledgment</p>
                    <h3>A new published plan is ready for you to acknowledge.</h3>
                  </div>
                  <button className="primary-button" type="button" onClick={() => void acknowledgePlan()}>Acknowledge plan</button>
                </div>
              )}
              <div className="section-heading split-heading">
                <div>
                  <p className="kicker">{String(plan?.planName || "The operating system")}</p>
                  <h2>One outcome. Clear behaviors.<br />Shared ownership.</h2>
                </div>
                <p>{String((planBundle as { planCopy?: { introduction?: string } } | null)?.planCopy?.introduction || plan?.subtitle || "Installed square feet is the outcome. Pipeline, account movement and disciplined activity tell us early whether the territory is on course.")}</p>
              </div>
              <div className="north-star-grid">
                <article className="feature-card dark-card explorable" role="button" tabIndex={0} onClick={() => showInsight("installed")}>
                  <span className="card-index">01 / RESULT</span>
                  <h3>Credited installed<br />square feet</h3>
                  <p>The formal monthly result, coached with a rolling three-month view.</p>
                  <div className="card-stat">
                    <strong>{fmt.format(Number(plan?.northStarTarget || 0))}</strong>
                    <span>north star</span>
                  </div>
                </article>
                <article className="feature-card texture-card explorable" role="button" tabIndex={0} onClick={() => showInsight("pipeline")}>
                  <span className="card-index">02 / SIGNAL</span>
                  <h3>Qualified<br />pipeline coverage</h3>
                  <p>Named opportunities with square feet, decision path, next action and realistic install timing.</p>
                </article>
                <article className="feature-card light-card explorable" role="button" tabIndex={0} onClick={() => showInsight("engine")}>
                  <span className="card-index">03 / ENGINE</span>
                  <h3>Activity that<br />creates a next step</h3>
                  <div className="mini-metrics">
                    {(planBundle?.metricTargets || []).slice(0, 4).map((m) => (
                      <button type="button" key={String(m.metricKey)} onClick={(event) => { event.stopPropagation(); showInsight("engine"); }}>
                        <strong>{String(m.targetValue)}</strong>
                        <span>{String(m.label)}</span>
                        <i aria-hidden="true">↗</i>
                      </button>
                    ))}
                  </div>
                </article>
              </div>
              {planHistory.length > 0 && (
                <div className="plan-history">
                  <p className="kicker">Published plan history</p>
                  <ul>
                    {planHistory.map((row) => (
                      <li key={String(row.id)}>
                        <strong>{String(row.planName || "Plan")}</strong>
                        <span>v{String(row.versionNumber || 1)} · {String(row.status)}</span>
                        <small>{String(row.effectiveStartDate || "—")} → {String(row.effectiveEndDate || "open")}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "performance" && (
            <div className="tab-page">
              <div className="section-heading split-heading progress-heading">
                <div>
                  <p className="kicker">
                    {scopedUserId
                      ? `${salespersonDisplayName(
                          String(
                            (teamPerformance?.rows || []).find((row) => String(row.userId) === scopedUserId)?.displayName ||
                              ""
                          )
                        )} · team member performance`
                      : `Current month ${performance?.period || ""}`}
                  </p>
                  <h2>Goal versus actual square feet.</h2>
                </div>
                {(teamPerformance?.rows || []).length > 0 ? (
                  <label>
                    Salesperson
                    <select
                      value={scopedUserId || ""}
                      onChange={(e) => setScopedUserId(e.target.value || null)}
                    >
                      <option value="">My performance</option>
                      {(teamPerformance?.rows || []).map((row) => (
                        <option key={String(row.userId)} value={String(row.userId)}>
                          {salespersonDisplayName(String(row.displayName || ""))}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : scopedUserId ? (
                  <button type="button" className="text-link" onClick={() => setScopedUserId(null)}>
                    My performance
                  </button>
                ) : null}
              </div>
              {performance?.currentMonth?.actualStatus && performance.currentMonth.actualStatus !== "AVAILABLE" && (
                <div className="stale-banner">
                  <b>{performance.currentMonth.actualStatus.split("_").join(" ")}.</b>{" "}
                  {performance.actualSfDefinition?.note || "Actual SF is not treated as zero when the governed source is unavailable."}
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

          {tab === "entry" && selectedRamp && (
            <div className="tab-page">
              <form className="entry-layout" onSubmit={(e) => void saveScorecard(e)}>
                <div className="entry-main">
                  <div className="form-section month-section">
                    <div>
                      <label htmlFor="month">Reporting month</label>
                      <select id="month" value={form.period} onChange={(e) => change("period", e.target.value)}>
                        {ramp.map((item) => (
                          <option value={item.period} key={item.period}>
                            {item.label} {item.year}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="target-chip">
                      <span>Installed target</span>
                      <strong>
                        {fmt.format(Number(selectedRamp.installedTarget))} <small>sq ft</small>
                      </strong>
                    </div>
                  </div>
                  <div className="form-section">
                    <div className="field-grid three">
                      {(["installed", "quoted", "awarded"] as const).map((field) => (
                        <div className="field-control" key={field}>
                          <label htmlFor={field}>
                            {field} sq ft <span className={`source-chip ${sourceLabel(scorecards.find((s) => s.period === form.period)?.sources?.[field]).cls}`}>{sourceLabel(scorecards.find((s) => s.period === form.period)?.sources?.[field]).text}</span>
                          </label>
                          <input id={field} type="number" min="0" value={form[field]} onChange={(e) => change(field, e.target.value)} />
                        </div>
                      ))}
                    </div>
                    <div className="field-grid two" style={{ marginTop: 18 }}>
                      <div className="field-control">
                        <label htmlFor="pipeline">Qualified 90-day pipeline</label>
                        <input id="pipeline" type="number" min="0" value={form.pipeline} onChange={(e) => change("pipeline", e.target.value)} />
                      </div>
                      <div className="field-control">
                        <label htmlFor="note">Manager note</label>
                        <textarea id="note" value={form.note} onChange={(e) => change("note", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
                <aside className="entry-aside">
                  <div className="preview-card">
                    <p className="kicker">Live preview</p>
                    <h3>
                      {selectedRamp.label} {selectedRamp.year}
                    </h3>
                    <button className="save-button" type="submit">
                      Save scorecard <ArrowIcon />
                    </button>
                    {saved && <div className="save-confirmation">Scorecard saved to eliteOS.</div>}
                  </div>
                  <div className="privacy-note">
                    <span>Brain persistence</span>
                    <p>Marks are stored in eliteOS for your authenticated user. They are not kept in this browser as the authority.</p>
                  </div>
                </aside>
              </form>
            </div>
          )}

          {tab === "accounts" && (
            <div className="tab-page account-page">
              <div className="account-integrity">
                <div className="integrity-mark"><span>✓</span></div>
                <div>
                  <p className="kicker">Source-of-truth protection</p>
                  <h3>Monday owns assignment. Historical production is evidence—not ownership.</h3>
                  <p>{accountListScopeCopy(me?.access as { isOrgAdmin?: boolean; isManager?: boolean } | undefined)}</p>
                </div>
                <small>
                  Synced
                  <br />
                  <b>{accounts[0]?.syncedAt ? String(accounts[0].syncedAt).slice(0, 10) : "awaiting sync"}</b>
                </small>
              </div>
              <div className="account-workbench">
                <div>
                  <p className="kicker">Priority workbench</p>
                  <h2>{filteredAccounts.length} accounts in view</h2>
                </div>
                <div className="account-controls">
                  <label>
                    <span>Find an account</span>
                    <input type="search" value={accountQuery} onChange={(e) => setAccountQuery(e.target.value)} placeholder="Search name, market, type…" />
                  </label>
                  <div className="tier-filters">
                    {["All", "Anchor candidate", "Growth", "Reactivate", "Develop"].map((tier) => (
                      <button type="button" key={tier} className={accountTier === tier ? "active" : ""} onClick={() => setAccountTier(tier)}>
                        {tier === "Anchor candidate" ? "Anchor" : tier}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="account-grid">
                {filteredAccounts.map((account) => {
                  const performance = account.intelligence?.performance;
                  const tier = account.intelligence?.recommendedTier || "Develop";
                  const tone = tier.toLowerCase().replace(" candidate", "");
                  return (
                    <article className={`account-card ${tone}`} key={account.id} role="button" tabIndex={0} onClick={() => void openAccount(account)}>
                      <div className="account-card-top">
                        <span className="tier-chip"><i />{tier}</span>
                        <small>{account.status || "Status not set"}</small>
                      </div>
                      <h3>{account.accountName}</h3>
                      <p className="account-play">{account.intelligence?.strategicPlay || "Qualify potential"}</p>
                      {performance ? (
                        <div className="account-performance">
                          <div><strong>{fmt.format(Number(performance.trailing12SqFt || 0))}</strong><span>TTM sq ft</span></div>
                          <div><strong>{performance.trailing12Jobs || 0}</strong><span>jobs</span></div>
                        </div>
                      ) : (
                        <div className="account-performance-empty"><span>No verified production match</span><b>Qualify the potential</b></div>
                      )}
                      <div className="account-card-foot"><span>{account.market || account.branch || "Profile incomplete"}</span><b>Open workspace <ArrowIcon /></b></div>
                    </article>
                  );
                })}
                {accountsCursor && (
                  <button type="button" onClick={() => void loadMoreAccounts()}>Load more accounts</button>
                )}
              </div>
            </div>
          )}

          {tab === "plan" && (
            <div className="tab-page">
              {planBundle ? (
                <PlanExperience
                  bundle={planBundle as ExperienceBundle}
                  book={planBook}
                  salespersonName={salespersonDisplayName(user.fullName, user.firstName)}
                  performance={performance}
                  compensation={planBook?.compensation || null}
                  showCompensation={Boolean(plan?.commissionEnabled)}
                />
              ) : (
                <div className="section-heading">
                  <p className="kicker">Assigned plan</p>
                  <h2>No published plan</h2>
                  <p>Your assigned operating plan will appear here after it is published.</p>
                </div>
              )}
              {planHistory.length > 0 && (
                <div className="plan-history">
                  <p className="kicker">Published plan history</p>
                  <ul>
                    {planHistory.map((row) => (
                      <li key={String(row.id)}>
                        <strong>{String(row.planName || "Plan")}</strong>
                        <span>v{String(row.versionNumber || 1)} · {String(row.status)}</span>
                        <small>{String(row.effectiveStartDate || "—")} → {String(row.effectiveEndDate || "open")}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "commission" && (
            <div className="tab-page">
              {!commission?.enabled ? (
                <div className="gated-banner">
                  <b>Commission is not enabled for this plan.</b> No other salesperson’s commission evidence is shown. Enablement is a per-plan feature, not a shared ledger.
                </div>
              ) : (
                <div>
                  <p className="kicker">Your commission snapshot</p>
                  <h2>Scoped to your assignment.</h2>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(commission.snapshot || {}, null, 2)}</pre>
                </div>
              )}
              {commission && "compensation" in commission && commission.compensation ? (
                <div className="commission-config">
                  <p className="kicker">Compensation configuration</p>
                  <h2>{(commission.compensation as { finallyApproved?: boolean }).finallyApproved ? "Approved" : "Proposal — not finally approved"}</h2>
                  <p className="workspace-muted">
                    Performance targets, commission eligibility, rates, and payment approval stay separate. Locked or paid
                    monthly reports never silently recalculate.
                  </p>
                  <small>
                    Workflow: {String(((commission.compensation as { workflow?: string[] }).workflow || []).join(" → "))}
                  </small>
                </div>
              ) : null}
            </div>
          )}

          {tab === "team" && (
            <div className="tab-page">
              <p className="kicker">Team performance</p>
              <h2>Governed scope only.</h2>
              <p className="workspace-muted">Sales sees self. Managers see assigned reports. Admin/executive sees the organization. Actual SF stays unavailable until worksheet completed-first-install fields exist on Moraware prepared facts.</p>
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
                      setScopedUserId(String(row.userId));
                      setTab("performance");
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

          {tab === "admin" && sessionToken && (
            <PlanAdmin
              token={sessionToken}
              access={(me?.access as { isOrgAdmin?: boolean; canPublishPlans?: boolean }) || {}}
              onChanged={() => void reload()}
              onOpenIdentityReview={() => setTab("identity")}
            />
          )}

          {tab === "identity" && sessionToken && (
            <IdentityReview
              token={sessionToken}
              access={(me?.access as { isOrgAdmin?: boolean }) || {}}
            />
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
