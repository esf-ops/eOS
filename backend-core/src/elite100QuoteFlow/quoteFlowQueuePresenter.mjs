/**
 * Present Estimate Queue rows for Quote Flow Slice 1C.
 */

/**
 * @param {string} workflowStatus
 * @param {{ alreadyScoped?: boolean, reviewReady?: boolean, takeoffJobStatus?: string }} opts
 */
export function mapQuoteFlowQueueStatus(workflowStatus, opts = {}) {
  if (opts.alreadyScoped === true) {
    return { key: "scope_set", label: "Scope is set" };
  }
  const wf = String(workflowStatus || "");
  const job = String(opts.takeoffJobStatus || "").toLowerCase();
  if (/fail/i.test(wf) || job === "failed" || job === "error") {
    return { key: "takeoff_failed", label: "Takeoff failed" };
  }
  if (/queued/i.test(wf) || job === "queued" || job === "pending") {
    return { key: "takeoff_queued", label: "Takeoff queued" };
  }
  if (/processing/i.test(wf) || job === "processing") {
    return { key: "takeoff_processing", label: "Takeoff processing" };
  }
  if (
    opts.reviewReady === true ||
    /draft ready|needs estimator review|needs_review|in_review/i.test(wf)
  ) {
    return { key: "ready_for_review", label: "Ready for review" };
  }
  if (/scope in progress|ready for approval/i.test(wf)) {
    return { key: "scope_set", label: "Scope is set" };
  }
  return { key: "ready_for_review", label: wf || "Ready for review" };
}

/**
 * @param {object} row studioEstimateQueueService case row
 * @param {{ alreadyScoped?: boolean, estimateId?: string|null }} [opts]
 */
export function presentQuoteFlowQueueItem(row, opts = {}) {
  const takeoffJobId = row?.takeoffJobId || null;
  const workflowStatus = String(row?.workflowStatus || "");
  const reviewReady =
    /draft ready|needs estimator review/i.test(workflowStatus) ||
    String(row?.takeoffReviewStatus || "").toLowerCase() === "needs_review" ||
    String(row?.takeoffReviewStatus || "").toLowerCase() === "in_review";
  const status = mapQuoteFlowQueueStatus(workflowStatus, {
    alreadyScoped: opts.alreadyScoped === true,
    reviewReady,
    takeoffJobStatus: row?.takeoffJobStatus || row?.aiTakeoffStatus || null
  });

  return {
    takeoffJobId,
    intakeCaseId: row?.id || row?.intakeCaseId || null,
    estimateId: opts.estimateId || row?.studioEstimateId || null,
    customerName: row?.customerName || null,
    projectName: row?.projectName || row?.projectLabel || null,
    workflowStatus,
    status,
    alreadyScoped: opts.alreadyScoped === true,
    reviewReady: status.key === "ready_for_review",
    action: status.key === "ready_for_review" ? "review_takeoff" : null,
    actionLabel: status.key === "ready_for_review" ? "Review Takeoff" : null
  };
}
