/**
 * Estimates modal — Digital Estimate tab (customer-facing publish).
 * Requires current internal Review approval. Customer accepts on the public DE link.
 * Publishing does not mark sold, create handoff, or send email.
 */
import React, { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import {
  fetchQuoteFlowDigitalEstimate,
  publishQuoteFlowDigitalEstimate,
  type QuoteFlowDigitalEstimatePayload,
  type QuoteFlowReviewChecklistItem
} from "../lib/quoteFlowEstimatesApi";

type Props = {
  authToken: string;
  estimateId: string;
  disabled?: boolean;
  onPublished?: () => void;
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

export default function OfficialDigitalEstimatePanel(props: Props) {
  const { authToken, estimateId, disabled = false, onPublished } = props;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payload, setPayload] = useState<QuoteFlowDigitalEstimatePayload | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowDigitalEstimate(authToken, estimateId);
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
      setCopyNotice(null);
      try {
        const res = await fetchQuoteFlowDigitalEstimate(authToken, estimateId);
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

  async function publish() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await publishQuoteFlowDigitalEstimate(authToken, estimateId);
      setPayload(res);
      setNotice(res.message || "Digital Estimate published.");
      onPublished?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = payload?.customerUrl || payload?.publication?.customerUrl || "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyNotice("Link copied.");
    } catch {
      setCopyNotice("Unable to copy — select the link manually.");
    }
  }

  const checklist: QuoteFlowReviewChecklistItem[] = Array.isArray(payload?.checklist)
    ? payload.checklist
    : [];
  const canPublish = payload?.canPublish === true;
  const customerUrl = payload?.customerUrl || payload?.publication?.customerUrl || null;
  const isPublished =
    payload?.publishStatus?.key === "published" ||
    payload?.publishStatus?.key === "needs_republish";
  const locked = disabled || loading || busy;
  const summary = payload?.publishSummary || null;

  return (
    <section className="qf-review qf-de" data-testid="qf-official-digital-estimate-panel">
      <header className="qf-review__header">
        <h2 data-testid="qf-de-title">Digital Estimate</h2>
        <p className="qf-muted" data-testid="qf-de-helper">
          Publish a customer-facing Digital Estimate from an approved Quote Flow estimate.
        </p>
        <p className="qf-muted" data-testid="qf-de-no-acceptance">
          Customers accept on the public Digital Estimate link (existing Accept estimate path). Publishing
          here does not mark sold, create handoff, create a QuickBooks invoice, or send email. Activity
          shows acceptance status and the accepted-job report after the customer accepts.
        </p>
      </header>

      {loading ? <p className="qf-muted">Loading Digital Estimate…</p> : null}
      {error ? (
        <div className="qf-error-box" role="alert" data-testid="qf-de-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="qf-notice" data-testid="qf-de-notice">
          {notice}
        </p>
      ) : null}
      {copyNotice ? (
        <p className="qf-notice" data-testid="qf-de-copy-notice">
          {copyNotice}
        </p>
      ) : null}

      {payload?.publishStatus ? (
        <div
          className={`qf-review__status qf-review__status--${payload.publishStatus.key}`}
          data-testid="qf-de-status"
        >
          {payload.publishStatus.label}
        </div>
      ) : null}

      {payload?.reReviewRequired && payload.reReviewMessage ? (
        <div className="qf-pricing__stale" data-testid="qf-de-rereview" role="status">
          {payload.reReviewMessage}
        </div>
      ) : null}

      {payload?.publishStatus?.key === "needs_republish" ? (
        <div className="qf-pricing__stale" data-testid="qf-de-needs-republish" role="status">
          Scope or pricing changed after publish. Needs republish after re-review.
        </div>
      ) : null}

      {summary ? (
        <div className="qf-review__summary" data-testid="qf-de-summary">
          <h3>Approved estimate summary</h3>
          <dl className="qf-review__dl">
            <div>
              <dt>Estimate</dt>
              <dd>{summary.estimateName || "—"}</dd>
            </div>
            <div>
              <dt>Customer estimate total</dt>
              <dd data-testid="qf-de-customer-total">{money(summary.customerEstimateTotal)}</dd>
            </div>
            <div>
              <dt>Customer-facing line items</dt>
              <dd>{summary.customerFacingLineCount ?? 0}</dd>
            </div>
            <div>
              <dt>Internal-only line items</dt>
              <dd data-testid="qf-de-internal-excluded">
                {summary.internalOnlyLineCount ?? 0} excluded from customer payload
              </dd>
            </div>
            <div>
              <dt>Approved</dt>
              <dd>
                {summary.approvedAt ? new Date(summary.approvedAt).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="qf-review__checklist" data-testid="qf-de-checklist">
        <h3>Publish readiness</h3>
        <ul>
          {checklist.map((item) => (
            <li
              key={item.id}
              className={severityClass(item.severity)}
              data-testid={`qf-de-check-${item.id}`}
            >
              <span className="qf-review__check-badge">{item.severity}</span>
              <div>
                <strong>{item.label}</strong>
                {item.detail ? <p className="qf-muted">{item.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {Array.isArray(payload?.customerFacingLines) && payload.customerFacingLines.length > 0 ? (
        <div className="qf-de__lines" data-testid="qf-de-customer-lines">
          <h3>Customer-facing line items</h3>
          <ul>
            {payload.customerFacingLines.map((line) => (
              <li key={line.id || line.label}>
                {line.label} · {line.type} · {money(line.amount)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="qf-muted" data-testid="qf-de-internal-note">
        Internal-only adjustments stay in Quote Flow and are not published to the customer.
      </p>

      {customerUrl ? (
        <div className="qf-de__link" data-testid="qf-de-published-link">
          <h3>Customer link</h3>
          <p className="qf-de__url" data-testid="qf-de-customer-url">
            {customerUrl}
          </p>
          <div className="qf-review__actions">
            <a
              className="qf-btn-secondary"
              href={customerUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="qf-de-open-link"
            >
              Open Digital Estimate
            </a>
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-de-copy-link"
              disabled={locked}
              onClick={() => void copyLink()}
            >
              Copy link
            </button>
          </div>
        </div>
      ) : null}

      <div className="qf-review__actions">
        <button
          type="button"
          className="qf-btn-primary"
          data-testid="qf-de-publish"
          disabled={locked || !canPublish}
          onClick={() => void publish()}
        >
          {busy ? "Publishing…" : isPublished && canPublish ? "Republish Digital Estimate" : "Publish Digital Estimate"}
        </button>
        <button
          type="button"
          className="qf-btn-secondary"
          data-testid="qf-de-refresh"
          disabled={locked}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
    </section>
  );
}
