import React, { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";

type MorawareTab =
  | "health"
  | "explorer"
  | "fields"
  | "mapping"
  | "prepared"
  | "quality";

type Diagnostics = {
  endpoint?: string;
  total_compute_ms?: number;
  query_compute_ms?: number | null;
  count_compute_ms?: number | null;
  used_exact_count?: boolean;
  count_mode?: string | null;
  count_status?: string | null;
  page?: number | null;
  page_size?: number | null;
};

type HealthResp = {
  ok: boolean;
  health_status?: string;
  organization_id?: string;
  stale_warning?: boolean;
  sync_freshness_seconds?: number | null;
  latest_complete_import_group?: {
    import_group_id?: string;
    complete?: boolean;
    successful_chunks?: number | null;
    expected_chunk_count?: number | null;
    chunk_count_unavailable_reason?: string | null;
    total_row_counts?: Record<string, number>;
  };
  prepared_facts?: {
    freshness?: string;
    sales_moraware_job_facts?: { table_count?: number | null; source_import_group_id?: string | null };
    rebuild_endpoint?: string;
    rebuild_requires?: string;
  };
  mirror_row_counts?: Record<
    string,
    { count?: number | null; count_status?: string; count_source?: string; note?: string }
  >;
  warnings?: string[];
  scheduled_sync?: { implemented?: boolean; checklist?: string[] };
  diagnostics?: Diagnostics;
};

type FieldGroup = {
  form_name?: string;
  template_name?: string | null;
  field_label?: string;
  normalized_label?: string;
  count?: number;
  numeric_count?: number;
  sample_values?: string[];
};

type TabLoadState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  diagnostics: Diagnostics | null;
  fetchedAt: number | null;
};

function emptyTabState<T>(): TabLoadState<T> {
  return { data: null, loading: false, error: "", diagnostics: null, fetchedAt: null };
}

function fmt(n: unknown) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString("en-US") : "—";
}

function formatTotalLabel(total: number | null | undefined, countStatus?: string | null, hint?: number | null) {
  if (total != null && Number.isFinite(total)) return fmt(total);
  if (hint != null && Number.isFinite(hint)) return `~${fmt(hint)} (estimated)`;
  if (countStatus === "unavailable") return "many rows";
  return "—";
}

function healthPill(status: string | undefined) {
  const s = String(status || "").toLowerCase();
  if (s === "healthy") return "pill-good";
  if (s === "no_success" || s === "missing") return "pill-bad";
  return "pill-warn";
}

function chunkLabel(group: HealthResp["latest_complete_import_group"]) {
  if (!group) return { text: "—", reason: "No complete import group" };
  const expected = group.expected_chunk_count;
  const successful = group.successful_chunks;
  if (expected != null && successful != null) return { text: `${successful}/${expected}`, reason: null };
  return {
    text: "—",
    reason: group.chunk_count_unavailable_reason || "Chunk metadata not available on sync runs"
  };
}

