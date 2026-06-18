/**
 * Display-only product catalog types and client-side search/filter helpers.
 * Data lives in productCatalogData.ts (generated from the local ESF workbook).
 * No pricing, quote integration, or backend coupling in this pass.
 */

export type ProductCatalogCategory = "sink" | "faucet" | "specialty_add_on";

export type ProductCatalogAssetStatus = "missing" | "partial" | "complete";

export type ProductCatalogVariant = {
  id: string;
  colorName?: string;
  finishName?: string;
  catalogNumber?: string;
  imageUrl?: string;
  installedImageUrl?: string;
  comboPhotoUrl?: string;
  swatchColor?: string;
  notes?: string;
};

export type ProductCatalogItem = {
  id: string;
  category: ProductCatalogCategory;
  name: string;
  brand?: string;
  series?: string;
  type?: string;
  suggestedUse?: string;
  material?: string;
  esfCode?: string;
  description?: string;
  notes?: string;
  availableColors?: string[];
  variants?: ProductCatalogVariant[];
  imageUrl?: string;
  gallery?: string[];
  installedImageUrl?: string;
  comboPhotoUrls?: string[];
  diagramUrl?: string;
  finishExampleUrls?: string[];
  specSheetUrl?: string;
  assetStatus: ProductCatalogAssetStatus;
  sourceSheet?: string;
  active: boolean;
};

export type ProductCatalogCategoryFilter = "all" | ProductCatalogCategory;

export type ProductCatalogTagFilter =
  | "kitchen"
  | "vanity"
  | "composite"
  | "steel"
  | "single_bowl"
  | "double_bowl"
  | "faucet"
  | "specialty"
  | "accessory";

export type ProductCatalogAssetFilter = "all" | ProductCatalogAssetStatus;

export const PRODUCT_CATALOG_CATEGORY_LABELS: Record<ProductCatalogCategory, string> = {
  sink: "Sinks",
  faucet: "Faucets",
  specialty_add_on: "Specialty Add-ons",
};

export const PRODUCT_CATALOG_ASSET_LABELS: Record<ProductCatalogAssetStatus, string> = {
  missing: "Missing assets",
  partial: "Partial assets",
  complete: "Assets complete",
};

/** Best hero image for a product (variant override optional). */
export function productCatalogHeroImage(
  item: ProductCatalogItem,
  variant?: ProductCatalogVariant | null
): string | undefined {
  return (
    variant?.imageUrl ||
    variant?.installedImageUrl ||
    item.imageUrl ||
    item.installedImageUrl ||
    item.gallery?.[0] ||
    item.comboPhotoUrls?.[0] ||
    item.variants?.find((v) => v.imageUrl)?.imageUrl
  );
}

/** Searchable haystack for a catalog item (incl. variants). */
export function productCatalogSearchText(item: ProductCatalogItem): string {
  const parts = [
    item.name,
    item.brand,
    item.series,
    item.type,
    item.suggestedUse,
    item.material,
    item.esfCode,
    item.description,
    item.notes,
    ...(item.availableColors ?? []),
    ...(item.variants ?? []).flatMap((v) => [
      v.colorName,
      v.finishName,
      v.catalogNumber,
      v.notes,
    ]),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function productCatalogMatchesTag(item: ProductCatalogItem, tag: ProductCatalogTagFilter): boolean {
  const hay = productCatalogSearchText(item);
  switch (tag) {
    case "kitchen":
      return hay.includes("kitchen") || item.suggestedUse?.toLowerCase().includes("kitchen") === true;
    case "vanity":
      return hay.includes("vanity") || hay.includes("bathroom") || item.suggestedUse?.toLowerCase().includes("vanity") === true;
    case "composite":
      return item.material?.toLowerCase().includes("composite") === true || hay.includes("blanco") || hay.includes("silgranit");
    case "steel":
      return item.material?.toLowerCase().includes("stainless") === true || hay.includes("steel");
    case "single_bowl":
      return item.type?.toLowerCase().includes("single") === true;
    case "double_bowl":
      return item.type?.toLowerCase().includes("double") === true || hay.includes("50/50") || hay.includes("60/40");
    case "faucet":
      return item.category === "faucet" && item.type !== "Accessory";
    case "specialty":
      return item.category === "specialty_add_on";
    case "accessory":
      return item.type?.toLowerCase().includes("accessory") === true;
    default:
      return true;
  }
}

export function filterProductCatalogItems(
  items: ProductCatalogItem[],
  opts: {
    category: ProductCatalogCategoryFilter;
    search: string;
    tags: ProductCatalogTagFilter[];
    assetStatus: ProductCatalogAssetFilter;
  }
): ProductCatalogItem[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (!item.active) return false;
    if (opts.category !== "all" && item.category !== opts.category) return false;
    if (opts.assetStatus !== "all" && item.assetStatus !== opts.assetStatus) return false;
    if (opts.tags.length > 0 && !opts.tags.every((t) => productCatalogMatchesTag(item, t))) return false;
    if (q && !productCatalogSearchText(item).includes(q)) return false;
    return true;
  });
}

export function productCatalogCounts(items: ProductCatalogItem[]) {
  const active = items.filter((i) => i.active);
  return {
    total: active.length,
    sinks: active.filter((i) => i.category === "sink").length,
    faucets: active.filter((i) => i.category === "faucet").length,
    specialty: active.filter((i) => i.category === "specialty_add_on").length,
    missingAssets: active.filter((i) => i.assetStatus === "missing").length,
  };
}
