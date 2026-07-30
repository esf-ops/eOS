/**
 * Studio V2 Slice C — controlled AI Takeoff → Working Draft import helpers.
 * Read/map only via existing seedScopeFromTakeoffPayload / buildTakeoffImportPayload.
 * Never calls V1 refresh-from-takeoff or ensure-editable-draft.
 */

import { buildTakeoffImportPayload } from "../takeoff/takeoffImportPayload.mjs";
import { seedScopeFromTakeoffPayload } from "./studioEstimateService.mjs";
import { buildStudioV2ScopeSummary } from "./studioV2WorkingDraft.mjs";
import { buildStudioV2EditableScope } from "./studioV2ScopeEditor.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";

function hasUsableRooms(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  return rooms.some((r) => r && r.included !== false);
}

/**
 * @param {object|null|undefined} currentScope
 * @param {object|null|undefined} mappedScope
 */
export function buildStudioV2TakeoffImportDiff(currentScope, mappedScope) {
  const currentRooms = Array.isArray(currentScope?.rooms) ? currentScope.rooms : [];
  const mappedRooms = Array.isArray(mappedScope?.rooms) ? mappedScope.rooms : [];
  const currentEmpty = !hasUsableRooms(currentScope);
  const currentByName = new Map(
    currentRooms.filter((r) => r?.name).map((r) => [String(r.name).toLowerCase(), r])
  );
  const mappedByName = new Map(
    mappedRooms.filter((r) => r?.name).map((r) => [String(r.name).toLowerCase(), r])
  );

  const roomsToAdd = [];
  const roomsToUpdate = [];
  let piecesToAdd = 0;
  let piecesToUpdate = 0;

  for (const [name, mapped] of mappedByName) {
    const current = currentByName.get(name);
    if (!current) {
      roomsToAdd.push(mapped.name);
      piecesToAdd += Array.isArray(mapped.pieces) ? mapped.pieces.length : 0;
      continue;
    }
    roomsToUpdate.push(mapped.name);
    const curPieces = Array.isArray(current.pieces) ? current.pieces : [];
    const mapPieces = Array.isArray(mapped.pieces) ? mapped.pieces : [];
    const curPieceNames = new Set(curPieces.map((p) => String(p?.name || "").toLowerCase()));
    for (const p of mapPieces) {
      const pn = String(p?.name || "").toLowerCase();
      if (!curPieceNames.has(pn)) piecesToAdd += 1;
      else piecesToUpdate += 1;
    }
  }

  return {
    currentScopeEmpty: currentEmpty,
    mappedRoomCount: mappedRooms.length,
    mappedPieceCount: mappedRooms.reduce(
      (s, r) => s + (Array.isArray(r.pieces) ? r.pieces.length : 0),
      0
    ),
    roomsToAdd,
    roomsToUpdate,
    piecesToAdd,
    piecesToUpdate,
    replaceWarning: currentEmpty
      ? null
      : "Applying this takeoff will replace the current Working Draft scope."
  };
}

/**
 * Resolve a frozen or rebuilt import payload from takeoff workspace + latest result.
 * Read-only — does not persist.
 *
 * @param {{
 *   takeoffJobId: string,
 *   workspace: object|null,
 *   latest: object|null
 * }} args
 * @returns {{ ok: true, payload: object, reviewStatus: string, resultId: string|null } | { ok: false, code: string, message?: string }}
 */
