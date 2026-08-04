/**
 * Elite 100 Quote Flow — Inbox + start-takeoff orchestration (Slice 1B).
 * Reuses Shared Inbox + open-estimate; does not calculate/approve/publish/sold.
 */

import { sharedInboxSafeError } from "../elite100EstimateStudio/studioSharedInboxService.mjs";
import { createQuoteFlowError, quoteFlowSafeError } from "./quoteFlowErrors.mjs";
import {
  groupQuoteFlowInboxItems,
  presentQuoteFlowInboxItem,
  sortQuoteFlowInboxItems
} from "./quoteFlowInboxPresenter.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";

export { isOfficialScopeSet } from "./quoteFlowScope.mjs";

/**
 * @param {{
 *   sharedInboxService: { listInbox: Function, getMessage: Function, sendToAiTakeoff: Function },
 *   estimateRepository?: { getActiveByIntakeCase?: Function }|null,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createQuoteFlowService(deps) {
  const sharedInbox = deps.sharedInboxService;
  if (!sharedInbox) {
    throw new Error("createQuoteFlowService: sharedInboxService required");
  }
  const estimateRepository = deps.estimateRepository || null;

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

  async function enrichItem(organizationId, item) {
    const scoped = await alreadyScopedForCase(organizationId, item?.intakeCaseId);
    return presentQuoteFlowInboxItem(item, { alreadyScoped: scoped });
  }

  async function listInbox({ organizationId, query = {}, actorUserId = null }) {
    const result = await sharedInbox.listInbox({ organizationId, query, actorUserId });
    const items = Array.isArray(result?.items) ? result.items : [];
    const presented = [];
    for (const item of items) {
      presented.push(await enrichItem(organizationId, item));
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
        completed: grouped.completed
      },
      stats: grouped.stats,
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

  async function startTakeoff({
    organizationId,
    messageKey,
    actorUserId = null,
    attachmentKey = null,
    markAsPlan = false,
    manualPlanOverride = false,
    confirm = false,
    idempotencyKey = null
  }) {
    if (confirm !== true && confirm !== "true") {
      throw createQuoteFlowError("import_confirm_required");
    }
    const attKey = String(attachmentKey || "").trim();
    if (!attKey) {
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
        message: "Scope is already set for this estimate. AI Takeoff will not run again."
      });
    }

    let result;
    try {
      result = await sharedInbox.sendToAiTakeoff({
        organizationId,
        messageKey,
        actorUserId,
        attachmentKey: attKey,
        markAsPlan,
        manualPlanOverride,
        confirm: true,
        idempotencyKey
      });
    } catch (e) {
      const code = String(e?.code || "takeoff_unavailable");
      const err = createQuoteFlowError(code, {
        message: e?.message,
        statusCode: Number(e?.statusCode) || undefined
      });
      if (e?.diagnostic) err.diagnostic = e.diagnostic;
      // Prefer Shared Inbox safe messages when known.
      const shared = sharedInboxSafeError(code, e?.message);
      if (shared?.error) err.message = shared.error;
      throw err;
    }

    const item = result?.item
      ? await enrichItem(organizationId, result.item)
      : null;

    return {
      ok: true,
      intakeCaseId: result.intakeCaseId || null,
      takeoffJobId: result.takeoffJobId || null,
      created: result.created === true,
      reused: result.reused === true,
      attachmentKey: result.attachmentKey || attKey,
      attachmentName: result.attachmentName || null,
      item,
      message: result.reused
        ? "AI Takeoff job reused for this attachment."
        : "AI Takeoff started for this attachment.",
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

  return {
    listInbox,
    getMessage,
    startTakeoff,
    isOfficialScopeSet,
    quoteFlowSafeError
  };
}
