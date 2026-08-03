/**
 * Product Catalog document (PDF) URLs — public-safe paths for showroom viewing.
 *
 * PDFs live under `/product-catalog/docs/<productId>/<productId>.pdf`
 * (formerly `spec-sheets`, which some browser extensions block).
 *
 * Primary in-app viewing uses pre-rendered page PNGs under
 * `/product-catalog/doc-pages/<productId>/page-N.png` (see
 * `productCatalogDocPages.generated.ts`, built by
 * `scripts/build-product-catalog-doc-pages.mjs`).
 *
 * Raw PDF URLs are only used as Download / Open-in-new-tab fallbacks.
 */

import { PRODUCT_CATALOG_DOC_PAGES } from "./productCatalogDocPages.generated";

const LEGACY_SPEC_SHEETS_PREFIX = "/product-catalog/spec-sheets/";
const DOCS_PREFIX = "/product-catalog/docs/";
const DOC_PAGES_PREFIX = "/product-catalog/doc-pages/";

/** Public SPA viewer route (HTML shell — not a raw PDF). */
export const PUBLIC_PRODUCT_CATALOG_INFO_PREFIX = "/public/product-catalog/info";

export function productCatalogDocumentPdfUrl(productId: string): string {
  return `${DOCS_PREFIX}${productId}/${productId}.pdf`;
}

/** Rewrite legacy `/spec-sheets/` asset URLs to the current `/docs/` path. */
export function normalizeProductCatalogDocumentUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (url.includes(LEGACY_SPEC_SHEETS_PREFIX)) {
    return url.replace(LEGACY_SPEC_SHEETS_PREFIX, DOCS_PREFIX);
  }
  return url;
}

/** Extract catalog product id from a docs PDF URL when possible. */
export function productIdFromDocumentPdfUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const normalized = normalizeProductCatalogDocumentUrl(url) ?? url;
  const marker = `${DOCS_PREFIX}`;
  const idx = normalized.indexOf(marker);
  if (idx < 0) return null;
  const rest = normalized.slice(idx + marker.length);
  const productId = rest.split("/")[0]?.trim();
  return productId || null;
}

/**
 * Pre-rendered page image URLs for the in-app viewer.
 * Empty array when conversion has not been run for this product.
 */
export function productCatalogDocPageUrls(productId: string | null | undefined): readonly string[] {
  if (!productId) return [];
  return PRODUCT_CATALOG_DOC_PAGES[productId] ?? [];
}

export function productCatalogDocPageUrlsFromPdfUrl(pdfUrl: string | undefined | null): readonly string[] {
  return productCatalogDocPageUrls(productIdFromDocumentPdfUrl(pdfUrl));
}

export function productCatalogInfoPath(productId: string): string {
  return `${PUBLIC_PRODUCT_CATALOG_INFO_PREFIX}/${encodeURIComponent(productId)}`;
}

export function parseProductCatalogInfoPath(pathname?: string): string | null {
  const normalized = (pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""))
    .replace(/\/+$/, "") || "/";
  const prefix = PUBLIC_PRODUCT_CATALOG_INFO_PREFIX;
  if (normalized === prefix) return null;
  if (!normalized.startsWith(`${prefix}/`)) return null;
  const id = decodeURIComponent(normalized.slice(prefix.length + 1).split("/")[0] ?? "").trim();
  return id || null;
}

export function isPublicProductCatalogInfoPath(pathname?: string): boolean {
  return parseProductCatalogInfoPath(pathname) !== null;
}

export { DOC_PAGES_PREFIX, DOCS_PREFIX };
