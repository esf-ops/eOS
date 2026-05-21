/**
 * Square-footage helpers aligned to ESF Quoting Tool v1.01.html:
 * - Guided pieces: sf = (L * D) / 144, triangle ÷ 2
 * - Rapid linear: wall LF × 2.125 ft depth; splash LF × (height in / 12); island L×W in feet
 * - Manual: direct sf entry
 */

import type { GuidedPiece, RoomCalcMode, RoomDraft } from "./quoteTypes";

export const STANDARD_COUNTER_DEPTH_IN = 25.5;
export const STANDARD_BACKSPLASH_HEIGHT_IN = 4;
/** 25.5 inches expressed in feet — used for wall-run countertop sf */
export const LINEAR_COUNTER_DEPTH_FT = STANDARD_COUNTER_DEPTH_IN / 12;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sfFromGuidedPiece(lengthIn: number, depthIn: number, shape: GuidedPiece["shape"]): number {
  if (lengthIn <= 0 || depthIn <= 0) return 0;
  let sf = (lengthIn * depthIn) / 144;
  if (shape === "tri") sf /= 2;
  return round2(sf);
}

/** True when depth looks unset or still at the standard countertop default (25.5″). */
export function isCountertopDefaultDepth(depthIn: number): boolean {
  const d = Number(depthIn) || 0;
  return d === 0 || d === STANDARD_COUNTER_DEPTH_IN;
}

/** True when depth can be auto-set to backsplash default (blank, 0, 4″, or countertop default). */
export function isBacksplashAutoDepth(depthIn: number): boolean {
  const d = Number(depthIn) || 0;
  return d === 0 || d === STANDARD_BACKSPLASH_HEIGHT_IN || d === STANDARD_COUNTER_DEPTH_IN;
}

/** True when switching away from backsplash and depth can default to countertop (blank, 0, or 4″). */
export function isCountertopAutoDepthFromSplash(depthIn: number): boolean {
  const d = Number(depthIn) || 0;
  return d === 0 || d === STANDARD_BACKSPLASH_HEIGHT_IN;
}

/** Depth patch when guided piece type changes — preserves intentional custom depths. */
export function depthPatchForGuidedPieceTypeChange(
  prevType: GuidedPiece["pieceType"],
  nextType: GuidedPiece["pieceType"],
  currentDepthIn: number
): { depthIn: number } | null {
  if (nextType === "splash" && prevType !== "splash") {
    if (isBacksplashAutoDepth(currentDepthIn)) return { depthIn: STANDARD_BACKSPLASH_HEIGHT_IN };
    return null;
  }
  if (prevType === "splash" && nextType === "counter") {
    if (isCountertopAutoDepthFromSplash(currentDepthIn)) return { depthIn: STANDARD_COUNTER_DEPTH_IN };
    return null;
  }
  return null;
}

export function rapidLinearAreas(
  wallFt: number,
  splashIn: number,
  islandL: number,
  islandW: number,
  counterDepthIn: number = STANDARD_COUNTER_DEPTH_IN
) {
  const depthFt = counterDepthIn > 0 && Number.isFinite(counterDepthIn) ? counterDepthIn / 12 : LINEAR_COUNTER_DEPTH_FT;
  const lines: string[] = [];
  let counter = 0;
  let splash = 0;
  if (wallFt > 0) {
    const wallSf = wallFt * depthFt;
    counter += wallSf;
    lines.push(`Wall perimeter (${wallFt} LF @ ${round2(counterDepthIn || STANDARD_COUNTER_DEPTH_IN)}″ depth): ${round2(wallSf).toFixed(2)} sf`);
    if (splashIn > 0) {
      const sp = wallFt * (splashIn / 12);
      splash += sp;
      lines.push(`Backsplash (${wallFt} LF @ ${splashIn}″ height): ${round2(sp).toFixed(2)} sf`);
    }
  }
  if (islandL > 0 && islandW > 0) {
    const isl = islandL * islandW;
    counter += isl;
    lines.push(`Island (${islandL} ft × ${islandW} ft): ${round2(isl).toFixed(2)} sf`);
  }
  return { counter: round2(counter), splash: round2(splash), lines };
}

/**
 * Square feet to subtract for one 90° counter corner where two rectangular runs overlap.
 * Uses min(depthA, depthB) when depths differ (standard 25.5″ → 2.125 ft × 2.125 ft = 4.515625 sf).
 */
export function guidedCornerOverlapSqft(depthAIn: number, depthBIn: number): number {
  const a = Number(depthAIn) || 0;
  const b = Number(depthBIn) || 0;
  if (a <= 0 || b <= 0) return 0;
  const overlapDepthIn = Math.min(a, b);
  const ft = overlapDepthIn / 12;
  return round2(ft * ft);
}

/** Corner overlap count for one shape group (L = 1, U = 2). */
export function guidedCornerOverlapCountForShapeType(shapeType: string | undefined | null): number {
  if (shapeType === "L-Shape") return 1;
  if (shapeType === "U-Shape") return 2;
  return 0;
}

/** Overlap deduction for pieces within a single shape group. */
export function guidedCornerOverlapDeductionSfForPieces(
  shapeType: string | undefined | null,
  pieces: GuidedPiece[]
): number {
  const count = guidedCornerOverlapCountForShapeType(shapeType);
  if (!count) return 0;
  const counters = pieces.filter((p) => p.pieceType === "counter" && p.lengthIn > 0 && p.depthIn > 0);
  if (counters.length < 2) return 0;
  if (count === 1) {
    return guidedCornerOverlapSqft(counters[0].depthIn, counters[1].depthIn);
  }
  if (counters.length >= 3) {
    return round2(
      guidedCornerOverlapSqft(counters[0].depthIn, counters[1].depthIn) +
        guidedCornerOverlapSqft(counters[1].depthIn, counters[2].depthIn)
    );
  }
  const d = Math.min(...counters.map((p) => p.depthIn));
  return round2(guidedCornerOverlapSqft(d, d) * count);
}

