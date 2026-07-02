import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSalesDashboard } from "./sales-dashboard/SalesDashboardContext";
import SalesDashboardFilters, { SalesFreshnessBanner } from "./sales-dashboard/SalesDashboardFilters";
import SalesExportMenu from "./sales-dashboard/SalesExportMenu";
import { EmptyState, LoadingSkeleton, PanelShell, fmtMoney, fmtNum } from "./sales-dashboard/components";

export default function SalesForecastingPanel() {
  const { data, loading, patchFilters } = useSalesDashboard();
  const fc = data?.forecasting as Record<string, unknown> | undefined;

  return (
    <PanelShell
      title="Forecasting"
      subtitle="Forward-looking quote forecast events and weighted pipeline projections."
      actions={<SalesExportMenu kinds={["forecast", "visible_table"]} />}
    >
      <SalesFreshnessBanner />
      <SalesDashboardFilters />
      <div className="sd-forecast-chips">
        {[30, 60, 90].map((d) => (
          <button key={d} type="button" className="sd-chip" onClick={() => patchFilters({ forecastWindow: String(d) })}>
            Next {d} days
          </button>
        ))}
      </div>
      {loading && !data ? <LoadingSkeleton /> : !data ? (
        <EmptyState title="No forecast data" />
      ) : (
        <div className="sd-stack">
          <div className="sd-stat-row">
            {((fc?.forecastCards as Array<{ label: string; value: number }>) ?? []).map((c) => (
              <div key={c.label} className="sd-stat"><span>{c.label}</span><strong>{fmtNum(c.value)}</strong></div>
            ))}
          </div>
          {(fc?.riskInsights as Array<{ text: string; severity: string }>)?.map((i, idx) => (
            <div key={idx} className={`sd-insight sd-insight--${i.severity}`}>{i.text}</div>
          ))}
          <section className="sd-section">
            <h3>Forecast by month</h3>
            <div className="sd-chart">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(fc?.forecastByMonth as object[]) ?? []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="sd-section">
            <h3>Forecast rows</h3>
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead>
                  <tr><th>Quote</th><th>Customer</th><th>Rep</th><th>Status</th><th>Value</th><th>Prob</th></tr>
                </thead>
                <tbody>
                  {((fc?.quoteForecastRows as Array<Record<string, unknown>>) ?? []).slice(0, 25).map((r, i) => (
                    <tr key={String(r.quoteId ?? i)}>
                      <td>{String(r.quoteNumber ?? r.quoteId ?? "—")}</td>
                      <td>{String(r.customerName ?? "—")}</td>
                      <td>{String(r.salesRep ?? "—")}</td>
                      <td>{String(r.quoteStatus ?? "—")}</td>
                      <td>{fmtMoney(Number(r.forecastValue))}</td>
                      <td>{String(r.probabilityPercent ?? "—")}%</td>
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
