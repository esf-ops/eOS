/**
 * Shared Inbox Phase 1 — safe row adapter over mailbox preview + queue enrichment.
 * Pure projection. No Graph I/O. No mutations. No delivery side effects.
 *
 * Operational truth for imported rows reuses buildStudioOperationalState via queue rows.
 */

import {
  canMarkAsPlanForTakeoff,
  isAutoSupportedTakeoffSupport,
  planSupportLabel,
  summarizeRowPlanSupport
} from "../quoteIntake/quoteIntakePlanAttachmentSupport.mjs";
import { buildStudioOperationalState } from "./studioOperationalStatus.mjs";
import {
  resolveCustomerDisplayLabel,
  resolveEstimatorDisplayLabel,
  resolveProjectDisplayLabel
} from "./studioIdentityDisplay.mjs";
import {
  deriveInboxEstimateStatus,
  INBOX_ESTIMATE_STATUS_LABELS,
  simplifyInboxPrimaryAction
} from "./studioSimplifiedWorkflow.mjs";

/** Deterministic inbox keys (backend authority). */
export const SHARED_INBOX_STATES = Object.freeze({
  NOT_IMPORTED: "not_imported",
  IMPORTED: "imported",
  ALREADY_IMPORTED: "already_imported",
  TAKEOFF_PROCESSING: "takeoff_processing",
  TAKEOFF_READY: "takeoff_ready",
  NEEDS_MANUAL_REVIEW: "needs_manual_review",
  UNSUPPORTED_ATTACHMENT: "unsupported_attachment",
  IMPORT_FAILED: "import_failed"
});

const FORBIDDEN_KEYS = Object.freeze([
  "accessToken",
  "refreshToken",
  "authorization",
  "clientSecret",
  "clientId",
  "tenantId",
  "service_role",
  "serviceRole",
  "token_hash",
  "tokenHash",
  "token_wrapped",
  "tokenWrapped",
  "rawToken",
  "customerUrl",
  "attachmentUrl",
  "contentUrl",
  "downloadUrl",
  "@odata.nextLink",
  "nextLink",
  "graphPayload",
  "rawGraph"
]);

const BODY_PREVIEW_MAX = 280;
const SUBJECT_MAX = 200;

/**
 * Plain-text sanitize — strip tags/scripts; never for HTML render.
 * @param {unknown} value
 * @param {number} max
 */
export function sanitizeInboxText(value, max = BODY_PREVIEW_MAX) {
  let s = String(value ?? "");
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;/gi, "'");
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  // Common signature placeholders / debris (not a full signature parser).
  s = s.replace(/\[(?:photo|icon|image|logo|cid:[^\]]+)\]/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

/**
 * @param {unknown} value
 */
function stripForbiddenDeep(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => stripForbiddenDeep(v, depth + 1));
  if (typeof value !== "object") return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(k)) continue;
    if (/token|secret|password|authorization/i.test(k) && typeof v === "string") continue;
    if (/^https?:\/\//i.test(String(v)) && /attachment|download|graph\.microsoft/i.test(String(v))) {
      continue;
    }
    out[k] = stripForbiddenDeep(v, depth + 1);
  }
  return out;
}

/**
 * @param {object} att preview attachment meta
 */
function mapAttachment(att = {}) {
  const support = String(att.support || "");
  const supportedForTakeoff = isAutoSupportedTakeoffSupport(support);
  const supportedForImport = supportedForTakeoff || support === "too_large";
  const mime = String(att.mimeType || att.contentType || "").toLowerCase();
  const name = String(att.name || att.filename || "").toLowerCase();
  const previewSupported =
    supportedForTakeoff ||
    support === "direct_pdf" ||
    support === "direct_image_plan" ||
    support === "image_needs_review" ||
    mime === "image/png" ||
    /\.png$/i.test(name) ||
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    /\.jpe?g$/i.test(name) ||
    mime === "image/webp" ||
    /\.webp$/i.test(name) ||
    mime.includes("pdf") ||
    /\.pdf$/i.test(name);

  return {
    attachmentKey: att.sourceAttachmentId || att.attachmentKey || null,
    filename: sanitizeInboxText(att.name || att.filename || "attachment", 120) || "attachment",
    contentType: att.mimeType || att.contentType || null,
    sizeBytes: Number.isFinite(Number(att.sizeBytes)) ? Number(att.sizeBytes) : null,
    supportedForTakeoff,
    supportedForImport,
    previewSupported,
    canMarkAsPlan: canMarkAsPlanForTakeoff(support, {
      mimeType: att.mimeType || att.contentType,
      name: att.name || att.filename,
      isInline: att.isInline
    }),
    supportLabel: planSupportLabel(support),
    support,
    kind: att.kind || null,
    isInline: Boolean(att.isInline),
    sizeExceeded: att.sizeExceeded === true || support === "too_large"
  };
}

