/**
 * BLANCO composite sink — public folder asset path conventions.
 * Paths always use the catalog item id (including display split ids).
 */

/** Finish slug → primary on-disk PNG filename. */
export const BLANCO_FINISH_PNG_BY_KEY: Record<string, string> = {
  "cafe-brown": "cafe.png",
  anthracite: "anthracite.png",
  white: "white.png",
  truffle: "truffle.png",
  cinder: "cinder.png",
  "coal-black": "coal-black.png",
  "soft-white": "soft-white.png",
  gray: "volcano-gray.png",
  "volcano-gray": "volcano-gray.png",
};

/** Legacy spaced filenames — same finish only, never cross-finish fallback. */
export const BLANCO_FINISH_LEGACY_SPACED: Partial<Record<string, string>> = {
  "coal-black": "coal black.png",
  "soft-white": "soft white.png",
  gray: "volcano gray.png",
  "volcano-gray": "volcano gray.png",
};

export function blancoSinkPublicBase(productId: string) {
  return `/product-catalog/sinks/${productId}`;
}

export function blancoSinkHeroCandidates(productId: string): string[] {
  const base = blancoSinkPublicBase(productId);
  return [`${base}/coal-black.png`, `${base}/coal black.png`, `${base}/hero.png`];
}

export function blancoSinkHeroUrl(productId: string) {
  return blancoSinkHeroCandidates(productId)[0];
}

export function blancoSinkFinishImageUrls(productId: string): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const key of Object.keys(BLANCO_FINISH_PNG_BY_KEY)) {
    urls[key] = blancoSinkFinishCandidates(productId, key)[0];
  }
  return urls;
}

/** Ordered same-finish candidates (hyphenated PNG, then legacy spaced name). */
export function blancoSinkFinishCandidates(productId: string, finishKey: string): string[] {
  const base = blancoSinkPublicBase(productId);
  const primary = BLANCO_FINISH_PNG_BY_KEY[finishKey];
  const legacy = BLANCO_FINISH_LEGACY_SPACED[finishKey];
  const urls: string[] = [];
  if (primary) urls.push(`${base}/${primary}`);
  if (legacy) urls.push(`${base}/${legacy}`);
  return urls;
}

export function blancoSinkSpecSheetUrl(productId: string) {
  return `/product-catalog/spec-sheets/${productId}/${productId}.pdf`;
}

export function blancoSinkInstalledUrl(productId: string) {
  return `${blancoSinkPublicBase(productId)}/installed.jpg`;
}

export function isBlancoCatalogSinkId(productId: string, category?: string) {
  return category === "sink" && productId.startsWith("blanco-blanco-");
}

/** Auto-assign hero + finish URLs from `/product-catalog/sinks/<item.id>/`. */
export function resolveBlancoSinkFolderAssets(productId: string, category?: string) {
  if (!isBlancoCatalogSinkId(productId, category)) return null;
  return {
    imageUrl: blancoSinkHeroUrl(productId),
    finishImageUrls: blancoSinkFinishImageUrls(productId),
    defaultFinishKey: "coal-black" as const,
    installedImageUrl: blancoSinkInstalledUrl(productId),
    specSheetUrl: blancoSinkSpecSheetUrl(productId),
  };
}
