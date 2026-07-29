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

export type CompactHeaderModel = {
  title: string;
  planFilename: string;
  onViewPlan?: (() => void) | null;
  onBackToQueue?: (() => void) | null;
  revisionBanner?: string | null;
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

function openingsTotal(summary: ApprovalSummary | null): number {
  return (
    num(summary?.kitchenSinkCutouts) +
    num(summary?.vanityBarSinkCutouts) +
    num(summary?.cooktopCutouts) +
    num(summary?.outletCutouts)
  );
}

export function CompactEstimateHeader({
  title,
  planFilename,
  onViewPlan,
  onBackToQueue,
  revisionBanner
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

function MeasurementSummaryDl({
  summary,
  estimateRevision
}: {
  summary: ApprovalSummary | null;
  estimateRevision: number | null;
}) {
  return (
    <dl className="eq-summary-dl" data-testid="eq-ai-approved-summary">
      <div>
        <dt>Verified square footage</dt>
        <dd data-testid="eq-ai-verified-sf">{num(summary?.countertopSf).toFixed(2)} SF</dd>
      </div>
      <div>
        <dt>Verified backsplash</dt>
        <dd data-testid="eq-ai-verified-backsplash-sf">
          {num(summary?.backsplashSf).toFixed(2)} SF
        </dd>
      </div>
      <div>
        <dt>Verified exposed edge</dt>
        <dd data-testid="eq-ai-verified-edge-lf">{num(summary?.edgeLf).toFixed(2)} LF</dd>
      </div>
      <div>
        <dt>Openings</dt>
        <dd data-testid="eq-ai-verified-openings">{openingsTotal(summary)}</dd>
      </div>
      <div>
        <dt>Starting estimate total</dt>
        <dd data-testid="eq-ai-starting-total">
          {summary?.customerDisplayTotal != null
            ? `$${num(summary.customerDisplayTotal).toFixed(2)}`
            : "—"}
        </dd>
      </div>
      {estimateRevision != null ? (
        <div>
          <dt>Estimate revision</dt>
          <dd data-testid="eq-ai-estimate-revision">R{estimateRevision}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function ApprovedMeasurementsCard(props: {
  summary: ApprovalSummary | null;
  estimateRevision: number | null;
  activeReview: ActiveReview | null;
  publishBusy: boolean;
  publishError: string | null;
  publishLabel: string;
  eligible: boolean;
  estimateId: string | null;
  onEdit: () => void;
  onPublish: () => void;
}) {
  return (
    <section
      className="eq-ai-approved-card"
      data-testid="eq-ai-approved-measurements"
      aria-label="Measurements approved"
    >
      <h2>Measurements approved</h2>
      <MeasurementSummaryDl summary={props.summary} estimateRevision={props.estimateRevision} />
      {props.activeReview && !props.activeReview.eligible ? (
        <ul className="eq-list eq-list--attention" data-testid="eq-ai-publish-blockers">
          {props.activeReview.blockers.map((b, i) => (
            <li key={`${b.code || "b"}-${i}`}>{b.message || b.code}</li>
          ))}
        </ul>
      ) : null}
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
      <div className="eq-action-row">
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
  summary: ApprovalSummary | null;
  estimateRevision: number | null;
  customerUrl: string;
  onEdit: () => void;
  onCopy: () => void;
}) {
  return (
    <section
      className="eq-ai-approved-card"
      data-testid="eq-ai-published-estimate"
      aria-label="Digital Estimate published"
    >
      <h2>Digital Estimate published</h2>
      <MeasurementSummaryDl summary={props.summary} estimateRevision={props.estimateRevision} />
      <div className="eq-action-row">
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
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
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
    (est: Record<string, unknown> | null | undefined) => {
      if (!est) return;
      onEstimateReady?.(est);
      const id = String(est.id || "").trim();
      if (id) setEstimateId(id);
      if (est.revision != null) setEstimateRevision(Number(est.revision) || null);
      const ar = est.activeReview as ActiveReview | undefined;
      setActiveReview(ar && typeof ar === "object" ? ar : null);
      const next = buildApprovalSummaryFromEstimate(est, pendingSummaryRef.current);
      if (next) setSummary(next);
    },
    [onEstimateReady]
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

        applyEstimateView(view);
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
      };
      const next = body.estimate;
      if (next) {
        applyEstimateView(next);
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

  const eligible = activeReview ? activeReview.eligible : Boolean(estimateId);
  const publishRevised = shouldOfferPublishRevised({
    publishedRevision,
    estimateRevision,
    measurementsApproved
  });
  const publishLabel = publishRevised
    ? "Publish Revised Estimate"
    : "Publish Digital Estimate";

  const revisionBanner =
    editingRevision && estimateRevision != null
      ? `Editing measurement revision R${estimateRevision}`
      : null;

  const headerNode = header ? (
    <CompactEstimateHeader
      title={header.title}
      planFilename={header.planFilename}
      onViewPlan={header.onViewPlan}
      onBackToQueue={header.onBackToQueue}
      revisionBanner={revisionBanner || header.revisionBanner}
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

  return (
    <section className="eq-ai-estimator-workspace" data-testid="eq-ai-estimator-workspace">
      {headerNode}

      {editError ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-edit-error">
          {editError}
        </div>
      ) : null}

      {showTakeoff ? (
        <div data-testid="eq-ai-takeoff-surface">
          <p className="eq-footnote" data-testid="eq-takeoff-first-hint">
            Review and correct AI measurements in Takeoff Review below. Save draft, then approve
            measurements to build the verified estimate. Customer material and product choices happen
            in the Digital Estimate link after publish.
          </p>
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
          summary={summary}
          estimateRevision={estimateRevision}
          customerUrl={customerUrl}
          onEdit={() => void editMeasurements()}
          onCopy={() => void copyLink()}
        />
      ) : null}

      {(stage === "approved" || stage === "publishing") && measurementsApproved ? (
        <ApprovedMeasurementsCard
          summary={summary}
          estimateRevision={estimateRevision}
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
