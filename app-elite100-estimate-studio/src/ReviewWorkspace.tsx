/**
 * Customer review-request workspace — Studio resolve / revise / republish loop.
 * Reuses Brain review-request records; never shows sold/accept/payment.
 * Replacement customer URL is recovered from publication link metadata when available.
 */
import React, { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "./lib/api";

export function reviewUiEnabled(): boolean {
  return (
    String(import.meta.env.VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED ?? "").trim() === "true"
  );
}

type QueueRow = {
  id: string;
  status: string;
  operatorStatus?: string;
  publicationId: string;
  quoteNumber?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  requestedAt: string;
  baselineDisplayTotal?: number | null;
  requestedDisplayTotal?: number | null;
  displayDelta?: number | null;
  changedSelectionCount?: number;
  intakeCaseId?: string | null;
  studioEstimateId?: string | null;
  revisedEstimateId?: string | null;
  linkedEstimateRevision?: number | null;
  resolutionState?: string;
};

type Props = {
  token: string;
  onAuthFailure: () => void;
  onOpenEstimate?: (intakeCaseId: string) => void;
};

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Math.round(Number(n)).toLocaleString("en-US")}`;
}

function operatorLabel(s: string | undefined | null): string {
  const v = String(s || "");
  const map: Record<string, string> = {
    new: "New",
    in_review: "In review",
    revision_required: "Revision required",
    resolved_no_change: "Resolved — no change",
    resolved_republished: "Resolved — republished",
    rejected: "Rejected"
  };
  return map[v] || v || "—";
}

export default function ReviewWorkspace({ token, onAuthFailure, onOpenEstimate }: Props) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);
  const [staffNotice, setStaffNotice] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [applySelections, setApplySelections] = useState(false);

  if (!reviewUiEnabled()) {
    return null;
  }

  async function loadQueue() {
    setError(null);
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const body = (await apiGet(
        `/api/elite100-estimate-studio/review-requests${q}`,
        token
      )) as { reviewRequests?: QueueRow[] };
      setRows(body.reviewRequests || []);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        onAuthFailure();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Unable to load review queue");
    }
  }

  async function loadDetail(id: string) {
    setBusy(true);
    setError(null);
    setOneTimeLink(null);
    setStaffNotice(null);
    try {
      const body = (await apiGet(
        `/api/elite100-estimate-studio/review-requests/${id}`,
        token
      )) as Record<string, unknown>;
      setSelectedId(id);
      setDetail(body);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        onAuthFailure();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Unable to load review");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter]);

  const reviewRequest = (detail?.reviewRequest || null) as Record<string, unknown> | null;
  const linkage = (detail?.linkage || null) as Record<string, unknown> | null;
  const pricingComparison = (detail?.pricingComparison || null) as Record<string, unknown> | null;
  const blockers = (detail?.blockers || null) as {
    unsupportedSelections?: Array<{ message?: string }>;
    unresolvedCommercial?: Array<{ message?: string }>;
    canRepublish?: boolean;
  } | null;
  const comparison = (detail?.comparison || null) as {
    rows?: Array<Record<string, unknown>>;
    customerSafeTotals?: Record<string, unknown>;
  } | null;
  const timeline = (detail?.timeline || []) as Array<Record<string, unknown>>;

  const operatorStatus = String(reviewRequest?.operatorStatus || "");
  const open =
    operatorStatus === "new" ||
    operatorStatus === "in_review" ||
    operatorStatus === "revision_required";

  async function runAction(
    path: string,
    body: Record<string, unknown>,
    opts?: { expectLink?: boolean }
  ) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setStaffNotice(null);
    try {
      const result = (await apiPost(
        `/api/elite100-estimate-studio/review-requests/${selectedId}/${path}`,
        token,
        body
      )) as {
        customerUrl?: string | null;
        staffNotice?: string | null;
        notice?: string | null;
        revisedEstimate?: { intakeCaseId?: string };
      };
      if (opts?.expectLink && result.customerUrl) {
        setOneTimeLink(result.customerUrl);
      }
      setStaffNotice(result.staffNotice || result.notice || null);
      await loadDetail(selectedId);
      await loadQueue();
      return result;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
      // Reload so failed republish still shows revision_required
      if (selectedId) await loadDetail(selectedId);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function copyNewLink() {
    if (!oneTimeLink) return;
    try {
      await navigator.clipboard.writeText(oneTimeLink);
      setStaffNotice("Replacement customer link copied.");
    } catch {
      setError("Unable to copy link");
    }
  }

  return (
    <section className="panel review-workspace" data-testid="studio-review-workspace">
      <h2>Customer review requests</h2>
      <p className="muted">
        Nonbinding configuration reviews only — not acceptance, sold, payment, or ordering. Revising
        opens a new Studio estimate revision; republish supersedes the prior Digital Estimate link.
      </p>
      {error ? <div className="error-box">{error}</div> : null}
      {staffNotice ? (
        <div className="warn-box" role="status">
          {staffNotice}
        </div>
      ) : null}

      <div className="search-row">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="review_requested">new (review_requested)</option>
          <option value="estimator_reviewing">in_review</option>
          <option value="amendment_prepared">revision_required</option>
          <option value="updated_estimate_published">resolved_republished</option>
          <option value="review_closed">resolved / rejected</option>
        </select>
        <button type="button" disabled={busy} onClick={() => void loadQueue()}>
          Refresh
        </button>
      </div>

      <div className="studio-grid">
        <div>
          <table className="review-table">
            <thead>
              <tr>
                <th>Customer / project</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Publication</th>
                <th>Requested / Δ</th>
                <th>Estimate rev</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={selectedId === r.id ? "is-selected" : undefined}>
                  <td>
                    <button type="button" onClick={() => void loadDetail(r.id)}>
                      {r.customerName || r.quoteNumber || r.id.slice(0, 8)}
                      {r.projectName ? ` · ${r.projectName}` : ""}
                    </button>
                  </td>
                  <td>{operatorLabel(r.operatorStatus || r.resolutionState)}</td>
                  <td>{r.requestedAt ? new Date(r.requestedAt).toLocaleString() : "—"}</td>
                  <td className="muted">{r.publicationId?.slice(0, 8) || "—"}</td>
                  <td>
                    {money(r.requestedDisplayTotal)} / {money(r.displayDelta)}
                  </td>
                  <td>{r.linkedEstimateRevision ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="muted">No customer review requests.</p> : null}
        </div>

        <div>
          {!reviewRequest ? (
            <p className="muted">Select a request to compare baseline versus customer selections.</p>
          ) : (
            <>
              <h3>Request detail</h3>
              <p data-testid="review-operator-status">
                <strong>{operatorLabel(String(reviewRequest.operatorStatus))}</strong> ·{" "}
                {String(
                  (reviewRequest.estimateIdentity as { customerName?: string })?.customerName || ""
                )}{" "}
                ·{" "}
                {String(
                  (reviewRequest.estimateIdentity as { projectName?: string })?.projectName || ""
                )}
              </p>
              <p className="muted">
                Submitted {String(reviewRequest.requestedAt)} · Publication{" "}
                {String(reviewRequest.publicationId).slice(0, 8)} ({String(reviewRequest.publicationStatus)})
                · Source rev {String(linkage?.sourceEstimateRevision ?? "—")}
              </p>
              {linkage?.intakeCaseId ? (
                <p className="muted">
                  Intake case {String(linkage.intakeCaseId).slice(0, 8)} · Studio estimate{" "}
                  {String(linkage.studioEstimateId || "").slice(0, 8) || "—"}
                  {linkage.revisedEstimateId
                    ? ` · Revised ${String(linkage.revisedEstimateId).slice(0, 8)} (R${String(linkage.revisedEstimateRevision ?? "")})`
                    : ""}
                </p>
              ) : null}

              {reviewRequest.customerNote ? (
                <div className="preview-block">
                  <h4>Customer note</h4>
                  <p>{String(reviewRequest.customerNote)}</p>
                </div>
              ) : null}

              {reviewRequest.resolutionNote ? (
                <div className="preview-block">
                  <h4>Estimator resolution note</h4>
                  <p>{String(reviewRequest.resolutionNote)}</p>
                </div>
              ) : null}

              <div className="preview-block">
                <h4>Pricing comparison (server)</h4>
                <p>
                  Published {money(pricingComparison?.currentPublishedTotal as number)} → requested{" "}
                  {money(pricingComparison?.requestedConfiguredTotal as number)} (Δ{" "}
                  {money(pricingComparison?.delta as number)})
                </p>
              </div>

              <div className="preview-block">
                <h4>Customer selection summary</h4>
                <ul className="event-list">
                  {(comparison?.rows || []).map((row, i) => (
                    <li key={`${String(row.optionKey)}-${i}`}>
                      <strong>{String(row.displayLabel || row.optionKey)}</strong> ·{" "}
                      {String(row.changeType)} · qty{" "}
                      {String((row.requestedSelection as { quantity?: number })?.quantity ?? "—")}
                    </li>
                  ))}
                </ul>
                {!comparison?.rows?.length ? <p className="muted">No selection changes recorded.</p> : null}
              </div>

              {(blockers?.unsupportedSelections?.length || blockers?.unresolvedCommercial?.length) ? (
                <div className="error-box" data-testid="review-blockers">
                  <strong>Blockers</strong>
                  <ul>
                    {(blockers?.unsupportedSelections || []).map((b, i) => (
                      <li key={`u-${i}`}>{b.message}</li>
                    ))}
                    {(blockers?.unresolvedCommercial || []).map((b, i) => (
                      <li key={`c-${i}`}>{b.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {open ? (
                <label className="muted" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Estimator note (required for no-change / reject)
                  <textarea
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    rows={2}
                    data-testid="review-resolution-note"
                  />
                </label>
              ) : null}

              <div className="actions">
                <button
                  type="button"
                  disabled={busy || !open}
                  data-testid="review-start"
                  onClick={() => void runAction("start", {})}
                >
                  Start Review
                </button>
                <button
                  type="button"
                  disabled={busy || !open}
                  data-testid="review-no-change"
                  onClick={() =>
                    void runAction("resolve-no-change", { note: resolutionNote })
                  }
                >
                  No Revision Needed
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !open}
                  data-testid="review-reject"
                  onClick={() => void runAction("reject", { note: resolutionNote })}
                >
                  Reject Request
                </button>
              </div>

              <div className="actions" style={{ marginTop: "0.5rem" }}>
                <label className="muted">
                  <input
                    type="checkbox"
                    checked={applySelections}
                    onChange={(e) => setApplySelections(e.target.checked)}
                  />{" "}
                  Apply customer selections to new revision (server-validated)
                </label>
                <button
                  type="button"
                  disabled={busy || !open}
                  data-testid="review-revise"
                  onClick={() =>
                    void runAction("revise-estimate", {
                      applyCustomerSelections: applySelections
                    })
                  }
                >
                  Revise Estimate
                </button>
                {linkage?.intakeCaseId && onOpenEstimate ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    data-testid="review-open-revised"
                    onClick={() => onOpenEstimate(String(linkage.intakeCaseId))}
                  >
                    Open Revised Estimate
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={
                    busy ||
                    operatorStatus !== "revision_required" ||
                    !blockers?.canRepublish
                  }
                  data-testid="review-republish"
                  onClick={() =>
                    void runAction(
                      "republish",
                      { confirm: true, note: resolutionNote || undefined },
                      { expectLink: true }
                    )
                  }
                >
                  Republish
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !oneTimeLink}
                  data-testid="review-copy-new-link"
                  onClick={() => void copyNewLink()}
                >
                  Copy New Customer Link
                </button>
                {oneTimeLink ? (
                  <a
                    className="btn secondary"
                    href={oneTimeLink}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="review-open-preview"
                  >
                    Open Customer Preview
                  </a>
                ) : null}
              </div>

              {oneTimeLink ? (
                <div className="token-once" role="status" aria-live="polite">
                  <h4>One-time replacement link</h4>
                  <p>
                    Stable reusable customer link for the replacement publication.
                    Use Replace Link on the estimate if lost.
                  </p>
                </div>
              ) : null}

              {timeline.length ? (
                <div className="preview-block">
                  <h4>Timeline</h4>
                  <ul className="event-list">
                    {timeline.map((ev) => (
                      <li key={String(ev.id)}>
                        {String(ev.eventType)} · {String(ev.createdAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
