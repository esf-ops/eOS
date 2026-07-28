/**
 * Takeoff-first AI estimating surface.
 *
 * Before approval: mounts the existing production Takeoff Review iframe only
 * (single editable geometry workspace). After a *successful* handoff: compact
 * summary + Publish Digital Estimate — no Scope / Customer Choices / Review tabs.
 *
 * measurementsApproved flips only after refresh-from-takeoff + calculate succeed.
 * A failed handoff keeps the iframe mounted and never shows a zero-value card.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
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

type Props = {
  authToken: string;
  caseId: string;
  takeoffJobId: string;
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

export default function AiTakeoffFirstPanel({
  authToken,
  caseId,
  takeoffJobId,
  onEstimateReady
}: Props) {
  const takeoffFrameRef = useRef<HTMLIFrameElement | null>(null);
  // Stable iframe src — never rewrite after mount (avoids wiping dirty draft).
  const [takeoffSrc] = useState(
    () => `${aiTakeoffHeadUrl()}/?takeoffJobId=${encodeURIComponent(takeoffJobId)}&consolidated=1`
  );
  const [measurementsApproved, setMeasurementsApproved] = useState(false);
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [estimateRevision, setEstimateRevision] = useState<number | null>(null);
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const [projectName, setProjectName] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffErrorCode, setHandoffErrorCode] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [detailsSavedNotice, setDetailsSavedNotice] = useState<string | null>(null);
  const [customerUrl, setCustomerUrl] = useState<string | null>(null);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ai-tof-pub-${Date.now()}`
  );
  const handoffInFlightRef = useRef(false);
  const handoffSucceededRef = useRef(false);
  const pendingSummaryRef = useRef<ApprovalSummary | null>(null);

  const applyEstimateView = useCallback(
    (est: Record<string, unknown> | null | undefined) => {
      if (!est) return;
      onEstimateReady?.(est);
      const id = String(est.id || "").trim();
      if (id) setEstimateId(id);
      if (est.revision != null) setEstimateRevision(Number(est.revision) || null);
      const ar = est.activeReview as ActiveReview | undefined;
      setActiveReview(ar && typeof ar === "object" ? ar : null);
      const scope = (est.scope as Record<string, unknown> | undefined) || {};
      setCustomerEmail(String(scope.customerEmail || ""));
      setProjectName(String(scope.projectName || ""));
      // Authoritative mapping from refreshed/calculated estimate — pending
      // postMessage summary is only a final compatibility fallback.
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
      setHandoffErrorCode(null);
      // Keep Takeoff mounted — never flip measurementsApproved until success.
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

        const created = (await apiGet(
          `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/estimate?takeoffJobId=${encodeURIComponent(takeoffJobId)}`,
          authToken
        )) as { estimate?: Record<string, unknown> };
        const est = created.estimate;
        const id = String(est?.id || "").trim();
        if (!id) {
          throw new Error("Studio estimate was not created after Takeoff approval");
        }
        setEstimateId(id);

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
        setMeasurementsApproved(true);
      } catch (e) {
        const body =
          e instanceof ApiError && e.body && typeof e.body === "object"
            ? (e.body as Record<string, unknown>)
            : null;
        setHandoffErrorCode(body?.code ? String(body.code) : null);
        setHandoffError(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Unable to build the verified estimate from approved Takeoff"
        );
        // Keep iframe; never show zero-value approved summary.
        setMeasurementsApproved(false);
      } finally {
        handoffInFlightRef.current = false;
        setHandoffBusy(false);
      }
    },
    [authToken, caseId, takeoffJobId, applyEstimateView, refreshFromTakeoffWithRetry]
  );

  // postMessage from Takeoff Review → approval handoff (geometry authority).
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isAllowedTakeoffMessageOrigin(String(event.origin || ""))) return;
      const frameWin = takeoffFrameRef.current?.contentWindow;
      if (frameWin && event.source && event.source !== frameWin) return;
      if (!isValidTakeoffApprovedMessage(event.data, takeoffJobId)) return;
      const data =
        event.data && typeof event.data === "object"
          ? (event.data as Record<string, unknown>)
          : null;
      void completeApprovalHandoff(data);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [takeoffJobId, completeApprovalHandoff]);

  // Bounded fallback: recover a missed postMessage when the server already
  // reports approved — never remount/rewrite the iframe src.
  useEffect(() => {
    if (measurementsApproved || handoffSucceededRef.current) return;
    let cancelled = false;
    const startedAt = Date.now();
    let timer: number | null = null;

    async function tick() {
      if (cancelled || handoffSucceededRef.current || handoffInFlightRef.current) return;
      if (Date.now() - startedAt > APPROVAL_FALLBACK_MAX_MS) return;
      try {
        const job = (await apiGet(
          `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
          authToken
        )) as { reviewStatus?: string };
        if (cancelled || handoffSucceededRef.current) return;
        if (String(job.reviewStatus || "").toLowerCase() === "approved") {
          await completeApprovalHandoff({ reviewStatus: "approved" });
          return;
        }
      } catch {
        /* non-fatal — keep polling until bound */
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
  }, [authToken, takeoffJobId, measurementsApproved, completeApprovalHandoff]);

  /**
   * PATCH project details, then recalculate.
   * @returns {Promise<boolean>} true on success; false on failure (error already shown).
   */
  async function saveProjectFields(): Promise<boolean> {
    if (!estimateId) return false;
    setPublishError(null);
    setDetailsSavedNotice(null);
    try {
      const body = (await apiPatch(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/project-details`,
        authToken,
        { customerEmail, projectName }
      )) as { estimate?: Record<string, unknown> };
      applyEstimateView(body.estimate || null);
      const priced = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/calculate`,
        authToken,
        {}
      )) as Record<string, unknown>;
      applyEstimateView((priced.estimate as Record<string, unknown>) || priced);
      setDetailsSavedNotice("Details saved.");
      return true;
    } catch (e) {
      setPublishError(
        e instanceof ApiError ? e.message : "Unable to save project details"
      );
      return false;
    }
  }

  async function publish() {
    if (!estimateId || publishBusy) return;
    setPublishBusy(true);
    setPublishError(null);
    try {
      const needsDetails =
        activeReview &&
        !activeReview.eligible &&
        activeReview.blockers.some(
          (b) => b.code === "customer_email_required" || b.code === "project_name_required"
        );
      if (needsDetails) {
        const saved = await saveProjectFields();
        if (!saved) return;
      }
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/simplified-publish`,
        authToken,
        { confirm: true, idempotencyKey },
        { timeoutMs: PUBLISH_CLIENT_TIMEOUT_MS }
      )) as {
        customerUrl?: string | null;
        publication?: { customerUrl?: string | null };
      };
      const url =
        body.customerUrl ||
        body.publication?.customerUrl ||
        null;
      if (url) setCustomerUrl(url);
      else setPublishError("Published, but no customer link was returned.");
    } catch (e) {
      if (e instanceof ApiError) {
        const errBody =
          e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : {};
        const blockers = Array.isArray(errBody.blockers)
          ? (errBody.blockers as Array<{ message?: string }>)
          : [];
        setPublishError(blockers[0]?.message || e.message || "Unable to publish");
      } else if (!isAbortError(e)) {
        setPublishError(
          isTransientHttpError(e)
            ? transientFailureMessage(e)
            : "Unable to publish the Digital Estimate"
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

  function editMeasurements() {
    handoffSucceededRef.current = false;
    setMeasurementsApproved(false);
    setCustomerUrl(null);
    setPublishError(null);
    setHandoffError(null);
    setHandoffErrorCode(null);
  }

  function retryHandoff() {
    void completeApprovalHandoff({ reviewStatus: "approved" });
  }

  const needEmail = Boolean(
    activeReview?.blockers?.some((b) => b.code === "customer_email_required") ||
      (!String(customerEmail || "").trim() && measurementsApproved)
  );
  const needProject = Boolean(
    activeReview?.blockers?.some((b) => b.code === "project_name_required") ||
      (!String(projectName || "").trim() && measurementsApproved)
  );
  const eligible = activeReview
    ? activeReview.eligible
    : Boolean(estimateId && !needEmail && !needProject);

  if (!measurementsApproved) {
    return (
      <section className="eq-ai-takeoff-first" data-testid="eq-ai-takeoff-first">
        <p className="eq-footnote" data-testid="eq-takeoff-first-hint">
          Review and correct AI measurements in Takeoff Review below. Save draft, then approve
          measurements to build the verified estimate. Customer material and product choices happen
          in the Digital Estimate link after publish.
        </p>
        {handoffError ? (
          <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-handoff-error">
            <strong>Could not build the verified estimate.</strong> {handoffError}
            {handoffErrorCode ? (
              <p className="eq-muted">Code: {handoffErrorCode}</p>
            ) : null}
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
            handoffBusy ? "eq-takeoff-frame-wrap eq-takeoff-frame-wrap--busy" : "eq-takeoff-frame-wrap"
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
            // Keep mounted during handoff; overlay blocks further interaction.
            style={handoffBusy ? { pointerEvents: "none" } : undefined}
          />
        </div>
      </section>
    );
  }

  const openings =
    num(summary?.kitchenSinkCutouts) +
    num(summary?.vanityBarSinkCutouts) +
    num(summary?.cooktopCutouts) +
    num(summary?.outletCutouts);

  return (
    <section
      className="eq-ai-approved-card"
      data-testid="eq-ai-approved-measurements"
      aria-label="Measurements approved"
    >
      <h2>Measurements approved</h2>
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
          <dd data-testid="eq-ai-verified-openings">{openings}</dd>
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
            <dd>{estimateRevision}</dd>
          </div>
        ) : null}
      </dl>

      {(needEmail || needProject) && (
        <div className="eq-ai-publish-fields" data-testid="eq-ai-publish-required-fields">
          <p className="eq-muted">Required to publish:</p>
          {needProject ? (
            <label>
              Project name
              <input
                type="text"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  setDetailsSavedNotice(null);
                }}
                data-testid="eq-ai-project-name"
              />
            </label>
          ) : null}
          {needEmail ? (
            <label>
              Customer email
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => {
                  setCustomerEmail(e.target.value);
                  setDetailsSavedNotice(null);
                }}
                data-testid="eq-ai-customer-email"
              />
            </label>
          ) : null}
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="eq-ai-save-project-fields"
            onClick={() => void saveProjectFields()}
          >
            Save details
          </button>
          {detailsSavedNotice ? (
            <p className="eq-muted" data-testid="eq-ai-details-saved" role="status">
              {detailsSavedNotice}
            </p>
          ) : null}
        </div>
      )}

      {activeReview && !activeReview.eligible && !(needEmail || needProject) ? (
        <ul className="eq-list eq-list--attention" data-testid="eq-ai-publish-blockers">
          {activeReview.blockers.map((b, i) => (
            <li key={`${b.code || "b"}-${i}`}>{b.message || b.code}</li>
          ))}
        </ul>
      ) : null}

      {publishError ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-publish-error">
          {publishError}
        </div>
      ) : null}

      <div className="eq-action-row">
        <button
          type="button"
          className="eq-btn-ghost"
          data-testid="eq-ai-edit-measurements"
          onClick={editMeasurements}
        >
          Edit measurements
        </button>
        <button
          type="button"
          className="eq-btn-primary"
          disabled={publishBusy || handoffBusy || !estimateId || (!eligible && (needEmail || needProject))}
          data-testid="eq-publish-digital-estimate"
          onClick={() => void publish()}
        >
          {publishBusy ? "Publishing…" : customerUrl ? "Re-publish Digital Estimate" : "Publish Digital Estimate"}
        </button>
        {customerUrl ? (
          <>
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-copy-customer-link"
              onClick={() => void copyLink()}
            >
              Copy Customer Link
            </button>
            <a
              className="eq-btn-secondary"
              href={customerUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="eq-open-customer-preview"
            >
              Open Customer Preview
            </a>
          </>
        ) : null}
      </div>
      {customerUrl ? (
        <p className="eq-muted" data-testid="eq-ai-customer-url">
          {customerUrl}
        </p>
      ) : null}
    </section>
  );
}
