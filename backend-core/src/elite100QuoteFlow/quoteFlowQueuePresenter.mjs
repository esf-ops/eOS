/**
 * Present Estimate Queue rows for Quote Flow — Scope Creation Queue.
 * Official-scope rows belong in Estimates, not the main queue.
 */

import { formatQuoteFlowPersonLabel } from "./quoteFlowInboxPresenter.mjs";

/**
 * @param {string} workflowStatus
 * @param {{ alreadyScoped?: boolean, reviewReady?: boolean, takeoffJobStatus?: string, manualScope?: boolean }} opts
 */
export function mapQuoteFlowQueueStatus(workflowStatus, opts = {}) {
  if (opts.alreadyScoped === true) {
    return { key: "scope_set", label: "Scope set" };
  }
  if (opts.manualScope === true) {
    return { key: "manual_scope_needed", label: "Manual scope needed" };
  }
  const wf = String(workflowStatus || "");
  const job = String(opts.takeoffJobStatus || "").toLowerCase();
  if (/fail/i.test(wf) || job === "failed" || job === "error") {
    return { key: "takeoff_failed", label: "Takeoff failed / needs decision" };
  }
  if (/queued/i.test(wf) || job === "queued" || job === "pending") {
    return { key: "takeoff_queued", label: "Waiting on AI Takeoff" };
  }
  if (/processing/i.test(wf) || job === "processing") {
    return { key: "takeoff_processing", label: "Waiting on AI Takeoff" };
  }
  if (
    opts.reviewReady === true ||
    /draft ready|needs estimator review|needs_review|in_review|returned/i.test(wf)
  ) {
    return { key: "ready_for_review", label: "AI Takeoff ready for review" };
  }
  if (/scope in progress|ready for approval/i.test(wf)) {
    // Without official scope this is still queue work — prefer ready/manual.
    return { key: "ready_for_review", label: "AI Takeoff ready for review" };
  }
  if (/cancel|no.?plan|manual/i.test(wf) || job === "cancelled" || job === "canceled") {
    return { key: "manual_scope_needed", label: "Manual scope needed" };
  }
  return { key: "ready_for_review", label: wf || "AI Takeoff ready for review" };
}

/**
 * @param {string} statusKey
 */
export function mapQuoteFlowQueueGroup(statusKey) {
  const key = String(statusKey || "");
  if (key === "ready_for_review") {
    return { key: "ready", label: "Ready for AI review", sortOrder: 0 };
  }
  if (key === "manual_scope_needed") {
    return { key: "manual", label: "Manual scope needed", sortOrder: 1 };
  }
  if (key === "takeoff_queued" || key === "takeoff_processing") {
    return { key: "processing", label: "AI Takeoff processing", sortOrder: 2 };
  }
  if (key === "takeoff_failed") {
    return { key: "failed", label: "Failed / needs attention", sortOrder: 3 };
  }
  return { key: "other", label: "Other", sortOrder: 9 };
}

/**
 * @param {string} statusKey
 */
export function mapQuoteFlowQueueNextAction(statusKey) {
  switch (String(statusKey || "")) {
    case "ready_for_review":
      return { key: "review_takeoff", label: "Review Takeoff" };
    case "manual_scope_needed":
      return { key: "create_manual_scope", label: "Create Manual Scope" };
    case "takeoff_failed":
      return { key: "create_manual_scope", label: "Create Manual Scope" };
    case "takeoff_queued":
    case "takeoff_processing":
      return { key: "waiting", label: "Waiting on AI Takeoff" };
    case "scope_set":
      return { key: "view_estimates", label: "Open in Estimates" };
    default:
      return { key: "open", label: "Open" };
  }
}

/**
 * Safe display labels — avoid "Customer not identified / Project not named" spam.
 * @param {object} row
 */
export function resolveQueueRowLabels(row = {}) {
  const customer = formatQuoteFlowPersonLabel(
    row.customerName ?? row.customer ?? row.sender ?? row.senderLabel,
    ""
  );
  const projectRaw = row.projectName ?? row.projectLabel ?? row.subject ?? null;
  let project =
    projectRaw == null || projectRaw === ""
      ? ""
      : typeof projectRaw === "string" || typeof projectRaw === "number"
        ? String(projectRaw).trim()
        : formatQuoteFlowPersonLabel(projectRaw, "");
  if (/not named|not identified|unknown project/i.test(project)) project = "";

  const planFilename = String(
    row.planFilename ||
      row.attachmentName ||
      row.sourcePlanName ||
      row.planName ||
      row.bestPlanFilename ||
      ""
  ).trim();

  const customerDisplay =
    (customer && customer !== "Unknown contact" ? customer : null) ||
    (planFilename ? `Plan: ${planFilename}` : null) ||
    "Unknown contact";

  const projectDisplay =
    project ||
    (planFilename || null) ||
    (customer && customer !== "Unknown contact" ? customer : null) ||
    "Quote request";

  const requestTitle = project || planFilename || customerDisplay;

  return {
    customerDisplay,
    projectDisplay,
    requestTitle,
    planFilename: planFilename || null
  };
}

/**
 * @param {object} row studioEstimateQueueService case row
 * @param {{
 *   alreadyScoped?: boolean,
 *   estimateId?: string|null,
 *   roomCount?: number|null,
 *   pieceCount?: number|null,
 *   totalSf?: number|null,
 *   failureReason?: string|null,
 *   manualScope?: boolean
 * }} [opts]
 */
