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

export const INTEOS_WORKSTATION_SINK_ID = "blanco-inteos-33-workstation";

export function blancoSinkPublicBase(productId: string) {
  return `/product-catalog/sinks/${productId}`;
}

export function isInteosWorkstationSink(productId: string) {
  return productId === INTEOS_WORKSTATION_SINK_ID;
}

/** Hero-first modal/card default (Inteos) vs coal-black-first (standard BLANCO sinks). */
export function isHeroFirstSinkPresentation(productId: string) {
  return isInteosWorkstationSink(productId);
}

export function usesSinkFolderResolver(productId: string, category?: string) {
  if (category !== "sink") return false;
  if (productId.startsWith("blanco-blanco-")) return true;
  if (isInteosWorkstationSink(productId)) return true;
  return false;
}

/** @deprecated Use usesSinkFolderResolver */
export function isBlancoCatalogSinkId(productId: string, category?: string) {
  return usesSinkFolderResolver(productId, category);
}

export function blancoSinkHeroCandidates(productId: string): string[] {
  const base = blancoSinkPublicBase(productId);
  if (isInteosWorkstationSink(productId)) {
    return [
      `${base}/hero.png`,
      `${base}/hero.jpg`,
      `${base}/coal-black.png`,
      `${base}/coal black.png`,
    ];
  }
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

/** Installed lifestyle shots — may include installed2/installed3 when present on disk. */
export function blancoSinkInstalledGalleryUrls(productId: string): string[] {
  const base = blancoSinkPublicBase(productId);
  return [`${base}/installed.jpg`, `${base}/installed2.jpg`, `${base}/installed3.jpg`];
}

/** Auto-assign hero + finish URLs from `/product-catalog/sinks/<item.id>/`. */
export function resolveBlancoSinkFolderAssets(productId: string, category?: string) {
  if (!usesSinkFolderResolver(productId, category)) return null;
  const heroFirst = isHeroFirstSinkPresentation(productId);
  return {
    imageUrl: blancoSinkHeroUrl(productId),
    finishImageUrls: blancoSinkFinishImageUrls(productId),
    defaultFinishKey: heroFirst ? undefined : ("coal-black" as const),
    installedImageUrl: blancoSinkInstalledUrl(productId),
    installedGalleryUrls: blancoSinkInstalledGalleryUrls(productId),
    specSheetUrl: blancoSinkSpecSheetUrl(productId),
  };
}
