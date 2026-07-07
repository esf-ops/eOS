import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "./lib/api";
import { hrApiErrorMessage } from "./lib/hrRoles";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import EosAlertBanner from "../../shared/eliteos-ui/EosAlertBanner";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

type WeekOption = { weekStart: string; weekEnd: string; weekLabel: string };

type IncidentRow = {
  id: string;
  occurredAt: string;
  severity: string;
  jobCustomer: string | null;
  personInvolved: string | null;
  description: string | null;
};

type SectionRow = {
  sectionId: string;
  name: string;
  goalDisplay: string;
  metricKind: string;
  gradingEnabled: boolean;
  incidentCount: number;
  actualDisplay: string;
  letterGrade: string | null;
  trend: string;
  recentIncidents: IncidentRow[];
};

type ScorecardPayload = {
  ok?: boolean;
  weekStart?: string;
  weekLabel?: string;
  weekOptions?: WeekOption[];
  overallGrade?: string | null;
  rows?: SectionRow[];
  warning?: string;
  schemaReady?: boolean;
};

type ModalKind = "mistake" | "metric" | null;

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
  if (e) return e.includes("@") ? e.split("@")[0].slice(0, 2).toUpperCase() : e.slice(0, 2).toUpperCase();
  return "HR";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isCountSection(kind: string): boolean {
  return kind === "count";
}

function metricActionLabel(kind: string): string {
  if (kind === "days") return "Update Lead Times";
  if (kind === "currency") return "Update Quoting Value";
  if (kind === "production") return "Update Production";
  if (kind === "hours") return "Update Downtime";
  return "Update Metric";
}

