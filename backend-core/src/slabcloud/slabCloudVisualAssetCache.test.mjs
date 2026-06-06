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
  extractTextureHashFromProductResponse,
  buildProductEndpointCandidates,
  mergeProductTextureIntoRow,
  applyDeepSweepTextures,
} from "./slabCloudVisualAssetCache.js";

import {
  runDeepSweep,
  buildVisualAssetPayloads,
  computeDryRunSummary,
} from "../scripts/slabcloud/cacheSlabCloudV2Textures.js";

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

// ── extractTextureHashFromProductResponse ────────────────────────────────────

console.log("\n  ── extractTextureHashFromProductResponse ──────────────────────");

test("returns null for null input", () => {
  assert.equal(extractTextureHashFromProductResponse(null), null);
});

test("returns null for non-object input", () => {
  assert.equal(extractTextureHashFromProductResponse("string"), null);
  assert.equal(extractTextureHashFromProductResponse(42), null);
});

test("extracts texture from top-level string field", () => {
  const raw = { texture: "abc123def456", Name: "Alabaster", Material: "ESF" };
  assert.equal(extractTextureHashFromProductResponse(raw), "abc123def456");
});

test("extracts texture from top-level Texture (PascalCase) string field", () => {
  const raw = { Texture: "xyz789", name: "Calacatta" };
  assert.equal(extractTextureHashFromProductResponse(raw), "xyz789");
});

test("extracts texture from array field — first non-empty string element", () => {
  const raw = { texture: ["", null, "first-valid-hash", "second-hash"] };
  assert.equal(extractTextureHashFromProductResponse(raw), "first-valid-hash");
});

test("extracts texture from array field — object element with hash key", () => {
  const raw = { texture: [{ hash: "obj-hash-123" }] };
  assert.equal(extractTextureHashFromProductResponse(raw), "obj-hash-123");
});

test("extracts texture from object texture field with hash key", () => {
  const raw = { texture: { hash: "nested-hash-456" } };
  assert.equal(extractTextureHashFromProductResponse(raw), "nested-hash-456");
});

test("falls back to config.texture when top-level texture is absent", () => {
  const raw = { config: { texture: "config-hash-789" }, name: "Marble" };
  assert.equal(extractTextureHashFromProductResponse(raw), "config-hash-789");
});

test("returns null when texture field is empty string", () => {
  const raw = { texture: "", Name: "Alabaster" };
  assert.equal(extractTextureHashFromProductResponse(raw), null);
});

test("returns null when no texture field anywhere", () => {
  const raw = { Name: "Alabaster", Material: "ESF", count: 5, slabs: [] };
  assert.equal(extractTextureHashFromProductResponse(raw), null);
});

test("does NOT read slab count or display count — authority guardrail", () => {
  // The function must only touch texture fields, never count/slab fields
  const raw = {
    texture: "valid-hash-aaa",
    count: 999,
    Count: 999,
    slabs: [{ id: "s1" }],
    display_count: 88,
  };
  const result = extractTextureHashFromProductResponse(raw);
  assert.equal(result, "valid-hash-aaa", "extracts texture correctly");
  // Verify the function does not return a count value
  assert.notEqual(result, 999, "must not return count");
  assert.notEqual(result, 88,  "must not return display_count");
});

// ── buildProductEndpointCandidates ───────────────────────────────────────────

console.log("\n  ── buildProductEndpointCandidates ─────────────────────────────");

const SAMPLE_ROW_WITH_TEXTURE_A = {
  product_slug: "alabaster-esf", normalized_material_name: "esf",
  source_material_name: "ESF", has_texture: true,
  source_color_name: "Alabaster",
};
const SAMPLE_ROW_NO_TEXTURE_B = {
  product_slug: "calacatta-cambria", normalized_material_name: "cambria",
  source_material_name: "Cambria", has_texture: false,
  source_color_name: "Calacatta Gold",
};
const SAMPLE_ROW_NO_TEXTURE_C = {
  product_slug: "nero-marquina-asmi", normalized_material_name: "asmi",
  source_material_name: "ASMI", has_texture: false,
  source_color_name: "Nero Marquina",
};
const SAMPLE_ROW_NO_SLUG = {
  product_slug: null, normalized_material_name: "esf",
  has_texture: false, source_color_name: "No Slug",
};

