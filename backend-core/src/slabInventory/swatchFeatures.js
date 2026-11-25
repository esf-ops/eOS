/**
 * Swatch appearance features — color + texture fingerprint of a stone from its derived swatch.
 *
 * Color is computed in CIELAB (D65) on a ~64 px area-averaged copy of the swatch:
 *   lab       mean color
 *   l_std     lightness spread (cloudy / two-tone vs. even)
 *   palette   3 dominant colors [L, a, b, weight] (k-means), heaviest first
 * Texture is computed at swatch resolution (thin veins vanish when downsampled), high-passed so a
 * lighting gradient across the photo does not read as pattern:
 *   detail    std of fine lightness detail (veins / grain energy)
 *   contrast  p99.9 − p0.1 of fine detail (vein strength; veins are sparse)
 *   edge      share of pixels whose detail exceeds a visible step (vein / grain coverage)
 *
 * Distances are perceptual-ish (ΔE76 based) and only meaningful relative to each other.
 */

export const SWATCH_FEATURES_VERSION = 2;
const SAMPLE = 64;
const TEXTURE_SAMPLE = 1024;
const BLUR_RADIUS = 12;
const EDGE_THRESHOLD = 3;

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

const LIN = Array.from({ length: 256 }, (_, i) => srgbToLinear(i));

function f(t) {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}

/** sRGB 0–255 → CIELAB (D65). */
export function rgbToLab(r, g, b) {
  const R = LIN[r];
  const G = LIN[g];
  const B = LIN[b];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** "#aabbcc" → Lab, or null. */
export function hexToLab(hex) {
  const m = String(hex ?? "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

export function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Lightness of an area-averaged copy, then fine detail = L − box blur (integral image). */
function textureStats(img) {
  const { w, h, lab } = downsample(img, TEXTURE_SAMPLE);
  const L = lab.map((p) => p[0]);
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += L[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const detail = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - BLUR_RADIUS);
    const y1 = Math.min(h, y + BLUR_RADIUS + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - BLUR_RADIUS);
      const x1 = Math.min(w, x + BLUR_RADIUS + 1);
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      detail[y * w + x] = L[y * w + x] - sum / ((y1 - y0) * (x1 - x0));
    }
  }
  const n = detail.length;
  let sq = 0;
  let edges = 0;
  for (const d of detail) {
    sq += d * d;
    if (Math.abs(d) > EDGE_THRESHOLD) edges += 1;
  }
  const sorted = Float64Array.from(detail).sort();
  const q = (t) => sorted[Math.min(n - 1, Math.floor(t * n))];
  return { detail: Math.sqrt(sq / n), contrast: q(0.999) - q(0.001), edge: edges / n };
}

/** Area-average an RGBA image down so its long side is `size`. */
function downsample(img, size) {
  const { width: W, height: H, data } = img;
  const s = Math.min(1, size / Math.max(W, H));
  const w = Math.max(1, Math.round(W * s));
  const h = Math.max(1, Math.round(H * s));
  const out = new Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * H) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * H) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * W) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * W) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * W + xx) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n += 1;
        }
      }
      out[y * w + x] = rgbToLab(Math.round(r / n), Math.round(g / n), Math.round(b / n));
    }
  }
  return { w, h, lab: out };
}

function kmeans3(points) {
  const sorted = [...points].sort((p, q) => p[0] - q[0]);
  let centers = [0.15, 0.5, 0.85].map((t) => sorted[Math.min(sorted.length - 1, Math.floor(t * sorted.length))].slice());
  let assign = new Array(points.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const d = deltaE(points[i], centers[k]);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      assign[i] = best;
      const s = sums[best];
      s[0] += points[i][0];
      s[1] += points[i][1];
      s[2] += points[i][2];
      s[3] += 1;
    }
    centers = sums.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[k]));
  }
  const counts = centers.map((_, k) => assign.filter((a) => a === k).length);
  return centers
    .map((c, k) => [...c, counts[k] / points.length])
    .filter((c) => c[3] > 0)
    .sort((p, q) => q[3] - p[3]);
}

const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray | Buffer }} img RGBA swatch
 */
export function computeSwatchFeatures(img) {
  if (!img?.width || !img?.height || !img?.data) return null;
  const { lab } = downsample(img, SAMPLE);
  const n = lab.length;
  const mean = [0, 0, 0];
  for (const p of lab) {
    mean[0] += p[0];
    mean[1] += p[1];
    mean[2] += p[2];
  }
  mean[0] /= n;
  mean[1] /= n;
  mean[2] /= n;
  let varL = 0;
  for (const p of lab) varL += (p[0] - mean[0]) ** 2;
  const t = textureStats(img);
  return {
    v: SWATCH_FEATURES_VERSION,
    lab: mean.map(r1),
    l_std: r1(Math.sqrt(varL / n)),
    detail: r1(t.detail),
    contrast: r1(t.contrast),
    edge: r3(t.edge),
    palette: kmeans3(lab).map((c) => [r1(c[0]), r1(c[1]), r1(c[2]), r3(c[3])]),
  };
}

function paletteDistance(pa, pb) {
  if (!pa?.length || !pb?.length) return 0;
  const one = (from, to) => from.reduce((s, c) => s + c[3] * Math.min(...to.map((d) => deltaE(c, d))), 0);
  return (one(pa, pb) + one(pb, pa)) / 2;
}

const logRatio = (x, y, eps) => Math.abs(Math.log(((x ?? 0) + eps) / ((y ?? 0) + eps)));

/**
 * Appearance distance between two stones (0 = identical), in rough ΔE units.
 * Texture is compared on a log scale: photographed veining is faint, so "a few vein pixels vs.
 * none" must weigh as much as "many vs. a few".
 */
export function swatchDistance(a, b) {
  if (!a?.lab || !b?.lab) return Infinity;
  const color = deltaE(a.lab, b.lab) * 0.5 + paletteDistance(a.palette, b.palette) * 0.5;
  const texture =
    logRatio(a.edge, b.edge, 0.001) * 1.5 +
    logRatio(a.contrast, b.contrast, 1) * 3 +
    Math.abs((a.l_std ?? 0) - (b.l_std ?? 0)) * 0.3;
  return color + texture;
}

/**
 * How well a stone carries the given tones (e.g. picked from a room photo / paint chip).
 * Each query color [L,a,b] (optionally weighted) is matched to the closest palette color;
 * a tone the stone only has in a trace counts less than a dominant one. Lower is better.
 * @param {Array<number[]>} query [[L,a,b,(weight)]]
 */
export function toneMatchDistance(query, features) {
  if (!features?.palette?.length || !query?.length) return Infinity;
  const total = query.reduce((s, c) => s + (c[3] ?? 1), 0) || 1;
  let d = 0;
  for (const c of query) {
    let best = Infinity;
    for (const p of features.palette) {
      const presence = Math.min(1, p[3] / 0.25);
      best = Math.min(best, deltaE(c, p) + (1 - presence) * 12);
    }
    d += ((c[3] ?? 1) / total) * best;
  }
  return d;
}
