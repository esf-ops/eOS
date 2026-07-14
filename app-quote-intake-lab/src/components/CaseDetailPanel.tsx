import type { QuoteIntakeCase } from "../domain/types";
import {
  caseTitle,
  formatConfidence,
  formatReceived,
  formatSf,
  labelPriority,
  labelStatus,
  missingFieldLabel
} from "../utils/format";
import DisabledFutureActions from "./DisabledFutureActions";

type Props = {
  caseItem: QuoteIntakeCase | null;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function CaseDetailPanel({ caseItem, onClose }: Props) {
  if (!caseItem) return null;

  const c = caseItem;

  return (
    <aside className="qil-detail" aria-label={`Case detail ${c.id}`}>
      <header className="qil-detail-header">
        <div className="qil-detail-header-text">
          <p className="qil-eyebrow">{c.id}</p>
          <h2>{caseTitle(c)}</h2>
          <p className="qil-detail-sub">
            <span className={`qil-pill qil-pill-status status-${c.status}`}>{labelStatus(c.status)}</span>
            <span className={`qil-pill qil-pill-priority priority-${c.priority}`}>{labelPriority(c.priority)}</span>
            {c.relatedCaseId ? <span className="qil-cell-meta">Revision of {c.relatedCaseId}</span> : null}
          </p>
        </div>
        <button
          type="button"
          className="qil-close-btn"
          onClick={onClose}
          aria-label="Close case detail"
          title="Close (Esc)"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="qil-detail-scroll">
        <section className="qil-detail-block">
          <h3>Original request</h3>
          <dl className="qil-dl">
            <div>
              <dt>Subject</dt>
              <dd>{c.emailSubject}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>
                {c.senderName} &lt;{c.senderEmail}&gt;
              </dd>
            </div>
            <div>
              <dt>Mailbox</dt>
              <dd>{c.recipientMailbox}</dd>
            </div>
            <div>
              <dt>Salesperson</dt>
              <dd>{c.assignedSalesperson}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>
                {formatReceived(c.receivedAt)} · age {c.elapsedTurnaroundLabel}
              </dd>
            </div>
            <div>
              <dt>Next action</dt>
              <dd>{c.nextAction ?? "Inspect case and await Phase 2+ workflow"}</dd>
            </div>
          </dl>
          <blockquote className="qil-excerpt">{c.emailExcerpt}</blockquote>
        </section>

        <section className="qil-detail-block">
          <h3>Attachments</h3>
          <ul className="qil-attach-list">
            {c.attachments.map((a) => (
              <li key={a.id}>
                <span>{a.filename}</span>
                <small>
                  {a.contentType}
                  {a.simulated ? " · simulated" : ""}
                </small>
              </li>
            ))}
          </ul>
        </section>

        <section className="qil-detail-block">
          <h3>Extracted requirements</h3>
          <dl className="qil-dl qil-dl-grid">
            <div>
              <dt>Customer / account</dt>
              <dd>{c.customerAccount}</dd>
            </div>
            <div>
              <dt>Project address</dt>
              <dd>{c.projectAddress}</dd>
            </div>
            <div>
              <dt>Requested color</dt>
              <dd>{c.requestedColor ?? "—"}</dd>
            </div>
            <div>
              <dt>Price group</dt>
              <dd>{c.resolvedPriceGroup ?? "Unresolved"}</dd>
            </div>
            <div>
              <dt>Proposed SF*</dt>
              <dd>{formatSf(c.proposedSquareFootage)}</dd>
            </div>
            <div>
              <dt>Sink cutouts*</dt>
              <dd>{c.sinkCutoutCount ?? "—"}</dd>
            </div>
            <div>
              <dt>Edge profile</dt>
              <dd>{c.edgeProfile ?? "—"}</dd>
            </div>
            <div>
              <dt>Backsplash</dt>
              <dd>{c.backsplashScope ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="qil-detail-block">
          <h3>Missing information</h3>
          {c.missingInformation.length ? (
            <ul className="qil-missing-list">
              {c.missingInformation.map((m) => (
                <li key={m}>{missingFieldLabel(m)}</li>
              ))}
            </ul>
          ) : (
            <p className="qil-cell-meta">No missing fields flagged.</p>
          )}
        </section>

        <section className="qil-detail-block">
          <h3>Takeoff / confidence</h3>
          <dl className="qil-dl qil-dl-grid">
            <div>
              <dt>Takeoff state</dt>
              <dd>{c.takeoffState}</dd>
            </div>
            <div>
              <dt>AI confidence*</dt>
              <dd>{formatConfidence(c.aiConfidence)}</dd>
            </div>
            <div>
              <dt>Quote preview state</dt>
              <dd>{c.quotePreviewState}</dd>
            </div>
            <div>
              <dt>Estimator</dt>
              <dd>{c.assignedEstimator ?? "Unassigned"}</dd>
            </div>
          </dl>
          <div className="qil-chip-row">
            {c.simulatedLabels.map((label) => (
              <span key={label} className="qil-sim-chip">
                {label}
              </span>
            ))}
          </div>
        </section>

        <section className="qil-detail-block">
          <h3>Internal notes</h3>
          <p>{c.internalNotes}</p>
        </section>

        <section className="qil-detail-block">
          <h3>Audit timeline</h3>
          <ol className="qil-timeline">
            {[...c.events]
              .slice()
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
              .map((ev) => (
                <li key={ev.id}>
                  <div className="qil-timeline-time">{formatReceived(ev.at)}</div>
                  <div className="qil-timeline-body">
                    <strong>{ev.summary}</strong>
                    <span>
                      {ev.actorLabel} · {ev.eventType}
                    </span>
                  </div>
                </li>
              ))}
          </ol>
        </section>

        <DisabledFutureActions />
      </div>
    </aside>
  );
}
