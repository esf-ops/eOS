/**
 * cacheSlabCloudV2Textures — write-gated script to populate slab_color_visual_assets
 * with texture images from SlabCloud v2 public endpoints.
 *
 * SCOPE / SAFETY (read this before running):
 *   - Reads ONLY from SlabCloud v2 public endpoints and Supabase catalog tables.
 *   - NEVER reads or writes slab_inventory rows.
 *   - NEVER uses count_for_color or any SlabCloud display count as inventory authority.
 *   - NEVER writes back to SlabCloud / Slabsmith.
 *   - NEVER downloads image bytes — stores texture URLs only.
 *   - NEVER changes catalog activation (slab_color_catalog_items.is_active).
 *   - DRY-RUN by default. Writes require SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1.
 *   - Deep sweep (product endpoint per-product fetch) requires
 *     SLABCLOUD_V2_TEXTURE_DEEP_SWEEP=1.
 *
 * Usage (dry-run bulk, no credentials needed):
 *   node backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js
 *
 * Usage (dry-run bulk + deep sweep, no write):
 *   SLABCLOUD_V2_TEXTURE_DEEP_SWEEP=1 \
 *   node backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js
 *
 * Usage (write mode):
 *   SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1 \
 *   SLABOS_ORGANIZATION_ID=<org-uuid> \
 *   SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js
 *
 * Usage (write mode + deep sweep):
 *   SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1 \
 *   SLABCLOUD_V2_TEXTURE_DEEP_SWEEP=1 \
 *   SLABOS_ORGANIZATION_ID=<org-uuid> \
 *   SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js
 *
 * Environment variables:
 *   SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED         "1" to enable writes (default: dry-run)
 *   SLABOS_ORGANIZATION_ID or SLABCLOUD_ORGANIZATION_ID  org UUID (required for writes)
 *   SUPABASE_URL                                      required for catalog match + writes
 *   SUPABASE_SERVICE_ROLE_KEY                         required for writes
 *   SLABCLOUD_BASE_URL                                default https://slabcloud.com
 *   SLABCLOUD_API_COMPANY_CODE                        default kbyd
 *   SLABCLOUD_ASSET_COMPANY_CODE                      default kbyd
 *   SLABCLOUD_PUBLIC_SLUG                             default esf
 *
 *   Deep sweep (optional):
 *   SLABCLOUD_V2_TEXTURE_DEEP_SWEEP              "1" to enable per-product endpoint fetch
 *   SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_LIMIT        max product calls (default 0 = no cap)
 *   SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_CONCURRENCY  parallel product calls (default 3)
 *   SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_ONLY_MISSING "0" to sweep all rows, default "1" (only missing bulk texture)
 */

import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildV2InventoryUrl,
  buildV2ProductUrl,
  normalizeV2Rows,
} from "../../slabcloud/slabCloudV2TextureDiagnostic.js";
import {
  matchSourceColorWithAliases,
} from "../../slabInventory/colorProgramMatching.js";
import {
  DEFAULT_SOURCE_SYSTEM,
  buildVisualAssetRow,
  findExistingVisualAsset,
  buildProductEndpointCandidates,
  extractTextureHashFromProductResponse,
  applyDeepSweepTextures,
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

// Deep sweep config
const DEEP_SWEEP_ENABLED     = process.env.SLABCLOUD_V2_TEXTURE_DEEP_SWEEP === "1";
const DEEP_SWEEP_LIMIT       = Math.max(0, parseInt(process.env.SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_LIMIT || "0", 10));
const DEEP_SWEEP_CONCURRENCY = Math.max(1, parseInt(process.env.SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_CONCURRENCY || "3", 10));
const DEEP_SWEEP_ONLY_MISSING = process.env.SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_ONLY_MISSING !== "0"; // default true

const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY && ORG_ID);

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

/**
 * Fetch JSON with a hard timeout via AbortController.
 * Public endpoints only — no cookies, no auth headers.
 * Exported for testing with a mock fetch implementation.
 *
 * @param {string}   url
 * @param {number}   [timeoutMs=15000]
 * @param {Function} [fetchImpl]  defaults to global fetch
 * @returns {Promise<Object>}
 */
