import React, { useCallback, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import {
  MORAWARE_TAG_OPTIONS,
  SALES_QUERY_EXAMPLES,
  parseSalesQuery,
  type SalesQueryFiltersInput
} from "../lib/salesQueryParser";
import type { SalesMorawareQueryResponse, SalesMorawareQueryRow } from "../lib/types";

type Props = {
  token: string;
  onLoadError: (msg: string) => void;
};

type StructuredFilters = {
  dateFrom: string;
  dateTo: string;
  account: string;
  salesperson: string;
  tags: string[];
  minSqft: string;
  maxSqft: string;
  missingSqft: boolean;
};

const EMPTY_STRUCTURED: StructuredFilters = {
  dateFrom: "",
  dateTo: "",
  account: "",
  salesperson: "",
  tags: [],
  minSqft: "",
  maxSqft: "",
  missingSqft: false
};

const TAG_LABELS = Object.fromEntries(MORAWARE_TAG_OPTIONS.map((t) => [t.id, t.label]));

function count(n: number | null | undefined): string {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString("en-US") : "0";
}

function sqft(n: number | null | undefined): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(x)} sqft`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(`${String(s).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function mergeFilters(parsed: SalesQueryFiltersInput, structured: StructuredFilters): SalesQueryFiltersInput {
  const out: SalesQueryFiltersInput = { ...parsed, limit: parsed.limit ?? 100 };

  if (structured.dateFrom) out.date_from = structured.dateFrom;
  if (structured.dateTo) out.date_to = structured.dateTo;
  if (structured.account.trim()) out.account = structured.account.trim();
  if (structured.salesperson.trim()) out.salesperson = structured.salesperson.trim();
  if (structured.minSqft.trim()) {
    const n = Number(structured.minSqft);
    if (Number.isFinite(n)) out.min_sqft = n;
  }
  if (structured.maxSqft.trim()) {
    const n = Number(structured.maxSqft);
    if (Number.isFinite(n)) out.max_sqft = n;
  }
  if (structured.missingSqft) out.missing_sqft = true;
  if (structured.tags.length) {
    out.tags = [...new Set([...(out.tags ?? []), ...structured.tags])];
    if (structured.tags.includes("missing_sqft")) out.missing_sqft = true;
  }

  return out;
}

function SalesQuerySummaryCards({
  summary
}: {
  summary: NonNullable<Extract<SalesMorawareQueryResponse, { ok: true }>["summary"]>;
}) {
  return (
    <div className="sales-query-stat-strip">
      <div className="sales-query-stat">
        <span className="sales-query-stat-label">Jobs</span>
        <span className="sales-query-stat-value">{count(summary.job_count)}</span>
      </div>
      <div className="sales-query-stat">
        <span className="sales-query-stat-label">Total sqft</span>
        <span className="sales-query-stat-value">{sqft(summary.total_sqft)}</span>
      </div>
      <div className="sales-query-stat">
        <span className="sales-query-stat-label">Jobs with sqft</span>
        <span className="sales-query-stat-value">{count(summary.jobs_with_sqft)}</span>
      </div>
      <div className="sales-query-stat">
        <span className="sales-query-stat-label">Avg sqft / job</span>
        <span className="sales-query-stat-value">{sqft(summary.avg_sqft_per_job)}</span>
      </div>
      <div className="sales-query-stat">
        <span className="sales-query-stat-label">Missing sqft</span>
        <span className="sales-query-stat-value">{count(summary.missing_sqft_count)}</span>
      </div>
    </div>
  );
}

function SalesQueryResultsTable({ rows }: { rows: SalesMorawareQueryRow[] }) {
  return (
    <div className="sales-query-table-wrap">
      <table className="sales-query-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Account</th>
            <th>Salesperson</th>
            <th>Date</th>
            <th>Sqft</th>
            <th>Tags</th>
            <th>Match reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.job_id ?? "row"}-${row.date ?? ""}-${row.job_name ?? ""}`}>
              <td>
                <div className="sales-query-job-cell">
                  <strong>{row.job_name || row.job_id || "—"}</strong>
                  {row.job_name && row.job_id ? <span className="sales-query-muted">#{row.job_id}</span> : null}
                </div>
              </td>
              <td>{row.account || "—"}</td>
              <td>{row.salesperson || "—"}</td>
              <td>{fmtDate(row.date)}</td>
              <td>{row.sqft_found ? sqft(row.worksheet_sqft) : "Missing"}</td>
              <td>
                <div className="sales-query-tag-list">
                  {(row.matched_tags ?? []).slice(0, 4).map((tag) => (
                    <span key={tag} className="sales-query-tag-pill">
                      {TAG_LABELS[tag] ?? tag}
                    </span>
                  ))}
                </div>
              </td>
              <td className="sales-query-reason">{row.match_reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SalesQueryPanel({ token, onLoadError }: Props) {
  const [queryText, setQueryText] = useState("");
  const [structured, setStructured] = useState<StructuredFilters>({ ...EMPTY_STRUCTURED });
  const [parserChips, setParserChips] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SalesMorawareQueryResponse | null>(null);
  const [searched, setSearched] = useState(false);

  const runQuery = useCallback(
    async (text: string, structuredOverride?: StructuredFilters) => {
      const structuredState = structuredOverride ?? structured;
      const parsed = parseSalesQuery(text);
      const filters = mergeFilters(parsed.filters, structuredState);
      setParserChips(parsed.chips);
      setBusy(true);
      setSearched(true);
      onLoadError("");

      try {
        const json = (await apiFetch("/api/sales/query", {
          token,
          method: "POST",
          body: {
            source: "moraware",
            query: text.trim() || null,
            filters
          }
        })) as SalesMorawareQueryResponse;
        setResult(json);
      } catch (e: unknown) {
        const msg =
          e instanceof ApiError
            ? String(e.message)
            : String((e as Error)?.message || e || "Query failed");
        onLoadError(msg);
        setResult(null);
      } finally {
        setBusy(false);
      }
    },
    [structured, token, onLoadError]
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void runQuery(queryText);
    },
    [queryText, runQuery]
  );

  const onExample = useCallback(
    (example: string) => {
      setQueryText(example);
      void runQuery(example);
    },
    [runQuery]
  );

  const toggleTag = useCallback((tagId: string) => {
    setStructured((s) => {
      const has = s.tags.includes(tagId);
      const tags = has ? s.tags.filter((t) => t !== tagId) : [...s.tags, tagId];
      return { ...s, tags, missingSqft: tagId === "missing_sqft" ? !has : s.missingSqft };
    });
  }, []);

  const unavailable = result && !result.ok && "unavailable" in result && result.unavailable;
  const success = result && result.ok ? result : null;
  const empty = searched && success && success.total_count === 0;
  const rowLimit = success?.rows?.length ?? 0;
  const totalCount = success?.total_count ?? 0;

  const appliedChips = useMemo(() => {
    if (success?.filters_applied?.length) return success.filters_applied;
    return parserChips.map((label) => ({ key: "parsed", label }));
  }, [success, parserChips]);

  return (
    <section className="sales-query-panel" aria-labelledby="sales-query-heading">
      <header className="sales-query-header">
        <div>
          <h2 id="sales-query-heading" className="sales-query-h1">
            Ask Sales Data
          </h2>
          <p className="sales-query-sub">
            Deterministic Moraware production query — filter jobs by account, tags, dates, and sqft. No AI; every
            filter is explainable.
          </p>
        </div>
      </header>

      <form className="sales-query-form" onSubmit={onSubmit}>
        <label className="sales-query-search-label">
          <span className="sr-only">Ask Sales Data</span>
          <input
            className="sales-query-search-input"
            type="search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Ask: full height backsplash jobs in June, jobs for Bedrock Builders, jobs missing sqft..."
            disabled={busy}
          />
        </label>
        <div className="sales-query-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      <div className="sales-query-examples" aria-label="Example queries">
        {SALES_QUERY_EXAMPLES.map((ex) => (
          <button
            key={ex.query}
            type="button"
            className="sales-query-example-chip"
            onClick={() => onExample(ex.query)}
            disabled={busy}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <details className="sales-query-filters">
        <summary>Structured filters</summary>
        <div className="sales-query-filters-grid">
          <label>
            <span>Date from</span>
            <input
              type="date"
              value={structured.dateFrom}
              onChange={(e) => setStructured((s) => ({ ...s, dateFrom: e.target.value }))}
            />
          </label>
          <label>
            <span>Date to</span>
            <input
              type="date"
              value={structured.dateTo}
              onChange={(e) => setStructured((s) => ({ ...s, dateTo: e.target.value }))}
            />
          </label>
          <label>
            <span>Account contains</span>
            <input
              value={structured.account}
              onChange={(e) => setStructured((s) => ({ ...s, account: e.target.value }))}
              placeholder="Bedrock Builders"
            />
          </label>
          <label>
            <span>Salesperson contains</span>
            <input
              value={structured.salesperson}
              onChange={(e) => setStructured((s) => ({ ...s, salesperson: e.target.value }))}
              placeholder="Hunter Robinson"
            />
          </label>
          <label>
            <span>Min sqft</span>
            <input
              type="number"
              min={0}
              value={structured.minSqft}
              onChange={(e) => setStructured((s) => ({ ...s, minSqft: e.target.value }))}
            />
          </label>
          <label>
            <span>Max sqft</span>
            <input
              type="number"
              min={0}
              value={structured.maxSqft}
              onChange={(e) => setStructured((s) => ({ ...s, maxSqft: e.target.value }))}
            />
          </label>
          <label className="sales-query-checkbox">
            <input
              type="checkbox"
              checked={structured.missingSqft}
              onChange={(e) => setStructured((s) => ({ ...s, missingSqft: e.target.checked }))}
            />
            <span>Missing sqft only</span>
          </label>
        </div>
        <div className="sales-query-tag-picker">
          <span className="sales-query-tag-picker-label">Tags (match any)</span>
          <div className="sales-query-tag-picker-list">
            {MORAWARE_TAG_OPTIONS.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`sales-query-tag-option${structured.tags.includes(tag.id) ? " is-on" : ""}`}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </details>

      {unavailable ? (
        <div className="sales-query-empty sales-query-empty--warn" role="status">
          <p>{result.message || "Moraware data is not available yet."}</p>
        </div>
      ) : null}

      {success ? (
        <>
          {appliedChips.length ? (
            <div className="sales-query-applied" aria-label="Applied filters">
              {appliedChips.map((chip, i) => (
                <span key={`${chip.key}-${chip.label}-${i}`} className="sales-query-applied-chip">
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}

          <SalesQuerySummaryCards summary={success.summary} />

          {empty ? (
            <div className="sales-query-empty" role="status">
              <p>No matching Moraware jobs found.</p>
            </div>
          ) : (
            <>
              <div className="sales-query-breakdowns">
                <div className="sales-query-breakdown-card">
                  <h3>Top accounts</h3>
                  {(success.top_accounts ?? []).length ? (
                    <ul>
                      {success.top_accounts.map((a) => (
                        <li key={a.account}>
                          <span>{a.account}</span>
                          <span>
                            {count(a.job_count)} jobs · {sqft(a.total_sqft)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sales-query-muted">No accounts in result set.</p>
                  )}
                </div>
                <div className="sales-query-breakdown-card">
                  <h3>Top salespeople</h3>
                  {(success.top_salespeople ?? []).length ? (
                    <ul>
                      {success.top_salespeople.map((sp) => (
                        <li key={sp.salesperson}>
                          <span>{sp.salesperson}</span>
                          <span>
                            {count(sp.job_count)} jobs · {sqft(sp.total_sqft)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sales-query-muted">No salespeople in result set.</p>
                  )}
                </div>
                <div className="sales-query-breakdown-card">
                  <h3>Tag breakdown</h3>
                  {(success.tag_breakdown ?? []).length ? (
                    <ul>
                      {success.tag_breakdown.map((t) => (
                        <li key={t.tag}>
                          <span>{t.label}</span>
                          <span>{count(t.job_count)} jobs</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sales-query-muted">No tags detected in result set.</p>
                  )}
                </div>
              </div>

              {rowLimit < totalCount ? (
                <p className="sales-query-limit-note">
                  Showing first {count(rowLimit)} of {count(totalCount)} matches
                </p>
              ) : null}

              <SalesQueryResultsTable rows={success.rows ?? []} />
            </>
          )}
        </>
      ) : null}

      {!searched && !busy ? (
        <p className="sales-query-hint">Try an example query or type a question above to explore Moraware jobs.</p>
      ) : null}
    </section>
  );
}
