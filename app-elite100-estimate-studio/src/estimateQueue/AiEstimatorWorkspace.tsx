/**
 * AiEstimatorWorkspace — single active AI-assisted estimator experience.
 *
 * Mounts one primary surface from deriveAiEstimatorStage:
 *   processing/draft/revision_draft/approving → Takeoff Review iframe
 *   approved → ApprovedMeasurementsCard
 *   published → PublishedEstimateCard
 *
 * Does not mount ManualPhysicalScopeEditor, EstimateScopePanel, tabs,
 * EstimateWorkflowHeader, EstimateDigitalEstimatePanel, or Customer Choices.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  apiGet,
  apiPost,
  ApiError,
  isAbortError,
  isTransientHttpError,
  transientFailureMessage
} from "../lib/api";
import {
  aiTakeoffHeadUrl,
  isAllowedTakeoffMessageOrigin,
  isValidTakeoffApprovedMessage
} from "./takeoffPostMessageOrigins.mjs";
import {
  buildApprovalSummaryFromEstimate,
  estimateHasMeasuredScope
} from "./aiTakeoffApprovedSummary.mjs";
import {
  deriveAiEstimatorStage,
  shouldOfferPublishRevised
} from "./deriveAiEstimatorStage.mjs";
import { buildAiEstimatorSummary } from "../../../backend-core/src/elite100EstimateStudio/studioAiEstimatorSummary.mjs";
import {
  EstimatorWarnings,
  MeasurementRevisionComparison,
  PublicationActivitySummary,
  StartingPriceBreakdown,
  VerifiedMeasurementTotals,
  VerifiedRoomScope,
  type VerifiedRoom
} from "./AiEstimatorReadViews";

const PUBLISH_CLIENT_TIMEOUT_MS = 55_000;
const HANDOFF_RETRY_MAX_ATTEMPTS = 6;
const HANDOFF_RETRY_BASE_MS = 400;
const APPROVAL_FALLBACK_POLL_MS = 2_500;
const APPROVAL_FALLBACK_MAX_MS = 45_000;

type ApprovalSummary = {
  countertopSf?: number;
  backsplashSf?: number;
  edgeLf?: number;
  kitchenSinkCutouts?: number;
  vanityBarSinkCutouts?: number;
  cooktopCutouts?: number;
  outletCutouts?: number;
  rooms?: number;
  includedPieces?: number;
  customerDisplayTotal?: number | null;
};

type ActiveReview = {
  eligible: boolean;
  blockers: Array<{ code?: string; message?: string }>;
};

type AiSummary = ReturnType<typeof buildAiEstimatorSummary>;

export type CompactHeaderModel = {
  title: string;
  planFilename: string;
  onViewPlan?: (() => void) | null;
  onBackToQueue?: (() => void) | null;
  revisionBanner?: string | null;
  draftSaveStatus?: string | null;
};

type Props = {
  authToken: string;
  caseId: string;
  takeoffJobId: string;
  header?: CompactHeaderModel | null;
  takeoffDisplayStatus?: string | null;
  onEstimateReady?: (estimate: Record<string, unknown>) => void;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Transient approval/result consistency — safe to auto-retry briefly. */
