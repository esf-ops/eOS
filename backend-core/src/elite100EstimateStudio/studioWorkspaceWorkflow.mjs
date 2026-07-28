/**
 * Studio estimate workspace workflow — one next action per active revision.
 * Pure derivation from estimate DTO + optional client dirty flags + publication summary.
 * Never performs mutations or delivery actions.
 */

import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { isBlankProjectName } from "./studioProjectDetails.mjs";

/** Keep browser-safe — do not import studioManualPhysicalScope (node:crypto). */
const MANUAL_ESTIMATE_ORIGIN = "manual_staff";

function isConfirmedManualPhysicalScope(scope) {
  if (!scope || typeof scope !== "object") return false;
  return (
    scope.physicalScopeSource === MANUAL_ESTIMATE_ORIGIN &&
    scope.estimateOrigin === MANUAL_ESTIMATE_ORIGIN &&
    scope.manualScopeConfirmed === true
  );
}

/**
 * @typedef {{
 *   currentStage: string,
 *   nextRequiredAction: string|null,
 *   nextRequiredActionLabel: string|null,
 *   nextRequiredActionDetail: string|null,
 *   blockers: Array<{ code: string, message: string, action?: string|null }>,
 *   allowedActions: string[],
 *   completedSteps: string[],
 *   laterSteps: string[],
 *   staleReason: string|null,
 *   activeRevision: number,
 *   estimateId: string|null,
 *   status: string|null,
 *   manualScopeCurrent: boolean,
 *   calculationCurrent: boolean,
 *   approvalCurrent: boolean,
 *   projectNameReady: boolean,
 *   isManual: boolean,
 *   historicalApproval: null|{ revision: number|null, approvedAt: string|null, exactInternalTotal: number|null, label: string },
 *   publication: object|null,
 *   display: {
 *     calculationLabel: string,
 *     approvalLabel: string,
 *     manualScopeLabel: string,
 *     statusBanner: string|null,
 *     publicationLabel: string|null
 *   }
 * }} StudioWorkspaceWorkflow
 */

/**
 * @param {object|null|undefined} estimate — safeEstimateView or raw row
 * @param {{
 *   manualScopeDirty?: boolean,
 *   pricingDirty?: boolean,
 *   projectDetailsDirty?: boolean,
 *   historicalApproval?: object|null,
 *   publication?: object|null
 * }} [client]
 * @returns {StudioWorkspaceWorkflow}
 */
