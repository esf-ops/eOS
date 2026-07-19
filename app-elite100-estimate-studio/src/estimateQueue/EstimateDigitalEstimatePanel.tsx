import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, ApiError } from "../lib/api";

type ReadinessBlocker = {
  code?: string;
  message?: string;
  field?: string | null;
  allowedRange?: { min?: string; max?: string } | null;
};
type LinkDiagnostics = {
  wrapKeyPresent?: boolean;
  wrapKeyLength?: number;
  tokenWrappedPresent?: boolean;
  tokenWrappedLength?: number;
  activeTokenRows?: number | null;
  selectedTokenStatus?: string | null;
  decryptSucceeded?: boolean | null;
  code?: string | null;
};

type PublicationRow = {
  id: string;
  publicationId?: string;
  status: string;
  publishedAt?: string | null;
  pricingValidThrough?: string | null;
  revisionNumber?: number | null;
  revisionLabel?: string | null;
  revokedAt?: string | null;
  supersededAt?: string | null;
  customerUrl?: string | null;
  linkStatus?: string | null;
  linkDiagnostics?: LinkDiagnostics | null;
  linkError?: { code?: string; message?: string } | null;
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

type PublishDiagnostic = {
  status?: number;
  code?: string | null;
  message?: string | null;
  field?: string | null;
  readinessBlockerCodes?: string[];
};

type Props = {
  authToken: string;
  estimateId: string;
  estimateRevision?: number | null;
  estimateApproved: boolean;
};

function formatStructuredPublishError(e: ApiError): {
  message: string;
  diagnostic: PublishDiagnostic;
} {
  const body =
    e.body && typeof e.body === "object" && e.body !== null
      ? (e.body as Record<string, unknown>)
      : {};
  const diagnostic =
    body.diagnostic && typeof body.diagnostic === "object" && body.diagnostic !== null
      ? (body.diagnostic as PublishDiagnostic)
      : {
          status: e.status,
          code: typeof body.code === "string" ? body.code : null,
          message: e.message,
          field: typeof body.field === "string" ? body.field : null,
          readinessBlockerCodes: Array.isArray(body.blockers)
            ? (body.blockers as ReadinessBlocker[]).map((b) => String(b?.code || "")).filter(Boolean)
            : []
        };
  const allowedRange =
    body.allowedRange && typeof body.allowedRange === "object" && body.allowedRange !== null
      ? (body.allowedRange as { min?: string; max?: string })
      : null;
  const field = typeof body.field === "string" ? body.field : diagnostic.field;
  const parts = [
    e.message,
    field ? `Field: ${field}` : null,
    allowedRange?.min && allowedRange?.max
      ? `Allowed range: ${allowedRange.min} – ${allowedRange.max}`
      : null,
    typeof body.code === "string" ? `Code: ${body.code}` : null,
    `HTTP ${e.status}`
  ].filter(Boolean);
  return {
    message: parts.join(" · "),
    diagnostic: {
      status: diagnostic.status ?? e.status,
      code: diagnostic.code ?? (typeof body.code === "string" ? body.code : null),
      message: diagnostic.message ?? e.message,
      field: field || null,
      readinessBlockerCodes: diagnostic.readinessBlockerCodes || []
    }
  };
}

/**
 * Digital Estimate section — after Studio estimate approval.
 * Stable reusable customer URL for the active publication (recoverable after refresh).
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
  const [publishDiagnostic, setPublishDiagnostic] = useState<PublishDiagnostic | null>(null);
  const [eligible, setEligible] = useState(false);
  const [blockers, setBlockers] = useState<ReadinessBlocker[]>([]);
  const [activePublication, setActivePublication] = useState<PublicationRow | null>(null);
  const [publications, setPublications] = useState<PublicationRow[]>([]);
  const [reviewRequests, setReviewRequests] = useState<ReviewRequestRow[]>([]);
  const [customerUrl, setCustomerUrl] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const [linkDiagnostics, setLinkDiagnostics] = useState<LinkDiagnostics | null>(null);
  const [linkError, setLinkError] = useState<{ code?: string; message?: string } | null>(null);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `studio-de-${Date.now()}`
  );

  const [pricingValidThrough, setPricingValidThrough] = useState("");
  const [allowedOptionKeys, setAllowedOptionKeys] = useState<string>("qty-sink");
  const [estimatorNotes, setEstimatorNotes] = useState("");
  const [roomLocked, setRoomLocked] = useState(true);

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

  const readinessQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (pricingValidThrough) params.set("pricingValidThrough", pricingValidThrough);
    if (configuration.allowedOptionKeys?.length) {
      params.set("allowedOptionKeys", configuration.allowedOptionKeys.join(","));
    }
    params.set("roomLocked", roomLocked ? "1" : "0");
    if (estimatorNotes) params.set("estimatorNotes", estimatorNotes.slice(0, 500));
    const q = params.toString();
    return q ? `?${q}` : "";
  }, [pricingValidThrough, configuration.allowedOptionKeys, roomLocked, estimatorNotes]);

  const load = useCallback(async () => {
    if (!estimateApproved || !estimateId) return;
    setLoadError(null);
    try {
      const body = (await apiGet(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/digital-estimate${readinessQuery}`,
        authToken
      )) as {
        readiness?: {
          eligible?: boolean;
          blockers?: ReadinessBlocker[];
          blockingReasons?: ReadinessBlocker[];
          message?: string;
        };
        activePublication?: PublicationRow | null;
        publications?: PublicationRow[];
        reviewRequests?: ReviewRequestRow[];
      };
      setEligible(Boolean(body.readiness?.eligible));
      const nextBlockers = Array.isArray(body.readiness?.blockingReasons)
        ? body.readiness!.blockingReasons!
        : Array.isArray(body.readiness?.blockers)
          ? body.readiness!.blockers!
          : [];
      setBlockers(nextBlockers);
      setActivePublication(body.activePublication || null);
      setPublications(Array.isArray(body.publications) ? body.publications : []);
      setReviewRequests(Array.isArray(body.reviewRequests) ? body.reviewRequests : []);
      const url = body.activePublication?.customerUrl || null;
      setCustomerUrl(url);
      setLinkStatus(body.activePublication?.linkStatus || (url ? "active" : null));
      setLinkDiagnostics(body.activePublication?.linkDiagnostics || null);
      setLinkError(body.activePublication?.linkError || null);
      if (body.activePublication?.pricingValidThrough && !pricingValidThrough) {
        setPricingValidThrough(String(body.activePublication.pricingValidThrough).slice(0, 10));
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const formatted = formatStructuredPublishError(e);
        setLoadError(formatted.message);
      } else {
        setLoadError("Unable to load Digital Estimate readiness");
      }
    }
  }, [authToken, estimateApproved, estimateId, pricingValidThrough, readinessQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish() {
    setBusy(true);
    setActionError(null);
    setActionNotice(null);
    setPublishDiagnostic(null);
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
        linkStatus?: string | null;
        reused?: boolean;
        staffNotice?: string | null;
        publication?: PublicationRow;
        envelope?: { configured?: boolean; reason?: string; message?: string };
      };
      if (body.customerUrl) {
        setCustomerUrl(body.customerUrl);
        setLinkStatus(body.linkStatus || "active");
      }
      if (body.reused) {
        setActionNotice(
          body.staffNotice ||
            "Publication already exists for this revision. Customer URL is unchanged."
        );
      } else {
        setActionNotice("Digital Estimate published. Customer link is stable and reusable.");
      }
      if (body.envelope && body.envelope.configured === false && body.envelope.message) {
        setActionNotice((prev) =>
          `${prev || "Published."} Configuration envelope: ${body.envelope?.message}`
        );
      }
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        const formatted = formatStructuredPublishError(e);
        setActionError(formatted.message);
        setPublishDiagnostic(formatted.diagnostic);
      } else {
        setActionError("Unable to publish Digital Estimate");
        setPublishDiagnostic({
          status: undefined,
          code: "unknown",
          message: "Unable to publish Digital Estimate",
          field: null,
          readinessBlockerCodes: []
        });
      }
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
      )) as { customerUrl?: string; linkStatus?: string; linkDiagnostics?: LinkDiagnostics };
      if (body.customerUrl && body.linkStatus === "active") {
        setCustomerUrl(body.customerUrl);
        setLinkStatus("active");
        setLinkDiagnostics(body.linkDiagnostics || null);
        setLinkError(null);
        setActionNotice("Customer link replaced. Previous link is no longer valid.");
      } else {
        setActionError(
          "Replace Link did not return a recoverable customer URL. Check Brain DIGITAL_ESTIMATE_LINK_WRAP_KEY."
        );
      }
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        const formatted = formatStructuredPublishError(e);
        setActionError(formatted.message);
        const body =
          e.body && typeof e.body === "object" && e.body !== null
            ? (e.body as { linkDiagnostics?: LinkDiagnostics })
            : {};
        if (body.linkDiagnostics) setLinkDiagnostics(body.linkDiagnostics);
      } else {
        setActionError("Unable to replace link");
      }
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
      setCustomerUrl(null);
      setLinkStatus("revoked");
      setActionNotice("Publication revoked. Customer link is no longer valid.");
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Unable to revoke publication");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!customerUrl) return;
    try {
      await navigator.clipboard.writeText(customerUrl);
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

  const linkReady = Boolean(customerUrl) && linkStatus === "active";

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
            <li key={`${b.code || "b"}-${i}`}>
              {b.message || b.code}
              {b.field ? ` (${b.field})` : ""}
            </li>
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
        <p data-testid="eq-de-link-status">
          Customer link: <strong>{linkStatus || (activePublication ? "none" : "none")}</strong>
        </p>
        {customerUrl ? (
          <p className="eq-muted" data-testid="eq-de-customer-url">
            {customerUrl}
          </p>
        ) : null}
        {linkError?.message ? (
          <p className="eq-state eq-state--error" role="alert" data-testid="eq-de-link-error">
            {linkError.message}
            {linkError.code ? ` (${linkError.code})` : ""}
          </p>
        ) : null}
        {linkDiagnostics ? (
          <div className="eq-de-pilot-diagnostic" data-testid="eq-de-link-diagnostics" role="status">
            <strong>Link recovery diagnostic</strong>
            <ul>
              <li>wrapKeyPresent: {String(linkDiagnostics.wrapKeyPresent)}</li>
              <li>wrapKeyLength: {linkDiagnostics.wrapKeyLength ?? "—"}</li>
              <li>tokenWrappedPresent: {String(linkDiagnostics.tokenWrappedPresent)}</li>
              <li>tokenWrappedLength: {linkDiagnostics.tokenWrappedLength ?? "—"}</li>
              <li>activeTokenRows: {linkDiagnostics.activeTokenRows ?? "—"}</li>
              <li>selectedTokenStatus: {linkDiagnostics.selectedTokenStatus || "—"}</li>
              <li>decryptSucceeded: {String(linkDiagnostics.decryptSucceeded)}</li>
              <li>code: {linkDiagnostics.code || "—"}</li>
            </ul>
          </div>
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
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-de-publish-error">
          {actionError}
        </div>
      ) : null}
      {publishDiagnostic ? (
        <div
          className="eq-de-pilot-diagnostic"
          data-testid="eq-de-pilot-diagnostic"
          role="status"
        >
          <strong>Pilot diagnostic</strong>
          <ul>
            <li>status: {publishDiagnostic.status ?? "—"}</li>
            <li>code: {publishDiagnostic.code || "—"}</li>
            <li>message: {publishDiagnostic.message || "—"}</li>
            <li>field: {publishDiagnostic.field || "—"}</li>
            <li>
              readiness blocker codes:{" "}
              {(publishDiagnostic.readinessBlockerCodes || []).join(", ") || "—"}
            </li>
          </ul>
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
          disabled={busy || !linkReady}
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

      {linkReady ? (
        <div className="eq-de-stable-link" role="status" data-testid="eq-de-stable-link">
          <p>
            Customer link is stable and reusable for this active publication. It remains available
            after refresh until replaced, revoked, or superseded.
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
