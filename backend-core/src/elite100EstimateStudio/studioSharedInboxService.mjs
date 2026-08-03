/**
 * Shared Inbox Phase 1 service — wraps existing mailbox preview/import.
 * Read-oriented list/detail; import remains explicit and idempotent.
 */

import {
  importQuoteIntakeMailboxMessages,
  previewQuoteIntakeMailbox
} from "../quoteIntake/quoteIntakeMailboxService.mjs";
import { isQuoteIntakeGraphEnabled, isQuoteIntakeGraphManualSyncEnabled } from "../quoteIntake/quoteIntakeGraphConfig.mjs";
import {
  buildSharedInboxRow,
  filterAndPageSharedInboxRows,
  sanitizeInboxText
} from "./studioSharedInboxReadModel.mjs";
import { openEstimateForIntakeCase } from "../takeoff/intakeOpenEstimateService.mjs";
import {
  findScopedAttachment,
  isAutoSupportedTakeoffSupport,
  isSafeManualPlanImageOverride,
  requestHasManualPlanOverride
} from "../quoteIntake/quoteIntakePlanAttachmentSupport.mjs";
import { ATTACHMENT_SUPPORT } from "../quoteIntake/quoteIntakeAttachmentMeta.mjs";

/**
 * @param {string} code
 */
export function sharedInboxSafeError(code, fallbackMessage) {
  const messages = {
    mailbox_not_configured: "Mailbox preview is not configured for this organization.",
    mailbox_unavailable: "Shared Inbox could not be refreshed.",
    message_not_found: "The message is no longer available.",
    message_already_imported: "This request has already been imported.",
    message_not_supported: "This message does not contain a currently supported plan attachment.",
    attachment_not_supported:
      "That attachment is not a supported plan PDF or image for AI Takeoff.",
    attachment_required: "Select a plan attachment to send to AI Takeoff.",
    takeoff_unavailable: "AI Takeoff is temporarily unavailable.",
    import_failed: "The request could not be imported.",
    import_result_unavailable:
      "The import may have completed, but its result could not be confirmed. Refresh the inbox before retrying.",
    graph_disabled: "Mailbox preview is not configured for this organization.",
    graph_not_configured: "Mailbox preview is not configured for this organization.",
    graph_forbidden: "Mailbox access denied.",
    graph_throttled: "Mailbox provider is busy — try again later.",
    graph_timeout: "Mailbox request timed out.",
    graph_unavailable: "Shared Inbox could not be refreshed.",
    import_confirm_required: "Explicit import confirmation is required.",
    organization_required: "Organization context unavailable."
  };
  const c = String(code || "mailbox_unavailable");
  return {
    ok: false,
    error: messages[c] || fallbackMessage || messages.mailbox_unavailable,
    code: c === "graph_disabled" || c === "graph_not_configured" ? "mailbox_not_configured" : c
  };
}

/**
 * @param {object} deps
 */
