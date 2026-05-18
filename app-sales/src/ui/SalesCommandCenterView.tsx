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

  const load = useCallback(async () => {
    setBusy(true);
    onLoadError("");
    try {
      const json = (await apiFetch("/api/sales/dashboard-foundation", { token })) as SalesDashboardFoundation;
      setData(json);
    } catch (e: unknown) {
      const message = e instanceof ApiError ? e.message : String((e as Error)?.message ?? e);
      onLoadError(message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [token, onLoadError]);

  useEffect(() => {
    if (token.trim()) void load();
  }, [token, load]);

  const actuals = data?.actuals;
  const coverage = data?.attribution_coverage;
  const sync = data?.sync_health;
  const group = sync?.latest_group;
  const groupHealthy = Boolean(group) && Number(group.failed_chunks || 0) === 0;

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

        <div className="pi-grid-cards">
          <div className="pi-card pi-card-warn">
            <p className="pi-card-title">Approved attribution</p>
            <p className="pi-card-value">{pct(coverage?.approvedAccountCoveragePct)}</p>
            <p className="pi-card-note">
              {num(coverage?.approvedMappedAccounts)} / {num(coverage?.totalAccountsSeen)} accounts approved ·{" "}
              {num(coverage?.needsReviewUnmappedAccounts)} need review/unmapped
            </p>
          </div>
          <div className="pi-card pi-card-warn">
            <p className="pi-card-title">Approved job coverage</p>
            <p className="pi-card-value">{pct(coverage?.approvedJobCoveragePct)}</p>
            <p className="pi-card-note">
              {num(coverage?.approvedMappedJobs)} / {num(coverage?.totalJobsSeen)} jobs covered by approved mappings
            </p>
          </div>
          <div className="pi-card">
            <p className="pi-card-title">Moraware jobs</p>
            <p className="pi-card-value">{num(actuals?.jobs_count)}</p>
            <p className="pi-card-note">Synced rows in `brain_moraware_jobs`.</p>
          </div>
          <div className="pi-card">
            <p className="pi-card-title">Accounts</p>
            <p className="pi-card-value">{num(actuals?.accounts_count)}</p>
            <p className="pi-card-note">{num(actuals?.active_account_ids_in_jobs)} account IDs referenced by jobs.</p>
          </div>
          <div className="pi-card">
            <p className="pi-card-title">Activities</p>
            <p className="pi-card-value">{num(actuals?.job_activities_count)}</p>
            <p className="pi-card-note">Read-only Moraware operational activity rows.</p>
          </div>
          <div className="pi-card">
            <p className="pi-card-title">Forms</p>
            <p className="pi-card-value">{num(actuals?.job_forms_count)}</p>
            <p className="pi-card-note">Raw form payload rows available for future metric extraction.</p>
          </div>
          <div className="pi-card">
            <p className="pi-card-title">Quote Library</p>
            <p className="pi-card-value">{num(data?.quote_pipeline?.quote_headers_count)}</p>
            <p className="pi-card-note">Forward pipeline source; forecast events: {num(data?.quote_pipeline?.quote_forecast_events_count)}</p>
          </div>
        </div>

        <div className="sales-attribution-guardrail">
          <strong>Branch revenue/sqft remains preview</strong>
          <p>
            {coverage?.warning ||
              "Revenue/sqft by branch remains preview until approved Sales Account Mapping coverage is high."}
          </p>
          <p>{coverage?.blackstone_guardrail || "Blackstone remains unmapped unless explicitly approved in Brain mapping."}</p>
        </div>

        <div className="sales-foundation-grid">
          <Table title="Jobs by Status" rows={actuals?.status_breakdown || []} labelKey="status" />
          <Table title="Jobs by Process" rows={actuals?.process_breakdown || []} labelKey="process" />
        </div>

        <section className="pi-section">
          <h2>Blueprint Sections Preserved For Buildout</h2>
          <div className="sales-placeholder-grid">
            {(data?.blueprint_preserve || []).map((item) => (
              <div key={item} className="sales-placeholder-card">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="pi-section">
          <h2>Data Gaps Before Full Dashboard Parity</h2>
          <div className="sales-placeholder-grid">
            {(data?.gaps || []).map((item) => (
              <div key={item} className="sales-placeholder-card sales-placeholder-card--warn">
                {item}
              </div>
            ))}
          </div>
        </section>

        <p className="pi-sub">
          Current Moraware job date coverage: {date(actuals?.oldest_job_created_at)} to {date(actuals?.newest_job_created_at)}.
        </p>
      </main>
    </div>
  );
}
