/**
 * Slab Inventory Head (v1) — protected, READ-ONLY internal slab browser API.
 *
 * Source/authority rule:
 *   SlabCloud/Slabsmith remains the external source of truth. slabOS reads from
 *   its normalized Supabase cache (slab_inventory / slab_images / slab_materials /
 *   slabcloud_sync_runs). This head NEVER mutates those tables and NEVER writes
 *   back to SlabCloud/Slabsmith. Every route here is a GET.
 *
 * Auth:
 *   requireAuth() + requireHeadAccess("slab_inventory"). Admin/super_admin bypass
 *   the head check inside the middleware (anti-lockout) but still must be signed in.
 *   Queries are organization_id scoped via resolveOrganizationContext.
 *
 * Inventory source filter (read routes):
 *   SLAB_INVENTORY_ACTIVE_SOURCE=slabcloud|slabsmith|all (default: all)
 *   Optional debug override: ?source=slabcloud|slabsmith|all
 *
 * Price group rule:
 *   slab_inventory.price_group is the IMPORTED SlabCloud price group only. It is
 *   surfaced as `source_price_group` (label "Source price group"); it is NOT the
 *   final slabOS pricing authority and there is no override UI in v1.
 */

import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { resolveOrgId } from "../slabcloud/slabCloudHourlySyncApi.js";
import {
  applyInventorySourceFilter,
  resolveInventorySourceFilter,
} from "./slabInventorySourceFilter.js";
import {
  countActiveInventoryRows,
  countActiveNotSeenInSync,
  fetchActiveInventoryRowsPaginated,
  resolveSummarySyncCoverage,
} from "./slabInventorySummaryQueries.js";
import {
  matchSourceColorWithAliases,
  normalizeColorName as _normColorName,
  normalizeMaterialName as _normMatName,
} from "./colorProgramMatching.js";
import {
  buildElite100CurrentInventoryImageFields,
  buildElite100FinishVariantCard,
  buildElite100ReferenceImageFields,
  ELITE100_INVENTORY_MATCH_COLUMNS,
  listElite100FinishVariantAssets,
  summarizeElite100CurrentInventory,
  toPublicElite100ShowroomCard,
} from "./elite100CardModel.js";
import {
  buildPublicCambriaShowroomPayload,
  groupCambriaLiveInventoryCards,
  isCambriaCatalogItem,
  toPublicCambriaDesignCard,
} from "./cambriaPublicShowroom.js";
import {
  compactElite100MatchDebug,
  diagnoseElite100CatalogItem,
  groupInventoryByColorMaterial,
} from "./elite100MatchDiagnostics.js";
import {
  fetchAllActiveInventoryRowsForElite100Matching,
  fetchAllActiveInventoryRowsForScope,
} from "./elite100InventoryFetch.js";
import {
  buildImageMap,
  imagePatternDisplayLabel,
  lookupInventoryImage,
  SLAB_IMAGE_SELECT_COLUMNS,
} from "./slabInventoryImageResolver.js";

export {
  buildImageMap,
  IMAGE_URL_PATTERN_SLABSMITH,
  IMAGE_URL_PATTERN_SLABCLOUD,
  imagePatternDisplayLabel,
  lookupInventoryImage,
  PREFERRED_IMAGE_PATTERN,
  SLAB_IMAGE_SELECT_COLUMNS,
} from "./slabInventoryImageResolver.js";

export {
  buildElite100CurrentInventoryImageFields,
  buildElite100FinishVariantCard,
  buildElite100ReferenceImageFields,
  chooseCatalogReferenceImageUrl,
  chooseCatalogReferenceImageUrlFull,
  catalogReferenceImageSourceLabel,
  ELITE100_INVENTORY_MATCH_COLUMNS,
  isElite100FinishVariantAsset,
  listElite100FinishVariantAssets,
  summarizeElite100CurrentInventory,
  toPublicElite100ShowroomCard,
} from "./elite100CardModel.js";

export {
  aliasesForCatalogItem,
  buildElite100MatchReport,
  compactElite100MatchDebug,
  diagnoseElite100CatalogItem,
  groupInventoryByColorMaterial,
  matchInventoryToCatalogItem,
  suggestFuzzyInventoryCandidates,
} from "./elite100MatchDiagnostics.js";

export {
  applyInventorySourceFilter,
  resolveInventorySourceFilter,
} from "./slabInventorySourceFilter.js";
export {
  countActiveInventoryRows,
  countActiveNotSeenInSync,
  fetchActiveInventoryRowsPaginated,
  fetchActiveInventoryRowsPaginatedWithMeta,
  fetchLatestSyncRun,
  resolveSummarySyncCoverage,
  simulateTruncatedActiveFetch,
  SUMMARY_FETCH_PAGE_SIZE,
  verifyActiveInventoryFetchComplete,
} from "./slabInventorySummaryQueries.js";

export {
  fetchAllActiveInventoryRowsForElite100Matching,
  fetchAllActiveInventoryRowsForScope,
} from "./elite100InventoryFetch.js";

export const SLAB_INVENTORY_HEAD_SLUG = "slab_inventory";

/** Staff-safe columns returned to the internal head. Intentionally explicit (no SELECT *). */
export const INVENTORY_SELECT_COLUMNS = Object.freeze([
  "id",
  "external_source",
  "external_slab_id",
  "inventory_id",
  "color_name",
  "material_name",
  "distributor",
  "price_group",
  "thickness_nominal",
  "rack",
  "lot",
  "width_actual_in",
  "length_actual_in",
  "is_active",
  "last_seen_sync_run_id",
  "updated_at"
]);

/** Sort key (API) → physical column (whitelist; anything else falls back to color). */
export const SORT_COLUMNS = Object.freeze({
  color: "color_name",
  material: "material_name",
  inventory_id: "inventory_id",
  rack: "rack",
  updated_at: "updated_at"
});

/** Columns matched by free-text search (ILIKE). */
export const SEARCH_COLUMNS = Object.freeze([
  "color_name",
  "material_name",
  "inventory_id",
  "rack",
  "lot",
  "distributor"
]);

export const IMAGE_STATUS_VALUES = Object.freeze(["unknown", "ok", "missing", "error"]);

/** UI label for the imported (non-authoritative) SlabCloud price group. */
export const SOURCE_PRICE_GROUP_LABEL = "Source price group";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

const jsonNoStore = (res) => res.set("Cache-Control", "no-store");

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function trimStr(v) {
  return v == null ? "" : String(v).trim();
}

/** PostgREST ILIKE escaping for user-supplied search fragments. */
function escapeIlike(term) {
  return String(term ?? "").replace(/[%,()\\]/g, " ").trim();
}

