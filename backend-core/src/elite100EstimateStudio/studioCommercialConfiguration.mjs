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
  // Before first publish: commercial editable on approved draft.
  // After publish: only on a newer draft revision (no approval yet / ready_to_price).
  const status = str(estimate?.status).toLowerCase();
  const editable =
    opts.editable != null
      ? Boolean(opts.editable)
      : !estimate?.approval ||
        status === "ready_to_price" ||
        status === "draft" ||
        status === "priced" ||
        status === "needs_takeoff_approval";

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

  const estimateAdjustment = {
    active: resolved.active,
    percentage: resolved.percentage,
    reason: resolved.reason,
    source: resolved.source,
    baseExactTotal: round2(baseExact),
    exactAdjustment: round2(exactAdjustment),
    adjustedExactTotal: round2(adjustedExact),
    customerDisplayTotal:
      totals.customerDisplayTotal != null
        ? num(totals.customerDisplayTotal)
        : totals.displayTotal != null
          ? num(totals.displayTotal)
          : roundPublicEstimateToNearestTen(adjustedExact)
  };

  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const vanityPrograms = rooms
    .filter((r) => r && /vanity|bath/i.test(str(r.name) + str(r.roomType)))
    .map((room) => {
      const pieces = Array.isArray(room.pieces) ? room.pieces : [];
      const vanityPiece =
        pieces.find((p) => /vanity/i.test(str(p.name) + str(p.pieceType))) || pieces[0] || null;
      const cfg = room.vanityProgram || scope.roomConfigurations?.[room.id]?.vanityProgram || {};
      return {
        roomId: str(room.id) || null,
        roomName: str(room.name) || "Room",
        physicalFacts: {
          widthIn: vanityPiece ? num(vanityPiece.lengthIn) : null,
          depthIn: vanityPiece ? num(vanityPiece.depthIn) : null,
          quantity: vanityPiece ? num(vanityPiece.quantity) || 1 : 0,
          bowlCount: num(cfg.bowlCount) || null,
          sinkOpenings: num(room.addOns?.["qty-bar"]) || null
        },
        eligible: cfg.useStandardPricing === true ? null : null,
        eligibilityReasons: [],
        selectedProgram: cfg.useStandardPricing === true ? "standard" : null,
        sameTrip: cfg.additionalTrips == null || Number(cfg.additionalTrips) === 0,
        additionalTrips: num(cfg.additionalTrips) || 0,
        permittedCustomerOptions: Array.isArray(cfg.permittedCustomerOptions)
          ? cfg.permittedCustomerOptions
          : [],
        serverPrice: null,
        warnings: [],
        useStandardPricing: cfg.useStandardPricing === true
      };
    });

  const waterfalls = [];
  for (const room of rooms) {
    const roomCfg = scope.roomConfigurations?.[room.id] || room.configuration || {};
    const wfs = Array.isArray(roomCfg.waterfalls)
      ? roomCfg.waterfalls
      : Array.isArray(room.waterfalls)
        ? room.waterfalls
        : [];
    for (const wf of wfs) {
      if (!wf) continue;
      waterfalls.push({
        id: str(wf.id) || null,
        roomId: str(room.id) || null,
        roomName: str(room.name) || "Room",
        pieceId: str(wf.targetPieceId || wf.pieceId) || null,
        side: str(wf.side) || "custom",
        panelWidthIn: num(wf.panelWidthIn) || null,
        panelHeightIn: num(wf.legHeightIn || wf.panelHeightIn) || null,
        quantity: num(wf.quantity) || 1,
        miterHeightIn: num(wf.miterHeightIn) || null,
        miterKey: str(wf.miterKey) || null,
        backsidePolish: wf.backsidePolish === true,
        required: wf.required === true || wf.customerOptional === false,
        customerOptional: wf.customerOptional === true,
        priceBreakdown: null,
        total: null
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
