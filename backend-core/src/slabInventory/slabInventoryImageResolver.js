/**
 * slabInventoryImageResolver — join slab_inventory rows to slab_images with source-aware preference.
 *
 * SlabCloud rows prefer image_url_pattern=slabcloud_slab_jpg.
 * Slabsmith rows prefer image_url_pattern=slabsmith_local_upload with image_status=ok.
 */

import { INVENTORY_SOURCE_ALL } from "./slabInventorySourceFilter.js";

export const IMAGE_URL_PATTERN_SLABCLOUD = "slabcloud_slab_jpg";
export const IMAGE_URL_PATTERN_SLABSMITH = "slabsmith_local_upload";

/** @deprecated use IMAGE_URL_PATTERN_SLABCLOUD */
export const PREFERRED_IMAGE_PATTERN = IMAGE_URL_PATTERN_SLABCLOUD;

export const IMAGE_URL_PATTERNS_BY_INVENTORY_SOURCE = Object.freeze({
  slabcloud: IMAGE_URL_PATTERN_SLABCLOUD,
  slabsmith: IMAGE_URL_PATTERN_SLABSMITH,
});

export const SLAB_IMAGE_SELECT_COLUMNS =
  "external_source,external_slab_id,image_url,thumbnail_url,image_status,image_url_pattern";

function trimStr(v) {
  return v == null ? "" : String(v).trim();
}

/**
 * @param {{ mode?: string, externalSource?: string|null, resolved?: string }} [sourceFilter]
 */
export function usesCompositeImageMapKeys(sourceFilter) {
  return sourceFilter?.mode === "single" && sourceFilter.externalSource
    ? false
    : (sourceFilter?.resolved ?? INVENTORY_SOURCE_ALL) === INVENTORY_SOURCE_ALL;
}

/**
 * @param {Record<string, unknown>|null|undefined} inventoryRow
 * @param {{ mode?: string, externalSource?: string|null, resolved?: string }} [sourceFilter]
 */
export function imageMapLookupKey(inventoryRow, sourceFilter) {
  const slabId = trimStr(inventoryRow?.external_slab_id);
  if (!slabId) return "";
  if (usesCompositeImageMapKeys(sourceFilter)) {
    const src = trimStr(inventoryRow?.external_source);
    if (src) return `${src}:${slabId}`;
  }
  return slabId;
}

/**
 * @param {Record<string, unknown>|null|undefined} imageRow
 * @param {{ mode?: string, externalSource?: string|null, resolved?: string }} [sourceFilter]
 */
export function imageMapStorageKey(imageRow, sourceFilter) {
  const slabId = trimStr(imageRow?.external_slab_id);
  if (!slabId) return "";
  if (usesCompositeImageMapKeys(sourceFilter)) {
    const src = trimStr(imageRow?.external_source);
    if (src) return `${src}:${slabId}`;
  }
  return slabId;
}

/**
 * @param {{ mode?: string, externalSource?: string|null }} [sourceFilter]
 * @param {unknown} imageRowExternalSource
 */
export function preferredImagePatternForSource(sourceFilter, imageRowExternalSource) {
  if (sourceFilter?.mode === "single" && sourceFilter.externalSource) {
    return IMAGE_URL_PATTERNS_BY_INVENTORY_SOURCE[sourceFilter.externalSource] ?? null;
  }
  const src = trimStr(imageRowExternalSource);
  return IMAGE_URL_PATTERNS_BY_INVENTORY_SOURCE[src] ?? null;
}

/**
 * @param {Record<string, unknown>|null|undefined} candidate
 * @param {Record<string, unknown>|null|undefined} existing
 * @param {{ mode?: string, externalSource?: string|null, resolved?: string }} [sourceFilter]
 */
export function pickPreferredImageRow(candidate, existing, sourceFilter) {
  if (!existing) return candidate;
  if (!candidate) return existing;

  const candidateOk = candidate.image_status === "ok";
  const existingOk = existing.image_status === "ok";
  if (candidateOk && !existingOk) return candidate;
  if (existingOk && !candidateOk) return existing;

  const preferred =
    preferredImagePatternForSource(sourceFilter, candidate.external_source) ??
    preferredImagePatternForSource(sourceFilter, existing.external_source);

  const candidatePattern = candidate.image_url_pattern;
  const existingPattern = existing.image_url_pattern;

  if (preferred) {
    if (candidatePattern === preferred && existingPattern !== preferred) return candidate;
    if (existingPattern === preferred && candidatePattern !== preferred) return existing;
  }

  if (candidatePattern === IMAGE_URL_PATTERN_SLABCLOUD && existingPattern !== IMAGE_URL_PATTERN_SLABCLOUD) {
    return candidate;
  }
  if (existingPattern === IMAGE_URL_PATTERN_SLABCLOUD && candidatePattern !== IMAGE_URL_PATTERN_SLABCLOUD) {
    return existing;
  }

  return existing;
}

/**
 * @param {Array<Record<string, unknown>>} imageRows
 * @param {{ mode?: string, externalSource?: string|null, resolved?: string }} [sourceFilter]
 */
export function buildImageMap(imageRows = [], sourceFilter = null) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  for (const raw of Array.isArray(imageRows) ? imageRows : []) {
    const key = imageMapStorageKey(raw, sourceFilter);
    if (!key) continue;
    map.set(key, pickPreferredImageRow(raw, map.get(key), sourceFilter));
  }
  return map;
}

/**
 * @param {Map<string, Record<string, unknown>>} imageMap
 * @param {Record<string, unknown>|null|undefined} inventoryRow
 * @param {{ mode?: string, externalSource?: string|null, resolved?: string }} [sourceFilter]
 */
export function lookupInventoryImage(imageMap, inventoryRow, sourceFilter) {
  if (!imageMap?.get || !inventoryRow) return null;
  const key = imageMapLookupKey(inventoryRow, sourceFilter);
  if (!key) return null;
  return imageMap.get(key) ?? null;
}

/**
 * Staff-safe label for image_url_pattern (debug/QA only).
 * @param {unknown} pattern
 */
export function imagePatternDisplayLabel(pattern) {
  const p = trimStr(pattern);
  if (p === IMAGE_URL_PATTERN_SLABSMITH) return "Local inventory image";
  if (p === IMAGE_URL_PATTERN_SLABCLOUD) return "Legacy URL";
  return p || null;
}
