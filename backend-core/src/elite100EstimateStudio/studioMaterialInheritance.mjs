/**
 * Studio material inheritance — estimate default → room override → piece override.
 *
 * Precedence (FEATURE_DECISIONS §185):
 *   piece.materialOverride === true + piece.materialGroup
 *   → room.materialGroupOverride (non-null string)
 *   → scope.materialGroup (estimate default)
 *
 * Override intent is explicit: matching the parent group still counts as an
 * override when the override flag/field is set. Clearing the override field
 * (null / materialOverride false) restores inheritance.
 */

import { MATERIAL_GROUPS } from "./studioEstimateTypes.mjs";
import { resolveStudioMaterialRatePerSf } from "./studioEstimateTrustedAccounts.mjs";
import { billableCountertopFromRoom } from "../quotes/billableSquareFeet.mjs";
import { chargeableBacksplashForPricing } from "./studioRoomBacksplash.mjs";
import { billableBacksplashFromRoom } from "../quotes/billableSquareFeet.mjs";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function str(v) {
  return v != null && String(v).trim() ? String(v).trim() : "";
}

/**
 * @param {string} group
 * @param {string} fallback
 */
export function coerceMaterialGroup(group, fallback = "Group Promo") {
  const g = str(group);
  if (MATERIAL_GROUPS.includes(g)) return g;
  const fb = str(fallback);
  return MATERIAL_GROUPS.includes(fb) ? fb : "Group Promo";
}

/**
 * Resolve effective material group for a room (before piece overrides).
 * @param {object} scope
 * @param {object} room
 */
export function resolveRoomMaterialGroup(scope, room) {
  const estimateDefault = coerceMaterialGroup(scope?.materialGroup, "Group Promo");
  const override = room?.materialGroupOverride;
  // Explicit override: non-null, non-undefined string (empty string → treat as clear)
  if (override === null || override === undefined) {
    return {
      group: estimateDefault,
      source: "estimate_default",
      estimateDefault,
      roomOverride: null
    };
  }
  const overrideStr = str(override);
  if (!overrideStr) {
    return {
      group: estimateDefault,
      source: "estimate_default",
      estimateDefault,
      roomOverride: null
    };
  }
  return {
    group: coerceMaterialGroup(overrideStr, estimateDefault),
    source: "room_override",
    estimateDefault,
    roomOverride: coerceMaterialGroup(overrideStr, estimateDefault)
  };
}

/**
 * Resolve effective material for a piece.
 * @param {object} scope
 * @param {object} room
 * @param {object} piece
 */
export function resolvePieceMaterialGroup(scope, room, piece) {
  const roomRes = resolveRoomMaterialGroup(scope, room);
  const overrideFlag = Boolean(piece?.materialOverride ?? piece?.material_override);
  if (!overrideFlag) {
    return {
      group: roomRes.group,
      source: roomRes.source === "room_override" ? "room_override" : "estimate_default",
      estimateDefault: roomRes.estimateDefault,
      roomOverride: roomRes.roomOverride,
      pieceOverride: null,
      materialOverride: false
    };
  }
  const pieceGroup = coerceMaterialGroup(
    piece?.materialGroup || piece?.group,
    roomRes.group
  );
  return {
    group: pieceGroup,
    source: "piece_override",
    estimateDefault: roomRes.estimateDefault,
    roomOverride: roomRes.roomOverride,
    pieceOverride: pieceGroup,
    materialOverride: true
  };
}

/**
 * Billable SF for one countertop-like piece.
 * @param {object} piece
 */
export function billablePieceSf(piece) {
  if (!piece || piece.included === false) return 0;
  return billableCountertopFromRoom({
    pieces: [{ ...piece, included: true }]
  }).billableSf;
}

/**
 * Price material by resolved inheritance across rooms/pieces.
 * @param {{
 *   scope: object,
 *   pricingBasis: string,
 *   partnerAccountId?: string|null,
 *   env?: object,
 *   projectAdjustmentBilledSf?: number,
 *   scopeBillingRooms?: Array<object>
 * }} params
 */
