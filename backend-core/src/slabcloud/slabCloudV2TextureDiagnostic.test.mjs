/**
 * slabCloudV2TextureDiagnostic — unit tests.
 *
 * Pure functions only: no network, no filesystem, no Supabase.
 * Run: npm run eos:test:slabcloud-v2-textures
 */

import assert from "node:assert/strict";

import {
  buildV2InventoryUrl,
  buildV2ProductUrl,
  buildTextureUrl,
  normalizeV2Row,
  normalizeV2Rows,
  computeDiagnosticSummary,
  detectDuplicates,
  areMaterialsCompatible,
  buildCatalogKey,
  compareWithCatalog,
  normalizeV2ProductResponse,
  TEXTURE_SIZES,
  DEFAULT_TEXTURE_SIZE,
  V2_INVENTORY_PATH,
  V2_PRODUCT_PATH,
} from "./slabCloudV2TextureDiagnostic.js";

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${label}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ── Sample fixtures ───────────────────────────────────────────────────────────

const SAMPLE_ROW_WITH_TEXTURE = {
  Name: "Alabaster",
  Material: "ESF",
  slug: "alabaster-esf",
  texture: "abc123def456",
  scColor: "White",
  count: 4,
  SlabID: "slab-001",
};

const SAMPLE_ROW_NO_TEXTURE = {
  Name: "Calacatta Gold",
  Material: "Cambria",
  slug: "calacatta-gold-cambria",
  texture: "",
  scColor: "White",
  count: 2,
  SlabID: "slab-002",
};

const SAMPLE_ROW_NULL_TEXTURE = {
  Name: "Winter Fresh",
  Material: "ESF Quartz",
  slug: "winter-fresh-esf",
  count: 7,
};

const BASE = "https://slabcloud.com";
const CODE = "kbyd";

// ═══════════════════════════════════════════════════════════
// URL builders
// ═══════════════════════════════════════════════════════════

console.log("\n── URL builders ────────────────────────────────────────");

test("buildV2InventoryUrl returns correct path", () => {
  const url = buildV2InventoryUrl(BASE, CODE);
  assert.ok(url.startsWith(`${BASE}${V2_INVENTORY_PATH}/${CODE}`), `Got: ${url}`);
  assert.ok(url.includes("cq_type="), `Missing cq_type param: ${url}`);
  assert.ok(url.includes("cq_material="), `Missing cq_material param: ${url}`);
});

test("buildV2InventoryUrl uses defaults when no args passed", () => {
  const url = buildV2InventoryUrl();
  assert.ok(url.includes("/api/v2/inventory/"), url);
});

test("buildV2ProductUrl encodes slug and material", () => {
  const url = buildV2ProductUrl(BASE, CODE, "my slug", "ESF Quartz");
  assert.ok(url.includes("slug=my%20slug"), `Missing encoded slug: ${url}`);
  assert.ok(url.includes("mat=ESF%20Quartz"), `Missing encoded mat: ${url}`);
  assert.ok(url.startsWith(`${BASE}${V2_PRODUCT_PATH}/${CODE}`), url);
});

test("buildV2ProductUrl handles empty material", () => {
  const url = buildV2ProductUrl(BASE, CODE, "alabaster", "");
  assert.ok(url.includes("mat="), url);
});

test("buildTextureUrl returns null for empty hash", () => {
  assert.equal(buildTextureUrl(BASE, ""), null);
  assert.equal(buildTextureUrl(BASE, null), null);
  assert.equal(buildTextureUrl(BASE, undefined), null);
});

test("buildTextureUrl builds correct URL for valid hash", () => {
  const url = buildTextureUrl(BASE, "abc123", "600");
  assert.equal(url, `${BASE}/scdata/textures/600/abc123.jpg`);
});

test("buildTextureUrl builds 1024 URL when requested", () => {
  const url = buildTextureUrl(BASE, "xyz789", "1024");
  assert.equal(url, `${BASE}/scdata/textures/1024/xyz789.jpg`);
});

test("buildTextureUrl defaults to 600 for unknown size", () => {
  const url = buildTextureUrl(BASE, "abc", "9999");
  assert.ok(url?.includes("/600/"), `Should default to 600: ${url}`);
});

