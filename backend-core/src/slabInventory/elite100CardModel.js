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

const ELITE100_MANUAL_SOURCE = "elite100_manual_local";

/** True when a visual asset row is a dual-finish showroom variant (not the base primary). */
export function isElite100FinishVariantAsset(asset) {
  if (!asset || asset.is_active === false) return false;
  if (asset.review_status !== "approved" && asset.review_status !== "imported") return false;
  if (asset.source_system !== ELITE100_MANUAL_SOURCE) return false;
  const raw = asset.raw ?? {};
  if (raw.display_variant === true) return true;
  if (raw.variant_key) return true;
  return asset.is_primary === false && String(asset.product_slug ?? "").includes("--");
}

/** Build visual asset URL fields from one asset row (presentation only). */
export function buildElite100VisualAssetFields(asset) {
  if (!asset) {
    return {
      visual_asset_url: null,
      visual_asset_url_600: null,
      visual_asset_url_1024: null,
      visual_asset_source: null,
      visual_asset_kind: null,
      visual_asset_review_status: null,
    };
  }
  return {
    visual_asset_url:
      asset.texture_url_1024 ?? asset.hero_url ?? asset.original_image_url ?? asset.texture_url_600 ?? null,
    visual_asset_url_600: asset.texture_url_600 ?? null,
    visual_asset_url_1024: asset.texture_url_1024 ?? null,
    visual_asset_source: asset.source_system ?? null,
    visual_asset_kind: asset.asset_kind ?? null,
    visual_asset_review_status: asset.review_status ?? null,
  };
}

/**
 * Build a separate showroom card for a dual-finish variant asset.
 * Shares inventory counts with the base catalog color; image comes from the variant asset.
 */
export function buildElite100FinishVariantCard(baseCard, variantAsset) {
  const raw = variantAsset.raw ?? {};
  const variantKey = raw.variant_key ?? null;
  const finish = raw.finish ?? null;
  const displayName =
    raw.proposed_display_name ??
    variantAsset.source_color_name ??
    (finish ? `${baseCard.color_name} - ${finish}` : `${baseCard.color_name} - Alternate Finish`);

  return {
    ...baseCard,
    color_key: variantKey ? `${baseCard.color_key}--${variantKey}` : `${baseCard.color_key}--variant`,
    color_name: displayName,
    display_name: displayName,
    is_finish_variant: true,
    variant_key: variantKey,
    base_color_name: baseCard.color_name,
    base_catalog_item_id: baseCard.catalog_item_id,
    ...buildElite100ReferenceImageFields(variantAsset),
    ...buildElite100VisualAssetFields(variantAsset),
  };
}

/**
 * Collect finish-variant assets for one catalog item (sorted for stable carousel order).
 * @param {Array} assets
 */
export function listElite100FinishVariantAssets(assets) {
  return (Array.isArray(assets) ? assets : [])
    .filter(isElite100FinishVariantAsset)
    .sort((a, b) => {
      const ak = a.raw?.variant_key ?? a.product_slug ?? "";
      const bk = b.raw?.variant_key ?? b.product_slug ?? "";
      return String(ak).localeCompare(String(bk));
    });
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
 * Public Elite 100 showroom card — strip live inventory counts and inventory
 * photo fields so homeowners/kiosk do not see current stock availability.
 * Catalog reference / visual-asset image fields are retained.
 * @param {Record<string, unknown>} card
 */
export function toPublicElite100ShowroomCard(card) {
  if (!card || typeof card !== "object") return card;
  const {
    current_inventory_count: _cic,
    total_inventory_count: _tic,
    slab_count: _sc,
    remnant_count: _rc,
    verified_photo_count: _vpc,
    has_inventory: _hi,
    current_inventory_image_url: _ciu,
    current_inventory_thumbnail_url: _ctu,
    current_inventory_image_source_inventory_type: _cist,
    current_inventory_image_inventory_id: _cii,
    representative_image_url: _riu,
    representative_thumbnail_url: _rtu,
    representative_image_source_inventory_type: _rist,
    representative_image_inventory_id: _rii,
    match_debug: _md,
    ...publicCard
  } = card;
  return publicCard;
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
