import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ApiError, apiFetch } from "../lib/api";
import { config } from "../lib/config";
import type { Session } from "@supabase/supabase-js";

type Me = {
  ok: true;
  user: {
    id: string;
    email: string;
    role: string;
    fullName: string;
    department: string;
  };
};

function computeHealthExplanation(health: any) {
  const latest = health?.latestSyncRun;
  const status = String(health?.latestSyncStatus ?? latest?.status ?? "").toLowerCase();
  const unresolved = Number(health?.unresolvedFailedJobCount ?? 0) || 0;
  const lock = health?.currentLock;
  const lockExpired = health?.lockExpired === true;
  const hasActiveLock = Boolean(lock) && !lockExpired;

  const isGreen = status === "success" && unresolved === 0 && !hasActiveLock;
  const isRed = status === "failed";
  const isYellow = !isGreen && !isRed;

  return {
    status,
    unresolved,
    hasActiveLock,
    lockExpired,
    rules: {
      green: "Green: latest sync succeeded, no active lock, no unresolved failures.",
      yellow: "Yellow: partial error, active sync, or unresolved failures.",
      red: "Red: latest sync failed or stale."
    },
    computed: isGreen ? "green" : isRed ? "red" : isYellow ? "yellow" : "unknown"
  };
}

function healthColor(health: any) {
  const latest = health?.latestSyncRun;
  const status = String(health?.latestSyncStatus ?? latest?.status ?? "").toLowerCase();
  const unresolved = Number(health?.unresolvedFailedJobCount ?? 0) || 0;
  const lock = health?.currentLock;
  const lockExpired = health?.lockExpired === true;
  const hasActiveLock = Boolean(lock) && !lockExpired;

  if (status === "success" && unresolved === 0 && !hasActiveLock) return { label: "green", color: "#22c55e" };
  if (status === "failed") return { label: "red", color: "#ef4444" };
  if (status === "partial_error" || unresolved > 0) return { label: "yellow", color: "#f59e0b" };
  // stale / unknown
  return { label: "yellow", color: "#f59e0b" };
}

function fmt(dt: any) {
  if (!dt) return "";
  try {
    return new Date(String(dt)).toLocaleString();
  } catch {
    return String(dt);
  }
}

