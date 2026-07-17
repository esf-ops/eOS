import React from "react";
import type {
  QuoteIntakeAuditEventDto,
  QuoteIntakeCaseDto
} from "../lib/quoteIntakeTypes";
import {
  attachmentIsSupportedPdf,
  attachmentRetrievalLabel,
  attachmentSupportLabel,
  caseAttachmentStatusLabel,
  caseCustomerProjectLabel,
  caseReceivedAt,
  caseSenderLabel,
  caseSupportedPdfLabel,
  formatAge,
  formatBytes,
  formatReceivedAt,
  safeText,
  stripHtmlToText
} from "../lib/quoteIntakeFormat.mjs";
import {
  labelQuoteIntakePriority,
  labelQuoteIntakeStatus,
  labelReasonCode
} from "../lib/quoteIntakeStatusLabels.mjs";
import { sanitizeMetadataForDisplay } from "../lib/quoteIntakeSanitize.mjs";

type Props = {
  caseRow: QuoteIntakeCaseDto | null;
  auditEvents: QuoteIntakeAuditEventDto[];
  loadingDetail: boolean;
  detailError: string | null;
  onClose: () => void;
  onOpenEstimate: (caseId: string) => void;
};

function SafeLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="eq-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Case detail panel — text only; Open Estimate routes to placeholder workspace. */
export default function EstimateQueueCaseDetail({
  caseRow,
  auditEvents,
  loadingDetail,
  detailError,
  onClose,
  onOpenEstimate
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
  const missing = (caseRow.missingInformation ?? []).map(String).filter(Boolean);
  const manual = (caseRow.manualReviewReasons ?? []).map(String).filter(Boolean);

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
        <SafeLine label="Attachments" value={caseAttachmentStatusLabel(caseRow)} />
        <SafeLine label="Supported PDF" value={caseSupportedPdfLabel(caseRow)} />
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
          <ul className="eq-list eq-attachment-list" data-testid="eq-attachment-list">
            {(caseRow.attachments ?? []).map((a) => {
              const supported = attachmentIsSupportedPdf(a);
              return (
                <li key={a.id} className="eq-attachment-row">
                  <div>
                    <strong>{safeText(a.safeFilename, "Unnamed file")}</strong>
                    <span className="eq-muted">
                      {" "}
                      · {safeText(a.mimeType, "unknown type")} · {formatBytes(a.sizeBytes)}
                    </span>
                  </div>
                  <div className="eq-attachment-meta">
                    <span
                      className={
                        supported ? "eq-badge eq-badge--ok" : "eq-badge eq-badge--warn"
                      }
                    >
                      {attachmentSupportLabel(a)}
                    </span>
                    <span className="eq-muted"> · {attachmentRetrievalLabel(a)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="eq-footnote">
          Provider identifiers are never shown. Plan bytes are retrieved and validated by the Brain
          when you open the estimate.
        </p>
      </section>

      {missing.length || manual.length ? (
        <section className="eq-detail-section">
          <h3>Missing information / review reasons</h3>
          <ul className="eq-list">
            {[...manual, ...missing].map((r) => (
              <li key={r}>{labelReasonCode(r)}</li>
            ))}
          </ul>
        </section>
      ) : null}

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
                  <span className="eq-muted"> · {safeText(ev.actorType)}</span>
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

      <section className="eq-detail-section eq-detail-actions" aria-label="Estimate actions">
        <h3>Actions</h3>
        <p className="eq-muted">
          Open Estimate opens a placeholder workspace for this case. Takeoff, pricing, and publishing
          are not part of this milestone.
        </p>
        <div className="eq-action-row">
          <button
            type="button"
            className="eq-btn-primary"
            data-testid="eq-open-estimate"
            onClick={() => onOpenEstimate(caseRow.id)}
          >
            Open Estimate
          </button>
        </div>
      </section>
    </aside>
  );
}
