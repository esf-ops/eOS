/**
 * Estimates modal — Activity tab (read-only lifecycle / publication / customer selections).
 * No sold, handoff, acceptance, or email actions.
 */
import React, { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import {
  fetchQuoteFlowEstimateActivity,
  type QuoteFlowActivityPayload,
  type QuoteFlowActivityPublication,
  type QuoteFlowActivitySelectionComparisonRow,
  type QuoteFlowActivitySelectionReview,
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

function money(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function deltaMoney(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.005) return "No change";
  const abs = money(Math.abs(n));
  return n > 0 ? `+${abs}` : `−${abs.replace("$", "")}`;
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
  const selectionReview: QuoteFlowActivitySelectionReview | null =
    payload?.selectionReview && typeof payload.selectionReview === "object"
      ? payload.selectionReview
      : null;
  const comparisonRows: QuoteFlowActivitySelectionComparisonRow[] = Array.isArray(
    selectionReview?.selectionComparison?.rows
  )
    ? selectionReview!.selectionComparison!.rows!
    : [];
  const pricedRooms = Array.isArray(selectionReview?.pricedSelections?.rooms)
    ? selectionReview!.pricedSelections!.rooms!
    : [];
  const latestUrl = summary?.customerUrl || publications.find((p) => p.customerUrl)?.customerUrl || null;
  const locked = disabled || loading;
  const publishedTotal =
    summary?.publishedCustomerTotal ?? selectionReview?.totals?.publishedBaselineTotal ?? null;
  const customerTotal =
    summary?.customerSelectedTotal ?? selectionReview?.totals?.customerEstimateTotal ?? null;
  const difference =
    summary?.customerSelectionDifference ?? selectionReview?.totals?.difference ?? null;
  const needsStaffReview = Boolean(
    summary?.needsStaffReview || payload?.customerSelections?.needsStaffReview
  );
  const selectionStatusLabel =
    payload?.customerSelections?.label ||
    summary?.customerSelections?.label ||
    "No customer selections yet";

  return (
    <section className="qf-review qf-activity" data-testid="qf-official-activity-panel">
      <header className="qf-review__header">
        <h2 data-testid="qf-activity-title">Activity</h2>
        <p className="qf-muted" data-testid="qf-activity-helper">
          Track estimate lifecycle, Digital Estimate publications, and customer selections after
          publish.
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
            <span className="qf-stat__label">Customer link</span>
            <span className="qf-stat__value">
              {summary.customerLinkAvailable ? "Available" : "Not available"}
            </span>
          </div>
          <div className="qf-activity__card" data-testid="qf-activity-customer-status">
            <span className="qf-stat__label">Customer selection status</span>
            <span className="qf-stat__value">{selectionStatusLabel}</span>
          </div>
          <div className="qf-activity__card" data-testid="qf-activity-customer-selected-total">
            <span className="qf-stat__label">Customer selected total</span>
            <span className="qf-stat__value">{money(customerTotal)}</span>
          </div>
          <div className="qf-activity__card" data-testid="qf-activity-published-total">
            <span className="qf-stat__label">Published estimate total</span>
            <span className="qf-stat__value">{money(publishedTotal)}</span>
          </div>
          <div className="qf-activity__card" data-testid="qf-activity-selection-difference">
            <span className="qf-stat__label">Difference from published</span>
            <span className="qf-stat__value">{deltaMoney(difference)}</span>
          </div>
          {needsStaffReview || summary.customerChangesReceived ? (
            <div className="qf-activity__card is-warn" data-testid="qf-activity-needs-staff-review">
              <span className="qf-stat__label">Staff attention</span>
              <span className="qf-stat__value">
                {[
                  summary.customerChangesReceived ? "Customer changes received" : null,
                  needsStaffReview ? "Needs staff review" : null,
                  summary.needsRereview ? "Needs re-review" : null,
                  summary.needsRepublish ? "Needs republish" : null
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
            </div>
          ) : summary.needsRereview || summary.needsRepublish ? (
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

      <div className="qf-activity__selections" data-testid="qf-activity-customer-selections">
        <h3>Customer selections</h3>
        <p className="qf-muted" data-testid="qf-activity-selection-status-detail">
          {payload?.customerSelections?.detail || selectionStatusLabel}
        </p>
        {selectionReview?.lastSavedAt ? (
          <p className="qf-muted" data-testid="qf-activity-last-saved">
            Last saved / submitted: {when(selectionReview.lastSavedAt)}
            {selectionReview.reviewRequested || selectionReview.selectionOnlySubmitted
              ? " · Status: submitted"
              : selectionReview.hasSavedSelections
                ? " · Status: saved"
                : ""}
          </p>
        ) : null}

        {!selectionReview?.hasSavedSelections && comparisonRows.length === 0 ? (
          <p className="qf-muted" data-testid="qf-activity-selections-empty">
            No customer selections yet
          </p>
        ) : null}

        <div className="qf-activity__totals" data-testid="qf-activity-selection-totals">
          <div>
            <span className="qf-stat__label">Published customer total</span>
            <span className="qf-stat__value">{money(publishedTotal)}</span>
          </div>
          <div>
            <span className="qf-stat__label">Customer-selected total</span>
            <span className="qf-stat__value">{money(customerTotal)}</span>
          </div>
          <div>
            <span className="qf-stat__label">Difference</span>
            <span className="qf-stat__value">{deltaMoney(difference)}</span>
          </div>
        </div>

        {comparisonRows.length > 0 ? (
          <div className="qf-activity__comparison" data-testid="qf-activity-selection-comparison">
            <h4>Before / after</h4>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Published selection</th>
                  <th>Customer selection</th>
                  <th>Price delta</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, idx) => (
                  <tr
                    key={`${row.category}-${row.customerSelection}-${idx}`}
                    data-testid="qf-activity-comparison-row"
                  >
                    <td>
                      {row.room ? `${row.room} · ` : ""}
                      {row.category || "Selection"}
                    </td>
                    <td>{row.publishedSelection || "—"}</td>
                    <td>{row.customerSelection || "—"}</td>
                    <td>{deltaMoney(row.priceDelta)}</td>
                    <td>{row.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {pricedRooms.length > 0 ? (
          <div className="qf-activity__priced-rooms" data-testid="qf-activity-priced-rooms">
            <h4>Current customer choices</h4>
            {pricedRooms.map((room) => (
              <div
                key={room.roomKey || room.roomName || "room"}
                className="qf-activity__room"
                data-testid="qf-activity-selection-room"
              >
                <strong>{room.roomName || room.roomKey || "Room"}</strong>
                <ul>
                  {room.material?.label ? (
                    <li data-testid="qf-activity-selection-material">
                      Material: {room.material.label}
                      {room.material.group ? ` (${room.material.group})` : ""}
                    </li>
                  ) : null}
                  {room.edge?.label ? (
                    <li data-testid="qf-activity-selection-edge">Edge: {room.edge.label}</li>
                  ) : null}
                  {room.backsplash?.label ? <li>Backsplash: {room.backsplash.label}</li> : null}
                  {room.sink?.label ? <li>Sink: {room.sink.label}</li> : null}
                  {room.faucet?.label ? <li>Faucet: {room.faucet.label}</li> : null}
                  {(room.accessories || []).map((a, i) =>
                    a.label ? (
                      <li key={`acc-${i}`}>
                        Accessory: {a.label}
                        {Number(a.quantity) > 1 ? ` ×${a.quantity}` : ""}
                      </li>
                    ) : null
                  )}
                  {(room.specialty || []).map((s, i) =>
                    s.label ? (
                      <li key={`spec-${i}`}>
                        Specialty: {s.label}
                        {Number(s.quantity) > 1 ? ` ×${s.quantity}` : ""}
                      </li>
                    ) : null
                  )}
                  {room.notes ? <li>Customer note: {room.notes}</li> : null}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>

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
