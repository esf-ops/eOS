/**
 * slabPieceGeometry — pure geometry + fit ranking regression tests (no network).
 * Run: npm run eos:test:slab-piece-geometry
 */

import assert from "node:assert/strict";

import {
  deriveGeometryFromImage,
  frontierFits,
  GEOMETRY_METHOD,
  pieceAreaSqft,
  pieceFitsJob,
} from "./slabPieceGeometry.js";
import { geometryNeedsWork } from "./slabPieceGeometryJob.js";
import {
  parseFitParams,
  rankFitPieces,
  summarizeColorDimensions,
  toPieceGeometryDto,
} from "./slabInventoryApi.js";

/** White canvas with stone pixels where isStone(x, y). */
function synthImage(width, height, isStone) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = isStone(x, y) ? 120 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/* ── L-shaped remnant: 80" × 40" bbox with the top-right 40" × 20" missing (10 px/in) ── */
{
  const img = synthImage(800, 400, (x, y) => !(x >= 400 && y < 200));
  const g = deriveGeometryFromImage(img, { lengthIn: 80, widthIn: 40 });
  assert.equal(g.status, "ok");
  assert.equal(g.method, GEOMETRY_METHOD);
  assert.ok(Math.abs(g.px_per_in - 10) < 0.2, `px_per_in ≈ 10 (got ${g.px_per_in})`);
  assert.ok(Math.abs(g.area_sqft - (80 * 40 - 40 * 20) / 144) < 0.4, `area ≈ 16.7 sqft (got ${g.area_sqft})`);
  assert.equal(g.is_rectangular, false);
  assert.ok(g.outline_px.length >= 6 && g.outline_px.length <= 10, `L outline has ~6 corners (got ${g.outline_px.length})`);

  // Bottom strip (20" × 80") and left block (40" × 40") both usable.
  assert.ok(frontierFits(g.fit_frontier_in, 78, 19), "78×19 fits along the full-length strip");
  assert.ok(frontierFits(g.fit_frontier_in, 38, 38), "38×38 fits in the full-depth block");
  assert.ok(frontierFits(g.fit_frontier_in, 19, 78), "orientation does not matter");
  // Bounding box (80×40) would say yes — real shape says no.
  assert.ok(!frontierFits(g.fit_frontier_in, 70, 25), "70×25 does NOT fit an L-shape with a 20\" strip");
  assert.ok(pieceFitsJob({ status: "ok", fit_frontier_in: [[40, 80]] }, {}, 70, 25), "bbox-only geometry would accept 70×25");
  assert.ok(g.fit_frontier_in.every(([s]) => s >= 3), "slivers under 3\" are dropped");
  console.log("ok: L-shaped remnant geometry + fit frontier");
}

/* ── Plain rectangle → usable rectangle is the full piece ── */
{
  const img = synthImage(600, 300, (x, y) => x >= 20 && x < 580 && y >= 10 && y < 290);
  const g = deriveGeometryFromImage(img, { lengthIn: 112, widthIn: 56 });
  assert.equal(g.status, "ok");
  assert.equal(g.is_rectangular, true);
  assert.deepEqual(g.fit_frontier_in, [[56, 112]]);
  assert.equal(g.max_rect_long_in, 112);
  assert.ok(frontierFits(g.fit_frontier_in, 112, 56));
  assert.ok(!frontierFits(g.fit_frontier_in, 113, 20));
  console.log("ok: rectangular piece uses full Slabsmith dimensions");
}

/* ── Degenerate inputs ── */
{
  assert.equal(deriveGeometryFromImage(synthImage(100, 60, () => false), { lengthIn: 10, widthIn: 5 }).status, "no_stone");
  const noDims = deriveGeometryFromImage(synthImage(100, 60, () => true), {});
  assert.equal(noDims.status, "no_dims");
  assert.ok(Array.isArray(noDims.outline_px));
  assert.equal(pieceFitsJob(null, { length_actual_in: 60, width_actual_in: 30 }, 50, 25), true, "no geometry → L×W bbox fallback");
  assert.equal(pieceFitsJob(null, { length_actual_in: null, width_actual_in: 30 }, 10, 10), false, "no dims → never fits");
  assert.equal(pieceAreaSqft(null, { length_actual_in: 72, width_actual_in: 24 }), 12);
  console.log("ok: degenerate geometry inputs");
}

