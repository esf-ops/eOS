import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  classifyQuoteIntakeError,
  createQuoteIntakeApiClient
} from "../lib/quoteIntakeApi.mjs";
import {
  caseCustomerProjectLabel,
  caseStatusLabel,
  safeText
} from "../lib/quoteIntakeFormat.mjs";
import { deriveEstimateTakeoffDisplayStatus } from "../lib/estimateTakeoffStatus.mjs";
import type { QuoteIntakeCaseDto } from "../lib/quoteIntakeTypes";
import { apiGet, ApiError, transientFailureMessage } from "../lib/api";
import {
  fetchIntakePlanContent,
  fetchIntakeSourcePlans
} from "../lib/securePlanViewerApi.mjs";
import PlanViewerModal from "./PlanViewerModal";
import {
  buildStudioWorkspaceWorkflow
} from "../../../backend-core/src/elite100EstimateStudio/studioWorkspaceWorkflow.mjs";
import EstimateScopePanel from "./EstimateScopePanel";
import ManualPhysicalScopeEditor from "./ManualPhysicalScopeEditor";
import ProjectDetailsPanel from "./ProjectDetailsPanel";
import EstimateWorkflowHeader, { type WorkspaceWorkflow } from "./EstimateWorkflowHeader";
import EstimatePublicationSummary, {
  type PublicationSummary
} from "./EstimatePublicationSummary";
import {
  aiTakeoffHeadUrl,
  isAllowedTakeoffMessageOrigin,
  isValidTakeoffApprovedMessage
} from "./takeoffPostMessageOrigins.mjs";

type Props = {
  authToken: string;
  caseId: string;
  initialFocus?: "takeoff" | "scope" | "digital" | "review" | null;
  onBackToQueue: () => void;
};

type ReadyState = {
  kind: "ready";
  takeoffJobId: string | null;
  manualMode: boolean;
  estimateId: string | null;
  accountDirectoryLinked: boolean;
  linkStatus: string;
  created: boolean;
  reused: boolean;
  attachmentName: string;
  persistenceWarning: string | null;
  caseRow: QuoteIntakeCaseDto | null;
  displayStatus: string;
  scopeRefreshKey: number;
  handoffNotice: string | null;
};

type OpenState =
  | { kind: "resolving" }
  | ReadyState
  | { kind: "error"; message: string; code?: string };

