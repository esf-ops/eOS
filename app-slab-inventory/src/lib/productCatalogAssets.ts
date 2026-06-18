/**
 * Product Catalog — manual asset override layer
 * ==============================================
 *
 * Flow:
 *   1. Workbook → `productCatalogData.ts` (generated; never edit for images)
 *   2. This file → optional image/spec URL overrides (curated, version-controlled)
 *   3. UI merges overrides at render time via `mergeProductCatalogAssets`
 *
 * Drop files under `app-slab-inventory/public/product-catalog/…` using the paths
 * defined here. Until files exist, the UI shows polished placeholders on load failure.
 *
 * Future: Supabase Storage / catalog table can replace static overrides.
 * No pricing, quote integration, or backend coupling.
 */
import { PRODUCT_CATALOG_ITEMS } from "./productCatalogData";
import type {
  ProductCatalogAssetStatus,
  ProductCatalogItem,
  ProductCatalogVariant,
} from "./productCatalog";

export type ProductCatalogAssetOverride = {
  productId: string;
  imageUrl?: string;
  gallery?: string[];
  installedImageUrl?: string;
  comboPhotoUrls?: string[];
  diagramUrl?: string;
  finishExampleUrls?: string[];
  specSheetUrl?: string;
  /** variant id → public URL */
  variantImageUrls?: Record<string, string>;
  sourceNotes?: string;
};

function sinkBase(productId: string) {
  return `/product-catalog/sinks/${productId}`;
}

function faucetBase(productId: string) {
  return `/product-catalog/faucets/${productId}`;
}

function specSheetUrl(productId: string) {
  return `/product-catalog/spec-sheets/${productId}/${productId}.pdf`;
}