test("TEXTURE_SIZES contains 600 and 1024", () => {
  assert.ok(TEXTURE_SIZES.includes("600"));
  assert.ok(TEXTURE_SIZES.includes("1024"));
});

test("DEFAULT_TEXTURE_SIZE is 600", () => {
  assert.equal(DEFAULT_TEXTURE_SIZE, "600");
});

// ═══════════════════════════════════════════════════════════
// normalizeV2Row
// ═══════════════════════════════════════════════════════════

console.log("\n── normalizeV2Row ───────────────────────────────────────");

test("normalizeV2Row extracts core fields from PascalCase row", () => {
  const row = normalizeV2Row(SAMPLE_ROW_WITH_TEXTURE, BASE);
  assert.equal(row.source_color_name, "Alabaster");
  assert.equal(row.source_material_name, "ESF");
  assert.equal(row.product_slug, "alabaster-esf");
  assert.equal(row.texture_hash, "abc123def456");
  assert.equal(row.has_texture, true);
  assert.equal(row.source_color_family, "White");
  assert.equal(row.source_count, 4);
});

test("normalizeV2Row normalizes color and material names", () => {
  const row = normalizeV2Row(SAMPLE_ROW_WITH_TEXTURE, BASE);
  assert.equal(row.normalized_color_name, "alabaster");
  // normalizeColorName lowercases etc.
  assert.ok(typeof row.normalized_material_name === "string");
  assert.ok(row.normalized_material_name.length > 0);
});

test("normalizeV2Row builds texture URLs", () => {
  const row = normalizeV2Row(SAMPLE_ROW_WITH_TEXTURE, BASE);
  assert.equal(row.texture_url_600,  `${BASE}/scdata/textures/600/abc123def456.jpg`);
  assert.equal(row.texture_url_1024, `${BASE}/scdata/textures/1024/abc123def456.jpg`);
});

test("normalizeV2Row flags has_texture false for empty texture string", () => {
  const row = normalizeV2Row(SAMPLE_ROW_NO_TEXTURE, BASE);
  assert.equal(row.has_texture, false);
  assert.equal(row.texture_hash, null);
  assert.equal(row.texture_url_600, null);
  assert.equal(row.texture_url_1024, null);
});

test("normalizeV2Row flags has_texture false for missing texture key", () => {
  const row = normalizeV2Row(SAMPLE_ROW_NULL_TEXTURE, BASE);
  assert.equal(row.has_texture, false);
  assert.equal(row.texture_hash, null);
});

test("normalizeV2Row marks source_count as display-only, not inventory authority", () => {
  const row = normalizeV2Row(SAMPLE_ROW_WITH_TEXTURE, BASE);
  assert.equal(row.source_count_is_display_only, true);
  // source_count is a display number, not physical slab count
  assert.equal(row.source_count, 4);
});

test("normalizeV2Row returns null for non-object input", () => {
  assert.equal(normalizeV2Row(null), null);
  assert.equal(normalizeV2Row(undefined), null);
  assert.equal(normalizeV2Row("string"), null);
});

test("normalizeV2Row preserves raw field", () => {
  const row = normalizeV2Row(SAMPLE_ROW_WITH_TEXTURE, BASE);
  assert.deepEqual(row.raw, SAMPLE_ROW_WITH_TEXTURE);
});

test("normalizeV2Rows handles array of rows", () => {
  const rows = normalizeV2Rows(
    [SAMPLE_ROW_WITH_TEXTURE, SAMPLE_ROW_NO_TEXTURE, SAMPLE_ROW_NULL_TEXTURE],
    BASE
  );
  assert.equal(rows.length, 3);
});

test("normalizeV2Rows returns empty array for non-array input", () => {
  assert.deepEqual(normalizeV2Rows(null), []);
  assert.deepEqual(normalizeV2Rows("bad"), []);
  assert.deepEqual(normalizeV2Rows(undefined), []);
});

// ═══════════════════════════════════════════════════════════
// computeDiagnosticSummary
// ═══════════════════════════════════════════════════════════

