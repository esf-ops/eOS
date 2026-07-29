/**
 * AiEstimatorWorkspace — single active AI-assisted estimator experience.
 *
 * PersistentTakeoffSection (Takeoff iframe) stays mounted for every stage.
 * Stage cards (approved / published) render below; mode switches editable ↔ readonly.
 *
 * Does not mount ManualPhysicalScopeEditor, EstimateScopePanel, tabs,
 * EstimateWorkflowHeader, EstimateDigitalEstimatePanel, or Customer Choices.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiGet,
  apiPost,
  apiPatch,
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
import {
  DigitalEstimateSection,
  EstimateRecordHeader,
  VerifiedEstimateSection
} from "./estimateRecord/EstimateRecordSections";
import {
  CommercialConfigurationSection,
  EstimateRevisionHistory
} from "./estimateRecord/CommercialConfigurationSection";

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
      <div className="eq-action-row eq-ai-stage-actions">
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

      <div className="eq-action-row eq-ai-stage-actions">
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
  const [takeoffCollapsed, setTakeoffCollapsed] = useState(false);
  /** Stable Takeoff mount — never remount on calculate/approve/publish/draft fork. */
  const takeoffMountIdRef = useRef(`takeoff-${takeoffJobId}`);
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
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [commercialDirty, setCommercialDirty] = useState(false);
  const [takeoffDirty, setTakeoffDirty] = useState(false);
  const [revisionSaveStatus, setRevisionSaveStatus] = useState<string | null>(null);
  const [commercialConfig, setCommercialConfig] = useState<Record<string, unknown> | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<
    Array<{
      revision: number;
      status: string;
      createdAt?: string | null;
      approvedAt?: string | null;
      publishedAt?: string | null;
      isActivePublication?: boolean;
      countertopSf?: number | null;
      backsplashSf?: number | null;
      displayTotal?: number | null;
      basedOnRevision?: number | null;
      summary?: string | null;
    }>
  >([]);
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
      const commercial = est.commercialConfiguration as Record<string, unknown> | undefined;
      if (commercial && typeof commercial === "object") {
        setCommercialConfig(commercial);
      }
      const summary = summarizeFromEstimate(est, prior || null, publication || null, deRead);
      const rev = Number(est.revision) || 1;
      setRevisionHistory((prev) => {
        const nextEntry = {
          revision: rev,
          status: String(est.status || "draft"),
          createdAt: (est.createdAt as string) || null,
          approvedAt: (est.approvedAt as string) || null,
          publishedAt:
            ((publication || publicationSummary) as { publishedAt?: string } | null)?.publishedAt ||
            null,
          isActivePublication: Boolean(customerUrl) && publishedRevision === rev,
          countertopSf: summary?.measurements?.countertopSf ?? null,
          backsplashSf: summary?.measurements?.backsplashSf ?? null,
          displayTotal: summary?.pricing?.customerDisplayTotal ?? null,
          basedOnRevision: prior ? Number((prior as { revision?: number }).revision) || null : null,
          summary: null as string | null
        };
        const without = prev.filter((r) => r.revision !== rev);
        return [...without, nextEntry].sort((a, b) => a.revision - b.revision);
      });
    },
    [onEstimateReady, priorEstimate, publicationSummary, deRead, customerUrl, publishedRevision]
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

  /**
   * Transparent editable draft acquisition. Does not remount Takeoff.
   * Idempotent — reuses an existing sibling draft when present.
   */
  async function ensureEditableDraft(basedOnId?: string | null): Promise<string | null> {
    const sourceId = String(basedOnId || estimateId || "").trim();
    if (!sourceId) {
      handoffSucceededRef.current = false;
      setMeasurementsApproved(false);
      setEditingRevision(true);
      return null;
    }
    setEditError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(sourceId)}/ensure-editable-draft`,
        authToken,
        { basedOnRevisionId: sourceId }
      )) as {
        estimate?: Record<string, unknown>;
        reused?: boolean;
        created?: boolean;
        priorEstimate?: Record<string, unknown> | null;
        previousRevisionSummary?: Record<string, unknown> | null;
      };
      const next = body.estimate;
      const prior = body.priorEstimate || priorEstimate;
      if (next) {
        applyEstimateView(next, { prior: prior || null });
      }
      handoffSucceededRef.current = false;
      setMeasurementsApproved(false);
      setEditingRevision(true);
      setTakeoffCollapsed(false);
      // Keep customerUrl + publishedRevision — R1 remains active for the customer.
      return next?.id ? String(next.id) : sourceId;
    } catch (e) {
      if (!isAbortError(e)) {
        setEditError(
          "We couldn’t start an editable draft. Your published estimate was not changed."
        );
      }
      return null;
    }
  }

  async function editEstimate() {
    setPublishError(null);
    setHandoffError(null);
    setRevisionSaveStatus(null);
    await ensureEditableDraft(estimateId);
  }

  function retryHandoff() {
    void completeApprovalHandoff({ reviewStatus: "approved" });
  }

  const takeoffMode =
    stage === "processing" ||
    stage === "draft" ||
    stage === "revision_draft" ||
    stage === "approving"
      ? "editable"
      : "readonly";

  const takeoffHeading = (() => {
    const rev = estimateRevision != null ? `R${estimateRevision}` : "—";
    if (stage === "published") {
      return `Published measurements — Revision ${
        publishedRevision != null ? `R${publishedRevision}` : rev
      }`;
    }
    if (stage === "approved" || stage === "publishing") {
      return `Approved Takeoff — Revision ${rev}`;
    }
    if (stage === "revision_draft") {
      return `AI Takeoff Review — editing revision ${rev}`;
    }
    return "AI Takeoff Review";
  })();

  // Takeoff src is intentionally stable for the lifetime of this workspace mount.
  // Mode/revision badges update outside the iframe — never remount into empty/processing.
  const takeoffSrc = useMemo(() => {
    const params = new URLSearchParams({
      takeoffJobId: String(takeoffJobId),
      consolidated: "1",
      mode: "editable",
      persistentWorkspace: "1"
    });
    return `${aiTakeoffHeadUrl()}/?${params.toString()}`;
  }, [takeoffJobId]);

  const mutationSeqRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);

  async function saveCommercial(payload: {
    customLineItems: Array<Record<string, unknown>>;
    estimateWideAdjustment: Record<string, unknown>;
    roomConfigurations?: Record<string, unknown>;
  }) {
    let targetId = estimateId;
    if (!targetId) {
      throw new Error("Estimate is not ready to save adjustments");
    }
    // Transparent draft when current revision is frozen.
    if (measurementsApproved || stage === "approved" || stage === "published") {
      const draftId = await ensureEditableDraft(targetId);
      if (!draftId) {
        setCommercialError(
          "We couldn’t start an editable draft. Your published estimate was not changed."
        );
        setRevisionSaveStatus("Save failed");
        setCommercialDirty(true);
        throw new Error("editable_draft_unavailable");
      }
      targetId = draftId;
    }
    const seq = ++mutationSeqRef.current;
    setCommercialBusy(true);
    setCommercialError(null);
    setRevisionSaveStatus("Saving…");
    try {
      const customLineItems = payload.customLineItems.map((l) => ({
        id: l.id,
        name: l.description,
        customerDescription: l.description,
        category: l.category,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        customerFacing: l.customerVisible !== false,
        commercialRole: l.commercialRole || "customer_charge",
        percentageEligible: l.percentageEligible !== false,
        internalNotes: l.reason || "",
        roomId: l.roomId || null
      }));
      const scopePatch: Record<string, unknown> = {
        customLineItems,
        estimateWideAdjustment: {
          ...payload.estimateWideAdjustment,
          updatedAt: new Date().toISOString()
        }
      };
      if (payload.roomConfigurations) {
        scopePatch.roomConfigurations = payload.roomConfigurations;
      }
      const updated = (await apiPatch(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(targetId)}`,
        authToken,
        { scope: scopePatch }
      )) as { estimate?: Record<string, unknown>; id?: string; forkedFromEstimateId?: string };
      const calcId = String(updated.estimate?.id || updated.id || targetId);
      setRevisionSaveStatus("Calculation updating…");
      const calculated = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(calcId)}/calculate`,
        authToken,
        { clientMutationSeq: seq }
      )) as { estimate?: Record<string, unknown> };
      if (seq < lastAppliedSeqRef.current) {
        // Stale response — keep last successful totals.
        return;
      }
      lastAppliedSeqRef.current = seq;
      const est = calculated.estimate || updated.estimate || updated;
      if (est) applyEstimateView(est as Record<string, unknown>);
      setCommercialDirty(false);
      setRevisionSaveStatus("Saved");
    } catch (e) {
      if (!isAbortError(e)) {
        const technical =
          e instanceof ApiError
            ? `status=${e.status} ${String(e.message || "").slice(0, 200)}`
            : String(e);
        console.error("[estimate-record] adjustment save failed", technical);
        setCommercialError("Your estimate adjustments were not saved. Try again.");
        setRevisionSaveStatus("Save failed");
        setCommercialDirty(true);
      }
      throw e;
    } finally {
      setCommercialBusy(false);
    }
  }

  // Unified autosave — one visible save state for the whole workspace.
  const commercialSaveRef = useRef<typeof saveCommercial | null>(null);
  commercialSaveRef.current = saveCommercial;
  const pendingCommercialPayloadRef = useRef<Parameters<typeof saveCommercial>[0] | null>(null);
  useEffect(() => {
    if (!commercialDirty || commercialBusy) return;
    const handle = window.setTimeout(() => {
      const payload = pendingCommercialPayloadRef.current;
      if (!payload) return;
      void commercialSaveRef.current?.(payload).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [commercialDirty, commercialBusy]);

  const revisionBanner =
    editingRevision && estimateRevision != null
      ? publishedRevision != null
        ? `Draft R${estimateRevision} based on published R${publishedRevision}`
        : `Draft R${estimateRevision} based on approved R${Math.max(1, (estimateRevision || 1) - 1) || 1}`
      : null;

  const measurementStatusLabel =
    stage === "processing"
      ? "Takeoff processing"
      : stage === "approving"
        ? "Approving estimate"
        : measurementsApproved
          ? "Estimate approved"
          : stage === "revision_draft"
            ? "Editing estimate revision"
            : "Estimate draft";

  const publicationStatusLabel =
    stage === "published"
      ? "Digital Estimate published"
      : stage === "publishing"
        ? "Publishing…"
        : measurementsApproved
          ? "Ready to publish"
          : "Not published";

  // Draft mutations are always allowed — frozen revisions transparently fork.
  const adjustmentsEditable =
    Boolean(estimateId) && stage !== "processing" && stage !== "approving";

  const aggregatedSaveStatus =
    revisionSaveStatus ||
    (commercialDirty || takeoffDirty
      ? "Unsaved changes"
      : header?.draftSaveStatus || null);

  const headerNode = (
    <EstimateRecordHeader
      title={header?.title || header?.planFilename || "Estimate"}
      planFilename={header?.planFilename || ""}
      estimateRevision={estimateRevision}
      publishedRevision={publishedRevision}
      measurementStatus={measurementStatusLabel}
      publicationStatus={publicationStatusLabel}
      customerActivityLabel={aiSummary?.publication?.customerActivityLabel || null}
      revisionBanner={revisionBanner || header?.revisionBanner || null}
      draftSaveStatus={aggregatedSaveStatus}
      onViewPlan={header?.onViewPlan}
      onBackToQueue={header?.onBackToQueue}
    />
  );

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
    <section
      className="eq-ai-estimator-workspace eq-estimate-record"
      data-testid="eq-ai-estimator-workspace"
      data-estimate-record="1"
    >
      {headerNode}

      {editError ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-edit-error">
          {editError}
        </div>
      ) : null}

      <div
        className="eq-ai-takeoff-layout eq-ai-persistent-takeoff"
        data-testid="eq-ai-takeoff-surface"
        data-takeoff-mode={takeoffMode}
      >
        <div className="eq-ai-takeoff-layout__intro">
          <div className="eq-ai-takeoff-heading-row">
            <h2 className="eq-ai-section-title" data-testid="eq-ai-takeoff-review-heading">
              {takeoffHeading}
            </h2>
            <button
              type="button"
              className="eq-btn-ghost"
              data-testid="eq-ai-takeoff-collapse"
              aria-expanded={!takeoffCollapsed}
              onClick={() => setTakeoffCollapsed((v) => !v)}
            >
              {takeoffCollapsed ? "Expand Takeoff" : "Collapse"}
            </button>
          </div>
          {takeoffMode === "readonly" &&
          publishedRevision != null &&
          estimateRevision != null &&
          estimateRevision > publishedRevision ? (
            <p className="eq-footnote" data-testid="eq-ai-takeoff-dual-revision-notice">
              Viewing approved measurements R{estimateRevision}. Current customer publication: R
              {publishedRevision}.
            </p>
          ) : null}
          <p className="eq-footnote" data-testid="eq-takeoff-first-hint">
            Edit measurements anytime. Changes autosave and recalculate the live draft estimate.
            Approve Estimate freezes the revision when you are ready to publish.
          </p>
          {takeoffMode === "readonly" ? (
            <div className="eq-action-row">
              <button
                type="button"
                className="eq-btn-secondary"
                data-testid="eq-edit-estimate"
                onClick={() => void editEstimate()}
              >
                Edit Estimate
              </button>
            </div>
          ) : null}
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
          hidden={takeoffCollapsed}
        >
          {/* Never overlay a populated Takeoff with a processing/empty state. */}
          <iframe
            key={takeoffMountIdRef.current}
            ref={takeoffFrameRef}
            title="AI Takeoff review"
            className="eq-takeoff-frame"
            data-testid="eq-takeoff-iframe"
            data-mode={takeoffMode}
            data-stable-mount="1"
            src={takeoffSrc}
            referrerPolicy="origin"
          />
        </div>
      </div>

      <VerifiedEstimateSection
        waiting={false}
        draftMode={!measurementsApproved}
        aiSummary={aiSummary}
        estimateRevision={estimateRevision}
        publishedRevision={publishedRevision}
        activeReview={activeReview}
        calculationStatus={revisionSaveStatus}
      />

      <CommercialConfigurationSection
        editable={adjustmentsEditable}
        commercial={commercialConfig}
        busy={commercialBusy}
        error={commercialError}
        dirty={commercialDirty}
        measurementsApproved={measurementsApproved}
        onDirtyChange={(d, payload) => {
          setCommercialDirty(d);
          if (d) {
            setRevisionSaveStatus("Unsaved changes");
            if (payload) pendingCommercialPayloadRef.current = payload;
          }
        }}
        onSave={async (payload) => {
          pendingCommercialPayloadRef.current = payload;
          await saveCommercial(payload);
        }}
      />

      <DigitalEstimateSection
        stage={stage}
        measurementsApproved={measurementsApproved}
        estimateRevision={estimateRevision}
        publishedRevision={publishedRevision}
        customerUrl={customerUrl}
        aiSummary={aiSummary}
        publishBusy={publishBusy}
        publishError={publishError}
        publishLabel={publishLabel}
        eligible={eligible && !commercialDirty && revisionSaveStatus !== "Save failed"}
        estimateId={estimateId}
        showPublishRevised={publishRevised}
        onPublish={() => void publish()}
        onCopy={() => void copyLink()}
        onCreateRevision={() => void editEstimate()}
      />

      <EstimateRevisionHistory
        revisions={revisionHistory}
        comparison={aiSummary?.comparison || null}
      />
    </section>
  );
}