function variantSlug(colorName: string) {
  return String(colorName)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Batch 1 — intended asset paths (files may not exist yet). */
const PRODUCT_CATALOG_ASSET_OVERRIDES: ProductCatalogAssetOverride[] = [
  {
    productId: "blanco-blanco-diamond-50-50",
    imageUrl: `${sinkBase("blanco-blanco-diamond-50-50")}/hero.jpg`,
    diagramUrl: `${sinkBase("blanco-blanco-diamond-50-50")}/diagram.jpg`,
    installedImageUrl: `${sinkBase("blanco-blanco-diamond-50-50")}/installed.jpg`,
    specSheetUrl: specSheetUrl("blanco-blanco-diamond-50-50"),
    comboPhotoUrls: [
      `${sinkBase("blanco-blanco-diamond-50-50")}/combo-01.jpg`,
      `${sinkBase("blanco-blanco-diamond-50-50")}/combo-02.jpg`,
    ],
    variantImageUrls: {
      "blanco-diamond-50-50-440184": `${sinkBase("blanco-blanco-diamond-50-50")}/anthracite.jpg`,
      "blanco-diamond-50-50-440185": `${sinkBase("blanco-blanco-diamond-50-50")}/white.jpg`,
      "blanco-diamond-50-50-441285": `${sinkBase("blanco-blanco-diamond-50-50")}/truffle.jpg`,
      "blanco-diamond-50-50-441470": `${sinkBase("blanco-blanco-diamond-50-50")}/cinder.jpg`,
      "blanco-diamond-50-50-442913": `${sinkBase("blanco-blanco-diamond-50-50")}/coal-black.jpg`,
    },
    sourceNotes:
      "Source: official BLANCO Diamond product pages and spec sheets. Use manufacturer hero, diagram, and finish swatches — not third-party pricing pages.",
  },
  {
    productId: "blanco-blanco-precis-super-single-sinks",
    imageUrl: `${sinkBase("blanco-blanco-precis-super-single-sinks")}/hero.jpg`,
    diagramUrl: `${sinkBase("blanco-blanco-precis-super-single-sinks")}/diagram.jpg`,
    specSheetUrl: specSheetUrl("blanco-blanco-precis-super-single-sinks"),
    variantImageUrls: {
      "blanco-precis-super-single-sinks-440147": `${sinkBase("blanco-blanco-precis-super-single-sinks")}/anthracite.jpg`,
      "blanco-precis-super-single-sinks-440150": `${sinkBase("blanco-blanco-precis-super-single-sinks")}/white.jpg`,
      "blanco-precis-super-single-sinks-441297": `${sinkBase("blanco-blanco-precis-super-single-sinks")}/truffle.jpg`,
    },
    sourceNotes:
      "Source: official BLANCO Precis Super Single product pages and spec sheets.",
  },
  {
    productId: "faucet-delta-9176-cz-pr-dst",
    imageUrl: `${faucetBase("faucet-delta-9176-cz-pr-dst")}/hero.jpg`,
    diagramUrl: `${faucetBase("faucet-delta-9176-cz-pr-dst")}/diagram.jpg`,
    specSheetUrl: specSheetUrl("faucet-delta-9176-cz-pr-dst"),
    sourceNotes:
      "Source: official Delta 9176 product/spec assets (Stryke pull-down kitchen faucet). Exclude any pricing or retailer quote pages.",
  },
  {
    productId: "faucet-deltarp101629czpr",
    imageUrl: `${faucetBase("faucet-deltarp101629czpr")}/hero.jpg`,
    specSheetUrl: specSheetUrl("faucet-deltarp101629czpr"),
    sourceNotes:
      "Source: official Delta RP101629 soap/lotion dispenser spec assets.",
  },
  {
    productId: "faucet-moen-7864srs",
    imageUrl: `${faucetBase("faucet-moen-7864srs")}/hero.jpg`,
    diagramUrl: `${faucetBase("faucet-moen-7864srs")}/diagram.jpg`,
    specSheetUrl: specSheetUrl("faucet-moen-7864srs"),
    sourceNotes:
      "Source: official Moen 7864SRS Sleek pull-down kitchen faucet product/spec assets.",
  },
  {
    productId: "kansas-1512um18-2",
    imageUrl: `${sinkBase("kansas-1512um18-2")}/hero.jpg`,
    diagramUrl: `${sinkBase("kansas-1512um18-2")}/diagram.jpg`,
    installedImageUrl: `${sinkBase("kansas-1512um18-2")}/installed.jpg`,
    specSheetUrl: specSheetUrl("kansas-1512um18-2"),
    sourceNotes:
      "Source: KDC showroom PDF / Kansas Winsinks program references first; supplement with manufacturer cut sheets if available.",
  },
];

const OVERRIDE_BY_ID = new Map(
  PRODUCT_CATALOG_ASSET_OVERRIDES.map((o) => [o.productId, o])
);

export function getProductCatalogAssetOverride(productId: string): ProductCatalogAssetOverride | undefined {
  return OVERRIDE_BY_ID.get(productId);
}

function mergeVariants(
  variants: ProductCatalogVariant[] | undefined,
  variantImageUrls: Record<string, string> | undefined
): ProductCatalogVariant[] | undefined {
  if (!variants?.length) return variants;
  if (!variantImageUrls || !Object.keys(variantImageUrls).length) return variants;
  return variants.map((v) => ({
    ...v,
    imageUrl: variantImageUrls[v.id] ?? v.imageUrl,
  }));
}

function computeAssetStatusFromUrls(item: Pick<
  ProductCatalogItem,
  | "imageUrl"
  | "installedImageUrl"
  | "diagramUrl"
  | "specSheetUrl"
  | "gallery"
  | "comboPhotoUrls"
  | "finishExampleUrls"
  | "variants"
>): ProductCatalogAssetStatus {
  const urls = [
    item.imageUrl,
    item.installedImageUrl,
    item.diagramUrl,
    item.specSheetUrl,
    ...(item.gallery ?? []),
    ...(item.comboPhotoUrls ?? []),
    ...(item.finishExampleUrls ?? []),
    ...(item.variants ?? []).flatMap((v) => [v.imageUrl, v.installedImageUrl, v.comboPhotoUrl].filter(Boolean)),
  ].filter(Boolean);

  if (urls.length === 0) return "missing";

  const hasHero = Boolean(item.imageUrl || item.variants?.some((v) => v.imageUrl));
  const hasSpec = Boolean(item.diagramUrl || item.specSheetUrl);
  const hasGallery = Boolean(
    item.installedImageUrl ||
    (item.comboPhotoUrls?.length ?? 0) > 0 ||
    (item.gallery?.length ?? 0) > 0 ||
    (item.finishExampleUrls?.length ?? 0) > 0
  );

  if (hasHero && (hasSpec || hasGallery)) return "partial";
  return "partial";
}

/**
 * Merge a generated catalog item with its optional asset override.
 * Override fields win when present; variant images merge by variant id.
 */
export function mergeProductCatalogAssets(item: ProductCatalogItem): ProductCatalogItem {
  const override = getProductCatalogAssetOverride(item.id);
  if (!override) return item;

  const variants = mergeVariants(item.variants, override.variantImageUrls);
  const merged: ProductCatalogItem = {
    ...item,
    imageUrl: override.imageUrl ?? item.imageUrl,
    gallery: override.gallery ?? item.gallery,
    installedImageUrl: override.installedImageUrl ?? item.installedImageUrl,
    comboPhotoUrls: override.comboPhotoUrls ?? item.comboPhotoUrls,
    diagramUrl: override.diagramUrl ?? item.diagramUrl,
    finishExampleUrls: override.finishExampleUrls ?? item.finishExampleUrls,
    specSheetUrl: override.specSheetUrl ?? item.specSheetUrl,
    variants,
    assetSourceNotes: override.sourceNotes,
    assetStatus: "missing",
  };

  merged.assetStatus = computeAssetStatusFromUrls(merged);
  return merged;
}

/** All catalog items with asset overrides applied (use in UI instead of raw generated data). */
export function getProductCatalogItemsWithAssets(): ProductCatalogItem[] {
  return PRODUCT_CATALOG_ITEMS.map(mergeProductCatalogAssets);
}

export { variantSlug };
