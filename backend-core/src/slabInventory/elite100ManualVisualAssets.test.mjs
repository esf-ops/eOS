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
  applyBatchDuplicateTargets,
  formatManualPhotoAuditRow,
  extractFilenameColorTokens,
  parsePhotoMatchMapContent,
  buildPhotoMatchMapLookup,
  buildPhotoFilenameAliasLookup,
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

test("extractFilenameColorTokens resolves hyphenated slug filenames via aliases", () => {
  const bellini = extractFilenameColorTokens(parsePhotoFilename("bellini-honed.jpg"));
  assert.equal(bellini.normalized, "bellini");
  const classic = extractFilenameColorTokens(parsePhotoFilename("classic-gray.jpg"));
  assert.equal(classic.normalized, "classic gray");
  const warm = extractFilenameColorTokens(parsePhotoFilename("warm-and-fuzzy.jpg"));
  assert.equal(warm.normalized, "warm and fuzzy");
});

test("parsePhotoFilename leading global index", () => {
  const p = parsePhotoFilename("06 Carrara Royale.jpg");
  assert.equal(p.globalIndex, 6);
  assert.equal(p.colorSlug, "carrara-royale");
});

test("matchPhotoToCatalogItem cross-validates index and name when both agree", () => {
  const m = matchPhotoToCatalogItem("31. Warwick_31.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.matchMethod, "color_slug");
  assert.equal(m.catalogItem.color_name, "Warwick");
  assert.equal(m.catalogItem.global_index, 31);
});

test("matchPhotoToCatalogItem blocks when index and name disagree", () => {
  const m = matchPhotoToCatalogItem("79. Warwick_79.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT);
  assert.equal(m.matchMethod, "global_index_name_conflict");
  assert.equal(m.catalogItem, null);
  assert.equal(m.conflictCatalogItem.color_name, "Regal Arabescato Gold");
});

test("matchPhotoToCatalogItem reports invalid_index when catalog index is missing", () => {
  const flatNo50 = flat.filter((f) => f.global_index !== 50);
  const catalogNo50 = fullCatalog.filter((c) => c.global_index !== 50);
  const m = matchPhotoToCatalogItem("50. Unknown Color_50.jpg", catalogNo50, flatNo50);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.INVALID_INDEX);
});

test("matchPhotoToCatalogItem resolves India Black Pearl when index and name agree", () => {
  const idx = flat.find((f) => f.color_name === "India Black Pearl")?.global_index;
  const m = matchPhotoToCatalogItem(`${idx}. India Black Pearl_${idx}.jpg`, fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.catalogItem.color_name, "India Black Pearl");
});

test("matchPhotoToCatalogItem resolves Regal Soapstone Matte via approved alias", () => {
  const m = matchPhotoToCatalogItem("36. Regal_Soapstone_Matte_36.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT);
  assert.equal(m.matchMethod, "global_index_name_conflict");
});

test("matchPhotoToCatalogItem resolves Newport via approved alias when index agrees", () => {
  const idx = flat.find((f) => f.color_name === "Newport Polished")?.global_index;
  const m = matchPhotoToCatalogItem(`${idx}. Newport_${idx}.jpg`, fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.matchMethod, "photo_filename_alias");
  assert.equal(m.catalogItem.color_name, "Newport Polished");
});

test("matchPhotoToCatalogItem name-only match uses lower confidence", () => {
  const m = matchPhotoToCatalogItem("white-dove.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.matchMethod, "color_slug");
  assert.ok(m.confidence <= 0.95);
});

test("applyBatchDuplicateTargets blocks duplicate catalog targets", () => {
  const plan = [
    {
      filename: "a.jpg",
      matchStatus: ELITE100_MATCH_STATUS.SAFE,
      catalogItem: { id: "same-id", color_name: "India Black Pearl" },
      warnings: [],
    },
    {
      filename: "b.jpg",
      matchStatus: ELITE100_MATCH_STATUS.SAFE,
      catalogItem: { id: "same-id", color_name: "India Black Pearl" },
      warnings: [],
    },
  ];
  applyBatchDuplicateTargets(plan);
  assert.equal(plan[0].matchStatus, ELITE100_MATCH_STATUS.DUPLICATE_TARGET);
  assert.equal(plan[1].matchStatus, ELITE100_MATCH_STATUS.DUPLICATE_TARGET);
});

test("formatManualPhotoAuditRow keeps parsed index/name for mapping override", () => {
  const csv = "source_filename,catalog_color_name\n79. Warwick_79.jpg,Regal Arabescato Gold\n";
  const rows = parsePhotoMatchMapContent(csv, "csv");
  const lookup = buildPhotoMatchMapLookup(rows, fullCatalog);
  const m = matchPhotoToCatalogItem("79. Warwick_79.jpg", fullCatalog, flat, { matchMap: lookup });
  const audit = formatManualPhotoAuditRow({
    filename: "79. Warwick_79.jpg",
    ...m,
    catalogItem: m.catalogItem,
  });
  assert.equal(audit.parsed_index, 79);
  assert.match(audit.parsed_name, /Warwick/i);
  assert.equal(audit.match_method, "mapping_override");
  assert.equal(audit.planned_action, "upload");
});

test("matchPhotoToCatalogItem reports catalog_color_missing for unknown filename color", () => {
  const m = matchPhotoToCatalogItem("79. Not Regal Arabescato_79.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.CATALOG_COLOR_MISSING);
  assert.equal(m.matchMethod, "catalog_color_missing");
  assert.ok(m.warnings.includes("catalog_color_missing"));
  assert.equal(m.catalogItem, null);
});

test("matchPhotoToCatalogItem resolves Whitendale via approved photo alias when index agrees", () => {
  const idx = flat.find((f) => f.color_name === "Whitenedale")?.global_index;
  const m = matchPhotoToCatalogItem(`${idx}. Whitendale_${idx}.jpg`, fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.matchMethod, "photo_filename_alias");
  assert.equal(m.catalogItem.color_name, "Whitenedale");
});

test("matchPhotoToCatalogItem resolves Skys The Limit via approved photo alias when index agrees", () => {
  const idx = flat.find((f) => f.color_name === "Sky's the Limit")?.global_index;
  const m = matchPhotoToCatalogItem(`${idx}. Skys_The_Limit_${idx}.jpg`, fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.matchMethod, "photo_filename_alias");
  assert.equal(m.catalogItem.color_name, "Sky's the Limit");
});

test("matchPhotoToCatalogItem resolves Classic Gray via approved photo alias when index agrees", () => {
  const idx = flat.find((f) => f.color_name === "Classic Grey")?.global_index;
  const m = matchPhotoToCatalogItem(`${idx}. Classic Gray.jpg`, fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.SAFE);
  assert.equal(m.matchMethod, "photo_filename_alias");
  assert.equal(m.catalogItem.color_name, "Classic Grey");
});

test("matchPhotoToCatalogItem never uses global index when filename has color name", () => {
  const m = matchPhotoToCatalogItem("81. Unknown Color Name_81.jpg", fullCatalog, flat);
  assert.equal(m.matchStatus, ELITE100_MATCH_STATUS.CATALOG_COLOR_MISSING);
  assert.equal(m.catalogItem, null);
});

test("buildPhotoFilenameAliasLookup maps approved aliases to catalog items", () => {
  const lookup = buildPhotoFilenameAliasLookup(
    [{ source_color_name: "Whitendale", catalog_color_name: "Whitenedale" }],
    fullCatalog
  );
  assert.ok(lookup.has("whitendale"));
  assert.equal(lookup.get("whitendale").catalogItem.color_name, "Whitenedale");
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
      matchStatus: ELITE100_MATCH_STATUS.CATALOG_COLOR_MISSING,
      parsed: { globalIndex: 81, colorText: "Unknown" },
      candidates: [{ filename_color: "unknown" }],
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
