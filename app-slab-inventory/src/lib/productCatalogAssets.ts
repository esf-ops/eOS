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
import { applyProductCatalogDisplaySplits, applyProductCatalogDisplayNames } from "./productCatalogDisplay";
import {
  blancoSinkFinishCandidates,
  blancoSinkHeroCandidates,
  resolveBlancoSinkFolderAssets,
} from "./productCatalogBlancoSinkAssets";
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
  installedGalleryUrls?: string[];
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

/** Batch 1 — source notes and non-BLANCO asset paths. BLANCO sink image URLs resolve from item.id folders. */
const PRODUCT_CATALOG_ASSET_OVERRIDES: ProductCatalogAssetOverride[] = [
  {
    productId: "blanco-blanco-diamond-50-50-regular-divide",
    sourceNotes:
      "Source: official BLANCO Diamond 50/50 Regular Divide product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-diamond-50-50-low-divide",
    sourceNotes:
      "Source: official BLANCO Diamond 50/50 Low Divide product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-50-50-sinks",
    sourceNotes:
      "Source: official BLANCO Precis 50/50 product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-60-40-sinks-regular-divide",
    sourceNotes:
      "Source: official BLANCO Precis 60/40 Regular Divide product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-60-40-sinks-low-divide",
    sourceNotes:
      "Source: official BLANCO Precis 60/40 Low Divide product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-super-single-sinks",
    sourceNotes:
      "Source: official BLANCO Precis Super Single product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-super-single",
    sourceNotes:
      "Source: official BLANCO Super Single product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-diamond-60-40-sinks-regular-divide",
    sourceNotes:
      "Source: official BLANCO Diamond 60/40 Regular Divide product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-diamond-60-40-sinks-low-divide",
    sourceNotes:
      "Source: official BLANCO Diamond 60/40 Low Divide product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-diamond-small-bar-sinks",
    sourceNotes:
      "Source: official BLANCO Diamond Small Bar product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-21-sinks",
    sourceNotes:
      "Source: official BLANCO Precis 21 product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-24-sink",
    sourceNotes:
      "Source: official BLANCO Precis 24 product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-27-sinks",
    sourceNotes:
      "Source: official BLANCO Precis 27 product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-30-single-bowl",
    sourceNotes:
      "Source: official BLANCO Precis 30 Single Bowl product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-precis-bar-sinks",
    sourceNotes:
      "Source: official BLANCO Precis Bar product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-liven-laundry-12-depth",
    sourceNotes:
      "Source: official BLANCO Liven Laundry product pages and spec sheets.",
  },
  {
    productId: "blanco-blanco-ikon-apron-front-single-bowl",
    sourceNotes:
      "Source: official BLANCO Ikon Apron Front Single Bowl product pages and spec sheets.",
  },
  {
    productId: "blanco-inteos-33-workstation",
    sourceNotes:
      "Source: official BLANCO Inteos 33\" Workstation product pages and spec sheets.",
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
  | "installedGalleryUrls"
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
    ...(item.installedGalleryUrls ?? []),
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
  const hasInstalled =
    Boolean(item.installedImageUrl) || (item.installedGalleryUrls ?? []).length > 0;

  if (hasHero && hasFinishImages && hasSpec) return "complete";
  if (hasHero || hasFinishImages || hasSpec || hasInstalled) return "partial";
  return "missing";
}

/**
 * Merge a generated catalog item with its optional asset override.
 * Override fields win when present; variant images merge by variant id.
 */
export function mergeProductCatalogAssets(item: ProductCatalogItem): ProductCatalogItem {
  const folderAssets = resolveBlancoSinkFolderAssets(item.id, item.category);
  const explicit = getProductCatalogAssetOverride(item.id);
  if (!folderAssets && !explicit) return item;

  const override = {
    ...folderAssets,
    ...explicit,
    ...(folderAssets
      ? {
          imageUrl: folderAssets.imageUrl,
          finishImageUrls: folderAssets.finishImageUrls,
          defaultFinishKey: folderAssets.defaultFinishKey,
          installedImageUrl: folderAssets.installedImageUrl,
          installedGalleryUrls: folderAssets.installedGalleryUrls,
          specSheetUrl: folderAssets.specSheetUrl,
        }
      : {}),
  };

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
    installedGalleryUrls: override.installedGalleryUrls ?? item.installedGalleryUrls,
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

/** All catalog items with asset overrides and presentation splits applied. */
export function getProductCatalogItemsWithAssets(): ProductCatalogItem[] {
  const merged = PRODUCT_CATALOG_ITEMS.map(mergeProductCatalogAssets);
  const named = applyProductCatalogDisplayNames(merged);
  return applyProductCatalogDisplaySplits(named, mergeProductCatalogAssets);
}

export { finishKeyFromLabel as variantSlug } from "./productCatalog";
export {
  blancoSinkFinishCandidates,
  blancoSinkFinishImageUrls,
  blancoSinkHeroCandidates,
  blancoSinkHeroUrl,
  resolveBlancoSinkFolderAssets,
} from "./productCatalogBlancoSinkAssets";
