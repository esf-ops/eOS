import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import { ApiError, apiFetch } from "../lib/api";
import type {
  SalesDashboardRangeKey,
  SalesDashboardRecentQuote,
  SalesDashboardSummary
} from "../lib/types";

/**
 * BentoDashboardView — Phase 1 Sales bento command center.
 *
 * Additive view rendered inside the existing Command Center tab. Fetches the
 * pre-aggregated GET /api/sales-dashboard/summary payload (quote_headers only)
 * and renders presentational, data-driven widgets. No business aggregation
 * happens here — the backend owns all rollups. No Moraware branch/rep
 * attribution is shown in Phase 1.
 *
 * Widgets are intentionally small, self-contained, and prop-driven so they can
 * later be reused by a future Home / My Dashboard without rebuilding them.
 */

type Props = {
  token: string;
  onLoadError: (msg: string) => void;
};

const RANGE_OPTIONS: ReadonlyArray<{ key: SalesDashboardRangeKey; label: string }> = [
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "rolling_30", label: "Last 30 days" },
  { key: "ytd", label: "YTD" }
];

const OUTCOME_COLORS: Record<string, string> = {
  Open: "#0369a1",
  Won: "#047857",
  Lost: "#b91c1c"
};

// ── Formatting helpers (display-only; no business logic) ───────────────────

function money(n: number | null | undefined): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "$0";
  return `$${Math.round(x).toLocaleString("en-US")}`;
}

function compactMoney(n: number | null | undefined): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "$0";
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(x)}`;
}

function count(n: number | null | undefined): string {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString("en-US") : "0";
}

function percent(n: number | null | undefined): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(x)}%`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusClass(status: string | null | undefined): string {
  const s = String(status ?? "").toLowerCase();
  if (/won|sold|accepted|approved/.test(s)) return "bento-pill bento-pill--won";
  if (/lost|rejected|declined|cancel/.test(s)) return "bento-pill bento-pill--lost";
  if (/follow.?up|lead_submitted|reviewing/.test(s)) return "bento-pill bento-pill--warn";
  return "bento-pill";
}

// ── Widget: summary stat strip ─────────────────────────────────────────────

function StatStrip({ data }: { data: SalesDashboardSummary }) {
  const s = data.summary;
  return (
    <div className="bento-stat-strip">
      <div className="bento-stat">
        <span className="bento-stat-label">Open pipeline</span>
        <strong className="bento-stat-value">{compactMoney(s.open_pipeline_value)}</strong>
        <small className="bento-stat-sub">{count(s.active_quote_count)} active quotes</small>
      </div>
      <div className="bento-stat">
        <span className="bento-stat-label">Won value</span>
        <strong className="bento-stat-value bento-stat-value--won">{compactMoney(s.won_value)}</strong>
        <small className="bento-stat-sub">{data.range.key.replace("_", " ")}</small>
      </div>
      <div className="bento-stat">
        <span className="bento-stat-label">Active quotes</span>
        <strong className="bento-stat-value">{count(s.active_quote_count)}</strong>
        <small className="bento-stat-sub">{count(s.total_quote_count)} total in range</small>
      </div>
      <div className="bento-stat">
        <span className="bento-stat-label">Win rate</span>
        <strong className="bento-stat-value">{percent(s.win_rate_pct)}</strong>
        <small className="bento-stat-sub">won / (won + lost)</small>
      </div>
    </div>
  );
}

// ── Widget: quote value trend (area) ───────────────────────────────────────

function TrendCard({ data }: { data: SalesDashboardSummary }) {
  const hasTrend = data.trend.length > 0;
  return (
    <section className="bento-card bento-card--hero">
      <div className="bento-card-head">
        <h3 className="bento-card-title">Quote value trend</h3>
        <span className="bento-card-meta">Monthly · quoted vs won</span>
      </div>
      {hasTrend ? (
        <div className="bento-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="bentoQuoted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0369a1" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0369a1" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="bentoWon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#047857" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#047857" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v) => compactMoney(Number(v))}
              />
              <Tooltip
                formatter={(v: number, name: string) => [money(v), name === "quoted_value" ? "Quoted" : "Won"]}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Legend
                formatter={(value) => (value === "quoted_value" ? "Quoted value" : "Won value")}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Area type="monotone" dataKey="quoted_value" stroke="#0369a1" strokeWidth={2} fill="url(#bentoQuoted)" />
              <Area type="monotone" dataKey="won_value" stroke="#047857" strokeWidth={2} fill="url(#bentoWon)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="bento-empty">No quotes in this range yet.</p>
      )}
    </section>
  );
}

// ── Widget: estimate outcomes donut ────────────────────────────────────────

