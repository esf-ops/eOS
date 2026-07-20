import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchEstimateQueue,
  fetchEstimateQueuePreview,
  recordEstimateQueueOpened
} from "../lib/estimateQueueApi.mjs";
import { createQuoteIntakeApiClient } from "../lib/quoteIntakeApi.mjs";
import { ApiError, isAbortError } from "../lib/api";
import {
  formatAge,
  formatReceivedAt,
  safeText
} from "../lib/quoteIntakeFormat.mjs";
import MailboxSyncModal from "./MailboxSyncModal";

export type EstimateQueuePageProps = {
  authToken: string | null;
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onOpenEstimate: (caseId: string, options?: { openTarget?: string }) => void;
};

type QueueRow = {
  id: string;
  customerName?: string;
  projectName?: string;
  senderLabel?: string;
  salespersonLabel?: string | null;
  receivedAt?: string | null;
  attachmentStatus?: string;
  aiTakeoffStatus?: string;
  estimateStatus?: string;
  digitalEstimateStatus?: string;
  customerReviewStatus?: string;
  workflowStatus?: string;
  needsAttention?: boolean;
  lastActivityAt?: string | null;
  assignedEstimatorLabel?: string;
  openTarget?: string;
  indicators?: Record<string, boolean>;
};

type PreviewState =
  | { kind: "closed" }
  | { kind: "loading"; caseId: string }
  | { kind: "ready"; caseId: string; preview: Record<string, unknown>; row: QueueRow }
  | { kind: "error"; caseId: string; message: string };

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "new", label: "New" },
  { key: "takeoff", label: "Takeoff" },
  { key: "estimating", label: "Estimating" },
  { key: "sent", label: "Sent" },
  { key: "customer_changes", label: "Customer changes" },
  { key: "failed", label: "Failed" }
];

const SORTS: Array<{ key: string; label: string }> = [
  { key: "newest_received", label: "Newest received" },
  { key: "oldest_received", label: "Oldest received" },
  { key: "recent_activity", label: "Recent activity" },
  { key: "status", label: "Status" },
  { key: "customer", label: "Customer / project" }
];

function statusTone(status?: string): string {
  const s = String(status || "").toLowerCase();
  if (s.includes("fail") || s.includes("attention") || s.includes("change")) return "danger";
  if (s.includes("approved") || s.includes("sent") || s.includes("accepted")) return "success";
  if (s.includes("processing") || s.includes("review") || s.includes("progress")) return "warn";
  return "neutral";
}

/**
 * Central Elite 100 Estimate Queue dashboard.
 */
