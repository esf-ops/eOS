import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "./lib/api";
import { hrApiErrorMessage } from "./lib/hrRoles";
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

type TabId = "dashboard" | "log" | "history";

type SectionGradeRow = {
  sectionId: string;
  name: string;
  goalDisplay: string;
  goalNumeric: number | null;
  metricKind: string;
  gradingEnabled: boolean;
  unitLabel: string | null;
  incidentCount: number;
  actualDisplay: string;
  letterGrade: string | null;
  priorLetterGrade: string | null;
  trend: "up" | "down" | "flat" | "neutral";
};

type DashboardPayload = {
  ok?: boolean;
  canManageCategories?: boolean;
  gradingMode?: string;
  weekStart?: string;
  weekEnd?: string;
  weekLabel?: string;
  rows?: SectionGradeRow[];
  schemaReady?: boolean;
  warning?: string;
};

type Incident = {
  id: string;
  section_id: string;
  category_label: string;
  description: string | null;
  occurred_at: string;
};

type Snapshot = {
  week_start: string;
  weekLabel?: string;
  letter_grade: string | null;
  incident_count: number;
  actual_display: string | null;
  goal_display: string;
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

function gradePillTone(grade: string | null): "success" | "info" | "warn" | "neutral" {
  switch (String(grade ?? "").toUpperCase()) {
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

function trendLabel(trend: SectionGradeRow["trend"]): string {
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

function sectionNeedsManualValue(kind: string): boolean {
  return kind === "days" || kind === "production" || kind === "currency" || kind === "hours";
}

export default function HrApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userJobTitle, setUserJobTitle] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("dashboard");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [historySectionId, setHistorySectionId] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [weekIncidents, setWeekIncidents] = useState<Incident[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const [logSectionId, setLogSectionId] = useState("");
  const [logDescription, setLogDescription] = useState("");
  const [logBusy, setLogBusy] = useState(false);
  const [logSuccess, setLogSuccess] = useState<string | null>(null);

  const [valueInput, setValueInput] = useState("");
  const [valueBusy, setValueBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSessionToken(data.session?.access_token ?? null);
      const u = data.session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
      const u = session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
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
          user?: { role?: string; job_title?: string; department?: string };
        };
        if (!cancelled) {
          setUserRole(String(me?.user?.role ?? "").trim());
          setUserJobTitle(String(me?.user?.job_title ?? "").trim());
          setUserDepartment(String(me?.user?.department ?? "").trim());
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

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

  const loadHistory = useCallback(
    async (sectionId: string) => {
      if (!sessionToken || !sectionId) return;
      try {
        const res = (await apiGet(
          `/api/hr/workforce/history?section_id=${encodeURIComponent(sectionId)}&weeks=12`,
          sessionToken
        )) as { snapshots?: Snapshot[] };
        setSnapshots(res.snapshots ?? []);
      } catch (e: unknown) {
        setErr(hrApiErrorMessage(e, "Unable to load section history."));
      }
    },
    [sessionToken]
  );

  const loadWeekIncidents = useCallback(
    async (sectionId: string, weekStart?: string) => {
      if (!sessionToken || !sectionId) return;
      try {
        const weekQ = weekStart ? `&week_start=${encodeURIComponent(weekStart)}` : "";
        const res = (await apiGet(
          `/api/hr/workforce/mistakes?section_id=${encodeURIComponent(sectionId)}${weekQ}`,
          sessionToken
        )) as { mistakes?: Incident[] };
        setWeekIncidents(res.mistakes ?? []);
      } catch {
        setWeekIncidents([]);
      }
    },
    [sessionToken]
  );

  useEffect(() => {
    if (!sessionToken) return;
    void loadDashboard();
  }, [sessionToken, loadDashboard]);

  const sections = dashboard?.rows ?? [];

  useEffect(() => {
    if (!historySectionId && sections[0]?.sectionId) {
      setHistorySectionId(sections[0].sectionId);
    }
  }, [historySectionId, sections]);

  useEffect(() => {
    if (tab === "history" && historySectionId) void loadHistory(historySectionId);
  }, [tab, historySectionId, loadHistory]);

  useEffect(() => {
    if (selectedSectionId) void loadWeekIncidents(selectedSectionId, dashboard?.weekStart);
  }, [selectedSectionId, dashboard?.weekStart, loadWeekIncidents]);

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

  const submitIncident = useCallback(async () => {
    if (!sessionToken || !logSectionId) return;
    setLogBusy(true);
    setLogSuccess(null);
    setErr(null);
    try {
      await apiPost("/api/hr/workforce/mistakes", sessionToken, {
        section_id: logSectionId,
        description: logDescription.trim() || null
      });
      const sectionName = sections.find((s) => s.sectionId === logSectionId)?.name ?? "Section";
      setLogSuccess(`Incident logged for ${sectionName}. Grade updated on dashboard.`);
      setLogDescription("");
      void loadDashboard();
      if (selectedSectionId === logSectionId) {
        void loadWeekIncidents(logSectionId, dashboard?.weekStart);
      }
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to log incident."));
    } finally {
      setLogBusy(false);
    }
  }, [
    sessionToken,
    logSectionId,
    logDescription,
    loadDashboard,
    selectedSectionId,
    loadWeekIncidents,
    dashboard?.weekStart,
    sections
  ]);

  const submitSectionValue = useCallback(async () => {
    if (!sessionToken || !selectedSectionId || !valueInput.trim()) return;
    setValueBusy(true);
    setErr(null);
    try {
      await apiPost(`/api/hr/workforce/sections/${selectedSectionId}/value`, sessionToken, {
        actual_numeric: Number(valueInput),
        week_start: dashboard?.weekStart ?? undefined
      });
      setValueInput("");
      void loadDashboard();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to save section value."));
    } finally {
      setValueBusy(false);
    }
  }, [sessionToken, selectedSectionId, valueInput, dashboard?.weekStart, loadDashboard]);

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

  const gradedSections = useMemo(
    () => sections.filter((s) => s.gradingEnabled && s.letterGrade),
    [sections]
  );

  const failingSections = useMemo(
    () => gradedSections.filter((s) => s.letterGrade === "C" || s.letterGrade === "D" || s.letterGrade === "F"),
    [gradedSections]
  );

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

  const tabs: { id: TabId; label: string }[] = [
    { id: "dashboard", label: "Weekly grades" },
    { id: "log", label: "Log incident" },
    { id: "history", label: "History" }
  ];

  const selectedSection = sections.find((s) => s.sectionId === selectedSectionId) ?? null;

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
              <h1 className="auth-panel-title">Operational quality grading</h1>
              <p className="auth-panel-sub">
                Sign in with your eliteOS account. Grade operational sections weekly — not individual people.
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
              <div className="hr-hero-grid hr-hero-grid--single">
                <div>
                  <p className="hero-eyebrow">Internal tool · HR Head</p>
                  <h1 className="hero-title">Operational section grading</h1>
                  <p className="hero-sub">
                    Weekly letter grades by operational area — shop remakes, lead times, partner QC, and more.
                    Log incidents by section; grades update immediately for count-based metrics.
                  </p>
                  {dashboard?.weekLabel ? (
                    <p className="hr-week-label">
                      Current week: <strong>{dashboard.weekLabel}</strong>
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {dashboard?.warning ? <EosAlertBanner tone="warn">{dashboard.warning}</EosAlertBanner> : null}
            {err ? <div className="banner banner-error">{err}</div> : null}

            <nav className="hr-tabs" aria-label="HR sections">
              {tabs.map((t) => (
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
                    label="Graded sections"
                    value={String(gradedSections.length)}
                    sub={`${sections.length} total operational areas`}
                  />
                  <EosMetricCard
                    label="Below target"
                    value={String(failingSections.length)}
                    sub="C, D, or F this week"
                    accent={failingSections.length > 0 ? "warn" : "default"}
                  />
                  <EosMetricCard label="Week resets" value="Mon" sub="New week starts each Monday" />
                </EosMetricGrid>

                <EosSectionCard className="hr-panel">
                  <EosPanelHead
                    title="Weekly section grades"
                    subtitle="Live running score — log incidents by section to update count-based grades"
                    status={busy ? "Loading…" : "Live"}
                    statusTone="info"
                  />
                  <div className="hr-grade-table-wrap">
                    <table className="hr-grade-table hr-grade-table--sections">
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th>Actual</th>
                          <th>Goal</th>
                          <th>Grade</th>
                          <th>Trend</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map((row) => (
                          <tr
                            key={row.sectionId}
                            className={selectedSectionId === row.sectionId ? "is-selected" : ""}
                          >
                            <td>
                              <div className="hr-employee-cell">
                                <strong>{row.name}</strong>
                                <span>{row.metricKind === "count" ? "Incident count" : row.metricKind}</span>
                              </div>
                            </td>
                            <td>{row.actualDisplay}</td>
                            <td>{row.goalDisplay}</td>
                            <td>
                              {row.letterGrade ? (
                                <span className={`hr-grade-chip hr-grade-chip--${row.letterGrade.toLowerCase()}`}>
                                  {row.letterGrade}
                                </span>
                              ) : (
                                <span className="hr-grade-chip hr-grade-chip--neutral">—</span>
                              )}
                            </td>
                            <td>
                              {row.letterGrade ? (
                                <EosStatusPill
                                  tone={
                                    row.trend === "up" ? "success" : row.trend === "down" ? "warn" : "neutral"
                                  }
                                >
                                  {trendLabel(row.trend)}
                                </EosStatusPill>
                              ) : (
                                <EosStatusPill tone="neutral">No grade</EosStatusPill>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  setSelectedSectionId(
                                    selectedSectionId === row.sectionId ? null : row.sectionId
                                  )
                                }
                              >
                                {selectedSectionId === row.sectionId ? "Hide" : "Details"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {selectedSection ? (
                    <div className="hr-detail-panel">
                      <EosPanelHead title={selectedSection.name} subtitle="This week's activity" />
                      {sectionNeedsManualValue(selectedSection.metricKind) ? (
                        <div className="hr-value-entry">
                          <label className="field">
                            Update weekly value
                            <input
                              type="number"
                              step="any"
                              value={valueInput}
                              onChange={(e) => setValueInput(e.target.value)}
                              placeholder={
                                selectedSection.metricKind === "currency"
                                  ? "799198"
                                  : selectedSection.metricKind === "days"
                                    ? "15"
                                    : "8801"
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={valueBusy || !valueInput.trim()}
                            onClick={() => void submitSectionValue()}
                          >
                            {valueBusy ? "Saving…" : "Save value"}
                          </button>
                        </div>
                      ) : null}
                      {weekIncidents.length === 0 ? (
                        <p className="hr-empty">
                          {selectedSection.metricKind === "count"
                            ? "No incidents logged this week."
                            : "No incidents logged. Enter a weekly value above if needed."}
                        </p>
                      ) : (
                        <ul className="hr-mistake-list">
                          {weekIncidents.map((m) => (
                            <li key={m.id}>
                              <div className="hr-mistake-head">
                                <EosStatusPill tone={gradePillTone("C")}>Incident</EosStatusPill>
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
                  title="Log an incident"
                  subtitle="Select the operational section — no employee selection required"
                />
                {logSuccess ? <EosAlertBanner tone="success">{logSuccess}</EosAlertBanner> : null}
                <div className="field-grid hr-log-grid">
                  <label className="field hr-field-full">
                    Section
                    <select value={logSectionId} onChange={(e) => setLogSectionId(e.target.value)}>
                      <option value="">Select section…</option>
                      {sections.map((s) => (
                        <option key={s.sectionId} value={s.sectionId}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field hr-field-full">
                    Notes
                    <textarea
                      rows={3}
                      value={logDescription}
                      onChange={(e) => setLogDescription(e.target.value)}
                      placeholder="Optional details about the incident"
                    />
                  </label>
                </div>
                <div className="hr-action-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={logBusy || !logSectionId}
                    onClick={() => void submitIncident()}
                  >
                    {logBusy ? "Saving…" : "Log incident"}
                  </button>
                </div>
              </EosSectionCard>
            ) : null}

            {tab === "history" ? (
              <EosSectionCard className="hr-panel">
                <EosPanelHead
                  title="Section history"
                  subtitle="Frozen weekly snapshots after each Monday reset"
                />
                <label className="field hr-history-select">
                  Section
                  <select value={historySectionId} onChange={(e) => setHistorySectionId(e.target.value)}>
                    {sections.map((s) => (
                      <option key={s.sectionId} value={s.sectionId}>
                        {s.name}
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
                        {s.letter_grade ? (
                          <div
                            className={`hr-grade-badge hr-grade-badge--sm hr-grade-badge--${s.letter_grade.toLowerCase()}`}
                          >
                            {s.letter_grade}
                          </div>
                        ) : (
                          <div className="hr-grade-badge hr-grade-badge--sm hr-grade-badge--neutral">—</div>
                        )}
                        <div className="hr-history-meta">
                          {s.actual_display ?? s.incident_count} · goal {s.goal_display}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </EosSectionCard>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
