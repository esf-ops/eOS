/**
 * cacheSlabCloudV2Textures — write-gated script to populate slab_color_visual_assets
 * with texture images from the SlabCloud v2 public inventory endpoint.
 *
 * SCOPE / SAFETY (read this before running):
 *   - Reads ONLY from SlabCloud v2 public endpoint and Supabase catalog tables.
 *   - NEVER reads or writes slab_inventory rows.
 *   - NEVER uses count_for_color or any SlabCloud display count as inventory authority.
 *   - NEVER writes back to SlabCloud / Slabsmith.
 *   - NEVER downloads image bytes — stores texture URLs only.
 *   - NEVER changes catalog activation (slab_color_catalog_items.is_active).
 *   - DRY-RUN by default. Writes require SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1.
 *
 * Usage (dry-run, no credentials needed):
 *   node backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js
 *
 * Usage (write mode):
 *   SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1 \
 *   SLABOS_ORGANIZATION_ID=<org-uuid> \
 *   SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js
 *
 * Environment variables:
 *   SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED   "1" to enable writes (default: dry-run)
 *   SLABOS_ORGANIZATION_ID or SLABCLOUD_ORGANIZATION_ID   org UUID (required for writes)
 *   SUPABASE_URL                                required for catalog match + writes
 *   SUPABASE_SERVICE_ROLE_KEY                   required for writes
 *   SLABCLOUD_BASE_URL                          default https://slabcloud.com
 *   SLABCLOUD_API_COMPANY_CODE                  default kbyd
 *   SLABCLOUD_ASSET_COMPANY_CODE                default kbyd
 *   SLABCLOUD_PUBLIC_SLUG                       default esf
 */

import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildV2InventoryUrl,
  normalizeV2Rows,
} from "../../slabcloud/slabCloudV2TextureDiagnostic.js";
import {
  normalizeColorName,
  normalizeMaterialName,
  matchSourceColorWithAliases,
} from "../../slabInventory/colorProgramMatching.js";
import {
  DEFAULT_SOURCE_SYSTEM,
  buildVisualAssetRow,
  findExistingVisualAsset,
} from "../../slabcloud/slabCloudVisualAssetCache.js";
import { DEFAULT_USER_AGENT } from "../../slabcloud/slabCloudClient.js";

export { findExistingVisualAsset }; // re-export for tests

const __filename = fileURLToPath(import.meta.url);

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL     = process.env.SLABCLOUD_BASE_URL       || "https://slabcloud.com";
const COMPANY_CODE = process.env.SLABCLOUD_API_COMPANY_CODE || "kbyd";
const PUBLIC_SLUG  = process.env.SLABCLOUD_PUBLIC_SLUG    || "esf";
const ORG_ID       = process.env.SLABOS_ORGANIZATION_ID   || process.env.SLABCLOUD_ORGANIZATION_ID || null;
const SUPABASE_URL = process.env.SUPABASE_URL             || null;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const WRITE_ENABLED = process.env.SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED === "1";

const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY && ORG_ID);

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": DEFAULT_USER_AGENT, "Accept": "application/json, */*" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url} (${text.slice(0, 120)})`);
  }
}

// ── Catalog loader (mirrors loadElite100Deps in slabInventoryApi.js) ──────────

/**
 * Load active Elite 100 catalog items + resolved aliases from Supabase.
 * Returns empty arrays when no collection found (non-fatal).
 *
 * Exported for testability — call without running main().
 *
 * @param {Object} supabase
 * @param {string} orgId
 * @returns {Promise<{ catalogItemList: Array, resolvedAliases: Array }>}
 */
