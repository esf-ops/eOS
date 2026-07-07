/**
 * Display-only product catalog types and client-side search/filter helpers.
 * Data lives in productCatalogData.ts (generated from the local ESF workbook).
 * No pricing, quote integration, or backend coupling in this pass.
 */

import {
  blancoSinkFinishCandidates,
  blancoSinkHeroCandidates,
  isBlancoCatalogSinkId,
  isHeroFirstSinkPresentation,
} from "./productCatalogBlancoSinkAssets";
import {
  heroOnlySinkHeroCandidates,
  isHeroOnlyCatalogSinkId,
} from "./productCatalogHeroOnlySinkAssets";
import { faucetHeroCandidates } from "./productCatalogFaucetAssets";

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
  /** Installed lifestyle shots (installed.jpg, installed2.jpg, …) for modal thumbnails. */
  installedGalleryUrls?: string[];
  comboPhotoUrls?: string[];
  diagramUrl?: string;
  finishExampleUrls?: string[];
  specSheetUrl?: string;
  /** Finish slug → public URL (from asset overrides). */
  finishImageUrls?: Record<string, string>;
  /** Default finish slug for modal selection (hero stays `imageUrl`). */
  defaultFinishKey?: string;
  /** Generated catalog product id when this row is a presentation split */
  catalogSourceId?: string;
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

/** Public showroom tab labels (Accessories vs Sink Accessories). */
export const PUBLIC_PRODUCT_CATALOG_TAB_LABELS: Record<ProductCatalogCategory, string> = {
  sink: "Sinks",
  sink_accessory: "Accessories",
  faucet: "Faucets",
  specialty_add_on: "Specialty",
};

/** Fixed public tabs — Specialty is appended only when catalog-ready items exist. */
export const PUBLIC_PRODUCT_CATALOG_TAB_ORDER: ProductCatalogCategory[] = [
  "sink",
  "faucet",
  "sink_accessory",
];

export const PRODUCT_CATALOG_ASSET_LABELS: Record<ProductCatalogAssetStatus, string> = {
  missing: "Missing assets",
  partial: "Partial assets",
  complete: "Assets complete",
};

/** Best hero image for a product (variant/finish override optional). Never uses installed shots. */
export function productCatalogHeroImage(
  item: ProductCatalogItem,
  variant?: ProductCatalogVariant | null,
  finishKey?: string | null
): string | undefined {
  if (finishKey) {
    const finishImage = getFinishImageForFinish(item, finishKey);
    if (finishImage) return finishImage;
  }
  return (
    variant?.imageUrl ||
    item.imageUrl ||
    item.gallery?.[0] ||
    item.comboPhotoUrls?.[0] ||
    item.variants?.find((v) => v.imageUrl)?.imageUrl
  );
}

/** Slug key for finish/color labels — matches public asset filenames (e.g. cafe-brown). */
export function finishKeyFromLabel(name: string): string {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
  /** Stable slug key (finishKeyFromLabel) for finishImageUrls lookup */
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
    const groupKey = raw ? normalizeFinishName(raw) : v.catalogNumber ? `cat-${v.catalogNumber}` : v.id;
    const slugKey = raw ? finishKeyFromLabel(raw) : v.catalogNumber ? `cat-${v.catalogNumber}` : v.id;
    const label = raw || v.catalogNumber || "Option";

    const finishOverrideUrl = item.finishImageUrls?.[slugKey];
    const variantUrl = v.imageUrl;

    const existing = map.get(groupKey);
    if (existing) {
      existing.variantIds.push(v.id);
      if (v.catalogNumber && !existing.catalogNumbers.includes(v.catalogNumber)) {
        existing.catalogNumbers.push(v.catalogNumber);
      }
      if (!existing.imageUrl) {
        existing.imageUrl = finishOverrideUrl ?? variantUrl;
      }
      if (!existing.swatchColor && v.swatchColor) existing.swatchColor = v.swatchColor;
    } else {
      map.set(groupKey, {
        key: slugKey,
        label,
        variantIds: [v.id],
        catalogNumbers: v.catalogNumber ? [v.catalogNumber] : [],
        imageUrl: finishOverrideUrl ?? variantUrl,
        swatchColor: v.swatchColor,
      });
    }
  }

  return Array.from(map.values());
}

