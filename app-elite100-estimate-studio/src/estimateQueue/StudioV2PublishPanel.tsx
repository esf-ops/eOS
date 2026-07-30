/**
 * Studio V2 Slice F — strict Digital Estimate publish panel.
 * Calls POST /api/elite100-studio-v2/approved/:estimateId/publish only.
 * Does not import ActiveReviewPublishPanel or EstimateDigitalEstimatePanel.
 * Does not approve, calculate, or use V1 simplified publish orchestration.
 *
 * When an active publication already exists, exposes Republish / Repair so
 * estimators can refresh the interactive configuration envelope (link-only).
 */
import React, { useState } from "react";

export type StudioV2PublishBlocker = {
  code?: string | null;
  message?: string;
};

export type StudioV2PublishReadiness = {
  allowed?: boolean;
  code?: string | null;
  message?: string | null;
  blockers?: StudioV2PublishBlocker[];
  approved?: boolean;
  published?: boolean;
};

export type StudioV2PublicationView = {
  publicationId?: string | null;
  status?: string | null;
  active?: boolean;
  customerUrl?: string | null;
  publishedAt?: string | null;
  linkStatus?: string | null;
};

type Props = {
  estimateId?: string | null;
  approved: boolean;
  readiness?: StudioV2PublishReadiness | null;
  publicationSummary?: {
    statusLabel?: string | null;
    state?: string | null;
    customerUrl?: string | null;
    active?: boolean;
  } | null;
  activePublication?: StudioV2PublicationView | null;
  historicalPublications?: StudioV2PublicationView[];
  customerUrl?: string | null;
  busy: boolean;
  error?: string | null;
  notice?: string | null;
  onPublish: (args: { confirmed: true }) => void | Promise<void>;
};

export default function StudioV2PublishPanel(props: Props) {
  const {
    estimateId,
    approved,
    readiness,
    publicationSummary,
    activePublication,
    historicalPublications = [],
    customerUrl,
    busy,
    error,
    notice,
    onPublish
  } = props;

  const [confirmed, setConfirmed] = useState(false);

  const published = Boolean(
    activePublication?.customerUrl ||
      activePublication?.publicationId ||
      publicationSummary?.active ||
      customerUrl
  );

  const link =
    customerUrl ||
    activePublication?.customerUrl ||
    publicationSummary?.customerUrl ||
    null;

  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const backendAllowed = readiness?.allowed === true;
  const canInitialPublish =
    Boolean(estimateId) &&
    approved &&
    !published &&
    backendAllowed &&
    confirmed &&
    !busy;
  // Customer-viewed / already-published must not hide repair — reuse same strict endpoint.
  const canRepair =
    Boolean(estimateId) && approved && published && confirmed && !busy;

  return (
    <section className="studio-v2-panel" data-testid="studio-v2-publish-panel">
      <div className="studio-v2-panel__head">
        <h2>Digital Estimate</h2>
        {approved && !published ? (
          <button
            type="button"
            className="eq-btn-primary"
            disabled={!canInitialPublish}
            onClick={() => void onPublish({ confirmed: true })}
            data-testid="studio-v2-publish"
          >
            {busy ? "Publishing…" : "Publish Digital Estimate"}
          </button>
        ) : null}
        {approved && published ? (
          <button
            type="button"
            className="eq-btn-primary"
            disabled={!canRepair}
            onClick={() => void onPublish({ confirmed: true })}
            data-testid="studio-v2-republish"
          >
            {busy ? "Refreshing…" : "Republish / Repair Digital Estimate"}
          </button>
        ) : null}
      </div>

      <p className="studio-v2-scope-editor__hint">
        Publish attaches the approved snapshot to Digital Estimate. Approval is a separate step.
        Slice F is link-only — no email delivery from this panel.
      </p>

      {!approved ? (
        <p className="studio-v2-approve-required" data-testid="studio-v2-approve-required">
          Approve required before publish.
        </p>
      ) : null}

      <dl className="studio-v2-dl">
        <div>
          <dt>Publication status</dt>
          <dd data-testid="studio-v2-publication-status">
            {publicationSummary?.statusLabel ||
              (published ? "Published" : approved ? "Approved — not published" : "Not published")}
          </dd>
        </div>
        <div>
          <dt>Active link</dt>
          <dd>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                data-testid="studio-v2-customer-url"
              >
                Open customer link
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        {activePublication?.publishedAt ? (
          <div>
            <dt>Published at</dt>
            <dd data-testid="studio-v2-published-at">{activePublication.publishedAt}</dd>
          </div>
        ) : null}
      </dl>

      {approved && !published ? (
        <>
          {blockers.length ? (
            <ul className="studio-v2-warnings" data-testid="studio-v2-publish-blockers">
              {blockers.map((b, i) => (
                <li key={`${b.code || "b"}-${i}`}>{b.message || "Publish blocked"}</li>
              ))}
            </ul>
          ) : (
            <p className="studio-v2-notice" data-testid="studio-v2-publish-ready">
              Approved snapshot is ready to publish (link-only).
            </p>
          )}
          <label className="studio-v2-approval-confirm" data-testid="studio-v2-publish-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !backendAllowed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I confirm this approved estimate is ready to publish to Digital Estimate.</span>
          </label>
        </>
      ) : null}

      {approved && published ? (
        <div className="studio-v2-republish-block" data-testid="studio-v2-republish-block">
          <p className="studio-v2-notice" data-testid="studio-v2-published-notice">
            Active Digital Estimate publication is available.
          </p>
          <p className="studio-v2-scope-editor__hint" data-testid="studio-v2-republish-hint">
            Refreshes the customer link configuration. Does not email the customer.
          </p>
          <label className="studio-v2-approval-confirm" data-testid="studio-v2-republish-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I confirm I want to refresh the customer Digital Estimate configuration (link-only, no
              email).
            </span>
          </label>
        </div>
      ) : null}

      {historicalPublications.length ? (
        <div className="studio-v2-options-section" data-testid="studio-v2-historical-publications">
          <h3>Historical publications</h3>
          <ul className="studio-v2-warnings">
            {historicalPublications.map((p, i) => (
              <li key={p.publicationId || `hist-${i}`}>
                {p.publicationId || "Publication"} · {p.status || "historical"}
                {p.publishedAt ? ` · ${p.publishedAt}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <div className="error-box" data-testid="studio-v2-publish-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="studio-v2-notice" data-testid="studio-v2-publish-notice">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