/* ── Change detection (idempotent / replay-safe) ── */
{
  const inv = { length_actual_in: 80, width_actual_in: 40 };
  const image = { image_url: "https://x/full.jpg", updated_at: "2026-11-01T00:00:00Z" };
  const fresh = {
    method: GEOMETRY_METHOD,
    status: "ok",
    source_image_url: image.image_url,
    source_image_updated_at: image.updated_at,
    source_length_in: 80,
    source_width_in: 40,
    computed_at: "2026-11-02T00:00:00Z",
  };
  assert.equal(geometryNeedsWork(inv, image, undefined), true, "missing → derive");
  assert.equal(geometryNeedsWork(inv, image, fresh), false, "unchanged → skip");
  assert.equal(geometryNeedsWork(inv, { ...image, image_url: "https://x/new.jpg" }, fresh), true, "photo URL changed");
  assert.equal(geometryNeedsWork(inv, { ...image, updated_at: "2026-11-05T00:00:00Z" }, fresh), true, "photo re-uploaded");
  assert.equal(geometryNeedsWork({ ...inv, length_actual_in: 70 }, image, fresh), true, "dimensions changed");
  assert.equal(geometryNeedsWork(inv, image, { ...fresh, method: "old" }), true, "method changed");
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(geometryNeedsWork(inv, image, { ...fresh, status: "error" }, now), false, "recent error → wait");
  assert.equal(geometryNeedsWork(inv, image, { ...fresh, status: "error" }, now + 2 * 86400000), true, "old error → retry");
  console.log("ok: geometry change detection");
}

/* ── API helpers: fit params, color dimensions, waste ranking, DTO ── */
{
  assert.equal(parseFitParams({}), null);
  assert.equal(parseFitParams({ length_in: "abc" }), null);
  assert.equal(parseFitParams({ length_in: "999" }), null, "over 400\" rejected");
  assert.deepEqual(parseFitParams({ length_in: "36" }), { lengthIn: 36, widthIn: 36, type: "all" }, "single value = square");
  assert.deepEqual(parseFitParams({ fit_length_in: "70", fit_width_in: "25", fit_type: "Remnant" }), { lengthIn: 70, widthIn: 25, type: "remnant" });

  const rows = [
    { external_source: "slabsmith", external_slab_id: "L", color_name: "Aria", material_name: "Quartz", price_group: "B", source_inventory_type: "Remnant", length_actual_in: 80, width_actual_in: 40 },
    { external_source: "slabsmith", external_slab_id: "R", color_name: "Aria", material_name: "Quartz", price_group: "B", source_inventory_type: "Remnant", length_actual_in: 74, width_actual_in: 27 },
    { external_source: "slabsmith", external_slab_id: "S", color_name: "Aria", material_name: "Quartz", price_group: "B", source_inventory_type: "Slab", length_actual_in: 126, width_actual_in: 63 },
    { external_source: "slabsmith", external_slab_id: "X", color_name: "Bria", material_name: "Quartz", price_group: "B", source_inventory_type: "Remnant", length_actual_in: 50, width_actual_in: 20 },
  ];
  const geometryMap = new Map([
    ["slabsmith|L", { status: "ok", fit_frontier_in: [[20, 80], [40, 40]], area_sqft: 16.7 }],
  ]);
  const fit = { lengthIn: 70, widthIn: 25, type: "all" };
  const ranked = rankFitPieces(rows, geometryMap, fit);
  assert.deepEqual(ranked.map((r) => r.row.external_slab_id), ["R", "S"], "L-shape excluded; least waste first");
  assert.ok(ranked[0].waste_sqft < ranked[1].waste_sqft);
  assert.deepEqual(rankFitPieces(rows, geometryMap, { ...fit, type: "remnant" }).map((r) => r.row.external_slab_id), ["R"]);

  const cards = [
    { color_key: "aria--quartz--b", total_inventory_count: 3 },
    { color_key: "bria--quartz--b", total_inventory_count: 1 },
  ];
  const plain = summarizeColorDimensions(cards, rows, new Map(), null);
  assert.equal(plain.length, 2, "no fit → all cards");
  assert.equal(plain[0].largest_piece_long_in, 126);
  assert.equal(plain[0].largest_piece_short_in, 63);
  assert.equal(plain[0].total_inventory_count, 3, "counts unchanged");
  assert.ok(!("fit_count" in plain[0]));
  const fitted = summarizeColorDimensions(cards, rows, geometryMap, fit);
  assert.deepEqual(fitted.map((c) => [c.color_key, c.fit_count]), [["aria--quartz--b", 2]], "fit filters colors and counts fitting pieces");

  assert.equal(toPieceGeometryDto(null), null);
  assert.equal(toPieceGeometryDto({ status: "error" }), null);
  const dto = toPieceGeometryDto({ status: "ok", outline_px: [[0, 0]], px_per_in: "10", area_sqft: "16.7", max_rect_long_in: "80", max_rect_short_in: "20", source_image_url: "secret-ish", error: "x" });
  assert.equal(dto.px_per_in, 10);
  assert.equal(dto.usable_long_in, 80);
  assert.ok(!("source_image_url" in dto) && !("error" in dto), "DTO is explicit, no internals");
  console.log("ok: fit params, color dimensions, waste ranking, geometry DTO");
}

console.log("\nslabPieceGeometry: all tests passed");
