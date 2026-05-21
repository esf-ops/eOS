/**
 * Guided-shape room measurement — mirrors app-quote measurementEngine + guidedShapeGroups
 * for backend rooms-engine parity with Internal Estimate.
 */

export const STANDARD_COUNTER_DEPTH_IN = 25.5;
export const STANDARD_BACKSPLASH_HEIGHT_IN = 4;

const LAYOUT_GROUP_TYPES = new Set(["L-Shape", "U-Shape", "Galley", "Island", "Backsplash", "Waterfall"]);

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function sfFromGuidedPiece(lengthIn, depthIn, shape) {
  const l = Number(lengthIn) || 0;
  const d = Number(depthIn) || 0;
  if (l <= 0 || d <= 0) return 0;
  let sf = (l * d) / 144;
  if (String(shape || "rect").toLowerCase() === "tri") sf /= 2;
  return round2(sf);
}

export function guidedCornerOverlapSqft(depthAIn, depthBIn) {
  const a = Number(depthAIn) || 0;
  const b = Number(depthBIn) || 0;
  if (a <= 0 || b <= 0) return 0;
  const ft = Math.min(a, b) / 12;
  return round2(ft * ft);
}

export function guidedCornerOverlapCountForShapeType(shapeType) {
  if (shapeType === "L-Shape") return 1;
  if (shapeType === "U-Shape") return 2;
  return 0;
}

export function guidedCornerOverlapCountForMode(overlapMode, shapeType) {
  const mode = overlapMode ?? "auto";
  if (mode === "none") return 0;
  if (mode === "L-Shape") return 1;
  if (mode === "U-Shape") return 2;
  return guidedCornerOverlapCountForShapeType(shapeType);
}

/** Elite internal estimate: ceil final exact countertop SF (not per piece). */
export function chargeableCounterSqftFromExact(exactSf) {
  const ex = round2(exactSf);
  if (ex <= 0) return 0;
  const whole = Math.round(ex);
  if (Math.abs(ex - whole) < 0.005) return whole;
  return Math.ceil(ex);
}

export function guidedCornerOverlapDeductionSfForPieces(shapeType, pieces, overlapMode) {
  const count = guidedCornerOverlapCountForMode(overlapMode, shapeType);
  if (!count) return 0;
  const counters = (pieces || []).filter(
    (p) => pieceTypeOf(p) === "counter" && Number(p.lengthIn ?? p.l) > 0 && Number(p.depthIn ?? p.d) > 0
  );
  if (counters.length < 2) return 0;
  if (count === 1) {
    return guidedCornerOverlapSqft(counters[0].depthIn ?? counters[0].d, counters[1].depthIn ?? counters[1].d);
  }
  if (counters.length >= 3) {
    return round2(
      guidedCornerOverlapSqft(counters[0].depthIn ?? counters[0].d, counters[1].depthIn ?? counters[1].d) +
        guidedCornerOverlapSqft(counters[1].depthIn ?? counters[1].d, counters[2].depthIn ?? counters[2].d)
    );
  }
  const d = Math.min(...counters.map((p) => Number(p.depthIn ?? p.d) || 0));
  return round2(guidedCornerOverlapSqft(d, d) * count);
}

function pieceTypeOf(p) {
  const t = String(p.pieceType ?? p.type ?? "counter").toLowerCase();
  if (t === "splash") return "splash";
  if (t === "fhb") return "fhb";
  return "counter";
}

function normalizePiece(p) {
  const pieceType = pieceTypeOf(p);
  const shape = String(p.shape || "rect").toLowerCase() === "tri" ? "tri" : "rect";
  return {
    ...p,
    pieceType,
    type: pieceType,
    name: String(p.name || p.label || "Piece"),
    lengthIn: Number(p.lengthIn ?? p.l ?? 0) || 0,
    depthIn: Number(p.depthIn ?? p.d ?? 0) || 0,
    shape,
    addSplash: Boolean(p.addSplash ?? p.add_splash)
  };
}

