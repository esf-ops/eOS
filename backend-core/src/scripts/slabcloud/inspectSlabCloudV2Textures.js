/**
 * inspectSlabCloudV2Textures — diagnostic script for the SlabCloud v2 texture
 * endpoint investigation.
 *
 * READ ONLY. No writes to Supabase, no writes to SlabCloud, no mutations.
 * Texture images are visual enrichment only — typed slab_inventory remains
 * the sole source of truth for counts, physical slabs, and remnants.
 *
 * Usage:
 *   node backend-core/src/scripts/slabcloud/inspectSlabCloudV2Textures.js
 *
 * Environment variables (all optional unless Supabase comparison is desired):
 *   SLABCLOUD_BASE_URL                default https://slabcloud.com
 *   SLABCLOUD_API_COMPANY_CODE        default kbyd
 *   SLABCLOUD_PUBLIC_SLUG             default esf  (informational only)
 *   SLABOS_ORGANIZATION_ID or
 *   SLABCLOUD_ORGANIZATION_ID         required for Supabase comparison
 *   SUPABASE_URL                      required for Supabase comparison
 *   SUPABASE_SERVICE_ROLE_KEY         required for Supabase comparison
 *   SLABCLOUD_V2_PRODUCT_SAMPLE_LIMIT default 0   (>0 enables product sampling)
 *
 * Output: debug/slabcloud/slabcloud-v2-texture-diagnostic.json
 *   (debug/ is gitignored)
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildV2InventoryUrl,
  buildV2ProductUrl,
  normalizeV2Rows,
  computeDiagnosticSummary,
  detectDuplicates,
  compareWithCatalog,
  normalizeV2ProductResponse,
} from "../../slabcloud/slabCloudV2TextureDiagnostic.js";

import {
  normalizeColorName,
  normalizeMaterialName,
} from "../../slabInventory/colorProgramMatching.js";

import { DEFAULT_USER_AGENT } from "../../slabcloud/slabCloudClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../../../../debug/slabcloud");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "slabcloud-v2-texture-diagnostic.json");

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL     = process.env.SLABCLOUD_BASE_URL     || "https://slabcloud.com";
const COMPANY_CODE = process.env.SLABCLOUD_API_COMPANY_CODE || "kbyd";
const PUBLIC_SLUG  = process.env.SLABCLOUD_PUBLIC_SLUG  || "esf";
const ORG_ID       = process.env.SLABOS_ORGANIZATION_ID || process.env.SLABCLOUD_ORGANIZATION_ID || null;
const SUPABASE_URL = process.env.SUPABASE_URL           || null;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const PRODUCT_SAMPLE_LIMIT = parseInt(process.env.SLABCLOUD_V2_PRODUCT_SAMPLE_LIMIT || "0", 10);

const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY && ORG_ID);

const config = {
  base_url:             BASE_URL,
  company_code:         COMPANY_CODE,
  public_slug:          PUBLIC_SLUG,
  organization_id:      ORG_ID ?? "(not provided)",
  has_supabase:         HAS_SUPABASE,
  product_sample_limit: PRODUCT_SAMPLE_LIMIT,
  timestamp:            new Date().toISOString(),
};

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      "Accept":     "application/json, */*",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url} (${text.slice(0, 120)})`);
  }
}

// ── Step 1: Fetch v2 inventory ────────────────────────────────────────────────

async function fetchV2Inventory() {
  const url = buildV2InventoryUrl(BASE_URL, COMPANY_CODE);
  console.log(`\n[1] Fetching v2 inventory…\n    ${url}`);
  const data = await fetchJson(url);

  // v2 may return an array, or { slabs: [...] }, or { data: [...] }, etc.
  let rawRows;
  if (Array.isArray(data)) {
    rawRows = data;
  } else if (Array.isArray(data?.slabs)) {
    rawRows = data.slabs;
  } else if (Array.isArray(data?.data)) {
    rawRows = data.data;
  } else if (Array.isArray(data?.inventory)) {
    rawRows = data.inventory;
  } else {
    // Unknown shape — inspect top-level keys and return empty for safety
    const keys = Object.keys(data || {}).slice(0, 20);
    console.warn(`  ⚠ Unknown v2 response shape. Top-level keys: ${keys.join(", ")}`);
    console.warn(`  Raw (truncated): ${JSON.stringify(data).slice(0, 600)}`);
    return { rawRows: [], shape_warning: `Unknown shape. Keys: ${keys.join(", ")}`, raw_sample: JSON.stringify(data).slice(0, 600) };
  }

  console.log(`  → ${rawRows.length} raw rows received.`);

  if (rawRows.length > 0) {
    console.log(`  → Sample row keys: ${Object.keys(rawRows[0]).slice(0, 20).join(", ")}`);
  }

  return { rawRows, shape_warning: null, raw_sample: null };
}