/**
 * @param {object} previewMessage from previewQuoteIntakeMailbox
 * @returns {{ supportState: string, supportExplanation: string }}
 */
export function deriveSupportState(previewMessage = {}) {
  const hint = String(previewMessage.eligibilityHint || "");
  const attachments = Array.isArray(previewMessage.attachments)
    ? previewMessage.attachments.map(mapAttachment)
    : [];
  const supportedCount = attachments.filter((a) => a.supportedForTakeoff).length;

  if (hint === "attachment_list_failed" || hint === "attachment_list_empty") {
    return {
      supportState: SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW,
      supportExplanation:
        "Attachment metadata could not be confirmed. Review this request before importing."
    };
  }
  if (hint === "attachment_too_large") {
    return {
      supportState: SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW,
      supportExplanation: "Plan attachment exceeds the current size limit."
    };
  }
  if (hint === "manual_review_multi_pdf") {
    return {
      supportState: SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW,
      supportExplanation: "Choose the plan file to send to AI Takeoff."
    };
  }
  if (hint === "manual_review" || (hint === "importable_no_pdf" && supportedCount === 0)) {
    const needsReviewCount = attachments.filter((a) => a.support === "image_needs_review").length;
    return {
      supportState:
        needsReviewCount > 0
          ? SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW
          : SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT,
      supportExplanation:
        supportedCount === 0 && needsReviewCount > 0
          ? "An image attachment is present but needs review before AI Takeoff. You can mark it as a plan or continue with a manual estimate."
          : supportedCount === 0
            ? "No currently supported plan PDF or image is attached. You can still import for manual estimate work."
            : "This message needs manual review before AI Takeoff."
    };
  }
  if (supportedCount === 0 && previewMessage.hasAttachments) {
    const needsReviewCount = attachments.filter((a) => a.support === "image_needs_review").length;
    return {
      supportState:
        needsReviewCount > 0
          ? SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW
          : SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT,
      supportExplanation:
        needsReviewCount > 0
          ? "Attachments are present; mark an image as a plan for AI Takeoff, or continue manually."
          : "Attachments are present but none are a supported plan PDF or image."
    };
  }
  if (!previewMessage.hasAttachments && supportedCount === 0) {
    return {
      supportState: SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT,
      supportExplanation: "No plan attachment is present. Manual estimate import remains available."
    };
  }
  const imagePlans = attachments.filter((a) => a.support === "direct_image_plan").length;
  const pdfPlans = attachments.filter((a) => a.support === "direct_pdf").length;
  return {
    supportState: "supported",
    supportExplanation:
      imagePlans > 0 && pdfPlans === 0
        ? "Supported image plan available for AI Takeoff."
        : pdfPlans > 0 && imagePlans === 0
          ? "Supported plan PDF available for AI Takeoff."
          : "Supported plan attachment available for AI Takeoff."
  };
}

/**
 * Map AI Takeoff display from queue enrichment.
 * @param {object|null} queueRow
 */
export function deriveAiTakeoffSummary(queueRow) {
  if (!queueRow) {
    return {
      state: "not_started",
      takeoffJobId: null,
      reviewReady: false,
      label: "Not started"
    };
  }
  const opKey = String(queueRow.operationalState?.key || "");
  const workflow = String(queueRow.workflowStatus || "");
  const takeoffJobId = queueRow.takeoffJobId || null;
  const display = String(queueRow.aiTakeoffStatus || "");

  if (display.includes("Manual scope")) {
    return {
      state: "not_applicable",
      takeoffJobId,
      reviewReady: false,
      label: "Not applicable"
    };
  }
  if (opKey === "takeoff_failed" || workflow === "Takeoff failed" || /fail/i.test(display)) {
    return { state: "failed", takeoffJobId, reviewReady: false, label: "Failed" };
  }
  if (opKey === "takeoff_processing" || /processing|queued/i.test(workflow + display)) {
    return { state: "processing", takeoffJobId, reviewReady: false, label: "Processing" };
  }
  if (
    opKey === "needs_takeoff_review" ||
    opKey === "needs_plan_review" ||
    /review|draft ready|AI findings/i.test(workflow + display)
  ) {
    return { state: "needs_review", takeoffJobId, reviewReady: true, label: "Needs review" };
  }
  if (/approved/i.test(display) || workflow === "Scope in progress") {
    return { state: "approved", takeoffJobId, reviewReady: false, label: "Approved" };
  }
  if (!takeoffJobId) {
    return { state: "not_started", takeoffJobId: null, reviewReady: false, label: "Not started" };
  }
  return { state: "not_started", takeoffJobId, reviewReady: false, label: display || "Not started" };
}

