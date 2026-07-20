/**
 * Brain-side ESF plumbing / specialty catalog accessors.
 * Seed includes sellPrice for server calculation — use toCustomerSafe* for public DTOs.
 */
import {
  ESF_PLUMBING_CATALOG_CONTRACT_ID,
  toCustomerSafeCatalog,
  toCustomerSafeProduct
} from "./esfPlumbingCatalogContract.mjs";
import { ESF_PLUMBING_CATALOG_SEED } from "./esfPlumbingCatalogSeed.mjs";

export { ESF_PLUMBING_CATALOG_CONTRACT_ID, toCustomerSafeCatalog, toCustomerSafeProduct };

/**
 * @returns {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct[]}
 */
export function getCatalogProducts() {
  return Array.isArray(ESF_PLUMBING_CATALOG_SEED?.products) ? ESF_PLUMBING_CATALOG_SEED.products : [];
}

/**
 * @param {string} productId
 * @returns {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct | null}
 */
export function getProductById(productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  return getCatalogProducts().find((p) => p.productId === id) || null;
}

/**
 * @param {{
 *   category?: string,
 *   roomType?: string,
 *   customerVisibleOnly?: boolean
 * }} [filters]
 */
export function listProducts(filters = {}) {
  const { category, roomType, customerVisibleOnly = false } = filters;
  return getCatalogProducts().filter((p) => {
    if (customerVisibleOnly && !p.customerVisible) return false;
    if (category && p.category !== category) return false;
    if (roomType) {
      const rooms = Array.isArray(p.roomEligibility) ? p.roomEligibility : [];
      if (!rooms.includes(/** @type {any} */ (roomType))) return false;
    }
    return true;
  });
}

/**
 * Resolve an exact Blanco (or family) variant by finish name or SKU.
 * @param {string} familyProductId
 * @param {string} finishOrSku
 * @returns {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogVariant | null}
 */
export function resolveBlancoVariant(familyProductId, finishOrSku) {
  const product = getProductById(familyProductId);
  if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return null;
  const needle = String(finishOrSku || "").trim().toLowerCase();
  if (!needle) return null;

  const bySku = product.variants.find((v) => String(v.sku || "").toLowerCase() === needle);
  if (bySku) return bySku;

  const byFinish = product.variants.filter((v) => {
    const finish = String(v.finish || v.color || "").toLowerCase();
    return finish === needle || finish.includes(needle) || needle.includes(finish);
  });
  if (byFinish.length === 1) return byFinish[0];
  // Ambiguous finish match — require exact SKU
  return null;
}

/**
 * Map a product's related cutout type to Digital Estimate option catalog keys.
 * @param {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct | null | undefined} product
 * @returns {string | null}
 */
export function getCutoutCatalogKeyForProduct(product) {
  if (!product || !product.requiresCutout) return null;
  switch (product.relatedCutoutType) {
    case "sink_cutout":
      return "qty-sink";
    case "vanity_cutout":
      return "qty-bar";
    case "bar_cutout":
      return "qty-bar";
    default:
      return "qty-sink";
  }
}

export function getCatalogMeta() {
  return {
    contract: ESF_PLUMBING_CATALOG_SEED?.contract || ESF_PLUMBING_CATALOG_CONTRACT_ID,
    sourceVersion: ESF_PLUMBING_CATALOG_SEED?.sourceVersion || null,
    productCount: getCatalogProducts().length
  };
}