test("default onlyMissing=true only returns rows without bulk texture", () => {
  const candidates = buildProductEndpointCandidates([
    SAMPLE_ROW_WITH_TEXTURE_A, SAMPLE_ROW_NO_TEXTURE_B, SAMPLE_ROW_NO_TEXTURE_C,
  ]);
  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((c) => !c.has_texture), "all candidates should lack bulk texture");
});

test("onlyMissing=false includes rows that already have bulk texture", () => {
  const candidates = buildProductEndpointCandidates([
    SAMPLE_ROW_WITH_TEXTURE_A, SAMPLE_ROW_NO_TEXTURE_B,
  ], { onlyMissing: false });
  assert.equal(candidates.length, 2);
});

test("deduplicates by slug + normalized_material_name", () => {
  const dupRow = { ...SAMPLE_ROW_NO_TEXTURE_B }; // same slug + material
  const candidates = buildProductEndpointCandidates([
    SAMPLE_ROW_NO_TEXTURE_B, dupRow, SAMPLE_ROW_NO_TEXTURE_C,
  ]);
  assert.equal(candidates.length, 2, "duplicate slug+material should be deduplicated");
});

test("respects limit cap", () => {
  const candidates = buildProductEndpointCandidates([
    SAMPLE_ROW_NO_TEXTURE_B, SAMPLE_ROW_NO_TEXTURE_C,
  ], { limit: 1 });
  assert.equal(candidates.length, 1, "limit cap should be respected");
});

test("limit=0 means no cap", () => {
  const candidates = buildProductEndpointCandidates([
    SAMPLE_ROW_NO_TEXTURE_B, SAMPLE_ROW_NO_TEXTURE_C,
  ], { limit: 0 });
  assert.equal(candidates.length, 2);
});

test("skips rows without product_slug", () => {
  const candidates = buildProductEndpointCandidates([SAMPLE_ROW_NO_SLUG, SAMPLE_ROW_NO_TEXTURE_B]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].product_slug, "calacatta-cambria");
});

test("returns empty array for empty input", () => {
  assert.deepEqual(buildProductEndpointCandidates([]), []);
  assert.deepEqual(buildProductEndpointCandidates(null), []);
});

// ── mergeProductTextureIntoRow ────────────────────────────────────────────────

console.log("\n  ── mergeProductTextureIntoRow ──────────────────────────────────");

test("merges texture hash and computes correct texture URLs", () => {
  const merged = mergeProductTextureIntoRow(
    SAMPLE_ROW_NO_TEXTURE_B,
    "newHash123",
    "https://slabcloud.com/api/v2/product/kbyd?slug=calacatta-cambria",
    { responseKeys: ["texture", "name", "slabs"], rawTextureValue: "newHash123" },
    "https://slabcloud.com"
  );
  assert.equal(merged.texture_hash, "newHash123");
  assert.equal(merged.texture_url_600, "https://slabcloud.com/scdata/textures/600/newHash123.jpg");
  assert.equal(merged.texture_url_1024, "https://slabcloud.com/scdata/textures/1024/newHash123.jpg");
  assert.equal(merged.has_texture, true);
});

test("sets texture_discovery_source = product_endpoint in raw", () => {
  const merged = mergeProductTextureIntoRow(
    SAMPLE_ROW_NO_TEXTURE_B, "hash-abc", "https://example.com/url", null
  );
  assert.equal(merged.raw?.texture_discovery_source, "product_endpoint");
});

test("includes product_endpoint_url in raw", () => {
  const url = "https://slabcloud.com/api/v2/product/kbyd?slug=x";
  const merged = mergeProductTextureIntoRow(SAMPLE_ROW_NO_TEXTURE_B, "hash-abc", url, null);
  assert.equal(merged.raw?.product_endpoint_url, url);
});

test("returns original row unchanged when textureHash is empty", () => {
  const original = SAMPLE_ROW_NO_TEXTURE_B;
  assert.strictEqual(mergeProductTextureIntoRow(original, null, null, null), original);
  assert.strictEqual(mergeProductTextureIntoRow(original, "", null, null), original);
  assert.strictEqual(mergeProductTextureIntoRow(original, "  ", null, null), original);
});

