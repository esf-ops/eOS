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
  let variantSuffix = null;
  const leadingNum = cleaned.match(/^(\d{1,3})([A-Za-z])?(?:\s+|[-_.]\s*|\s*[-_.]|$)(.*)$/);
  if (leadingNum) {
    const n = parseInt(leadingNum[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 100) {
      globalIndex = n;
      variantSuffix = leadingNum[2] ? leadingNum[2].toUpperCase() : null;
    }
  }

  let groupPrefix = null;
  let groupSort = null;
  let remainder = leadingNum ? leadingNum[3].trim() : cleaned;

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

  const parsedFinish = extractFilenameFinish(remainder);

  return {
    base,
    globalIndex,
    variantSuffix,
    parsedFinish,
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
    product_slug: row.product_slug ?? slugifyElite100ColorName(row.color_name),
    global_index: row.global_index ?? null,
  };
}

/** Finish words recognized in Elite 100 photo filenames. */
export const ELITE100_FILENAME_FINISH_WORDS = Object.freeze([
  "polished",
  "leathered",
  "honed",
  "brushed",
  "matte",
  "satin",
]);

/** Detect finish from filename color text (before normalization strips it). */
export function extractFilenameFinish(colorText) {
  const text = String(colorText ?? "");
  for (const word of ELITE100_FILENAME_FINISH_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  }
  return null;
}

/** Strip finish suffixes and duplicate trailing index numbers from filename color tokens. */
export function extractFilenameColorTokens(parsed) {
  let text = String(parsed?.colorText ?? "").trim();
  text = text.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/\b(polished|leathered|honed|brushed|matte|satin)\b/gi, "").trim();
  text = text.replace(/\s+\d{1,3}[A-Za-z]?$/, "").trim();
  text = text.replace(/[\s\-_]+$/g, "").trim();

  let slug = slugifyElite100ColorName(text);
  if (parsed?.globalIndex != null) {
    slug = slug.replace(new RegExp(`-${parsed.globalIndex}$`), "");
  }

  return {
    raw: text,
    normalized: normalizeColorName(text),
    slug,
  };
}

/**
 * True when filename color clearly matches catalog color; false on conflict; null when unknown.
 */
export function colorNamesCompatible(filenameColor, catalogColor) {
  if (!filenameColor || !catalogColor) return null;
  if (filenameColor === catalogColor) return true;
  if (filenameColor.includes(catalogColor) || catalogColor.includes(filenameColor)) return true;
  return false;
}

export const ELITE100_MATCH_STATUS = Object.freeze({
  SAFE: "safe",
  UNMATCHED: "unmatched",
  GLOBAL_INDEX_NAME_CONFLICT: "global_index_name_conflict",
  CATALOG_COLOR_MISSING: "catalog_color_missing",
  AMBIGUOUS: "ambiguous",
  INVALID_INDEX: "invalid_index",
  DUPLICATE_TARGET: "duplicate_target",
});

/** Chris-approved photo filename → catalog color aliases (from elite100-2026-alias-review-seed). */
export const ELITE100_PHOTO_FILENAME_COLOR_ALIASES = Object.freeze([
  { source_color_name: "Winter Fresh", catalog_color_name: "Winterfresh" },
  { source_color_name: "Belfast Grey", catalog_color_name: "Belfast Gray" },
  { source_color_name: "Classic Gray", catalog_color_name: "Classic Grey" },
  { source_color_name: "Costal Tide", catalog_color_name: "Coastal Tide" },
  { source_color_name: "Regal D Oro", catalog_color_name: "Regal D'Oro" },
  { source_color_name: "Skys The Limit", catalog_color_name: "Sky's the Limit" },
  { source_color_name: "Larvik", catalog_color_name: "Larvic" },
  { source_color_name: "Whitendale", catalog_color_name: "Whitenedale" },
  // Approved in elite100-2026-alias-review-seed-batch2.json (finish-suffix / vendor spellings)
  { source_color_name: "Regal Soapstone Matte", catalog_color_name: "Regal Soapstone" },
  { source_color_name: "Newport", catalog_color_name: "Newport Polished" },
  { source_color_name: "Bellini", catalog_color_name: "Bellini Honed" },
  { source_color_name: "Calacatta Zenith", catalog_color_name: "Zenith" },
  { source_color_name: "Calacatta Athena", catalog_color_name: "Athena" },
  { source_color_name: "Aura Taj", catalog_color_name: "Aurataj" },
  { source_color_name: "Granda Beige", catalog_color_name: "Granada Beige" },
]);

/**
 * Build lookup: normalized filename color token → catalog item (from approved aliases).
 * @param {Array} aliasRows `{ source_color_name, catalog_color_name }`
 * @param {Array} catalogItems
 */
export function buildPhotoFilenameAliasLookup(aliasRows, catalogItems) {
  const byNormColor = new Map(
    (catalogItems ?? []).map((c) => [
      c.normalized_color_name ?? normalizeColorName(c.color_name),
      catalogItemFromDbRow(c),
    ])
  );
  const lookup = new Map();
  for (const row of aliasRows ?? []) {
    const sourceNorm = normalizeColorName(row.source_color_name);
    const catalogNorm = normalizeColorName(row.catalog_color_name);
    const catalogItem = byNormColor.get(catalogNorm);
    if (!sourceNorm || !catalogItem) continue;
    lookup.set(sourceNorm, {
      catalogItem,
      catalog_color_name: catalogItem.color_name,
      source_color_name: row.source_color_name,
    });
  }
  return lookup;
}

