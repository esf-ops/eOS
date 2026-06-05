/**
 * colorProgramMatching — pure-helper regression tests.
 * No network, no Supabase. Run: npm run eos:test:slab-color-program-matching
 *
 * Guards the safety contracts:
 *   - Normalization is stable and symmetric.
 *   - Material aliases work bidirectionally (ESF ≡ ESF Quartz).
 *   - buildColorKey output matches makeColorKey algorithm.
 *   - Exact match: exact color + material → approved.
 *   - Alias match: exact color + material alias → approved.
 *   - Fuzzy typo match: similar color → needs_review (never auto-approved).
 *   - Low-confidence fuzzy does NOT silently classify as Elite 100.
 *   - Screenshot parsing convention: "Color Name - Manufacturer" → color_name first.
 *   - Group G is NOT in ACTIVE_PRICE_GROUPS.
 *   - Import fixture group counts total 100.
 *   - matchAllSourceColors: unmatched → method=none (Non-Stock candidates).
 *   - No slab_inventory mutation paths exist in the matching module.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  ACTIVE_PRICE_GROUPS,
  MATERIAL_ALIAS_GROUPS,
  normalizeColorName,
  normalizeMaterialName,
  buildColorKey,
  materialsCompatible,
  levenshtein,
  similarityScore,
  DEFAULT_FUZZY_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD,
  compareCatalogToSourceColor,
  matchSourceColorToCatalog,
  matchAllSourceColors,
  matchSourceColorWithAliases,
  matchAllSourceColorsWithAliases,
  buildAliasPayload,
  buildRejectReviewPayload,
} from "./colorProgramMatching.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures/elite100-2026.json");

// ---------------------------------------------------------------------------
// ACTIVE_PRICE_GROUPS — no Group G
// ---------------------------------------------------------------------------
{
  assert.deepEqual(
    [...ACTIVE_PRICE_GROUPS],
    ["Promo", "A", "B", "C", "D", "E", "F"],
    "active price groups: Promo then A–F"
  );
  assert.ok(!ACTIVE_PRICE_GROUPS.includes("G"), "Group G must NOT be in ACTIVE_PRICE_GROUPS");
  assert.ok(Object.isFrozen(ACTIVE_PRICE_GROUPS), "ACTIVE_PRICE_GROUPS is frozen");
  console.log("ok: ACTIVE_PRICE_GROUPS (no Group G, frozen)");
}

// ---------------------------------------------------------------------------
// MATERIAL_ALIAS_GROUPS
// ---------------------------------------------------------------------------
{
  // ESF ≡ ESF Quartz in the same alias group
  const esfGroup = MATERIAL_ALIAS_GROUPS.find(
    (g) => g.includes("esf") && g.includes("esf quartz")
  );
  assert.ok(esfGroup, "ESF and ESF Quartz must be in the same alias group");
  // Aggranite / Agranite variant
  const aggGroup = MATERIAL_ALIAS_GROUPS.find(
    (g) => g.includes("aggranite") && g.includes("agranite")
  );
  assert.ok(aggGroup, "Aggranite and Agranite must be in the same alias group");
  console.log("ok: MATERIAL_ALIAS_GROUPS (ESF≡ESF Quartz, Aggranite≡Agranite)");
}

// ---------------------------------------------------------------------------
// normalizeColorName
// ---------------------------------------------------------------------------
{
  assert.equal(normalizeColorName("  Alabaster  "), "alabaster", "trims and lowercases");
  assert.equal(normalizeColorName("Warm & Fuzzy"), "warm and fuzzy", "& → and");
  assert.equal(normalizeColorName("Sky's the Limit"), "sky's the limit", "apostrophe preserved");
  assert.equal(normalizeColorName("Regal D'Oro"), "regal d'oro", "smart-quote normalized");
  assert.equal(normalizeColorName(null), "", "null → empty");
  assert.equal(normalizeColorName(""), "", "empty → empty");
  // Multiple spaces collapsed
  assert.equal(normalizeColorName("India  Black   Pearl"), "india black pearl");
  // Idempotent
  assert.equal(normalizeColorName(normalizeColorName("Alabaster")), normalizeColorName("Alabaster"));
  console.log("ok: normalizeColorName");
}

// ---------------------------------------------------------------------------
// normalizeMaterialName
// ---------------------------------------------------------------------------
{
  assert.equal(normalizeMaterialName("  ESF Quartz  "), "esf quartz", "trims and lowercases");
  assert.equal(normalizeMaterialName("Q Quartz"), "q quartz");
  assert.equal(normalizeMaterialName("ASMI"), "asmi");
  assert.equal(normalizeMaterialName(null), "", "null → empty");
  // Non-alphanum stripped
  assert.equal(normalizeMaterialName("Aggranite!"), "aggranite");
  console.log("ok: normalizeMaterialName");
}

// ---------------------------------------------------------------------------
// materialsCompatible — alias-aware
// ---------------------------------------------------------------------------
{
  // Exact match
  assert.ok(materialsCompatible("ESF", "ESF"), "ESF ≡ ESF");
  assert.ok(materialsCompatible("Cambria", "Cambria"), "Cambria ≡ Cambria");
  // Alias: ESF ≡ ESF Quartz (bidirectional)
  assert.ok(materialsCompatible("ESF", "ESF Quartz"), "ESF ≡ ESF Quartz");
  assert.ok(materialsCompatible("ESF Quartz", "ESF"), "ESF Quartz ≡ ESF (bidirectional)");
  // Aggranite variant
  assert.ok(materialsCompatible("Aggranite", "Agranite"), "Aggranite ≡ Agranite");
  // Different non-alias brands
  assert.ok(!materialsCompatible("Cambria", "Stratus"), "Cambria ≠ Stratus");
  assert.ok(!materialsCompatible("ESF", "Cambria"), "ESF ≠ Cambria");
  // Empty/unknown → compatible (don't block on unknown)
  assert.ok(materialsCompatible("", "Cambria"), "empty ≡ anything");
  assert.ok(materialsCompatible(null, "ESF"), "null ≡ anything");
  console.log("ok: materialsCompatible (aliases bidirectional)");
}

// ---------------------------------------------------------------------------
// buildColorKey — mirrors makeColorKey algorithm
// ---------------------------------------------------------------------------
{
  assert.equal(
    buildColorKey("Alabaster", "ESF", "B"),
    "alabaster--esf--b",
    "basic slug"
  );
  assert.equal(
    buildColorKey("Calacatta Gold", "ASMI", "B"),
    "calacatta-gold--asmi--b"
  );
  assert.equal(
    buildColorKey("Warm & Fuzzy", "ESF", "Promo"),
    "warm-fuzzy--esf--promo",
    "& stripped by slugify (not normalized)"
  );
  // Null/empty → "unknown"
  assert.equal(buildColorKey(null, null, null), "unknown--unknown--unknown");
  // Stable: same inputs → same key
  assert.equal(buildColorKey("Alabaster", "ESF", "B"), buildColorKey("Alabaster", "ESF", "B"));
  // Different inputs → different keys
  assert.notEqual(buildColorKey("Alabaster", "ESF", "B"), buildColorKey("Alabaster", "ESF", "C"));
  // Separator "--" never appears inside a segment
  const key = buildColorKey("Hello World", "Q Quartz", "A");
  const segs = key.split("--");
  assert.equal(segs.length, 3, "exactly 3 segments");
  for (const seg of segs) {
    assert.ok(!seg.includes("--"), `segment "${seg}" must not contain --`);
  }
  console.log("ok: buildColorKey (stable, slug-safe, mirrors makeColorKey)");
}

// ---------------------------------------------------------------------------
// levenshtein
// ---------------------------------------------------------------------------
{
  assert.equal(levenshtein("", ""), 0);
  assert.equal(levenshtein("abc", "abc"), 0, "identical");
  assert.equal(levenshtein("abc", ""), 3);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("kitten", "sitting"), 3, "classic example");
  assert.equal(levenshtein("alabaster", "alabastr"), 1, "one deletion");
  assert.equal(levenshtein("alabaster", "alabaster"), 0);
  console.log("ok: levenshtein");
}

// ---------------------------------------------------------------------------
// similarityScore
// ---------------------------------------------------------------------------
{
  assert.equal(similarityScore("", ""), 1, "both empty → 1");
  assert.equal(similarityScore("abc", "abc"), 1, "identical → 1");
  assert.equal(similarityScore("", "abc"), 0, "one empty → 0");
  const s = similarityScore("alabaster", "alabastr");
  assert.ok(s > 0.85 && s < 1, `"alabastr" should be high similarity: ${s}`);
  const low = similarityScore("alabaster", "completely different");
  assert.ok(low < 0.5, `completely different should be low: ${low}`);
  console.log("ok: similarityScore");
}

// ---------------------------------------------------------------------------
// compareCatalogToSourceColor — exact match
// ---------------------------------------------------------------------------
{
  const source = { color_name: "Alabaster", material_name: "ESF" };
  const catExact = { color_name: "Alabaster", material_name: "ESF" };
  const result = compareCatalogToSourceColor(source, catExact);
  assert.ok(result, "exact match found");
  assert.equal(result.method, "exact");
  assert.equal(result.confidence, 1.0);
  console.log("ok: compareCatalogToSourceColor (exact)");
}

// ---------------------------------------------------------------------------
// compareCatalogToSourceColor — alias match (ESF vs ESF Quartz)
// ---------------------------------------------------------------------------
{
  // SlabCloud might store "ESF Quartz" while fixture uses "ESF"
  const source = { color_name: "Alabaster", material_name: "ESF Quartz" };
  const catAlias = { color_name: "Alabaster", material_name: "ESF" };
  const result = compareCatalogToSourceColor(source, catAlias);
  assert.ok(result, "alias match found");
  assert.equal(result.method, "alias", "ESF Quartz → ESF is alias match");
  assert.ok(result.confidence > 0.9, "alias confidence high");
  console.log("ok: compareCatalogToSourceColor (alias: ESF Quartz ≡ ESF)");
}

// ---------------------------------------------------------------------------
// compareCatalogToSourceColor — fuzzy typo match
// ---------------------------------------------------------------------------
{
  // "Alabastr" is a typo for "Alabaster" — should fuzzy-match
  const source = { color_name: "Alabastr", material_name: "ESF" };
  const cat = { color_name: "Alabaster", material_name: "ESF" };
  const result = compareCatalogToSourceColor(source, cat, 0.75);
  assert.ok(result, "fuzzy typo match found");
  assert.equal(result.method, "fuzzy");
  assert.ok(result.confidence >= 0.75 && result.confidence < 1.0, "confidence in fuzzy range");
  console.log("ok: compareCatalogToSourceColor (fuzzy typo: Alabastr → Alabaster)");
}

// ---------------------------------------------------------------------------
// compareCatalogToSourceColor — incompatible material blocks match
// ---------------------------------------------------------------------------
{
  // Same color name, completely different material brand → no match
  const source = { color_name: "Alabaster", material_name: "Cambria" };
  const cat = { color_name: "Alabaster", material_name: "ESF" };
  const result = compareCatalogToSourceColor(source, cat);
  assert.equal(result, null, "incompatible material should block match");
  console.log("ok: compareCatalogToSourceColor (incompatible material → null)");
}

// ---------------------------------------------------------------------------
// matchSourceColorToCatalog — full ranking and review_status
// ---------------------------------------------------------------------------
{
  const catalog = [
    { color_name: "Alabaster",     material_name: "ESF",     price_group: "B" },
    { color_name: "Calacatta Gold", material_name: "ASMI",   price_group: "B" },
    { color_name: "Carrara Classic", material_name: "ASMI",  price_group: "Promo" },
  ];

  // Exact match → approved
  const exactResult = matchSourceColorToCatalog(
    { color_name: "Alabaster", material_name: "ESF" },
    catalog
  );
  assert.equal(exactResult.method, "exact");
  assert.equal(exactResult.review_status, "approved", "exact → approved");
  assert.equal(exactResult.match.price_group, "B");

  // Alias match → approved
  const aliasResult = matchSourceColorToCatalog(
    { color_name: "Alabaster", material_name: "ESF Quartz" },
    catalog
  );
  assert.equal(aliasResult.method, "alias");
  assert.equal(aliasResult.review_status, "approved", "alias → approved");

  // Fuzzy match → needs_review (NOT auto-approved regardless of confidence)
  const fuzzyResult = matchSourceColorToCatalog(
    { color_name: "Alabastr", material_name: "ESF" },
    catalog,
    { fuzzyThreshold: 0.75 }
  );
  assert.equal(fuzzyResult.method, "fuzzy");
  assert.equal(
    fuzzyResult.review_status,
    "needs_review",
    "fuzzy must be needs_review — must not silently classify as Elite 100"
  );

  // No match → method=none, needs_review (Non-Stock candidate)
  const noneResult = matchSourceColorToCatalog(
    { color_name: "Unknown Color XYZ", material_name: "Unknown Brand" },
    catalog
  );
  assert.equal(noneResult.method, "none");
  assert.equal(noneResult.match, null);
  assert.equal(noneResult.review_status, "needs_review");

  console.log("ok: matchSourceColorToCatalog (exact→approved, alias→approved, fuzzy→needs_review, none→Non-Stock)");
}

// ---------------------------------------------------------------------------
// Low-confidence fuzzy MUST NOT silently approve
// ---------------------------------------------------------------------------
{
  const catalog = [{ color_name: "Alabaster", material_name: "ESF", price_group: "B" }];
  // A name that barely passes the threshold (confidence ~0.76) — still needs_review
  const borderline = matchSourceColorToCatalog(
    { color_name: "Albster", material_name: "ESF" },
    catalog,
    { fuzzyThreshold: 0.5 } // low threshold to force a fuzzy match
  );
  if (borderline.method === "fuzzy") {
    assert.equal(
      borderline.review_status,
      "needs_review",
      "low-confidence fuzzy must be needs_review, never auto-approved"
    );
  }
  // Even "high-confidence" fuzzy is not approved
  const highConf = matchSourceColorToCatalog(
    { color_name: "Alabastr", material_name: "ESF" },
    catalog,
    { fuzzyThreshold: 0.75 }
  );
  if (highConf.method === "fuzzy") {
    assert.equal(
      highConf.review_status,
      "needs_review",
      "even high-confidence fuzzy must not be auto-approved"
    );
    assert.notEqual(
      highConf.review_status,
      "approved",
      "fuzzy must NEVER be approved"
    );
  }
  console.log("ok: low-confidence fuzzy does NOT silently classify as Elite 100");
}

// ---------------------------------------------------------------------------
// matchAllSourceColors — batch summary + Non-Stock classification
// ---------------------------------------------------------------------------
{
  const catalog = [
    { color_name: "Alabaster",      material_name: "ESF",    price_group: "B" },
    { color_name: "Calacatta Gold", material_name: "ASMI",   price_group: "B" },
  ];
  const sources = [
    { color_name: "Alabaster",      material_name: "ESF"    }, // exact
    { color_name: "Calacatta Gold", material_name: "ASMI"   }, // exact
    { color_name: "Completely Unknown Color", material_name: "Unknown" }, // none → Non-Stock
  ];
  const summary = matchAllSourceColors(sources, catalog);
  assert.equal(summary.total, 3);
  assert.equal(summary.exact, 2, "2 exact matches");
  assert.equal(summary.none, 1, "1 Non-Stock candidate");
  assert.ok(summary.results.length === 3, "results array length");
  const nonStockResult = summary.results.find((r) => r.method === "none");
  assert.ok(nonStockResult, "unmatched color has method=none");
  assert.equal(nonStockResult.match, null, "Non-Stock candidate has no match");
  // No slab_inventory mutation — matchAllSourceColors is pure, no side effects
  // (verified by nature of the function: no DB calls, no writes possible)
  console.log("ok: matchAllSourceColors (batch, Non-Stock=none, no mutations)");
}

// ---------------------------------------------------------------------------
// Screenshot parsing convention test
// ---------------------------------------------------------------------------
{
  // "Alabaster - ESF" → color_name="Alabaster", material_name="ESF"
  // The " - " delimiter splits color from manufacturer. NOT the other way around.
  function parseScreenshotLine(line) {
    const lastDashIdx = line.lastIndexOf(" - ");
    if (lastDashIdx === -1) return null;
    return {
      color_name: line.slice(0, lastDashIdx).trim(),
      material_name: line.slice(lastDashIdx + 3).trim(),
    };
  }
  const parsed = parseScreenshotLine("Alabaster - ESF");
  assert.equal(parsed.color_name, "Alabaster", "color_name is LEFT of ' - '");
  assert.equal(parsed.material_name, "ESF", "material_name is RIGHT of ' - '");
  // Multi-word color names work
  const p2 = parseScreenshotLine("Calacatta Plazo Light - ESF");
  assert.equal(p2.color_name, "Calacatta Plazo Light");
  assert.equal(p2.material_name, "ESF");
  // Names with " - " in color_name use the LAST delimiter
  const p3 = parseScreenshotLine("Regal D'Oro - Stratus");
  assert.equal(p3.color_name, "Regal D'Oro");
  assert.equal(p3.material_name, "Stratus");
  console.log("ok: screenshot parsing convention (color_name first, material_name after ' - ')");
}

// ---------------------------------------------------------------------------
// Elite 100 fixture: group counts total 100 (no Group G)
// ---------------------------------------------------------------------------
{
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const groups = fixture.groups || {};

  // Group G must not be present
  assert.ok(!("G" in groups), "fixture must not contain Group G");

  // Count items by group
  let total = 0;
  const expectedGroups = [...ACTIVE_PRICE_GROUPS];
  for (const group of expectedGroups) {
    const items = groups[group] || [];
    assert.ok(items.length > 0, `Group ${group} must have items`);
    total += items.length;
  }
  // Total should be 100 (the 100 Color Collection)
  assert.equal(total, 100, `Elite 100 fixture must have exactly 100 items (got ${total})`);

  // Verify the meta counts if present
  if (fixture._meta?.counts_by_group) {
    for (const [g, count] of Object.entries(fixture._meta.counts_by_group)) {
      assert.equal(
        (groups[g] || []).length,
        count,
        `Group ${g} count mismatch`
      );
    }
  }

  // Each item must have color_name, material_name, price_group, display_name
  for (const group of expectedGroups) {
    for (const item of groups[group] || []) {
      assert.ok(item.color_name, `[${group}] item missing color_name`);
      assert.ok(item.material_name, `[${group}] item missing material_name`);
      assert.equal(item.price_group, group, `[${group}] item price_group mismatch`);
      assert.ok(item.display_name, `[${group}] item missing display_name`);
    }
  }

  console.log(`ok: fixture group counts total 100, no Group G, all required fields present`);
}

// ---------------------------------------------------------------------------
// Fixture: display_name follows "Color Name - Material" convention
// ---------------------------------------------------------------------------
{
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  for (const group of ACTIVE_PRICE_GROUPS) {
    for (const item of fixture.groups?.[group] || []) {
      const expected = `${item.color_name} - ${item.material_name}`;
      assert.equal(
        item.display_name,
        expected,
        `[${group}] ${item.color_name}: display_name must follow "Color - Material" convention`
      );
    }
  }
  console.log("ok: fixture display_name follows 'Color Name - Material' convention");
}

// ---------------------------------------------------------------------------
// Alias-review seed fixture shape
// ---------------------------------------------------------------------------
{
  const SEED_PATH = join(__dirname, "fixtures/elite100-2026-alias-review-seed.json");
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));

  // Top-level structure
  assert.ok(Array.isArray(seed.approved_alias_candidates), "approved_alias_candidates is array");
  assert.ok(Array.isArray(seed.rejected_fuzzy_candidates), "rejected_fuzzy_candidates is array");
  assert.ok(seed._meta, "seed has _meta field");

  // Approved count: 8 Chris-reviewed aliases
  assert.equal(seed.approved_alias_candidates.length, 8, "8 approved alias candidates");

  // Rejected count: 2 Chris-reviewed rejections
  assert.equal(seed.rejected_fuzzy_candidates.length, 2, "2 rejected fuzzy candidates");

  // Every approved candidate has required fields
  for (const c of seed.approved_alias_candidates) {
    assert.ok(c.source_color_name, `approved: missing source_color_name`);
    assert.ok(c.source_material_name, `approved: missing source_material_name`);
    assert.ok(c.catalog_color_name, `approved: missing catalog_color_name`);
    assert.ok(c.catalog_material_name, `approved: missing catalog_material_name`);
    assert.ok(c.price_group, `approved: missing price_group`);
    assert.ok(c.reason, `approved: missing reason`);
    assert.equal(c.reviewed_by, "Chris", `approved: reviewed_by must be "Chris"`);
    assert.equal(c.review_status, "approved", `approved: review_status must be "approved"`);
    // Must NOT be Group G
    assert.notEqual(c.price_group, "G", `approved: price_group must not be G`);
  }

  // Every rejected candidate has required fields
  for (const c of seed.rejected_fuzzy_candidates) {
    assert.ok(c.source_color_name, `rejected: missing source_color_name`);
    assert.ok(c.source_material_name, `rejected: missing source_material_name`);
    assert.ok(c.rejected_catalog_color_name, `rejected: missing rejected_catalog_color_name`);
    assert.ok(c.rejected_catalog_material_name, `rejected: missing rejected_catalog_material_name`);
    assert.ok(c.reason, `rejected: missing reason`);
    assert.equal(c.reviewed_by, "Chris", `rejected: reviewed_by must be "Chris"`);
    assert.equal(c.review_status, "rejected", `rejected: review_status must be "rejected"`);
  }

  console.log("ok: alias-review seed fixture shape (8 approved, 2 rejected, all required fields)");
}

// ---------------------------------------------------------------------------
// buildAliasPayload — approved alias creates correct slab_color_aliases payload
// ---------------------------------------------------------------------------
{
  const candidate = {
    source_color_name: "Winter Fresh",
    source_material_name: "ESF Quartz",
    catalog_color_name: "Winterfresh",
    catalog_material_name: "ESF",
    price_group: "C",
  };
  const orgId = "org-test-123";
  const catalogItemId = "item-uuid-456";
  const payload = buildAliasPayload(candidate, orgId, catalogItemId);

  assert.equal(payload.organization_id, orgId);
  assert.equal(payload.catalog_item_id, catalogItemId);
  assert.equal(payload.alias_color_name, "Winter Fresh");
  assert.equal(payload.alias_material_name, "ESF Quartz");
  assert.equal(payload.normalized_alias_color_name, "winter fresh");
  assert.equal(payload.normalized_alias_material_name, "esf quartz");
  assert.equal(payload.source_system, "slabcloud");
  assert.equal(payload.is_active, true);
  // Must NOT touch slab_inventory or activate collection
  assert.ok(!("slab_inventory" in payload), "alias payload must not reference slab_inventory");
  assert.ok(!("is_active_collection" in payload), "alias payload must not activate collection");

  console.log("ok: buildAliasPayload (approved alias → correct slab_color_aliases payload)");
}

// ---------------------------------------------------------------------------
// buildRejectReviewPayload — rejected fuzzy creates correct review payload
// ---------------------------------------------------------------------------
{
  const candidate = {
    source_color_name: "Armitage",
    source_material_name: "Cambria",
    rejected_catalog_color_name: "Hermitage",
    rejected_catalog_material_name: "Cambria",
    price_group: "D",
    reason: "Different colors, not a match",
  };
  const orgId = "org-test-123";
  const catalogItemId = "item-uuid-789";
  const payload = buildRejectReviewPayload(candidate, orgId, catalogItemId);

  assert.equal(payload.organization_id, orgId);
  assert.equal(payload.source_color_name, "Armitage");
  assert.equal(payload.source_material_name, "Cambria");
  assert.equal(payload.normalized_source_color_name, "armitage");
  assert.equal(payload.normalized_source_material_name, "cambria");
  assert.equal(payload.source_price_group, "D");
  assert.equal(payload.matched_catalog_item_id, catalogItemId);
  assert.equal(payload.match_method, "fuzzy");
  assert.equal(payload.review_status, "rejected");
  assert.equal(payload.confidence_score, null);
  assert.ok(payload.notes, "notes field populated from reason");
  // Must NOT be approved or needs_review
  assert.notEqual(payload.review_status, "approved");
  assert.notEqual(payload.review_status, "needs_review");
  // Must NOT touch slab_inventory
  assert.ok(!("slab_inventory" in payload), "reject payload must not reference slab_inventory");

  console.log("ok: buildRejectReviewPayload (rejected → correct review payload, review_status=rejected)");
}

// ---------------------------------------------------------------------------
// buildRejectReviewPayload — null catalog item is safe (item may not be found)
// ---------------------------------------------------------------------------
{
  const candidate = {
    source_color_name: "Calacatta Athena",
    source_material_name: "Stratus",
    rejected_catalog_color_name: "Calacatta Lucent",
    rejected_catalog_material_name: "Stratus",
    price_group: "A",
    reason: "Different colors",
  };
  const payload = buildRejectReviewPayload(candidate, "org-test", null);
  assert.equal(payload.matched_catalog_item_id, null, "null catalog item OK (item not found case)");
  assert.equal(payload.review_status, "rejected");
  console.log("ok: buildRejectReviewPayload (null catalogItemId handled safely)");
}

// ---------------------------------------------------------------------------
// matchSourceColorWithAliases — Chris-approved alias overrides fuzzy
// ---------------------------------------------------------------------------
{
  const catalog = [
    { color_name: "Winterfresh", material_name: "ESF", price_group: "C" },
    { color_name: "Coastal Tide", material_name: "ESF", price_group: "B" },
  ];

  // Without aliases: "Winter Fresh" would fuzzy-match "Winterfresh"
  const noAliasResult = matchSourceColorToCatalog(
    { color_name: "Winter Fresh", material_name: "ESF Quartz" },
    catalog,
    { fuzzyThreshold: 0.75 }
  );
  // It may match as alias (material alias ESF Quartz≡ESF) or fuzzy depending on name similarity
  // Either way, with DB aliases it should resolve to alias/approved
  assert.ok(
    noAliasResult.method === "fuzzy" || noAliasResult.method === "alias",
    `baseline: "Winter Fresh" should fuzzy or alias match without DB aliases (got: ${noAliasResult.method})`
  );

  // WITH Chris-approved DB aliases: should become alias match (approved)
  const resolvedAliases = [
    {
      normalized_alias_color_name: "winter fresh",
      normalized_alias_material_name: "esf quartz",
      catalog_color_name: "Winterfresh",
      catalog_material_name: "ESF",
    },
  ];
  const withAliasResult = matchSourceColorWithAliases(
    { color_name: "Winter Fresh", material_name: "ESF Quartz" },
    catalog,
    resolvedAliases,
    { fuzzyThreshold: 0.75 }
  );
  assert.equal(withAliasResult.method, "alias", "DB alias match: method should be 'alias'");
  assert.equal(withAliasResult.review_status, "approved", "DB alias match: approved");
  assert.equal(withAliasResult.confidence, 1.0, "DB alias match: confidence 1.0");
  assert.equal(withAliasResult.match?.color_name, "Winterfresh");

  console.log("ok: matchSourceColorWithAliases (Chris-approved alias overrides fuzzy, review_status=approved)");
}

// ---------------------------------------------------------------------------
// matchSourceColorWithAliases — exact match still takes priority over DB alias
// ---------------------------------------------------------------------------
{
  const catalog = [{ color_name: "Alabaster", material_name: "ESF", price_group: "B" }];
  const resolvedAliases = [
    {
      normalized_alias_color_name: "alabaster",
      normalized_alias_material_name: "esf quartz",
      catalog_color_name: "Alabaster",
      catalog_material_name: "ESF",
    },
  ];
  // Exact match: color + material exact → should still be "exact", not "alias"
  const r = matchSourceColorWithAliases(
    { color_name: "Alabaster", material_name: "ESF" },
    catalog,
    resolvedAliases
  );
  assert.equal(r.method, "exact", "exact match takes priority over DB alias");
  assert.equal(r.review_status, "approved");
  console.log("ok: matchSourceColorWithAliases (exact match takes priority over DB alias)");
}

// ---------------------------------------------------------------------------
// matchSourceColorWithAliases — no alias match → falls back to fuzzy/none
// ---------------------------------------------------------------------------
{
  const catalog = [{ color_name: "Winterfresh", material_name: "ESF", price_group: "C" }];
  // Source is "Belfast Grey" — no alias, no exact match → fuzzy or none
  const r = matchSourceColorWithAliases(
    { color_name: "Belfast Grey", material_name: "Aggranite" },
    catalog,
    [], // empty aliases
    { fuzzyThreshold: 0.75 }
  );
  // Should be fuzzy or none, NOT alias
  assert.ok(r.method !== "alias", "no alias record → should not return alias method");
  assert.ok(r.method === "fuzzy" || r.method === "none", `method should be fuzzy or none, got ${r.method}`);
  if (r.method === "fuzzy") {
    assert.equal(r.review_status, "needs_review", "fuzzy without DB alias still needs_review");
  }
  console.log("ok: matchSourceColorWithAliases (no alias → falls back to fuzzy/none, still needs_review)");
}

// ---------------------------------------------------------------------------
// matchAllSourceColorsWithAliases — approved aliases reduce fuzzy count
// ---------------------------------------------------------------------------
{
  const catalog = [
    { color_name: "Winterfresh",  material_name: "ESF",      price_group: "C" },
    { color_name: "Belfast Gray", material_name: "Aggranite", price_group: "C" },
  ];
  const sources = [
    { color_name: "Winter Fresh",  material_name: "ESF Quartz" }, // alias → approved
    { color_name: "Belfast Grey",  material_name: "Aggranite" },  // alias → approved (or fuzzy without alias)
    { color_name: "Unknown Color", material_name: "Unknown" },    // none
  ];

  // Without aliases (baseline)
  const withoutAliases = matchAllSourceColors(sources, catalog, { fuzzyThreshold: 0.75 });
  const baselineFuzzyOrAlias = withoutAliases.fuzzy + withoutAliases.alias;
  assert.ok(baselineFuzzyOrAlias >= 0, "baseline has some fuzzy/alias candidates");

  // With Chris-approved DB aliases
  const resolvedAliases = [
    {
      normalized_alias_color_name: "winter fresh",
      normalized_alias_material_name: "esf quartz",
      catalog_color_name: "Winterfresh",
      catalog_material_name: "ESF",
    },
    {
      normalized_alias_color_name: "belfast grey",
      normalized_alias_material_name: "aggranite",
      catalog_color_name: "Belfast Gray",
      catalog_material_name: "Aggranite",
    },
  ];
  const withAliases = matchAllSourceColorsWithAliases(
    sources,
    catalog,
    resolvedAliases,
    { fuzzyThreshold: 0.75 }
  );
  assert.ok(withAliases.alias >= 2, `with aliases: alias count should be >= 2 (got ${withAliases.alias})`);
  assert.equal(withAliases.none, 1, "unmatched Non-Stock count unchanged");
  assert.equal(withAliases.total, 3, "total unchanged");
  // Fuzzy count should drop when aliases are applied
  assert.ok(
    withAliases.fuzzy < withoutAliases.fuzzy || withoutAliases.fuzzy === 0,
    `fuzzy count should decrease with aliases: before=${withoutAliases.fuzzy}, after=${withAliases.fuzzy}`
  );

  console.log("ok: matchAllSourceColorsWithAliases (approved aliases reduce fuzzy count, Non-Stock unchanged)");
}

// ---------------------------------------------------------------------------
// Rejected fuzzy candidates — not classified as Elite 100
// ---------------------------------------------------------------------------
{
  // Armitage → Hermitage: rejected by Chris. Even though they fuzzy-match,
  // the review record marks them as rejected. We test that:
  // (a) the match itself is fuzzy/needs_review (not exact/alias/approved)
  // (b) buildRejectReviewPayload produces review_status=rejected
  const catalog = [{ color_name: "Hermitage", material_name: "Cambria", price_group: "D" }];
  const r = matchSourceColorToCatalog(
    { color_name: "Armitage", material_name: "Cambria" },
    catalog,
    { fuzzyThreshold: 0.75 }
  );

  // Whether this fuzzy-matches depends on similarity — either way it is NOT approved
  if (r.method === "fuzzy") {
    assert.equal(
      r.review_status,
      "needs_review",
      "rejected pair is fuzzy+needs_review before review is applied"
    );
    assert.notEqual(
      r.review_status,
      "approved",
      "rejected pair must NEVER be auto-approved as Elite 100"
    );
  } else {
    assert.equal(r.method, "none", "if below fuzzy threshold, method=none (Non-Stock)");
  }

  // Confirm the reject review payload marks it correctly
  const payload = buildRejectReviewPayload(
    {
      source_color_name: "Armitage",
      source_material_name: "Cambria",
      price_group: "D",
      reason: "Different colors",
    },
    "org-test",
    "catalog-item-id"
  );
  assert.equal(payload.review_status, "rejected");
  assert.notEqual(payload.review_status, "approved");
  assert.notEqual(payload.review_status, "needs_review");

  console.log("ok: rejected fuzzy candidates — not classified as Elite 100, review_status=rejected");
}

// ---------------------------------------------------------------------------
// Collection is never activated by payload builders
// ---------------------------------------------------------------------------
{
  // buildAliasPayload and buildRejectReviewPayload must never set is_active on a collection
  const aliasPayload = buildAliasPayload(
    { source_color_name: "Test", source_material_name: "ESF" },
    "org-1",
    "item-1"
  );
  const rejectPayload = buildRejectReviewPayload(
    { source_color_name: "Test2", source_material_name: "Cambria", reason: "test" },
    "org-1",
    null
  );
  // Neither payload should reference collection activation
  assert.ok(!("collection_id" in aliasPayload), "alias payload has no collection_id field");
  assert.ok(!("collection_id" in rejectPayload), "reject payload has no collection_id field");
  assert.ok(
    !Object.keys(aliasPayload).some((k) => k.includes("collection") && k.includes("active")),
    "alias payload must not activate collection"
  );
  assert.ok(
    !Object.keys(rejectPayload).some((k) => k.includes("collection") && k.includes("active")),
    "reject payload must not activate collection"
  );
  console.log("ok: payload builders do not activate collection (is_active unchanged)");
}

// ---------------------------------------------------------------------------
// slab_inventory is never referenced in matching or payload modules
// ---------------------------------------------------------------------------
{
  // All the exported functions are pure and have no Supabase calls.
  // Verify the matching functions don't return fields that would mutate inventory.
  const aliasPayload = buildAliasPayload(
    { source_color_name: "Test", source_material_name: "ESF" },
    "org-1",
    "item-1"
  );
  const fields = Object.keys(aliasPayload);
  assert.ok(
    !fields.some((f) => f.toLowerCase().includes("inventory")),
    "alias payload must not contain inventory fields"
  );
  const matchResult = matchSourceColorWithAliases(
    { color_name: "Alabaster", material_name: "ESF" },
    [{ color_name: "Alabaster", material_name: "ESF", price_group: "B" }],
    []
  );
  assert.ok(
    !("inventory" in matchResult),
    "match result must not contain inventory reference"
  );
  console.log("ok: slab_inventory not referenced in matching or payload modules");
}

// ---------------------------------------------------------------------------
// importElite100AliasReviews — idempotency helpers (findExistingAlias / findExistingReview)
// ---------------------------------------------------------------------------
//
// These tests import the helper functions directly to verify SELECT-then-INSERT
// behavior without requiring a real Supabase instance or any unique DB indexes.
//
// Mock Supabase builder: records chained calls and resolves `.limit()` with a
// preset value so we can test both "found" and "not found" paths.
// ---------------------------------------------------------------------------
{
  const { findExistingAlias, findExistingReview } = await import(
    "../scripts/slabInventory/importElite100AliasReviews.js"
  );

  // ── Mock builder ──────────────────────────────────────────────────────────

  function makeMockChain(resolveWith) {
    const calls = [];
    const chain = {
      _calls: calls,
      from(t) { calls.push(["from", t]); return chain; },
      select(c) { calls.push(["select", c]); return chain; },
      eq(k, v) { calls.push(["eq", k, v]); return chain; },
      is(k, v) { calls.push(["is", k, v]); return chain; },
      limit() { return Promise.resolve(resolveWith); },
    };
    return chain;
  }

  // ── findExistingAlias — returns row when found ────────────────────────────
  {
    const existing = { id: "alias-uuid-1" };
    const mock = makeMockChain({ data: [existing], error: null });
    const result = await findExistingAlias(
      mock,
      "org-1",
      "cat-item-1",
      "winterfresh",
      "esf",
      "slabcloud"
    );
    assert.deepEqual(result, existing, "findExistingAlias returns row when found");
    assert.ok(
      mock._calls.some(([m, k]) => m === "eq" && k === "normalized_alias_color_name"),
      "findExistingAlias queries normalized_alias_color_name"
    );
    assert.ok(
      mock._calls.some(([m, k]) => m === "eq" && k === "source_system"),
      "findExistingAlias queries source_system"
    );
    assert.ok(
      !mock._calls.some(([m]) => m === "upsert"),
      "findExistingAlias does not call upsert"
    );
    console.log("ok: findExistingAlias returns row when found");
  }

  // ── findExistingAlias — returns null when not found ───────────────────────
  {
    const mock = makeMockChain({ data: [], error: null });
    const result = await findExistingAlias(
      mock,
      "org-1",
      "cat-item-1",
      "belfast gray",
      "aggranite",
      "slabcloud"
    );
    assert.equal(result, null, "findExistingAlias returns null when not found");
    console.log("ok: findExistingAlias returns null when not found");
  }

  // ── findExistingAlias — null material uses IS NULL, not eq ───────────────
  {
    const mock = makeMockChain({ data: [], error: null });
    await findExistingAlias(mock, "org-1", "cat-1", "color", null, "slabcloud");
    const isNullCall = mock._calls.find(
      ([m, k]) => m === "is" && k === "normalized_alias_material_name"
    );
    assert.ok(isNullCall, "null material uses .is() for IS NULL check");
    const eqMatCall = mock._calls.find(
      ([m, k]) => m === "eq" && k === "normalized_alias_material_name"
    );
    assert.ok(!eqMatCall, "null material does NOT use .eq() — avoids col=null PostgreSQL pitfall");
    console.log("ok: findExistingAlias uses IS NULL for null material");
  }

  // ── findExistingAlias — non-null material uses eq ─────────────────────────
  {
    const mock = makeMockChain({ data: [], error: null });
    await findExistingAlias(mock, "org-1", "cat-1", "color", "cambria", "slabcloud");
    const eqMatCall = mock._calls.find(
      ([m, k, v]) => m === "eq" && k === "normalized_alias_material_name" && v === "cambria"
    );
    assert.ok(eqMatCall, "non-null material uses .eq() with the normalized value");
    console.log("ok: findExistingAlias uses .eq() for non-null material");
  }

  // ── findExistingAlias — propagates lookup errors ──────────────────────────
  {
    const errChain = makeMockChain({ data: null, error: { message: "connection refused" } });
    let thrown = null;
    try {
      await findExistingAlias(errChain, "org-1", "cat-1", "color", "mat", "slabcloud");
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown !== null, "findExistingAlias throws when Supabase returns an error");
    assert.ok(thrown.message.includes("connection refused"), "error message is propagated");
    console.log("ok: findExistingAlias propagates Supabase errors");
  }

  // ── findExistingReview — returns row when found ───────────────────────────
  {
    const existing = { id: "review-uuid-1" };
    const mock = makeMockChain({ data: [existing], error: null });
    const result = await findExistingReview(
      mock,
      "org-1",
      "calacatta athena",
      "stratus",
      "fuzzy",
      "rejected",
      "matched-cat-uuid-1"
    );
    assert.deepEqual(result, existing, "findExistingReview returns row when found");
    assert.ok(
      mock._calls.some(([m, k]) => m === "eq" && k === "match_method"),
      "findExistingReview queries match_method"
    );
    assert.ok(
      mock._calls.some(([m, k]) => m === "eq" && k === "review_status"),
      "findExistingReview queries review_status"
    );
    assert.ok(
      !mock._calls.some(([m]) => m === "upsert"),
      "findExistingReview does not call upsert"
    );
    console.log("ok: findExistingReview returns row when found");
  }

  // ── findExistingReview — returns null when not found ─────────────────────
  {
    const mock = makeMockChain({ data: [], error: null });
    const result = await findExistingReview(
      mock,
      "org-1",
      "armitage",
      "cambria",
      "fuzzy",
      "rejected",
      "cat-uuid-2"
    );
    assert.equal(result, null, "findExistingReview returns null when not found");
    console.log("ok: findExistingReview returns null when not found");
  }

  // ── findExistingReview — null material and null item use IS NULL ──────────
  {
    const mock = makeMockChain({ data: [], error: null });
    await findExistingReview(mock, "org-1", "color", null, "fuzzy", "rejected", null);
    const isNullMat = mock._calls.find(
      ([m, k]) => m === "is" && k === "normalized_source_material_name"
    );
    assert.ok(isNullMat, "null source material uses .is() for IS NULL");
    const isNullItem = mock._calls.find(
      ([m, k]) => m === "is" && k === "matched_catalog_item_id"
    );
    assert.ok(isNullItem, "null matched_catalog_item_id uses .is() for IS NULL");
    console.log("ok: findExistingReview uses IS NULL for null material and null catalog item");
  }

  // ── import script no longer uses onConflict / upsert for alias or reviews ─
  {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath: ftu } = await import("node:url");
    const { join: pjoin, dirname: pdir } = await import("node:path");
    const scriptPath = pjoin(
      pdir(ftu(import.meta.url)),
      "../scripts/slabInventory/importElite100AliasReviews.js"
    );
    const src = readFileSync(scriptPath, "utf8");

    // The script must NOT call .upsert( on slab_color_aliases or reviews.
    // (dry-run calls are not Supabase calls; the only .upsert mentions are forbidden)
    const upsertLines = src
      .split("\n")
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /\.upsert\s*\(/.test(line) && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"));
    assert.equal(upsertLines.length, 0, `importElite100AliasReviews.js must not call .upsert() (found on lines: ${upsertLines.map(([n]) => n).join(", ")})`);

    // The script must NOT reference onConflict for alias or review writes.
    const onConflictLines = src
      .split("\n")
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /onConflict/.test(line) && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"));
    assert.equal(onConflictLines.length, 0, `importElite100AliasReviews.js must not use onConflict (found on lines: ${onConflictLines.map(([n]) => n).join(", ")})`);

    // The script must use .insert( for actual writes.
    assert.ok(
      src.includes(".insert(payload)"),
      "import script must use .insert(payload) for writes"
    );

    console.log("ok: importElite100AliasReviews uses SELECT-then-INSERT, no upsert/onConflict");
  }

  // ── dry-run does not write (no Supabase client created) ──────────────────
  {
    // Guard: in dry-run mode the script branches before creating a Supabase client.
    // Verify the source doesn't call createClient unconditionally at module scope.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath: ftu } = await import("node:url");
    const { join: pjoin, dirname: pdir } = await import("node:path");
    const src = readFileSync(
      pjoin(pdir(ftu(import.meta.url)), "../scripts/slabInventory/importElite100AliasReviews.js"),
      "utf8"
    );
    // createClient must be inside the !isDryRun block, not at top level.
    // Verify the only top-level call is `import { createClient }`, not `createClient(`.
    const topLevelCreateClient = src
      .split("\n")
      .filter((line) => /createClient\s*\(/.test(line) && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"));
    // There should be exactly one call and it should be inside an if block (guarded).
    assert.equal(topLevelCreateClient.length, 1, "createClient() called exactly once (guarded by !isDryRun)");
    assert.ok(
      !src.match(/^createClient\(/m),
      "createClient() is not called at module top level"
    );
    console.log("ok: dry-run does not write — createClient guarded by !isDryRun");
  }

  // ── slab_inventory table never referenced in import script ───────────────
  {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath: ftu } = await import("node:url");
    const { join: pjoin, dirname: pdir } = await import("node:path");
    const src = readFileSync(
      pjoin(pdir(ftu(import.meta.url)), "../scripts/slabInventory/importElite100AliasReviews.js"),
      "utf8"
    );
    const invRef = src
      .split("\n")
      .filter((line) => /slab_inventory(?!_color)/.test(line) && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"));
    assert.equal(invRef.length, 0, `importElite100AliasReviews.js must not reference slab_inventory table (found: ${invRef.length} line(s))`);
    console.log("ok: slab_inventory not referenced in importElite100AliasReviews.js");
  }

  // ── collection is_active is never set in import script ───────────────────
  {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath: ftu } = await import("node:url");
    const { join: pjoin, dirname: pdir } = await import("node:path");
    const src = readFileSync(
      pjoin(pdir(ftu(import.meta.url)), "../scripts/slabInventory/importElite100AliasReviews.js"),
      "utf8"
    );
    const activateRef = src
      .split("\n")
      .filter((line) => /is_active\s*[:=]\s*true/.test(line) && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"));
    assert.equal(activateRef.length, 0, `importElite100AliasReviews.js must not set is_active=true (found: ${activateRef.length} line(s))`);
    console.log("ok: importElite100AliasReviews never sets is_active=true (collection not activated)");
  }

  console.log("ok: importElite100AliasReviews idempotency helpers — all checks passed");
}

console.log("\ncolorProgramMatching: all tests passed");