function normalizeGroup(g) {
  const shapeType = String(g.shapeType ?? g.shape_type ?? "manual");
  return {
    id: String(g.id || ""),
    name: String(g.name || "Shape group"),
    shapeType,
    overlapMode: g.overlapMode ?? g.overlap_mode ?? "auto",
    backsplashMode: g.backsplashMode ?? g.backsplash_mode ?? "include",
    pieces: (Array.isArray(g.pieces) ? g.pieces : []).map(normalizePiece)
  };
}

/**
 * Migrate legacy flat pieces + guidedLayoutPreset into shape groups when groups absent.
 * @param {Record<string, unknown>} room
 */
export function normalizeGuidedShapeGroupsFromRoom(room) {
  const rawGroups = room.guidedShapeGroups ?? room.guided_shape_groups;
  if (Array.isArray(rawGroups) && rawGroups.length) {
    return rawGroups.map(normalizeGroup);
  }
  const pieces = (Array.isArray(room.pieces) ? room.pieces : []).map(normalizePiece);
  const legacyPreset = room.guidedLayoutPreset ?? room.guided_layout_preset ?? null;
  let shapeType = "manual";
  if (legacyPreset === "Rectangle") shapeType = "straight";
  else if (legacyPreset && LAYOUT_GROUP_TYPES.has(String(legacyPreset))) shapeType = String(legacyPreset);
  else if (pieces.length) shapeType = "manual";
  else shapeType = "straight";
  return [
    {
      id: "legacy-group",
      name: legacyPreset ? String(legacyPreset) : "Guided",
      shapeType,
      overlapMode: "auto",
      backsplashMode: "include",
      pieces
    }
  ];
}

function piecesForGroupWithBacksplashFilter(group) {
  if (group.backsplashMode === "exclude") {
    return group.pieces.filter((p) => pieceTypeOf(p) === "counter");
  }
  return group.pieces;
}

export function sumGuidedPiecesByType(pieces, options = {}) {
  let counter = 0;
  let splash = 0;
  let fhb = 0;
  for (const p of pieces) {
    const sf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
    if (sf <= 0) continue;
    const pt = pieceTypeOf(p);
    if (pt === "splash") {
      if (!options.skipSplashPieces) splash += sf;
    } else if (pt === "fhb") {
      if (!options.skipSplashPieces) fhb += sf;
    } else {
      counter += sf;
      if (p.addSplash && p.lengthIn > 0 && !options.skipAutoSplash) {
        splash += round2((p.lengthIn * STANDARD_BACKSPLASH_HEIGHT_IN) / 144);
      }
    }
  }
  const deduction = Number(options.cornerOverlapDeductionSf) || 0;
  if (deduction > 0) counter = Math.max(0, round2(counter - deduction));
  return { counter: round2(counter), splash: round2(splash), fhb: round2(fhb) };
}

export function sumGuidedShapeGroup(group) {
  const overlap = guidedCornerOverlapDeductionSfForPieces(group.shapeType, group.pieces, group.overlapMode);
  const excludeBs = group.backsplashMode === "exclude";
  const pieces = piecesForGroupWithBacksplashFilter(group);
  const summed = sumGuidedPiecesByType(pieces, {
    cornerOverlapDeductionSf: overlap,
    skipAutoSplash: excludeBs,
    skipSplashPieces: excludeBs
  });
  return { ...summed, overlapDeduction: overlap };
}

export function totalGuidedCornerOverlapDeductionSf(groups) {
  let sum = 0;
  for (const g of groups) {
    sum = round2(sum + guidedCornerOverlapDeductionSfForPieces(g.shapeType, g.pieces, g.overlapMode));
  }
  return sum;
}

/**
 * Build per-piece material rows for a guided room (before room-level chargeable ceil).
 * @returns {{ rows: Array<{ pieceLabel: string, sf: number, isSplash: boolean, isFhb: boolean }>, exactCounter: number, splash: number, fhb: number, groups: unknown[] }}
 */