export function buildStudioWorkspaceWorkflow(estimate, client = {}) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const status = String(estimate?.status || "").toLowerCase() || null;
  const isManual =
    scope.estimateOrigin === MANUAL_ESTIMATE_ORIGIN ||
    scope.physicalScopeSource === MANUAL_ESTIMATE_ORIGIN ||
    scope.physicalScopeSource === "manual_staff";
  const manualScopeCurrent = isManual ? isConfirmedManualPhysicalScope(scope) : true;
  const hasCalculation = Boolean(
    estimate?.calculationSnapshot?.fingerprint ||
      estimate?.calculation?.fingerprint ||
      estimate?.calculationFingerprint
  );
  const calculationCurrent =
    hasCalculation &&
    (status === STUDIO_ESTIMATE_STATUSES.PRICED ||
      status === STUDIO_ESTIMATE_STATUSES.APPROVED) &&
    !estimate?.staleReason;
  const approvalCurrent =
    status === STUDIO_ESTIMATE_STATUSES.APPROVED &&
    Boolean(estimate?.approval?.approvedAt || estimate?.approvedAt) &&
    !estimate?.staleReason;
  // Project / customer identity is optional metadata — never a publish gate.
  const projectNameReady = !isBlankProjectName(scope.projectName);

  const manualScopeDirty = client.manualScopeDirty === true;
  const pricingDirty = client.pricingDirty === true;
  const superseded = status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED;
  const publication =
    (client.publication && typeof client.publication === "object"
      ? client.publication
      : null) ||
    (estimate?.publication && typeof estimate.publication === "object"
      ? estimate.publication
      : null) ||
    (estimate?.publicationSummary && typeof estimate.publicationSummary === "object"
      ? estimate.publicationSummary
      : null);

  const publicationActive = publication?.active === true;
  const publicationHistorical = publication?.historical === true && !publicationActive;

  /** @type {string[]} */
  const completedSteps = [];
  /** @type {string[]} */
  const laterSteps = [];
  /** @type {Array<{ code: string, message: string, action?: string|null }>} */
  const blockers = [];
  /** @type {Set<string>} */
  const allowed = new Set();

  if (isManual) {
    if (manualScopeCurrent && !manualScopeDirty) completedSteps.push("manual_scope_confirmed");
    else if (!manualScopeDirty) completedSteps.push("manual_scope_draft");
  }

  if (pricingDirty) {
    // unsaved pricing
  } else if (manualScopeCurrent || !isManual) {
    completedSteps.push("pricing_saved");
  }

  if (calculationCurrent) completedSteps.push("calculated");
  if (approvalCurrent) completedSteps.push("approved");
  if (projectNameReady) completedSteps.push("project_named");
  if (publicationActive) completedSteps.push("published");

  let nextRequiredAction = null;
  let nextRequiredActionLabel = null;
  let nextRequiredActionDetail = null;
  let currentStage = "unknown";

  if (superseded) {
    currentStage = "superseded";
    nextRequiredAction = "resolve_failure";
    nextRequiredActionLabel = "Open the active revision";
    nextRequiredActionDetail =
      "This estimate revision was superseded. Reload the workspace to continue on the active revision.";
    blockers.push({
      code: "estimate_superseded",
      message: nextRequiredActionDetail,
      action: "refresh_status"
    });
  } else if (isManual && manualScopeDirty) {
    currentStage = "manual_scope_unsaved";
    nextRequiredAction = "save_manual_scope";
    nextRequiredActionLabel = "Save Manual Scope";
    nextRequiredActionDetail = "Save Manual Scope before confirming or calculating.";
    allowed.add("save_manual_scope");
    laterSteps.push("confirm_manual_scope", "calculate", "approve", "publish");
  } else if (isManual && !manualScopeCurrent) {
    currentStage = "manual_scope_unconfirmed";
    nextRequiredAction = "confirm_manual_scope";
    nextRequiredActionLabel = "Confirm Manual Scope";
    nextRequiredActionDetail = "Confirm Manual Scope before calculating.";
    allowed.add("save_manual_scope");
    allowed.add("confirm_manual_scope");
    laterSteps.push("calculate", "approve", "publish");
    blockers.push({
      code: "manual_scope_not_confirmed",
      message: "Confirm Manual Scope before calculating.",
      action: "confirm_manual_scope"
    });
  } else if (pricingDirty) {
    currentStage = "pricing_unsaved";
    nextRequiredAction = "save_pricing";
    nextRequiredActionLabel = "Save Pricing Setup";
    nextRequiredActionDetail = "Save Pricing Setup before calculating.";
    allowed.add("save_pricing");
    if (isManual) allowed.add("edit_manual_scope");
    laterSteps.push("calculate", "approve", "publish");
    blockers.push({
      code: "pricing_unsaved",
      message: "Save Pricing Setup before calculating.",
      action: "save_pricing"
    });
  } else if (!calculationCurrent) {
    currentStage = "calculation_required";
    nextRequiredAction = "calculate";
    nextRequiredActionLabel = "Calculate Estimate";
    nextRequiredActionDetail =
      estimate?.staleReason ||
      "Calculate the estimate after Manual Scope is confirmed and Pricing Setup is saved.";
    allowed.add("calculate");
    allowed.add("save_pricing");
    if (isManual) {
      allowed.add("edit_manual_scope");
      allowed.add("save_manual_scope");
    }
    laterSteps.push("approve", "publish");
    if (estimate?.staleReason) {
      blockers.push({
        code: "estimate_stale",
        message: String(estimate.staleReason),
        action: "calculate"
      });
    }
    // Prior publication may exist but must not override a stale new revision.
    if (publicationHistorical || publication?.publicationId) {
      laterSteps.push("replace_publication");
    }
  } else if (!approvalCurrent) {
    currentStage = "approval_required";
    nextRequiredAction = "approve";
    nextRequiredActionLabel = "Approve Estimate";
    nextRequiredActionDetail = "Approve the current calculation before publishing.";
    allowed.add("approve");
    allowed.add("calculate");
    allowed.add("save_pricing");
    if (isManual) allowed.add("edit_manual_scope");
    laterSteps.push("publish");
  } else if (publicationActive) {
    // Current approved revision with an active publication — publication management.
    currentStage = "published";
    if (publication.reviewRequestOpen || publication.state === "customer_review_requested") {
      nextRequiredAction = "review_customer_request";
      nextRequiredActionLabel = "Review customer request";
      nextRequiredActionDetail = "A customer review request is open for this publication.";
      allowed.add("review_customer_request");
    } else if (publication.state === "publication_link_unavailable") {
      nextRequiredAction = "open_publication_details";
      nextRequiredActionLabel = "View publication details";
      nextRequiredActionDetail =
        "The publication exists, but the staff customer link could not be recovered.";
      allowed.add("open_publication_details");
      allowed.add("refresh_status");
    } else {
      nextRequiredAction = "wait_for_customer";
      nextRequiredActionLabel =
        publication.statusLabel || "Published — waiting on customer";
      nextRequiredActionDetail =
        "This Digital Estimate is published. Open or copy the existing customer link — do not recalculate or republish unless you intentionally replace the publication.";
      allowed.add("open_customer_view");
      allowed.add("copy_customer_link");
    }
    allowed.add("open_publication_details");
    allowed.add("view_scope");
    allowed.add("view_pricing");
    allowed.add("view_approval");
    allowed.add("replace_publication");
    allowed.add("revoke_publication");
    allowed.add("configure_digital_estimate");
    if (isManual) allowed.add("edit_manual_scope");
    allowed.add("save_pricing");
  } else {
    currentStage = "ready_to_publish";
    nextRequiredAction = "configure_digital_estimate";
    nextRequiredActionLabel = "Configure & publish Digital Estimate";
    nextRequiredActionDetail =
      "Configure Digital Estimate settings, then use the explicit Publish action.";
    allowed.add("configure_digital_estimate");
    allowed.add("publish");
    allowed.add("edit_project_details");
    if (isManual) allowed.add("edit_manual_scope");
    allowed.add("save_pricing");
    if (publicationHistorical) {
      laterSteps.push("replace_publication");
    }
  }

  // Always allow refresh / project metadata edits that don't stale pricing.
  allowed.add("refresh_status");
  allowed.add("edit_project_details");

  const historicalApproval =
    client.historicalApproval && typeof client.historicalApproval === "object"
      ? {
          revision: client.historicalApproval.revision ?? null,
          approvedAt: client.historicalApproval.approvedAt ?? null,
          exactInternalTotal:
            client.historicalApproval.exactInternalTotal != null
              ? Number(client.historicalApproval.exactInternalTotal)
              : null,
          label: String(
            client.historicalApproval.label ||
              `Previous revision approved${
                client.historicalApproval.exactInternalTotal != null
                  ? `: $${Number(client.historicalApproval.exactInternalTotal).toFixed(2)}`
                  : ""
              }`
          )
        }
      : null;

  const calculationLabel = calculationCurrent
    ? `Calculated${estimate?.calculation?.calculatedAt ? ` ${estimate.calculation.calculatedAt}` : ""}`
    : hasCalculation && estimate?.staleReason
      ? "Prior calculation stale — recalculate"
      : "Not calculated";

  const approvalLabel = approvalCurrent
    ? `Approved${estimate?.approval?.approvedAt ? ` ${estimate.approval.approvedAt}` : ""}`
    : "Not approved";

  const manualScopeLabel = !isManual
    ? "Takeoff authority"
    : manualScopeDirty
      ? "Unsaved Manual Scope changes"
      : manualScopeCurrent
        ? "Manual scope confirmed"
        : "Manual scope not confirmed";

  const publicationLabel = publication?.statusLabel || null;

  return {
    currentStage,
    nextRequiredAction,
    nextRequiredActionLabel,
    nextRequiredActionDetail,
    blockers,
    allowedActions: [...allowed],
    completedSteps,
    laterSteps,
    staleReason: estimate?.staleReason ? String(estimate.staleReason) : null,
    activeRevision: Number(estimate?.revision) || 1,
    estimateId: estimate?.id ? String(estimate.id) : null,
    status,
    manualScopeCurrent: manualScopeCurrent && !manualScopeDirty,
    calculationCurrent,
    approvalCurrent,
    projectNameReady,
    isManual,
    historicalApproval,
    publication: publication || null,
    display: {
      calculationLabel,
      approvalLabel,
      manualScopeLabel,
      statusBanner: estimate?.staleReason
        ? String(estimate.staleReason)
        : publicationLabel || nextRequiredActionDetail,
      publicationLabel
    }
  };
}

/**
 * @param {StudioWorkspaceWorkflow} workflow
 * @param {string} action
 */
export function workflowAllowsAction(workflow, action) {
  if (!workflow || !action) return false;
  return (workflow.allowedActions || []).includes(String(action));
}