export function createStudioSharedInboxService(deps = {}) {
  const env = deps.env ?? process.env;
  const repository = deps.quoteIntakeRepository || deps.repository;
  const queueService = deps.studioEstimateQueueService || null;
  const graphClient = deps.graphClient || null;
  const fetchImpl = deps.fetchImpl || deps.graphFetchImpl || undefined;
  const bootstrapIntakeCases = deps.bootstrapIntakeCases || null;
  const ensureStudioEstimate = deps.ensureStudioEstimate || null;
  const getSupabase = deps.getSupabase || null;
  const previewFn = deps.previewFn || previewQuoteIntakeMailbox;
  const importFn = deps.importFn || importQuoteIntakeMailboxMessages;
  const openEstimateFn = deps.openEstimate || openEstimateForIntakeCase;

  if (!repository) {
    throw new Error("createStudioSharedInboxService: quoteIntakeRepository required");
  }

  function assertOrg(organizationId) {
    const org = String(organizationId || "").trim();
    if (!org) {
      const err = new Error("Organization required");
      err.statusCode = 403;
      err.code = "organization_required";
      throw err;
    }
    return org;
  }

  function mailboxConfigured() {
    return isQuoteIntakeGraphEnabled(env) && isQuoteIntakeGraphManualSyncEnabled(env);
  }

  /**
   * Batch enrich imported cases via one queue list (bounded).
   * @param {string} organizationId
   * @param {string[]} caseIds
   */
  async function loadQueueRowsByCaseId(organizationId, caseIds) {
    /** @type {Map<string, object>} */
    const map = new Map();
    const ids = [...new Set(caseIds.filter(Boolean).map(String))];
    if (!ids.length || !queueService || typeof queueService.listQueue !== "function") {
      return map;
    }
    try {
      const result = await queueService.listQueue({
        organizationId,
        query: { limit: 100, offset: 0, filter: "all" }
      });
      const cases = Array.isArray(result?.cases) ? result.cases : [];
      const wanted = new Set(ids);
      for (const row of cases) {
        if (row?.id && wanted.has(String(row.id))) {
          map.set(String(row.id), row);
        }
      }
    } catch {
      // Enrichment is best-effort; preview still returns import linkage.
    }
    return map;
  }

  /**
   * @param {object[]} previewMessages
   * @param {Map<string, object>} queueByCase
   * @param {Map<string, object>} [importErrorsByKey]
   */
  function rowsFromPreview(previewMessages, queueByCase, importErrorsByKey = new Map()) {
    return (Array.isArray(previewMessages) ? previewMessages : []).map((msg) => {
      const caseId = msg.existingCaseId ? String(msg.existingCaseId) : null;
      const queueRow = caseId ? queueByCase.get(caseId) || null : null;
      const key = String(msg.graphMessageId || "");
      return buildSharedInboxRow({
        previewMessage: msg,
        queueRow,
        lastImportError: importErrorsByKey.get(key) || null
      });
    });
  }

  async function listInbox({ organizationId, query = {}, actorUserId = null }) {
    const org = assertOrg(organizationId);
    if (!mailboxConfigured()) {
      const err = new Error("Mailbox preview is not configured for this organization.");
      err.statusCode = 404;
      err.code = "mailbox_not_configured";
      throw err;
    }

    let preview;
    try {
      preview = await previewFn({
        env,
        organizationId: org,
        actorUserId,
        repository,
        graphClient,
        fetchImpl,
        body: {}
      });
    } catch (e) {
      const code = String(e?.code || "mailbox_unavailable");
      const err = new Error(sharedInboxSafeError(code).error);
      err.statusCode = Number(e?.statusCode) || (code === "graph_disabled" ? 404 : 503);
      err.code =
        code === "graph_disabled" || code === "graph_not_configured"
          ? "mailbox_not_configured"
          : code === "graph_timeout"
            ? "mailbox_unavailable"
            : code.startsWith("graph_")
              ? "mailbox_unavailable"
              : code;
      throw err;
    }

    const messages = Array.isArray(preview.messages) ? preview.messages : [];
    const caseIds = messages.map((m) => m.existingCaseId).filter(Boolean);
    const queueByCase = await loadQueueRowsByCaseId(org, caseIds);
    const rows = rowsFromPreview(messages, queueByCase);
    const paged = filterAndPageSharedInboxRows(rows, query);

    return {
      ok: true,
      mailboxDisplay: preview.mailboxDisplay || null,
      readOnly: true,
      previewLimit: preview.previewLimit ?? paged.limit,
      messageCount: preview.messageCount ?? messages.length,
      total: paged.total,
      limit: paged.limit,
      offset: paged.offset,
      items: paged.items,
      automaticTakeoffEnabled:
        String(env.QUOTE_INTAKE_AUTOMATIC_TAKEOFF ?? "1").trim().toLowerCase() !== "0" &&
        String(env.QUOTE_INTAKE_AUTOMATIC_TAKEOFF ?? "1").trim().toLowerCase() !== "false" &&
        String(env.QUOTE_INTAKE_AUTOMATIC_TAKEOFF ?? "1").trim().toLowerCase() !== "off"
    };
  }

  async function getMessage({ organizationId, messageKey, actorUserId = null }) {
    const org = assertOrg(organizationId);
    const key = String(messageKey || "").trim();
    if (!key) {
      const err = new Error("The message is no longer available.");
      err.statusCode = 404;
      err.code = "message_not_found";
      throw err;
    }
    const listed = await listInbox({
      organizationId: org,
      actorUserId,
      query: { state: "all", limit: 50, offset: 0 }
    });
    const hit = listed.items.find((r) => r.messageKey === key);
    if (!hit) {
      const err = new Error("The message is no longer available.");
      err.statusCode = 404;
      err.code = "message_not_found";
      throw err;
    }
    return { ok: true, item: hit, mailboxDisplay: listed.mailboxDisplay, readOnly: true };
  }

  /**
   * Explicit single-message import. Idempotent via existing mailbox dedupe.
   */
  async function importMessage({
    organizationId,
    messageKey,
    actorUserId = null,
    confirm = false,
    idempotencyKey = null
  }) {
    const org = assertOrg(organizationId);
    const key = String(messageKey || "").trim();
    if (!key || key.length > 2048) {
      const err = new Error("The message is no longer available.");
      err.statusCode = 404;
      err.code = "message_not_found";
      throw err;
    }
    if (confirm !== true && confirm !== "true") {
      const err = new Error("Explicit import confirmation is required.");
      err.statusCode = 400;
      err.code = "import_confirm_required";
      throw err;
    }
    if (!mailboxConfigured()) {
      const err = new Error("Mailbox preview is not configured for this organization.");
      err.statusCode = 404;
      err.code = "mailbox_not_configured";
      throw err;
    }

    // Recheck before import — open existing instead of creating a duplicate.
    let prelisted;
    try {
      prelisted = await listInbox({
        organizationId: org,
        actorUserId,
        query: { state: "all", limit: 50, offset: 0 }
      });
    } catch (e) {
      // If preview fails, still attempt import (refetch inside import service).
      prelisted = null;
      if (e?.code === "mailbox_not_configured") throw e;
    }
    const existingRow = prelisted?.items?.find((r) => r.messageKey === key);
    if (existingRow?.intakeCaseId && existingRow.importState !== "not_imported" && existingRow.importState !== "import_failed") {
      return {
        ok: true,
        alreadyImported: true,
        intakeCaseId: existingRow.intakeCaseId,
        estimateId: existingRow.estimateId || existingRow.activeEstimateId || null,
        activeEstimateId: existingRow.activeEstimateId || existingRow.estimateId || null,
        importState: existingRow.importState,
        operationalState: existingRow.operationalState,
        primaryAction: existingRow.primaryAction,
        item: existingRow,
        idempotencyKey: idempotencyKey ? sanitizeInboxText(idempotencyKey, 128) : null
      };
    }

    let imported;
    try {
      imported = await importFn({
        env,
        organizationId: org,
        actorUserId,
        repository,
        graphClient,
        fetchImpl,
        getSupabase,
        ensureStudioEstimate,
        bootstrapIntakeCases,
        body: {
          confirm: true,
          messageIds: [key],
          // Rejected by rejectCallerMailboxHints if ever treated as mailbox hint —
          // kept out of body keys that are forbidden. Trace only via response.
          _sharedInboxIdempotencyKey: undefined
        }
      });
    } catch (e) {
      const code = String(e?.code || "import_failed");
      const err = new Error(sharedInboxSafeError(code, "The request could not be imported.").error);
      err.statusCode = Number(e?.statusCode) || 500;
      err.code =
        code === "graph_disabled" || code === "graph_not_configured"
          ? "mailbox_not_configured"
          : code === "message_not_found"
            ? "message_not_found"
            : "import_failed";
      throw err;
    }

    const results = Array.isArray(imported?.results) ? imported.results : [];
    const result = results.find((r) => String(r.graphMessageId) === key) || results[0];
    if (!result) {
      const err = new Error(sharedInboxSafeError("import_result_unavailable").error);
      err.statusCode = 503;
      err.code = "import_result_unavailable";
      throw err;
    }

    if (result.status === "failed") {
      const code = String(result.code || "import_failed");
      const err = new Error(sharedInboxSafeError(code, "The request could not be imported.").error);
      err.statusCode = code === "message_not_found" ? 404 : 400;
      err.code = code === "message_not_found" ? "message_not_found" : "import_failed";
      throw err;
    }

    // Refresh row after import (created | duplicate | manual_review).
    let item = null;
    try {
      const after = await listInbox({
        organizationId: org,
        actorUserId,
        query: { state: "all", limit: 50, offset: 0 }
      });
      item = after.items.find((r) => r.messageKey === key) || null;
    } catch {
      item = null;
    }

    const intakeCaseId = result.caseId || item?.intakeCaseId || null;
    const alreadyImported = result.status === "duplicate";

    if (!item && intakeCaseId) {
      item = buildSharedInboxRow({
        previewMessage: {
          graphMessageId: key,
          alreadyImported: true,
          existingCaseId: intakeCaseId,
          eligibilityHint: "already_imported",
          subject: existingRow?.subject,
          bodyPreview: existingRow?.bodyPreview,
          sender: existingRow?.sender
            ? { displayName: existingRow.sender.displayName, emailPresent: existingRow.sender.emailPresent }
            : {},
          attachments: existingRow?.attachments || [],
          receivedDateTime: existingRow?.receivedAt || null
        },
        queueRow: null
      });
    }

    return {
      ok: true,
      alreadyImported,
      created: result.status === "created",
      manualReview: result.status === "manual_review",
      intakeCaseId,
      estimateId: item?.estimateId || null,
      activeEstimateId: item?.activeEstimateId || item?.estimateId || null,
      importState: item?.importState || (alreadyImported ? "already_imported" : "imported"),
      operationalState: item?.operationalState || null,
      primaryAction: item?.primaryAction || {
        key: "open_estimate",
        label: "Open estimate",
        openTarget: "takeoff",
        mutates: false
      },
      item,
      reasonCodes: Array.isArray(result.reasonCodes) ? result.reasonCodes : [],
      takeoffInvocation: imported?.takeoffInvocation
        ? {
            attempted: Boolean(imported.takeoffInvocation.attempted),
            enabled: Boolean(imported.takeoffInvocation.enabled)
          }
        : { attempted: false, enabled: false },
      idempotencyKey: idempotencyKey ? sanitizeInboxText(idempotencyKey, 128) : null
    };
  }

  /**
   * Send a supported plan attachment to AI Takeoff.
   * Imports the inbox message if needed, then creates/reuses a takeoff job.
   * Does NOT calculate, approve, publish, create Digital Estimate, or mark sold.
   */
  async function sendToAiTakeoff({
    organizationId,
    messageKey,
    actorUserId = null,
    attachmentKey = null,
    markAsPlan = false,
    manualPlanOverride = false,
    useAttachmentAsPlan = false,
    confirm = false,
    idempotencyKey = null
  }) {
    const org = assertOrg(organizationId);
    const key = String(messageKey || "").trim();
    const attKey = String(attachmentKey || "").trim();
    if (!key) {
      const err = new Error("The message is no longer available.");
      err.statusCode = 404;
      err.code = "message_not_found";
      throw err;
    }
    if (!attKey) {
      const err = new Error("Select a plan attachment to send to AI Takeoff.");
      err.statusCode = 400;
      err.code = "attachment_required";
      throw err;
    }
    if (confirm !== true && confirm !== "true") {
      const err = new Error("Explicit import confirmation is required.");
      err.statusCode = 400;
      err.code = "import_confirm_required";
      throw err;
    }

    const detail = await getMessage({ organizationId: org, messageKey: key, actorUserId });
    const item = detail.item;
    const att = findScopedAttachment(item.attachments || [], {
      attachmentKey: attKey,
      allowFilenameFallback: false
    });
    if (!att) {
      const err = new Error("The attachment could not be found.");
      err.statusCode = 404;
      err.code = "message_not_found";
      throw err;
    }

    const overrideRequested = requestHasManualPlanOverride({
      markAsPlan,
      manualPlanOverride,
      useAttachmentAsPlan
    });
    const autoOk = isAutoSupportedTakeoffSupport(att.support);
    const safeImageMeta = {
      ...att,
      name: att.filename || att.name || att.safeFilename,
      filename: att.filename || att.name || att.safeFilename,
      mimeType: att.contentType || att.mimeType,
      contentType: att.contentType || att.mimeType,
      support: att.support,
      isInline: att.isInline === true || att.inline === true
    };
    // Staff override: only safe JPEG/PNG/WEBP images (never inline / non-images).
    const manualOk =
      overrideRequested &&
      isSafeManualPlanImageOverride(safeImageMeta) &&
      (att.support === ATTACHMENT_SUPPORT.IMAGE_NEEDS_REVIEW ||
        att.canMarkAsPlan === true ||
        !autoOk);
    if (!autoOk && overrideRequested && !manualOk) {
      const err = new Error(
        "That attachment cannot be marked as a plan for AI Takeoff."
      );
      err.statusCode = 400;
      err.code = "attachment_not_supported";
      throw err;
    }
    if (!autoOk && !manualOk) {
      const err = new Error(
        "That attachment is not a supported plan PDF or image for AI Takeoff."
      );
      err.statusCode = 400;
      err.code = "attachment_not_supported";
      throw err;
    }

    let intakeCaseId = item.intakeCaseId || null;
    if (!intakeCaseId) {
      const imported = await importMessage({
        organizationId: org,
        messageKey: key,
        actorUserId,
        confirm: true,
        idempotencyKey: idempotencyKey
          ? `send-takeoff-import:${idempotencyKey}`
          : `send-takeoff-import:${org}:${key}`
      });
      intakeCaseId = imported.intakeCaseId || null;
    }
    if (!intakeCaseId) {
      const err = new Error("The request could not be imported.");
      err.statusCode = 500;
      err.code = "import_failed";
      throw err;
    }

    let openResult;
    try {
      openResult = await openEstimateFn({
        repository,
        organizationId: org,
        intakeCaseId,
        actorUserId,
        getSupabase,
        graphClient,
        env,
        body: {
          attachmentKey: attKey,
          // Scoped filename helps open-estimate when persisted case rows lack Graph ids.
          attachmentFilename: att.filename || att.name || att.safeFilename || null,
          markAsPlan: manualOk === true,
          manualPlanOverride: manualOk === true
        },
        initiationMode: "manual"
      });
    } catch (e) {
      const code = String(e?.code || "takeoff_unavailable");
      const mapped =
        code === "no_supported_pdf" ||
        code === "attachment_selection_invalid" ||
        code === "attachment_bytes_unavailable" ||
        code === "attachment_unsupported" ||
        code === "attachment_type_mismatch" ||
        code === "attachment_not_supported"
          ? "attachment_not_supported"
          : "takeoff_unavailable";
      const err = new Error(
        sharedInboxSafeError(mapped, e?.message || "AI Takeoff is temporarily unavailable.").error
      );
      err.statusCode =
        mapped === "attachment_not_supported" ? 400 : Number(e?.statusCode) || 500;
      err.code = mapped;
      throw err;
    }

    let refreshed = null;
    try {
      const after = await getMessage({ organizationId: org, messageKey: key, actorUserId });
      refreshed = after.item;
    } catch {
      refreshed = item;
    }

    const takeoffJobId = openResult?.takeoffJobId
      ? String(openResult.takeoffJobId)
      : refreshed?.aiTakeoff?.takeoffJobId || null;

    return {
      ok: true,
      intakeCaseId,
      takeoffJobId,
      created: openResult?.created === true,
      reused: openResult?.reused === true || openResult?.created === false,
      attachmentKey: attKey,
      attachmentName: att.filename || openResult?.attachmentName || null,
      // Explicitly no estimate ensure / calculate / publish side effects here.
      sideEffects: {
        calculated: false,
        approved: false,
        published: false,
        digitalEstimateCreated: false,
        sold: false,
        studioEstimateEnsured: false
      },
      item: refreshed
        ? {
            ...refreshed,
            aiTakeoff: {
              ...(refreshed.aiTakeoff || {}),
              takeoffJobId: takeoffJobId || refreshed.aiTakeoff?.takeoffJobId || null,
              state: takeoffJobId
                ? refreshed.aiTakeoff?.state && refreshed.aiTakeoff.state !== "not_started"
                  ? refreshed.aiTakeoff.state
                  : "not_started"
                : refreshed.aiTakeoff?.state || "not_started",
              label: takeoffJobId
                ? refreshed.aiTakeoff?.label && refreshed.aiTakeoff.label !== "Not started"
                  ? refreshed.aiTakeoff.label
                  : "Not started"
                : refreshed.aiTakeoff?.label || "Not started"
            }
          }
        : null,
      idempotencyKey: idempotencyKey ? sanitizeInboxText(idempotencyKey, 128) : null
    };
  }

  return {
    listInbox,
    getMessage,
    importMessage,
    sendToAiTakeoff,
    mailboxConfigured
  };
}
