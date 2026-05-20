import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError, EOS_LOGO_URL } from "./lib/api";
import {
  childrenOf,
  deptMap,
  directManagerId,
  displayName,
  newId,
  nonDirectRelationships,
  rootSeatIds,
  seatMap,
  setDirectManager
} from "./lib/chartUtils";
import type { ChartData, Department, Relationship, Seat, SeatStatus } from "./lib/chartTypes";
import { RECOMMENDED_HEAD_OPTIONS } from "./lib/chartTypes";
import { getSupabase } from "./lib/supabase";

type Tab = "chart" | "departments" | "seats" | "access" | "export";

type MeResp = {
  can_view?: boolean;
  can_edit?: boolean;
  organization_id?: string;
  user?: { email?: string; role?: string };
};

function SeatNode({ seat, dept }: { seat: Seat; dept?: Department }) {
  const statusClass =
    seat.status === "open"
      ? "od-status-open"
      : seat.status === "future"
        ? "od-status-future"
        : seat.status === "advisor"
          ? "od-status-advisor"
          : "";
  return (
    <div className="od-node" style={dept?.color ? { borderTop: `4px solid ${dept.color}` } : undefined}>
      <div className="od-node-name">{displayName(seat)}</div>
      <div className="od-node-title">{seat.title}</div>
      <div className="od-node-meta">
        {dept ? <span className="od-tag">{dept.name}</span> : null}
        {seat.branch ? <span className="od-tag">{seat.branch}</span> : null}
        <span className={`od-tag ${statusClass}`}>{seat.status}</span>
      </div>
    </div>
  );
}

