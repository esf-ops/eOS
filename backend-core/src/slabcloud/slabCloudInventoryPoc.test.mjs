/**
 * SlabCloud inventory POC — unit tests.
 *
 * Pure functions only; no network, no filesystem, no Supabase.
 * Run: npm run eos:test:slabcloud-inventory
 */
import assert from "node:assert/strict";

import {
  metersToInches,
  normalizeSlabRecord,
  normalizeSlabRecords,
  buildImageUrlGuesses,
  extractDistinctColorNames,
  summarizeInventory,
  toFiniteNumber,
  SLABCLOUD_EXTERNAL_SOURCE,
} from "./normalizeSlabCloudInventory.js";

import {
  buildRequestHeaders,
  assertNoAuthHeaders,
  buildMaterialsUrl,
  buildSlabSummaryUrl,
  buildSlabDetailUrl,
  buildClientConfig,
  mapWithConcurrency,
} from "./slabCloudClient.js";

// Sample detail record from the SlabCloud manager page (ESF / company "kbyd").
const SAMPLE = {
  SlabID: "437D9CA4-76B0-453B-BDE9-9007FFC44C5A",
  Name: "Alabaster",
  Material: "ESF Quartz",
  UsableArea: null,
  Width_Actual: "2.07475210775013",
  Length_Actual: "3.52267981545561",
  InventoryID: "55817",
  Thickness_Nominal: "3 cm",
  Rack: "79L",
  Lot: "5999-14",
  UsableA: "3441.754",
  UsableD: "1980.318",
  Price_Group: "B",
  Distributor: "ESF",
  count: 3,
};

// ── meter → inch conversion matches the screen-observed values ───────────────
{
  assert.equal(metersToInches("2.07475210775013"), 81.68, "width m→in");
  assert.equal(metersToInches("3.52267981545561"), 138.69, "length m→in");
  assert.equal(metersToInches(2.07475210775013), 81.68, "numeric input ok");
  assert.equal(metersToInches(null), null, "null → null");
  assert.equal(metersToInches(""), null, "empty string → null");
  assert.equal(metersToInches("not-a-number"), null, "garbage → null");
  console.log("ok: meter→inch conversion");
}

// ── toFiniteNumber helper ────────────────────────────────────────────────────
{
  assert.equal(toFiniteNumber("3"), 3, "string number");
  assert.equal(toFiniteNumber(0), 0, "zero preserved");
  assert.equal(toFiniteNumber(null), null, "null");
  assert.equal(toFiniteNumber(undefined), null, "undefined");
  assert.equal(toFiniteNumber("  "), null, "whitespace");
  assert.equal(toFiniteNumber(NaN), null, "NaN → null");
  console.log("ok: toFiniteNumber");
}

// ── sample detail record normalizes correctly ────────────────────────────────
{
  const r = normalizeSlabRecord(SAMPLE, { companyCode: "kbyd" });

  assert.equal(r.external_source, SLABCLOUD_EXTERNAL_SOURCE, "external_source");
  assert.equal(r.external_company_code, "kbyd", "company code");
  assert.equal(r.external_slab_id, SAMPLE.SlabID, "slab id");
  assert.equal(r.inventory_id, "55817", "inventory id");
  assert.equal(r.color_name, "Alabaster", "color");
  assert.equal(r.material_name, "ESF Quartz", "material");
  assert.equal(r.distributor, "ESF", "distributor");
  assert.equal(r.price_group, "B", "price group");
  assert.equal(r.thickness_nominal, "3 cm", "thickness");
  assert.equal(r.rack, "79L", "rack");
  assert.equal(r.lot, "5999-14", "lot");
  assert.equal(r.count_for_color, 3, "count");

  assert.equal(r.width_actual_m, 2.07475210775013, "width m raw");
  assert.equal(r.length_actual_m, 3.52267981545561, "length m raw");
  assert.equal(r.width_actual_in, 81.68, "width in");
  assert.equal(r.length_actual_in, 138.69, "length in");

  // Uncertain fields preserved as raw strings, not interpreted.
  assert.equal(r.usable_a_raw, "3441.754", "usable A raw preserved");
  assert.equal(r.usable_d_raw, "1980.318", "usable D raw preserved");

  // Raw original retained intact.
  assert.deepEqual(r.raw, SAMPLE, "raw record retained");
  console.log("ok: sample detail record normalization");
}

// ── missing / null fields do not crash ───────────────────────────────────────
{
  const empty = normalizeSlabRecord({}, { companyCode: "kbyd" });
  assert.equal(empty.external_slab_id, null, "missing slab id → null");
  assert.equal(empty.color_name, null, "missing color → null");
  assert.equal(empty.width_actual_in, null, "missing width → null");
  assert.equal(empty.count_for_color, null, "missing count → null");
  assert.equal(empty.image_url_guess, null, "no slab id → no image guess");

  // Completely invalid inputs.
  assert.doesNotThrow(() => normalizeSlabRecord(null), "null record");
  assert.doesNotThrow(() => normalizeSlabRecord(undefined), "undefined record");
  assert.doesNotThrow(() => normalizeSlabRecord("nope"), "string record");
  assert.deepEqual(normalizeSlabRecords(null), [], "null array → []");
  assert.deepEqual(normalizeSlabRecords("nope"), [], "non-array → []");
  console.log("ok: missing/null fields do not crash");
}

