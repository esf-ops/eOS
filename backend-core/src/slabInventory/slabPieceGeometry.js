/**
 * slabPieceGeometry — pure geometry derivation from a Slabsmith piece photo.
 *
 * Slabsmith photos are rectified top-down shots of the stone on a white field.
 * The stone's pixel bounding box matches Length$Actual × Width$Actual within ~1%,
 * so pixels-per-inch comes from the photo itself. From the stone mask we derive:
 *   - outline (full-image pixels) for Measure
 *   - stone area (sq ft)
 *   - fit frontier: every maximal axis-aligned rectangle that fits inside the stone,
 *     so L-shaped / notched remnants are matched by usable area, not bounding box.
 *
 * Pure functions only — no network, no Supabase.
 */

export const GEOMETRY_METHOD = "photo_mask_v1";

/** Pixels per grid cell. 1920×1080 photos → 480×270 grid (~0.1–0.3 in per cell). */
export const GEOMETRY_CELL_PX = 4;

/** A pixel is background when every channel is above this (white field). */
const WHITE_CUTOFF = 245;
/** Cell counts as stone for the outline/area when at least this fraction is stone. */
const OUTLINE_CELL_FRACTION = 0.5;
/** Cell counts as usable for inscribed rectangles only when (almost) fully stone. */
const USABLE_CELL_FRACTION = 0.98;
/** Stone area / bbox area at or above this is treated as a plain rectangle. */
const RECTANGULAR_FILL = 0.97;
const MAX_OUTLINE_POINTS = 48;
/** Inscribed rectangles narrower than this are edge slivers, not usable stone. */
const MIN_FIT_SHORT_IN = 3;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Fraction of stone pixels per GEOMETRY_CELL_PX × GEOMETRY_CELL_PX cell.
 * @param {{ data: Uint8Array|Uint8ClampedArray, width: number, height: number }} img RGBA
 */
export function buildStoneFractionGrid(img, cell = GEOMETRY_CELL_PX) {
  const { data, width, height } = img;
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const counts = new Float32Array(gw * gh);
  const totals = new Float32Array(gw * gh);
  for (let y = 0; y < height; y++) {
    const gy = (y / cell) | 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const g = gy * gw + ((x / cell) | 0);
      totals[g] += 1;
      const r = data[i];
      const gg = data[i + 1];
      const b = data[i + 2];
      if (!(r > WHITE_CUTOFF && gg > WHITE_CUTOFF && b > WHITE_CUTOFF)) counts[g] += 1;
    }
  }
  for (let g = 0; g < counts.length; g++) counts[g] = totals[g] ? counts[g] / totals[g] : 0;
  return { fraction: counts, gw, gh, cell };
}

/**
 * Largest 4-connected component of cells with fraction >= threshold.
 * @returns {Uint8Array|null} 1 = in component
 */