export function getFinishImageCandidatesForFinish(
  item: ProductCatalogItem,
  finishKey: string
): string[] {
  if (isBlancoCatalogSinkId(item.id, item.category)) {
    return blancoSinkFinishCandidates(item.id, finishKey);
  }
  const single = getFinishImageForFinish(item, finishKey);
  return single ? [single] : [];
}

export function getProductHeroImageCandidates(item: ProductCatalogItem): string[] {
  if (isBlancoCatalogSinkId(item.id, item.category)) {
    return blancoSinkHeroCandidates(item.id);
  }
  if (isHeroOnlyCatalogSinkId(item.id, item.category)) {
    return heroOnlySinkHeroCandidates(item.id);
  }
  if (
    item.category === "faucet" &&
    (item.id.startsWith("faucet-delta-") || item.id.startsWith("faucet-moen-"))
  ) {
    const faucetUrls = faucetHeroCandidates(item);
    if (faucetUrls.length) return faucetUrls;
  }
  const hero = productCatalogHeroImage(item);
  return hero ? [hero] : [];
}

/**
 * Finish image resolution priority:
 * 1. finishImageUrls[finishKey]
 * 2. variant imageUrl for matching finish group
 * 3. undefined (caller may fall back to product imageUrl)
 */
export function getFinishImageForFinish(
  item: ProductCatalogItem,
  finishKey: string
): string | undefined {
  if (item.finishImageUrls?.[finishKey]) return item.finishImageUrls[finishKey];

  const option = getUniqueFinishOptions(item).find((o) => o.key === finishKey);
  if (option?.imageUrl) return option.imageUrl;

  const variants =
    item.variants?.filter((v) => {
      const raw = v.colorName || v.finishName;
      const slugKey = raw ? finishKeyFromLabel(raw) : v.catalogNumber ? `cat-${v.catalogNumber}` : v.id;
      return slugKey === finishKey;
    }) ?? [];

  for (const v of variants) {
    if (v.imageUrl) return v.imageUrl;
  }
  return undefined;
}

/** @deprecated Use getFinishImageForFinish — kept for call-site compatibility. */
export function getVariantImageForFinish(
  item: ProductCatalogItem,
  finishKey: string
): string | undefined {
  return getFinishImageForFinish(item, finishKey);
}

export function getCatalogNumbersForFinish(
  item: ProductCatalogItem,
  finishKey: string
): string[] {
  return getUniqueFinishOptions(item).find((o) => o.key === finishKey)?.catalogNumbers ?? [];
}

/** Default finish slug when opening the product modal. */
export function defaultFinishKeyForItem(item: ProductCatalogItem): string | null {
  if (isHeroFirstSinkPresentation(item.id) || isHeroOnlyCatalogSinkId(item.id, item.category)) {
    return null;
  }

  const preferred = item.defaultFinishKey?.trim();
  const options = getUniqueFinishOptions(item);
  if (preferred && options.some((o) => o.key === preferred)) return preferred;
  if (preferred && item.finishImageUrls?.[preferred]) return preferred;
  return options[0]?.key ?? preferred ?? null;
}

/**
 * Large modal preview URL.
 * Priority: active gallery thumb → selected/default finish image → product hero.
 * When a finish is explicitly selected, never substitute a different finish hero.
 */