console.log("\n── computeDiagnosticSummary ─────────────────────────────");

const sampleNormalizedRows = normalizeV2Rows(
  [SAMPLE_ROW_WITH_TEXTURE, SAMPLE_ROW_NO_TEXTURE, SAMPLE_ROW_NULL_TEXTURE],
  BASE
);

test("computeDiagnosticSummary counts total rows correctly", () => {
  const s = computeDiagnosticSummary(sampleNormalizedRows);
  assert.equal(s.total_rows, 3);
});

test("computeDiagnosticSummary counts rows with/without texture correctly", () => {
  const s = computeDiagnosticSummary(sampleNormalizedRows);
  assert.equal(s.rows_with_texture, 1, "only Alabaster has texture");
  assert.equal(s.rows_without_texture, 2);
});

test("computeDiagnosticSummary computes texture_coverage_pct", () => {
  const s = computeDiagnosticSummary(sampleNormalizedRows);
  assert.ok(s.texture_coverage_pct >= 0 && s.texture_coverage_pct <= 100);
  // 1/3 = 33.3%
  assert.equal(s.texture_coverage_pct, 33.3);
});

test("computeDiagnosticSummary counts distinct materials", () => {
  const s = computeDiagnosticSummary(sampleNormalizedRows);
  assert.ok(s.distinct_materials >= 1);
});

test("computeDiagnosticSummary never summons source_count as inventory authority", () => {
  const s = computeDiagnosticSummary(sampleNormalizedRows);
  // The field name makes it explicit this is NOT inventory authority
  const key = "slabcloud_display_count_sum_NOT_inventory_authority";
  assert.ok(Object.prototype.hasOwnProperty.call(s, key), `Key not present: ${key}`);
  // Should not have any ambiguous "inventory_count" or "total_slabs" key
  assert.ok(!Object.prototype.hasOwnProperty.call(s, "total_slabs"), "Must not expose total_slabs");
  assert.ok(!Object.prototype.hasOwnProperty.call(s, "inventory_count"), "Must not expose inventory_count");
});

test("computeDiagnosticSummary returns zero coverage for empty array", () => {
  const s = computeDiagnosticSummary([]);
  assert.equal(s.total_rows, 0);
  assert.equal(s.texture_coverage_pct, 0);
});

// ═══════════════════════════════════════════════════════════
// detectDuplicates
// ═══════════════════════════════════════════════════════════

console.log("\n── detectDuplicates ─────────────────────────────────────");

test("detectDuplicates finds duplicate slugs", () => {
  const dupRow = { ...SAMPLE_ROW_WITH_TEXTURE }; // same slug: alabaster-esf
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE, dupRow, SAMPLE_ROW_NO_TEXTURE], BASE);
  const dupes = detectDuplicates(rows);
  assert.ok(dupes.duplicateSlugs.total_affected_slugs >= 1, "Expected at least 1 duplicate slug");
});

test("detectDuplicates finds duplicate color/material pairs", () => {
  const dupRow = { ...SAMPLE_ROW_WITH_TEXTURE, slug: "different-slug" };
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE, dupRow], BASE);
  const dupes = detectDuplicates(rows);
  assert.ok(dupes.duplicateColorMaterials.total_affected_groups >= 1);
});

test("detectDuplicates returns zero for no duplicates", () => {
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE, SAMPLE_ROW_NO_TEXTURE], BASE);
  const dupes = detectDuplicates(rows);
  assert.equal(dupes.duplicateSlugs.total_affected_slugs, 0);
  assert.equal(dupes.duplicateColorMaterials.total_affected_groups, 0);
});

// ═══════════════════════════════════════════════════════════
// areMaterialsCompatible
// ═══════════════════════════════════════════════════════════

console.log("\n── areMaterialsCompatible ───────────────────────────────");

test("areMaterialsCompatible: same material", () => {
  assert.ok(areMaterialsCompatible("esf", "esf"));
});

test("areMaterialsCompatible: ESF and ESF Quartz are compatible (alias group)", () => {
  assert.ok(areMaterialsCompatible("esf", "esf quartz"));
  assert.ok(areMaterialsCompatible("esf quartz", "esf"));
});

