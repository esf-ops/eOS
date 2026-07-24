/**
 * Studio measured-vs-billed countertop scope + governed estimator adjustments.
 *
 * Authority model:
 *  - Approved Takeoff (or manual fallback pieces) defines MEASURED scope.
 *  - Every independently priced section rounds its raw SF up on its own
 *    (billableSquareFeet.mjs) — the aggregate measured total is never ceiled.
 *  - Estimator scope adjustments are dedicated governed pricing sections:
 *    each non-zero adjustment rounds independently (Math.ceil — conservative
 *    for negatives: -1.2 SF bills as -1 SF) and can reduce but never produce
 *    negative billed scope for its room / the project.
 *
 * Pure module — shared by backend pricing (authoritative) and the Pricing
 * Setup panel (display only). Never exposed publicly: measured SF, billed SF,
 * section detail and adjustment records are internal estimator data.
 */

import {
  billableCountertopFromRoom,
  ceilBillableSquareFeet
} from "../quotes/billableSquareFeet.mjs";
import { EDGE_SCOPE_SOURCES } from "./studioEstimateTypes.mjs";

/**
 * Sum room open-edge LF for manual/legacy scopes (browser-safe; no node:crypto).
 * Prefer confirmed room quantity; never double-count piece + room totals.
 * @param {object|null|undefined} scope
 */
function sumRoomPieceEdgeLf(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  let total = 0;
  for (const room of rooms) {
    if (!room || room.included === false) continue;
    const confirmed = Number(room.confirmedOpenEdgeLf);
    if (
      Number.isFinite(confirmed) &&
      confirmed >= 0 &&
      (room.openEdgeQuantityAuthoritative === true || room.confirmedOpenEdgeLf != null)
    ) {
      total += confirmed;
      continue;
    }
    const mode = String(room.openEdgeMeasurementMode || "").toLowerCase();
    if (mode === "room_total") {
      const roomLf =
        Number(room.openEdgeLf) ||
        Number(room.approvedFinishedEdgeLf) ||
        Number(room.edgeEligibleLinearFeet) ||
        0;
      total += Number.isFinite(roomLf) && roomLf >= 0 ? roomLf : 0;
      continue;
    }
    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    let roomLf = 0;
    let fromPieces = false;
    for (const p of pieces) {
      if (!p || p.included === false) continue;
      const pt = String(p.pieceType ?? p.type ?? "counter").toLowerCase();
      if (pt.includes("backsplash") || pt === "shower" || pt === "fireplace") continue;
      const totalIn = Number(p?.finishedEdge?.totalFinishedEdgeLengthIn);
      if (Number.isFinite(totalIn) && totalIn >= 0) {
        roomLf += totalIn / 12;
        fromPieces = true;
      }
    }
    if (!fromPieces) {
      roomLf = Number(room.approvedFinishedEdgeLf) || Number(room.edgeEligibleLinearFeet) || 0;
    }
    total += roomLf;
  }
  return round2(total);
}

export const STUDIO_SCOPE_BILLING_VERSION = "studio_scope_billing_v1";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Billed SF for one governed adjustment section. Positive adjustments ceil up
 * (+1.2 → +2); negative adjustments also ceil (-1.2 → -1) so a credit never
 * removes more than the estimator measured. Zero stays zero.
 * @param {unknown} adjustmentSf
 */
export function billedAdjustmentSf(adjustmentSf) {
  const n = Number(adjustmentSf);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.ceil(n);
}

/**
 * Normalize the estimator countertop scope adjustment list from scope JSON.
 * @param {object|null|undefined} scope
 * @returns {Array<{
 *   id: string,
 *   adjustmentScope: "room"|"project",
 *   roomId: string|null,
 *   adjustmentSf: number,
 *   adjustmentReason: string,
 *   adjustedBy: string|null,
 *   adjustedAt: string|null
 * }>}
 */
export function normalizeCountertopScopeAdjustments(scope) {
  const raw = Array.isArray(scope?.countertopScopeAdjustments)
    ? scope.countertopScopeAdjustments
    : [];
  const out = [];
  for (const [i, row] of raw.entries()) {
    if (!row || typeof row !== "object") continue;
    const adjustmentSf = round2(Number(row.adjustmentSf) || 0);
    const roomId = row.roomId != null && String(row.roomId).trim() ? String(row.roomId) : null;
    out.push({
      id: String(row.id || `ctsa-${i}`),
      adjustmentScope: row.adjustmentScope === "project" || !roomId ? "project" : "room",
      roomId,
      adjustmentSf,
      adjustmentReason: String(row.adjustmentReason ?? row.reason ?? "").trim(),
      adjustedBy: row.adjustedBy != null ? String(row.adjustedBy) : null,
      adjustedAt: row.adjustedAt != null ? String(row.adjustedAt) : null
    });
  }
  return out;
}

