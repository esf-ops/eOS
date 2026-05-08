import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  BarChart as RBarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { MonthlyTrendResponse } from "../lib/types";
import { nf } from "./exec/execFormat";

type Props = {
  data: MonthlyTrendResponse | null;
  loading: boolean;
};

type ChartMode = "chart" | "table" | "both";

function MonthlyTrendPanelInner({ data, loading }: Props) {
  const [mode, setMode] = useState<ChartMode>("both");

  useEffect(() => {
    if (!import.meta.env.DEV || !data) return;
    const w = window as Window & { __eosChartRenderPass?: number };
    w.__eosChartRenderPass = (w.__eosChartRenderPass ?? 0) + 1;
  }, [data]);

  const chartRows = useMemo(() => {
    const months = data?.months ?? [];
    const priorOk = Boolean(data?.priorYearAvailable);
    return months.map((m) => ({
      ...m,
      priorSqFtForChart: priorOk ? (m.prior_worksheet_sqft ?? 0) : undefined
    }));
  }, [data?.year, data?.priorYearAvailable, data?.months]);

  if (loading && !data) {
    return (
      <div className="empty-state">
        <div className="skeleton-block" style={{ height: 240 }} />
      </div>
    );
  }

  if (!data?.months?.length) {
    return <div className="empty-state">Monthly trend data is not available.</div>;
  }

  const y = data.year;
  const py = data.priorYear;

  return (
    <div className="monthly-panel-exec">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.65rem", marginBottom: "0.85rem" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", maxWidth: "52ch", lineHeight: 1.45 }}>
          {!data.priorYearAvailable ? (
            <>Prior-year Brain data is not loaded yet · chart shows {y} worksheet volume.</>
          ) : (
            <>Boardroom worksheet comparison: <strong>{y}</strong> vs <strong>{py}</strong> by month.</>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
          {(["chart", "table", "both"] as ChartMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="btn btn-sm"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              style={{
                ...(mode === m
                  ? { background: "var(--accent)", color: "white", borderColor: "var(--accent)" }
                  : {})
              }}
            >
              {m === "both" ? "Chart + Table" : m === "chart" ? "Chart" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {(mode === "chart" || mode === "both") && (
        <div style={{ height: 300, marginBottom: mode === "both" ? "1rem" : 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RBarChart data={chartRows} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 8" stroke="rgba(15,23,42,0.06)" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                tick={{ fill: "#64748b", fontSize: 12 }}
                axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
                tickFormatter={(v) => {
                  const n = Number(v);
                  return nf(n, n >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 });
                }}
              />
              <Tooltip
                cursor={{ fill: "rgba(15,23,42,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as (typeof chartRows)[0];
                  if (!d) return null;
                  return (
                    <div className="recharts-tooltip-light">
                      <div className="ttl">
                        {d.monthLabel} {d.month.slice(0, 4)}
                      </div>
                      <div>
                        Sq.Ft. ({y}):{" "}
                        <strong>{nf(d.worksheet_sqft, { maximumFractionDigits: 0 })}</strong>
                      </div>
                      <div>
                        Jobs ({y}): <strong>{nf(d.jobs)}</strong>
                      </div>
                      {data.priorYearAvailable && d.prior_worksheet_sqft != null ? (
                        <>
                          <hr style={{ margin: "0.4rem 0", borderColor: "rgba(15,23,42,0.12)" }} />
                          <div>
                            Sq.Ft. ({py}):{" "}
                            <strong>{nf(d.prior_worksheet_sqft, { maximumFractionDigits: 0 })}</strong>
                          </div>
                          <div>
                            Jobs ({py}): <strong>{nf(d.prior_jobs ?? 0)}</strong>
                          </div>
                          {d.sqft_delta != null ? (
                            <div style={{ marginTop: "0.35rem" }}>
                              Δ Sq.Ft.: <strong>{nf(d.sqft_delta, { maximumFractionDigits: 0 })}</strong>
                              {d.sqft_delta_pct != null ? ` (${nf(d.sqft_delta_pct, { maximumFractionDigits: 1 })}%)` : ""}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#64748b", paddingTop: 8 }} />
              <Bar
                dataKey="worksheet_sqft"
                name={`${y} worksheet Sq.Ft.`}
                fill="#c41230"
                radius={[5, 5, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
              />
              {data.priorYearAvailable ? (
                <Bar
                  dataKey="priorSqFtForChart"
                  name={`${py} worksheet Sq.Ft.`}
                  fill="#94a3b8"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive={false}
                />
              ) : null}
            </RBarChart>
          </ResponsiveContainer>
        </div>
      )}

      {(mode === "table" || mode === "both") && (
        <div className="table-scroll">
          <table className="table-exec">
            <thead>
              <tr>
                <th>Month</th>
                <th>Jobs ({y})</th>
                <th>Worksheet Sq.Ft.</th>
                {data.priorYearAvailable ? <th>{py} Sq.Ft.</th> : null}
                {data.priorYearAvailable ? <th>Δ Sq.Ft.</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.months.map((row) => (
                <tr key={row.month}>
                  <td>{row.monthLabel}</td>
                  <td>{nf(row.jobs)}</td>
                  <td>{nf(row.worksheet_sqft, { maximumFractionDigits: 0 })}</td>
                  {data.priorYearAvailable ? (
                    <td>{row.prior_worksheet_sqft != null ? nf(row.prior_worksheet_sqft, { maximumFractionDigits: 0 }) : "—"}</td>
                  ) : null}
                  {data.priorYearAvailable ? (
                    <td>
                      {row.sqft_delta != null
                        ? `${nf(row.sqft_delta, { maximumFractionDigits: 0 })}${
                            row.sqft_delta_pct != null
                              ? ` (${nf(row.sqft_delta_pct, { maximumFractionDigits: 1 })}%)`
                              : ""
                          }`
                        : "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .recharts-tooltip-light {
          background: #ffffff;
          border: 1px solid rgba(15,23,42,0.14);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 12px;
          color: #334155;
          box-shadow: var(--shadow-card);
        }
        .recharts-tooltip-light .ttl { font-weight: 700; margin-bottom: 6px; color: #0f172a; }
      `}</style>
    </div>
  );
}

export default React.memo(MonthlyTrendPanelInner);
