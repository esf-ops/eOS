import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, ApiError, isAbortError, isTransientHttpError, transientFailureMessage } from "../lib/api";

const PUBLISH_CLIENT_TIMEOUT_MS = 55_000;

type PublishUiState = "idle" | "publishing" | "published" | "failed";

export type ActiveReadinessBlocker = { code?: string; message?: string };
export type ActiveReadiness = { eligible: boolean; blockers: ActiveReadinessBlocker[] };

type ActivePublicationRow = {
  id?: string;
  status?: string;
  publishedAt?: string | null;
  customerUrl?: string | null;
  linkStatus?: string | null;
};

type Props = {
  authToken: string;
  estimateId: string;
  estimateRevision?: number | null;
  /**
   * Server-computed active-v4 readiness (studioActiveReviewReadiness.
   * deriveActiveReviewPublishReadiness, run inside studioEstimateService.
   * safeEstimateView). Display/UX only — this panel never derives its own
   * eligible/blockers. The /simplified-publish endpoint independently
   * re-derives the exact same authority server-side from its own freshly
   * reloaded + freshly recalculated estimate, so a stale prop here can only
   * make the Publish button *more* conservative, never publish something
   * ineligible.
   */
  activeReview: ActiveReadiness | null;
  onBeforePublishFlush?: () => Promise<{ ok: boolean; conflict?: boolean; failed?: boolean }>;
  onEditProjectDetails?: () => void;
  /** Lifted safe publication summary — read-only; never triggers mutations. */
  onPublicationSummary?: (publication: Record<string, unknown> | null) => void;
  onPublicationRefreshError?: (message: string | null) => void;
};

/**
 * Active-v4 Review & Publish panel — the ONLY publish surface mounted for an
 * active (non-historical) Studio estimate. Deliberately minimal: pricing
 * status / v4 pricing summary live in EstimateScopePanel's Review & Publish
 * section above this component; this panel adds exactly the remaining
 * pieces — real warnings/unresolved items surface through `activeReview`,
 * Publish Digital Estimate, the active customer link, and nothing else.
 * None of the legacy publication-configuration or manual commercial-approval
 * controls are mounted here — those are legacy/historical-only
 * (EstimateDigitalEstimatePanel).
 */
