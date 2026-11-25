/**
 * Swatch appearance features + "More like this" ranking.
 *   node backend-core/src/slabInventory/swatchFeatures.test.mjs
 */
import assert from "node:assert/strict";

import {
  computeSwatchFeatures,
  deltaE,
  hexToLab,
  rgbToLab,
  swatchDistance,
  SWATCH_FEATURES_VERSION,
  toneMatchDistance,
} from "./swatchFeatures.js";
import { bestSwatchPieces, rankCardsByFeatures } from "./slabInventoryApi.js";
import { runSwatchFeatureBackfill } from "./slabPieceGeometryJob.js";

/** RGBA image; `paint(x, y)` → [r, g, b]. */
function image(w, h, paint) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}
const solid = (rgb) => () => rgb;
/** Off-white with thin diagonal grey veins every `gap` px, plus a soft lighting gradient. */
const veined = (gap) => (x, y) => {
  const shade = Math.round(-10 * (x / 600));
  return (x + y) % gap < 2 ? [150, 150, 148] : [232 + shade, 230 + shade, 226 + shade];
};

/* ── CIELAB conversion ── */
{
  const white = rgbToLab(255, 255, 255);
  assert.ok(Math.abs(white[0] - 100) < 0.01 && Math.abs(white[1]) < 0.01 && Math.abs(white[2]) < 0.01);
  assert.deepEqual(rgbToLab(0, 0, 0).map((v) => Math.round(v * 100) / 100), [0, 0, 0]);
  const red = rgbToLab(255, 0, 0);
  assert.ok(Math.abs(red[0] - 53.24) < 0.1 && Math.abs(red[1] - 80.09) < 0.2 && Math.abs(red[2] - 67.2) < 0.2);
  assert.deepEqual(hexToLab("#ffffff").map((v) => Math.round(v) + 0), [100, 0, 0]);
  assert.equal(hexToLab("not a color"), null);
  console.log("ok: sRGB → CIELAB");
}

/* ── Features: color + texture ── */
{
  assert.equal(computeSwatchFeatures(null), null);
  const plain = computeSwatchFeatures(image(600, 400, solid([230, 228, 224])));
  const marble = computeSwatchFeatures(image(600, 400, veined(40)));
  const busy = computeSwatchFeatures(image(600, 400, veined(9)));
  const black = computeSwatchFeatures(image(600, 400, solid([30, 30, 32])));

  assert.equal(plain.v, SWATCH_FEATURES_VERSION);
  assert.equal(plain.edge, 0, "solid stone has no veining");
  assert.ok(plain.contrast < 1);
  assert.ok(marble.edge > 0 && marble.contrast > 10, "thin veins survive (texture is measured at swatch resolution)");
  assert.ok(busy.edge > marble.edge, "denser veining covers more of the stone");
  assert.ok(black.lab[0] < 15 && plain.lab[0] > 85);
  assert.ok(plain.palette.length >= 1 && plain.palette.length <= 3);
  assert.ok(Math.abs(plain.palette.reduce((s, p) => s + p[3], 0) - 1) < 0.01, "palette weights sum to 1");

  const gradientOnly = computeSwatchFeatures(image(600, 400, (x) => [200 + Math.round((x / 600) * 40), 200 + Math.round((x / 600) * 40), 200]));
  assert.ok(gradientOnly.edge < 0.001, "a lighting gradient is not pattern");

  assert.equal(swatchDistance(marble, marble), 0);
  assert.ok(swatchDistance(marble, plain) < swatchDistance(marble, black), "a white is closer to a white than to a black");
  assert.ok(swatchDistance(marble, busy) < swatchDistance(plain, busy), "veined is closer to veined than solid is");
  assert.equal(swatchDistance(marble, null), Infinity);
  console.log("ok: swatch features + distance");

  const navy = hexToLab("#1d2a44");
  assert.ok(toneMatchDistance([[...hexToLab("#e8e6e2"), 1]], plain) < toneMatchDistance([[...navy, 1]], plain));
  assert.ok(toneMatchDistance([[...hexToLab("#1e1e20")]], black) < 5);
  assert.equal(toneMatchDistance([], plain), Infinity);
  assert.ok(deltaE([50, 0, 0], [50, 3, 4]) === 5);
  console.log("ok: tone match");
}

/* ── "More like this": representative piece + ranking ── */
{
  const f = (L, edge = 0) => ({ v: 2, lab: [L, 0, 0], l_std: 0.5, contrast: edge ? 12 : 2, edge, palette: [[L, 0, 0, 1]] });
  const row = (id, color, type = "Slab") => ({ external_source: "slabsmith", external_slab_id: id, color_name: color, material_name: "Q", price_group: "B", source_inventory_type: type });
  const geo = (id, features, area = 50) => [`slabsmith|${id}`, { status: "ok", swatch_url: `https://x/${id}.jpg`, area_sqft: area, swatch_features: features }];
  const rows = [row("t", "Target"), row("r", "Target", "Remnant"), row("a", "Near"), row("b", "Far"), row("c", "NoFeatures"), row("d", "Mid")];
  const gm = new Map([geo("t", f(80, 0.01)), geo("r", f(20), 400), geo("a", f(79, 0.01)), geo("b", f(15)), geo("c", null), geo("d", f(70, 0.01))]);

  const best = bestSwatchPieces(rows, gm);
  assert.equal(best.get("target--q--b").features.lab[0], 80, "slab beats a bigger remnant as the representative");
  const target = best.get("target--q--b").features;
  const ranked = rankCardsByFeatures([...best.keys()].map((k) => ({ color_key: k })), best, (x) => swatchDistance(target, x), {
    limit: 2,
    exclude: (c) => c.color_key === "target--q--b",
  });
  assert.deepEqual(ranked.map((c) => c.color_key), ["near--q--b", "mid--q--b"]);
  assert.ok(ranked[0].match_distance < ranked[1].match_distance);
  const all = rankCardsByFeatures([...best.keys()].map((k) => ({ color_key: k })), best, (x) => swatchDistance(target, x), { limit: 24 });
  assert.ok(!all.some((c) => c.color_key === "nofeatures--q--b"), "colors without features are not ranked");
  console.log("ok: similar-color ranking");
}

/* ── Backfill: only missing / stale features; failures are skipped ── */
{
  const updates = [];
  const filters = [];
  const db = {
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        or: (expr) => {
          filters.push(expr);
          return q;
        },
        limit: async () => ({
          data: [
            { id: "g1", swatch_url: "https://x/1.jpg" },
            { id: "g2", swatch_url: "https://x/broken.jpg" },
          ],
          error: null,
        }),
        update: (patch) => ({
          eq: async (_col, id) => {
            updates.push({ id, patch });
            return { error: null };
          },
        }),
      };
      return q;
    },
  };
  const result = await runSwatchFeatureBackfill({
    db,
    decodeImage: async (url) => {
      if (url.includes("broken")) throw new Error("404");
      return image(200, 150, veined(30));
    },
  });
  assert.deepEqual(result, { candidates: 2, updated: 1, failed: 1 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "g1");
  assert.equal(updates[0].patch.swatch_features.v, SWATCH_FEATURES_VERSION);
  assert.equal(filters[0], `swatch_features.is.null,swatch_features->>v.neq.${SWATCH_FEATURES_VERSION}`, "stale versions are recomputed");
  console.log("ok: feature backfill");
}

console.log("\nswatchFeatures: all tests passed");
