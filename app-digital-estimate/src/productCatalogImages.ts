/**
 * Resolve Product Catalog image URLs for Digital Estimate (same-origin public/).
 * Prefer exact SKU / productId maps — never loose substring match across unrelated models.
 */
import imageMap from "./productCatalogImageMap.json" with { type: "json" };

const MAP = imageMap as Record<string, string>;

function normalizeSku(sku: string): string {
  return String(sku || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Compact SKU for map keys that omit spaces (e.g. MOEN7864SRS). */
function compactSku(sku: string): string {
  return normalizeSku(sku).replace(/[\s/-]+/g, "");
}

/**
 * Catalog product IDs use `faucet:delta-…` while image-map keys use `faucet-delta-…`.
 */
function productIdLookupKeys(productId: string): string[] {
  const id = String(productId || "").trim();
  if (!id) return [];
  const keys = [id, id.toLowerCase()];
  if (id.includes(":")) {
    const hyphen = id.replace(/:/g, "-");
    keys.push(hyphen, hyphen.toLowerCase());
  }
  if (id.startsWith("faucet-")) {
    keys.push(id.replace(/^faucet-/, "faucet:"), id.replace(/^faucet-/, "faucet:").toLowerCase());
  }
  return [...new Set(keys)];
}

function skuLookupKeys(sku: string): string[] {
  const norm = normalizeSku(sku);
  if (!norm) return [];
  const compact = compactSku(sku);
  const keys = [
    `sku:${norm}`,
    `sku:${norm.toLowerCase()}`,
    `sku:${compact}`,
    `sku:${compact.toLowerCase()}`,
    `kansas:${norm}`,
    `kansas:${compact}`,
  ];
  // Map often stores "sku:DELTA 9176 CZ PR DST" and "sku:delta 9176 cz pr dst"
  return [...new Set(keys)];
}

export type ImageMatchType =
  | "product_id"
  | "sku"
  | "normalized_sku"
  | "family"
  | "variant_sku"
  | "none";

/**
 * Exact-key lookup only (SKU, productId, faucet hyphen/colon bridge, blanco family id).
 */
export function resolveProductCatalogImageUrl(args: {
  productId?: string | null;
  sku?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
}): string | null {
  return resolveProductCatalogImage(args).url;
}

export function resolveProductCatalogImage(args: {
  productId?: string | null;
  sku?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  finish?: string | null;
  category?: string | null;
}): { url: string | null; matchType: ImageMatchType } {
  const productId = String(args.productId || "").trim();
  const sku = String(args.sku || "").trim();

  for (const key of productIdLookupKeys(productId)) {
    if (MAP[key]) return { url: MAP[key], matchType: "product_id" };
  }

  for (const key of skuLookupKeys(sku)) {
    if (MAP[key]) {
      return {
        url: MAP[key],
        matchType: key.includes(compactSku(sku)) && !key.includes(" ") ? "normalized_sku" : "sku",
      };
    }
  }

  // Exact compact SKU equality against map sku:* keys (spaces/hyphens differ).
  if (sku) {
    const want = compactSku(sku);
    for (const [key, url] of Object.entries(MAP)) {
      if (!key.toLowerCase().startsWith("sku:")) continue;
      const mapSku = key.slice(4);
      if (compactSku(mapSku) === want) {
        return {
          url,
          matchType: normalizeSku(mapSku) === normalizeSku(sku) ? "sku" : "normalized_sku",
        };
      }
    }
  }

  // Exact manufacturer + model + finish → faucet-{mfr}-{model}-{finish} style keys only.
  const mfr = String(args.manufacturer || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const model = String(args.model || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const finish = String(args.finish || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (mfr && model) {
    const candidates = [
      finish ? `faucet-${mfr}-${model}-${finish}` : null,
      `faucet-${mfr}-${model}`,
      finish ? `${mfr}-${model}-${finish}` : null,
    ].filter(Boolean) as string[];
    for (const key of candidates) {
      if (MAP[key]) return { url: MAP[key], matchType: "family" };
    }
  }

  if (productId.startsWith("kansas:")) {
    const kansasSku = normalizeSku(productId.slice("kansas:".length));
    for (const key of skuLookupKeys(kansasSku)) {
      if (MAP[key]) return { url: MAP[key], matchType: "sku" };
    }
  }

  if (productId.startsWith("blanco:")) {
    const fam = productId.slice("blanco:".length).replace(/:accessories$/, "");
    if (MAP[`blanco:${fam}`]) return { url: MAP[`blanco:${fam}`], matchType: "family" };
    const folderGuess = `blanco-blanco-${fam}`;
    if (MAP[folderGuess]) return { url: MAP[folderGuess], matchType: "family" };
  }

  return { url: null, matchType: "none" };
}

export function enrichProductImageUrl(product: {
  productId?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
  variants?: Array<{ sku?: string | null; imageUrl?: string | null }>;
}): string | null {
  if (product.imageUrl) return product.imageUrl;
  if (product.thumbnailUrl) return product.thumbnailUrl;
  if (product.previewUrl) return product.previewUrl;
  const fromId = resolveProductCatalogImage(product);
  if (fromId.url) return fromId.url;
  for (const v of product.variants || []) {
    if (v.imageUrl) return v.imageUrl;
    const fromSku = resolveProductCatalogImage({ ...product, sku: v.sku });
    if (fromSku.url) return fromSku.url;
  }
  return null;
}

/** Customer-safe image fields for product cards / DTOs. */
export function resolveProductImageFields(product: {
  productId?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  variants?: Array<{ sku?: string | null; imageUrl?: string | null }>;
}): {
  thumbnailUrl: string | null;
  previewUrl: string | null;
  imageStatus: "ok" | "fallback";
  imageMatchType: ImageMatchType;
} {
  let match = resolveProductCatalogImage(product);
  if (!match.url && product.imageUrl) {
    match = { url: product.imageUrl, matchType: "product_id" };
  }
  if (!match.url) {
    for (const v of product.variants || []) {
      const m = resolveProductCatalogImage({ ...product, sku: v.sku });
      if (m.url) {
        match = { ...m, matchType: "variant_sku" };
        break;
      }
      if (v.imageUrl) {
        match = { url: v.imageUrl, matchType: "variant_sku" };
        break;
      }
    }
  }
  return {
    thumbnailUrl: match.url,
    previewUrl: match.url,
    imageStatus: match.url ? "ok" : "fallback",
    imageMatchType: match.matchType,
  };
}
