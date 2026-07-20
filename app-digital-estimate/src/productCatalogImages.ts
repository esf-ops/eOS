/**
 * Resolve Product Catalog image URLs for Digital Estimate (same-origin public/).
 * Prefer exact SKU / productId maps copied from slab-inventory heroes — never loose substring match.
 */
import imageMap from "./productCatalogImageMap.json" with { type: "json" };

const MAP = imageMap as Record<string, string>;

function normalizeSku(sku: string): string {
  return String(sku || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Exact-key lookup only (SKU, productId, blanco family id).
 */
export function resolveProductCatalogImageUrl(args: {
  productId?: string | null;
  sku?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
}): string | null {
  const productId = String(args.productId || "").trim();
  const sku = normalizeSku(args.sku || "");

  if (productId && MAP[productId]) return MAP[productId];
  if (sku && MAP[`sku:${sku}`]) return MAP[`sku:${sku}`];
  if (sku && MAP[`sku:${sku.toLowerCase()}`]) return MAP[`sku:${sku.toLowerCase()}`];
  if (sku && MAP[`kansas:${sku}`]) return MAP[`kansas:${sku}`];

  if (productId.startsWith("kansas:")) {
    const kansasSku = normalizeSku(productId.slice("kansas:".length));
    if (MAP[`kansas:${kansasSku}`]) return MAP[`kansas:${kansasSku}`];
    if (MAP[`sku:${kansasSku}`]) return MAP[`sku:${kansasSku}`];
  }

  if (productId.startsWith("blanco:")) {
    const fam = productId.slice("blanco:".length);
    if (MAP[`blanco:${fam}`]) return MAP[`blanco:${fam}`];
    const folderGuess = `blanco-blanco-${fam}`;
    if (MAP[folderGuess]) return MAP[folderGuess];
  }

  if (productId && MAP[productId.toLowerCase()]) return MAP[productId.toLowerCase()];

  return null;
}

export function enrichProductImageUrl(product: {
  productId?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
  variants?: Array<{ sku?: string | null; imageUrl?: string | null }>;
}): string | null {
  if (product.imageUrl) return product.imageUrl;
  const fromId = resolveProductCatalogImageUrl(product);
  if (fromId) return fromId;
  for (const v of product.variants || []) {
    if (v.imageUrl) return v.imageUrl;
    const fromSku = resolveProductCatalogImageUrl({ ...product, sku: v.sku });
    if (fromSku) return fromSku;
  }
  return null;
}
