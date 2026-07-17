import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, ApiError } from "../lib/api";

type ReadinessBlocker = { code?: string; message?: string };
type PublicationRow = {
  id: string;
  status: string;
  publishedAt?: string | null;
  pricingValidThrough?: string | null;
  revisionNumber?: number | null;
  revisionLabel?: string | null;
  revokedAt?: string | null;
  supersededAt?: string | null;
};
type ReviewRequestRow = {
  id: string;
  status: string;
  publicationId?: string;
  requestedAt?: string | null;
  customerNote?: string | null;
  intakeCaseId?: string | null;
  studioEstimateId?: string | null;
};

type Props = {
  authToken: string;
  estimateId: string;
  estimateRevision?: number | null;
  estimateApproved: boolean;
};

/**
 * Digital Estimate section — after Studio estimate approval.
 * Reuses Brain publish / revoke / replace-token lifecycle (no raw token display).
 */
export default function EstimateDigitalEstimatePanel({
  authToken,
  estimateId,
  estimateRevision,
  estimateApproved
}: Props) {
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [eligible, setEligible] = useState(false);
  const [blockers, setBlockers] = useState<ReadinessBlocker[]>([]);
  const [activePublication, setActivePublication] = useState<PublicationRow | null>(null);
  const [publications, setPublications] = useState<PublicationRow[]>([]);
  const [reviewRequests, setReviewRequests] = useState<ReviewRequestRow[]>([]);
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `studio-de-${Date.now()}`
  );

  const [pricingValidThrough, setPricingValidThrough] = useState("");
  const [allowedOptionKeys, setAllowedOptionKeys] = useState<string>("qty-sink");
  const [estimatorNotes, setEstimatorNotes] = useState("");
  const [roomLocked, setRoomLocked] = useState(true);

  const load = useCallback(async () => {
    if (!estimateApproved || !estimateId) return;
    setLoadError(null);
    try {
      const body = (await apiGet(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/digital-estimate`,
        authToken
      )) as {
        readiness?: { eligible?: boolean; blockers?: ReadinessBlocker[]; message?: string };
        activePublication?: PublicationRow | null;
        publications?: PublicationRow[];
        reviewRequests?: ReviewRequestRow[];
      };
      setEligible(Boolean(body.readiness?.eligible));
      setBlockers(Array.isArray(body.readiness?.blockers) ? body.readiness!.blockers! : []);
      setActivePublication(body.activePublication || null);
      setPublications(Array.isArray(body.publications) ? body.publications : []);
      setReviewRequests(Array.isArray(body.reviewRequests) ? body.reviewRequests : []);
      if (body.activePublication?.pricingValidThrough && !pricingValidThrough) {
        setPricingValidThrough(String(body.activePublication.pricingValidThrough).slice(0, 10));
      }
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Unable to load Digital Estimate readiness");
    }
  }, [authToken, estimateApproved, estimateId, pricingValidThrough]);

  useEffect(() => {
    void load();
  }, [load]);

  const configuration = useMemo(
    () => ({
      pricingValidThrough: pricingValidThrough || undefined,
      allowedOptionKeys: allowedOptionKeys
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      estimatorNotes: estimatorNotes || undefined,
      roomLocks: [{ roomKey: "*", locked: roomLocked }]
    }),
    [pricingValidThrough, allowedOptionKeys, estimatorNotes, roomLocked]
  );

  async function publish() {
    setBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/digital-estimate/publish`,
        authToken,
        {
          confirm: true,
          idempotencyKey,
          configuration
        }
      )) as {
        customerUrl?: string | null;
        reused?: boolean;
        staffNotice?: string | null;
        publication?: PublicationRow;
        envelope?: { configured?: boolean; reason?: string; message?: string };
      };
      if (body.customerUrl) {
        setOneTimeLink(body.customerUrl);
        setActionNotice("Digital Estimate published. Copy the customer link now — it will not be shown again after refresh.");
      } else if (body.reused) {
        setActionNotice(
          body.staffNotice ||
            "Publication already exists for this revision. Use Replace Link for a new customer token."
        );
      } else {
        setActionNotice("Published.");
      }
      if (body.envelope && body.envelope.configured === false && body.envelope.message) {
        setActionNotice((prev) =>
          `${prev || "Published."} Configuration envelope: ${body.envelope?.message}`
        );
      }
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Unable to publish Digital Estimate");
    } finally {
      setBusy(false);
    }
  }

  async function replaceLink() {
    if (!activePublication?.id) return;
    setBusy(true);
    setActionError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(activePublication.id)}/replace-token`,
        authToken,
        { confirm: true }
      )) as { customerUrl?: string };
      if (body.customerUrl) {
        setOneTimeLink(body.customerUrl);
        setActionNotice("Replacement customer link created. Copy it now — it will not be recoverable after refresh.");
      }
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Unable to replace link");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!activePublication?.id) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiPost(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(activePublication.id)}/revoke`,
        authToken,
        { confirm: true }
      );
      setOneTimeLink(null);
      setActionNotice("Publication revoked.");
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Unable to revoke publication");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!oneTimeLink) return;
    try {
      await navigator.clipboard.writeText(oneTimeLink);
      if (activePublication?.id) {
        await apiPost(
          `/api/elite100-estimate-studio/publications/${encodeURIComponent(activePublication.id)}/events/link-copied`,
          authToken,
          {}
        ).catch(() => null);
      }
      setActionNotice("Customer link copied.");
    } catch {
      setActionError("Unable to copy link");
    }
  }

  if (!estimateApproved) {
    return null;
  }

  return (
    <section className="eq-estimate-section" aria-label="Digital Estimate" data-testid="eq-digital-estimate">
      <h2>E. Digital Estimate</h2>
      <p className="eq-muted" data-testid="eq-de-revision">
        Estimate revision {estimateRevision ?? "—"}
      </p>

      {loadError ? (
        <div className="eq-state eq-state--error" role="alert">
          {loadError}
        </div>
      ) : null}

      <p data-testid="eq-de-eligibility">
        {eligible ? (
          <strong>Eligible to publish</strong>
        ) : (
          <span className="eq-muted">Blocked — resolve readiness issues before publish</span>
        )}
      </p>
      {blockers.length ? (
        <ul className="eq-de-blockers" data-testid="eq-de-blockers">
          {blockers.map((b, i) => (
            <li key={`${b.code || "b"}-${i}`}>{b.message || b.code}</li>
          ))}
        </ul>
      ) : null}

      <div className="eq-de-status" data-testid="eq-de-active-status">
        <p>
          Active publication:{" "}
          <strong>{activePublication ? activePublication.status : "none"}</strong>
          {activePublication?.publishedAt ? ` · published ${activePublication.publishedAt}` : ""}
        </p>
        {activePublication?.pricingValidThrough ? (
          <p className="eq-muted">Pricing valid through {activePublication.pricingValidThrough}</p>
        ) : null}
      </div>

      {reviewRequests.length ? (
        <div className="eq-de-review-banner" data-testid="eq-de-review-banner" role="status">
          <strong>Active customer review request</strong>
          <ul className="eq-de-review-list">
            {reviewRequests.map((r) => (
              <li key={r.id}>
                {r.status} · {r.requestedAt || "—"}
                {r.customerNote ? ` — ${r.customerNote}` : ""}
                <span className="eq-muted">
                  {" "}
                  (case {r.intakeCaseId?.slice(0, 8) || "—"} · estimate{" "}
                  {r.studioEstimateId?.slice(0, 8) || "—"} · pub {r.publicationId?.slice(0, 8) || "—"})
                </span>
              </li>
            ))}
          </ul>
          <p className="eq-muted">
            Open <strong>Customer review requests</strong> to start review, revise, or republish.
          </p>
        </div>
      ) : (
        <p className="eq-muted" data-testid="eq-de-review-empty">
          No customer review requests for this publication yet.
        </p>
      )}

      <h3>Configuration envelope</h3>
      <div className="eq-de-config-grid">
        <label>
          Rooms locked for customer
          <input
            type="checkbox"
            checked={roomLocked}
            onChange={(e) => setRoomLocked(e.target.checked)}
            data-testid="eq-de-room-lock"
          />
        </label>
        <label>
          Pricing valid through
          <input
            type="date"
            value={pricingValidThrough}
            onChange={(e) => setPricingValidThrough(e.target.value)}
            data-testid="eq-de-pricing-valid"
          />
        </label>
        <label>
          Allowed options (catalog keys)
          <input
            type="text"
            value={allowedOptionKeys}
            onChange={(e) => setAllowedOptionKeys(e.target.value)}
            placeholder="qty-sink, qty-bar"
            data-testid="eq-de-allowed-options"
          />
        </label>
        <label>
          Estimator-only notes
          <textarea
            value={estimatorNotes}
            onChange={(e) => setEstimatorNotes(e.target.value)}
            rows={2}
            data-testid="eq-de-estimator-notes"
          />
        </label>
      </div>
      <p className="eq-footnote">
        Included material and allowed colors default from the approved Studio estimate and server
        catalog. Unsupported options (Blanco, waterfall, popup outlet, faucets) cannot be offered.
      </p>

      {actionError ? (
        <div className="eq-state eq-state--error" role="alert">
          {actionError}
        </div>
      ) : null}
      {actionNotice ? (
        <div className="eq-state" role="status">
          {actionNotice}
        </div>
      ) : null}

      <div className="eq-action-row">
        <button
          type="button"
          className="eq-btn-primary"
          disabled={busy || !eligible}
          data-testid="eq-publish-digital-estimate"
          onClick={() => void publish()}
        >
          Publish Digital Estimate
        </button>
        <button
          type="button"
          className="eq-btn-secondary"
          disabled={busy || !oneTimeLink}
          data-testid="eq-copy-customer-link"
          onClick={() => void copyLink()}
        >
          Copy Customer Link
        </button>
        {oneTimeLink ? (
          <a
            className="eq-btn-secondary"
            href={oneTimeLink}
            target="_blank"
            rel="noreferrer"
            data-testid="eq-open-customer-preview"
          >
            Open Customer Preview
          </a>
        ) : null}
        <button
          type="button"
          className="eq-btn-secondary"
          disabled={busy || !activePublication || activePublication.status !== "active"}
          data-testid="eq-replace-customer-link"
          onClick={() => void replaceLink()}
        >
          Replace Link
        </button>
        <button
          type="button"
          className="eq-btn-ghost"
          disabled={busy || !activePublication || activePublication.status !== "active"}
          data-testid="eq-revoke-publication"
          onClick={() => void revoke()}
        >
          Revoke Publication
        </button>
        <button type="button" className="eq-btn-ghost" disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {oneTimeLink ? (
        <div className="eq-de-onetime" role="status" aria-live="polite" data-testid="eq-de-onetime-link">
          <p>
            One-time customer link is ready. It is not shown as a raw token and cannot be recovered after
            refresh — use Replace Link if lost.
          </p>
        </div>
      ) : null}

      {publications.length > 1 ? (
        <div data-testid="eq-de-history">
          <h3>Publication history</h3>
          <ul>
            {publications.map((p) => (
              <li key={p.id}>
                {p.revisionLabel || `R${p.revisionNumber}`} · {p.status}
                {p.publishedAt ? ` · ${p.publishedAt}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
