/**
 * Elite 100 Estimate Studio Command Center — presentation view-model adapter.
 *
 * Pure functions only. Maps existing authoritative queue/workflow fields into
 * operational stages, attention copy, and next actions. Does NOT write state,
 * invent Sold/Accepted workflows, or replace studioEstimateQueueWorkflow.
 *
 * @module studioCommandCenterViewModel
 */

import {
  deriveNeedsAttention,
  deriveQueueOpenTarget,
  deriveQueueWorkflowStatus
} from "./studioEstimateQueueWorkflow.mjs";

/** @typedef {'blocked'|'takeoff_failed'|'review_requested'|'pricing_stale'|'takeoff'|'pricing'|'ready_to_publish'|'customer'|'new'|'closed'|'unclassified'} CommandCenterStageKey */

export const COMMAND_CENTER_STAGE_PRECEDENCE = Object.freeze([
  "blocked",
  "takeoff_failed",
  "review_requested",
  "pricing_stale",
  "takeoff",
  "pricing",
  "ready_to_publish",
  "customer",
  "new",
  "closed",
  "unclassified"
]);

export const COMMAND_CENTER_SUMMARY_CARDS = Object.freeze([
  {
    key: "needs_attention",
    label: "Needs attention",
    description: "Items waiting on an estimator action"
  },
  {
    key: "in_progress",
    label: "In progress",
    description: "Takeoff or pricing work underway"
  },
  {
    key: "ready_to_publish",
    label: "Ready to publish",
    description: "Approved and ready for Digital Estimate"
  },
  {
    key: "waiting_on_customer",
    label: "Waiting on customer",
    description: "Published or customer configuring"
  },
  {
    key: "review_requested",
    label: "Review requested",
    description: "Customer asked for estimator review"
  }
]);

export const COMMAND_CENTER_STAGE_TABS = Object.freeze([
  { key: "needs_attention", label: "Needs attention", apiFilter: "needs_attention" },
  { key: "new", label: "New", apiFilter: "new" },
  { key: "takeoff", label: "Takeoff", apiFilter: "takeoff" },
  { key: "pricing", label: "Pricing", apiFilter: "estimating" },
  { key: "ready_to_publish", label: "Ready to publish", apiFilter: "estimating" },
  { key: "customer", label: "Customer", apiFilter: "sent" },
  { key: "review_requested", label: "Review requested", apiFilter: "customer_changes" },
  { key: "failed", label: "Failed", apiFilter: "failed" },
  { key: "all", label: "All", apiFilter: "all" }
]);

const ATTENTION_COPY = Object.freeze({
  new_unread: {
    title: "New request",
    detail: "This estimate has not been opened yet."
  },
  attachment_blocked: {
    title: "Source attachment needs attention",
    detail: "A required plan or attachment could not be used."
  },
  failed: {
    title: "AI Takeoff failed",
    detail: "The source plan could not be processed."
  },
  takeoff_needs_review: {
    title: "Needs Takeoff review",
    detail: "Review and approve the Takeoff before Pricing Setup."
  },
  estimate_stale: {
    title: "Estimate changed after approval",
    detail: "Recalculate and approve the estimate again."
  },
  estimate_not_calculated: {
    title: "Needs calculation",
    detail: "Pricing Setup is ready — calculate the estimate."
  },
  approved_not_published: {
    title: "Ready to publish",
    detail: "The estimate is approved. Publish the Digital Estimate."
  },
  customer_requested_changes: {
    title: "Customer requested review",
    detail: "Review the customer’s configuration changes."
  },
  publication_inactive: {
    title: "Publication inactive",
    detail: "The customer link was revoked or expired."
  }
});

const WORKFLOW_TO_STAGE = Object.freeze({
  New: "new",
  "Takeoff queued": "takeoff",
  "Takeoff processing": "takeoff",
  "Takeoff processing · manual draft in progress": "takeoff",
  "Takeoff draft ready": "takeoff",
  "Takeoff draft ready · AI findings appending": "takeoff",
  "Needs estimator review": "takeoff",
  "Scope in progress": "pricing",
  "Ready for approval": "ready_to_publish",
  Published: "customer",
  "Customer reviewing": "customer",
  "Customer submitted": "review_requested",
  Sold: "closed",
  Closed: "closed",
  "Takeoff failed": "takeoff_failed"
});