function prepareCatalogContext(catalogItems, fixtureFlat = []) {
  const byId = new Map((catalogItems ?? []).map((c) => [c.id, catalogItemFromDbRow(c)]));
  const dbList = [...byId.values()];

  const fixtureByGlobal = new Map((fixtureFlat ?? []).map((f) => [f.global_index, f]));
  const fixtureBySlug = new Map((fixtureFlat ?? []).map((f) => [f.product_slug, f]));
  const fixtureByNormColor = new Map(
    (fixtureFlat ?? []).map((f) => [f.normalized_color_name, f])
  );

  for (const item of dbList) {
    if (item.global_index != null) continue;
    const fixtureHit = (fixtureFlat ?? []).find(
      (f) =>
        f.normalized_color_name === item.normalized_color_name &&
        f.normalized_material_name === item.normalized_material_name
    );
    if (fixtureHit) item.global_index = fixtureHit.global_index;
  }

  return {
    byId,
    dbList,
    byGlobal: new Map(dbList.filter((c) => c.global_index != null).map((c) => [c.global_index, c])),
    bySlug: new Map(dbList.map((c) => [c.product_slug, c])),
    byNormColor: new Map(dbList.map((c) => [c.normalized_color_name, c])),
    fixtureByGlobal,
    fixtureBySlug,
    fixtureByNormColor,
  };
}

function resolveCatalogItem(hit, ctx) {
  if (!hit) return null;
  if (hit.id != null && ctx.byId.has(hit.id)) return ctx.byId.get(hit.id);
  return (
    ctx.dbList.find(
      (c) =>
        c.normalized_color_name === hit.normalized_color_name &&
        c.normalized_material_name === hit.normalized_material_name
    ) ??
    ctx.dbList.find((c) => c.product_slug === hit.product_slug) ??
    catalogItemFromDbRow(hit)
  );
}