export function resolveProductCatalogStageUrl(
  item: ProductCatalogItem,
  selectedFinishKey: string | null,
  activeGalleryUrl: string | null,
  isUrlAllowed: (url?: string) => boolean
): string | undefined {
  if (activeGalleryUrl && isUrlAllowed(activeGalleryUrl)) {
    return activeGalleryUrl;
  }

  const finishKey = selectedFinishKey ?? item.defaultFinishKey ?? null;

  if (finishKey) {
    for (const url of getFinishImageCandidatesForFinish(item, finishKey)) {
      if (isUrlAllowed(url)) return url;
    }
    if (selectedFinishKey ?? item.defaultFinishKey) {
      return undefined;
    }
  }

  for (const url of getProductHeroImageCandidates(item)) {
    if (isUrlAllowed(url)) return url;
  }

  for (const opt of getUniqueFinishOptions(item)) {
    for (const url of getFinishImageCandidatesForFinish(item, opt.key)) {
      if (isUrlAllowed(url)) return url;
    }
  }

  return undefined;
}

/** All image URLs declared on a catalog item (for runtime load tracking). */
export function productCatalogImageUrls(item: ProductCatalogItem): string[] {
  const urls = new Set<string>();
  const add = (u?: string) => {
    if (u) urls.add(u);
  };

  add(item.imageUrl);
  add(item.installedImageUrl);
  (item.installedGalleryUrls ?? []).forEach(add);
  add(item.diagramUrl);
  Object.values(item.finishImageUrls ?? {}).forEach(add);
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
  const finishLoaded =
    Object.values(item.finishImageUrls ?? {}).some((u) => loaded.has(u)) ||
    (item.variants ?? []).some((v) => v.imageUrl && loaded.has(v.imageUrl));
  const diagramLoaded = Boolean(item.diagramUrl && loaded.has(item.diagramUrl));
  const installedLoaded = Boolean(item.installedImageUrl && loaded.has(item.installedImageUrl));
  const galleryLoaded =
    (item.gallery ?? []).some((u) => loaded.has(u)) ||
    (item.comboPhotoUrls ?? []).some((u) => loaded.has(u));

  if ((heroLoaded || finishLoaded) && (item.specSheetUrl || installedLoaded || diagramLoaded || galleryLoaded)) {
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
    item.catalogSourceId,
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
  category: ProductCatalogCategory,
  opts?: { catalogReadyOnly?: boolean; isReady?: (item: ProductCatalogItem) => boolean }
): number {
  return items.filter((i) => {
    if (!i.active || i.category !== category) return false;
    if (opts?.catalogReadyOnly && opts.isReady && !opts.isReady(i)) return false;
    return true;
  }).length;
}

export function publicProductCatalogTabsForItems(items: ProductCatalogItem[]): ProductCatalogCategory[] {
  const tabs = [...PUBLIC_PRODUCT_CATALOG_TAB_ORDER];
  if (productCatalogCountForCategory(items, "specialty_add_on") > 0) {
    tabs.push("specialty_add_on");
  }
  return tabs;
}

export type ProductCatalogManufacturerGroup = {
  brand: string;
  items: ProductCatalogItem[];
};

const MANUFACTURER_GROUP_CATEGORIES = new Set<ProductCatalogCategory>(["sink", "faucet"]);

export function productCatalogUsesManufacturerGrouping(category: ProductCatalogCategory): boolean {
  return MANUFACTURER_GROUP_CATEGORIES.has(category);
}

/** Group catalog-ready items by brand (A→Z), products sorted by display name within each group. */
export function groupProductCatalogByManufacturer(
  items: ProductCatalogItem[]
): ProductCatalogManufacturerGroup[] {
  const byBrand = new Map<string, ProductCatalogItem[]>();

  for (const item of items) {
    const brand = item.brand?.trim() || "Other";
    const list = byBrand.get(brand) ?? [];
    list.push(item);
    byBrand.set(brand, list);
  }

  const sortName = (a: ProductCatalogItem, b: ProductCatalogItem) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  return [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([brand, groupItems]) => ({
      brand,
      items: [...groupItems].sort(sortName),
    }));
}
