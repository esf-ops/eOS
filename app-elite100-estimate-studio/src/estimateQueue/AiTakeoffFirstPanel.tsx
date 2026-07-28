/**
 * Takeoff-first AI estimating surface.
 *
 * Before approval: mounts the existing production Takeoff Review iframe only
 * (single editable geometry workspace). After approval: compact summary +
 * Publish Digital Estimate — no Scope / Customer Choices / Review tabs.
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

const PUBLISH_CLIENT_TIMEOUT_MS = 55_000;

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
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [customerUrl, setCustomerUrl] = useState<string | null>(null);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ai-tof-pub-${Date.now()}`
  );
  const handoffInFlightRef = useRef(false);

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
      const calc = (est.calculation as Record<string, unknown> | undefined) || null;
      const totals = (calc?.totals as Record<string, unknown> | undefined) || {};
      const billing = (calc?.scopeBilling as Record<string, unknown> | undefined) || {};
      const fab = (calc?.fabrication as Record<string, unknown> | undefined) || {};
      const edge = (fab?.edge as Record<string, unknown> | undefined) || {};
      setSummary((prev) => ({
        ...(prev || {}),
        countertopSf:
          num(billing.measuredCountertopSf) ||
          num(billing.billableCountertopSf) ||
          prev?.countertopSf ||
          0,
        backsplashSf: num(billing.backsplashSf) || prev?.backsplashSf || 0,
        edgeLf: num(edge.finalLf) || num(billing.edgeLf) || prev?.edgeLf || 0,
        customerDisplayTotal:
          totals.customerDisplayTotal != null ? num(totals.customerDisplayTotal) : prev?.customerDisplayTotal ?? null
      }));
    },
    [onEstimateReady]
  );

  const completeApprovalHandoff = useCallback(
    async (payload: Record<string, unknown> | null) => {
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
          setSummary({
            countertopSf: num(cs.countertopSf),
            backsplashSf: num(cs.backsplashSf),
            edgeLf: num((cs as { edgeLf?: number }).edgeLf),
            kitchenSinkCutouts: num(cs.kitchenSinkCutouts),
            vanityBarSinkCutouts: num(cs.vanityBarSinkCutouts),
            cooktopCutouts: num(cs.cooktopCutouts),
            outletCutouts: num(cs.outletCutouts),
            rooms: num(cs.rooms),
            includedPieces: num(cs.includedPieces)
          });
        }
        setMeasurementsApproved(true);

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

        await apiPost(
          `/api/elite100-estimate-studio/estimates/${encodeURIComponent(id)}/refresh-from-takeoff`,
          authToken,
          { force: true, confirm: true }
        );

        const priced = (await apiPost(
          `/api/elite100-estimate-studio/estimates/${encodeURIComponent(id)}/calculate`,
          authToken,
          {}
        )) as { estimate?: Record<string, unknown> } & Record<string, unknown>;

        const view = (priced.estimate || priced) as Record<string, unknown>;
        applyEstimateView(view);
      } catch (e) {
        setHandoffError(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Unable to build the verified estimate from approved Takeoff"
        );
      } finally {
        handoffInFlightRef.current = false;
        setHandoffBusy(false);
      }
    },
    [authToken, caseId, takeoffJobId, applyEstimateView]
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

  // If Takeoff was already approved before this session, restore the compact card.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const job = (await apiGet(
          `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
          authToken
        )) as { reviewStatus?: string };
        if (cancelled) return;
        if (String(job.reviewStatus || "").toLowerCase() === "approved") {
          await completeApprovalHandoff({ reviewStatus: "approved" });
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, takeoffJobId]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot restore

  async function saveProjectFields() {
    if (!estimateId) return;
    setPublishError(null);
    try {
      const body = (await apiPost(
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
    } catch (e) {
      setPublishError(
        e instanceof ApiError ? e.message : "Unable to save project details"
      );
    }
  }

  async function publish() {
    if (!estimateId || publishBusy) return;
    setPublishBusy(true);
    setPublishError(null);
    try {
      if (
        activeReview &&
        !activeReview.eligible &&
        activeReview.blockers.some(
          (b) => b.code === "customer_email_required" || b.code === "project_name_required"
        )
      ) {
        await saveProjectFields();
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
    setMeasurementsApproved(false);
    setCustomerUrl(null);
    setPublishError(null);
    setHandoffError(null);
  }

  const needEmail = Boolean(
    activeReview?.blockers?.some((b) => b.code === "customer_email_required") ||
      (!String(customerEmail || "").trim() && measurementsApproved)
  );
  const needProject = Boolean(
    activeReview?.blockers?.some((b) => b.code === "project_name_required") ||
      (!String(projectName || "").trim() && measurementsApproved)
  );
  const eligible = activeReview ? activeReview.eligible : Boolean(estimateId && !needEmail && !needProject);

  if (!measurementsApproved) {
    return (
      <section className="eq-ai-takeoff-first" data-testid="eq-ai-takeoff-first">
        <p className="eq-footnote" data-testid="eq-takeoff-first-hint">
          Review and correct AI measurements in Takeoff Review below. Save draft, then approve
          measurements to build the verified estimate. Customer material and product choices happen
          in the Digital Estimate link after publish.
        </p>
        <div className="eq-takeoff-frame-wrap">
          <iframe
            ref={takeoffFrameRef}
            title="AI Takeoff review"
            className="eq-takeoff-frame"
            data-testid="eq-takeoff-iframe"
            src={takeoffSrc}
            referrerPolicy="origin"
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
      {handoffBusy ? (
        <p className="eq-muted" role="status">
          Building verified estimate…
        </p>
      ) : null}
      {handoffError ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-handoff-error">
          {handoffError}
        </div>
      ) : null}
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
                onChange={(e) => setProjectName(e.target.value)}
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
                onChange={(e) => setCustomerEmail(e.target.value)}
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