export async function fetchJsonWithTimeout(url, timeoutMs = 15000, fetchImpl = null) {
  const doFetch = fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": DEFAULT_USER_AGENT, "Accept": "application/json, */*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON from ${url} (${text.slice(0, 80)})`);
    }
  } finally {
    clearTimeout(timer);
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

// ── Deep sweep ────────────────────────────────────────────────────────────────

/**
 * Run product endpoint fetch for each candidate row, with bounded concurrency.
 * Returns a Map<"slug||normMaterial" → sweepResult> and a warnings array.
 *
 * Only reads texture fields from product responses — NEVER reads slab counts,
 * display counts, or any inventory quantity from product endpoints.
 *
 * Exported for testing with an injected fetchImpl.
 *
 * @param {Array}    candidates    Output of buildProductEndpointCandidates()
 * @param {Function} fetchImpl     Injectable: fetchJsonWithTimeout(url, timeoutMs)
 * @param {string}   baseUrl
 * @param {string}   companyCode
 * @param {Object}   [opts]
 * @param {number}   [opts.concurrency=3]
 * @param {number}   [opts.timeoutMs=15000]
 * @returns {Promise<{ results: Map, warnings: Array }>}
 */
export async function runDeepSweep(candidates, fetchImpl, baseUrl, companyCode, opts = {}) {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const timeoutMs   = Math.max(1000, opts.timeoutMs ?? 15000);

  const results  = new Map(); // dedupKey → sweepResult
  const warnings = [];

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (row) => {
        const url = buildV2ProductUrl(
          baseUrl,
          companyCode,
          row.product_slug,
          row.source_material_name ?? ""
        );
        const dedupKey = `${row.product_slug ?? ""}||${row.normalized_material_name ?? ""}`;
        try {
          const rawResp = await fetchImpl(url, timeoutMs);
          // Only extract texture hash — NEVER use slab count or display count from product response
          const textureHash = extractTextureHashFromProductResponse(rawResp);
          results.set(dedupKey, {
            slug:             row.product_slug,
            material:         row.source_material_name,
            normalizedMaterial: row.normalized_material_name,
            textureHash:      textureHash ?? null,
            url,
            responseKeys:     rawResp ? Object.keys(rawResp).slice(0, 20) : [],
            rawTextureValue:  textureHash ?? null,
            error:            null,
          });
        } catch (e) {
          const warning = {
            slug:     row.product_slug,
            material: row.source_material_name,
            url,
            error:    String(e.message),
          };
          results.set(dedupKey, {
            ...warning,
            textureHash:    null,
            responseKeys:   [],
            rawTextureValue: null,
          });
          warnings.push(warning);
        }
      })
    );
  }

  return { results, warnings };
}

// ── Asset row builder for cache script ───────────────────────────────────────

/**
 * Build visual asset payloads from normalized v2 rows.
 * Skips rows without texture_hash.
 * Matches each row to a catalog item (exact or alias) when catalog data is provided.
 *
 * Expects rows to already have `raw.texture_discovery_source` set
 * (by applyDeepSweepTextures or explicitly). When not set, rows are treated
 * as bulk_inventory provenance.
 *
 * Pure function after catalog loading — exported for testing.
 *
 * @param {Array}  normalizedRows      Output of normalizeV2Rows() or applyDeepSweepTextures()
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
 * Includes deep sweep stats when deepSweepStats is provided.
 * Exported for testing.
 *
 * @param {Array}        payloads          Output of buildVisualAssetPayloads()
 * @param {number}       totalV2Rows
 * @param {number}       v2RowsWithTexture  Bulk-only rows with texture
 * @param {Object|null}  [deepSweepStats]  From runDeepSweep (or null if no sweep)
 * @param {number}       [elite100TotalCount=0]  Total catalog items for coverage math
 * @returns {Object}
 */
