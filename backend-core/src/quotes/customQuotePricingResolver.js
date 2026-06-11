/**
 * Custom Quote pricing defaults — shaped for future Pricing Admin ownership.
 * Calculator reads this module; do not duplicate rates in frontend heads.
 */

/** Material type keys (lowercase). */
export const CUSTOM_QUOTE_MATERIAL_TYPES = Object.freeze([
  "quartz",
  "granite",
  "marble",
  "quartzite",
  "porcelain"
]);

/** Fabrication / shop $/sf on project sqft — v1 backend constants. */
export const DEFAULT_FABRICATION_RATE_PER_SQFT = Object.freeze({
  quartz: 22,
  granite: 32,
  marble: 38,
  quartzite: 38,
  porcelain: 38
});

/** Markup/uplift percent applied to total cost basis (not gross-margin inversion). */
export const RETAIL_UPLIFT_PERCENT = 25;
export const WHOLESALE_UPLIFT_PERCENT = 15;

/** Review thresholds — warnings only in v1. */
export const UTILIZATION_WARN_PERCENT = 70;
export const MULTIPLIER_WARN_THRESHOLD = 2.25;

/**
 * Resolve fabrication rate for material type.
 * Future: read from Pricing Admin policy / material-type table.
 *
 * @param {string} materialType
 * @returns {number}
 */
export function resolveFabricationRatePerSqft(materialType) {
  const key = String(materialType || "")
    .trim()
    .toLowerCase();
  const rate = DEFAULT_FABRICATION_RATE_PER_SQFT[key];
  return Number.isFinite(rate) ? rate : DEFAULT_FABRICATION_RATE_PER_SQFT.quartz;
}

/**
 * @param {"retail"|"wholesale"|string} pricingMode
 * @returns {{ pricingMode: string, pricingUpliftPercent: number }}
 */
export function resolveCustomQuoteUplift(pricingMode) {
  const mode = String(pricingMode || "retail")
    .trim()
    .toLowerCase();
  if (mode === "wholesale") {
    return { pricingMode: "wholesale", pricingUpliftPercent: WHOLESALE_UPLIFT_PERCENT };
  }
  return { pricingMode: "retail", pricingUpliftPercent: RETAIL_UPLIFT_PERCENT };
}

/**
 * Full pricing config snapshot for calculation_snapshot (frozen at save).
 *
 * @returns {Record<string, unknown>}
 */
export function buildCustomQuotePricingConfigSnapshot() {
  return {
    source: "backend_constants",
    fabrication_rate_per_sqft: { ...DEFAULT_FABRICATION_RATE_PER_SQFT },
    retail_uplift_percent: RETAIL_UPLIFT_PERCENT,
    wholesale_uplift_percent: WHOLESALE_UPLIFT_PERCENT,
    utilization_warn_percent: UTILIZATION_WARN_PERCENT,
    multiplier_warn_threshold: MULTIPLIER_WARN_THRESHOLD,
    pricing_formula: "sellPrice = totalCostBasis * (1 + pricingUpliftPercent / 100)"
  };
}
