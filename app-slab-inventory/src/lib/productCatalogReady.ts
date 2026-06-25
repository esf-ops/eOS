/**
 * Product Catalog — showroom visibility (catalog-ready) helpers.
 */
import { isHeroOnlyCatalogSinkId } from "./productCatalogHeroOnlySinkAssets";
import { usesSinkFolderResolver } from "./productCatalogBlancoSinkAssets";
import { getProductCatalogAssetOverride } from "./productCatalogAssets";
import {
  getProductHeroImageCandidates,
  type ProductCatalogItem,
} from "./productCatalog";

/** Display image URL candidates from the resolved asset pipeline (excludes spec sheets). */
export function getProductCatalogDisplayImageCandidates(item: ProductCatalogItem): string[] {
  const urls = new Set<string>();
  const add = (url?: string) => {
    if (url?.trim()) urls.add(url.trim());
  };

  // Hero resolver order (e.g. Kansas hero.jpg → hero.png) — any candidate counts as catalog-ready.
  for (const url of getProductHeroImageCandidates(item)) add(url);
  add(item.imageUrl);
  for (const url of Object.values(item.finishImageUrls ?? {})) add(url);
  for (const v of item.variants ?? []) add(v.imageUrl);
  add(item.gallery?.[0]);
  add(item.comboPhotoUrls?.[0]);

  return [...urls];
}

/**
 * Showroom-ready: at least one display image candidate from the asset pipeline.
 * Spec sheet alone is not sufficient. Folder-resolved sinks require a published override row.
 */
export function isProductCatalogItemReady(item: ProductCatalogItem): boolean {
  if (!item.active) return false;
  if (getProductCatalogDisplayImageCandidates(item).length === 0) return false;

  if (
    usesSinkFolderResolver(item.id, item.category) ||
    isHeroOnlyCatalogSinkId(item.id, item.category)
  ) {
    return Boolean(getProductCatalogAssetOverride(item.id));
  }

  return true;
}

export function filterCatalogReadyItems(items: ProductCatalogItem[]): ProductCatalogItem[] {
  return items.filter(isProductCatalogItemReady);
}
