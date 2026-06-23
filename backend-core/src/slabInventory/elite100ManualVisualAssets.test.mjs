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
  assessImportPlanSafety,
  extractFilenameColorTokens,
  parsePhotoMatchMapContent,
  buildPhotoMatchMapLookup,
  slugifyElite100ColorName,
  ELITE100_MANUAL_SOURCE_SYSTEM,
  ELITE100_MATCH_STATUS,
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
const fullCatalog = flat.map((f) => ({
  id: `00000000-0000-4000-8000-${String(f.global_index).padStart(12, "0")}`,
  color_name: f.color_name,
  material_name: f.material_name,
  normalized_color_name: f.normalized_color_name,
  normalized_material_name: f.normalized_material_name,
  price_group: f.price_group,
  global_index: f.global_index,
  product_slug: f.product_slug,
}));

const catalogItems = fullCatalog.slice(0, 5);

test("flattenElite100Fixture returns 100 items", () => {
  assert.equal(flat.length, 100);
  assert.equal(flat[0].color_name, "Carrara Classic");
  assert.equal(flat[0].global_index, 1);
});

test("slugifyElite100ColorName", () => {
  assert.equal(slugifyElite100ColorName("Carrara Royale"), "carrara-royale");
  assert.equal(slugifyElite100ColorName("India Black Pearl"), "india-black-pearl");
});

test("extractFilenameColorTokens strips polished and duplicate index", () => {
  const parsed = parsePhotoFilename("100. India Black Pearl_polished.jpg");
  const tokens = extractFilenameColorTokens(parsed);
  assert.equal(tokens.normalized, "india black pearl");
  assert.equal(tokens.slug, "india-black-pearl");
});

test("parsePhotoFilename leading global index", () => {
  const p = parsePhotoFilename("06 Carrara Royale.jpg");
  assert.equal(p.globalIndex, 6);
  assert.equal(p.colorSlug, "carrara-royale");
});

test("matchPhotoToCatalogItem prefers color slug over conflicting global index", () => {
  const m = matchPhotoToCatalogItem("79. Warwick_79.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.matchMethod, "color_slug");
  assert.equal(m.catalogItem.color_name, "Warwick");
});

test("matchPhotoToCatalogItem resolves India Black Pearl at index 100", () => {
  const m = matchPhotoToCatalogItem("100. India Black Pearl_polished.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.catalogItem.color_name, "India Black Pearl");
  assert.notEqual(m.catalogItem.color_name, "Skara Brae");
});

test("matchPhotoToCatalogItem flags global_index_name_conflict", () => {
  const m = matchPhotoToCatalogItem("79. Not Regal Arabescato_79.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT);
  assert.equal(m.matchMethod, "global_index_name_conflict");
  assert.equal(m.conflictCatalogItem.color_name, "Regal Arabescato Gold");
  assert.ok(m.warnings.includes("global_index_name_conflict"));
});

test("matchPhotoToCatalogItem by color slug", () => {
  const dove = flat.find((f) => f.color_name === "White Dove");
  const catalog = fullCatalog.filter((c) => c.color_name === dove.color_name);
  const m = matchPhotoToCatalogItem("white-dove.jpg", catalog, flat);
  assert.equal(m.matchMethod, "color_slug");
  assert.equal(m.catalogItem.color_name, "White Dove");
});

test("mapping override wins over filename ambiguity", () => {
  const csv = "source_filename,catalog_color_name\n79. Warwick_79.jpg,Regal Arabescato Gold\n";
  const rows = parsePhotoMatchMapContent(csv, "csv");
  const lookup = buildPhotoMatchMapLookup(rows, fullCatalog);
  const m = matchPhotoToCatalogItem("79. Warwick_79.jpg", fullCatalog, flat, { matchMap: lookup });
  assert.equal(m.matchMethod, "mapping_override");
  assert.equal(m.catalogItem.color_name, "Regal Arabescato Gold");
});

test("assessImportPlanSafety blocks conflicts and unmatched", () => {
  const plan = [
    {
      filename: "safe.jpg",
      matchStatus: ELITE100_MATCH_STATUS.SAFE,
      catalogItem: { id: "1", color_name: "Warwick" },
    },
    {
      filename: "bad.jpg",
      matchStatus: ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT,
      conflictCatalogItem: { color_name: "Regal Arabescato Gold" },
      parsed: { globalIndex: 79 },
    },
    {
      filename: "missing.jpg",
      matchStatus: ELITE100_MATCH_STATUS.UNMATCHED,
      catalogItem: null,
    },
  ];
  const safety = assessImportPlanSafety(plan);
  assert.equal(safety.write_blocked, true);
  assert.equal(safety.blockers.length, 2);
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
    matchMethod: "color_slug",
  });
  assert.equal(row.original_image_url, "https://example.com/original.jpg");
  assert.equal(row.hero_url, "https://example.com/hero-2048.jpg");
});

test("computeManualPhotoDryRunSummary reports safe vs blocked", () => {
  const summary = computeManualPhotoDryRunSummary([
    {
      filename: "a.jpg",
      catalogItem: catalogItems[0],
      matchMethod: "color_slug",
      matchStatus: ELITE100_MATCH_STATUS.SAFE,
      parsed: {},
      warnings: [],
    },
    {
      filename: "b.jpg",
      catalogItem: null,
      matchMethod: "global_index_name_conflict",
      matchStatus: ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT,
      conflictCatalogItem: { color_name: "Other" },
      parsed: { globalIndex: 79 },
      warnings: ["global_index_name_conflict"],
    },
  ]);
  assert.equal(summary.safe_matches, 1);
  assert.equal(summary.conflicts, 1);
  assert.equal(summary.write_blocked, true);
});

console.log("\nelite100ManualVisualAssets tests passed.");
