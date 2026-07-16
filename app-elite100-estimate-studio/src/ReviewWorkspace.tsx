/**
 * DE.2F — Private Studio customer review queue + amendment workspace.
 * Never shows sold/accept/payment. Never auto-emails. Raw replacement token is one-time UI state only.
 */
import React, { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiError } from "./lib/api";

export function reviewUiEnabled(): boolean {
  return (
    String(import.meta.env.VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED ?? "").trim() === "true"
  );
}

type QueueRow = {
  id: string;
  status: string;
  publicationId: string;
  quoteNumber?: string | null;
  requestedAt: string;
  baselineDisplayTotal?: number | null;
  requestedDisplayTotal?: number | null;
  displayDelta?: number | null;
  changedSelectionCount?: number;
  pricingValidThrough?: string | null;
  clarificationRequired?: boolean;
};

type Props = {
  token: string;
  onAuthFailure: () => void;
};

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Math.round(Number(n)).toLocaleString("en-US")}`;
}

export default function ReviewWorkspace({ token, onAuthFailure }: Props) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);
  const [replacementPubId, setReplacementPubId] = useState<string | null>(null);
  const [staffNotice, setStaffNotice] = useState<string | null>(null);
  const [customerExplanation, setCustomerExplanation] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [clarificationMsg, setClarificationMsg] = useState("");

  if (!reviewUiEnabled()) {
    return null;
  }

  async function loadQueue() {
    setError(null);
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const body = (await apiGet(`/api/digital-estimate/review-requests${q}`, token)) as {
        reviewRequests?: QueueRow[];
      };
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
    try {
      const body = (await apiGet(`/api/digital-estimate/review-requests/${id}`, token)) as Record<
        string,
        unknown
      >;
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
  const comparison = (detail?.comparison || null) as {
    rows?: Array<Record<string, unknown>>;
    internalTotals?: Record<string, unknown>;
    customerSafeTotals?: Record<string, unknown>;
  } | null;
  const amendments = (detail?.amendments || []) as Array<Record<string, unknown>>;
  const latestAmd = amendments[0] || null;

  async function startReview() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await apiPost(`/api/digital-estimate/review-requests/${selectedId}/start`, token, {});
      await loadDetail(selectedId);
      await loadQueue();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to start review");
    } finally {
      setBusy(false);
    }
  }

  async function requestClarification() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await apiPost(`/api/digital-estimate/review-requests/${selectedId}/clarification`, token, {
        message: clarificationMsg,
      });
      await loadDetail(selectedId);
      await loadQueue();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to set clarification");
    } finally {
      setBusy(false);
    }
  }

  async function closeWithoutAmendment() {
    if (!selectedId) return;
    if (!window.confirm("Close this review request without publishing an updated estimate?")) return;
    setBusy(true);
    try {
      await apiPost(`/api/digital-estimate/review-requests/${selectedId}/close`, token, {
        reason: "closed_without_amendment",
      });
      await loadDetail(selectedId);
      await loadQueue();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to close");
    } finally {
      setBusy(false);
    }
  }

  async function createAmendment() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await apiPost(`/api/digital-estimate/review-requests/${selectedId}/amendments`, token, {});
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to create amendment");
    } finally {
      setBusy(false);
    }
  }

  async function saveAmendmentNotes() {
    if (!latestAmd?.id) return;
    setBusy(true);
    try {
      await apiPatch(`/api/digital-estimate/amendments/${String(latestAmd.id)}`, token, {
        expectedRowVersion: latestAmd.rowVersion,
        customerSafeExplanation: customerExplanation,
        internalNote: internalNote || undefined,
      });
      setInternalNote("");
      await loadDetail(selectedId!);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to update amendment");
    } finally {
      setBusy(false);
    }
  }

  async function validateAmendment() {
    if (!latestAmd?.id) return;
    setBusy(true);
    try {
      await apiPost(`/api/digital-estimate/amendments/${String(latestAmd.id)}/validate`, token, {
        expectedRowVersion: latestAmd.rowVersion,
      });
      await loadDetail(selectedId!);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to validate amendment");
    } finally {
      setBusy(false);
    }
  }

  async function publishAmendment() {
    if (!latestAmd?.id) return;
    if (
      !window.confirm(
        "Publish a replacement Digital Estimate? The prior customer link will stop working. No email is sent automatically."
      )
    ) {
      return;
    }
    setBusy(true);
    setOneTimeLink(null);
    setStaffNotice(null);
    try {
      const body = (await apiPost(
        `/api/digital-estimate/amendments/${String(latestAmd.id)}/publish`,
        token,
        { confirm: true, expectedRowVersion: latestAmd.rowVersion }
      )) as {
        customerUrl?: string | null;
        publication?: { id?: string };
        accessToken?: string | null;
        staffNotice?: string | null;
        syntheticPilot?: { awaitingSyntheticAllowlist?: boolean };
      };
      setOneTimeLink(body.customerUrl || null);
      setReplacementPubId(body.publication?.id || null);
      setStaffNotice(
        body.staffNotice ||
          (body.syntheticPilot?.awaitingSyntheticAllowlist
            ? "Replacement publication awaiting synthetic allowlist"
            : null)
      );
      void body.accessToken;
      await loadDetail(selectedId!);
      await loadQueue();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to publish amendment");
    } finally {
      setBusy(false);
    }
  }

  async function copyReplacementLink() {
    if (!oneTimeLink || !replacementPubId) return;
    try {
      await navigator.clipboard.writeText(oneTimeLink);
      await apiPost(
        `/api/digital-estimate/publications/${replacementPubId}/replacement-link-copied`,
        token,
        {}
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Copy failed");
    }
  }

  return (
    <section className="panel review-workspace">
      <h2>Customer review requests</h2>
      <p className="muted">
        Nonbinding configuration reviews only — not acceptance, sold, payment, or delivery. Prior
        publication links are superseded on amendment publish; staff copy the replacement link manually.
      </p>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="search-row">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="review_requested">review_requested</option>
          <option value="estimator_reviewing">estimator_reviewing</option>
          <option value="clarification_required">clarification_required</option>
          <option value="amendment_prepared">amendment_prepared</option>
          <option value="updated_estimate_published">updated_estimate_published</option>
          <option value="review_closed">review_closed</option>
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
                <th>Estimate</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Original</th>
                <th>Requested total</th>
                <th>Δ</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={selectedId === r.id ? "is-selected" : undefined}>
                  <td>
                    <button type="button" onClick={() => void loadDetail(r.id)}>
                      {r.quoteNumber || r.id.slice(0, 8)}
                    </button>
                  </td>
                  <td>{r.status}</td>
                  <td>{r.requestedAt ? new Date(r.requestedAt).toLocaleString() : "—"}</td>
                  <td>{money(r.baselineDisplayTotal)}</td>
                  <td>{money(r.requestedDisplayTotal)}</td>
                  <td>{money(r.displayDelta)}</td>
                  <td>{r.changedSelectionCount ?? "—"}</td>
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
              <p>
                <strong>{String(reviewRequest.status)}</strong> · immutable snapshot ·{" "}
                {String((reviewRequest.estimateIdentity as { quoteNumber?: string })?.quoteNumber || "")}
              </p>
              <p className="muted">
                Requested {String(reviewRequest.requestedAt)} · Pricing valid through{" "}
                {String(reviewRequest.pricingValidThrough || "—")}
              </p>
              {reviewRequest.customerNote ? (
                <div className="preview-block">
                  <h4>Customer note</h4>
                  <p>{String(reviewRequest.customerNote)}</p>
                </div>
              ) : null}

              <div className="preview-block">
                <h4>Structured comparison</h4>
                <ul className="event-list">
                  {(comparison?.rows || []).map((row, i) => (
                    <li key={`${String(row.optionKey)}-${i}`}>
                      <strong>{String(row.displayLabel || row.optionKey)}</strong> ·{" "}
                      {String(row.changeType)} · qty{" "}
                      {String((row.requestedSelection as { quantity?: number })?.quantity ?? "—")}
                    </li>
                  ))}
                </ul>
                <p>
                  Customer-safe: original {money(comparison?.customerSafeTotals?.baselineDisplay as number)} →
                  requested {money(comparison?.customerSafeTotals?.requestedDisplay as number)} (Δ{" "}
                  {money(comparison?.customerSafeTotals?.displayDelta as number)})
                </p>
                <p className="muted">
                  Internal totals available to estimators only (not shown on public Digital Estimate).
                  Exact baseline {money(comparison?.internalTotals?.baselineExact as number)} / requested{" "}
                  {money(comparison?.internalTotals?.requestedExact as number)}.
                </p>
              </div>

              <div className="actions">
                <button type="button" disabled={busy} onClick={() => void startReview()}>
                  Start review
                </button>
                <button type="button" disabled={busy} onClick={() => void createAmendment()}>
                  Approve selections into amendment draft
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={() => void closeWithoutAmendment()}>
                  Close without amendment
                </button>
              </div>

              <div className="preview-block">
                <h4>Clarification required</h4>
                <textarea
                  rows={2}
                  value={clarificationMsg}
                  onChange={(e) => setClarificationMsg(e.target.value)}
                  placeholder="Customer-safe clarification message"
                />
                <button type="button" disabled={busy} onClick={() => void requestClarification()}>
                  Mark clarification required
                </button>
              </div>

              {latestAmd ? (
                <div className="preview-block">
                  <h4>Amendment draft</h4>
                  <p>
                    v{String(latestAmd.amendmentVersion)} · {String(latestAmd.status)} · row{" "}
                    {String(latestAmd.rowVersion)}
                  </p>
                  <p className="muted">
                    Locked measurements cannot be edited here. Scope corrections require a separate
                    professional estimating workflow.
                  </p>
                  <label>
                    Customer-safe explanation
                    <textarea
                      rows={2}
                      value={customerExplanation}
                      onChange={(e) => setCustomerExplanation(e.target.value)}
                    />
                  </label>
                  <label>
                    Internal note (private)
                    <textarea rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
                  </label>
                  <div className="actions">
                    <button type="button" disabled={busy} onClick={() => void saveAmendmentNotes()}>
                      Save amendment notes
                    </button>
                    <button type="button" disabled={busy} onClick={() => void validateAmendment()}>
                      Validate via DE.2C
                    </button>
                    <button type="button" disabled={busy} onClick={() => void publishAmendment()}>
                      Publish replacement Digital Estimate
                    </button>
                  </div>
                  {oneTimeLink ? (
                    <div className="token-once">
                      <strong>One-time replacement link</strong> — copy now; raw token is not stored for later
                      retrieval. No email is sent.
                      {staffNotice ? (
                        <p className="muted" role="status">
                          {staffNotice}
                        </p>
                      ) : null}
                      <code>{oneTimeLink}</code>
                      <div className="actions">
                        <button type="button" onClick={() => void copyReplacementLink()}>
                          Copy replacement link
                        </button>
                        <a className="btn secondary" href={oneTimeLink} target="_blank" rel="noreferrer">
                          Open replacement estimate
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
