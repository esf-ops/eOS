/**
 * Product Catalog — Delta/Moen faucet folder asset conventions.
 */
import type { ProductCatalogItem } from "./productCatalog";
import { finishKeyFromLabel } from "./productCatalog";
import type { ProductCatalogAssetOverride } from "./productCatalogAssets";

export const FAUCET_FINISH_HERO_ORDER = [
  "matte-black",
  "black",
  "spotshield-stainless",
  "stainless",
  "arctic-stainless",
  "chrome",
  "champagne-bronze",
  "orb",
  "bzg",
  "srs",
] as const;

export function usesFaucetFolderResolver(productId: string, category?: string): boolean {
  if (category !== "faucet") return false;
  const id = productId.toLowerCase();
  return id.startsWith("faucet-delta") || id.startsWith("faucet-moen");
}

export function faucetPublicBase(productId: string): string {
  return `/product-catalog/faucets/${productId}`;
}

export function faucetSpecSheetUrl(productId: string): string {
  return `/product-catalog/spec-sheets/${productId}/${productId}.pdf`;
}

export function pickHeroFromFinishMap(
  finishImageUrls: Record<string, string>,
  defaultFinishKey?: string | null
): string | undefined {
  if (defaultFinishKey && finishImageUrls[defaultFinishKey]) {
    return finishImageUrls[defaultFinishKey];
  }
  for (const key of FAUCET_FINISH_HERO_ORDER) {
    if (finishImageUrls[key]) return finishImageUrls[key];
  }
  return Object.values(finishImageUrls)[0];
}

/** Hero URL candidates for faucet cards/modal (finish-first). */
export function faucetHeroCandidates(item: Pick<ProductCatalogItem, "imageUrl" | "finishImageUrls" | "defaultFinishKey">): string[] {
  const urls: string[] = [];
  const add = (url?: string | null) => {
    if (url?.trim() && !urls.includes(url.trim())) urls.push(url.trim());
  };

  if (item.finishImageUrls && Object.keys(item.finishImageUrls).length > 0) {
    const hero = pickHeroFromFinishMap(item.finishImageUrls, item.defaultFinishKey);
    add(hero);
    for (const key of FAUCET_FINISH_HERO_ORDER) add(item.finishImageUrls[key]);
    for (const url of Object.values(item.finishImageUrls)) add(url);
  }
  add(item.imageUrl);
  return urls;
}

/**
 * Resolve faucet folder assets from published override rows.
 * Paths only — runtime img load determines availability.
 */
export function resolveFaucetFolderAssets(
  productId: string,
  category?: string,
  override?: ProductCatalogAssetOverride | null
): Partial<ProductCatalogAssetOverride> | null {
  if (!usesFaucetFolderResolver(productId, category)) return null;

  const finishImageUrls = override?.finishImageUrls;
  const hasFinishMap = finishImageUrls && Object.keys(finishImageUrls).length > 0;

  if (hasFinishMap) {
    const imageUrl = override?.imageUrl ?? pickHeroFromFinishMap(finishImageUrls!, override?.defaultFinishKey);
    return {
      imageUrl,
      finishImageUrls,
      defaultFinishKey: override?.defaultFinishKey ?? (imageUrl ? finishKeyFromLabel(imageUrl.split("/").pop()?.replace(/\.\w+$/, "") ?? "") : undefined),
      specSheetUrl: override?.specSheetUrl ?? faucetSpecSheetUrl(productId),
    };
  }

  // Legacy hero.jpg overrides (pre-import)
  const base = faucetPublicBase(productId);
  return {
    imageUrl: override?.imageUrl ?? `${base}/hero.jpg`,
    diagramUrl: override?.diagramUrl ?? `${base}/diagram.jpg`,
    specSheetUrl: override?.specSheetUrl ?? faucetSpecSheetUrl(productId),
  };
}

export function getFaucetFinishImageCandidates(
  productId: string,
  finishKey: string
): string[] {
  const base = faucetPublicBase(productId);
  const slug = finishKeyFromLabel(finishKey);
  return [`${base}/${slug}.png`, `${base}/${slug}.jpg`];
}
