/**
 * Build Photo Visualizer texture options from enriched Elite 100 catalog data.
 * Mirrors Elite 100 collection card image priority — never uses original_image_url
 * for picker thumbnails or default canvas rendering.
 */

import { lookupElite100Texture } from "./elite100TextureAssets";

export type Elite100VisualizerCatalogItem = {
  catalog_item_id: string;
  color_key: string;
  color_name: string | null;
  material_name: string | null;
  price_group: string;
  reference_image_url?: string | null;
  reference_image_url_1024?: string | null;
  reference_image_url_600?: string | null;
  visual_asset_url?: string | null;
  visual_asset_url_1024?: string | null;
  visual_asset_url_600?: string | null;
  representative_image_url?: string | null;
  representative_thumbnail_url?: string | null;
};

export type Elite100VisualizerGroup = {
  price_group: string;
  items: Elite100VisualizerCatalogItem[];
};

export type Elite100VisualizerTextureSource =
  | "catalog_visual_asset"
  | "static_pilot"
  | "representative_slab"
  | "none";

export type Elite100VisualizerTexture = {
  colorName: string;
  slug: string;
  thumbUrl: string | null;
  /** Display-sized render URL (1024/hero/600) — not original_image_url */
  fullUrl: string | null;
  hasImage: boolean;
  priceGroup: string;
  materialName: string | null;
  imageSource: Elite100VisualizerTextureSource;
  catalogItemId: string;
};

function resolveVisualizerImageUrls(item: Elite100VisualizerCatalogItem): {
  thumbUrl: string | null;
  fullUrl: string | null;
  imageSource: Elite100VisualizerTextureSource;
  hasImage: boolean;
} {
  const catalogThumb =
    item.reference_image_url_600
    ?? item.visual_asset_url_600
    ?? null;

  const catalogRender =
    item.reference_image_url_1024
    ?? item.reference_image_url
    ?? item.visual_asset_url_1024
    ?? item.visual_asset_url
    ?? null;

  if (catalogRender || catalogThumb) {
    return {
      thumbUrl: catalogThumb ?? catalogRender,
      fullUrl: catalogRender ?? catalogThumb,
      imageSource: "catalog_visual_asset",
      hasImage: true,
    };
  }

  const pilot = lookupElite100Texture(item.color_name, item.color_key);
  if (pilot) {
    return {
      thumbUrl: pilot.thumbUrl,
      fullUrl: pilot.fullUrl,
      imageSource: "static_pilot",
      hasImage: true,
    };
  }

  const repThumb = item.representative_thumbnail_url ?? null;
  const repRender = item.representative_image_url ?? null;
  if (repRender || repThumb) {
    return {
      thumbUrl: repThumb ?? repRender,
      fullUrl: repRender ?? repThumb,
      imageSource: "representative_slab",
      hasImage: true,
    };
  }

  return {
    thumbUrl: null,
    fullUrl: null,
    imageSource: "none",
    hasImage: false,
  };
}

export function buildElite100VisualizerTexture(
  item: Elite100VisualizerCatalogItem,
): Elite100VisualizerTexture {
  const resolved = resolveVisualizerImageUrls(item);
  return {
    colorName: item.color_name?.trim() || "Unnamed",
    slug: item.color_key,
    thumbUrl: resolved.thumbUrl,
    fullUrl: resolved.fullUrl,
    hasImage: resolved.hasImage,
    priceGroup: item.price_group,
    materialName: item.material_name ?? null,
    imageSource: resolved.imageSource,
    catalogItemId: item.catalog_item_id,
  };
}

/**
 * Flatten Elite 100 program groups into visualizer textures (catalog order).
 */
export function buildElite100VisualizerTextures(
  groups: Elite100VisualizerGroup[] | null | undefined,
  priceGroupOrder: string[] = [],
): Elite100VisualizerTexture[] {
  const list = Array.isArray(groups) ? groups : [];
  const order = priceGroupOrder.length > 0
    ? priceGroupOrder
    : [...new Set(list.map((g) => g.price_group))];

  const byGroup = new Map(list.map((g) => [g.price_group, g.items ?? []]));
  const textures: Elite100VisualizerTexture[] = [];

  for (const groupKey of order) {
    const items = byGroup.get(groupKey) ?? [];
    for (const item of items) {
      textures.push(buildElite100VisualizerTexture(item));
    }
  }

  return textures;
}

export function filterElite100VisualizerTextures(
  textures: Elite100VisualizerTexture[],
  opts: {
    search?: string;
    priceGroup?: string | null;
    hasImageOnly?: boolean;
  } = {},
): Elite100VisualizerTexture[] {
  const query = String(opts.search ?? "").trim().toLowerCase();
  const group = opts.priceGroup && opts.priceGroup !== "all" ? opts.priceGroup : null;

  return textures.filter((texture) => {
    if (opts.hasImageOnly && !texture.hasImage) return false;
    if (group && texture.priceGroup !== group) return false;
    if (!query) return true;
    const haystack = `${texture.colorName} ${texture.materialName ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function firstSelectableVisualizerTexture(
  textures: Elite100VisualizerTexture[],
): Elite100VisualizerTexture | null {
  return textures.find((t) => t.hasImage && t.fullUrl) ?? null;
}
