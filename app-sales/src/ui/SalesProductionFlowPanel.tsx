import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSalesDashboard } from "./sales-dashboard/SalesDashboardContext";
import SalesDashboardFilters, { SalesFreshnessBanner } from "./sales-dashboard/SalesDashboardFilters";
import { EmptyState, LoadingSkeleton, PanelShell, fmtNum } from "./sales-dashboard/components";

export default function SalesProductionFlowPanel() {
  const { data, loading, patchFilters } = useSalesDashboard();
  const pf = data?.productionFlow as Record<string, unknown> | undefined;
  const pvf = pf?.productionVsForecast as { producedSqft?: number; forecastSqft?: number; gapSqft?: number } | undefined;

  return (
    <PanelShell title="Production Flow" subtitle="Moraware production volume, branch mix, and quote/forecast alignment.">
      <SalesFreshnessBanner />
      <SalesDashboardFilters />
      {loading && !data ? <LoadingSkeleton /> : !data ? (
        <EmptyState title="No production data" />
      ) : (
        <div className="sd-stack">
          <div className="sd-stat-row">
            <div className="sd-stat"><span>Produced sqft</span><strong>{fmtNum(Number(pf?.producedSqft))}</strong></div>
            <div className="sd-stat"><span>Jobs</span><strong>{fmtNum(Number(pf?.jobCount))}</strong></div>
            <div className="sd-stat"><span>Forecast gap</span><strong>{fmtNum(pvf?.gapSqft)}</strong></div>
          </div>

          <section className="sd-section">
            <h3>Produced sqft trend</h3>
            <div className="sd-chart">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(pf?.producedSqftTrend as object[]) ?? []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="sqft" fill="#047857" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="sd-section">
            <h3>Production by branch</h3>
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead><tr><th>Branch</th><th>Sqft</th></tr></thead>
                <tbody>
                  {((pf?.productionByBranch as Array<{ branch: string; sqft: number }>) ?? []).map((b) => (
                    <tr key={b.branch}>
                      <td><button type="button" className="sd-link-btn" onClick={() => patchFilters({ branch: b.branch })}>{b.branch}</button></td>
                      <td>{fmtNum(b.sqft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sd-section">
            <h3>Production by rep</h3>
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead><tr><th>Rep</th><th>Sqft</th></tr></thead>
                <tbody>
                  {((pf?.productionBySalesperson as Array<{ rep: string; sqft: number }>) ?? []).map((r) => (
                    <tr key={r.rep}>
                      <td><button type="button" className="sd-link-btn" onClick={() => patchFilters({ salesperson: r.rep })}>{r.rep}</button></td>
                      <td>{fmtNum(r.sqft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {!pf?.backlogSummary && !pf?.installSummary ? (
            <p className="sd-muted">Backlog, capacity, and install calendar summaries are not available in this slice — production uses synced Moraware job facts only.</p>
          ) : null}
        </div>
      )}
    </PanelShell>
  );
}
