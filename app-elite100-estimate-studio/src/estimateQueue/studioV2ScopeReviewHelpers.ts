/**
 * Studio V2 Slice I.1 — pure helpers for scope review UX (geometry only).
 * Reuses takeoff exposed-edge geometry helpers; no pricing math.
 */
import {
  buildFinishedEdgeFromExposedSides,
  calculateExposedEdgeInches,
  defaultExposedSidesForTopology,
  formatExposedSidesSummary,
  normalizeExposedSides,
  PIECE_TOPOLOGIES,
  suggestPieceTopology
} from "../../../backend-core/src/takeoff/takeoffExposedEdges.mjs";

export {
  buildFinishedEdgeFromExposedSides,
  calculateExposedEdgeInches,
  defaultExposedSidesForTopology,
  formatExposedSidesSummary,
  normalizeExposedSides,
  PIECE_TOPOLOGIES,
  suggestPieceTopology
};

export type ExposedSides = {
  front: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
};

export function cutoutsSummary(piece: {
  kitchenSinkCutouts?: number | null;
  vanityBarSinkCutouts?: number | null;
  cooktopCutouts?: number | null;
  outletCutouts?: number | null;
  popupOutletCutouts?: number | null;
  cutoutNote?: string | null;
  sideSplashLeft?: boolean;
  sideSplashRight?: boolean;
}): string {
  const parts: string[] = [];
  const ks = Math.max(0, Math.floor(Number(piece.kitchenSinkCutouts) || 0));
  const vs = Math.max(0, Math.floor(Number(piece.vanityBarSinkCutouts) || 0));
  const ck = Math.max(0, Math.floor(Number(piece.cooktopCutouts) || 0));
  const ot = Math.max(0, Math.floor(Number(piece.outletCutouts) || 0));
  const pop = Math.max(0, Math.floor(Number(piece.popupOutletCutouts) || 0));
  if (ks) parts.push(`Sink×${ks}`);
  if (vs) parts.push(`Vanity×${vs}`);
  if (ck) parts.push(`Cook×${ck}`);
  if (ot) parts.push(`Outlet×${ot}`);
  if (pop) parts.push(`Pop-up×${pop}`);
  if (piece.sideSplashLeft || piece.sideSplashRight) {
    const sides = [
      piece.sideSplashLeft ? "L" : null,
      piece.sideSplashRight ? "R" : null
    ].filter(Boolean);
    parts.push(`Side splash ${sides.join("/")}`);
  }
  if (piece.cutoutNote) parts.push("Note");
  return parts.length ? parts.join(" · ") : "None";
}

export function exposedSummaryText(piece: {
  exposedSides?: ExposedSides | null;
  finishedEdgeLf?: number | null;
  exposedSidesSummary?: string | null;
}): string {
  if (piece.exposedSidesSummary) return piece.exposedSidesSummary;
  if (piece.exposedSides) {
    return formatExposedSidesSummary(piece.exposedSides, piece.finishedEdgeLf || 0);
  }
  if (piece.finishedEdgeLf != null && Number.isFinite(Number(piece.finishedEdgeLf))) {
    return `${Number(piece.finishedEdgeLf).toFixed(2)} LF`;
  }
  return "Set exposed sides";
}