function TreeBranch({
  seatId,
  seats,
  relationships,
  departments
}: {
  seatId: string;
  seats: Seat[];
  relationships: Relationship[];
  departments: Department[];
}) {
  const sm = seatMap(seats);
  const dm = deptMap(departments);
  const seat = sm.get(seatId);
  if (!seat) return null;
  const kids = childrenOf(seatId, seats, relationships);
  return (
    <li>
      <SeatNode seat={seat} dept={seat.departmentId ? dm.get(seat.departmentId) : undefined} />
      {kids.length > 0 ? (
        <ul>
          {kids.map((c) => (
            <TreeBranch key={c.id} seatId={c.id} seats={seats} relationships={relationships} departments={departments} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function OrgDirectoryApp() {
  const supabase = getSupabase();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("chart");
  const [me, setMe] = useState<MeResp | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartId, setChartId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState(false);

  const canEdit = Boolean(me?.can_edit);

  const signIn = useCallback(async () => {
    setAuthError("");
    if (!supabase) {
      setAuthError("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      const t = data.session?.access_token;
      if (!t) throw new Error("No session token");
      setToken(t);
      setPassword("");
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message ?? e));
    }
  }, [email, password, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setToken(null);
    setMe(null);
    setChartData(null);
  }, [supabase]);

  const loadMe = useCallback(async () => {
    if (!token) return;
    const m = (await apiFetch("/api/org-directory/me", token)) as MeResp;
    setMe(m);
  }, [token]);

  const loadChart = useCallback(
    async (opts?: { seed?: boolean }) => {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const q = opts?.seed ? "?seed=starter" : "";
        const r = (await apiFetch(`/api/org-directory/chart${q}`, token)) as {
          chart?: { id?: string; chart_data?: ChartData };
          seeded?: boolean;
        };
        const cd = r.chart?.chart_data;
        if (cd) setChartData(cd);
        setChartId(r.chart?.id ?? null);
        if (r.seeded) setMsg("Loaded Elite starter chart.");
        await loadMe();
      } catch (e: unknown) {
        setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [token, loadMe]
  );

  useEffect(() => {
    if (token) void loadChart();
  }, [token, loadChart]);

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
      setMsg("Chart saved.");
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }, [token, chartData, canEdit]);

  const departments = chartData?.departments ?? [];
  const seats = chartData?.seats ?? [];
  const relationships = chartData?.relationships ?? [];
  const sm = useMemo(() => seatMap(seats), [seats]);
  const dm = useMemo(() => deptMap(departments), [departments]);
  const roots = useMemo(() => rootSeatIds(seats, relationships), [seats, relationships]);
  const secondaryRels = useMemo(() => nonDirectRelationships(relationships), [relationships]);

  const selectedSeat = selectedSeatId ? sm.get(selectedSeatId) : null;

  const updateChart = (fn: (prev: ChartData) => ChartData) => {
    setChartData((prev) => (prev ? fn(prev) : prev));
  };

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
        setChartData({
          departments: cd.departments,
          seats: cd.seats,
          relationships: cd.relationships ?? []
        });
        setMsg("Imported JSON into editor — click Save to persist.");
      } catch (e: unknown) {
        setError(String((e as Error)?.message ?? e));
      }
    };
    reader.readAsText(file);
  };

  if (!token) {
    return (
      <div className="od-app od-auth od-card">
        <img src={EOS_LOGO_URL} alt="Elite Stone Fabrication" style={{ maxWidth: 220, marginBottom: 16 }} />
        <h1>eliteOS Org Directory</h1>
        <p className="od-muted">Sign in with your eliteOS account (org_directory head access required).</p>
        {authError ? <div className="od-error">{authError}</div> : null}
        <label>
          Email
          <input className="od-form-grid" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={{ marginTop: 12 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void signIn()}
          />
        </label>
        <button type="button" className="od-btn od-btn-primary" style={{ marginTop: 16 }} onClick={() => void signIn()}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className={`od-app ${printMode ? "od-print-mode" : ""}`}>
      <header className="od-header od-no-print">
        <div>
          <img src={EOS_LOGO_URL} alt="" style={{ maxWidth: 180, marginBottom: 8 }} />
          <h1>eliteOS Org Directory</h1>
          <p className="od-subtitle">
            Planning tool for departments, roles, reporting lines, and recommended eliteOS access.
          </p>
          <div className="od-pill-row">
            <span className={`od-pill ${canEdit ? "od-pill-edit" : "od-pill-view"}`}>
              {canEdit ? "Can edit" : "View only"}
            </span>
            {me?.user?.email ? <span className="od-pill">{me.user.email}</span> : null}
            {me?.user?.role ? <span className="od-pill">Role: {me.user.role}</span> : null}
          </div>
        </div>
        <div className="od-toolbar">
          {canEdit ? (
            <button type="button" className="od-btn od-btn-primary" disabled={saving} onClick={() => void saveChart()}>
              {saving ? "Saving…" : "Save chart"}
            </button>
          ) : null}
          <button type="button" className="od-btn" onClick={() => void loadChart()}>
            Reload
          </button>
          <button type="button" className="od-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="od-callout od-no-print">
        <strong>Planning only</strong> — this chart does not change actual eliteOS permissions. System Admin remains
        the source for user invites and head access.
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
            ["seats", "Seat Editor"],
            ["access", "Access Planning"],
            ["export", "Export / Print"]
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {loading && !chartData ? <p className="od-muted">Loading chart…</p> : null}

      {chartData && tab === "chart" && (
        <div className="od-card">
          <div className="od-toolbar od-no-print">
            {canEdit ? (
              <>
                <button type="button" className="od-btn" onClick={addSeat}>
                  Add seat
                </button>
                <button type="button" className="od-btn" onClick={() => void loadChart({ seed: true })}>
                  Load Elite starter chart
                </button>
              </>
            ) : null}
            <button type="button" className="od-btn od-no-print" onClick={() => setPrintMode(true)}>
              Print view
            </button>
            {printMode ? (
              <button type="button" className="od-btn od-no-print" onClick={() => setPrintMode(false)}>
                Exit print
              </button>
            ) : null}
          </div>
          <div className="od-chart-scroll">
            <div className="od-tree">
              <ul>
                {roots.map((rid) => (
                  <TreeBranch key={rid} seatId={rid} seats={seats} relationships={relationships} departments={departments} />
                ))}
              </ul>
            </div>
          </div>
          {secondaryRels.length > 0 ? (
            <div className="od-secondary-rels">
              <strong>Non-direct relationships</strong>
              <ul>
                {secondaryRels.map((r) => {
                  const from = sm.get(r.fromSeatId);
                  const to = sm.get(r.toSeatId);
                  return (
                    <li key={r.id}>
                      {displayName(from!)} → {displayName(to!)} ({r.type}
                      {r.label ? `: ${r.label}` : ""})
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
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
                <span className="od-muted">{seats.filter((s) => s.departmentId === d.id).length} seats</span>
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
                Add seat
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
                        <td>{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {selectedSeat && (
              <div style={{ flex: "1 1 320px" }}>
                <h3 style={{ marginTop: 0 }}>Edit seat</h3>
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
                      {(["filled", "open", "future", "advisor"] as const).map((st) => (
                        <option key={st} value={st}>
                          {st}
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
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="od-btn"
                    style={{ marginTop: 12 }}
                    onClick={() =>
                      updateChart((prev) => ({
                        ...prev,
                        seats: prev.seats.filter((x) => x.id !== selectedSeat.id),
                        relationships: prev.relationships.filter(
                          (r) => r.fromSeatId !== selectedSeat.id && r.toSeatId !== selectedSeat.id
                        )
                      }))
                    }
                  >
                    Remove seat
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {chartData && tab === "access" && (
        <div className="od-card">
          <p className="od-muted">Recommended eliteOS heads by seat — does not grant real permissions.</p>
          <div className="od-table-wrap">
            <table className="od-table">
              <thead>
                <tr>
                  <th>Person / seat</th>
                  <th>Title</th>
                  <th>Recommended heads</th>
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
                setPrintMode(true);
                setTab("chart");
                window.setTimeout(() => window.print(), 300);
              }}
            >
              Print chart
            </button>
          </div>
          <p className="od-muted">Export downloads the server-backed chart. Import updates the editor; save to persist.</p>
        </div>
      )}
    </div>
  );
}
