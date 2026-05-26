import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import KpiHistoryScaffold from "./KpiHistoryScaffold";

/**
 * KPI v1 — live data panel for the Sales Head KPI History tab.
 *
 * Fetches from GET /api/sales/kpi-v1 and renders source-labeled, freshness-labeled,
 * trust-labeled Quote Library and Moraware production KPI rollups.
 *
 * Source-of-truth rules preserved:
 *   - Quote value uses customer_display_total (customer-facing estimate total)
 *     when available; falls back to grand_total for older quotes.
 *   - Moraware metrics are company-wide actuals only.
 *   - Branch/rep attribution remains gated by approved Sales Account Mapping.
 *   - Account-specific mapping guardrails are enforced — no hardcoded account/customer names.
 *   - Partner Quote metrics are shown as planned/future (no live data yet).
 *   - Unavailable metrics show "Not available" with reason, not 0.
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface KpiPeriod {
  period_label: string;
  period_start: string;
  quote_count?: number;
  customer_quote_value?: number;
  average_quote_value?: number;
  customer_display_total_used?: number;
  grand_total_fallback_used?: number;
  sent_count?: number;
  sold_count?: number;
  lost_count?: number;
  worksheet_sqft?: number;
  job_count?: number;
  jobs_with_sqft?: number;
}

interface QuotePipelineTotals {
  quote_count: number;
  customer_quote_value: number;
  average_quote_value: number;
  customer_display_total_used: number;
  grand_total_fallback_used: number;
}

interface MorawareTotals {
  worksheet_sqft: number;
  job_count: number;
  jobs_with_sqft: number;
  sqft_coverage_pct: number | null;
  average_sqft_per_job: number | null;
}

interface QuotePipeline {
  source: string;
  trust: string;
  customer_display_total_note?: string;
  quote_date_basis?: string;
  periods: KpiPeriod[];
  totals: QuotePipelineTotals | null;
  status_breakdown?: Array<{ status: string; count: number }>;
  status?: string;
  error?: string;
}

interface MorawareActuals {
  source: string;
  trust?: string;
  extraction_status?: string;
  sync_note?: string;
  periods: KpiPeriod[];
  totals: MorawareTotals | null;
  status?: string;
  error?: string;
}

interface KpiV1Response {
  ok: boolean;
  range: { start_date: string; end_date: string; grain: string };
  freshness: {
    moraware_last_success: string | null;
    quote_last_updated: string | null;
    generated_at: string;
  };
  trust: {
    attribution_status: string;
    branch_rep_gated: boolean;
    protected_mapping_rules_enforced: boolean;
    note: string;
  };
  quote_pipeline: QuotePipeline;
  moraware_actuals: MorawareActuals;
  partner_quote: { source: string; status: string; note: string };
  notes: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function fmtSqft(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " sqft";
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "unknown";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function buildDefaultDateRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return { start: `${year}-01-01`, end: `${year}-${mm}-${dd}` };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  source,
  notAvailable,
}: {
  label: string;
  value?: string;
  sub?: string;
  source?: string;
  notAvailable?: string;
}) {
  return (
    <div className="kpi-v1-stat-card">
      <p className="kpi-v1-stat-label">{label}</p>
      {notAvailable ? (
        <p className="kpi-v1-stat-na">{notAvailable}</p>
      ) : (
        <p className="kpi-v1-stat-value">{value ?? "—"}</p>
      )}
      {sub ? <p className="kpi-v1-stat-sub">{sub}</p> : null}
      {source ? <p className="kpi-v1-stat-source">Source · {source}</p> : null}
    </div>
  );
}

function TrustPanel({ trust, freshness, quotePipeline, morawareActuals }: {
  trust: KpiV1Response["trust"];
  freshness: KpiV1Response["freshness"];
  quotePipeline: QuotePipeline;
  morawareActuals: MorawareActuals;
}) {
  return (
    <section className="kpi-v1-trust-panel" aria-label="Data trust and freshness">
      <h3 className="kpi-v1-section-title">Data trust · Freshness · Guardrails</h3>
      <div className="kpi-v1-trust-grid">
        <div className="kpi-v1-trust-item">
          <p className="kpi-v1-trust-label">Quote Library</p>
          <p className="kpi-v1-trust-val">
            Source · <code>quote_headers</code>
          </p>
          <p className="kpi-v1-trust-val">
            Trust · customer-facing quote value ({quotePipeline.trust ?? "—"})
          </p>
          <p className="kpi-v1-trust-val">
            Last activity · {relativeTime(freshness.quote_last_updated)}
          </p>
        </div>
        <div className="kpi-v1-trust-item">
          <p className="kpi-v1-trust-label">Moraware actuals</p>
          <p className="kpi-v1-trust-val">
            Source · <code>sales_moraware_job_facts</code>
          </p>
          <p className="kpi-v1-trust-val">
            Trust · {morawareActuals.trust ?? "company-wide actuals"}
          </p>
          {morawareActuals.extraction_status === "not_available" ? (
            <p className="kpi-v1-trust-val kpi-v1-trust-warn">Not available · {morawareActuals.sync_note}</p>
          ) : (
            <p className="kpi-v1-trust-val">
              Last sync · {relativeTime(freshness.moraware_last_success)}
            </p>
          )}
        </div>
        <div className="kpi-v1-trust-item">
          <p className="kpi-v1-trust-label">Attribution guardrails</p>
          <p className="kpi-v1-trust-val">Branch/rep attribution is gated by approved Sales Account Mapping.</p>
          <p className="kpi-v1-trust-val">Account-specific mapping guardrails are enforced.</p>
          <p className="kpi-v1-trust-val">Company-wide totals are available before branch/rep rollups are trusted.</p>
        </div>
      </div>
      <p className="kpi-v1-generated-at">
        Response generated · {new Date(freshness.generated_at).toLocaleString()}
      </p>
    </section>
  );
}

function QuotePipelineTable({ periods, grain }: { periods: KpiPeriod[]; grain: string }) {
  if (!periods.length) {
    return (
      <p className="kpi-v1-empty-note">
        No quotes found in this date range.
      </p>
    );
  }
  return (
    <div className="kpi-v1-table-wrap">
      <table className="kpi-v1-table">
        <thead>
          <tr>
            <th>{grain === "week" ? "Week of" : "Month"}</th>
            <th>Quotes</th>
            <th>Quote value</th>
            <th>Avg value</th>
            <th>CDT used</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.period_label}>
              <td>{p.period_label}</td>
              <td>{p.quote_count ?? "—"}</td>
              <td>{fmt$(p.customer_quote_value)}</td>
              <td>{fmt$(p.average_quote_value)}</td>
              <td className="kpi-v1-td-muted">
                {p.customer_display_total_used != null
                  ? `${p.customer_display_total_used}/${(p.quote_count ?? 0)}`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MorawareTable({ periods, grain }: { periods: KpiPeriod[]; grain: string }) {
  if (!periods.length) {
    return (
      <p className="kpi-v1-empty-note">
        No Moraware job facts found for this date range. Jobs with a report date in the selected range will appear here once Moraware data is synced.
      </p>
    );
  }
  return (
    <div className="kpi-v1-table-wrap">
      <table className="kpi-v1-table">
        <thead>
          <tr>
            <th>{grain === "week" ? "Week of" : "Month"}</th>
            <th>Worksheet sqft</th>
            <th>Jobs</th>
            <th>Jobs w/ sqft</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.period_label}>
              <td>{p.period_label}</td>
              <td>{fmtSqft(p.worksheet_sqft)}</td>
              <td>{p.job_count ?? "—"}</td>
              <td>{p.jobs_with_sqft ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface KpiV1PanelProps {
  token: string;
}

export default function KpiV1Panel({ token }: KpiV1PanelProps) {
  const defaults = buildDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [grain, setGrain] = useState<"week" | "month">("month");
  const [data, setData] = useState<KpiV1Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchKpi = useCallback(async () => {
    if (!token) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate, grain });
      const result = (await apiFetch(`/api/sales/kpi-v1?${params}`, { token })) as KpiV1Response;
      setData(result);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      // Distinguish network-unreachable from auth/server errors for UI messaging
      const isNetwork = msg.toLowerCase().includes("not reachable") || msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network");
      setError(isNetwork ? "network_unreachable" : msg);
    } finally {
      setLoading(false);
    }
  }, [token, startDate, endDate, grain]);

  useEffect(() => {
    if (token) void fetchKpi();
  }, [fetchKpi, token]);

  const qp = data?.quote_pipeline;
  const ma = data?.moraware_actuals;
  const qtTotals = qp?.totals;
  const maTotals = ma?.totals;
  const qpUnavailable = !qp || qp.status === "not_available";
  const maUnavailable = !ma || ma.status === "not_available" || ma.extraction_status === "not_available";

  return (
    <div className="kpi-v1-panel">
      {/* Controls */}
      <div className="kpi-v1-controls" role="group" aria-label="KPI v1 filters">
        <div className="kpi-v1-ctrl-row">
          <label className="kpi-v1-ctrl-label">
            From
            <input
              type="date"
              className="kpi-v1-date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="kpi-v1-ctrl-label">
            To
            <input
              type="date"
              className="kpi-v1-date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="kpi-v1-ctrl-label">
            Grain
            <select
              className="kpi-v1-grain-select"
              value={grain}
              onChange={(e) => setGrain(e.target.value as "week" | "month")}
            >
              <option value="month">Monthly</option>
              <option value="week">Weekly</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary kpi-v1-refresh-btn"
            onClick={() => void fetchKpi()}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {error && data ? (
          <div className="kpi-v1-stale-warn" role="status">
            Last refresh failed · {error === "network_unreachable" ? "Backend not reachable" : error}
          </div>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="kpi-v1-loading" aria-live="polite">Loading KPI data…</div>
      ) : null}

      {!loading && !data && error ? (
        <div className="kpi-v1-unavailable-card" role="alert">
          <p className="kpi-v1-unavailable-title">
            {error === "network_unreachable"
              ? "Sales KPI service unavailable"
              : "KPI data could not be loaded"}
          </p>
          <p className="kpi-v1-unavailable-sub">
            {error === "network_unreachable"
              ? "The backend is not reachable from this browser. If running locally, start the backend server with npm run eos:server and try again. In production, this resolves automatically."
              : error}
          </p>
          <p className="kpi-v1-unavailable-note">
            No values are shown to avoid displaying incorrect data. Use Refresh to retry when the service is available.
          </p>
          <button
            type="button"
            className="btn btn-primary kpi-v1-refresh-btn"
            onClick={() => void fetchKpi()}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          {/* Top stat cards */}
          <section className="kpi-v1-stats-section" aria-label="KPI summary cards">
            <div className="kpi-v1-stat-group">
              <p className="kpi-v1-group-label">
                Quote Library pipeline
                <span className="kpi-v1-source-chip kpi-v1-source-chip--live">Live</span>
              </p>
              <div className="kpi-v1-stat-row">
                {qpUnavailable ? (
                  <StatCard
                    label="Quote data"
                    notAvailable={`Not available · ${qp?.error ?? "Quote Library data unavailable"}`}
                  />
                ) : (
                  <>
                    <StatCard
                      label="Total quotes"
                      value={String(qtTotals?.quote_count ?? "—")}
                      sub={`${data.range.start_date} – ${data.range.end_date}`}
                      source="Quote Library"
                    />
                    <StatCard
                      label="Quote value"
                      value={fmt$(qtTotals?.customer_quote_value)}
                      sub="Customer-facing estimate total"
                      source="customer_display_total preferred"
                    />
                    <StatCard
                      label="Avg quote value"
                      value={fmt$(qtTotals?.average_quote_value)}
                      sub="Per quote"
                      source="Quote Library"
                    />
                    <StatCard
                      label="CDT / fallback"
                      value={`${qtTotals?.customer_display_total_used ?? 0} CDT / ${qtTotals?.grand_total_fallback_used ?? 0} GT`}
                      sub="customer_display_total vs grand_total"
                      source="value attribution"
                    />
                  </>
                )}
              </div>
            </div>

            <div className="kpi-v1-stat-group">
              <p className="kpi-v1-group-label">
                Moraware production actuals
                {maUnavailable ? (
                  <span className="kpi-v1-source-chip kpi-v1-source-chip--na">Not available</span>
                ) : (
                  <span className="kpi-v1-source-chip kpi-v1-source-chip--live">Live</span>
                )}
              </p>
              <div className="kpi-v1-stat-row">
                {maUnavailable ? (
                  <StatCard
                    label="Moraware actuals"
                    notAvailable={`Not available · ${ma?.sync_note ?? ma?.error ?? "Moraware data unavailable"}`}
                  />
                ) : (
                  <>
                    <StatCard
                      label="Worksheet sqft"
                      value={fmtSqft(maTotals?.worksheet_sqft)}
                      sub="Job Worksheet Sq.Ft."
                      source="sales_moraware_job_facts"
                    />
                    <StatCard
                      label="Job count"
                      value={String(maTotals?.job_count ?? "—")}
                      sub="Jobs in date range"
                      source="Moraware"
                    />
                    <StatCard
                      label="Jobs with sqft"
                      value={`${maTotals?.jobs_with_sqft ?? "—"}${maTotals?.sqft_coverage_pct != null ? ` (${maTotals.sqft_coverage_pct.toFixed(0)}%)` : ""}`}
                      sub="Have worksheet sqft"
                      source="Moraware extraction"
                    />
                    <StatCard
                      label="Avg sqft / job"
                      value={fmtSqft(maTotals?.average_sqft_per_job)}
                      sub="Jobs with sqft only"
                      source="Moraware"
                    />
                  </>
                )}
              </div>
            </div>

            <div className="kpi-v1-stat-group kpi-v1-stat-group--future">
              <p className="kpi-v1-group-label">
                Partner Quote pipeline
                <span className="kpi-v1-source-chip kpi-v1-source-chip--future">Planned</span>
              </p>
              <p className="kpi-v1-future-note">
                {data.partner_quote?.note ?? "Partner Quote KPIs are planned for a future pass."}
              </p>
            </div>
          </section>

          {/* Attribution trust panel */}
          <div className="kpi-v1-attribution-notice" role="note">
            <span className="kpi-v1-attribution-icon" aria-hidden>⚑</span>
            {data.trust.note}
          </div>

          {/* Period tables */}
          <section className="kpi-v1-tables-section" aria-label="KPI period breakdown">
            <div className="kpi-v1-table-block">
              <h3 className="kpi-v1-section-title">
                Quote Library · {grain === "week" ? "Weekly" : "Monthly"} breakdown
                <span className="kpi-v1-source-chip kpi-v1-source-chip--live">Live</span>
              </h3>
              {qpUnavailable ? (
                <p className="kpi-v1-empty-note kpi-v1-na-note">
                  Not available · {qp?.error ?? "Quote Library data could not be loaded."}
                </p>
              ) : (
                <>
                  <QuotePipelineTable
                    periods={(qp as QuotePipeline).periods ?? []}
                    grain={grain}
                  />
                  {(qp as QuotePipeline).status_breakdown?.length ? (
                    <details className="kpi-v1-status-breakdown">
                      <summary>Quote status breakdown</summary>
                      <ul className="kpi-v1-status-list">
                        {(qp as QuotePipeline).status_breakdown!.map((s) => (
                          <li key={s.status}>
                            <code>{s.status}</code> — {s.count}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <p className="kpi-v1-table-note">
                    Quote value · {(qp as QuotePipeline).customer_display_total_note}
                    {" "}Date basis · {(qp as QuotePipeline).quote_date_basis}
                  </p>
                </>
              )}
            </div>

            <div className="kpi-v1-table-block">
              <h3 className="kpi-v1-section-title">
                Moraware · {grain === "week" ? "Weekly" : "Monthly"} breakdown
                {maUnavailable ? (
                  <span className="kpi-v1-source-chip kpi-v1-source-chip--na">Not available</span>
                ) : (
                  <span className="kpi-v1-source-chip kpi-v1-source-chip--live">Live</span>
                )}
              </h3>
              {maUnavailable ? (
                <p className="kpi-v1-empty-note kpi-v1-na-note">
                  Not available · {ma?.sync_note ?? ma?.error ?? "Moraware actuals could not be loaded."}
                </p>
              ) : (
                <>
                  <MorawareTable
                    periods={(ma as MorawareActuals).periods ?? []}
                    grain={grain}
                  />
                  <p className="kpi-v1-table-note">
                    Template count and installed sqft are not available in current Moraware prepared
                    facts. Source · <code>sales_moraware_job_facts.worksheet_sqft</code>.
                    Sync · {(ma as MorawareActuals).sync_note}
                  </p>
                </>
              )}
            </div>
          </section>

          {/* Trust / freshness panel */}
          <TrustPanel
            trust={data.trust}
            freshness={data.freshness}
            quotePipeline={qp ?? { source: "quote_library", trust: "—", periods: [], totals: null }}
            morawareActuals={ma ?? { source: "moraware_prepared_facts", periods: [], totals: null }}
          />
        </>
      ) : null}

      {/* Collapsible architecture scaffold */}
      <div className="kpi-v1-scaffold-toggle">
        <button
          type="button"
          className="kpi-v1-scaffold-toggle-btn"
          onClick={() => setScaffoldOpen((o) => !o)}
          aria-expanded={scaffoldOpen}
        >
          {scaffoldOpen ? "Hide KPI architecture plan" : "Show KPI architecture plan"}
        </button>
        {scaffoldOpen ? (
          <div className="kpi-v1-scaffold-body">
            <KpiHistoryScaffold />
          </div>
        ) : null}
      </div>
    </div>
  );
}
