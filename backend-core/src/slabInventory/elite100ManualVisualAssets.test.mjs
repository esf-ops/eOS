/**
 * elite100ManualVisualAssets — unit tests (pure helpers).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  flattenElite100Fixture,
  parsePhotoFilename,
  matchPhotoToCatalogItem,
  buildElite100ManualStoragePaths,
  buildManualVisualAssetRow,
  computeManualPhotoDryRunSummary,
  slugifyElite100ColorName,
  ELITE100_MANUAL_SOURCE_SYSTEM,
} from "./elite100ManualVisualAssets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures/elite100-2026.json"), "utf8")
);

function test(name, fn) {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}

const flat = flattenElite100Fixture(FIXTURE);
const catalogItems = flat.slice(0, 5).map((f, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  color_name: f.color_name,
  material_name: f.material_name,
  normalized_color_name: f.normalized_color_name,
  normalized_material_name: f.normalized_material_name,
  price_group: f.price_group,
  global_index: f.global_index,
  product_slug: f.product_slug,
}));

test("flattenElite100Fixture returns 100 items", () => {
  assert.equal(flat.length, 100);
  assert.equal(flat[0].color_name, "Carrara Classic");
  assert.equal(flat[0].global_index, 1);
});

test("slugifyElite100ColorName", () => {
  assert.equal(slugifyElite100ColorName("Carrara Royale"), "carrara-royale");
  assert.equal(slugifyElite100ColorName("India Black Pearl"), "india-black-pearl");
});

test("parsePhotoFilename leading global index", () => {
  const p = parsePhotoFilename("06 Carrara Royale.jpg");
  assert.equal(p.globalIndex, 6);
  assert.equal(p.colorSlug, "carrara-royale");
});

test("parsePhotoFilename color slug only", () => {
  const p = parsePhotoFilename("white-dove.jpeg");
  assert.equal(p.colorSlug, "white-dove");
});

test("matchPhotoToCatalogItem by global index", () => {
  const item6 = flat[5];
  const catalog = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      color_name: item6.color_name,
      material_name: item6.material_name,
      normalized_color_name: item6.normalized_color_name,
      normalized_material_name: item6.normalized_material_name,
      price_group: item6.price_group,
    },
  ];
  const m = matchPhotoToCatalogItem("06 Carrara Royale.jpg", catalog, flat);
  assert.equal(m.matchMethod, "global_index");
  assert.equal(m.catalogItem.color_name, "Carrara Royale");
});

test("matchPhotoToCatalogItem by color slug", () => {
  const dove = flat.find((f) => f.color_name === "White Dove");
  const catalog = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      color_name: dove.color_name,
      material_name: dove.material_name,
      normalized_color_name: dove.normalized_color_name,
      normalized_material_name: dove.normalized_material_name,
      price_group: dove.price_group,
    },
  ];
  const m = matchPhotoToCatalogItem("white-dove.jpg", catalog, flat);
  assert.equal(m.matchMethod, "color_slug");
  assert.equal(m.catalogItem.color_name, "White Dove");
});

test("buildElite100ManualStoragePaths", () => {
  const paths = buildElite100ManualStoragePaths(
    "org-1",
    "cat-1",
    "carrara-royale",
    { heroMaxPx: 2048, originalExt: ".jpg" }
  );
  assert.match(paths.heroPath, /^org\/org-1\/elite100-visual\/carrara-royale-/);
  assert.ok(paths.heroPath.endsWith("/hero-2048.jpg"));
  assert.ok(paths.thumbPath.endsWith("/thumb-600.jpg"));
  assert.ok(paths.originalPath.endsWith("/original.jpg"));
});

test("buildManualVisualAssetRow approved primary with separate original", () => {
  const row = buildManualVisualAssetRow({
    orgId: "org-1",
    catalogItem: catalogItems[0],
    publicUrls: {
      heroUrl: "https://example.com/hero-2048.jpg",
      thumbUrl: "https://example.com/thumb-600.jpg",
      originalUrl: "https://example.com/original.jpg",
      heroBytes: 1000,
      thumbBytes: 200,
      originalBytes: 50000000,
      storageOriginalPath: "org/org-1/elite100-visual/carrara-classic-00000000/original.jpg",
    },
    contentHash: "abc123",
    sourceFile: "01-carrara-classic.jpg",
    matchMethod: "global_index",
  });
  assert.equal(row.source_system, ELITE100_MANUAL_SOURCE_SYSTEM);
  assert.equal(row.review_status, "approved");
  assert.equal(row.is_primary, true);
  assert.equal(row.texture_url_600, "https://example.com/thumb-600.jpg");
  assert.equal(row.texture_url_1024, "https://example.com/hero-2048.jpg");
  assert.equal(row.hero_url, "https://example.com/hero-2048.jpg");
  assert.equal(row.original_image_url, "https://example.com/original.jpg");
  assert.equal(row.raw.stores_original_image_url, true);
});

test("buildManualVisualAssetRow approved primary", () => {
  const row = buildManualVisualAssetRow({
    orgId: "org-1",
    catalogItem: catalogItems[0],
    publicUrls: {
      heroUrl: "https://example.com/hero.jpg",
      thumbUrl: "https://example.com/thumb.jpg",
      heroBytes: 1000,
      thumbBytes: 200,
    },
    contentHash: "abc123",
    sourceFile: "01-carrara-classic.jpg",
    matchMethod: "global_index",
  });
  assert.equal(row.texture_url_600, "https://example.com/thumb.jpg");
  assert.equal(row.hero_url, "https://example.com/hero.jpg");
  assert.equal(row.original_image_url, null);
});

test("computeManualPhotoDryRunSummary", () => {
  const summary = computeManualPhotoDryRunSummary([
    { filename: "a.jpg", catalogItem: catalogItems[0], matchMethod: "color_slug", parsed: {}, warnings: [] },
    { filename: "b.jpg", catalogItem: null, matchMethod: "none", parsed: {}, warnings: [] },
  ]);
  assert.equal(summary.total_files, 2);
  assert.equal(summary.matched, 1);
  assert.equal(summary.unmatched, 1);
});

console.log("\nelite100ManualVisualAssets tests passed.");
