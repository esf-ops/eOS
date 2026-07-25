/**
 * Canonical queue → Studio operational status adapter (AUDIT-001).
 * Pure read-model projection. No I/O. No mutations. No persisted columns.
 *
 * Studio panels continue to use buildStudioWorkspaceWorkflow for fine-grained gating.
 * Command Center / queue use this adapter for label, attention, openTarget, primaryAction.
 */

import {
  deriveNeedsAttention,
  deriveQueueOpenTarget,
  deriveQueueWorkflowStatus
} from "./studioEstimateQueueWorkflow.mjs";

/** @typedef {'failure'|'takeoff'|'scope'|'pricing'|'approval'|'publication'|'review'|'waiting'|'closed'|'request'} OperationalCategory */

/**
 * Deterministic operational keys (not primary UI labels).
 */
export const STUDIO_OPERATIONAL_KEYS = Object.freeze([
  "failed",
  "customer_review_requested",
  "needs_scope_confirmation",
  "needs_scope",
  "takeoff_failed",
  "takeoff_processing",
  "needs_takeoff_review",
  "needs_plan_review",
  "needs_pricing",
  "needs_calculation",
  "needs_approval",
  "ready_to_publish",
  "publication_link_unavailable",
  "publication_expired",
  "customer_viewed",
  "published_waiting_for_customer",
  "new_request",
  "historical_or_closed"
]);

const LABELS = Object.freeze({
  failed: "Resolve Takeoff issue",
  customer_review_requested: "Review customer request",
  needs_scope_confirmation: "Confirm Manual Scope",
  needs_scope: "Complete Manual Scope",
  takeoff_failed: "Resolve Takeoff issue",
  takeoff_processing: "View Takeoff progress",
  needs_takeoff_review: "Review AI Takeoff",
  needs_plan_review: "Review plan",
  needs_pricing: "Configure Pricing",
  needs_calculation: "Calculate Estimate",
  needs_approval: "Approve Estimate",
  ready_to_publish: "Configure Digital Estimate",
  publication_link_unavailable: "View publication details",
  publication_expired: "View publication details",
  customer_viewed: "View publication details",
  published_waiting_for_customer: "Open customer estimate",
  new_request: "Open request",
  historical_or_closed: "View request"
});

const PRIMARY_ACTIONS = Object.freeze({
  failed: "Resolve Takeoff issue",
  customer_review_requested: "Review customer request",
  needs_scope_confirmation: "Confirm Manual Scope",
  needs_scope: "Complete Manual Scope",
  takeoff_failed: "Resolve Takeoff issue",
  takeoff_processing: "View progress",
  needs_takeoff_review: "Review AI Takeoff",
  needs_plan_review: "Review plan",
  needs_pricing: "Configure Pricing",
  needs_calculation: "Calculate Estimate",
  needs_approval: "Approve Estimate",
  ready_to_publish: "Configure Digital Estimate",
  publication_link_unavailable: "View publication details",
  publication_expired: "View publication details",
  customer_viewed: "View publication details",
  published_waiting_for_customer: "Open customer estimate",
  new_request: "Open request",
  historical_or_closed: "Open request"
});

const CATEGORIES = Object.freeze({
  failed: "failure",
  customer_review_requested: "review",
  needs_scope_confirmation: "scope",
  needs_scope: "scope",
  takeoff_failed: "failure",
  takeoff_processing: "takeoff",
  needs_takeoff_review: "takeoff",
  needs_plan_review: "takeoff",
  needs_pricing: "pricing",
  needs_calculation: "pricing",
  needs_approval: "approval",
  ready_to_publish: "publication",
  publication_link_unavailable: "publication",
  publication_expired: "publication",
  customer_viewed: "waiting",
  published_waiting_for_customer: "waiting",
  new_request: "request",
  historical_or_closed: "closed"
});

const OPEN_TARGETS = Object.freeze({
  failed: "takeoff",
  customer_review_requested: "review",
  needs_scope_confirmation: "scope",
  needs_scope: "scope",
  takeoff_failed: "takeoff",
  takeoff_processing: "takeoff",
  needs_takeoff_review: "takeoff",
  needs_plan_review: "takeoff",
  needs_pricing: "pricing",
  needs_calculation: "pricing",
  needs_approval: "approval",
  ready_to_publish: "digital",
  publication_link_unavailable: "digital",
  publication_expired: "digital",
  customer_viewed: "digital",
  published_waiting_for_customer: "digital",
  new_request: "takeoff",
  historical_or_closed: "takeoff"
});

/**
 * Map coarse queue workflow + estimate fields → operational key.
 * Precedence: failure → review request → stale/incomplete active revision →
 * scope/takeoff → pricing/calc/approval → publish → publication states → closed.
 *
 * @param {object} input queue derivation input (+ optional estimate fields)
 * @returns {string}
 */
