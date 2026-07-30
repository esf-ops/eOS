/**
 * Safe commercialConfiguration read model for the AI Estimate Record.
 * Pure — no I/O. Consumes estimate.scope + calculation.
 */
import { normalizeStudioCommercialLines } from "./studioCommercialLines.mjs";
import {
  normalizeEstimateWideAdjustment,
  resolveEffectiveEstimateWideAdjustment,
  distributeEstimateWideAdjustment,
  computeEstimateWideAdjustmentAmount
} from "./studioEstimateWideAdjustment.mjs";
import { roundPublicEstimateToNearestTen } from "../quotes/quoteCalculator.js";
import { resolveGovernedVanityPrograms } from "./studioVanityProgramGovernance.mjs";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return v == null ? "" : String(v).trim();
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * @param {object} estimate — safeEstimateView-shaped
 * @param {{ env?: NodeJS.ProcessEnv, editable?: boolean }} [opts]
 */
export function buildCommercialConfiguration(estimate, opts = {}) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const calc = estimate?.calculation || estimate?.calculationSnapshot || {};
  const totals = calc.totals && typeof calc.totals === "object" ? calc.totals : {};
  const account = calc.account && typeof calc.account === "object" ? calc.account : {};
  const revision = num(estimate?.revision) || 1;
  const published = Boolean(
    estimate?.publication?.active ||
      estimate?.publication?.customerUrl ||
      estimate?.approval
  );
  // Draft revisions only — approved/published snapshots are immutable.
  // Estimators must use Edit Estimate (open-measurement-revision) first.
  const status = str(estimate?.status).toLowerCase();
  const editable =
    opts.editable != null
      ? Boolean(opts.editable)
      : !estimate?.approval &&
        status !== "approved" &&
        status !== "superseded";

  const customLines = normalizeStudioCommercialLines(scope).map((line) => ({
    id: line.id,
    description: line.customerDescription || line.name,
    category: line.category,
    quantity: line.quantity,
    unitPriceExact: line.unitPrice,
    amountExact: line.lineTotal != null ? line.lineTotal : round2(line.quantity * line.unitPrice),
    customerVisible: line.customerFacing === true,
    internalOnly:
      line.commercialRole === "internal_only" || line.commercialRole === "absorbed",
    absorbed: line.commercialRole === "absorbed",
    percentageEligible: line.percentageEligible !== false && line.customerFacing === true,
    roomId: line.roomId || null,
    reason: line.internalNotes || "",
    commercialRole: line.commercialRole
  }));

  const resolved = resolveEffectiveEstimateWideAdjustment({
    scopeAdjustment: scope.estimateWideAdjustment,
    partnerAccountId: scope.partnerAccountId || account.partnerAccountId,
    env: opts.env
  });

  const baseExact =
    num(totals.exactTotal) - num(totals.accountAdjustment) ||
    num(totals.roomTotalsSum) +
      num(totals.estimateCustomerFacingTotal) +
      num(totals.estimateHiddenCustomerChargeTotal) ||
    num(totals.exactTotal) ||
    0;

  // Prefer calculator accountAdjustment when Spahn path already ran; else compute.
  let exactAdjustment = num(totals.accountAdjustment);
  let adjustedExact = num(totals.exactTotal) || round2(baseExact + exactAdjustment);
  if (resolved.active && exactAdjustment === 0 && baseExact > 0) {
    exactAdjustment = computeEstimateWideAdjustmentAmount(baseExact, resolved.percentage);
    adjustedExact = round2(baseExact + exactAdjustment);
  }

  const visibleCustom = customLines.filter((l) => l.customerVisible && !l.internalOnly);
  const eligibleExtrasExact = round2(
    visibleCustom
      .filter((l) => l.percentageEligible && l.amountExact >= 0)
      .reduce((s, l) => s + num(l.amountExact), 0)
  );
  const nonPercentageCommercialExact = round2(
    visibleCustom
      .filter((l) => !l.percentageEligible || l.amountExact < 0)
      .reduce((s, l) => s + num(l.amountExact), 0)
  );
  const verifiedBaseExact =
    num(totals.roomTotalsSum) ||
    round2(baseExact - eligibleExtrasExact - Math.max(0, nonPercentageCommercialExact)) ||
    round2(baseExact);
  const eligibleBasisExact = round2(
    num(totals.estimateWideAdjustment?.eligibleBasisExact) ||
      verifiedBaseExact + eligibleExtrasExact
  );
  // When calculator applied % to full preAccount, prefer distributed eligible-basis math for display.
  if (resolved.active && eligibleBasisExact > 0) {
    const fromEligible = computeEstimateWideAdjustmentAmount(
      eligibleBasisExact,
      resolved.percentage
    );
    if (fromEligible > 0) {
      exactAdjustment = fromEligible;
      adjustedExact = round2(eligibleBasisExact + exactAdjustment + nonPercentageCommercialExact);
    }
  }

  const estimateAdjustment = {
    active: resolved.active,
    percentage: resolved.percentage,
    reason: resolved.reason,
    source: resolved.source,
    verifiedBaseExact: round2(verifiedBaseExact),
    eligibleAdditionalChargesExact: round2(eligibleExtrasExact),
    eligibleBasisExact: round2(eligibleBasisExact),
    baseExactTotal: round2(verifiedBaseExact),
    exactAdjustment: round2(exactAdjustment),
    nonPercentageCommercialExact: round2(nonPercentageCommercialExact),
    adjustedExactTotal: round2(adjustedExact),
    customerDisplayTotal:
      totals.customerDisplayTotal != null
        ? num(totals.customerDisplayTotal)
        : totals.displayTotal != null
          ? num(totals.displayTotal)
          : roundPublicEstimateToNearestTen(adjustedExact)
  };

  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  // Governed Vanity Program — one add/remove decision, resolved from Takeoff
  // facts and the authoritative calculation. No trip or confirmation questions.
  const vanityPrograms = resolveGovernedVanityPrograms({
    scope,
    calculationSnapshot: estimate?.calculationSnapshot || null
  });

  /**
   * Waterfall physical scope belongs to the island piece in Takeoff. This is a
   * read-only projection of that exact object plus the authoritative price
   * impact — Estimate Options never owns waterfall geometry.
   */
  const calcRooms = Array.isArray(estimate?.calculationSnapshot?.elite100?.rooms)
    ? estimate.calculationSnapshot.elite100.rooms
    : [];
  function roomWaterfallExact(roomId) {
    const match = calcRooms.find((r) => str(r?.roomId) === str(roomId));
    if (!match) return null;
    const total = round2(
      num(match.waterfallMaterialSubtotal) +
        num(match.waterfallLaborTotal) +
        num(match.waterfallPolishTotal) +
        num(match.waterfallMiterTotal)
    );
    return total > 0 ? total : null;
  }

  const waterfalls = [];
  for (const room of rooms) {
    const roomCfg = scope.roomConfigurations?.[room.id] || room.configuration || {};
    const wfs = Array.isArray(roomCfg.waterfalls)
      ? roomCfg.waterfalls
      : Array.isArray(room.waterfalls)
        ? room.waterfalls
        : [];
    const roomTotal = roomWaterfallExact(room.id);
    for (const wf of wfs) {
      if (!wf) continue;
      const pieceId = str(wf.targetPieceId || wf.pieceId);
      const piece = (Array.isArray(room.pieces) ? room.pieces : []).find(
        (p) => str(p?.id) === pieceId
      );
      const pieceLabel = str(wf.pieceLabel || piece?.name) || "Island";
      waterfalls.push({
        id: str(wf.id) || (pieceId ? `${pieceId}-${str(wf.side) || "left"}` : null),
        roomId: str(room.id) || null,
        roomName: str(room.name) || "Room",
        pieceId: pieceId || null,
        pieceLabel,
        // Customer-facing governed option label — dimensions are not customer editable.
        customerOptionLabel: `${pieceLabel} — ${
          str(wf.side).toLowerCase() === "right" ? "Right" : "Left"
        } Waterfall`,
        side: str(wf.side) || "custom",
        // Panel depth is inherited from the island piece, never re-entered.
        panelWidthIn: num(wf.panelWidthIn) || (piece ? num(piece.depthIn) : 0) || null,
        panelHeightIn: num(wf.legHeightIn || wf.panelHeightIn) || null,
        quantity: num(wf.quantity) || 1,
        miterHeightIn: num(wf.miterHeightIn) || null,
        miterKey: str(wf.miterKey) || null,
        backsidePolish: wf.backsidePolish === true,
        note: str(wf.note || wf.estimatorNote) || "",
        required: wf.required === true || wf.customerOptional === false,
        customerOptional: wf.customerOptional === true,
        priceBreakdown: null,
        // Attributable only when this room has a single waterfall object.
        total: wfs.length === 1 ? roomTotal : null,
        roomWaterfallExactTotal: roomTotal
      });
    }
  }

  return {
    editable,
    revisionNumber: revision,
    customLines,
    estimateAdjustment,
    vanityPrograms,
    waterfalls,
    published
  };
}
