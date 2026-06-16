/**
 * Internal Estimate material use tax — v1 fixed policy (backend parity with app-quote).
 */

export const INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT = 2;

/**
 * @param {{ organizationId?: string, pricingMode?: string, materialProgram?: string, effectiveDate?: string }} [_ctx]
 */
export function resolveInternalEstimateMaterialTaxPolicy(_ctx) {
  return {
    materialUseTaxPercent: INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT,
    materialUseTaxScope: "countertop_and_backsplash_material",
    appliesTo: ["countertop_material", "backsplash_material"],
    excludes: ["add_ons", "custom_lines", "labor", "fees", "credits"],
    policyVersion: 1,
    resolvedAt: new Date().toISOString()
  };
}

/**
 * @param {number} baseCountertopMaterial
 * @param {number} baseBacksplashMaterial
 * @param {ReturnType<typeof resolveInternalEstimateMaterialTaxPolicy>} [policy]
 */
export function computeInternalEstimateMaterialUseTaxAmounts(
  baseCountertopMaterial,
  baseBacksplashMaterial,
  policy = resolveInternalEstimateMaterialTaxPolicy()
) {
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

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