export default function App() {
  const [sessionToken, setSessionToken] = useState<string>("");
  const [session, setSession] = useState<Session | null>(null);
  const [loadingUser, setLoadingUser] = useState<boolean>(true);
  const [lastLoadStartedAt, setLastLoadStartedAt] = useState<string>("");
  const [me, setMe] = useState<Me | null>(null);
  const [authError, setAuthError] = useState<string>("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [health, setHealth] = useState<any>(null);
  const [syncRuns, setSyncRuns] = useState<any[]>([]);
  const [failedJobs, setFailedJobs] = useState<any[]>([]);
  const [dataError, setDataError] = useState<string>("");
  const [actionMsg, setActionMsg] = useState<string>("");
  const [apiDebug, setApiDebug] = useState<Record<string, any>>({});
  const [showDebug, setShowDebug] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");
  const [toast, setToast] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [titansPulse, setTitansPulse] = useState<{
    syncFreshness?: { lastBrainSyncAt?: string | null; freshnessLabel?: string | null; ageSeconds?: number | null };
    recommendedSyncCadence?: string;
  } | null>(null);

  const role = me?.user?.role || "";
  const allowed = role === "admin" || role === "executive";

  const latestOperationalSyncCandidate = useMemo(() => {
    for (const r of syncRuns) {
      if (r?.ingest_operational === true || /operational/i.test(String(r?.mode ?? ""))) return r;
    }
    return syncRuns[0] ?? null;
  }, [syncRuns]);

  const badge = useMemo(() => (health ? healthColor(health) : { label: "unknown", color: "#94a3b8" }), [health]);
  const healthExplain = useMemo(() => computeHealthExplanation(health), [health]);

  function clearDataState() {
    setMe(null);
    setHealth(null);
    setSyncRuns([]);
    setFailedJobs([]);
    setTitansPulse(null);
    setDataError("");
    setActionMsg("");
    setApiDebug({});
  }

  function recordApi(path: string, patch: any) {
    setApiDebug((d) => ({ ...d, [path]: { ...(d?.[path] || {}), ...patch } }));
  }

  function pushToast(kind: "info" | "error", text: string) {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4500);
  }

  async function loadAll(token: string) {
    const startedAt = new Date().toISOString();
    setLastLoadStartedAt(startedAt);
    setLoadingUser(true);
    setDataError("");

    recordApi("/api/me", { status: "starting", startedAt });
    recordApi("/api/brain/sync-health", { status: "pending" });
    recordApi("/api/brain/sync-runs", { status: "pending" });
    recordApi("/api/brain/failed-jobs", { status: "pending" });

    try {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("calling /api/me");
      }

      const m = (await apiFetch("/api/me", { token })) as Me;
      setMe(m);
      recordApi("/api/me", { status: 200, ok: true });

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("/api/me response status:", 200);
      }

      if (!(m.user.role === "admin" || m.user.role === "executive")) {
        recordApi("/api/brain/sync-health", { status: "skipped", ok: false, reason: "role_not_allowed" });
        recordApi("/api/brain/sync-runs", { status: "skipped", ok: false, reason: "role_not_allowed" });
        recordApi("/api/brain/failed-jobs", { status: "skipped", ok: false, reason: "role_not_allowed" });
        return;
      }

      recordApi("/api/brain/sync-health", { status: "starting" });
      const h = await apiFetch("/api/brain/sync-health", { token });
      setHealth(h);
      recordApi("/api/brain/sync-health", { status: 200, ok: true });

      recordApi("/api/brain/sync-runs", { status: "starting" });
      const r: any = await apiFetch("/api/brain/sync-runs?limit=10", { token });
      const runs = r?.syncRuns || r?.runs || r?.rows || [];
      setSyncRuns(Array.isArray(runs) ? runs : []);
      recordApi("/api/brain/sync-runs", { status: 200, ok: true, count: Array.isArray(runs) ? runs.length : null });

      recordApi("/api/brain/failed-jobs", { status: "starting" });
      const f: any = await apiFetch("/api/brain/failed-jobs?limit=50", { token });
      const fj = f?.failedJobs || f?.jobs || f?.rows || [];
      setFailedJobs(Array.isArray(fj) ? fj : []);
      recordApi("/api/brain/failed-jobs", { status: 200, ok: true, count: Array.isArray(fj) ? fj.length : null });

      recordApi("/api/titans/today?limit=1 (pulse probe)", { status: "starting" });
      try {
        const pulseYmd = new Date().toLocaleDateString("en-CA");
        const pulse: any = await apiFetch(`/api/titans/today?date=${pulseYmd}&limit=1`, { token });
        setTitansPulse({
          syncFreshness: pulse?.syncFreshness,
          recommendedSyncCadence: pulse?.recommendedSyncCadence
        });
        recordApi("/api/titans/today?limit=1 (pulse probe)", { status: 200, ok: true });
      } catch (_e: unknown) {
        setTitansPulse(null);
        recordApi("/api/titans/today?limit=1 (pulse probe)", { status: "skipped", reason: "pulse_unavailable" });
      }

      setLastRefreshedAt(new Date().toISOString());
    } catch (e: any) {
      if (e instanceof ApiError) {
        recordApi("error", { status: e.status, ok: false, body: e.body, message: e.message });
        setDataError(e.message);
        if (e.status === 401) {
          // session likely expired; force sign-out so user sees login screen
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore
          }
        }
        return;
      }
      const msg = String(e?.message || e);
      recordApi("error", { ok: false, message: msg });
      setDataError(
        `Could not reach backend API at VITE_BACKEND_URL. Check that npm run eos:server is running and CORS allows this origin.\n\nDetails: ${msg}`
      );
    } finally {
      setLoadingUser(false);
    }
  }

  useEffect(() => {
    let alive = true;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("Brain Health mount");
      // eslint-disable-next-line no-console
      console.log("BrainHealth config:", { backend: config.backendBaseUrl });
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        const s = data.session ?? null;
        setSession(s);
        const token = s?.access_token || "";
        setSessionToken(token);
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("session loaded:", Boolean(s));
        }
        if (token) loadAll(token).catch(() => {});
        else setLoadingUser(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoadingUser(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (!alive) return;
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("auth state change:", evt, { hasSession: Boolean(s) });
      }
      setSession(s);
      const token = s?.access_token || "";
      setSessionToken(token);

      if (evt === "SIGNED_OUT" || !token) {
        clearDataState();
        setLoadingUser(false);
        return;
      }

      /** Supabase rotates JWTs silently — syncing token only avoids dashboard flashes (Executive parity). */
      if (evt === "TOKEN_REFRESHED") {
        return;
      }

      /** Hydration replay — `/api/me` bootstrap already driven by `getSession()` above. */
      if (evt === "INITIAL_SESSION") {
        return;
      }

      clearDataState();
      if (evt === "SIGNED_IN" || evt === "USER_UPDATED") {
        loadAll(token).catch(() => {});
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      setAuthError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function triggerRecentSync() {
    const token = session?.access_token || sessionToken;
    if (!token) return;
    setActionMsg("");
    setBusy(true);
    try {
      const r = await apiFetch("/api/admin/sync/recent", { token, method: "POST" });
      setActionMsg(`Triggered recent sync (pid=${r?.pid ?? "?"}).`);
      pushToast("info", "Recent sync started.");
    } catch (e: any) {
      setActionMsg(`Failed to trigger recent sync: ${String(e?.message || e)}`);
      pushToast("error", `Failed to start recent sync: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
      if (token) loadAll(token).catch(() => {});
    }
  }

  async function triggerRetryFailed() {
    const token = session?.access_token || sessionToken;
    if (!token) return;
    setActionMsg("");
    setBusy(true);
    try {
      const r = await apiFetch("/api/admin/sync/retry-failed", { token, method: "POST" });
      setActionMsg(`Triggered retry failed (pid=${r?.pid ?? "?"}).`);
      pushToast("info", "Retry failed jobs started.");
    } catch (e: any) {
      setActionMsg(`Failed to trigger retry: ${String(e?.message || e)}`);
      pushToast("error", `Failed to start retry: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
      if (token) loadAll(token).catch(() => {});
    }
  }

  if (!sessionToken && !loadingUser) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 520, margin: "64px auto" }}>
          <div className="title">eliteOS Brain Health</div>
          <div className="muted">Sign in with your eliteOS account.</div>
          <div style={{ height: 12 }} />
          {authError ? <div className="error">{authError}</div> : null}
          <form onSubmit={doLogin} style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn" disabled={busy || !email || !password} type="submit">
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  const unresolvedFailures = Number(health?.unresolvedFailedJobCount ?? 0) || 0;
  const lockActive = Boolean(health?.currentLock) && health?.lockExpired !== true;
  const canRunRecentSync = allowed && !lockActive;
  const canRetryFailed = allowed && unresolvedFailures > 0;

  if (me && !allowed) {
    return (
      <div className="container">
        <div className="card">
          <div className="hstack" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="title">eliteOS Brain Health</div>
              <div className="muted">
                Signed in as <b>{me.user.email}</b> ({me.user.role})
              </div>
            </div>
            <button className="btn" onClick={logout}>
              Sign out
            </button>
          </div>
          <div style={{ height: 16 }} />
          <div className="error">You do not have access to this head.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="hstack" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="title">eliteOS Brain Health / Sync Admin</div>
          <div className="muted">
            Moraware records the work. eliteOS explains the work. The heads move the work.
          </div>
          <div className="muted">
            {me ? (
              <>
                {me.user.fullName ? <b>{me.user.fullName}</b> : <b>{me.user.email}</b>} — {me.user.email} —{" "}
                <span className="pill">{me.user.role}</span>
              </>
            ) : (
              loadingUser ? "Loading user…" : "Not signed in"
            )}
          </div>
        </div>
        <div className="hstack">
          <button
            className="btn"
            onClick={() => {
              const token = session?.access_token || sessionToken;
              if (token) loadAll(token).catch(() => {});
            }}
            disabled={busy || !sessionToken}
          >
            Reload data
          </button>
          {import.meta.env.DEV ? (
            <button className="btn" onClick={() => setShowDebug((v) => !v)} disabled={busy}>
              {showDebug ? "Hide debug" : "Show debug"}
            </button>
          ) : null}
          <button className="btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ height: 16 }} />

      {dataError ? <div className="error">{dataError}</div> : null}
      {import.meta.env.DEV && showDebug ? (
        <div className="card muted" style={{ whiteSpace: "pre-wrap" }}>
          <b>DEV debug</b>
          {"\n"}backend: {config.backendBaseUrl}
          {"\n"}sessionToken: {sessionToken ? "present" : "missing"}
          {"\n"}loadingUser: {String(loadingUser)}
          {"\n"}meLoaded: {String(Boolean(me))}
          {"\n"}lastLoadStartedAt: {lastLoadStartedAt || "(none)"}
          {"\n"}api: {JSON.stringify(apiDebug, null, 2)}
        </div>
      ) : null}
      {actionMsg ? <div className="card muted">{actionMsg}</div> : null}

      <div style={{ height: 16 }} />

      <div className="row">
        <div className="card">
          <div className="hstack" style={{ justifyContent: "space-between" }}>
            <div className="hstack">
              <span className="pill">
                <span className="dot" style={{ background: badge.color }} />
                Brain health: {badge.label}
              </span>
              <span className="pill">Latest status: {health?.latestSyncStatus ?? "-"}</span>
              <span className="pill">Unresolved failures: {health?.unresolvedFailedJobCount ?? 0}</span>
              <span className="pill">Last refreshed: {lastRefreshedAt ? fmt(lastRefreshedAt) : "-"}</span>
            </div>
            <div className="hstack">
              <button
                className="btn"
                onClick={triggerRecentSync}
                disabled={busy || !canRunRecentSync}
                title={lockActive ? "Disabled: sync lock is active." : ""}
              >
                Run Recent Sync
              </button>
              <button
                className="btn"
                onClick={triggerRetryFailed}
                disabled={busy || !canRetryFailed}
                title={unresolvedFailures === 0 ? "Disabled: no unresolved failures." : ""}
              >
                Retry Failed Jobs
              </button>
            </div>
          </div>
          <div style={{ height: 12 }} />
          <div className="muted">
            {healthExplain.rules.green}
            {"\n"}
            {healthExplain.rules.yellow}
            {"\n"}
            {healthExplain.rules.red}
          </div>
          <div style={{ height: 10 }} />
          <div className="muted">
            Latest worksheet Sq.Ft.: <b>{health?.latestWorksheetSqft ?? "-"}</b>
          </div>
          <div className="muted">
            Lock:{" "}
            {health?.currentLock
              ? `${health.currentLock.lock_name} (expires ${fmt(health.currentLock.expires_at)})`
              : "(none)"}
          </div>
          <div className="muted">
            Latest sync: started {fmt(health?.latestSyncRun?.started_at)} — finished {fmt(health?.latestSyncRun?.finished_at)}
          </div>
          <div className="muted">
            Last success: finished {fmt(health?.lastSuccessSyncRun?.finished_at)}
          </div>
          <div style={{ height: 10 }} />
          <div className="hstack">
            <span className="pill">jobs: {health?.latestSyncRun?.jobs_ingested ?? "-"}</span>
            <span className="pill">forms: {health?.latestSyncRun?.forms_extracted ?? "-"}</span>
            <span className="pill">fields: {health?.latestSyncRun?.fields_extracted ?? "-"}</span>
            <span className="pill">activities: {health?.latestSyncRun?.activities_extracted ?? "-"}</span>
            <span className="pill">phases: {health?.latestSyncRun?.phases_extracted ?? "-"}</span>
            <span className="pill">contacts: {health?.latestSyncRun?.contacts_extracted ?? "-"}</span>
          </div>
        </div>

        <div className="card">
          <div className="title">Unresolved failed jobs</div>
          <div className="muted">Placeholder list (latest {failedJobs.length}).</div>
          <div style={{ height: 10 }} />
          <table className="table">
            <thead>
              <tr>
                <th>job_id</th>
                <th>stage</th>
                <th>error</th>
                <th>created</th>
              </tr>
            </thead>
            <tbody>
              {failedJobs.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td>{r.job_id}</td>
                  <td>{r.sync_stage}</td>
                  <td style={{ maxWidth: 420 }}>{String(r.error_message ?? "").slice(0, 180)}</td>
                  <td>{fmt(r.created_at)}</td>
                </tr>
              ))}
              {failedJobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No unresolved failed jobs.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="card">
        <div className="title">Titan Pulse Freshness</div>
        <div className="muted" style={{ maxWidth: 720 }}>
          Live Titan accuracy in Executive Overview follows <b>Moraware activity signals</b> buffered in the Brain — polling
          the API only exposes what ingest already captured. Operational sync refreshes Brain data; nightly full sync fills
          history and retries backlog.
        </div>
        <div style={{ height: 10 }} />
        {titansPulse?.syncFreshness ? (
          <div className="hstack" style={{ flexWrap: "wrap", gap: 8 }}>
            <span className="pill">
              Freshness:&nbsp;<b>{titansPulse.syncFreshness.freshnessLabel ?? "Unknown"}</b>
            </span>
            <span className="pill">
              Latest Brain sync (Titan Pulse):{" "}
              <b>{fmt(titansPulse.syncFreshness.lastBrainSyncAt) || "—"}</b>
            </span>
            {typeof titansPulse.syncFreshness.ageSeconds === "number" &&
            Number.isFinite(titansPulse.syncFreshness.ageSeconds) ? (
              <span className="pill">
                Brain data age:&nbsp;<b>{titansPulse.syncFreshness.ageSeconds}s</b>
              </span>
            ) : null}
          </div>
        ) : (
          <div className="muted">Titan Pulse slice unavailable (Executive API error or insufficient role).</div>
        )}
        <div style={{ height: 10 }} />
        <div className="muted">
          <b>Operational sync cue (runs list heuristic):</b>{" "}
          {latestOperationalSyncCandidate ? (
            <>
              mode&nbsp;<code>{String(latestOperationalSyncCandidate.mode ?? "—")}</code>, finished&nbsp;
              {fmt(latestOperationalSyncCandidate.finished_at)}, ingest_operational:&nbsp;
              <code>{String(latestOperationalSyncCandidate.ingest_operational ?? "?")}</code>
            </>
          ) : (
            "No sync rows loaded."
          )}
        </div>
        <div style={{ height: 10 }} />
        <div className="muted">
          <b>Recommended cadence (documented expectation):</b>{" "}
          {titansPulse?.recommendedSyncCadence ??
            "For live Titan review, run recent operational sync every 5–15 minutes during production hours."}
        </div>
        <div style={{ marginTop: 10, fontWeight: 600 }}>
          Live Titan accuracy depends on recent operational sync cadence.
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="card">
        <div className="title">Recent sync runs</div>
        <div className="muted">Latest {syncRuns.length} runs.</div>
        <div style={{ height: 10 }} />
        <table className="table">
          <thead>
            <tr>
              <th>started</th>
              <th>finished</th>
              <th>status</th>
              <th>jobs</th>
              <th>forms</th>
              <th>fields</th>
              <th>worksheet Sq.Ft.</th>
            </tr>
          </thead>
          <tbody>
            {syncRuns.map((r) => (
              <tr key={r.id}>
                <td>
                  <button className="linkBtn" onClick={() => setSelectedRun(r)}>
                    {fmt(r.started_at)}
                  </button>
                </td>
                <td>{fmt(r.finished_at)}</td>
                <td>{r.status}</td>
                <td>{r.jobs_ingested ?? r.jobs_detailed ?? "-"}</td>
                <td>{r.forms_extracted ?? "-"}</td>
                <td>{r.fields_extracted ?? "-"}</td>
                <td>{r.worksheet_sqft_total ?? "-"}</td>
              </tr>
            ))}
            {syncRuns.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No sync runs returned.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="footer">Keep the Titans running well.</div>

      {toast ? (
        <div className="toast" aria-live="polite">
          <div className="toastInner" style={{ borderColor: toast.kind === "error" ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.14)" }}>
            {toast.text}
          </div>
        </div>
      ) : null}

      {selectedRun ? (
        <div className="modalOverlay" onClick={() => setSelectedRun(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="hstack" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="title">Sync run details</div>
                <div className="muted">
                  id: <b>{String(selectedRun.id)}</b> — status: <b>{String(selectedRun.status)}</b>
                </div>
              </div>
              <button className="btn" onClick={() => setSelectedRun(null)}>
                Close
              </button>
            </div>
            <div style={{ height: 12 }} />
            <div className="hstack">
              <span className="pill">started: {fmt(selectedRun.started_at)}</span>
              <span className="pill">finished: {fmt(selectedRun.finished_at)}</span>
              <span className="pill">jobs: {selectedRun.jobs_ingested ?? "-"}</span>
              <span className="pill">forms: {selectedRun.forms_extracted ?? "-"}</span>
              <span className="pill">fields: {selectedRun.fields_extracted ?? "-"}</span>
            </div>
            <div style={{ height: 12 }} />
            <div className="muted">raw_summary</div>
            <div className="codeBlock">
              {JSON.stringify(selectedRun.raw_summary ?? {}, null, 2)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

