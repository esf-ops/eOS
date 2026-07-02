import React, { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { config } from "../lib/config";
import type { SalesDashboardKpi } from "../lib/salesDashboardTypes";
import { useSalesDashboard } from "./sales-dashboard/SalesDashboardContext";
import CommandCenterControls from "./sales-dashboard/CommandCenterControls";
import SalesExportMenu from "./sales-dashboard/SalesExportMenu";
import { CHART_COLORS, EmptyState, LoadingSkeleton } from "./sales-dashboard/components";

const CHART_GRID = "rgba(15, 23, 42, 0.06)";

function fmtKpi(kpi: SalesDashboardKpi | undefined): string {
  if (!kpi || kpi.value == null) return "—";
  const v = kpi.value;
  if (kpi.format === "sqft") return `${Math.round(Number(v)).toLocaleString()} sqft`;
  if (kpi.format === "currency") return `$${Math.round(Number(v)).toLocaleString()}`;
  if (kpi.format === "percent") return `${Number(v).toFixed(1)}%`;
  if (kpi.format === "count") return Number(v).toLocaleString();
  if (kpi.format === "datetime") return v ? new Date(String(v)).toLocaleString() : "—";
  return String(v);
}

function kpiTone(id: string, value: unknown): "good" | "bad" | "warn" | "neutral" {
  const n = Number(value);
  if (id === "yoy_pct" || id === "yoy_sqft") {
    if (!Number.isFinite(n)) return "neutral";
    return n >= 0 ? "good" : "bad";
  }
  if (id === "elite_share") {
    if (!Number.isFinite(n)) return "neutral";
    if (n >= 70) return "good";
    if (n >= 40) return "warn";
    return "bad";
  }
  if (id === "out_share") {
    if (!Number.isFinite(n)) return "neutral";
    if (n <= 25) return "good";
    if (n <= 45) return "warn";
    return "bad";
  }
  if (id === "attention_accounts") {
    if (!Number.isFinite(n) || n === 0) return "good";
    if (n <= 5) return "warn";
    return "bad";
  }
  return "neutral";
}

function deltaClass(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "";
  return n >= 0 ? "cc-delta--up" : "cc-delta--down";
}

const KPI_CARDS = [
  { id: "produced_sqft", label: "Total volume", sub: "Produced sqft in range" },
  { id: "yoy_pct", label: "YoY performance", sub: "Vs same period last year" },
  { id: "elite_share", label: "Elite 100 adoption", sub: "Share of classified sqft" },
  { id: "out_share", label: "Out of collection", sub: "Conversion opportunity sqft" },
  { id: "pipeline_value", label: "Quote pipeline", sub: "Open pipeline value" },
  { id: "attention_accounts", label: "Accounts to focus", sub: "Flagged for manager attention" }
] as const;

export default function SalesCommandCenterPanel() {
  const {
    data,
    loading,
    reload,
    copyExecutiveSummary,
    copyMsg,
    patchFilters,
    openAccountDetail,
    openColorDetail,
    executiveSummaryOpen,
    setExecutiveSummaryOpen
  } = useSalesDashboard();

  const cc = data?.commandCenter;
  const charts = cc?.charts as Record<string, unknown[]> | undefined;
  const kpiMap = useMemo(() => new Map((cc?.kpis ?? []).map((k) => [k.id, k])), [cc?.kpis]);

  const accounts = data?.accounts as {
    topAccounts?: Array<Record<string, unknown>>;
    attentionAccounts?: Array<Record<string, unknown>>;
  } | undefined;

  const colors = data?.colorsMaterials as {
    topEliteColors?: Array<{ color: string; material?: string; sqft: number; key?: string }>;
    topOutOfCollectionColors?: Array<{ color: string; material?: string; sqft: number; key?: string }>;
    eliteShare?: number;
    outShare?: number;
  } | undefined;

  const collectionPie = useMemo(() => {
    const cm = data?.colorsMaterials as { eliteSqft?: number; outSqft?: number; unknownSqft?: number } | undefined;
    return [
      { name: "Elite 100", value: Number(cm?.eliteSqft) || 0 },
      { name: "Out of collection", value: Number(cm?.outSqft) || 0 },
      { name: "Unknown", value: Number(cm?.unknownSqft) || 0 }
    ].filter((d) => d.value > 0);
  }, [data?.colorsMaterials]);

  const attentionByRep = useMemo(() => {
    const rows = accounts?.attentionAccounts ?? [];
    const byRep = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const rep = String(row.normalizedSalesperson ?? row.assignedRep ?? "Unassigned");
      const list = byRep.get(rep) ?? [];
      list.push(row);
      byRep.set(rep, list);
    }
    return [...byRep.entries()].map(([rep, accts]) => ({ rep, accounts: accts.slice(0, 5) }));
  }, [accounts?.attentionAccounts]);

  const meta = data?.meta;

  return (
    <div className="cc-canvas">
      <div className="cc-shell">
        <header className="cc-hero">
          <div className="cc-hero-brand">
            <h1>Sales Performance Command Center</h1>
            <p>Moraware production · Quote Library · Forecast · Elite 100 mix</p>
            <div className="cc-trust-pills">
              <span className="cc-trust-pill">Source · Moraware sync · Quote Library</span>
              <span className="cc-trust-pill">Trust · Approved Sales Account Mapping</span>
              <span className="cc-trust-pill">API · {config.backendBaseUrl || "same origin"}</span>
            </div>
          </div>
          <div className="cc-hero-meta">
            <div><strong>Latest sync:</strong> {meta?.latestMorawareSync ? new Date(meta.latestMorawareSync).toLocaleString() : "—"}</div>
            <div><strong>Loaded range:</strong> {meta?.currentDateRange?.start ?? "—"} → {meta?.currentDateRange?.end ?? "—"}</div>
            <div>
              <strong>Current sqft:</strong> {fmtKpi(kpiMap.get("produced_sqft"))} ·{" "}
              <strong>Elite 100:</strong> {colors?.eliteShare != null ? `${colors.eliteShare.toFixed(1)}%` : "—"}
            </div>
            <div><strong>Confidence:</strong> {Math.round(meta?.dataConfidenceScore ?? 0)}%</div>
          </div>
        </header>

        <div className="cc-actions">
          <button type="button" className="cc-btn" onClick={() => void copyExecutiveSummary()} disabled={loading}>
            {copyMsg || "Copy executive summary"}
          </button>
          <SalesExportMenu kinds={["visible_table", "accounts_attention", "forecast", "data_quality"]} />
        </div>

        <CommandCenterControls />

        {loading && !data ? (
          <LoadingSkeleton rows={10} />
        ) : !data ? (
          <EmptyState title="No dashboard data" action={<button type="button" className="cc-btn cc-btn--primary" onClick={() => void reload()}>Retry</button>} />
        ) : (
          <>
            {data.executiveSummary && executiveSummaryOpen ? (
              <section className="cc-exec" aria-label="Executive summary">
                <div className="cc-exec-head">
                  <div>
                    <p className="cc-exec-eyebrow">Executive summary</p>
                    <h2>{data.executiveSummary.headline}</h2>
                  </div>
                  <button type="button" className="cc-btn" onClick={() => setExecutiveSummaryOpen(false)}>Collapse</button>
                </div>
                {(cc?.insights ?? []).slice(0, 4).map((ins) => (
                  <div key={ins.id} className={`cc-insight cc-insight--${ins.severity}`}>{ins.text}</div>
                ))}
              </section>
            ) : data.executiveSummary ? (
              <button type="button" className="cc-btn" onClick={() => setExecutiveSummaryOpen(true)}>Show executive summary</button>
            ) : null}

            <section className="cc-section">
              <div className="cc-section-title">
                <h2>Company snapshot</h2>
                <p>{meta?.currentDateRange?.quickRange ? `Range: ${meta.currentDateRange.quickRange}` : "Selected filters applied"}</p>
              </div>
              <div className="cc-kpi-grid">
                {KPI_CARDS.map(({ id, label, sub }) => {
                  const kpi = kpiMap.get(id);
                  const tone = kpiTone(id, kpi?.value);
                  return (
                    <article key={id} className={`cc-kpi cc-kpi--${tone}`}>
                      <p className="cc-kpi-label">{label}</p>
                      <p className="cc-kpi-value">{fmtKpi(kpi)}</p>
                      <p className="cc-kpi-sub">{sub}</p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="cc-grid-3">
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Monthly YoY trend</h3>
                  <span>Selected range vs prior year</span>
                </div>
                <div className="cc-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={(charts?.monthlyYoY as object[]) ?? []}>
                      <defs>
                        <linearGradient id="ccGradCur" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a3132f" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#a3132f" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="currentSqft" name="Current year" stroke="#a3132f" fill="url(#ccGradCur)" />
                      <Area type="monotone" dataKey="priorSqft" name="Prior year" stroke="#94a3b8" fill="transparent" strokeDasharray="4 4" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Elite 100 mix</h3>
                  <span>Sqft by collection status</span>
                </div>
                <div className="cc-chart cc-chart--sm">
                  {collectionPie.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={collectionPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                          {collectionPie.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} sqft`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="cc-empty">No classified color sqft in this range.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="cc-grid-2">
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Elite 100 group breakdown</h3>
                  <span>Promo through Group F</span>
                </div>
                <div className="cc-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(charts?.eliteMix as object[]) ?? []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                      <XAxis dataKey="group" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} sqft`} />
                      <Bar dataKey="sqft" fill="#a3132f" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Manufacturer mix</h3>
                  <span>Top manufacturers in range</span>
                </div>
                <div className="cc-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={((charts?.manufacturerMix as Array<{ manufacturer: string; sqft: number }>) ?? []).slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                      <XAxis dataKey="manufacturer" tick={{ fontSize: 9, fill: "#64748b" }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} sqft`} />
                      <Bar dataKey="sqft" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="cc-grid-2">
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Rep summary</h3>
                  <span>Volume, YoY, and adoption</span>
                </div>
                <div className="cc-table-wrap">
                  <table className="cc-table">
                    <thead>
                      <tr>
                        <th>Rep</th>
                        <th>Sqft</th>
                        <th>YoY</th>
                        <th>Accounts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.salesPerformance?.repSummary ?? []).slice(0, 12).map((r) => (
                        <tr key={r.salesperson}>
                          <td>
                            <button type="button" className="cc-table-link" onClick={() => patchFilters({ salesperson: r.salesperson })}>
                              {r.salesperson}
                            </button>
                          </td>
                          <td>{Math.round(r.currentSqft).toLocaleString()}</td>
                          <td className={deltaClass(r.yoyPct)}>{r.yoyPct != null ? `${r.yoyPct.toFixed(1)}%` : "—"}</td>
                          <td>{r.accountCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Sales team insights</h3>
                  <span>Action-oriented observations</span>
                </div>
                <div className="cc-insights">
                  {(cc?.insights ?? []).length ? (
                    cc!.insights!.map((ins) => (
                      <div key={ins.id} className={`cc-insight cc-insight--${ins.severity}`}>{ins.text}</div>
                    ))
                  ) : (
                    <p className="cc-empty">No insights for the current filter set.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="cc-section">
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Top accounts / producers</h3>
                  <span>Account mix, YoY, and collection adoption</span>
                </div>
                <div className="cc-table-wrap">
                  <table className="cc-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Sqft</th>
                        <th>YoY</th>
                        <th>Elite 100</th>
                        <th>OOC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(accounts?.topAccounts ?? []).slice(0, 15).map((a) => (
                        <tr key={String(a.account)}>
                          <td>
                            <button type="button" className="cc-table-link" onClick={() => openAccountDetail(String(a.account))}>
                              {String(a.account)}
                            </button>
                          </td>
                          <td>{Math.round(Number(a.currentSqft) || 0).toLocaleString()}</td>
                          <td className={deltaClass(a.yoyPct as number | null)}>{a.yoyPct != null ? `${Number(a.yoyPct).toFixed(1)}%` : "—"}</td>
                          <td>{a.eliteShare != null ? `${Number(a.eliteShare).toFixed(1)}%` : "—"}</td>
                          <td>{a.outShare != null ? `${Number(a.outShare).toFixed(1)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="cc-section">
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Accounts needing attention by salesperson</h3>
                  <span>Decline, low Elite mix, and out-of-collection opportunity</span>
                </div>
                <div className="cc-table-wrap">
                  <table className="cc-table">
                    <thead>
                      <tr>
                        <th>Rep</th>
                        <th>Account</th>
                        <th>Focus</th>
                        <th>Sqft</th>
                        <th>YoY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attentionByRep.flatMap(({ rep, accounts: accts }) =>
                        accts.map((a) => (
                          <tr key={`${rep}-${String(a.account)}`}>
                            <td>{rep}</td>
                            <td>
                              <button type="button" className="cc-table-link" onClick={() => openAccountDetail(String(a.account))}>
                                {String(a.account)}
                              </button>
                            </td>
                            <td>{String(a.focusScore ?? "—")}</td>
                            <td>{Math.round(Number(a.currentSqft) || 0).toLocaleString()}</td>
                            <td className={deltaClass(a.yoyPct as number | null)}>{a.yoyPct != null ? `${Number(a.yoyPct).toFixed(1)}%` : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="cc-grid-2">
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Top Elite 100 colors</h3>
                  <span>Best-selling collection colors</span>
                </div>
                <div className="cc-table-wrap">
                  <table className="cc-table">
                    <thead><tr><th>Color</th><th>Sqft</th></tr></thead>
                    <tbody>
                      {(colors?.topEliteColors ?? []).slice(0, 10).map((c) => (
                        <tr key={`${c.color}-${c.material ?? ""}`}>
                          <td>
                            <button type="button" className="cc-table-link" onClick={() => openColorDetail(`${c.color}|||${c.material ?? ""}`, `${c.color}${c.material ? ` — ${c.material}` : ""}`)}>
                              {c.color}
                            </button>
                          </td>
                          <td>{Math.round(c.sqft).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="cc-panel">
                <div className="cc-panel-head">
                  <h3>Top out-of-collection colors</h3>
                  <span>Conversion opportunities</span>
                </div>
                <div className="cc-table-wrap">
                  <table className="cc-table">
                    <thead><tr><th>Color</th><th>Sqft</th></tr></thead>
                    <tbody>
                      {(colors?.topOutOfCollectionColors ?? []).slice(0, 10).map((c) => (
                        <tr key={`${c.color}-${c.material ?? ""}`}>
                          <td>
                            <button type="button" className="cc-table-link" onClick={() => openColorDetail(`${c.color}|||${c.material ?? ""}`, `${c.color}${c.material ? ` — ${c.material}` : ""}`)}>
                              {c.color}
                            </button>
                          </td>
                          <td>{Math.round(c.sqft).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
