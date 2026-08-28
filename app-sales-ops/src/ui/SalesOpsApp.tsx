import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import EliteosTopbar from "../../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../../shared/eliteos-ui/EliteosTopbar";
import { apiGet, apiPatch, apiPost, apiPut, ApiError } from "../lib/api";
import { getSupabase } from "../lib/supabase";
import PlanAdmin from "./PlanAdmin";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

type Tab = "overview" | "progress" | "entry" | "accounts" | "rhythms" | "commission" | "team" | "admin";

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

type Account = {
  id: string;
  accountDirectoryAccountId?: string | null;
  mondayItemId?: string | null;
  accountName: string;
  mondayUrl?: string | null;
  status?: string | null;
  lastContact?: string | null;
  nextContact?: string | null;
  market?: string | null;
  branch?: string | null;
  accountType?: string | null;
  sampleProgram?: string | null;
  currentPrimarySupplier?: string | null;
  primaryPainPoint?: string | null;
  esfSolution?: string | null;
  nextStrategicMilestone?: string | null;
  description?: string | null;
  syncedAt?: string | null;
  columns?: Array<{ columnId: string; title?: string | null; type?: string | null; text?: string | null }>;
  intelligence?: {
    recommendedTier?: string | null;
    strategicPlay?: string | null;
    recommendedMonthlyTarget?: number | null;
    nextActions?: string[];
    performance?: {
      trailing12SqFt?: number;
      trailing12Jobs?: number;
      openTrailing12SqFt?: number;
      averageJobSqFt?: number;
      lastJobDate?: string | null;
      matchedReportNames?: string[];
      matchConfidence?: string;
      yearOverYearPct?: number | null;
    } | null;
  } | null;
};

