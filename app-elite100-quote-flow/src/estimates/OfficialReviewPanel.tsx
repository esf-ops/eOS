/**
 * Estimates modal — Review tab (internal approval gate only).
 * No Digital Estimate publish, acceptance, or sold.
 */
import React, { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import {
  approveQuoteFlowEstimateReview,
  fetchQuoteFlowEstimateReview,
  reopenQuoteFlowEstimateReview,
  type QuoteFlowReviewChecklistItem,
  type QuoteFlowReviewPayload,
  type QuoteFlowReviewSummary
} from "../lib/quoteFlowEstimatesApi";

type Props = {
  authToken: string;
  estimateId: string;
  disabled?: boolean;
  onApproved?: () => void;
  onReopened?: () => void;
};

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function severityClass(severity: string): string {
  if (severity === "passed") return "qf-review__check is-passed";
  if (severity === "warning") return "qf-review__check is-warning";
  return "qf-review__check is-blocker";
}

export default function OfficialReviewPanel(props: Props) {
  const { authToken, estimateId, disabled = false, onApproved, onReopened } = props;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payload, setPayload] = useState<QuoteFlowReviewPayload | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowEstimateReview(authToken, estimateId);
      setPayload(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetchQuoteFlowEstimateReview(authToken, estimateId);
        if (!cancelled) setPayload(res);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [authToken, estimateId]);

  async function approve() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await approveQuoteFlowEstimateReview(authToken, estimateId);
      setPayload(res);
      setNotice(res.message || "Estimate approved.");
      onApproved?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await reopenQuoteFlowEstimateReview(authToken, estimateId);
      setPayload(res);
      setNotice(res.message || "Review reopened.");
      onReopened?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const checklist: QuoteFlowReviewChecklistItem[] = Array.isArray(payload?.checklist)
    ? payload.checklist
    : [];
  const summary: QuoteFlowReviewSummary | null = payload?.reviewSummary || null;
  const canApprove = payload?.canApprove === true;
  const isApproved = payload?.reviewStatus?.key === "approved";
  const locked = disabled || loading || busy;

  return (
    <section className="qf-review" data-testid="qf-official-review-panel">
      <header className="qf-review__header">
        <h2 data-testid="qf-review-title">Review</h2>
        <p className="qf-muted" data-testid="qf-review-helper">
          Review official scope and internal pricing before preparing a customer quote.
        </p>
        <p className="qf-muted" data-testid="qf-review-no-publish">
          Digital Estimate publish is not active yet.
        </p>
      </header>

      {loading ? <p className="qf-muted">Loading review…</p> : null}
      {error ? (
        <div className="qf-error-box" role="alert" data-testid="qf-review-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="qf-notice" data-testid="qf-review-notice">
          {notice}
        </p>
      ) : null}

      {payload?.reviewStatus ? (
        <div
          className={`qf-review__status qf-review__status--${payload.reviewStatus.key}`}
          data-testid="qf-review-status"
        >
          {payload.reviewStatus.label}
        </div>
      ) : null}

      {payload?.reReviewRequired && payload.reReviewMessage ? (
        <div className="qf-pricing__stale" data-testid="qf-review-stale" role="status">
          {payload.reReviewMessage}
        </div>
      ) : null}

      {summary ? (
        <div className="qf-review__summary" data-testid="qf-review-summary">
          <h3>Review summary</h3>
          <dl className="qf-review__dl">
            <div>
              <dt>Estimate</dt>
              <dd>{summary.estimateName || "—"}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{summary.source?.label || "—"}</dd>
            </div>
            <div>
              <dt>Rooms / pieces</dt>
              <dd>
                {summary.rooms ?? "—"} / {summary.pieces ?? "—"}
              </dd>
            </div>
            <div>
              <dt>Countertop SF</dt>
              <dd>
                {summary.countertopSf != null ? Number(summary.countertopSf).toFixed(1) : "—"}
              </dd>
            </div>
            <div>
              <dt>Backsplash SF</dt>
              <dd>
                {summary.backsplashSf != null ? Number(summary.backsplashSf).toFixed(1) : "—"}
              </dd>
            </div>
            <div>
              <dt>Open edge LF</dt>
              <dd>{summary.openEdgeLf != null ? Number(summary.openEdgeLf).toFixed(1) : "0.0"}</dd>
            </div>
            <div>
              <dt>Pricing basis</dt>
              <dd>{summary.pricingBasis || "—"}</dd>
            </div>
            <div>
              <dt>Price group</dt>
              <dd>{summary.priceGroupLabel || summary.priceGroup || "—"}</dd>
            </div>
            <div>
              <dt>Customer estimate total</dt>
              <dd data-testid="qf-review-customer-total">{money(summary.customerEstimateTotal)}</dd>
            </div>
            <div>
              <dt>Customer-facing adjustments</dt>
              <dd>{money(summary.customerFacingAdjustments)}</dd>
            </div>
            <div>
              <dt>Internal-only adjustments</dt>
              <dd>{money(summary.internalOnlyAdjustments)}</dd>
            </div>
            <div>
              <dt>Internal economics total</dt>
              <dd>{money(summary.exactInternalTotal)}</dd>
            </div>
            <div>
              <dt>Latest calculation</dt>
              <dd>
                {summary.calculatedAt ? new Date(summary.calculatedAt).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="qf-review__checklist" data-testid="qf-review-checklist">
        <h3>Readiness checklist</h3>
        <ul>
          {checklist.map((item) => (
            <li key={item.id} className={severityClass(item.severity)} data-testid={`qf-review-check-${item.id}`}>
              <span className="qf-review__check-badge">{item.severity}</span>
              <div>
                <strong>{item.label}</strong>
                {item.detail ? <p className="qf-muted">{item.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {payload?.approval?.approvedAt ? (
        <div className="qf-review__approval-meta" data-testid="qf-review-approval-meta">
          <h3>Approval</h3>
          <p>
            Approved {new Date(payload.approval.approvedAt).toLocaleString()}
            {payload.approval.approvedByUserId
              ? ` · by ${payload.approval.approvedByUserId}`
              : ""}
          </p>
          {payload.approval.customerDisplayTotal != null ? (
            <p className="qf-muted">
              Approved customer total {money(payload.approval.customerDisplayTotal)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="qf-review__actions">
        <button
          type="button"
          className="qf-btn-primary"
          data-testid="qf-review-approve"
          disabled={locked || !canApprove || isApproved}
          onClick={() => void approve()}
        >
          {busy ? "Working…" : "Approve estimate"}
        </button>
        {isApproved || payload?.approval?.approvedAt || payload?.reReviewRequired ? (
          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-review-reopen"
            disabled={locked}
            onClick={() => void reopen()}
          >
            Reopen review
          </button>
        ) : null}
        <button
          type="button"
          className="qf-btn-secondary"
          data-testid="qf-review-refresh"
          disabled={locked}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
    </section>
  );
}