function OutcomesCard({ data }: { data: SalesDashboardSummary }) {
  const outcomes = data.estimate_outcomes;
  const totalCount = outcomes.reduce((acc, o) => acc + (Number(o.count) || 0), 0);
  return (
    <section className="bento-card">
      <div className="bento-card-head">
        <h3 className="bento-card-title">Estimate outcomes</h3>
        <span className="bento-card-meta">Selected range</span>
      </div>
      {totalCount > 0 ? (
        <>
          <div className="bento-donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outcomes}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="none"
                >
                  {outcomes.map((o) => (
                    <Cell key={o.label} fill={OUTCOME_COLORS[o.label] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, _name: string, entry: { payload?: { value?: number } }) => [
                    `${count(v)} quotes · ${money(entry?.payload?.value)}`,
                    "Count · value"
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bento-donut-legend">
            {outcomes.map((o) => (
              <div className="bento-donut-legend-item" key={o.label}>
                <span className="bento-dot" style={{ background: OUTCOME_COLORS[o.label] ?? "#94a3b8" }} />
                <span className="bento-donut-legend-label">{o.label}</span>
                <strong className="bento-donut-legend-count">{count(o.count)}</strong>
                <small className="bento-donut-legend-value">{compactMoney(o.value)}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="bento-empty">No estimate outcomes in this range yet.</p>
      )}
    </section>
  );
}

// ── Widget: activity / attention queue ─────────────────────────────────────

function ActivityCard({ data }: { data: SalesDashboardSummary }) {
  const a = data.quote_activity;
  return (
    <section className="bento-card">
      <div className="bento-card-head">
        <h3 className="bento-card-title">Activity &amp; attention</h3>
        <span className="bento-card-meta">Quote Library</span>
      </div>
      <div className="bento-activity-grid">
        <div className="bento-mini-stat">
          <span className="bento-mini-label">New today</span>
          <strong className="bento-mini-value">{count(a.new_today)}</strong>
        </div>
        <div className="bento-mini-stat">
          <span className="bento-mini-label">New this week</span>
          <strong className="bento-mini-value">{count(a.new_this_week)}</strong>
        </div>
      </div>
      <div className="bento-activity-list">
        <div className="bento-activity-row">
          <span>Follow-up queue</span>
          <span className={a.follow_up_queue > 0 ? "bento-pill bento-pill--warn" : "bento-pill"}>
            {count(a.follow_up_queue)}
          </span>
        </div>
        <div className="bento-activity-row">
          <span>Monday handoff needed</span>
          <span className={a.monday_handoff_needed > 0 ? "bento-pill bento-pill--info" : "bento-pill"}>
            {count(a.monday_handoff_needed)}
          </span>
        </div>
        <div className="bento-activity-row">
          <span>Average quote value</span>
          <strong className="bento-activity-value">{money(a.average_quote_value)}</strong>
        </div>
      </div>
    </section>
  );
}

// ── Widget: recent quotes table ────────────────────────────────────────────

function RecentQuotesCard({ rows }: { rows: SalesDashboardRecentQuote[] }) {
  return (
    <section className="bento-card bento-card--wide">
      <div className="bento-card-head">
        <h3 className="bento-card-title">Recent quotes</h3>
        <span className="bento-card-meta">Last {rows.length || 10}</span>
      </div>
      {rows.length ? (
        <div className="bento-table-wrap">
          <table className="bento-table">
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Customer / project</th>
                <th>Rep</th>
                <th className="bento-num">Value</th>
                <th>Status</th>
                <th className="bento-num">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id ?? r.quote_number ?? Math.random())}>
                  <td>{r.quote_number || "—"}</td>
                  <td>
                    <span className="bento-cust">{r.customer || "—"}</span>
                    {r.project ? <span className="bento-proj">{r.project}</span> : null}
                  </td>
                  <td>{r.salesperson || "—"}</td>
                  <td className="bento-num">{money(r.value)}</td>
                  <td>
                    <span className={statusClass(r.status)}>{r.status || "—"}</span>
                  </td>
                  <td className="bento-num">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="bento-empty">No recent quotes yet.</p>
      )}
    </section>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────

export default function BentoDashboardView({ token, onLoadError }: Props) {
  const [range, setRange] = useState<SalesDashboardRangeKey>("ytd");
  const [data, setData] = useState<SalesDashboardSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token.trim()) return;
    setBusy(true);
    setError("");
    onLoadError("");
    try {
      const params = new URLSearchParams({ range });
      const json = (await apiFetch(`/api/sales-dashboard/summary?${params.toString()}`, { token })) as SalesDashboardSummary;
      setData(json);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : String((e as Error)?.message ?? e);
      setError(msg);
      onLoadError(msg);
    } finally {
      setBusy(false);
    }
  }, [token, range, onLoadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const trustNotes = useMemo(() => data?.trust_notes ?? [], [data]);

  return (
    <div className="bento-dashboard">
      <div className="bento-toolbar">
        <div>
          <h1 className="bento-h1">Sales command center</h1>
          <p className="bento-sub">
            Quote Library pipeline at a glance. Phase 1 — branch and salesperson Moraware attribution is intentionally
            gated.
          </p>
        </div>
        <div className="bento-range" role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={range === opt.key ? "bento-range-btn is-on" : "bento-range-btn"}
              aria-pressed={range === opt.key}
              onClick={() => setRange(opt.key)}
            >
              {opt.label}
            </button>
          ))}
          <button type="button" className="bento-range-btn" onClick={() => void load()} disabled={busy}>
            {busy ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && !data ? (
        <div className="bento-error" role="alert">
          <p className="bento-error-title">Sales dashboard could not be loaded</p>
          <p className="bento-error-sub">{error}</p>
          <button type="button" className="bento-range-btn" onClick={() => void load()} disabled={busy}>
            Retry
          </button>
        </div>
      ) : null}

      {busy && !data ? <div className="bento-loading">Loading sales dashboard…</div> : null}

      {data ? (
        <>
          <StatStrip data={data} />

          <div className="bento-grid bento-grid--hero">
            <TrendCard data={data} />
            <OutcomesCard data={data} />
          </div>

          <div className="bento-grid bento-grid--mid">
            <ActivityCard data={data} />
            <RecentQuotesCard rows={data.recent_quotes} />
          </div>

          {trustNotes.length ? (
            <div className="bento-trust" role="note">
              <span className="bento-trust-flag" aria-hidden>
                ⚑
              </span>
              <ul className="bento-trust-list">
                {trustNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