test("does NOT include count fields in merged row", () => {
  const merged = mergeProductTextureIntoRow(
    { ...SAMPLE_ROW_NO_TEXTURE_B, source_count: 42 }, "hash-xyz", null, null
  );
  assert.ok(!("source_count" in merged) || merged.source_count === 42, "source_count is from original row only");
  // The merged row should not have added count-related fields
  assert.ok(!("display_count" in merged), "must not add display_count");
});

// ── applyDeepSweepTextures ────────────────────────────────────────────────────

console.log("\n  ── applyDeepSweepTextures ──────────────────────────────────────");

const SAMPLE_BULK_ROW = {
  product_slug: "alabaster-esf", normalized_material_name: "esf",
  source_color_name: "Alabaster", source_material_name: "ESF",
  has_texture: true, texture_hash: "bulk-hash-abc",
  texture_url_600: "https://slabcloud.com/scdata/textures/600/bulk-hash-abc.jpg",
  texture_url_1024: "https://slabcloud.com/scdata/textures/1024/bulk-hash-abc.jpg",
  raw: { Name: "Alabaster", texture: "bulk-hash-abc" },
};
const SAMPLE_NO_TEXTURE_ROW = {
  product_slug: "calacatta-cambria", normalized_material_name: "cambria",
  source_color_name: "Calacatta Gold", source_material_name: "Cambria",
  has_texture: false, texture_hash: null,
  texture_url_600: null, texture_url_1024: null,
  raw: { Name: "Calacatta Gold", texture: "" },
};

test("annotates bulk rows with texture_discovery_source = bulk_inventory", () => {
  const sweepMap = new Map();
  const enriched = applyDeepSweepTextures([SAMPLE_BULK_ROW], sweepMap);
  assert.equal(enriched[0].raw?.texture_discovery_source, "bulk_inventory");
  assert.equal(enriched[0].texture_hash, "bulk-hash-abc", "bulk texture unchanged");
});

test("merges product endpoint texture for rows without bulk texture", () => {
  const sweepMap = new Map([
    ["calacatta-cambria||cambria", {
      textureHash: "product-hash-xyz",
      url: "https://slabcloud.com/api/v2/product/kbyd?slug=calacatta-cambria",
      responseKeys: ["texture", "name"],
      rawTextureValue: "product-hash-xyz",
    }],
  ]);
  const enriched = applyDeepSweepTextures([SAMPLE_NO_TEXTURE_ROW], sweepMap);
  assert.equal(enriched[0].texture_hash, "product-hash-xyz");
  assert.equal(enriched[0].has_texture, true);
  assert.equal(enriched[0].raw?.texture_discovery_source, "product_endpoint");
});

test("does NOT overwrite bulk texture with product endpoint texture", () => {
  const sweepMap = new Map([
    ["alabaster-esf||esf", { textureHash: "different-product-hash", url: "https://x.com", responseKeys: [], rawTextureValue: "different-product-hash" }],
  ]);
  const enriched = applyDeepSweepTextures([SAMPLE_BULK_ROW], sweepMap);
  // Bulk row already has texture — should keep it and mark as bulk_inventory
  assert.equal(enriched[0].texture_hash, "bulk-hash-abc", "bulk texture not overwritten");
  assert.equal(enriched[0].raw?.texture_discovery_source, "bulk_inventory");
});

test("handles empty deep sweep map (all rows annotated as bulk_inventory)", () => {
  const enriched = applyDeepSweepTextures([SAMPLE_BULK_ROW, SAMPLE_NO_TEXTURE_ROW], new Map());
  assert.equal(enriched[0].raw?.texture_discovery_source, "bulk_inventory");
  assert.equal(enriched[1].raw?.texture_discovery_source, "bulk_inventory");
  assert.equal(enriched[1].texture_hash, null, "no-texture row stays null");
});

test("returns empty array for empty input", () => {
  assert.deepEqual(applyDeepSweepTextures([], new Map()), []);
  assert.deepEqual(applyDeepSweepTextures(null, new Map()), []);
});

// ── runDeepSweep — mock fetch ─────────────────────────────────────────────────