export function resolveStudioOperationalKey(input = {}) {
  const workflow = String(input.workflowStatus || deriveQueueWorkflowStatus(input) || "");
  const estimateStatus = String(input.estimateStatus ?? "").toLowerCase();
  const publicationStatus = String(input.publicationStatus ?? "").toLowerCase();
  const pubLinkStatus = String(input.publicationLinkStatus ?? input.linkStatusPub ?? "").toLowerCase();
  const manualConfirmed = input.manualScopeConfirmed === true;
  const isManual =
    String(input.sourceType || input.caseSourceType || "").toLowerCase() === "manual" ||
    String(input.estimateOrigin || "").toLowerCase() === "manual_staff" ||
    String(input.physicalScopeSource || "").toLowerCase() === "manual_staff";
  const stale = Boolean(input.staleReason);
  const historicalPub = input.publicationHistorical === true;

  if (workflow === "Sold" || workflow === "Closed") {
    return "historical_or_closed";
  }

  if (workflow === "Takeoff failed" || input.attachmentBlocked) {
    // Confirmed manual path without takeoff should not be blocked by historical takeoff failure.
    if (isManual && manualConfirmed && estimateStatus && estimateStatus !== "needs_takeoff_approval") {
      // fall through to estimate stages
    } else {
      return workflow === "Takeoff failed" || input.attachmentBlocked ? "takeoff_failed" : "failed";
    }
  }

  if (workflow === "Customer submitted") {
    return "customer_review_requested";
  }

  // Stale / incomplete current revision beats historical publication.
  if (stale || (historicalPub && estimateStatus && estimateStatus !== "approved")) {
    if (isManual && !manualConfirmed) {
      return estimateStatus === "draft" || !estimateStatus
        ? "needs_scope"
        : "needs_scope_confirmation";
    }
    if (estimateStatus === "priced") return "needs_approval";
    if (estimateStatus === "ready_to_price" || estimateStatus === "draft") return "needs_calculation";
    if (estimateStatus === "approved" && (!publicationStatus || historicalPub)) {
      return "ready_to_publish";
    }
  }

  if (isManual && (workflow === "Scope in progress" || !workflow)) {
    if (!manualConfirmed) {
      if (estimateStatus === "draft" || !estimateStatus) return "needs_scope";
      return "needs_scope_confirmation";
    }
    if (estimateStatus === "priced") return "needs_approval";
    if (estimateStatus === "ready_to_price" || estimateStatus === "draft") {
      return "needs_calculation";
    }
  }

  if (workflow === "Ready for approval" || estimateStatus === "approved") {
    if (publicationStatus === "expired") return "publication_expired";
    if (pubLinkStatus === "needs_replace" || input.publicationLinkUnavailable === true) {
      return "publication_link_unavailable";
    }
    if (publicationStatus === "active") {
      if (input.customerViewed || workflow === "Customer reviewing") return "customer_viewed";
      return "published_waiting_for_customer";
    }
    return "ready_to_publish";
  }

  if (workflow === "Published" || workflow === "Customer reviewing") {
    if (publicationStatus === "expired") return "publication_expired";
    if (input.publicationLinkUnavailable === true || pubLinkStatus === "needs_replace") {
      return "publication_link_unavailable";
    }
    if (workflow === "Customer reviewing" || input.customerViewed) return "customer_viewed";
    return "published_waiting_for_customer";
  }

  if (estimateStatus === "priced") return "needs_approval";
  if (estimateStatus === "ready_to_price") return "needs_calculation";

  if (
    workflow === "Needs estimator review" ||
    workflow === "Takeoff draft ready" ||
    String(workflow).includes("AI findings")
  ) {
    return "needs_takeoff_review";
  }

  if (String(workflow).includes("processing") || workflow === "Takeoff queued") {
    return "takeoff_processing";
  }

  if (workflow === "Scope in progress") {
    if (isManual && !manualConfirmed) return "needs_scope_confirmation";
    return "needs_pricing";
  }

  if (workflow === "New") {
    return input.attachmentBlocked ? "needs_plan_review" : "new_request";
  }

  return "new_request";
}

/**
 * @param {object} input
 * @returns {{
 *   key: string,
 *   label: string,
 *   category: string,
 *   needsAttention: boolean,
 *   attentionReasons: string[],
 *   openTarget: string,
 *   primaryAction: string,
 *   explanation: string,
 *   workflowStatus: string,
 *   mutates: false
 * }}
 */
export function buildStudioOperationalState(input = {}) {
  const workflowStatus = String(input.workflowStatus || deriveQueueWorkflowStatus(input) || "");
  const attention = deriveNeedsAttention({ ...input, workflowStatus }, workflowStatus);
  const key = resolveStudioOperationalKey({ ...input, workflowStatus });

  // Review / failure / incomplete revision always need attention; pure waiting does not.
  let needsAttention = attention.needsAttention;
  if (
    key === "published_waiting_for_customer" ||
    key === "customer_viewed" ||
    key === "historical_or_closed"
  ) {
    needsAttention = false;
  }
  if (
    key === "customer_review_requested" ||
    key === "failed" ||
    key === "takeoff_failed" ||
    key === "needs_calculation" ||
    key === "needs_approval" ||
    key === "ready_to_publish" ||
    key === "needs_scope_confirmation" ||
    key === "needs_scope" ||
    key === "needs_takeoff_review"
  ) {
    needsAttention = true;
  }

  // Prefer adapter openTarget; fall back to legacy derive for unknown keys.
  const openTarget = OPEN_TARGETS[key] || deriveQueueOpenTarget(input) || "takeoff";
  // Map pricing/approval to scope for current Studio initialFocus support when needed.
  const studioOpenTarget =
    openTarget === "pricing" || openTarget === "approval" ? "scope" : openTarget;

  return {
    key,
    label: LABELS[key] || workflowStatus || "Open request",
    category: CATEGORIES[key] || "request",
    needsAttention,
    attentionReasons: attention.reasons || [],
    openTarget: studioOpenTarget,
    /** Finer target for future panel focus (pricing/approval); queue routes via openTarget. */
    focusHint: openTarget,
    primaryAction: PRIMARY_ACTIONS[key] || "Open request",
    explanation: `Operational state ${key} from authoritative intake/estimate/publication signals.`,
    workflowStatus,
    mutates: false
  };
}

/**
 * Compatibility: next-action fields previously produced by nextActionFromRow.
 * @param {object} input
 */
export function operationalNextActionFromInput(input = {}) {
  const state = buildStudioOperationalState(input);
  return {
    nextActionKey: state.key,
    nextActionLabel: state.primaryAction,
    nextActionRoute: state.openTarget,
    operationalState: state
  };
}
