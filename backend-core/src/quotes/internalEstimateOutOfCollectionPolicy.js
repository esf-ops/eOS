/**
 * Internal Estimate Out-of-Collection material premium — v1 fixed policy (backend parity with app-quote).
 */

export const OUT_OF_COLLECTION_WHOLESALE_PREMIUM_PERCENT = 10;
export const OUT_OF_COLLECTION_DIRECT_PREMIUM_PERCENT = 15;

/**
 * @param {{ organizationId?: string, pricingMode?: string, effectiveDate?: string }} [_ctx]
 */
export function resolveOutOfCollectionPricingPolicy(_ctx) {
  return {
    wholesalePremiumPercent: OUT_OF_COLLECTION_WHOLESALE_PREMIUM_PERCENT,
    directPremiumPercent: OUT_OF_COLLECTION_DIRECT_PREMIUM_PERCENT,
    premiumScope: "countertop_and_backsplash_material",
    policyVersion: 1,
    resolvedAt: new Date().toISOString()
  };
}

/**
 * @param {"wholesale"|"direct"} pricingMode
 * @param {ReturnType<typeof resolveOutOfCollectionPricingPolicy>} [policy]
 */
export function outOfCollectionPremiumPercentForPricingMode(pricingMode, policy = resolveOutOfCollectionPricingPolicy()) {
  return pricingMode === "direct" ? policy.directPremiumPercent : policy.wholesalePremiumPercent;
}
