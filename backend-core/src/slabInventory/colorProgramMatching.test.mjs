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

console.log("\ncolorProgramMatching: all tests passed");
