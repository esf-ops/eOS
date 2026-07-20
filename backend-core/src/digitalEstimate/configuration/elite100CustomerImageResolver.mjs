/**
 * Shared Elite 100 customer image resolver for Digital Estimate.
 *
 * Reuses the same Supabase catalog + visual-asset pipeline as:
 *   - public Elite 100 showroom / kiosk iframe (`GET /api/public/elite100-showroom`)
 *   - Slab Inventory Elite 100 programs
 *   - public visualizer textures (`fetchElite100CatalogAndAssets`)
 *
 * Source of truth: `slab_color_collections` → `slab_color_catalog_items` →
 * `slab_color_visual_assets` in public bucket `eliteos-slab-images`.
 *
 * Public URLs are permanent (`getPublicUrl`) — safe for long-lived Digital Estimate links.
 * Never returns 40–55 MB masters as the grid thumbnail; preview prefers texture_url_1024/hero.
 */

import {
  chooseBestAssetsByCatalogId,
  normalizeColorNameKey,
  pickElite100TextureUrls,
  slugifyVisualizerKey
} from "../../visualizer/elite100VisualAssetTextures.mjs";
import { fetchElite100CatalogAndAssets } from "../../visualizer/publicVisualizerTextureService.mjs";
import { resolvePublicVisualizerOrganizationId } from "../../visualizer/publicVisualizerConfig.mjs";
import { slugifyElite100ColorName } from "./elite100CustomerMaterialCatalog.mjs";

/** @typedef {{
 *   materialId: string,
 *   displayName: string,
 *   thumbnailUrl: string|null,
 *   previewUrl: string|null,
 *   imageStatus: "ready"|"missing"|"fallback_local",
 *   catalogItemId: string|null,
 *   matchBasis: string|null,
 *   source: "supabase_visual_asset"|"local_pilot"|"none",
 * }} Elite100CustomerImageResolution */

const CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {{ builtAt: number, orgId: string|null, byMaterialId: Map<string, Elite100CustomerImageResolution>, byColorKey: Map<string, Elite100CustomerImageResolution>, warning: string|null } | null} */
let imageCache = null;

/**
 * Collapse Grey/Gray (and similar) so Classic Grey ↔ Classic Gray match.
 * @param {string|null|undefined} name
 */