const STAGE_LABELS = Object.freeze({
  blocked: "Blocked",
  takeoff_failed: "AI processing failed",
  review_requested: "Review requested",
  pricing_stale: "Needs recalculation",
  takeoff: "Needs Takeoff review",
  pricing: "Pricing in progress",
  ready_to_publish: "Ready to publish",
  customer: "Waiting on customer",
  new: "New request",
  closed: "Closed",
  unclassified: "Needs attention"
});

/**
 * Plain-language stage label for a workflow status.
 * @param {string} workflowStatus
 */
export function stageLabelForWorkflow(workflowStatus) {
  const key = WORKFLOW_TO_STAGE[String(workflowStatus || "")] || "unclassified";
  if (workflowStatus === "Takeoff queued") return "AI processing";
  if (workflowStatus === "Takeoff processing") return "AI processing";
  if (String(workflowStatus || "").includes("manual draft")) return "Takeoff in progress";
  if (workflowStatus === "Takeoff draft ready") return "Needs Takeoff review";
  if (String(workflowStatus || "").includes("AI findings")) return "Takeoff in progress";
  if (workflowStatus === "Needs estimator review") return "Ready for Pricing";
  if (workflowStatus === "Scope in progress") return "Needs calculation";
  if (workflowStatus === "Ready for approval") return "Ready to publish";
  if (workflowStatus === "Published") return "Sent to customer";
  if (workflowStatus === "Customer reviewing") return "Customer configuring";
  if (workflowStatus === "Customer submitted") return "Review requested";
  if (workflowStatus === "Takeoff failed") return "AI processing failed";
  if (workflowStatus === "New") return "New request";
  if (workflowStatus === "Closed") return "Closed";
  if (workflowStatus === "Sold") return "Sold";
  return STAGE_LABELS[key] || "Needs attention";
}

/**
 * Map attention reason codes → plain-language copy (never show codes in UI).
 * @param {string[]} reasons
 */
export function attentionCopyFromReasons(reasons = []) {
  const list = Array.isArray(reasons) ? reasons : [];
  for (const code of list) {
    const copy = ATTENTION_COPY[code];
    if (copy) return { code, title: copy.title, detail: copy.detail };
  }
  if (list.length) {
    return {
      code: list[0],
      title: "Needs attention",
      detail: "Open this estimate to continue the next required step."
    };
  }
  return null;
}

/**
 * Severity for Needs attention sorting: 3 = blocked/error, 2 = customer review, 1 = normal attention.
 * @param {string[]} reasons
 * @param {string} workflowStatus
 */
export function attentionSeverity(reasons = [], workflowStatus = "") {
  const set = new Set(Array.isArray(reasons) ? reasons : []);
  if (set.has("failed") || set.has("attachment_blocked") || workflowStatus === "Takeoff failed") {
    return 3;
  }
  if (set.has("customer_requested_changes") || workflowStatus === "Customer submitted") {
    return 2;
  }
  if (set.has("estimate_stale") || set.has("publication_inactive")) return 2;
  if (reasons?.length) return 1;
  return 0;
}

/**
 * Next action presentation from openTarget + workflow.
 * @param {{ openTarget?: string, workflowStatus?: string, needsAttention?: boolean, attentionReasons?: string[] }} row
 */
