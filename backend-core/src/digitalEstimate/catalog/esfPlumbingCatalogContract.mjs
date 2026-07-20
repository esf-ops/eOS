/**
 * ESF plumbing / specialty catalog contract (Brain-side, server-authoritative).
 * Sell prices live here for Brain use only — never project cost/margin/vendor fields
 * into customer-facing DTOs or frontend components.
 */

export const ESF_PLUMBING_CATALOG_CONTRACT_ID = "esf-plumbing-specialty-catalog-v1";

/**
 * @typedef {'kitchen' | 'bar_prep' | 'vanity'} RoomEligibility
 */

/**
 * @typedef {'priced' | 'review_only'} PricingTreatment
 */

/**
 * @typedef {'stock' | 'special_order'} Availability
 */

/**
 * @typedef {'sink_cutout' | 'vanity_cutout' | 'bar_cutout'} CutoutType
 */

/**
 * @typedef {
 *   | 'customer_sink_model_required'
 *   | 'customer_faucet_model_required'
 *   | 'faucet_hole_count_required'
 *   | 'custom_backsplash_height_review'
 *   | 'full_height_measurement_required'
 *   | 'specialty_item_quote_required'
 *   | 'product_availability_confirmation_required'
 * } MissingInfoRequirementCode
 */

/**
 * @typedef {Object} NormalizedCatalogVariant
 * @property {string} variantId
 * @property {string} sku
 * @property {string} [displayName]
 * @property {string} [finish]
 * @property {string} [color]
 * @property {string} [model]
 * @property {number} [sellPrice]
 * @property {Availability} availability
 * @property {string} [imageUrl]
 * @property {Record<string, unknown>} [raw] Internal-only workbook residue (stripped for customers)
 */

/**
 * @typedef {Object} NormalizedCatalogProduct
 * @property {string} productId
 * @property {string} category
 * @property {string} [subcategory]
 * @property {string} manufacturer
 * @property {string} [collection]
 * @property {string} [model]
 * @property {string} [sku]
 * @property {string} displayName
 * @property {string} [description]
 * @property {string} [color]
 * @property {string} [finish]
 * @property {string} [sizeConfiguration]
 * @property {number} [sellPrice]
 * @property {number} [installedPrice]
 * @property {Availability} availability
 * @property {boolean} customerVisible
 * @property {boolean} active
 * @property {RoomEligibility[]} roomEligibility
 * @property {string} [imageUrl]
 * @property {PricingTreatment} pricingTreatment
 * @property {boolean} requiresCutout
 * @property {CutoutType | null} relatedCutoutType
 * @property {boolean} estimatorReviewRequired
 * @property {string} sourceSheet
 * @property {string} [sourceVersion]
 * @property {NormalizedCatalogVariant[]} [variants]
 * @property {string[]} [compatibleFamilyIds]
 * @property {string[]} [compatibleProductIds]
 * @property {number} [itemCost] Internal only — never customer-safe
 * @property {number} [margin] Internal only
 * @property {number} [wholesale] Internal only
 * @property {number} [vendorCost] Internal only
 * @property {string} [internalNotes] Internal only
 * @property {Record<string, unknown>} [rawPricing] Internal only
 */

/** Keys that must never appear on customer-safe projections. */
export const CUSTOMER_UNSAFE_PRODUCT_KEYS = Object.freeze([
  "itemCost",
  "margin",
  "wholesale",
  "vendorCost",
  "vendorPricing",
  "internalNotes",
  "internalSku",
  "rawPricing",
  "raw",
  "cost",
  "costBasis",
  "marginPercent",
  "marginPercentage",
  "wholesalePrice",
  "directPrice",
  "pricingBasis",
  "rawPricingKeys"
]);

/**
 * Customer-facing availability copy.
 * Elite does not expose Stock vs Special Order as commercial programs —
 * keep internal availability metadata, return null for public labels.
 *
 * @param {Availability | string | null | undefined} availability
 * @returns {string | null}
 */
export function customerAvailabilityText(availability) {
  void availability;
  return null;
}

/**
 * @param {Availability | string | null | undefined} statusOrAvailability
 * @returns {Availability}
 */
export function normalizeAvailability(statusOrAvailability) {
  const s = String(statusOrAvailability || "")
    .trim()
    .toLowerCase();
  if (s === "stock" || s === "in stock") return "stock";
  // Workbook uses "Non Stock"; treat blank Blanco/faucet rows as special order.
  return "special_order";
}

import {
  customerFacingProductCopy,
  stripInternalChannelTerms
} from "./customerFacingCopy.mjs";

/**
 * Strip internal cost/margin/vendor fields and project customer-safe availability copy.
 * Retains sellPrice when present — callers that must hide absolute prices should omit separately.
 *
 * @param {NormalizedCatalogProduct | null | undefined} product
 * @returns {object | null}
 */
export function toCustomerSafeProduct(product) {
  if (!product || typeof product !== "object") return null;

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(product)) {
    if (CUSTOMER_UNSAFE_PRODUCT_KEYS.includes(key)) continue;
    if (key === "variants" && Array.isArray(value)) {
      out.variants = value.map((v) => toCustomerSafeVariant(v)).filter(Boolean);
      continue;
    }
    if (key === "rawPricing" || key === "raw") continue;
    out[key] = value;
  }

  const copy = customerFacingProductCopy(product);
  out.displayName = copy.displayName;
  if (copy.description != null) out.description = copy.description;
  else if (typeof out.description === "string") {
    out.description = stripInternalChannelTerms(out.description) || null;
  }
  out.availabilityText = customerAvailabilityText(/** @type {Availability} */ (product.availability));
  return out;
}

/**
 * @param {NormalizedCatalogVariant | null | undefined} variant
 * @returns {object | null}
 */
export function toCustomerSafeVariant(variant) {
  if (!variant || typeof variant !== "object") return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(variant)) {
    if (CUSTOMER_UNSAFE_PRODUCT_KEYS.includes(key)) continue;
    if (key === "raw") continue;
    out[key] = value;
  }
  out.availabilityText = customerAvailabilityText(/** @type {Availability} */ (variant.availability));
  return out;
}

/**
 * @param {NormalizedCatalogProduct[]} products
 * @returns {object[]}
 */
export function toCustomerSafeCatalog(products) {
  if (!Array.isArray(products)) return [];
  return products.map((p) => toCustomerSafeProduct(p)).filter(Boolean);
}
