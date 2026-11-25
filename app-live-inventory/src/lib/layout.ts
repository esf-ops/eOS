/**
 * Job layout on a real slab — pure geometry in inches (slab-photo coordinates × inches per pixel).
 * Pieces are axis-aligned rectangles (rotation in 90° steps). A piece is valid when it lies inside
 * the stone outline (inset by the edge trim) and keeps `spacingIn` clear of every other piece.
 */

export type Pt = { x: number; y: number };

export type LayoutPiece = {
  id: string;
  label: string;
  lengthIn: number;
  widthIn: number;
  /** Top-left corner, inches. */
  x: number;
  y: number;
  rotated: boolean;
};

export type Rect = { x: number; y: number; w: number; h: number };

export type PieceStatus = { inside: boolean; overlaps: string[]; ok: boolean };

const EPS = 1e-6;

/** Placed footprint: length runs along x unless rotated. */
export function pieceRect(p: LayoutPiece): Rect {
  return p.rotated
    ? { x: p.x, y: p.y, w: p.widthIn, h: p.lengthIn }
    : { x: p.x, y: p.y, w: p.lengthIn, h: p.widthIn };
}

export function polygonAreaIn2(poly: Pt[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function pointInPolygon(pt: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/**
 * Rectangle fully inside the polygon with at least `margin` inches to every polygon edge.
 * Checks corners inside, no polygon vertex inside the rect (notches), no edge crossings.
 */
export function rectInsidePolygon(r: Rect, poly: Pt[], margin = 0) {
  if (poly.length < 3 || r.w <= 0 || r.h <= 0) return false;
  const corners: Pt[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  const onOrInside = (c: Pt) =>
    pointInPolygon(c, poly) || poly.some((a, j) => distToSegment(c, a, poly[(j + 1) % poly.length]) < 1e-4);
  const mids: Pt[] = corners.map((c, i) => ({
    x: (c.x + corners[(i + 1) % 4].x) / 2,
    y: (c.y + corners[(i + 1) % 4].y) / 2,
  }));
  if (![...corners, ...mids].every(onOrInside)) return false;
  if (!pointInPolygon({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, poly)) return false;
  for (const v of poly) {
    if (v.x > r.x + EPS && v.x < r.x + r.w - EPS && v.y > r.y + EPS && v.y < r.y + r.h - EPS) return false;
  }
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    for (let j = 0; j < poly.length; j++) {
      if (segmentsCross(a, b, poly[j], poly[(j + 1) % poly.length])) return false;
    }
  }
  if (margin > 0) {
    for (let j = 0; j < poly.length; j++) {
      const a = poly[j];
      const b = poly[(j + 1) % poly.length];
      for (const c of corners) if (distToSegment(c, a, b) < margin - EPS) return false;
      // An edge running alongside the rect side but between corners.
      for (const v of [a, b]) {
        const inX = v.x >= r.x - margin && v.x <= r.x + r.w + margin;
        const inY = v.y >= r.y - margin && v.y <= r.y + r.h + margin;
        if (inX && inY) {
          const dx = Math.max(r.x - v.x, 0, v.x - (r.x + r.w));
          const dy = Math.max(r.y - v.y, 0, v.y - (r.y + r.h));
          if (Math.hypot(dx, dy) < margin - EPS) return false;
        }
      }
    }
  }
  return true;
}

/** True when the rectangles are closer than `gap` inches (or overlap). */
export function rectsConflict(a: Rect, b: Rect, gap = 0) {
  return (
    a.x < b.x + b.w + gap - EPS &&
    b.x < a.x + a.w + gap - EPS &&
    a.y < b.y + b.h + gap - EPS &&
    b.y < a.y + a.h + gap - EPS
  );
}

export function validateLayout(pieces: LayoutPiece[], poly: Pt[], { spacingIn = 0, edgeTrimIn = 0 } = {}) {
  const out = new Map<string, PieceStatus>();
  const rects = pieces.map((p) => [p, pieceRect(p)] as const);
  for (const [p, r] of rects) {
    const inside = rectInsidePolygon(r, poly, edgeTrimIn);
    const overlaps = rects.filter(([q, rq]) => q.id !== p.id && rectsConflict(r, rq, spacingIn)).map(([q]) => q.id);
    out.set(p.id, { inside, overlaps, ok: inside && overlaps.length === 0 });
  }
  return out;
}

export function polygonBounds(poly: Pt[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * First valid spot for a piece, scanning top-left → bottom-right in `stepIn` increments,
 * trying the current orientation first, then rotated. Null when it fits nowhere.
 */
export function autoPlace(
  piece: LayoutPiece,
  others: LayoutPiece[],
  poly: Pt[],
  { spacingIn = 0, edgeTrimIn = 0, stepIn = 0.5 } = {}
): LayoutPiece | null {
  const b = polygonBounds(poly);
  const otherRects = others.filter((o) => o.id !== piece.id).map(pieceRect);
  for (const rotated of [piece.rotated, !piece.rotated]) {
    const cand = { ...piece, rotated };
    const { w, h } = pieceRect(cand);
    for (let y = b.y; y + h <= b.y + b.h + EPS; y += stepIn) {
      for (let x = b.x; x + w <= b.x + b.w + EPS; x += stepIn) {
        const r = { x, y, w, h };
        if (otherRects.some((o) => rectsConflict(r, o, spacingIn))) continue;
        if (rectInsidePolygon(r, poly, edgeTrimIn)) return { ...cand, x, y };
      }
    }
  }
  return null;
}

/**
 * Largest clean rectangle left on the stone after the pieces are cut (the keepable offcut).
 * Rasterises at `cellIn`; a cell is free when it is fully on stone (inside the trim) and clear of
 * every piece plus spacing. Returns inches, or null when nothing at least 1 cell remains.
 */
export function largestOffcut(
  pieces: LayoutPiece[],
  poly: Pt[],
  { spacingIn = 0, edgeTrimIn = 0, cellIn = 1 } = {}
): Rect | null {
  if (poly.length < 3) return null;
  const b = polygonBounds(poly);
  const cols = Math.floor(b.w / cellIn);
  const rows = Math.floor(b.h / cellIn);
  if (cols < 1 || rows < 1) return null;
  const blocked = pieces.map(pieceRect).map((r) => ({
    x: r.x - spacingIn,
    y: r.y - spacingIn,
    w: r.w + spacingIn * 2,
    h: r.h + spacingIn * 2,
  }));
  const heights = new Array<number>(cols).fill(0);
  let best: Rect | null = null;
  let bestArea = 0;
  for (let row = 0; row < rows; row++) {
    const y = b.y + row * cellIn;
    for (let col = 0; col < cols; col++) {
      const cell = { x: b.x + col * cellIn, y, w: cellIn, h: cellIn };
      const free =
        rectInsidePolygon(cell, poly, edgeTrimIn) && !blocked.some((r) => rectsConflict(cell, r, 0));
      heights[col] = free ? heights[col] + 1 : 0;
    }
    const stack: number[] = [];
    for (let col = 0; col <= cols; col++) {
      const hgt = col === cols ? 0 : heights[col];
      while (stack.length && heights[stack[stack.length - 1]] >= hgt) {
        const top = stack.pop()!;
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = heights[top] * (col - left);
        if (area > bestArea) {
          bestArea = area;
          best = {
            x: b.x + left * cellIn,
            y: b.y + (row - heights[top] + 1) * cellIn,
            w: (col - left) * cellIn,
            h: heights[top] * cellIn,
          };
        }
      }
      stack.push(col);
    }
  }
  return best;
}

export function snap(v: number, stepIn = 0.25) {
  return Math.round(v / stepIn) * stepIn;
}

/** Used vs remaining stone, sq ft. */
export function layoutUsage(pieces: LayoutPiece[], stoneAreaIn2: number) {
  const used = pieces.reduce((n, p) => n + p.lengthIn * p.widthIn, 0);
  return {
    usedSqft: used / 144,
    stoneSqft: stoneAreaIn2 / 144,
    leftoverSqft: Math.max(0, stoneAreaIn2 - used) / 144,
    pct: stoneAreaIn2 > 0 ? (used / stoneAreaIn2) * 100 : 0,
  };
}