function collectNameMatches(parsed, ctx, photoAliasLookup) {
  const tokens = extractFilenameColorTokens(parsed);
  const seen = new Set();
  const matches = [];

  const tryAdd = (item, method) => {
    if (!item?.color_name) return;
    const resolved = item.id ? ctx.byId.get(item.id) ?? catalogItemFromDbRow(item) : item;
    const key = resolved.id ?? `${resolved.normalized_color_name}||${resolved.normalized_material_name}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({ catalogItem: resolved, matchMethod: method });
  };

  if (tokens.slug) {
    const slugHit = ctx.bySlug.get(tokens.slug) ?? ctx.fixtureBySlug.get(tokens.slug);
    if (slugHit) tryAdd(resolveCatalogItem(slugHit, ctx), "color_slug");
  }

  if (tokens.normalized) {
    const colorHit = ctx.byNormColor.get(tokens.normalized) ?? ctx.fixtureByNormColor.get(tokens.normalized);
    if (colorHit) tryAdd(resolveCatalogItem(colorHit, ctx), "color_name");
  }

  if (tokens.normalized && photoAliasLookup?.has(tokens.normalized)) {
    const aliasHit = photoAliasLookup.get(tokens.normalized);
    tryAdd(aliasHit.catalogItem, "photo_filename_alias");
  }

  return matches;
}

/**
 * Parse CSV/JSON explicit match overrides.
 * Columns: source_filename, catalog_item_id OR catalog_color_name
 */
export function parsePhotoMatchMapContent(content, format = "csv") {
  const rows = [];
  const trimmed = String(content ?? "").trim();
  if (!trimmed) return rows;

  if (format === "json") {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : parsed?.entries ?? [];
    for (const row of list) {
      const source_filename = String(row.source_filename ?? row.filename ?? "").trim();
      if (!source_filename) continue;
      rows.push({
        source_filename,
        catalog_item_id: row.catalog_item_id ? String(row.catalog_item_id).trim() : null,
        catalog_color_name: row.catalog_color_name ? String(row.catalog_color_name).trim() : null,
      });
    }
    return rows;
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idxFilename = header.indexOf("source_filename");
  const idxId = header.indexOf("catalog_item_id");
  const idxColor = header.indexOf("catalog_color_name");
  if (idxFilename < 0) {
    throw new Error("Match map CSV requires source_filename column");
  }

  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const source_filename = cols[idxFilename];
    if (!source_filename) continue;
    rows.push({
      source_filename,
      catalog_item_id: idxId >= 0 ? cols[idxId] || null : null,
      catalog_color_name: idxColor >= 0 ? cols[idxColor] || null : null,
    });
  }
  return rows;
}

export function buildPhotoMatchMapLookup(mapRows, catalogItems) {
  const byId = new Map((catalogItems ?? []).filter((c) => c.id).map((c) => [c.id, catalogItemFromDbRow(c)]));
  const byNormColor = new Map(
    (catalogItems ?? []).map((c) => [
      c.normalized_color_name ?? normalizeColorName(c.color_name),
      catalogItemFromDbRow(c),
    ])
  );

  const lookup = new Map();
  for (const row of mapRows ?? []) {
    let item = null;
    if (row.catalog_item_id) item = byId.get(row.catalog_item_id) ?? null;
    else if (row.catalog_color_name) {
      item = byNormColor.get(normalizeColorName(row.catalog_color_name)) ?? null;
    }
    if (item) lookup.set(row.source_filename, item);
  }
  return lookup;
}

function matchResult({
  catalogItem = null,
  matchMethod = "none",
  matchStatus = ELITE100_MATCH_STATUS.UNMATCHED,
  confidence = 0,
  parsed,
  warnings = [],
  conflictCatalogItem = null,
  candidates = null,
}) {
  return {
    catalogItem,
    matchMethod,
    matchStatus,
    confidence,
    parsed,
    warnings,
    conflictCatalogItem,
    candidates,
  };
}

/**
 * Match one local photo filename to an Elite 100 catalog item.
 *
 * Priority:
 *   1. explicit mapping override
 *   2. color slug / color name / approved photo filename alias
 *   3. price-group + sort order (index-only filenames only)
 *   4. global index (index-only filenames only — batch numbers are not catalog positions)
 *
 * When the filename includes a clear color name, that name is the source of truth.
 * Global index is never used as a fallback for named photos.
 *
 * @param {string} filename
 * @param {Array} catalogItems
 * @param {Array} [fixtureFlat]
 * @param {Object} [opts]
 * @param {Map<string, Object>} [opts.matchMap] source_filename → catalog item
 * @param {Map<string, Object>} [opts.photoAliasLookup] normalized filename color → alias hit
 * @param {boolean} [opts.strictIndexValidation] When true, block named files whose leading
 *   number disagrees with catalog global index. Default false — batch/display numbers are metadata only.
 */
export function matchPhotoToCatalogItem(filename, catalogItems, fixtureFlat = [], opts = {}) {
  const parsed = parsePhotoFilename(filename);
  const ctx = prepareCatalogContext(catalogItems, fixtureFlat);
  const basename = path.basename(String(filename ?? ""));

  const photoAliasLookup =
    opts.photoAliasLookup instanceof Map
      ? opts.photoAliasLookup
      : buildPhotoFilenameAliasLookup(ELITE100_PHOTO_FILENAME_COLOR_ALIASES, catalogItems);

  const matchMap = opts.matchMap instanceof Map ? opts.matchMap : null;
  if (matchMap?.has(basename)) {
    const catalogItem = matchMap.get(basename);
    return matchResult({
      catalogItem,
      matchMethod: "mapping_override",
      matchStatus: ELITE100_MATCH_STATUS.SAFE,
      confidence: 1,
      parsed,
    });
  }

  const indexCatalogItem = parsed.globalIndex != null
    ? resolveCatalogItem(
        ctx.byGlobal.get(parsed.globalIndex) ?? ctx.fixtureByGlobal.get(parsed.globalIndex),
        ctx
      )
    : null;

  const tokens = extractFilenameColorTokens(parsed);
  const hasColorToken = Boolean(tokens.normalized || tokens.slug);

  const nameMatches = collectNameMatches(parsed, ctx, photoAliasLookup);
  if (nameMatches.length > 1) {
    return matchResult({
      matchMethod: "ambiguous",
      matchStatus: ELITE100_MATCH_STATUS.AMBIGUOUS,
      parsed,
      warnings: ["ambiguous"],
      candidates: nameMatches,
    });
  }

  if (nameMatches.length === 1) {
    const hit = nameMatches[0];
    const nameItem = hit.catalogItem;
    const confidenceByMethod = {
      color_slug: 0.95,
      color_name: 0.9,
      photo_filename_alias: 0.92,
      mapping_override: 1,
    };

    const strictIndex = opts.strictIndexValidation === true;

    if (parsed.globalIndex != null && !parsed.variantSuffix && strictIndex) {
      if (!indexCatalogItem) {
        return matchResult({
          matchMethod: "invalid_index",
          matchStatus: ELITE100_MATCH_STATUS.INVALID_INDEX,
          parsed,
          warnings: ["invalid_index"],
          candidates: [{
            name_match_color: nameItem.color_name,
            suggested_global_index: nameItem.global_index ?? null,
          }],
        });
      }

      const indexKey =
        indexCatalogItem.id ??
        `${indexCatalogItem.normalized_color_name}||${indexCatalogItem.normalized_material_name}`;
      const nameKey =
        nameItem.id ??
        `${nameItem.normalized_color_name}||${nameItem.normalized_material_name}`;

      if (indexKey !== nameKey) {
        return matchResult({
          matchMethod: "global_index_name_conflict",
          matchStatus: ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT,
          parsed,
          warnings: ["global_index_name_conflict"],
          conflictCatalogItem: indexCatalogItem,
          candidates: [{
            name_match_color: nameItem.color_name,
            name_match_global_index: nameItem.global_index ?? null,
            index_catalog_color: indexCatalogItem.color_name,
            index_global_index: parsed.globalIndex,
          }],
        });
      }

      return matchResult({
        catalogItem: nameItem,
        matchMethod: hit.matchMethod,
        matchStatus: ELITE100_MATCH_STATUS.SAFE,
        confidence: confidenceByMethod[hit.matchMethod] ?? 0.98,
        parsed,
        indexCatalogItem,
      });
    }

    return matchResult({
      catalogItem: nameItem,
      matchMethod: hit.matchMethod,
      matchStatus: ELITE100_MATCH_STATUS.SAFE,
      confidence: confidenceByMethod[hit.matchMethod] ?? 0.85,
      parsed,
    });
  }

  if (parsed.globalIndex != null) {
    if (!indexCatalogItem) {
      return matchResult({
        matchMethod: "invalid_index",
        matchStatus: ELITE100_MATCH_STATUS.INVALID_INDEX,
        parsed,
        warnings: ["invalid_index"],
      });
    }

    if (hasColorToken) {
      const aliasHint = photoAliasLookup?.get(tokens.normalized);
      return matchResult({
        matchMethod: "catalog_color_missing",
        matchStatus: ELITE100_MATCH_STATUS.CATALOG_COLOR_MISSING,
        parsed,
        warnings: ["catalog_color_missing"],
        conflictCatalogItem: indexCatalogItem,
        candidates: aliasHint
          ? [{
            filename_color: tokens.normalized || tokens.slug,
            suggested_catalog_color: aliasHint.catalog_color_name,
            index_catalog_color: indexCatalogItem.color_name,
          }]
          : [{
            filename_color: tokens.normalized || tokens.slug,
            index_catalog_color: indexCatalogItem.color_name,
          }],
      });
    }

    return matchResult({
      matchMethod: "none",
      matchStatus: ELITE100_MATCH_STATUS.UNMATCHED,
      parsed,
      warnings: ["index_only_filename"],
    });
  }

  if (hasColorToken) {
    const aliasHint = photoAliasLookup?.get(tokens.normalized);
    return matchResult({
      matchMethod: "catalog_color_missing",
      matchStatus: ELITE100_MATCH_STATUS.CATALOG_COLOR_MISSING,
      parsed,
      warnings: ["catalog_color_missing"],
      candidates: aliasHint
        ? [{
          filename_color: tokens.normalized || tokens.slug,
          suggested_catalog_color: aliasHint.catalog_color_name,
        }]
        : [{
          filename_color: tokens.normalized || tokens.slug,
        }],
    });
  }

  if (parsed.groupPrefix && parsed.groupSort != null) {
    const fixtureHit = (fixtureFlat ?? []).find(
      (f) => f.price_group === parsed.groupPrefix && f.sort_order === parsed.groupSort
    );
    if (fixtureHit) {
      const catalogItem = resolveCatalogItem(fixtureHit, ctx);
      if (catalogItem) {
        return matchResult({
          catalogItem,
          matchMethod: "group_sort",
          matchStatus: ELITE100_MATCH_STATUS.SAFE,
          confidence: 0.88,
          parsed,
        });
      }
    }
  }

  if (parsed.globalIndex != null) {
    return matchResult({
      matchMethod: "none",
      matchStatus: ELITE100_MATCH_STATUS.UNMATCHED,
      parsed,
      warnings: ["index_only_filename"],
    });
  }

  return matchResult({
    matchMethod: "none",
    matchStatus: ELITE100_MATCH_STATUS.UNMATCHED,
    parsed,
  });
}

export function applyBatchDuplicateTargets(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const byCatalogId = new Map();

  for (const entry of list) {
    if (entry.matchStatus !== ELITE100_MATCH_STATUS.SAFE || !entry.catalogItem?.id) continue;
    if (entry.variantKey || entry.parsed?.variantSuffix) continue;
    const id = entry.catalogItem.id;
    if (!byCatalogId.has(id)) byCatalogId.set(id, []);
    byCatalogId.get(id).push(entry);
  }

  for (const group of byCatalogId.values()) {
    if (group.length <= 1) continue;
    const peerNames = group.map((e) => e.filename ?? e.fullPath ?? "unknown");
    for (const entry of group) {
      entry.matchStatus = ELITE100_MATCH_STATUS.DUPLICATE_TARGET;
      entry.matchMethod = "duplicate_target";
      entry.warnings = [...new Set([...(entry.warnings ?? []), "duplicate_target"])];
      entry.duplicatePeers = peerNames.filter(
        (name) => name !== (entry.filename ?? entry.fullPath ?? "unknown")
      );
    }
  }

  return list;
}

export function assessImportPlanSafety(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const blockers = [];

  for (const entry of list) {
    const label = entry.filename ?? entry.fullPath ?? "unknown";
    if (entry.matchStatus === ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT) {
      blockers.push({
        filename: label,
        reason: "global_index_name_conflict",
        filename_color: extractFilenameColorTokens(entry.parsed).normalized
          || extractFilenameColorTokens(entry.parsed).slug,
        conflict_color: entry.conflictCatalogItem?.color_name ?? null,
        name_match_color: entry.candidates?.[0]?.name_match_color ?? null,
        global_index: entry.parsed?.globalIndex ?? null,
      });
    } else if (entry.matchStatus === ELITE100_MATCH_STATUS.INVALID_INDEX) {
      blockers.push({
        filename: label,
        reason: "invalid_index",
        global_index: entry.parsed?.globalIndex ?? null,
        suggested_global_index: entry.candidates?.[0]?.suggested_global_index ?? null,
      });
    } else if (entry.matchStatus === ELITE100_MATCH_STATUS.DUPLICATE_TARGET) {
      blockers.push({
        filename: label,
        reason: "duplicate_target",
        catalog_item_id: entry.catalogItem?.id ?? null,
        catalog_color_name: entry.catalogItem?.color_name ?? null,
        duplicate_peers: entry.duplicatePeers ?? [],
      });
    } else if (entry.matchStatus === ELITE100_MATCH_STATUS.CATALOG_COLOR_MISSING) {
      const tokens = extractFilenameColorTokens(entry.parsed);
      const aliasHint = entry.candidates?.[0]?.suggested_catalog_color ?? null;
      blockers.push({
        filename: label,
        reason: "catalog_color_missing",
        filename_color: tokens.normalized || tokens.slug || null,
        suggested_catalog_color: aliasHint,
        global_index: entry.parsed?.globalIndex ?? null,
      });
    } else if (entry.matchStatus === ELITE100_MATCH_STATUS.AMBIGUOUS) {
      blockers.push({
        filename: label,
        reason: "ambiguous",
        candidates: (entry.candidates ?? []).map((c) => c.catalogItem?.color_name).filter(Boolean),
      });
    } else if (entry.matchStatus === ELITE100_MATCH_STATUS.UNMATCHED || !entry.catalogItem?.id) {
      blockers.push({ filename: label, reason: "unmatched" });
    }
  }

  return {
    write_blocked: blockers.length > 0,
    blockers,
  };
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
  const variantKey = opts.variantKey ? String(opts.variantKey).trim() : "";
  const slugSegment = variantKey ? `${safeSlug}--${slugifyElite100ColorName(variantKey)}` : safeSlug;
  const folder = `org/${safeOrg}/elite100-visual/${slugSegment}-${String(catalogItemId ?? "unlinked").slice(0, 8)}`;
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
  variantKey = null,
  variantSuffix = null,
  finish = null,
  proposedDisplayName = null,
  isPrimary = true,
}) {
  if (!orgId || !catalogItem?.id) return null;
  if (!publicUrls?.heroUrl) return null;

  const now = new Date().toISOString();
  const displayHeroUrl = publicUrls.heroUrl;
  const displayThumbUrl = publicUrls.thumbUrl ?? displayHeroUrl;
  const fullResUrl = publicUrls.originalUrl ?? null;
  const baseSlug = catalogItem.product_slug ?? slugifyElite100ColorName(catalogItem.color_name);
  const productSlug = variantKey ? `${baseSlug}--${slugifyElite100ColorName(variantKey)}` : baseSlug;

  return {
    organization_id: orgId,
    catalog_item_id: catalogItem.id,
    source_system: ELITE100_MANUAL_SOURCE_SYSTEM,
    source_public_slug: null,
    source_api_company_code: null,
    source_asset_company_code: null,
    source_color_name: proposedDisplayName ?? catalogItem.color_name,
    source_material_name: catalogItem.material_name ?? null,
    normalized_color_name: catalogItem.normalized_color_name,
    normalized_material_name: catalogItem.normalized_material_name ?? null,
    source_price_group: catalogItem.price_group ?? null,
    product_slug: productSlug,
    texture_hash: contentHash ?? null,
    texture_url_600: displayThumbUrl,
    texture_url_1024: displayHeroUrl,
    original_image_url: fullResUrl,
    thumbnail_url: displayThumbUrl,
    hero_url: displayHeroUrl,
    asset_kind: ELITE100_MANUAL_ASSET_KIND,
    review_status: ELITE100_MANUAL_REVIEW_STATUS,
    is_primary: Boolean(isPrimary),
    is_active: true,
    confidence_score: null,
    match_method: matchMethod === "mapping_override" ||
      matchMethod === "global_index" ||
      matchMethod === "color_slug" ||
      matchMethod === "color_name" ||
      matchMethod === "photo_filename_alias" ||
      matchMethod === "group_sort"
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
      display_variant: Boolean(variantKey),
      variant_key: variantKey ?? null,
      variant_suffix: variantSuffix ?? null,
      finish: finish ?? null,
      proposed_display_name: proposedDisplayName ?? null,
      base_catalog_color_name: catalogItem.color_name ?? null,
    },
    last_seen_at: now,
  };
}

/**
 * Human-readable audit row for dry-run review.
 */
export function formatManualPhotoAuditRow(entry) {
  const catalog = entry.catalogItem;
  const tokens = entry.parsed ? extractFilenameColorTokens(entry.parsed) : null;
  const indexCatalog =
    entry.indexCatalogItem ??
    entry.conflictCatalogItem ??
    (entry.candidates?.[0]?.index_catalog_color
      ? { color_name: entry.candidates[0].index_catalog_color, global_index: entry.parsed?.globalIndex }
      : null);

  let plannedAction = "blocked";
  let blockerReason = entry.matchStatus ?? ELITE100_MATCH_STATUS.UNMATCHED;
  if (entry.matchStatus === ELITE100_MATCH_STATUS.SAFE && catalog?.id) {
    plannedAction = "upload";
    blockerReason = "";
  } else if (entry.matchStatus === ELITE100_MATCH_STATUS.DUPLICATE_TARGET) {
    blockerReason = `duplicate_target:${(entry.duplicatePeers ?? []).join("|")}`;
  } else if (entry.matchStatus === ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT) {
    blockerReason = `number_name_conflict:index=${entry.parsed?.globalIndex ?? "?"}→${entry.conflictCatalogItem?.color_name ?? "?"} vs name→${entry.candidates?.[0]?.name_match_color ?? "?"}`;
  }

  return {
    source_filename: entry.filename ?? path.basename(String(entry.fullPath ?? "")),
    parsed_index: entry.parsed?.globalIndex ?? null,
    parsed_name: tokens?.raw || entry.parsed?.colorText || null,
    matched_catalog_index: catalog?.global_index ?? entry.candidates?.[0]?.name_match_global_index ?? null,
    index_catalog_index: indexCatalog?.global_index ?? entry.parsed?.globalIndex ?? null,
    index_catalog_color_name: indexCatalog?.color_name ?? entry.conflictCatalogItem?.color_name ?? null,
    matched_catalog_color_name: catalog?.color_name ?? null,
    matched_catalog_item_id: catalog?.id ?? null,
    match_method: entry.matchMethod ?? null,
    confidence: entry.confidence ?? null,
    planned_action: plannedAction,
    blocker_reason: blockerReason,
    planned_thumb_path: entry.storagePaths?.thumbPath ?? null,
    planned_hero_path: entry.storagePaths?.heroPath ?? null,
    planned_original_path: entry.storagePaths?.originalPath ?? null,
  };
}

export function printManualPhotoAuditTable(entries) {
  const rows = (entries ?? []).map(formatManualPhotoAuditRow);
  console.log("\n── Photo match audit ──");
  console.table(rows);
  return rows;
}

/**
 * Summarize dry-run / pre-write results.
 */
export function formatManualPhotoDryRunEntry(entry) {
  return {
    ...formatManualPhotoAuditRow(entry),
    match_status: entry.matchStatus ?? ELITE100_MATCH_STATUS.UNMATCHED,
    safe_match: entry.matchStatus === ELITE100_MATCH_STATUS.SAFE && Boolean(entry.catalogItem?.id),
    matched: Boolean(entry.catalogItem?.id) && entry.matchStatus === ELITE100_MATCH_STATUS.SAFE,
    material_name: entry.catalogItem?.material_name ?? null,
    filename_color: entry.parsed ? extractFilenameColorTokens(entry.parsed).normalized : null,
    conflict_color: entry.conflictCatalogItem?.color_name ?? null,
    suggested_catalog_color: entry.candidates?.[0]?.suggested_catalog_color ?? null,
    duplicate_peers: entry.duplicatePeers ?? [],
    source_file: entry.fullPath ?? entry.filename ?? null,
    stores_original_image_url: Boolean(entry.storagePaths?.originalPath),
    db_field_for_original_url: "original_image_url",
    source_bytes: entry.sourceBytes ?? null,
    warnings: entry.warnings ?? [],
  };
}

export function computeManualPhotoDryRunSummary(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const safeMatches = list.filter(
    (e) => e.matchStatus === ELITE100_MATCH_STATUS.SAFE && e.catalogItem?.id
  );
  const mappingOverrides = safeMatches.filter((e) => e.matchMethod === "mapping_override");
  const conflicts = list.filter(
    (e) => e.matchStatus === ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT
  );
  const catalogColorMissing = list.filter(
    (e) => e.matchStatus === ELITE100_MATCH_STATUS.CATALOG_COLOR_MISSING
  );
  const ambiguous = list.filter((e) => e.matchStatus === ELITE100_MATCH_STATUS.AMBIGUOUS);
  const unmatched = list.filter((e) => e.matchStatus === ELITE100_MATCH_STATUS.UNMATCHED);
  const invalidIndex = list.filter((e) => e.matchStatus === ELITE100_MATCH_STATUS.INVALID_INDEX);
  const duplicateTargets = list.filter((e) => e.matchStatus === ELITE100_MATCH_STATUS.DUPLICATE_TARGET);
  const oversized = list.filter((e) => e.warnings?.includes("source_oversized"));
  const needsResize = list.filter((e) => e.warnings?.includes("needs_resize"));
  const safety = assessImportPlanSafety(list);

  return {
    total_files: list.length,
    safe_matches: safeMatches.length,
    mapping_override_matches: mappingOverrides.length,
    conflicts: conflicts.length,
    catalog_color_missing: catalogColorMissing.length,
    ambiguous: ambiguous.length,
    unmatched: unmatched.length,
    invalid_index: invalidIndex.length,
    duplicate_targets: duplicateTargets.length,
    oversized_sources: oversized.length,
    needs_resize: needsResize.length,
    write_blocked: safety.write_blocked,
    write_block_reasons: [...new Set(safety.blockers.map((b) => b.reason))],
    safe_matches_list: safeMatches.map(formatManualPhotoDryRunEntry),
    conflicts_list: conflicts.map(formatManualPhotoDryRunEntry),
    catalog_color_missing_list: catalogColorMissing.map(formatManualPhotoDryRunEntry),
    ambiguous_list: ambiguous.map(formatManualPhotoDryRunEntry),
    unmatched_list: unmatched.map(formatManualPhotoDryRunEntry),
    invalid_index_list: invalidIndex.map(formatManualPhotoDryRunEntry),
    duplicate_targets_list: duplicateTargets.map(formatManualPhotoDryRunEntry),
    mapping_override_list: mappingOverrides.map(formatManualPhotoDryRunEntry),
    blockers: safety.blockers,
    audit_rows: list.map(formatManualPhotoAuditRow),
    entries: list.map(formatManualPhotoDryRunEntry),
  };
}

// ── V2 import plan (batch scan, skip existing, dual-finish variants) ─────────

export const ELITE100_IMPORT_ACTION = Object.freeze({
  SKIP_EXISTING: "SKIP_EXISTING",
  INSERT: "INSERT",
  INSERT_VARIANT: "INSERT_VARIANT",
  CONFLICT: "CONFLICT",
  UNMATCHED: "UNMATCHED",
  AMBIGUOUS: "AMBIGUOUS",
});

/** Stable variant key for dual-finish photos (e.g. leathered-a). */
export function buildElite100VariantKey({ variantSuffix, finish }) {
  if (!variantSuffix) return null;
  const suffix = String(variantSuffix).trim().toLowerCase();
  const finishPart = finish ? slugifyElite100ColorName(finish) : "finish";
  return `${finishPart}-${suffix}`;
}

/** Showroom display name for a dual-finish variant card. */
export function buildVariantDisplayName(baseColorName, finish) {
  const base = String(baseColorName ?? "").trim() || "Color";
  if (!finish) return `${base} - Alternate Finish`;
  const normalized = String(finish).trim().toLowerCase();
  if (normalized === "leathered") return `${base} - Leathered`;
  if (normalized === "honed") return `${base} - Honed`;
  if (normalized === "polished") return `${base} - Polished`;
  if (normalized === "brushed") return `${base} - Brushed`;
  if (normalized === "matte") return `${base} - Matte`;
  if (normalized === "satin") return `${base} - Satin`;
  return `${base} - ${finish}`;
}

/**
 * Index existing manual visual assets for skip/overwrite decisions.
 * @param {Array} rows  Existing slab_color_visual_assets rows
 */
export function indexExistingManualVisualAssets(rows) {
  const primaryByCatalogId = new Map();
  const variantByKey = new Map();
  const hashByFilename = new Map();

  for (const row of rows ?? []) {
    if (row.source_system && row.source_system !== ELITE100_MANUAL_SOURCE_SYSTEM) continue;
    const catalogId = row.catalog_item_id;
    if (!catalogId) continue;

    const raw = row.raw ?? {};
    const variantKey = raw.variant_key ?? null;
    const sourceFilename = raw.source_filename ?? null;
    if (sourceFilename) {
      hashByFilename.set(sourceFilename, row);
    }

    if (variantKey || raw.display_variant === true) {
      variantByKey.set(`${catalogId}::${variantKey ?? row.product_slug ?? row.id}`, row);
      continue;
    }

    if (row.is_primary) {
      primaryByCatalogId.set(catalogId, row);
    }
  }

  return { primaryByCatalogId, variantByKey, hashByFilename };
}

function matchStatusToImportAction(matchStatus) {
  switch (matchStatus) {
    case ELITE100_MATCH_STATUS.GLOBAL_INDEX_NAME_CONFLICT:
    case ELITE100_MATCH_STATUS.INVALID_INDEX:
    case ELITE100_MATCH_STATUS.CATALOG_COLOR_MISSING:
    case ELITE100_MATCH_STATUS.DUPLICATE_TARGET:
      return ELITE100_IMPORT_ACTION.CONFLICT;
    case ELITE100_MATCH_STATUS.AMBIGUOUS:
      return ELITE100_IMPORT_ACTION.AMBIGUOUS;
    case ELITE100_MATCH_STATUS.UNMATCHED:
    default:
      return ELITE100_IMPORT_ACTION.UNMATCHED;
  }
}

/**
 * Resolve v2 import action for one matched file.
 * @param {Object} entry  Plan entry after matching
 * @param {Object} existingIndex  From indexExistingManualVisualAssets
 * @param {Object} [opts]
 * @param {boolean} [opts.forceOverwrite=false]
 */
export function resolveImportAction(entry, existingIndex, opts = {}) {
  const forceOverwrite = opts.forceOverwrite === true;
  const label = entry.filename ?? path.basename(String(entry.fullPath ?? ""));

  const existingByFilename = existingIndex.hashByFilename.get(label) ?? null;
  if (existingByFilename && !forceOverwrite) {
    entry.existingAsset = existingByFilename;
    entry.existingAssetExists = true;
    return ELITE100_IMPORT_ACTION.SKIP_EXISTING;
  }

  if (entry.matchStatus !== ELITE100_MATCH_STATUS.SAFE || !entry.catalogItem?.id) {
    return matchStatusToImportAction(entry.matchStatus);
  }

  const catalogId = entry.catalogItem.id;
  const variantKey = entry.variantKey ?? null;
  const existingPrimary = existingIndex.primaryByCatalogId.get(catalogId) ?? null;
  const existingVariant = variantKey
    ? existingIndex.variantByKey.get(`${catalogId}::${variantKey}`) ?? null
    : null;

  entry.existingAsset = existingVariant ?? existingPrimary ?? existingByFilename ?? null;
  entry.existingAssetExists = Boolean(entry.existingAsset);

  if (variantKey) {
    if (existingVariant) {
      if (existingVariant.texture_hash === entry.contentHash || !forceOverwrite) {
        return ELITE100_IMPORT_ACTION.SKIP_EXISTING;
      }
      return ELITE100_IMPORT_ACTION.CONFLICT;
    }
    return ELITE100_IMPORT_ACTION.INSERT_VARIANT;
  }

  if (existingPrimary || existingByFilename) {
    if (!forceOverwrite) return ELITE100_IMPORT_ACTION.SKIP_EXISTING;
    if (existingPrimary?.texture_hash === entry.contentHash) return ELITE100_IMPORT_ACTION.SKIP_EXISTING;
    return ELITE100_IMPORT_ACTION.CONFLICT;
  }

  return ELITE100_IMPORT_ACTION.INSERT;
}

/** Enrich a v2 plan entry with variant metadata and import action. */
export function enrichImportPlanEntryV2(entry, existingIndex, opts = {}) {
  const parsed = entry.parsed ?? {};
  const finish = parsed.parsedFinish ?? extractFilenameFinish(parsed.colorText);
  const variantSuffix = parsed.variantSuffix ?? null;
  const variantKey = variantSuffix
    ? buildElite100VariantKey({ variantSuffix, finish })
    : null;

  entry.finish = finish;
  entry.variantSuffix = variantSuffix;
  entry.variantKey = variantKey;
  entry.proposedDisplayName = variantKey
    ? buildVariantDisplayName(entry.catalogItem?.color_name, finish)
    : entry.catalogItem?.color_name ?? null;

  if (entry.catalogItem?.id && entry.matchStatus === ELITE100_MATCH_STATUS.SAFE) {
    const baseSlug = entry.catalogItem.product_slug ?? slugifyElite100ColorName(entry.catalogItem.color_name);
    const storageSlug = variantKey ? `${baseSlug}--${slugifyElite100ColorName(variantKey)}` : baseSlug;
    entry.storagePaths = buildElite100ManualStoragePaths(
      opts.orgId,
      entry.catalogItem.id,
      storageSlug,
      { heroMaxPx: opts.heroMaxPx, originalExt: entry.originalExt ?? ".jpg", variantKey }
    );
  }

  entry.importAction = resolveImportAction(entry, existingIndex, opts);
  return entry;
}

/** Format one v2 manifest row. */
export function formatImportV2ManifestRow(entry) {
  return {
    filename: entry.filename ?? path.basename(String(entry.fullPath ?? "")),
    parsed_number: entry.parsed?.globalIndex ?? null,
    parsed_variant_suffix: entry.variantSuffix ?? entry.parsed?.variantSuffix ?? null,
    parsed_finish: entry.finish ?? entry.parsed?.parsedFinish ?? null,
    matched_base_color: entry.catalogItem?.color_name ?? null,
    matched_catalog_item_id: entry.catalogItem?.id ?? null,
    proposed_display_name: entry.proposedDisplayName ?? null,
    variant_key: entry.variantKey ?? null,
    existing_asset_exists: Boolean(entry.existingAssetExists),
    existing_asset_id: entry.existingAsset?.id ?? null,
    action: entry.importAction ?? ELITE100_IMPORT_ACTION.UNMATCHED,
    match_method: entry.matchMethod ?? null,
    match_status: entry.matchStatus ?? null,
    blocker_detail: entry.warnings?.join(", ") ?? null,
    planned_thumb_path: entry.storagePaths?.thumbPath ?? null,
    planned_hero_path: entry.storagePaths?.heroPath ?? null,
  };
}

/** Summarize v2 import plan for manifest + summary file. */
export function computeImportV2Summary(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const byAction = (action) => list.filter((e) => e.importAction === action);

  const inserts = byAction(ELITE100_IMPORT_ACTION.INSERT);
  const insertVariants = byAction(ELITE100_IMPORT_ACTION.INSERT_VARIANT);
  const skips = byAction(ELITE100_IMPORT_ACTION.SKIP_EXISTING);
  const conflicts = byAction(ELITE100_IMPORT_ACTION.CONFLICT);
  const unmatched = byAction(ELITE100_IMPORT_ACTION.UNMATCHED);
  const ambiguous = byAction(ELITE100_IMPORT_ACTION.AMBIGUOUS);

  const applyBlocked = conflicts.length + unmatched.length + ambiguous.length > 0;

  return {
    total_files: list.length,
    skip_existing: skips.length,
    insert: inserts.length,
    insert_variant: insertVariants.length,
    conflict: conflicts.length,
    unmatched: unmatched.length,
    ambiguous: ambiguous.length,
    apply_blocked: applyBlocked,
    apply_allowed: !applyBlocked,
    rows: list.map(formatImportV2ManifestRow),
    insert_rows: inserts.map(formatImportV2ManifestRow),
    insert_variant_rows: insertVariants.map(formatImportV2ManifestRow),
    skip_existing_rows: skips.map(formatImportV2ManifestRow),
    conflict_rows: conflicts.map(formatImportV2ManifestRow),
    unmatched_rows: unmatched.map(formatImportV2ManifestRow),
    ambiguous_rows: ambiguous.map(formatImportV2ManifestRow),
  };
}

/** Human-readable v2 summary text for debug/elite100/photo-import-v2-summary.txt */
export function formatImportV2SummaryText(summary) {
  const lines = [
    "Elite 100 Manual Photo Import V2 — Dry Run Summary",
    "===================================================",
    `Total files scanned:     ${summary.total_files}`,
    `SKIP_EXISTING:           ${summary.skip_existing}`,
    `INSERT:                  ${summary.insert}`,
    `INSERT_VARIANT:          ${summary.insert_variant}`,
    `CONFLICT:                ${summary.conflict}`,
    `UNMATCHED:               ${summary.unmatched}`,
    `AMBIGUOUS:               ${summary.ambiguous}`,
    "",
    `Apply allowed:           ${summary.apply_allowed ? "YES" : "NO"}`,
    "",
  ];

  if (summary.insert_rows.length) {
    lines.push("── New inserts ──");
    for (const row of summary.insert_rows) {
      lines.push(`  INSERT  ${row.filename} → ${row.matched_base_color}`);
    }
    lines.push("");
  }

  if (summary.insert_variant_rows.length) {
    lines.push("── New dual-finish variants ──");
    for (const row of summary.insert_variant_rows) {
      lines.push(`  INSERT_VARIANT  ${row.filename} → ${row.proposed_display_name} (${row.variant_key})`);
    }
    lines.push("");
  }

  if (summary.skip_existing_rows.length) {
    lines.push(`── Skipped existing (${summary.skip_existing_rows.length} files) ──`);
    for (const row of summary.skip_existing_rows.slice(0, 20)) {
      lines.push(`  SKIP_EXISTING  ${row.filename} → ${row.matched_base_color ?? row.proposed_display_name ?? "?"}`);
    }
    if (summary.skip_existing_rows.length > 20) {
      lines.push(`  … and ${summary.skip_existing_rows.length - 20} more`);
    }
    lines.push("");
  }

  if (summary.conflict_rows.length) {
    lines.push("── Conflicts (block apply) ──");
    for (const row of summary.conflict_rows) {
      lines.push(`  CONFLICT  ${row.filename} — ${row.blocker_detail ?? row.match_status ?? "conflict"}`);
    }
    lines.push("");
  }

  if (summary.unmatched_rows.length) {
    lines.push("── Unmatched (block apply) ──");
    for (const row of summary.unmatched_rows) {
      lines.push(`  UNMATCHED  ${row.filename}`);
    }
    lines.push("");
  }

  if (summary.ambiguous_rows.length) {
    lines.push("── Ambiguous (block apply) ──");
    for (const row of summary.ambiguous_rows) {
      lines.push(`  AMBIGUOUS  ${row.filename}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Score filenames competing for the same new primary insert (higher wins). */
export function scoreDuplicatePrimaryFilename(filename) {
  const name = String(filename ?? "").toLowerCase();
  let score = 0;
  if (/corrected|white.?balance|final.?edit|revised|v2|v3/.test(name)) score += 100;
  if (/[_-]\d{1,3}(?:[a-z])?\.(jpg|jpeg|png|webp|tif|tiff)$/.test(name)) score += 10;
  if (/\d{1,3}\.\s/.test(name)) score += 5;
  score -= name.length * 0.01;
  return score;
}

/**
 * When multiple base files would INSERT for the same catalog color (no existing primary),
 * keep one deterministic winner and mark peers as duplicate primary candidates (CONFLICT).
 */
export function resolveDuplicateBaseInsertCandidates(plan, existingIndex) {
  const list = Array.isArray(plan) ? plan : [];
  const insertGroups = new Map();

  for (const entry of list) {
    if (entry.importAction !== ELITE100_IMPORT_ACTION.INSERT) continue;
    if (!entry.catalogItem?.id || entry.variantKey) continue;
    if (existingIndex.primaryByCatalogId.has(entry.catalogItem.id)) continue;
    const id = entry.catalogItem.id;
    if (!insertGroups.has(id)) insertGroups.set(id, []);
    insertGroups.get(id).push(entry);
  }

  for (const group of insertGroups.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => {
      const scoreDiff = scoreDuplicatePrimaryFilename(b.filename) - scoreDuplicatePrimaryFilename(a.filename);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.filename).localeCompare(String(b.filename));
    });
    const winner = sorted[0];
    for (const entry of sorted.slice(1)) {
      entry.importAction = ELITE100_IMPORT_ACTION.CONFLICT;
      entry.warnings = [
        ...(entry.warnings ?? []),
        "duplicate_primary_candidate",
        `duplicate_of:${winner.filename}`,
      ];
    }
  }

  return list;
}

/** Apply v2 enrichment + actions to a matched import plan. */
export function finalizeImportPlanV2(plan, existingAssets, opts = {}) {
  const existingIndex = indexExistingManualVisualAssets(existingAssets);
  const list = Array.isArray(plan) ? plan : [];
  for (const entry of list) {
    enrichImportPlanEntryV2(entry, existingIndex, opts);
  }
  resolveDuplicateBaseInsertCandidates(list, existingIndex);
  return list;
}
