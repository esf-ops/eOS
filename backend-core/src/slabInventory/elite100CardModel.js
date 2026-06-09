/**
 * elite100CardModel — separate catalog reference images from live inventory for Elite 100 cards.
 *
 * Reference images come from slab_color_visual_assets (catalog-level, durable, admin-editable).
 * Current inventory images come from slab_images joined to active slab_inventory rows.
 */

/**
 * Pick the best high-resolution reference URL from a visual asset row.
 * @param {{ texture_url_1024?: string|null, hero_url?: string|null, original_image_url?: string|null, texture_url_600?: string|null }|null|undefined} asset
 */
export function chooseCatalogReferenceImageUrl(asset) {
  if (!asset) return null;
  return (
    asset.texture_url_1024 ??
    asset.hero_url ??
    asset.original_image_url ??
    asset.texture_url_600 ??
    null
  );
}

/**
 * Highest-resolution catalog reference URL for zoom/lightbox (prefers original over card-sized).
 * @param {{ texture_url_1024?: string|null, hero_url?: string|null, original_image_url?: string|null, texture_url_600?: string|null }|null|undefined} asset
 */
export function chooseCatalogReferenceImageUrlFull(asset) {
  if (!asset) return null;
  return (
    asset.original_image_url ??
    asset.texture_url_1024 ??
    asset.hero_url ??
    asset.texture_url_600 ??
    null
  );
}

/**
 * Staff-safe label for which catalog asset field supplied the reference image.
 * @param {{ texture_url_1024?: string|null, hero_url?: string|null, original_image_url?: string|null, texture_url_600?: string|null }|null|undefined} asset
 */
export function catalogReferenceImageSourceLabel(asset) {
  if (!asset) return null;
  if (asset.texture_url_1024) return "catalog_texture_1024";
  if (asset.hero_url) return "catalog_hero";
  if (asset.original_image_url) return "catalog_original";
  if (asset.texture_url_600) return "catalog_texture_600";
  return null;
}

/**
 * Build reference-image fields for an Elite 100 card from the best catalog visual asset.
 * Never uses live inventory slab photos — those belong on current-inventory fields.
 *
 * @param {object|null|undefined} visualAsset  Best row from slab_color_visual_assets
 */
export function buildElite100ReferenceImageFields(visualAsset) {
  const asset = visualAsset ?? null;
  const reference_image_url = chooseCatalogReferenceImageUrl(asset);
  return {
    reference_image_url,
    reference_image_url_full: chooseCatalogReferenceImageUrlFull(asset),
    reference_image_url_1024: asset?.texture_url_1024 ?? null,
    reference_image_url_600: asset?.texture_url_600 ?? null,
    reference_image_source: catalogReferenceImageSourceLabel(asset),
    reference_image_review_status: asset?.review_status ?? null,
    reference_image_kind: asset?.asset_kind ?? null,
  };
}

/**
 * Build current-inventory image fields from scored representative selection (live stock only).
 * @param {{
 *   representative_image_url?: string|null,
 *   representative_thumbnail_url?: string|null,
 *   representative_image_source_inventory_type?: string|null,
 *   representative_image_inventory_id?: string|null,
 * }|null|undefined} rep
 */
export function buildElite100CurrentInventoryImageFields(rep) {
  const r = rep ?? {};
  return {
    current_inventory_image_url: r.representative_image_url ?? null,
    current_inventory_thumbnail_url: r.representative_thumbnail_url ?? null,
    current_inventory_image_source_inventory_type:
      r.representative_image_source_inventory_type ?? null,
    current_inventory_image_inventory_id: r.representative_image_inventory_id ?? null,
  };
}

/**
 * Count live inventory rows matched to a catalog item.
 * @param {{ rows?: Array, slabCount?: number, remnantCount?: number }} acc
 */
export function summarizeElite100CurrentInventory(acc) {
  const rows = Array.isArray(acc?.rows) ? acc.rows : [];
  const slabCount = Number(acc?.slabCount ?? 0);
  const remnantCount = Number(acc?.remnantCount ?? 0);
  const current_inventory_count = rows.length;
  return {
    current_inventory_count,
    slab_count: slabCount,
    remnant_count: remnantCount,
    total_inventory_count: current_inventory_count,
    has_inventory: current_inventory_count > 0,
    verified_photo_count: Number(acc?.verifiedPhotoCount ?? 0),
  };
}

/**
 * Columns fetched for Elite 100 inventory matching (active source rows only — same basis as All Inventory).
 */
export const ELITE100_INVENTORY_MATCH_COLUMNS = Object.freeze([
  "id",
  "external_source",
  "external_slab_id",
  "inventory_id",
  "color_name",
  "material_name",
  "source_inventory_type",
]);
