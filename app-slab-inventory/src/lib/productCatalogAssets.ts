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
import {
  finishKeyFromLabel,
  type ProductCatalogAssetStatus,
  type ProductCatalogItem,
  type ProductCatalogVariant,
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
  /** Finish slug → public URL (preferred over per-variant article mappings). */
  finishImageUrls?: Record<string, string>;
  /** Default finish slug when opening the modal (hero remains `imageUrl`). */
  defaultFinishKey?: string;
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

/** Batch 1 — intended asset paths (files may not exist yet). */
const PRODUCT_CATALOG_ASSET_OVERRIDES: ProductCatalogAssetOverride[] = [
  {
    productId: "blanco-blanco-diamond-50-50",
    imageUrl: `${sinkBase("blanco-blanco-diamond-50-50")}/hero.jpg`,
    installedImageUrl: `${sinkBase("blanco-blanco-diamond-50-50")}/installed.jpg`,
    specSheetUrl: specSheetUrl("blanco-blanco-diamond-50-50"),
    defaultFinishKey: "cafe-brown",
    finishImageUrls: {
      "cafe-brown": `${sinkBase("blanco-blanco-diamond-50-50")}/cafe-brown.jpg`,
      anthracite: `${sinkBase("blanco-blanco-diamond-50-50")}/anthracite.jpg`,
      white: `${sinkBase("blanco-blanco-diamond-50-50")}/white.jpg`,
      truffle: `${sinkBase("blanco-blanco-diamond-50-50")}/truffle.jpg`,
      cinder: `${sinkBase("blanco-blanco-diamond-50-50")}/cinder.jpg`,
      "coal-black": `${sinkBase("blanco-blanco-diamond-50-50")}/coal-black.jpg`,
      "soft-white": `${sinkBase("blanco-blanco-diamond-50-50")}/soft-white.jpg`,
      gray: `${sinkBase("blanco-blanco-diamond-50-50")}/volcano-gray.jpg`,
      "volcano-gray": `${sinkBase("blanco-blanco-diamond-50-50")}/volcano-gray.jpg`,
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
  variantImageUrls: Record<string, string> | undefined,
  finishImageUrls: Record<string, string> | undefined
): ProductCatalogVariant[] | undefined {
  if (!variants?.length) return variants;
  const hasVariantUrls = variantImageUrls && Object.keys(variantImageUrls).length > 0;
  const hasFinishUrls = finishImageUrls && Object.keys(finishImageUrls).length > 0;
  if (!hasVariantUrls && !hasFinishUrls) return variants;

  return variants.map((v) => {
    const finishKey = finishKeyFromLabel(v.colorName || v.finishName || "");
    const finishUrl = finishKey && finishImageUrls?.[finishKey];
    return {
      ...v,
      imageUrl: finishUrl ?? variantImageUrls?.[v.id] ?? v.imageUrl,
    };
  });
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
  | "finishImageUrls"
  | "variants"
>): ProductCatalogAssetStatus {
  const finishUrls = Object.values(item.finishImageUrls ?? {});
  const urls = [
    item.imageUrl,
    item.installedImageUrl,
    item.diagramUrl,
    item.specSheetUrl,
    ...finishUrls,
    ...(item.gallery ?? []),
    ...(item.comboPhotoUrls ?? []),
    ...(item.finishExampleUrls ?? []),
    ...(item.variants ?? []).flatMap((v) => [v.imageUrl, v.installedImageUrl, v.comboPhotoUrl].filter(Boolean)),
  ].filter(Boolean);

  if (urls.length === 0) return "missing";

  const hasHero = Boolean(item.imageUrl);
  const hasFinishImages =
    finishUrls.length > 0 || (item.variants ?? []).some((v) => v.imageUrl);
  const hasSpec = Boolean(item.specSheetUrl);
  const hasInstalled = Boolean(item.installedImageUrl);

  if (hasHero && hasFinishImages && hasSpec) return "complete";
  if (hasHero || hasFinishImages || hasSpec || hasInstalled) return "partial";
  return "missing";
}

/**
 * Merge a generated catalog item with its optional asset override.
 * Override fields win when present; variant images merge by variant id.
 */
export function mergeProductCatalogAssets(item: ProductCatalogItem): ProductCatalogItem {
  const override = getProductCatalogAssetOverride(item.id);
  if (!override) return item;

  const variants = mergeVariants(
    item.variants,
    override.variantImageUrls,
    override.finishImageUrls
  );
  const merged: ProductCatalogItem = {
    ...item,
    imageUrl: override.imageUrl ?? item.imageUrl,
    gallery: override.gallery ?? item.gallery,
    installedImageUrl: override.installedImageUrl ?? item.installedImageUrl,
    comboPhotoUrls: override.comboPhotoUrls ?? item.comboPhotoUrls,
    diagramUrl: override.diagramUrl ?? item.diagramUrl,
    finishExampleUrls: override.finishExampleUrls ?? item.finishExampleUrls,
    specSheetUrl: override.specSheetUrl ?? item.specSheetUrl,
    finishImageUrls: override.finishImageUrls,
    defaultFinishKey: override.defaultFinishKey,
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

export { finishKeyFromLabel as variantSlug } from "./productCatalog";
