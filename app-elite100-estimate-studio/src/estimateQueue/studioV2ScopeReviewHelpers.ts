/**
 * Studio V2 scope review helpers — geometry/display only (no pricing math).
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

/** Premium (upgraded) edge profiles — display badge only. */
export const STUDIO_V2_PREMIUM_EDGE_TOKENS = new Set([
  "edge_small_ogee",
  "edge_crescent",
  "edge_knife"
]);

export function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/** Estimator-facing geometry SF from dimensions (not pricing). */
export function geometrySfFromDimensions(piece: {
  lengthIn?: number;
  depthIn?: number;
  quantity?: number;
}): number | null {
  const lengthIn = Number(piece.lengthIn) || 0;
  const depthIn = Number(piece.depthIn) || 0;
  const quantity = Math.max(1, Math.floor(Number(piece.quantity) || 1));
  if (!(lengthIn > 0 && depthIn > 0)) return null;
  return round2((lengthIn * depthIn * quantity) / 144);
}

/**
 * Countertop SF mode from existing fields only.
 * - excluded: piece not included in quote
 * - direct: approvedDirectSqft set
 * - dimensions: default
 * There is no separate "no countertop SF while included" mode yet.
 */
export function countertopSfMode(piece: {
  included?: boolean;
  approvedDirectSqft?: number | null;
}): "excluded" | "direct" | "dimensions" {
  if (piece.included === false) return "excluded";
  if (piece.approvedDirectSqft != null && Number(piece.approvedDirectSqft) > 0) return "direct";
  return "dimensions";
}

export function countertopSfModeLabel(mode: "excluded" | "direct" | "dimensions"): string {
  if (mode === "excluded") return "Excluded from quote";
  if (mode === "direct") return "Direct SF";
  return "Use dimensions";
}

export function displayCountertopSf(piece: {
  included?: boolean;
  lengthIn?: number;
  depthIn?: number;
  quantity?: number;
  approvedDirectSqft?: number | null;
}): { mode: "excluded" | "direct" | "dimensions"; geometrySf: number | null; countedSf: number | null } {
  const geometrySf = geometrySfFromDimensions(piece);
  const mode = countertopSfMode(piece);
  if (mode === "excluded") return { mode, geometrySf, countedSf: null };
  if (mode === "direct") {
    return {
      mode,
      geometrySf,
      countedSf: round2(Number(piece.approvedDirectSqft) || 0)
    };
  }
  return { mode, geometrySf, countedSf: geometrySf };
}

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
  if (ks) parts.push(ks === 1 ? "Sink ×1" : `Sink ×${ks}`);
  if (vs) parts.push(vs === 1 ? "Vanity sink ×1" : `Vanity sink ×${vs}`);
  if (ck) parts.push(ck === 1 ? "Cooktop ×1" : `Cooktop ×${ck}`);
  if (ot) parts.push(ot === 1 ? "Outlet ×1" : `Outlet ×${ot}`);
  if (pop) parts.push(pop === 1 ? "Pop-up ×1 (not priced)" : `Pop-up ×${pop} (not priced)`);
  if (piece.sideSplashLeft || piece.sideSplashRight) {
    const sides = [
      piece.sideSplashLeft ? "L" : null,
      piece.sideSplashRight ? "R" : null
    ].filter(Boolean);
    parts.push(`Side splash ${sides.join("/")} (not priced)`);
  }
  if (piece.cutoutNote) parts.push("Note (scope only)");
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

export function edgeProfileLabel(
  token: string | null | undefined,
  options: ReadonlyArray<{ value: string; label: string }>
): { label: string; upgraded: boolean } {
  if (!token) return { label: "Estimate default", upgraded: false };
  const found = options.find((o) => o.value === token);
  return {
    label: found?.label || token,
    upgraded: STUDIO_V2_PREMIUM_EDGE_TOKENS.has(token)
  };
}

export function backsplashNeedsRunLength(piece: {
  includeBacksplash?: boolean;
  backsplashEligibleLengthIn?: number | null;
}): boolean {
  return (
    piece.includeBacksplash === true &&
    !(Number(piece.backsplashEligibleLengthIn) > 0)
  );
}
