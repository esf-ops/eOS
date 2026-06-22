/**
 * Product Catalog — presentation-layer display splits
 * ====================================================
 *
 * Expands one generated catalog row into multiple showroom cards without
 * editing productCatalogData.ts. Asset overrides and finish images remain
 * keyed by stable display IDs in productCatalogAssets.ts.
 */
import type { ProductCatalogItem, ProductCatalogVariant } from "./productCatalog";

export type ProductCatalogDisplaySplit = {
  /** Stable display card / override id */
  displayId: string;
  /** Generated catalog product id to split (hidden from grid when splits apply) */
  sourceProductId: string;
  displayName: string;
  specSummary?: string;
  /** Keep only variants whose catalog numbers belong to this divide style */
  variantCatalogNumbers: ReadonlySet<string>;
};

/** BLANCO Diamond 50/50 — regular divide catalog articles */
const DIAMOND_5050_REGULAR_CATALOG = new Set([
  "440182",
  "440184",
  "440185",
  "441286",
  "441470",
  "442913",
  "443068",
  "443105",
]);

/** BLANCO Diamond 50/50 — low divide catalog articles */
const DIAMOND_5050_LOW_CATALOG = new Set([
  "440218",
  "440220",
  "440221",
  "441285",
  "442071",
  "442072",
  "442074",
  "442075",
  "442078",
  "442914",
  "443069",
  "443106",
]);

/** BLANCO Diamond 60/40 — regular (standard) divide catalog articles */
const DIAMOND_6040_REGULAR_CATALOG = new Set([
  "440177",
  "440179",
  "440180",
  "440213",
  "441284",
  "441469",
  "442909",
  "443064",
  "443101",
]);

/** BLANCO Diamond 60/40 — low divide catalog articles (44159x series + paired finish SKUs) */
const DIAMOND_6040_LOW_CATALOG = new Set([
  "441590",
  "441591",
  "441593",
  "441596",
  "441597",
  "441598",
  "441600",
  "441603",
  "441608",
  "441609",
  "442910",
  "443065",
  "443102",
]);

export const PRODUCT_CATALOG_DISPLAY_SPLITS: ProductCatalogDisplaySplit[] = [
  {
    displayId: "blanco-blanco-diamond-50-50-regular-divide",
    sourceProductId: "blanco-blanco-diamond-50-50",
    displayName: "DIAMOND 50/50 Regular Divide",
    specSummary: "Model 50/50 · Regular Divide",
    variantCatalogNumbers: DIAMOND_5050_REGULAR_CATALOG,
  },
  {
    displayId: "blanco-blanco-diamond-50-50-low-divide",
    sourceProductId: "blanco-blanco-diamond-50-50",
    displayName: "DIAMOND 50/50 Low Divide",
    specSummary: "Model 50/50 · Low Divide",
    variantCatalogNumbers: DIAMOND_5050_LOW_CATALOG,
  },
  {
    displayId: "blanco-blanco-diamond-60-40-sinks-regular-divide",
    sourceProductId: "blanco-blanco-diamond-60-40-sinks",
    displayName: "DIAMOND 60/40 Regular Divide",
    specSummary: "Model 60/40 · Regular Divide",
    variantCatalogNumbers: DIAMOND_6040_REGULAR_CATALOG,
  },
  {
    displayId: "blanco-blanco-diamond-60-40-sinks-low-divide",
    sourceProductId: "blanco-blanco-diamond-60-40-sinks",
    displayName: "DIAMOND 60/40 Low Divide",
    specSummary: "Model 60/40 · Low Divide",
    variantCatalogNumbers: DIAMOND_6040_LOW_CATALOG,
  },
];

const SPLIT_SOURCE_IDS = new Set(
  PRODUCT_CATALOG_DISPLAY_SPLITS.map((s) => s.sourceProductId)
);

function filterVariants(
  variants: ProductCatalogVariant[] | undefined,
  catalogNumbers: ReadonlySet<string>
): ProductCatalogVariant[] | undefined {
  if (!variants?.length) return variants;
  const filtered = variants.filter((v) =>
    v.catalogNumber ? catalogNumbers.has(v.catalogNumber) : false
  );
  return filtered.length ? filtered : undefined;
}

function colorsFromVariants(variants: ProductCatalogVariant[] | undefined): string[] | undefined {
  if (!variants?.length) return undefined;
  const colors = [
    ...new Set(
      variants
        .map((v) => v.colorName || v.finishName)
        .filter((c): c is string => Boolean(c))
    ),
  ];
  return colors.length ? colors : undefined;
}

function stripMergedAssets(item: ProductCatalogItem): ProductCatalogItem {
  return {
    ...item,
    imageUrl: undefined,
    gallery: undefined,
    installedImageUrl: undefined,
    comboPhotoUrls: undefined,
    diagramUrl: undefined,
    finishExampleUrls: undefined,
    specSheetUrl: undefined,
    finishImageUrls: undefined,
    defaultFinishKey: undefined,
    assetSourceNotes: undefined,
    assetStatus: "missing",
    variants: item.variants?.map((v) => ({ ...v, imageUrl: undefined })),
  };
}

/**
 * Replace split source products with display cards. Call after asset merge so
 * each display id can pick up its own override from productCatalogAssets.ts.
 */
export function applyProductCatalogDisplaySplits(
  items: ProductCatalogItem[],
  mergeAssets: (item: ProductCatalogItem) => ProductCatalogItem
): ProductCatalogItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const displayItems: ProductCatalogItem[] = [];

  for (const split of PRODUCT_CATALOG_DISPLAY_SPLITS) {
    const source = byId.get(split.sourceProductId);
    if (!source) continue;

    const variants = filterVariants(source.variants, split.variantCatalogNumbers);
    const displayBase = stripMergedAssets({
      ...source,
      id: split.displayId,
      name: split.displayName,
      originalName: split.displayName,
      sourceDescription: `${split.displayName} (from ${source.name})`,
      specSummary: split.specSummary ?? source.specSummary,
      catalogSourceId: split.sourceProductId,
      variants,
      availableColors: colorsFromVariants(variants) ?? source.availableColors,
    });

    displayItems.push(mergeAssets(displayBase));
  }

  const hidden = SPLIT_SOURCE_IDS;
  return [...items.filter((item) => !hidden.has(item.id)), ...displayItems];
}

export function getProductCatalogDisplaySplitById(
  displayId: string
): ProductCatalogDisplaySplit | undefined {
  return PRODUCT_CATALOG_DISPLAY_SPLITS.find((s) => s.displayId === displayId);
}