test("areMaterialsCompatible: Cambria and ESF are NOT compatible", () => {
  assert.ok(!areMaterialsCompatible("cambria", "esf"));
});

test("areMaterialsCompatible: empty material matches anything", () => {
  assert.ok(areMaterialsCompatible("", "esf"));
  assert.ok(areMaterialsCompatible("cambria", ""));
});

// ═══════════════════════════════════════════════════════════
// compareWithCatalog
// ═══════════════════════════════════════════════════════════

console.log("\n── compareWithCatalog ───────────────────────────────────");

const typedColorGroups = [
  { normalized_color_name: "alabaster", normalized_material_name: "esf" },
  { normalized_color_name: "calacatta gold", normalized_material_name: "cambria" },
  { normalized_color_name: "arctic white", normalized_material_name: "aggranite" },
];

const elite100Items = [
  { id: "cat-1", color_name: "Alabaster",      material_name: "ESF",    normalized_color_name: "alabaster",      normalized_material_name: "esf",     price_group: "Promo" },
  { id: "cat-2", color_name: "Calacatta Gold", material_name: "Cambria",normalized_color_name: "calacatta gold", normalized_material_name: "cambria",  price_group: "B" },
  { id: "cat-3", color_name: "Orphan Color",   material_name: "ESF",    normalized_color_name: "orphan color",   normalized_material_name: "esf",      price_group: "A" },
];

test("compareWithCatalog counts typed inventory correctly", () => {
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE, SAMPLE_ROW_NO_TEXTURE], BASE);
  const result = compareWithCatalog(rows, typedColorGroups, elite100Items, []);
  assert.equal(result.typed_color_groups_count, 3);
});

test("compareWithCatalog matches v2 rows against typed inventory exact", () => {
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE, SAMPLE_ROW_NO_TEXTURE], BASE);
  const result = compareWithCatalog(rows, typedColorGroups, elite100Items, []);
  // Alabaster/ESF and Calacatta Gold/Cambria both exist in typed groups
  assert.ok(result.v2_rows_matching_typed_exact >= 2, `Expected >=2, got ${result.v2_rows_matching_typed_exact}`);
});

test("compareWithCatalog matches v2 rows against Elite 100 exact", () => {
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE, SAMPLE_ROW_NO_TEXTURE], BASE);
  const result = compareWithCatalog(rows, typedColorGroups, elite100Items, []);
  assert.ok(result.v2_rows_matching_e100_exact >= 2);
});

test("compareWithCatalog handles alias matches for Elite 100", () => {
  // Catalog item is "Winter Fresh" but SlabCloud source calls it "Winterfresh"
  // The alias maps the source name to the catalog item.
  const aliasRow = { Name: "Winterfresh", Material: "ESF", slug: "winterfresh-esf", texture: "hash999", count: 3 };
  const rows = normalizeV2Rows([aliasRow], BASE);
  const aliases = [
    { catalog_item_id: "cat-99", normalized_alias_color_name: "winterfresh", normalized_alias_material_name: "esf", is_active: true },
  ];
  // Catalog item has a different normalized name ("winter fresh") than the alias ("winterfresh")
  const e100 = [
    { id: "cat-99", color_name: "Winter Fresh", normalized_color_name: "winter fresh", normalized_material_name: "esf", price_group: "C" },
  ];
  const result = compareWithCatalog(rows, [], e100, aliases);
  assert.ok(result.v2_rows_matching_e100_alias >= 1, `Expected >=1 alias match, got ${result.v2_rows_matching_e100_alias}`);
});

test("compareWithCatalog tracks texture candidates for Elite 100 items", () => {
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE, SAMPLE_ROW_NO_TEXTURE], BASE);
  const result = compareWithCatalog(rows, typedColorGroups, elite100Items, []);
  // Alabaster has texture, Calacatta Gold does not
  assert.ok(result.e100_items_with_texture_candidate >= 1);
  // Orphan Color has no v2 row at all
  assert.ok(result.e100_items_without_texture_candidate >= 1);
});

