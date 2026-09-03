/**
 * Elite 100 Quote Flow — Inbox + start-takeoff orchestration (Slice 1B).
 * Reuses Shared Inbox + open-estimate; does not calculate/approve/publish/sold.
 * Dismiss/restore is Quote Flow–only — never deletes Outlook mail.
 */

import { sharedInboxSafeError } from "../elite100EstimateStudio/studioSharedInboxService.mjs";
import { createQuoteFlowError, quoteFlowSafeError } from "./quoteFlowErrors.mjs";
import {
  groupQuoteFlowInboxItems,
  presentQuoteFlowInboxItem,
  sortQuoteFlowInboxItems
} from "./quoteFlowInboxPresenter.mjs";
import {
  createMemoryQuoteFlowInboxStateStore,
  createQuoteFlowInboxStateStore
} from "./quoteFlowInboxStateStore.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";
import {
  buildTakeoffPacketPdf,
  normalizeStartTakeoffAttachmentKeys,
  sanitizeTakeoffPacketFilename
} from "./quoteFlowTakeoffPacket.mjs";
import {
  buildQuoteFlowTakeoffSourceMeta,
  persistQuoteFlowTakeoffSourceMeta,
  pickQuoteRequestSubjectFromInboxItem
} from "./quoteFlowQueueSourceMeta.mjs";
import {
  boundSourceEmailBody,
  buildResolvedRequestedSelections
} from "./quoteFlowRequestedSelections.mjs";
import {
  contentDispositionInline,
  planViewerError
} from "../elite100EstimateStudio/studioSecurePlanViewer.mjs";
import {
  isAutoSupportedTakeoffSupport,
  isSafeManualPlanImageOverride,
  requestHasManualPlanOverride,
  findScopedAttachment
} from "../quoteIntake/quoteIntakePlanAttachmentSupport.mjs";
import { openEstimateForIntakeCase } from "../takeoff/intakeOpenEstimateService.mjs";

export { isOfficialScopeSet } from "./quoteFlowScope.mjs";

