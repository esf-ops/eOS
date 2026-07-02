import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useSalesDashboard } from "./sales-dashboard/SalesDashboardContext";
import SalesDashboardFilters, { SalesFreshnessBanner } from "./sales-dashboard/SalesDashboardFilters";
import SalesExportMenu from "./sales-dashboard/SalesExportMenu";
import { CHART_COLORS, EmptyState, LoadingSkeleton, PanelShell, fmtNum, fmtPct } from "./sales-dashboard/components";

export default function SalesColorsMaterialsPanel() {
  const { data, loading, openColorDetail, patchFilters } = useSalesDashboard();
  const cm = data?.colorsMaterials as Record<string, unknown> | undefined;

  const mixData = [
    { name: "Elite 100", value: Number(cm?.eliteSqft) || 0 },
    { name: "Out of collection", value: Number(cm?.outSqft) || 0 },
    { name: "Unknown", value: Number(cm?.unknownSqft) || 0 }
  ].filter((d) => d.value > 0);

  return (
    <PanelShell
      title="Colors / Materials"
      subtitle="Elite 100 mix, manufacturer breakdown, and out-of-collection opportunities."
      actions={<SalesExportMenu kinds={["colors", "visible_table"]} />}
    >
      <SalesFreshnessBanner />
      <SalesDashboardFilters />
      {loading && !data ? <LoadingSkeleton /> : !data ? (
        <EmptyState title="No color/material data" />
      ) : (
        <div className="sd-stack">
          {!cm?.worksheetEnriched ? (
            <p className="sd-muted">Worksheet color facts are not populated — showing best-effort mix from available rows. Promote Moraware Sales Worksheet report feed for full color intelligence.</p>
          ) : null}
          <div className="sd-stat-row">
            <div className="sd-stat"><span>Elite 100</span><strong>{fmtPct(Number(cm?.eliteShare))}</strong></div>
            <div className="sd-stat"><span>Out of collection</span><strong>{fmtPct(Number(cm?.outShare))}</strong></div>
            <div className="sd-stat"><span>Unknown</span><strong>{fmtPct(Number(cm?.unknownShare))}</strong></div>
          </div>
          <div className="sd-bento-grid sd-bento-grid--2">
            <section className="sd-bento">
              <h3>Collection mix</h3>
              <div className="sd-chart sd-chart--sm">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70}>
                      {mixData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} sqft`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="sd-bento">
              <h3>Elite groups</h3>
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead><tr><th>Group</th><th>Share</th></tr></thead>
                  <tbody>
                    {((cm?.eliteGroupBreakdown as Array<{ group: string; share: number }>) ?? []).map((g) => (
                      <tr key={g.group}>
                        <td><button type="button" className="sd-link-btn" onClick={() => patchFilters({ eliteGroup: g.group, collectionStatus: "elite100" })}>{g.group}</button></td>
                        <td>{fmtPct(g.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <section className="sd-section">
            <h3>Color rows</h3>
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead><tr><th>Color</th><th>Material</th><th>Status</th><th>Sqft</th><th>YoY</th></tr></thead>
                <tbody>
                  {((cm?.colorRows as Array<Record<string, unknown>>) ?? []).slice(0, 40).map((c) => (
                    <tr key={String(c.key)} className="sd-row-click" onClick={() => openColorDetail(String(c.key), `${c.color} — ${c.material}`)}>
                      <td>{String(c.color)}</td>
                      <td>{String(c.material)}</td>
                      <td>{String(c.collectionStatus)}</td>
                      <td>{fmtNum(Number(c.sqft))}</td>
                      <td>{fmtPct(Number(c.yoyPct))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </PanelShell>
  );
}