function DiagnosticsFooter({ diagnostics }: { diagnostics: Diagnostics | null }) {
  if (!diagnostics?.total_compute_ms && diagnostics?.total_compute_ms !== 0) return null;
  return (
    <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
      {diagnostics.endpoint ? `${diagnostics.endpoint} · ` : ""}
      {diagnostics.total_compute_ms}ms total
      {diagnostics.query_compute_ms != null ? ` · query ${diagnostics.query_compute_ms}ms` : ""}
      {diagnostics.count_compute_ms != null ? ` · count ${diagnostics.count_compute_ms}ms` : ""}
      {diagnostics.count_mode ? ` · count_mode=${diagnostics.count_mode}` : ""}
      {diagnostics.used_exact_count ? " · exact count" : ""}
    </p>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function MorawareAdmin({ token }: { token: string }) {
  const [tab, setTab] = useState<MorawareTab>("health");
  const [health, setHealth] = useState<TabLoadState<HealthResp>>(emptyTabState);
  const [prepared, setPrepared] = useState<TabLoadState<Record<string, unknown>>>(emptyTabState);
  const [dataQuality, setDataQuality] = useState<TabLoadState<Record<string, unknown>>>(emptyTabState);
  const [fields, setFields] = useState<TabLoadState<{ groups?: FieldGroup[]; sample_size?: number; total_rows_hint?: number | null }>>(
    emptyTabState
  );
  const [fieldsRawMode, setFieldsRawMode] = useState(false);

  const [explorerEntity, setExplorerEntity] = useState<"jobs" | "accounts" | "activities" | "resources">("jobs");
  const [explorer, setExplorer] = useState<
    TabLoadState<{ rows: Record<string, unknown>[]; total: number | null; count_status?: string; total_rows_hint?: number | null }>
  >(emptyTabState);
  const [explorerPage, setExplorerPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);

  const healthLoaded = useRef(false);
  const preparedLoaded = useRef(false);
  const qualityLoaded = useRef(false);
  const mappingLoaded = useRef(false);
  const fieldsCacheKey = useRef<string | null>(null);
  const explorerKey = useRef("");

  const loadHealth = useCallback(
    async (force = false) => {
      if (!token) return;
      if (healthLoaded.current && !force && health.data) return;
      setHealth((s) => ({ ...s, loading: true, error: "" }));
      try {
        const h = (await apiFetch("/api/admin/moraware/health?count_mode=estimated", { token })) as HealthResp;
        healthLoaded.current = true;
        setHealth({
          data: h,
          loading: false,
          error: "",
          diagnostics: h.diagnostics ?? null,
          fetchedAt: Date.now()
        });
      } catch (e: unknown) {
        setHealth({
          data: health.data,
          loading: false,
          error: e instanceof ApiError ? e.message : String((e as Error)?.message ?? e),
          diagnostics: null,
          fetchedAt: health.fetchedAt
        });
      }
    },
    [token, health.data, health.fetchedAt]
  );

  const loadPrepared = useCallback(
    async (force = false) => {
      if (!token) return;
      if (preparedLoaded.current && !force && prepared.data) return;
      setPrepared((s) => ({ ...s, loading: true, error: "" }));
      try {
        const p = (await apiFetch("/api/admin/moraware/prepared-facts?count_mode=estimated", { token })) as Record<
          string,
          unknown
        > & { diagnostics?: Diagnostics };
        preparedLoaded.current = true;
        setPrepared({
          data: p,
          loading: false,
          error: "",
          diagnostics: p.diagnostics ?? null,
          fetchedAt: Date.now()
        });
      } catch (e: unknown) {
        setPrepared({
          data: prepared.data,
          loading: false,
          error: e instanceof ApiError ? e.message : String((e as Error)?.message ?? e),
          diagnostics: null,
          fetchedAt: prepared.fetchedAt
        });
      }
    },
    [token, prepared.data, prepared.fetchedAt]
  );

  const loadDataQuality = useCallback(
    async (force = false) => {
      if (!token) return;
      if (qualityLoaded.current && !force && dataQuality.data) return;
      setDataQuality((s) => ({ ...s, loading: true, error: "" }));
      try {
        const d = (await apiFetch("/api/admin/moraware/data-quality", { token })) as Record<string, unknown> & {
          diagnostics?: Diagnostics;
        };
        qualityLoaded.current = true;
        setDataQuality({
          data: d,
          loading: false,
          error: "",
          diagnostics: d.diagnostics ?? null,
          fetchedAt: Date.now()
        });
      } catch (e: unknown) {
        setDataQuality({
          data: dataQuality.data,
          loading: false,
          error: e instanceof ApiError ? e.message : String((e as Error)?.message ?? e),
          diagnostics: null,
          fetchedAt: dataQuality.fetchedAt
        });
      }
    },
    [token, dataQuality.data, dataQuality.fetchedAt]
  );

  const loadFields = useCallback(
    async (force = false, raw = fieldsRawMode) => {
      if (!token) return;
      const cacheKey = raw ? "raw" : "summary";
      if (fieldsCacheKey.current === cacheKey && !force && fields.data) return;
      setFields((s) => ({ ...s, loading: true, error: "" }));
      try {
        const path = raw
          ? `/api/admin/moraware/forms-fields?view_mode=raw&page=1&page_size=25&count_mode=none`
          : `/api/admin/moraware/forms-fields?view_mode=summary&count_mode=estimated&sample_limit=500`;
        const r = (await apiFetch(path, { token })) as {
          groups?: FieldGroup[];
          rows?: Record<string, unknown>[];
          sample_size?: number;
          total_rows_hint?: number | null;
          count_status?: string;
          diagnostics?: Diagnostics;
        };
        fieldsCacheKey.current = cacheKey;
        setFields({
          data: raw ? { rows: r.rows, total_rows_hint: r.total_rows_hint } : { groups: r.groups, sample_size: r.sample_size, total_rows_hint: r.total_rows_hint },
          loading: false,
          error: "",
          diagnostics: r.diagnostics ?? null,
          fetchedAt: Date.now()
        });
      } catch (e: unknown) {
        setFields({
          data: fields.data,
          loading: false,
          error: e instanceof ApiError ? e.message : String((e as Error)?.message ?? e),
          diagnostics: null,
          fetchedAt: fields.fetchedAt
        });
      }
    },
    [token, fields.data, fields.fetchedAt, fieldsRawMode]
  );

  const loadExplorer = useCallback(async () => {
    if (!token) return;
    const q = debouncedSearch.trim();
    if (q.length > 0 && q.length < 3) {
      setExplorer({
        data: { rows: [], total: null, count_status: "unavailable" },
        loading: false,
        error: "",
        diagnostics: null,
        fetchedAt: Date.now()
      });
      return;
    }
    const key = `${explorerEntity}:${explorerPage}:${q}`;
    if (explorerKey.current === key && explorer.data && !explorer.loading) return;
    explorerKey.current = key;
    setExplorer((s) => ({ ...s, loading: true, error: "" }));
    try {
      const path = `/api/admin/moraware/${explorerEntity}?page=${explorerPage}&page_size=25&count_mode=none&q=${encodeURIComponent(q)}`;
      const r = (await apiFetch(path, { token })) as {
        rows?: Record<string, unknown>[];
        total?: number | null;
        count_status?: string;
        total_rows_hint?: number | null;
        search_blocked?: boolean;
        diagnostics?: Diagnostics;
      };
      setExplorer({
        data: {
          rows: r.rows || [],
          total: r.total ?? null,
          count_status: r.count_status,
          total_rows_hint: r.total_rows_hint
        },
        loading: false,
        error: r.search_blocked ? "Enter at least 3 characters to search." : "",
        diagnostics: r.diagnostics ?? null,
        fetchedAt: Date.now()
      });
    } catch (e: unknown) {
      setExplorer({
        data: { rows: [], total: null },
        loading: false,
        error: e instanceof ApiError ? e.message : String((e as Error)?.message ?? e),
        diagnostics: null,
        fetchedAt: Date.now()
      });
    }
  }, [token, explorerEntity, explorerPage, debouncedSearch, explorer.data, explorer.loading]);

  useEffect(() => {
    if (!token) return;
    if (tab === "health") void loadHealth();
    if (tab === "prepared") void loadPrepared();
    if (tab === "quality") void loadDataQuality();
    if (tab === "mapping") {
      if (!mappingLoaded.current) void loadDataQuality();
      else if (!dataQuality.data) void loadDataQuality();
      mappingLoaded.current = true;
    }
    if (tab === "fields") void loadFields();
    if (tab === "explorer") void loadExplorer();
  }, [tab, token, loadHealth, loadPrepared, loadDataQuality, loadFields, loadExplorer]);

  useEffect(() => {
    if (tab === "explorer" && token) void loadExplorer();
  }, [tab, explorerEntity, explorerPage, debouncedSearch, token, loadExplorer]);

  useEffect(() => {
    if (tab === "fields" && token) {
      fieldsCacheKey.current = null;
      void loadFields(true, fieldsRawMode);
    }
  }, [fieldsRawMode]);

  const refreshActiveTab = () => {
    if (tab === "health") void loadHealth(true);
    if (tab === "prepared") void loadPrepared(true);
    if (tab === "quality" || tab === "mapping") void loadDataQuality(true);
    if (tab === "fields") void loadFields(true, fieldsRawMode);
    if (tab === "explorer") {
      explorerKey.current = "";
      void loadExplorer();
    }
  };

  const h = health.data;
  const chunks = chunkLabel(h?.latest_complete_import_group);

  const explorerColumns =
    explorerEntity === "jobs"
      ? ["source_job_id", "account_name", "job_name", "status_name", "process_name", "created_at_source"]
      : explorerEntity === "accounts"
        ? ["source_account_id", "account_name"]
        : explorerEntity === "activities"
          ? ["source_activity_id", "source_job_id", "activity_type_name", "scheduled_date"]
          : ["source_resource_id", "resource_name", "resource_type"];

  const tabError =
    (tab === "health" && health.error) ||
    (tab === "prepared" && prepared.error) ||
    ((tab === "quality" || tab === "mapping") && dataQuality.error) ||
    (tab === "fields" && fields.error) ||
    (tab === "explorer" && explorer.error);

  const tabLoading =
    (tab === "health" && health.loading) ||
    (tab === "prepared" && prepared.loading) ||
    ((tab === "quality" || tab === "mapping") && dataQuality.loading) ||
    (tab === "fields" && fields.loading) ||
    (tab === "explorer" && explorer.loading);

  return (
    <div className="moraware-admin">
      <h2 style={{ marginTop: 0 }}>Moraware integration (read-only mirror)</h2>
      <p className="muted">
        Operations Integration Switchboard — Moraware adapter v1. Moraware remains the operational source system; eliteOS
        mirrors data for fast heads. No credentials or raw payloads in the browser by default.
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
        <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={refreshActiveTab}>
          Refresh tab
        </button>
      </div>

      {tabError ? (
        <div className="error-card">
          <strong>Error</strong>
          <p>{tabError}</p>
        </div>
      ) : null}

      {tab === "health" && (
        <>
          {health.loading && !h ? <p className="muted">Loading sync health…</p> : null}
          {h ? (
            <div className="admin-card">
              <div className="card-heading-row">
                <h3 style={{ marginTop: 0 }}>Sync health</h3>
                <span className={`pill ${healthPill(h.health_status)}`}>{h.health_status || "unknown"}</span>
              </div>
              <div className="stat-grid moraware-stat-grid">
                <div className="stat-card">
                  <div className="stat-value">
                    {h.sync_freshness_seconds != null ? `${Math.round(h.sync_freshness_seconds / 3600)}h` : "—"}
                  </div>
                  <div className="stat-label">Since last success</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{h.prepared_facts?.freshness || "—"}</div>
                  <div className="stat-label">Prepared facts</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{chunks.text}</div>
                  <div className="stat-label">Chunks (complete group)</div>
                  {chunks.reason ? <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>{chunks.reason}</p> : null}
                </div>
              </div>
              <p className="mono-break muted">
                Latest complete import group: {h.latest_complete_import_group?.import_group_id || "—"}
              </p>
              {(h.warnings || []).map((w) => (
                <p key={w} className="safety-callout">
                  {w}
                </p>
              ))}
              {h.scheduled_sync && !h.scheduled_sync.implemented ? (
                <details>
                  <summary>Scheduled sync v1 (planned)</summary>
                  <ul className="muted">
                    {(h.scheduled_sync.checklist || []).map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <DiagnosticsFooter diagnostics={health.diagnostics} />
            </div>
          ) : null}
        </>
      )}

      {tab === "prepared" && (
        <>
          {prepared.loading && !prepared.data ? <p className="muted">Loading prepared facts…</p> : null}
          {prepared.data ? (
            <div className="admin-card">
              <h3 style={{ marginTop: 0 }}>Prepared Sales facts</h3>
              <p>
                Freshness: <strong>{String(prepared.data.freshness)}</strong> · Source group:{" "}
                <span className="mono-break">
                  {String(
                    (prepared.data.sales_moraware_job_facts as { source_import_group_id?: string })?.source_import_group_id ||
                      "—"
                  )}
                </span>
              </p>
              <p className="muted">
                Job facts rows:{" "}
                {fmt((prepared.data.sales_moraware_job_facts as { table_count?: number; rows_for_source_group?: number })?.rows_for_source_group ??
                  (prepared.data.sales_moraware_job_facts as { table_count?: number })?.table_count)}{" "}
                · Rebuild: <code>{String(prepared.data.rebuild_endpoint)}</code> ({String(prepared.data.rebuild_requires)})
              </p>
              <p className="safety-callout">Sales Head reads these tables — not raw Moraware payloads on page load.</p>
              <DiagnosticsFooter diagnostics={prepared.diagnostics} />
            </div>
          ) : null}
        </>
      )}

      {(tab === "quality" || tab === "mapping") && (
        <>
          {dataQuality.loading && !dataQuality.data ? <p className="muted">Loading data quality…</p> : null}
          {dataQuality.data ? (
            <div className="admin-card">
              <h3 style={{ marginTop: 0 }}>{tab === "mapping" ? "Mapping queues" : "Data quality"}</h3>
              {tab === "mapping" ? (
                <p className="muted">
                  Use <strong>Sales mapping</strong> for approve/reject actions. This view shows coverage from the latest
                  Moraware group.
                </p>
              ) : null}
              <p>{String(dataQuality.data.blackstone_guardrail || "")}</p>
              <p>
                Unresolved sync findings: {fmt((dataQuality.data.unresolved_findings as { total?: number })?.total)} · Missing
                Sq.Ft. jobs: {fmt((dataQuality.data.missing_sqft_jobs as { count?: number })?.count)}
              </p>
              <DiagnosticsFooter diagnostics={dataQuality.diagnostics} />
            </div>
          ) : null}
        </>
      )}

      {tab === "fields" && (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Field discovery</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn ${!fieldsRawMode ? "btn-primary" : ""}`}
              onClick={() => setFieldsRawMode(false)}
            >
              Summarized fields
            </button>
            <button
              type="button"
              className={`btn ${fieldsRawMode ? "btn-primary" : ""}`}
              onClick={() => setFieldsRawMode(true)}
            >
              Raw rows
            </button>
          </div>
          {fields.loading ? <p className="muted">Loading field discovery…</p> : null}
          {!fieldsRawMode && fields.data?.groups ? (
            <>
              <p className="muted">
                Sampled {fmt(fields.data.sample_size)} recent form rows
                {fields.data.total_rows_hint != null
                  ? ` · ~${fmt(fields.data.total_rows_hint)} total form rows (estimated from sync metadata)`
                  : " · total row count unavailable without exact scan"}
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Form</th>
                      <th>Label</th>
                      <th>Normalized</th>
                      <th>Count</th>
                      <th>Numeric</th>
                      <th>Samples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fields.data.groups || []).slice(0, 100).map((g, i) => (
                      <tr key={`${g.normalized_label}-${i}`}>
                        <td>{g.form_name}</td>
                        <td>{g.field_label}</td>
                        <td>{g.normalized_label}</td>
                        <td>{fmt(g.count)}</td>
                        <td>{fmt(g.numeric_count)}</td>
                        <td>{(g.sample_values || []).join("; ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {fieldsRawMode && fields.data?.rows ? (
            <>
              <p className="muted">
                Page 1 · {formatTotalLabel(null, "unavailable", fields.data.total_rows_hint)} · Row ids only
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>source_record_id</th>
                      <th>updated_at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fields.data.rows as Record<string, unknown>[]).map((row, i) => (
                      <tr key={String(row.source_record_id ?? i)}>
                        <td>{String(row.source_record_id ?? "—")}</td>
                        <td>{String(row.updated_at ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          <DiagnosticsFooter diagnostics={fields.diagnostics} />
        </div>
      )}

      {tab === "explorer" && (
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Mirror explorer</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {(["jobs", "accounts", "activities", "resources"] as const).map((e) => (
              <button
                key={e}
                type="button"
                className={`btn ${explorerEntity === e ? "btn-primary" : ""}`}
                onClick={() => {
                  setExplorerEntity(e);
                  setExplorerPage(1);
                  explorerKey.current = "";
                }}
              >
                {e}
              </button>
            ))}
            <input
              className="input"
              placeholder="Search (min 3 chars)…"
              value={search}
              onChange={(ev) => {
                setSearch(ev.target.value);
                setExplorerPage(1);
                explorerKey.current = "";
              }}
            />
          </div>
          {explorer.loading ? <p className="muted">Loading {explorerEntity}…</p> : null}
          {explorer.data ? (
            <>
              <p className="muted">
                Page {explorerPage} ·{" "}
                {formatTotalLabel(explorer.data.total, explorer.data.count_status, explorer.data.total_rows_hint)} · Summary
                fields only
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
                    {explorer.data.rows.map((row, i) => (
                      <tr key={String(row.source_job_id ?? row.source_account_id ?? row.source_activity_id ?? i)}>
                        {explorerColumns.map((c) => (
                          <td key={c}>{String(row[c] ?? "—")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={explorerPage <= 1}
                  onClick={() => setExplorerPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={(explorer.data.rows?.length || 0) < 25}
                  onClick={() => setExplorerPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
              <DiagnosticsFooter diagnostics={explorer.diagnostics} />
            </>
          ) : null}
        </div>
      )}

      {tabLoading ? <p className="muted" style={{ fontSize: 12 }}>Updating…</p> : null}
    </div>
  );
}