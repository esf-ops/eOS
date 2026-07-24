/**
 * Compact publication summary for reopened published Studio estimates.
 * Open/copy use the recovered staff customer URL only — never mutate publications.
 */
import React, { useState } from "react";

export type PublicationSummary = {
  state?: string | null;
  active?: boolean;
  historical?: boolean;
  publicationId?: string | null;
  estimateId?: string | null;
  revision?: number | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  customerActivityState?: string | null;
  customerActivityLabel?: string | null;
  customerUrlAvailable?: boolean;
  customerUrl?: string | null;
  reviewRequestOpen?: boolean;
  reviewRequestId?: string | null;
  statusLabel?: string | null;
  linkStatus?: string | null;
};

type Props = {
  publication: PublicationSummary | null;
  refreshError?: string | null;
  onOpenCustomerView?: () => void;
  onCopyCustomerLink?: () => void;
  onViewPublicationDetails?: () => void;
  onRefreshStatus?: () => void;
  onReplacePublication?: () => void;
  onRevokePublication?: () => void;
  onReviewCustomerRequest?: () => void;
  busy?: boolean;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  try {
    return new Date(t).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch {
    return String(iso);
  }
}

export default function EstimatePublicationSummary({
  publication,
  refreshError = null,
  onOpenCustomerView,
  onCopyCustomerLink,
  onViewPublicationDetails,
  onRefreshStatus,
  onReplacePublication,
  onRevokePublication,
  onReviewCustomerRequest,
  busy = false
}: Props) {
  const [copied, setCopied] = useState(false);
  if (!publication) return null;
  if (!publication.active && !publication.historical && publication.state === "not_published") {
    return null;
  }

  const title = publication.statusLabel || "Publication";
  const showLinkActions =
    publication.active === true &&
    publication.customerUrlAvailable === true &&
    Boolean(publication.customerUrl);

  async function copyLink() {
    const url = publication.customerUrl;
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt("Copy customer link", url);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
      onCopyCustomerLink?.();
    } catch {
      window.prompt("Copy customer link", url);
      onCopyCustomerLink?.();
    }
  }

  return (
    <section
      className="eq-publication-summary"
      data-testid="eq-publication-summary"
      aria-label="Digital Estimate publication"
    >
      <div className="eq-publication-summary-head">
        <h3 data-testid="eq-publication-summary-title">{title}</h3>
        {publication.historical && !publication.active ? (
          <p className="eq-footnote" data-testid="eq-publication-historical">
            Previous publication — remains frozen until explicitly replaced or revoked.
          </p>
        ) : null}
      </div>

      {refreshError ? (
        <div className="eq-state eq-state--warn" role="status" data-testid="eq-publication-refresh-error">
          {refreshError}
        </div>
      ) : null}

      <dl className="eq-status-dl" data-testid="eq-publication-summary-meta">
        <div>
          <dt>Published</dt>
          <dd>{formatDate(publication.publishedAt)}</dd>
        </div>
        <div>
          <dt>Estimate revision</dt>
          <dd>{publication.revision ?? "—"}</dd>
        </div>
        <div>
          <dt>Customer activity</dt>
          <dd data-testid="eq-publication-activity">
            {publication.customerActivityLabel || "—"}
          </dd>
        </div>
        <div>
          <dt>Valid through</dt>
          <dd>{formatDate(publication.expiresAt)}</dd>
        </div>
      </dl>

      <div className="eq-action-row">
        {showLinkActions ? (
          <>
            <button
              type="button"
              className="eq-btn-primary"
              data-testid="eq-open-customer-view"
              disabled={busy}
              onClick={() => {
                if (publication.customerUrl) {
                  window.open(publication.customerUrl, "_blank", "noopener,noreferrer");
                }
                onOpenCustomerView?.();
              }}
            >
              Open customer view
            </button>
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-copy-customer-link"
              disabled={busy}
              onClick={() => void copyLink()}
            >
              {copied ? "Customer link copied." : "Copy customer link"}
            </button>
          </>
        ) : publication.active ? (
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="eq-publication-refresh-status"
            disabled={busy}
            onClick={() => onRefreshStatus?.()}
          >
            Refresh publication status
          </button>
        ) : null}

        {publication.reviewRequestOpen ? (
          <button
            type="button"
            className="eq-btn-primary"
            data-testid="eq-review-customer-request"
            disabled={busy}
            onClick={() => onReviewCustomerRequest?.()}
          >
            Review customer request
          </button>
        ) : null}

        <button
          type="button"
          className="eq-btn-ghost"
          data-testid="eq-view-publication-details"
          disabled={busy}
          onClick={() => onViewPublicationDetails?.()}
        >
          View publication details
        </button>
      </div>

      {publication.active ? (
        <div className="eq-action-row eq-publication-secondary">
          <button
            type="button"
            className="eq-btn-ghost"
            data-testid="eq-replace-publication"
            disabled={busy}
            onClick={() => onReplacePublication?.()}
          >
            Replace publication
          </button>
          <button
            type="button"
            className="eq-btn-ghost"
            data-testid="eq-revoke-publication"
            disabled={busy}
            onClick={() => onRevokePublication?.()}
          >
            Revoke publication
          </button>
        </div>
      ) : null}
    </section>
  );
}