const DEFAULT_INSIGHTS: Record<string, Insight> = {
  installed: {
    eyebrow: "01 / Result",
    title: "Credited installed square feet",
    lead: "Square feet count when the work is installed and credited under the plan’s rules—not when it is discussed, quoted, or merely awarded.",
    sections: [
      { title: "What counts", items: ["Eligible square footage installed in the reporting month", "Credit applied under the signed rules"] },
      { title: "How it is coached", items: ["Monthly target remains the formal goal", "A rolling three-month view separates scheduling movement from a true performance pattern"] }
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
  const [planBundle, setPlanBundle] = useState<{ plan: Record<string, unknown>; periodTargets: PeriodTarget[]; metricTargets: Array<Record<string, unknown>>; insights?: Record<string, Insight> } | null>(null);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsCursor, setAccountsCursor] = useState<string | null>(null);
  const [commission, setCommission] = useState<{ enabled: boolean; snapshot?: Record<string, unknown> | null; reason?: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [form, setForm] = useState<Scorecard>(blankScore("2026-09"));
  const [saved, setSaved] = useState(false);
  const [yearFilter, setYearFilter] = useState("all");
  const [insight, setInsight] = useState<Insight | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [workspace, setWorkspace] = useState<Record<string, unknown> | null>(null);
  const [accountTier, setAccountTier] = useState("All");
  const [accountQuery, setAccountQuery] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [followSummary, setFollowSummary] = useState("");
  const [followDate, setFollowDate] = useState("");
  const [writeError, setWriteError] = useState<string | null>(null);
  const [team, setTeam] = useState<{ reports: Array<Record<string, unknown>> } | null>(null);
  const [planHistory, setPlanHistory] = useState<Array<Record<string, unknown>>>([]);

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
      const access = meRes.access as { isManager?: boolean; canAdministerPlans?: boolean } | undefined;
      if (access?.isManager || access?.canAdministerPlans) {
        const t = (await apiGet("/api/sales-ops/team", sessionToken)) as { reports: Array<Record<string, unknown>> };
        setTeam(t);
      }
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : String((e as Error)?.message || e));
    }
  }, [sessionToken]);

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

  async function openAccount(account: Account) {
    if (!sessionToken) return;
    setSelectedAccount(account);
    setWriteError(null);
    const data = (await apiGet(`/api/sales-ops/accounts/${account.id}`, sessionToken)) as Record<string, unknown>;
    const updates = (await apiGet(`/api/sales-ops/accounts/${account.id}/updates?limit=50`, sessionToken)) as {
      updates?: Array<Record<string, unknown>>;
    };
    setWorkspace({ ...data, updates: updates.updates || [] });
    setSelectedAccount((data.account as Account) || account);
  }

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
    ["overview", "01", "Plan overview", true],
    ["progress", "02", "Progress", true],
    ["entry", "03", "Performance marks", true],
    ["accounts", "04", "Account strategy", true],
    ["rhythms", "05", "Rhythms", true],
    ["commission", "06", "Commission", true],
    ["team", "07", "Team", Boolean((me?.access as { isManager?: boolean; isOrgAdmin?: boolean } | undefined)?.isManager || (me?.access as { isOrgAdmin?: boolean } | undefined)?.isOrgAdmin)],
    ["admin", "08", "Plan admin", Boolean((me?.access as { canAdministerPlans?: boolean } | undefined)?.canAdministerPlans)]
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

          {tab === "progress" && (
            <div className="tab-page">
              <div className="section-heading split-heading progress-heading">
                <div>
                  <p className="kicker">Live scorecard</p>
                  <h2>Performance at a glance.</h2>
                </div>
                <div className="heading-actions">
                  <StatusPill status={latest.status || "pending"} />
                  <button className="primary-button" onClick={() => setTab("entry")}>
                    Update marks <ArrowIcon />
                  </button>
                </div>
              </div>
              <div className="score-grid">
                <article className="score-card hero-score">
                  <span>Installed sq ft</span>
                  <div className="score-value">
                    <strong>{fmt.format(Number(latest.latest?.installed || 0))}</strong>
                    <small>/ {fmt.format(Number(latest.latestRamp?.installedTarget || 0))}</small>
                  </div>
                  <Meter value={Number(latest.attainment || 0)} />
                </article>
                <article className="score-card">
                  <span>Rolling 3-month result</span>
                  <div className="score-value">
                    <strong>{fmt.format(Number(latest.recentActual || 0))}</strong>
                    <small>/ {fmt.format(Number(latest.latestRamp?.rollingThreeMonthTarget || 0))}</small>
                  </div>
                  <Meter value={Number(latest.rollingAttainment || 0)} tone="gold" />
                </article>
                <article className="score-card">
                  <span>90-day pipeline</span>
                  <div className="score-value">
                    <strong>{Number(latest.pipelineCoverage || 0).toFixed(1)}×</strong>
                    <small>/ 3.0×</small>
                  </div>
                  <Meter value={Number(latest.pipelineCoverage || 0) * 100} tone="green" />
                </article>
                <article className="score-card">
                  <span>Close rate by sq ft</span>
                  <div className="score-value">
                    <strong>{pct(Number(latest.closeRate || 0))}</strong>
                    <small>/ {latest.closeRateStandard || 35}%</small>
                  </div>
                  <Meter value={(Number(latest.closeRate || 0) / Number(latest.closeRateStandard || 35)) * 100} />
                </article>
              </div>
              <div className="chart-card">
                <div className="chart-head">
                  <div>
                    <p className="kicker">The ramp</p>
                    <h3>Target vs. actual installed sq ft</h3>
                  </div>
                  <div className="chart-controls">
                    {["all", ...rampYears].map((year) => (
                      <button key={year} onClick={() => setYearFilter(year)} className={yearFilter === year ? "active" : ""}>
                        {year === "all" ? "All" : year}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bar-chart" style={{ gridTemplateColumns: `repeat(${Math.max(filteredRamp.length, 1)}, minmax(18px, 1fr))` }}>
                  {filteredRamp.map((item) => {
                    const actual = Number(scorecards.find((r) => r.period === item.period)?.installed ?? 0);
                    return (
                      <button type="button" className="bar-group" key={item.period}>
                        <div className="bars">
                          <i className="actual-bar" style={{ height: `${(actual / maxChart) * 100}%` }} />
                          <i className="target-bar" style={{ height: `${(Number(item.installedTarget) / maxChart) * 100}%` }} />
                        </div>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
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
                  <p>You only see accounts currently assigned to you. Unmapped Monday owners stay hidden.</p>
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

          {tab === "rhythms" && (
            <div className="tab-page rhythm-page">
              <div className="section-heading">
                <p className="kicker">The operating cadence</p>
                <h2>Know the win. Run the week.</h2>
              </div>
              <section className="rhythm-hero">
                <div className="rhythm-month-control">
                  <p className="kicker">Monthly north star</p>
                  <p>{String((plan?.rhythms as { monthly?: string } | undefined)?.monthly || "KPI standards are loaded from your assigned plan. Activity automation stays off until evidence is reliable.")}</p>
                </div>
                <div className="rhythm-target-main">
                  <span>Installed target</span>
                  <strong>{fmt.format(Number(selectedRamp?.installedTarget || 0))}</strong>
                </div>
              </section>
              {Boolean((plan?.rhythms as { weekly?: string } | undefined)?.weekly) && (
                <p>{String((plan?.rhythms as { weekly?: string }).weekly)}</p>
              )}
              {Boolean((plan?.rhythms as { quarterly?: string } | undefined)?.quarterly) && (
                <p>{String((plan?.rhythms as { quarterly?: string }).quarterly)}</p>
              )}
              <div className="mini-metrics" style={{ maxWidth: 720, marginTop: 32 }}>
                {(planBundle?.metricTargets || []).map((m) => (
                  <button type="button" key={String(m.metricKey)}>
                    <strong>{String(m.targetValue)}</strong>
                    <span>{String(m.label)} · {String(m.cadence)}</span>
                  </button>
                ))}
              </div>
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
            </div>
          )}

          {tab === "team" && (
            <div className="tab-page">
              <p className="kicker">Direct reports</p>
              <h2>Only explicitly assigned people.</h2>
              {(team?.reports || []).map((r) => (
                <article key={String(r.userId)} className="form-section">
                  <h3>{String(r.planName || r.userId)}</h3>
                  <p>Plan {String(r.planId || "none")}</p>
                </article>
              ))}
              {(team?.reports || []).length === 0 && <p>No direct reports are assigned to you.</p>}
            </div>
          )}

          {tab === "admin" && sessionToken && (
            <PlanAdmin
              token={sessionToken}
              access={(me?.access as { isOrgAdmin?: boolean; canPublishPlans?: boolean }) || {}}
              onChanged={() => void reload()}
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
        <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setSelectedAccount(null)}>
          <section className="insight-modal account-modal" role="dialog">
            <button className="modal-close" type="button" onClick={() => setSelectedAccount(null)}>
              <span />Close
            </button>
            <div className="modal-rail"><span>ESF</span><small>Account workspace</small></div>
            <div className="modal-content">
              <p className="kicker">{selectedAccount.intelligence?.recommendedTier || "Account"} / {selectedAccount.intelligence?.strategicPlay || "Qualify"}</p>
              <h2>{selectedAccount.accountName}</h2>
              <div className="account-facts">
                <div><span>Monday status</span><strong>{selectedAccount.status || "Not set"}</strong></div>
                <div><span>Next contact</span><strong>{selectedAccount.nextContact || "Needs a date"}</strong></div>
                <div><span>Market</span><strong>{selectedAccount.market || selectedAccount.branch || "Not set"}</strong></div>
                <div><span>Synced</span><strong>{selectedAccount.syncedAt ? String(selectedAccount.syncedAt).slice(0, 16) : "—"}</strong></div>
              </div>
              {writeError && <div className="field-error">{writeError}</div>}
              <div className="workspace-ops">
                {integration.mondayWriteEnabled === false && (
                  <p className="kicker">Monday writes are disabled. Account fields stay read-only until separately approved.</p>
                )}
                {selectedAccount.description && <p>{selectedAccount.description}</p>}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void patchField("status", String(fd.get("status") || ""));
                  }}
                >
                  <p className="kicker">Account profile</p>
                  <label>
                    Status
                    <input name="status" defaultValue={selectedAccount.status || ""} />
                  </label>
                  <button type="submit">Save mapped field</button>
                </form>
                <div>
                  <p className="kicker">Follow-up</p>
                  <input placeholder="Summary" value={followSummary} onChange={(e) => setFollowSummary(e.target.value)} />
                  <input type="date" value={followDate} onChange={(e) => setFollowDate(e.target.value)} />
                  <button type="button" onClick={() => void saveFollowUp()}>Save follow-up</button>
                </div>
                <div className="note-composer">
                  <p className="kicker">Notes</p>
                  {((workspace?.updates as Array<Record<string, unknown>>) || []).map((a) => (
                    <div className="activity-row" key={String(a.id || a.mondayUpdateId)}>
                      <b>{String(a.bodyText || a.summary || "")}</b>
                      <small>{String(a.mondayCreatedAt || a.occurredAt || "")} · {String(a.creatorName || "")}</small>
                    </div>
                  ))}
                  <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a Monday update…" />
                  <button type="button" onClick={() => void saveNote()}>Add note</button>
                </div>
                {(selectedAccount.intelligence?.nextActions || []).length > 0 && (
                  <div>
                    <p className="kicker">Next moves</p>
                    <ol className="account-actions">
                      {(selectedAccount.intelligence?.nextActions || []).map((action, index) => (
                        <li key={action}>
                          <span>0{index + 1}</span>
                          <p>
                            {action}{" "}
                            <button type="button" onClick={() => { setFollowSummary(action); setTab("accounts"); }}>
                              Convert to follow-up
                            </button>
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
              <div className="account-modal-foot">
                <p><b>Ownership rule:</b> Monday.com Account Master List is the source of truth.</p>
                {selectedAccount.mondayUrl && (
                  <a href={selectedAccount.mondayUrl} target="_blank" rel="noreferrer">
                    Open account in Monday <ArrowIcon />
                  </a>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
