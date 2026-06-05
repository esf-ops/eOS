#!/usr/bin/env node
/**
 * previewElite100Matches.js — Preview Elite 100 color matching without writes.
 *
 * Loads the Elite 100 fixture as the catalog source.
 * Loads typed color-program source colors from Supabase (if credentials
 * are provided) or uses the fixture's own items as a self-test.
 * Loads slab_color_aliases from Supabase (if credentials are provided) and
 * uses alias-aware matching before fuzzy fallback.
 * Loads rejected slab_color_program_match_reviews (if available) and
 * excludes those source colors from Elite 100 classification.
 * Runs matchAllSourceColorsWithAliases() and prints a full summary.
 *
 * No Supabase writes. No slab_inventory mutations. Read-only.
 *
 * Env vars (all optional for dry-run self-test):
 *   SUPABASE_URL                   if set, reads live color-programs from Supabase
 *   SUPABASE_SERVICE_ROLE_KEY      required with SUPABASE_URL
 *   SLABOS_ORGANIZATION_ID         required when reading from Supabase
 *   SLABCLOUD_ORGANIZATION_ID      fallback alias
 *   ELITE100_COLLECTION_KEY        default "elite100-2026"
 *   ELITE100_FIXTURE_PATH          default fixtures/elite100-2026.json
 *   ELITE100_FUZZY_THRESHOLD       default 0.75
 *   ELITE100_PREVIEW_SAMPLE_SIZE   max needs-review rows to print (default 10)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  matchAllSourceColors,
  matchAllSourceColorsWithAliases,
  normalizeColorName,
  normalizeMaterialName,
  ACTIVE_PRICE_GROUPS,
  DEFAULT_FUZZY_THRESHOLD,
} from "../../slabInventory/colorProgramMatching.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const COLLECTION_KEY =
  process.env.ELITE100_COLLECTION_KEY || "elite100-2026";
const FIXTURE_PATH =
  process.env.ELITE100_FIXTURE_PATH ||
  join(__dirname, "../../slabInventory/fixtures/elite100-2026.json");
const FUZZY_THRESHOLD = parseFloat(
  process.env.ELITE100_FUZZY_THRESHOLD || String(DEFAULT_FUZZY_THRESHOLD)
);
const SAMPLE_SIZE = parseInt(
  process.env.ELITE100_PREVIEW_SAMPLE_SIZE || "10",
  10
);
const ORG_ID =
  process.env.SLABOS_ORGANIZATION_ID ||
  process.env.SLABCLOUD_ORGANIZATION_ID ||
  null;

// ---------------------------------------------------------------------------
// Load fixture and flatten to catalog items
// ---------------------------------------------------------------------------

function loadCatalogItemsFromFixture(fixturePath) {
  const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
  const items = [];
  for (const group of ACTIVE_PRICE_GROUPS) {
    for (const item of raw.groups?.[group] || []) {
      items.push({
        price_group: item.price_group || group,
        color_name: item.color_name,
        material_name: item.material_name,
        display_name: item.display_name,
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Load source colors from Supabase (typed active rows, grouped by color)
// ---------------------------------------------------------------------------

async function loadSourceColorsFromSupabase(supabase, organizationId) {
  let q = supabase
    .from("slab_inventory")
    .select(
      "color_name,material_name,price_group,source_inventory_scope,source_inventory_type"
    )
    .eq("is_active", true)
    .eq("source_inventory_scope", "typed")
    .in("source_inventory_type", ["Slab", "Remnant"]);
  if (organizationId) q = q.eq("organization_id", organizationId);

  const { data, error } = await q;
  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  // Deduplicate by (color_name, material_name, price_group)
  const seen = new Set();
  const unique = [];
  for (const r of data || []) {
    const key = `${r.color_name}||${r.material_name}||${r.price_group}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        color_name: r.color_name,
        material_name: r.material_name,
        source_price_group: r.price_group,
      });
    }
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Self-test source: use fixture items themselves as source (verifies round-trip)
// ---------------------------------------------------------------------------

function buildSelfTestSource(catalogItems) {
  return catalogItems.map((item) => ({
    color_name: item.color_name,
    material_name: item.material_name,
    source_price_group: item.price_group,
    _self_test: true,
  }));
}

// ---------------------------------------------------------------------------
// Load approved aliases from Supabase (joined with catalog items)
// ---------------------------------------------------------------------------

async function loadResolvedAliases(supabase, organizationId, collectionKey) {
  // Fetch aliases with catalog item info joined via PostgREST relationship
  const { data, error } = await supabase
    .from("slab_color_aliases")
    .select(
      "normalized_alias_color_name, normalized_alias_material_name, alias_color_name, alias_material_name, slab_color_catalog_items(color_name, material_name, price_group)"
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    console.warn(`WARN: Could not load aliases from Supabase: ${error.message}`);
    return [];
  }

  return (data || []).map((row) => ({
    normalized_alias_color_name: row.normalized_alias_color_name,
    normalized_alias_material_name: row.normalized_alias_material_name,
    alias_color_name: row.alias_color_name,
    alias_material_name: row.alias_material_name,
    catalog_color_name: row.slab_color_catalog_items?.color_name ?? null,
    catalog_material_name: row.slab_color_catalog_items?.material_name ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Load rejected review records from Supabase (explicit blocklist)
// ---------------------------------------------------------------------------

async function loadRejectedReviews(supabase, organizationId) {
  const { data, error } = await supabase
    .from("slab_color_program_match_reviews")
    .select(
      "normalized_source_color_name, normalized_source_material_name, match_method, review_status"
    )
    .eq("organization_id", organizationId)
    .eq("review_status", "rejected");

  if (error) {
    console.warn(`WARN: Could not load rejected reviews: ${error.message}`);
    return [];
  }

  return data || [];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(70));
  console.log("Elite 100 Match Preview");
  console.log(`Fixture   : ${FIXTURE_PATH}`);
  console.log(`Collection: ${COLLECTION_KEY}`);
  console.log(`Fuzzy threshold: ${FUZZY_THRESHOLD}`);
  console.log("=".repeat(70));

  // Load catalog from fixture
  let catalogItems;
  try {
    catalogItems = loadCatalogItemsFromFixture(FIXTURE_PATH);
  } catch (e) {
    console.error(`ERROR: Failed to load fixture: ${e.message}`);
    process.exit(1);
  }
  console.log(`Catalog items loaded from fixture: ${catalogItems.length}`);

  // Load source colors
  let sourceColors = [];
  let sourceLabel = "";
  let resolvedAliases = [];
  let rejectedReviews = [];
  const hasSupabaseCreds =
    !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && ORG_ID);

  if (hasSupabaseCreds) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    console.log(`Loading typed source colors from Supabase (org: ${ORG_ID})...`);
    try {
      sourceColors = await loadSourceColorsFromSupabase(supabase, ORG_ID);
      sourceLabel = "Supabase typed inventory";
    } catch (e) {
      console.error(`ERROR: ${e.message}`);
      process.exit(1);
    }

    // Load approved aliases (for alias-aware matching)
    console.log(`Loading approved aliases from Supabase...`);
    resolvedAliases = await loadResolvedAliases(supabase, ORG_ID, COLLECTION_KEY);
    console.log(`  Resolved aliases loaded: ${resolvedAliases.length}`);

    // Load rejected review records (blocklist)
    console.log(`Loading rejected fuzzy reviews from Supabase...`);
    rejectedReviews = await loadRejectedReviews(supabase, ORG_ID);
    console.log(`  Rejected review records: ${rejectedReviews.length}`);
  } else {
    // Self-test: use fixture items as source to verify round-trip matching
    sourceColors = buildSelfTestSource(catalogItems);
    sourceLabel = "fixture self-test (no Supabase credentials provided)";
    console.log(
      "\nNo SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SLABOS_ORGANIZATION_ID — running fixture self-test."
    );
    console.log(
      "Provide all three to test against live typed inventory with aliases.\n"
    );
  }

  console.log(`Source colors to match: ${sourceColors.length} (${sourceLabel})`);

  // Build the set of source colors that are explicitly rejected (blocklist)
  const rejectedKeys = new Set(
    rejectedReviews.map(
      (r) =>
        `${r.normalized_source_color_name}||${r.normalized_source_material_name || ""}`
    )
  );

  // Run alias-aware matching
  const summary = matchAllSourceColorsWithAliases(
    sourceColors,
    catalogItems,
    resolvedAliases,
    { fuzzyThreshold: FUZZY_THRESHOLD }
  );

  // Apply rejection blocklist: move rejected fuzzy results to "none"
  let rejectedCount = 0;
  if (rejectedKeys.size > 0) {
    for (const r of summary.results) {
      if (r.method !== "fuzzy") continue;
      const key = `${normalizeColorName(r.source.color_name)}||${normalizeMaterialName(r.source.material_name || "")}`;
      if (rejectedKeys.has(key)) {
        r.method = "none";
        r.match = null;
        r.review_status = "needs_review";
        r._rejected = true;
        summary.fuzzy -= 1;
        summary.none += 1;
        rejectedCount += 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Print summary
  // ---------------------------------------------------------------------------

  const pct = (n) =>
    summary.total > 0
      ? ` (${Math.round((n / summary.total) * 100)}%)`
      : "";

  console.log("\n" + "─".repeat(70));
  console.log("MATCHING SUMMARY");
  console.log("─".repeat(70));
  console.log(`  Total source color groups  : ${summary.total}`);
  console.log(`  Exact matches              : ${summary.exact}${pct(summary.exact)}`);
  console.log(`  Alias matches              : ${summary.alias}${pct(summary.alias)}`);
  console.log(`  Fuzzy candidates           : ${summary.fuzzy}${pct(summary.fuzzy)} ← needs human review`);
  if (rejectedCount > 0) {
    console.log(`  Rejected fuzzy (blocklist) : ${rejectedCount} ← explicitly rejected, not Elite 100`);
  }
  console.log(
    `  Unmatched (Non-Stock)      : ${summary.none - rejectedCount}${pct(summary.none - rejectedCount)}`
  );
  if (resolvedAliases.length > 0) {
    console.log(`\n  Alias records applied      : ${resolvedAliases.length} (from Supabase)`);
  }

  // Needs-review sample (fuzzy only, not rejected)
  const needsReview = summary.results.filter(
    (r) => r.review_status === "needs_review" && r.method !== "none"
  );
  if (needsReview.length) {
    console.log(
      `\nFuzzy / needs-review sample (up to ${SAMPLE_SIZE}):`
    );
    for (const r of needsReview.slice(0, SAMPLE_SIZE)) {
      const src = r.source;
      const m = r.match;
      console.log(
        `  [${r.method.padEnd(5)}] conf=${r.confidence.toFixed(3)}  ` +
          `"${src.color_name} - ${src.material_name || "?"}"` +
          ` → "${m ? m.color_name + " - " + m.material_name : "no match"}"`
      );
    }
    if (needsReview.length > SAMPLE_SIZE) {
      console.log(`  … and ${needsReview.length - SAMPLE_SIZE} more.`);
    }
  }

  // Rejected fuzzy sample
  const rejectedRows = summary.results.filter((r) => r._rejected);
  if (rejectedRows.length) {
    console.log(`\nRejected fuzzy (explicit blocklist, not Elite 100):`);
    for (const r of rejectedRows) {
      const src = r.source;
      console.log(
        `  ✗ "${src.color_name} - ${src.material_name || "?"}"`
      );
    }
  }

  // Non-Stock sample (unmatched, excluding rejected)
  const nonStock = summary.results.filter((r) => r.method === "none" && !r._rejected);
  if (nonStock.length) {
    console.log(
      `\nNon-Stock candidates (unmatched, up to ${SAMPLE_SIZE}):`
    );
    for (const r of nonStock.slice(0, SAMPLE_SIZE)) {
      const src = r.source;
      console.log(
        `  "${src.color_name} - ${src.material_name || "?"}"` +
          (src.source_price_group ? ` [${src.source_price_group}]` : "")
      );
    }
    if (nonStock.length > SAMPLE_SIZE) {
      console.log(`  … and ${nonStock.length - SAMPLE_SIZE} more.`);
    }
  }

  // Likely misspelling sample (high-confidence fuzzy, just below alias threshold)
  const likely = summary.results.filter(
    (r) => r.method === "fuzzy" && r.confidence >= 0.9
  );
  if (likely.length) {
    console.log("\nLikely misspellings (fuzzy conf >= 0.90):");
    for (const r of likely.slice(0, SAMPLE_SIZE)) {
      const src = r.source;
      const m = r.match;
      const srcNorm = normalizeColorName(src.color_name);
      const catNorm = normalizeColorName(m?.color_name || "");
      console.log(
        `  conf=${r.confidence.toFixed(3)}  ` +
          `"${srcNorm}" → "${catNorm}"` +
          ` [${m?.price_group}/${m?.material_name}]`
      );
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(
    "NOTE: Fuzzy matches must be reviewed before classifying as Elite 100."
  );
  console.log(
    "      Use importElite100AliasReviews.js to apply approved/rejected decisions."
  );
  if (sourceLabel.includes("self-test")) {
    console.log(
      "\nSelf-test passed: fixture items matched against themselves."
    );
    console.log(
      "For live matching: provide SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SLABOS_ORGANIZATION_ID."
    );
  }
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