/**
 * Normalize estimator finished-edge absolute override (Pricing Setup).
 * Blank / null finalLf → inactive (use Takeoff approved total ± legacy adjustment).
 * Explicit 0 is a valid override and requires a reason.
 *
 * @param {object|null|undefined} scope
 */
export function normalizeFinishedEdgeOverride(scope) {
  const raw =
    scope?.finishedEdgeOverride && typeof scope.finishedEdgeOverride === "object"
      ? scope.finishedEdgeOverride
      : null;
  if (!raw) {
    return {
      active: false,
      finalLf: null,
      reason: "",
      overriddenBy: null,
      overriddenAt: null
    };
  }
  const hasKey =
    Object.prototype.hasOwnProperty.call(raw, "finalLf") ||
    Object.prototype.hasOwnProperty.call(raw, "final_lf");
  const rawLf = raw.finalLf ?? raw.final_lf;
  const blank =
    !hasKey ||
    rawLf == null ||
    rawLf === "" ||
    (typeof rawLf === "string" && !String(rawLf).trim());
  if (blank) {
    return {
      active: false,
      finalLf: null,
      reason: String(raw.reason ?? raw.overrideReason ?? "").trim(),
      overriddenBy: raw.overriddenBy != null ? String(raw.overriddenBy) : null,
      overriddenAt: raw.overriddenAt != null ? String(raw.overriddenAt) : null
    };
  }
  const finalLf = round2(Number(rawLf));
  return {
    active: true,
    finalLf: Number.isFinite(finalLf) ? finalLf : null,
    reason: String(raw.reason ?? raw.overrideReason ?? "").trim(),
    overriddenBy: raw.overriddenBy != null ? String(raw.overriddenBy) : null,
    overriddenAt: raw.overriddenAt != null ? String(raw.overriddenAt) : null
  };
}

/**
 * Collect adjustment validation problems (reason required when non-zero).
 * @param {object|null|undefined} scope
 */
export function collectScopeAdjustmentIssues(scope) {
  const issues = [];
  for (const adj of normalizeCountertopScopeAdjustments(scope)) {
    if (adj.adjustmentSf !== 0 && !adj.adjustmentReason) {
      issues.push({
        code: "adjustment_reason_required",
        message: `Countertop scope adjustment (${adj.adjustmentSf > 0 ? "+" : ""}${adj.adjustmentSf} SF) requires a reason.`
      });
    }
  }
  const edgeAdj = normalizeEdgeScopeAdjustment(scope);
  if (edgeAdj.adjustmentLf !== 0 && !edgeAdj.adjustmentReason) {
    issues.push({
      code: "adjustment_reason_required",
      message: `Edge scope adjustment (${edgeAdj.adjustmentLf > 0 ? "+" : ""}${edgeAdj.adjustmentLf} LF) requires a reason.`
    });
  }
  const override = normalizeFinishedEdgeOverride(scope);
  if (override.active) {
    if (override.finalLf == null || !Number.isFinite(override.finalLf)) {
      issues.push({
        code: "finished_edge_override_invalid",
        message: "Finished-edge override must be a finite number (LF)."
      });
    } else if (override.finalLf < 0) {
      issues.push({
        code: "finished_edge_override_negative",
        message: "Finished-edge override cannot be negative."
      });
    }
    if (!override.reason) {
      issues.push({
        code: "finished_edge_override_reason_required",
        message: "Finished-edge override requires a reason."
      });
    }
  }
  return issues;
}

/**
 * Measured vs billed countertop scope for a Studio estimate scope.
 * Each included piece is one independent pricing section; each non-zero
 * estimator adjustment is one more governed section. Internal only.
 *
 * @param {object|null|undefined} scope studio estimate scope JSON
 */