/**
 * @param {{
 *   sharedInboxService: { listInbox: Function, getMessage: Function, sendToAiTakeoff: Function },
 *   estimateRepository?: { getActiveByIntakeCase?: Function }|null,
 *   inboxStateStore?: ReturnType<typeof createQuoteFlowInboxStateStore>|null,
 *   planViewerService?: { getSharedInboxAttachmentContent?: Function }|null,
 *   openEstimate?: Function|null,
 *   getSupabase?: Function|null,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createQuoteFlowService(deps) {
  const sharedInbox = deps.sharedInboxService;
  if (!sharedInbox) {
    throw new Error("createQuoteFlowService: sharedInboxService required");
  }
  const estimateRepository = deps.estimateRepository || null;
  const planViewerService = deps.planViewerService || null;
  const openEstimateFn = deps.openEstimate || openEstimateForIntakeCase;
  const quoteIntakeRepository = deps.quoteIntakeRepository || null;
  const env = deps.env || process.env;
  const getSupabase = deps.getSupabase || null;
  const inboxStateStore =
    deps.inboxStateStore ||
    (typeof deps.getSupabase === "function"
      ? createQuoteFlowInboxStateStore({ getSupabase: deps.getSupabase })
      : createMemoryQuoteFlowInboxStateStore());

  async function alreadyScopedForCase(organizationId, intakeCaseId) {
    const caseId = String(intakeCaseId || "").trim();
    if (!caseId || !estimateRepository?.getActiveByIntakeCase) return false;
    try {
      const est = await estimateRepository.getActiveByIntakeCase(organizationId, caseId);
      return isOfficialScopeSet(est);
    } catch {
      return false;
    }
  }

  async function enrichItem(organizationId, item, triageState = null) {
    const scoped = await alreadyScopedForCase(organizationId, item?.intakeCaseId);
    const key = String(item?.messageKey || "").trim();
    const state =
      triageState ||
      (await inboxStateStore.readState(organizationId).catch(() => ({
        dismissedMessageKeys: {},
        openedMessageKeys: {}
      })));
    const dismissed = Boolean(key && state.dismissedMessageKeys?.[key]);
    const opened = Boolean(key && state.openedMessageKeys?.[key]);
    return presentQuoteFlowInboxItem(item, {
      alreadyScoped: scoped,
      dismissed,
      opened
    });
  }

  /**
   * Best-effort: stamp staff queue identity onto takeoff job metadata.
   */
  async function stampTakeoffSourceMeta({
    organizationId,
    takeoffJobId,
    messageKey,
    inboxItem = null,
    attachmentKeys = [],
    attachments = [],
    packetFilename = null,
    packetMerged = false,
    selectedPlanFilename = null
  }) {
    if (!takeoffJobId || !getSupabase) return;
    const keys = Array.isArray(attachmentKeys) ? attachmentKeys.filter(Boolean) : [];
    const atts = Array.isArray(attachments) ? attachments : [];
    const byKey = new Map(
      atts
        .filter((a) => a?.attachmentKey)
        .map((a) => [String(a.attachmentKey), a])
    );
    const packetFiles = keys.length
      ? keys.map((k) => {
          const hit = byKey.get(String(k));
          return {
            filename: hit?.filename || hit?.name || null,
            attachmentKey: k
          };
        })
      : selectedPlanFilename
        ? [{ filename: selectedPlanFilename, attachmentKey: keys[0] || null }]
        : [];

    const bodyPreview = boundSourceEmailBody(
      inboxItem?.bodyPreview || inboxItem?.bodyText || inboxItem?.body || null,
      4000
    );
    let requestedSelections = null;
    try {
      requestedSelections = await buildResolvedRequestedSelections({
        bodyText: bodyPreview,
        subject: inboxItem?.subject || inboxItem?.requestSubject || null,
        messageKey: messageKey || inboxItem?.messageKey || null,
        getSupabase
      });
    } catch {
      requestedSelections = null;
    }

    const quoteFlow = buildQuoteFlowTakeoffSourceMeta({
      requestSubject: pickQuoteRequestSubjectFromInboxItem(inboxItem, {
        selectedPlanFilename,
        packetFiles
      }),
      senderLabel: inboxItem?.senderLabel || inboxItem?.sender || null,
      customerLabel:
        inboxItem?.customerDisplay || inboxItem?.customerLabel || inboxItem?.senderLabel || null,
      selectedPlanFilename:
        selectedPlanFilename ||
        (!packetMerged && packetFiles[0]?.filename) ||
        null,
      packetFilename,
      packetMerged,
      packetFiles,
      messageKey: messageKey || inboxItem?.messageKey || null,
      sourceMailboxLabel: inboxItem?.mailboxLabel || inboxItem?.sourceMailboxLabel || null,
      sourceEmailBodyPreview: bodyPreview,
      sourceEmailBodyCharCount: bodyPreview ? bodyPreview.length : null,
      requestedSelections
    });
    await persistQuoteFlowTakeoffSourceMeta({
      getSupabase,
      organizationId,
      takeoffJobId,
      quoteFlow
    });
  }

  async function listInbox({ organizationId, query = {}, actorUserId = null }) {
    const result = await sharedInbox.listInbox({ organizationId, query, actorUserId });
    const items = Array.isArray(result?.items) ? result.items : [];
    const triageState = await inboxStateStore.readState(organizationId).catch(() => ({
      dismissedMessageKeys: {},
      openedMessageKeys: {}
    }));
    const presented = [];
    for (const item of items) {
      presented.push(await enrichItem(organizationId, item, triageState));
    }
    const sorted = sortQuoteFlowInboxItems(presented);
    const grouped = groupQuoteFlowInboxItems(sorted);
    return {
      ok: true,
      mailboxDisplay: result.mailboxDisplay || null,
      readOnly: true,
      total: result.total ?? sorted.length,
      limit: result.limit ?? sorted.length,
      offset: result.offset ?? 0,
      items: sorted,
      groups: {
        needs_action: grouped.needs_action,
        active: grouped.active,
        ready_for_review: grouped.ready_for_review,
        completed: grouped.completed,
        dismissed: grouped.dismissed
      },
      stats: grouped.stats,
      triage: {
        openedIsMailboxUnread: false,
        openedIsQuoteFlowLocal: true,
        dismissDeletesEmail: false
      },
      sideEffects: {
        calculated: false,
        approved: false,
        published: false,
        sold: false,
        accepted: false
      }
    };
  }

  async function getMessage({ organizationId, messageKey, actorUserId = null }) {
    const result = await sharedInbox.getMessage({ organizationId, messageKey, actorUserId });
    const item = await enrichItem(organizationId, result.item);
    return {
      ok: true,
      item,
      mailboxDisplay: result.mailboxDisplay || null,
      readOnly: true
    };
  }

  async function markOpened({ organizationId, messageKey, actorUserId = null }) {
    const key = String(messageKey || "").trim();
    if (!key) throw createQuoteFlowError("message_not_found");
    await inboxStateStore.markOpened({ organizationId, messageKey: key, actorUserId });
    // Soft-refresh detail with opened flag when mailbox row still available.
    try {
      const detail = await getMessage({ organizationId, messageKey: key, actorUserId });
      return {
        ok: true,
        opened: true,
        mailboxMutated: false,
        item: detail.item
      };
    } catch {
      return { ok: true, opened: true, mailboxMutated: false, messageKey: key };
    }
  }

  async function dismissMessage({ organizationId, messageKey, actorUserId = null }) {
    const key = String(messageKey || "").trim();
    if (!key) throw createQuoteFlowError("message_not_found");

    let isActive = false;
    try {
      const detail = await sharedInbox.getMessage({ organizationId, messageKey: key, actorUserId });
      const presented = await enrichItem(organizationId, detail.item);
      isActive = presented.isActiveTakeoff === true;
    } catch {
      // Still allow dismiss by key if detail unavailable.
    }

    const result = await inboxStateStore.dismiss({
      organizationId,
      messageKey: key,
      actorUserId
    });

    return {
      ok: true,
      dismissed: true,
      messageKey: key,
      emailDeleted: false,
      mailboxMutated: false,
      takeoffCancelled: false,
      activeTakeoffHidden: isActive,
      message: isActive
        ? "Removed from Quote Flow. Any active AI Takeoff continues in the background."
        : "Removed from Quote Flow. The original email was not deleted.",
      ...result
    };
  }

  async function restoreMessage({ organizationId, messageKey, actorUserId = null }) {
    const key = String(messageKey || "").trim();
    if (!key) throw createQuoteFlowError("message_not_found");
    await inboxStateStore.restore({ organizationId, messageKey: key });
    let item = null;
    try {
      const detail = await getMessage({ organizationId, messageKey: key, actorUserId });
      item = detail.item;
    } catch {
      item = null;
    }
    return {
      ok: true,
      restored: true,
      messageKey: key,
      emailDeleted: false,
      mailboxMutated: false,
      item,
      message: "Restored to Quote Flow Inbox."
    };
  }

  async function getAttachmentContent({
    organizationId,
    messageKey,
    attachmentKey,
    disposition = "inline"
  }) {
    if (!planViewerService?.getSharedInboxAttachmentContent) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Attachment preview is temporarily unavailable.",
        statusCode: 503
      });
    }
    try {
      const result = await planViewerService.getSharedInboxAttachmentContent({
        organizationId,
        messageKey,
        attachmentKey
      });
      const headers = { ...(result.headers || {}) };
      if (disposition === "attachment") {
        const filename = String(result.filename || "attachment").replace(/"/g, "");
        headers["Content-Disposition"] = `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "_") || "attachment"}"`;
      } else if (!headers["Content-Disposition"]) {
        headers["Content-Disposition"] = contentDispositionInline(result.filename || "plan");
      }
      return { ...result, headers };
    } catch (e) {
      if (e?.code && e?.statusCode) throw e;
      throw planViewerError(
        e?.message || "Unable to load attachment.",
        Number(e?.statusCode) || 500,
        e?.code || "attachment_content_unavailable"
      );
    }
  }

  async function startTakeoff({
    organizationId,
    messageKey,
    actorUserId = null,
    attachmentKey = null,
    attachmentKeys = null,
    markAsPlan = false,
    manualPlanOverride = false,
    confirm = false,
    idempotencyKey = null,
    startFresh = true
  }) {
    if (confirm !== true && confirm !== "true") {
      throw createQuoteFlowError("import_confirm_required");
    }
    const keys = normalizeStartTakeoffAttachmentKeys({ attachmentKey, attachmentKeys });
    if (!keys.length) {
      throw createQuoteFlowError("attachment_required");
    }

    // Pre-check scope using current message linkage (no takeoff restart after Set Scope).
    const detail = await sharedInbox.getMessage({
      organizationId,
      messageKey,
      actorUserId
    });
    const intakeCaseId = detail?.item?.intakeCaseId || null;
    if (intakeCaseId && (await alreadyScopedForCase(organizationId, intakeCaseId))) {
      throw createQuoteFlowError("already_scoped", {
        statusCode: 409,
        message: "Scope is already set. Open in Estimates."
      });
    }

    // Single attachment — existing Shared Inbox path (backward compatible).
    if (keys.length === 1) {
      let result;
      try {
        result = await sharedInbox.sendToAiTakeoff({
          organizationId,
          messageKey,
          actorUserId,
          attachmentKey: keys[0],
          markAsPlan,
          manualPlanOverride,
          confirm: true,
          idempotencyKey,
          startFresh: startFresh !== false
        });
      } catch (e) {
        const code = String(e?.code || "takeoff_unavailable");
        const err = createQuoteFlowError(code, {
          message: e?.message,
          statusCode: Number(e?.statusCode) || undefined
        });
        if (e?.diagnostic) err.diagnostic = e.diagnostic;
        const shared = sharedInboxSafeError(code, e?.message);
        if (shared?.error) err.message = shared.error;
        if (code === "already_scoped") {
          err.message = "Scope is already set. Open in Estimates.";
        }
        if (
          code === "packet_build_failed" ||
          code === "packet_unsupported" ||
          code === "attachment_not_supported"
        ) {
          err.message =
            e?.message ||
            "AI Takeoff could not start for the selected plan packet.";
        }
        throw err;
      }

      const item = result?.item ? await enrichItem(organizationId, result.item) : null;
      const alreadyRunning =
        result.alreadyRunning === true || (result.reused === true && result.created !== true);
      const created = result.created === true && !alreadyRunning;
      const attName = result.attachmentName || null;
      if (result.takeoffJobId) {
        await stampTakeoffSourceMeta({
          organizationId,
          takeoffJobId: result.takeoffJobId,
          messageKey,
          inboxItem: detail?.item || item,
          attachmentKeys: keys,
          attachments: detail?.item?.attachments || item?.attachments || [],
          packetFilename: null,
          packetMerged: false,
          selectedPlanFilename: attName
        });
      }
      return {
        ok: true,
        intakeCaseId: result.intakeCaseId || null,
        takeoffJobId: result.takeoffJobId || null,
        created,
        reused: alreadyRunning,
        alreadyRunning,
        attachmentKey: result.attachmentKey || keys[0],
        attachmentKeys: keys,
        attachmentName: attName,
        packetMerged: false,
        item,
        message: alreadyRunning ? "AI Takeoff is already running." : "AI Takeoff started.",
        sideEffects: {
          calculated: false,
          approved: false,
          published: false,
          sold: false,
          accepted: false,
          digitalEstimateCreated: false,
          studioEstimateEnsured: false,
          ...(result.sideEffects && typeof result.sideEffects === "object"
            ? {
                calculated: result.sideEffects.calculated === true,
                approved: result.sideEffects.approved === true,
                published: result.sideEffects.published === true,
                sold: result.sideEffects.sold === true,
                digitalEstimateCreated: result.sideEffects.digitalEstimateCreated === true,
                studioEstimateEnsured: result.sideEffects.studioEstimateEnsured === true
              }
            : {})
        }
      };
    }

    // Multi-file: build one packet, then open estimate with prefetched bytes (no queue item on failure).
    if (!planViewerService?.getSharedInboxAttachmentContent) {
      const err = createQuoteFlowError("packet_unsupported", {
        statusCode: 400,
        message:
          "Multi-file takeoff packets are not supported yet. Select one file or merge plans before upload."
      });
      throw err;
    }

    const messageAttachments = Array.isArray(detail?.item?.attachments)
      ? detail.item.attachments
      : [];
    const overrideRequested = requestHasManualPlanOverride({
      markAsPlan,
      manualPlanOverride
    });

    /** @type {Array<{ bytes: Buffer, filename: string|null, declaredMime: string|null }>} */
    const parts = [];
    for (const key of keys) {
      const att = findScopedAttachment(messageAttachments, {
        attachmentKey: key,
        allowFilenameFallback: false
      });
      if (!att) {
        throw createQuoteFlowError("attachment_not_supported", {
          statusCode: 400,
          message: "AI Takeoff could not start for the selected plan packet."
        });
      }
      const autoOk = isAutoSupportedTakeoffSupport(att.support);
      const manualOk =
        overrideRequested &&
        isSafeManualPlanImageOverride({
          ...att,
          name: att.filename,
          support: att.support,
          isInline: att.isInline === true
        });
      if (!autoOk && !manualOk) {
        throw createQuoteFlowError("attachment_not_supported", {
          statusCode: 400,
          message: "AI Takeoff could not start for the selected plan packet."
        });
      }
      let content;
      try {
        content = await planViewerService.getSharedInboxAttachmentContent({
          organizationId,
          messageKey,
          attachmentKey: key
        });
      } catch {
        throw createQuoteFlowError("packet_build_failed", {
          statusCode: 400,
          message: "AI Takeoff could not start for the selected plan packet."
        });
      }
      parts.push({
        bytes: content.bytes,
        filename: content.filename || att.filename || null,
        declaredMime: content.contentType || att.contentType || null
      });
    }

    const packetNameBase =
      detail?.item?.requestTitle ||
      detail?.item?.projectLabel ||
      detail?.item?.subject ||
      "quote";
    let packet;
    try {
      packet = await buildTakeoffPacketPdf({
        parts,
        packetFilename: sanitizeTakeoffPacketFilename(`${packetNameBase}-takeoff-packet`)
      });
    } catch (e) {
      throw createQuoteFlowError(e?.code || "packet_build_failed", {
        statusCode: Number(e?.statusCode) || 400,
        message:
          e?.message ||
          "AI Takeoff could not start for the selected plan packet."
      });
    }

    // Import message first (same as Shared Inbox), then open estimate with packet bytes.
    let caseId = intakeCaseId;
    if (!caseId && typeof sharedInbox.importMessage === "function") {
      try {
        const imported = await sharedInbox.importMessage({
          organizationId,
          messageKey,
          actorUserId,
          confirm: true,
          idempotencyKey: idempotencyKey
            ? `qf-packet-import:${idempotencyKey}`
            : `qf-packet-import:${organizationId}:${messageKey}`
        });
        caseId = imported?.intakeCaseId || null;
      } catch (e) {
        throw createQuoteFlowError("import_failed", {
          statusCode: Number(e?.statusCode) || 400,
          message: "AI Takeoff could not start for the selected plan packet."
        });
      }
    }
    if (!caseId) {
      // Fall back: single-file path cannot apply; require import via first key start.
      // Try sendToAiTakeoff on first key only would create wrong single-file job — fail safe.
      throw createQuoteFlowError("import_failed", {
        statusCode: 400,
        message: "AI Takeoff could not start for the selected plan packet."
      });
    }

    const liveManualAttachment = {
      id: `live:packet:${keys[0].slice(0, 24)}`,
      sourceAttachmentId: keys[0],
      providerMessageId: String(detail?.item?.messageKey || messageKey || "").trim() || null,
      safeFilename: packet.filename,
      name: packet.filename,
      filename: packet.filename,
      mimeType: packet.mimeType,
      contentType: packet.mimeType,
      sizeBytes: packet.bytes.length,
      isInline: false,
      support: "direct_pdf",
      kind: "pdf_candidate",
      retrievalState: "pending",
      liveManualCandidate: true,
      takeoffPacket: true,
      takeoffPacketAttachmentKeys: keys
    };

    let openResult;
    try {
      if (!quoteIntakeRepository) {
        throw createQuoteFlowError("takeoff_unavailable", {
          statusCode: 503,
          message: "AI Takeoff could not start for the selected plan packet."
        });
      }
      openResult = await openEstimateFn({
        repository: quoteIntakeRepository,
        organizationId,
        intakeCaseId: caseId,
        actorUserId,
        getSupabase,
        env,
        body: {
          attachmentKey: keys[0],
          attachmentFilename: packet.filename,
          markAsPlan: false,
          manualPlanOverride: false
        },
        liveManualAttachment,
        fetchAttachmentBytes: async () => ({ bytes: packet.bytes }),
        initiationMode: "manual",
        startFresh: startFresh !== false
      });
    } catch (e) {
      if (e?.code && String(e.code).startsWith("packet")) throw e;
      throw createQuoteFlowError(
        e?.code === "multi_pdf_ambiguous" ? "attachment_not_supported" : e?.code || "takeoff_unavailable",
        {
          statusCode: Number(e?.statusCode) || 400,
          message: "AI Takeoff could not start for the selected plan packet."
        }
      );
    }

    let item = null;
    try {
      const after = await sharedInbox.getMessage({ organizationId, messageKey, actorUserId });
      item = after?.item ? await enrichItem(organizationId, after.item) : null;
    } catch {
      item = null;
    }

    const takeoffJobId = openResult?.takeoffJobId ? String(openResult.takeoffJobId) : null;
    const reused = openResult?.alreadyRunning === true || openResult?.reused === true;
    if (takeoffJobId) {
      const orderedPacketFiles = parts.map((p, idx) => ({
        filename: p.filename || null,
        attachmentKey: keys[idx] || null
      }));
      await stampTakeoffSourceMeta({
        organizationId,
        takeoffJobId,
        messageKey,
        inboxItem: detail?.item || item,
        attachmentKeys: keys,
        attachments: orderedPacketFiles.map((f) => ({
          attachmentKey: f.attachmentKey,
          filename: f.filename
        })),
        packetFilename: packet.filename,
        packetMerged: packet.merged === true,
        selectedPlanFilename: packet.merged ? null : packet.filename
      });
    }
    return {
      ok: true,
      intakeCaseId: caseId,
      takeoffJobId,
      created: openResult?.created === true && !reused,
      reused,
      alreadyRunning: reused,
      attachmentKey: keys[0],
      attachmentKeys: keys,
      attachmentName: packet.filename,
      packetMerged: packet.merged === true,
      packetFilename: packet.filename,
      item,
      message: reused ? "AI Takeoff is already running." : "AI Takeoff started.",
      sideEffects: {
        calculated: false,
        approved: false,
        published: false,
        sold: false,
        accepted: false,
        digitalEstimateCreated: false,
        studioEstimateEnsured: false
      }
    };
  }

  return {
    listInbox,
    getMessage,
    getAttachmentContent,
    startTakeoff,
    dismissMessage,
    restoreMessage,
    markOpened,
    isOfficialScopeSet,
    quoteFlowSafeError
  };
}
