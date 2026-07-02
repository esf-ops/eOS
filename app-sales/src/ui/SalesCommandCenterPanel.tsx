import React from "react";
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
import { useSalesDashboard } from "./sales-dashboard/SalesDashboardContext";
import SalesDashboardFilters, { SalesFreshnessBanner } from "./sales-dashboard/SalesDashboardFilters";
import ExecutiveSummaryPanel from "./sales-dashboard/ExecutiveSummaryPanel";
import SalesExportMenu from "./sales-dashboard/SalesExportMenu";
import { BentoCard, CHART_COLORS, EmptyState, KpiCard, LoadingSkeleton, PanelShell, deltaClass } from "./sales-dashboard/components";

export default function SalesCommandCenterPanel() {
  const { data, loading, reload, copyInsights, copyMsg, patchFilters, openAccountDetail, openColorDetail } = useSalesDashboard();
  const cc = data?.commandCenter;
  const charts = cc?.charts as Record<string, unknown[]> | undefined;

  return (
    <PanelShell
      title="Sales Command Center"
      subtitle="Synced Moraware production, Quote Library pipeline, forecast signals, and account intelligence — one shapable executive cockpit."
      actions={
        <>
          <button type="button" className="sd-btn sd-btn--ghost" onClick={() => void copyInsights()} disabled={loading}>
            {copyMsg || "Copy insights"}
          </button>
          <SalesExportMenu kinds={["visible_table", "accounts_attention", "forecast", "data_quality"]} />
        </>
      }
    >
      <SalesFreshnessBanner />
      <SalesDashboardFilters />
      <ExecutiveSummaryPanel />

      {loading && !data ? <LoadingSkeleton rows={8} /> : !data ? (
        <EmptyState title="No dashboard data" action={<button type="button" className="sd-btn sd-btn--primary" onClick={() => void reload()}>Retry</button>} />
      ) : (
        <>
          {(cc?.insights?.length ?? 0) > 0 ? (
            <section className="sd-insights">
              {cc!.insights!.map((ins) => (
                <div key={ins.id} className={`sd-insight sd-insight--${ins.severity}`}>{ins.text}</div>
              ))}
            </section>
          ) : null}

          <section className="sd-kpi-strip sd-kpi-strip--hero" aria-label="Key metrics">
            {(cc?.kpis ?? []).slice(0, 6).map((kpi, i) => (
              <KpiCard key={kpi.id} kpi={kpi} hero={i === 0} />
            ))}
          </section>
          <section className="sd-kpi-strip" aria-label="Supporting metrics">
            {(cc?.kpis ?? []).slice(6, 14).map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </section>

          <div className="sd-bento-grid">
            <BentoCard title="Monthly YoY production" hero>
              <div className="sd-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={(charts?.monthlyYoY as object[]) ?? []}>
                    <defs>
                      <linearGradient id="sdGradCur" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a3132f" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#a3132f" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,26,51,0.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="currentSqft" name="Current year" stroke="#a3132f" fill="url(#sdGradCur)" />
                    <Area type="monotone" dataKey="priorSqft" name="Prior year" stroke="#94a3b8" fill="transparent" strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </BentoCard>

            <BentoCard title="Elite 100 mix">
              <div className="sd-chart sd-chart--sm">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={(charts?.eliteMix as object[]) ?? []} dataKey="sqft" nameKey="group" innerRadius={50} outerRadius={75} paddingAngle={2}>
                      {((charts?.eliteMix as object[]) ?? []).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} sqft`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="sd-card-meta">
                Elite {(data.colorsMaterials as { eliteShare?: number })?.eliteShare?.toFixed(1) ?? "—"}% · OOC{" "}
                {(data.colorsMaterials as { outShare?: number })?.outShare?.toFixed(1) ?? "—"}%
              </p>
              <button type="button" className="sd-link-btn" onClick={() => patchFilters({ collectionStatus: "out_of_collection" })}>Filter out-of-collection</button>
            </BentoCard>

            <BentoCard title="Quote pipeline">
              <div className="sd-chart sd-chart--sm">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={(charts?.quoteStatus as object[]) ?? []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(11,26,51,0.06)" />
                    <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BentoCard>

            <BentoCard title="Rep leaderboard">
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead><tr><th>Rep</th><th>Sqft</th><th>YoY</th></tr></thead>
                  <tbody>
                    {(data.salesPerformance?.repSummary ?? []).slice(0, 8).map((r) => (
                      <tr key={r.salesperson}>
                        <td><button type="button" className="sd-link-btn" onClick={() => patchFilters({ salesperson: r.salesperson })}>{r.salesperson}</button></td>
                        <td>{Math.round(r.currentSqft).toLocaleString()}</td>
                        <td className={deltaClass(r.yoyPct)}>{r.yoyPct != null ? `${r.yoyPct.toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BentoCard>

            <BentoCard title="Accounts needing attention" wide>
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead><tr><th>Account</th><th>Focus</th><th>Sqft</th><th>YoY</th></tr></thead>
                  <tbody>
                    {((data.accounts as { attentionAccounts?: Array<{ account: string; focusScore: number; currentSqft: number; yoyPct?: number | null }> })?.attentionAccounts ?? []).slice(0, 8).map((a) => (
                      <tr key={a.account}>
                        <td><button type="button" className="sd-link-btn" onClick={() => openAccountDetail(a.account)}>{a.account}</button></td>
                        <td>{a.focusScore}</td>
                        <td>{Math.round(a.currentSqft).toLocaleString()}</td>
                        <td className={deltaClass(a.yoyPct)}>{a.yoyPct != null ? `${a.yoyPct.toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BentoCard>

            <BentoCard title="Top out-of-collection colors">
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead><tr><th>Color</th><th>Sqft</th></tr></thead>
                  <tbody>
                    {((data.colorsMaterials as { topOutOfCollectionColors?: Array<{ color: string; material: string; sqft: number; key?: string }> })?.topOutOfCollectionColors ?? []).slice(0, 6).map((c) => (
                      <tr key={`${c.color}-${c.material}`}>
                        <td>
                          <button type="button" className="sd-link-btn" onClick={() => openColorDetail(`${c.color}|||${c.material}`, `${c.color} — ${c.material}`)}>
                            {c.color}
                          </button>
                        </td>
                        <td>{Math.round(c.sqft).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BentoCard>
          </div>
        </>
      )}
    </PanelShell>
  );
}