export function buildStudioScopeBilling(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  const adjustments = normalizeCountertopScopeAdjustments(scope);

  const roomRows = [];
  let measuredCountertopSf = 0;
  let billedBeforeAdjustmentsSf = 0;
  let independentSectionCount = 0;

  for (const room of rooms) {
    if (!room || room.included === false) continue;
    const pieces = Array.isArray(room.pieces)
      ? room.pieces.filter(
          (p) =>
            p &&
            p.included !== false &&
            !String(p.pieceType ?? "").toLowerCase().includes("backsplash")
        )
      : [];
    const billed = billableCountertopFromRoom({
      countertopSqft: room.countertopSqft,
      pieces
    });
    const roomAdjs = adjustments.filter(
      (a) => a.adjustmentScope === "room" && a.roomId === String(room.id)
    );
    const roomAdjBilledRaw = roomAdjs.reduce(
      (s, a) => s + billedAdjustmentSf(a.adjustmentSf),
      0
    );
    // Negative adjustment may reduce but never create negative billed scope.
    const billedWithAdjustments = Math.max(0, billed.billableSf + roomAdjBilledRaw);
    const roomAdjBilled = billedWithAdjustments - billed.billableSf;

    measuredCountertopSf = round2(measuredCountertopSf + billed.rawSf);
    billedBeforeAdjustmentsSf += billed.billableSf;
    independentSectionCount += billed.sections.length + roomAdjs.filter((a) => a.adjustmentSf !== 0).length;

    roomRows.push({
      roomId: String(room.id ?? ""),
      roomName: String(room.name ?? ""),
      measuredSf: round2(billed.rawSf),
      billedSf: billed.billableSf,
      adjustmentBilledSf: roomAdjBilled,
      billedWithAdjustmentsSf: billedWithAdjustments,
      sections: billed.sections,
      adjustments: roomAdjs
    });
  }

  const projectAdjs = adjustments.filter((a) => a.adjustmentScope === "project");
  const roomBilledTotal = roomRows.reduce((s, r) => s + r.billedWithAdjustmentsSf, 0);
  const projectAdjBilledRaw = projectAdjs.reduce(
    (s, a) => s + billedAdjustmentSf(a.adjustmentSf),
    0
  );
  const billedCountertopSf = Math.max(0, roomBilledTotal + projectAdjBilledRaw);
  const projectAdjustmentBilledSf = billedCountertopSf - roomBilledTotal;
  independentSectionCount += projectAdjs.filter((a) => a.adjustmentSf !== 0).length;

  const measuredAdjustmentSf = round2(
    adjustments.reduce((s, a) => s + a.adjustmentSf, 0)
  );

  return {
    version: STUDIO_SCOPE_BILLING_VERSION,
    pricingScopeSource:
      scope?.physicalScopeSource === "takeoff" ? "takeoff" : "manual",
    measuredCountertopSf,
    adjustedMeasuredCountertopSf: round2(measuredCountertopSf + measuredAdjustmentSf),
    billedBeforeAdjustmentsSf,
    billedCountertopSf,
    independentSectionCount,
    projectAdjustmentBilledSf,
    rooms: roomRows,
    adjustments
  };
}

/**
 * Normalize the (single, project-level) estimator edge scope adjustment.
 * @param {object|null|undefined} scope
 */
export function normalizeEdgeScopeAdjustment(scope) {
  const raw =
    scope?.edgeScopeAdjustment && typeof scope.edgeScopeAdjustment === "object"
      ? scope.edgeScopeAdjustment
      : {};
  return {
    adjustmentLf: round2(Number(raw.adjustmentLf) || 0),
    adjustmentReason: String(raw.adjustmentReason ?? raw.reason ?? "").trim(),
    adjustedBy: raw.adjustedBy != null ? String(raw.adjustedBy) : null,
    adjustedAt: raw.adjustedAt != null ? String(raw.adjustedAt) : null
  };
}

/**
 * Resolve the priced finished-edge LF for a scope.
 * Precedence:
 *  1. Explicit Pricing Setup finishedEdgeOverride.finalLf (absolute, ≥0)
 *  2. Takeoff approved finished-edge total + legacy ± edgeScopeAdjustment
 *  3. Manual edgeLinearFeet
 *
 * Approved estimate publication must not re-gate on per-piece draft flags —
 * the calculation snapshot finalLf is publication authority.
 *
 * @param {object|null|undefined} scope
 * @returns {{
 *   derivedLf: number,
 *   takeoffApprovedLf: number,
 *   adjustmentLf: number,
 *   overrideLf: number|null,
 *   overrideActive: boolean,
 *   finalLf: number,
 *   source: string,
 *   confirmationRequired?: boolean
 * }}
 */
