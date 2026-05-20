import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "./lib/api";
import { EOS_LOGO_URL, readOrgDirectoryConfig } from "./lib/config";
import {
  deptMap,
  directManagerId,
  displayName,
  isChartEmpty,
  newId,
  ensureLayout,
  normalizeChartData,
  pruneLayoutForSeats,
  removeRelationshipsForSeat,
  seatMap,
  setDirectManager
} from "./lib/chartUtils";
import { buildEliteStarterChartData } from "./lib/eliteStarterChart";
import {
  APP_TITLE,
  relationshipTypeLabel,
  RELATIONSHIP_TYPE_OPTIONS,
  seatStatusLabel,
  SEAT_STATUS_OPTIONS
} from "./lib/displayLabels";
import OrgChartCanvas from "./ui/OrgChartCanvas";
import PrintOrgChart from "./ui/PrintOrgChart";
import type { ChartData, RelationshipType, Seat, SeatStatus } from "./lib/chartTypes";
import { RECOMMENDED_HEAD_OPTIONS } from "./lib/chartTypes";
import { getSupabase } from "./lib/supabase";

type Tab = "chart" | "departments" | "seats" | "access" | "export";

type MeResp = {
  ok?: boolean;
  can_view?: boolean;
  can_edit?: boolean;
  organization_id?: string;
  user?: { email?: string; role?: string };
};

function AuthShell({
  title,
  children,
  homeUrl
}: {
  title: string;
  children: React.ReactNode;
  homeUrl: string;
}) {
  return (
    <div className="od-app od-auth od-card">
      <img src={EOS_LOGO_URL} alt="Elite Stone Fabrication" style={{ maxWidth: 220, marginBottom: 16 }} />
      <h1>{title}</h1>
      {children}
      <p className="od-muted" style={{ marginTop: 20 }}>
        <a href={homeUrl}>Back to Home</a>
      </p>
    </div>
  );
}