export default function EstimateQueuePage({
  authToken,
  selectedCaseId,
  onSelectCase,
  onOpenEstimate
}: EstimateQueuePageProps) {
  const intakeClient = useMemo(() => createQuoteIntakeApiClient(), []);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [attentionCount, setAttentionCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest_received");
  const [offset, setOffset] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mailboxSyncOpen, setMailboxSyncOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ kind: "closed" });
  const limit = 50;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!authToken) {
      setRows([]);
      setError("Sign in to view the Estimate Queue.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = (await fetchEstimateQueue(authToken, {
        search: debouncedSearch,
        filter,
        sort,
        limit,
        offset,
        signal
      })) as {
        cases?: QueueRow[];
        total?: number;
        attentionCount?: number;
      };
      if (signal?.aborted) return;
      setRows(Array.isArray(body.cases) ? body.cases : []);
      setTotal(Number(body.total) || 0);
      setAttentionCount(Number(body.attentionCount) || 0);
    } catch (e) {
      if (isAbortError(e) || signal?.aborted) return;
      setRows([]);
      setError(e instanceof ApiError ? e.message : "Unable to load Estimate Queue");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authToken, debouncedSearch, filter, sort, offset, refreshTick]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, filter, sort]);

  const rangeLabel = useMemo(() => {
    if (!total) return "No matching cases";
    const start = offset + 1;
    const end = Math.min(offset + rows.length, total);
    return `Showing ${start}–${end} of ${total}`;
  }, [offset, rows.length, total]);

  async function openPreview(row: QueueRow) {
    if (!authToken) return;
    onSelectCase(row.id);
    setPreview({ kind: "loading", caseId: row.id });
    try {
      void recordEstimateQueueOpened(authToken, row.id).catch(() => {});
      const body = (await fetchEstimateQueuePreview(authToken, row.id)) as {
        preview?: Record<string, unknown>;
        case?: QueueRow;
      };
      setPreview({
        kind: "ready",
        caseId: row.id,
        preview: body.preview || {},
        row: body.case || row
      });
    } catch (e) {
      setPreview({
        kind: "error",
        caseId: row.id,
        message: e instanceof ApiError ? e.message : "Unable to load preview"
      });
    }
  }

  async function openStudio(caseId: string, openTarget?: string) {
    if (authToken) {
      void recordEstimateQueueOpened(authToken, caseId).catch(() => {});
    }
    setPreview({ kind: "closed" });
    onOpenEstimate(caseId, { openTarget });
  }

  async function assignToMe(caseId: string) {
    if (!authToken) return;
    try {
      // Soft self-assign via opened endpoint (assigns when unassigned).
      await recordEstimateQueueOpened(authToken, caseId);
      setRefreshTick((n) => n + 1);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="eq-dashboard" data-testid="estimate-queue-dashboard">
      <header className="eq-dash-header">
        <div>
          <h1 className="eq-title">Estimate Queue</h1>
          <p className="eq-subtitle">
            Elite 100 intake → Takeoff → estimate → Digital Estimate → customer review.
          </p>
        </div>
        <div className="eq-header-actions">
          <button
            type="button"
            className="eq-btn-secondary"
            onClick={() => setRefreshTick((n) => n + 1)}
            disabled={loading}
          >
            Refresh
          </button>
          <button type="button" className="eq-btn-primary" onClick={() => setMailboxSyncOpen(true)}>
            Sync inbox
          </button>
        </div>
      </header>

      <div className="eq-dash-metrics" role="list">
        <div className="eq-metric" role="listitem">
          <div className="eq-metric-label">In queue</div>
          <div className="eq-metric-value">{total}</div>
        </div>
        <button
          type="button"
          className={`eq-metric eq-metric--btn ${filter === "needs_attention" ? "is-active" : ""}`}
          onClick={() => setFilter("needs_attention")}
        >
          <div className="eq-metric-label">Needs attention</div>
          <div className="eq-metric-value">{attentionCount}</div>
        </button>
      </div>

      <section className="eq-dash-filters" aria-label="Queue filters">
        <label className="eq-search">
          <span className="eq-muted">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, project, sender, status, filename…"
            data-testid="eq-queue-search"
          />
        </label>
        <div className="eq-filter-chips" role="tablist" aria-label="Status filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`eq-chip ${filter === f.key ? "is-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label>
          <span className="eq-muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} data-testid="eq-queue-sort">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="eq-muted eq-range">{rangeLabel}</div>
      </section>

      {error ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-queue-error">
          {error}
          <div className="eq-action-row">
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-queue-retry"
              onClick={() => setRefreshTick((n) => n + 1)}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      <div className="eq-table-wrap">
        <table className="eq-table" data-testid="eq-queue-table">
          <thead>
            <tr>
              <th>Customer / project</th>
              <th className="hide-sm">Sender</th>
              <th>Received</th>
              <th className="hide-md">Attachments</th>
              <th className="hide-md">AI Takeoff</th>
              <th className="hide-md">Estimate</th>
              <th className="hide-sm">Digital Estimate</th>
              <th>Workflow</th>
              <th className="hide-sm">Activity</th>
              <th className="hide-md">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              <tr>
                <td colSpan={10} className="eq-muted">
                  Loading queue…
                </td>
              </tr>
            ) : null}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={10} className="eq-muted">
                  No cases match these filters.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const selected = selectedCaseId === row.id;
              return (
                <tr
                  key={row.id}
                  className={[
                    selected ? "is-selected" : "",
                    row.needsAttention ? "needs-attention" : "",
                    row.indicators?.unread ? "is-unread" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-testid={`eq-queue-row-${row.id}`}
                  onClick={() => void openPreview(row)}
                >
                  <td>
                    <div className="eq-cell-primary">
                      {row.needsAttention ? <span className="eq-attn-dot" title="Needs attention" /> : null}
                      {safeText(row.customerName)} · {safeText(row.projectName)}
                    </div>
                    <div className="eq-cell-meta">{row.id.slice(0, 8)}…</div>
                  </td>
                  <td className="hide-sm">{safeText(row.senderLabel)}</td>
                  <td>
                    <div>{formatReceivedAt(row.receivedAt || null)}</div>
                    <div className="eq-cell-meta">{formatAge(row.receivedAt || null)}</div>
                  </td>
                  <td className="hide-md">{safeText(row.attachmentStatus, "—")}</td>
                  <td className="hide-md">
                    <span className={`eq-pill eq-pill--${statusTone(row.aiTakeoffStatus)}`}>
                      {safeText(row.aiTakeoffStatus, "—")}
                    </span>
                  </td>
                  <td className="hide-md">
                    <span className={`eq-pill eq-pill--${statusTone(row.estimateStatus)}`}>
                      {safeText(row.estimateStatus, "—")}
                    </span>
                  </td>
                  <td className="hide-sm">
                    <span className={`eq-pill eq-pill--${statusTone(row.digitalEstimateStatus)}`}>
                      {safeText(row.digitalEstimateStatus, "—")}
                    </span>
                  </td>
                  <td>
                    <span className={`eq-pill eq-pill--${statusTone(row.workflowStatus)}`}>
                      {safeText(row.workflowStatus, "—")}
                    </span>
                    {row.indicators?.customerRequestedReview ? (
                      <div className="eq-cell-meta">Customer review</div>
                    ) : null}
                  </td>
                  <td className="hide-sm">
                    <div>{formatReceivedAt(row.lastActivityAt || null)}</div>
                    <div className="eq-cell-meta">{formatAge(row.lastActivityAt || null)}</div>
                  </td>
                  <td className="hide-md">{safeText(row.assignedEstimatorLabel, "Unassigned")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="eq-pager">
        <button
          type="button"
          className="eq-btn-secondary"
          disabled={offset <= 0 || loading}
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
        >
          Previous
        </button>
        <button
          type="button"
          className="eq-btn-secondary"
          disabled={offset + limit >= total || loading}
          onClick={() => setOffset((o) => o + limit)}
        >
          Next
        </button>
      </div>

      {preview.kind !== "closed" ? (
        <div className="eq-drawer-backdrop" role="presentation" onClick={() => setPreview({ kind: "closed" })}>
          <aside
            className="eq-drawer"
            role="dialog"
            aria-label="Case preview"
            data-testid="eq-queue-preview"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="eq-drawer-header">
              <h2>Case preview</h2>
              <button type="button" className="eq-btn-secondary" onClick={() => setPreview({ kind: "closed" })}>
                Close
              </button>
            </header>
            {preview.kind === "loading" ? <p className="eq-muted">Loading preview…</p> : null}
            {preview.kind === "error" ? (
              <p className="eq-state eq-state--error" role="alert">
                {preview.message}
              </p>
            ) : null}
            {preview.kind === "ready" ? (
              <QueuePreviewBody
                preview={preview.preview}
                row={preview.row}
                onOpenStudio={() =>
                  void openStudio(
                    preview.caseId,
                    String(preview.preview.openTarget || preview.row.openTarget || "takeoff")
                  )
                }
                onReviewTakeoff={() => void openStudio(preview.caseId, "takeoff")}
                onOpenDigital={() => void openStudio(preview.caseId, "digital")}
                onOpenReview={() => void openStudio(preview.caseId, "review")}
                onAssign={() => void assignToMe(preview.caseId)}
              />
            ) : null}
          </aside>
        </div>
      ) : null}

      <MailboxSyncModal
        open={mailboxSyncOpen}
        authToken={authToken || ""}
        apiClient={intakeClient}
        onClose={() => setMailboxSyncOpen(false)}
        onImported={() => setRefreshTick((n) => n + 1)}
      />
    </div>
  );
}

function QueuePreviewBody({
  preview,
  row,
  onOpenStudio,
  onReviewTakeoff,
  onOpenDigital,
  onOpenReview,
  onAssign
}: {
  preview: Record<string, unknown>;
  row: QueueRow;
  onOpenStudio: () => void;
  onReviewTakeoff: () => void;
  onOpenDigital: () => void;
  onOpenReview: () => void;
  onAssign: () => void;
}) {
  const ai = (preview.aiTakeoff || {}) as Record<string, unknown>;
  const cutouts = (ai.cutouts || {}) as Record<string, number>;
  const attachments = Array.isArray(preview.attachments) ? preview.attachments : [];
  const timeline = Array.isArray(preview.timeline) ? preview.timeline : [];
  const activity = (preview.activity || {}) as Record<string, unknown>;

  return (
    <div className="eq-preview-body">
      <dl className="eq-status-dl">
        <div>
          <dt>Customer</dt>
          <dd>{safeText(preview.customerName as string)}</dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>{safeText(preview.projectName as string)}</dd>
        </div>
        <div>
          <dt>Sender</dt>
          <dd>{safeText(preview.senderLabel as string)}</dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>{formatReceivedAt((preview.receivedAt as string) || null)}</dd>
        </div>
        <div>
          <dt>Workflow</dt>
          <dd>{safeText(preview.workflowStatus as string)}</dd>
        </div>
        <div>
          <dt>AI Takeoff</dt>
          <dd>{safeText(String(ai.status || row.aiTakeoffStatus))}</dd>
        </div>
        <div>
          <dt>Estimate</dt>
          <dd>{safeText(preview.estimateStatus as string)}</dd>
        </div>
        <div>
          <dt>Digital Estimate</dt>
          <dd>{safeText(preview.digitalEstimateStatus as string)}</dd>
        </div>
        <div>
          <dt>Customer review</dt>
          <dd>{safeText(preview.customerReviewStatus as string)}</dd>
        </div>
      </dl>

      <section>
        <h3>Attachments</h3>
        <ul className="eq-preview-list">
          {attachments.length ? (
            attachments.map((a: any) => (
              <li key={a.id}>
                {safeText(a.filename)} · {safeText(a.support, "unknown")}
              </li>
            ))
          ) : (
            <li className="eq-muted">No attachments</li>
          )}
        </ul>
        <p className="eq-muted">PDF support: {safeText(preview.pdfSupportState as string, "none")}</p>
      </section>

      <section>
        <h3>AI Takeoff summary</h3>
        <p>
          Rooms {String(ai.rooms ?? "—")} · Pieces {String(ai.pieces ?? "—")} · CT{" "}
          {Number(ai.countertopSf ?? 0).toFixed(2)} SF · BS {Number(ai.backsplashSf ?? 0).toFixed(2)} SF
        </p>
        <p className="eq-muted">
          Cutouts — kitchen {cutouts.kitchenSink ?? 0}, vanity/bar {cutouts.vanityBarSink ?? 0}, cooktop{" "}
          {cutouts.cooktop ?? 0}, outlet {cutouts.outlet ?? 0}
        </p>
      </section>

      <section>
        <h3>Activity</h3>
        <ul className="eq-preview-list">
          {timeline.map((t: any, i: number) => (
            <li key={`${t.at}-${i}`}>
              {formatReceivedAt(t.at)} — {safeText(t.label)}
            </li>
          ))}
          <li className="eq-muted">
            Assignee: {safeText(activity.assignedEstimatorLabel as string, "Unassigned")}
          </li>
        </ul>
      </section>

      <div className="eq-drawer-actions">
        <button type="button" className="eq-btn-primary" data-testid="eq-preview-open-studio" onClick={onOpenStudio}>
          Open in Estimate Studio
        </button>
        <button type="button" className="eq-btn-secondary" onClick={onReviewTakeoff}>
          Review AI Takeoff
        </button>
        <button type="button" className="eq-btn-secondary" onClick={onOpenDigital}>
          Open Digital Estimate
        </button>
        <button type="button" className="eq-btn-secondary" onClick={onOpenReview}>
          View customer review
        </button>
        <button type="button" className="eq-btn-secondary" onClick={onAssign}>
          Assign to me
        </button>
      </div>
    </div>
  );
}