export default function ActiveReviewPublishPanel({
  authToken,
  estimateId,
  estimateRevision,
  activeReview,
  onBeforePublishFlush,
  onEditProjectDetails,
  onPublicationSummary,
  onPublicationRefreshError
}: Props) {
  const [busy, setBusy] = useState(false);
  const [publishUiState, setPublishUiState] = useState<PublishUiState>("idle");
  const publishInFlightRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [activePublication, setActivePublication] = useState<ActivePublicationRow | null>(null);
  const [customerUrl, setCustomerUrl] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `studio-arp-${Date.now()}`
  );

  // Reuses the existing Digital Estimate read endpoint purely for current
  // publication/customer-link state — the SAME endpoint the historical panel
  // uses. It is not a second readiness authority: `activeReview` (the actual
  // eligible/blockers used below) always comes from the estimate prop chain
  // (studioEstimateService.safeEstimateView), never from this fetch.
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!estimateId) return;
      try {
        const body = (await apiGet(
          `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/digital-estimate`,
          authToken,
          { signal }
        )) as {
          activePublication?: ActivePublicationRow | null;
          publicationSummary?: Record<string, unknown> | null;
          estimate?: { publication?: Record<string, unknown> | null };
        };
        if (signal?.aborted) return;
        onPublicationSummary?.(body.publicationSummary || body.estimate?.publication || null);
        onPublicationRefreshError?.(null);
        setActivePublication(body.activePublication || null);
        const url = body.activePublication?.customerUrl || null;
        const nextLinkStatus = body.activePublication?.linkStatus || (url ? "active" : null);
        if (nextLinkStatus === "active" && url) {
          setCustomerUrl(url);
          setLinkStatus("active");
        } else {
          setCustomerUrl(null);
          setLinkStatus(nextLinkStatus || (body.activePublication ? "none" : null));
        }
      } catch (e) {
        if (isAbortError(e) || signal?.aborted) return;
        if (isTransientHttpError(e)) {
          onPublicationRefreshError?.(
            "Publication status could not be refreshed. " + transientFailureMessage(e)
          );
          return;
        }
        // Best-effort: Publish itself still works from calculation state alone.
      }
    },
    [authToken, estimateId, onPublicationSummary, onPublicationRefreshError]
  );

  useEffect(() => {
    if (!estimateId) return;
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [estimateId, authToken, load]);

  async function publish() {
    if (publishInFlightRef.current || busy) return;
    publishInFlightRef.current = true;
    setBusy(true);
    setPublishUiState("publishing");
    setActionError(null);
    setActionNotice("Publishing Digital Estimate…");
    try {
      if (onBeforePublishFlush) {
        const flush = await onBeforePublishFlush();
        if (!flush.ok) {
          setPublishUiState("failed");
          setActionNotice(null);
          setActionError(
            flush.conflict
              ? "Another user changed this estimate. Resolve the save conflict before publishing. No customer link was changed."
              : "Save failed. Retry the draft save before publishing. No customer link was changed."
          );
          return;
        }
      }
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/simplified-publish`,
        authToken,
        { confirm: true, idempotencyKey },
        { timeoutMs: PUBLISH_CLIENT_TIMEOUT_MS }
      )) as {
        customerUrl?: string | null;
        publication?: ActivePublicationRow | { publication?: ActivePublicationRow; customerUrl?: string };
      };
      const nestedPub =
        body.publication &&
        typeof body.publication === "object" &&
        "publication" in body.publication
          ? (body.publication as { publication?: ActivePublicationRow; customerUrl?: string })
          : null;
      const customerLink =
        body.customerUrl ||
        nestedPub?.customerUrl ||
        (body.publication as ActivePublicationRow | undefined)?.customerUrl ||
        null;
      if (customerLink) {
        setCustomerUrl(customerLink);
        setLinkStatus("active");
      }
      setPublishUiState("published");
      setActionNotice("Digital Estimate published.");
      await load();
    } catch (e) {
      setPublishUiState("failed");
      setActionNotice(null);
      if (e instanceof ApiError) {
        const errBody =
          e.body && typeof e.body === "object" && e.body !== null
            ? (e.body as Record<string, unknown>)
            : {};
        const serverBlockers = Array.isArray(errBody.blockers)
          ? (errBody.blockers as ActiveReadinessBlocker[])
          : Array.isArray(errBody.blockingReasons)
            ? (errBody.blockingReasons as ActiveReadinessBlocker[])
            : [];
        setActionError(
          serverBlockers[0]?.message ||
            e.message ||
            "Unable to publish the Digital Estimate. No customer link was changed."
        );
      } else if (!isAbortError(e)) {
        setActionError("Unable to publish the Digital Estimate. No customer link was changed.");
      }
    } finally {
      publishInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!customerUrl || linkStatus !== "active") return;
    try {
      await navigator.clipboard.writeText(customerUrl);
      setActionNotice("Customer link copied.");
    } catch {
      setActionError("Unable to copy link");
    }
  }

  const linkReady = Boolean(customerUrl) && linkStatus === "active";
  const publishing = publishUiState === "publishing" || busy;
  // Server-derived only — never computed here. See the Props comment above.
  const eligible = Boolean(activeReview?.eligible);
  const blockers = activeReview?.blockers || [];

  return (
    <section
      className="eq-estimate-section"
      aria-label="Review and Publish"
      data-testid="active-review-publish-panel"
    >
      <div data-testid="eq-arp-root">
        <p className="eq-muted" data-testid="eq-arp-revision">
          Estimate revision {estimateRevision ?? "—"}
        </p>

        <p data-testid="eq-arp-eligibility">
          {eligible ? (
            <strong>Eligible to publish</strong>
          ) : (
            <span className="eq-muted">Blocked — resolve the items below before publish</span>
          )}
        </p>
        {blockers.length ? (
          <ul className="eq-de-blockers" data-testid="eq-arp-blockers">
            {blockers.map((b, i) => (
              <li key={`${b.code || "b"}-${i}`} data-testid={`eq-arp-blocker-${b.code || "unknown"}`}>
                {b.message || b.code}
                {b.code === "project_name_required" ? (
                  <button
                    type="button"
                    className="eq-btn-secondary"
                    data-testid="eq-arp-edit-project-details"
                    onClick={() => onEditProjectDetails?.()}
                  >
                    Edit project details
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="eq-de-status" data-testid="eq-arp-active-status">
          <p>
            Active publication: <strong>{activePublication ? activePublication.status : "none"}</strong>
            {activePublication?.publishedAt ? ` · published ${activePublication.publishedAt}` : ""}
          </p>
          <p data-testid="eq-arp-link-status">
            Customer link: <strong>{linkStatus || (activePublication ? "none" : "none")}</strong>
          </p>
          {customerUrl ? (
            <p className="eq-muted" data-testid="eq-arp-customer-url">
              {customerUrl}
            </p>
          ) : null}
        </div>

        {actionError ? (
          <div className="eq-state eq-state--error" role="alert" data-testid="eq-arp-publish-error">
            {actionError}
          </div>
        ) : null}
        {actionNotice ? (
          <div className="eq-state" role="status" data-testid="eq-arp-publish-status">
            {actionNotice}
          </div>
        ) : null}

        <div className="eq-action-row">
          <button
            type="button"
            className="eq-btn-primary"
            disabled={publishing || !eligible}
            data-testid="eq-publish-digital-estimate"
            onClick={() => void publish()}
          >
            {publishing ? "Publishing…" : customerUrl ? "Re-publish Digital Estimate" : "Publish Digital Estimate"}
          </button>
          <button
            type="button"
            className="eq-btn-secondary"
            disabled={publishing || !linkReady}
            data-testid="eq-copy-customer-link"
            onClick={() => void copyLink()}
          >
            Copy Customer Link
          </button>
          {linkReady ? (
            <a
              className="eq-btn-secondary"
              href={customerUrl!}
              target="_blank"
              rel="noreferrer"
              data-testid="eq-open-customer-preview"
            >
              Open Customer Preview
            </a>
          ) : null}
        </div>

        {linkReady ? (
          <div className="eq-de-stable-link" role="status" data-testid="eq-arp-stable-link">
            <p>
              Customer link is stable and reusable for this active publication. It remains available
              after refresh until replaced or revoked.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
