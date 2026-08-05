/**
 * Quote Flow Estimates — list scoped estimates + save official scope (manual edits).
 * Does not rerun AI Takeoff, calculate, approve, publish, accept, or mark sold.
 */

import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import {
  presentQuoteFlowEstimateDetail,
  presentQuoteFlowEstimateListItem
} from "./quoteFlowEstimatesPresenter.mjs";
import { resolvePieceOpenEdgeLf, stampPieceOpenEdgeLf } from "./quoteFlowOpenEdge.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";
import { markQuoteFlowReviewStaleOnScope } from "./quoteFlowReviewMeta.mjs";

const NO_SIDE_EFFECTS = Object.freeze({
  calculated: false,
  approved: false,
  published: false,
  sold: false,
  accepted: false,
  digitalEstimateCreated: false,
  takeoffRerun: false,
  refreshScopeFromTakeoff: false
});

/**
 * Normalize + validate rooms for official scope PATCH.
 * @param {unknown} roomsRaw
 */
export function validateAndNormalizeOfficialScopeRooms(roomsRaw) {
  if (!Array.isArray(roomsRaw)) {
    const err = createQuoteFlowError("scope_invalid", {
      message: "Official scope must include a rooms array.",
      statusCode: 422
    });
    throw err;
  }
  if (roomsRaw.length > 200) {
    const err = createQuoteFlowError("scope_invalid", {
      message: "Too many rooms in official scope.",
      statusCode: 422
    });
    throw err;
  }

  const rooms = [];
  for (let i = 0; i < roomsRaw.length; i += 1) {
    const room = roomsRaw[i];
    if (!room || typeof room !== "object") {
      const err = createQuoteFlowError("scope_invalid", {
        message: `Room ${i + 1} is invalid.`,
        statusCode: 422
      });
      throw err;
    }
    const piecesRaw = Array.isArray(room.pieces) ? room.pieces : [];
    if (piecesRaw.length > 500) {
      const err = createQuoteFlowError("scope_invalid", {
        message: `Room ${i + 1} has too many pieces.`,
        statusCode: 422
      });
      throw err;
    }
    const pieces = piecesRaw.map((piece, j) => {
      if (!piece || typeof piece !== "object") {
        const err = createQuoteFlowError("scope_invalid", {
          message: `Piece ${j + 1} in room ${i + 1} is invalid.`,
          statusCode: 422
        });
        throw err;
      }
      const lengthIn = Number(piece.lengthIn);
      const depthIn = Number(piece.depthIn);
      const quantity = Math.max(1, Math.floor(Number(piece.quantity) || 1));
      if (!Number.isFinite(lengthIn) || lengthIn < 0 || lengthIn > 1200) {
        const err = createQuoteFlowError("scope_invalid", {
          message: `Piece ${j + 1} in room ${i + 1} has an invalid length.`,
          statusCode: 422
        });
        throw err;
      }
      if (!Number.isFinite(depthIn) || depthIn < 0 || depthIn > 1200) {
        const err = createQuoteFlowError("scope_invalid", {
          message: `Piece ${j + 1} in room ${i + 1} has an invalid depth.`,
          statusCode: 422
        });
        throw err;
      }
      const included =
        piece.included === false || piece.excluded === true || piece.include === false
          ? false
          : true;
      /** @type {Record<string, unknown>} */
      const next = {
        ...piece,
        id: piece.id != null ? String(piece.id) : undefined,
        name: piece.name != null ? String(piece.name) : "Piece",
        pieceType: piece.pieceType != null ? String(piece.pieceType) : undefined,
        lengthIn,
        depthIn,
        quantity,
        included,
        excluded: included ? false : true
      };
      if (piece.finishedEdge && typeof piece.finishedEdge === "object") {
        next.finishedEdge = { ...piece.finishedEdge };
      }
      // Canonical open/exposed edge LF — use shared resolver (0 must not wipe finishedEdge inches).
      const stamped = stampPieceOpenEdgeLf(next, resolvePieceOpenEdgeLf(piece));
      next.openEdgeLf = stamped.openEdgeLf;
      next.finishedEdgeLf = stamped.finishedEdgeLf;
      next.exposedEdgeLf = stamped.exposedEdgeLf;
      if (stamped.finishedEdge && typeof stamped.finishedEdge === "object") {
        next.finishedEdge = stamped.finishedEdge;
      }
      if (typeof piece.includeBacksplash === "boolean") {
        next.includeBacksplash = piece.includeBacksplash;
      }
      return next;
    });

    /** @type {Record<string, unknown>} */
    const nextRoom = {
      ...room,
      id: room.id != null ? String(room.id) : undefined,
      name: room.name != null ? String(room.name) : "Room",
      roomType: room.roomType != null ? String(room.roomType) : undefined,
      included: room.included === false ? false : true,
      pieces
    };
    if (typeof room.includeBacksplash === "boolean") {
      nextRoom.includeBacksplash = room.includeBacksplash;
    }
    if (room.backsplashHeightMode != null) {
      nextRoom.backsplashHeightMode = String(room.backsplashHeightMode);
    }
    if (room.backsplashMeasuredLengthIn != null) {
      nextRoom.backsplashMeasuredLengthIn = Number(room.backsplashMeasuredLengthIn) || 0;
    }
    if (room.backsplashHeightIn != null) {
      nextRoom.backsplashHeightIn = Number(room.backsplashHeightIn) || 0;
    }
    if (room.backsplashNotes != null) {
      nextRoom.backsplashNotes = String(room.backsplashNotes);
    }
    if (room.openEdgeMeasurementMode != null) {
      nextRoom.openEdgeMeasurementMode = String(room.openEdgeMeasurementMode);
    }
    if (room.openEdgeLf != null && Number.isFinite(Number(room.openEdgeLf))) {
      nextRoom.openEdgeLf = Number(room.openEdgeLf);
    }
    rooms.push(nextRoom);
  }
  return rooms;
}