/**
 * @param {{
 *   previewMessage: object,
 *   queueRow?: object|null,
 *   lastImportError?: { code?: string, message?: string }|null
 * }} input
 */
export function buildSharedInboxRow(input = {}) {
  const preview = input.previewMessage && typeof input.previewMessage === "object"
    ? input.previewMessage
    : {};
  const queueRow = input.queueRow && typeof input.queueRow === "object" ? input.queueRow : null;
  const lastImportError =
    input.lastImportError && typeof input.lastImportError === "object"
      ? input.lastImportError
      : null;

  const messageKey = String(preview.graphMessageId || preview.messageKey || "").trim();
  const attachments = Array.isArray(preview.attachments)
    ? preview.attachments.map(mapAttachment)
    : [];
  const supportedAttachmentCount = attachments.filter((a) => a.supportedForTakeoff).length;
  const planSupportSummary = summarizeRowPlanSupport(attachments);
  const { supportState, supportExplanation: baseSupportExplanation } = deriveSupportState(preview);
  const planSelectionRequired =
    planSupportSummary?.planSelectionRequired === true ||
    planSupportSummary?.key === "choose_plan" ||
    String(preview.eligibilityHint || "") === "manual_review_multi_pdf";
  const supportExplanation = planSelectionRequired
    ? "Choose the plan file to send to AI Takeoff."
    : baseSupportExplanation;

  const alreadyImported = Boolean(preview.alreadyImported || preview.existingCaseId || queueRow?.id);
  const intakeCaseId =
    (queueRow?.id ? String(queueRow.id) : null) ||
    (preview.existingCaseId ? String(preview.existingCaseId) : null);
  const estimateId = queueRow?.studioEstimateId || null;
  const activeEstimateId = estimateId;

  const senderRaw = sanitizeInboxText(preview.sender?.displayName || "", 120);
  const senderDisplay = senderRaw || "Unknown sender";
  const subject = sanitizeInboxText(preview.subject, SUBJECT_MAX) || "(no subject)";
  const bodyPreview = sanitizeInboxText(preview.bodyPreview, BODY_PREVIEW_MAX);

  const customerDisplay = resolveCustomerDisplayLabel({
    customerIdentitySnapshot: null,
    customerName: queueRow?.customerName,
    intakeCustomerName: queueRow?.customerName,
    // Only pass a real sender name — never the "Unknown sender" UI placeholder.
    senderDisplayName: senderRaw || null
  });
  const projectDisplay = resolveProjectDisplayLabel({
    projectName: queueRow?.projectName || queueRow?.projectLabel
  });
  const estimatorDisplay = resolveEstimatorDisplayLabel({
    assignedEstimatorLabel: queueRow?.assignedEstimatorLabel || null
  });

  const aiTakeoff = deriveAiTakeoffSummary(queueRow);
  let operationalState = null;
  if (queueRow?.operationalState) {
    operationalState = queueRow.operationalState;
  } else if (queueRow) {
    operationalState = buildStudioOperationalState({
      workflowStatus: queueRow.workflowStatus,
      estimateStatus: queueRow.estimateStatus,
      publicationStatus: queueRow.digitalEstimateStatus,
      caseSourceType: queueRow.sourceType,
      takeoffJobId: queueRow.takeoffJobId,
      manualScopeConfirmed: queueRow.manualScopeConfirmed
    });
  }

  const takeoffFailed = aiTakeoff.state === "failed";
  const hasUsableTakeoff =
    Boolean(aiTakeoff.takeoffJobId) && !takeoffFailed && aiTakeoff.state !== "not_applicable";

  /** @type {string} */
  let importState = SHARED_INBOX_STATES.NOT_IMPORTED;
  /** @type {string} */
  let primaryActionKey = "import_and_open";
  /** @type {string} */
  let primaryActionLabel = "Import and open";
  /** @type {string} */
  let openTarget = "takeoff";

  if (lastImportError && !alreadyImported) {
    importState = SHARED_INBOX_STATES.IMPORT_FAILED;
    primaryActionKey = "retry_import";
    primaryActionLabel = "Retry import";
  } else if (alreadyImported) {
    importState = SHARED_INBOX_STATES.ALREADY_IMPORTED;
    const opKey = String(operationalState?.key || "");
    if (takeoffFailed || (opKey === "takeoff_failed" && !hasUsableTakeoff)) {
      // Import may have succeeded while AI Takeoff handoff failed — do not Resume.
      importState = SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW;
      primaryActionKey = "choose_plan";
      primaryActionLabel = "Choose plan";
      openTarget = "takeoff";
    } else if (opKey === "takeoff_processing" && hasUsableTakeoff) {
      importState = SHARED_INBOX_STATES.TAKEOFF_PROCESSING;
      primaryActionKey = "open_studio_v2";
      primaryActionLabel = "Continue in Studio V2";
      openTarget = "takeoff";
    } else if ((opKey === "needs_takeoff_review" || aiTakeoff.reviewReady) && hasUsableTakeoff) {
      importState = SHARED_INBOX_STATES.TAKEOFF_READY;
      primaryActionKey = "open_studio_v2";
      primaryActionLabel = "Open Studio V2";
      openTarget = "takeoff";
    } else if (
      opKey === "needs_plan_review" ||
      String(queueRow?.caseStatus || "").toLowerCase() === "manual_review" ||
      (planSelectionRequired && !hasUsableTakeoff)
    ) {
      importState = SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW;
      // Imported multi-plan / manual review without usable takeoff — choose a plan.
      primaryActionKey = "choose_plan";
      primaryActionLabel = "Choose plan";
      openTarget = operationalState?.openTarget || "takeoff";
    } else if (!hasUsableTakeoff && supportedAttachmentCount > 0) {
      // Imported with plan(s) but takeoff not started — open details to send (not Resume).
      importState = SHARED_INBOX_STATES.IMPORTED;
      primaryActionKey = "choose_plan";
      primaryActionLabel =
        supportedAttachmentCount > 1 || planSelectionRequired
          ? "Choose plan"
          : "Send to AI Takeoff";
      openTarget = "takeoff";
    } else if (hasUsableTakeoff) {
      importState = SHARED_INBOX_STATES.IMPORTED;
      primaryActionKey = "open_studio_v2";
      primaryActionLabel = "Open Studio V2";
      openTarget = "takeoff";
    } else if (estimateId) {
      importState = SHARED_INBOX_STATES.IMPORTED;
      primaryActionKey = "open_estimate";
      primaryActionLabel = operationalState?.primaryAction || "Open estimate";
      openTarget = operationalState?.openTarget || "takeoff";
    } else {
      importState = SHARED_INBOX_STATES.IMPORTED;
      primaryActionKey = "choose_plan";
      primaryActionLabel = "Choose plan";
      openTarget = "takeoff";
    }
  } else if (supportState === SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT) {
    importState = SHARED_INBOX_STATES.NOT_IMPORTED;
    primaryActionKey = "create_manual_estimate";
    primaryActionLabel = "Create manual estimate";
    openTarget = "scope";
  } else if (planSelectionRequired || supportState === SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW) {
    importState = SHARED_INBOX_STATES.NOT_IMPORTED;
    primaryActionKey = "choose_plan";
    primaryActionLabel = "Choose plan";
    openTarget = "takeoff";
  } else {
    importState = SHARED_INBOX_STATES.NOT_IMPORTED;
    primaryActionKey = "import_and_open";
    primaryActionLabel = "Import and open";
    openTarget = "takeoff";
  }

  const filterBucket = (() => {
    if (importState === SHARED_INBOX_STATES.NOT_IMPORTED || importState === SHARED_INBOX_STATES.IMPORT_FAILED) {
      return "not_imported";
    }
    if (importState === SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW) return "needs_review";
    if (importState === SHARED_INBOX_STATES.TAKEOFF_READY) return "takeoff_ready";
    return "imported";
  })();

  const searchText = [
    senderDisplay,
    subject,
    bodyPreview,
    customerDisplay.label,
    projectDisplay.label,
    estimatorDisplay.label,
    ...attachments.map((a) => a.filename)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const legacyPrimaryAction = {
    key: primaryActionKey,
    label: primaryActionLabel,
    openTarget,
    // Only explicit import-family actions mutate. Navigation actions never do.
    mutates:
      !alreadyImported &&
      (primaryActionKey === "import_and_open" ||
        primaryActionKey === "retry_import" ||
        primaryActionKey === "create_manual_estimate" ||
        primaryActionKey === "review_request")
  };

  const estimateStatus = deriveInboxEstimateStatus({
    estimateId,
    activeEstimateId,
    studioEstimateId: estimateId,
    lifecycleStatus: queueRow?.lifecycleStatus,
    publicationStatus: queueRow?.digitalEstimateStatus,
    hasActivePublication: Boolean(queueRow?.hasActivePublication),
    hasAcceptance: Boolean(queueRow?.hasAcceptance),
    hasSoldSnapshot: Boolean(queueRow?.hasSoldSnapshot),
    acceptedAt: queueRow?.acceptedAt,
    soldAt: queueRow?.soldAt
  });

  const viewed = Boolean(
    input.viewed ?? preview.viewed ?? queueRow?.inboxViewed ?? queueRow?.viewed
  );

  const row = {
    messageKey,
    receivedAt: preview.receivedDateTime || null,
    viewed,
    viewedAt: viewed
      ? preview.viewedAt || queueRow?.inboxViewedAt || queueRow?.viewedAt || null
      : null,
    sender: {
      displayName: senderDisplay,
      safeAddressLabel: preview.sender?.emailPresent
        ? "Email on file"
        : "No email on file",
      emailPresent: Boolean(preview.sender?.emailPresent)
    },
    subject,
    bodyPreview,
    attachments,
    attachmentCount: attachments.length,
    supportedAttachmentCount,
    planSupportSummary,
    planSelectionRequired,
    supportState,
    supportExplanation,
    importState,
    importedAt: queueRow?.receivedAt || null,
    intakeCaseId,
    estimateId,
    activeEstimateId,
    estimateStatus,
    estimateStatusLabel: INBOX_ESTIMATE_STATUS_LABELS[estimateStatus] || "Not Started",
    assignedEstimator: {
      userId: queueRow?.assignedEstimatorUserId || null,
      label: estimatorDisplay.label
    },
    customerLabel: customerDisplay.label,
    projectLabel: projectDisplay.label,
    aiTakeoff,
    operationalState: operationalState
      ? {
          key: operationalState.key,
          label: operationalState.label,
          category: operationalState.category,
          needsAttention: operationalState.needsAttention,
          openTarget: operationalState.openTarget,
          primaryAction: operationalState.primaryAction,
          workflowStatus: operationalState.workflowStatus,
          mutates: false
        }
      : null,
    // Simplified estimator surface (Start / Resume / Choose plan).
    primaryAction: simplifyInboxPrimaryAction(legacyPrimaryAction, {
      estimateId,
      activeEstimateId,
      intakeCaseId,
      planSelectionRequired,
      planSupportSummary,
      hasUsableTakeoff,
      aiTakeoffFailed: takeoffFailed
    }),
    legacyPrimaryAction,
    secondaryActions: [
      {
        key: "view_plans",
        label: "View Plans",
        openTarget: "plans",
        mutates: false
      }
    ],
    filterBucket,
    eligibilityHint: preview.eligibilityHint || null,
    importable: Boolean(preview.importable) && !alreadyImported,
    lastImportError: lastImportError
      ? {
          code: String(lastImportError.code || "import_failed"),
          message: sanitizeInboxText(lastImportError.message || "Import failed", 200)
        }
      : null,
    searchText
  };

  return stripForbiddenDeep(row);
}

/**
 * @param {object[]} rows
 * @param {{ state?: string, search?: string, limit?: number, offset?: number }} query
 */
export function filterAndPageSharedInboxRows(rows, query = {}) {
  const state = String(query.state || query.filter || "all").toLowerCase();
  const search = String(query.search || query.q || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 25));
  const offset = Math.min(100000, Math.max(0, Number(query.offset) || 0));

  let filtered = Array.isArray(rows) ? [...rows] : [];
  filtered.sort(
    (a, b) => Date.parse(b.receivedAt || 0) - Date.parse(a.receivedAt || 0)
  );

  if (state && state !== "all") {
    filtered = filtered.filter((r) => {
      if (state === "not_imported") {
        return r.filterBucket === "not_imported" || r.importState === SHARED_INBOX_STATES.IMPORT_FAILED;
      }
      if (state === "imported") return r.filterBucket === "imported" || r.filterBucket === "takeoff_ready";
      if (state === "needs_review") return r.filterBucket === "needs_review";
      if (state === "takeoff_ready") return r.filterBucket === "takeoff_ready";
      return true;
    });
  }

  if (search) {
    filtered = filtered.filter((r) => String(r.searchText || "").includes(search));
  }

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map((r) => {
    const { searchText: _s, ...rest } = r;
    return rest;
  });

  return { items: page, total, limit, offset };
}