export function computeInheritedMaterialPricing(params) {
  const scope = params.scope || {};
  const pricingBasis = params.pricingBasis === "wholesale" ? "wholesale" : "direct";
  const env = params.env ?? process.env;
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const billingByRoomId = new Map(
    (Array.isArray(params.scopeBillingRooms) ? params.scopeBillingRooms : []).map((r) => [
      String(r.roomId),
      r
    ])
  );

  /** @type {Map<string, { group: string, countertopSf: number, backsplashSf: number, rate: number, rateSource: string }>} */
  const byGroup = new Map();
  /** @type {Array<object>} */
  const sections = [];
  /** @type {Array<object>} */
  const roomSummaries = [];

  function bump(group, countertopSf, backsplashSf, rateInfo) {
    const key = group;
    const cur = byGroup.get(key) || {
      group,
      countertopSf: 0,
      backsplashSf: 0,
      rate: rateInfo.rate,
      rateSource: rateInfo.rateSource
    };
    cur.countertopSf = round2(cur.countertopSf + countertopSf);
    cur.backsplashSf = round2(cur.backsplashSf + backsplashSf);
    byGroup.set(key, cur);
  }

  for (const [idx, room] of rooms.entries()) {
    if (!room || room.included === false) continue;
    const roomId = String(room.id ?? `room-${idx}`);
    const roomName = String(room.name || `Room ${idx + 1}`);
    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    const billingRow = billingByRoomId.get(roomId);

    // Prefer section-billed SF from scope billing when no piece-level material
    // overrides exist in the room (keeps existing single-material behavior).
    const hasPieceOverride = pieces.some(
      (p) => p && p.included !== false && Boolean(p.materialOverride ?? p.material_override)
    );
    const roomMat = resolveRoomMaterialGroup(scope, room);

    let roomCountertopSf = 0;
    let roomBacksplashSf = 0;

    if (!hasPieceOverride && billingRow) {
      const rateInfo = resolveStudioMaterialRatePerSf({
        materialGroup: roomMat.group,
        pricingBasis,
        partnerAccountId: params.partnerAccountId ?? scope.partnerAccountId,
        env
      });
      const ct = Number(billingRow.billedWithAdjustmentsSf) || 0;
      roomCountertopSf = ct;
      bump(roomMat.group, ct, 0, rateInfo);
      sections.push({
        sourceType: "room_countertop",
        roomId,
        roomName,
        materialGroup: roomMat.group,
        materialSource: roomMat.source,
        billedSf: ct,
        adjustmentSf: 0,
        rawSf: ct,
        ratePerSf: rateInfo.rate,
        amountCents: Math.round(ct * rateInfo.rate * 100),
        category: "countertop"
      });
    } else {
      for (const piece of pieces) {
        if (!piece || piece.included === false) continue;
        const type = String(piece.pieceType ?? "").toLowerCase();
        if (type.includes("backsplash")) continue;
        const mat = resolvePieceMaterialGroup(scope, room, piece);
        const sf = billablePieceSf(piece);
        if (sf <= 0) continue;
        const rateInfo = resolveStudioMaterialRatePerSf({
          materialGroup: mat.group,
          pricingBasis,
          partnerAccountId: params.partnerAccountId ?? scope.partnerAccountId,
          env
        });
        roomCountertopSf = round2(roomCountertopSf + sf);
        bump(mat.group, sf, 0, rateInfo);
        sections.push({
          sourceType: "piece_countertop",
          roomId,
          roomName,
          pieceId: piece.id || null,
          materialGroup: mat.group,
          materialSource: mat.source,
          billedSf: sf,
          adjustmentSf: 0,
          rawSf: sf,
          ratePerSf: rateInfo.rate,
          amountCents: Math.round(sf * rateInfo.rate * 100),
          category: "countertop"
        });
      }
      // Room-level SF adjustments still follow room material when piece overrides exist
      if (billingRow && Number(billingRow.adjustmentBilledSf) !== 0) {
        const rateInfo = resolveStudioMaterialRatePerSf({
          materialGroup: roomMat.group,
          pricingBasis,
          partnerAccountId: params.partnerAccountId ?? scope.partnerAccountId,
          env
        });
        const adj = Number(billingRow.adjustmentBilledSf) || 0;
        roomCountertopSf = round2(roomCountertopSf + adj);
        bump(roomMat.group, adj, 0, rateInfo);
        sections.push({
          sourceType: "scope_adjustment",
          roomId,
          roomName,
          materialGroup: roomMat.group,
          materialSource: roomMat.source,
          billedSf: 0,
          adjustmentSf: adj,
          ratePerSf: rateInfo.rate,
          amountCents: Math.round(adj * rateInfo.rate * 100),
          category: "countertop"
        });
      }
    }

    // Backsplash uses room material (piece override on BS piece when flagged).
    let backsplashRaw = Number(room.backsplashSqft);
    if (!Number.isFinite(backsplashRaw) || backsplashRaw < 0) {
      backsplashRaw = pieces
        .filter((p) => String(p.pieceType ?? "").toLowerCase().includes("backsplash"))
        .reduce((s, p) => s + (Number(p.sqft) || 0), 0);
    }
    const splashPolicy = chargeableBacksplashForPricing({
      ...room,
      backsplashSqft: backsplashRaw
    });
    const splashBilled = billableBacksplashFromRoom({
      includeBacksplash: splashPolicy.backsplashSqft > 0,
      backsplashSqft: splashPolicy.backsplashSqft,
      backsplashSections: room.backsplashSections
    });
    const splashSf = splashBilled.billableSf;
    if (splashSf > 0) {
      const bsPiece = pieces.find(
        (p) =>
          p &&
          p.included !== false &&
          String(p.pieceType ?? "")
            .toLowerCase()
            .includes("backsplash") &&
          Boolean(p.materialOverride ?? p.material_override)
      );
      const mat = bsPiece
        ? resolvePieceMaterialGroup(scope, room, bsPiece)
        : roomMat;
      const rateInfo = resolveStudioMaterialRatePerSf({
        materialGroup: mat.group,
        pricingBasis,
        partnerAccountId: params.partnerAccountId ?? scope.partnerAccountId,
        env
      });
      roomBacksplashSf = splashSf;
      bump(mat.group, 0, splashSf, rateInfo);
      sections.push({
        sourceType: "room_backsplash",
        roomId,
        roomName,
        materialGroup: mat.group,
        materialSource: mat.source,
        billedSf: splashSf,
        adjustmentSf: 0,
        rawSf: splashSf,
        ratePerSf: rateInfo.rate,
        amountCents: Math.round(splashSf * rateInfo.rate * 100),
        category: "backsplash"
      });
    }

    roomSummaries.push({
      roomId,
      roomName,
      materialGroup: roomMat.group,
      materialSource: roomMat.source,
      countertopSf: roomCountertopSf,
      backsplashSf: roomBacksplashSf
    });
  }

  // Project-level SF adjustment → estimate default material
  const projectAdj = Number(params.projectAdjustmentBilledSf) || 0;
  if (projectAdj !== 0) {
    const estimateDefault = coerceMaterialGroup(scope.materialGroup, "Group Promo");
    const rateInfo = resolveStudioMaterialRatePerSf({
      materialGroup: estimateDefault,
      pricingBasis,
      partnerAccountId: params.partnerAccountId ?? scope.partnerAccountId,
      env
    });
    bump(estimateDefault, projectAdj, 0, rateInfo);
    sections.push({
      sourceType: "scope_adjustment",
      roomId: null,
      roomName: null,
      materialGroup: estimateDefault,
      materialSource: "estimate_default",
      billedSf: 0,
      adjustmentSf: projectAdj,
      ratePerSf: rateInfo.rate,
      amountCents: Math.round(projectAdj * rateInfo.rate * 100),
      category: "countertop"
    });
  }

  let materialCountertopSubtotal = 0;
  let materialBacksplashSubtotal = 0;
  let chargeableCounter = 0;
  let chargeableSplash = 0;
  const materialByGroup = [];

  for (const row of byGroup.values()) {
    const ctAmt = round2(row.countertopSf * row.rate);
    const bsAmt = round2(row.backsplashSf * row.rate);
    materialCountertopSubtotal = round2(materialCountertopSubtotal + ctAmt);
    materialBacksplashSubtotal = round2(materialBacksplashSubtotal + bsAmt);
    chargeableCounter = round2(chargeableCounter + row.countertopSf);
    chargeableSplash = round2(chargeableSplash + row.backsplashSf);
    materialByGroup.push({
      group: row.group,
      ratePerSf: row.rate,
      rateSource: row.rateSource,
      countertopSf: row.countertopSf,
      backsplashSf: row.backsplashSf,
      countertopSubtotal: ctAmt,
      backsplashSubtotal: bsAmt,
      subtotal: round2(ctAmt + bsAmt)
    });
  }

  const materialSubtotal = round2(materialCountertopSubtotal + materialBacksplashSubtotal);
  const materialUseTax = round2(materialSubtotal * 0.02);
  const primaryGroup = coerceMaterialGroup(scope.materialGroup, "Group Promo");
  const primaryRate = resolveStudioMaterialRatePerSf({
    materialGroup: primaryGroup,
    pricingBasis,
    partnerAccountId: params.partnerAccountId ?? scope.partnerAccountId,
    env
  });

  return {
    chargeableCounter,
    chargeableSplash,
    materialSf: round2(chargeableCounter + chargeableSplash),
    materialCountertopSubtotal,
    materialBacksplashSubtotal,
    materialSubtotal,
    materialUseTax,
    materialByGroup,
    sections,
    roomSummaries,
    primaryRate
  };
}