export function clampLimit(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export function clampOffset(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Resolve a safe sort column + direction. Unknown keys fall back to color_name asc.
 * @param {string} sortKey
 * @param {string} direction
 */
export function resolveSort(sortKey, direction) {
  const column = SORT_COLUMNS[trimStr(sortKey)] || SORT_COLUMNS.color;
  const dir = trimStr(direction).toLowerCase();
  const ascending = dir === "desc" ? false : true;
  return { column, ascending };
}

/**
 * Normalize list query params into a validated, backend-owned filter object.
 * @param {Record<string, unknown>} query
 */
export function parseListParams(query = {}) {
  const q = query || {};
  const isActiveRaw = trimStr(q.is_active).toLowerCase();
  // Default to active-only. Pass is_active=all to include inactive, is_active=false for inactive-only.
  let isActive = true;
  if (isActiveRaw === "all") isActive = null;
  else if (isActiveRaw === "false" || isActiveRaw === "0") isActive = false;
  else if (isActiveRaw === "true" || isActiveRaw === "1" || isActiveRaw === "") isActive = true;

  const imageStatus = trimStr(q.image_status).toLowerCase();
  const { column, ascending } = resolveSort(q.sort, q.direction);

  return {
    search: trimStr(q.search || q.q),
    material_name: trimStr(q.material_name),
    color_name: trimStr(q.color_name),
    price_group: trimStr(q.price_group),
    thickness_nominal: trimStr(q.thickness_nominal),
    rack: trimStr(q.rack),
    distributor: trimStr(q.distributor),
    image_status: IMAGE_STATUS_VALUES.includes(imageStatus) ? imageStatus : "",
    is_active: isActive,
    limit: clampLimit(q.limit),
    offset: clampOffset(q.offset),
    sortColumn: column,
    ascending
  };
}

/**
 * Build the staff-safe API row from a slab_inventory row + its resolved image row.
 * Surfaces price_group as `source_price_group` (imported, non-authoritative).
 * @param {Record<string, unknown>} row
 * @param {{ image_url?: string|null, thumbnail_url?: string|null, image_status?: string|null }|null} image
 */
export function mapSlabRow(row, image = null) {
  const r = row || {};
  const img = image || {};
  return {
    id: r.id ?? null,
    external_slab_id: r.external_slab_id ?? null,
    inventory_id: r.inventory_id ?? null,
    color_name: r.color_name ?? null,
    material_name: r.material_name ?? null,
    distributor: r.distributor ?? null,
    // Imported SlabCloud price group only — NOT slabOS pricing authority.
    source_price_group: r.price_group ?? null,
    price_group: r.price_group ?? null,
    source_price_group_label: SOURCE_PRICE_GROUP_LABEL,
    thickness_nominal: r.thickness_nominal ?? null,
    rack: r.rack ?? null,
    lot: r.lot ?? null,
    width_actual_in: r.width_actual_in ?? null,
    length_actual_in: r.length_actual_in ?? null,
    is_active: r.is_active !== false,
    last_seen_sync_run_id: r.last_seen_sync_run_id ?? null,
    updated_at: r.updated_at ?? null,
    image_url: img.image_url ?? null,
    thumbnail_url: img.thumbnail_url ?? null,
    image_status: img.image_status ?? "unknown",
    inventory_source: r.external_source ?? null,
    image_url_pattern: img.image_url_pattern ?? null,
    image_source_label: imagePatternDisplayLabel(img.image_url_pattern),
  };
}

/**
 * Score a candidate inventory row + its resolved image for use as a
 * representative card image.  Higher score = better candidate.
 *
 * Scoring tiers (descending priority):
 *   1. Must have image_status === "ok" and at least one URL (image_url or thumbnail_url).
 *      Rows without a usable verified image score 0 and are never chosen.
 *   2. source_inventory_type: "Slab" >> "Remnant" >> other.
 *      The type tier is weighted so it always dominates the area tiebreaker.
 *   3. Physical area (width_actual_in × length_actual_in): larger wins within
 *      the same type tier.  Rows with missing dimensions receive area = 0.
 *
 * Deterministic: given the same inputs the score is always the same number.
 * Never reads count_for_color.
 *
 * @param {{ source_inventory_type?: string|null, width_actual_in?: number|null, length_actual_in?: number|null }} invRow
 * @param {{ image_status?: string|null, image_url?: string|null, thumbnail_url?: string|null }|null} image
 * @returns {number} score ≥ 0; 0 means "not usable as representative"
 */
export function scoreRepresentativeInventoryImage(invRow, image) {
  if (!image) return 0;
  if (image.image_status !== "ok") return 0;
  if (!image.image_url && !image.thumbnail_url) return 0;

  // Type tier — gap of 100 000 ensures Slab always beats any Remnant regardless of area.
  const type = String(invRow?.source_inventory_type ?? "").trim();
  let typeTier = 0;
  if (type === "Slab") typeTier = 2;
  else if (type === "Remnant") typeTier = 1;

  // Area tiebreaker within the same type tier.
  const w = Number.isFinite(+invRow?.width_actual_in) ? +invRow.width_actual_in : 0;
  const l = Number.isFinite(+invRow?.length_actual_in) ? +invRow.length_actual_in : 0;
  const area = w > 0 && l > 0 ? w * l : 0;

  return typeTier * 100_000 + area;
}

/**
 * Choose the best representative image from an array of inventory rows.
 *
 * Applies scoreRepresentativeInventoryImage to every (row, image) pair and
 * returns the fields of the highest-scoring candidate.  Returns null fields
 * when no row has a usable verified image (score > 0).
 *
 * Deterministic: same inputs → same output.  Never reads count_for_color.
 *
 * @param {Array<Record<string, unknown>>} invRows
 * @param {Map<string, Record<string, unknown>>} imageMap
 * @param {{ mode?: string, externalSource?: string|null, resolved?: string }} [sourceFilter]
 * @returns {{
 *   representative_image_url: string|null,
 *   representative_thumbnail_url: string|null,
 *   representative_image_source_inventory_type: string|null,
 *   representative_image_inventory_id: string|null
 * }}
 */
export function chooseRepresentativeInventoryImage(invRows, imageMap, sourceFilter = null) {
  let bestRow = null;
  let bestImage = null;
  let bestScore = 0;

  for (const r of Array.isArray(invRows) ? invRows : []) {
    const slabId = String(r?.external_slab_id ?? "").trim();
    if (!slabId) continue;
    const image = lookupInventoryImage(imageMap, r, sourceFilter);
    const score = scoreRepresentativeInventoryImage(r, image);
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
      bestImage = image;
    }
  }

  if (!bestImage || bestScore <= 0) {
    return {
      representative_image_url: null,
      representative_thumbnail_url: null,
      representative_image_source_inventory_type: null,
      representative_image_inventory_id: null,
    };
  }

  return {
    representative_image_url: bestImage.image_url ?? null,
    representative_thumbnail_url: bestImage.thumbnail_url ?? null,
    representative_image_source_inventory_type:
      String(bestRow?.source_inventory_type ?? "").trim() || null,
    representative_image_inventory_id: bestRow?.inventory_id ?? null,
  };
}

// ── Visual asset helpers (slab_color_visual_assets cache) ────────────────────
//
// These helpers are PRESENTATION ENRICHMENT ONLY.
// They read from slab_color_visual_assets — never from slab_inventory.
// No count fields are read or returned.

/**
 * Image priority scores for visual asset display selection:
 *   approved + is_primary  → 1150
 *   approved               → 1000
 *   imported + is_primary  →  150
 *   imported               →  100
 *   texture kind bonus     →   10
 *   (needs_review, rejected → 0 — never shown)
 */
function scoreVisualAsset(asset) {
  if (!asset) return 0;
  if (asset.is_active === false) return 0;
  const status = asset.review_status;
  if (status !== "approved" && status !== "imported") return 0;
  const statusScore  = status === "approved" ? 1000 : 100;
  const primaryScore = asset.is_primary ? 50 : 0;
  const kindScore    = asset.asset_kind === "texture" ? 10 : 0;
  return statusScore + primaryScore + kindScore;
}

/**
 * Choose the best visual asset to display for a catalog item.
 * Priority: approved/primary > approved > imported/texture > imported.
 * Rejected and needs_review assets are excluded.
 *
 * @param {Array} assets  Rows from slab_color_visual_assets for one catalog item
 * @returns {Object|null}
 */
export function chooseVisualAssetForDisplay(assets) {
  const list = Array.isArray(assets) ? assets : [];
  if (!list.length) return null;

  let best = null;
  let bestScore = 0;
  for (const a of list) {
    const score = scoreVisualAsset(a);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * Build the visual asset enrichment fields for an API card from the best asset.
 * Returns null-valued fields when no asset is provided.
 * Never exposes count fields or inventory authority data.
 *
 * @param {Object|null} asset  Best asset from chooseVisualAssetForDisplay()
 * @returns {Object}
 */
export function buildVisualAssetEnrichmentFields(asset) {
  if (!asset) {
    return {
      visual_asset_url:           null,
      visual_asset_url_600:       null,
      visual_asset_url_1024:      null,
      visual_asset_source:        null,
      visual_asset_kind:          null,
      visual_asset_review_status: null,
    };
  }
  return {
    visual_asset_url:
      asset.texture_url_1024 ?? asset.hero_url ?? asset.original_image_url ?? asset.texture_url_600 ?? null,
    visual_asset_url_600:       asset.texture_url_600       ?? null,
    visual_asset_url_1024:      asset.texture_url_1024      ?? null,
    visual_asset_source:        asset.source_system         ?? null,
    visual_asset_kind:          asset.asset_kind            ?? null,
    visual_asset_review_status: asset.review_status         ?? null,
  };
}

/**
 * Build a Map<catalog_item_id → best_visual_asset> from a flat list of asset rows.
 * Used to enrich Elite 100 cards in the route handler.
 *
 * @param {Array} assetRows  Rows from slab_color_visual_assets
 * @returns {Map<string, Object>}
 */
export function buildVisualAssetMap(assetRows) {
  const byItemId = new Map();
  for (const a of Array.isArray(assetRows) ? assetRows : []) {
    if (!a.catalog_item_id) continue;
    const list = byItemId.get(a.catalog_item_id) ?? [];
    list.push(a);
    byItemId.set(a.catalog_item_id, list);
  }
  const result = new Map();
  for (const [itemId, list] of byItemId.entries()) {
    const best = chooseVisualAssetForDisplay(list);
    if (best) result.set(itemId, best);
  }
  return result;
}

/**
 * Build a Map<catalog_item_id → all active visual assets> for variant expansion.
 * @param {Array} assetRows
 * @returns {Map<string, Array>}
 */
export function buildVisualAssetsByCatalogId(assetRows) {
  const byItemId = new Map();
  for (const a of Array.isArray(assetRows) ? assetRows : []) {
    if (!a.catalog_item_id) continue;
    const list = byItemId.get(a.catalog_item_id) ?? [];
    list.push(a);
    byItemId.set(a.catalog_item_id, list);
  }
  return byItemId;
}

/**
 * Build a Map<normColorKey → best_visual_asset> for non-stock cards.
 * Key format: "{normalized_color_name}||{normalized_material_name}".
 *
 * @param {Array} assetRows  Rows from slab_color_visual_assets (catalog_item_id null)
 * @returns {Map<string, Object>}
 */
export function buildNonStockVisualAssetMap(assetRows) {
  const byKey = new Map();
  for (const a of Array.isArray(assetRows) ? assetRows : []) {
    const key = `${a.normalized_color_name ?? ""}||${a.normalized_material_name ?? ""}`;
    const list = byKey.get(key) ?? [];
    list.push(a);
    byKey.set(key, list);
  }
  const result = new Map();
  for (const [key, list] of byKey.entries()) {
    const best = chooseVisualAssetForDisplay(list);
    if (best) result.set(key, best);
  }
  return result;
}

/**
 * Compute summary aggregates from a lightweight projection of ACTIVE slab rows.
 *
 * CRITICAL: actual slab count is the count of rows (distinct slabs), NEVER the
 * sum of SlabCloud's `count_for_color` (which is a repeated color-group value).
 * `count_for_color` is not even selected by this head.
 *
 * @param {Array<{ color_name?: string|null, material_name?: string|null, price_group?: string|null }>} rows
 */
export function summarizeActiveRows(rows = []) {
  const colors = new Set();
  const materials = new Set();
  /** @type {Map<string, number>} */
  const byPriceGroup = new Map();
  let totalActive = 0;

  for (const r of Array.isArray(rows) ? rows : []) {
    totalActive += 1;
    const color = trimStr(r?.color_name);
    const material = trimStr(r?.material_name);
    if (color) colors.add(color.toLowerCase());
    if (material) materials.add(material.toLowerCase());
    const pg = trimStr(r?.price_group) || "(none)";
    byPriceGroup.set(pg, (byPriceGroup.get(pg) || 0) + 1);
  }

  const byPriceGroupArr = [...byPriceGroup.entries()]
    .map(([price_group, count]) => ({ price_group, count }))
    .sort((a, b) => b.count - a.count || a.price_group.localeCompare(b.price_group));

  return {
    total_active_slabs: totalActive,
    distinct_colors: colors.size,
    distinct_materials: materials.size,
    slabs_by_price_group: byPriceGroupArr
  };
}

/** Distinct, sorted, non-empty string values from a column projection. */
function distinctValues(rows, column) {
  const set = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    const v = trimStr(r?.[column]);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

// =============================================================================
// Color Program API — typed inventory aggregated by color/material/price_group
// =============================================================================

/**
 * Active ESF price groups in canonical display order.
 * Group G is intentionally excluded — not an active ESF group.
 * Unknown/other price groups sort after F.
 */
export const COLOR_PROGRAM_PRICE_GROUP_ORDER = Object.freeze(["Promo", "A", "B", "C", "D", "E", "F"]);

/** source_inventory_scope value used for color-program aggregation. */
const COLOR_PROGRAM_SCOPE = "typed";

/**
 * Staff-safe per-slab columns for the color inventory endpoint.
 * Intentionally explicit (no SELECT *). Never includes count_for_color.
 */
export const COLOR_INVENTORY_SELECT_COLUMNS = Object.freeze([
  "id",
  "external_source",
  "external_slab_id",
  "inventory_id",
  "color_name",
  "material_name",
  "source_inventory_type",
  "source_inventory_scope",
  "price_group",
  "thickness_nominal",
  "rack",
  "lot",
  "width_actual_in",
  "length_actual_in",
  "source_public_slug",
  "source_api_company_code",
  "source_asset_company_code",
  "is_active"
]);

/** Produce a URL-safe, lowercase, hyphen-normalized slug from a raw string. */
function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build a stable, deterministic, URL-safe color_key from the three grouping
 * dimensions: color_name, material_name, source_price_group.
 *
 * Uses "--" as separator. Individual slugs never contain "--" because the
 * slugify function collapses non-alphanum runs to a single "-".
 * Not reversible (slug only). Not a DB ID.
 *
 * @param {string|null|undefined} colorName
 * @param {string|null|undefined} materialName
 * @param {string|null|undefined} priceGroup
 */
export function makeColorKey(colorName, materialName, priceGroup) {
  return [slugify(colorName), slugify(materialName), slugify(priceGroup)]
    .map((s) => s || "unknown")
    .join("--");
}

/**
 * Return the sort index for a price group within the canonical display order.
 * Groups not in the list (including Group G and any other unknown value) sort
 * after F (index = COLOR_PROGRAM_PRICE_GROUP_ORDER.length).
 * @param {string|null|undefined} pg
 */
export function priceGroupSortIndex(pg) {
  const i = COLOR_PROGRAM_PRICE_GROUP_ORDER.indexOf(String(pg ?? ""));
  return i === -1 ? COLOR_PROGRAM_PRICE_GROUP_ORDER.length : i;
}

/**
 * Group active typed slab_inventory rows into color-program cards.
 *
 * One card per (color_name, material_name, source_price_group) combination.
 * Counts physical rows only — NEVER sums SlabCloud's count_for_color.
 * Elite 100 classification is NOT applied; program_status = "unclassified".
 *
 * @param {Array<Record<string, unknown>>} rows
 *   Typed active slab_inventory rows (scope=typed, type in [Slab, Remnant]).
 * @param {Map<string, Record<string, unknown>>} imageMap
 *   Built by buildImageMap() with the same sourceFilter.
 * @param {{ mode?: string, externalSource?: string|null, resolved?: string }} [sourceFilter]
 * @returns {Array<Record<string, unknown>>} Cards sorted Promo→A→F→other,
 *   then color_name asc within each price group.
 */
export function groupColorPrograms(rows, imageMap = new Map(), sourceFilter = null) {
  /** @type {Map<string, { color_name: string|null, material_name: string|null, source_price_group: string|null, slabIds: string[], inventoryRows: Array<Record<string, unknown>>, sampleIds: Array<string|null>, slabCount: number, remnantCount: number }>} */
  const groups = new Map();

  for (const r of Array.isArray(rows) ? rows : []) {
    const colorKey = makeColorKey(r.color_name, r.material_name, r.price_group);
    if (!groups.has(colorKey)) {
      groups.set(colorKey, {
        color_name: r.color_name ?? null,
        material_name: r.material_name ?? null,
        source_price_group: r.price_group ?? null,
        slabIds: [],
        inventoryRows: [],
        sampleIds: [],
        slabCount: 0,
        remnantCount: 0
      });
    }
    const g = groups.get(colorKey);
    const slabId = trimStr(r.external_slab_id);
    if (slabId) {
      g.slabIds.push(slabId);
      g.inventoryRows.push(r);
    }
    if (g.sampleIds.length < 5) g.sampleIds.push(r.id ?? null);
    const t = trimStr(r.source_inventory_type);
    if (t === "Slab") g.slabCount += 1;
    else if (t === "Remnant") g.remnantCount += 1;
  }

  const cards = [];
  for (const [colorKey, g] of groups.entries()) {
    // Choose a representative image: first verified (ok) image found for any slab in this group.
    let repImage = null;
    let repThumbnail = null;
    let verifiedCount = 0;
    for (const invRow of g.inventoryRows) {
      const img = lookupInventoryImage(imageMap, invRow, sourceFilter);
      if (img?.image_status === "ok") {
        verifiedCount += 1;
        if (!repImage) {
          repImage = img.image_url ?? null;
          repThumbnail = img.thumbnail_url ?? null;
        }
      }
    }
    cards.push({
      color_key: colorKey,
      color_name: g.color_name,
      material_name: g.material_name,
      source_price_group: g.source_price_group,
      total_inventory_count: g.slabCount + g.remnantCount,
      slab_count: g.slabCount,
      remnant_count: g.remnantCount,
      verified_photo_count: verifiedCount,
      representative_image_url: repImage,
      representative_thumbnail_url: repThumbnail,
      sample_inventory_ids: g.sampleIds,
      source_inventory_scope: COLOR_PROGRAM_SCOPE,
      // Elite 100 classification deferred — needs a future catalog/override layer.
      program_status: "unclassified"
    });
  }

  cards.sort((a, b) => {
    const ia = priceGroupSortIndex(a.source_price_group);
    const ib = priceGroupSortIndex(b.source_price_group);
    if (ia !== ib) return ia - ib;
    return String(a.color_name ?? "").localeCompare(String(b.color_name ?? ""), undefined, { sensitivity: "base" });
  });
  return cards;
}

/**
 * Normalize query params for the color inventory (per-slab rows) endpoint.
 * @param {Record<string, unknown>} query
 */
export function parseColorInventoryParams(query = {}) {
  const q = query || {};
  const typeRaw = trimStr(q.type).toLowerCase();
  const type = ["slab", "remnant"].includes(typeRaw) ? typeRaw : "all";

  const imageStatus = trimStr(q.image_status).toLowerCase();

  // active_only defaults to true; pass active_only=false to include inactive.
  const activeOnlyRaw = trimStr(q.active_only).toLowerCase();
  const activeOnly = activeOnlyRaw === "false" || activeOnlyRaw === "0" ? false : true;

  return {
    type,
    image_status: IMAGE_STATUS_VALUES.includes(imageStatus) ? imageStatus : "",
    active_only: activeOnly
  };
}

/**
 * Given typed inventory rows and resolved catalog deps, return a Map keyed by
 * catalog_item_id → { slabCount, remnantCount, slabIds }.
 * Only exact and alias matches contribute to Elite 100 counts.
 * Fuzzy / unmatched rows are excluded (those become Non-Stock).
 * Exported for unit testing.
 *
 * @param {Array<{ color_name?: string|null, material_name?: string|null, source_inventory_type?: string|null, external_slab_id?: string|null }>} invRows
 * @param {Array<{ id: string, color_name?: string|null, material_name?: string|null, normalized_color_name?: string, normalized_material_name?: string }>} catalogItemList
 * @param {Array<{ normalized_alias_color_name: string, normalized_alias_material_name: string, catalog_color_name: string|null, catalog_material_name: string|null }>} resolvedAliases
 */
export function buildElite100InventoryMap(invRows, catalogItemList, resolvedAliases) {
  const map = new Map(
    (Array.isArray(catalogItemList) ? catalogItemList : []).map((c) => [
      c.id,
      { slabCount: 0, remnantCount: 0, slabIds: [], rows: [] },
    ])
  );

  const uniqueGroups = groupInventoryByColorMaterial(invRows);

  // Match each unique source color group against the catalog.
  for (const sourceGroup of uniqueGroups.values()) {
    const source = {
      color_name: sourceGroup.color_name,
      material_name: sourceGroup.material_name,
    };
    const result = matchSourceColorWithAliases(
      source,
      Array.isArray(catalogItemList) ? catalogItemList : [],
      Array.isArray(resolvedAliases) ? resolvedAliases : []
    );
    // Only exact/alias → Elite 100. Fuzzy/none → Non-Stock.
    if (result.method !== "exact" && result.method !== "alias") continue;
    if (!result.match?.id) continue;

    const acc = map.get(result.match.id);
    if (!acc) continue;

    for (const r of sourceGroup.rows) {
      const slabId = String(r.external_slab_id ?? "").trim();
      if (slabId) acc.slabIds.push(slabId);
      acc.rows.push(r);
      const t = trimStr(r.source_inventory_type);
      if (t === "Slab") acc.slabCount += 1;
      else if (t === "Remnant") acc.remnantCount += 1;
    }
  }

  return map;
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireHeadAccess: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient
 * }} deps
 */
export function attachSlabInventoryRoutes(app, { requireAuth, requireHeadAccess, getSupabase }) {
  if (typeof requireAuth !== "function") throw new Error("attachSlabInventoryRoutes: requireAuth required");
  if (typeof requireHeadAccess !== "function") throw new Error("attachSlabInventoryRoutes: requireHeadAccess required");
  if (typeof getSupabase !== "function") throw new Error("attachSlabInventoryRoutes: getSupabase required");

  const headAccess = requireHeadAccess(SLAB_INVENTORY_HEAD_SLUG, { getSupabase });
  const guard = [requireAuth(), headAccess];
  const db = () => getSupabase();

  async function orgId(req) {
    const ctx = await resolveOrganizationContext({ req, supabase: db(), mode: "authenticated" });
    return ctx.organizationId || null;
  }

  function scopeOrg(query, organizationId) {
    return organizationId ? query.eq("organization_id", organizationId) : query;
  }

  function resolveSourceFilter(req) {
    return resolveInventorySourceFilter({ querySource: req.query?.source });
  }

  function scopeInventory(query, organizationId, sourceFilter) {
    return applyInventorySourceFilter(scopeOrg(query, organizationId), sourceFilter);
  }

  // GET /api/slab-inventory/summary — counts + last sync metadata (read-only).
  //
  // Coverage fields added to distinguish the active cache from the latest sync:
  //   active_cached_slab_count   — rows in slab_inventory where is_active = true
  //   latest_sync_slab_count     — slab_upserted_count from the latest completed sync run
  //   active_not_seen_in_latest_sync_count — active rows whose last_seen_sync_run_id ≠ latest sync id
  //   active_not_seen_in_latest_sync_sample — up to 5 staff-safe sample rows
  //
  // These counts reflect source behaviour: SlabCloud syncs do NOT auto-deactivate
  // slabs that vanish from the feed. The Slabsmith XML ingest path DOES soft-retire
  // missing rows after a successful full sync when SLAB_INVENTORY_RETIRE_MISSING_ENABLED=1
  // (see slabInventoryRetirement.js); with it off, the gap below is expected, not a bug.
  // The UI uses these fields to explain the gap clearly without attempting to fix it here.
  app.get("/api/slab-inventory/summary", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const supabase = db();
      const organizationId = await orgId(req);
      const sourceFilter = resolveSourceFilter(req);
      const scope = (q) => scopeInventory(q, organizationId, sourceFilter);

      let activeCachedSlabCount;
      let activeRowList;
      try {
        activeCachedSlabCount = await countActiveInventoryRows(supabase, scope);
        activeRowList = await fetchActiveInventoryRowsPaginated(supabase, scope);
      } catch (activeErr) {
        if (isMissingRelationError(activeErr)) {
          return res.status(503).json({ ok: false, installed: false, message: "Slab inventory cache not installed." });
        }
        throw activeErr;
      }

      const { lastSync, activeNotSeenCount, coverage_mode: coverageMode } =
        await resolveSummarySyncCoverage(supabase, organizationId, sourceFilter, scopeInventory);

      const latestSyncId = lastSync?.id ?? null;
      const latestSyncSlabCount =
        lastSync?.slab_upserted_count != null ? Number(lastSync.slab_upserted_count) : null;

      /** @type {Array<{id:string,color_name:string|null,material_name:string|null,inventory_id:string|null,rack:string|null,lot:string|null,source_price_group:string|null}>} */
      let activeNotSeenSample = [];

      if (latestSyncId && activeNotSeenCount > 0) {
        // Sample query is capped at 5 — no pagination issue.
        let sampleQ = supabase
          .from("slab_inventory")
          .select("id,color_name,material_name,inventory_id,rack,lot,price_group")
          .eq("is_active", true)
          .neq("last_seen_sync_run_id", latestSyncId)
          .order("color_name", { ascending: true, nullsFirst: false })
          .limit(5);
        sampleQ = scopeInventory(sampleQ, organizationId, sourceFilter);
        const { data: sampleRows } = await sampleQ;
        activeNotSeenSample = (sampleRows ?? []).map((r) => ({
          id: r.id ?? null,
          color_name: r.color_name ?? null,
          material_name: r.material_name ?? null,
          inventory_id: r.inventory_id ?? null,
          rack: r.rack ?? null,
          lot: r.lot ?? null,
          source_price_group: r.price_group ?? null,
        }));
      }

      const summary = summarizeActiveRows(activeRowList);

      // Verified images (status ok), org-scoped.
      let imgQ = supabase.from("slab_images").select("id", { count: "exact", head: true }).eq("image_status", "ok");
      imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
      const { count: verifiedImages } = await imgQ;

      res.json({
        ok: true,
        installed: true,
        organization_id: organizationId,
        active_inventory_source: sourceFilter.resolved,
        summary: {
          ...summary,
          // Authoritative totals from exact count queries (not truncated row fetch).
          total_active_slabs: activeCachedSlabCount,
          active_cached_slab_count: activeCachedSlabCount,
          latest_sync_slab_count: latestSyncSlabCount,
          latest_sync_id: latestSyncId,
          active_not_seen_in_latest_sync_count: activeNotSeenCount,
          active_not_seen_in_latest_sync_sample: activeNotSeenSample,
          active_not_seen_coverage_mode: coverageMode,
          slabs_with_verified_images: Number(verifiedImages || 0),
          last_sync: lastSync
            ? {
                id: lastSync.id,
                status: lastSync.status,
                started_at: lastSync.started_at,
                finished_at: lastSync.finished_at,
                warning_count: Number(lastSync.warning_count || 0),
                slab_upserted_count: lastSync.slab_upserted_count ?? null,
                image_row_written_count: lastSync.image_row_written_count ?? null,
                triggered_by: lastSync.triggered_by ?? null,
                external_source: lastSync.external_source ?? null,
              }
            : null,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/filters — distinct filter options (read-only).
  app.get("/api/slab-inventory/filters", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const supabase = db();
      const organizationId = await orgId(req);
      const sourceFilter = resolveSourceFilter(req);

      let q = supabase
        .from("slab_inventory")
        .select("material_name,color_name,price_group,thickness_nominal,rack,distributor")
        .eq("is_active", true);
      q = scopeInventory(q, organizationId, sourceFilter);
      const { data: rows, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Slab inventory cache not installed." });
        }
        throw error;
      }

      let imgQ = supabase.from("slab_images").select("image_status");
      imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
      const { data: imgRows } = await imgQ;
      const imageStatuses = distinctValues(imgRows ?? [], "image_status");

      res.json({
        ok: true,
        installed: true,
        filters: {
          materials: distinctValues(rows ?? [], "material_name"),
          colors: distinctValues(rows ?? [], "color_name"),
          price_groups: distinctValues(rows ?? [], "price_group"),
          thicknesses: distinctValues(rows ?? [], "thickness_nominal"),
          racks: distinctValues(rows ?? [], "rack"),
          distributors: distinctValues(rows ?? [], "distributor"),
          image_statuses: imageStatuses.length ? imageStatuses : [...IMAGE_STATUS_VALUES]
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/slabs — filtered, paginated list (read-only).
  app.get("/api/slab-inventory/slabs", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const supabase = db();
      const organizationId = await orgId(req);
      const sourceFilter = resolveSourceFilter(req);
      const params = parseListParams(req.query);

      let q = supabase.from("slab_inventory").select(INVENTORY_SELECT_COLUMNS.join(","), { count: "exact" });
      q = scopeInventory(q, organizationId, sourceFilter);
      if (params.is_active !== null) q = q.eq("is_active", params.is_active);
      if (params.material_name) q = q.eq("material_name", params.material_name);
      if (params.color_name) q = q.eq("color_name", params.color_name);
      if (params.price_group) q = q.eq("price_group", params.price_group);
      if (params.thickness_nominal) q = q.eq("thickness_nominal", params.thickness_nominal);
      if (params.rack) q = q.eq("rack", params.rack);
      if (params.distributor) q = q.eq("distributor", params.distributor);

      if (params.search) {
        const term = escapeIlike(params.search);
        if (term) {
          const orExpr = SEARCH_COLUMNS.map((c) => `${c}.ilike.%${term}%`).join(",");
          q = q.or(orExpr);
        }
      }

      q = q
        .order(params.sortColumn, { ascending: params.ascending, nullsFirst: false })
        .order("id", { ascending: true })
        .range(params.offset, params.offset + params.limit - 1);

      const { data: rows, error, count } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Slab inventory cache not installed." });
        }
        throw error;
      }

      const slabIds = (rows ?? []).map((r) => trimStr(r.external_slab_id)).filter(Boolean);
      let imageMap = new Map();
      if (slabIds.length) {
        let imgQ = supabase
          .from("slab_images")
          .select(SLAB_IMAGE_SELECT_COLUMNS)
          .in("external_slab_id", slabIds);
        imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
        const { data: imgRows } = await imgQ;
        imageMap = buildImageMap(imgRows ?? [], sourceFilter);
      }

      const mapped = (rows ?? []).map((r) =>
        mapSlabRow(r, lookupInventoryImage(imageMap, r, sourceFilter))
      );

      res.json({
        ok: true,
        installed: true,
        rows: mapped,
        total: Number(count || 0),
        limit: params.limit,
        offset: params.offset,
        source_price_group_label: SOURCE_PRICE_GROUP_LABEL
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/slabs/:id — single slab detail (read-only).
  app.get("/api/slab-inventory/slabs/:id", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const id = trimStr(req.params.id);
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const supabase = db();
      const organizationId = await orgId(req);
      const sourceFilter = resolveSourceFilter(req);

      let q = supabase.from("slab_inventory").select(INVENTORY_SELECT_COLUMNS.join(",")).eq("id", id).limit(1);
      q = scopeInventory(q, organizationId, sourceFilter);
      const { data: rows, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) return res.status(503).json({ ok: false, installed: false });
        throw error;
      }
      const row = rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "not found" });

      let imageMap = new Map();
      const sid = trimStr(row.external_slab_id);
      if (sid) {
        let imgQ = supabase
          .from("slab_images")
          .select(SLAB_IMAGE_SELECT_COLUMNS)
          .eq("external_slab_id", sid);
        imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
        const { data: imgRows } = await imgQ;
        imageMap = buildImageMap(imgRows ?? [], sourceFilter);
      }

      res.json({
        ok: true,
        row: mapSlabRow(row, lookupInventoryImage(imageMap, row, sourceFilter)),
        source_price_group_label: SOURCE_PRICE_GROUP_LABEL
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/color-programs — aggregated color cards (typed rows only, read-only).
  //
  // Groups active typed rows by (color_name, material_name, source_price_group). One card per
  // combination. Counts physical rows — NEVER sums count_for_color.
  // Active ESF price groups: Promo, A, B, C, D, E, F. Group G is excluded.
  // Elite 100 classification requires a future catalog/override layer — program_status=unclassified.
  app.get("/api/slab-inventory/color-programs", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const supabase = db();
      const organizationId = await orgId(req);
      const sourceFilter = resolveSourceFilter(req);

      // Fetch all active typed rows (minimal projection for grouping).
      // Never selects or sums count_for_color.
      let q = supabase
        .from("slab_inventory")
        .select("id,external_source,external_slab_id,color_name,material_name,price_group,source_inventory_type,source_inventory_scope")
        .eq("is_active", true)
        .eq("source_inventory_scope", COLOR_PROGRAM_SCOPE)
        .in("source_inventory_type", ["Slab", "Remnant"]);
      q = scopeInventory(q, organizationId, sourceFilter);
      const { data: rows, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Slab inventory cache not installed." });
        }
        throw error;
      }

      const rowList = rows ?? [];

      // Fetch all org-scoped slab_images without filtering by slab ID to avoid
      // PostgREST URL-length overflow with large inventories. Join in JS.
      let imageMap = new Map();
      let imgQ = supabase
        .from("slab_images")
        .select(SLAB_IMAGE_SELECT_COLUMNS);
      imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
      const { data: imgRows } = await imgQ;
      if (imgRows?.length) imageMap = buildImageMap(imgRows, sourceFilter);

      const cards = groupColorPrograms(rowList, imageMap, sourceFilter);

      res.json({
        ok: true,
        installed: true,
        organization_id: organizationId,
        color_programs: cards,
        total: cards.length,
        price_group_order: [...COLOR_PROGRAM_PRICE_GROUP_ORDER],
        source_inventory_scope: COLOR_PROGRAM_SCOPE,
        source_price_group_label: SOURCE_PRICE_GROUP_LABEL,
        elite_100_note: "Elite 100 classification requires a future catalog/override layer. program_status=unclassified for all cards."
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/colors/:colorKey/inventory — physical slab/remnant rows for one color.
  //
  // colorKey is a stable slug computed by makeColorKey(color_name, material_name, price_group).
  // Not a DB ID — computed at aggregation time; same inputs always produce the same key.
  //
  // Query params:
  //   type=all|slab|remnant   default: all
  //   image_status            optional — filter by resolved image_status (ok/missing/error/unknown)
  //   active_only=true|false  default: true
  app.get("/api/slab-inventory/colors/:colorKey/inventory", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const colorKey = trimStr(req.params.colorKey);
      if (!colorKey) return res.status(400).json({ ok: false, error: "colorKey required" });

      const supabase = db();
      const organizationId = await orgId(req);
      const sourceFilter = resolveSourceFilter(req);
      const params = parseColorInventoryParams(req.query);

      // Fetch typed rows and match colorKey in JS. Avoids the need to reverse
      // a slug back to raw column values. With ~1,679 typed rows this is fast.
      let q = supabase
        .from("slab_inventory")
        .select(COLOR_INVENTORY_SELECT_COLUMNS.join(","))
        .eq("source_inventory_scope", COLOR_PROGRAM_SCOPE)
        .in("source_inventory_type", ["Slab", "Remnant"]);
      if (params.active_only) q = q.eq("is_active", true);
      q = scopeInventory(q, organizationId, sourceFilter);
      const { data: rows, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Slab inventory cache not installed." });
        }
        throw error;
      }

      const colorMatched = (rows ?? []).filter(
        (r) => makeColorKey(r.color_name, r.material_name, r.price_group) === colorKey
      );

      if (!colorMatched.length) {
        return res.status(404).json({ ok: false, error: "color not found", color_key: colorKey });
      }

      // Filter by inventory type.
      let typeFiltered = colorMatched;
      if (params.type === "slab") {
        typeFiltered = colorMatched.filter((r) => trimStr(r.source_inventory_type) === "Slab");
      } else if (params.type === "remnant") {
        typeFiltered = colorMatched.filter((r) => trimStr(r.source_inventory_type) === "Remnant");
      }

      // Fetch images for this subset (small set per color — safe for .in()).
      const slabIds = typeFiltered.map((r) => trimStr(r.external_slab_id)).filter(Boolean);
      let imageMap = new Map();
      if (slabIds.length) {
        let imgQ = supabase
          .from("slab_images")
          .select(SLAB_IMAGE_SELECT_COLUMNS)
          .in("external_slab_id", slabIds);
        imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
        const { data: imgRows } = await imgQ;
        imageMap = buildImageMap(imgRows ?? [], sourceFilter);
      }

      // Apply image_status post-filter (after images are resolved).
      let finalRows = typeFiltered;
      if (params.image_status) {
        finalRows = typeFiltered.filter((r) => {
          const img = lookupInventoryImage(imageMap, r, sourceFilter);
          return (img?.image_status ?? "unknown") === params.image_status;
        });
      }

      const mapped = finalRows.map((r) => {
        const img = lookupInventoryImage(imageMap, r, sourceFilter);
        return {
          id: r.id ?? null,
          external_slab_id: r.external_slab_id ?? null,
          inventory_id: r.inventory_id ?? null,
          color_name: r.color_name ?? null,
          material_name: r.material_name ?? null,
          source_inventory_type: r.source_inventory_type ?? null,
          source_inventory_scope: r.source_inventory_scope ?? null,
          source_price_group: r.price_group ?? null,
          thickness_nominal: r.thickness_nominal ?? null,
          rack: r.rack ?? null,
          lot: r.lot ?? null,
          width_actual_in: r.width_actual_in ?? null,
          length_actual_in: r.length_actual_in ?? null,
          image_url: img?.image_url ?? null,
          thumbnail_url: img?.thumbnail_url ?? null,
          image_status: img?.image_status ?? "unknown",
          inventory_source: r.external_source ?? null,
          image_url_pattern: img?.image_url_pattern ?? null,
          image_source_label: imagePatternDisplayLabel(img?.image_url_pattern),
          source_public_slug: r.source_public_slug ?? null,
          source_api_company_code: r.source_api_company_code ?? null,
          source_asset_company_code: r.source_asset_company_code ?? null
        };
      });

      res.json({
        ok: true,
        color_key: colorKey,
        type: params.type,
        rows: mapped,
        total: mapped.length,
        source_price_group_label: SOURCE_PRICE_GROUP_LABEL
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // -------------------------------------------------------------------------
  // Helpers shared by the three Elite 100 / Non-Stock routes
  // -------------------------------------------------------------------------

  /**
   * Load the active Elite 100 collection + catalog items + resolved aliases
   * for a given organization.  All reads are server-side service-role only.
   * Returns { collection, catalogItemList, resolvedAliases } — collection is
   * null when no active collection exists (non-fatal).
   */
  async function loadElite100Deps(organizationId) {
    const supabase = db();

    const { data: collections } = await supabase
      .from("slab_color_collections")
      .select("id,collection_key,display_name,collection_year,is_active")
      .eq("is_active", true)
      .eq("organization_id", organizationId)
      .limit(1);

    const collection = collections?.[0] ?? null;
    if (!collection) return { collection: null, catalogItemList: [], resolvedAliases: [] };

    const { data: catalogItems } = await supabase
      .from("slab_color_catalog_items")
      .select(
        "id,color_name,material_name,price_group,normalized_color_name,normalized_material_name,display_name,sort_order"
      )
      .eq("organization_id", organizationId)
      .eq("collection_id", collection.id)
      .eq("is_active", true);

    const catalogItemList = catalogItems ?? [];
    const catalogItemIds = catalogItemList.map((c) => c.id);

    let resolvedAliases = [];
    if (catalogItemIds.length) {
      const { data: aliasRows } = await supabase
        .from("slab_color_aliases")
        .select(
          "catalog_item_id,alias_color_name,alias_material_name,normalized_alias_color_name,normalized_alias_material_name"
        )
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .in("catalog_item_id", catalogItemIds);

      const catalogItemMap = new Map(catalogItemList.map((c) => [c.id, c]));
      resolvedAliases = (aliasRows ?? [])
        .map((alias) => {
          const catItem = catalogItemMap.get(alias.catalog_item_id);
          if (!catItem) return null;
          return {
            normalized_alias_color_name: alias.normalized_alias_color_name,
            normalized_alias_material_name:
              alias.normalized_alias_material_name ?? "",
            catalog_color_name: catItem.color_name,
            catalog_material_name: catItem.material_name,
          };
        })
        .filter(Boolean);
    }

    return { collection, catalogItemList, resolvedAliases };
  }

  // (buildElite100InventoryMap is defined and exported at module level above)

  // GET /api/slab-inventory/elite100-programs
  //
  // Returns all active Elite 100 catalog items organized by Promo/A/B/C/D/E/F,
  // enriched with live typed inventory counts and representative images.
  // Every catalog item is returned even when inventory = 0.
  // Only exact and approved-alias inventory matches contribute to counts.
  // Fuzzy / unmatched inventory is excluded (those belong in Non-Stock).
  // Group G is never returned. No count_for_color is read or summed.
  async function sendElite100ProgramsResponse(req, res, organizationId, opts = {}) {
    const supabase = db();
    const sourceFilter = resolveSourceFilter(req);
    const publicShowroom = opts.publicShowroom === true;

    const { collection, catalogItemList, resolvedAliases } =
      await loadElite100Deps(organizationId);

    if (!collection) {
      return res.json({
        ok: true,
        collection: null,
        groups: [],
        price_group_order: [...COLOR_PROGRAM_PRICE_GROUP_ORDER],
        note: "No active Elite 100 collection found for this organization.",
      });
    }

    // Load active inventory from the configured source (same basis as All Inventory).
    const scopeInv = (q) => scopeInventory(q, organizationId, sourceFilter);
    const inventoryFetch = await fetchAllActiveInventoryRowsForElite100Matching(
      supabase,
      scopeInv
    );
    const invRows = inventoryFetch.rows;
    if (inventoryFetch.fetch_warning) {
      console.warn("[elite100-programs]", inventoryFetch.fetch_warning);
    }

    // Load all org images (avoiding PostgREST URL-length limit).
    let imgQ = supabase
      .from("slab_images")
      .select(SLAB_IMAGE_SELECT_COLUMNS);
    imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
    const { data: imgRows } = await imgQ;
    const imageMap = buildImageMap(imgRows ?? [], sourceFilter);

    // Match inventory to catalog items (exact/alias only).
    const elite100Map = buildElite100InventoryMap(
      invRows ?? [],
      catalogItemList,
      resolvedAliases
    );

    const includeMatchDebug =
      !publicShowroom && trimStr(req.query.debug).toLowerCase() === "match";
      /** @type {Map<string, ReturnType<typeof diagnoseElite100CatalogItem>>|null} */
      let matchDebugByCatalogId = null;
      if (includeMatchDebug) {
        matchDebugByCatalogId = new Map(
          catalogItemList.map((item) => [
            item.id,
            diagnoseElite100CatalogItem(
              item,
              invRows ?? [],
              catalogItemList,
              resolvedAliases
            ),
          ])
        );
      }

      // Load visual assets from cache (slab_color_visual_assets).
      // Non-fatal: if table is not installed yet, visual asset fields are null.
      const catalogItemIds = catalogItemList.map((c) => c.id).filter(Boolean);
      let visualAssetMap = new Map();
      let visualAssetsByCatalogId = new Map();
      if (catalogItemIds.length) {
        try {
          let vaQ = supabase
            .from("slab_color_visual_assets")
            .select(
              "id,catalog_item_id,product_slug,texture_url_600,texture_url_1024,original_image_url,hero_url,asset_kind,review_status,is_primary,is_active,source_system,source_color_name,raw"
            )
            .eq("organization_id", organizationId)
            .eq("is_active", true)
            .in("catalog_item_id", catalogItemIds);
          const { data: vaRows, error: vaErr } = await vaQ;
          if (vaErr) {
            if (!isMissingRelationError(vaErr)) throw vaErr;
            // table not installed yet — skip silently
          } else {
            visualAssetsByCatalogId = buildVisualAssetsByCatalogId(vaRows ?? []);
            visualAssetMap = buildVisualAssetMap(vaRows ?? []);
          }
        } catch (e) {
          // Visual assets are enrichment only — log but do not fail the route
          console.warn("[elite100-programs] Visual asset load error (non-fatal):", e?.message);
        }
      }

      // Enrich each catalog item with image + inventory counts using scored representative selection.
      for (const [, acc] of elite100Map.entries()) {
        // Count verified photos across all matched slabs.
        let verifiedCount = 0;
        for (const invRow of acc.rows) {
          if (lookupInventoryImage(imageMap, invRow, sourceFilter)?.image_status === "ok") {
            verifiedCount += 1;
          }
        }
        const repResult = chooseRepresentativeInventoryImage(acc.rows, imageMap, sourceFilter);
        acc.verifiedPhotoCount = verifiedCount;
        acc.repImage = repResult.representative_image_url;
        acc.repThumbnail = repResult.representative_thumbnail_url;
        acc.repSourceInventoryType = repResult.representative_image_source_inventory_type;
        acc.repInventoryId = repResult.representative_image_inventory_id;
      }

      // Sort helper: catalog sort_order then color_name.
      function sortItems(items) {
        return [...items].sort((a, b) => {
          const sa = a._sort_order ?? 9999;
          const sb = b._sort_order ?? 9999;
          if (sa !== sb) return sa - sb;
          return String(a.color_name ?? "").localeCompare(
            String(b.color_name ?? ""),
            undefined,
            { sensitivity: "base" }
          );
        });
      }

      // Build grouped response.
      const groupsMap = new Map(
        COLOR_PROGRAM_PRICE_GROUP_ORDER.map((pg) => [pg, []])
      );

      for (const item of catalogItemList) {
        const pg = item.price_group;
        if (!groupsMap.has(pg)) continue; // skip Group G or unknown

        const acc = elite100Map.get(item.id) ?? {
          slabCount: 0,
          remnantCount: 0,
          rows: [],
          verifiedPhotoCount: 0,
          repImage: null,
          repThumbnail: null,
          repSourceInventoryType: null,
          repInventoryId: null,
        };

        const inventorySummary = summarizeElite100CurrentInventory(acc);
        const referenceFields = buildElite100ReferenceImageFields(
          visualAssetMap.get(item.id) ?? null
        );
        const currentInventoryImages = buildElite100CurrentInventoryImageFields({
          representative_image_url: acc.repImage ?? null,
          representative_thumbnail_url: acc.repThumbnail ?? null,
          representative_image_source_inventory_type: acc.repSourceInventoryType ?? null,
          representative_image_inventory_id: acc.repInventoryId ?? null,
        });

        const card = {
          catalog_item_id: item.id,
          color_key: makeColorKey(item.color_name, item.material_name, item.price_group),
          color_name: item.color_name,
          material_name: item.material_name,
          display_name: item.display_name,
          price_group: pg,
          ...inventorySummary,
          ...referenceFields,
          ...currentInventoryImages,
          // Legacy fields retained for backward compatibility (reference ≠ inventory).
          representative_image_url: acc.repImage ?? null,
          representative_thumbnail_url: acc.repThumbnail ?? null,
          representative_image_source_inventory_type: acc.repSourceInventoryType ?? null,
          representative_image_inventory_id: acc.repInventoryId ?? null,
          ...buildVisualAssetEnrichmentFields(visualAssetMap.get(item.id) ?? null),
          program_status: "elite_100",
          _sort_order: item.sort_order ?? 9999,
        };
        if (matchDebugByCatalogId?.has(item.id)) {
          card.match_debug = compactElite100MatchDebug(matchDebugByCatalogId.get(item.id));
        }
        groupsMap.get(pg).push(card);

        const variantAssets = listElite100FinishVariantAssets(
          visualAssetsByCatalogId.get(item.id) ?? []
        );
        for (const variantAsset of variantAssets) {
          groupsMap.get(pg).push(
            buildElite100FinishVariantCard(card, variantAsset)
          );
        }
      }

      const groups = COLOR_PROGRAM_PRICE_GROUP_ORDER.map((pg) => ({
        price_group: pg,
        items: sortItems(groupsMap.get(pg) ?? []).map(
          ({ _sort_order: _so, ...rest }) =>
            publicShowroom ? toPublicElite100ShowroomCard(rest) : rest
        ),
      }));

    return res.json({
      ok: true,
      installed: true,
      // Public showroom: omit active_inventory_source — inventory is not part of the public product surface.
      ...(publicShowroom ? {} : { active_inventory_source: sourceFilter.resolved }),
      collection: {
        collection_key: collection.collection_key,
        display_name: collection.display_name,
        collection_year: collection.collection_year ?? null,
        is_active: collection.is_active,
      },
      groups,
      price_group_order: [...COLOR_PROGRAM_PRICE_GROUP_ORDER],
      ...(includeMatchDebug
        ? {
            match_report_summary: {
              inventory_row_count: invRows.length,
              catalog_item_count: catalogItemList.length,
              matched_catalog_count: catalogItemList.filter(
                (c) => (elite100Map.get(c.id)?.rows?.length ?? 0) > 0
              ).length,
              active_inventory_rows_fetched: inventoryFetch.active_inventory_rows_fetched,
              expected_active_count: inventoryFetch.expected_active_count,
              active_inventory_fetch_pages: inventoryFetch.active_inventory_fetch_pages,
              active_inventory_fetch_complete: inventoryFetch.active_inventory_fetch_complete,
              fetch_warning: inventoryFetch.fetch_warning,
              note: "Debug only (?debug=match). Fuzzy candidates are suggestions — not counted as inventory.",
            },
          }
        : {}),
    });
  }

  app.get("/api/slab-inventory/elite100-programs", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      await sendElite100ProgramsResponse(req, res, organizationId);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/public/elite100-showroom
  //
  // Public read-only Elite 100 carousel payload for digital signage / Arreya embeds.
  // No auth. Org is resolved from SLABOS_ORGANIZATION_ID (or SLABCLOUD_ORGANIZATION_ID).
  // Same card shape as elite100-programs; debug query params are ignored.
  app.get("/api/public/elite100-showroom", async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = resolveOrgId();
      if (!organizationId) {
        return res.status(503).json({
          ok: false,
          error: "Elite 100 public showroom is not configured (SLABOS_ORGANIZATION_ID).",
        });
      }
      await sendElite100ProgramsResponse(req, res, organizationId, { publicShowroom: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/public/cambria-showroom
  //
  // Public Cambria vendor/kiosk showcase: Cambria Designs (Elite 100 filtered) +
  // Cambria Live Inventory. No auth. Inventory counts are intentionally included
  // for this presentation; costs / rack / lot / supplier codes are never returned.
  app.get("/api/public/cambria-showroom", async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = resolveOrgId();
      if (!organizationId) {
        return res.status(503).json({
          ok: false,
          error: "Cambria public showroom is not configured (SLABOS_ORGANIZATION_ID).",
        });
      }

      const supabase = db();
      const sourceFilter = resolveSourceFilter(req);

      const { collection, catalogItemList, resolvedAliases } =
        await loadElite100Deps(organizationId);

      const cambriaCatalog = (catalogItemList ?? []).filter(isCambriaCatalogItem);

      // Active inventory for both design counts and live inventory cards.
      const scopeInv = (q) => scopeInventory(q, organizationId, sourceFilter);
      const cambriaInventorySelect = [
        ...COLOR_INVENTORY_SELECT_COLUMNS,
        "distributor",
      ].join(",");
      const inventoryFetch = await fetchAllActiveInventoryRowsForScope(
        supabase,
        scopeInv,
        cambriaInventorySelect
      );
      const invRows = inventoryFetch.rows ?? [];
      if (inventoryFetch.fetch_warning) {
        console.warn("[cambria-showroom]", inventoryFetch.fetch_warning);
      }

      let imgQ = supabase.from("slab_images").select(SLAB_IMAGE_SELECT_COLUMNS);
      imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
      const { data: imgRows } = await imgQ;
      const imageMap = buildImageMap(imgRows ?? [], sourceFilter);

      // Designs: Elite 100 Cambria catalog cards with live inventory counts.
      const elite100Map = buildElite100InventoryMap(
        invRows,
        cambriaCatalog,
        resolvedAliases
      );

      for (const [, acc] of elite100Map.entries()) {
        let verifiedCount = 0;
        for (const invRow of acc.rows) {
          if (lookupInventoryImage(imageMap, invRow, sourceFilter)?.image_status === "ok") {
            verifiedCount += 1;
          }
        }
        const repResult = chooseRepresentativeInventoryImage(acc.rows, imageMap, sourceFilter);
        acc.verifiedPhotoCount = verifiedCount;
        acc.repImage = repResult.representative_image_url;
        acc.repThumbnail = repResult.representative_thumbnail_url;
        acc.repSourceInventoryType = repResult.representative_image_source_inventory_type;
        acc.repInventoryId = repResult.representative_image_inventory_id;
      }

      const catalogItemIds = cambriaCatalog.map((c) => c.id).filter(Boolean);
      let visualAssetMap = new Map();
      let visualAssetsByCatalogId = new Map();
      if (catalogItemIds.length) {
        try {
          const { data: vaRows, error: vaErr } = await supabase
            .from("slab_color_visual_assets")
            .select(
              "id,catalog_item_id,product_slug,texture_url_600,texture_url_1024,original_image_url,hero_url,asset_kind,review_status,is_primary,is_active,source_system,source_color_name,raw"
            )
            .eq("organization_id", organizationId)
            .eq("is_active", true)
            .in("catalog_item_id", catalogItemIds);
          if (vaErr) {
            if (!isMissingRelationError(vaErr)) throw vaErr;
          } else {
            visualAssetsByCatalogId = buildVisualAssetsByCatalogId(vaRows ?? []);
            visualAssetMap = buildVisualAssetMap(vaRows ?? []);
          }
        } catch (e) {
          console.warn("[cambria-showroom] Visual asset load error (non-fatal):", e?.message);
        }
      }

      function sortItems(items) {
        return [...items].sort((a, b) => {
          const sa = a._sort_order ?? 9999;
          const sb = b._sort_order ?? 9999;
          if (sa !== sb) return sa - sb;
          return String(a.color_name ?? "").localeCompare(String(b.color_name ?? ""), undefined, {
            sensitivity: "base",
          });
        });
      }

      const groupsMap = new Map(COLOR_PROGRAM_PRICE_GROUP_ORDER.map((pg) => [pg, []]));

      for (const item of cambriaCatalog) {
        const pg = item.price_group;
        if (!groupsMap.has(pg)) continue;

        const acc = elite100Map.get(item.id) ?? {
          slabCount: 0,
          remnantCount: 0,
          rows: [],
          verifiedPhotoCount: 0,
          repImage: null,
          repThumbnail: null,
          repSourceInventoryType: null,
          repInventoryId: null,
        };

        const inventorySummary = summarizeElite100CurrentInventory(acc);
        const referenceFields = buildElite100ReferenceImageFields(
          visualAssetMap.get(item.id) ?? null
        );
        const currentInventoryImages = buildElite100CurrentInventoryImageFields({
          representative_image_url: acc.repImage ?? null,
          representative_thumbnail_url: acc.repThumbnail ?? null,
          representative_image_source_inventory_type: acc.repSourceInventoryType ?? null,
          representative_image_inventory_id: acc.repInventoryId ?? null,
        });

        const card = toPublicCambriaDesignCard({
          catalog_item_id: item.id,
          color_key: makeColorKey(item.color_name, item.material_name, item.price_group),
          color_name: item.color_name,
          material_name: item.material_name,
          display_name: item.display_name,
          price_group: pg,
          ...inventorySummary,
          ...referenceFields,
          ...currentInventoryImages,
          representative_image_url: acc.repImage ?? null,
          representative_thumbnail_url: acc.repThumbnail ?? null,
          representative_image_source_inventory_type: acc.repSourceInventoryType ?? null,
          representative_image_inventory_id: acc.repInventoryId ?? null,
          ...buildVisualAssetEnrichmentFields(visualAssetMap.get(item.id) ?? null),
          program_status: "elite_100",
          _sort_order: item.sort_order ?? 9999,
        });
        groupsMap.get(pg).push(card);

        const variantAssets = listElite100FinishVariantAssets(
          visualAssetsByCatalogId.get(item.id) ?? []
        );
        for (const variantAsset of variantAssets) {
          groupsMap.get(pg).push(
            toPublicCambriaDesignCard(buildElite100FinishVariantCard(card, variantAsset))
          );
        }
      }

      const designGroups = COLOR_PROGRAM_PRICE_GROUP_ORDER.map((pg) => ({
        price_group: pg,
        items: sortItems(groupsMap.get(pg) ?? []).map(({ _sort_order: _so, ...rest }) => rest),
      })).filter((g) => g.items.length > 0);

      const inventoryCards = groupCambriaLiveInventoryCards(
        invRows,
        imageMap,
        lookupInventoryImage,
        sourceFilter
      );

      return res.json(
        buildPublicCambriaShowroomPayload({
          collection,
          designGroups,
          inventoryCards,
          price_group_order: [...COLOR_PROGRAM_PRICE_GROUP_ORDER],
          ...(!collection
            ? { note: "No active Elite 100 collection found; live Cambria inventory may still be listed." }
            : {}),
        })
      );
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // GET /api/slab-inventory/elite100-programs/:catalogItemId/inventory
  //
  // Returns physical slab and remnant rows for one Elite 100 catalog item.
  // Matches inventory using exact normalized color/material + approved aliases.
  // Slabs and remnants are returned in separate arrays.
  // Supports ?type=all|slab|remnant  (default: all).
  app.get(
    "/api/slab-inventory/elite100-programs/:catalogItemId/inventory",
    ...guard,
    async (req, res) => {
      try {
        jsonNoStore(res);
        const catalogItemId = trimStr(req.params.catalogItemId);
        if (!isUuid(catalogItemId)) {
          return res.status(400).json({ ok: false, error: "invalid catalogItemId" });
        }

        const supabase = db();
        const organizationId = await orgId(req);
        const sourceFilter = resolveSourceFilter(req);
        const typeParam = trimStr(req.query.type ?? "").toLowerCase();
        const type = ["slab", "remnant"].includes(typeParam) ? typeParam : "all";

        // Load the specific catalog item.
        let catQ = supabase
          .from("slab_color_catalog_items")
          .select(
            "id,color_name,material_name,display_name,price_group,normalized_color_name,normalized_material_name"
          )
          .eq("id", catalogItemId)
          .limit(1);
        catQ = scopeOrg(catQ, organizationId);
        const { data: catRows, error: catErr } = await catQ;
        if (catErr) throw catErr;
        const catItem = catRows?.[0] ?? null;
        if (!catItem) {
          return res.status(404).json({
            ok: false,
            error: "Elite 100 catalog item not found",
          });
        }

        // Load aliases for this specific catalog item.
        let aliasQ = supabase
          .from("slab_color_aliases")
          .select(
            "alias_color_name,alias_material_name,normalized_alias_color_name,normalized_alias_material_name"
          )
          .eq("catalog_item_id", catalogItemId)
          .eq("is_active", true);
        aliasQ = scopeOrg(aliasQ, organizationId);
        const { data: aliasRows } = await aliasQ;

        const resolvedAliases = (aliasRows ?? []).map((a) => ({
          normalized_alias_color_name: a.normalized_alias_color_name,
          normalized_alias_material_name:
            a.normalized_alias_material_name ?? "",
          catalog_color_name: catItem.color_name,
          catalog_material_name: catItem.material_name,
        }));

        // Load active inventory from configured source; match to this catalog item in JS.
        const scopeInv = (q) => scopeInventory(q, organizationId, sourceFilter);
        const inventoryFetch = await fetchAllActiveInventoryRowsForScope(
          supabase,
          scopeInv,
          COLOR_INVENTORY_SELECT_COLUMNS.join(",")
        );
        const invRows = inventoryFetch.rows;
        if (inventoryFetch.fetch_warning) {
          console.warn("[elite100-inventory]", inventoryFetch.fetch_warning);
        }

        // Filter to rows that match this catalog item (exact or alias only).
        const matchedRows = (invRows ?? []).filter((r) => {
          const result = matchSourceColorWithAliases(
            { color_name: r.color_name, material_name: r.material_name },
            [catItem],
            resolvedAliases
          );
          return result.method === "exact" || result.method === "alias";
        });

        // Apply type filter.
        let typeFiltered = matchedRows;
        if (type === "slab") {
          typeFiltered = matchedRows.filter(
            (r) => trimStr(r.source_inventory_type) === "Slab"
          );
        } else if (type === "remnant") {
          typeFiltered = matchedRows.filter(
            (r) => trimStr(r.source_inventory_type) === "Remnant"
          );
        }

        // Load images for the result set.
        const slabIds = typeFiltered
          .map((r) => trimStr(r.external_slab_id))
          .filter(Boolean);
        let imageMap = new Map();
        if (slabIds.length) {
          let imgQ = supabase
            .from("slab_images")
            .select(SLAB_IMAGE_SELECT_COLUMNS)
            .in("external_slab_id", slabIds);
          imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
          const { data: imgRows } = await imgQ;
          imageMap = buildImageMap(imgRows ?? [], sourceFilter);
        }

        const mapRow = (r) => {
          const img = lookupInventoryImage(imageMap, r, sourceFilter);
          return {
            id: r.id ?? null,
            external_slab_id: r.external_slab_id ?? null,
            inventory_id: r.inventory_id ?? null,
            color_name: r.color_name ?? null,
            material_name: r.material_name ?? null,
            source_inventory_type: r.source_inventory_type ?? null,
            source_inventory_scope: r.source_inventory_scope ?? null,
            source_price_group: r.price_group ?? null,
            thickness_nominal: r.thickness_nominal ?? null,
            rack: r.rack ?? null,
            lot: r.lot ?? null,
            width_actual_in: r.width_actual_in ?? null,
            length_actual_in: r.length_actual_in ?? null,
            image_url: img?.image_url ?? null,
            thumbnail_url: img?.thumbnail_url ?? null,
            image_status: img?.image_status ?? "unknown",
            inventory_source: r.external_source ?? null,
            image_url_pattern: img?.image_url_pattern ?? null,
            image_source_label: imagePatternDisplayLabel(img?.image_url_pattern),
            source_public_slug: r.source_public_slug ?? null,
            source_api_company_code: r.source_api_company_code ?? null,
            source_asset_company_code: r.source_asset_company_code ?? null,
          };
        };

        const mapped = typeFiltered.map(mapRow);
        const slabs = type !== "remnant"
          ? mapped.filter((r) => r.source_inventory_type === "Slab")
          : [];
        const remnants = type !== "slab"
          ? mapped.filter((r) => r.source_inventory_type === "Remnant")
          : [];

        // Catalog reference image (showroom hero) — independent of current stock.
        let referenceFields = buildElite100ReferenceImageFields(null);
        try {
          const { data: vaRows, error: vaErr } = await supabase
            .from("slab_color_visual_assets")
            .select(
              "catalog_item_id,texture_url_600,texture_url_1024,original_image_url,hero_url,asset_kind,review_status,is_primary,is_active,source_system"
            )
            .eq("organization_id", organizationId)
            .eq("is_active", true)
            .eq("catalog_item_id", catalogItemId);
          if (vaErr && !isMissingRelationError(vaErr)) throw vaErr;
          if (vaRows?.length) {
            referenceFields = buildElite100ReferenceImageFields(
              chooseVisualAssetForDisplay(vaRows)
            );
          }
        } catch (vaLoadErr) {
          console.warn(
            "[elite100-inventory] Visual asset load error (non-fatal):",
            vaLoadErr?.message
          );
        }

        res.json({
          ok: true,
          catalog_item: {
            catalog_item_id: catItem.id,
            color_name: catItem.color_name,
            material_name: catItem.material_name,
            display_name: catItem.display_name,
            price_group: catItem.price_group,
            ...referenceFields,
          },
          totals: {
            total: mapped.length,
            slab_count: slabs.length,
            remnant_count: remnants.length,
          },
          slabs,
          remnants,
          type,
          source_price_group_label: SOURCE_PRICE_GROUP_LABEL,
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  // GET /api/slab-inventory/non-stock-programs
  //
  // Returns one color card per typed inventory color/material group that is NOT
  // matched to the active Elite 100 catalog (by exact or alias match).
  // Fuzzy matches are included here — they remain Non-Stock until an operator
  // explicitly promotes them via an alias record.
  // Zero-inventory Non-Stock groups are excluded (only visible inventory shown).
  // No count_for_color is read or summed.
  app.get("/api/slab-inventory/non-stock-programs", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const supabase = db();
      const organizationId = await orgId(req);
      const sourceFilter = resolveSourceFilter(req);

      // Load Elite 100 catalog (for exclusion). If no collection, everything is
      // Non-Stock, so we skip matching entirely.
      const { catalogItemList, resolvedAliases } =
        await loadElite100Deps(organizationId);

      // Load typed inventory (minimal projection).
      let invQ = supabase
        .from("slab_inventory")
        .select(
          "id,external_source,external_slab_id,color_name,material_name,price_group,source_inventory_type,source_inventory_scope"
        )
        .eq("is_active", true)
        .eq("source_inventory_scope", COLOR_PROGRAM_SCOPE)
        .in("source_inventory_type", ["Slab", "Remnant"]);
      invQ = scopeInventory(invQ, organizationId, sourceFilter);
      const { data: invRows, error: invErr } = await invQ;
      if (invErr) {
        if (isMissingRelationError(invErr)) {
          return res.status(503).json({
            ok: false,
            installed: false,
            message: "Slab inventory cache not installed.",
          });
        }
        throw invErr;
      }

      // Determine which source colors are Elite 100 (to exclude from Non-Stock).
      const elite100Keys = new Set();
      if (catalogItemList.length) {
        // Deduplicate source colors.
        const uniqueGroups = new Map();
        for (const r of invRows ?? []) {
          const key = `${r.color_name ?? ""}||${r.material_name ?? ""}`;
          if (!uniqueGroups.has(key)) {
            uniqueGroups.set(key, {
              color_name: r.color_name,
              material_name: r.material_name,
            });
          }
        }
        for (const [key, source] of uniqueGroups.entries()) {
          const result = matchSourceColorWithAliases(
            source,
            catalogItemList,
            resolvedAliases
          );
          if (result.method === "exact" || result.method === "alias") {
            elite100Keys.add(key);
          }
        }
      }

      // Non-Stock rows = typed rows whose (color_name, material_name) is not Elite 100.
      const nonStockRows = (invRows ?? []).filter((r) => {
        const key = `${r.color_name ?? ""}||${r.material_name ?? ""}`;
        return !elite100Keys.has(key);
      });

      // Load images.
      let imageMap = new Map();
      let imgQ = supabase
        .from("slab_images")
        .select(SLAB_IMAGE_SELECT_COLUMNS);
      imgQ = scopeInventory(imgQ, organizationId, sourceFilter);
      const { data: imgRows } = await imgQ;
      if (imgRows?.length) imageMap = buildImageMap(imgRows, sourceFilter);

      // Load non-stock visual assets (catalog_item_id IS NULL) from cache.
      // Non-fatal: if table not installed, visual asset fields are null.
      let nonStockVisualMap = new Map();
      try {
        const { data: nsVaRows, error: nsVaErr } = await supabase
          .from("slab_color_visual_assets")
          .select(
            "normalized_color_name,normalized_material_name,texture_url_600,texture_url_1024,original_image_url,hero_url,asset_kind,review_status,is_primary,is_active,source_system"
          )
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .is("catalog_item_id", null);
        if (nsVaErr) {
          if (!isMissingRelationError(nsVaErr)) throw nsVaErr;
        } else {
          nonStockVisualMap = buildNonStockVisualAssetMap(nsVaRows ?? []);
        }
      } catch (e) {
        console.warn("[non-stock-programs] Visual asset load error (non-fatal):", e?.message);
      }

      // Reuse groupColorPrograms; tag cards as non_stock + add visual asset enrichment.
      const cards = groupColorPrograms(nonStockRows, imageMap, sourceFilter).map((card) => {
        const normKey = `${_normColorName(card.color_name ?? "") ?? ""}||${_normMatName(card.material_name ?? "") ?? ""}`;
        return {
          ...card,
          ...buildVisualAssetEnrichmentFields(nonStockVisualMap.get(normKey) ?? null),
          program_status: "non_stock",
        };
      });

      res.json({
        ok: true,
        installed: true,
        color_programs: cards,
        total: cards.length,
        price_group_order: [...COLOR_PROGRAM_PRICE_GROUP_ORDER],
        source_price_group_label: SOURCE_PRICE_GROUP_LABEL,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  console.log(
    "[slab-inventory-head] mounted GET /api/slab-inventory/summary, /filters, /slabs, /slabs/:id, /color-programs, /colors/:colorKey/inventory, /elite100-programs, /elite100-programs/:catalogItemId/inventory, /non-stock-programs, GET /api/public/elite100-showroom (read-only), GET /api/public/cambria-showroom (read-only)"
  );
}
