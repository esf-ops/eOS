/**
 * slabPieceGeometry — pure geometry + fit ranking regression tests (no network).
 * Run: npm run eos:test:slab-piece-geometry
 */

import assert from "node:assert/strict";

import {
  cropResizeRgba,
  deriveGeometryFromImage,
  frontierFits,
  GEOMETRY_METHOD,
  pieceAreaSqft,
  pieceFitsJob,
  swatchOutputSize,
} from "./slabPieceGeometry.js";
import { geometryNeedsWork, runSlabGeometryDerivation, swatchStoragePath } from "./slabPieceGeometryJob.js";
import {
  attachColorSwatches,
  filterRowsByThickness,
  parseThicknessParam,
  thicknessMm,
  thicknessOptions,
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
    swatch_url: "https://x/swatch.jpg",
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

/* ── Swatch crop: inside usable stone, near-square, never across the L-shape notch ── */
{
  const isStone = (x, y) => !(x >= 400 && y < 200);
  const img = synthImage(800, 400, isStone);
  const g = deriveGeometryFromImage(img, { lengthIn: 80, widthIn: 40 });
  const [x, y, w, h] = g.swatch_rect_px;
  assert.ok(w >= 48 && h >= 48);
  const aspect = Math.max(w, h) / Math.min(w, h);
  assert.ok(aspect <= 4 / 3 + 0.02, `swatch aspect within [1, 4:3] (got ${aspect.toFixed(2)})`);
  for (const [px, py] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) {
    assert.ok(isStone(px, py), `swatch corner (${px},${py}) is stone`);
  }
  assert.ok(w * h > 300 * 300, "swatch uses the big 40×40 block, not a sliver");

  const rect = deriveGeometryFromImage(synthImage(600, 300, () => true), { lengthIn: 112, widthIn: 56 });
  assert.ok(rect.swatch_rect_px[2] <= rect.swatch_rect_px[3] * (4 / 3) + 1, "wide slab cropped to ≤ 4:3");

  // Area-average resize: a half-black / half-white source averages to mid-grey.
  const src = synthImage(4, 2, (px) => px < 2);
  const out = cropResizeRgba(src, [0, 0, 4, 2], 1, 1);
  assert.ok(Math.abs(out.data[0] - (120 + 255) / 2) < 1);
  assert.deepEqual(swatchOutputSize([0, 0, 1280, 960]), [853, 640]);
  assert.deepEqual(swatchOutputSize([0, 0, 300, 200]), [300, 200], "never upscales");
  console.log("ok: swatch crop + resize");
}

/* ── Swatch backfill rules + content-addressed path ── */
{
  const inv = { organization_id: "org-1", external_slab_id: "AB/CD", length_actual_in: 80, width_actual_in: 40 };
  const image = { image_url: "https://x/full.jpg", updated_at: "2026-11-01T00:00:00Z" };
  const done = {
    method: GEOMETRY_METHOD,
    status: "ok",
    source_image_url: image.image_url,
    source_image_updated_at: image.updated_at,
    source_length_in: 80,
    source_width_in: 40,
    swatch_url: "https://x/swatch.jpg",
    computed_at: "2026-11-02T00:00:00Z",
  };
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(geometryNeedsWork(inv, image, done, now), false);
  assert.equal(geometryNeedsWork(inv, image, { ...done, swatch_url: null }, now), true, "ok without swatch → build swatch");
  assert.equal(geometryNeedsWork(inv, image, { ...done, swatch_url: null, error: "swatch: x" }, now), false, "recent swatch failure → back off");
  assert.equal(geometryNeedsWork(inv, image, { ...done, swatch_url: null, error: "swatch: x" }, now + 2 * 86400000), true);
  assert.equal(geometryNeedsWork(inv, image, { ...done, status: "no_stone", swatch_url: null }, now), false, "no swatch for non-ok pieces");

  const p1 = swatchStoragePath(inv, image);
  assert.match(p1, /^org\/org-1\/slabsmith-derived\/AB_CD\/swatch-[0-9a-f]{12}\.jpg$/);
  assert.equal(swatchStoragePath(inv, image), p1, "stable for the same photo");
  assert.notEqual(swatchStoragePath(inv, { ...image, updated_at: "2026-11-09T00:00:00Z" }), p1, "new photo → new object");
  console.log("ok: swatch backfill rules + storage path");
}

/* ── Job: swatch written for ok pieces; upload failure keeps geometry ── */
{
  const upserts = [];
  const inv = [
    { id: "1", organization_id: "o", external_slab_id: "A", length_actual_in: 80, width_actual_in: 40 },
    { id: "2", organization_id: "o", external_slab_id: "B", length_actual_in: 80, width_actual_in: 40 },
  ];
  const images = inv.map((r) => ({ organization_id: "o", external_slab_id: r.external_slab_id, image_url: `https://x/${r.external_slab_id}.jpg`, updated_at: null, image_status: "ok" }));
  const fakeDb = {
    from(table) {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        range: async () => ({ data: table === "slab_inventory" ? inv : table === "slab_images" ? images : [], error: null }),
        upsert: async (row) => {
          upserts.push(row);
          return { error: null };
        },
      };
      return q;
    },
  };
  const result = await runSlabGeometryDerivation({
    db: fakeDb,
    decodeImage: async () => synthImage(800, 400, () => true),
    writeSwatch: async (_img, rect, path) => {
      if (path.includes("/B/")) throw new Error("storage down");
      return { swatch_url: `https://cdn/${path}`, swatch_width_px: rect[2], swatch_height_px: rect[3] };
    },
  });
  assert.equal(result.counts.ok, 2);
  assert.equal(result.counts.swatches, 1);
  assert.equal(result.counts.swatch_errors, 1);
  const a = upserts.find((r) => r.external_slab_id === "A");
  const b = upserts.find((r) => r.external_slab_id === "B");
  assert.match(a.swatch_url, /slabsmith-derived\/A\/swatch-/);
  assert.equal(a.error, null);
  assert.equal(b.status, "ok", "geometry kept when the swatch upload fails");
  assert.equal(b.swatch_url, null);
  assert.match(b.error, /^swatch: storage down/);
  console.log("ok: derivation job writes swatches, tolerates upload failure");
}