function formatPlanBytes(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function planTypeLabel(contentType?: string | null, filename?: string | null): string {
  const mime = String(contentType || "").toLowerCase();
  const name = String(filename || "").toLowerCase();
  if (mime.includes("pdf") || /\.pdf$/i.test(name)) return "PDF";
  if (mime.includes("png") || /\.png$/i.test(name)) return "PNG";
  if (mime.includes("jpeg") || mime.includes("jpg") || /\.jpe?g$/i.test(name)) return "JPEG";
  if (mime.includes("webp") || /\.webp$/i.test(name)) return "WebP";
  return mime || "File";
}

function formatReceivedAt(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/**
 * Linked Takeoff workspace — resolves/creates intake→takeoff link, then embeds
 * the existing production AI Takeoff review UI for that job id.
 */
export default function EstimateTakeoffWorkspace({
  authToken,
  caseId,
  initialFocus = "takeoff",
  onBackToQueue
}: Props) {
  const client = useMemo(() => createQuoteIntakeApiClient(), []);
  const takeoffFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [state, setState] = useState<OpenState>({ kind: "resolving" });
  // Unmount Takeoff iframe when opening Scope/Digital/Review so its /results/latest
  // poll cannot leak into Estimate Queue after navigation.
  const [takeoffFrameMounted, setTakeoffFrameMounted] = useState(
    () => !initialFocus || initialFocus === "takeoff"
  );
  const [forceProjectEdit, setForceProjectEdit] = useState(false);
  const [canonicalEstimate, setCanonicalEstimate] = useState<Record<string, unknown> | null>(null);
  const [manualDirty, setManualDirty] = useState(false);
  const [pricingDirty, setPricingDirty] = useState(false);
  const [sourcePlans, setSourcePlans] = useState<{
    sourceLabel: string;
    receivedAt?: string | null;
    noPlan: boolean;
    plans: Array<{
      attachmentId?: string | null;
      filename: string;
      contentType?: string | null;
      sizeBytes?: number | null;
      primary?: boolean;
    }>;
  } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planViewerAtt, setPlanViewerAtt] = useState<{
    attachmentId: string;
    filename: string;
    contentType?: string | null;
    sizeBytes?: number | null;
    sourceContext: "linked-estimate" | "ai-takeoff";
  } | null>(null);
  const [previousRevisionSummary, setPreviousRevisionSummary] = useState<Record<string, unknown> | null>(
    null
  );
  const [transientError, setTransientError] = useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [publicationRefreshError, setPublicationRefreshError] = useState<string | null>(null);
  const [sectionsExpanded, setSectionsExpanded] = useState(false);

  const publicationSummary = useMemo((): PublicationSummary | null => {
    const fromEst =
      (canonicalEstimate?.publication as PublicationSummary | undefined) ||
      (canonicalEstimate?.publicationSummary as PublicationSummary | undefined) ||
      ((canonicalEstimate?.workflow as { publication?: PublicationSummary } | undefined)?.publication ??
        null);
    return fromEst && typeof fromEst === "object" ? fromEst : null;
  }, [canonicalEstimate]);

  const workspaceWorkflow = useMemo((): WorkspaceWorkflow | null => {
    if (!canonicalEstimate) return null;
    return buildStudioWorkspaceWorkflow(canonicalEstimate, {
      manualScopeDirty: manualDirty,
      pricingDirty,
      historicalApproval: previousRevisionSummary,
      publication: publicationSummary
    }) as WorkspaceWorkflow;
  }, [canonicalEstimate, manualDirty, pricingDirty, previousRevisionSummary, publicationSummary]);

  const publishedFocus =
    Boolean(publicationSummary?.active) &&
    !manualDirty &&
    !pricingDirty &&
    (initialFocus === "digital" ||
      initialFocus === "review" ||
      workspaceWorkflow?.currentStage === "published");

  const collapseCompleted = publishedFocus && !sectionsExpanded;

  function bumpRefresh(patch?: Partial<ReadyState>) {
    setState((prev) =>
      prev.kind === "ready"
        ? { ...prev, scopeRefreshKey: prev.scopeRefreshKey + 1, ...patch }
        : prev
    );
  }

  function applyActiveEstimateChange(
    nextId: string,
    meta?: { revision?: number; previousRevisionSummary?: unknown }
  ) {
    setState((prev) => {
      if (prev.kind !== "ready") return prev;
      if (prev.estimateId === nextId) return prev;
      return {
        ...prev,
        estimateId: nextId,
        scopeRefreshKey: prev.scopeRefreshKey + 1
      };
    });
    if (meta?.previousRevisionSummary && typeof meta.previousRevisionSummary === "object") {
      setPreviousRevisionSummary(meta.previousRevisionSummary as Record<string, unknown>);
    }
  }

  function handleCanonicalEstimate(est: Record<string, unknown> | null) {
    if (!est) return;
    setCanonicalEstimate(est);
    const id = String(est.id || "").trim();
    if (id) {
      setState((prev) =>
        prev.kind === "ready" && prev.estimateId !== id
          ? { ...prev, estimateId: id }
          : prev
      );
    }
    if (est.previousRevisionSummary && typeof est.previousRevisionSummary === "object") {
      setPreviousRevisionSummary(est.previousRevisionSummary as Record<string, unknown>);
    }
    setTransientError(null);
    setPendingRetry(null);
  }

  function handleTransientFailure(err: unknown, retry?: (() => void) | null) {
    setTransientError(transientFailureMessage(err));
    setPendingRetry(() => retry || null);
  }

  function refreshStatus() {
    setTransientError(null);
    setPendingRetry(null);
    bumpRefresh();
  }

  function onPrimaryWorkflowAction(action: string) {
    if (action === "confirm_manual_scope" || action === "save_manual_scope" || action === "complete_manual_scope") {
      document
        .querySelector('[data-testid="manual-physical-scope-editor"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "save_pricing" || action === "complete_pricing" || action === "calculate" || action === "approve") {
      document
        .querySelector('[data-testid="estimate-scope-panel"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (action === "calculate") {
        (document.querySelector('[data-testid="eq-calculate-estimate"]') as HTMLButtonElement | null)?.click();
      } else if (action === "approve") {
        (document.querySelector('[data-testid="eq-approve-estimate"]') as HTMLButtonElement | null)?.click();
      }
      return;
    }
    if (action === "add_project_name" || action === "edit_project_details") {
      setForceProjectEdit(true);
      return;
    }
    if (
      action === "wait_for_customer" ||
      action === "open_customer_view" ||
      action === "copy_customer_link" ||
      action === "open_publication_details" ||
      action === "configure_digital_estimate" ||
      action === "publish" ||
      action === "review_customer_request"
    ) {
      document
        .querySelector(
          '[data-testid="eq-publication-summary"], [data-testid="estimate-digital-estimate-panel"], [data-testid="eq-digital-estimate"]'
        )
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (action === "open_customer_view" && publicationSummary?.customerUrl) {
        window.open(publicationSummary.customerUrl, "_blank", "noopener,noreferrer");
      }
      if (action === "copy_customer_link") {
        (document.querySelector('[data-testid="eq-copy-customer-link"]') as HTMLButtonElement | null)?.click();
      }
    }
  }

  function scrollToPublicationDetails() {
    setSectionsExpanded(true);
    window.setTimeout(() => {
      document
        .querySelector('[data-testid="estimate-digital-estimate-panel"], [data-testid="eq-digital-estimate"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  useEffect(() => {
    let cancelled = false;
    async function open() {
      setState({ kind: "resolving" });
      try {
        let caseRow: QuoteIntakeCaseDto | null = null;
        try {
          caseRow = (await client.getCase(authToken, caseId)) as QuoteIntakeCaseDto;
        } catch {
          caseRow = null;
        }
        const sourceType = String(caseRow?.sourceType || "").toLowerCase();
        const isManual = sourceType === "manual";

        if (isManual) {
          const estBody = (await apiGet(
            `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/estimate`,
            authToken
          )) as {
            estimate?: {
              id?: string;
              accountDirectoryAccountId?: string | null;
              scope?: {
                estimateOrigin?: string;
                manualScopeConfirmed?: boolean;
                accountDirectoryAccountId?: string | null;
              };
            };
          };
          if (cancelled) return;
          const estimateId = String(estBody.estimate?.id || "").trim() || null;
          const confirmed = estBody.estimate?.scope?.manualScopeConfirmed === true;
          const adLinked = Boolean(
            estBody.estimate?.accountDirectoryAccountId ||
              estBody.estimate?.scope?.accountDirectoryAccountId
          );
          if (estBody.estimate) {
            setCanonicalEstimate(estBody.estimate as Record<string, unknown>);
          }
          setState({
            kind: "ready",
            takeoffJobId: null,
            manualMode: true,
            estimateId,
            accountDirectoryLinked: adLinked,
            linkStatus: "manual",
            created: false,
            reused: true,
            attachmentName: "No plan attachment",
            persistenceWarning: null,
            caseRow,
            displayStatus: confirmed ? "Manual scope confirmed" : "Manual scope needs confirmation",
            scopeRefreshKey: 0,
            handoffNotice: null
          });
          setTakeoffFrameMounted(false);
          return;
        }

        const opened = await client.openEstimate(authToken, caseId);
        if (cancelled) return;
        const takeoffJobId = String(opened.takeoffJobId ?? "").trim();
        if (!takeoffJobId) {
          setState({
            kind: "error",
            message: "Open Estimate did not return a takeoff job.",
            code: "takeoff_unavailable"
          });
          return;
        }

        let jobStatus = "";
        let reviewStatus = "";
        try {
          const job = (await apiGet(
            `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
            authToken
          )) as { status?: string; reviewStatus?: string };
          jobStatus = String(job.status ?? "");
          reviewStatus = String(job.reviewStatus ?? "");
        } catch {
          // Non-fatal — link still usable; embed Takeoff head for details.
        }

        setState({
          kind: "ready",
          takeoffJobId,
          manualMode: false,
          estimateId: null,
          accountDirectoryLinked: false,
          linkStatus: String(opened.linkStatus ?? "queued"),
          created: Boolean(opened.created),
          reused: Boolean(opened.reused),
          attachmentName: String(opened.attachmentName ?? "plan.pdf"),
          persistenceWarning:
            typeof opened.persistenceWarning === "string" ? opened.persistenceWarning : null,
          caseRow,
          displayStatus: deriveEstimateTakeoffDisplayStatus({
            takeoffJobId,
            linkStatus: opened.linkStatus,
            jobStatus,
            reviewStatus
          }),
          scopeRefreshKey: 0,
          handoffNotice: null
        });
      } catch (err) {
        if (cancelled) return;
        const classified = classifyQuoteIntakeError(err);
        const code =
          err && typeof err === "object" && "body" in err
            ? String((err as { body?: { code?: string } }).body?.code ?? "")
            : "";
        const message =
          err instanceof ApiError
            ? err.message
            : classified.message || "Unable to open estimate";
        setState({ kind: "error", message, code: code || classified.kind });
      }
    }
    void open();
    return () => {
      cancelled = true;
    };
  }, [authToken, caseId, client]);

  const workspaceReady = state.kind === "ready";
  const workspaceManual = state.kind === "ready" ? state.manualMode : false;

  useEffect(() => {
    if (!workspaceReady) {
      setSourcePlans(null);
      setSelectedPlanId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = (await fetchIntakeSourcePlans(authToken, caseId)) as {
          sourceLabel?: string;
          receivedAt?: string | null;
          noPlan?: boolean;
          plans?: Array<{
            attachmentId?: string | null;
            filename: string;
            contentType?: string | null;
            sizeBytes?: number | null;
            primary?: boolean;
          }>;
        };
        if (cancelled) return;
        const plans = Array.isArray(res.plans) ? res.plans : [];
        setSourcePlans({
          sourceLabel: String(res.sourceLabel || "Estimate request"),
          receivedAt: res.receivedAt ?? null,
          noPlan: Boolean(res.noPlan) || plans.length === 0,
          plans
        });
        const primary = plans.find((p) => p.primary) || plans[0];
        setSelectedPlanId(primary?.attachmentId ? String(primary.attachmentId) : null);
      } catch {
        if (!cancelled) {
          setSourcePlans({
            sourceLabel: workspaceManual ? "Manual estimate" : "Estimate request",
            receivedAt: null,
            noPlan: true,
            plans: []
          });
          setSelectedPlanId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, caseId, workspaceReady, workspaceManual]);

  const manualMode = workspaceManual;
  useEffect(() => {
    if (state.kind !== "ready") return;
    const focus = initialFocus || "takeoff";
    window.setTimeout(() => {
      if (focus === "digital" || focus === "review" || publicationSummary?.active) {
        document
          .querySelector(
            '[data-testid="eq-publication-summary"], [data-testid="estimate-digital-estimate-panel"], [data-testid="eq-digital-estimate"], [data-testid="estimate-scope-panel"]'
          )
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (manualMode && (focus === "scope" || focus === "takeoff")) {
        document
          .querySelector(
            '[data-testid="manual-physical-scope-editor"], [data-testid="estimate-scope-panel"]'
          )
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (focus === "scope") {
        document
          .querySelector('[data-testid="estimate-scope-panel"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        document
          .querySelector('[data-testid="eq-takeoff-iframe"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 160);
  }, [state.kind, initialFocus, manualMode, publicationSummary?.active]);

  const takeoffSrc =
    state.kind === "ready" && state.takeoffJobId
      ? `${aiTakeoffHeadUrl()}/?takeoffJobId=${encodeURIComponent(state.takeoffJobId)}&consolidated=1`
      : null;

  useEffect(() => {
    if (state.kind !== "ready" || state.manualMode || !state.takeoffJobId) return;
    function onMessage(event: MessageEvent) {
      // AUDIT-005: exact origin allowlist — no *.vercel.app / *.eliteosfab.com wildcards.
      if (!isAllowedTakeoffMessageOrigin(String(event.origin || ""))) return;
      const frameWin = takeoffFrameRef.current?.contentWindow;
      if (frameWin && event.source && event.source !== frameWin) {
        return;
      }
      if (!isValidTakeoffApprovedMessage(event.data, state.takeoffJobId || "")) return;
      setState((prev) => {
        if (prev.kind !== "ready") return prev;
        return {
          ...prev,
          displayStatus: "Needs estimator review",
          scopeRefreshKey: prev.scopeRefreshKey + 1,
          handoffNotice: "Takeoff approved — Estimate Scope refreshed."
        };
      });
      window.setTimeout(() => {
        document
          .querySelector('[data-testid="estimate-scope-panel"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [state.kind === "ready" ? state.takeoffJobId : null, state.kind === "ready" ? state.manualMode : null]);

  // Fallback: if postMessage is missed, poll Takeoff review status and refresh scope.
  // Event-driven prefer; slow poll only while AI is still running. Cleanup on unmount.
  useEffect(() => {
    if (state.kind !== "ready" || state.manualMode || !state.takeoffJobId) return;
    if (state.displayStatus === "Needs estimator review" || state.displayStatus === "Scope in progress") {
      return;
    }
    let cancelled = false;
    const takeoffJobId = state.takeoffJobId;
    const ac = new AbortController();
    let inFlight = false;
    let timer: number | null = null;
    let errors = 0;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), delayMs);
    };

    async function tick() {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const job = (await apiGet(
          `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
          authToken,
          { signal: ac.signal }
        )) as { reviewStatus?: string; status?: string };
        if (cancelled) return;
        errors = 0;
        const jobStatus = String(job.status ?? "").toLowerCase();
        const reviewStatus = String(job.reviewStatus ?? "").toLowerCase();
        const terminal =
          ["completed", "failed", "cancelled", "canceled"].includes(jobStatus) ||
          reviewStatus === "approved";
        if (String(job.reviewStatus ?? "").toLowerCase() !== "approved") {
          const next = deriveEstimateTakeoffDisplayStatus({
            takeoffJobId,
            linkStatus: state.linkStatus,
            jobStatus: job.status,
            reviewStatus: job.reviewStatus
          });
          setState((prev) => {
            if (prev.kind !== "ready" || prev.displayStatus === next) return prev;
            return { ...prev, displayStatus: next };
          });
          if (!terminal) schedule(20_000);
          return;
        }
        setState((prev) => {
          if (prev.kind !== "ready" || prev.displayStatus === "Needs estimator review") return prev;
          return {
            ...prev,
            displayStatus: "Needs estimator review",
            scopeRefreshKey: prev.scopeRefreshKey + 1,
            handoffNotice: "Takeoff approved — Estimate Scope refreshed."
          };
        });
        window.setTimeout(() => {
          document
            .querySelector('[data-testid="estimate-scope-panel"]')
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      } catch {
        if (!cancelled && !ac.signal.aborted) {
          errors += 1;
          schedule(Math.min(60_000, 20_000 * 2 ** errors));
        }
      } finally {
        inFlight = false;
      }
    }

    void tick();

    function onVisibility() {
      if (document.visibilityState === "visible") void tick();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      ac.abort();
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    authToken,
    state.kind === "ready" ? state.takeoffJobId : null,
    state.kind === "ready" ? state.displayStatus : null,
    state.kind === "ready" ? state.linkStatus : null
  ]);

  return (
    <div className="eq-workspace" data-testid="estimate-takeoff-workspace">
      <header className="eq-header">
        <div>
          <h1 className="eq-title">Estimate workspace</h1>
          <p className="eq-subtitle">
            Linked production AI Takeoff review for this Estimate Queue case.
          </p>
        </div>
        <div className="eq-header-actions">
          <button type="button" className="eq-btn-secondary" onClick={onBackToQueue}>
            Back to Estimate Queue
          </button>
        </div>
      </header>

      {state.kind === "resolving" ? (
        <div className="eq-state" role="status" data-testid="eq-open-resolving">
          Resolving Takeoff link for this case…
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-open-error">
          <strong>Could not open estimate.</strong> {state.message}
          {state.code ? <p className="eq-muted">Code: {state.code}</p> : null}
          <div className="eq-action-row">
            <button type="button" className="eq-btn-secondary" onClick={onBackToQueue}>
              Back to Estimate Queue
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <>
          {state.manualMode ? (
            <div className="eq-state" role="status" data-testid="manual-estimate-badge">
              <strong>Manual Estimate</strong> — no email, plan, or AI Takeoff required.
              <p className="eq-muted" data-testid="manual-next-step-scope">
                Next: build rooms and pieces below, then <strong>Confirm Manual Scope</strong> before
                Pricing Setup.
              </p>
              {!state.accountDirectoryLinked ? (
                <p className="eq-muted" data-testid="manual-next-step-customer">
                  Customer identity is incomplete — in Pricing Setup, search Account Directory (or
                  create a prospect) to select/link the customer. Linking is optional for draft and
                  calculate; use the existing Account Directory panel.
                </p>
              ) : null}
            </div>
          ) : null}
          {state.persistenceWarning ? (
            <div className="eq-state eq-state--warn" role="status">
              {state.persistenceWarning}
            </div>
          ) : null}
          {state.handoffNotice ? (
            <div className="eq-state" role="status" data-testid="eq-takeoff-handoff-notice">
              {state.handoffNotice}
            </div>
          ) : null}
          {!state.manualMode &&
          (state.displayStatus === "Takeoff queued" ||
            state.displayStatus === "Takeoff processing") ? (
            <div className="eq-state" role="status" data-testid="eq-ai-takeoff-processing-banner">
              AI Takeoff is processing. You may build or edit the takeoff now. AI findings will be added when ready.
            </div>
          ) : null}
          {!state.manualMode && state.displayStatus === "Takeoff failed" ? (
            <div className="eq-state eq-state--warn" role="status" data-testid="eq-ai-takeoff-failed-banner">
              AI Takeoff failed. Retry AI Takeoff or continue manually.
            </div>
          ) : null}
          <section className="eq-case-context" aria-label="Case context">
            <div>
              <div className="eq-cell-primary">
                {state.caseRow ? caseCustomerProjectLabel(state.caseRow) : "Estimate case"}
              </div>
              <div className="eq-cell-meta">Case {caseId}</div>
            </div>
            <div>
              <div className="eq-muted">Intake status</div>
              <div>{state.caseRow ? caseStatusLabel(state.caseRow) : "—"}</div>
            </div>
            <div>
              <div className="eq-muted">{state.manualMode ? "Source" : "Attachment"}</div>
              <div>{state.manualMode ? "Manual" : safeText(state.attachmentName, "plan.pdf")}</div>
            </div>
            <div>
              <div className="eq-muted">{state.manualMode ? "Scope status" : "Takeoff status"}</div>
              <div data-testid="eq-takeoff-display-status">{state.displayStatus}</div>
            </div>
            {!state.manualMode ? (
              <div>
                <div className="eq-muted">Takeoff job</div>
                <div>
                  <code data-testid="eq-linked-takeoff-job">{state.takeoffJobId}</code>
                  <span className="eq-muted">
                    {" "}
                    · {state.reused ? "reused link" : state.created ? "created" : "linked"}
                  </span>
                </div>
              </div>
            ) : null}
          </section>

          <section className="eq-source-plan" aria-label="Source and plan" data-testid="eq-source-plan">
            <div className="eq-source-plan-grid">
              <div>
                <div className="eq-muted">Source</div>
                <div data-testid="eq-source-plan-source">
                  {sourcePlans?.sourceLabel ||
                    (state.manualMode ? "Manual estimate" : "Estimate request")}
                </div>
                {formatReceivedAt(sourcePlans?.receivedAt) ? (
                  <div className="eq-muted" data-testid="eq-source-plan-received">
                    Received {formatReceivedAt(sourcePlans?.receivedAt)}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="eq-muted">Plan</div>
                {sourcePlans?.noPlan || !sourcePlans?.plans?.length ? (
                  <div data-testid="eq-source-plan-empty">No plan attached</div>
                ) : (
                  <>
                    {sourcePlans.plans.length > 1 ? (
                      <label className="eq-source-plan-select">
                        <span className="eq-muted">Additional plans</span>
                        <select
                          data-testid="eq-source-plan-select"
                          value={selectedPlanId || ""}
                          onChange={(e) => setSelectedPlanId(e.target.value || null)}
                        >
                          {sourcePlans.plans.map((p, idx) => (
                            <option
                              key={p.attachmentId || `${p.filename}-${idx}`}
                              value={p.attachmentId || ""}
                            >
                              {p.primary ? `${p.filename} (primary)` : p.filename}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {(() => {
                      const plan =
                        sourcePlans.plans.find((p) => String(p.attachmentId || "") === selectedPlanId) ||
                        sourcePlans.plans.find((p) => p.primary) ||
                        sourcePlans.plans[0];
                      if (!plan) return null;
                      const size = formatPlanBytes(plan.sizeBytes);
                      const type = planTypeLabel(plan.contentType, plan.filename);
                      return (
                        <>
                          <div className="eq-cell-primary" data-testid="eq-source-plan-filename">
                            {plan.filename}
                          </div>
                          <div className="eq-muted" data-testid="eq-source-plan-meta">
                            {type}
                            {size ? ` · ${size}` : ""}
                          </div>
                          {plan.attachmentId ? (
                            <button
                              type="button"
                              className="eq-btn-secondary eq-btn-small"
                              data-testid="eq-view-plan"
                              onClick={() =>
                                setPlanViewerAtt({
                                  attachmentId: String(plan.attachmentId),
                                  filename: plan.filename,
                                  contentType: plan.contentType,
                                  sizeBytes: plan.sizeBytes,
                                  sourceContext: "linked-estimate"
                                })
                              }
                            >
                              View plan
                            </button>
                          ) : (
                            <span className="eq-muted">Preview not supported</span>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
            {state.manualMode && (sourcePlans?.noPlan || !sourcePlans?.plans?.length) ? (
              <p className="eq-muted eq-source-plan-note" data-testid="eq-source-plan-manual-ok">
                Manual estimates without plans remain valid — Manual Scope is not blocked.
              </p>
            ) : null}
          </section>

          <EstimateWorkflowHeader
            workflow={workspaceWorkflow}
            transientError={transientError}
            busy={workflowBusy}
            onPrimaryAction={onPrimaryWorkflowAction}
            onRefreshStatus={refreshStatus}
            onRetry={pendingRetry}
          />

          {publicationSummary &&
          (publicationSummary.active ||
            publicationSummary.historical ||
            publicationSummary.state !== "not_published") ? (
            <EstimatePublicationSummary
              publication={publicationSummary}
              refreshError={publicationRefreshError}
              busy={workflowBusy}
              onRefreshStatus={() => {
                setPublicationRefreshError(null);
                refreshStatus();
              }}
              onViewPublicationDetails={scrollToPublicationDetails}
              onReplacePublication={scrollToPublicationDetails}
              onRevokePublication={scrollToPublicationDetails}
              onReviewCustomerRequest={scrollToPublicationDetails}
              onCopyCustomerLink={() => {
                /* clipboard handled in summary — no mutation */
              }}
            />
          ) : null}

          {collapseCompleted ? (
            <div className="eq-completed-sections" data-testid="eq-completed-sections">
              <p className="eq-muted">Completed estimating stages</p>
              <ul>
                <li>✓ Project details</li>
                <li>✓ {state.manualMode ? "Manual scope" : "Takeoff"}</li>
                <li>✓ Pricing Setup</li>
                <li>✓ Calculation</li>
                <li>✓ Approval</li>
                <li>✓ Digital Estimate published</li>
              </ul>
              <button
                type="button"
                className="eq-btn-ghost"
                data-testid="eq-expand-completed-sections"
                onClick={() => setSectionsExpanded(true)}
              >
                View completed sections
              </button>
            </div>
          ) : null}

          {(!collapseCompleted || sectionsExpanded) && state.estimateId ? (
            <ProjectDetailsPanel
              authToken={authToken}
              caseId={caseId}
              estimateId={state.estimateId}
              refreshKey={state.scopeRefreshKey}
              forceEdit={forceProjectEdit}
              onForceEditConsumed={() => setForceProjectEdit(false)}
              onSaved={() => {
                bumpRefresh();
              }}
              onTransientFailure={(err, retry) => handleTransientFailure(err, retry)}
              onCanonicalEstimate={(est) => handleCanonicalEstimate(est as Record<string, unknown>)}
            />
          ) : null}

          {(!collapseCompleted || sectionsExpanded) && state.manualMode && state.estimateId ? (
            <ManualPhysicalScopeEditor
              authToken={authToken}
              caseId={caseId}
              estimateId={state.estimateId}
              refreshKey={state.scopeRefreshKey}
              onDirtyChange={setManualDirty}
              onActiveEstimateChange={applyActiveEstimateChange}
              onConfirmed={() => {
                setManualDirty(false);
                setState((prev) =>
                  prev.kind === "ready"
                    ? {
                        ...prev,
                        displayStatus: "Manual scope confirmed",
                        scopeRefreshKey: prev.scopeRefreshKey + 1,
                        handoffNotice: "Manual scope confirmed — continue with Pricing Setup."
                      }
                    : prev
                );
                window.setTimeout(() => {
                  document
                    .querySelector('[data-testid="estimate-scope-panel"]')
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 80);
              }}
            />
          ) : null}

          {!state.manualMode && (!collapseCompleted || sectionsExpanded || initialFocus === "takeoff") ? (
            <>
              {sourcePlans?.plans?.some((p) => p.attachmentId) ? (
                <div className="eq-action-row" data-testid="eq-takeoff-view-source-plan-row">
                  <button
                    type="button"
                    className="eq-btn-ghost eq-btn-small"
                    data-testid="eq-takeoff-view-source-plan"
                    onClick={() => {
                      const plan =
                        sourcePlans.plans.find((p) => String(p.attachmentId || "") === selectedPlanId) ||
                        sourcePlans.plans.find((p) => p.primary) ||
                        sourcePlans.plans[0];
                      if (!plan?.attachmentId) return;
                      setPlanViewerAtt({
                        attachmentId: String(plan.attachmentId),
                        filename: plan.filename,
                        contentType: plan.contentType,
                        sizeBytes: plan.sizeBytes,
                        sourceContext: "ai-takeoff"
                      });
                    }}
                  >
                    View source plan
                  </button>
                </div>
              ) : null}
              <div className="eq-takeoff-frame-wrap">
                {takeoffFrameMounted ? (
                  <iframe
                    ref={takeoffFrameRef}
                    title="AI Takeoff review"
                    className="eq-takeoff-frame"
                    data-testid="eq-takeoff-iframe"
                    src={takeoffSrc ?? undefined}
                    referrerPolicy="origin"
                  />
                ) : (
                  <div className="eq-state" data-testid="eq-takeoff-iframe-paused">
                    <p>Takeoff worksheet is paused while you work Scope / Digital Estimate.</p>
                    <button
                      type="button"
                      className="eq-btn-secondary"
                      onClick={() => setTakeoffFrameMounted(true)}
                    >
                      Show Takeoff worksheet
                    </button>
                  </div>
                )}
              </div>
              <p className="eq-footnote">
                Review the plan and edit the Takeoff worksheet above. Click{" "}
                <strong>Approve Takeoff &amp; Build Estimate</strong> to seed Estimate Scope below.
              </p>
            </>
          ) : state.manualMode && !collapseCompleted ? (
            <p className="eq-footnote">
              After Confirm Manual Scope, use Pricing Setup / Calculate / Approve below. Publish remains
              an explicit later action.
            </p>
          ) : null}

          <EstimateScopePanel
            authToken={authToken}
            caseId={caseId}
            takeoffJobId={state.takeoffJobId}
            takeoffDisplayStatus={state.displayStatus}
            refreshKey={state.scopeRefreshKey}
            workflow={workspaceWorkflow}
            collapseCompleted={collapseCompleted}
            onExpandCompleted={() => setSectionsExpanded(true)}
            onDirtyChange={setPricingDirty}
            onBusyChange={setWorkflowBusy}
            onCanonicalEstimate={(est) => handleCanonicalEstimate(est as Record<string, unknown>)}
            onActiveEstimateChange={applyActiveEstimateChange}
            onTransientFailure={(err, retry) => handleTransientFailure(err, retry)}
            onPublicationSummary={(pub) => {
              if (!pub) return;
              setCanonicalEstimate((prev) =>
                prev
                  ? { ...prev, publication: pub, publicationSummary: pub }
                  : { publication: pub, publicationSummary: pub }
              );
              setPublicationRefreshError(null);
            }}
            onPublicationRefreshError={(msg) => setPublicationRefreshError(msg)}
            onEditManualScope={
              state.manualMode
                ? () => {
                    setState((prev) =>
                      prev.kind === "ready"
                        ? {
                            ...prev,
                            handoffNotice:
                              "Edit Manual Scope — save and reconfirm before calculating again."
                          }
                        : prev
                    );
                  }
                : undefined
            }
            onEditProjectDetails={() => setForceProjectEdit(true)}
            customerHint={
              state.caseRow
                ? String(state.caseRow.customerName || state.caseRow.customer || "")
                : ""
            }
            projectHint={
              state.caseRow ? String(state.caseRow.projectName || state.caseRow.project || "") : ""
            }
          />
        </>
      ) : null}

      <PlanViewerModal
        open={Boolean(planViewerAtt)}
        authToken={authToken}
        filename={planViewerAtt?.filename}
        fileTypeLabel={
          planViewerAtt
            ? planTypeLabel(planViewerAtt.contentType, planViewerAtt.filename)
            : undefined
        }
        sizeLabel={formatPlanBytes(planViewerAtt?.sizeBytes)}
        sourceContext={planViewerAtt?.sourceContext || "linked-estimate"}
        loadContent={async () => {
          if (!planViewerAtt) throw new Error("Sign in required");
          return fetchIntakePlanContent(authToken, caseId, planViewerAtt.attachmentId);
        }}
        onClose={() => setPlanViewerAtt(null)}
      />
    </div>
  );
}
