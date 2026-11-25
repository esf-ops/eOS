/**
 * Original eliteOS slab outline helpers for Live Inventory Measure.
 * Detects a rough outer contour from the slab photo and labels edge lengths
 * using cached length/width inches as scale. Not a copy of SlabCloud measure JS.
 */

export type Point = { x: number; y: number };

export type EdgeLabel = {
  mid: Point;
  lengthIn: number;
  angleDeg: number;
  outward: Point;
};

export type OutlineResult = {
  contour: Point[];
  edges: EdgeLabel[];
  areaSqIn: number;
  areaSqFt: number;
  inchesPerPixel: number;
  bboxPx: { x: number; y: number; w: number; h: number };
  mode: "contour" | "rectangle";
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function dist(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function polygonArea(pts: Point[]) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function areaSqFtFromContour(contour: Point[], inchesPerPixel: number) {
  const areaSqIn = polygonArea(contour) * inchesPerPixel * inchesPerPixel;
  return Math.round((areaSqIn / 144) * 10) / 10;
}

/** Closest point on segment AB to P, plus distance and t in [0,1]. */
export function closestPointOnSegment(a: Point, b: Point, p: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, dist: Math.hypot(p.x - point.x, p.y - point.y) };
}

/**
 * Find the nearest edge to insert a vertex. Returns edge index and insert point,
 * or null if nothing is within maxDist.
 */
export function nearestEdgeInsert(
  contour: Point[],
  p: Point,
  maxDist: number
): { edgeIndex: number; point: Point } | null {
  let best: { edgeIndex: number; point: Point; dist: number } | null = null;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const hit = closestPointOnSegment(a, b, p);
    // Skip near existing vertices so we don't stack points.
    if (hit.t < 0.05 || hit.t > 0.95) continue;
    if (hit.dist > maxDist) continue;
    if (!best || hit.dist < best.dist) {
      best = { edgeIndex: i, point: hit.point, dist: hit.dist };
    }
  }
  return best ? { edgeIndex: best.edgeIndex, point: best.point } : null;
}

export function nameMaterialKey(colorName: string | null | undefined, materialName: string | null | undefined) {
  return `${String(colorName || "").trim().toLowerCase()}||${String(materialName || "").trim().toLowerCase()}`;
}

function bboxOf(pts: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/** Ramer–Douglas–Peucker simplification. */
export function simplifyPolyline(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  const start = points[0];
  const last = points[end];
  const dx = last.x - start.x;
  const dy = last.y - start.y;
  const len2 = dx * dx + dy * dy || 1;
  for (let i = 1; i < end; i++) {
    const p = points[i];
    const t = clamp(((p.x - start.x) * dx + (p.y - start.y) * dy) / len2, 0, 1);
    const proj = { x: start.x + t * dx, y: start.y + t * dy };
    const d = dist(p, proj);
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPolyline(points.slice(0, index + 1), epsilon);
    const right = simplifyPolyline(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [start, last];
}

/**
 * Threshold stone vs background. SlabCloud / Slabsmith remnant photos are usually
 * stone on a near-white (or near-black) field — treat very light/dark pixels as empty.
 */
export function buildStoneMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  { lightCutoff = 245, darkCutoff = 12, alphaCutoff = 20 } = {}
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < alphaCutoff) {
      mask[p] = 0;
      continue;
    }
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const nearWhite = min > lightCutoff;
    const nearBlack = max < darkCutoff;
    mask[p] = nearWhite || nearBlack ? 0 : 1;
  }
  return mask;
}

function findSeed(mask: Uint8Array, width: number, height: number): number | null {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const maxR = Math.max(width, height);
  for (let r = 0; r < maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = y * width + x;
        if (mask[i]) return i;
      }
    }
  }
  for (let i = 0; i < mask.length; i++) if (mask[i]) return i;
  return null;
}

/** Moore-neighborhood outer contour starting from the topmost stone pixel of the blob. */
export function traceOuterContour(mask: Uint8Array, width: number, height: number): Point[] | null {
  const seed = findSeed(mask, width, height);
  if (seed == null) return null;

  // Flood-fill connected component from seed to isolate primary slab blob.
  const component = new Uint8Array(mask.length);
  const stack = [seed];
  component[seed] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    const nbrs = [
      i - 1,
      i + 1,
      i - width,
      i + width,
      i - width - 1,
      i - width + 1,
      i + width - 1,
      i + width + 1,
    ];
    for (const n of nbrs) {
      if (n < 0 || n >= mask.length || component[n] || !mask[n]) continue;
      const nx = n % width;
      const ny = (n / width) | 0;
      if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue;
      component[n] = 1;
      stack.push(n);
    }
  }

  // Topmost, then leftmost boundary pixel.
  let start = -1;
  for (let y = 0; y < height && start < 0; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!component[i]) continue;
      const up = y === 0 || !component[i - width];
      if (up) {
        start = i;
        break;
      }
    }
  }
  if (start < 0) return null;

  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ] as const;

  const startX = start % width;
  const startY = (start / width) | 0;
  const contour: Point[] = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;
  let dir = 0; // coming from left → first search upward-ish
  const maxSteps = width * height * 2;
  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    // Start search from dir-2 (Moore)
    for (let k = 0; k < 8; k++) {
      const nd = (dir + 6 + k) % 8;
      const [dx, dy] = dirs[nd];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!component[ny * width + nx]) continue;
      x = nx;
      y = ny;
      dir = nd;
      found = true;
      break;
    }
    if (!found) break;
    contour.push({ x, y });
    if (x === startX && y === startY && contour.length > 8) break;
  }

  if (contour.length < 8) return null;
  return contour;
}

