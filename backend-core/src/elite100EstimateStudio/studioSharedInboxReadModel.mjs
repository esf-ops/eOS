/**
 * Shared Inbox Phase 1 — safe row adapter over mailbox preview + queue enrichment.
 * Pure projection. No Graph I/O. No mutations. No delivery side effects.
 *
 * Operational truth for imported rows reuses buildStudioOperationalState via queue rows.
 */

import { buildStudioOperationalState } from "./studioOperationalStatus.mjs";
import {
  resolveCustomerDisplayLabel,
  resolveEstimatorDisplayLabel,
  resolveProjectDisplayLabel
} from "./studioIdentityDisplay.mjs";

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
  const supportedForTakeoff = support === "direct_pdf";
  const supportedForImport = supportedForTakeoff || support === "too_large";
  return {
    attachmentKey: att.sourceAttachmentId || att.attachmentKey || null,
    filename: sanitizeInboxText(att.name || att.filename || "attachment", 120) || "attachment",
    contentType: att.mimeType || att.contentType || null,
    sizeBytes: Number.isFinite(Number(att.sizeBytes)) ? Number(att.sizeBytes) : null,
    supportedForTakeoff,
    supportedForImport,
    previewSupported: supportedForTakeoff || support === "direct_pdf"
      ? true
      : (() => {
          const mime = String(att.mimeType || att.contentType || "").toLowerCase();
          const name = String(att.name || att.filename || "").toLowerCase();
          if (mime === "image/png" || /\.png$/i.test(name)) return true;
          if (mime === "image/jpeg" || mime === "image/jpg" || /\.jpe?g$/i.test(name)) return true;
          if (mime === "image/webp" || /\.webp$/i.test(name)) return true;
          return false;
        })(),
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
      supportExplanation: "Multiple PDF attachments require estimator review."
    };
  }
  if (hint === "manual_review" || (hint === "importable_no_pdf" && supportedCount === 0)) {
    return {
      supportState: SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT,
      supportExplanation:
        supportedCount === 0
          ? "No currently supported plan PDF is attached. You can still import for manual estimate work."
          : "This message needs manual review before AI Takeoff."
    };
  }
  if (supportedCount === 0 && previewMessage.hasAttachments) {
    return {
      supportState: SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT,
      supportExplanation: "Attachments are present but none are a supported plan PDF."
    };
  }
  if (!previewMessage.hasAttachments && supportedCount === 0) {
    return {
      supportState: SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT,
      supportExplanation: "No plan attachment is present. Manual estimate import remains available."
    };
  }
  return {
    supportState: "supported",
    supportExplanation: "Supported plan attachment available for import."
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
  const { supportState, supportExplanation } = deriveSupportState(preview);

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
    if (opKey === "takeoff_processing") {
      importState = SHARED_INBOX_STATES.TAKEOFF_PROCESSING;
      primaryActionKey = "view_progress";
      primaryActionLabel = "View progress";
      openTarget = "takeoff";
    } else if (opKey === "needs_takeoff_review" || aiTakeoff.reviewReady) {
      importState = SHARED_INBOX_STATES.TAKEOFF_READY;
      primaryActionKey = "review_ai_takeoff";
      primaryActionLabel = "Review AI Takeoff";
      openTarget = "takeoff";
    } else if (
      opKey === "needs_plan_review" ||
      String(queueRow?.caseStatus || "").toLowerCase() === "manual_review"
    ) {
      importState = SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW;
      primaryActionKey = "review_request";
      primaryActionLabel = "Review request";
      openTarget = operationalState?.openTarget || "takeoff";
    } else if (estimateId) {
      importState = SHARED_INBOX_STATES.IMPORTED;
      primaryActionKey = "open_estimate";
      primaryActionLabel = operationalState?.primaryAction || "Open estimate";
      openTarget = operationalState?.openTarget || "takeoff";
    } else {
      importState = SHARED_INBOX_STATES.IMPORTED;
      primaryActionKey = "open_estimate";
      primaryActionLabel = "Open estimate";
      openTarget = "takeoff";
    }
  } else if (supportState === SHARED_INBOX_STATES.UNSUPPORTED_ATTACHMENT) {
    importState = SHARED_INBOX_STATES.NOT_IMPORTED;
    primaryActionKey = "create_manual_estimate";
    primaryActionLabel = "Create manual estimate";
    openTarget = "scope";
  } else if (supportState === SHARED_INBOX_STATES.NEEDS_MANUAL_REVIEW) {
    importState = SHARED_INBOX_STATES.NOT_IMPORTED;
    primaryActionKey = "review_request";
    primaryActionLabel = "Review request";
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

  const row = {
    messageKey,
    receivedAt: preview.receivedDateTime || null,
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
    supportState,
    supportExplanation,
    importState,
    importedAt: queueRow?.receivedAt || null,
    intakeCaseId,
    estimateId,
    activeEstimateId,
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
    primaryAction: {
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
    },
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