console.log("\n  ── runDeepSweep (mock fetch) ───────────────────────────────────");

await testAsync("runDeepSweep fetches product endpoints for each candidate", async () => {
  const calls = [];
  const mockFetch = async (url) => {
    calls.push(url);
    return { texture: "discovered-hash-001" };
  };
  const candidates = [SAMPLE_ROW_NO_TEXTURE_B];
  const { results } = await runDeepSweep(candidates, mockFetch, "https://slabcloud.com", "kbyd");
  assert.equal(calls.length, 1, "should call one product endpoint");
  assert.ok(calls[0].includes("calacatta-cambria"), "URL should include product slug");
});

await testAsync("runDeepSweep extracts texture from product response", async () => {
  const mockFetch = async () => ({ texture: "discovered-hash-002" });
  const { results } = await runDeepSweep([SAMPLE_ROW_NO_TEXTURE_B], mockFetch, "https://slabcloud.com", "kbyd");
  const result = results.get("calacatta-cambria||cambria");
  assert.ok(result, "should have a result for the candidate");
  assert.equal(result.textureHash, "discovered-hash-002");
  assert.equal(result.error, null);
});

await testAsync("runDeepSweep handles failed product endpoint with warning and continues", async () => {
  let callCount = 0;
  const mockFetch = async (url) => {
    callCount++;
    if (url.includes("calacatta")) throw new Error("Timeout");
    return { texture: "good-hash-003" };
  };
  const { results, warnings } = await runDeepSweep(
    [SAMPLE_ROW_NO_TEXTURE_B, SAMPLE_ROW_NO_TEXTURE_C],
    mockFetch, "https://slabcloud.com", "kbyd",
    { concurrency: 2 }
  );
  assert.equal(callCount, 2, "both candidates attempted");
  assert.equal(warnings.length, 1, "one warning for the failed call");
  assert.ok(warnings[0].error.includes("Timeout"), "warning includes error message");
  // Second candidate should still succeed
  const goodResult = results.get("nero-marquina-asmi||asmi");
  assert.equal(goodResult?.textureHash, "good-hash-003");
});

await testAsync("runDeepSweep product response slab count is never used", async () => {
  const mockFetch = async () => ({
    texture: "valid-hash",
    count: 999,
    slabs: [{ id: "s1", count: 5 }],
    display_count: 42,
  });
  const { results } = await runDeepSweep([SAMPLE_ROW_NO_TEXTURE_B], mockFetch, "https://slabcloud.com", "kbyd");
  const result = results.get("calacatta-cambria||cambria");
  // Only textureHash should be populated, not count fields
  assert.equal(result.textureHash, "valid-hash");
  assert.ok(!("count" in result), "count must not be in sweep result");
  assert.ok(!("display_count" in result), "display_count must not be in sweep result");
});

await testAsync("runDeepSweep respects bounded concurrency", async () => {
  const inFlightAtOnce = [];
  let maxInFlight = 0;
  let activeCount = 0;
  const mockFetch = async () => {
    activeCount++;
    maxInFlight = Math.max(maxInFlight, activeCount);
    await new Promise((r) => setTimeout(r, 10));
    activeCount--;
    return { texture: "hash" };
  };
  const candidates = [
    SAMPLE_ROW_NO_TEXTURE_B,
    SAMPLE_ROW_NO_TEXTURE_C,
    { ...SAMPLE_ROW_NO_TEXTURE_B, product_slug: "extra-1", normalized_material_name: "extra1" },
    { ...SAMPLE_ROW_NO_TEXTURE_C, product_slug: "extra-2", normalized_material_name: "extra2" },
  ];
  await runDeepSweep(candidates, mockFetch, "https://slabcloud.com", "kbyd", { concurrency: 2 });
  assert.ok(maxInFlight <= 2, `max in-flight should be ≤2 (was ${maxInFlight})`);
});

// ── computeDryRunSummary — deep sweep fields ──────────────────────────────────

console.log("\n  ── computeDryRunSummary — deep sweep fields ────────────────────");

test("computeDryRunSummary includes deep_sweep_enabled=false when no stats provided", () => {
  const summary = computeDryRunSummary([], 10, 3);
  assert.equal(summary.deep_sweep_enabled, false);
  assert.equal(summary.total_v2_rows, 10);
  assert.equal(summary.rows_with_texture, 3);
});

