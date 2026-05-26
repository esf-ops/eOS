import React, { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";

type CountRow = { [key: string]: string | number | null | undefined; count?: number | null };

type SalesDashboardFoundation = {
  ok?: boolean;
  organization_id?: string;
  blueprint_preserve?: string[];
  sync_health?: {
    last_success_age_seconds?: number | null;
    latest_group?: {
      import_group_id?: string | null;
      chunk_count?: number | null;
      expected_chunk_count?: number | null;
      successful_chunks?: number | null;
      failed_chunks?: number | null;
      total_row_counts?: Record<string, number | null>;
    } | null;
    last_successful_run?: { finished_at?: string | null; status?: string | null } | null;
  };
  actuals?: {
    source?: string;
    jobs_count?: number | null;
    accounts_count?: number | null;
    active_account_ids_in_jobs?: number | null;
    job_activities_count?: number | null;
    job_forms_count?: number | null;
    job_files_count?: number | null;
    assignees_count?: number | null;
    resources_count?: number | null;
    oldest_job_created_at?: string | null;
    newest_job_created_at?: string | null;
    status_breakdown?: CountRow[];
    process_breakdown?: CountRow[];
    salesperson_breakdown?: CountRow[];
  };
  attribution_coverage?: {
    totalAccountsSeen?: number | null;
    approvedMappedAccounts?: number | null;
    needsReviewUnmappedAccounts?: number | null;
    rejectedIgnoredAccounts?: number | null;
    totalJobsSeen?: number | null;
    approvedMappedJobs?: number | null;
    needsReviewUnmappedJobs?: number | null;
    rejectedIgnoredJobs?: number | null;
    approvedAccountCoveragePct?: number | null;
    approvedJobCoveragePct?: number | null;
    blackstoneUnapprovedAccounts?: number | null;
    warning?: string;
    blackstone_guardrail?: string;
  };
  synced_sqft_actuals?: {
    source?: string;
    extraction_status?: "available" | "pending" | string;
    total_synced_sqft?: number | null;
    total_jobs_evaluated?: number | null;
    jobs_with_sqft?: number | null;
    jobs_missing_sqft?: number | null;
    sqft_coverage_pct?: number | null;
    average_sqft_per_job?: number | null;
    date_coverage?: { oldest_job_created_at?: string | null; newest_job_created_at?: string | null };
    reporting_definition?: {
      label?: string;
      date_basis?: string;
      status_scope?: string;
      process_scope?: string;
      note?: string;
    };
    active_filters?: {
      datePreset?: string;
      startDate?: string;
      endDate?: string;
      timeGrain?: string;
      account?: string;
      branch?: string;
      salesperson?: string;
      status?: string;
      process?: string;
      attributionStatus?: string;
      sortBy?: string;
      sortDirection?: string;
    };
    grouped_sqft_trend?: Array<{ period: string; total_sqft: number; job_count: number; jobs_with_sqft: number }>;
    monthly_sqft_trend?: Array<{ month: string; total_sqft: number; job_count: number; jobs_with_sqft: number }>;
    top_raw_accounts_by_sqft?: Array<{
      account_name: string;
      source_account_id?: string | null;
      total_sqft: number;
      job_count: number;
      jobs_with_sqft: number;
      attribution_status: string;
      canonical_account_name?: string | null;
      assigned_salesperson?: string | null;
      branch?: string | null;
    }>;
    extraction_sources?: Array<{ source: string; label: string; formTemplateName: string; count: number; confidence: string }>;
    gated_filter_warning?: string | null;
    rows_scanned?: number | null;
    query_page_count?: number | null;
    used_precomputed_rollup?: boolean | null;
    prepared_rollup_warning?: string | null;
    actuals_compute_ms?: number | null;
    attribution_compute_ms?: number | null;
    reconciliation_compute_ms?: number | null;
    reconciliation_status?: string | null;
    jobs_missing_report_date?: number | null;
    status_scope_comparison?: {
      all_jobs?: { total_sqft?: number | null; jobs_with_sqft?: number | null };
      complete_only?: { total_sqft?: number | null; jobs_with_sqft?: number | null };
      active_only?: { total_sqft?: number | null; jobs_with_sqft?: number | null };
    };
    production_report_reconciliation?: {
      title?: string;
      status?: string;
      closest_reference_match?: {
        basis?: string;
        basis_label?: string;
        status_scope?: string;
        total_abs_variance_to_eric?: number | null;
      } | null;
      months?: Array<{
        month: string;
        current_sales_head_sqft: number;
        complete_only_sqft: number;
        active_only_sqft: number;
        alternate_date_basis_sqft?: Record<string, number>;
        eric_reference_total_sqft?: number | null;
        variance_to_eric_sqft?: number | null;
      }>;
      diagnostics?: {
        activities_scanned?: number | null;
        missing_date_counts?: Record<string, number>;
        missing_sqft_counts?: Record<string, number>;
      };
      production_reporting_bucket_plan?: {
        buckets?: string[];
        implementation_note?: string;
      };
      recommendation?: string;
    };
    source_group_complete?: boolean | null;
    source_import_group_id?: string | null;
    source_sync_run_count?: number | null;
    scoped_to_latest_complete_group?: boolean | null;
    notes?: string[];
  };
  quote_pipeline?: {
    quote_headers_count?: number | null;
    quote_headers_error?: string | null;
    quote_forecast_events_count?: number | null;
    quote_forecast_events_error?: string | null;
    status_breakdown?: CountRow[];
  };
  data_contract?: Record<string, string>;
  gaps?: string[];
};

type Props = {
  token: string;
  onLoadError: (msg: string) => void;
};

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function pct(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)}%`;
}

function sqft(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n) : "0";
}

function signedSqft(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${sqft(n)}`;
}

