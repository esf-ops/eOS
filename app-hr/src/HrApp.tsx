import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "./lib/api";
import { hrApiErrorMessage, isHrManagerRole } from "./lib/hrRoles";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import EosSectionCard from "../../shared/eliteos-ui/EosSectionCard";
import EosPanelHead from "../../shared/eliteos-ui/EosPanelHead";
import EosStatusPill from "../../shared/eliteos-ui/EosStatusPill";
import EosMetricCard, { EosMetricGrid } from "../../shared/eliteos-ui/EosMetricCard";
import EosAlertBanner from "../../shared/eliteos-ui/EosAlertBanner";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

type TabId = "dashboard" | "log" | "history" | "categories";

type GradeRow = {
  employeeKey: string;
  employeeId: string;
  employeeSource: string;
  fullName: string;
  email: string;
  role: string;
  jobTitle: string;
  department: string;
  isTest?: boolean;
  letterGrade: string;
  mistakeCount: number;
  weightedMistakeCount: number;
  priorLetterGrade: string | null;
  trend: "up" | "down" | "flat" | "neutral";
};

type DashboardPayload = {
  ok?: boolean;
  canManageCategories?: boolean;
  manager?: boolean;
  weekStart?: string;
  weekEnd?: string;
  weekLabel?: string;
  rows?: GradeRow[];
  schemaReady?: boolean;
  warning?: string;
};

type Employee = {
  id: string;
  employeeKey: string;
  employeeSource: string;
  fullName: string;
  email: string;
  role: string;
  jobTitle: string;
  department: string;
  isTest?: boolean;
};

type Category = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

type Mistake = {
  id: string;
  employee_user_id: string;
  category_label: string;
  severity: string;
  description: string | null;
  occurred_at: string;
};

type Snapshot = {
  week_start: string;
  weekLabel?: string;
  letter_grade: string;
  mistake_count: number;
  weighted_mistake_count: number;
  category_breakdown: Record<string, number>;
};

function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

function deriveDisplayNameFromEmail(email: string): string {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.includes("@") ? e.split("@")[0] : e;
  const words = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return e;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) {
    const local = e.includes("@") ? e.split("@")[0] : e;
    return local.slice(0, 2).toUpperCase();
  }
  return "HR";
}

function gradePillTone(grade: string): "success" | "info" | "warn" | "neutral" {
  switch (grade.toUpperCase()) {
    case "A":
      return "success";
    case "B":
      return "info";
    case "C":
    case "D":
    case "F":
      return "warn";
    default:
      return "neutral";
  }
}

