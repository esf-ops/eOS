/**
 * elite100ManualVisualAssets — pure helpers for importing local Elite 100 slab
 * photos into slab_color_visual_assets + Supabase Storage.
 *
 * SCOPE / SAFETY:
 *   - Pure functions only in this module (no network / Supabase).
 *   - Presentation enrichment only — never mutates slab_inventory.
 *   - Never uses count_for_color or SlabCloud display counts.
 */

import { createHash } from "node:crypto";
import path from "node:path";

import {
  ACTIVE_PRICE_GROUPS,
  normalizeColorName,
  normalizeMaterialName,
} from "./colorProgramMatching.js";

export const ELITE100_MANUAL_SOURCE_SYSTEM = "elite100_manual_local";
export const ELITE100_MANUAL_ASSET_KIND = "manual_upload";
export const ELITE100_MANUAL_REVIEW_STATUS = "approved";

export const ELITE100_PHOTO_EXTENSIONS = Object.freeze([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
]);

/** Max processed hero JPEG bytes before write mode rejects (10 MB, same as Slabsmith full). */
export const ELITE100_MANUAL_MAX_HERO_BYTES = 10 * 1024 * 1024;
/** Max processed thumb JPEG bytes (2 MB). */
export const ELITE100_MANUAL_MAX_THUMB_BYTES = 2 * 1024 * 1024;

export function slugifyElite100ColorName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Flatten the Elite 100 fixture into ordered catalog rows with a global index (1–100).
 * Pure — no I/O.
 */
export function flattenElite100Fixture(fixture) {
  const groups = fixture?.groups ?? {};
  const items = [];
  let globalIndex = 0;

  for (const groupKey of ACTIVE_PRICE_GROUPS) {
    const groupItems = groups[groupKey];
    if (!Array.isArray(groupItems)) continue;
    for (const item of groupItems) {
      globalIndex += 1;
      items.push({
        ...item,
        price_group: item.price_group ?? groupKey,
        global_index: globalIndex,
        normalized_color_name: normalizeColorName(item.color_name),
        normalized_material_name: normalizeMaterialName(item.material_name),
        product_slug: slugifyElite100ColorName(item.color_name),
      });
    }
  }

  return items;
}

/**
 * Parse useful tokens from a local photo filename (without extension).
 * Supports:
 *   - leading global index: "01 Carrara Classic", "001-carrara-classic"
 *   - price group prefix: "Promo-06 Carrara Royale"
 *   - color slug only: "carrara-royale", "white-dove"
 */