export default function OrgDirectoryApp() {
  const { config: runtimeConfig, missing: configMissing } = readOrgDirectoryConfig();
  const homeUrl = runtimeConfig?.homeUrl ?? "https://www.eliteosfab.com";
  const supabase = getSupabase();
  const [sessionBootstrapped, setSessionBootstrapped] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("chart");
  const [me, setMe] = useState<MeResp | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartId, setChartId] = useState<string | null>(null);
  const [chartDirty, setChartDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState(false);

  const canEdit = Boolean(me?.can_edit);

  /** Restore JWT from shared cookie storage (same pattern as Quote Library / Internal Estimate). */
  useEffect(() => {
    if (!supabase) {
      setSessionBootstrapped(true);
      return;
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const tok = data.session?.access_token ?? "";
      setToken(tok || null);
      setSessionBootstrapped(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      setToken(tok || null);
      setSessionBootstrapped(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(async () => {
    setAuthError("");
    if (!supabase) {
      setAuthError("Supabase is not configured for this deployment.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      const t = data.session?.access_token;
      if (!t) throw new Error("No session token");
      setToken(t);
      setPassword("");
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message ?? e));
    } finally {
      setAuthBusy(false);
    }
  }, [email, password, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setToken(null);
    setMe(null);
    setChartData(null);
    setChartId(null);
    setAccessDenied(false);
    setError("");
    setMsg("");
  }, [supabase]);

  const loadMe = useCallback(async () => {
    if (!token) return;
    setMeLoading(true);
    setError("");
    setAccessDenied(false);
    try {
      const m = (await apiFetch("/api/org-directory/me", token)) as MeResp;
      setMe(m);
    } catch (e: unknown) {
      setMe(null);
      setChartData(null);
      setChartId(null);
      if (e instanceof ApiError) {
        if (e.status === 401) {
          setToken(null);
          if (supabase) await supabase.auth.signOut();
          setAuthError("Sign in required — your session expired or is invalid.");
          return;
        }
        if (e.status === 403) {
          setAccessDenied(true);
          setError(
            e.message ||
              "Org Chart access required. Ask an administrator to grant Org Directory in System Admin."
          );
          return;
        }
      }
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setMeLoading(false);
    }
  }, [token, supabase]);

  const loadChart = useCallback(
    async (opts?: { seed?: boolean }) => {
      if (!token || accessDenied) return;
      setLoading(true);
      setError("");
      try {
        const q = opts?.seed ? "?seed=starter" : "";
        const r = (await apiFetch(`/api/org-directory/chart${q}`, token)) as {
          chart?: { id?: string; chart_data?: ChartData };
          seeded?: boolean;
        };
        const cd = r.chart?.chart_data;
        if (cd) setChartData(normalizeChartData(cd as ChartData));
        setChartId(r.chart?.id ?? null);
        setChartDirty(false);
        if (r.seeded) {
          setMsg("Starter chart loaded from server — click Save changes if you make further edits.");
        }
      } catch (e: unknown) {
        if (e instanceof ApiError && e.status === 401) {
          setToken(null);
          if (supabase) await supabase.auth.signOut();
          setAuthError("Sign in required — your session expired or is invalid.");
          return;
        }
        if (e instanceof ApiError && e.status === 403) {
          setAccessDenied(true);
          setError(
            e.message ||
              "Org Chart access required. Ask an administrator to grant Org Directory in System Admin."
          );
          return;
        }
        setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [token, accessDenied, supabase]
  );

  useEffect(() => {
    if (!token) {
      setMe(null);
      setAccessDenied(false);
      return;
    }
    void loadMe();
  }, [token, loadMe]);

  useEffect(() => {
    if (!token || !me || accessDenied) return;
    void loadChart();
  }, [token, me, accessDenied, loadChart]);

  const saveChart = useCallback(async () => {
    if (!token || !chartData || !canEdit) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      await apiFetch("/api/org-directory/chart", token, {
        method: "PATCH",
        body: JSON.stringify({ chart_data: chartData })
      });
      setMsg("Changes saved.");
      setChartDirty(false);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }, [token, chartData, canEdit]);

  const loadStarterChart = useCallback(
    (opts?: { skipConfirm?: boolean }) => {
      if (!canEdit) {
        setError("You do not have edit access to load the starter chart.");
        return;
      }
      const hasWork = (chartData?.seats?.length ?? 0) > 0;
      if (hasWork && !opts?.skipConfirm) {
        const ok = window.confirm(
          "Replace the current org chart with the starter template?\n\nAny unsaved edits will be lost unless you save first."
        );
        if (!ok) return;
      }
      try {
        const starter = buildEliteStarterChartData();
        if (!starter.seats.length) {
          throw new Error("Starter chart has no roles — contact support.");
        }
        setChartData(normalizeChartData(starter));
        setChartDirty(true);
        setError("");
        setMsg("Starter chart loaded — click Save changes to keep these updates.");
        setTab("chart");
      } catch (e: unknown) {
        setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
      }
    },
    [canEdit, chartData]
  );

  const departments = chartData?.departments ?? [];
  const seats = chartData?.seats ?? [];
  const relationships = chartData?.relationships ?? [];
  const sm = useMemo(() => seatMap(seats), [seats]);
  const dm = useMemo(() => deptMap(departments), [departments]);
  const chartHasSeats = seats.length > 0;

  const selectedSeat = selectedSeatId ? sm.get(selectedSeatId) : null;

  const updateChart = useCallback((fn: (prev: ChartData) => ChartData) => {
    setChartData((prev) => (prev ? normalizeChartData(fn(normalizeChartData(prev))) : prev));
    setChartDirty(true);
  }, []);

  const addDepartment = () => {
    if (!canEdit) return;
    updateChart((prev) => ({
      ...prev,
      departments: [
        ...prev.departments,
        { id: newId("dept"), name: "New Department", color: "#64748b", sortOrder: prev.departments.length + 1 }
      ]
    }));
  };

  const addSeat = () => {
    if (!canEdit) return;
    const id = newId("seat");
    updateChart((prev) => ({
      ...prev,
      seats: [
        ...prev.seats,
        {
          id,
          personName: "",
          title: "New Role",
          departmentId: prev.departments[0]?.id ?? null,
          branch: "",
          status: "open",
          notes: "",
          recommendedHeads: []
        }
      ]
    }));
    setSelectedSeatId(id);
    setTab("seats");
  };

  const exportJson = async () => {
    if (!token) return;
    const r = (await apiFetch("/api/org-directory/export", token)) as { chart_data?: ChartData };
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eliteos-org-chart-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const importJsonFile = (file: File) => {
    if (!canEdit) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { chart_data?: ChartData } & ChartData;
        const cd = parsed.chart_data ?? parsed;
        if (!cd.seats || !cd.departments) throw new Error("Invalid chart JSON");
        setChartData(
          normalizeChartData({
            departments: cd.departments,
            seats: cd.seats,
            relationships: cd.relationships ?? [],
            layout: cd.layout
          })
        );
        setChartDirty(true);
        setMsg("Imported JSON into editor — click Save changes to persist.");
      } catch (e: unknown) {
        setError(String((e as Error)?.message ?? e));
      }
    };
    reader.readAsText(file);
  };

  if (configMissing.length > 0) {
    return (
      <AuthShell title={APP_TITLE} homeUrl={homeUrl}>
        <p className="od-muted">This deployment is missing required configuration.</p>
        <ul className="od-muted">
          {configMissing.map((k) => (
            <li key={k}>
              <code>{k}</code> is not set
            </li>
          ))}
        </ul>
        <p className="od-muted">Set these on the Vercel project for app-org-directory, then redeploy.</p>
      </AuthShell>
    );
  }

  if (!sessionBootstrapped) {
    return (
      <AuthShell title={APP_TITLE} homeUrl={homeUrl}>
        <p className="od-muted">Loading session…</p>
      </AuthShell>
    );
  }

  if (!token) {
    return (
      <AuthShell title={APP_TITLE} homeUrl={homeUrl}>
        <p className="od-muted">Sign in with your Elite Stone Fabrication / eliteOS account.</p>
        {authError ? <div className="od-error">{authError}</div> : null}
        <label>
          Email
          <input className="od-form-grid" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label style={{ marginTop: 12 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !authBusy && void signIn()}
            autoComplete="current-password"
          />
        </label>
        <button
          type="button"
          className="od-btn od-btn-primary"
          style={{ marginTop: 16 }}
          disabled={authBusy}
          onClick={() => void signIn()}
        >
          {authBusy ? "Signing in…" : "Sign in"}
        </button>
      </AuthShell>
    );
  }

  if (meLoading && !me && !accessDenied) {
    return (
      <AuthShell title={APP_TITLE} homeUrl={homeUrl}>
        <p className="od-muted">Loading your org chart access…</p>
      </AuthShell>
    );
  }

  if (accessDenied) {
    return (
      <AuthShell title={APP_TITLE} homeUrl={homeUrl}>
        <div className="od-error">Org Chart access required</div>
        <p className="od-muted">
          {error || "Ask an administrator to grant Org Directory access in System Admin."}
        </p>
        <button type="button" className="od-btn" style={{ marginTop: 12 }} onClick={() => void signOut()}>
          Sign out
        </button>
      </AuthShell>
    );
  }

  if (error && !me) {
    return (
      <AuthShell title={APP_TITLE} homeUrl={homeUrl}>
        <div className="od-error">{error}</div>
        <button type="button" className="od-btn od-btn-primary" style={{ marginTop: 12 }} onClick={() => void loadMe()}>
          Retry
        </button>
        <button type="button" className="od-btn" style={{ marginTop: 8 }} onClick={() => void signOut()}>
          Sign out
        </button>
      </AuthShell>
    );
  }

  return (
    <div className={`od-app ${printMode ? "od-print-mode" : ""}`}>
      <div className="od-print-header od-print-only">
        <h1>{APP_TITLE}</h1>
      </div>

      <header className="od-header od-no-print">
        <div className="od-header-main">
          <img className="od-logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
          <div>
            <h1>{APP_TITLE}</h1>
            <p className="od-subtitle">
              Build and maintain the company structure by role, department, location, and reporting relationship.
            </p>
            <div className="od-pill-row">
              <span className={`od-pill ${canEdit ? "od-pill-edit" : "od-pill-view"}`}>
                {canEdit ? "Can edit" : "View only"}
              </span>
              {chartDirty ? <span className="od-pill od-pill-warn">Unsaved changes</span> : null}
            </div>
            <details className="od-access-details">
              <summary>Access details</summary>
              <div className="od-access-details-body">
                {me?.user?.email ? <div className="od-access-line">{me.user.email}</div> : null}
                {me?.user?.role ? <div className="od-access-line od-access-muted">Signed in as {me.user.role}</div> : null}
              </div>
            </details>
          </div>
        </div>
        <div className="od-toolbar od-header-actions">
          {canEdit ? (
            <button type="button" className="od-btn od-btn-primary" disabled={saving || !chartDirty} onClick={() => void saveChart()}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          ) : null}
          <button type="button" className="od-btn" onClick={() => void loadChart()}>
            Refresh
          </button>
          <button type="button" className="od-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="od-callout od-no-print">
        Org planning workspace. User invitations and app access are managed separately in System Admin.
      </div>

      {error ? <div className="od-error od-no-print">{error}</div> : null}
      {msg ? (
        <p className="od-muted od-no-print" style={{ color: "#166534" }}>
          {msg}
        </p>
      ) : null}

      <nav className="od-nav od-no-print">
        {(
          [
            ["chart", "Org Chart"],
            ["departments", "Departments"],
            ["seats", "Roles & People"],
            ["access", "Tool Access Planning"],
            ["export", "Export / Print"]
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {loading && !chartData ? <p className="od-muted">Loading chart…</p> : null}
      {!loading && chartData && isChartEmpty(chartData) && tab !== "chart" ? (
        <p className="od-muted od-no-print">Chart is empty — open Org Chart and load the starter chart.</p>
      ) : null}

      {chartData && tab === "chart" && (
        <div className="od-card od-chart-card">
          <div className="od-toolbar od-no-print">
            {canEdit ? (
              <>
                <button type="button" className="od-btn" onClick={addSeat}>
                  Add role
                </button>
                {chartHasSeats ? (
                  <button type="button" className="od-btn od-btn-quiet" onClick={() => void loadStarterChart()}>
                    Reset to starter chart
                  </button>
                ) : (
                  <button type="button" className="od-btn od-btn-primary" onClick={() => loadStarterChart({ skipConfirm: true })}>
                    Load starter chart
                  </button>
                )}
              </>
            ) : null}
            <button
              type="button"
              className="od-btn od-no-print"
              onClick={() => {
                setTab("chart");
                setPrintMode(true);
              }}
            >
              Print view
            </button>
            {printMode ? (
              <>
                <button type="button" className="od-btn od-btn-primary od-no-print" onClick={() => window.print()}>
                  Print document
                </button>
                <button type="button" className="od-btn od-no-print" onClick={() => setPrintMode(false)}>
                  Exit print
                </button>
              </>
            ) : null}
          </div>
          {!chartHasSeats ? (
            <div className="od-empty-chart od-no-print">
              <p className="od-empty-title">Start your org chart</p>
              <p className="od-muted">
                Load the starter chart to preview leadership, branch lanes, and open roles — then click{" "}
                <strong>Save changes</strong> to keep your work.
              </p>
              {canEdit ? (
                <button
                  type="button"
                  className="od-btn od-btn-primary"
                  style={{ marginTop: 12 }}
                  onClick={() => void loadStarterChart({ skipConfirm: true })}
                >
                  Load starter chart
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className={`od-screen-chart${printMode ? " od-screen-chart--hidden" : ""}`}>
                <OrgChartCanvas
                  chartData={chartData}
                  canEdit={canEdit}
                  selectedSeatId={selectedSeatId}
                  onSelectSeat={setSelectedSeatId}
                  onChartChange={updateChart}
                />
              </div>
              <div className={`od-print-chart-surface${printMode ? " od-print-chart-surface--active" : ""}`}>
                <PrintOrgChart chartData={chartData} />
              </div>
            </>
          )}
        </div>
      )}

      {chartData && tab === "departments" && (
        <div className="od-card">
          <div className="od-toolbar od-no-print">
            {canEdit ? (
              <button type="button" className="od-btn od-btn-primary" onClick={addDepartment}>
                Add department
              </button>
            ) : null}
          </div>
          <div className="od-dept-list">
            {[...departments].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => (
              <div key={d.id} className="od-dept-row">
                <span className="od-swatch" style={{ background: d.color }} />
                {canEdit ? (
                  <>
                    <input
                      value={d.name}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          departments: prev.departments.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x))
                        }))
                      }
                    />
                    <input
                      type="color"
                      value={d.color}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          departments: prev.departments.map((x) => (x.id === d.id ? { ...x, color: e.target.value } : x))
                        }))
                      }
                    />
                  </>
                ) : (
                  <strong>{d.name}</strong>
                )}
                <span className="od-muted">{seats.filter((s) => s.departmentId === d.id).length} roles</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {chartData && tab === "seats" && (
        <div className="od-card">
          <div className="od-toolbar od-no-print">
            {canEdit ? (
              <button type="button" className="od-btn od-btn-primary" onClick={addSeat}>
                Add role
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div style={{ flex: "1 1 280px" }}>
              <div className="od-table-wrap">
                <table className="od-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Title</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seats.map((s) => (
                      <tr
                        key={s.id}
                        style={{ cursor: "pointer", background: selectedSeatId === s.id ? "#f1f5f9" : undefined }}
                        onClick={() => setSelectedSeatId(s.id)}
                      >
                        <td>{displayName(s)}</td>
                        <td>{s.title}</td>
                        <td>{seatStatusLabel(s.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {selectedSeat && (
              <div style={{ flex: "1 1 320px" }}>
                <h3 style={{ marginTop: 0 }}>Edit role</h3>
                {(() => {
                  const mgrId = directManagerId(selectedSeat.id, relationships);
                  const mgr = mgrId ? sm.get(mgrId) : null;
                  const lineRel = mgrId
                    ? relationships.find((r) => r.fromSeatId === selectedSeat.id && r.toSeatId === mgrId)
                    : null;
                  return (
                    <p className="od-muted" style={{ marginTop: 0, marginBottom: 12 }}>
                      {mgr
                        ? `Currently reports to ${displayName(mgr)} (${mgr.title}).`
                        : "Top-level role — no direct manager on the chart."}
                      {lineRel && lineRel.type !== "direct" ?
                        ` Line type: ${relationshipTypeLabel(lineRel.type)}.`
                      : null}
                    </p>
                  );
                })()}
                <div className="od-form-grid">
                  <label>
                    Person name
                    <input
                      disabled={!canEdit}
                      value={selectedSeat.personName}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          seats: prev.seats.map((x) =>
                            x.id === selectedSeat.id ? { ...x, personName: e.target.value } : x
                          )
                        }))
                      }
                    />
                  </label>
                  <label>
                    Title / role
                    <input
                      disabled={!canEdit}
                      value={selectedSeat.title}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          seats: prev.seats.map((x) => (x.id === selectedSeat.id ? { ...x, title: e.target.value } : x))
                        }))
                      }
                    />
                  </label>
                  <label>
                    Department
                    <select
                      disabled={!canEdit}
                      value={selectedSeat.departmentId ?? ""}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          seats: prev.seats.map((x) =>
                            x.id === selectedSeat.id ? { ...x, departmentId: e.target.value || null } : x
                          )
                        }))
                      }
                    >
                      <option value="">—</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Branch / location
                    <input
                      disabled={!canEdit}
                      value={selectedSeat.branch}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          seats: prev.seats.map((x) => (x.id === selectedSeat.id ? { ...x, branch: e.target.value } : x))
                        }))
                      }
                    />
                  </label>
                  <label>
                    Status
                    <select
                      disabled={!canEdit}
                      value={selectedSeat.status}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          seats: prev.seats.map((x) =>
                            x.id === selectedSeat.id ? { ...x, status: e.target.value as SeatStatus } : x
                          )
                        }))
                      }
                    >
                      {SEAT_STATUS_OPTIONS.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Notes
                    <textarea
                      disabled={!canEdit}
                      rows={3}
                      value={selectedSeat.notes}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          seats: prev.seats.map((x) => (x.id === selectedSeat.id ? { ...x, notes: e.target.value } : x))
                        }))
                      }
                    />
                  </label>
                  <label>
                    Reports to
                    <select
                      disabled={!canEdit}
                      value={directManagerId(selectedSeat.id, relationships) ?? ""}
                      onChange={(e) => {
                        const mgr = e.target.value || null;
                        updateChart((prev) => ({
                          ...prev,
                          relationships: setDirectManager(selectedSeat.id, mgr, prev.relationships)
                        }));
                      }}
                    >
                      <option value="">— (top level) —</option>
                      {seats
                        .filter((s) => s.id !== selectedSeat.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {displayName(s)} — {s.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  {directManagerId(selectedSeat.id, relationships) ? (
                    <label>
                      Reporting line type
                      <select
                        disabled={!canEdit}
                        value={
                          relationships.find(
                            (r) =>
                              r.fromSeatId === selectedSeat.id &&
                              r.toSeatId === directManagerId(selectedSeat.id, relationships)
                          )?.type ?? "direct"
                        }
                        onChange={(e) => {
                          const mgr = directManagerId(selectedSeat.id, relationships);
                          if (!mgr) return;
                          const t = e.target.value as RelationshipType;
                          updateChart((prev) => ({
                            ...prev,
                            relationships: prev.relationships.map((r) =>
                              r.fromSeatId === selectedSeat.id && r.toSeatId === mgr ? { ...r, type: t } : r
                            )
                          }));
                        }}
                      >
                        {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="od-btn"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      updateChart((prev) => {
                        const nextSeats = prev.seats.filter((x) => x.id !== selectedSeat.id);
                        const seatIds = new Set(nextSeats.map((s) => s.id));
                        return {
                          ...prev,
                          seats: nextSeats,
                          relationships: removeRelationshipsForSeat(selectedSeat.id, prev.relationships),
                          layout: pruneLayoutForSeats(ensureLayout(prev), seatIds)
                        };
                      });
                      setSelectedSeatId(null);
                    }}
                  >
                    Remove role
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {chartData && tab === "access" && (
        <div className="od-card">
          <p className="od-muted">
            Recommended only — does not change actual eliteOS permissions. Access is managed in System Admin.
          </p>
          <div className="od-table-wrap">
            <table className="od-table">
              <thead>
                <tr>
                  <th>Person / role</th>
                  <th>Responsibility</th>
                  <th>Suggested tools</th>
                </tr>
              </thead>
              <tbody>
                {seats.map((s) => (
                  <tr key={s.id}>
                    <td>{displayName(s)}</td>
                    <td>{s.title}</td>
                    <td>
                      {canEdit ? (
                        <select
                          multiple
                          value={s.recommendedHeads}
                          onChange={(e) => {
                            const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                            updateChart((prev) => ({
                              ...prev,
                              seats: prev.seats.map((x) => (x.id === s.id ? { ...x, recommendedHeads: opts } : x))
                            }));
                          }}
                          style={{ minWidth: 220, minHeight: 80 }}
                        >
                          {RECOMMENDED_HEAD_OPTIONS.map((h) => (
                            <option key={h.slug} value={h.slug}>
                              {h.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        (s.recommendedHeads || []).join(", ") || "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "export" && (
        <div className="od-card">
          <div className="od-toolbar">
            <button type="button" className="od-btn od-btn-primary" onClick={() => void exportJson()}>
              Export JSON
            </button>
            {canEdit ? (
              <label className="od-btn">
                Import JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importJsonFile(f);
                  }}
                />
              </label>
            ) : null}
            <button
              type="button"
              className="od-btn"
              onClick={() => {
                setTab("chart");
                setPrintMode(true);
                window.setTimeout(() => window.print(), 400);
              }}
            >
              Print chart
            </button>
          </div>
          <p className="od-muted">Export downloads your saved org chart (including layout). Import updates the editor — use Save changes to persist.</p>
          {/* TODO: Future roster CSV staging — paste CSV to create draft unassigned seats in an "Unassigned / Review" department. Must not create users or grant access. */}
        </div>
      )}

      <footer className="od-print-footer od-print-only">Generated from eliteOS Org Directory</footer>
    </div>
  );
}
