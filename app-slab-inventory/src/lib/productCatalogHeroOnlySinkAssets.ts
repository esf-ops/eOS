/**
 * Hero-only catalog sinks (Kansas Sinks Program) — public folder conventions.
 * One product hero + spec sheet; no BLANCO finish swatches or coal-black defaults.
 */

export function isHeroOnlyCatalogSinkId(productId: string, category?: string) {
  return category === "sink" && productId.startsWith("kansas-");
}

export function heroOnlySinkPublicBase(productId: string) {
  return `/product-catalog/sinks/${productId}`;
}

export function heroOnlySinkHeroCandidates(productId: string): string[] {
  const base = heroOnlySinkPublicBase(productId);
  return [`${base}/hero.jpg`, `${base}/hero.png`];
}

export function heroOnlySinkHeroUrl(productId: string) {
  return heroOnlySinkHeroCandidates(productId)[0];
}

export function heroOnlySinkSpecSheetUrl(productId: string) {
  return `/product-catalog/spec-sheets/${productId}/${productId}.pdf`;
}

/** Auto-assign hero + spec from `/product-catalog/sinks/<item.id>/`. */
export function resolveHeroOnlySinkFolderAssets(productId: string, category?: string) {
  if (!isHeroOnlyCatalogSinkId(productId, category)) return null;
  return {
    imageUrl: heroOnlySinkHeroUrl(productId),
    specSheetUrl: heroOnlySinkSpecSheetUrl(productId),
  };
}
