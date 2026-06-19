import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, ApiError } from "./lib/api";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

type Crew = {
  id: string;
  name: string;
  truckName?: string;
  branch?: string;
};

type InstallJob = {
  id: string;
  morawareJobId?: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  sequence?: number;
  customerName?: string;
  accountName?: string;
  jobName?: string;
  status?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  mapUrl?: string;
  contact?: { name?: string; phone?: string; email?: string };
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
    brainActivityCount?: number;
    missingFieldCounts?: Record<string, number>;
    fallbackFrom?: string;
  };
};

type CrewsPayload = {
  ok?: boolean;
  date?: string;
  crews?: Crew[];
  meta?: { source?: string };
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

function formatDataSourceLabel(source: string | undefined): string {
  switch (source) {
    case "calendar_schedule_feed":
      return "Moraware calendar schedule feed";
    case "brain_job_activities":
      return "Brain job activities (fallback)";
    case "fixture":
      return "Sample data";
    default:
      return "Brain cache";
  }
}

function formatMissingFieldSummary(counts: Record<string, number> | undefined): string {
  if (!counts) return "";
  const total = Object.values(counts).reduce((n, v) => n + (v ?? 0), 0);
  if (!total) return "No missing-field gaps";
  return `${total} missing-field gap(s)`;
}
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatAddress(job: InstallJob): string {
  const a = job.address ?? {};
  const parts = [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.postalCode]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return parts.join(" · ") || "Address not available";
}

function scopeSummary(scope: InstallJob["scope"]): string {
  if (!scope) return "Scope details pending sync";
  const bits: string[] = [];
  if (scope.sqft != null) bits.push(`${scope.sqft} sq ft`);
  if (scope.material) bits.push(scope.material);
  if (scope.color) bits.push(scope.color);
  if (scope.edge) bits.push(scope.edge);
  if (scope.backsplash) bits.push(`Backsplash: ${scope.backsplash}`);
  if (scope.sinkNotes) bits.push(`Sink: ${scope.sinkNotes}`);
  if (scope.cutoutNotes) bits.push(`Cutouts: ${scope.cutoutNotes}`);
  if (scope.waterfall) bits.push("Waterfall");
  if (scope.fullHeightSplash) bits.push("Full-height splash");
  return bits.length ? bits.join(" · ") : "Scope details pending sync";
}

function isManagerRole(role: string): boolean {
  const r = role.trim().toLowerCase();
  return r === "admin" || r === "super_admin" || r === "executive";
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

  const managerMode = isManagerRole(userRole);

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
        const me = (await apiGet("/api/me", sessionToken)) as { user?: { role?: string } };
        if (!cancelled) setUserRole(String(me?.user?.role ?? "").trim());
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

  const jobs = day?.jobs ?? [];
  const dayWarnings = day?.warnings ?? [];
  const warningCount = dayWarnings.length + jobs.reduce((n, j) => n + (j.warnings?.length ?? 0), 0);
  const firstStop = jobs[0];
  const dataSource = formatDataSourceLabel(day?.meta?.source);
  const debugMetaLine = managerMode
    ? [
        day?.meta?.selectedDate ? `Date: ${day.meta.selectedDate}` : null,
        day?.meta?.calendarRowCount != null ? `Calendar rows: ${day.meta.calendarRowCount}` : null,
        day?.meta?.brainActivityCount != null ? `Brain activities: ${day.meta.brainActivityCount}` : null,
        formatMissingFieldSummary(day?.meta?.missingFieldCounts) || null
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

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
          userSubtitle={userRole ? userRole.replace(/_/g, " ") : userDisplayEmail}
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

      <main className="main">
        {!supabase ? (
          <div className="banner banner-warn" role="alert">
            Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        ) : null}

        {!sessionToken ? (
          <section className="auth-panel" aria-label="Sign in">
            <h1 className="page-title">Install Dashboard</h1>
            <p className="page-sub">Installer Day View — read-only schedule and field-ready job details.</p>
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
            <header className="day-summary">
              <p className="eyebrow">Installer Day View · Read-only</p>
              <h1 className="page-title">{formatDateLabel(selectedDate)}</h1>
              <div className="summary-grid">
                <div className="summary-stat">
                  <span className="summary-label">Crew / truck</span>
                  <strong>{day?.crew?.truckName || day?.crew?.name || "Not assigned"}</strong>
                </div>
                <div className="summary-stat">
                  <span className="summary-label">Stops</span>
                  <strong>{jobs.length}</strong>
                </div>
                <div className="summary-stat">
                  <span className="summary-label">First stop</span>
                  <strong>{firstStop ? formatTime(firstStop.scheduledStart) : "—"}</strong>
                </div>
                <div className="summary-stat">
                  <span className="summary-label">Warnings</span>
                  <strong className={warningCount ? "text-warn" : ""}>{warningCount}</strong>
                </div>
              </div>
              <p className="meta-line">
                Data source: {dataSource}
                {day?.meta?.fixtureMode ? " (fixture mode)" : ""}
              </p>
              {debugMetaLine ? <p className="meta-line meta-debug">{debugMetaLine}</p> : null}
            </header>

            {managerMode ? (
              <section className="manager-bar" aria-label="Manager preview controls">
                <label className="field field-inline">
                  Date
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                </label>
                <label className="field field-inline">
                  Crew / truck
                  <select
                    value={selectedCrewId}
                    onChange={(e) => setSelectedCrewId(e.target.value)}
                    disabled={!crews.length}
                  >
                    {!crews.length ? <option value="">No crews loaded</option> : null}
                    {crews.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.truckName || c.name}
                        {c.branch ? ` · ${c.branch}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void loadDay()}>
                  Load day
                </button>
              </section>
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

            {busy && !jobs.length ? <p className="loading">Loading today&apos;s route…</p> : null}

            {!busy && !err && !jobs.length ? (
              <section className="empty-state">
                <h2>No install jobs for this day</h2>
                <p>Try another date{managerMode ? " or crew" : ""}, or check Moraware sync coverage.</p>
              </section>
            ) : null}

            <div className="job-list">
              {jobs.map((job) => {
                const expanded = expandedJobId === job.id;
                const phone = String(job.contact?.phone ?? "").trim();
                const mapUrl = String(job.mapUrl ?? "").trim();
                return (
                  <article key={job.id} className="job-card">
                    <div className="job-card-head">
                      <span className="stop-badge">Stop {job.sequence ?? "—"}</span>
                      <span className="job-time">{formatTime(job.scheduledStart)}</span>
                    </div>
                    <h2 className="job-title">{job.customerName || job.jobName || "Untitled job"}</h2>
                    <p className="job-sub">{job.jobName}</p>
                    <p className="job-address">{formatAddress(job)}</p>

                    <div className="job-actions">
                      {mapUrl ? (
                        <a className="btn btn-secondary btn-sm" href={mapUrl} target="_blank" rel="noreferrer">
                          Open map
                        </a>
                      ) : (
                        <span className="chip chip-warn">Missing address</span>
                      )}
                      {phone ? (
                        <a className="btn btn-secondary btn-sm" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                          Call {job.contact?.name || "contact"}
                        </a>
                      ) : (
                        <span className="chip chip-warn">No phone</span>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-expanded={expanded}
                        onClick={() => setExpandedJobId(expanded ? null : job.id)}
                      >
                        {expanded ? "Hide details" : "View notes/details"}
                      </button>
                    </div>

                    <p className="scope-line">{scopeSummary(job.scope)}</p>

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
                          <dt>Status</dt>
                          <dd>{job.status || "—"}</dd>
                          <dt>Moraware job</dt>
                          <dd>{job.morawareJobId || "—"}</dd>
                          <dt>Contact</dt>
                          <dd>
                            {[job.contact?.name, job.contact?.phone, job.contact?.email]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </dd>
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
          </>
        )}
      </main>
    </div>
  );
}