export function largestComponent(fraction, gw, gh, threshold = OUTLINE_CELL_FRACTION) {
  const seen = new Uint8Array(gw * gh);
  let best = null;
  let bestSize = 0;
  const stack = [];
  for (let s = 0; s < seen.length; s++) {
    if (seen[s] || fraction[s] < threshold) continue;
    const members = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      members.push(i);
      const x = i % gw;
      const y = (i / gw) | 0;
      const nbrs = [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1];
      for (const n of nbrs) {
        if (n < 0 || seen[n] || fraction[n] < threshold) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (members.length > bestSize) {
      bestSize = members.length;
      best = members;
    }
  }
  if (!best) return null;
  const comp = new Uint8Array(gw * gh);
  for (const i of best) comp[i] = 1;
  return comp;
}

/** Moore-neighbour trace of the component's outer boundary, in grid cells. */
export function traceComponentOutline(comp, gw, gh) {
  let start = -1;
  for (let i = 0; i < comp.length; i++) {
    if (comp[i]) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const at = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && comp[y * gw + x] === 1;
  const sx = start % gw;
  const sy = (start / gw) | 0;
  const pts = [[sx, sy]];
  let x = sx;
  let y = sy;
  let dir = 0;
  const maxSteps = gw * gh * 4;
  for (let step = 0; step < maxSteps; step++) {
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const nd = (dir + 6 + k) % 8;
      const nx = x + dirs[nd][0];
      const ny = y + dirs[nd][1];
      if (!at(nx, ny)) continue;
      x = nx;
      y = ny;
      dir = nd;
      moved = true;
      break;
    }
    if (!moved) break;
    if (x === sx && y === sy) break;
    pts.push([x, y]);
  }
  return pts;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker on an open polyline (iterative). */
export function simplifyPolyline(points, epsilon) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(points[i], points[a], points[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplify a closed loop: split at the point farthest from the start so RDP keeps both halves. */
export function simplifyClosedLoop(loop, epsilon, maxPoints = MAX_OUTLINE_POINTS) {
  if (loop.length < 4) return loop.slice();
  let far = 0;
  let farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  let eps = epsilon;
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = simplifyPolyline(loop.slice(0, far + 1), eps);
    const b = simplifyPolyline(loop.slice(far).concat([loop[0]]), eps);
    const out = a.slice(0, -1).concat(b.slice(0, -1));
    if (out.length <= maxPoints) return out;
    eps *= 1.5;
  }
  return loop.slice(0, maxPoints);
}

/**
 * For each rectangle height (cells), the widest axis-aligned rectangle of usable cells.
 * Histogram/stack maximal-rectangle sweep, O(gw × gh).
 * @returns {Int32Array} bestW[h] for h = 0..gh (bestW[h] = widest rectangle with height >= h)
 */
export function widestRectangleByHeight(usable, gw, gh) {
  const heights = new Int32Array(gw);
  const bestW = new Int32Array(gh + 1);
  const stack = new Int32Array(gw + 1);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) heights[x] = usable[y * gw + x] ? heights[x] + 1 : 0;
    let top = 0;
    for (let x = 0; x <= gw; x++) {
      const h = x < gw ? heights[x] : 0;
      while (top > 0 && heights[stack[top - 1]] >= h) {
        const bh = heights[stack[--top]];
        const left = top > 0 ? stack[top - 1] + 1 : 0;
        const w = x - left;
        if (bh > 0 && w > bestW[bh]) bestW[bh] = w;
      }
      stack[top++] = x;
    }
  }
  for (let h = gh - 1; h >= 0; h--) if (bestW[h + 1] > bestW[h]) bestW[h] = bestW[h + 1];
  return bestW;
}

/**
 * Pareto set of [short_in, long_in] rectangles from bestW (cells → inches).
 * Orientation-free: a job piece fits when short <= entry.short and long <= entry.long.
 */
export function buildFitFrontier(bestW, inchesPerCell) {
  const raw = [];
  for (let h = 1; h < bestW.length; h++) {
    const w = bestW[h];
    if (!w) continue;
    const a = h * inchesPerCell;
    const b = w * inchesPerCell;
    raw.push([Math.min(a, b), Math.max(a, b)]);
  }
  raw.sort((p, q) => q[0] - p[0] || q[1] - p[1]);
  const frontier = [];
  let bestLong = -1;
  for (const [s, l] of raw) {
    if (s < MIN_FIT_SHORT_IN) continue;
    if (l > bestLong + 1e-9) {
      frontier.push([round1(s), round1(l)]);
      bestLong = l;
    }
  }
  return frontier.reverse();
}

/** True when some frontier entry contains a job piece of the given size (either orientation). */
export function frontierFits(frontier, jobLengthIn, jobWidthIn) {
  if (!Array.isArray(frontier) || !frontier.length) return false;
  const js = Math.min(jobLengthIn, jobWidthIn);
  const jl = Math.max(jobLengthIn, jobWidthIn);
  return frontier.some(([s, l]) => js <= s + 1e-6 && jl <= l + 1e-6);
}

/**
 * Derive geometry for one decoded RGBA photo.
 * @param {{ data: Uint8Array|Uint8ClampedArray, width: number, height: number }} img
 * @param {{ lengthIn?: number|null, widthIn?: number|null }} dims
 */
export function deriveGeometryFromImage(img, dims = {}) {
  const base = { method: GEOMETRY_METHOD, image_width_px: img.width, image_height_px: img.height };
  const { fraction, gw, gh, cell } = buildStoneFractionGrid(img);
  const comp = largestComponent(fraction, gw, gh);
  if (!comp) return { ...base, status: "no_stone" };

  let minX = gw;
  let minY = gh;
  let maxX = -1;
  let maxY = -1;
  let stoneCells = 0;
  for (let i = 0; i < comp.length; i++) {
    if (!comp[i]) continue;
    const x = i % gw;
    const y = (i / gw) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stoneCells += fraction[i];
  }
  const bwPx = (maxX - minX + 1) * cell;
  const bhPx = (maxY - minY + 1) * cell;
  const fill = stoneCells / ((maxX - minX + 1) * (maxY - minY + 1));

  const loop = traceComponentOutline(comp, gw, gh);
  const outlineCells = simplifyClosedLoop(loop, 1.5);
  const outline_px = outlineCells.map(([x, y]) => [Math.round((x + 0.5) * cell), Math.round((y + 0.5) * cell)]);

  const L = Number(dims.lengthIn);
  const W = Number(dims.widthIn);
  if (!(L > 0) || !(W > 0)) {
    return { ...base, status: "no_dims", outline_px, fill_ratio: round1(fill * 100) / 100 };
  }
  const longIn = Math.max(L, W);
  const shortIn = Math.min(L, W);
  const ippLong = longIn / Math.max(bwPx, bhPx);
  const ippShort = shortIn / Math.min(bwPx, bhPx);
  const ipp = (ippLong + ippShort) / 2;
  const inchesPerCell = ipp * cell;

  const usable = new Uint8Array(gw * gh);
  for (let i = 0; i < usable.length; i++) usable[i] = comp[i] && fraction[i] >= USABLE_CELL_FRACTION ? 1 : 0;
  const frontier = buildFitFrontier(widestRectangleByHeight(usable, gw, gh), inchesPerCell);
  let maxRect = [0, 0];
  for (const [s, l] of frontier) if (s * l > maxRect[0] * maxRect[1]) maxRect = [s, l];

  const isRect = fill >= RECTANGULAR_FILL;
  return {
    ...base,
    status: "ok",
    px_per_in: Math.round((1 / ipp) * 1000) / 1000,
    scale_mismatch_pct: round1((Math.abs(ippLong - ippShort) / ippLong) * 100),
    outline_px,
    area_sqft: round1((stoneCells * inchesPerCell * inchesPerCell) / 144),
    bbox_long_in: round1(longIn),
    bbox_short_in: round1(shortIn),
    // A rectangular piece's usable rectangle is the piece itself; the grid loses a cell at edges.
    max_rect_long_in: isRect ? round1(longIn) : maxRect[1],
    max_rect_short_in: isRect ? round1(shortIn) : maxRect[0],
    fit_frontier_in: isRect ? [[round1(shortIn), round1(longIn)]] : frontier,
    fill_ratio: Math.round(fill * 1000) / 1000,
    is_rectangular: isRect,
  };
}

/**
 * Fit check for one inventory piece: geometry frontier when derived, else the L×W bounding box.
 * @param {{ fit_frontier_in?: number[][]|null, status?: string }|null|undefined} geometry
 * @param {{ length_actual_in?: number|null, width_actual_in?: number|null }} row
 */
export function pieceFitsJob(geometry, row, jobLengthIn, jobWidthIn) {
  if (geometry?.status === "ok" && Array.isArray(geometry.fit_frontier_in)) {
    return frontierFits(geometry.fit_frontier_in, jobLengthIn, jobWidthIn);
  }
  const L = Number(row?.length_actual_in);
  const W = Number(row?.width_actual_in);
  if (!(L > 0) || !(W > 0)) return false;
  return frontierFits([[Math.min(L, W), Math.max(L, W)]], jobLengthIn, jobWidthIn);
}

/** Usable sq ft for waste ranking: photo-derived area when available, else L×W. */
export function pieceAreaSqft(geometry, row) {
  if (geometry?.status === "ok" && Number(geometry.area_sqft) > 0) return Number(geometry.area_sqft);
  const L = Number(row?.length_actual_in);
  const W = Number(row?.width_actual_in);
  return L > 0 && W > 0 ? round1((L * W) / 144) : null;
}