export function parsePhotoFilename(filename) {
  const base = path.basename(String(filename ?? ""), path.extname(String(filename ?? "")));
  const cleaned = base.replace(/[_]+/g, " ").trim();

  let globalIndex = null;
  const leadingNum = cleaned.match(/^(\d{1,3})\s*[-.]?\s*(.*)$/);
  if (leadingNum) {
    const n = parseInt(leadingNum[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 100) {
      globalIndex = n;
    }
  }

  let groupPrefix = null;
  let groupSort = null;
  let remainder = leadingNum ? leadingNum[2].trim() : cleaned;

  const promoMatch = remainder.match(/^Promo\s*[-.]?\s*(\d{1,2})?\s*(.*)$/i);
  if (promoMatch) {
    groupPrefix = "Promo";
    if (promoMatch[1]) groupSort = parseInt(promoMatch[1], 10);
    remainder = promoMatch[2].trim() || remainder;
  } else {
    const groupLetterMatch = remainder.match(/^([A-F])\s*[-.]+\s*(\d{1,2})\s*(.*)$/i);
    if (groupLetterMatch) {
      groupPrefix = groupLetterMatch[1].toUpperCase();
      groupSort = parseInt(groupLetterMatch[2], 10);
      remainder = groupLetterMatch[3].trim() || remainder;
    }
  }

  return {
    base,
    globalIndex,
    groupPrefix,
    groupSort,
    colorText: remainder,
    colorSlug: slugifyElite100ColorName(remainder),
  };
}

function catalogItemFromDbRow(row) {
  return {
    id: row.id,
    color_name: row.color_name,
    material_name: row.material_name,
    normalized_color_name: row.normalized_color_name ?? normalizeColorName(row.color_name),
    normalized_material_name: row.normalized_material_name ?? normalizeMaterialName(row.material_name),
    price_group: row.price_group ?? null,
    product_slug: slugifyElite100ColorName(row.color_name),
    global_index: row.global_index ?? null,
  };
}

/**
 * Match one local photo filename to an Elite 100 catalog item.
 *
 * @param {string} filename
 * @param {Array} catalogItems  Supabase catalog rows (+ optional global_index from fixture join)
 * @param {Array} [fixtureFlat] Output of flattenElite100Fixture() for index fallback
 * @returns {{ catalogItem: Object|null, matchMethod: string, confidence: number, parsed: Object }}
 */
export function matchPhotoToCatalogItem(filename, catalogItems, fixtureFlat = []) {
  const parsed = parsePhotoFilename(filename);
  const byId = new Map((catalogItems ?? []).map((c) => [c.id, catalogItemFromDbRow(c)]));
  const dbList = [...byId.values()];

  const fixtureByGlobal = new Map(
    (fixtureFlat ?? []).map((f) => [f.global_index, f])
  );
  const fixtureBySlug = new Map(
    (fixtureFlat ?? []).map((f) => [f.product_slug, f])
  );

  // Enrich DB rows with global_index from fixture when color+material match
  for (const item of dbList) {
    if (item.global_index != null) continue;
    const fixtureHit = (fixtureFlat ?? []).find(
      (f) =>
        f.normalized_color_name === item.normalized_color_name &&
        f.normalized_material_name === item.normalized_material_name
    );
    if (fixtureHit) item.global_index = fixtureHit.global_index;
  }

  const byGlobal = new Map(dbList.filter((c) => c.global_index != null).map((c) => [c.global_index, c]));
  const bySlug = new Map(dbList.map((c) => [c.product_slug, c]));
  const byNormColor = new Map(dbList.map((c) => [c.normalized_color_name, c]));

  if (parsed.groupPrefix && parsed.groupSort != null) {
    const hit = (fixtureFlat ?? []).find(
      (f) => f.price_group === parsed.groupPrefix && f.sort_order === parsed.groupSort
    );
    if (hit) {
      const catalogItem = dbList.find(
        (c) =>
          c.normalized_color_name === hit.normalized_color_name &&
          c.normalized_material_name === hit.normalized_material_name
      );
      if (catalogItem) {
        return { catalogItem, matchMethod: "group_sort", confidence: 0.92, parsed };
      }
    }
  }

  if (parsed.globalIndex != null) {
    const hit = byGlobal.get(parsed.globalIndex) ?? fixtureByGlobal.get(parsed.globalIndex);
    if (hit) {
      const catalogItem =
        hit.id != null ? byId.get(hit.id) ?? catalogItemFromDbRow(hit) : dbList.find(
          (c) =>
            c.normalized_color_name === hit.normalized_color_name &&
            c.normalized_material_name === hit.normalized_material_name
        ) ?? null;
      if (catalogItem) {
        return { catalogItem, matchMethod: "global_index", confidence: 0.95, parsed };
      }
    }
  }

  if (parsed.colorSlug) {
    const hit = bySlug.get(parsed.colorSlug) ?? fixtureBySlug.get(parsed.colorSlug);
    if (hit) {
      const catalogItem =
        hit.id != null ? byId.get(hit.id) ?? catalogItemFromDbRow(hit) : dbList.find(
          (c) => c.product_slug === parsed.colorSlug
        ) ?? null;
      if (catalogItem) {
        return { catalogItem, matchMethod: "color_slug", confidence: 0.9, parsed };
      }
    }
  }

  const normColor = normalizeColorName(parsed.colorText);
  if (normColor) {
    const hit = byNormColor.get(normColor);
    if (hit) {
      return { catalogItem: hit, matchMethod: "color_name", confidence: 0.85, parsed };
    }
  }

  return { catalogItem: null, matchMethod: "none", confidence: 0, parsed };
}

/**
 * Storage paths under eliteos-slab-images (public read).
 * Display assets are resized; originalPath preserves full-resolution source bytes.
 */
export function buildElite100ManualStoragePaths(orgId, catalogItemId, productSlug, opts = {}) {
  const safeOrg = String(orgId ?? "").trim() || "unknown-org";
  const safeSlug = slugifyElite100ColorName(productSlug) || "unknown-color";
  const heroMaxPx = Math.max(400, Number(opts.heroMaxPx) || 2048);
  const originalExt = String(opts.originalExt ?? ".jpg").toLowerCase();
  const folder = `org/${safeOrg}/elite100-visual/${safeSlug}-${String(catalogItemId ?? "unlinked").slice(0, 8)}`;
  return {
    thumbPath: `${folder}/thumb-600.jpg`,
    heroPath: `${folder}/hero-${heroMaxPx}.jpg`,
    originalPath: `${folder}/original${originalExt}`,
  };
}

export function contentTypeForPhotoExtension(ext) {
  switch (String(ext ?? "").toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

/**
 * Build a content hash for idempotent imports (first 32 hex chars of SHA-256).
 * @param {Buffer} buffer
 */
export function hashPhotoContent(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 32);
}

/**
 * Build slab_color_visual_assets insert payload for an approved primary manual photo.
 * Pure — no I/O.
 */
export function buildManualVisualAssetRow({
  orgId,
  catalogItem,
  publicUrls,
  contentHash,
  sourceFile,
  matchMethod,
}) {
  if (!orgId || !catalogItem?.id) return null;
  if (!publicUrls?.heroUrl) return null;

  const now = new Date().toISOString();
  const displayHeroUrl = publicUrls.heroUrl;
  const displayThumbUrl = publicUrls.thumbUrl ?? displayHeroUrl;
  const fullResUrl = publicUrls.originalUrl ?? null;

  return {
    organization_id: orgId,
    catalog_item_id: catalogItem.id,
    source_system: ELITE100_MANUAL_SOURCE_SYSTEM,
    source_public_slug: null,
    source_api_company_code: null,
    source_asset_company_code: null,
    source_color_name: catalogItem.color_name,
    source_material_name: catalogItem.material_name ?? null,
    normalized_color_name: catalogItem.normalized_color_name,
    normalized_material_name: catalogItem.normalized_material_name ?? null,
    source_price_group: catalogItem.price_group ?? null,
    product_slug: catalogItem.product_slug ?? slugifyElite100ColorName(catalogItem.color_name),
    texture_hash: contentHash ?? null,
    texture_url_600: displayThumbUrl,
    texture_url_1024: displayHeroUrl,
    original_image_url: fullResUrl,
    thumbnail_url: displayThumbUrl,
    hero_url: displayHeroUrl,
    asset_kind: ELITE100_MANUAL_ASSET_KIND,
    review_status: ELITE100_MANUAL_REVIEW_STATUS,
    is_primary: true,
    is_active: true,
    confidence_score: null,
    match_method: matchMethod === "global_index" || matchMethod === "color_slug" || matchMethod === "color_name"
      ? "manual"
      : "none",
    raw: {
      import_source: "local_folder",
      source_filename: sourceFile ?? null,
      processed_hero_bytes: publicUrls.heroBytes ?? null,
      processed_thumb_bytes: publicUrls.thumbBytes ?? null,
      original_bytes: publicUrls.originalBytes ?? null,
      storage_original_path: publicUrls.storageOriginalPath ?? null,
      stores_original_image_url: Boolean(fullResUrl),
      match_method: matchMethod ?? null,
    },
    last_seen_at: now,
  };
}

/**
 * Summarize dry-run / pre-write results.
 */
export function formatManualPhotoDryRunEntry(entry) {
  const catalog = entry.catalogItem;
  return {
    matched: Boolean(catalog?.id),
    catalog_item_id: catalog?.id ?? null,
    color_name: catalog?.color_name ?? null,
    material_name: catalog?.material_name ?? null,
    match_method: entry.matchMethod ?? null,
    source_file: entry.fullPath ?? entry.filename ?? null,
    planned_thumb_path: entry.storagePaths?.thumbPath ?? null,
    planned_hero_path: entry.storagePaths?.heroPath ?? null,
    planned_original_path: entry.storagePaths?.originalPath ?? null,
    stores_original_image_url: Boolean(entry.storagePaths?.originalPath),
    db_field_for_original_url: "original_image_url",
    source_bytes: entry.sourceBytes ?? null,
    warnings: entry.warnings ?? [],
  };
}

export function computeManualPhotoDryRunSummary(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const matched = list.filter((e) => e.catalogItem?.id);
  const unmatched = list.filter((e) => !e.catalogItem?.id);
  const oversized = list.filter((e) => e.warnings?.includes("source_oversized"));
  const needsResize = list.filter((e) => e.warnings?.includes("needs_resize"));

  return {
    total_files: list.length,
    matched: matched.length,
    unmatched: unmatched.length,
    oversized_sources: oversized.length,
    needs_resize: needsResize.length,
    entries: list.map(formatManualPhotoDryRunEntry),
    sample_matched: matched.slice(0, 8).map(formatManualPhotoDryRunEntry),
    sample_unmatched: unmatched.slice(0, 8).map((e) => ({
      file: e.filename,
      source_file: e.fullPath ?? null,
      parsed: e.parsed,
    })),
  };
}
