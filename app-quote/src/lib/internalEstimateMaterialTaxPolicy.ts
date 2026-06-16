/**
 * Internal Estimate material use tax — v1 fixed policy.
 * Shaped for future Pricing Admin ownership; v1 ignores org/mode/date inputs.
 */

export type InternalEstimateMaterialTaxScope = "countertop_and_backsplash_material";

export type InternalEstimateMaterialTaxAppliesTo =
  | "countertop_material"
  | "backsplash_material";

export type InternalEstimateMaterialTaxExcludes =
  | "add_ons"
  | "custom_lines"
  | "labor"
  | "fees"
  | "credits";

export type InternalEstimateMaterialTaxPolicy = {
  materialUseTaxPercent: number;
  materialUseTaxScope: InternalEstimateMaterialTaxScope;
  appliesTo: readonly InternalEstimateMaterialTaxAppliesTo[];
  excludes: readonly InternalEstimateMaterialTaxExcludes[];
  policyVersion: number;
  resolvedAt: string;
};

export const INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT = 2;

/** Resolve material use tax policy for Internal Estimate (not Public/Partner Quote). */
export function resolveInternalEstimateMaterialTaxPolicy(_ctx?: {
  organizationId?: string;
  pricingMode?: string;
  materialProgram?: string;
  effectiveDate?: string;
}): InternalEstimateMaterialTaxPolicy {
  return {
    materialUseTaxPercent: INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT,
    materialUseTaxScope: "countertop_and_backsplash_material",
    appliesTo: ["countertop_material", "backsplash_material"],
    excludes: ["add_ons", "custom_lines", "labor", "fees", "credits"],
    policyVersion: 1,
    resolvedAt: new Date().toISOString()
  };
}

export type MaterialUseTaxAmounts = {
  countertopMaterialUseTaxAmount: number;
  backsplashMaterialUseTaxAmount: number;
  totalMaterialUseTaxAmount: number;
  baseCountertopMaterial: number;
  baseBacksplashMaterial: number;
};

function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/** Compute split material use tax on pre-tax countertop and backsplash material $. */
export function computeInternalEstimateMaterialUseTaxAmounts(
  baseCountertopMaterial: number,
  baseBacksplashMaterial: number,
  policy: InternalEstimateMaterialTaxPolicy = resolveInternalEstimateMaterialTaxPolicy()
): MaterialUseTaxAmounts {
  const pct = Math.max(0, Number(policy.materialUseTaxPercent) || 0);
  const ctBase = round2(baseCountertopMaterial);
  const bsBase = round2(baseBacksplashMaterial);
  if (pct <= 0) {
    return {
      baseCountertopMaterial: ctBase,
      baseBacksplashMaterial: bsBase,
      countertopMaterialUseTaxAmount: 0,
      backsplashMaterialUseTaxAmount: 0,
      totalMaterialUseTaxAmount: 0
    };
  }
  const countertopMaterialUseTaxAmount = round2(ctBase * (pct / 100));
  const backsplashMaterialUseTaxAmount = round2(bsBase * (pct / 100));
  return {
    baseCountertopMaterial: ctBase,
    baseBacksplashMaterial: bsBase,
    countertopMaterialUseTaxAmount,
    backsplashMaterialUseTaxAmount,
    totalMaterialUseTaxAmount: round2(countertopMaterialUseTaxAmount + backsplashMaterialUseTaxAmount)
  };
}
