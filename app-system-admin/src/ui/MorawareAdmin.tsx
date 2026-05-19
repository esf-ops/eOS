import React, { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";

type MorawareTab =
  | "health"
  | "explorer"
  | "fields"
  | "mapping"
  | "prepared"
  | "quality";

type HealthResp = {
  ok: boolean;
  health_status?: string;
  organization_id?: string;
  stale_warning?: boolean;
  sync_freshness_seconds?: number | null;
  latest_run?: { status?: string; mode?: string; import_group_id?: string | null };
  latest_complete_import_group?: {
    import_group_id?: string;
    complete?: boolean;
    successful_chunks?: number;
    expected_chunk_count?: number;
    total_row_counts?: Record<string, number>;
  };
  prepared_facts?: {
    freshness?: string;
    sales_moraware_job_facts?: { table_count?: number; source_import_group_id?: string | null };
    rebuild_endpoint?: string;
    rebuild_requires?: string;
  };
  warnings?: string[];
  scheduled_sync?: { implemented?: boolean; checklist?: string[] };
};

type PaginatedResp = {
  ok: boolean;
  page: number;
  page_size: number;
  total: number;
  rows: Record<string, unknown>[];
  note?: string;
};

function fmt(n: unknown) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString("en-US") : "—";
}

function healthPill(status: string | undefined) {
  const s = String(status || "").toLowerCase();
  if (s === "healthy") return "pill-good";
  if (s === "no_success" || s === "missing") return "pill-bad";
  return "pill-warn";
}

