import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";

type PipelineRow = Record<string, unknown> & {
  id: string;
  quote_number?: string;
  quote_source?: string;
  quote_status?: string;
  customer_name?: string;
  city?: string;
  state?: string;
  sales_rep?: string;
  branch?: string;
  grand_total?: number;
  created_at?: string;
  monday_item_id?: string;
  monday_board_id?: string;
  monday_sync?: { status?: string; created_at?: string } | null;
};

type Metrics = {
  total_open_quote_value?: number;
  new_quotes_today?: number;
  new_quotes_this_week?: number;
  public_quote_value?: number;
  partner_quote_value?: number;
  average_quote_value?: number;
  follow_up_queue_count?: number;
  follow_up_note?: string;
};

const STATUS_OPTIONS = ["", "lead_submitted", "reviewing", "contacted", "quoted", "won", "lost", "archived", "draft", "submitted"];

function money(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `$${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: unknown) {
  if (!s) return "—";
  try {
    return new Date(String(s)).toLocaleString();
  } catch {
    return String(s);
  }
}

export default function QuotePipelinePanel({ token }: { token: string }) {
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteSource, setQuoteSource] = useState("");
  const [quoteStatus, setQuoteStatus] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const [branch, setBranch] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [timeline, setTimeline] = useState<Record<string, unknown> | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [statusPick, setStatusPick] = useState("reviewing");
  const [assignRep, setAssignRep] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [assignBranch, setAssignBranch] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (quoteSource.trim()) p.set("quote_source", quoteSource.trim());
    if (quoteStatus.trim()) p.set("quote_status", quoteStatus.trim());
    if (salesRep.trim()) p.set("sales_rep", salesRep.trim());
    if (branch.trim()) p.set("branch", branch.trim());
    if (search.trim()) p.set("search", search.trim());
    if (dateFrom.trim()) p.set("date_from", dateFrom.trim());
    if (dateTo.trim()) p.set("date_to", dateTo.trim());
    p.set("limit", "80");
    return p.toString();
  }, [quoteSource, quoteStatus, salesRep, branch, search, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionMsg(null);
    try {
      const qs = queryString ? `?${queryString}` : "";
      const [sumJson, listJson] = await Promise.all([
        apiFetch(`/api/quotes/pipeline/summary${qs}`, { token }) as Promise<Record<string, unknown>>,
        apiFetch(`/api/quotes/pipeline${qs}`, { token }) as Promise<{ rows?: PipelineRow[] }>
      ]);
      setMetrics((sumJson.metrics as Metrics) || null);
      setRows(listJson.rows ?? []);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
      setRows([]);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [token, queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setDetail(null);
      setTimeline(null);
      setDetailBusy(true);
      setActionMsg(null);
      try {
        const [d, t] = await Promise.all([
          apiFetch(`/api/quotes/pipeline/${id}`, { token }) as Promise<{ quote?: Record<string, unknown> }>,
          apiFetch(`/api/quotes/pipeline/${id}/timeline`, { token }) as Promise<Record<string, unknown>>
        ]);
        setDetail(d.quote ?? null);
        setTimeline(t);
        const h = d.quote?.header as Record<string, unknown> | undefined;
        setStatusPick(String(h?.quote_status || "reviewing"));
        setAssignRep(String(h?.sales_rep || ""));
        setAssignBranch(String(h?.branch || ""));
      } catch (e: unknown) {
        setActionMsg(e instanceof ApiError ? e.message : String(e));
      } finally {
        setDetailBusy(false);
      }
    },
    [token]
  );

  const patchStatus = async () => {
    if (!selectedId) return;
    setActionMsg(null);
    try {
      await apiFetch(`/api/quotes/pipeline/${selectedId}/status`, {
        token,
        method: "PATCH",
        body: { quote_status: statusPick }
      });
      setActionMsg("Status updated.");
      await load();
      await openDetail(selectedId);
    } catch (e: unknown) {
      setActionMsg(e instanceof ApiError ? e.message : String(e));
    }
  };

  const patchAssign = async () => {
    if (!selectedId) return;
    setActionMsg(null);
    try {
      await apiFetch(`/api/quotes/pipeline/${selectedId}/assign`, {
        token,
        method: "PATCH",
        body: {
          sales_rep: assignRep.trim(),
          sales_rep_email: assignEmail.trim(),
          branch: assignBranch.trim(),
          assignment_source: "manual"
        }
      });
      setActionMsg("Assignment saved.");
      await load();
      await openDetail(selectedId);
    } catch (e: unknown) {
      setActionMsg(e instanceof ApiError ? e.message : String(e));
    }
  };

  const header = detail?.header as Record<string, unknown> | undefined;
  const mondayItem = String(header?.monday_item_id || "").trim();
  const mondayBoard = String(header?.monday_board_id || "").trim();
  const mondayUrl =
    mondayItem && mondayBoard ? `https://monday.com/boards/${mondayBoard}/pulses/${mondayItem}` : mondayItem ? `https://monday.com/pulses/${mondayItem}` : "";

  return (
    <div className="quote-pipeline">
      <h2 style={{ marginTop: 0 }}>Quote Pipeline</h2>
      <p className="muted">Public, internal, and partner quote leads in one place.</p>

      {metrics ? (
        <div className="qp-metrics">
          <div className="qp-metric">
            <span>Open pipeline value</span>
            <strong>{money(metrics.total_open_quote_value)}</strong>
          </div>
          <div className="qp-metric">
            <span>New today</span>
            <strong>{metrics.new_quotes_today ?? 0}</strong>
          </div>
          <div className="qp-metric">
            <span>New this week</span>
            <strong>{metrics.new_quotes_this_week ?? 0}</strong>
          </div>
          <div className="qp-metric">
            <span>Public value (filtered)</span>
            <strong>{money(metrics.public_quote_value)}</strong>
          </div>
          <div className="qp-metric">
            <span>Partner value (filtered)</span>
            <strong>{money(metrics.partner_quote_value)}</strong>
          </div>
          <div className="qp-metric">
            <span>Average</span>
            <strong>{money(metrics.average_quote_value)}</strong>
          </div>
          <div className="qp-metric">
            <span>Follow-up queue</span>
            <strong>{metrics.follow_up_queue_count ?? 0}</strong>
          </div>
        </div>
      ) : null}

      <div className="qp-filters">
        <label>
          Source
          <input value={quoteSource} onChange={(e) => setQuoteSource(e.target.value)} placeholder="e.g. public_consumer" />
        </label>
        <label>
          Status
          <select value={quoteStatus} onChange={(e) => setQuoteStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "any"} value={s}>
                {s || "Any"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Salesperson contains
          <input value={salesRep} onChange={(e) => setSalesRep(e.target.value)} />
        </label>
        <label>
          Branch contains
          <input value={branch} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <label>
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, #, city, email" />
        </label>
        <label>
          From
          <input value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="ISO date" />
        </label>
        <label>
          To
          <input value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="ISO date" />
        </label>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void load()}>
          {loading ? "Loading…" : "Apply filters"}
        </button>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      <div className="qp-layout">
        <div className="qp-table-wrap">
          <table className="qp-table">
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Source</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Sales</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
                <th>Monday</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={selectedId === r.id ? "qp-row-active" : undefined}>
                  <td>
                    <button type="button" className="btn-link" onClick={() => void openDetail(r.id)}>
                      {String(r.quote_number || r.id).slice(0, 14)}
                    </button>
                  </td>
                  <td>{String(r.quote_source || "—")}</td>
                  <td>{String(r.customer_name || "—")}</td>
                  <td>
                    {[r.city, r.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td>{String(r.sales_rep || "—")}</td>
                  <td>{String(r.branch || "—")}</td>
                  <td>{String(r.quote_status || "—")}</td>
                  <td>{money(r.grand_total)}</td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.monday_sync && typeof r.monday_sync === "object" ? String((r.monday_sync as { status?: string }).status || "—") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !loading ? <p className="muted">No quotes match these filters.</p> : null}
        </div>

        <div className="qp-drawer">
          <h3>Detail</h3>
          {detailBusy ? <p className="muted">Loading…</p> : null}
          {!selectedId ? <p className="muted">Select a quote.</p> : null}
          {header ? (
            <>
              <dl className="qp-dl">
                <dt>Customer</dt>
                <dd>{String(header.customer_name || "—")}</dd>
                <dt>Email / phone</dt>
                <dd>
                  {String(header.customer_email || "—")} · {String(header.customer_phone || "—")}
                </dd>
                <dt>Address</dt>
                <dd>
                  {[header.project_address, header.city, header.state, header.zip].filter(Boolean).join(", ") || "—"}
                </dd>
                <dt>Source</dt>
                <dd>{String(header.quote_source || "—")}</dd>
                <dt>Total / sf</dt>
                <dd>
                  {money(header.grand_total)} · {String(header.estimated_sqft ?? "—")}
                </dd>
              </dl>
              {mondayUrl ? (
                <p>
                  <a href={mondayUrl} target="_blank" rel="noreferrer">
                    Open Monday pulse
                  </a>
                </p>
              ) : null}
              <div className="qp-actions">
                <label>
                  New status
                  <select value={statusPick} onChange={(e) => setStatusPick(e.target.value)}>
                    {["lead_submitted", "reviewing", "contacted", "quoted", "won", "lost", "archived"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn btn-primary" onClick={() => void patchStatus()}>
                  Update status
                </button>
              </div>
              <div className="qp-actions">
                <label>
                  Sales rep
                  <input value={assignRep} onChange={(e) => setAssignRep(e.target.value)} />
                </label>
                <label>
                  Rep email
                  <input value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} />
                </label>
                <label>
                  Branch
                  <input value={assignBranch} onChange={(e) => setAssignBranch(e.target.value)} />
                </label>
                <button type="button" className="btn" onClick={() => void patchAssign()}>
                  Save assignment
                </button>
              </div>
              {actionMsg ? <p className="muted">{actionMsg}</p> : null}
              <details>
                <summary>Measurements &amp; estimates</summary>
                <pre className="qp-pre">{JSON.stringify(detail?.submission_payloads, null, 2)}</pre>
              </details>
              <details>
                <summary>Calculation snapshot</summary>
                <pre className="qp-pre">{JSON.stringify(header.calculation_snapshot, null, 2)}</pre>
              </details>
              <details open>
                <summary>Timeline</summary>
                <ul className="qp-timeline">
                  {((timeline?.events as Array<Record<string, unknown>>) || []).map((ev, i) => (
                    <li key={i}>
                      <strong>{fmtDate(ev.at)}</strong> — {String(ev.label || ev.type)}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
