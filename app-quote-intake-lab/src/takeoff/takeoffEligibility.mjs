/**
 * Pure takeoff-review eligibility gates for the Quote Intake Lab UI (Phase 4B.2).
 * Does not weaken TakeoffService validation — UI gates mirror request prerequisites.
 */

import { SUPPORTED_PLAN_MIME_TYPES } from "./takeoffTypes.mjs";

/**
 * @param {object|null|undefined} att
 */
export function isSupportedPlanAttachment(att) {
  if (!att || typeof att !== "object") return false;
  const mime = String(att.contentType ?? "").toLowerCase();
  if (!SUPPORTED_PLAN_MIME_TYPES.includes(mime)) return false;
  const hash = String(att.contentHash ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return false;
  const size = Number(att.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return false;
  return true;
}

/**
 * @param {object|null|undefined} caseItem
 */
export function listSupportedPlanAttachments(caseItem) {
  return (caseItem?.attachments ?? []).filter(isSupportedPlanAttachment);
}

/**
 * Attachments that look like plans by MIME but lack hash/size metadata.
 * @param {object|null|undefined} caseItem
 */
export function listIncompletePlanAttachments(caseItem) {
  return (caseItem?.attachments ?? []).filter((att) => {
    const mime = String(att?.contentType ?? "").toLowerCase();
    if (!SUPPORTED_PLAN_MIME_TYPES.includes(mime)) return false;
    return !isSupportedPlanAttachment(att);
  });
}

/**
 * @param {{
 *   caseItem: object|null|undefined,
 *   acceptedSnapshot?: object|null,
 *   selectedAttachmentId?: string|null
 * }} input
 */
export function evaluateTakeoffEligibility(input) {
  const caseItem = input?.caseItem ?? null;
  const snapshot = input?.acceptedSnapshot ?? null;
  const selectedAttachmentId = input?.selectedAttachmentId ?? null;
  /** @type {string[]} */
  const reasons = [];

  if (!caseItem) {
    return {
      eligible: false,
      canOpenWorkspace: false,
      canRun: false,
      reasons: ["Case is missing."],
      supportedAttachments: [],
      incompletePlanAttachments: [],
      requiresAttachmentSelection: false,
      elite100Decision: null,
      intent: null,
      acceptedSnapshotId: null
    };
  }

  const dataSource = caseItem.dataSource;
  if (dataSource !== "fixture" && dataSource !== "imported") {
    reasons.push("Case is not a local lab case or approved synthetic fixture.");
  }

  const acceptedSnapshotId = snapshot?.id ?? caseItem.acceptedSnapshotId ?? null;
  if (!snapshot && !acceptedSnapshotId) {
    reasons.push("Classification must be accepted.");
  } else if (!snapshot && acceptedSnapshotId) {
    // Pointer without loaded snapshot — still treat as needing snapshot contents for Elite decision.
    reasons.push("Classification must be accepted.");
  }

  const intent =
    snapshot?.intent ?? snapshot?.humanIntentDecision ?? caseItem.classificationIntentDecision ?? null;
  if (intent === "not_quote_related") {
    reasons.push("Case is not quote-related.");
  }

  const elite =
    snapshot?.workflowEligibility ??
    snapshot?.humanEligibilityDecision ??
    caseItem.classificationElite100Decision ??
    null;
  if (snapshot || acceptedSnapshotId) {
    if (elite === "non_elite_100_candidate") {
      reasons.push("Case is not Elite 100.");
    } else if (elite !== "elite_100_candidate") {
      reasons.push("Case is not Elite 100.");
    }
  }

  const supportedAttachments = listSupportedPlanAttachments(caseItem);
  const incompletePlanAttachments = listIncompletePlanAttachments(caseItem);

  if (!supportedAttachments.length) {
    if (incompletePlanAttachments.length) {
      reasons.push("Attachment metadata is incomplete.");
    } else {
      reasons.push("No supported plan attachment.");
    }
  }

  const requiresAttachmentSelection = supportedAttachments.length > 1;
  const effectiveSelectedId =
    selectedAttachmentId ||
    (supportedAttachments.length === 1 ? supportedAttachments[0].id : null);

  if (requiresAttachmentSelection && !selectedAttachmentId) {
    reasons.push("Multiple attachments require selection.");
  } else if (
    selectedAttachmentId &&
    supportedAttachments.length &&
    !supportedAttachments.some((a) => a.id === selectedAttachmentId)
  ) {
    reasons.push("Selected attachment is not a supported plan attachment.");
  }

  // Workspace can open when structural gates pass (accepted + elite + ≥1 supported plan).
  // Attachment selection is enforced for canRun, not for opening the workspace.
  const structuralReasons = reasons.filter(
    (r) => r !== "Multiple attachments require selection." && !r.startsWith("Selected attachment")
  );
  const canOpenWorkspace = structuralReasons.length === 0;
  const canRun =
    canOpenWorkspace &&
    Boolean(effectiveSelectedId) &&
    supportedAttachments.some((a) => a.id === effectiveSelectedId);

  return {
    eligible: canOpenWorkspace,
    canOpenWorkspace,
    canRun,
    reasons,
    supportedAttachments,
    incompletePlanAttachments,
    requiresAttachmentSelection,
    selectedAttachmentId: effectiveSelectedId,
    elite100Decision: elite,
    intent,
    acceptedSnapshotId: snapshot?.id ?? acceptedSnapshotId
  };
}

/**
 * Human-readable required action for a warning (UI only).
 * @param {{ blocking?: boolean, estimatorActionRequired?: boolean, severity?: string }} w
 */
export function warningRequiredAction(w) {
  if (w?.blocking || w?.severity === "approval_blocking") {
    return "Resolve before any future takeoff acceptance.";
  }
  if (w?.estimatorActionRequired || w?.severity === "estimator_review") {
    return "Estimator must review before proceeding.";
  }
  return "Informational — no action required for this simulated run.";
}

/**
 * @param {unknown[]} warnings
 */
export function groupWarningsBySeverity(warnings) {
  const list = Array.isArray(warnings) ? warnings : [];
  return {
    approval_blocking: list.filter((w) => w?.severity === "approval_blocking"),
    estimator_review: list.filter((w) => w?.severity === "estimator_review"),
    informational: list.filter((w) => w?.severity === "informational" || !w?.severity)
  };
}