function rectangleContour(widthPx: number, heightPx: number, pad = 2): Point[] {
  const x0 = pad;
  const y0 = pad;
  const x1 = Math.max(pad + 1, widthPx - pad);
  const y1 = Math.max(pad + 1, heightPx - pad);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

export function buildEdgeLabels(contour: Point[], inchesPerPixel: number, minEdgeIn = 1.5): EdgeLabel[] {
  const edges: EdgeLabel[] = [];
  const n = contour.length;
  if (n < 2) return edges;
  const cx = contour.reduce((s, p) => s + p.x, 0) / n;
  const cy = contour.reduce((s, p) => s + p.y, 0) / n;

  for (let i = 0; i < n; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    const lenPx = dist(a, b);
    const lengthIn = lenPx * inchesPerPixel;
    if (lengthIn < minEdgeIn) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const angleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    // Outward normal approx: away from centroid
    const nx = b.y - a.y;
    const ny = -(b.x - a.x);
    const nlen = Math.hypot(nx, ny) || 1;
    let ox = nx / nlen;
    let oy = ny / nlen;
    const toMidX = mid.x - cx;
    const toMidY = mid.y - cy;
    if (ox * toMidX + oy * toMidY < 0) {
      ox = -ox;
      oy = -oy;
    }
    edges.push({
      mid,
      lengthIn: Math.round(lengthIn * 10) / 10,
      angleDeg,
      outward: { x: ox, y: oy },
    });
  }
  return edges;
}

export type AnalyzeOptions = {
  lengthIn: number | null;
  widthIn: number | null;
};

/**
 * Analyze a loaded HTMLImageElement drawn to an offscreen canvas.
 * Prefers photo contour; falls back to a rectangle sized to the image.
 */
export function analyzeSlabImage(img: HTMLImageElement, opts: AnalyzeOptions): OutlineResult {
  const fullW = img.naturalWidth || img.width;
  const fullH = img.naturalHeight || img.height;
  // Downsample for contour detection speed; map points back to full resolution.
  const maxEdge = 720;
  const scale = Math.min(1, maxEdge / Math.max(fullW, fullH));
  const w = Math.max(1, Math.round(fullW * scale));
  const h = Math.max(1, Math.round(fullH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas unavailable");
  }
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const mask = buildStoneMask(data, w, h);
  let contour = traceOuterContour(mask, w, h);
  let mode: OutlineResult["mode"] = "contour";

  if (!contour || contour.length < 8) {
    contour = rectangleContour(fullW, fullH);
    mode = "rectangle";
  } else {
    const epsilon = Math.max(2, Math.min(w, h) * 0.008);
    contour = simplifyPolyline(contour, epsilon);
    if (contour.length >= 3 && dist(contour[0], contour[contour.length - 1]) < epsilon * 2) {
      contour = contour.slice(0, -1);
    }
    if (contour.length < 4) {
      contour = rectangleContour(fullW, fullH);
      mode = "rectangle";
    } else {
      const inv = scale > 0 ? 1 / scale : 1;
      contour = contour.map((p) => ({ x: p.x * inv, y: p.y * inv }));
    }
  }

  const bbox = bboxOf(contour);
  const lengthIn = opts.lengthIn != null && Number.isFinite(opts.lengthIn) ? opts.lengthIn : null;
  const widthIn = opts.widthIn != null && Number.isFinite(opts.widthIn) ? opts.widthIn : null;

  let inchesPerPixel: number;
  if (lengthIn != null && widthIn != null) {
    const longIn = Math.max(lengthIn, widthIn);
    const shortIn = Math.min(lengthIn, widthIn);
    const longPx = Math.max(bbox.w, bbox.h);
    const shortPx = Math.min(bbox.w, bbox.h);
    const ippLong = longIn / longPx;
    const ippShort = shortIn / shortPx;
    inchesPerPixel = (ippLong + ippShort) / 2;
  } else if (lengthIn != null) {
    inchesPerPixel = lengthIn / Math.max(bbox.w, bbox.h);
  } else if (widthIn != null) {
    inchesPerPixel = widthIn / Math.min(bbox.w, bbox.h);
  } else {
    // Fallback: assume ~30 px/in (observed SlabCloud measure ratio ballpark)
    inchesPerPixel = 1 / 30;
  }

  const areaSqIn = polygonArea(contour) * inchesPerPixel * inchesPerPixel;
  const areaSqFt = areaSqIn / 144;
  const edges = buildEdgeLabels(contour, inchesPerPixel);

  return {
    contour,
    edges,
    areaSqIn: Math.round(areaSqIn * 10) / 10,
    areaSqFt: Math.round(areaSqFt * 10) / 10,
    inchesPerPixel,
    bboxPx: bbox,
    mode,
  };
}
