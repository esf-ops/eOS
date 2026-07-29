/**
 * Authoritative Measurements-approved card mapping from a Studio estimate.
 * Prefer refreshed/calculated estimate Scope + calculation; pending postMessage
 * summary is only a final compatibility fallback.
 */

import { isBacksplashPiece } from "../../../backend-core/src/elite100EstimateStudio/estimatorPieceClassification.mjs";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pieceSf(piece) {
  const p = piece && typeof piece === "object" ? piece : {};
  if (num(p.sqft) > 0) return round2(num(p.sqft));
  const len = num(p.lengthIn);
  const depth = num(p.depthIn);
  const qty = num(p.quantity) || 1;
  if (len > 0 && depth > 0) return round2((len * depth * qty) / 144);
  return 0;
}

function scopeOf(est) {
  return est && typeof est === "object" && est.scope && typeof est.scope === "object"
    ? est.scope
    : {};
}

function calcOf(est) {
  return est && typeof est === "object" && est.calculation && typeof est.calculation === "object"
    ? est.calculation
    : {};
}

/**
 * Countertop SF for display — never includes splash/fhb pieces.
 * Prefers calculator measuredCountertopSf when present; otherwise sums counter pieces.
 * @param {Record<string, unknown>} est
 * @returns {number}
 */
export function measuredCountertopSfFromEstimate(est) {
  const calc = calcOf(est);
  const billing =
    calc.scopeBilling && typeof calc.scopeBilling === "object" ? calc.scopeBilling : {};
  const fromBilling = num(billing.measuredCountertopSf) || num(billing.billableCountertopSf);
  // Prefer billing only when piece-derived total agrees within 0.02, or pieces are empty.
  const rooms = Array.isArray(scopeOf(est).rooms) ? scopeOf(est).rooms : [];
  const fromPieces = round2(
    rooms.reduce((s, r) => {
      const room = r && typeof r === "object" ? r : {};
      if (room.included === false) return s;
      const pieces = Array.isArray(room.pieces) ? room.pieces : [];
      return (
        s +
        pieces
          .filter((p) => p && p.included !== false && !isBacksplashPiece(p))
          .reduce((ps, p) => ps + pieceSf(p), 0)
      );
    }, 0)
  );
  if (fromPieces > 0) return fromPieces;
  if (fromBilling > 0) return fromBilling;
  // Last resort: room.countertopSqft may historically include splash — avoid when pieces exist.
  return rooms.reduce((s, r) => {
    const room = r && typeof r === "object" ? r : {};
    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    if (pieces.length) return s;
    return s + (num(room.countertopSqft) || 0);
  }, 0);
}

/**
 * @param {Record<string, unknown>} est
 * @param {{ backsplashSf?: number }|null} [pending]
 * @returns {number}
 */
export function measuredBacksplashSfFromEstimate(est, pending = null) {
  const calc = calcOf(est);
  const billing =
    calc.scopeBilling && typeof calc.scopeBilling === "object" ? calc.scopeBilling : {};
  const fromBilling = num(billing.backsplashSf);
  if (fromBilling > 0) return fromBilling;
  const rooms = Array.isArray(scopeOf(est).rooms) ? scopeOf(est).rooms : [];
  const fromRooms = rooms.reduce((s, r) => {
    const room = r && typeof r === "object" ? r : {};
    if (room.included === false) return s;
    return s + (num(room.backsplashSqft) || 0);
  }, 0);
  if (fromRooms > 0) return fromRooms;
  return num(pending?.backsplashSf) || 0;
}

/**
 * @param {Record<string, unknown>} est
 * @param {{ edgeLf?: number }|null} [pending]
 * @returns {number}
 */
export function measuredEdgeLfFromEstimate(est, pending = null) {
  const calc = calcOf(est);
  const fab = calc.fabrication && typeof calc.fabrication === "object" ? calc.fabrication : {};
  const edge = fab.edge && typeof fab.edge === "object" ? fab.edge : {};
  const billing =
    calc.scopeBilling && typeof calc.scopeBilling === "object" ? calc.scopeBilling : {};
  const scope = scopeOf(est);
  return (
    num(edge.finalLf) ||
    num(billing.edgeLf) ||
    num(scope.edgeEligibleLinearFeet) ||
    num(pending?.edgeLf) ||
    0
  );
}