export function isRetryableHandoffError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.status === 425) return true;
  if (e.status !== 409 && e.status !== 404) return false;
  const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
  const code = String(body?.code || "");
  if (body?.retryable === true) return true;
  return (
    code === "takeoff_result_not_ready" ||
    code === "takeoff_result_missing" ||
    code === "takeoff_unavailable"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function summarizeFromEstimate(
  est: Record<string, unknown> | null | undefined,
  prior: Record<string, unknown> | null,
  publication: Record<string, unknown> | null,
  deRead: Record<string, unknown> | null
): AiSummary | null {
  if (!est) return null;
  const attached = est.aiEstimatorSummary as AiSummary | undefined;
  if (attached && typeof attached === "object" && Array.isArray(attached.rooms)) {
    if (prior && !attached.comparison) {
      return buildAiEstimatorSummary({
        estimate: est,
        priorEstimate: prior,
        publicationSummary: publication,
        digitalEstimateRead: deRead
      });
    }
    return attached;
  }
  return buildAiEstimatorSummary({
    estimate: est,
    priorEstimate: prior,
    publicationSummary: publication,
    digitalEstimateRead: deRead
  });
}

export function CompactEstimateHeader({
  title,
  planFilename,
  onViewPlan,
  onBackToQueue,
  revisionBanner,
  draftSaveStatus
}: CompactHeaderModel) {
  return (
    <header className="eq-ai-compact-header" data-testid="eq-ai-compact-header" aria-label="Estimate">
      <div className="eq-ai-compact-header__main">
        <div className="eq-cell-primary" data-testid="eq-ai-header-title">
          {title}
        </div>
        <div className="eq-cell-meta" data-testid="eq-ai-header-plan">
          {planFilename}
        </div>
        {revisionBanner ? (
          <div className="eq-ai-revision-banner" data-testid="eq-ai-revision-banner" role="status">
            {revisionBanner}
          </div>
        ) : null}
        {draftSaveStatus ? (
          <div className="eq-cell-meta" data-testid="eq-ai-draft-save-status" role="status">
            {draftSaveStatus}
          </div>
        ) : null}
      </div>
      <div className="eq-action-row">
        {onViewPlan ? (
          <button
            type="button"
            className="eq-btn-ghost"
            data-testid="eq-view-plan"
            onClick={onViewPlan}
          >
            View plan
          </button>
        ) : null}
        {onBackToQueue ? (
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="eq-back-to-queue"
            onClick={onBackToQueue}
          >
            Back to Estimate Queue
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function ApprovedMeasurementsCard(props: {
  aiSummary: AiSummary | null;
  estimateRevision: number | null;
  publishedRevision: number | null;
  activeReview: ActiveReview | null;
  publishBusy: boolean;
  publishError: string | null;
  publishLabel: string;
  eligible: boolean;
  estimateId: string | null;
  onEdit: () => void;
  onPublish: () => void;
}) {
  const s = props.aiSummary;
  const m = s?.measurements;
  const openings = m?.openingsByType || {};
  const rooms = (s?.rooms || []) as VerifiedRoom[];
  const isRevised =
    props.publishedRevision != null &&
    props.estimateRevision != null &&
    props.estimateRevision > props.publishedRevision;
  const comparison = s?.comparison;

  return (
    <section
      className="eq-ai-approved-card eq-ai-approved-card--deep"
      data-testid="eq-ai-approved-measurements"
      aria-label="Measurements approved"
    >
      <h2 data-testid="eq-ai-approved-heading">
        Measurements approved — Revision R{props.estimateRevision ?? "—"}
      </h2>
      {isRevised ? (
        <p className="eq-muted" data-testid="eq-ai-previous-published-revision">
          Previous published revision: R{props.publishedRevision}
        </p>
      ) : null}

      {isRevised && comparison ? (
        <section className="eq-ai-revised-totals" data-testid="eq-ai-revised-totals">
          <h3 className="eq-ai-section-title">Revised totals</h3>
          <dl className="eq-summary-dl eq-summary-dl--grid">
            <div>
              <dt>Previous countertop SF</dt>
              <dd>{num(comparison.previousCountertopSf).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Revised countertop SF</dt>
              <dd>{num(comparison.revisedCountertopSf).toFixed(2)}</dd>
            </div>
            <div>
              <dt>SF difference</dt>
              <dd>
                {(
                  num(comparison.revisedCountertopSf) - num(comparison.previousCountertopSf)
                ).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Previous starting total</dt>
              <dd>
                {comparison.previousTotal != null
                  ? `$${num(comparison.previousTotal).toFixed(2)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Revised starting total</dt>
              <dd>
                {comparison.revisedTotal != null
                  ? `$${num(comparison.revisedTotal).toFixed(2)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Price difference</dt>
              <dd>
                {comparison.difference != null
                  ? `${num(comparison.difference) >= 0 ? "+" : ""}$${num(
                      comparison.difference
                    ).toFixed(2)}`
                  : "—"}
              </dd>
            </div>
          </dl>
          <MeasurementRevisionComparison comparison={comparison} />
        </section>
      ) : null}

      <VerifiedMeasurementTotals
        countertopSf={num(m?.countertopSf)}
        backsplashSf={num(m?.backsplashSf)}
        exposedEdgeLf={num(m?.exposedEdgeLf)}
        openingsByType={openings}
        startingTotal={s?.pricing?.customerDisplayTotal ?? null}
        revision={props.estimateRevision}
      />

      <VerifiedRoomScope rooms={rooms} defaultExpanded />

      <StartingPriceBreakdown
        groups={s?.pricing?.customerSafeGroups || []}
        startingTotal={s?.pricing?.customerDisplayTotal ?? null}
      />

      <EstimatorWarnings
        warnings={s?.pricing?.warnings}
        unresolvedItems={s?.pricing?.unresolvedItems}
        blockers={
          props.activeReview && !props.activeReview.eligible
            ? props.activeReview.blockers
            : s?.pricing?.activeReviewBlockers
        }
      />

      {props.publishError ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-publish-error">
          {props.publishError}
          <div className="eq-action-row">
            <button
              type="button"
              className="eq-btn-primary"
              disabled={props.publishBusy || !props.estimateId || !props.eligible}
              data-testid="eq-ai-retry-publish"
              onClick={props.onPublish}
            >
              Try publishing again
            </button>
          </div>
        </div>
      ) : null}
      <div className="eq-action-row eq-ai-sticky-actions">
        <button
          type="button"
          className="eq-btn-ghost"
          data-testid="eq-ai-edit-measurements"
          onClick={props.onEdit}
        >
          Edit Measurements
        </button>
        <button
          type="button"
          className="eq-btn-primary"
          disabled={props.publishBusy || !props.estimateId || !props.eligible}
          data-testid="eq-publish-digital-estimate"
          onClick={props.onPublish}
        >
          {props.publishBusy ? "Publishing…" : props.publishLabel}
        </button>
      </div>
    </section>
  );
}

export function PublishedEstimateCard(props: {
  aiSummary: AiSummary | null;
  estimateRevision: number | null;
  publishedRevision: number | null;
  customerUrl: string;
  onEdit: () => void;
  onCopy: () => void;
  onPublishRevised?: (() => void) | null;
  showPublishRevised?: boolean;
  publishBusy?: boolean;
}) {
  const s = props.aiSummary;
  const m = s?.measurements;
  const pub = s?.publication;
  const rooms = (s?.rooms || []) as VerifiedRoom[];
  const hasNewer = Boolean(s?.revision?.hasNewerApprovedRevision || props.showPublishRevised);

  return (
    <section
      className="eq-ai-approved-card eq-ai-approved-card--deep"
      data-testid="eq-ai-published-estimate"
      aria-label="Digital Estimate published"
    >
      <h2 data-testid="eq-ai-published-heading">
        Digital Estimate published — Revision R
        {props.publishedRevision ?? props.estimateRevision ?? "—"}
      </h2>

      <PublicationActivitySummary
        publishedRevision={props.publishedRevision}
        publishedAt={pub?.publishedAt ?? null}
        pricingValidThrough={pub?.pricingValidThrough ?? null}
        startingTotal={s?.pricing?.customerDisplayTotal ?? null}
        customerActivityLabel={pub?.customerActivityLabel ?? null}
        customerActivityState={pub?.customerActivityState ?? null}
        lastCustomerActivityAt={pub?.lastCustomerActivityAt ?? null}
        customerConfiguredTotal={pub?.customerConfiguredTotal ?? null}
        customerDifference={pub?.customerDifference ?? null}
        reviewRequested={Boolean(pub?.reviewRequested)}
        currentPublishedRevision={props.publishedRevision}
        hasNewerApprovedRevision={hasNewer}
        newerApprovedRevision={hasNewer ? props.estimateRevision : null}
      />

      <VerifiedMeasurementTotals
        countertopSf={num(m?.countertopSf)}
        backsplashSf={num(m?.backsplashSf)}
        exposedEdgeLf={num(m?.exposedEdgeLf)}
        openingsByType={m?.openingsByType || {}}
        startingTotal={s?.pricing?.customerDisplayTotal ?? null}
        revision={props.publishedRevision ?? props.estimateRevision}
      />

      <VerifiedRoomScope rooms={rooms} compact defaultExpanded={false} />

      <div className="eq-action-row eq-ai-sticky-actions">
        <a
          className="eq-btn-primary"
          href={props.customerUrl}
          target="_blank"
          rel="noreferrer"
          data-testid="eq-open-customer-preview"
        >
          Open Customer Estimate
        </a>
        <button
          type="button"
          className="eq-btn-secondary"
          data-testid="eq-copy-customer-link"
          onClick={props.onCopy}
        >
          Copy Customer Link
        </button>
        <button
          type="button"
          className="eq-btn-ghost"
          data-testid="eq-ai-edit-measurements"
          onClick={props.onEdit}
        >
          Edit Measurements
        </button>
        {hasNewer && props.onPublishRevised ? (
          <button
            type="button"
            className="eq-btn-primary"
            data-testid="eq-publish-revised-estimate"
            disabled={props.publishBusy}
            onClick={props.onPublishRevised}
          >
            {props.publishBusy ? "Publishing…" : "Publish Revised Estimate"}
          </button>
        ) : null}
      </div>
      <p className="eq-muted" data-testid="eq-ai-customer-url">
        {props.customerUrl}
      </p>
    </section>
  );
}

export default function AiEstimatorWorkspace({
  authToken,
  caseId,
  takeoffJobId,
  header = null,
  takeoffDisplayStatus = null,
  onEstimateReady
}: Props) {
  const takeoffFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [takeoffSrc] = useState(
    () => `${aiTakeoffHeadUrl()}/?takeoffJobId=${encodeURIComponent(takeoffJobId)}&consolidated=1`
  );
  const [measurementsApproved, setMeasurementsApproved] = useState(false);
  const [editingRevision, setEditingRevision] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [priorEstimate, setPriorEstimate] = useState<Record<string, unknown> | null>(null);
  const [publicationSummary, setPublicationSummary] = useState<Record<string, unknown> | null>(
    null
  );
  const [deRead, setDeRead] = useState<Record<string, unknown> | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [estimateRevision, setEstimateRevision] = useState<number | null>(null);
  const [publishedRevision, setPublishedRevision] = useState<number | null>(null);
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [customerUrl, setCustomerUrl] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ai-ws-pub-${Date.now()}`
  );
  const handoffInFlightRef = useRef(false);
  const handoffSucceededRef = useRef(false);
  const pendingSummaryRef = useRef<ApprovalSummary | null>(null);

  const stage = deriveAiEstimatorStage({
    takeoffDisplayStatus,
    handoffBusy,
    publishBusy,
    measurementsApproved,
    customerUrl,
    estimateRevision,
    publishedRevision,
    editingRevision
  });

  const applyEstimateView = useCallback(
    (
      est: Record<string, unknown> | null | undefined,
      opts?: { prior?: Record<string, unknown> | null; publication?: Record<string, unknown> | null }
    ) => {
      if (!est) return;
      onEstimateReady?.(est);
      const id = String(est.id || "").trim();
      if (id) setEstimateId(id);
      if (est.revision != null) setEstimateRevision(Number(est.revision) || null);
      const ar = est.activeReview as ActiveReview | undefined;
      setActiveReview(ar && typeof ar === "object" ? ar : null);
      const next = buildApprovalSummaryFromEstimate(est, pendingSummaryRef.current);
      if (next) pendingSummaryRef.current = next;
      const prior = opts?.prior !== undefined ? opts.prior : priorEstimate;
      const publication =
        opts?.publication !== undefined ? opts.publication : publicationSummary;
      if (opts?.prior !== undefined) setPriorEstimate(opts.prior);
      if (opts?.publication !== undefined) setPublicationSummary(opts.publication);
      setAiSummary(summarizeFromEstimate(est, prior || null, publication || null, deRead));
    },
    [onEstimateReady, priorEstimate, publicationSummary, deRead]
  );

  const refreshPublicationActivity = useCallback(
    async (id: string) => {
      try {
        const body = (await apiGet(
          `/api/elite100-estimate-studio/estimates/${encodeURIComponent(id)}/digital-estimate`,
          authToken
        )) as Record<string, unknown>;
        setDeRead(body);
        const pub =
          (body.publicationSummary as Record<string, unknown> | undefined) ||
          (body.publication as Record<string, unknown> | undefined) ||
          null;
        if (pub) setPublicationSummary(pub);
        const url =
          String(
            (pub as { customerUrl?: string } | null)?.customerUrl ||
              (body.activePublication as { customerUrl?: string } | undefined)?.customerUrl ||
              ""
          ).trim() || null;
        if (url) setCustomerUrl(url);
        const rev =
          (pub as { revision?: number } | null)?.revision ??
          (body.activePublication as { revisionNumber?: number } | undefined)?.revisionNumber;
        if (rev != null) setPublishedRevision(Number(rev) || null);
        setAiSummary((prev) => {
          if (!prev) return prev;
          const rebuilt = buildAiEstimatorSummary({
            estimate: {
              revision: estimateRevision,
              calculation: {
                totals: { customerDisplayTotal: prev.pricing.customerDisplayTotal }
              },
              scope: { rooms: [] },
              aiEstimatorSummary: prev
            },
            priorEstimate,
            publicationSummary: pub,
            digitalEstimateRead: body
          });
          return {
            ...prev,
            publication: rebuilt.publication,
            revision: {
              ...prev.revision,
              published: Number(rev) || prev.revision.published,
              hasNewerApprovedRevision:
                rev != null &&
                estimateRevision != null &&
                estimateRevision > Number(rev) &&
                measurementsApproved
            }
          };
        });
      } catch {
        /* non-fatal */
      }
    },
    [authToken, estimateRevision, measurementsApproved, priorEstimate]
  );

  const refreshFromTakeoffWithRetry = useCallback(
    async (estimateIdForRefresh: string) => {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < HANDOFF_RETRY_MAX_ATTEMPTS; attempt += 1) {
        try {
          const body = (await apiPost(
            `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateIdForRefresh)}/refresh-from-takeoff`,
            authToken,
            { force: true, confirm: true }
          )) as { estimate?: Record<string, unknown>; preview?: Record<string, unknown> };
          return body;
        } catch (e) {
          lastErr = e;
          if (!isRetryableHandoffError(e) || attempt === HANDOFF_RETRY_MAX_ATTEMPTS - 1) {
            throw e;
          }
          await sleep(HANDOFF_RETRY_BASE_MS * Math.pow(2, attempt));
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("Unable to refresh from Takeoff");
    },
    [authToken]
  );

  const completeApprovalHandoff = useCallback(
    async (payload: Record<string, unknown> | null) => {
      if (handoffSucceededRef.current) return;
      if (handoffInFlightRef.current) return;
      handoffInFlightRef.current = true;
      setHandoffBusy(true);
      setHandoffError(null);
      try {
        const nested =
          payload?.payload && typeof payload.payload === "object"
            ? (payload.payload as Record<string, unknown>)
            : payload || {};
        const cs =
          (nested.consolidatedSummary as ApprovalSummary | undefined) ||
          (payload?.consolidatedSummary as ApprovalSummary | undefined) ||
          null;
        if (cs) {
          pendingSummaryRef.current = {
            countertopSf: num(cs.countertopSf),
            backsplashSf: num(cs.backsplashSf),
            edgeLf: num((cs as { edgeLf?: number }).edgeLf),
            kitchenSinkCutouts: num(cs.kitchenSinkCutouts),
            vanityBarSinkCutouts: num(cs.vanityBarSinkCutouts),
            cooktopCutouts: num(cs.cooktopCutouts),
            outletCutouts: num(cs.outletCutouts),
            rooms: num(cs.rooms),
            includedPieces: num(cs.includedPieces)
          };
        }

        let id = estimateId;
        if (!id) {
          const created = (await apiGet(
            `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/estimate?takeoffJobId=${encodeURIComponent(takeoffJobId)}`,
            authToken
          )) as { estimate?: Record<string, unknown> };
          id = String(created.estimate?.id || "").trim();
          if (!id) {
            throw new Error("Studio estimate was not created after Takeoff approval");
          }
          setEstimateId(id);
        }

        const refreshed = await refreshFromTakeoffWithRetry(id);
        const refreshedEst = refreshed.estimate;
        if (!refreshedEst || !Array.isArray((refreshedEst.scope as { rooms?: unknown[] } | undefined)?.rooms)) {
          throw new Error("Refresh from Takeoff did not return an updated estimate Scope");
        }

        const priced = (await apiPost(
          `/api/elite100-estimate-studio/estimates/${encodeURIComponent(id)}/calculate`,
          authToken,
          {}
        )) as { estimate?: Record<string, unknown> } & Record<string, unknown>;

        const view = (priced.estimate || priced) as Record<string, unknown>;
        if (!estimateHasMeasuredScope(view)) {
          throw new Error(
            "Verified estimate is missing measured Scope after Takeoff approval"
          );
        }

        applyEstimateView(view, { prior: priorEstimate });
        handoffSucceededRef.current = true;
        setEditingRevision(false);
        setMeasurementsApproved(true);
      } catch (e) {
        if (!isAbortError(e)) {
          setHandoffError(
            "Measurements were approved, but the verified estimate could not be built."
          );
        }
      } finally {
        handoffInFlightRef.current = false;
        setHandoffBusy(false);
      }
    },
    [
      applyEstimateView,
      authToken,
      caseId,
      estimateId,
      priorEstimate,
      refreshFromTakeoffWithRetry,
      takeoffJobId
    ]
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isAllowedTakeoffMessageOrigin(event.origin)) return;
      const data = event.data;
      if (!isValidTakeoffApprovedMessage(data)) return;
      void completeApprovalHandoff(data as Record<string, unknown>);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [completeApprovalHandoff]);

  // Bounded status-poll fallback when postMessage is missed (does not remount iframe).
  useEffect(() => {
    if (measurementsApproved || handoffBusy || handoffSucceededRef.current) return;
    let cancelled = false;
    let timer: number | null = null;
    const started = Date.now();

    async function tick() {
      if (cancelled || handoffSucceededRef.current) return;
      if (Date.now() - started > APPROVAL_FALLBACK_MAX_MS) return;
      try {
        const status = (await apiGet(
          `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
          authToken
        )) as { reviewStatus?: string };
        if (cancelled) return;
        if (String(status.reviewStatus || "").toLowerCase() === "approved") {
          await completeApprovalHandoff({ reviewStatus: "approved" });
          return;
        }
      } catch {
        /* non-fatal */
      }
      if (!cancelled && !handoffSucceededRef.current) {
        timer = window.setTimeout(() => void tick(), APPROVAL_FALLBACK_POLL_MS);
      }
    }

    timer = window.setTimeout(() => void tick(), APPROVAL_FALLBACK_POLL_MS);
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [authToken, takeoffJobId, measurementsApproved, handoffBusy, completeApprovalHandoff]);

  async function publish() {
    if (!estimateId || publishBusy) return;
    setPublishBusy(true);
    setPublishError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/simplified-publish`,
        authToken,
        { confirm: true, idempotencyKey },
        { timeoutMs: PUBLISH_CLIENT_TIMEOUT_MS }
      )) as {
        customerUrl?: string | null;
        publication?: { customerUrl?: string | null };
      };
      const url = body.customerUrl || body.publication?.customerUrl || null;
      if (url) {
        setCustomerUrl(url);
        setPublishedRevision(estimateRevision);
        setIdempotencyKey(
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `ai-ws-pub-${Date.now()}`
        );
        await refreshPublicationActivity(estimateId);
      } else {
        setPublishError("The Digital Estimate could not be published.");
      }
    } catch (e) {
      if (!isAbortError(e)) {
        setPublishError(
          isTransientHttpError(e)
            ? transientFailureMessage(e)
            : "The Digital Estimate could not be published."
        );
      }
    } finally {
      setPublishBusy(false);
    }
  }

  async function copyLink() {
    if (!customerUrl) return;
    try {
      await navigator.clipboard.writeText(customerUrl);
    } catch {
      setPublishError("Unable to copy link");
    }
  }

  async function editMeasurements() {
    setEditError(null);
    setPublishError(null);
    setHandoffError(null);
    if (!estimateId) {
      handoffSucceededRef.current = false;
      setMeasurementsApproved(false);
      setEditingRevision(true);
      return;
    }
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/open-measurement-revision`,
        authToken,
        { confirm: true }
      )) as {
        estimate?: Record<string, unknown>;
        reused?: boolean;
        previousRevisionSummary?: Record<string, unknown> | null;
        priorEstimate?: Record<string, unknown> | null;
      };
      const next = body.estimate;
      const prior = body.priorEstimate || null;
      if (next) {
        applyEstimateView(next, { prior });
      }
      handoffSucceededRef.current = false;
      setMeasurementsApproved(false);
      setEditingRevision(true);
      // Keep customerUrl + publishedRevision so Publish Revised can appear after re-approval.
    } catch (e) {
      if (!isAbortError(e)) {
        setEditError("Your measurement changes were not saved. Try Save Draft again.");
        // Fall back to local remount of Takeoff without advancing published state incorrectly.
        handoffSucceededRef.current = false;
        setMeasurementsApproved(false);
        setEditingRevision(true);
      }
    }
  }

  function retryHandoff() {
    void completeApprovalHandoff({ reviewStatus: "approved" });
  }

  const revisionBanner =
    editingRevision && estimateRevision != null
      ? publishedRevision != null
        ? `Editing measurement revision R${estimateRevision} · Based on published revision R${publishedRevision}`
        : `Editing measurement revision R${estimateRevision}`
      : null;

  const headerNode = header ? (
    <CompactEstimateHeader
      title={header.title}
      planFilename={header.planFilename}
      onViewPlan={header.onViewPlan}
      onBackToQueue={header.onBackToQueue}
      revisionBanner={revisionBanner || header.revisionBanner}
      draftSaveStatus={header.draftSaveStatus || null}
    />
  ) : revisionBanner ? (
    <div className="eq-ai-revision-banner" data-testid="eq-ai-revision-banner" role="status">
      {revisionBanner}
    </div>
  ) : null;

  const showTakeoff =
    stage === "processing" ||
    stage === "draft" ||
    stage === "revision_draft" ||
    stage === "approving";

  const publishRevised = shouldOfferPublishRevised({
    publishedRevision,
    estimateRevision,
    measurementsApproved
  });
  const publishLabel = publishRevised
    ? "Publish Revised Estimate"
    : "Publish Digital Estimate";
  const eligible = activeReview ? activeReview.eligible : Boolean(estimateId);

  return (
    <section className="eq-ai-estimator-workspace" data-testid="eq-ai-estimator-workspace">
      {headerNode}

      {editError ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-edit-error">
          {editError}
        </div>
      ) : null}

      {showTakeoff ? (
        <div className="eq-ai-takeoff-layout" data-testid="eq-ai-takeoff-surface">
          <div className="eq-ai-takeoff-layout__intro">
            <h2 className="eq-ai-section-title" data-testid="eq-ai-takeoff-review-heading">
              {stage === "revision_draft" ? "AI Takeoff Review — revision" : "AI Takeoff Review"}
            </h2>
            <p className="eq-footnote" data-testid="eq-takeoff-first-hint">
              Review and correct AI measurements in Takeoff Review below. Use Save Draft, then
              Approve Measurements to build the verified estimate. Customer material and product
              choices happen in the Digital Estimate link after publish.
            </p>
          </div>
          {stage === "revision_draft" ? (
            <MeasurementRevisionComparison
              comparison={aiSummary?.comparison || null}
              dirtyLocal={false}
            />
          ) : null}
          {handoffError ? (
            <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-handoff-error">
              <strong>{handoffError}</strong>
              <div className="eq-action-row">
                <button
                  type="button"
                  className="eq-btn-primary"
                  data-testid="eq-ai-retry-handoff"
                  disabled={handoffBusy}
                  onClick={retryHandoff}
                >
                  Retry building estimate
                </button>
              </div>
            </div>
          ) : null}
          <div
            className={
              handoffBusy
                ? "eq-takeoff-frame-wrap eq-takeoff-frame-wrap--busy"
                : "eq-takeoff-frame-wrap"
            }
            data-testid="eq-takeoff-frame-wrap"
          >
            {handoffBusy ? (
              <div
                className="eq-takeoff-handoff-overlay"
                data-testid="eq-takeoff-handoff-overlay"
                role="status"
                aria-live="polite"
              >
                Measurements approved. Building verified estimate…
              </div>
            ) : null}
            <iframe
              ref={takeoffFrameRef}
              title="AI Takeoff review"
              className="eq-takeoff-frame"
              data-testid="eq-takeoff-iframe"
              src={takeoffSrc}
              referrerPolicy="origin"
              style={handoffBusy ? { pointerEvents: "none" } : undefined}
            />
          </div>
        </div>
      ) : null}

      {stage === "published" && customerUrl ? (
        <PublishedEstimateCard
          aiSummary={aiSummary}
          estimateRevision={estimateRevision}
          publishedRevision={publishedRevision}
          customerUrl={customerUrl}
          onEdit={() => void editMeasurements()}
          onCopy={() => void copyLink()}
          showPublishRevised={publishRevised}
          onPublishRevised={() => void publish()}
          publishBusy={publishBusy}
        />
      ) : null}

      {(stage === "approved" || stage === "publishing") && measurementsApproved ? (
        <ApprovedMeasurementsCard
          aiSummary={aiSummary}
          estimateRevision={estimateRevision}
          publishedRevision={publishedRevision}
          activeReview={activeReview}
          publishBusy={publishBusy}
          publishError={publishError}
          publishLabel={publishLabel}
          eligible={eligible}
          estimateId={estimateId}
          onEdit={() => void editMeasurements()}
          onPublish={() => void publish()}
        />
      ) : null}
    </section>
  );
}