// ── image URL guesses are constructed correctly ──────────────────────────────
{
  const g = buildImageUrlGuesses({
    baseUrl: "https://slabcloud.com",
    companyCode: "kbyd",
    slabId: SAMPLE.SlabID,
  });
  assert.equal(
    g.image_url_guess,
    `https://slabcloud.com/slabs/kbyd/${SAMPLE.SlabID}.jpg`,
    "image guess"
  );
  assert.equal(
    g.thumbnail_url_guess,
    `https://slabcloud.com/slabs/kbyd/${SAMPLE.SlabID}_thumb.jpg`,
    "thumb guess"
  );

  // Trailing slash on base URL is normalized.
  const g2 = buildImageUrlGuesses({
    baseUrl: "https://slabcloud.com/",
    companyCode: "kbyd",
    slabId: "X",
  });
  assert.equal(g2.image_url_guess, "https://slabcloud.com/slabs/kbyd/X.jpg", "trailing slash normalized");

  // Missing inputs → nulls (no broken URLs).
  const g3 = buildImageUrlGuesses({ companyCode: "kbyd", slabId: null });
  assert.equal(g3.image_url_guess, null, "missing slab id → null guess");
  console.log("ok: image URL guesses");
}

// ── summary aggregation counts slabs/colors/materials ────────────────────────
{
  const raw = [
    SAMPLE,
    { ...SAMPLE, SlabID: "B", Name: "Alabaster", count: 2 }, // same color, different slab
    { ...SAMPLE, SlabID: "C", Name: "Calacatta", Material: "ESF Marble", Distributor: "OtherDist", count: 5 },
    { ...SAMPLE, SlabID: "", Name: "NoId", Width_Actual: null, Length_Actual: null, count: 1 },
  ];
  const normalized = normalizeSlabRecords(raw, { companyCode: "kbyd" });
  const summary = summarizeInventory(normalized, {
    warnings: ["w1"],
    materials: [{ Material: "ESF Quartz" }, { Material: "ESF Marble" }],
  });

  assert.equal(summary.slabRecordCount, 4, "record count");
  assert.equal(summary.distinctColorCount, 3, "distinct colors (Alabaster, Calacatta, NoId)");
  assert.equal(summary.distinctMaterialCount, 2, "distinct materials");
  assert.equal(summary.distinctDistributorCount, 2, "distinct distributors");
  assert.equal(summary.materialsEndpointCount, 2, "materials endpoint count");
  assert.equal(summary.summedSlabCount, 3 + 2 + 5 + 1, "summed slab count");
  assert.equal(summary.recordsMissingDimensions, 1, "one record missing dimensions");
  assert.equal(summary.recordsMissingSlabId, 1, "one record missing slab id");
  assert.equal(summary.warningCount, 1, "warning count");
  console.log("ok: summary aggregation");
}

// ── extractDistinctColorNames ────────────────────────────────────────────────
{
  const names = extractDistinctColorNames([
    { Name: "Alabaster" },
    { Name: "Alabaster" },
    { Name: "Calacatta" },
    { Name: "" },
    { nope: true },
  ]);
  assert.deepEqual(names, ["Alabaster", "Calacatta"], "distinct, first-seen order");
  assert.deepEqual(extractDistinctColorNames(null), [], "null → []");
  console.log("ok: extractDistinctColorNames");
}

// ── no auth/cookie assumptions exist in client config ────────────────────────
{
  const headers = buildRequestHeaders();
  const keys = Object.keys(headers).map((k) => k.toLowerCase());
  assert.ok(!keys.includes("cookie"), "no cookie header");
  assert.ok(!keys.includes("authorization"), "no authorization header");
  assert.ok(!keys.includes("x-auth-token"), "no x-auth-token header");
  assert.ok(keys.includes("user-agent"), "has user-agent");
  assert.ok(keys.includes("accept"), "has accept");

  // Guard rejects forbidden headers if someone tries to add them later.
  assert.throws(() => assertNoAuthHeaders({ Cookie: "PHPSESSID=abc" }), /forbidden/, "rejects Cookie");
  assert.throws(() => assertNoAuthHeaders({ Authorization: "Bearer x" }), /forbidden/, "rejects Authorization");
  assert.doesNotThrow(() => assertNoAuthHeaders(buildRequestHeaders()), "clean headers ok");

  // Config has no credential fields.
  const cfg = buildClientConfig();
  assert.ok(!("cookie" in cfg), "config has no cookie");
  assert.ok(!("token" in cfg), "config has no token");
  assert.ok(!("authorization" in cfg), "config has no authorization");
  assert.equal(cfg.companyCode, "kbyd", "default company code configurable");
  console.log("ok: no auth/cookie assumptions in client");
}

// ── URL builders use configurable company code ───────────────────────────────
{
  assert.equal(buildMaterialsUrl({ companyCode: "kbyd" }), "https://slabcloud.com/api/materials/kbyd", "materials url");
  assert.equal(
    buildSlabSummaryUrl({ companyCode: "kbyd", type: "Slab", edges: true }),
    "https://slabcloud.com/api/slabs/kbyd?type=Slab&edges=true",
    "summary url"
  );
  assert.equal(
    buildSlabDetailUrl({ companyCode: "kbyd", name: "Alabaster", type: "Slab", edges: true }),
    "https://slabcloud.com/api/slabs/kbyd?name=Alabaster&type=Slab&edges=true",
    "detail url"
  );
  // Company code is not hardcoded — a different code flows through.
  assert.ok(buildMaterialsUrl({ companyCode: "acme" }).endsWith("/api/materials/acme"), "alt company code");
  console.log("ok: URL builders + configurable company code");
}

// ── mapWithConcurrency preserves order and bounds parallelism ────────────────
{
  const items = [1, 2, 3, 4, 5];
  const out = await mapWithConcurrency(items, 2, async (n) => n * 2);
  assert.deepEqual(out, [2, 4, 6, 8, 10], "order preserved");
  assert.deepEqual(await mapWithConcurrency([], 2, async (n) => n), [], "empty input");
  console.log("ok: mapWithConcurrency");
}

console.log("\nslabCloudInventoryPoc: all tests passed");