function trendLabel(trend: GradeRow["trend"]): string {
  if (trend === "up") return "↑ vs last week";
  if (trend === "down") return "↓ vs last week";
  if (trend === "flat") return "→ same as last week";
  return "New week";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function HrApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userJobTitle, setUserJobTitle] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userId, setUserId] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("dashboard");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [historyEmployeeId, setHistoryEmployeeId] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [weekMistakes, setWeekMistakes] = useState<Mistake[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const [logEmployeeId, setLogEmployeeId] = useState("");
  const [logCategoryId, setLogCategoryId] = useState("");
  const [logSeverity, setLogSeverity] = useState("minor");
  const [logDescription, setLogDescription] = useState("");
  const [logBusy, setLogBusy] = useState(false);
  const [logSuccess, setLogSuccess] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSessionToken(data.session?.access_token ?? null);
      const u = data.session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
      setUserId(u?.id ?? "");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
      const u = session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
      setUserId(u?.id ?? "");
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    (async () => {
      try {
        const me = (await apiGet("/api/me", sessionToken)) as {
          user?: { id?: string; role?: string; job_title?: string; department?: string };
        };
        if (!cancelled) {
          setUserRole(String(me?.user?.role ?? "").trim());
          setUserJobTitle(String(me?.user?.job_title ?? "").trim());
          setUserDepartment(String(me?.user?.department ?? "").trim());
          if (me?.user?.id) setUserId(String(me.user.id));
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const canManageCategories = Boolean(
    dashboard?.canManageCategories ?? dashboard?.manager ?? isHrManagerRole(userRole)
  );

  const loadDashboard = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr(null);
    try {
      const res = (await apiGet("/api/hr/workforce/dashboard", sessionToken)) as DashboardPayload;
      setDashboard(res);
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to load HR workforce data."));
    } finally {
      setBusy(false);
    }
  }, [sessionToken]);

  const loadEmployees = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = (await apiGet("/api/hr/workforce/employees", sessionToken)) as {
        employees?: Employee[];
      };
      setEmployees(res.employees ?? []);
    } catch {
      /* non-fatal */
    }
  }, [sessionToken]);

  const loadCategories = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = (await apiGet("/api/hr/workforce/categories", sessionToken)) as {
        categories?: Category[];
      };
      setCategories(res.categories ?? []);
    } catch {
      /* non-fatal */
    }
  }, [sessionToken]);

  const loadHistory = useCallback(
    async (employeeId: string) => {
      if (!sessionToken || !employeeId) return;
      try {
        const res = (await apiGet(
          `/api/hr/workforce/history?employee_key=${encodeURIComponent(employeeId)}&weeks=12`,
          sessionToken
        )) as { snapshots?: Snapshot[] };
        setSnapshots(res.snapshots ?? []);
      } catch (e: unknown) {
        setErr(hrApiErrorMessage(e, "Unable to load HR workforce data."));
      }
    },
    [sessionToken]
  );

  const loadWeekMistakes = useCallback(
    async (employeeId: string, weekStart?: string) => {
      if (!sessionToken || !employeeId) return;
      try {
        const weekQ = weekStart ? `&week_start=${encodeURIComponent(weekStart)}` : "";
        const res = (await apiGet(
          `/api/hr/workforce/mistakes?employee_key=${encodeURIComponent(employeeId)}${weekQ}`,
          sessionToken
        )) as { mistakes?: Mistake[] };
        setWeekMistakes(res.mistakes ?? []);
      } catch {
        setWeekMistakes([]);
      }
    },
    [sessionToken]
  );

  useEffect(() => {
    if (!sessionToken) return;
    void loadDashboard();
    void loadEmployees();
    void loadCategories();
  }, [sessionToken, loadDashboard, loadEmployees, loadCategories]);

  useEffect(() => {
    if (!historyEmployeeId && employees[0]?.employeeKey) {
      setHistoryEmployeeId(employees[0].employeeKey);
    }
  }, [historyEmployeeId, employees]);

  useEffect(() => {
    if (tab === "history" && historyEmployeeId) void loadHistory(historyEmployeeId);
  }, [tab, historyEmployeeId, loadHistory]);

  useEffect(() => {
    if (selectedEmployeeId) void loadWeekMistakes(selectedEmployeeId, dashboard?.weekStart);
  }, [selectedEmployeeId, dashboard?.weekStart, loadWeekMistakes]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) throw error;
      setSessionToken(data.session?.access_token ?? null);
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setDashboard(null);
  }, [supabase]);

  const submitMistake = useCallback(async () => {
    if (!sessionToken || !logEmployeeId) return;
    setLogBusy(true);
    setLogSuccess(null);
    setErr(null);
    try {
      await apiPost("/api/hr/workforce/mistakes", sessionToken, {
        employee_key: logEmployeeId,
        category_id: logCategoryId || null,
        severity: logSeverity,
        description: logDescription.trim() || null
      });
      setLogSuccess("Mistake logged.");
      setLogDescription("");
      void loadDashboard();
      if (selectedEmployeeId === logEmployeeId) {
        void loadWeekMistakes(logEmployeeId, dashboard?.weekStart);
      }
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to load HR workforce data."));
    } finally {
      setLogBusy(false);
    }
  }, [
    sessionToken,
    logEmployeeId,
    logCategoryId,
    logSeverity,
    logDescription,
    loadDashboard,
    selectedEmployeeId,
    loadWeekMistakes,
    dashboard?.weekStart
  ]);

  const addCategory = useCallback(async () => {
    if (!sessionToken || !newCategoryName.trim()) return;
    setCatBusy(true);
    setErr(null);
    try {
      await apiPost("/api/hr/workforce/categories", sessionToken, { name: newCategoryName.trim() });
      setNewCategoryName("");
      void loadCategories();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to load HR workforce data."));
    } finally {
      setCatBusy(false);
    }
  }, [sessionToken, newCategoryName, loadCategories]);

  const toggleCategory = useCallback(
    async (cat: Category) => {
      if (!sessionToken) return;
      try {
        await apiPatch(`/api/hr/workforce/categories/${cat.id}`, sessionToken, {
          is_active: !cat.is_active
        });
        void loadCategories();
      } catch (e: unknown) {
        setErr(hrApiErrorMessage(e, "Unable to load HR workforce data."));
      }
    },
    [sessionToken, loadCategories]
  );

  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );
  const userDisplayEmail = userEmail.trim();
  const userDisplayInitials = useMemo(
    () => userInitialsFor(userMetaName, userEmail),
    [userMetaName, userEmail]
  );
  const chipSubtitle = useMemo(() => {
    const roleTitle = (userJobTitle || userDepartment || userRole || "").trim();
    if (roleTitle) return roleTitle.replace(/_/g, " ");
    if (userDisplayEmail && userDisplayEmail.toLowerCase() !== userDisplayName.toLowerCase()) {
      return userDisplayEmail;
    }
    return "";
  }, [userDepartment, userDisplayEmail, userDisplayName, userJobTitle, userRole]);

  const myRow = useMemo(() => {
    const userKey = userId ? `user:${userId}` : "";
    return dashboard?.rows?.find((r) => r.employeeKey === userKey) ?? null;
  }, [dashboard?.rows, userId]);

  const teamAvgMistakes = useMemo(() => {
    const rows = dashboard?.rows ?? [];
    if (!rows.length) return 0;
    return Math.round((rows.reduce((s, r) => s + r.mistakeCount, 0) / rows.length) * 10) / 10;
  }, [dashboard?.rows]);

  const menuItems: EliteosTopbarMenuItem[] = [
    {
      label: "Open Home",
      meta: "eliteOS Launcher",
      href: homeLauncherUrl(),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      )
    },
    {
      label: "Refresh",
      meta: "Reload grades",
      onClick: () => void loadDashboard(),
      disabled: busy,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      )
    }
  ];

  const tabs: { id: TabId; label: string; adminOnly?: boolean }[] = [
    { id: "dashboard", label: "Grades" },
    { id: "log", label: "Log mistake" },
    { id: "history", label: "History" },
    { id: "categories", label: "Categories", adminOnly: true }
  ];

  return (
    <div className="shell">
      {sessionToken ? (
        <EliteosTopbar
          appName="HR"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={EOS_LOGO_URL}
          homeHref="/"
          userName={userDisplayName}
          userEmail={userDisplayEmail}
          userSubtitle={chipSubtitle}
          initials={userDisplayInitials}
          menuItems={menuItems}
          onSignOut={() => void signOut()}
        />
      ) : (
        <EliteosTopbar
          appName="HR"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={EOS_LOGO_URL}
          homeHref="/"
        />
      )}

      <main className="main" role="main">
        {!sessionToken ? (
          <div className="auth-panel auth-panel-standalone">
            <div className="auth-panel-header">
              <p className="auth-panel-eyebrow">eliteOS · HR Head</p>
              <h1 className="auth-panel-title">Workforce quality grading</h1>
              <p className="auth-panel-sub">
                Sign in with your eliteOS account. Log mistakes and view weekly letter grades for your team.
              </p>
            </div>
            <div className="field-grid">
              <label className="field">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void signIn();
                  }}
                />
              </label>
            </div>
            {authError ? <div className="banner banner-error">{authError}</div> : null}
            <button type="button" className="btn btn-primary" disabled={authBusy} onClick={() => void signIn()}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        ) : (
          <>
            <section className="hr-hero">
              <div className="hr-hero-aurora" aria-hidden />
              <div className="hr-hero-grid">
                <div>
                  <p className="hero-eyebrow">Internal tool · HR Head</p>
                  <h1 className="hero-title">Workforce quality grading</h1>
                  <p className="hero-sub">
                    Weekly letter grades reset every Monday. Anyone with HR Head access can log mistakes;
                    history is kept for performance reviews.
                  </p>
                  {dashboard?.weekLabel ? (
                    <p className="hr-week-label">
                      Current week: <strong>{dashboard.weekLabel}</strong>
                    </p>
                  ) : null}
                </div>
                {myRow ? (
                  <div className="hr-my-grade-card">
                    <div className="hr-my-grade-label">Your grade this week</div>
                    <div className={`hr-grade-badge hr-grade-badge--${myRow.letterGrade.toLowerCase()}`}>
                      {myRow.letterGrade}
                    </div>
                    <div className="hr-my-grade-meta">
                      {myRow.mistakeCount} mistake{myRow.mistakeCount === 1 ? "" : "s"} · {trendLabel(myRow.trend)}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {dashboard?.warning ? <EosAlertBanner tone="warn">{dashboard.warning}</EosAlertBanner> : null}
            {err ? <div className="banner banner-error">{err}</div> : null}

            <nav className="hr-tabs" aria-label="HR sections">
              {tabs
                .filter((t) => !t.adminOnly || canManageCategories)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`hr-tab${tab === t.id ? " hr-tab--active" : ""}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
            </nav>

            {tab === "dashboard" ? (
              <>
                <EosMetricGrid className="hr-summary-grid">
                  <EosMetricCard
                    label="Team members"
                    value={String(dashboard?.rows?.length ?? 0)}
                    sub={canManageCategories ? "Active employees in your org" : "Team roster"}
                  />
                  <EosMetricCard
                    label="Avg mistakes / person"
                    value={String(teamAvgMistakes)}
                    sub="This week"
                    accent={teamAvgMistakes > 3 ? "warn" : "default"}
                  />
                  <EosMetricCard
                    label="Week resets"
                    value="Mon"
                    sub="Grades return to A at week start"
                  />
                </EosMetricGrid>

                <EosSectionCard className="hr-panel">
                  <EosPanelHead
                    title="Weekly grades"
                    subtitle="Live running score — resets each Monday to a neutral baseline"
                    status={busy ? "Loading…" : "Live"}
                    statusTone="info"
                  />
                  <div className="hr-grade-table-wrap">
                    <table className="hr-grade-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Grade</th>
                          <th>Mistakes</th>
                          <th>Trend</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(dashboard?.rows ?? []).map((row) => (
                          <tr
                            key={row.employeeKey}
                            className={selectedEmployeeId === row.employeeKey ? "is-selected" : ""}
                          >
                            <td>
                              <div className="hr-employee-cell">
                                <strong>
                                  {row.fullName}
                                  {row.isTest ? (
                                    <span className="hr-test-badge" title="Test team member">
                                      test
                                    </span>
                                  ) : null}
                                </strong>
                                <span>{row.jobTitle || row.department || row.role || row.email}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`hr-grade-chip hr-grade-chip--${row.letterGrade.toLowerCase()}`}>
                                {row.letterGrade}
                              </span>
                            </td>
                            <td>{row.mistakeCount}</td>
                            <td>
                              <EosStatusPill tone={row.trend === "up" ? "success" : row.trend === "down" ? "warn" : "neutral"}>
                                {trendLabel(row.trend)}
                              </EosStatusPill>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  setSelectedEmployeeId(
                                    selectedEmployeeId === row.employeeKey ? null : row.employeeKey
                                  )
                                }
                              >
                                {selectedEmployeeId === row.employeeKey ? "Hide" : "Details"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {selectedEmployeeId ? (
                    <div className="hr-detail-panel">
                      <EosPanelHead
                        title="This week's mistakes"
                        subtitle={
                          dashboard?.rows?.find((r) => r.employeeKey === selectedEmployeeId)?.fullName ?? ""
                        }
                      />
                      {weekMistakes.length === 0 ? (
                        <p className="hr-empty">No mistakes logged this week — grade A baseline.</p>
                      ) : (
                        <ul className="hr-mistake-list">
                          {weekMistakes.map((m) => (
                            <li key={m.id}>
                              <div className="hr-mistake-head">
                                <EosStatusPill tone={gradePillTone("C")}>{m.category_label}</EosStatusPill>
                                <span className="hr-mistake-sev">{m.severity}</span>
                                <time dateTime={m.occurred_at}>{formatDateTime(m.occurred_at)}</time>
                              </div>
                              {m.description ? <p className="hr-mistake-desc">{m.description}</p> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </EosSectionCard>
              </>
            ) : null}

            {tab === "log" ? (
              <EosSectionCard className="hr-panel">
                <EosPanelHead
                  title="Log a mistake"
                  subtitle="Any HR Head user can log — counts toward the employee's current week grade"
                />
                {logSuccess ? <EosAlertBanner tone="success">{logSuccess}</EosAlertBanner> : null}
                <div className="field-grid hr-log-grid">
                  <label className="field">
                    Employee
                    <select value={logEmployeeId} onChange={(e) => setLogEmployeeId(e.target.value)}>
                      <option value="">Select employee…</option>
                      {employees.map((e) => (
                        <option key={e.employeeKey} value={e.employeeKey}>
                          {e.fullName}
                          {e.isTest ? " (test)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Category
                    <select value={logCategoryId} onChange={(e) => setLogCategoryId(e.target.value)}>
                      <option value="">Other (default)</option>
                      {categories
                        .filter((c) => c.is_active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    Severity
                    <select value={logSeverity} onChange={(e) => setLogSeverity(e.target.value)}>
                      <option value="minor">Minor</option>
                      <option value="moderate">Moderate</option>
                      <option value="major">Major</option>
                    </select>
                  </label>
                  <label className="field hr-field-full">
                    Notes
                    <textarea
                      rows={3}
                      value={logDescription}
                      onChange={(e) => setLogDescription(e.target.value)}
                      placeholder="What happened? (optional)"
                    />
                  </label>
                </div>
                <div className="hr-action-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={logBusy || !logEmployeeId}
                    onClick={() => void submitMistake()}
                  >
                    {logBusy ? "Saving…" : "Log mistake"}
                  </button>
                </div>
              </EosSectionCard>
            ) : null}

            {tab === "history" ? (
              <EosSectionCard className="hr-panel">
                <EosPanelHead
                  title="Performance history"
                  subtitle="Frozen weekly snapshots — for reviews and trend analysis"
                />
                <label className="field hr-history-select">
                  Employee
                  <select
                    value={historyEmployeeId}
                    onChange={(e) => setHistoryEmployeeId(e.target.value)}
                  >
                    {employees.map((e) => (
                      <option key={e.employeeKey} value={e.employeeKey}>
                        {e.fullName}
                        {e.isTest ? " (test)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {snapshots.length === 0 ? (
                  <p className="hr-empty">No closed weeks yet. Snapshots appear after each Monday reset.</p>
                ) : (
                  <div className="hr-history-grid">
                    {snapshots.map((s) => (
                      <div key={s.week_start} className="hr-history-card">
                        <div className="hr-history-week">{s.weekLabel ?? s.week_start}</div>
                        <div className={`hr-grade-badge hr-grade-badge--sm hr-grade-badge--${s.letter_grade.toLowerCase()}`}>
                          {s.letter_grade}
                        </div>
                        <div className="hr-history-meta">
                          {s.mistake_count} mistake{s.mistake_count === 1 ? "" : "s"}
                        </div>
                        {Object.keys(s.category_breakdown ?? {}).length ? (
                          <ul className="hr-history-cats">
                            {Object.entries(s.category_breakdown).map(([cat, n]) => (
                              <li key={cat}>
                                {cat}: {n}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </EosSectionCard>
            ) : null}

            {tab === "categories" && canManageCategories ? (
              <EosSectionCard className="hr-panel">
                <EosPanelHead
                  title="Mistake categories"
                  subtitle="Add categories as patterns emerge — supervisors pick from this list"
                />
                <div className="hr-cat-add">
                  <label className="field">
                    New category
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Takeoff error, Missed callback…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addCategory();
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={catBusy || !newCategoryName.trim()}
                    onClick={() => void addCategory()}
                  >
                    Add
                  </button>
                </div>
                <ul className="hr-cat-list">
                  {categories.map((c) => (
                    <li key={c.id} className={c.is_active ? "" : "is-inactive"}>
                      <span>{c.name}</span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void toggleCategory(c)}>
                        {c.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </li>
                  ))}
                </ul>
              </EosSectionCard>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
