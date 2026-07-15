import React from "react";
import type {
  QuoteIntakeAuditEventDto,
  QuoteIntakeCaseDto,
  QuoteIntakeTakeoffLinkDto
} from "../../lib/quoteIntakeTypes";
import {
  caseCustomerProjectLabel,
  caseEligibilityLabel,
  caseEstimatorLabel,
  caseReceivedAt,
  caseSenderLabel,
  formatAge,
  formatBytes,
  formatReceivedAt,
  safeText,
  stripHtmlToText
} from "../../lib/quoteIntakeFormat.mjs";
import {
  labelQuoteIntakePriority,
  labelQuoteIntakeStatus,
  labelReasonCode
} from "../../lib/quoteIntakeStatusLabels.mjs";
import { sanitizeMetadataForDisplay } from "../../lib/quoteIntakeSanitize.mjs";

type Props = {
  caseRow: QuoteIntakeCaseDto | null;
  auditEvents: QuoteIntakeAuditEventDto[];
  takeoffLinks: QuoteIntakeTakeoffLinkDto[];
  loadingDetail: boolean;
  detailError: string | null;
  onClose: () => void;
  onOpenLinkedTakeoff?: (takeoffJobId: string) => void;
};

function SafeLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="eq-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Renders authorized case fields as text only — never HTML. */
export default function EstimatorQueueCaseDetail({
  caseRow,
  auditEvents,
  takeoffLinks,
  loadingDetail,
  detailError,
  onClose,
  onOpenLinkedTakeoff
}: Props) {
  if (loadingDetail) {
    return (
      <aside className="eq-detail" aria-label="Case detail" aria-busy="true">
        <p className="eq-muted">Loading case…</p>
      </aside>
    );
  }

  if (detailError) {
    return (
      <aside className="eq-detail" aria-label="Case detail">
        <button type="button" className="eq-btn-ghost" onClick={onClose}>
          Close
        </button>
        <p className="eq-error" role="alert">
          {detailError}
        </p>
      </aside>
    );
  }

  if (!caseRow) {
    return (
      <aside className="eq-detail eq-detail--empty" aria-label="Case detail">
        <p className="eq-muted">Select a case to inspect details.</p>
      </aside>
    );
  }

  const received = caseReceivedAt(caseRow);
  const subject = stripHtmlToText(caseRow.subject);
  const body = stripHtmlToText(caseRow.bodyPreview ?? caseRow.bodyText);
  const reasons = [
    ...(caseRow.manualReviewReasons ?? []).map(String),
    ...(caseRow.missingInformation ?? []).map(String)
  ];

  return (
    <aside className="eq-detail" aria-label="Case detail">
      <div className="eq-detail-head">
        <div>
          <h2 className="eq-detail-title">{caseCustomerProjectLabel(caseRow)}</h2>
          <p className="eq-muted">
            <code>{caseRow.id}</code>
          </p>
        </div>
        <button type="button" className="eq-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <dl className="eq-detail-grid">
        <SafeLine label="Status" value={labelQuoteIntakeStatus(caseRow.status)} />
        <SafeLine label="Priority" value={labelQuoteIntakePriority(caseRow.priority)} />
        <SafeLine label="Source" value={safeText(caseRow.sourceType, "api")} />
        <SafeLine label="Received" value={`${formatReceivedAt(received)} · ${formatAge(received)}`} />
        <SafeLine label="Sender" value={caseSenderLabel(caseRow)} />
        <SafeLine label="Estimator" value={caseEstimatorLabel(caseRow)} />
        <SafeLine label="Elite 100 / eligibility" value={caseEligibilityLabel(caseRow)} />
      </dl>

      {subject ? (
        <section className="eq-detail-section">
          <h3>Subject</h3>
          <p className="eq-pre">{subject}</p>
        </section>
      ) : null}

      {body ? (
        <section className="eq-detail-section">
          <h3>Body preview</h3>
          <p className="eq-pre">{body}</p>
        </section>
      ) : (
        <section className="eq-detail-section">
          <h3>Body preview</h3>
          <p className="eq-muted">Not available (privacy-preserving fingerprints only).</p>
        </section>
      )}

      <section className="eq-detail-section">
        <h3>Attachments</h3>
        {(caseRow.attachments ?? []).length === 0 ? (
          <p className="eq-muted">No attachment metadata.</p>
        ) : (
          <ul className="eq-list">
            {(caseRow.attachments ?? []).map((a) => (
              <li key={a.id}>
                <strong>{safeText(a.safeFilename, "Unnamed file")}</strong>
                <span className="eq-muted">
                  {" "}
                  · {safeText(a.mimeType)} · {formatBytes(a.sizeBytes)} · sha256{" "}
                  {a.sha256.slice(0, 12)}…
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="eq-footnote">Metadata only — download is not available in this phase.</p>
      </section>

      {reasons.length ? (
        <section className="eq-detail-section">
          <h3>Manual review / missing information</h3>
          <ul className="eq-list">
            {reasons.map((r) => (
              <li key={r}>{labelReasonCode(r)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="eq-detail-section">
        <h3>Takeoff links</h3>
        {takeoffLinks.length === 0 ? (
          <p className="eq-muted">No structure-only Takeoff links yet.</p>
        ) : (
          <ul className="eq-list">
            {takeoffLinks.map((link) => (
              <li key={link.id}>
                <div>
                  Status: <strong>{safeText(link.relationshipStatus)}</strong> · Mode:{" "}
                  {safeText(link.initiationMode)}
                </div>
                <div className="eq-muted">
                  Job: {link.takeoffJobId ? <code>{link.takeoffJobId}</code> : "Not linked yet"}
                </div>
                {link.takeoffJobId && onOpenLinkedTakeoff ? (
                  <button
                    type="button"
                    className="eq-btn-secondary eq-btn-small"
                    onClick={() => onOpenLinkedTakeoff(link.takeoffJobId!)}
                  >
                    Open linked Takeoff job
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="eq-detail-section">
        <h3>Audit timeline</h3>
        {auditEvents.length === 0 ? (
          <p className="eq-muted">No audit events.</p>
        ) : (
          <ol className="eq-timeline">
            {auditEvents.map((ev) => (
              <li key={ev.id}>
                <div className="eq-timeline-time">{formatReceivedAt(ev.createdAt)}</div>
                <div>
                  <strong>{safeText(ev.eventType)}</strong>
                  <span className="eq-muted">
                    {" "}
                    · {safeText(ev.actorType)}
                    {ev.actorUserId ? ` · ${String(ev.actorUserId).slice(0, 8)}…` : ""}
                  </span>
                </div>
                {ev.metadata && Object.keys(ev.metadata).length ? (
                  <pre className="eq-pre eq-pre--compact">
                    {JSON.stringify(sanitizeMetadataForDisplay(ev.metadata), null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="eq-detail-section eq-detail-actions" aria-label="Future actions">
        <h3>Actions</h3>
        <p className="eq-muted">Preparation only in this phase — approval and Takeoff stay estimator-owned.</p>
        <div className="eq-action-row">
          <button type="button" className="eq-btn-secondary" disabled title="Phase 6P.6+">
            Start Takeoff (later phase)
          </button>
          <button type="button" className="eq-btn-secondary" disabled title="Not in 6P.3">
            Import to Internal Estimate (disabled)
          </button>
          <button type="button" className="eq-btn-secondary" disabled title="Not in 6P.3">
            Send customer email (disabled)
          </button>
        </div>
      </section>
    </aside>
  );
}
