/**
 * Studio Estimate Queue — one operational status vocabulary.
 * Pure functions; no I/O. Maps intake/takeoff/estimate/publication fields.
 *
 * @module studioEstimateQueueWorkflow
 */

/** @typedef {'New'|'Takeoff queued'|'Takeoff processing'|'Takeoff draft ready'|'Needs estimator review'|'Scope in progress'|'Ready for approval'|'Published'|'Customer reviewing'|'Customer submitted'|'Sold'|'Closed'|'Takeoff failed'} QueueWorkflowStatus */

export const QUEUE_WORKFLOW_STATUSES = Object.freeze([
  "New",
  "Takeoff queued",
  "Takeoff processing",
  "Takeoff processing · manual draft in progress",
  "Takeoff draft ready",
  "Needs estimator review",
  "Scope in progress",
  "Ready for approval",
  "Published",
  "Customer reviewing",
  "Customer submitted",
  "Sold",
  "Closed",
  "Takeoff failed"
]);

const FAILED_CASE = new Set([
  "qil_failed",
  "qil_error",
  "qil_intake_failed",
  "failed",
  "error"
]);

const CLOSED_CASE = new Set([
  "qil_not_quote",
  "qil_not_elite_100",
  "closed",
  "cancelled",
  "canceled"
]);

/**
 * Authoritative queue status mapper (list + detail must use this).
 * @param {object} input
 * @returns {QueueWorkflowStatus|string}
 */
