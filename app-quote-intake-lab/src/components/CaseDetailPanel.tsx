import type { QuoteIntakeAttachment, QuoteIntakeCase, QuoteIntakeRepository } from "../domain/types";
import { caseValueProvenance, provenanceLabel } from "../classification/provenance.mjs";
import {
  caseTitle,
  formatConfidenceForCase,
  formatReceived,
  formatSfForCase,
  labelPriority,
  labelStatus,
  missingFieldLabel
} from "../utils/format";
import ClassificationWorkspace from "./classification/ClassificationWorkspace";
import DisabledFutureActions from "./DisabledFutureActions";
import TakeoffCaseEntry from "./takeoff/TakeoffCaseEntry";

type Props = {
  caseItem: QuoteIntakeCase | null;
  onClose: () => void;
  onDownloadAttachment?: (caseId: string, attachment: QuoteIntakeAttachment) => Promise<void>;
  repo?: QuoteIntakeRepository;
  actorLabel?: string;
  onCaseMutated?: () => void;
  onOpenTakeoffReview?: (caseId: string) => void;
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

function isSafePreviewType(contentType: string) {
  const t = String(contentType || "").toLowerCase();
  return t.startsWith("image/") || t === "application/pdf";
}

export default function CaseDetailPanel({
  caseItem,
  onClose,
  onDownloadAttachment,
  repo,
  actorLabel = "Lab Estimator (fixture)",
  onCaseMutated,
  onOpenTakeoffReview
}: Props) {
  if (!caseItem) return null;

  const c = caseItem;
  const imported = c.dataSource === "imported";
  const meta = c.importMeta;

  return (
    <aside className="qil-detail" aria-label={`Case detail ${c.id}`}>
      <header className="qil-detail-header">
        <div className="qil-detail-header-text">
          <p className="qil-eyebrow">
            {c.id}
            {imported ? <span className="qil-source-pill">Imported</span> : <span className="qil-source-pill is-fixture">Fixture</span>}
          </p>
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
            {meta?.to?.length ? (
              <div>
                <dt>To</dt>
                <dd>{meta.to.map((a) => a.email).join(", ")}</dd>
              </div>
            ) : null}
            {meta?.cc?.length ? (
              <div>
                <dt>CC</dt>
                <dd>{meta.cc.map((a) => a.email).join(", ")}</dd>
              </div>
            ) : null}
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
            {meta ? (
              <div>
                <dt>Import source</dt>
                <dd>
                  {meta.sourceType}
                  {meta.originalFilename ? ` · ${meta.originalFilename}` : ""}
                  {meta.messageId ? ` · ${meta.messageId}` : " · no Message-ID"}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Next action</dt>
              <dd>{c.nextAction ?? "Inspect case"}</dd>
            </div>
          </dl>
          {imported && meta?.textBody != null ? (
            <pre className="qil-body-pre">{meta.textBody || "(empty body)"}</pre>
          ) : (
            <blockquote className="qil-excerpt">{c.emailExcerpt}</blockquote>
          )}
          {meta?.parserWarnings?.length ? (
            <div className="qil-import-warnings compact">
              <strong>Import warnings</strong>
              <ul>
                {meta.parserWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="qil-detail-block">
          <h3>Attachments</h3>
          {imported ? (
            <p className="qil-cell-meta" style={{ marginBottom: "0.5rem" }}>
              Stored only in this browser (IndexedDB). Active content is not executed.
            </p>
          ) : null}
          <ul className="qil-attach-list">
            {c.attachments.map((a) => (
              <li key={a.id}>
                <span>{a.filename}</span>
                <small>
                  {a.contentType}
                  {a.sizeBytes != null ? ` · ${a.sizeBytes} bytes` : ""}
                  {a.contentHash ? ` · sha256:${a.contentHash.slice(0, 12)}…` : ""}
                  {a.simulated ? " · simulated" : ""}
                  {a.localOnly ? " · local only" : ""}
                </small>
                {imported && onDownloadAttachment && isSafePreviewType(a.contentType) ? (
                  <button
                    type="button"
                    className="qil-btn-ghost qil-att-btn"
                    onClick={() => void onDownloadAttachment(c.id, a)}
                  >
                    Open local {a.contentType.startsWith("image/") ? "image" : "PDF"}
                  </button>
                ) : null}
                {imported && onDownloadAttachment && !isSafePreviewType(a.contentType) ? (
                  <button
                    type="button"
                    className="qil-btn-ghost qil-att-btn"
                    onClick={() => void onDownloadAttachment(c.id, a)}
                  >
                    Download locally
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {repo ? (
          <ClassificationWorkspace
            caseItem={c}
            repo={repo}
            actorLabel={actorLabel}
            onCaseMutated={onCaseMutated ?? (() => undefined)}
          />
        ) : null}

        {repo && onOpenTakeoffReview ? (
          <TakeoffCaseEntry
            caseItem={c}
            repo={repo}
            onOpenTakeoffReview={() => onOpenTakeoffReview(c.id)}
          />
        ) : null}

        <section className="qil-detail-block">
          <h3>Case field summary</h3>
          {imported && !c.latestClassificationRunId ? (
            <p className="qil-cell-meta" style={{ marginBottom: "0.55rem" }}>
              Run simulated classification above to populate extracted fields. Unknown stays unknown until evidence exists.
            </p>
          ) : null}
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
              <dt>Proposed SF</dt>
              <dd>{formatSfForCase(c)}</dd>
            </div>
            <div>
              <dt>Sink cutouts</dt>
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
            <p className="qil-cell-meta">
              {imported ? "No missing flags yet (classification not run)." : "No missing fields flagged."}
            </p>
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
              <dt>AI confidence</dt>
              <dd>{formatConfidenceForCase(c)}</dd>
            </div>
            <div>
              <dt>Value provenance</dt>
              <dd>{provenanceLabel(caseValueProvenance(c))}</dd>
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
