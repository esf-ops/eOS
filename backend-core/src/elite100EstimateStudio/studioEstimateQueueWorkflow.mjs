/**
 * Studio Estimate Queue — derived workflow status + needs-attention.
 * Pure functions; no I/O. Prefer existing authoritative subsystem fields.
 *
 * @module studioEstimateQueueWorkflow
 */

/** @typedef {'New'|'AI Takeoff processing'|'Takeoff ready'|'Estimator review'|'Estimate in progress'|'Estimate approved'|'Sent to customer'|'Customer reviewing'|'Changes requested'|'Revision in progress'|'Republished'|'Accepted'|'Sold'|'Needs attention'|'Failed'} QueueWorkflowStatus */

export const QUEUE_WORKFLOW_STATUSES = Object.freeze([
  "New",
  "AI Takeoff processing",
  "Takeoff ready",
  "Estimator review",
  "Estimate in progress",
  "Estimate approved",
  "Sent to customer",
  "Customer reviewing",
  "Changes requested",
  "Revision in progress",
  "Republished",
  "Accepted",
  "Sold",
  "Needs attention",
  "Failed"
]);

const FAILED_CASE = new Set([
  "qil_failed",
  "qil_error",
  "qil_intake_failed",
  "failed",
  "error"
]);

/**
 * @param {object} input
 * @returns {QueueWorkflowStatus}
 */
export function deriveQueueWorkflowStatus(input = {}) {
  const caseStatus = String(input.caseStatus ?? "").toLowerCase();
  const takeoffJobStatus = String(input.takeoffJobStatus ?? "").toLowerCase();
  const takeoffReviewStatus = String(input.takeoffReviewStatus ?? "").toLowerCase();
  const estimateStatus = String(input.estimateStatus ?? "").toLowerCase();
  const publicationStatus = String(input.publicationStatus ?? "").toLowerCase();
  const reviewOperatorStatus = String(input.reviewOperatorStatus ?? "").toLowerCase();
  const firstOpenedAt = input.firstOpenedAt ? String(input.firstOpenedAt) : null;
  const customerViewed = Boolean(input.customerViewed);
  const customerSelectionsSaved = Boolean(input.customerSelectionsSaved);
  const accepted = Boolean(input.accepted);
  const sold = Boolean(input.sold);
  const republished = Boolean(input.republished);
  const revisionInProgress = Boolean(input.revisionInProgress);
  const attachmentBlocked = Boolean(input.attachmentBlocked);

  if (sold) return "Sold";
  if (accepted) return "Accepted";

  if (
    FAILED_CASE.has(caseStatus) ||
    takeoffJobStatus === "failed" ||
    takeoffJobStatus === "error" ||
    attachmentBlocked
  ) {
    return "Failed";
  }

  if (
    reviewOperatorStatus === "new" ||
    reviewOperatorStatus === "in_review" ||
    reviewOperatorStatus === "revision_required"
  ) {
    return "Changes requested";
  }

  if (revisionInProgress) return "Revision in progress";
  if (republished) return "Republished";

  if (publicationStatus === "active") {
    if (customerViewed || customerSelectionsSaved) return "Customer reviewing";
    return "Sent to customer";
  }

  if (estimateStatus === "approved") return "Estimate approved";

  if (
    estimateStatus === "ready_to_price" ||
    estimateStatus === "priced" ||
    estimateStatus === "draft"
  ) {
    return "Estimate in progress";
  }

  if (takeoffReviewStatus === "approved") {
    if (estimateStatus === "needs_takeoff_approval" || !estimateStatus) {
      return "Estimator review";
    }
  }

  if (
    takeoffReviewStatus === "needs_review" ||
    caseStatus === "qil_takeoff_ready_for_review" ||
    caseStatus === "qil_takeoff_manual_review"
  ) {
    return "Takeoff ready";
  }

  if (
    takeoffJobStatus === "processing" ||
    takeoffJobStatus === "pending" ||
    takeoffJobStatus === "queued" ||
    caseStatus === "qil_takeoff_processing" ||
    caseStatus === "qil_takeoff_queued"
  ) {
    return "AI Takeoff processing";
  }

  if (!firstOpenedAt) return "New";

  if (
    caseStatus === "qil_manual_review" ||
    caseStatus === "qil_ready_for_takeoff" ||
    Boolean(input.staleReason) ||
    Boolean(input.estimateNotCalculated) ||
    (estimateStatus === "approved" && !publicationStatus)
  ) {
    return "Needs attention";
  }

  return "New";
}

/**
 * Estimator action required (not merely waiting on customer).
 * @param {object} input
 * @param {QueueWorkflowStatus} [workflowStatus]
 */