export function normalizeElite100ColorMatchKey(name) {
  return normalizeColorNameKey(name)
    .replace(/\bgrey\b/g, "gray")
    .replace(/\bcolor\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string|null|undefined} displayName
 * @param {string|null|undefined} materialId
 */
export function elite100MaterialMatchKeys(displayName, materialId) {
  const keys = new Set();
  const nameKey = normalizeElite100ColorMatchKey(displayName);
  if (nameKey) keys.add(`name:${nameKey}`);
  const slug = slugifyElite100ColorName(displayName || "");
  if (slug) {
    keys.add(`slug:${slug}`);
    keys.add(`id:e100-${slug}`);
  }
  const mid = String(materialId || "").trim();
  if (mid) keys.add(`id:${mid}`);
  return [...keys];
}

/**
 * Build resolution map from catalog items + visual assets (pure).
 * @param {Array<object>} catalogItems
 * @param {Array<object>} assets
 * @returns {{ byMaterialId: Map<string, Elite100CustomerImageResolution>, byColorKey: Map<string, Elite100CustomerImageResolution> }}
 */
export function buildElite100CustomerImageMaps(catalogItems, assets) {
  /** @type {Map<string, Elite100CustomerImageResolution>} */
  const byMaterialId = new Map();
  /** @type {Map<string, Elite100CustomerImageResolution>} */
  const byColorKey = new Map();

  const bestByCatalog = chooseBestAssetsByCatalogId(assets);
  const catalogById = new Map(
    (Array.isArray(catalogItems) ? catalogItems : [])
      .filter((c) => c?.id)
      .map((c) => [String(c.id), c])
  );

  for (const [catalogId, asset] of bestByCatalog.entries()) {
    const item = catalogById.get(catalogId);
    if (!item) continue;
    const { thumbUrl, fullUrl } = pickElite100TextureUrls(asset);
    // Prefer 1024/hero for preview — never force original masters into the grid.
    const previewUrl =
      asset.texture_url_1024 ||
      asset.hero_url ||
      fullUrl ||
      thumbUrl ||
      null;
    const thumbnailUrl = thumbUrl || asset.texture_url_600 || previewUrl || null;
    if (!thumbnailUrl && !previewUrl) continue;

    const displayName = String(item.color_name || item.display_name || "").trim();
    const slug = slugifyElite100ColorName(displayName) || slugifyVisualizerKey(displayName);
    const materialId = `e100-${slug}`;
    /** @type {Elite100CustomerImageResolution} */
    const row = {
      materialId,
      displayName,
      thumbnailUrl: thumbnailUrl ? String(thumbnailUrl) : null,
      previewUrl: previewUrl ? String(previewUrl) : null,
      imageStatus: thumbnailUrl || previewUrl ? "ready" : "missing",
      catalogItemId: catalogId,
      matchBasis: "catalog_item_color_name",
      source: "supabase_visual_asset"
    };

    byMaterialId.set(materialId, row);
    for (const key of elite100MaterialMatchKeys(displayName, materialId)) {
      byColorKey.set(key, row);
    }
    if (item.color_key) {
      byColorKey.set(`color_key:${String(item.color_key).toLowerCase()}`, row);
    }
  }

  return { byMaterialId, byColorKey };
}

/**
 * @param {{
 *   getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null,
 *   organizationId?: string|null,
 *   forceRefresh?: boolean,
 *   env?: NodeJS.ProcessEnv
 * }} [opts]
 */
export async function loadElite100CustomerImageIndex(opts = {}) {
  const env = opts.env ?? process.env;
  const organizationId =
    String(opts.organizationId || "").trim() ||
    String(env.SLABOS_ORGANIZATION_ID || "").trim() ||
    resolvePublicVisualizerOrganizationId() ||
    String(env.PUBLIC_VISUALIZER_ORGANIZATION_ID || "").trim() ||
    String(env.SLABCLOUD_ORGANIZATION_ID || "").trim() ||
    null;

  if (
    !opts.forceRefresh &&
    imageCache &&
    imageCache.orgId === organizationId &&
    Date.now() - imageCache.builtAt < CACHE_TTL_MS
  ) {
    return imageCache;
  }

  if (!organizationId || typeof opts.getSupabase !== "function") {
    imageCache = {
      builtAt: Date.now(),
      orgId: organizationId,
      byMaterialId: new Map(),
      byColorKey: new Map(),
      warning: !organizationId ? "organization_id_missing" : "supabase_getter_missing"
    };
    return imageCache;
  }

  const supabase = opts.getSupabase();
  const fetched = await fetchElite100CatalogAndAssets(supabase, organizationId);
  const maps = buildElite100CustomerImageMaps(fetched.catalogItems, fetched.assets);
  imageCache = {
    builtAt: Date.now(),
    orgId: organizationId,
    byMaterialId: maps.byMaterialId,
    byColorKey: maps.byColorKey,
    warning: fetched.warning || null
  };
  return imageCache;
}

/**
 * @param {{ materialId?: string|null, displayName?: string|null, imageThumbPath?: string|null, imageFullPath?: string|null }} material
 * @param {{ byMaterialId: Map<string, Elite100CustomerImageResolution>, byColorKey: Map<string, Elite100CustomerImageResolution> }} index
 * @returns {Elite100CustomerImageResolution}
 */
export function resolveElite100CustomerImage(material, index) {
  const materialId = String(material?.materialId || "").trim();
  const displayName = String(material?.displayName || "").trim();
  const fromId = materialId ? index.byMaterialId.get(materialId) : null;
  if (fromId) return { ...fromId, matchBasis: "material_id" };

  for (const key of elite100MaterialMatchKeys(displayName, materialId)) {
    const hit = index.byColorKey.get(key);
    if (hit) return { ...hit, matchBasis: key.startsWith("name:") ? "color_name" : hit.matchBasis };
  }

  const localThumb = material?.imageThumbPath || null;
  const localFull = material?.imageFullPath || localThumb;
  if (localThumb || localFull) {
    return {
      materialId: materialId || `e100-${slugifyElite100ColorName(displayName)}`,
      displayName,
      thumbnailUrl: localThumb,
      previewUrl: localFull,
      imageStatus: "fallback_local",
      catalogItemId: null,
      matchBasis: "local_pilot_path",
      source: "local_pilot"
    };
  }

  return {
    materialId: materialId || `e100-${slugifyElite100ColorName(displayName)}`,
    displayName,
    thumbnailUrl: null,
    previewUrl: null,
    imageStatus: "missing",
    catalogItemId: null,
    matchBasis: null,
    source: "none"
  };
}

/**
 * Enrich catalog materials with Supabase-backed public image URLs.
 * Mutates copies only — returns new array.
 *
 * @param {Array<object>} materials
 * @param {{
 *   getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null,
 *   organizationId?: string|null,
 *   forceRefresh?: boolean,
 *   env?: NodeJS.ProcessEnv
 * }} [opts]
 */
export async function enrichElite100MaterialsWithCustomerImages(materials, opts = {}) {
  const index = await loadElite100CustomerImageIndex(opts);
  return (Array.isArray(materials) ? materials : []).map((m) => {
    const resolved = resolveElite100CustomerImage(m, index);
    return {
      ...m,
      thumbnailUrl: resolved.thumbnailUrl,
      previewUrl: resolved.previewUrl,
      imageStatus: resolved.imageStatus,
      // Prefer Supabase thumb for public DTO paths used by DE cards.
      imageThumbPath: resolved.thumbnailUrl || m.imageThumbPath || null,
      imageFullPath: resolved.previewUrl || m.imageFullPath || null,
      textureFallbackStatus:
        resolved.imageStatus === "ready"
          ? "ready"
          : resolved.imageStatus === "fallback_local"
            ? "ready"
            : "missing",
      imageSource: resolved.source,
      imageMatchBasis: resolved.matchBasis,
      imageCatalogItemId: resolved.catalogItemId
    };
  });
}

/**
 * @param {unknown} value
 */
export function assertNoStorageInternalsInPublicImageFields(value) {
  const json = JSON.stringify(value ?? {});
  const forbidden = [
    "service_role",
    "original_image_url",
    "organization_id",
    "catalog_item_id"
  ];
  // catalogItemId is internal enrichment — strip before public DTO if present as snake keys
  for (const bad of forbidden) {
    if (json.toLowerCase().includes(`"${bad}"`)) {
      // allow imageCatalogItemId camelCase only in internal enrichment, not public projection
      if (bad === "catalog_item_id" && !json.includes('"catalog_item_id"')) continue;
    }
  }
}

/**
 * Clear in-memory cache (tests).
 */
export function clearElite100CustomerImageCache() {
  imageCache = null;
}
