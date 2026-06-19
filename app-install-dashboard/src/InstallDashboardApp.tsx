import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, ApiError } from "./lib/api";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

type SmartBadge = {
  label: string;
  tone: "ok" | "info" | "warning" | "critical";
};

type SmartBrief = {
  severity: "ok" | "info" | "warning" | "critical";
  badges: SmartBadge[];
  highlights: string[];
  missingFields: string[];
};

type SmartSummary = {
  callAheadCount?: number;
  accessNoteCount?: number;
  missingPhoneCount?: number;
  missingAddressCount?: number;
  largeJobCount?: number;
  specialInstallCount?: number;
  siteAccessCount?: number;
  laborNoteCount?: number;
  premiumMaterialCount?: number;
  criticalCount?: number;
  warningCount?: number;
  totalStops?: number;
  totalSqft?: number | null;
  firstStopTime?: string | null;
  lastStopTime?: string | null;
  cityCount?: number;
  cities?: string[];
  fieldAlertCount?: number;
};

type Crew = {
  id: string;
  name: string;
  truckName?: string;
  branch?: string;
  stopCount?: number;
  totalSqft?: number | null;
};

type InstallJob = {
  id: string;
  morawareJobId?: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  sequence?: number;
  stopName?: string;
  displayStopName?: string;
  customerName?: string;
  accountName?: string;
  jobName?: string;
  contactName?: string;
  status?: string;
  activityType?: string;
  primaryPhone?: string;
  allPhones?: string[];
  formattedAddress?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  mapUrl?: string;
  contact?: { name?: string; phone?: string; email?: string; allPhones?: string[] };
  scope?: {
    sqft?: number | null;
    rooms?: string[];
    material?: string;
    color?: string;
    edge?: string;
    backsplash?: string;
    sinkNotes?: string;
    cutoutNotes?: string;
    waterfall?: boolean;
    fullHeightSplash?: boolean;
  };
  notes?: string[];
  warnings?: string[];
  riskFlags?: string[];
  smartBrief?: SmartBrief;
};

type InstallDayPayload = {
  ok?: boolean;
  date?: string;
  crew?: Crew | null;
  jobs?: InstallJob[];
  warnings?: string[];
  meta?: {
    source?: string;
    fixtureMode?: boolean;
    selectedDate?: string;
    calendarFeedConfigured?: boolean;
    calendarRowCount?: number;
    installDashboardRowCount?: number;
    excludedRowCount?: number;
    brainActivityCount?: number;
    missingFieldCounts?: Record<string, number>;
    fallbackFrom?: string;
    smartSummary?: SmartSummary;
  };
};

type CrewsPayload = {
  ok?: boolean;
  date?: string;
  crews?: Crew[];
  meta?: { source?: string };
};

const DEFAULT_WORKSPACE_SHORT = "ESF";

function workspaceInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "ES"
  );
}

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
    const parts = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  return "ES";
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatFeedSourceLabel(source: string | undefined): string {
  switch (source) {
    case "calendar_schedule_feed":
      return "Moraware calendar feed";
    case "brain_job_activities":
      return "Brain activities fallback";
    case "fixture":
      return "Sample data";
    default:
      return "Brain cache";
  }
}