export function deriveNeedsAttention(input = {}, workflowStatus = null) {
  const status = workflowStatus || deriveQueueWorkflowStatus(input);
  if (
    status === "Sent to customer" ||
    status === "Customer reviewing" ||
    status === "Accepted" ||
    status === "Sold"
  ) {
    return {
      needsAttention: false,
      reasons: []
    };
  }

  const reasons = [];
  if (!input.firstOpenedAt) reasons.push("new_unread");
  if (input.attachmentBlocked) reasons.push("attachment_blocked");
  if (status === "Failed") reasons.push("failed");
  if (status === "Takeoff ready" || status === "Estimator review") {
    reasons.push("takeoff_needs_review");
  }
  if (input.staleReason) reasons.push("estimate_stale");
  if (input.estimateNotCalculated && String(input.estimateStatus ?? "") === "ready_to_price") {
    reasons.push("estimate_not_calculated");
  }
  if (String(input.estimateStatus ?? "") === "approved" && !input.publicationStatus) {
    reasons.push("approved_not_published");
  }
  if (status === "Changes requested") reasons.push("customer_requested_changes");
  if (status === "Revision in progress") reasons.push("revision_awaiting_approval");
  if (
    String(input.publicationStatus ?? "").toLowerCase() === "revoked" ||
    String(input.publicationStatus ?? "").toLowerCase() === "expired"
  ) {
    reasons.push("publication_inactive");
  }

  // Deduplicate while preserving order
  const unique = [...new Set(reasons)];
  return {
    needsAttention: unique.length > 0,
    reasons: unique
  };
}

/**
 * Next Studio section after Open.
 * @returns {'takeoff'|'scope'|'digital'|'review'}
 */
export function deriveQueueOpenTarget(input = {}) {
  const workflow = deriveQueueWorkflowStatus(input);
  if (workflow === "Changes requested" || workflow === "Revision in progress") return "review";
  if (workflow === "Estimate approved" || workflow === "Sent to customer" || workflow === "Customer reviewing") {
    return "digital";
  }
  if (
    workflow === "Estimate in progress" ||
    workflow === "Estimator review" ||
    String(input.takeoffReviewStatus ?? "").toLowerCase() === "approved"
  ) {
    return "scope";
  }
  return "takeoff";
}

/**
 * Map presentation filter keys to workflow status sets.
 */
export function workflowStatusesForFilter(filterKey) {
  const key = String(filterKey ?? "all").toLowerCase();
  switch (key) {
    case "new":
      return new Set(["New"]);
    case "takeoff":
      return new Set(["AI Takeoff processing", "Takeoff ready", "Estimator review"]);
    case "estimating":
      return new Set(["Estimate in progress", "Estimate approved", "Needs attention"]);
    case "sent":
      return new Set(["Sent to customer", "Customer reviewing"]);
    case "customer_changes":
      return new Set(["Changes requested", "Revision in progress", "Republished"]);
    case "accepted":
      return new Set(["Accepted"]);
    case "sold":
      return new Set(["Sold"]);
    case "failed":
      return new Set(["Failed"]);
    case "needs_attention":
      return null; // special: use needsAttention flag
    case "all":
    default:
      return null;
  }
}

/**
 * Safe list-row indicators (booleans only).
 */
export function buildQueueIndicators(input = {}, workflowStatus, attention) {
  const pub = String(input.publicationStatus ?? "").toLowerCase();
  const takeoffReview = String(input.takeoffReviewStatus ?? "").toLowerCase();
  const takeoffJob = String(input.takeoffJobStatus ?? "").toLowerCase();
  const estimate = String(input.estimateStatus ?? "").toLowerCase();
  return {
    unread: !input.firstOpenedAt,
    opened: Boolean(input.firstOpenedAt),
    takeoffProcessing:
      takeoffJob === "processing" || takeoffJob === "pending" || takeoffJob === "queued",
    takeoffNeedsReview: takeoffReview === "needs_review" || workflowStatus === "Takeoff ready",
    takeoffApproved: takeoffReview === "approved",
    estimateDraft: estimate === "draft" || estimate === "ready_to_price",
    estimateCalculated: estimate === "priced",
    estimateApproved: estimate === "approved",
    digitalPublished: pub === "active",
    customerViewed: Boolean(input.customerViewed),
    customerSelectionsSaved: Boolean(input.customerSelectionsSaved),
    customerRequestedReview: workflowStatus === "Changes requested",
    revisionInProgress: workflowStatus === "Revision in progress",
    republished: workflowStatus === "Republished",
    accepted: workflowStatus === "Accepted",
    failed: workflowStatus === "Failed",
    needsAttention: Boolean(attention?.needsAttention)
  };
}