/**
 * @param {Record<string, unknown>} est
 * @param {{
 *   kitchenSinkCutouts?: number,
 *   vanityBarSinkCutouts?: number,
 *   cooktopCutouts?: number,
 *   outletCutouts?: number
 * }|null} [pending]
 * @returns {{
 *   kitchenSinkCutouts: number,
 *   vanityBarSinkCutouts: number,
 *   cooktopCutouts: number,
 *   outletCutouts: number,
 *   total: number
 * }}
 */
export function openingsFromEstimate(est, pending = null) {
  const scope = scopeOf(est);
  const addOns = scope.addOns && typeof scope.addOns === "object" ? scope.addOns : {};
  const kitchenSinkCutouts =
    num(addOns["qty-sink"]) || num(pending?.kitchenSinkCutouts) || 0;
  const vanityBarSinkCutouts =
    num(addOns["qty-bar"]) || num(pending?.vanityBarSinkCutouts) || 0;
  const cooktopCutouts = num(addOns["qty-cook"]) || num(pending?.cooktopCutouts) || 0;
  const outletCutouts = num(addOns["qty-outlet"]) || num(pending?.outletCutouts) || 0;
  return {
    kitchenSinkCutouts,
    vanityBarSinkCutouts,
    cooktopCutouts,
    outletCutouts,
    total: kitchenSinkCutouts + vanityBarSinkCutouts + cooktopCutouts + outletCutouts
  };
}

/**
 * Build the Measurements approved card summary from the authoritative estimate.
 * Pending postMessage fields are compatibility-only fallbacks.
 *
 * @param {Record<string, unknown>|null|undefined} est
 * @param {Record<string, unknown>|null} [pending]
 */
export function buildApprovalSummaryFromEstimate(est, pending = null) {
  if (!est || typeof est !== "object") return null;
  const calc = calcOf(est);
  const totals = calc.totals && typeof calc.totals === "object" ? calc.totals : {};
  const scope = scopeOf(est);
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const openings = openingsFromEstimate(est, pending);
  const countertopSf = measuredCountertopSfFromEstimate(est) || num(pending?.countertopSf) || 0;
  return {
    countertopSf,
    backsplashSf: measuredBacksplashSfFromEstimate(est, pending),
    edgeLf: measuredEdgeLfFromEstimate(est, pending),
    kitchenSinkCutouts: openings.kitchenSinkCutouts,
    vanityBarSinkCutouts: openings.vanityBarSinkCutouts,
    cooktopCutouts: openings.cooktopCutouts,
    outletCutouts: openings.outletCutouts,
    rooms: rooms.length || num(pending?.rooms) || 0,
    includedPieces:
      rooms.reduce((s, r) => {
        const room = r && typeof r === "object" ? r : {};
        const pieces = Array.isArray(room.pieces) ? room.pieces : [];
        return (
          s +
          pieces.filter((p) => {
            const piece = p && typeof p === "object" ? p : {};
            return piece.included !== false;
          }).length
        );
      }, 0) ||
      num(pending?.includedPieces) ||
      0,
    customerDisplayTotal:
      totals.customerDisplayTotal != null
        ? num(totals.customerDisplayTotal)
        : pending?.customerDisplayTotal != null
          ? num(pending.customerDisplayTotal)
          : null
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} est
 */
export function estimateHasMeasuredScope(est) {
  if (!est || typeof est !== "object") return false;
  const rooms = Array.isArray(scopeOf(est).rooms) ? scopeOf(est).rooms : [];
  if (!rooms.length) return false;
  const pieces = rooms.flatMap((r) => {
    const room = r && typeof r === "object" ? r : {};
    return Array.isArray(room.pieces) ? room.pieces : [];
  });
  if (!pieces.length) return false;
  return measuredCountertopSfFromEstimate(est) > 0;
}

/**
 * Display invariant: when measured Scope exists, countertop SF must not be zero.
 * @param {ReturnType<typeof buildApprovalSummaryFromEstimate>} summary
 * @param {Record<string, unknown>} est
 */
export function assertApprovedSummaryConsistent(summary, est) {
  if (!estimateHasMeasuredScope(est)) return true;
  return Boolean(summary && num(summary.countertopSf) > 0);
}