test("computeDryRunSummary includes before/after E100 IDs when deep sweep stats provided", () => {
  const bulkPayload = {
    catalog_item_id: "cat-001", product_slug: "alabaster-esf", match_method: "exact",
    source_color_name: "Alabaster", source_material_name: "ESF",
    texture_hash: "bulk-hash", texture_url_600: null, texture_url_1024: null,
    raw: { texture_discovery_source: "bulk_inventory" },
  };
  const sweepPayload = {
    catalog_item_id: "cat-002", product_slug: "calacatta-cambria", match_method: "exact",
    source_color_name: "Calacatta", source_material_name: "Cambria",
    texture_hash: "product-hash", texture_url_600: null, texture_url_1024: null,
    raw: { texture_discovery_source: "product_endpoint" },
  };
  const stats = {
    enabled: true, onlyMissing: true, limit: 0,
    candidateCount: 5, attempted: 5, succeeded: 4, failed: 1,
    texturesFound: 1, warnings: [{ slug: "x", material: "y", url: "u", error: "e" }],
  };
  const summary = computeDryRunSummary([bulkPayload, sweepPayload], 10, 3, stats, 100);
  assert.equal(summary.deep_sweep_enabled, true);
  assert.equal(summary.elite100_ids_with_texture_before_deep_sweep, 1, "bulk only had 1 E100");
  assert.equal(summary.elite100_ids_with_texture_after_deep_sweep, 2, "after sweep has 2");
  assert.equal(summary.elite100_still_missing_texture, 98, "100 - 2 = 98 still missing");
  assert.equal(summary.product_endpoint_textures_new_to_bulk, 1);
  assert.equal(summary.product_endpoint_calls_failed, 1);
  assert.equal(summary.sample_failed_product_calls.length, 1);
});

// ── buildVisualAssetPayloads — discovery source annotation ───────────────────

console.log("\n  ── buildVisualAssetPayloads — discovery source in raw ─────────");

test("buildVisualAssetPayloads preserves raw.texture_discovery_source from enriched row", () => {
  const enrichedRow = {
    ...SAMPLE_BULK_ROW,
    raw: { ...SAMPLE_BULK_ROW.raw, texture_discovery_source: "bulk_inventory" },
  };
  const payloads = buildVisualAssetPayloads([enrichedRow], "org-001");
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].raw?.texture_discovery_source, "bulk_inventory");
});

test("buildVisualAssetPayloads preserves product_endpoint source for sweep-enriched row", () => {
  const sweepEnrichedRow = {
    ...SAMPLE_NO_TEXTURE_ROW,
    texture_hash: "product-hash-xyz",
    texture_url_600: "https://slabcloud.com/scdata/textures/600/product-hash-xyz.jpg",
    texture_url_1024: "https://slabcloud.com/scdata/textures/1024/product-hash-xyz.jpg",
    has_texture: true,
    raw: {
      ...SAMPLE_NO_TEXTURE_ROW.raw,
      texture_discovery_source: "product_endpoint",
      product_endpoint_url: "https://slabcloud.com/api/v2/product/kbyd?slug=calacatta-cambria",
    },
  };
  const payloads = buildVisualAssetPayloads([sweepEnrichedRow], "org-001");
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].raw?.texture_discovery_source, "product_endpoint");
  assert.ok(payloads[0].raw?.product_endpoint_url?.includes("calacatta"), "product URL preserved");
});

// ── Safety: source scan (updated) ────────────────────────────────────────────

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

test("cacheSlabCloudV2Textures.js deep sweep gated by SLABCLOUD_V2_TEXTURE_DEEP_SWEEP", () => {
  assert.ok(
    SCRIPT_SOURCE.includes("SLABCLOUD_V2_TEXTURE_DEEP_SWEEP"),
    "script must check deep sweep env var"
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

test("cacheSlabCloudV2Textures.js deep sweep uses bounded concurrency", () => {
  assert.ok(
    SCRIPT_SOURCE.includes("SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_CONCURRENCY"),
    "script must respect concurrency setting"
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