export function enumerateGuidedRoomMaterialRows(room) {
  const groups = normalizeGuidedShapeGroupsFromRoom(room);
  /** @type {Array<{ pieceLabel: string, sf: number, isSplash: boolean, isFhb: boolean }>} */
  const rows = [];
  let exactCounter = 0;
  let splash = 0;
  let fhb = 0;

  for (const grp of groups) {
    const groupRows = [];
    const excludeBs = grp.backsplashMode === "exclude";
    for (const p of grp.pieces) {
      const sf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
      if (sf <= 0) continue;
      if (excludeBs && pieceTypeOf(p) !== "counter") continue;
      const baseLabel = p.name || (pieceTypeOf(p) === "splash" ? "Backsplash" : pieceTypeOf(p) === "fhb" ? "Full height" : "Countertop");
      const label = `${grp.name}: ${baseLabel}`;
      const pt = pieceTypeOf(p);
      if (pt === "splash") {
        groupRows.push({ pieceLabel: label, sf, isSplash: true, isFhb: false });
      } else if (pt === "fhb") {
        groupRows.push({ pieceLabel: label, sf, isSplash: false, isFhb: true });
      } else {
        groupRows.push({ pieceLabel: label, sf, isSplash: false, isFhb: false });
        if (p.addSplash && p.lengthIn > 0 && !excludeBs) {
          const spSf = round2((p.lengthIn * STANDARD_BACKSPLASH_HEIGHT_IN) / 144);
          if (spSf > 0) {
            groupRows.push({
              pieceLabel: `${label} — 4″ backsplash (on run)`,
              sf: spSf,
              isSplash: true,
              isFhb: false
            });
          }
        }
      }
    }
    const overlap = guidedCornerOverlapDeductionSfForPieces(grp.shapeType, grp.pieces, grp.overlapMode);
    if (overlap > 0) {
      let remaining = overlap;
      for (const row of groupRows) {
        if (!row.isSplash && !row.isFhb && row.sf > 0 && remaining > 0) {
          const take = Math.min(row.sf, remaining);
          row.sf = round2(row.sf - take);
          remaining = round2(remaining - take);
        }
      }
    }
    for (const row of groupRows) {
      rows.push(row);
      if (row.isSplash) splash = round2(splash + row.sf);
      else if (row.isFhb) fhb = round2(fhb + row.sf);
      else exactCounter = round2(exactCounter + row.sf);
    }
  }

  const fhbDirect = Number(room.fhbDirectSf ?? room.fhb_direct_sf) || 0;
  const fhbMode = String(room.fhbMode ?? room.fhb_mode ?? "Off");
  if (fhbMode === "Manual Sq Ft" && fhbDirect > 0) {
    fhb = round2(fhb + fhbDirect);
    rows.push({ pieceLabel: "Full height backsplash", sf: round2(fhbDirect), isSplash: false, isFhb: true });
  }

  return {
    rows,
    exactCounter,
    splash,
    fhb,
    groups,
    cornerOverlapDeductionSf: totalGuidedCornerOverlapDeductionSf(groups)
  };
}

/**
 * Apply Internal Estimate chargeable counter ceil at room level (add priced adjustment row).
 */
export function applyChargeableCounterCeilToGuidedRows(rows, exactCounter) {
  const priced = chargeableCounterSqftFromExact(exactCounter);
  const delta = round2(priced - exactCounter);
  if (delta <= 0) {
    return { rows, exactCounter, chargeableCounter: priced, counterRoundingAdjustment: 0 };
  }
  const next = [
    ...rows,
    {
      pieceLabel: "Countertop chargeable SF (round up)",
      sf: delta,
      isSplash: false,
      isFhb: false
    }
  ];
  return {
    rows: next,
    exactCounter,
    chargeableCounter: priced,
    counterRoundingAdjustment: delta
  };
}

export function isGuidedShapeRoom(room) {
  const calc = String(room.calcMode ?? room.calc_mode ?? "");
  if (calc === "Guided Shape") return true;
  if (Array.isArray(room.guidedShapeGroups) && room.guidedShapeGroups.length) return true;
  if (Array.isArray(room.guided_shape_groups) && room.guided_shape_groups.length) return true;
  if (Array.isArray(room.pieces) && room.pieces.length) {
    const preset = room.guidedLayoutPreset ?? room.guided_layout_preset;
    if (preset != null || room.cornerOverlapDeductionSf != null || room.corner_overlap_deduction_sf != null) {
      return true;
    }
  }
  return false;
}

export function shouldApplyChargeableCounterCeil(quoteSource) {
  return String(quoteSource || "") === "internal_quote";
}