export function deriveQueueWorkflowStatus(input = {}) {
  const caseStatus = String(input.caseStatus ?? "").toLowerCase();
  const takeoffJobStatus = String(input.takeoffJobStatus ?? "").toLowerCase();
  const takeoffReviewStatus = String(input.takeoffReviewStatus ?? "").toLowerCase();
  const estimateStatus = String(input.estimateStatus ?? "").toLowerCase();
  const publicationStatus = String(input.publicationStatus ?? "").toLowerCase();
  const reviewOperatorStatus = String(input.reviewOperatorStatus ?? "").toLowerCase();
  const linkStatusRaw = String(input.linkStatus ?? input.relationshipStatus ?? "").toLowerCase();
  // Stale intake links often remain "queued" after the job completes — prefer job status.
  const linkStatus =
    takeoffJobStatus === "completed" ||
    takeoffJobStatus === "failed" ||
    takeoffJobStatus === "error" ||
    takeoffJobStatus === "processing"
      ? ""
      : linkStatusRaw;
  const firstOpenedAt = input.firstOpenedAt ? String(input.firstOpenedAt) : null;
  const customerViewed = Boolean(input.customerViewed);
  const customerSelectionsSaved = Boolean(input.customerSelectionsSaved);
  const accepted = Boolean(input.accepted);
  const sold = Boolean(input.sold);
  const attachmentBlocked = Boolean(input.attachmentBlocked);

  const usableGeometry =
    input.usableGeometryPresent === true ||
    Number(input.pieceCount) > 0 ||
    Number(input.roomCount) > 0 ||
    Number(input.takeoffPieceCount) > 0 ||
    Number(input.takeoffRoomCount) > 0;
  const estimatorDraft = Boolean(input.estimatorDraftPresent) || usableGeometry;
  const processing =
    takeoffJobStatus === "processing" ||
    caseStatus === "qil_takeoff_processing" ||
    linkStatus === "processing";
  const queued =
    takeoffJobStatus === "pending" ||
    takeoffJobStatus === "queued" ||
    caseStatus === "qil_takeoff_queued" ||
    linkStatus === "queued" ||
    linkStatus === "requested";

  if (sold) return "Sold";
  if (CLOSED_CASE.has(caseStatus)) return "Closed";

  if (
    FAILED_CASE.has(caseStatus) ||
    takeoffJobStatus === "failed" ||
    takeoffJobStatus === "error" ||
    caseStatus === "qil_takeoff_failed" ||
    linkStatus === "failed" ||
    attachmentBlocked
  ) {
    return "Takeoff failed";
  }

  if (
    reviewOperatorStatus === "new" ||
    reviewOperatorStatus === "in_review" ||
    reviewOperatorStatus === "revision_required" ||
    accepted
  ) {
    return "Customer submitted";
  }

  if (publicationStatus === "active") {
    if (customerViewed || customerSelectionsSaved) return "Customer reviewing";
    return "Published";
  }

  if (estimateStatus === "approved") return "Ready for approval";

  if (
    estimateStatus === "ready_to_price" ||
    estimateStatus === "priced" ||
    estimateStatus === "draft"
  ) {
    return "Scope in progress";
  }

  if (takeoffReviewStatus === "approved") {
    return "Needs estimator review";
  }

  // Processing / queued with or without a manual draft — never call empty placeholder "draft ready".
  if (processing) {
    return estimatorDraft
      ? "Takeoff processing · manual draft in progress"
      : "Takeoff processing";
  }

  if (
    takeoffReviewStatus === "needs_review" ||
    takeoffReviewStatus === "in_review" ||
    takeoffJobStatus === "completed" ||
    caseStatus === "qil_takeoff_ready_for_review" ||
    caseStatus === "qil_takeoff_manual_review" ||
    linkStatus === "ready" ||
    linkStatus === "manual_review"
  ) {
    if (usableGeometry) return "Takeoff draft ready";
    // Empty/placeholder result must never read as draft ready.
    return estimatorDraft
      ? "Takeoff processing · manual draft in progress"
      : "Takeoff queued";
  }

  if (queued || Boolean(input.takeoffJobId)) {
    return estimatorDraft
      ? "Takeoff processing · manual draft in progress"
      : "Takeoff queued";
  }

  if (!firstOpenedAt) return "New";

  if (
    caseStatus === "qil_manual_review" ||
    caseStatus === "qil_ready_for_takeoff" ||
    Boolean(input.staleReason) ||
    Boolean(input.estimateNotCalculated)
  ) {
    return "Needs estimator review";
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
    status === "Published" ||
    status === "Customer reviewing" ||
    status === "Sold" ||
    status === "Closed"
  ) {
    return {
      needsAttention: false,
      reasons: []
    };
  }

  const reasons = [];
  if (!input.firstOpenedAt) reasons.push("new_unread");
  if (input.attachmentBlocked) reasons.push("attachment_blocked");
  if (status === "Takeoff failed") reasons.push("failed");
  if (
    status === "Takeoff draft ready" ||
    status === "Needs estimator review"
  ) {
    reasons.push("takeoff_needs_review");
  }
  if (input.staleReason) reasons.push("estimate_stale");
  if (input.estimateNotCalculated && String(input.estimateStatus ?? "") === "ready_to_price") {
    reasons.push("estimate_not_calculated");
  }
  if (String(input.estimateStatus ?? "") === "approved" && !input.publicationStatus) {
    reasons.push("approved_not_published");
  }
  if (status === "Customer submitted") reasons.push("customer_requested_changes");

  if (
    String(input.publicationStatus ?? "").toLowerCase() === "revoked" ||
    String(input.publicationStatus ?? "").toLowerCase() === "expired"
  ) {
    reasons.push("publication_inactive");
  }

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
  if (workflow === "Customer submitted") return "review";
  if (
    workflow === "Ready for approval" ||
    workflow === "Published" ||
    workflow === "Customer reviewing"
  ) {
    return "digital";
  }
  if (
    workflow === "Scope in progress" ||
    workflow === "Needs estimator review" ||
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
      return new Set([
        "Takeoff queued",
        "Takeoff processing",
        "Takeoff processing · manual draft in progress",
        "Takeoff draft ready",
        "Needs estimator review",
        "Takeoff failed"
      ]);
    case "estimating":
      return new Set(["Scope in progress", "Ready for approval", "Needs estimator review"]);
    case "sent":
      return new Set(["Published", "Customer reviewing"]);
    case "customer_changes":
      return new Set(["Customer submitted"]);
    case "accepted":
      return new Set(["Customer submitted"]);
    case "sold":
      return new Set(["Sold"]);
    case "failed":
      return new Set(["Takeoff failed"]);
    case "needs_attention":
      return null;
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
      workflowStatus === "Takeoff processing" ||
      workflowStatus === "Takeoff processing · manual draft in progress" ||
      workflowStatus === "Takeoff queued" ||
      takeoffJob === "processing" ||
      takeoffJob === "pending" ||
      takeoffJob === "queued",
    takeoffNeedsReview:
      takeoffReview === "needs_review" ||
      workflowStatus === "Takeoff draft ready" ||
      workflowStatus === "Needs estimator review",
    takeoffApproved: takeoffReview === "approved",
    estimateDraft: estimate === "draft" || estimate === "ready_to_price",
    estimateCalculated: estimate === "priced",
    estimateApproved: estimate === "approved",
    digitalPublished: pub === "active",
    customerViewed: Boolean(input.customerViewed),
    customerSelectionsSaved: Boolean(input.customerSelectionsSaved),
    customerRequestedReview: workflowStatus === "Customer submitted",
    revisionInProgress: false,
    republished: false,
    accepted: workflowStatus === "Customer submitted",
    failed: workflowStatus === "Takeoff failed",
    needsAttention: Boolean(attention?.needsAttention)
  };
}