export default function HrApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userJobTitle, setUserJobTitle] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userRole, setUserRole] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardPayload | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [reportText, setReportText] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [activeSection, setActiveSection] = useState<SectionRow | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [mistakeDate, setMistakeDate] = useState("");
  const [mistakeJob, setMistakeJob] = useState("");
  const [mistakeDescription, setMistakeDescription] = useState("");
  const [mistakeSeverity, setMistakeSeverity] = useState("minor");
  const [mistakePerson, setMistakePerson] = useState("");
  const [mistakeNotes, setMistakeNotes] = useState("");

  const [metricMedian, setMetricMedian] = useState("");
  const [metricAverage, setMetricAverage] = useState("");
  const [metricCurrency, setMetricCurrency] = useState("");
  const [metricWeeklySf, setMetricWeeklySf] = useState("");
  const [metricDailySf, setMetricDailySf] = useState("");
  const [metricHours, setMetricHours] = useState("");

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

  const loadScorecard = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr(null);
    try {
      const weekQ = selectedWeekStart ? `?week_start=${encodeURIComponent(selectedWeekStart)}` : "";
      const res = (await apiGet(`/api/hr/workforce/dashboard${weekQ}`, sessionToken)) as ScorecardPayload;
      setScorecard(res);
      if (!selectedWeekStart && res.weekStart) setSelectedWeekStart(res.weekStart);
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to load weekly scorecard."));
    } finally {
      setBusy(false);
    }
  }, [sessionToken, selectedWeekStart]);

  useEffect(() => {
    if (!sessionToken) return;
    void loadScorecard();
  }, [sessionToken, loadScorecard]);

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
    setScorecard(null);
  }, [supabase]);

  const openMistakeModal = (section: SectionRow) => {
    setActiveSection(section);
    setModalKind("mistake");
    setMistakeDate(new Date().toISOString().slice(0, 10));
    setMistakeJob("");
    setMistakeDescription("");
    setMistakeSeverity("minor");
    setMistakePerson("");
    setMistakeNotes("");
  };

  const openMetricModal = (section: SectionRow) => {
    setActiveSection(section);
    setModalKind("metric");
    setMetricMedian("");
    setMetricAverage("");
    setMetricCurrency("");
    setMetricWeeklySf("");
    setMetricDailySf("");
    setMetricHours("");
  };

  const closeModal = () => {
    setModalKind(null);
    setActiveSection(null);
  };

  const submitMistake = useCallback(async () => {
    if (!sessionToken || !activeSection) return;
    setSaveBusy(true);
    setErr(null);
    try {
      await apiPost("/api/hr/workforce/mistakes", sessionToken, {
        section_id: activeSection.sectionId,
        occurred_at: mistakeDate ? `${mistakeDate}T12:00:00.000Z` : undefined,
        job_customer: mistakeJob.trim() || null,
        description: mistakeDescription.trim() || null,
        severity: mistakeSeverity,
        person_involved: mistakePerson.trim() || null,
        notes: mistakeNotes.trim() || null
      });
      setSuccess(`Mistake logged for ${activeSection.name}.`);
      closeModal();
      void loadScorecard();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to log mistake."));
    } finally {
      setSaveBusy(false);
    }
  }, [
    sessionToken,
    activeSection,
    mistakeDate,
    mistakeJob,
    mistakeDescription,
    mistakeSeverity,
    mistakePerson,
    mistakeNotes,
    loadScorecard
  ]);

  const submitMetric = useCallback(async () => {
    if (!sessionToken || !activeSection) return;
    setSaveBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { week_start: scorecard?.weekStart ?? selectedWeekStart };
      const kind = activeSection.metricKind;
      if (kind === "days") {
        body.median_days = metricMedian;
        body.average_days = metricAverage;
      } else if (kind === "currency") {
        body.currency = metricCurrency;
      } else if (kind === "production") {
        body.weekly_sf = metricWeeklySf;
        body.daily_sf = metricDailySf || undefined;
      } else if (kind === "hours") {
        body.hours = metricHours;
      }
      await apiPost(`/api/hr/workforce/sections/${activeSection.sectionId}/value`, sessionToken, body);
      setSuccess(`${activeSection.name} updated.`);
      closeModal();
      void loadScorecard();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to save metric."));
    } finally {
      setSaveBusy(false);
    }
  }, [
    sessionToken,
    activeSection,
    scorecard?.weekStart,
    selectedWeekStart,
    metricMedian,
    metricAverage,
    metricCurrency,
    metricWeeklySf,
    metricDailySf,
    metricHours,
    loadScorecard
  ]);

  const generateReport = useCallback(async () => {
    if (!sessionToken) return;
    setReportBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = (await apiPost("/api/hr/workforce/report/generate", sessionToken, {
        week_start: scorecard?.weekStart ?? selectedWeekStart
      })) as { reportText?: string; overallGrade?: string | null };
      setReportText(res.reportText ?? "");
      setSuccess(`Weekly report frozen. Overall grade: ${res.overallGrade ?? "—"}`);
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to generate weekly report."));
    } finally {
      setReportBusy(false);
    }
  }, [sessionToken, scorecard?.weekStart, selectedWeekStart]);

  const copyReport = useCallback(async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setSuccess("Report copied to clipboard.");
    } catch {
      setErr("Unable to copy report.");
    }
  }, [reportText]);

  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );
  const chipSubtitle = useMemo(() => {
    const roleTitle = (userJobTitle || userDepartment || userRole || "").trim();
    return roleTitle ? roleTitle.replace(/_/g, " ") : userEmail.trim();
  }, [userDepartment, userEmail, userJobTitle, userRole]);

  const rows = scorecard?.rows ?? [];
  const weekOptions = scorecard?.weekOptions ?? [];

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
      meta: "Reload scorecard",
      onClick: () => void loadScorecard(),
      disabled: busy,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      )
    }
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
          userEmail={userEmail.trim()}
          userSubtitle={chipSubtitle}
          initials={userInitialsFor(userMetaName, userEmail)}
          menuItems={menuItems}
          onSignOut={() => void signOut()}
        />
      ) : (
        <EliteosTopbar appName="HR" organizationName={DEFAULT_WORKSPACE_NAME} logoSrc={EOS_LOGO_URL} homeHref="/" />
      )}

      <main className="main" role="main">
        {!sessionToken ? (
          <div className="auth-panel auth-panel-standalone">
            <div className="auth-panel-header">
              <p className="auth-panel-eyebrow">eliteOS · HR Head</p>
              <h1 className="auth-panel-title">Weekly Operations Scorecard</h1>
              <p className="auth-panel-sub">Sign in to grade operational sections and generate weekly reports.</p>
            </div>
            <div className="field-grid">
              <label className="field">
                Email
                <input type="email" autoComplete="username" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
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
            <section className="hr-scorecard-hero">
              <div>
                <p className="hero-eyebrow">HR Head · Operations</p>
                <h1 className="hero-title">Weekly Operations Scorecard</h1>
                <p className="hero-sub">Log section mistakes, update weekly metrics, and freeze the end-of-week report.</p>
              </div>
              <div className="hr-scorecard-controls">
                <label className="field">
                  Week
                  <select
                    value={selectedWeekStart}
                    onChange={(e) => setSelectedWeekStart(e.target.value)}
                    disabled={busy}
                  >
                    {weekOptions.map((w) => (
                      <option key={w.weekStart} value={w.weekStart}>
                        {w.weekLabel}
                      </option>
                    ))}
                  </select>
                </label>
                {scorecard?.overallGrade ? (
                  <div className="hr-overall-grade">
                    <span>Overall company grade</span>
                    <strong className={`hr-grade-badge hr-grade-badge--sm hr-grade-badge--${scorecard.overallGrade.toLowerCase()}`}>
                      {scorecard.overallGrade}
                    </strong>
                  </div>
                ) : null}
              </div>
            </section>

            {scorecard?.warning ? <EosAlertBanner tone="warn">{scorecard.warning}</EosAlertBanner> : null}
            {err ? <div className="banner banner-error">{err}</div> : null}
            {success ? <EosAlertBanner tone="success">{success}</EosAlertBanner> : null}

            <div className="hr-scorecard-actions">
              <button type="button" className="btn btn-primary" disabled={reportBusy || busy} onClick={() => void generateReport()}>
                {reportBusy ? "Generating…" : "Generate Weekly Report"}
              </button>
              {reportText ? (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => void copyReport()}>
                    Copy Report
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                    Print
                  </button>
                </>
              ) : null}
            </div>

            {reportText ? (
              <section className="hr-report-panel">
                <h2 className="hr-report-title">Weekly report</h2>
                <pre className="hr-report-text">{reportText}</pre>
              </section>
            ) : null}

            <div className="hr-scorecard-grid">
              {rows.map((row) => (
                <article key={row.sectionId} className="hr-section-card">
                  <header className="hr-section-card-head">
                    <h2>{row.name}</h2>
                    {row.letterGrade ? (
                      <span className={`hr-grade-chip hr-grade-chip--${row.letterGrade.toLowerCase()}`}>{row.letterGrade}</span>
                    ) : (
                      <span className="hr-grade-chip hr-grade-chip--neutral">—</span>
                    )}
                  </header>
                  <dl className="hr-section-metrics">
                    <div>
                      <dt>Goal</dt>
                      <dd>{row.goalDisplay}</dd>
                    </div>
                    <div>
                      <dt>Actual</dt>
                      <dd>{row.actualDisplay}</dd>
                    </div>
                  </dl>
                  {row.recentIncidents?.length ? (
                    <ul className="hr-section-recent">
                      {row.recentIncidents.slice(0, 4).map((inc) => (
                        <li key={inc.id}>
                          <strong>{formatDateTime(inc.occurredAt)}</strong>
                          {inc.jobCustomer ? <span> · {inc.jobCustomer}</span> : null}
                          {inc.description ? <p>{inc.description}</p> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hr-section-empty">No entries logged this week.</p>
                  )}
                  <footer className="hr-section-card-foot">
                    {isCountSection(row.metricKind) ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openMistakeModal(row)}>
                        + Log Mistake
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openMetricModal(row)}>
                        {metricActionLabel(row.metricKind)}
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      {modalKind && activeSection ? (
        <div className="hr-modal-backdrop" onClick={closeModal} role="presentation">
          <div className="hr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="hr-modal-head">
              <h2>{modalKind === "mistake" ? `Log mistake — ${activeSection.name}` : activeSection.name}</h2>
              <button type="button" className="hr-modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </header>

            {modalKind === "mistake" ? (
              <div className="field-grid">
                <label className="field">
                  Date
                  <input type="date" value={mistakeDate} onChange={(e) => setMistakeDate(e.target.value)} />
                </label>
                <label className="field">
                  Job / customer
                  <input value={mistakeJob} onChange={(e) => setMistakeJob(e.target.value)} placeholder="Optional" />
                </label>
                <label className="field hr-field-full">
                  Description
                  <textarea rows={3} value={mistakeDescription} onChange={(e) => setMistakeDescription(e.target.value)} />
                </label>
                <label className="field">
                  Severity
                  <select value={mistakeSeverity} onChange={(e) => setMistakeSeverity(e.target.value)}>
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="major">Major</option>
                  </select>
                </label>
                <label className="field">
                  Person involved
                  <input value={mistakePerson} onChange={(e) => setMistakePerson(e.target.value)} placeholder="Optional" />
                </label>
                <label className="field hr-field-full">
                  Notes
                  <textarea rows={2} value={mistakeNotes} onChange={(e) => setMistakeNotes(e.target.value)} placeholder="Optional" />
                </label>
              </div>
            ) : (
              <div className="field-grid">
                {activeSection.metricKind === "days" ? (
                  <>
                    <label className="field">
                      Median days
                      <input type="number" step="0.1" value={metricMedian} onChange={(e) => setMetricMedian(e.target.value)} />
                    </label>
                    <label className="field">
                      Average days
                      <input type="number" step="0.1" value={metricAverage} onChange={(e) => setMetricAverage(e.target.value)} />
                    </label>
                  </>
                ) : null}
                {activeSection.metricKind === "currency" ? (
                  <label className="field hr-field-full">
                    Weekly quoting value (USD)
                    <input type="number" step="0.01" value={metricCurrency} onChange={(e) => setMetricCurrency(e.target.value)} />
                  </label>
                ) : null}
                {activeSection.metricKind === "production" ? (
                  <>
                    <label className="field">
                      Weekly sqft
                      <input type="number" value={metricWeeklySf} onChange={(e) => setMetricWeeklySf(e.target.value)} />
                    </label>
                    <label className="field">
                      Daily sqft
                      <input type="number" value={metricDailySf} onChange={(e) => setMetricDailySf(e.target.value)} placeholder="Optional" />
                    </label>
                  </>
                ) : null}
                {activeSection.metricKind === "hours" ? (
                  <label className="field">
                    Downtime hours
                    <input type="number" step="0.1" value={metricHours} onChange={(e) => setMetricHours(e.target.value)} />
                  </label>
                ) : null}
              </div>
            )}

            <footer className="hr-modal-foot">
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saveBusy}
                onClick={() => void (modalKind === "mistake" ? submitMistake() : submitMetric())}
              >
                {saveBusy ? "Saving…" : "Save"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
