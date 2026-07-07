import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "./lib/api";
import { hrApiErrorMessage } from "./lib/hrRoles";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import EosAlertBanner from "../../shared/eliteos-ui/EosAlertBanner";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

type WeekOption = { weekStart: string; weekEnd: string; weekLabel: string; isCurrentWeek?: boolean };

type WeekValue = {
  actualNumeric?: number | null;
  actualDisplay?: string | null;
  valuePayload?: Record<string, unknown>;
};

type SectionRow = {
  sectionId: string;
  name: string;
  goalDisplay: string;
  metricKind: string;
  gradingEnabled: boolean;
  incidentCount: number;
  detailMistakeCount?: number;
  quickCount?: number | null;
  isMetricTotal?: boolean;
  actualDisplay: string;
  letterGrade: string | null;
  trend: string;
  weekValue?: WeekValue;
};

type MistakeLogEntry = {
  id: string;
  entryKind?: string;
  sectionId: string;
  sectionName?: string | null;
  weekStart?: string | null;
  occurredAt: string;
  severity: string | null;
  jobCustomer: string | null;
  personInvolved: string | null;
  description: string | null;
};

type MistakeLogWeek = WeekOption & { mistakes: MistakeLogEntry[] };

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

type ModalKind = "mistake" | "metric" | "editMistake" | null;

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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isCountSection(kind: string): boolean {
  return kind === "count";
}

function isMetricTotalSection(row: SectionRow): boolean {
  return row.isMetricTotal === true || ["days", "currency", "production", "hours"].includes(row.metricKind);
}

function metricActionLabel(kind: string): string {
  if (kind === "days") return "Update Lead Times";
  if (kind === "currency") return "Update Quoting Value";
  if (kind === "production") return "Update Production";
  if (kind === "hours") return "Update Downtime";
  return "Update Metric";
}

function payloadFromWeekValue(row: SectionRow): Record<string, unknown> {
  return row.weekValue?.valuePayload ?? {};
}

