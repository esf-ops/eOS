/**
 * Vanity program customer print labels and future comparison-pricing metadata.
 *
 * PRICING NOTE (2026): Vanity program totals use fixed tier sheet prices (kitchen over/under 35 sf),
 * not Group A–F $/sqft tiers. The optional material comparison table therefore repeats the same
 * vanity display total for every group column until a dedicated vanity comparison resolver exists.
 * Do not infer Group A–F vanity prices from countertop rates.
 */

export { formatVanityCustomerPrintSubline } from "@quote-lib/customerEstimate/vanityPrintSubline";

/** Read-only snapshot for a future vanity comparison pricing resolver (not wired yet). */
export type VanityProgramDisplayMeta = {
  vanitySku: string;
  vanityLabel: string;
  selectedColorName: string | null;
  selectedPriceGroup: string | null;
  comparisonGroups: readonly string[];
  currentResolvedPrice: number | null;
  /**
   * `fixed_program_price_only` — comparison columns mirror program display total, not group rates.
   * Future: `group_tier_matrix` when vanity sheet supports Group A–F without fake tops.
   */
  comparisonPricingStatus: "fixed_program_price_only";
};

export function buildVanityProgramDisplayMeta(input: {
  vanitySku?: string | null;
  vanityLabel?: string | null;
  selectedColorName?: string | null;
  selectedPriceGroup?: string | null;
  comparisonGroups?: readonly string[] | null;
  currentResolvedPrice?: number | null;
}): VanityProgramDisplayMeta {
  return {
    vanitySku: String(input.vanitySku ?? "").trim(),
    vanityLabel: String(input.vanityLabel ?? "").trim(),
    selectedColorName: input.selectedColorName?.trim() || null,
    selectedPriceGroup: input.selectedPriceGroup?.trim() || null,
    comparisonGroups: input.comparisonGroups?.length ? [...input.comparisonGroups] : [],
    currentResolvedPrice:
      input.currentResolvedPrice != null && Number.isFinite(Number(input.currentResolvedPrice))
        ? Number(input.currentResolvedPrice)
        : null,
    comparisonPricingStatus: "fixed_program_price_only"
  };
}