function compact(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n) : "0";
}

function age(seconds: unknown) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return "No successful sync yet";
  if (n < 60) return `${Math.round(n)}s ago`;
  if (n < 3600) return `${Math.round(n / 60)}m ago`;
  if (n < 86400) return `${Math.round(n / 3600)}h ago`;
  return `${Math.round(n / 86400)}d ago`;
}

function date(value: unknown) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

function attributionLabel(value: unknown) {
  const s = String(value ?? "").trim();
  if (s === "approved_mapping") return "Approved";
  if (s === "needs_review") return "Needs review";
  if (s === "rejected" || s === "ignored") return "Ignored";
  return "Needs review";
}

function attributionClass(value: unknown) {
  return String(value ?? "") === "approved_mapping" ? "sales-status-pill sales-status-pill--ok" : "sales-status-pill sales-status-pill--warn";
}

function localYmd(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function Table({ title, rows, labelKey }: { title: string; rows: CountRow[]; labelKey: string }) {
  return (
    <section className="pi-section">
      <h2>{title}</h2>
      <div className="pi-table-wrap">
        <table className="pi-table">
          <thead>
            <tr>
              <th>{labelKey}</th>
              <th className="pi-num">Jobs</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={String(row[labelKey] ?? "unknown")}>
                  <td>{String(row[labelKey] ?? "Unassigned")}</td>
                  <td className="pi-num">{num(row.count)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>No rows yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function SalesCommandCenterView({ token, onLoadError }: Props) {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<SalesDashboardFoundation | null>(null);
  const [datePreset, setDatePreset] = useState("ytd");
  const [timeGrain, setTimeGrain] = useState("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [processFilter, setProcessFilter] = useState("");
  const [attributionStatus, setAttributionStatus] = useState("all");
  const [sortBy, setSortBy] = useState("sqft");
  const [sortDirection, setSortDirection] = useState("desc");

  const load = useCallback(async () => {
    setBusy(true);
    onLoadError("");
    try {
      const p = new URLSearchParams();
      p.set("datePreset", datePreset);
      p.set("timeGrain", timeGrain);
      p.set("sortBy", sortBy);
      p.set("sortDirection", sortDirection);
      p.set("attributionStatus", attributionStatus);
      if (startDate.trim()) p.set("startDate", startDate.trim());
      if (endDate.trim()) p.set("endDate", endDate.trim());
      if (accountFilter.trim()) p.set("account", accountFilter.trim());
      if (branchFilter.trim()) p.set("branch", branchFilter.trim());
      if (salespersonFilter.trim()) p.set("salesperson", salespersonFilter.trim());
      if (statusFilter.trim()) p.set("status", statusFilter.trim());
      if (processFilter.trim()) p.set("process", processFilter.trim());
      const json = (await apiFetch(`/api/sales/dashboard-foundation?${p.toString()}`, { token })) as SalesDashboardFoundation;
      setData(json);
    } catch (e: unknown) {
      const message = e instanceof ApiError ? e.message : String((e as Error)?.message ?? e);
      onLoadError(message);
    } finally {
      setBusy(false);
    }
  }, [
    token,
    onLoadError,
    datePreset,
    timeGrain,
    sortBy,
    sortDirection,
    attributionStatus,
    startDate,
    endDate,
    accountFilter,
    branchFilter,
    salespersonFilter,
    statusFilter,
    processFilter
  ]);

  useEffect(() => {
    if (token.trim()) void load();
  }, [token, load]);

  const actuals = data?.actuals;
  const coverage = data?.attribution_coverage;
  const sqftActuals = data?.synced_sqft_actuals;
  const sync = data?.sync_health;
  const group = sync?.latest_group;
  const groupHealthy = Boolean(group) && Number(group.failed_chunks || 0) === 0;
  const activeFilters = sqftActuals?.active_filters;
  const trendRows = sqftActuals?.grouped_sqft_trend || [];
  const reconciliation = sqftActuals?.production_report_reconciliation;
  const reconciliationRows = reconciliation?.months || [];
  const maxTrendSqft = Math.max(1, ...trendRows.map((row) => Number(row.total_sqft) || 0));
  const topAccounts = sqftActuals?.top_raw_accounts_by_sqft || [];
  const needsReviewAccounts = topAccounts.filter((row) => row.attribution_status !== "approved_mapping").length;
  const quotePipelineCount = Number(data?.quote_pipeline?.quote_forecast_events_count ?? 0) || Number(data?.quote_pipeline?.quote_headers_count ?? 0);
  const preparedRollupMissing = sqftActuals?.extraction_status === "prepared_rollup_missing" || sqftActuals?.used_precomputed_rollup === false;
  const gatedSections = [
    "Rep leaderboard",
    "Branch comparison",
    "Elite 100 mix",
    "Manufacturer / color mix",
    "Account attention list"
  ];
  const rangeLabel =
    activeFilters?.startDate && activeFilters?.endDate ? `${activeFilters.startDate} to ${activeFilters.endDate}` : "YTD";

  function quickPreset(nextPreset: string, nextGrain: string) {
    setDatePreset(nextPreset);
    setTimeGrain(nextGrain);
    setStartDate("");
    setEndDate("");
  }

  function clearFilters() {
    setDatePreset("ytd");
    setTimeGrain("month");
    setStartDate("");
    setEndDate("");
    setAccountFilter("");
    setBranchFilter("");
    setSalespersonFilter("");
    setStatusFilter("");
    setProcessFilter("");
    setAttributionStatus("all");
    setSortBy("sqft");
    setSortDirection("desc");
  }

  return (
    <div className="pi-dashboard">
      <main className="pi-main">
        <div className={`sales-sync-banner ${groupHealthy ? "sales-sync-banner--ok" : "sales-sync-banner--warn"}`}>
          <div>
            <strong>{groupHealthy ? "Moraware sync healthy" : "Moraware sync needs review"}</strong>
            <p>
              Last success {age(sync?.last_success_age_seconds)} · latest group {group?.import_group_id || "none"} ·{" "}
              {num(group?.successful_chunks)}/{num(group?.expected_chunk_count || group?.chunk_count)} chunks successful
            </p>
          </div>
          <button type="button" className="btn" onClick={() => void load()} disabled={busy}>
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <h1 className="pi-h1">Sales Performance Command Center</h1>
        <p className="pi-sub">
          First Brain-backed vertical slice from the uploaded ESF command center blueprint. This view uses aggregate backend
          data only and does not embed production CSV rows or call Moraware from the browser.
        </p>

        <div className="sales-attribution-guardrail">
          <strong>Attribution preview / needs approved mapping</strong>
          <p>
            Account, branch, and salesperson attribution must come from approved Sales Account Mapping Admin rows before it is
            treated as production truth. Current status: {data?.data_contract?.attribution_status || "preview"}.
          </p>
        </div>

        <section className="sales-filter-bar" aria-label="Sales actuals filters">
          <div className="sales-filter-row">
            <button type="button" className={datePreset === "ytd" ? "btn btn-primary" : "btn"} onClick={() => quickPreset("ytd", "month")}>
              YTD
            </button>
            <button type="button" className={datePreset === "quarter" ? "btn btn-primary" : "btn"} onClick={() => quickPreset("quarter", "month")}>
              QTD
            </button>
            <button type="button" className={datePreset === "month" ? "btn btn-primary" : "btn"} onClick={() => quickPreset("month", "week")}>
              MTD
            </button>
            <button type="button" className={datePreset === "week" ? "btn btn-primary" : "btn"} onClick={() => quickPreset("week", "day")}>
              This Week
            </button>
            <button type="button" className={datePreset === "day" ? "btn btn-primary" : "btn"} onClick={() => quickPreset("day", "day")}>
              Today
            </button>
            <button
              type="button"
              className={datePreset === "custom" ? "btn btn-primary" : "btn"}
              onClick={() => {
                setDatePreset("custom");
                setTimeGrain("day");
                setStartDate((v) => v || localYmd());
                setEndDate((v) => v || localYmd());
              }}
            >
              Custom
            </button>
            <button type="button" className="btn" onClick={clearFilters}>
              Clear
            </button>
          </div>
          <div className="sales-filter-grid">
            <label>
              Time grain
              <select value={timeGrain} onChange={(e) => setTimeGrain(e.target.value)}>
                <option value="quarter">Quarter</option>
                <option value="month">Month</option>
                <option value="week">Week</option>
                <option value="day">Day</option>
              </select>
            </label>
            <label>
              Start
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setDatePreset("custom");
                  setStartDate(e.target.value);
                }}
              />
            </label>
            <label>
              End
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setDatePreset("custom");
                  setEndDate(e.target.value);
                }}
              />
            </label>
            <label>
              Account
              <input value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} placeholder="Raw or mapped account" />
            </label>
            <label>
              Branch
              <input value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} placeholder="Approved mappings only" />
            </label>
            <label>
              Salesperson
              <input value={salespersonFilter} onChange={(e) => setSalespersonFilter(e.target.value)} placeholder="Approved mappings only" />
            </label>
            <label>
              Status
              <input value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="Moraware status" />
            </label>
            <label>
              Process
              <input value={processFilter} onChange={(e) => setProcessFilter(e.target.value)} placeholder="Moraware process" />
            </label>
            <label>
              Attribution
              <select value={attributionStatus} onChange={(e) => setAttributionStatus(e.target.value)}>
                <option value="all">All</option>
                <option value="approved">Approved mapping</option>
                <option value="needs_review">Needs review</option>
                <option value="unmapped">Unmapped / ignored</option>
              </select>
            </label>
            <label>
              Sort accounts by
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="sqft">Sq.Ft.</option>
                <option value="jobs">Jobs</option>
                <option value="account">Account</option>
                <option value="date">Date</option>
                <option value="attribution_status">Attribution</option>
              </select>
            </label>
            <label>
              Direction
              <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value)}>
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </label>
          </div>
          <p className="pi-sub sales-active-range">
            Active range: <strong>{rangeLabel}</strong> · Grouped by {activeFilters?.timeGrain || timeGrain}
          </p>
          {sqftActuals?.gated_filter_warning ? <p className="sales-filter-warning">{sqftActuals.gated_filter_warning}</p> : null}
        </section>

        <section className="sales-command-hero" aria-label="Sales command center summary">
          <div className="sales-command-hero__main">
            <p className="pi-card-title">Worksheet Sq.Ft. by current dashboard date basis</p>
            <p className="sales-command-hero__value">{preparedRollupMissing ? "Rollup needed" : sqft(sqftActuals?.total_synced_sqft)}</p>
            <p>
              {num(sqftActuals?.rows_scanned ?? actuals?.jobs_count)} Moraware jobs scanned from the latest complete baseline group ·{" "}
              {num(sqftActuals?.query_page_count)} query pages · {sqftActuals?.used_precomputed_rollup ? "prepared facts" : "prepared facts unavailable"}
            </p>
          </div>
          <div className="sales-command-kpis">
            <div className="sales-command-kpi">
              <span>Jobs With Sq.Ft.</span>
              <strong>{num(sqftActuals?.jobs_with_sqft)}</strong>
              <small>{pct(sqftActuals?.sqft_coverage_pct)} coverage</small>
            </div>
            <div className="sales-command-kpi">
              <span>Avg Sq.Ft. / Job</span>
              <strong>{sqft(sqftActuals?.average_sqft_per_job)}</strong>
              <small>{num(sqftActuals?.jobs_missing_sqft)} missing sqft</small>
            </div>
            <div className="sales-command-kpi sales-command-kpi--warn">
              <span>Approved Attribution</span>
              <strong>{pct(coverage?.approvedAccountCoveragePct)}</strong>
              <small>{num(coverage?.approvedMappedAccounts)} of {num(coverage?.totalAccountsSeen)} accounts</small>
            </div>
            <div className="sales-command-kpi sales-command-kpi--warn">
              <span>Approved Job Coverage</span>
              <strong>{pct(coverage?.approvedJobCoveragePct)}</strong>
              <small>{num(coverage?.approvedMappedJobs)} of {num(coverage?.totalJobsSeen)} jobs</small>
            </div>
            <div className="sales-command-kpi">
              <span>Quote Pipeline</span>
              <strong>{num(quotePipelineCount)}</strong>
              <small>
                {num(data?.quote_pipeline?.quote_headers_count)} quotes · {num(data?.quote_pipeline?.quote_forecast_events_count)} forecast events
              </small>
            </div>
          </div>
        </section>

        {sqftActuals?.prepared_rollup_warning ? (
          <div className="sales-attribution-guardrail">
            <strong>Prepared Sales facts unavailable</strong>
            <p>{sqftActuals.prepared_rollup_warning}</p>
            <p>
              The dashboard is intentionally not scanning raw Moraware payloads on page load. Run the controlled backend facts
              rebuild after applying the prepared facts migration.
            </p>
          </div>
        ) : null}

        {sqftActuals?.reconciliation_status === "error" ? (
          <div className="sales-attribution-guardrail">
            <strong>Reconciliation unavailable</strong>
            <p>Production report reconciliation failed separately; the main dashboard data remains available.</p>
          </div>
        ) : null}

        {reconciliation ? (
          <section className="pi-section sales-command-panel">
            <div className="sales-section-heading">
              <div>
                <h2>Production Report Reconciliation</h2>
                <p className="pi-sub">
                  Reference-only comparison against Eric&apos;s Jan-Apr 2026 monthly report. This does not change the dashboard
                  source of truth or approved attribution rules.
                </p>
              </div>
              <span className="sales-status-pill sales-status-pill--warn">Diagnostic</span>
            </div>
            <div className="sales-command-kpis">
              <div className="sales-command-kpi">
                <span>Complete-only Sq.Ft.</span>
                <strong>{sqft(sqftActuals?.status_scope_comparison?.complete_only?.total_sqft)}</strong>
                <small>{num(sqftActuals?.status_scope_comparison?.complete_only?.jobs_with_sqft)} jobs with Sq.Ft.</small>
              </div>
              <div className="sales-command-kpi">
                <span>Active-only Sq.Ft.</span>
                <strong>{sqft(sqftActuals?.status_scope_comparison?.active_only?.total_sqft)}</strong>
                <small>{num(sqftActuals?.status_scope_comparison?.active_only?.jobs_with_sqft)} jobs with Sq.Ft.</small>
              </div>
              <div className="sales-command-kpi sales-command-kpi--warn">
                <span>Closest Jan-Apr Definition</span>
                <strong>{reconciliation.closest_reference_match?.basis_label || "Needs review"}</strong>
                <small>
                  {reconciliation.closest_reference_match?.status_scope || "—"} · abs variance{" "}
                  {sqft(reconciliation.closest_reference_match?.total_abs_variance_to_eric)}
                </small>
              </div>
            </div>
            <div className="pi-table-wrap" style={{ marginTop: 12 }}>
              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="pi-num">Dashboard</th>
                    <th className="pi-num">Complete</th>
                    <th className="pi-num">Active</th>
                    <th className="pi-num">Completed date</th>
                    <th className="pi-num">Install date</th>
                    <th className="pi-num">Eric ref</th>
                    <th className="pi-num">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationRows.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td className="pi-num">{sqft(row.current_sales_head_sqft)}</td>
                      <td className="pi-num">{sqft(row.complete_only_sqft)}</td>
                      <td className="pi-num">{sqft(row.active_only_sqft)}</td>
                      <td className="pi-num">{sqft(row.alternate_date_basis_sqft?.completed_date)}</td>
                      <td className="pi-num">{sqft(row.alternate_date_basis_sqft?.install_date)}</td>
                      <td className="pi-num">{sqft(row.eric_reference_total_sqft)}</td>
                      <td className="pi-num">{signedSqft(row.variance_to_eric_sqft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sales-filter-warning">
              {reconciliation.recommendation || "Choose an official production definition before scheduling automated sync."}
            </p>
            <p className="pi-mini-note">
              Planned buckets: {(reconciliation.production_reporting_bucket_plan?.buckets || []).join(", ")}. These should become
              admin-configured production reporting groups with approved account-specific mapping rules.
            </p>
          </section>
        ) : null}

        {sqftActuals?.extraction_status === "pending" ? (
          <div className="sales-attribution-guardrail">
            <strong>Sq.Ft. extraction pending</strong>
            {(sqftActuals.notes || []).map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : (
          <>
            <section className="pi-section sales-command-panel">
            <div className="sales-section-heading">
              <div>
                <h2>Company-Wide Synced Sq.Ft. Trend</h2>
                <p className="pi-sub">
                  Real synced actuals from Brain-owned Moraware Job Worksheet fields. These totals are company-wide and do not
                  require approved account attribution.
                </p>
              </div>
              <span className="sales-status-pill sales-status-pill--ok">
                {activeFilters?.timeGrain || timeGrain} grain
              </span>
            </div>
            <div className="sales-trend-bars">
              {trendRows.length ? (
                trendRows.map((row) => (
                  <div className="sales-trend-row" key={row.period}>
                    <div className="sales-trend-label">
                      <strong>{row.period}</strong>
                      <span>{num(row.jobs_with_sqft || row.job_count)} jobs</span>
                    </div>
                    <div className="sales-trend-track">
                      <span style={{ width: `${Math.max(4, (Number(row.total_sqft || 0) / maxTrendSqft) * 100)}%` }} />
                    </div>
                    <div className="sales-trend-value">{sqft(row.total_sqft)}</div>
                  </div>
                ))
              ) : (
                <p className="pi-sub">No Sq.Ft. trend rows for the active filter set.</p>
              )}
            </div>
            </section>

            <section className="pi-section sales-command-panel">
            <div className="sales-section-heading">
              <div>
                <h2>Top Raw Accounts By Sq.Ft.</h2>
                <p className="pi-sub">
                  Raw Moraware account rollups from the filtered baseline. Needs-review accounts should be approved in System Admin
                  before branch or salesperson reporting is trusted.
                </p>
              </div>
              <a className="pi-btn" href="https://system.eliteosfab.com" target="_blank" rel="noreferrer">
                Open Sales Mapping Admin
              </a>
            </div>
            {needsReviewAccounts > 0 ? (
              <p className="sales-filter-warning">{needsReviewAccounts} top account rows still need mapping review.</p>
            ) : null}
            <div className="pi-table-wrap">
              <table className="pi-table">
                <thead>
                  <tr>
                    <th>Raw Account</th>
                    <th className="pi-num">Sq.Ft.</th>
                    <th className="pi-num">Jobs</th>
                    <th>Attribution</th>
                    <th>Approved Owner</th>
                    <th>Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {topAccounts.length ? (
                    topAccounts.map((row) => (
                      <tr className={row.attribution_status === "approved_mapping" ? "" : "sales-row-needs-review"} key={`${row.source_account_id || row.account_name}`}>
                        <td>
                          {row.account_name}
                          {row.canonical_account_name ? <div className="pi-mini-note">Mapped to {row.canonical_account_name}</div> : null}
                        </td>
                        <td className="pi-num">{sqft(row.total_sqft)}</td>
                        <td className="pi-num">{num(row.jobs_with_sqft || row.job_count)}</td>
                        <td>
                          <span className={attributionClass(row.attribution_status)}>{attributionLabel(row.attribution_status)}</span>
                        </td>
                        <td>{row.assigned_salesperson || "Needs approval"}</td>
                        <td>{row.branch || "Unmapped"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>No account Sq.Ft. rows for the active filter set.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </section>
          </>
        )}

        <section className="pi-section sales-command-panel sales-trust-panel">
          <div className="sales-section-heading">
            <div>
              <h2>Attribution Coverage / Trust</h2>
              <p className="pi-sub">
                Company-wide totals can use all valid Sq.Ft. rows. Branch and rep totals stay gated until approved mappings cover
                the underlying accounts and jobs.
              </p>
            </div>
            <span className="sales-status-pill sales-status-pill--warn">Branch / rep totals gated</span>
          </div>
          <div className="sales-trust-grid">
            <div>
              <span>Approved accounts</span>
              <strong>{num(coverage?.approvedMappedAccounts)}</strong>
              <small>{pct(coverage?.approvedAccountCoveragePct)} of seen accounts</small>
            </div>
            <div>
              <span>Unmapped / needs review</span>
              <strong>{num(coverage?.needsReviewUnmappedAccounts)}</strong>
              <small>{num(coverage?.rejectedIgnoredAccounts)} rejected / ignored</small>
            </div>
            <div>
              <span>Approved job coverage</span>
              <strong>{pct(coverage?.approvedJobCoveragePct)}</strong>
              <small>{num(coverage?.approvedMappedJobs)} approved mapped jobs</small>
            </div>
            <div>
              <span>Attribution guardrail</span>
              <strong>Protected</strong>
              <small>Account-specific mapping guardrails are active. Protected attribution rules are enforced.</small>
            </div>
          </div>
          <p className="sales-filter-warning">
            {coverage?.warning || "Branch and salesperson Sq.Ft. totals remain preview until approved mapping coverage is high."}
          </p>
        </section>

        <div className="sales-foundation-grid">
          <Table title="Jobs by Status" rows={actuals?.status_breakdown || []} labelKey="status" />
          <Table title="Jobs by Process" rows={actuals?.process_breakdown || []} labelKey="process" />
        </div>

        <section className="pi-section sales-command-panel">
          <h2>Operational Baseline Coverage</h2>
          <div className="sales-ops-grid">
            <div><span>Jobs</span><strong>{compact(actuals?.jobs_count)}</strong></div>
            <div><span>Activities</span><strong>{compact(actuals?.job_activities_count)}</strong></div>
            <div><span>Form Fields</span><strong>{compact(actuals?.job_forms_count)}</strong></div>
            <div><span>Accounts</span><strong>{compact(actuals?.accounts_count)}</strong></div>
          </div>
          <p className="pi-sub">
            Current Moraware job date coverage: {date(actuals?.oldest_job_created_at)} to {date(actuals?.newest_job_created_at)}.
          </p>
        </section>

        <section className="pi-section">
          <h2>Gated Command Center Sections</h2>
          <div className="sales-placeholder-grid">
            {gatedSections.map((item) => (
              <div key={item} className="sales-placeholder-card sales-placeholder-card--locked">
                <strong>{item}</strong>
                <span>Requires approved attribution and/or additional normalized Brain dimensions.</span>
              </div>
            ))}
          </div>
        </section>

        <section className="pi-section">
          <h2>Remaining Data Gaps</h2>
          <div className="sales-placeholder-grid">
            {(data?.gaps || []).map((item) => (
              <div key={item} className="sales-placeholder-card sales-placeholder-card--warn">
                {item}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