function GradeChip({ grade }: { grade: string | null }) {
  if (!grade) return <span className="hr-grade-chip hr-grade-chip--neutral">—</span>;
  return <span className={`hr-grade-chip hr-grade-chip--${grade.toLowerCase()}`}>{grade}</span>;
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
  const [reportHtml, setReportHtml] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  const [mistakesLog, setMistakesLog] = useState<MistakeLogWeek[]>([]);
  const [priorWeeksOpen, setPriorWeeksOpen] = useState(false);
  const [logBusy, setLogBusy] = useState(false);

  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [activeSection, setActiveSection] = useState<SectionRow | null>(null);
  const [editingMistake, setEditingMistake] = useState<MistakeLogEntry | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [quickCounts, setQuickCounts] = useState<Record<string, string>>({});
  const [quickSaveBusy, setQuickSaveBusy] = useState<Record<string, boolean>>({});

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

  const loadMistakesLog = useCallback(async () => {
    if (!sessionToken) return;
    setLogBusy(true);
    try {
      const weekQ = selectedWeekStart ? `?week_start=${encodeURIComponent(selectedWeekStart)}&weeks=8` : "?weeks=8";
      const res = (await apiGet(`/api/hr/workforce/mistakes/log${weekQ}`, sessionToken)) as {
        weeks?: MistakeLogWeek[];
      };
      setMistakesLog(res.weeks ?? []);
    } catch {
      setMistakesLog([]);
    } finally {
      setLogBusy(false);
    }
  }, [sessionToken, selectedWeekStart]);

  const loadScorecard = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr(null);
    try {
      const weekQ = selectedWeekStart ? `?week_start=${encodeURIComponent(selectedWeekStart)}` : "";
      const res = (await apiGet(`/api/hr/workforce/dashboard${weekQ}`, sessionToken)) as ScorecardPayload;
      setScorecard(res);
      if (!selectedWeekStart && res.weekStart) setSelectedWeekStart(res.weekStart);

      const nextQuick: Record<string, string> = {};
      for (const row of res.rows ?? []) {
        if (isCountSection(row.metricKind)) {
          const saved = row.quickCount ?? row.incidentCount ?? 0;
          nextQuick[row.sectionId] = String(saved);
        }
      }
      setQuickCounts(nextQuick);
      await loadMistakesLog();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to load weekly scorecard."));
    } finally {
      setBusy(false);
    }
  }, [sessionToken, selectedWeekStart, loadMistakesLog]);

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
    setMistakesLog([]);
  }, [supabase]);

  const closeModal = () => {
    setModalKind(null);
    setActiveSection(null);
    setEditingMistake(null);
  };

  const openMistakeModal = (section: SectionRow) => {
    setActiveSection(section);
    setEditingMistake(null);
    setModalKind("mistake");
    setMistakeDate(new Date().toISOString().slice(0, 10));
    setMistakeJob("");
    setMistakeDescription("");
    setMistakeSeverity("minor");
    setMistakePerson("");
    setMistakeNotes("");
  };

  const openEditMistakeModal = (mistake: MistakeLogEntry) => {
    setEditingMistake(mistake);
    setActiveSection(null);
    setModalKind("editMistake");
    setMistakeDate(mistake.occurredAt.slice(0, 10));
    setMistakeJob(mistake.jobCustomer ?? "");
    setMistakeDescription(mistake.description ?? "");
    setMistakeSeverity(mistake.severity ?? "minor");
    setMistakePerson(mistake.personInvolved ?? "");
    setMistakeNotes("");
  };

  const openMetricModal = (section: SectionRow) => {
    setActiveSection(section);
    setModalKind("metric");
    const payload = payloadFromWeekValue(section);
    setMetricMedian(payload.median_days != null ? String(payload.median_days) : "");
    setMetricAverage(payload.average_days != null ? String(payload.average_days) : "");
    setMetricCurrency(payload.currency != null ? String(payload.currency) : "");
    setMetricWeeklySf(payload.weekly_sf != null ? String(payload.weekly_sf) : "");
    setMetricDailySf(payload.daily_sf != null ? String(payload.daily_sf) : "");
    setMetricHours(payload.hours != null ? String(payload.hours) : section.incidentCount != null ? String(section.incidentCount) : "");
  };

  const refreshAfterChange = useCallback(async () => {
    await loadScorecard();
  }, [loadScorecard]);

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
      await refreshAfterChange();
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
    refreshAfterChange
  ]);

  const submitEditMistake = useCallback(async () => {
    if (!sessionToken || !editingMistake) return;
    setSaveBusy(true);
    setErr(null);
    try {
      await apiPatch(`/api/hr/workforce/mistakes/${editingMistake.id}`, sessionToken, {
        occurred_at: mistakeDate ? `${mistakeDate}T12:00:00.000Z` : undefined,
        job_customer: mistakeJob.trim() || null,
        description: mistakeDescription.trim() || null,
        severity: mistakeSeverity,
        person_involved: mistakePerson.trim() || null,
        notes: mistakeNotes.trim() || null
      });
      setSuccess("Mistake updated.");
      closeModal();
      await refreshAfterChange();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to update mistake."));
    } finally {
      setSaveBusy(false);
    }
  }, [
    sessionToken,
    editingMistake,
    mistakeDate,
    mistakeJob,
    mistakeDescription,
    mistakeSeverity,
    mistakePerson,
    mistakeNotes,
    refreshAfterChange
  ]);

  const deleteMistake = useCallback(
    async (mistake: MistakeLogEntry) => {
      if (!sessionToken || mistake.entryKind === "quick_count") return;
      if (!window.confirm("Delete this mistake entry?")) return;
      setErr(null);
      try {
        await apiDelete(`/api/hr/workforce/mistakes/${mistake.id}`, sessionToken);
        setSuccess("Mistake deleted.");
        await refreshAfterChange();
      } catch (e: unknown) {
        setErr(hrApiErrorMessage(e, "Unable to delete mistake."));
      }
    },
    [sessionToken, refreshAfterChange]
  );

  const saveQuickCount = useCallback(
    async (section: SectionRow) => {
      if (!sessionToken) return;
      const raw = quickCounts[section.sectionId] ?? "";
      const count = Math.max(0, Math.round(Number(raw)));
      if (!Number.isFinite(count)) {
        setErr("Enter a valid count.");
        return;
      }
      setQuickSaveBusy((prev) => ({ ...prev, [section.sectionId]: true }));
      setErr(null);
      try {
        await apiPost(`/api/hr/workforce/sections/${section.sectionId}/quick-count`, sessionToken, {
          week_start: scorecard?.weekStart ?? selectedWeekStart,
          count
        });
        setSuccess(`${section.name}: count saved (${count}).`);
        await refreshAfterChange();
      } catch (e: unknown) {
        setErr(hrApiErrorMessage(e, "Unable to save count."));
      } finally {
        setQuickSaveBusy((prev) => ({ ...prev, [section.sectionId]: false }));
      }
    },
    [sessionToken, quickCounts, scorecard?.weekStart, selectedWeekStart, refreshAfterChange]
  );

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
      await refreshAfterChange();
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
    refreshAfterChange
  ]);

  const generateReport = useCallback(async () => {
    if (!sessionToken) return;
    setReportBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = (await apiPost("/api/hr/workforce/report/generate", sessionToken, {
        week_start: scorecard?.weekStart ?? selectedWeekStart
      })) as { reportText?: string; reportHtml?: string; overallGrade?: string | null };
      setReportText(res.reportText ?? "");
      setReportHtml(res.reportHtml ?? "");
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
  const gradeRows = rows.filter((row) => !isMetricTotalSection(row));
  const metricRows = rows.filter((row) => isMetricTotalSection(row));
  const weekOptions = scorecard?.weekOptions ?? [];

  const selectedWeekLog = useMemo(() => {
    const ws = scorecard?.weekStart ?? selectedWeekStart;
    return mistakesLog.find((w) => w.weekStart === ws) ?? mistakesLog[0] ?? null;
  }, [mistakesLog, scorecard?.weekStart, selectedWeekStart]);

  const priorWeekLogs = useMemo(() => {
    const ws = scorecard?.weekStart ?? selectedWeekStart;
    return mistakesLog.filter((w) => w.weekStart !== ws);
  }, [mistakesLog, scorecard?.weekStart, selectedWeekStart]);

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

  const renderSectionCard = (row: SectionRow, variant: "grade" | "metric") => (
    <article key={row.sectionId} className={`hr-section-card hr-section-card--${variant}`}>
      <header className="hr-section-card-head">
        <h2>{row.name}</h2>
        <GradeChip grade={row.letterGrade} />
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

      {variant === "grade" && isCountSection(row.metricKind) ? (
        <div className="hr-quick-count">
          <label className="hr-quick-count-label">
            This week&apos;s count
            <div className="hr-quick-count-row">
              <input
                type="number"
                min={0}
                step={1}
                value={quickCounts[row.sectionId] ?? String(row.incidentCount ?? 0)}
                onChange={(e) => setQuickCounts((prev) => ({ ...prev, [row.sectionId]: e.target.value }))}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={Boolean(quickSaveBusy[row.sectionId]) || busy}
                onClick={() => void saveQuickCount(row)}
              >
                {quickSaveBusy[row.sectionId] ? "Saving…" : "Save"}
              </button>
            </div>
          </label>
        </div>
      ) : null}

      <footer className="hr-section-card-foot">
        {variant === "grade" && isCountSection(row.metricKind) ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openMistakeModal(row)}>
            + Log Mistake
          </button>
        ) : null}
        {variant === "metric" ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openMetricModal(row)}>
            {metricActionLabel(row.metricKind)}
          </button>
        ) : null}
      </footer>
    </article>
  );

  const renderMistakeRow = (mistake: MistakeLogEntry) => {
    const isQuick = mistake.entryKind === "quick_count";
    return (
      <tr key={mistake.id} className={isQuick ? "hr-mistake-row hr-mistake-row--quick" : "hr-mistake-row"}>
        <td>{formatDate(mistake.occurredAt)}</td>
        <td>{mistake.sectionName ?? "—"}</td>
        <td>{mistake.jobCustomer ?? "—"}</td>
        <td>{mistake.description ?? "—"}</td>
        <td>{mistake.severity ?? "—"}</td>
        <td>{mistake.personInvolved ?? "—"}</td>
        <td className="hr-mistake-actions">
          {isQuick ? (
            <span className="hr-mistake-tag">Quick count</span>
          ) : (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditMistakeModal(mistake)}>
                Edit
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void deleteMistake(mistake)}>
                Delete
              </button>
            </>
          )}
        </td>
      </tr>
    );
  };

  const renderMistakeTable = (mistakes: MistakeLogEntry[]) => (
    <div className="hr-mistakes-table-wrap">
      <table className="hr-mistakes-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Section</th>
            <th>Job / customer</th>
            <th>Description</th>
            <th>Severity</th>
            <th>Person</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {mistakes.length ? (
            mistakes.map(renderMistakeRow)
          ) : (
            <tr>
              <td colSpan={7} className="hr-mistakes-empty">
                No detailed mistakes logged for this week.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

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
                <p className="hero-sub">Enter weekly counts and metrics, log detailed mistakes, and freeze the end-of-week report.</p>
              </div>
              <div className="hr-scorecard-controls">
                <label className="field">
                  Week
                  <select value={selectedWeekStart} onChange={(e) => setSelectedWeekStart(e.target.value)} disabled={busy}>
                    {weekOptions.map((w) => (
                      <option key={w.weekStart} value={w.weekStart}>
                        {w.isCurrentWeek ? `Current week · ${w.weekLabel}` : w.weekLabel}
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

            {reportText || reportHtml ? (
              <section className="hr-report-panel">
                <h2 className="hr-report-title">Weekly report</h2>
                {reportHtml ? (
                  <div className="hr-report-html" dangerouslySetInnerHTML={{ __html: reportHtml }} />
                ) : (
                  <pre className="hr-report-text">{reportText}</pre>
                )}
              </section>
            ) : null}

            <section className="hr-scorecard-section">
              <h2 className="hr-scorecard-section-title">Grades</h2>
              <div className="hr-scorecard-grid">{gradeRows.map((row) => renderSectionCard(row, "grade"))}</div>
            </section>

            <section className="hr-scorecard-section">
              <h2 className="hr-scorecard-section-title">Totals / Metrics</h2>
              <div className="hr-scorecard-grid">{metricRows.map((row) => renderSectionCard(row, "metric"))}</div>
            </section>

            <section className="hr-mistakes-log">
              <div className="hr-mistakes-log-head">
                <h2 className="hr-scorecard-section-title">Mistakes Log</h2>
                {logBusy ? <span className="hr-mistakes-log-meta">Updating…</span> : null}
              </div>

              <div className="hr-mistakes-week-block">
                <h3>{selectedWeekLog?.weekLabel ?? scorecard?.weekLabel ?? "Selected week"}</h3>
                {renderMistakeTable(selectedWeekLog?.mistakes ?? [])}
              </div>

              {priorWeekLogs.length ? (
                <div className="hr-mistakes-prior">
                  <button type="button" className="hr-mistakes-prior-toggle" onClick={() => setPriorWeeksOpen((v) => !v)}>
                    {priorWeeksOpen ? "Hide previous weeks" : `Show previous weeks (${priorWeekLogs.length})`}
                  </button>
                  {priorWeeksOpen
                    ? priorWeekLogs.map((week) => (
                        <div key={week.weekStart} className="hr-mistakes-week-block hr-mistakes-week-block--prior">
                          <h3>{week.weekLabel}</h3>
                          {renderMistakeTable(week.mistakes)}
                        </div>
                      ))
                    : null}
                </div>
              ) : null}
            </section>
          </>
        )}
      </main>

      {modalKind && (activeSection || editingMistake) ? (
        <div className="hr-modal-backdrop" onClick={closeModal} role="presentation">
          <div className="hr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="hr-modal-head">
              <h2>
                {modalKind === "mistake"
                  ? `Log mistake — ${activeSection?.name ?? ""}`
                  : modalKind === "editMistake"
                    ? "Edit mistake"
                    : activeSection?.name ?? ""}
              </h2>
              <button type="button" className="hr-modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </header>

            {modalKind === "mistake" || modalKind === "editMistake" ? (
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
                {modalKind === "mistake" ? (
                  <label className="field hr-field-full">
                    Notes
                    <textarea rows={2} value={mistakeNotes} onChange={(e) => setMistakeNotes(e.target.value)} placeholder="Optional" />
                  </label>
                ) : null}
              </div>
            ) : (
              <div className="field-grid">
                {activeSection?.metricKind === "days" ? (
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
                {activeSection?.metricKind === "currency" ? (
                  <label className="field hr-field-full">
                    Weekly quoting value (USD)
                    <input type="number" step="0.01" value={metricCurrency} onChange={(e) => setMetricCurrency(e.target.value)} />
                  </label>
                ) : null}
                {activeSection?.metricKind === "production" ? (
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
                {activeSection?.metricKind === "hours" ? (
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
                onClick={() =>
                  void (modalKind === "mistake"
                    ? submitMistake()
                    : modalKind === "editMistake"
                      ? submitEditMistake()
                      : submitMetric())
                }
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
