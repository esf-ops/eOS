/**
 * Display-only product catalog types and client-side search/filter helpers.
 * Data lives in productCatalogData.ts (generated from the local ESF workbook).
 * No pricing, quote integration, or backend coupling in this pass.
 */

export type ProductCatalogCategory = "sink" | "sink_accessory" | "faucet" | "specialty_add_on";

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
  /** Showroom-friendly display name for cards and modal title */
  name: string;
  /** Raw workbook product text */
  originalName?: string;
  /** Full source line for search and modal reference */
  sourceDescription?: string;
  sku?: string;
  model?: string;
  specSummary?: string;
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
  /** Curated asset collection notes from productCatalogAssets.ts (not generated workbook). */
  assetSourceNotes?: string;
  sourceSheet?: string;
  active: boolean;
};

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

/** Visible catalog tabs — exactly four categories, no "All". */
export const PRODUCT_CATALOG_TABS: ProductCatalogCategory[] = [
  "sink",
  "sink_accessory",
  "faucet",
  "specialty_add_on",
];

export const PRODUCT_CATALOG_CATEGORY_LABELS: Record<ProductCatalogCategory, string> = {
  sink: "Sinks",
  sink_accessory: "Sink Accessories",
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

/** Normalize finish/color names for grouping duplicate variant rows. */
export function normalizeFinishName(name: string): string {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type ProductCatalogFinishOption = {
  /** Stable key from normalizeFinishName(label) */
  key: string;
  label: string;
  variantIds: string[];
  catalogNumbers: string[];
  imageUrl?: string;
  swatchColor?: string;
};

/** One finish/color option — not one chip per catalog article number. */
export function getUniqueFinishOptions(item: ProductCatalogItem): ProductCatalogFinishOption[] {
  if (!item.variants?.length) return [];

  const map = new Map<string, ProductCatalogFinishOption>();

  for (const v of item.variants) {
    const raw = v.colorName || v.finishName;
    const key = raw ? normalizeFinishName(raw) : v.catalogNumber ? `cat-${v.catalogNumber}` : v.id;
    const label = raw || v.catalogNumber || "Option";

    const existing = map.get(key);
    if (existing) {
      existing.variantIds.push(v.id);
      if (v.catalogNumber && !existing.catalogNumbers.includes(v.catalogNumber)) {
        existing.catalogNumbers.push(v.catalogNumber);
      }
      if (!existing.imageUrl && v.imageUrl) existing.imageUrl = v.imageUrl;
      if (!existing.swatchColor && v.swatchColor) existing.swatchColor = v.swatchColor;
    } else {
      map.set(key, {
        key,
        label,
        variantIds: [v.id],
        catalogNumbers: v.catalogNumber ? [v.catalogNumber] : [],
        imageUrl: v.imageUrl,
        swatchColor: v.swatchColor,
      });
    }
  }

  return Array.from(map.values());
}

/** Variant image for a grouped finish, if any variant in the group has one. */
export function getVariantImageForFinish(
  item: ProductCatalogItem,
  finishKey: string
): string | undefined {
  const option = getUniqueFinishOptions(item).find((o) => o.key === finishKey);
  if (option?.imageUrl) return option.imageUrl;

  const variants =
    item.variants?.filter((v) => {
      const raw = v.colorName || v.finishName;
      const key = raw ? normalizeFinishName(raw) : v.catalogNumber ? `cat-${v.catalogNumber}` : v.id;
      return key === finishKey;
    }) ?? [];

  for (const v of variants) {
    if (v.imageUrl) return v.imageUrl;
  }
  return undefined;
}

export function getCatalogNumbersForFinish(
  item: ProductCatalogItem,
  finishKey: string
): string[] {
  return getUniqueFinishOptions(item).find((o) => o.key === finishKey)?.catalogNumbers ?? [];
}

/** All image URLs declared on a catalog item (for runtime load tracking). */
export function productCatalogImageUrls(item: ProductCatalogItem): string[] {
  const urls = new Set<string>();
  const add = (u?: string) => {
    if (u) urls.add(u);
  };

  add(item.imageUrl);
  add(item.installedImageUrl);
  add(item.diagramUrl);
  (item.gallery ?? []).forEach(add);
  (item.comboPhotoUrls ?? []).forEach(add);
  (item.finishExampleUrls ?? []).forEach(add);
  (item.variants ?? []).forEach((v) => {
    add(v.imageUrl);
    add(v.installedImageUrl);
    add(v.comboPhotoUrl);
  });

  return Array.from(urls);
}

/** Runtime asset status after images attempt to load in the modal. */
export function productCatalogDisplayAssetStatus(
  item: ProductCatalogItem,
  loaded: ReadonlySet<string>,
  failed: ReadonlySet<string>
): ProductCatalogAssetStatus {
  const imageUrls = productCatalogImageUrls(item);
  const hasLoadedImage = imageUrls.some((u) => loaded.has(u));

  if (!hasLoadedImage) {
    if (imageUrls.length === 0) return "missing";
    const allFailed = imageUrls.every((u) => failed.has(u));
    if (allFailed) return item.specSheetUrl ? "partial" : "missing";
    return item.assetStatus;
  }

  const heroLoaded = Boolean(item.imageUrl && loaded.has(item.imageUrl));
  const finishLoaded = (item.variants ?? []).some((v) => v.imageUrl && loaded.has(v.imageUrl));
  const diagramLoaded = Boolean(item.diagramUrl && loaded.has(item.diagramUrl));
  const installedLoaded = Boolean(item.installedImageUrl && loaded.has(item.installedImageUrl));
  const galleryLoaded =
    (item.gallery ?? []).some((u) => loaded.has(u)) ||
    (item.comboPhotoUrls ?? []).some((u) => loaded.has(u));

  if ((heroLoaded || finishLoaded) && (diagramLoaded || installedLoaded || galleryLoaded || item.specSheetUrl)) {
    return "complete";
  }

  return "partial";
}

/** Searchable haystack for a catalog item (incl. variants and source text). */
export function productCatalogSearchText(item: ProductCatalogItem): string {
  const parts = [
    item.name,
    item.originalName,
    item.sourceDescription,
    item.sku,
    item.model,
    item.specSummary,
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
      return item.category === "sink_accessory" || item.type?.toLowerCase().includes("accessory") === true;
    default:
      return true;
  }
}

export function filterProductCatalogItems(
  items: ProductCatalogItem[],
  opts: {
    category: ProductCatalogCategory;
    search: string;
    tags: ProductCatalogTagFilter[];
    assetStatus: ProductCatalogAssetFilter;
  }
): ProductCatalogItem[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (!item.active) return false;
    if (item.category !== opts.category) return false;
    if (opts.assetStatus !== "all" && item.assetStatus !== opts.assetStatus) return false;
    if (opts.tags.length > 0 && !opts.tags.every((t) => productCatalogMatchesTag(item, t))) return false;
    if (q && !productCatalogSearchText(item).includes(q)) return false;
    return true;
  });
}

export function productCatalogCounts(items: ProductCatalogItem[]) {
  const active = items.filter((i) => i.active);
  return {
    sinks: active.filter((i) => i.category === "sink").length,
    sinkAccessories: active.filter((i) => i.category === "sink_accessory").length,
    faucets: active.filter((i) => i.category === "faucet").length,
    specialty: active.filter((i) => i.category === "specialty_add_on").length,
    missingAssets: active.filter((i) => i.assetStatus === "missing").length,
  };
}

export function productCatalogCountForCategory(
  items: ProductCatalogItem[],
  category: ProductCatalogCategory
): number {
  return items.filter((i) => i.active && i.category === category).length;
}