export async function loadCatalogForCache(supabase, orgId) {
  const { data: collections } = await supabase
    .from("slab_color_collections")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .limit(1);

  const collection = collections?.[0] ?? null;
  if (!collection) {
    console.warn("  ⚠ No active Elite 100 collection found — catalog matching will be skipped.");
    return { catalogItemList: [], resolvedAliases: [] };
  }

  const { data: catalogItems, error: itemErr } = await supabase
    .from("slab_color_catalog_items")
    .select("id,color_name,material_name,normalized_color_name,normalized_material_name,price_group")
    .eq("organization_id", orgId)
    .eq("collection_id", collection.id)
    .eq("is_active", true);
  if (itemErr) throw new Error(`Catalog load error: ${itemErr.message}`);

  const catalogItemList = catalogItems ?? [];
  const catalogItemIds  = catalogItemList.map((c) => c.id);

  let resolvedAliases = [];
  if (catalogItemIds.length) {
    const { data: aliasRows, error: aliasErr } = await supabase
      .from("slab_color_aliases")
      .select(
        "catalog_item_id,alias_color_name,alias_material_name,normalized_alias_color_name,normalized_alias_material_name"
      )
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .in("catalog_item_id", catalogItemIds);
    if (aliasErr) throw new Error(`Alias load error: ${aliasErr.message}`);

    const catalogItemMap = new Map(catalogItemList.map((c) => [c.id, c]));
    resolvedAliases = (aliasRows ?? [])
      .map((alias) => {
        const catItem = catalogItemMap.get(alias.catalog_item_id);
        if (!catItem) return null;
        return {
          normalized_alias_color_name:  alias.normalized_alias_color_name,
          normalized_alias_material_name: alias.normalized_alias_material_name ?? "",
          catalog_color_name:           catItem.color_name,
          catalog_material_name:        catItem.material_name,
        };
      })
      .filter(Boolean);
  }

  return { catalogItemList, resolvedAliases };
}

// ── Asset row builder for cache script ───────────────────────────────────────

/**
 * Build visual asset payloads from normalized v2 rows.
 * Skips rows without texture_hash.
 * Matches each row to a catalog item (exact or alias) when catalog data is provided.
 *
 * Pure function after catalog loading — exported for testing.
 *
 * @param {Array}  normalizedRows      Output of normalizeV2Rows()
 * @param {string} orgId
 * @param {Array}  catalogItemList     From loadCatalogForCache()
 * @param {Array}  resolvedAliases     From loadCatalogForCache()
 * @param {Object} [opts]
 * @param {string} [opts.companyCode]
 * @param {string} [opts.publicSlug]
 * @returns {Array}  Array of visual asset row payloads (ready for insert)
 */
export function buildVisualAssetPayloads(
  normalizedRows,
  orgId,
  catalogItemList = [],
  resolvedAliases = [],
  opts = {}
) {
  const payloads = [];
  for (const row of Array.isArray(normalizedRows) ? normalizedRows : []) {
    if (!row.texture_hash) continue; // skip rows without visual data

    // Match v2 row to catalog item
    const matchResult = catalogItemList.length
      ? matchSourceColorWithAliases(
          { color_name: row.source_color_name, material_name: row.source_material_name },
          catalogItemList,
          resolvedAliases
        )
      : { match: null, method: "none" };

    const isMatched = matchResult.method === "exact" || matchResult.method === "alias";
    const catalogItemId = isMatched ? (matchResult.match?.id ?? null) : null;
    const matchMethod   = isMatched ? matchResult.method : null;

    const payload = buildVisualAssetRow(row, orgId, catalogItemId, matchMethod, opts);
    if (payload) payloads.push(payload);
  }
  return payloads;
}

// ── Dry-run summary ───────────────────────────────────────────────────────────

/**
 * Compute a dry-run summary from payloads (no I/O).
 * Exported for testing.
 *
 * @param {Array} payloads     Output of buildVisualAssetPayloads()
 * @param {number} totalV2Rows
 * @param {number} v2RowsWithTexture
 * @returns {Object}
 */
export function computeDryRunSummary(payloads, totalV2Rows, v2RowsWithTexture) {
  const elite100Assets   = payloads.filter((p) => p.catalog_item_id !== null);
  const nonStockAssets   = payloads.filter((p) => p.catalog_item_id === null);
  const exactMatches     = elite100Assets.filter((p) => p.match_method === "exact");
  const aliasMatches     = elite100Assets.filter((p) => p.match_method === "alias");

  const e100CatalogIdSet = new Set(elite100Assets.map((p) => p.catalog_item_id));

  return {
    total_v2_rows:          totalV2Rows,
    rows_with_texture:      v2RowsWithTexture,
    rows_without_texture:   totalV2Rows - v2RowsWithTexture,
    visual_assets_to_write: payloads.length,
    matched_elite100_assets: elite100Assets.length,
    matched_elite100_exact:  exactMatches.length,
    matched_elite100_alias:  aliasMatches.length,
    unmatched_non_stock_assets: nonStockAssets.length,
    elite100_catalog_ids_with_texture: e100CatalogIdSet.size,
    sample_matched_assets: elite100Assets.slice(0, 5).map((p) => ({
      color_name:     p.source_color_name,
      material:       p.source_material_name,
      product_slug:   p.product_slug,
      texture_hash:   p.texture_hash,
      catalog_item_id: p.catalog_item_id,
      match_method:   p.match_method,
    })),
    sample_unmatched_assets: nonStockAssets.slice(0, 5).map((p) => ({
      color_name:   p.source_color_name,
      material:     p.source_material_name,
      product_slug: p.product_slug,
      texture_hash: p.texture_hash,
    })),
  };
}

