/**
 * Manual estimate creation — legitimate quote_intake_cases (source_type=manual)
 * + active studio_estimates. No mailbox, attachment, or Takeoff records.
 */

import { createHash } from "node:crypto";
import { QUOTE_INTAKE_CASE_STATUS } from "../quoteIntake/quoteIntakeTypes.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import {
  MANUAL_ESTIMATE_ORIGIN,
  applyNormalizedManualRooms,
  buildInitialManualScope,
  isConfirmedManualPhysicalScope,
  manualScopeFingerprint,
  stripClientManualAuthority,
  validateManualScopeForConfirm
} from "./studioManualPhysicalScope.mjs";

function deError(message, code, statusCode) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

/**
 * Idempotency content hash for manual cases (uses existing org+content_hash unique).
 * @param {string} organizationId
 * @param {string} idempotencyKey
 */
export function manualIdempotencyContentHash(organizationId, idempotencyKey) {
  const key = String(idempotencyKey || "").trim();
  if (!key) return null;
  return createHash("sha256")
    .update(`manual_staff:${organizationId}:${key}`)
    .digest("hex");
}

/**
 * @param {{
 *   quoteIntakeRepository: object,
 *   studioEstimateRepository: object,
 *   studioEstimateService?: object|null,
 *   now?: () => Date
 * }} deps
 */