test("compareWithCatalog includes sample_unmatched_e100_items", () => {
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE], BASE);
  const result = compareWithCatalog(rows, typedColorGroups, elite100Items, []);
  // Orphan Color has no v2 match
  assert.ok(Array.isArray(result.sample_unmatched_e100_items));
  assert.ok(result.sample_unmatched_e100_items.length >= 1);
  const orphan = result.sample_unmatched_e100_items.find((r) => /orphan/i.test(r.color_name));
  assert.ok(orphan, "Orphan Color should appear in unmatched sample");
});

test("compareWithCatalog does not treat source_count as inventory authority", () => {
  // This test confirms the comparison only uses normalized names, not counts
  const rows = normalizeV2Rows([SAMPLE_ROW_WITH_TEXTURE], BASE);
  const result = compareWithCatalog(rows, typedColorGroups, elite100Items, []);
  // There should be no field relating to "inventory_count" from v2
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "inventory_count"));
  assert.ok(!Object.prototype.hasOwnProperty.call(result, "total_slabs_from_v2"));
});

// ═══════════════════════════════════════════════════════════
// normalizeV2ProductResponse
// ═══════════════════════════════════════════════════════════

console.log("\n── normalizeV2ProductResponse ───────────────────────────");

test("normalizeV2ProductResponse extracts product fields", () => {
  const raw = {
    Name: "Alabaster",
    Material: "ESF",
    slug: "alabaster-esf",
    texture: "hash456",
    palette: ["#fff", "#f0f0f0"],
    slabs: [{ id: "s1", name: "Slab 1" }],
  };
  const p = normalizeV2ProductResponse(raw, BASE);
  assert.equal(p.color_name, "Alabaster");
  assert.equal(p.texture_hash, "hash456");
  assert.equal(p.texture_url_600, `${BASE}/scdata/textures/600/hash456.jpg`);
  assert.equal(p.palette_count, 2);
  assert.equal(p.slab_count_in_product_response, 1);
});

test("normalizeV2ProductResponse handles missing texture gracefully", () => {
  const raw = { Name: "NoTex", Material: "Cambria" };
  const p = normalizeV2ProductResponse(raw, BASE);
  assert.equal(p.texture_hash, null);
  assert.equal(p.texture_url_600, null);
});

test("normalizeV2ProductResponse returns null for non-object input", () => {
  assert.equal(normalizeV2ProductResponse(null), null);
  assert.equal(normalizeV2ProductResponse("bad"), null);
});

// ═══════════════════════════════════════════════════════════
// Safety: no mutation
// ═══════════════════════════════════════════════════════════

console.log("\n── Safety checks ────────────────────────────────────────");

test("normalizeV2Row does not mutate the input row", () => {
  const original = { ...SAMPLE_ROW_WITH_TEXTURE };
  normalizeV2Row(SAMPLE_ROW_WITH_TEXTURE, BASE);
  assert.deepEqual(SAMPLE_ROW_WITH_TEXTURE, original, "Input should not be mutated");
});

test("no slab_inventory write/upsert/delete symbols present in helpers", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { default: path } = await import("node:path");
  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(__dir, "slabCloudV2TextureDiagnostic.js"), "utf8");
  const forbidden = ["upsert(", "insert(", "update(", "delete(", "from(\"slab_inventory\")", "from('slab_inventory')"];
  for (const word of forbidden) {
    assert.ok(!src.includes(word), `Forbidden pattern found in helpers: ${word}`);
  }
});

test("no slab_inventory write/upsert/delete symbols present in script", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { default: path } = await import("node:path");
  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    path.join(__dir, "../scripts/slabcloud/inspectSlabCloudV2Textures.js"),
    "utf8"
  );
  const forbidden = [".upsert(", ".insert(", ".update(", ".delete("];
  for (const word of forbidden) {
    assert.ok(!src.includes(word), `Forbidden Supabase write pattern found in script: ${word}`);
  }
});

// ═══════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════");
if (failed === 0) {
  console.log(`  ✓ All ${passed} tests passed.`);
} else {
  console.error(`  ✗ ${failed} test(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log("═══════════════════════════════════════════════════════\n");