export function nextActionFromRow(row = {}) {
  const target = String(row.openTarget || deriveQueueOpenTarget(row) || "takeoff");
  const workflow = String(row.workflowStatus || "");
  const reasons = new Set(row.attentionReasons || []);

  if (workflow === "Takeoff failed" || reasons.has("failed")) {
    return {
      nextActionKey: "review_intake",
      nextActionLabel: "Review request",
      nextActionRoute: "takeoff"
    };
  }
  if (target === "review" || workflow === "Customer submitted") {
    return {
      nextActionKey: "review_customer",
      nextActionLabel: "Review customer changes",
      nextActionRoute: "review"
    };
  }
  if (target === "digital" || workflow === "Ready for approval" || workflow === "Published") {
    if (reasons.has("approved_not_published") || workflow === "Ready for approval") {
      return {
        nextActionKey: "publish",
        nextActionLabel: "Publish Estimate",
        nextActionRoute: "digital"
      };
    }
    return {
      nextActionKey: "open_customer",
      nextActionLabel: "Open customer estimate",
      nextActionRoute: "digital"
    };
  }
  if (target === "scope") {
    if (reasons.has("estimate_stale")) {
      return {
        nextActionKey: "recalculate",
        nextActionLabel: "Calculate Estimate",
        nextActionRoute: "scope"
      };
    }
    if (reasons.has("estimate_not_calculated") || workflow === "Scope in progress") {
      return {
        nextActionKey: "complete_pricing",
        nextActionLabel: "Complete Pricing",
        nextActionRoute: "scope"
      };
    }
    return {
      nextActionKey: "open_pricing",
      nextActionLabel: "Open Pricing Setup",
      nextActionRoute: "scope"
    };
  }
  if (
    workflow === "Takeoff draft ready" ||
    workflow === "Needs estimator review" ||
    String(workflow).includes("AI findings")
  ) {
    return {
      nextActionKey: "review_takeoff",
      nextActionLabel: "Review Takeoff",
      nextActionRoute: "takeoff"
    };
  }
  if (workflow === "New") {
    return {
      nextActionKey: "review_request",
      nextActionLabel: "Review request",
      nextActionRoute: "takeoff"
    };
  }
  return {
    nextActionKey: "open_takeoff",
    nextActionLabel: "Open Takeoff",
    nextActionRoute: "takeoff"
  };
}

/**
 * Primary operational stage key (one per estimate).
 * Precedence documented in FEATURE_DECISIONS §154.
 *
 * @param {object} row queue row or derivation input
 */
export function resolveCommandCenterStageKey(row = {}) {
  const workflow =
    row.workflowStatus ||
    deriveQueueWorkflowStatus({
      caseStatus: row.caseStatus,
      firstOpenedAt: row.firstOpenedAt,
      takeoffJobId: row.takeoffJobId,
      takeoffJobStatus: row.takeoffJobStatus || row.aiTakeoffStatus,
      takeoffReviewStatus: row.takeoffReviewStatus,
      estimateStatus: row.estimateStatus,
      publicationStatus: row.publicationStatus || row.digitalEstimateStatus,
      reviewOperatorStatus: row.reviewOperatorStatus || row.customerReviewStatus,
      staleReason: row.staleReason,
      estimateNotCalculated: row.estimateNotCalculated,
      attachmentBlocked: row.attachmentBlocked || row.indicators?.attachmentBlocked,
      accepted: row.accepted,
      sold: row.sold,
      usableGeometryPresent: row.usableGeometryPresent,
      roomCount: row.roomCount,
      pieceCount: row.pieceCount
    });

  if (workflow === "Takeoff failed") return "takeoff_failed";
  if (workflow === "Customer submitted") return "review_requested";
  if (row.staleReason || (Array.isArray(row.attentionReasons) && row.attentionReasons.includes("estimate_stale"))) {
    return "pricing_stale";
  }
  if (workflow === "Ready for approval") return "ready_to_publish";
  if (workflow === "Published" || workflow === "Customer reviewing") return "customer";
  if (workflow === "Scope in progress") return "pricing";
  if (
    workflow === "Takeoff queued" ||
    workflow === "Takeoff processing" ||
    String(workflow).startsWith("Takeoff") ||
    workflow === "Needs estimator review"
  ) {
    return "takeoff";
  }
  if (workflow === "New") return "new";
  if (workflow === "Closed" || workflow === "Sold") return "closed";
  return WORKFLOW_TO_STAGE[workflow] || "unclassified";
}

/**
 * Age helper (ms → human label). Pure; no Date.now dependency when nowMs provided.
 * @param {string|null|undefined} iso
 * @param {number} [nowMs]
 */
