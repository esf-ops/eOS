/**
 * Estimates modal — Activity tab (read-only lifecycle / publication status).
 * No sold, handoff, acceptance, or email actions.
 */
import React, { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import {
  fetchQuoteFlowEstimateActivity,
  type QuoteFlowActivityPayload,
  type QuoteFlowActivityPublication,
  type QuoteFlowActivityTimelineEvent
} from "../lib/quoteFlowEstimatesApi";

type Props = {
  authToken: string;
  estimateId: string;
  disabled?: boolean;
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

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toLocaleString();
}

export default function OfficialActivityPanel(props: Props) {
  const { authToken, estimateId, disabled = false } = props;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<QuoteFlowActivityPayload | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowEstimateActivity(authToken, estimateId);
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
      setCopyNotice(null);
      try {
        const res = await fetchQuoteFlowEstimateActivity(authToken, estimateId);
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

  async function copyLink(url: string) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyNotice("Link copied.");
    } catch {
      setCopyNotice("Unable to copy — select the link manually.");
    }
  }

  const summary = payload?.summary || null;
  const timeline: QuoteFlowActivityTimelineEvent[] = Array.isArray(payload?.timeline)
    ? payload.timeline
    : [];
  const publications: QuoteFlowActivityPublication[] = Array.isArray(payload?.publicationHistory)
    ? payload.publicationHistory
    : [];
  const latestUrl = summary?.customerUrl || publications.find((p) => p.customerUrl)?.customerUrl || null;
  const locked = disabled || loading;

  return (
    <section className="qf-review qf-activity" data-testid="qf-official-activity-panel">
      <header className="qf-review__header">
        <h2 data-testid="qf-activity-title">Activity</h2>
        <p className="qf-muted" data-testid="qf-activity-helper">
          Track estimate lifecycle, Digital Estimate publications, and customer status after publish.
        </p>
        <p className="qf-muted" data-testid="qf-activity-no-handoff">
          Sold job handoff is not active yet.
        </p>
      </header>

      {loading ? <p className="qf-muted">Loading activity…</p> : null}
      {error ? (
        <div className="qf-error-box" role="alert" data-testid="qf-activity-error">
          {error}
        </div>
      ) : null}
      {copyNotice ? (
        <p className="qf-notice" data-testid="qf-activity-copy-notice">
          {copyNotice}
        </p>
      ) : null}

      {summary ? (
        <div className="qf-activity__summary" data-testid="qf-activity-summary">
          <div className="qf-activity__card">
            <span className="qf-stat__label">Official estimate</span>
            <span className="qf-stat__value">{summary.officialStatus?.label || "—"}</span>
          </div>
          <div className="qf-activity__card">
            <span className="qf-stat__label">Review</span>
            <span className="qf-stat__value">{summary.reviewStatus?.label || "—"}</span>
          </div>
          <div className="qf-activity__card">
            <span className="qf-stat__label">Digital Estimate</span>
            <span className="qf-stat__value">{summary.publishStatus?.label || "—"}</span>
          </div>
          <div className="qf-activity__card">
            <span className="qf-stat__label">Latest publication</span>
            <span className="qf-stat__value">
              {summary.latestPublication?.revisionLabel ||
                summary.latestPublication?.publicationId ||
                "—"}
            </span>
          </div>
          <div className="qf-activity__card">
            <span className="qf-stat__label">Customer link</span>
            <span className="qf-stat__value">
              {summary.customerLinkAvailable ? "Available" : "Not available"}
            </span>
          </div>
          <div className="qf-activity__card" data-testid="qf-activity-customer-status">
            <span className="qf-stat__label">Customer selections</span>
            <span className="qf-stat__value">
              {summary.customerSelections?.label || "Not tracked yet"}
            </span>
          </div>
          {summary.needsRereview || summary.needsRepublish ? (
            <div className="qf-activity__card is-warn">
              <span className="qf-stat__label">Attention</span>
              <span className="qf-stat__value">
                {[
                  summary.needsRereview ? "Needs re-review" : null,
                  summary.needsRepublish ? "Needs republish" : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="qf-activity__timeline" data-testid="qf-activity-timeline">
        <h3>Timeline</h3>
        {timeline.length === 0 ? (
          <p className="qf-muted" data-testid="qf-activity-timeline-empty">
            Not tracked yet.
          </p>
        ) : (
          <ol>
            {timeline.map((ev) => (
              <li key={ev.id || `${ev.type}-${ev.at}`} data-testid={`qf-activity-event-${ev.type}`}>
                <strong>{ev.label}</strong>
                <span className="qf-muted">{when(ev.at)}</span>
                {ev.detail ? <p className="qf-muted">{ev.detail}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="qf-activity__pubs" data-testid="qf-activity-publications">
        <h3>Publication history</h3>
        {publications.length === 0 ? (
          <p className="qf-muted">No Digital Estimate publications yet.</p>
        ) : (
          <ul>
            {publications.map((pub) => (
              <li
                key={pub.publicationId || `${pub.publishedAt}-${pub.state}`}
                data-testid="qf-activity-publication-row"
              >
                <div>
                  <strong>
                    {pub.revisionLabel || pub.publicationId || "Publication"} · {pub.state}
                  </strong>
                  <p className="qf-muted">
                    {when(pub.publishedAt)}
                    {pub.publishedByUserId ? ` · by ${pub.publishedByUserId}` : ""}
                  </p>
                  {pub.customerUrl ? (
                    <p className="qf-de__url">{pub.customerUrl}</p>
                  ) : (
                    <p className="qf-muted">No recoverable customer URL</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {latestUrl ? (
        <div className="qf-de__link" data-testid="qf-activity-latest-link">
          <h3>Latest customer link</h3>
          <p className="qf-de__url">{latestUrl}</p>
          <div className="qf-review__actions">
            <a
              className="qf-btn-secondary"
              href={latestUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="qf-activity-open-link"
            >
              Open link
            </a>
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-activity-copy-link"
              disabled={locked}
              onClick={() => void copyLink(latestUrl)}
            >
              Copy link
            </button>
          </div>
        </div>
      ) : null}

      {Array.isArray(payload?.unavailableNotes) && payload.unavailableNotes.length > 0 ? (
        <div className="qf-activity__notes" data-testid="qf-activity-unavailable">
          <h3>Tracking gaps</h3>
          <ul>
            {payload.unavailableNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="qf-review__actions">
        <button
          type="button"
          className="qf-btn-secondary"
          data-testid="qf-activity-refresh"
          disabled={locked}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
    </section>
  );
}