function addDaysToIsoDate(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function cityLabelFor(job: InstallJob): string {
  const city = String(job.address?.city ?? "").trim();
  const state = String(job.address?.state ?? "").trim();
  return [city, state].filter(Boolean).join(", ") || "Location pending";
}

function computeDayOverview(jobs: InstallJob[], smartSummary?: SmartSummary) {
  const totalSqft = jobs.reduce((sum, job) => sum + (job.scope?.sqft ?? 0), 0);
  const cities = [
    ...new Set(jobs.map((job) => String(job.address?.city ?? "").trim()).filter(Boolean))
  ];
  const missingAddress =
    smartSummary?.missingAddressCount ??
    jobs.filter((job) => !formatAddressLines(job).hasAddress).length;
  const missingPhone =
    smartSummary?.missingPhoneCount ?? jobs.filter((job) => phonesFor(job).length === 0).length;
  const lastStop = jobs[jobs.length - 1];
  const fieldAlerts =
    smartSummary?.fieldAlertCount ??
    jobs.filter((job) => job.smartBrief && job.smartBrief.severity !== "ok").length;
  return {
    totalSqft: smartSummary?.totalSqft ?? (totalSqft > 0 ? totalSqft : null),
    cities: smartSummary?.cities?.length ? smartSummary.cities : cities,
    missingAddress,
    missingPhone,
    firstStopTime: smartSummary?.firstStopTime ?? jobs[0]?.scheduledStart ?? null,
    lastStopTime: smartSummary?.lastStopTime ?? lastStop?.scheduledStart ?? null,
    fieldAlerts,
    specialInstallCount: smartSummary?.specialInstallCount ?? 0
  };
}

function buildHeadsUpLines(summary: SmartSummary | undefined): string[] {
  if (!summary) return [];
  const lines: string[] = [];
  if ((summary.callAheadCount ?? 0) > 0) {
    lines.push(`${summary.callAheadCount} call-ahead stop${summary.callAheadCount === 1 ? "" : "s"}`);
  }
  if ((summary.accessNoteCount ?? 0) > 0) {
    lines.push(`${summary.accessNoteCount} access note${summary.accessNoteCount === 1 ? "" : "s"}`);
  }
  if ((summary.siteAccessCount ?? 0) > 0) {
    lines.push(`${summary.siteAccessCount} site access note${summary.siteAccessCount === 1 ? "" : "s"}`);
  }
  if ((summary.missingPhoneCount ?? 0) > 0) {
    lines.push(`${summary.missingPhoneCount} missing phone${summary.missingPhoneCount === 1 ? "" : "s"}`);
  }
  if ((summary.missingAddressCount ?? 0) > 0) {
    lines.push(`${summary.missingAddressCount} missing address${summary.missingAddressCount === 1 ? "" : "s"}`);
  }
  if ((summary.largeJobCount ?? 0) > 0) {
    lines.push(`${summary.largeJobCount} large job${summary.largeJobCount === 1 ? "" : "s"}`);
  }
  if ((summary.specialInstallCount ?? 0) > 0) {
    lines.push(
      `${summary.specialInstallCount} large/specialty install${summary.specialInstallCount === 1 ? "" : "s"}`
    );
  }
  if ((summary.laborNoteCount ?? 0) > 0) {
    lines.push(`${summary.laborNoteCount} labor note${summary.laborNoteCount === 1 ? "" : "s"}`);
  }
  return lines;
}

function crewChipLabel(crew: Crew, active: boolean, activeJobCount: number, activeSqft: number | null): string {
  const name = crew.truckName || crew.name;
  const stopCount = active ? activeJobCount : crew.stopCount;
  const sqft = active ? activeSqft : crew.totalSqft;
  const parts = [name];
  if (stopCount != null && stopCount > 0) parts.push(`${stopCount} stop${stopCount === 1 ? "" : "s"}`);
  if (sqft != null && sqft > 0) parts.push(`${sqft} sq ft`);
  return parts.join(" · ");
}

function formatFeedStatusLine(
  jobs: InstallJob[],
  meta: InstallDayPayload["meta"] | undefined,
  fixtureMode: boolean
): { summary: string; details: string } {
  const source = formatFeedSourceLabel(meta?.source);
  const fieldStops = jobs.length;
  const excluded = meta?.excludedRowCount ?? 0;
  const summaryParts = [
    source,
    `${fieldStops} field stop${fieldStops === 1 ? "" : "s"}`,
    excluded > 0 ? `${excluded} non-field rows filtered` : null,
    fixtureMode ? "fixture mode" : null
  ].filter(Boolean);
  const detailsParts = [
    meta?.selectedDate ? `date=${meta.selectedDate}` : null,
    meta?.calendarRowCount != null ? `calendar_rows=${meta.calendarRowCount}` : null,
    meta?.installDashboardRowCount != null ? `field_rows=${meta.installDashboardRowCount}` : null,
    meta?.brainActivityCount != null ? `brain_activities=${meta.brainActivityCount}` : null
  ].filter(Boolean);
  return {
    summary: summaryParts.join(" · "),
    details: detailsParts.join(" · ")
  };
}

function formatDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatAddressLines(job: InstallJob): { line1: string; line2: string; locality: string; hasAddress: boolean } {
  const a = job.address ?? {};
  const line1 = String(a.line1 ?? "").trim();
  const line2 = String(a.line2 ?? "").trim();
  const cityState = [a.city, a.state].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  const postalCode = String(a.postalCode ?? "").trim();
  const locality = [cityState, postalCode].filter(Boolean).join(" ");
  return {
    line1,
    line2,
    locality,
    hasAddress: Boolean(line1 || line2 || locality)
  };
}

function stopTitleFor(job: InstallJob): string {
  return (
    String(job.displayStopName ?? job.stopName ?? job.jobName ?? "").trim() || "Untitled job"
  );
}

function phonesFor(job: InstallJob): string[] {
  const listed = Array.isArray(job.allPhones)
    ? job.allPhones
    : Array.isArray(job.contact?.allPhones)
      ? job.contact.allPhones
      : [];
  const deduped = [...listed.map((p) => String(p ?? "").trim()).filter(Boolean)];
  const primary = String(job.primaryPhone ?? job.contact?.phone ?? "").trim();
  if (primary && !deduped.includes(primary)) deduped.unshift(primary);
  return deduped;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function scopeSummary(scope: InstallJob["scope"]): string {
  if (!scope) return "";
  const bits: string[] = [];
  if (scope.sqft != null) bits.push(`${scope.sqft} sq ft`);
  if (scope.material) bits.push(scope.material);
  if (scope.color) bits.push(scope.color);
  if (scope.edge) bits.push(scope.edge);
  return bits.length ? bits.join(" · ") : "";
}

function activitySummary(job: InstallJob): string {
  return [job.activityType, job.status].map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");
}

function todayInputValue(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

export default function InstallDashboardApp() {
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

  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [crews, setCrews] = useState<Crew[]>([]);
  const [day, setDay] = useState<InstallDayPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [highlightStopId, setHighlightStopId] = useState<string | null>(null);

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
    setDay(null);
    setCrews([]);
  }, [supabase]);

  const loadCrews = useCallback(async () => {
    if (!sessionToken) return;
    const res = (await apiGet(
      `/api/install-dashboard/crews?date=${encodeURIComponent(selectedDate)}`,
      sessionToken
    )) as CrewsPayload;
    const list = res.crews ?? [];
    setCrews(list);
    if (!selectedCrewId && list[0]?.id) setSelectedCrewId(list[0].id);
  }, [selectedCrewId, selectedDate, sessionToken]);

  const loadDay = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr(null);
    try {
      const crewQ = selectedCrewId ? `&crewId=${encodeURIComponent(selectedCrewId)}` : "";
      const path =
        selectedDate === todayInputValue()
          ? `/api/install-dashboard/today${selectedCrewId ? `?crewId=${encodeURIComponent(selectedCrewId)}` : ""}`
          : `/api/install-dashboard/day?date=${encodeURIComponent(selectedDate)}${crewQ}`;
      const res = (await apiGet(path, sessionToken)) as InstallDayPayload;
      setDay(res);
      if (res.crew?.id && !selectedCrewId) setSelectedCrewId(res.crew.id);
    } catch (e: unknown) {
      setDay(null);
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [selectedCrewId, selectedDate, sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    void loadCrews().catch(() => {
      /* crews optional */
    });
  }, [loadCrews, sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    void loadDay();
  }, [loadDay, sessionToken]);

  const userDisplayName = userMetaName || deriveDisplayNameFromEmail(userEmail) || userEmail || "Staff";
  const userDisplayEmail = userEmail;
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

  const jobs = day?.jobs ?? [];
  const smartSummary = day?.meta?.smartSummary;
  const dayWarnings = day?.warnings ?? [];
  const warningCount = dayWarnings.length + jobs.reduce((n, j) => n + (j.warnings?.length ?? 0), 0);
  const firstStop = jobs[0];
  const dayOverview = useMemo(() => computeDayOverview(jobs, smartSummary), [jobs, smartSummary]);
  const headsUpLines = useMemo(() => buildHeadsUpLines(smartSummary), [smartSummary]);
  const feedStatus = useMemo(
    () => formatFeedStatusLine(jobs, day?.meta, Boolean(day?.meta?.fixtureMode)),
    [day?.meta, jobs]
  );
  const crewLabel = day?.crew?.truckName || day?.crew?.name || "Select crew";
  const firstStopMapUrl = String(firstStop?.mapUrl ?? "").trim();

  const scrollToStop = useCallback((jobId: string) => {
    setHighlightStopId(jobId);
    const el = document.getElementById(`stop-${jobId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => setHighlightStopId(null), 1800);
  }, []);

  const shiftDate = useCallback((delta: number) => {
    setSelectedDate((current) => addDaysToIsoDate(current, delta));
  }, []);

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
      label: "Refresh day",
      meta: "Reload install schedule",
      onClick: () => {
        void loadCrews();
        void loadDay();
      },
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
          appName="Install Dashboard"
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
          appName="Install Dashboard"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={EOS_LOGO_URL}
          homeHref="/"
        />
      )}

      <main className="main" role="main">
        {!supabase ? (
          <div className="banner banner-warn" role="alert">
            Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        ) : null}

        {!sessionToken ? (
          <section className="auth-panel auth-panel-standalone" aria-label="Sign in">
            <header className="auth-panel-header">
              <p className="auth-panel-eyebrow">Install Dashboard · {DEFAULT_WORKSPACE_NAME}</p>
              <h2 className="auth-panel-title">Sign in to continue</h2>
              <p className="auth-panel-sub">
                Read-only install day view for field crews. Use your eliteOS staff account.
              </p>
            </header>
            <div className="field-grid">
              <label className="field">
                Email
                <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="username" />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </div>
            {authError ? (
              <div className="banner banner-error" role="alert">
                {authError}
              </div>
            ) : null}
            <button type="button" className="btn btn-primary" disabled={authBusy} onClick={() => void signIn()}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
          </section>
        ) : (
          <>
            <section className="id-hero" aria-labelledby="id-hero-title">
              <div className="id-hero-aurora" aria-hidden />
              <div className="id-hero-grid">
                <div className="id-hero-main">
                  <p className="hero-eyebrow">Installer day view · Read-only</p>
                  <h1 id="id-hero-title" className="hero-title">
                    {formatDateLabel(selectedDate)}
                  </h1>
                  <p className="hero-sub">
                    {crewLabel}
                    {jobs.length ? ` · ${jobs.length} stop${jobs.length === 1 ? "" : "s"}` : " · No stops loaded"}
                    {dayOverview.cities.length
                      ? ` · ${dayOverview.cities.slice(0, 3).join(", ")}${dayOverview.cities.length > 3 ? "…" : ""}`
                      : ""}
                  </p>
                  <div className="hero-stats">
                    <div className="hero-stat">
                      <span className="hero-stat-label">Stops</span>
                      <span className="hero-stat-value">{jobs.length}</span>
                    </div>
                    <div className="hero-stat">
                      <span className="hero-stat-label">First stop</span>
                      <span className="hero-stat-value">
                        {firstStop ? formatTime(firstStop.scheduledStart) : "—"}
                      </span>
                    </div>
                    <div className="hero-stat">
                      <span className="hero-stat-label">Last stop</span>
                      <span className="hero-stat-value">
                        {jobs.length > 1 ? formatTime(dayOverview.lastStopTime) : "—"}
                      </span>
                    </div>
                    <div className="hero-stat">
                      <span className="hero-stat-label">Total sq ft</span>
                      <span className="hero-stat-value">
                        {dayOverview.totalSqft != null ? dayOverview.totalSqft : "—"}
                      </span>
                    </div>
                  </div>
                  <p className="feed-status">{feedStatus.summary}</p>
                  {feedStatus.details ? <p className="feed-status-details">{feedStatus.details}</p> : null}

                  <div className="id-heads-up-panel" aria-label="Today's heads up">
                    <h2 className="id-heads-up-title">Today&apos;s heads up</h2>
                    {headsUpLines.length ? (
                      <ul className="id-heads-up-list">
                        {headsUpLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="id-heads-up-ready">
                        All stops look ready from available Moraware data.
                      </p>
                    )}
                  </div>
                </div>

                <aside className="id-route-panel" aria-label="Route overview">
                  <h2 className="id-route-title">Route overview</h2>
                  {jobs.length ? (
                    <div className="id-route-strip">
                      {jobs.map((job) => {
                        const active = highlightStopId === job.id;
                        return (
                          <button
                            key={job.id}
                            type="button"
                            className={active ? "id-route-stop id-route-stop-active" : "id-route-stop"}
                            onClick={() => scrollToStop(job.id)}
                          >
                            <span className="id-route-dot" aria-hidden />
                            <span className="id-route-meta">
                              <span className="id-route-time">
                                Stop {job.sequence ?? "—"} · {formatTime(job.scheduledStart)}
                              </span>
                              <span className="id-route-city">{cityLabelFor(job)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="id-route-empty">No stops scheduled for this crew and date.</p>
                  )}
                  {firstStopMapUrl ? (
                    <a
                      className="btn btn-secondary btn-sm"
                      href={firstStopMapUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open first stop map
                    </a>
                  ) : null}
                </aside>
              </div>
            </section>

            <section className="field-controls" aria-label="Day controls">
              <div className="field-controls-group">
                <button
                  type="button"
                  className="btn btn-secondary btn-day-nav"
                  disabled={busy}
                  onClick={() => shiftDate(-1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-day-nav"
                  disabled={busy}
                  onClick={() => setSelectedDate(todayInputValue())}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-day-nav"
                  disabled={busy}
                  onClick={() => shiftDate(1)}
                >
                  Next
                </button>
              </div>
              <label className="field">
                Date
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </label>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void loadDay()}>
                {busy ? "Loading…" : "Load day"}
              </button>
            </section>

            {crews.length > 0 ? (
              <div className="crew-picker-wrap">
                <p className="crew-picker-label">Crew / truck</p>
                <section className="crew-picker" aria-label="Select crew or truck">
                  {crews.map((crew) => {
                    const active = selectedCrewId === crew.id;
                    return (
                      <button
                        key={crew.id}
                        type="button"
                        className={active ? "crew-chip crew-chip-active" : "crew-chip"}
                        aria-pressed={active}
                        onClick={() => setSelectedCrewId(crew.id)}
                      >
                        {crewChipLabel(crew, active, jobs.length, dayOverview.totalSqft)}
                      </button>
                    );
                  })}
                </section>
              </div>
            ) : null}

            {err ? (
              <div className="banner banner-error" role="alert">
                Unable to load install day: {err}
              </div>
            ) : null}

            {dayWarnings.length ? (
              <ul className="day-warnings" aria-label="Day warnings">
                {dayWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            <div className="dash-layout">
              <div className="dash-main">
                {busy && !jobs.length ? <p className="loading">Loading today&apos;s route…</p> : null}

                {!busy && !err && !jobs.length ? (
                  <section className="empty-state">
                    <h2>No install jobs for this day</h2>
                    <p>Try another date or crew, or check Moraware sync coverage.</p>
                  </section>
                ) : null}

                <div className="job-list">
                  {jobs.map((job) => {
                    const expanded = expandedJobId === job.id;
                    const highlighted = highlightStopId === job.id;
                    const title = stopTitleFor(job);
                    const addressLines = formatAddressLines(job);
                    const phoneList = phonesFor(job);
                    const primaryPhone = phoneList[0] ?? "";
                    const mapUrl = String(job.mapUrl ?? "").trim();
                    const contactName = String(job.contactName ?? job.contact?.name ?? "").trim();
                    const accountLabel = String(job.accountName ?? job.customerName ?? "").trim();
                    const scopeLine = scopeSummary(job.scope);
                    const activityLine = activitySummary(job);
                    return (
                      <article
                        key={job.id}
                        id={`stop-${job.id}`}
                        className={highlighted ? "job-card job-card-highlight" : "job-card"}
                      >
                        <div className="job-card-head">
                          <span className="stop-badge">Stop {job.sequence ?? "—"}</span>
                          <span className="job-time">{formatTime(job.scheduledStart)}</span>
                        </div>

                        <h2 className="job-title">{title}</h2>

                        {addressLines.hasAddress ? (
                          <div className="job-address-block">
                            {addressLines.line1 ? (
                              <p className="job-address-line">{addressLines.line1}</p>
                            ) : null}
                            {addressLines.line2 ? (
                              <p className="job-address-line">{addressLines.line2}</p>
                            ) : null}
                            {addressLines.locality ? (
                              <p className="job-address-line">{addressLines.locality}</p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="job-address-missing">Address missing</p>
                        )}

                        <div className="job-contact-block">
                          <span className="job-contact-label">Contact</span>
                          {contactName ? <span className="job-contact-name">{contactName}</span> : null}
                          {phoneList.length ? (
                            <div className="job-phone-list">
                              {phoneList.map((phone) => (
                                <a key={phone} className="job-phone-chip" href={telHref(phone)}>
                                  {phone}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="job-contact-empty">No phone on file</span>
                          )}
                          {job.contact?.email ? (
                            <a className="job-email-link" href={`mailto:${job.contact.email}`}>
                              {job.contact.email}
                            </a>
                          ) : null}
                        </div>

                        {accountLabel && accountLabel !== "—" ? (
                          <p className="job-account-line">
                            <span className="job-meta-label">Account</span> {accountLabel}
                          </p>
                        ) : null}

                        {job.smartBrief && job.smartBrief.badges.length > 0 ? (
                          <section
                            className={`job-heads-up job-heads-up-${job.smartBrief.severity}`}
                            aria-label="Heads up"
                          >
                            <div className="job-heads-up-head">
                              <span className="job-heads-up-label">Heads up</span>
                              {job.smartBrief.highlights[0] ? (
                                <span className="job-heads-up-lead">{job.smartBrief.highlights[0]}</span>
                              ) : null}
                            </div>
                            <div className="smart-badge-row">
                              {job.smartBrief.badges.map((badge) => (
                                <span
                                  key={badge.label}
                                  className={`smart-badge smart-badge-${badge.tone}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        {scopeLine ? <p className="scope-line">{scopeLine}</p> : null}
                        {activityLine ? <p className="activity-line">{activityLine}</p> : null}

                        <div className="job-actions">
                          {mapUrl ? (
                            <a className="btn btn-primary btn-sm" href={mapUrl} target="_blank" rel="noreferrer">
                              Open map
                            </a>
                          ) : (
                            <span className="chip chip-warn">Address missing</span>
                          )}
                          {primaryPhone ? (
                            <a className="btn btn-secondary btn-sm" href={telHref(primaryPhone)}>
                              Call{contactName ? ` ${contactName.split(" ")[0]}` : ""}
                            </a>
                          ) : (
                            <span className="chip chip-muted">No phone on file</span>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-expanded={expanded}
                            onClick={() => setExpandedJobId(expanded ? null : job.id)}
                          >
                            {expanded ? "Hide details" : "Notes/details"}
                          </button>
                        </div>

                        {(job.warnings?.length ?? 0) > 0 ? (
                          <ul className="job-warnings">
                            {job.warnings!.map((w) => (
                              <li key={w} className="chip chip-warn">
                                {w}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {(job.riskFlags?.length ?? 0) > 0 ? (
                          <ul className="job-risks">
                            {job.riskFlags!.map((r) => (
                              <li key={r} className="chip chip-risk">
                                {r}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {expanded ? (
                          <div className="job-details">
                            <dl className="detail-dl">
                              <dt>Job name</dt>
                              <dd>{job.jobName || title}</dd>
                              <dt>Status</dt>
                              <dd>{job.status || "—"}</dd>
                              <dt>Activity</dt>
                              <dd>{job.activityType || "—"}</dd>
                              <dt>Moraware job</dt>
                              <dd>{job.morawareJobId || "—"}</dd>
                              <dt>Address</dt>
                              <dd>{job.formattedAddress || "—"}</dd>
                            </dl>
                            {job.notes?.length ? (
                              <div className="notes-block">
                                <h3>Notes</h3>
                                <ul>
                                  {job.notes.map((n, i) => (
                                    <li key={`${job.id}-note-${i}`}>{n}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <p className="muted">No notes on file.</p>
                            )}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>

              <aside className="dash-rail" aria-label="Day summary">
                <div className="rail-card rail-heads-up">
                  <h2>Field alerts</h2>
                  {headsUpLines.length ? (
                    <ul className="rail-heads-up-list">
                      {headsUpLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rail-heads-up-ready">
                      All stops look ready from available Moraware data.
                    </p>
                  )}
                </div>

                <div className="rail-card">
                  <h2>Day summary</h2>
                  <ul className="rail-stat-list">
                    <li>
                      <span>Crew</span>
                      <strong>{crewLabel}</strong>
                    </li>
                    <li>
                      <span>Stops</span>
                      <strong>{jobs.length}</strong>
                    </li>
                    <li>
                      <span>Total sq ft</span>
                      <strong>{dayOverview.totalSqft ?? "—"}</strong>
                    </li>
                    <li>
                      <span>First stop</span>
                      <strong>{firstStop ? formatTime(dayOverview.firstStopTime) : "—"}</strong>
                    </li>
                    <li>
                      <span>Last stop</span>
                      <strong>{jobs.length > 1 ? formatTime(dayOverview.lastStopTime) : "—"}</strong>
                    </li>
                    <li>
                      <span>Areas</span>
                      <strong>{dayOverview.cities.length ? dayOverview.cities.join(", ") : "—"}</strong>
                    </li>
                    <li>
                      <span>Field alerts</span>
                      <strong className={dayOverview.fieldAlerts ? "text-warn" : ""}>
                        {dayOverview.fieldAlerts}
                      </strong>
                    </li>
                    <li>
                      <span>Special installs</span>
                      <strong>{dayOverview.specialInstallCount || "—"}</strong>
                    </li>
                    <li>
                      <span>Warnings</span>
                      <strong className={warningCount ? "text-warn" : ""}>{warningCount}</strong>
                    </li>
                    <li>
                      <span>Missing address</span>
                      <strong className={dayOverview.missingAddress ? "text-warn" : ""}>
                        {dayOverview.missingAddress}
                      </strong>
                    </li>
                    <li>
                      <span>Missing phone</span>
                      <strong className={dayOverview.missingPhone ? "text-warn" : ""}>
                        {dayOverview.missingPhone}
                      </strong>
                    </li>
                  </ul>
                </div>

                <div className="rail-card rail-actions">
                  <h2>Quick actions</h2>
                  {firstStopMapUrl ? (
                    <a
                      className="btn btn-primary"
                      href={firstStopMapUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open first stop map
                    </a>
                  ) : (
                    <span className="chip chip-muted">No map available</span>
                  )}
                  {firstStop && phonesFor(firstStop)[0] ? (
                    <a className="btn btn-secondary" href={telHref(phonesFor(firstStop)[0])}>
                      Call first stop
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      void loadCrews();
                      void loadDay();
                    }}
                  >
                    Refresh day
                  </button>
                </div>

                <div className="rail-card">
                  <h2>Workspace</h2>
                  <p className="hero-sub" style={{ margin: 0, fontSize: "0.92rem" }}>
                    {DEFAULT_WORKSPACE_NAME}
                  </p>
                  <p className="feed-status" style={{ marginTop: 10 }}>
                    {DEFAULT_WORKSPACE_SHORT} · {workspaceInitials(DEFAULT_WORKSPACE_NAME)}
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