export function resolveScopeEdgeLinearFeet(scope) {
  const adjustment = normalizeEdgeScopeAdjustment(scope);
  const override = normalizeFinishedEdgeOverride(scope);

  if (scope?.physicalScopeSource === "takeoff") {
    const summary = scope?.takeoffScopeSummary || {};
    const edgeSource = String(
      summary.edgeScopeSource || scope?.edgeScopeSource || EDGE_SCOPE_SOURCES.FINISHED_EDGE
    );
    const confirmationRequired =
      !override.active &&
      (summary.edgeGeometryConfirmationRequired === true ||
        edgeSource === EDGE_SCOPE_SOURCES.CONFIRMATION_REQUIRED ||
        edgeSource === "finished_edge_geometry_required");

    // Prefer finished-edge / stored eligible LF. Do not recompute subtraction.
    let derivedLf = round2(
      Number(
        summary.approvedFinishedEdgeLf ??
          summary.derivedOpenEdgeLf ??
          summary.edgeEligibleLinearFeet ??
          scope?.edgeEligibleLinearFeet ??
          0
      ) || 0
    );

    // New drafts that still need confirmation must not price a guessed edge LF
    // unless the estimator set an explicit Pricing Setup override.
    if (confirmationRequired && edgeSource !== EDGE_SCOPE_SOURCES.DERIVED) {
      if (
        edgeSource === EDGE_SCOPE_SOURCES.CONFIRMATION_REQUIRED ||
        edgeSource === "finished_edge_geometry_required"
      ) {
        derivedLf = round2(Number(summary.approvedFinishedEdgeLf) || 0);
      }
    }

    const takeoffApprovedLf = derivedLf;

    if (override.active && override.finalLf != null) {
      const finalLf = Math.max(0, round2(override.finalLf));
      return {
        derivedLf: takeoffApprovedLf,
        takeoffApprovedLf,
        adjustmentLf: 0,
        overrideLf: finalLf,
        overrideActive: true,
        finalLf,
        confirmationRequired: false,
        source: EDGE_SCOPE_SOURCES.OVERRIDE
      };
    }

    const finalLf = Math.max(0, round2(derivedLf + adjustment.adjustmentLf));
    return {
      derivedLf,
      takeoffApprovedLf,
      adjustmentLf: adjustment.adjustmentLf,
      overrideLf: null,
      overrideActive: false,
      finalLf,
      confirmationRequired,
      source:
        adjustment.adjustmentLf !== 0
          ? EDGE_SCOPE_SOURCES.ADJUSTED
          : edgeSource === EDGE_SCOPE_SOURCES.DERIVED
            ? EDGE_SCOPE_SOURCES.DERIVED
            : confirmationRequired
              ? EDGE_SCOPE_SOURCES.CONFIRMATION_REQUIRED
              : EDGE_SCOPE_SOURCES.FINISHED_EDGE
    };
  }
  // Manual / legacy path — prefer confirmed room/piece finished-edge geometry.
  const roomSumLf = Math.max(0, round2(sumRoomPieceEdgeLf(scope)));
  const manualLf = Math.max(0, round2(Number(scope?.edgeLinearFeet) || 0));
  const eligibleLf = Math.max(0, round2(Number(scope?.edgeEligibleLinearFeet) || 0));
  // Confirmed manual rooms win over a blank/stale Pricing Setup Edge LF (manual).
  const derivedLf =
    roomSumLf > 0
      ? roomSumLf
      : manualLf > 0
        ? manualLf
        : eligibleLf;

  if (override.active && override.finalLf != null) {
    const finalLf = Math.max(0, round2(override.finalLf));
    return {
      derivedLf,
      takeoffApprovedLf: derivedLf,
      adjustmentLf: 0,
      overrideLf: finalLf,
      overrideActive: true,
      finalLf,
      source: EDGE_SCOPE_SOURCES.OVERRIDE
    };
  }

  const finalLf = Math.max(0, round2(derivedLf + adjustment.adjustmentLf));
  return {
    derivedLf,
    takeoffApprovedLf: derivedLf,
    adjustmentLf: adjustment.adjustmentLf,
    overrideLf: null,
    overrideActive: false,
    finalLf,
    source: EDGE_SCOPE_SOURCES.MANUAL
  };
}

export { ceilBillableSquareFeet };