/* ── Color cards pick a slab swatch before a remnant, then the largest ── */
{
  const rows = [
    { external_source: "slabsmith", external_slab_id: "r1", color_name: "Aria", material_name: "Q", price_group: "B", source_inventory_type: "Remnant" },
    { external_source: "slabsmith", external_slab_id: "s1", color_name: "Aria", material_name: "Q", price_group: "B", source_inventory_type: "Slab" },
    { external_source: "slabsmith", external_slab_id: "s2", color_name: "Aria", material_name: "Q", price_group: "B", source_inventory_type: "Slab" },
    { external_source: "slabsmith", external_slab_id: "n1", color_name: "Bria", material_name: "Q", price_group: "B", source_inventory_type: "Slab" },
  ];
  const geo = new Map([
    ["slabsmith|r1", { status: "ok", area_sqft: 90, swatch_url: "r1.jpg" }],
    ["slabsmith|s1", { status: "ok", area_sqft: 40, swatch_url: "s1.jpg" }],
    ["slabsmith|s2", { status: "ok", area_sqft: 55, swatch_url: "s2.jpg" }],
    ["slabsmith|n1", { status: "error", swatch_url: null }],
  ]);
  const cards = attachColorSwatches([{ color_key: "aria--q--b" }, { color_key: "bria--q--b" }], rows, geo);
  assert.equal(cards[0].swatch_url, "s2.jpg");
  assert.equal(cards[1].swatch_url, null);
  console.log("ok: color card swatch selection");
}

/* ── Thickness normalisation + filter ── */
{
  assert.equal(thicknessMm("3 cm"), 30);
  assert.equal(thicknessMm("2cm"), 20);
  assert.equal(thicknessMm("20mm"), 20, "20mm groups with 2 cm");
  assert.equal(thicknessMm("12MM"), 12);
  assert.equal(thicknessMm("3"), 30, "bare small number = cm");
  assert.equal(thicknessMm(null), null);
  assert.equal(thicknessMm("1 1/4\""), null);
  assert.equal(parseThicknessParam({}), null);
  assert.equal(parseThicknessParam({ thickness_mm: "abc" }), null);
  assert.deepEqual([...parseThicknessParam({ thickness_mm: "20, 30" })], [20, 30]);
  const rows = [{ thickness_nominal: "3 cm" }, { thickness_nominal: "2 cm" }, { thickness_nominal: "20mm" }, { thickness_nominal: null }];
  assert.equal(filterRowsByThickness(rows, null), rows, "no filter → unchanged");
  assert.equal(filterRowsByThickness(rows, new Set([20])).length, 2);
  assert.deepEqual(thicknessOptions([...rows, { thickness_nominal: "12MM" }]), [
    { mm: 12, label: "12 mm", count: 1 },
    { mm: 20, label: "2 cm", count: 2 },
    { mm: 30, label: "3 cm", count: 1 },
  ]);
  console.log("ok: thickness normalisation + filter");
}

console.log("\nslabPieceGeometry: all tests passed");
