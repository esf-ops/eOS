/**
 * slabCloudManagerScopeDiagnostic — unit tests.
 *
 * Pure functions only: no network, no filesystem, no Supabase.
 * Run: npm run eos:test:slabcloud-manager-scope
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildEndpointVariants,
  extractHarImageUuids,
  compareUuidSets,
  analyzeEndpointRows,
  generateDetailVariantUrl,
  extractScriptUrls,
  extractEmbeddedConfigSnippets,
  compareHarToSupabase,
} from "./slabCloudManagerScopeDiagnostic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${label}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ── buildEndpointVariants ─────────────────────────────────────────────────────

console.log("buildEndpointVariants");

test("returns an array", () => {
  const variants = buildEndpointVariants();
  assert.ok(Array.isArray(variants));
  assert.ok(variants.length > 0);
});

test("first variant is materials", () => {
  const [first] = buildEndpointVariants();
  assert.equal(first.kind, "materials");
  assert.ok(first.url.includes("/api/materials/kbyd"));
});

test("includes type=Slab variant", () => {
  const variants = buildEndpointVariants();
  const slabVariant = variants.find((v) => v.type === "Slab");
  assert.ok(slabVariant, "should have type=Slab variant");
  assert.ok(slabVariant.url.includes("type=Slab"));
  assert.ok(slabVariant.url.includes("edges=true"));
});

test("includes type=Remnant variant", () => {
  const variants = buildEndpointVariants();
  const remnant = variants.find((v) => v.type === "Remnant");
  assert.ok(remnant, "should have type=Remnant variant");
  assert.ok(remnant.url.includes("type=Remnant"));
});

test("includes Full Slab, Full Slabs, All, no-type variants", () => {
  const variants = buildEndpointVariants();
  const types = variants.map((v) => v.type);
  assert.ok(types.includes("Full Slab"), "missing Full Slab");
  assert.ok(types.includes("Full Slabs"), "missing Full Slabs");
  assert.ok(types.includes("All"), "missing All");
  // At least two null-type slab variants (edges=true and no params)
  const nullSlab = variants.filter((v) => v.kind === "slabs" && v.type === null);
  assert.ok(nullSlab.length >= 2, "should have at least two null-type slab variants");
});

test("uses provided baseUrl and companyCode", () => {
  const variants = buildEndpointVariants("https://example.com", "test123");
  assert.ok(variants.every((v) => v.url.startsWith("https://example.com")));
  assert.ok(variants.every((v) => v.url.includes("test123")));
});

test("URL-encodes company code special characters", () => {
  const variants = buildEndpointVariants("https://slabcloud.com", "k b/yd");
  // The company code should be URL-encoded
  assert.ok(variants.every((v) => !v.url.includes("k b/yd")));
});

test("total variant count is 8", () => {
  const variants = buildEndpointVariants();
  assert.equal(variants.length, 8, "expected exactly 8 endpoint variants");
});

// ── extractHarImageUuids ──────────────────────────────────────────────────────

console.log("\nextractHarImageUuids");

const SAMPLE_UUID_1 = "437d9ca4-76b0-453b-bde9-9007ffc44c5a";
const SAMPLE_UUID_2 = "b1234567-0000-0000-0000-abcdef012345";
const SAMPLE_UUID_UPPER = "437D9CA4-76B0-453B-BDE9-9007FFC44C5A"; // uppercase in HAR

test("extracts UUID from image URL", () => {
  const text = `https://slabcloud.com/slabs/kbyd/${SAMPLE_UUID_1}.jpg`;
  const result = extractHarImageUuids(text);
  assert.ok(result.has(SAMPLE_UUID_1));
});

test("extracts UUID from thumb URL", () => {
  const text = `/slabs/kbyd/${SAMPLE_UUID_1}_thumb.jpg`;
  const result = extractHarImageUuids(text);
  assert.ok(result.has(SAMPLE_UUID_1));
});

test("normalises uppercase UUID to lowercase", () => {
  const text = `/slabs/kbyd/${SAMPLE_UUID_UPPER}.jpg`;
  const result = extractHarImageUuids(text);
  assert.ok(result.has(SAMPLE_UUID_1), "should normalise to lowercase");
  assert.ok(!result.has(SAMPLE_UUID_UPPER), "should not keep uppercase form");
});

test("extracts multiple UUIDs from HAR-like text", () => {
  const text = [
    `{"url":"https://slabcloud.com/slabs/kbyd/${SAMPLE_UUID_1}.jpg"}`,
    `{"url":"https://slabcloud.com/slabs/kbyd/${SAMPLE_UUID_2}_thumb.jpg"}`,
  ].join("\n");
  const result = extractHarImageUuids(text);
  assert.ok(result.has(SAMPLE_UUID_1));
  assert.ok(result.has(SAMPLE_UUID_2));
  assert.equal(result.size, 2);
});

test("deduplicates thumb and full UUIDs for same slab", () => {
  const text = [
    `/slabs/kbyd/${SAMPLE_UUID_1}.jpg`,
    `/slabs/kbyd/${SAMPLE_UUID_1}_thumb.jpg`,
  ].join("\n");
  const result = extractHarImageUuids(text);
  assert.equal(result.size, 1, "thumb and full should deduplicate to one UUID");
});

test("returns empty set for text with no slab image URLs", () => {
  const result = extractHarImageUuids("https://example.com/no-slab-here");
  assert.equal(result.size, 0);
});

test("handles JSON object input (not just string)", () => {
  const obj = { url: `/slabs/kbyd/${SAMPLE_UUID_1}.jpg` };
  const result = extractHarImageUuids(obj);
  assert.ok(result.has(SAMPLE_UUID_1));
});

test("handles empty/null input gracefully", () => {
  assert.equal(extractHarImageUuids("").size, 0);
  assert.equal(extractHarImageUuids(null).size, 0);
  assert.equal(extractHarImageUuids(undefined).size, 0);
});

// ── compareUuidSets ───────────────────────────────────────────────────────────

console.log("\ncompareUuidSets");

test("reports correct intersection count", () => {
  const endpointIds = [SAMPLE_UUID_1, SAMPLE_UUID_2];
  const harIds = [SAMPLE_UUID_1, "99999999-0000-0000-0000-000000000000"];
  const result = compareUuidSets(endpointIds, harIds);
  assert.equal(result.endpoint_ids_in_har_count, 1);
  assert.equal(result.har_ids_missing_from_endpoint_count, 1);
  assert.equal(result.endpoint_ids_not_in_har_count, 1);
});

test("case-insensitive comparison — uppercase endpoint vs lowercase HAR", () => {
  const endpointIds = [SAMPLE_UUID_UPPER];
  const harIds = [SAMPLE_UUID_1]; // lowercase
  const result = compareUuidSets(endpointIds, harIds);
  assert.equal(result.endpoint_ids_in_har_count, 1, "should match despite case difference");
  assert.equal(result.har_ids_missing_from_endpoint_count, 0);
});

test("case-insensitive comparison — lowercase endpoint vs uppercase HAR", () => {
  const result = compareUuidSets([SAMPLE_UUID_1], [SAMPLE_UUID_UPPER]);
  assert.equal(result.endpoint_ids_in_har_count, 1);
});

test("empty endpoint set", () => {
  const result = compareUuidSets([], [SAMPLE_UUID_1]);
  assert.equal(result.endpoint_id_count, 0);
  assert.equal(result.har_ids_missing_from_endpoint_count, 1);
  assert.equal(result.endpoint_ids_in_har_count, 0);
});

test("empty HAR set", () => {
  const result = compareUuidSets([SAMPLE_UUID_1], []);
  assert.equal(result.har_id_count, 0);
  assert.equal(result.endpoint_ids_not_in_har_count, 1);
});

test("returns sample arrays capped at 10 for large diffs", () => {
  const harIds = Array.from({ length: 25 }, (_, i) => `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, "0")}`);
  const result = compareUuidSets([], harIds);
  assert.ok(result.har_ids_missing_from_endpoint_sample.length <= 10);
});

// ── analyzeEndpointRows ───────────────────────────────────────────────────────

console.log("\nanalyzeEndpointRows");

const SAMPLE_ROWS = [
  { SlabID: SAMPLE_UUID_1, Name: "Alabaster", Material: "ESF Quartz", Rack: "79L", count: 4, Price_Group: "Promo", Thickness_Nominal: "3 cm", Width_Actual: "2.07", Length_Actual: "3.52" },
  { SlabID: SAMPLE_UUID_2, Name: "Jet Black", Material: "Granite", Rack: "W-12", count: 1, Price_Group: "C", Thickness_Nominal: "2 cm", Width_Actual: "1.80", Length_Actual: "3.00" },
  { SlabID: SAMPLE_UUID_1, Name: "Alabaster", Material: "ESF Quartz", Rack: "79L", count: 4, Price_Group: "Promo", Thickness_Nominal: "3 cm" }, // duplicate slab, same color
];

test("returns zeros for empty rows", () => {
  const result = analyzeEndpointRows([]);
  assert.equal(result.row_count, 0);
  assert.equal(result.distinct_slab_id_count, 0);
  assert.equal(result.distinct_name_count, 0);
});

test("handles null/undefined input gracefully", () => {
  assert.equal(analyzeEndpointRows(null).row_count, 0);
  assert.equal(analyzeEndpointRows(undefined).row_count, 0);
});

test("counts all rows", () => {
  const result = analyzeEndpointRows(SAMPLE_ROWS);
  assert.equal(result.row_count, 3);
});

test("deduplicates SlabIDs", () => {
  const result = analyzeEndpointRows(SAMPLE_ROWS);
  assert.equal(result.distinct_slab_id_count, 2);
});

test("deduplicates distinct names", () => {
  const result = analyzeEndpointRows(SAMPLE_ROWS);
  assert.equal(result.distinct_name_count, 2);
});

test("deduplicates distinct materials", () => {
  const result = analyzeEndpointRows(SAMPLE_ROWS);
  assert.equal(result.distinct_material_count, 2);
});

test("detects presence of count, Price_Group, Rack, Thickness_Nominal", () => {
  const result = analyzeEndpointRows(SAMPLE_ROWS);
  assert.ok(result.fields_present["count"], "count should be present");
  assert.ok(result.fields_present["Price_Group"], "Price_Group should be present");
  assert.ok(result.fields_present["Rack"], "Rack should be present");
  assert.ok(result.fields_present["Thickness_Nominal"], "Thickness_Nominal should be present");
});

test("detects presence of Width_Actual, Length_Actual", () => {
  const result = analyzeEndpointRows(SAMPLE_ROWS);
  assert.ok(result.fields_present["Width_Actual"]);
  assert.ok(result.fields_present["Length_Actual"]);
});

test("SlabID normalised to lowercase in sample", () => {
  const rows = [{ SlabID: SAMPLE_UUID_UPPER, Name: "Test" }];
  const result = analyzeEndpointRows(rows);
  assert.ok(result.sample_slab_ids[0] === SAMPLE_UUID_1, "should lowercase SlabID");
});

test("sample arrays are capped at 8 names and 5 SlabIDs", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    SlabID: `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, "0")}`,
    Name: `Color ${i}`,
    Material: "Granite",
  }));
  const result = analyzeEndpointRows(rows);
  assert.ok(result.sample_names.length <= 8);
  assert.ok(result.sample_slab_ids.length <= 5);
});

// ── generateDetailVariantUrl ──────────────────────────────────────────────────

console.log("\ngenerateDetailVariantUrl");

test("includes name param", () => {
  const url = generateDetailVariantUrl("https://slabcloud.com", "kbyd", "Alabaster", "Slab");
  assert.ok(url.includes("name=Alabaster"));
});

test("includes type param when provided", () => {
  const url = generateDetailVariantUrl("https://slabcloud.com", "kbyd", "Alabaster", "Slab");
  assert.ok(url.includes("type=Slab"));
});

test("omits type param when null", () => {
  const url = generateDetailVariantUrl("https://slabcloud.com", "kbyd", "Alabaster", null);
  assert.ok(!url.includes("type="));
});

test("always includes edges=true", () => {
  const url = generateDetailVariantUrl("https://slabcloud.com", "kbyd", "Alabaster", "Slab");
  assert.ok(url.includes("edges=true"));
});

test("URL-encodes name with spaces", () => {
  const url = generateDetailVariantUrl("https://slabcloud.com", "kbyd", "Jet Black", "Slab");
  assert.ok(!url.includes("Jet Black"), "space should be encoded");
  assert.ok(url.includes("Jet"), "name should still appear encoded");
});

// ── extractScriptUrls ─────────────────────────────────────────────────────────

console.log("\nextractScriptUrls");

test("extracts script src URLs from HTML", () => {
  const html = `<html><head>
    <script src="/js/manager.js?v=1.2.3"></script>
    <script src="/js/lib.js"></script>
  </head></html>`;
  const urls = extractScriptUrls(html);
  assert.ok(urls.includes("/js/manager.js?v=1.2.3"));
  assert.ok(urls.includes("/js/lib.js"));
  assert.equal(urls.length, 2);
});

test("returns empty array for HTML with no script tags", () => {
  assert.deepEqual(extractScriptUrls("<html></html>"), []);
});

test("handles null/empty input", () => {
  assert.deepEqual(extractScriptUrls(null), []);
  assert.deepEqual(extractScriptUrls(""), []);
});

// ── extractEmbeddedConfigSnippets ─────────────────────────────────────────────

console.log("\nextractEmbeddedConfigSnippets");

test("extracts company config snippet", () => {
  const text = `var config = { company: "kbyd", edges: true, showZoom: true };`;
  const snippets = extractEmbeddedConfigSnippets(text);
  assert.ok(snippets.some((s) => s.includes("company")));
  assert.ok(snippets.some((s) => s.includes("kbyd")));
});

test("handles text with no config keys", () => {
  const snippets = extractEmbeddedConfigSnippets("no config here");
  assert.ok(Array.isArray(snippets));
  assert.equal(snippets.length, 0);
});

test("handles null/empty input", () => {
  assert.deepEqual(extractEmbeddedConfigSnippets(null), []);
  assert.deepEqual(extractEmbeddedConfigSnippets(""), []);
});

// ── compareHarToSupabase ──────────────────────────────────────────────────────

console.log("\ncompareHarToSupabase");

test("reports HAR UUIDs missing from slab_inventory", () => {
  const harIds = [SAMPLE_UUID_1, SAMPLE_UUID_2];
  const dbIds = [SAMPLE_UUID_1]; // UUID_2 is missing from DB
  const result = compareHarToSupabase(harIds, dbIds, dbIds);
  assert.equal(result.har_missing_from_slab_inventory_count, 1);
  assert.ok(result.har_missing_from_slab_inventory_sample.includes(SAMPLE_UUID_2));
});

test("reports slab_inventory UUIDs not in HAR", () => {
  const dbOnlyId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const harIds = [SAMPLE_UUID_1];
  const dbIds = [SAMPLE_UUID_1, dbOnlyId];
  const result = compareHarToSupabase(harIds, dbIds, dbIds);
  assert.equal(result.slab_inventory_not_seen_in_har_count, 1);
  assert.ok(result.slab_inventory_not_seen_in_har_sample.includes(dbOnlyId));
});

test("case-insensitive comparison in Supabase comparison", () => {
  const result = compareHarToSupabase([SAMPLE_UUID_UPPER], [SAMPLE_UUID_1], []);
  assert.equal(result.har_missing_from_slab_inventory_count, 0, "should match despite case");
});

test("empty sets produce zero counts", () => {
  const result = compareHarToSupabase([], [], []);
  assert.equal(result.har_id_count, 0);
  assert.equal(result.slab_inventory_id_count, 0);
  assert.equal(result.har_missing_from_slab_inventory_count, 0);
});

// ── No-write contract — verify script source contains no write operations ─────

console.log("\nno-write contract (script source scan)");

test("compareSlabCloudManagerScopes.js contains no Supabase write method calls", () => {
  const scriptPath = path.join(
    __dirname,
    "../scripts/slabcloud/compareSlabCloudManagerScopes.js"
  );
  const src = readFileSync(scriptPath, "utf8");
  const writeOps = [".insert(", ".upsert(", ".update(", ".delete("];
  for (const op of writeOps) {
    assert.ok(
      !src.includes(op),
      `Script must not call ${op} — found in compareSlabCloudManagerScopes.js`
    );
  }
});

test("slabCloudManagerScopeDiagnostic.js contains no Supabase write method calls", () => {
  const helperPath = path.join(__dirname, "slabCloudManagerScopeDiagnostic.js");
  const src = readFileSync(helperPath, "utf8");
  const writeOps = [".insert(", ".upsert(", ".update(", ".delete("];
  for (const op of writeOps) {
    assert.ok(
      !src.includes(op),
      `Helper must not call ${op} — found in slabCloudManagerScopeDiagnostic.js`
    );
  }
});

test("slabCloudManagerScopeDiagnostic.js does not import PHPSESSID, cookie, or auth headers", () => {
  const helperPath = path.join(__dirname, "slabCloudManagerScopeDiagnostic.js");
  const src = readFileSync(helperPath, "utf8");
  assert.ok(!src.toLowerCase().includes("phpsessid"), "must not mention PHPSESSID");
  assert.ok(!src.toLowerCase().includes("authorization"), "must not mention Authorization header");
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