export function resolveStudioV2TakeoffImportPayload(args = {}) {
  const takeoffJobId = String(args.takeoffJobId || "").trim();
  if (!takeoffJobId) {
    return { ok: false, code: STUDIO_V2_ERROR_CODES.NO_TAKEOFF_AVAILABLE };
  }
  const workspace = args.workspace || null;
  const latest = args.latest || null;
  const reviewStatus = String(workspace?.reviewStatus || latest?.reviewStatus || "")
    .trim()
    .toLowerCase();

  const resultId = workspace?.latestResult?.id || latest?.id || latest?.resultId || null;
  const frozen =
    latest?.importPayload &&
    typeof latest.importPayload === "object" &&
    Array.isArray(latest.importPayload.rooms) &&
    latest.importPayload.rooms.length > 0
      ? latest.importPayload
      : null;

  if (reviewStatus !== "approved" && !frozen) {
    return {
      ok: false,
      code: STUDIO_V2_ERROR_CODES.TAKEOFF_NOT_READY,
      message: "AI Takeoff must be reviewed and approved before importing into Studio V2."
    };
  }

  const normalized = latest?.normalizedTakeoffJson || null;
  if (!frozen && !normalized) {
    return {
      ok: false,
      code: STUDIO_V2_ERROR_CODES.TAKEOFF_NOT_READY,
      message: "Approved Takeoff result is not ready yet."
    };
  }

  let payload = frozen;
  if (!payload) {
    try {
      payload = buildTakeoffImportPayload({
        takeoffJobId,
        takeoffResultId: resultId,
        takeoffResult: normalized,
        reviewState: latest?.reviewState || null,
        computed: latest?.computedMeasurementsJson || null,
        validation: latest?.validationDiagnosticsJson || null,
        requireApproved: true,
        reviewStatus: "approved",
        approvedAt: workspace?.approvedAt || null,
        approvedBy: workspace?.approvedByUserId || null,
        ignoreApprovalGateBlockers: true
      });
    } catch (e) {
      return {
        ok: false,
        code: STUDIO_V2_ERROR_CODES.TAKEOFF_MAPPING_FAILED,
        message: e?.message || "Unable to map AI Takeoff into Studio scope."
      };
    }
  }

  if (!payload || !Array.isArray(payload.rooms) || payload.rooms.length === 0) {
    return {
      ok: false,
      code: STUDIO_V2_ERROR_CODES.TAKEOFF_MAPPING_FAILED,
      message: "Takeoff has no importable rooms."
    };
  }

  return { ok: true, payload, reviewStatus: reviewStatus || "approved", resultId };
}

/**
 * Map takeoff payload into a full Working Draft scope, preserving identity/pricing.
 * @param {object} payload
 * @param {object|null|undefined} existingScope
 */
export function mapTakeoffPayloadToStudioV2Scope(payload, existingScope = null) {
  const base = existingScope && typeof existingScope === "object" ? existingScope : {};
  return seedScopeFromTakeoffPayload(payload, {
    customerName: base.customerName,
    customerContactName: base.customerContactName,
    customerEmail: base.customerEmail,
    customerPhone: base.customerPhone,
    projectName: base.projectName,
    projectAddress: base.projectAddress,
    partnerAccountId: base.partnerAccountId,
    accountDirectoryAccountId: base.accountDirectoryAccountId,
    accountDirectoryContactId: base.accountDirectoryContactId,
    accountDirectoryLocationId: base.accountDirectoryLocationId,
    customerIdentitySnapshot: base.customerIdentitySnapshot,
    pricingBasis: base.pricingBasis,
    materialGroup: base.materialGroup,
    colorName: base.colorName,
    estimatorNotes: base.estimatorNotes,
    customLineItems: base.customLineItems,
    // Import replaces physical rooms/addOns from takeoff; keep commercial configs when possible
    roomConfigurations: base.roomConfigurations
  });
}

/**
 * Build staff-safe preview DTO for the Takeoff Import panel.
 * @param {{
 *   estimate: object,
 *   mappedScope: object,
 *   reviewStatus: string,
 *   takeoffJobId: string,
 *   resultId?: string|null
 * }} args
 */
export function buildStudioV2TakeoffImportPreviewDto(args = {}) {
  const estimate = args.estimate || {};
  const mappedScope = args.mappedScope || {};
  const fakeEstimate = { ...estimate, scope: mappedScope, calculation: null, calculationSnapshot: null };
  const diff = buildStudioV2TakeoffImportDiff(estimate.scope, mappedScope);
  return {
    ok: true,
    takeoffJobId: args.takeoffJobId || estimate.takeoffJobId || null,
    resultId: args.resultId || null,
    reviewStatus: args.reviewStatus || null,
    currentScopeEmpty: diff.currentScopeEmpty,
    replaceWarning: diff.replaceWarning,
    diff,
    scopeSummary: buildStudioV2ScopeSummary(fakeEstimate),
    editableScope: buildStudioV2EditableScope(fakeEstimate),
    allowedModes: diff.currentScopeEmpty ? ["replace_empty", "replace_all"] : ["replace_all"]
  };
}

export function currentScopeIsEmpty(scope) {
  return !hasUsableRooms(scope);
}