// ── Step 2: Optional Supabase comparison ─────────────────────────────────────

async function loadSupabaseData(supabase) {
  console.log("\n[4] Loading Supabase data for comparison…");

  // Typed inventory color groups
  const { data: invRows, error: invErr } = await supabase
    .from("slab_inventory")
    .select("color_name, material_name")
    .eq("organization_id", ORG_ID)
    .eq("is_active", true)
    .eq("source_inventory_scope", "typed")
    .in("source_inventory_type", ["Slab", "Remnant"]);

  if (invErr) throw new Error(`Supabase inventory error: ${invErr.message}`);

  // Deduplicate into color groups
  const cgSet = new Map();
  for (const row of (invRows || [])) {
    const nc = normalizeColorName(row.color_name);
    const nm = normalizeMaterialName(row.material_name);
    const key = `${nc}||${nm}`;
    if (!cgSet.has(key)) {
      cgSet.set(key, { normalized_color_name: nc, normalized_material_name: nm, color_name: row.color_name, material_name: row.material_name });
    }
  }
  const typedColorGroups = [...cgSet.values()];
  console.log(`  → Typed color groups: ${typedColorGroups.length}`);

  // Active Elite 100 collection
  const { data: collections, error: collErr } = await supabase
    .from("slab_color_collections")
    .select("id")
    .eq("organization_id", ORG_ID)
    .eq("is_active", true)
    .limit(1);
  if (collErr) throw new Error(`Supabase collections error: ${collErr.message}`);

  let elite100Items = [];
  let aliases = [];

  if (collections && collections.length > 0) {
    const collectionId = collections[0].id;

    const { data: items, error: itemErr } = await supabase
      .from("slab_color_catalog_items")
      .select("id, color_name, material_name, normalized_color_name, normalized_material_name, price_group")
      .eq("organization_id", ORG_ID)
      .eq("collection_id", collectionId)
      .eq("is_active", true);
    if (itemErr) throw new Error(`Supabase catalog items error: ${itemErr.message}`);
    elite100Items = items || [];
    console.log(`  → Active Elite 100 items: ${elite100Items.length}`);

    const { data: aliasRows, error: aliasErr } = await supabase
      .from("slab_color_aliases")
      .select("catalog_item_id, normalized_alias_color_name, normalized_alias_material_name, is_active")
      .eq("organization_id", ORG_ID)
      .eq("is_active", true);
    if (aliasErr) throw new Error(`Supabase aliases error: ${aliasErr.message}`);
    aliases = aliasRows || [];
    console.log(`  → Active aliases: ${aliases.length}`);
  } else {
    console.warn("  ⚠ No active Elite 100 collection found.");
  }

  return { typedColorGroups, elite100Items, aliases };
}

// ── Step 3: Optional product sampling ────────────────────────────────────────