/**
 * Stable fingerprint for idempotent PATCH comparison.
 * @param {unknown} rooms
 */
export function officialScopeRoomsFingerprint(rooms) {
  try {
    return JSON.stringify(rooms ?? []);
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   estimateRepository?: {
 *     listActiveForOrganization?: Function,
 *     getById?: Function
 *   }|null,
 *   studioEstimateService?: {
 *     updateScope?: Function,
 *     getById?: Function,
 *     refreshScopeFromTakeoff?: Function,
 *     calculate?: Function,
 *     approve?: Function,
 *     repository?: object
 *   }|null,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createQuoteFlowEstimatesService(deps = {}) {
  const studioEstimateService = deps.studioEstimateService || null;
  const estimateRepository =
    deps.estimateRepository || studioEstimateService?.repository || null;

  async function loadEstimateRow(organizationId, estimateId) {
    const id = String(estimateId || "").trim();
    if (!id) {
      throw createQuoteFlowError("estimate_not_found", {
        message: "Estimate not found.",
        statusCode: 404
      });
    }
    let row = null;
    if (estimateRepository?.getById) {
      row = await estimateRepository.getById(organizationId, id);
    } else if (studioEstimateService?.getById) {
      row = await studioEstimateService.getById(organizationId, id);
    }
    if (!row) {
      throw createQuoteFlowError("estimate_not_found", {
        message: "Estimate not found.",
        statusCode: 404
      });
    }
    return row;
  }

  async function listEstimates({ organizationId, query: _query = {} } = {}) {
    const org = String(organizationId || "").trim();
    if (!org) {
      throw createQuoteFlowError("organization_required", { statusCode: 403 });
    }
    if (!estimateRepository?.listActiveForOrganization) {
      return { ok: true, items: [], total: 0 };
    }
    const rows = await estimateRepository.listActiveForOrganization(org, {
      includeArchived: false
    });
    const items = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!isOfficialScopeSet(row)) continue;
      items.push(presentQuoteFlowEstimateListItem(row));
    }
    return { ok: true, items, total: items.length };
  }

  async function getEstimateDetail({ organizationId, estimateId } = {}) {
    const row = await loadEstimateRow(organizationId, estimateId);
    if (!isOfficialScopeSet(row)) {
      throw createQuoteFlowError("estimate_not_scoped", {
        message: "Official scope is not set for this estimate yet.",
        statusCode: 404
      });
    }
    return {
      ok: true,
      estimate: presentQuoteFlowEstimateDetail(row),
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function patchOfficialScope({
    organizationId,
    estimateId,
    body = {},
    actorUserId = null
  } = {}) {
    if (!studioEstimateService?.updateScope) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to save official scope.",
        statusCode: 503
      });
    }

    const existing = await loadEstimateRow(organizationId, estimateId);
    if (!isOfficialScopeSet(existing)) {
      throw createQuoteFlowError("estimate_not_scoped", {
        message: "Official scope is not set for this estimate yet.",
        statusCode: 404
      });
    }

    const scopeBody = body?.scope && typeof body.scope === "object" ? body.scope : body;
    if (!scopeBody || typeof scopeBody !== "object") {
      throw createQuoteFlowError("scope_invalid", {
        message: "Official scope payload is required.",
        statusCode: 422
      });
    }

    const rooms = validateAndNormalizeOfficialScopeRooms(scopeBody.rooms);
    const priorFp = officialScopeRoomsFingerprint(existing.scope?.rooms);
    const nextFp = officialScopeRoomsFingerprint(rooms);

    // Preserve intake/takeoff linkage — never accept client overrides that would rebind.
    const preservedTakeoffJobId = existing.takeoffJobId ?? null;
    const preservedIntakeCaseId = existing.intakeCaseId ?? null;
    const preservedSourceTakeoffResultId = existing.sourceTakeoffResultId ?? null;

    const displayNameRaw =
      scopeBody.projectName != null
        ? String(scopeBody.projectName)
        : scopeBody.estimateName != null
          ? String(scopeBody.estimateName)
          : scopeBody.quoteFlowEstimateName != null
            ? String(scopeBody.quoteFlowEstimateName)
            : null;
    const displayName = displayNameRaw != null ? String(displayNameRaw).trim() : null;
    const priorName = String(
      existing.scope?.projectName || existing.scope?.quoteFlowEstimateName || ""
    ).trim();
    const nameChanged = displayName != null && displayName !== "" && displayName !== priorName;

    const addOnsProvided = scopeBody.addOns && typeof scopeBody.addOns === "object";
    /** @type {Record<string, unknown>} */
    const scopePatch = {
      rooms,
      quoteFlowScopeEdited: true,
      quoteFlowManualEdits: true
    };
    if (addOnsProvided) {
      scopePatch.addOns = scopeBody.addOns;
    }
    if (displayName) {
      scopePatch.projectName = displayName.slice(0, 200);
      scopePatch.quoteFlowEstimateName = displayName.slice(0, 200);
    }
    // Preserve / mark Quote Flow review + Digital Estimate metadata when scope changes after approval/publish.
    const withReviewMeta = markQuoteFlowReviewStaleOnScope(
      { ...(existing.scope && typeof existing.scope === "object" ? existing.scope : {}), ...scopePatch },
      "Scope or pricing changed after approval. Re-review required."
    );
    if (withReviewMeta.quoteFlowReview) {
      scopePatch.quoteFlowReview = withReviewMeta.quoteFlowReview;
    }
    if (withReviewMeta.quoteFlowDigitalEstimate) {
      scopePatch.quoteFlowDigitalEstimate = withReviewMeta.quoteFlowDigitalEstimate;
    }

    const unchangedPayload = priorFp === nextFp && !nameChanged && !addOnsProvided;
    let updated;
    if (unchangedPayload && existing.scope?.quoteFlowScopeEdited === true) {
      // Idempotent no-op: same rooms already persisted after an Estimates edit.
      updated = existing;
    } else {
      updated = await studioEstimateService.updateScope({
        organizationId,
        estimateId: existing.id || estimateId,
        actorUserId,
        body: { scope: scopePatch }
      });
    }

    // Defensive: confirm linkage still present on the returned view/row.
    const linkageOk =
      (updated.takeoffJobId ?? null) === preservedTakeoffJobId &&
      (updated.intakeCaseId ?? null) === preservedIntakeCaseId;
    if (!linkageOk) {
      // updateScope should never rewrite these; surface a hard failure if it did.
      throw createQuoteFlowError("scope_invalid", {
        message: "Official scope save lost takeoff linkage.",
        statusCode: 500
      });
    }

    return {
      ok: true,
      estimate: presentQuoteFlowEstimateDetail({
        ...updated,
        takeoffJobId: updated.takeoffJobId ?? preservedTakeoffJobId,
        intakeCaseId: updated.intakeCaseId ?? preservedIntakeCaseId,
        sourceTakeoffResultId:
          updated.sourceTakeoffResultId ?? preservedSourceTakeoffResultId
      }),
      reused: unchangedPayload && existing.scope?.quoteFlowScopeEdited === true,
      message: "Scope saved.",
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  return {
    listEstimates,
    getEstimateDetail,
    patchOfficialScope,
    NO_SIDE_EFFECTS
  };
}
