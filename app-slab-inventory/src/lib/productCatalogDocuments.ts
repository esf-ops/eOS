/**
 * Product Catalog document (PDF) URLs — public-safe paths for showroom viewing.
 *
 * PDFs live under `/product-catalog/docs/<productId>/<productId>.pdf`
 * (formerly `spec-sheets`, which some browser extensions block).
 *
 * The primary UX opens an in-app viewer; raw PDF URLs are only used as
 * embed/download fallbacks, never as the main click target.
 */

const LEGACY_SPEC_SHEETS_PREFIX = "/product-catalog/spec-sheets/";
const DOCS_PREFIX = "/product-catalog/docs/";

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