async function sampleProducts(normalizedRows, limit) {
  console.log(`\n[5] Sampling up to ${limit} product endpoint(s)…`);
  const candidates = normalizedRows
    .filter((r) => r.product_slug && r.source_material_name)
    .slice(0, limit);

  const results = [];
  for (const row of candidates) {
    const url = buildV2ProductUrl(BASE_URL, COMPANY_CODE, row.product_slug, row.source_material_name);
    console.log(`  Fetching: ${url}`);
    try {
      const data = await fetchJson(url);
      const normalized = normalizeV2ProductResponse(data, BASE_URL);
      results.push({ slug: row.product_slug, material: row.source_material_name, url, ...normalized });
    } catch (e) {
      results.push({ slug: row.product_slug, material: row.source_material_name, url, error: String(e.message) });
    }
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SlabCloud v2 Texture Diagnostic");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Base URL:     ${BASE_URL}`);
  console.log(`  Company Code: ${COMPANY_CODE}`);
  console.log(`  Public Slug:  ${PUBLIC_SLUG}`);
  console.log(`  Has Supabase: ${HAS_SUPABASE}`);
  console.log(`  Product sample limit: ${PRODUCT_SAMPLE_LIMIT}`);

  const output = { config, warnings: [], summary: null, duplicates: null, comparison: null, productSamples: null };

  // ── Fetch v2 inventory
  const { rawRows, shape_warning, raw_sample } = await fetchV2Inventory();
  if (shape_warning) {
    output.warnings.push(shape_warning);
    output.raw_response_sample = raw_sample;
  }

  // ── Normalize
  console.log("\n[2] Normalizing rows…");
  const normalizedRows = normalizeV2Rows(rawRows, BASE_URL);
  console.log(`  → ${normalizedRows.length} normalized rows.`);

  if (normalizedRows.length > 0) {
    const sample = normalizedRows[0];
    console.log(`  → Sample normalized row:`);
    console.log(`     color_name: ${sample.source_color_name}`);
    console.log(`     material:   ${sample.source_material_name}`);
    console.log(`     slug:       ${sample.product_slug}`);
    console.log(`     texture:    ${sample.texture_hash ?? "(none)"}`);
    console.log(`     tex_url_600: ${sample.texture_url_600 ?? "(none)"}`);
  }

  // ── Diagnostic summary
  console.log("\n[3] Computing summary…");
  const summary  = computeDiagnosticSummary(normalizedRows);
  const dupes    = detectDuplicates(normalizedRows);
  output.summary    = summary;
  output.duplicates = dupes;

  console.log(`  Total rows:           ${summary.total_rows}`);
  console.log(`  Distinct slugs:       ${summary.distinct_slugs}`);
  console.log(`  Color/material groups:${summary.distinct_color_material_groups}`);
  console.log(`  With texture:         ${summary.rows_with_texture}`);
  console.log(`  Without texture:      ${summary.rows_without_texture}`);
  console.log(`  Texture coverage:     ${summary.texture_coverage_pct}%`);
  console.log(`  Materials:            ${summary.distinct_materials} (${summary.sample_materials.slice(0, 5).join(", ")})`);
  console.log(`  NOTE: display count sum is NOT inventory authority.`);

  if (dupes.duplicateSlugs.total_affected_slugs > 0) {
    console.log(`  ⚠ Duplicate slugs: ${dupes.duplicateSlugs.total_affected_slugs}`);
  }

  // ── Optional Supabase comparison
  if (HAS_SUPABASE) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { typedColorGroups, elite100Items, aliases } = await loadSupabaseData(supabase);
    const comparison = compareWithCatalog(normalizedRows, typedColorGroups, elite100Items, aliases);
    output.comparison = comparison;

    console.log("\n  ── Comparison results ──");
    console.log(`  Typed color groups:         ${comparison.typed_color_groups_count}`);
    console.log(`  Elite 100 items:            ${comparison.elite100_item_count}`);
    console.log(`  V2 → typed exact match:     ${comparison.v2_rows_matching_typed_exact}`);
    console.log(`  V2 → typed alias match:     ${comparison.v2_rows_matching_typed_material_alias}`);
    console.log(`  V2 unmatched to typed:      ${comparison.v2_rows_unmatched_to_typed}`);
    console.log(`  V2 → E100 exact:            ${comparison.v2_rows_matching_e100_exact}`);
    console.log(`  V2 → E100 alias:            ${comparison.v2_rows_matching_e100_alias}`);
    console.log(`  E100 items WITH texture:    ${comparison.e100_items_with_texture_candidate}`);
    console.log(`  E100 items WITHOUT texture: ${comparison.e100_items_without_texture_candidate}`);
    console.log(`  Non-stock with texture:     ${comparison.non_stock_rows_with_texture}`);
  } else {
    console.log("\n  ℹ Supabase comparison skipped (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ORG_ID to enable).");
  }

  // ── Optional product sampling
  if (PRODUCT_SAMPLE_LIMIT > 0 && normalizedRows.length > 0) {
    const productSamples = await sampleProducts(normalizedRows, PRODUCT_SAMPLE_LIMIT);
    output.productSamples = productSamples;
    console.log(`\n  Product samples: ${productSamples.length} fetched.`);
    for (const ps of productSamples) {
      if (ps.error) {
        console.log(`  ✗ ${ps.slug} / ${ps.material}: ${ps.error}`);
      } else {
        console.log(`  ✓ ${ps.slug} / ${ps.material} → texture: ${ps.texture_hash ?? "(none)"}, keys: ${(ps.top_level_keys || []).slice(0, 8).join(", ")}`);
      }
    }
  }

  // ── Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`\n✓ Output written to: ${OUTPUT_FILE}`);
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Diagnostic complete. No data was written to Supabase.");
  console.log("  Typed slab_inventory remains the inventory authority.");
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n✗ Diagnostic failed:", err.message);
  process.exit(1);
});