// ── Write helpers ─────────────────────────────────────────────────────────────

/**
 * Write (or update) one visual asset row using SELECT-then-INSERT/UPDATE.
 * Returns "inserted", "updated", or "skipped".
 *
 * Exported for testing.
 *
 * @param {Object} supabase
 * @param {Object} payload   Output of buildVisualAssetRow()
 * @returns {Promise<"inserted"|"updated"|"skipped">}
 */
export async function writeVisualAssetRow(supabase, payload) {
  const existing = await findExistingVisualAsset(
    supabase,
    payload.organization_id,
    payload.source_api_company_code,
    payload.product_slug
  );

  if (!existing) {
    // New row — insert
    const { error } = await supabase
      .from("slab_color_visual_assets")
      .insert(payload);
    if (error) throw new Error(`Visual asset insert error: ${error.message}`);
    return "inserted";
  }

  // Existing row — check if texture_hash changed or catalog_item_id updated
  const hashChanged     = existing.texture_hash !== payload.texture_hash;
  const catalogChanged  =
    String(existing.catalog_item_id ?? "") !== String(payload.catalog_item_id ?? "");

  if (!hashChanged && !catalogChanged) return "skipped"; // nothing changed

  const { error } = await supabase
    .from("slab_color_visual_assets")
    .update({
      catalog_item_id:          payload.catalog_item_id,
      texture_hash:             payload.texture_hash,
      texture_url_600:          payload.texture_url_600,
      texture_url_1024:         payload.texture_url_1024,
      match_method:             payload.match_method,
      raw:                      payload.raw,
      last_seen_at:             payload.last_seen_at,
      updated_at:               new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (error) throw new Error(`Visual asset update error: ${error.message}`);
  return "updated";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SlabCloud v2 Texture Cache");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Base URL:      ${BASE_URL}`);
  console.log(`  Company Code:  ${COMPANY_CODE}`);
  console.log(`  Public Slug:   ${PUBLIC_SLUG}`);
  console.log(`  Org ID:        ${ORG_ID ?? "(not provided)"}`);
  console.log(`  Has Supabase:  ${HAS_SUPABASE}`);
  console.log(`  Write enabled: ${WRITE_ENABLED}`);
  console.log("───────────────────────────────────────────────────────");
  console.log("  AUTHORITY REMINDER:");
  console.log("  slab_color_visual_assets is PRESENTATION ENRICHMENT ONLY.");
  console.log("  Typed slab_inventory remains the sole inventory authority.");
  console.log("  No count_for_color or v2 display counts are used.");
  console.log("═══════════════════════════════════════════════════════\n");

  // ── Step 1: Fetch v2 inventory
  const url = buildV2InventoryUrl(BASE_URL, COMPANY_CODE);
  console.log(`[1] Fetching v2 inventory…\n    ${url}`);
  const data = await fetchJson(url);

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
    const keys = Object.keys(data || {}).slice(0, 20);
    throw new Error(`Unknown v2 response shape. Top-level keys: ${keys.join(", ")}`);
  }
  console.log(`  → ${rawRows.length} raw rows received.\n`);

  // ── Step 2: Normalize
  console.log("[2] Normalizing rows…");
  const normalizedRows = normalizeV2Rows(rawRows, BASE_URL);
  const rowsWithTexture = normalizedRows.filter((r) => r.has_texture);
  console.log(`  → ${normalizedRows.length} normalized.  ${rowsWithTexture.length} with texture.\n`);

  // ── Step 3: Load catalog (if Supabase available)
  let catalogItemList = [];
  let resolvedAliases = [];

  if (HAS_SUPABASE) {
    console.log("[3] Loading Elite 100 catalog from Supabase…");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    ({ catalogItemList, resolvedAliases } = await loadCatalogForCache(supabase, ORG_ID));
    console.log(
      `  → ${catalogItemList.length} catalog items, ${resolvedAliases.length} aliases.\n`
    );
  } else {
    console.log(
      "[3] Supabase not configured — skipping catalog match (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ORG_ID).\n"
    );
  }

  // ── Step 4: Build asset payloads
  console.log("[4] Building visual asset payloads…");
  const payloads = buildVisualAssetPayloads(
    normalizedRows,
    ORG_ID ?? "dry-run-org",
    catalogItemList,
    resolvedAliases,
    { companyCode: COMPANY_CODE, publicSlug: PUBLIC_SLUG }
  );
  const summary = computeDryRunSummary(payloads, normalizedRows.length, rowsWithTexture.length);

  // ── Step 5: Print dry-run summary
  console.log("\n  ── Dry-run summary ──────────────────────────────────");
  console.log(`  Total v2 rows:             ${summary.total_v2_rows}`);
  console.log(`  Rows with texture:         ${summary.rows_with_texture}`);
  console.log(`  Rows without texture:      ${summary.rows_without_texture}`);
  console.log(`  Visual assets to write:    ${summary.visual_assets_to_write}`);
  console.log(`  Matched Elite 100 assets:  ${summary.matched_elite100_assets}`);
  console.log(`    → exact matches:         ${summary.matched_elite100_exact}`);
  console.log(`    → alias matches:         ${summary.matched_elite100_alias}`);
  console.log(`  Unmatched (non-stock):     ${summary.unmatched_non_stock_assets}`);
  console.log(`  Elite 100 IDs w/ texture:  ${summary.elite100_catalog_ids_with_texture}`);

  if (summary.sample_matched_assets.length) {
    console.log("\n  Sample matched assets:");
    for (const s of summary.sample_matched_assets) {
      console.log(`    ✓ ${s.color_name} / ${s.material} [${s.match_method}] → ${s.catalog_item_id}`);
    }
  }
  if (summary.sample_unmatched_assets.length) {
    console.log("\n  Sample unmatched (non-stock) assets:");
    for (const s of summary.sample_unmatched_assets) {
      console.log(`    ○ ${s.color_name} / ${s.material} — ${s.product_slug}`);
    }
  }

  // ── Step 6: Write (if enabled and Supabase available)
  if (!WRITE_ENABLED) {
    console.log("\n  [DRY-RUN] No rows written.");
    console.log("  To write, set SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1 with org + Supabase creds.");
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  Dry-run complete. slab_inventory was NOT touched.");
    console.log("═══════════════════════════════════════════════════════\n");
    return;
  }

  if (!HAS_SUPABASE) {
    console.error("\n✗ Write mode requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + org ID.");
    process.exit(1);
  }

  console.log("\n[5] Writing visual asset rows (SELECT-then-INSERT/UPDATE)…");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let inserted = 0;
  let updated  = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const payload of payloads) {
    try {
      const outcome = await writeVisualAssetRow(supabase, payload);
      if (outcome === "inserted") inserted++;
      else if (outcome === "updated") updated++;
      else skipped++;
    } catch (e) {
      errors++;
      console.error(`  ✗ ${payload.product_slug ?? "(no slug)"}: ${e.message}`);
    }
  }

  console.log(`\n  Write results:`);
  console.log(`    Inserted: ${inserted}`);
  console.log(`    Updated:  ${updated}`);
  console.log(`    Skipped:  ${skipped}`);
  console.log(`    Errors:   ${errors}`);

  if (errors > 0) {
    console.error("\n✗ Some rows failed. Review errors above.");
    process.exit(1);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Cache write complete.");
  console.log("  slab_inventory was NOT touched.");
  console.log("  SlabCloud v2 display counts were NOT used as inventory authority.");
  console.log("═══════════════════════════════════════════════════════\n");
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error("\n✗ Cache script failed:", err.message);
    process.exit(1);
  });
}