/** How many 90° corner overlaps to subtract for this room (legacy single-preset or sum of groups). */
export function guidedCornerOverlapCount(room: RoomDraft): number {
  if (room.calcMode !== "Guided Shape") return 0;
  const groups = room.guidedShapeGroups;
  if (groups?.length) {
    return groups.reduce((n, g) => n + guidedCornerOverlapCountForShapeType(g.shapeType), 0);
  }
  return guidedCornerOverlapCountForShapeType(room.guidedLayoutPreset);
}

/**
 * Total countertop sf to deduct for double-counted inside corners.
 * Sums per-group deductions when `guidedShapeGroups` exist; otherwise legacy room preset.
 */
export function guidedCornerOverlapDeductionSf(room: RoomDraft): number {
  if (room.calcMode !== "Guided Shape") return 0;
  const groups = room.guidedShapeGroups;
  if (groups?.length) {
    let sum = 0;
    for (const g of groups) {
      sum = round2(sum + guidedCornerOverlapDeductionSfForPieces(g.shapeType, g.pieces));
    }
    return sum;
  }
  return guidedCornerOverlapDeductionSfForPieces(room.guidedLayoutPreset, room.guidedPieces);
}

export function sumGuidedPiecesByType(
  pieces: GuidedPiece[],
  options?: { cornerOverlapDeductionSf?: number; cornerOverlapNote?: string }
) {
  let counter = 0;
  let splash = 0;
  let fhb = 0;
  const lines: string[] = [];
  for (const p of pieces) {
    const sf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
    if (sf <= 0) continue;
    const shapeLbl = p.shape === "tri" ? "Triangle" : "Rectangle";
    lines.push(`${p.name} (${shapeLbl}): ${p.lengthIn}" × ${p.depthIn}" = ${sf.toFixed(2)} sf`);
    if (p.pieceType === "splash") splash += sf;
    else if (p.pieceType === "fhb") fhb += sf;
    else {
      counter += sf;
      if (p.pieceType === "counter" && p.addSplash && p.lengthIn > 0) {
        const spSf = round2((p.lengthIn * STANDARD_BACKSPLASH_HEIGHT_IN) / 144);
        if (spSf > 0) {
          splash += spSf;
          lines.push(`4″ splash on ${p.name}: ${spSf.toFixed(2)} sf (length × 4″ / 144)`);
        }
      }
    }
  }
  const deduction = Number(options?.cornerOverlapDeductionSf) || 0;
  if (deduction > 0) {
    counter = Math.max(0, round2(counter - deduction));
    lines.push(
      options?.cornerOverlapNote ||
        `Corner overlap deduction: −${deduction.toFixed(2)} sf (inside 90° corners counted twice in rectangular runs)`
    );
  }
  return { counter: round2(counter), splash: round2(splash), fhb: round2(fhb), lines };
}

/** Qualifying countertop sf (excludes Vanity rooms) — drives vanity tier threshold. */
export function qualifyingSfFromRoomDrafts(rooms: RoomDraft[]): number {
  let sf = 0;
  for (const room of rooms) {
    if (room.roomType === "Vanity") continue;
    if (room.calcMode === "Manual Sq Ft") {
      sf += Number(room.direct.counter) || 0;
    } else if (room.calcMode === "Rapid Linear Foot") {
      const depthIn =
        room.linear.counterDepthIn != null && room.linear.counterDepthIn > 0
          ? room.linear.counterDepthIn
          : STANDARD_COUNTER_DEPTH_IN;
      sf += (Number(room.linear.wallFt) || 0) * (depthIn / 12);
      sf += (Number(room.linear.islandL) || 0) * (Number(room.linear.islandW) || 0);
    } else {
      for (const p of room.guidedPieces) {
        if (p.pieceType !== "counter") continue;
        sf += sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
      }
      sf = Math.max(0, round2(sf - guidedCornerOverlapDeductionSf(room)));
    }
  }
  return round2(sf);
}

export function measurementSummaryForRoom(room: RoomDraft, mode: RoomCalcMode): { lines: string[] } {
  if (room.roomType === "Vanity") return { lines: ["Vanity program room (fixed pricing path)."] };
  if (mode === "Manual Sq Ft") {
    const lines: string[] = [];
    if (room.direct.counter > 0) lines.push(`Manual countertop: ${room.direct.counter.toFixed(2)} sf`);
    if (room.direct.splash > 0) lines.push(`Manual backsplash: ${room.direct.splash.toFixed(2)} sf`);
    return { lines };
  }
  if (mode === "Rapid Linear Foot") {
    const r = rapidLinearAreas(
      room.linear.wallFt,
      room.linear.splashIn,
      room.linear.islandL,
      room.linear.islandW,
      room.linear.counterDepthIn
    );
    return { lines: r.lines };
  }
  const overlap = guidedCornerOverlapDeductionSf(room);
  const g = sumGuidedPiecesByType(room.guidedPieces, {
    cornerOverlapDeductionSf: overlap,
    cornerOverlapNote: overlap > 0 ? `Corner overlap deduction: −${overlap.toFixed(2)} sf` : undefined
  });
  return { lines: g.lines };
}