export function computeDryRunSummary(
  payloads,
  totalV2Rows,
  v2RowsWithTexture,
  deepSweepStats = null,
  elite100TotalCount = 0
) {
  const elite100Assets   = payloads.filter((p) => p.catalog_item_id !== null);
  const nonStockAssets   = payloads.filter((p) => p.catalog_item_id === null);
  const exactMatches     = elite100Assets.filter((p) => p.match_method === "exact");
  const aliasMatches     = elite100Assets.filter((p) => p.match_method === "alias");
  const e100CatalogIdSet = new Set(elite100Assets.map((p) => p.catalog_item_id));

  const base = {
    total_v2_rows:               totalV2Rows,
    rows_with_texture:           v2RowsWithTexture,
    rows_without_texture:        totalV2Rows - v2RowsWithTexture,
    visual_assets_to_write:      payloads.length,
    matched_elite100_assets:     elite100Assets.length,
    matched_elite100_exact:      exactMatches.length,
    matched_elite100_alias:      aliasMatches.length,
    unmatched_non_stock_assets:  nonStockAssets.length,
    elite100_catalog_ids_with_texture: e100CatalogIdSet.size,
    sample_matched_assets: elite100Assets.slice(0, 5).map((p) => ({
      color_name:      p.source_color_name,
      material:        p.source_material_name,
      product_slug:    p.product_slug,
      texture_hash:    p.texture_hash,
      catalog_item_id: p.catalog_item_id,
      match_method:    p.match_method,
      discovery:       p.raw?.texture_discovery_source ?? "unknown",
    })),
    sample_unmatched_assets: nonStockAssets.slice(0, 5).map((p) => ({
      color_name:   p.source_color_name,
      material:     p.source_material_name,
      product_slug: p.product_slug,
      texture_hash: p.texture_hash,
    })),
  };

  if (!deepSweepStats) {
    return { ...base, deep_sweep_enabled: false };
  }

  // Separate bulk vs product-endpoint payloads by discovery source annotation
  const bulkPayloads    = payloads.filter((p) => p.raw?.texture_discovery_source !== "product_endpoint");
  const productPayloads = payloads.filter((p) => p.raw?.texture_discovery_source === "product_endpoint");

  const bulkE100    = bulkPayloads.filter((p) => p.catalog_item_id !== null);
  const bulkE100Ids = new Set(bulkE100.map((p) => p.catalog_item_id));

  const newProductE100    = productPayloads.filter((p) => p.catalog_item_id !== null);
  const newProductE100Ids = new Set(newProductE100.map((p) => p.catalog_item_id));

  return {
    ...base,
    // Bulk baseline
    bulk_rows_with_texture:    v2RowsWithTexture,
    bulk_rows_without_texture: totalV2Rows - v2RowsWithTexture,
    // Deep sweep config
    deep_sweep_enabled:        true,
    deep_sweep_only_missing:   deepSweepStats.onlyMissing,
    deep_sweep_limit:          deepSweepStats.limit,
    // Product endpoint call stats
    product_endpoint_candidates:             deepSweepStats.candidateCount,
    product_endpoint_calls_attempted:        deepSweepStats.attempted,
    product_endpoint_calls_succeeded:        deepSweepStats.succeeded,
    product_endpoint_calls_failed:           deepSweepStats.failed,
    product_endpoint_textures_found:         deepSweepStats.texturesFound,
    product_endpoint_textures_new_to_bulk:   productPayloads.length,
    // Before/after asset coverage
    total_assets_before_deep_sweep:            bulkPayloads.length,
    total_assets_after_deep_sweep:             payloads.length,
    matched_elite100_assets_before_deep_sweep: bulkE100.length,
    matched_elite100_assets_after_deep_sweep:  elite100Assets.length,
    elite100_ids_with_texture_before_deep_sweep: bulkE100Ids.size,
    elite100_ids_with_texture_after_deep_sweep:  e100CatalogIdSet.size,
    elite100_still_missing_texture: elite100TotalCount > 0
      ? Math.max(0, elite100TotalCount - e100CatalogIdSet.size)
      : null,
    // New discoveries
    newly_matched_elite100_catalog_ids: [...newProductE100Ids].filter((id) => !bulkE100Ids.has(id)),
    sample_newly_discovered_product_textures: productPayloads.slice(0, 5).map((p) => ({
      color_name:      p.source_color_name,
      material:        p.source_material_name,
      product_slug:    p.product_slug,
      texture_hash:    p.texture_hash,
      catalog_item_id: p.catalog_item_id,
      match_method:    p.match_method,
    })),
    sample_failed_product_calls: (deepSweepStats.warnings ?? []).slice(0, 5).map((w) => ({
      slug:     w.slug,
      material: w.material,
      url:      w.url,
      error:    w.error,
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
    const { error } = await supabase
      .from("slab_color_visual_assets")
      .insert(payload);
    if (error) throw new Error(`Visual asset insert error: ${error.message}`);
    return "inserted";
  }

  // Existing row — check if texture_hash changed or catalog_item_id updated
  const hashChanged    = existing.texture_hash !== payload.texture_hash;
  const catalogChanged = String(existing.catalog_item_id ?? "") !== String(payload.catalog_item_id ?? "");

  if (!hashChanged && !catalogChanged) return "skipped";

  const { error } = await supabase
    .from("slab_color_visual_assets")
    .update({
      catalog_item_id:  payload.catalog_item_id,
      texture_hash:     payload.texture_hash,
      texture_url_600:  payload.texture_url_600,
      texture_url_1024: payload.texture_url_1024,
      match_method:     payload.match_method,
      raw:              payload.raw,
      last_seen_at:     payload.last_seen_at,
      updated_at:       new Date().toISOString(),
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
  console.log(`  Base URL:          ${BASE_URL}`);
  console.log(`  Company Code:      ${COMPANY_CODE}`);
  console.log(`  Public Slug:       ${PUBLIC_SLUG}`);
  console.log(`  Org ID:            ${ORG_ID ?? "(not provided)"}`);
  console.log(`  Has Supabase:      ${HAS_SUPABASE}`);
  console.log(`  Write enabled:     ${WRITE_ENABLED}`);
  console.log(`  Deep sweep:        ${DEEP_SWEEP_ENABLED}`);
  if (DEEP_SWEEP_ENABLED) {
    console.log(`  Sweep limit:       ${DEEP_SWEEP_LIMIT || "(none)"}`);
    console.log(`  Sweep concurrency: ${DEEP_SWEEP_CONCURRENCY}`);
    console.log(`  Sweep only missing:${DEEP_SWEEP_ONLY_MISSING}`);
  }
  console.log("───────────────────────────────────────────────────────");
  console.log("  AUTHORITY REMINDER:");
  console.log("  slab_color_visual_assets is PRESENTATION ENRICHMENT ONLY.");
  console.log("  Typed slab_inventory remains the sole inventory authority.");
  console.log("  No count_for_color or v2 display counts are used.");
  console.log("═══════════════════════════════════════════════════════\n");

  // ── Step 1: Fetch bulk v2 inventory
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
  const bulkRowsWithTexture = normalizedRows.filter((r) => r.has_texture);
  console.log(`  → ${normalizedRows.length} normalized.  ${bulkRowsWithTexture.length} with bulk texture.\n`);

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

  // ── Step 4: Optional deep sweep
  let deepSweepResultsMap = new Map();
  let deepSweepStats      = null;

  if (DEEP_SWEEP_ENABLED) {
    const candidates = buildProductEndpointCandidates(normalizedRows, {
      onlyMissing: DEEP_SWEEP_ONLY_MISSING,
      limit:       DEEP_SWEEP_LIMIT,
    });
    console.log(`[4] Deep sweep: ${candidates.length} product endpoint candidates (only_missing=${DEEP_SWEEP_ONLY_MISSING}, concurrency=${DEEP_SWEEP_CONCURRENCY})…`);

    const { results, warnings } = await runDeepSweep(
      candidates,
      (u, ms) => fetchJsonWithTimeout(u, ms),
      BASE_URL,
      COMPANY_CODE,
      { concurrency: DEEP_SWEEP_CONCURRENCY, timeoutMs: 15000 }
    );

    deepSweepResultsMap = results;
    const texturesFound = [...results.values()].filter((r) => r.textureHash).length;

    deepSweepStats = {
      enabled:        true,
      onlyMissing:    DEEP_SWEEP_ONLY_MISSING,
      limit:          DEEP_SWEEP_LIMIT,
      candidateCount: candidates.length,
      attempted:      results.size,
      succeeded:      [...results.values()].filter((r) => !r.error).length,
      failed:         [...results.values()].filter((r) => r.error).length,
      texturesFound,
      warnings,
    };

    console.log(`  → ${deepSweepStats.attempted} calls, ${deepSweepStats.succeeded} succeeded, ${deepSweepStats.failed} failed.`);
    console.log(`  → ${texturesFound} textures found via product endpoint.\n`);
    if (warnings.length) {
      console.warn(`  ⚠ ${warnings.length} product endpoint failures (continuing):`);
      for (const w of warnings.slice(0, 3)) {
        console.warn(`    ✗ ${w.slug} / ${w.material}: ${w.error}`);
      }
      if (warnings.length > 3) console.warn(`    … and ${warnings.length - 3} more.`);
    }
  } else {
    console.log("[4] Deep sweep disabled (set SLABCLOUD_V2_TEXTURE_DEEP_SWEEP=1 to enable).\n");
  }

  // ── Step 5: Enrich rows with deep sweep results + annotate discovery source
  const enrichedRows = applyDeepSweepTextures(normalizedRows, deepSweepResultsMap, BASE_URL);

  // ── Step 6: Build asset payloads
  console.log("[5] Building visual asset payloads…");
  const payloads = buildVisualAssetPayloads(
    enrichedRows,
    ORG_ID ?? "dry-run-org",
    catalogItemList,
    resolvedAliases,
    { companyCode: COMPANY_CODE, publicSlug: PUBLIC_SLUG }
  );

  const summary = computeDryRunSummary(
    payloads,
    normalizedRows.length,
    bulkRowsWithTexture.length,
    deepSweepStats,
    catalogItemList.length
  );

  // ── Step 7: Print summary
  console.log("\n  ── Summary ──────────────────────────────────────────");
  console.log(`  Total v2 rows:             ${summary.total_v2_rows}`);
  console.log(`  Bulk rows with texture:    ${summary.rows_with_texture}`);
  console.log(`  Bulk rows without texture: ${summary.rows_without_texture}`);

  if (DEEP_SWEEP_ENABLED && deepSweepStats) {
    console.log(`\n  ── Deep sweep ────────────────────────────────────`);
    console.log(`  Product endpoint candidates: ${summary.product_endpoint_candidates}`);
    console.log(`  Calls attempted:             ${summary.product_endpoint_calls_attempted}`);
    console.log(`  Calls succeeded:             ${summary.product_endpoint_calls_succeeded}`);
    console.log(`  Calls failed:                ${summary.product_endpoint_calls_failed}`);
    console.log(`  Textures found (product):    ${summary.product_endpoint_textures_found}`);
    console.log(`  New to bulk:                 ${summary.product_endpoint_textures_new_to_bulk}`);
    console.log(`\n  ── Coverage before/after ─────────────────────────`);
    console.log(`  E100 IDs with texture BEFORE: ${summary.elite100_ids_with_texture_before_deep_sweep ?? "n/a"}`);
    console.log(`  E100 IDs with texture AFTER:  ${summary.elite100_ids_with_texture_after_deep_sweep ?? "n/a"}`);
    if (summary.elite100_still_missing_texture != null) {
      console.log(`  E100 still missing texture:   ${summary.elite100_still_missing_texture}`);
    }
  }

  console.log(`\n  Visual assets to write:    ${summary.visual_assets_to_write}`);
  console.log(`  Matched Elite 100 assets:  ${summary.matched_elite100_assets}`);
  console.log(`    → exact:                 ${summary.matched_elite100_exact}`);
  console.log(`    → alias:                 ${summary.matched_elite100_alias}`);
  console.log(`  Unmatched (non-stock):     ${summary.unmatched_non_stock_assets}`);
  console.log(`  Elite 100 IDs w/ texture:  ${summary.elite100_catalog_ids_with_texture}`);

  if (summary.sample_matched_assets.length) {
    console.log("\n  Sample matched assets:");
    for (const s of summary.sample_matched_assets) {
      console.log(`    ✓ ${s.color_name} / ${s.material} [${s.match_method}] [${s.discovery}]`);
    }
  }
  if (DEEP_SWEEP_ENABLED && summary.sample_newly_discovered_product_textures?.length) {
    console.log("\n  Newly discovered via product endpoint:");
    for (const s of summary.sample_newly_discovered_product_textures) {
      console.log(`    ★ ${s.color_name} / ${s.material} [${s.match_method ?? "non-stock"}] → ${s.texture_hash}`);
    }
  }
  if (summary.sample_failed_product_calls?.length) {
    console.log("\n  Sample failed product calls:");
    for (const f of summary.sample_failed_product_calls) {
      console.log(`    ✗ ${f.slug} / ${f.material}: ${f.error}`);
    }
  }

  // ── Step 8: Write (if enabled and Supabase available)
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

  console.log("\n[6] Writing visual asset rows (SELECT-then-INSERT/UPDATE)…");
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