export default function MorawareAdmin({ token }: { token: string }) {
  const [tab, setTab] = useState<MorawareTab>("health");
  const [health, setHealth] = useState<HealthResp | null>(null);
  const [dataQuality, setDataQuality] = useState<Record<string, unknown> | null>(null);
  const [prepared, setPrepared] = useState<Record<string, unknown> | null>(null);
  const [explorerEntity, setExplorerEntity] = useState<"jobs" | "accounts" | "activities" | "resources" | "forms-fields">("jobs");
  const [explorerRows, setExplorerRows] = useState<Record<string, unknown>[]>([]);
  const [explorerTotal, setExplorerTotal] = useState(0);
  const [explorerPage, setExplorerPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const h = (await apiFetch("/api/admin/moraware/health", { token })) as HealthResp;
      setHealth(h);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadPrepared = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = (await apiFetch("/api/admin/moraware/prepared-facts", { token })) as Record<string, unknown>;
      setPrepared(p);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadDataQuality = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = (await apiFetch("/api/admin/moraware/data-quality", { token })) as Record<string, unknown>;
      setDataQuality(d);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadExplorer = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const path = `/api/admin/moraware/${explorerEntity}?page=${explorerPage}&page_size=25&q=${encodeURIComponent(search)}`;
      const r = (await apiFetch(path, { token })) as PaginatedResp;
      setExplorerRows(r.rows || []);
      setExplorerTotal(r.total || 0);
    } catch (e: unknown) {
      setExplorerRows([]);
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [token, explorerEntity, explorerPage, search]);

  useEffect(() => {
    if (!token) return;
    if (tab === "health") void loadHealth();
    if (tab === "prepared") void loadPrepared();
    if (tab === "quality" || tab === "mapping") void loadDataQuality();
  }, [tab, token, loadHealth, loadPrepared, loadDataQuality]);

  useEffect(() => {
    if (tab === "fields") setExplorerEntity("forms-fields");
    if (tab === "explorer" && explorerEntity === "forms-fields") setExplorerEntity("jobs");
  }, [tab]);

  useEffect(() => {
    if ((tab === "explorer" || tab === "fields") && token) void loadExplorer();
  }, [tab, explorerEntity, explorerPage, token, loadExplorer]);

  const explorerColumns =
    explorerEntity === "jobs"
      ? ["source_job_id", "account_name", "job_name", "status_name", "process_name", "created_at_source"]
      : explorerEntity === "accounts"
        ? ["source_account_id", "account_name"]
        : explorerEntity === "activities"
          ? ["source_activity_id", "source_job_id", "activity_type_name", "scheduled_date"]
          : explorerEntity === "resources"
            ? ["source_resource_id", "resource_name", "resource_type"]
            : ["source_record_id", "source_modified_at"];

  return (
    <div className="moraware-admin">
      <h2 style={{ marginTop: 0 }}>Moraware integration (read-only mirror)</h2>
      <p className="muted">
        Operations Integration Switchboard — Moraware adapter v1. Moraware remains the operational source system; eliteOS
        mirrors data for fast heads. No credentials or raw payloads are shown here by default.
      </p>

      <div className="sub-nav-pills" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            ["health", "Sync Health"],
            ["explorer", "Mirror Explorer"],
            ["fields", "Field Discovery"],
            ["mapping", "Mapping Queues"],
            ["prepared", "Prepared Facts"],
            ["quality", "Data Quality"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`nav-pill ${tab === id ? "nav-pill-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={() => void loadHealth()} disabled={loading}>
          Refresh health
        </button>
      </div>

      {error ? (
        <div className="error-card">
          <strong>Error</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {tab === "health" && health ? (
        <div className="admin-card">
          <div className="card-heading-row">
            <h3 style={{ marginTop: 0 }}>Sync health</h3>
            <span className={`pill ${healthPill(health.health_status)}`}>{health.health_status || "unknown"}</span>
          </div>
          <div className="stat-grid moraware-stat-grid">
            <div className="stat-card">
              <div className="stat-value">
                {health.sync_freshness_seconds != null ? `${Math.round(health.sync_freshness_seconds / 3600)}h` : "—"}
              </div>
              <div className="stat-label">Since last success</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{health.prepared_facts?.freshness || "—"}</div>
              <div className="stat-label">Prepared facts</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {health.latest_complete_import_group?.successful_chunks ?? "—"}/
                {health.latest_complete_import_group?.expected_chunk_count ?? "—"}
              </div>
              <div className="stat-label">Chunks (complete group)</div>
            </div>
          </div>
          <p className="mono-break muted">
            Latest complete import group: {health.latest_complete_import_group?.import_group_id || "—"}
          </p>
          {(health.warnings || []).map((w) => (
            <p key={w} className="safety-callout">
              {w}
            </p>
          ))}
          {health.scheduled_sync && !health.scheduled_sync.implemented ? (
            <details>
              <summary>Scheduled sync v1 (planned)</summary>
              <ul className="muted">
                {(health.scheduled_sync.checklist || []).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {tab === "prepared" && prepared ? (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Prepared Sales facts</h3>
          <p>
            Freshness: <strong>{String(prepared.freshness)}</strong> · Source group:{" "}
            <span className="mono-break">
              {String((prepared.sales_moraware_job_facts as { source_import_group_id?: string })?.source_import_group_id || "—")}
            </span>
          </p>
          <p className="muted">
            Job facts rows: {fmt((prepared.sales_moraware_job_facts as { table_count?: number })?.table_count)} · Rebuild:{" "}
            <code>{String(prepared.rebuild_endpoint)}</code> ({String(prepared.rebuild_requires)})
          </p>
          <p className="safety-callout">Sales Head reads these tables — not raw Moraware payloads on page load.</p>
        </div>
      ) : null}

      {(tab === "quality" || tab === "mapping") && dataQuality ? (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>{tab === "mapping" ? "Mapping queues" : "Data quality"}</h3>
          {tab === "mapping" ? (
            <p className="muted">
              Use <strong>Sales mapping</strong> for approve/reject actions. This view shows coverage from the latest
              Moraware group.
            </p>
          ) : null}
          <p>{String(dataQuality.blackstone_guardrail || "")}</p>
          <p>
            Unresolved sync findings: {fmt((dataQuality.unresolved_findings as { total?: number })?.total)} · Missing Sq.Ft.
            jobs: {fmt((dataQuality.missing_sqft_jobs as { count?: number })?.count)}
          </p>
        </div>
      ) : null}

      {(tab === "explorer" || tab === "fields") && (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Mirror explorer</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {(["jobs", "accounts", "activities", "resources", "forms-fields"] as const).map((e) => (
              <button
                key={e}
                type="button"
                className={`btn ${explorerEntity === e ? "btn-primary" : ""}`}
                onClick={() => {
                  setExplorerEntity(e);
                  setExplorerPage(1);
                }}
              >
                {e}
              </button>
            ))}
            <input
              className="input"
              placeholder="Search…"
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              onKeyDown={(ev) => ev.key === "Enter" && void loadExplorer()}
            />
            <button type="button" className="btn" onClick={() => void loadExplorer()}>
              Search
            </button>
          </div>
          <p className="muted">
            Page {explorerPage} · {fmt(explorerTotal)} total · Summary fields only (no raw JSON).
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {explorerColumns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {explorerRows.map((row, i) => (
                  <tr key={String(row.source_job_id ?? row.source_account_id ?? row.source_record_id ?? i)}>
                    {explorerColumns.map((c) => (
                      <td key={c}>{String(row[c] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn" disabled={explorerPage <= 1} onClick={() => setExplorerPage((p) => p - 1)}>
              Previous
            </button>
            <button
              type="button"
              className="btn"
              disabled={explorerPage * 25 >= explorerTotal}
              onClick={() => setExplorerPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="muted">Loading…</p> : null}
    </div>
  );
}
