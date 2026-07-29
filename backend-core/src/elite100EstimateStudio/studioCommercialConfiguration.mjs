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
  function vanityPackageLabel(code) {
    const raw = str(code);
    const m = raw.match(/^(\d+)_([SD])$/i);
    if (!m) {
      if (/vanity program/i.test(raw) || raw === "standard") {
        return raw === "standard" ? "Standard vanity pricing" : raw || "Governed Vanity Program";
      }
      return raw || "Governed Vanity Program";
    }
    const bowl = m[2].toUpperCase() === "D" ? "Double" : "Single";
    return `${m[1]}-inch ${bowl}-Bowl Vanity Program`;
  }

  function vanitySinkOpenings(room) {
    const fromAddOn = num(room.addOns?.["qty-bar"]);
    if (fromAddOn > 0) return fromAddOn;
    let fromCutouts = 0;
    for (const piece of Array.isArray(room.pieces) ? room.pieces : []) {
      if (!piece || piece.included === false) continue;
      for (const c of Array.isArray(piece.cutouts) ? piece.cutouts : []) {
        const type = str(c?.type || c?.cutoutType).toLowerCase();
        if (type === "vanity_bar_sink" || type === "vanity_sink" || type === "bar_sink") {
          fromCutouts += num(c.quantity) || 1;
        }
      }
    }
    if (fromCutouts > 0) return fromCutouts;
    const typed = room.openingsByType?.vanityBarSink ?? room.openingsByType?.vanity_bar_sink;
    return num(typed) || null;
  }

  const vanityPrograms = rooms
    .filter((r) => r && /vanity|bath/i.test(str(r.name) + str(r.roomType)))
    .map((room) => {
      const pieces = Array.isArray(room.pieces) ? room.pieces : [];
      const vanityPiece =
        pieces.find((p) => /vanity/i.test(str(p.name) + str(p.pieceType))) || pieces[0] || null;
      const cfg = room.vanityProgram || scope.roomConfigurations?.[room.id]?.vanityProgram || {};
      const selectedProgram =
        cfg.useStandardPricing === true
          ? "standard"
          : cfg.selectedProgram
            ? str(cfg.selectedProgram)
            : null;
      const sinkOpenings = vanitySinkOpenings(room);
      const derivedBowl =
        sinkOpenings === 1 ? 1 : sinkOpenings === 2 ? 2 : num(cfg.bowlCount) || null;
      const widthIn = vanityPiece ? num(vanityPiece.lengthIn) : null;
      let resolvedProgram = selectedProgram;
      if (!resolvedProgram && derivedBowl === 1 && widthIn >= 36 && widthIn <= 38) {
        resolvedProgram = "37_S";
      } else if (!resolvedProgram && derivedBowl === 2 && widthIn >= 60 && widthIn <= 62) {
        resolvedProgram = "61_D";
      }
      return {
        roomId: str(room.id) || null,
        roomName: str(room.name) || "Room",
        physicalFacts: {
          widthIn,
          depthIn: vanityPiece ? num(vanityPiece.depthIn) : null,
          quantity: vanityPiece ? num(vanityPiece.quantity) || 1 : 0,
          bowlCount: derivedBowl,
          sinkOpenings,
          backsplash: cfg.backsplashLabel || null,
          sameTrip: cfg.additionalTrips == null || Number(cfg.additionalTrips) === 0
        },
        eligible:
          cfg.eligible === true
            ? true
            : cfg.eligible === false
              ? false
              : derivedBowl != null && widthIn != null
                ? cfg.sameTripConfirmed === true
                  ? true
                  : null
                : false,
        eligibilityReasons: (() => {
          const reasons = Array.isArray(cfg.eligibilityReasons) ? [...cfg.eligibilityReasons] : [];
          if (derivedBowl != null && widthIn != null && cfg.sameTripConfirmed !== true) {
            if (!reasons.some((r) => /templated and installed with the kitchen/i.test(String(r)))) {
              reasons.push(
                "Confirm whether the vanity will be templated and installed with the kitchen."
              );
            }
          }
          return reasons;
        })(),
        selectedProgram: resolvedProgram,
        selectedProgramLabel: resolvedProgram ? vanityPackageLabel(resolvedProgram) : null,
        applyProgram: Boolean(selectedProgram && selectedProgram !== "standard"),
        sameTrip: cfg.additionalTrips == null || Number(cfg.additionalTrips) === 0,
        additionalTrips: num(cfg.additionalTrips) || 0,
        permittedCustomerOptions: Array.isArray(cfg.permittedCustomerOptions)
          ? cfg.permittedCustomerOptions
          : [],
        permittedMaterials: Array.isArray(cfg.permittedMaterials) ? cfg.permittedMaterials : [],
        permittedSinkUpgrades: Array.isArray(cfg.permittedSinkUpgrades)
          ? cfg.permittedSinkUpgrades
          : [],
        permittedEdgeUpgrades: Array.isArray(cfg.permittedEdgeUpgrades)
          ? cfg.permittedEdgeUpgrades
          : [],
        includedScope: Array.isArray(cfg.includedScope) ? cfg.includedScope : [],
        serverPrice: cfg.serverPrice != null ? num(cfg.serverPrice) : null,
        warnings: Array.isArray(cfg.warnings) ? cfg.warnings : [],
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
        pieceLabel: (() => {
          const pid = str(wf.targetPieceId || wf.pieceId);
          const piece = (Array.isArray(room.pieces) ? room.pieces : []).find(
            (p) => str(p?.id) === pid
          );
          return str(wf.pieceLabel || piece?.name) || "Island";
        })(),
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
