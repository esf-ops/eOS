/**
 * slabCloudVisualAssetCache — unit tests.
 *
 * Pure function tests only: no network, no filesystem, no Supabase.
 * Run: npm run eos:test:slabcloud-visual-asset-cache
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VISUAL_ASSET_KIND_VALUES,
  VISUAL_ASSET_REVIEW_STATUS_VALUES,
  VISUAL_ASSET_MATCH_METHOD_VALUES,
  DEFAULT_SOURCE_SYSTEM,
  DEFAULT_COMPANY_CODE,
  DEFAULT_PUBLIC_SLUG,
  buildVisualAssetRow,
  findExistingVisualAsset,
} from "./slabCloudVisualAssetCache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_SOURCE = readFileSync(
  path.resolve(__dirname, "./slabCloudVisualAssetCache.js"),
  "utf8"
);
const SCRIPT_SOURCE = readFileSync(
  path.resolve(__dirname, "../scripts/slabcloud/cacheSlabCloudV2Textures.js"),
  "utf8"
);

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

async function testAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${label}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_V2_ROW_WITH_TEXTURE = {
  source_color_name:         "Alabaster",
  source_material_name:      "ESF",
  normalized_color_name:     "alabaster",
  normalized_material_name:  "esf",
  product_slug:              "alabaster-esf",
  texture_hash:              "abc123def456",
  texture_url_600:           "https://slabcloud.com/scdata/textures/600/abc123def456.jpg",
  texture_url_1024:          "https://slabcloud.com/scdata/textures/1024/abc123def456.jpg",
  has_texture:               true,
  raw:                       { Name: "Alabaster", Material: "ESF", texture: "abc123def456" },
};

const SAMPLE_V2_ROW_NO_TEXTURE = {
  source_color_name:         "Calacatta Gold",
  source_material_name:      "Cambria",
  normalized_color_name:     "calacatta gold",
  normalized_material_name:  "cambria",
  product_slug:              "calacatta-gold-cambria",
  texture_hash:              null,
  texture_url_600:           null,
  texture_url_1024:          null,
  has_texture:               false,
  raw:                       { Name: "Calacatta Gold", Material: "Cambria", texture: "" },
};

const SAMPLE_ORG_ID = "org-uuid-0001";
const SAMPLE_CATALOG_ITEM_ID = "catalog-uuid-0001";

// ── Constants ─────────────────────────────────────────────────────────────────

console.log("\n  ── Constants ──────────────────────────────────────────────────");

test("VISUAL_ASSET_KIND_VALUES is frozen and contains expected values", () => {
  assert.ok(Object.isFrozen(VISUAL_ASSET_KIND_VALUES), "should be frozen");
  assert.ok(VISUAL_ASSET_KIND_VALUES.includes("texture"), "includes texture");
  assert.ok(VISUAL_ASSET_KIND_VALUES.includes("slab_photo"), "includes slab_photo");
  assert.ok(VISUAL_ASSET_KIND_VALUES.includes("manufacturer"), "includes manufacturer");
  assert.ok(VISUAL_ASSET_KIND_VALUES.includes("manual_upload"), "includes manual_upload");
  assert.ok(VISUAL_ASSET_KIND_VALUES.includes("generated"), "includes generated");
});

test("VISUAL_ASSET_REVIEW_STATUS_VALUES is frozen and contains expected values", () => {
  assert.ok(Object.isFrozen(VISUAL_ASSET_REVIEW_STATUS_VALUES), "should be frozen");
  assert.ok(VISUAL_ASSET_REVIEW_STATUS_VALUES.includes("imported"), "includes imported");
  assert.ok(VISUAL_ASSET_REVIEW_STATUS_VALUES.includes("approved"), "includes approved");
  assert.ok(VISUAL_ASSET_REVIEW_STATUS_VALUES.includes("needs_review"), "includes needs_review");
  assert.ok(VISUAL_ASSET_REVIEW_STATUS_VALUES.includes("rejected"), "includes rejected");
});

test("VISUAL_ASSET_MATCH_METHOD_VALUES is frozen and contains expected values", () => {
  assert.ok(Object.isFrozen(VISUAL_ASSET_MATCH_METHOD_VALUES), "should be frozen");
  assert.ok(VISUAL_ASSET_MATCH_METHOD_VALUES.includes("exact"), "includes exact");
  assert.ok(VISUAL_ASSET_MATCH_METHOD_VALUES.includes("alias"), "includes alias");
  assert.ok(VISUAL_ASSET_MATCH_METHOD_VALUES.includes("manual"), "includes manual");
  assert.ok(VISUAL_ASSET_MATCH_METHOD_VALUES.includes("none"), "includes none");
});

test("DEFAULT_SOURCE_SYSTEM is slabcloud_v2", () => {
  assert.equal(DEFAULT_SOURCE_SYSTEM, "slabcloud_v2");
});

// ── buildVisualAssetRow — basic ───────────────────────────────────────────────

console.log("\n  ── buildVisualAssetRow — basic ────────────────────────────────");

test("buildVisualAssetRow creates correct row for a matched Elite 100 item", () => {
  const row = buildVisualAssetRow(
    SAMPLE_V2_ROW_WITH_TEXTURE,
    SAMPLE_ORG_ID,
    SAMPLE_CATALOG_ITEM_ID,
    "exact"
  );
  assert.ok(row, "should return a row");
  assert.equal(row.organization_id, SAMPLE_ORG_ID);
  assert.equal(row.catalog_item_id, SAMPLE_CATALOG_ITEM_ID);
  assert.equal(row.source_system, "slabcloud_v2");
  assert.equal(row.source_color_name, "Alabaster");
  assert.equal(row.source_material_name, "ESF");
  assert.equal(row.normalized_color_name, "alabaster");
  assert.equal(row.product_slug, "alabaster-esf");
  assert.equal(row.texture_hash, "abc123def456");
  assert.ok(row.texture_url_600?.includes("600/abc123def456.jpg"), "texture_url_600 correct");
  assert.ok(row.texture_url_1024?.includes("1024/abc123def456.jpg"), "texture_url_1024 correct");
  assert.equal(row.asset_kind, "texture");
  assert.equal(row.review_status, "imported");
  assert.equal(row.match_method, "exact");
  assert.equal(row.is_primary, false);
  assert.equal(row.is_active, true);
});

test("buildVisualAssetRow creates correct row for an alias-matched Elite 100 item", () => {
  const row = buildVisualAssetRow(
    SAMPLE_V2_ROW_WITH_TEXTURE,
    SAMPLE_ORG_ID,
    SAMPLE_CATALOG_ITEM_ID,
    "alias"
  );
  assert.ok(row, "should return a row");
  assert.equal(row.catalog_item_id, SAMPLE_CATALOG_ITEM_ID);
  assert.equal(row.match_method, "alias");
});

test("buildVisualAssetRow creates correct row for an unmatched non-stock item (catalog_item_id null)", () => {
  const row = buildVisualAssetRow(
    SAMPLE_V2_ROW_WITH_TEXTURE,
    SAMPLE_ORG_ID,
    null, // no catalog match
    null
  );
  assert.ok(row, "should return a row");
  assert.equal(row.catalog_item_id, null, "catalog_item_id should be null for non-stock");
  assert.equal(row.match_method, null);
});

test("buildVisualAssetRow returns null if texture_hash is missing", () => {
  const row = buildVisualAssetRow(
    SAMPLE_V2_ROW_NO_TEXTURE,
    SAMPLE_ORG_ID,
    null,
    null
  );
  assert.equal(row, null, "rows without texture_hash should be skipped");
});

test("buildVisualAssetRow returns null for null input", () => {
  assert.equal(buildVisualAssetRow(null, SAMPLE_ORG_ID, null, null), null);
});

test("buildVisualAssetRow returns null for non-object input", () => {
  assert.equal(buildVisualAssetRow("not-an-object", SAMPLE_ORG_ID, null, null), null);
});

// ── buildVisualAssetRow — company code and slug opts ─────────────────────────

console.log("\n  ── buildVisualAssetRow — opts ─────────────────────────────────");

test("buildVisualAssetRow uses DEFAULT_COMPANY_CODE and DEFAULT_PUBLIC_SLUG when opts omitted", () => {
  const row = buildVisualAssetRow(SAMPLE_V2_ROW_WITH_TEXTURE, SAMPLE_ORG_ID, null, null);
  assert.equal(row.source_api_company_code, DEFAULT_COMPANY_CODE);
  assert.equal(row.source_public_slug, DEFAULT_PUBLIC_SLUG);
});

test("buildVisualAssetRow respects custom companyCode in opts", () => {
  const row = buildVisualAssetRow(
    SAMPLE_V2_ROW_WITH_TEXTURE,
    SAMPLE_ORG_ID,
    null,
    null,
    { companyCode: "XYZ" }
  );
  assert.equal(row.source_api_company_code, "XYZ");
  assert.equal(row.source_asset_company_code, "XYZ");
});

test("buildVisualAssetRow respects custom publicSlug in opts", () => {
  const row = buildVisualAssetRow(
    SAMPLE_V2_ROW_WITH_TEXTURE,
    SAMPLE_ORG_ID,
    null,
    null,
    { publicSlug: "abc" }
  );
  assert.equal(row.source_public_slug, "abc");
});

// ── buildVisualAssetRow — match_method validation ────────────────────────────

console.log("\n  ── buildVisualAssetRow — match_method ─────────────────────────");

test("buildVisualAssetRow clears invalid match_method values to null", () => {
  const row = buildVisualAssetRow(
    SAMPLE_V2_ROW_WITH_TEXTURE,
    SAMPLE_ORG_ID,
    null,
    "bogus_method"
  );
  assert.equal(row.match_method, null, "invalid match_method should be null");
});

test('buildVisualAssetRow preserves valid match_method "exact"', () => {
  const row = buildVisualAssetRow(SAMPLE_V2_ROW_WITH_TEXTURE, SAMPLE_ORG_ID, null, "exact");
  assert.equal(row.match_method, "exact");
});

test('buildVisualAssetRow preserves valid match_method "alias"', () => {
  const row = buildVisualAssetRow(SAMPLE_V2_ROW_WITH_TEXTURE, SAMPLE_ORG_ID, null, "alias");
  assert.equal(row.match_method, "alias");
});

// ── buildVisualAssetRow — authority safety ────────────────────────────────────

console.log("\n  ── buildVisualAssetRow — authority safety ─────────────────────");

test("buildVisualAssetRow does NOT include source_count or any count field", () => {
  const row = buildVisualAssetRow(
    { ...SAMPLE_V2_ROW_WITH_TEXTURE, source_count: 42 },
    SAMPLE_ORG_ID,
    SAMPLE_CATALOG_ITEM_ID,
    "exact"
  );
  assert.ok(row, "should return a row");
  assert.ok(!("source_count" in row), "source_count should NOT be in output row");
  assert.ok(!("count_for_color" in row), "count_for_color should NOT be in output row");
  assert.ok(!("display_count" in row), "display_count should NOT be in output row");
});

test("buildVisualAssetRow does NOT include source_count_is_display_only field", () => {
  const row = buildVisualAssetRow(
    SAMPLE_V2_ROW_WITH_TEXTURE,
    SAMPLE_ORG_ID,
    SAMPLE_CATALOG_ITEM_ID,
    "exact"
  );
  assert.ok(!("source_count_is_display_only" in row), "should not propagate display-only flag");
});

// ── findExistingVisualAsset — mock Supabase behavior ─────────────────────────

console.log("\n  ── findExistingVisualAsset — idempotency lookup ───────────────");

await testAsync("findExistingVisualAsset returns existing row when found", async () => {
  const existingRow = {
    id: "va-uuid-0001",
    texture_hash: "abc123def456",
    catalog_item_id: SAMPLE_CATALOG_ITEM_ID,
    updated_at: "2026-01-01T00:00:00Z",
  };
  const mockSupabase = buildMockSupabaseChain([existingRow]);
  const result = await findExistingVisualAsset(mockSupabase, SAMPLE_ORG_ID, DEFAULT_COMPANY_CODE, "alabaster-esf");
  assert.ok(result, "should return existing row");
  assert.equal(result.id, "va-uuid-0001");
  assert.equal(result.texture_hash, "abc123def456");
});

await testAsync("findExistingVisualAsset returns null when not found", async () => {
  const mockSupabase = buildMockSupabaseChain([]);
  const result = await findExistingVisualAsset(mockSupabase, SAMPLE_ORG_ID, DEFAULT_COMPANY_CODE, "new-slug");
  assert.equal(result, null, "should return null when row does not exist");
});

await testAsync("findExistingVisualAsset throws on Supabase error", async () => {
  const mockSupabase = buildMockSupabaseChainError("DB connection failed");
  await assert.rejects(
    () => findExistingVisualAsset(mockSupabase, SAMPLE_ORG_ID, DEFAULT_COMPANY_CODE, "any-slug"),
    /Visual asset lookup error/
  );
});

await testAsync("findExistingVisualAsset uses is() for null product_slug", async () => {
  let wasCalledWithIs = false;
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: function() { return this; },
        is: function(field, val) {
          if (field === "product_slug" && val === null) wasCalledWithIs = true;
          return { limit: async () => ({ data: [], error: null }) };
        },
      }),
    }),
  };
  await findExistingVisualAsset(mockSupabase, SAMPLE_ORG_ID, DEFAULT_COMPANY_CODE, null);
  assert.ok(wasCalledWithIs, "should call .is('product_slug', null) for null slug");
});

// ── Safety: source scan for slab_inventory mutations ─────────────────────────

console.log("\n  ── Safety: source scan ────────────────────────────────────────");

test("slabCloudVisualAssetCache.js does not reference slab_inventory", () => {
  assert.ok(
    !CACHE_SOURCE.includes('.from("slab_inventory")') &&
    !CACHE_SOURCE.includes(".from('slab_inventory')"),
    "cache module must not query slab_inventory table"
  );
});

test("slabCloudVisualAssetCache.js does not reference count_for_color as a field", () => {
  assert.ok(
    !CACHE_SOURCE.includes('"count_for_color"') &&
    !CACHE_SOURCE.includes("'count_for_color'") &&
    !CACHE_SOURCE.includes(".count_for_color"),
    "cache module must not access count_for_color field"
  );
});

test("cacheSlabCloudV2Textures.js is write-gated by SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED", () => {
  assert.ok(
    SCRIPT_SOURCE.includes("SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED"),
    "script must check write-enable env var"
  );
});

test("cacheSlabCloudV2Textures.js does not mutate slab_inventory", () => {
  assert.ok(
    !SCRIPT_SOURCE.includes('.from("slab_inventory")'),
    'script must not query slab_inventory table'
  );
  assert.ok(
    !SCRIPT_SOURCE.includes(".from('slab_inventory')"),
    'script must not query slab_inventory table (single quotes)'
  );
});

test("cacheSlabCloudV2Textures.js does not reference count_for_color", () => {
  assert.ok(
    !SCRIPT_SOURCE.includes('"count_for_color"') &&
    !SCRIPT_SOURCE.includes("'count_for_color'") &&
    !SCRIPT_SOURCE.includes(".count_for_color"),
    "script must not access count_for_color field"
  );
});

test("cacheSlabCloudV2Textures.js does not use upsert/onConflict for writes", () => {
  assert.ok(
    !SCRIPT_SOURCE.includes(".upsert("),
    "script should use SELECT-then-INSERT/UPDATE, not upsert()"
  );
  assert.ok(
    !SCRIPT_SOURCE.includes("onConflict"),
    "script should not use onConflict"
  );
});

test("cacheSlabCloudV2Textures.js is guarded so main() only runs when directly executed", () => {
  assert.ok(
    SCRIPT_SOURCE.includes("process.argv[1]") && SCRIPT_SOURCE.includes("__filename"),
    "script must guard main() with process.argv[1] === __filename"
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMockSupabaseChain(rows) {
  const self = {
    eq:     function() { return self; },
    is:     function() { return { limit: async () => ({ data: rows, error: null }) }; },
    limit:  async () => ({ data: rows, error: null }),
  };
  return {
    from: () => ({
      select: () => self,
    }),
  };
}

function buildMockSupabaseChainError(msg) {
  const self = {
    eq:    function() { return self; },
    is:    function() { return { limit: async () => ({ data: null, error: { message: msg } }) }; },
    limit: async () => ({ data: null, error: { message: msg } }),
  };
  return {
    from: () => ({
      select: () => self,
    }),
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
