import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, ApiError, isAbortError } from "../lib/api";
import {
  FRIENDLY_CUSTOMER_CHOICES,
  buildCustomerChoiceConfiguration,
  inferFriendlyChoiceFlags
} from "../../../backend-core/src/elite100EstimateStudio/studioCustomerChoiceOptions.mjs";

const PUBLISH_CLIENT_TIMEOUT_MS = 55_000;

type PublishUiState = "idle" | "publishing" | "published" | "failed";

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
  sourceProject?: {
    customerName?: string | null;
    projectName?: string | null;
    projectAddress?: string | null;
  } | null;
  customerInfoDraft?: {
    customerName?: string;
    projectName?: string;
    phone?: string;
    email?: string;
    projectAddress?: string;
  } | null;
  roomLabelDrafts?: Record<string, string> | null;
  roomNotes?: Record<string, string> | null;
  projectNote?: string | null;
  selectedOptions?: Array<{ optionKey?: string; displayLabel?: string; quantity?: number }>;
  configuredDisplayTotal?: number | null;
  baselineDisplayTotal?: number | null;
  /** Optional richer customer selection summary when review payload includes it. */
  customerConfigurationSummary?: {
    rooms?: Array<{
      roomKey?: string;
      displayName?: string;
      material?: { materialToken?: string | null; optionKey?: string | null } | null;
      materialLabel?: string | null;
      backsplashMode?: string | null;
      backsplashLabel?: string | null;
      sink?: {
        source?: string | null;
        displayName?: string | null;
        manufacturer?: string | null;
        model?: string | null;
      } | null;
      sinkSummary?: string | null;
      faucet?: {
        source?: string | null;
        displayName?: string | null;
        manufacturer?: string | null;
        model?: string | null;
      } | null;
      faucetSummary?: string | null;
    }>;
    missingInformationRequirements?: Array<{ code?: string; message?: string; customerCopy?: string }>;
    totals?: {
      configuredDisplayTotal?: number | null;
      baselineDisplayTotal?: number | null;
    };
  } | null;
  customerSelectionSummary?: {
    rooms?: Array<{
      roomKey?: string;
      displayName?: string;
      materialLabel?: string | null;
      backsplashLabel?: string | null;
      sinkSummary?: string | null;
      faucetSummary?: string | null;
    }>;
    missingInformationCount?: number | null;
  } | null;
  missingInformationRequirements?: Array<{
    code?: string;
    roomKey?: string;
    message?: string;
    customerCopy?: string;
  }> | null;
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
  const [publishUiState, setPublishUiState] = useState<PublishUiState>("idle");
  const publishInFlightRef = useRef(false);
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
  const [choiceFlags, setChoiceFlags] = useState<Record<string, boolean>>(() =>
    inferFriendlyChoiceFlags({
      allowedOptionKeys: ["qty-sink"],
      customerChoiceGroups: ["material_color", "sink", "edge", "backsplash"]
    })
  );
  const [publishedChoiceFlags, setPublishedChoiceFlags] = useState<Record<
    string,
    boolean
  > | null>(null);
  const [configHydrated, setConfigHydrated] = useState(false);
  const configHydratedRef = useRef(false);
  const [configSaveState, setConfigSaveState] = useState<
    "clean" | "unsaved" | "saving" | "saved" | "failed"
  >("clean");
  const dirtyRef = useRef(false);
  const [legacyUnknownKeys, setLegacyUnknownKeys] = useState<string[]>([]);
  const [estimatorNotes, setEstimatorNotes] = useState("");
  const [roomLocked, setRoomLocked] = useState(true);

  const choiceConfig = useMemo(
    () => buildCustomerChoiceConfiguration(choiceFlags, legacyUnknownKeys),
    [choiceFlags, legacyUnknownKeys]
  );

  const configuration = useMemo(
    () => ({
      pricingValidThrough: pricingValidThrough || undefined,
      allowedOptionKeys: choiceConfig.allowedOptionKeys,
      customerChoiceGroups: choiceConfig.customerChoiceGroups,
      estimatorNotes: estimatorNotes || undefined,
      roomLocks: [{ roomKey: "*", locked: roomLocked }]
    }),
    [pricingValidThrough, choiceConfig, estimatorNotes, roomLocked]
  );

  const configurationDirty = useMemo(() => {
    if (!publishedChoiceFlags) return configHydrated && Boolean(customerUrl);
    return FRIENDLY_CUSTOMER_CHOICES.some(
      (d) => Boolean(choiceFlags[d.id]) !== Boolean(publishedChoiceFlags[d.id])
    );
  }, [choiceFlags, publishedChoiceFlags, configHydrated, customerUrl]);

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

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!estimateApproved || !estimateId) return;
      setLoadError(null);
      try {
        const body = (await apiGet(
          `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/digital-estimate${readinessQuery}`,
          authToken,
          { signal }
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
          publishedConfiguration?: {
            customerChoiceGroups?: string[];
            allowedOptionKeys?: string[];
            legacyUnknownKeys?: string[];
            choiceFlags?: Record<string, boolean>;
            envelopeFingerprint?: string | null;
            pricingValidThrough?: string | null;
            estimatorNotes?: string | null;
          } | null;
        };
        if (signal?.aborted) return;
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
        const nextLinkStatus =
          body.activePublication?.linkStatus || (url ? "active" : null);
        // Never treat a revoked/gone link as the current customer URL.
        if (nextLinkStatus === "active" && url) {
          setCustomerUrl(url);
          setLinkStatus("active");
        } else {
          setCustomerUrl(null);
          setLinkStatus(nextLinkStatus || (body.activePublication ? "none" : null));
        }
        setLinkDiagnostics(body.activePublication?.linkDiagnostics || null);
        setLinkError(body.activePublication?.linkError || null);
        if (body.activePublication?.pricingValidThrough) {
          setPricingValidThrough((prev) =>
            prev ? prev : String(body.activePublication!.pricingValidThrough).slice(0, 10)
          );
        }

        const published = body.publishedConfiguration;
        if (published && (!configHydratedRef.current || !dirtyRef.current)) {
          const flags =
            published.choiceFlags ||
            inferFriendlyChoiceFlags({
              customerChoiceGroups: published.customerChoiceGroups || [],
              allowedOptionKeys: published.allowedOptionKeys || []
            });
          setChoiceFlags(flags);
          setPublishedChoiceFlags({ ...flags });
          if (Array.isArray(published.legacyUnknownKeys)) {
            setLegacyUnknownKeys(published.legacyUnknownKeys);
          }
          if (published.estimatorNotes) {
            setEstimatorNotes((prev) => (prev ? prev : String(published.estimatorNotes)));
          }
          configHydratedRef.current = true;
          setConfigHydrated(true);
          dirtyRef.current = false;
          setConfigSaveState("clean");
        } else if (!published && !configHydratedRef.current) {
          configHydratedRef.current = true;
          setConfigHydrated(true);
        }
      } catch (e) {
        if (isAbortError(e) || signal?.aborted) return;
        if (e instanceof ApiError) {
          const formatted = formatStructuredPublishError(e);
          setLoadError(formatted.message);
        } else {
          setLoadError("Unable to load Digital Estimate readiness");
        }
      }
    },
    [authToken, estimateApproved, estimateId, readinessQuery]
  );

  useEffect(() => {
    if (!estimateApproved || !estimateId) return;
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [estimateApproved, estimateId, authToken, readinessQuery, load]);

  async function publish() {
    if (publishInFlightRef.current || busy) return;
    publishInFlightRef.current = true;
    setBusy(true);
    setPublishUiState("publishing");
    setActionError(null);
    setActionNotice("Publishing Digital Estimate…");
    setPublishDiagnostic(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/digital-estimate/publish`,
        authToken,
        {
          confirm: true,
          idempotencyKey,
          configuration
        },
        { timeoutMs: PUBLISH_CLIENT_TIMEOUT_MS }
      )) as {
        customerUrl?: string | null;
        linkStatus?: string | null;
        reused?: boolean;
        staffNotice?: string | null;
        publication?: PublicationRow;
        envelope?: { configured?: boolean; reason?: string; message?: string };
        correlationId?: string;
      };
      if (body.customerUrl && (body.linkStatus === "active" || !body.linkStatus)) {
        setCustomerUrl(body.customerUrl);
        setLinkStatus("active");
      }
      setPublishUiState("published");
      const updated = Boolean((body as { configurationUpdated?: boolean }).configurationUpdated);
      if (updated || !body.reused) {
        setPublishedChoiceFlags({ ...choiceFlags });
        dirtyRef.current = false;
        setConfigSaveState("saved");
        configHydratedRef.current = true;
        setConfigHydrated(true);
      }
      setActionNotice(
        body.reused
          ? body.staffNotice ||
              "This revision is already published. The customer link is unchanged."
          : updated
            ? body.staffNotice || "Configuration permissions updated. The customer link is unchanged."
            : body.envelope?.configured
              ? "Digital Estimate published."
              : body.staffNotice ||
                "Digital Estimate published as a document-only link (no customer configuration envelope)."
      );
      // One explicit refresh after success — no background polling while pending.
      dirtyRef.current = false;
      await load();
      setConfigSaveState("saved");
    } catch (e) {
      setPublishUiState("failed");
      setActionNotice(null);
      if (dirtyRef.current) setConfigSaveState("failed");
      if (e instanceof ApiError) {
        const formatted = formatStructuredPublishError(e);
        setActionError(
          "Unable to publish the Digital Estimate. No customer link was changed."
        );
        setPublishDiagnostic({
          ...formatted.diagnostic,
          message: formatted.message
        });
      } else if (!isAbortError(e)) {
        setActionError(
          "Unable to publish the Digital Estimate. No customer link was changed."
        );
        setPublishDiagnostic({
          status: undefined,
          code: "DE-PUBLISH-FAILED",
          message: "Unable to publish Digital Estimate",
          field: null,
          readinessBlockerCodes: []
        });
      }
    } finally {
      publishInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function replaceLink() {
    if (!activePublication?.id) return;
    if (publishInFlightRef.current || busy) return;
    publishInFlightRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(activePublication.id)}/replace-token`,
        authToken,
        { confirm: true },
        { timeoutMs: PUBLISH_CLIENT_TIMEOUT_MS }
      )) as { customerUrl?: string; linkStatus?: string; linkDiagnostics?: LinkDiagnostics };
      if (body.customerUrl && body.linkStatus === "active") {
        setCustomerUrl(body.customerUrl);
        setLinkStatus("active");
        setLinkDiagnostics(body.linkDiagnostics || null);
        setLinkError(null);
        setActionNotice("Customer link replaced. Previous link is no longer valid.");
        setPublishUiState("published");
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
      } else if (!isAbortError(e)) {
        setActionError("Unable to replace link");
      }
    } finally {
      publishInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function revoke() {
    if (!activePublication?.id) return;
    if (publishInFlightRef.current || busy) return;
    publishInFlightRef.current = true;
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
      setPublishUiState("idle");
      await load();
    } catch (e) {
      if (!isAbortError(e)) {
        setActionError(e instanceof ApiError ? e.message : "Unable to revoke publication");
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
  const publishing = publishUiState === "publishing" || busy;

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
              <li key={r.id} data-testid="eq-de-review-item">
                {r.status} · {r.requestedAt || "—"}
                {r.customerNote ? ` — ${r.customerNote}` : ""}
                <span className="eq-muted">
                  {" "}
                  (case {r.intakeCaseId?.slice(0, 8) || "—"} · estimate{" "}
                  {r.studioEstimateId?.slice(0, 8) || "—"} · pub {r.publicationId?.slice(0, 8) || "—"})
                </span>
                {r.customerInfoDraft ? (
                  <div className="eq-footnote" data-testid="eq-de-review-customer-draft">
                    Customer info suggestions:{" "}
                    {[
                      r.customerInfoDraft.customerName,
                      r.customerInfoDraft.projectName,
                      r.customerInfoDraft.phone,
                      r.customerInfoDraft.email,
                      r.customerInfoDraft.projectAddress
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {r.sourceProject?.customerName || r.sourceProject?.projectName ? (
                      <>
                        {" "}
                        (source: {[r.sourceProject.customerName, r.sourceProject.projectName]
                          .filter(Boolean)
                          .join(" · ")}
                        )
                      </>
                    ) : null}
                  </div>
                ) : null}
                {r.roomLabelDrafts && Object.keys(r.roomLabelDrafts).length ? (
                  <div className="eq-footnote" data-testid="eq-de-review-room-labels">
                    Room label suggestions:{" "}
                    {Object.entries(r.roomLabelDrafts)
                      .map(([k, v]) => `${k}→${v}`)
                      .join(", ")}
                  </div>
                ) : null}
                {r.roomNotes && Object.keys(r.roomNotes).length ? (
                  <div className="eq-footnote" data-testid="eq-de-review-room-notes">
                    Room notes:{" "}
                    {Object.entries(r.roomNotes)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </div>
                ) : null}
                {r.projectNote ? (
                  <div className="eq-footnote" data-testid="eq-de-review-project-note">
                    Project note: {r.projectNote}
                  </div>
                ) : null}
                {(() => {
                  const summary =
                    r.customerConfigurationSummary ||
                    (r.customerSelectionSummary
                      ? {
                          rooms: r.customerSelectionSummary.rooms,
                          missingInformationRequirements: Array.from({
                            length: Number(r.customerSelectionSummary.missingInformationCount || 0)
                          }).map(() => ({})),
                          totals: undefined
                        }
                      : null);
                  if (summary?.rooms?.length) {
                    return (
                      <div className="eq-footnote" data-testid="eq-de-review-selection-summary">
                        {summary.rooms.map((room) => {
                          const sink =
                            room.sinkSummary ||
                            (room.sink
                              ? [
                                  room.sink.source,
                                  room.sink.displayName ||
                                    [room.sink.manufacturer, room.sink.model].filter(Boolean).join(" ")
                                ]
                                  .filter(Boolean)
                                  .join(": ")
                              : null);
                          const faucet =
                            room.faucetSummary ||
                            (room.faucet
                              ? [
                                  room.faucet.source,
                                  room.faucet.displayName ||
                                    [room.faucet.manufacturer, room.faucet.model]
                                      .filter(Boolean)
                                      .join(" ")
                                ]
                                  .filter(Boolean)
                                  .join(": ")
                              : null);
                          const material =
                            room.materialLabel ||
                            room.material?.materialToken ||
                            null;
                          const backsplash =
                            room.backsplashLabel || room.backsplashMode || null;
                          return (
                            <div key={room.roomKey || room.displayName || "room"}>
                              <strong>{room.displayName || room.roomKey || "Room"}</strong>
                              {": "}
                              {[
                                material ? `Material: ${material}` : null,
                                backsplash ? `Backsplash: ${backsplash}` : null,
                                sink ? `Sink: ${sink}` : null,
                                faucet ? `Faucet: ${faucet}` : null
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </div>
                          );
                        })}
                        {(summary.missingInformationRequirements?.length ||
                          r.missingInformationRequirements?.length) ? (
                          <div>
                            Missing info items:{" "}
                            {summary.missingInformationRequirements?.length ||
                              r.missingInformationRequirements?.length}
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  if (r.selectedOptions?.length) {
                    return (
                      <div className="eq-footnote" data-testid="eq-de-review-materials">
                        Selected options:{" "}
                        {r.selectedOptions
                          .map((o) => o.displayLabel || o.optionKey)
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    );
                  }
                  return null;
                })()}
                {Array.isArray(r.missingInformationRequirements) &&
                r.missingInformationRequirements.length ? (
                  <div className="eq-footnote" data-testid="eq-de-review-missing-info">
                    Missing info ({r.missingInformationRequirements.length}):{" "}
                    {r.missingInformationRequirements
                      .map((m) => m.customerCopy || m.message || m.code)
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                ) : null}
                {r.baselineDisplayTotal != null || r.configuredDisplayTotal != null ? (
                  <div className="eq-footnote" data-testid="eq-de-review-totals">
                    {r.baselineDisplayTotal != null
                      ? `Original: $${Number(r.baselineDisplayTotal).toFixed(2)} · `
                      : null}
                    {r.configuredDisplayTotal != null
                      ? `Configured total: $${Number(r.configuredDisplayTotal).toFixed(2)}`
                      : null}
                  </div>
                ) : null}
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
        <fieldset className="eq-de-customer-choices" data-testid="eq-de-customer-choices">
          <legend>Customer may choose</legend>
          <p className="eq-muted">
            Allowed customer options. Catalog keys are generated automatically for publish.
          </p>
          {publishedChoiceFlags ? (
            <p className="eq-footnote" data-testid="eq-de-published-vs-draft">
              Published permissions are restored after refresh. Unsaved draft checkboxes are marked
              below until you save.
            </p>
          ) : null}
          {FRIENDLY_CUSTOMER_CHOICES.map((def) => {
            const draftOn = Boolean(choiceFlags[def.id]);
            const publishedOn =
              publishedChoiceFlags != null ? Boolean(publishedChoiceFlags[def.id]) : null;
            const differs = publishedOn != null && draftOn !== publishedOn;
            return (
              <label key={def.id} className="eq-check">
                <input
                  type="checkbox"
                  checked={draftOn}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setChoiceFlags((prev) => ({ ...prev, [def.id]: next }));
                    dirtyRef.current = true;
                    setConfigSaveState("unsaved");
                  }}
                  data-testid={`eq-de-choice-${def.id}`}
                />
                <span>
                  <strong>{def.label}</strong>
                  <span className="eq-muted"> — {def.help}</span>
                  {differs ? (
                    <span className="eq-footnote" data-testid={`eq-de-choice-draft-${def.id}`}>
                      {" "}
                      (draft · published {publishedOn ? "on" : "off"})
                    </span>
                  ) : publishedOn != null ? (
                    <span className="eq-muted" data-testid={`eq-de-choice-published-${def.id}`}>
                      {" "}
                      · published
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          <p className="eq-footnote" data-testid="eq-de-config-save-state">
            {configSaveState === "unsaved" || configurationDirty
              ? "Unsaved configuration changes"
              : configSaveState === "saving"
                ? "Saving…"
                : configSaveState === "failed"
                  ? "Failed — Retry"
                  : configSaveState === "saved"
                    ? "Saved"
                    : publishedChoiceFlags
                      ? "Saved"
                      : null}
          </p>
          {legacyUnknownKeys.length ? (
            <p className="eq-footnote" data-testid="eq-de-legacy-keys-note">
              Preserving {legacyUnknownKeys.length} legacy option key
              {legacyUnknownKeys.length === 1 ? "" : "s"} from the prior publication (not shown as
              editable text).
            </p>
          ) : null}
        </fieldset>
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
        <div className="eq-state" role="status" data-testid="eq-de-publish-status">
          {actionNotice}
        </div>
      ) : null}
      <p className="eq-muted" data-testid="eq-de-publish-ui-state">
        Publish state: {publishUiState}
      </p>

      <div className="eq-action-row">
        <button
          type="button"
          className="eq-btn-primary"
          disabled={publishing || !eligible}
          data-testid="eq-publish-digital-estimate"
          onClick={() => {
            setConfigSaveState(configurationDirty || Boolean(customerUrl) ? "saving" : "saving");
            void publish();
          }}
        >
          {publishing
            ? customerUrl && configurationDirty
              ? "Saving…"
              : "Publishing…"
            : customerUrl
              ? configurationDirty
                ? "Save / Update Configuration"
                : "Publish Digital Estimate"
              : "Publish Digital Estimate"}
        </button>
        {customerUrl && configurationDirty ? (
          <button
            type="button"
            className="eq-btn-secondary"
            disabled={publishing || !eligible}
            data-testid="eq-save-configuration"
            onClick={() => {
              setConfigSaveState("saving");
              void publish();
            }}
          >
            {configSaveState === "failed" ? "Retry save" : "Save configuration"}
          </button>
        ) : null}
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
        <button
          type="button"
          className="eq-btn-secondary"
          disabled={publishing || !activePublication || activePublication.status !== "active"}
          data-testid="eq-replace-customer-link"
          onClick={() => void replaceLink()}
        >
          Replace Link
        </button>
        <button
          type="button"
          className="eq-btn-ghost"
          disabled={publishing || !activePublication || activePublication.status !== "active"}
          data-testid="eq-revoke-publication"
          onClick={() => void revoke()}
        >
          Revoke Publication
        </button>
        <button
          type="button"
          className="eq-btn-ghost"
          disabled={publishing}
          onClick={() => void load()}
        >
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
