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

export function rapidLinearAreas(wallFt: number, splashIn: number, islandL: number, islandW: number) {
  const lines: string[] = [];
  let counter = 0;
  let splash = 0;
  if (wallFt > 0) {
    const wallSf = wallFt * LINEAR_COUNTER_DEPTH_FT;
    counter += wallSf;
    lines.push(`Wall perimeter (${wallFt} LF @ 25.5″ depth): ${round2(wallSf).toFixed(2)} sf`);
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

export function sumGuidedPiecesByType(pieces: GuidedPiece[]) {
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
    else counter += sf;
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
      sf += (Number(room.linear.wallFt) || 0) * LINEAR_COUNTER_DEPTH_FT;
      sf += (Number(room.linear.islandL) || 0) * (Number(room.linear.islandW) || 0);
    } else {
      for (const p of room.guidedPieces) {
        if (p.pieceType !== "counter") continue;
        sf += sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
      }
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
    const r = rapidLinearAreas(room.linear.wallFt, room.linear.splashIn, room.linear.islandL, room.linear.islandW);
    return { lines: r.lines };
  }
  const g = sumGuidedPiecesByType(room.guidedPieces);
  return { lines: g.lines };
}