export function ageInStageLabel(iso, nowMs = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.floor((nowMs - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Map one existing queue API row → Command Center item (read-only).
 * Does not mutate the row or call any I/O.
 *
 * @param {object} row
 * @param {{ nowMs?: number, currentUserId?: string|null }} [opts]
 */
export function toCommandCenterItem(row = {}, opts = {}) {
  const workflow = String(row.workflowStatus || "");
  const reasons = Array.isArray(row.attentionReasons) ? row.attentionReasons : [];
  const attention =
    row.needsAttention != null
      ? { needsAttention: Boolean(row.needsAttention), reasons }
      : deriveNeedsAttention(row, workflow || null);
  const attentionCopy = attentionCopyFromReasons(attention.reasons);
  const stageKey = resolveCommandCenterStageKey({ ...row, workflowStatus: workflow, attentionReasons: attention.reasons });
  const action = nextActionFromRow({
    ...row,
    workflowStatus: workflow,
    openTarget: row.openTarget,
    attentionReasons: attention.reasons
  });
  const receivedAt = row.receivedAt || null;
  const stageEnteredAt = row.lastActivityAt || row.receivedAt || null;
  const customerLabel = String(row.customerName || "").trim() || "Unknown customer";
  const projectLabel = String(row.projectName || "").trim() || "Untitled project";
  const assignedRaw = String(row.assignedEstimatorLabel || "").trim();
  // Never surface truncated UUID stubs ("User 902c8f2c…") in the Command Center.
  const assignedLooksLikeIdStub = /^user\s+[0-9a-f-]{6,}/i.test(assignedRaw);
  const assignedUser = !assignedRaw || assignedRaw === "Unassigned"
    ? "Unassigned"
    : assignedLooksLikeIdStub
      ? "Assigned estimator"
      : assignedRaw;
  const severity = attentionSeverity(attention.reasons, workflow);

  return {
    estimateRef: String(row.id || ""),
    customerLabel,
    projectLabel,
    quoteLabel: row.quoteLabel || row.quoteNumber || null,
    stageKey,
    stageLabel: stageLabelForWorkflow(workflow) || STAGE_LABELS[stageKey] || "Needs attention",
    workflowStatus: workflow,
    attentionRequired: Boolean(attention.needsAttention),
    attentionReason: attentionCopy?.title || null,
    attentionDetail: attentionCopy?.detail || null,
    attentionCodes: attention.reasons,
    severity,
    nextActionKey: action.nextActionKey,
    nextActionLabel: action.nextActionLabel,
    nextActionRoute: action.nextActionRoute,
    assignedUser,
    assignedEstimatorUserId: row.assignedEstimatorUserId || null,
    receivedAt,
    stageEnteredAt,
    ageInStage: ageInStageLabel(stageEnteredAt, opts.nowMs),
    customerWaiting: stageKey === "customer",
    blocked: stageKey === "takeoff_failed" || stageKey === "blocked",
    blockedReason:
      stageKey === "takeoff_failed"
        ? attentionCopy?.detail || "The source plan could not be processed."
        : null,
    summaryText: buildSummaryText(row, workflow),
    safeCounts: {
      roomCount: Number(row.roomCount) || null,
      pieceCount: Number(row.pieceCount) || null,
      attachmentCount: Number(row.attachmentCount) || null,
      advisoryCount: Number(row.advisoryCount) || null
    },
    openTarget: action.nextActionRoute,
    needsCompletionHint:
      customerLabel === "Unknown customer" || projectLabel === "Untitled project",
    classificationWarning: stageKey === "unclassified" ? "Record could not be classified confidently." : null
  };
}

function buildSummaryText(row, workflow) {
  const parts = [];
  if (workflow) parts.push(stageLabelForWorkflow(workflow));
  const rooms = Number(row.roomCount) || 0;
  const pieces = Number(row.pieceCount) || 0;
  if (pieces > 0) parts.push(`${pieces} piece${pieces === 1 ? "" : "s"}`);
  if (rooms > 0) parts.push(`${rooms} room${rooms === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/**
 * Filter Command Center items by stage tab (client-side refinement after API filter).
 * @param {ReturnType<typeof toCommandCenterItem>[]} items
 * @param {string} stageTab
 */
export function filterCommandCenterItems(items, stageTab) {
  const key = String(stageTab || "needs_attention");
  const list = Array.isArray(items) ? items : [];
  if (key === "all") return list;
  if (key === "needs_attention") return list.filter((i) => i.attentionRequired);
  if (key === "in_progress") {
    return list.filter((i) => i.stageKey === "takeoff" || i.stageKey === "pricing");
  }
  if (key === "waiting_on_customer") return list.filter((i) => i.stageKey === "customer");
  if (key === "failed") return list.filter((i) => i.stageKey === "takeoff_failed");
  if (key === "ready_to_publish") return list.filter((i) => i.stageKey === "ready_to_publish");
  if (key === "review_requested") return list.filter((i) => i.stageKey === "review_requested");
  if (key === "pricing") return list.filter((i) => i.stageKey === "pricing" || i.stageKey === "pricing_stale");
  if (key === "takeoff") return list.filter((i) => i.stageKey === "takeoff" || i.stageKey === "takeoff_failed");
  if (key === "new") return list.filter((i) => i.stageKey === "new");
  if (key === "customer") return list.filter((i) => i.stageKey === "customer");
  return list;
}

/**
 * Summary card counts from the same item list (single source of truth).
 * @param {ReturnType<typeof toCommandCenterItem>[]} items
 */
export function commandCenterSummaryCounts(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    needs_attention: list.filter((i) => i.attentionRequired).length,
    in_progress: list.filter((i) => i.stageKey === "takeoff" || i.stageKey === "pricing").length,
    ready_to_publish: list.filter((i) => i.stageKey === "ready_to_publish").length,
    waiting_on_customer: list.filter((i) => i.stageKey === "customer").length,
    review_requested: list.filter((i) => i.stageKey === "review_requested").length
  };
}

/**
 * Default Needs attention sort: severity desc → oldest stage → oldest received.
 * @param {ReturnType<typeof toCommandCenterItem>[]} items
 */
export function sortCommandCenterItems(items, sortKey = "attention") {
  const list = [...(Array.isArray(items) ? items : [])];
  const ts = (v) => {
    const n = Date.parse(String(v || ""));
    return Number.isFinite(n) ? n : 0;
  };
  if (sortKey === "newest_received") {
    return list.sort((a, b) => ts(b.receivedAt) - ts(a.receivedAt));
  }
  if (sortKey === "oldest_received") {
    return list.sort((a, b) => ts(a.receivedAt) - ts(b.receivedAt));
  }
  if (sortKey === "customer") {
    return list.sort((a, b) =>
      `${a.customerLabel}\0${a.projectLabel}`.localeCompare(`${b.customerLabel}\0${b.projectLabel}`)
    );
  }
  // Default attention sort
  return list.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    const ageA = ts(a.stageEnteredAt) || ts(a.receivedAt);
    const ageB = ts(b.stageEnteredAt) || ts(b.receivedAt);
    if (ageA !== ageB) return ageA - ageB;
    return ts(a.receivedAt) - ts(b.receivedAt);
  });
}

/**
 * Map Command Center tab → existing queue API filter (no new backend filters).
 * @param {string} stageTab
 */
export function apiFilterForStageTab(stageTab) {
  const tab = COMMAND_CENTER_STAGE_TABS.find((t) => t.key === stageTab);
  return tab?.apiFilter || "needs_attention";
}

/**
 * Persist/restore Command Center view prefs (session only — no DB writes).
 */
export const COMMAND_CENTER_SESSION_KEY = "elite100_estimate_command_center_view_v1";

export function loadCommandCenterSessionPrefs() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(COMMAND_CENTER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCommandCenterSessionPrefs(prefs) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(COMMAND_CENTER_SESSION_KEY, JSON.stringify(prefs || {}));
  } catch {
    /* ignore quota */
  }
}
