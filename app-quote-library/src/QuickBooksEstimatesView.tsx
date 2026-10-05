import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, ApiError, backendBase } from "./lib/api";
import { formatDateTime, formatMoneyStandard, formatMoneyWhole, formatShortDate } from "./lib/format";
import "./QuickBooksEstimatesView.css";

type Account = { id: string; name: string | null };
type EstimateRow = {
  id: string;
  estimateNumber: string | null;
  date: string | null;
  customerJob: string | null;
  customerName: string | null;
  jobName: string | null;
  amount: number | null;
  account: Account | null;
  syncedAt: string | null;
};
type ListResponse = {
  rows: EstimateRow[];
  total: number;
  summary: { count: number; value: number | null; valueComplete: boolean; syncedFrom: string | null; syncedThrough: string | null };
  accountLinked: boolean | null;
  truncated: boolean;
  linksUnavailable: boolean;
};
type Line = {
  kind: "item" | "group";
  item: string | null;
  description: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
  className: string | null;
  inGroup: boolean;
};
type ContainerRow = { id: string | null; type: "estimate" | "sales_order" | null; number: string | null; date: string | null; amount: number | null };
type Detail = {
  estimate: EstimateRow;
  linesStatus: "snapshot_total_matches" | "snapshot_total_differs" | "not_in_snapshot";
  snapshot: {
    capturedAt: string | null;
    qbModifiedAt: string | null;
    subtotal: number | null;
    salesTaxTotal: number | null;
    total: number | null;
    lines: Line[];
  } | null;
  container: {
    rows: ContainerRow[];
    truncated: boolean;
    estimates: { count: number; value: number };
    salesOrders: { count: number; value: number };
  } | null;
};
type Feed = { key: string; label: string; state: string; lastSuccessAt: string | null; ageHours: number | null; thresholdHours: number };
type Freshness = {
  checkedAt: string;
  feeds: Feed[];
  estimates: {
    from: string | null;
    through: string | null;
    lastSyncedAt: string | null;
    refreshWindowStart: string | null;
    olderRowsLastRefreshedAt: string | null;
  };
  lineItems: { snapshotAt: string | null; through: string | null };
  reporting: { current: boolean; label: string; reasons: string[] };
};
type ExportState =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number; step: "preparing" | "downloading"; expectedRows: number }
  | { phase: "done"; rows: number; syncedFrom: string | null; syncedThrough: string | null; truncated: boolean }
  | { phase: "error"; message: string; retryable: boolean };

const EXPORT_MAX = 10000;

const PAGE = 50;
const SORTS: [string, string][] = [
  ["date_desc", "Newest first"],
  ["date_asc", "Oldest first"],
  ["amount_desc", "Amount high → low"],
  ["amount_asc", "Amount low → high"],
  ["number_desc", "Estimate # high → low"],
  ["number_asc", "Estimate # low → high"]
];

/** QuickBooks dates are calendar dates; parsing them as UTC would shift them a day in US time zones. */
function formatYmd(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!m) return formatShortDate(value);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Totals are only as current as their oldest row, so label the whole sync range rather than the latest sync. */
function syncedRangeLabel(from: string | null | undefined, through: string | null | undefined): string {
  if (!from || !through) return "sync date unknown";
  return formatShortDate(from) === formatShortDate(through)
    ? `QuickBooks data synced ${formatDateTime(through)}`
    : `QuickBooks data synced between ${formatShortDate(from)} and ${formatShortDate(through)}`;
}