export function presentQuoteFlowQueueItem(row, opts = {}) {
  const takeoffJobId = row?.takeoffJobId || null;
  const workflowStatus = String(row?.workflowStatus || "");
  const reviewReady =
    opts.manualScope !== true &&
    (/draft ready|needs estimator review|returned/i.test(workflowStatus) ||
      String(row?.takeoffReviewStatus || "").toLowerCase() === "needs_review" ||
      String(row?.takeoffReviewStatus || "").toLowerCase() === "in_review");

  const status = mapQuoteFlowQueueStatus(workflowStatus, {
    alreadyScoped: opts.alreadyScoped === true,
    reviewReady,
    takeoffJobStatus: row?.takeoffJobStatus || row?.aiTakeoffStatus || null,
    manualScope: opts.manualScope === true
  });
  const group = mapQuoteFlowQueueGroup(status.key);
  const nextAction = mapQuoteFlowQueueNextAction(status.key);
  const labels = resolveQueueRowLabels(row);

  const roomCount =
    opts.roomCount != null
      ? Number(opts.roomCount)
      : row?.roomCount != null
        ? Number(row.roomCount)
        : null;
  const pieceCount =
    opts.pieceCount != null
      ? Number(opts.pieceCount)
      : row?.pieceCount != null
        ? Number(row.pieceCount)
        : null;
  const totalSf =
    opts.totalSf != null
      ? Number(opts.totalSf)
      : row?.totalSf != null
        ? Number(row.totalSf)
        : null;

  let summaryLabel = null;
  if (Number.isFinite(roomCount) || Number.isFinite(pieceCount) || Number.isFinite(totalSf)) {
    const parts = [];
    if (Number.isFinite(roomCount)) parts.push(`${roomCount} room${roomCount === 1 ? "" : "s"}`);
    if (Number.isFinite(pieceCount)) parts.push(`${pieceCount} piece${pieceCount === 1 ? "" : "s"}`);
    if (Number.isFinite(totalSf) && totalSf > 0) parts.push(`${totalSf} SF`);
    summaryLabel = parts.length ? parts.join(" · ") : null;
  }

  const failureReason =
    status.key === "takeoff_failed"
      ? String(opts.failureReason || row?.failureReason || row?.takeoffError || "").trim() || null
      : null;

  return {
    takeoffJobId,
    intakeCaseId: row?.id || row?.intakeCaseId || null,
    estimateId: opts.estimateId || row?.studioEstimateId || null,
    messageKey: row?.messageKey || row?.graphMessageKey || row?.mailboxMessageKey || null,
    customerName: labels.customerDisplay,
    projectName: labels.projectDisplay,
    customerDisplay: labels.customerDisplay,
    projectDisplay: labels.projectDisplay,
    requestTitle: labels.requestTitle,
    planFilename: labels.planFilename,
    receivedAt: row?.receivedAt || row?.createdAt || row?.updatedAt || null,
    returnedAt: row?.returnedAt || row?.takeoffReturnedAt || null,
    startedAt: row?.takeoffStartedAt || row?.startedAt || null,
    workflowStatus,
    status,
    group,
    nextAction,
    summary: {
      roomCount: Number.isFinite(roomCount) ? roomCount : null,
      pieceCount: Number.isFinite(pieceCount) ? pieceCount : null,
      totalSf: Number.isFinite(totalSf) ? totalSf : null,
      label: summaryLabel
    },
    failureReason,
    alreadyScoped: opts.alreadyScoped === true,
    reviewReady: status.key === "ready_for_review",
    canCreateManualScope:
      status.key === "manual_scope_needed" ||
      status.key === "takeoff_failed" ||
      status.key === "ready_for_review",
    canReviewTakeoff: status.key === "ready_for_review" && Boolean(takeoffJobId),
    action:
      status.key === "ready_for_review"
        ? "review_takeoff"
        : status.key === "manual_scope_needed" || status.key === "takeoff_failed"
          ? "create_manual_scope"
          : status.key === "takeoff_queued" || status.key === "takeoff_processing"
            ? "waiting"
            : null,
    actionLabel: nextAction.label
  };
}

/**
 * @param {object[]} items
 */
export function sortQuoteFlowQueueItems(items) {
  const list = Array.isArray(items) ? [...items] : [];
  list.sort((a, b) => {
    const ao = Number(a?.group?.sortOrder ?? 99);
    const bo = Number(b?.group?.sortOrder ?? 99);
    if (ao !== bo) return ao - bo;
    const aTime = String(a?.returnedAt || a?.receivedAt || a?.startedAt || "");
    const bTime = String(b?.returnedAt || b?.receivedAt || b?.startedAt || "");
    return bTime.localeCompare(aTime);
  });
  return list;
}

/**
 * @param {object[]} items
 */
export function groupQuoteFlowQueueItems(items) {
  const sorted = sortQuoteFlowQueueItems(items);
  /** @type {Record<string, object[]>} */
  const buckets = {
    ready: [],
    manual: [],
    processing: [],
    failed: [],
    other: []
  };
  for (const item of sorted) {
    const key = item?.group?.key || "other";
    if (buckets[key]) buckets[key].push(item);
    else buckets.other.push(item);
  }
  return {
    ready: buckets.ready,
    manual: buckets.manual,
    processing: buckets.processing,
    failed: buckets.failed,
    stats: {
      readyForReview: buckets.ready.length,
      manualScopeNeeded: buckets.manual.length,
      processing: buckets.processing.length,
      failed: buckets.failed.length,
      total: sorted.length
    }
  };
}