export function createStudioManualEstimateService(deps) {
  const intakeRepo = deps.quoteIntakeRepository;
  const estimateRepo = deps.studioEstimateRepository;
  const studioEstimateService = deps.studioEstimateService || null;
  const nowFn = deps.now || (() => new Date());

  if (!intakeRepo || typeof intakeRepo.createCase !== "function") {
    throw new Error("quoteIntakeRepository required");
  }
  if (!estimateRepo || typeof estimateRepo.create !== "function") {
    throw new Error("studioEstimateRepository required");
  }

  async function loadCaseById(organizationId, caseId) {
    if (typeof intakeRepo.getCase === "function") {
      return intakeRepo.getCase(organizationId, caseId);
    }
    if (typeof intakeRepo.getCaseById === "function") {
      return intakeRepo.getCaseById(organizationId, caseId);
    }
    return null;
  }

  async function resolveExistingFromIdempotency(organizationId, contentHash) {
    if (!contentHash) return null;
    // Memory repo: scan via listCases
    if (typeof intakeRepo.listCases === "function") {
      const listed = await Promise.resolve(intakeRepo.listCases(organizationId, { limit: 500 }));
      const rows = listed?.rows || listed || [];
      const found = rows.find(
        (c) =>
          String(c.sourceType || c.source_type) === "manual" &&
          (String(c.sourceMessage?.contentHash || "") === contentHash ||
            String(c.content_hash || c.contentHash || "") === contentHash)
      );
      return found || null;
    }
    return null;
  }

  /**
   * Create manual intake case + Studio estimate (idempotent).
   */
  async function createManualEstimate({
    organizationId,
    actorUserId,
    body = {},
    idempotencyKey = null
  }) {
    const org = String(organizationId || "").trim();
    if (!org) throw deError("organizationId required", "organization_required", 400);

    const key = String(idempotencyKey || body?.idempotencyKey || "").trim();
    if (!key) {
      throw deError("idempotencyKey is required", "idempotency_key_required", 400);
    }
    const contentHash = manualIdempotencyContentHash(org, key);

    // Never trust browser organizationId / origin / confirmation flags.
    const projectFields = {
      customerName: body.customerName,
      customerContactName: body.customerContactName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      projectName: body.projectName,
      projectAddress: body.projectAddress,
      estimatorNotes: body.estimatorNotes || body.internalNotes,
      accountDirectoryAccountId: body.accountDirectoryAccountId || null,
      accountDirectoryContactId: body.accountDirectoryContactId || null,
      accountDirectoryLocationId: body.accountDirectoryLocationId || null,
      customerIdentitySnapshot:
        body.customerIdentitySnapshot && typeof body.customerIdentitySnapshot === "object"
          ? body.customerIdentitySnapshot
          : null
    };

    let caseRow = null;
    try {
      caseRow = await intakeRepo.createCase({
        organizationId: org,
        createdByUserId: actorUserId || null,
        status: QUOTE_INTAKE_CASE_STATUS.MANUAL_REVIEW,
        sourceType: "manual",
        sourceMessage: {
          contentHash,
          internetMessageId: null,
          graphImmutableMessageId: null,
          fromAddressHash: null
        },
        attachments: [],
        receivedAt: nowFn().toISOString(),
        // No mailbox identity — this is not an email.
        mailboxIdentity: null
      });
    } catch (e) {
      if (e?.code === "duplicate_message" && e.existingCaseId) {
        caseRow = await loadCaseById(org, e.existingCaseId);
        if (!caseRow) {
          caseRow = await resolveExistingFromIdempotency(org, contentHash);
        }
      } else {
        // Memory repo may throw duplicate_message with existingCaseId
        const existing = await resolveExistingFromIdempotency(org, contentHash);
        if (existing) caseRow = existing;
        else throw e;
      }
    }

    if (!caseRow?.id) {
      throw deError("Unable to create manual intake case", "manual_case_create_failed", 500);
    }

    const sourceType = String(caseRow.sourceType || caseRow.source_type || "");
    if (sourceType && sourceType !== "manual") {
      throw deError("Idempotency key conflicts with a non-manual case", "idempotency_conflict", 409);
    }

    let estimate = await estimateRepo.getActiveByIntakeCase(org, caseRow.id);
    if (!estimate) {
      const scope = buildInitialManualScope(projectFields);
      estimate = await estimateRepo.create({
        organizationId: org,
        intakeCaseId: caseRow.id,
        takeoffJobId: null,
        sourceTakeoffResultId: null,
        createdByUserId: actorUserId || null,
        status: STUDIO_ESTIMATE_STATUSES.DRAFT,
        scope,
        accountDirectoryAccountId: projectFields.accountDirectoryAccountId,
        accountDirectoryContactId: projectFields.accountDirectoryContactId,
        accountDirectoryLocationId: projectFields.accountDirectoryLocationId,
        customerIdentitySnapshot: projectFields.customerIdentitySnapshot
      });
    }

    // Best-effort: stamp assigned estimator on case if repo supports it.
    if (
      actorUserId &&
      typeof intakeRepo.updateCase === "function" &&
      !caseRow.assignedEstimatorUserId &&
      !caseRow.assigned_estimator_user_id
    ) {
      try {
        await intakeRepo.updateCase(org, caseRow.id, {
          assignedEstimatorUserId: actorUserId
        });
      } catch {
        /* optional */
      }
    }

    return {
      ok: true,
      intakeCaseId: caseRow.id,
      estimateId: estimate.id,
      displayRef: String(estimate.id).slice(0, 8).toUpperCase(),
      estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
      openTarget: "manual-scope",
      status: estimate.status,
      revision: estimate.revision
    };
  }

  /**
   * Persist draft rooms/pieces for a manual estimate (does not confirm).
   * Confirmation flags are never accepted from the client.
   */
  async function saveManualScopeDraft({
    organizationId,
    estimateId,
    actorUserId,
    body = {}
  }) {
    const row = await estimateRepo.getById(organizationId, estimateId);
    if (!row) throw deError("Estimate not found", "estimate_not_found", 404);
    if (!isManualEstimateRow(row)) {
      throw deError("Not a manual estimate", "not_manual_estimate", 409);
    }

    const cleaned = stripClientManualAuthority(body?.scope || body || {});
    let nextScope = applyNormalizedManualRooms(
      {
        ...row.scope,
        ...cleaned,
        estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
        physicalScopeSource: MANUAL_ESTIMATE_ORIGIN,
        manualScopeConfirmed: false,
        manualScopeConfirmedAt: null,
        manualScopeConfirmedBy: null,
        manualScopeFingerprint: null
      },
      {
        rooms: cleaned.rooms != null ? cleaned.rooms : row.scope?.rooms,
        addOns: cleaned.addOns != null ? cleaned.addOns : row.scope?.addOns
      }
    );
    nextScope.estimateOrigin = MANUAL_ESTIMATE_ORIGIN;
    nextScope.physicalScopeSource = MANUAL_ESTIMATE_ORIGIN;
    nextScope.manualScopeConfirmed = false;
    nextScope.manualScopeConfirmedAt = null;
    nextScope.manualScopeConfirmedBy = null;
    nextScope.manualScopeFingerprint = null;

    if (studioEstimateService?.updateScope) {
      return studioEstimateService.updateScope({
        organizationId,
        estimateId,
        actorUserId,
        body: { scope: { rooms: nextScope.rooms, addOns: nextScope.addOns } }
      });
    }

    const wasPriced = row.status === STUDIO_ESTIMATE_STATUSES.PRICED;
    const wasApproved = row.status === STUDIO_ESTIMATE_STATUSES.APPROVED;
    if (wasApproved && typeof estimateRepo.createRevisionFrom === "function") {
      const revised = await estimateRepo.createRevisionFrom(
        organizationId,
        estimateId,
        {
          status: STUDIO_ESTIMATE_STATUSES.DRAFT,
          scope: nextScope,
          staleReason: "Manual scope changed after approval — recalculate and reapprove"
        },
        actorUserId
      );
      return safeManualView(revised);
    }
    /** @type {Record<string, unknown>} */
    const patch = { scope: nextScope, status: STUDIO_ESTIMATE_STATUSES.DRAFT };
    if (wasPriced) {
      patch.calculationSnapshot = null;
      patch.staleReason = "Manual scope changed — recalculate";
    }
    const updated = await estimateRepo.update(organizationId, estimateId, patch, actorUserId);
    return safeManualView(updated);
  }

  /**
   * Explicit Confirm Manual Scope — server validates and stamps confirmation.
   */
  async function confirmManualScope({ organizationId, estimateId, actorUserId, body = {} }) {
    if (body?.confirm !== true) {
      throw deError("confirm: true is required", "confirm_required", 400);
    }
    let row = await estimateRepo.getById(organizationId, estimateId);
    if (!row) throw deError("Estimate not found", "estimate_not_found", 404);
    if (!isManualEstimateRow(row)) {
      throw deError("Not a manual estimate", "not_manual_estimate", 409);
    }

    // Optional: apply latest draft rooms in the same request (still server-normalized).
    let scope = { ...row.scope };
    if (body.rooms != null || body.scope?.rooms != null) {
      const draftRooms = body.rooms ?? body.scope?.rooms;
      const draftAddOns = body.addOns ?? body.scope?.addOns ?? scope.addOns;
      scope = applyNormalizedManualRooms(
        {
          ...scope,
          estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
          physicalScopeSource: MANUAL_ESTIMATE_ORIGIN
        },
        { rooms: draftRooms, addOns: draftAddOns }
      );
    }

    scope.estimateOrigin = MANUAL_ESTIMATE_ORIGIN;
    scope.physicalScopeSource = MANUAL_ESTIMATE_ORIGIN;

    const errors = validateManualScopeForConfirm(scope);
    if (errors.length) {
      const err = deError("Manual scope is incomplete", "manual_scope_incomplete", 422);
      err.details = errors;
      throw err;
    }

    const fingerprint = manualScopeFingerprint(scope);
    // Idempotent confirm for same fingerprint.
    if (
      isConfirmedManualPhysicalScope(row.scope) &&
      row.scope.manualScopeFingerprint === fingerprint &&
      row.status === STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE
    ) {
      return {
        ok: true,
        estimate: safeManualView(row),
        alreadyConfirmed: true
      };
    }

    scope.manualScopeConfirmed = true;
    scope.manualScopeConfirmedAt = nowFn().toISOString();
    scope.manualScopeConfirmedBy = actorUserId || null;
    scope.manualScopeFingerprint = fingerprint;

    const updated = await estimateRepo.update(
      organizationId,
      estimateId,
      {
        scope,
        status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
        staleReason: null
      },
      actorUserId
    );

    return {
      ok: true,
      estimate: safeManualView(updated),
      alreadyConfirmed: false,
      // Explicit: confirm never publishes or communicates.
      published: false,
      notified: false
    };
  }

  return {
    createManualEstimate,
    saveManualScopeDraft,
    confirmManualScope
  };
}

function isManualEstimateRow(row) {
  const s = row?.scope || {};
  return (
    s.estimateOrigin === MANUAL_ESTIMATE_ORIGIN ||
    s.physicalScopeSource === MANUAL_ESTIMATE_ORIGIN
  );
}

function safeManualView(row) {
  if (!row) return null;
  return {
    id: row.id,
    intakeCaseId: row.intakeCaseId,
    status: row.status,
    revision: row.revision,
    takeoffJobId: row.takeoffJobId ?? null,
    estimateOrigin: row.scope?.estimateOrigin || null,
    physicalScopeSource: row.scope?.physicalScopeSource || null,
    manualScopeConfirmed: row.scope?.manualScopeConfirmed === true,
    manualScopeFingerprint: row.scope?.manualScopeFingerprint || null,
    projectName: row.scope?.projectName || null,
    customerName: row.scope?.customerName || null,
    roomCount: Array.isArray(row.scope?.rooms) ? row.scope.rooms.length : 0,
    staleReason: row.staleReason ?? null
  };
}

export { isManualEstimateRow, safeManualView };
