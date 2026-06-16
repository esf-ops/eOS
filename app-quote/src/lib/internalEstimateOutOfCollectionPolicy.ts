/**
 * Internal Estimate Out-of-Collection material premium — v1 fixed policy.
 * Shaped for future Pricing Admin ownership; v1 ignores org/date inputs.
 */

export type OutOfCollectionPremiumScope = "countertop_and_backsplash_material";

export type OutOfCollectionPricingPolicy = {
  wholesalePremiumPercent: number;
  directPremiumPercent: number;
  premiumScope: OutOfCollectionPremiumScope;
  policyVersion: number;
  resolvedAt: string;
};

export const OUT_OF_COLLECTION_WHOLESALE_PREMIUM_PERCENT = 10;
export const OUT_OF_COLLECTION_DIRECT_PREMIUM_PERCENT = 15;

/** Resolve OOC premium policy for Internal Estimate (not Public/Partner Quote). */
export function resolveOutOfCollectionPricingPolicy(_ctx?: {
  organizationId?: string;
  pricingMode?: string;
  effectiveDate?: string;
}): OutOfCollectionPricingPolicy {
  return {
    wholesalePremiumPercent: OUT_OF_COLLECTION_WHOLESALE_PREMIUM_PERCENT,
    directPremiumPercent: OUT_OF_COLLECTION_DIRECT_PREMIUM_PERCENT,
    premiumScope: "countertop_and_backsplash_material",
    policyVersion: 1,
    resolvedAt: new Date().toISOString()
  };
}

/** Premium percent for the active Internal Estimate pricing mode. */
export function outOfCollectionPremiumPercentForPricingMode(
  pricingMode: "wholesale" | "direct",
  policy: OutOfCollectionPricingPolicy = resolveOutOfCollectionPricingPolicy()
): number {
  return pricingMode === "direct" ? policy.directPremiumPercent : policy.wholesalePremiumPercent;
}