function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function ageLabel(hours: number | null): string {
  if (hours == null) return "unknown";
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${Math.round(hours)} hours`;
}

async function exportErrorMessage(res: Response): Promise<{ message: string; retryable: boolean }> {
  let serverMessage = "";
  try {
    const body = (await res.json()) as { error?: unknown };
    serverMessage = typeof body?.error === "string" ? body.error : "";
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 409) return { message: "An export is already running for your account. Wait for it to finish, then try again.", retryable: true };
  if (res.status === 401) return { message: "Your session has expired. Sign in again to export.", retryable: false };
  if (res.status === 403) return { message: serverMessage || "You do not have access to export QuickBooks estimates.", retryable: false };
  if (res.status === 400) return { message: serverMessage || "The filters are not valid for export.", retryable: false };
  return { message: `Export failed (${res.status})${serverMessage ? `: ${serverMessage}` : ""}.`, retryable: true };
}

function errText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return String((e as Error)?.message || e);
}

function Unavailable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="qbe-unavailable" role="note">
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

export function QuickBooksEstimatesView({ sessionToken, accountDirectoryUrl }: { sessionToken: string; accountDirectoryUrl: string }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [account, setAccount] = useState<Account | null>(null);
  const [offset, setOffset] = useState(0);

  const [list, setList] = useState<ListResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [freshnessErr, setFreshnessErr] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ phase: "idle" });
  const [exportNow, setExportNow] = useState(() => Date.now());
  const exportInFlight = useRef(false);
  const exportAbort = useRef<AbortController | null>(null);
  const exporting = exportState.phase === "running";

  useEffect(() => {
    if (!exporting) return;
    const t = window.setInterval(() => setExportNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [exporting]);

  useEffect(() => () => exportAbort.current?.abort(), []);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (minAmount) p.set("min_amount", minAmount);
    if (maxAmount) p.set("max_amount", maxAmount);
    if (account) p.set("account", account.id);
    p.set("sort", sort);
    return p;
  }, [search, from, to, minAmount, maxAmount, account, sort]);

  useEffect(() => setOffset(0), [query]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    setBusy(true);
    setErr(null);
    const p = new URLSearchParams(query);
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    apiGet(`/api/quote-library/quickbooks/estimates?${p}`, sessionToken)
      .then((body) => { if (!cancelled) setList(body as ListResponse); })
      .catch((e) => { if (!cancelled) setErr(errText(e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [sessionToken, query, offset]);

  useEffect(() => {
    if (!sessionToken) return;
    apiGet("/api/quote-library/quickbooks/freshness", sessionToken)
      .then((body) => setFreshness(body as Freshness))
      .catch((e) => setFreshnessErr(errText(e)));
  }, [sessionToken]);

  useEffect(() => {
    if (!detailId || !sessionToken) return;
    let cancelled = false;
    setDetail(null);
    setDetailErr(null);
    apiGet(`/api/quote-library/quickbooks/estimates/${encodeURIComponent(detailId)}`, sessionToken)
      .then((body) => { if (!cancelled) setDetail(body as Detail); })
      .catch((e) => { if (!cancelled) setDetailErr(errText(e)); });
    return () => { cancelled = true; };
  }, [detailId, sessionToken]);

  const accountHref = useCallback(
    (id: string, panel?: string) =>
      `${accountDirectoryUrl.replace(/\/$/, "")}/?account=${encodeURIComponent(id)}${panel ? `&panel=${panel}` : ""}`,
    [accountDirectoryUrl]
  );

  const exportCsv = useCallback(async () => {
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    const controller = new AbortController();
    exportAbort.current = controller;
    const startedAt = Date.now();
    setExportNow(startedAt);
    setExportState({ phase: "running", startedAt, step: "preparing", expectedRows: Math.min(list?.total ?? 0, EXPORT_MAX) });
    try {
      const res = await fetch(`${backendBase()}/api/quote-library/quickbooks/estimates/export?${query}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        cache: "no-store",
        signal: controller.signal
      });
      if (!res.ok) {
        setExportState({ phase: "error", ...(await exportErrorMessage(res)) });
        return;
      }
      setExportState((s) => (s.phase === "running" ? { ...s, step: "downloading" } : s));
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "quickbooks-estimates.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportState({
        phase: "done",
        rows: Number(res.headers.get("X-Export-Row-Count") || 0),
        syncedFrom: res.headers.get("X-Data-Synced-From") || null,
        syncedThrough: res.headers.get("X-Data-Synced-Through") || null,
        truncated: res.headers.get("X-Export-Truncated") === "1"
      });
    } catch (e) {
      if (controller.signal.aborted) {
        setExportState({ phase: "error", message: "Export cancelled. No file was saved.", retryable: true });
      } else {
        setExportState({ phase: "error", message: `Export failed: ${errText(e)}. Check your connection and try again.`, retryable: true });
      }
    } finally {
      exportInFlight.current = false;
      if (exportAbort.current === controller) exportAbort.current = null;
    }
  }, [query, sessionToken, list?.total]);

  const cancelExport = useCallback(() => exportAbort.current?.abort(), []);

  const total = list?.total ?? 0;
  const scopeLabel = `${from ? formatYmd(from) : "earliest"} – ${to ? formatYmd(to) : "latest synced"}`;
  const notCurrent = !freshness || !freshness.reporting.current;
  const asOfLabel = syncedRangeLabel(list?.summary.syncedFrom, list?.summary.syncedThrough);

  return (
    <div className="qbe">
      <section className={`qbe-freshness${notCurrent ? " qbe-stale" : ""}`} aria-label="QuickBooks sync freshness">
        <div className="qbe-reporting-head">
          <span className={`qbe-reporting-badge${notCurrent ? " qbe-not-current" : ""}`}>
            {freshness ? freshness.reporting.label : "Not current reporting"}
          </span>
          <span>
            <strong>QuickBooks estimates</strong> — read-only copy from the QuickBooks finance sync. QuickBooks remains the quoting system of record; use QuickBooks reports for current figures.
          </span>
        </div>
        {freshness && freshness.reporting.reasons.length ? (
          <ul className="qbe-reasons" aria-label="Why this is not current reporting">
            {freshness.reporting.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
        {freshness ? (
          <ul>
            {freshness.feeds.map((f) => (
              <li key={f.key}>
                {f.label}: last success {f.lastSuccessAt ? formatDateTime(f.lastSuccessAt) : "never"}
                {f.state === "stale" ? ` — STALE (${ageLabel(f.ageHours)} old; expected within ${f.thresholdHours}h)` : f.state === "fresh" ? " — current" : ` — ${f.state}`}
              </li>
            ))}
            <li>
              Estimates covered: {formatYmd(freshness.estimates.from)} – {formatYmd(freshness.estimates.through)}. Estimates created or edited in QuickBooks after the last sync are not shown.
            </li>
            <li>
              Line items: one-time QuickBooks snapshot taken {formatDateTime(freshness.lineItems.snapshotAt)} (estimates through {formatYmd(freshness.lineItems.through)}). Lines are not refreshed by the sync.
            </li>
          </ul>
        ) : freshnessErr ? (
          <p>Sync freshness unavailable: {freshnessErr}</p>
        ) : (
          <p>Checking sync freshness…</p>
        )}
      </section>

      <div className="metrics" role="list" aria-label="QuickBooks estimate metrics">
        <div className="metric" role="listitem">
          <div className="val">{list ? total.toLocaleString() : "—"}</div>
          <div className="lbl">Estimates · {scopeLabel} · {asOfLabel}</div>
        </div>
        <div className="metric" role="listitem">
          <div className="val">
            {list?.summary.value != null ? formatMoneyWhole(list.summary.value) : list ? "Narrow filters" : "—"}
          </div>
          <div className="lbl">Estimates ($) · {scopeLabel} · {asOfLabel}</div>
        </div>
        <div className="metric metric-zero" role="listitem">
          <div className="val">Phase 2</div>
          <div className="lbl">Estimator — not assigned in this release</div>
        </div>
        <div className="metric metric-zero" role="listitem">
          <div className="val">Not shown</div>
          <div className="lbl">Sold status — not inferred from QuickBooks transactions</div>
        </div>
      </div>
      <p className="qbe-note">
        {notCurrent ? "These totals are not current reporting and may not match QuickBooks reports for the same period. " : ""}
        Each QuickBooks estimate counts once. Several estimates on the same Customer:Job are listed separately; they are not treated as revisions of one another.
      </p>

      <section className="card">
        <div className="card-head">
          <h2>Search &amp; filters</h2>
          <span className="card-meta">
            <button
              type="button"
              className="btn secondary btn-xs"
              onClick={() => void exportCsv()}
              disabled={exporting || !total}
              aria-busy={exporting}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </span>
        </div>
        {exportState.phase === "running" ? (
          <div className="qbe-export" role="status" aria-live="polite">
            <span className="qbe-export-bar" aria-hidden="true" />
            <span>
              {exportState.step === "preparing"
                ? `Preparing ${exportState.expectedRows.toLocaleString()} row${exportState.expectedRows === 1 ? "" : "s"} on the server`
                : "Downloading file"}
              {" · "}
              {Math.max(0, Math.round((exportNow - exportState.startedAt) / 1000))}s elapsed. Large exports can take about 20 seconds.
            </span>
            <button type="button" className="btn secondary btn-xs" onClick={cancelExport}>Cancel</button>
          </div>
        ) : exportState.phase === "error" ? (
          <div className="qbe-export qbe-export-error" role="alert">
            <span>{exportState.message}</span>
            {exportState.retryable ? (
              <button type="button" className="btn secondary btn-xs" onClick={() => void exportCsv()} disabled={!total}>Try again</button>
            ) : null}
            <button type="button" className="btn secondary btn-xs" onClick={() => setExportState({ phase: "idle" })}>Dismiss</button>
          </div>
        ) : exportState.phase === "done" ? (
          <div className="qbe-export" role="status">
            <span>
              Exported {exportState.rows.toLocaleString()} row{exportState.rows === 1 ? "" : "s"}
              {" · "}
              {syncedRangeLabel(exportState.syncedFrom, exportState.syncedThrough)}
              {notCurrent ? " · not current reporting" : ""}.
              {exportState.truncated ? ` Capped at ${EXPORT_MAX.toLocaleString()} rows — narrow the filters for a complete file.` : ""}
            </span>
            <button type="button" className="btn secondary btn-xs" onClick={() => setExportState({ phase: "idle" })}>Dismiss</button>
          </div>
        ) : null}
        <div className="filter-grid">
          <label className="search-span search-prominent">
            Search
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Estimate # or Customer:Job" />
          </label>
          <label>
            Date from
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Date to
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            Min amount
            <input inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value.replace(/[^0-9.\-]/g, ""))} />
          </label>
          <label>
            Max amount
            <input inputMode="decimal" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value.replace(/[^0-9.\-]/g, ""))} />
          </label>
          <label>
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        {account ? (
          <div className="qbe-chip">
            Account Directory: <strong>{account.name || "Linked account"}</strong>
            <button type="button" className="btn secondary btn-xs" onClick={() => setAccount(null)}>Clear</button>
          </div>
        ) : null}
      </section>

      {err ? <div className="banner banner-error" role="alert">{err}</div> : null}
      {list?.linksUnavailable ? (
        <div className="banner banner-info" role="status">Account Directory links are unavailable right now; customer names are shown without links.</div>
      ) : null}
      {list?.truncated ? (
        <div className="banner banner-info" role="status">This account has more than 5,000 estimates; totals cover the first 5,000. Add a date range.</div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <h2>Estimates</h2>
          <span className="card-meta">
            {busy ? "Loading…" : list ? `${total ? offset + 1 : 0}–${Math.min(offset + PAGE, total)} of ${total.toLocaleString()}` : ""}
          </span>
        </div>
        {list && list.rows.length === 0 && !busy ? (
          <p className="muted qbe-empty">
            {account && list.accountLinked === false
              ? "This account has no QuickBooks customer link in Account Directory."
              : "No QuickBooks estimates match these filters in the synced range."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="ql-table data">
              <thead>
                <tr>
                  <th>Estimate #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="hide-md">Job</th>
                  <th>Amount</th>
                  <th>Account Directory</th>
                </tr>
              </thead>
              <tbody>
                {(list?.rows || []).map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setDetailId(r.id)}>
                    <td><strong>{r.estimateNumber || "—"}</strong></td>
                    <td>{formatYmd(r.date)}</td>
                    <td>{r.customerName || "—"}</td>
                    <td className="hide-md">{r.jobName || "—"}</td>
                    <td>{formatMoneyStandard(r.amount)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {r.account ? (
                        <span className="qbe-acct">
                          <a href={accountHref(r.account.id)} target="_blank" rel="noreferrer">{r.account.name || "Open account"}</a>
                          {account?.id !== r.account.id ? (
                            <button type="button" className="btn secondary btn-xs" onClick={() => setAccount(r.account)}>Filter</button>
                          ) : null}
                        </span>
                      ) : (
                        <span className="muted">Not linked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE ? (
          <div className="qbe-pager">
            <button type="button" className="btn secondary btn-xs" disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
            <button type="button" className="btn secondary btn-xs" disabled={offset + PAGE >= total || busy} onClick={() => setOffset(offset + PAGE)}>Next</button>
          </div>
        ) : null}
      </section>

      {detailId ? (
        <div className="qbe-drawer-backdrop" role="presentation" onClick={() => setDetailId(null)}>
          <aside className="qbe-drawer" role="dialog" aria-modal="true" aria-label="QuickBooks estimate detail" onClick={(e) => e.stopPropagation()}>
            <div className="qbe-drawer-head">
              <h2>Estimate {detail?.estimate.estimateNumber || ""}</h2>
              <button type="button" className="btn secondary btn-xs" onClick={() => setDetailId(null)}>Close</button>
            </div>
            {detailErr ? <div className="banner banner-error" role="alert">{detailErr}</div> : null}
            {!detail && !detailErr ? <p className="muted">Loading…</p> : null}
            {detail ? (
              <>
                <dl className="qbe-facts">
                  <dt>Date</dt><dd>{formatYmd(detail.estimate.date)}</dd>
                  <dt>Customer:Job</dt><dd>{detail.estimate.customerJob || "—"}</dd>
                  <dt>Amount</dt>
                  <dd>
                    {formatMoneyStandard(detail.estimate.amount)}
                    <span className="muted">
                      {" "}· as of QuickBooks sync {detail.estimate.syncedAt ? formatDateTime(detail.estimate.syncedAt) : "unknown"}
                    </span>
                  </dd>
                  <dt>Account Directory</dt>
                  <dd>
                    {detail.estimate.account ? (
                      <>
                        <a href={accountHref(detail.estimate.account.id)} target="_blank" rel="noreferrer">{detail.estimate.account.name || "Open account"}</a>
                        {" · "}
                        <a href={accountHref(detail.estimate.account.id, "financials")} target="_blank" rel="noreferrer">Financials &amp; A/R</a>
                      </>
                    ) : (
                      <span className="muted">No exact QuickBooks link in Account Directory</span>
                    )}
                  </dd>
                  <dt>Source</dt><dd>QuickBooks (system of record) · read-only</dd>
                </dl>

                <h3>Line items</h3>
                {detail.linesStatus === "not_in_snapshot" || !detail.snapshot ? (
                  <Unavailable title="Line items unavailable">
                    This estimate is not in the QuickBooks line-item snapshot
                    {freshness?.lineItems.snapshotAt ? ` captured ${formatDateTime(freshness.lineItems.snapshotAt)}` : ""}
                    {freshness?.lineItems.through ? ` (estimates through ${formatYmd(freshness.lineItems.through)})` : ""}. Open it in QuickBooks for lines.
                  </Unavailable>
                ) : (
                  <>
                    <div className={`qbe-snapshot-source${detail.linesStatus === "snapshot_total_differs" ? " qbe-snapshot-differs" : ""}`} role="note">
                      <strong>Source: QuickBooks snapshot captured {formatDateTime(detail.snapshot.capturedAt)}</strong>
                      <span>
                        {detail.snapshot.qbModifiedAt
                          ? `Estimate last modified in QuickBooks ${formatDateTime(detail.snapshot.qbModifiedAt)} at the time of the snapshot. `
                          : ""}
                        These lines are not refreshed by the sync.
                      </span>
                      <span>
                        {detail.linesStatus === "snapshot_total_differs"
                          ? `The estimate total has changed since the snapshot (snapshot ${formatMoneyStandard(detail.snapshot.total)} vs synced ${formatMoneyStandard(detail.estimate.amount)}). These lines are out of date; open the estimate in QuickBooks.`
                          : "The snapshot total matches the synced total. That does not confirm the lines are current: edits in QuickBooks that leave the total unchanged are not detected."}
                      </span>
                    </div>
                    <div className="table-wrap">
                      <table className="ql-table data">
                        <caption className="qbe-caption">Line items as of the QuickBooks snapshot captured {formatDateTime(detail.snapshot.capturedAt)}</caption>
                        <thead>
                          <tr><th>Item</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
                        </thead>
                        <tbody>
                          {detail.snapshot.lines.map((l, i) => (
                            <tr key={i} className={l.kind === "group" ? "qbe-group" : l.inGroup ? "qbe-in-group" : ""}>
                              <td>{l.item || "—"}</td>
                              <td className="qbe-desc">{l.description || ""}</td>
                              <td>{l.quantity ?? ""}</td>
                              <td>{l.rate != null ? formatMoneyStandard(l.rate) : ""}</td>
                              <td>{formatMoneyStandard(l.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="muted">
                      Snapshot {formatDateTime(detail.snapshot.capturedAt)}: Subtotal {formatMoneyStandard(detail.snapshot.subtotal)} · Sales tax{" "}
                      {formatMoneyStandard(detail.snapshot.salesTaxTotal)} · Total {formatMoneyStandard(detail.snapshot.total)}
                    </p>
                  </>
                )}

                <h3>Other transactions on this Customer:Job</h3>
                <p className="muted">
                  A Customer:Job is a QuickBooks container. Transactions listed here share it; that does not make them revisions of this estimate or prove a sale.
                </p>
                {detail.container && detail.container.rows.length ? (
                  <>
                    <div className="table-wrap">
                      <table className="ql-table data">
                        <thead><tr><th>Type</th><th>Number</th><th>Date</th><th>Amount</th></tr></thead>
                        <tbody>
                          {detail.container.rows.map((c, i) => (
                            <tr key={i} className={c.id ? "clickable" : ""} onClick={() => c.id && setDetailId(c.id)}>
                              <td>{c.type === "sales_order" ? "Sales order" : "Estimate"}</td>
                              <td>{c.number || "—"}</td>
                              <td>{formatYmd(c.date)}</td>
                              <td>{formatMoneyStandard(c.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="muted">
                      Listed: {detail.container.estimates.count} other estimate{detail.container.estimates.count === 1 ? "" : "s"} · Estimates ($) {formatMoneyStandard(detail.container.estimates.value)} ·{" "}
                      {detail.container.salesOrders.count} sales order{detail.container.salesOrders.count === 1 ? "" : "s"} · Sales orders ($) {formatMoneyStandard(detail.container.salesOrders.value)}
                      {detail.container.truncated ? " · showing the 50 most recent" : ""}
                    </p>
                  </>
                ) : (
                  <p className="muted">No other estimates or sales orders on this Customer:Job in the synced range.</p>
                )}

                <h3>Not in this release</h3>
                <Unavailable title="Estimator">Estimator assignment is planned for phase 2.</Unavailable>
                <Unavailable title="Sold status & handoff">Not inferred from QuickBooks. Mark Sold for eliteOS quotes is unchanged.</Unavailable>
                <Unavailable title="Production status">Moraware job status is not shown in this release.</Unavailable>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
