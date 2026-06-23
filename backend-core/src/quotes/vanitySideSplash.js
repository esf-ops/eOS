/**
 * Vanity side splash material pricing — backend parity with app-quote vanitySideSplash.ts
 */
import {
  computeInternalEstimateMaterialUseTaxAmounts,
  resolveInternalEstimateMaterialTaxPolicy
} from "./internalEstimateMaterialTaxPolicy.js";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export const STANDARD_BACKSPLASH_HEIGHT_IN = 4;
export const STANDARD_VANITY_DEPTH_IN = 22.5;

function chargeableSplashSqftFromExact(exactSf) {
  const n = Number(exactSf) || 0;
  if (n <= 0) return 0;
  return Math.ceil(n);
}

export function resolveVanitySideSplashQty(vanity) {
  if (!vanity || typeof vanity !== "object") return 0;
  if (vanity.sideSplashQty != null && vanity.sideSplashQty !== "") {
    const n = Math.floor(Number(vanity.sideSplashQty));
    if (n >= 2) return 2;
    if (n === 1) return 1;
    return 0;
  }
  if (vanity.sideSplash === true || vanity.hasSideSplash === true) return 1;
  const legacy = Math.floor(Number(vanity.sideSplashCount ?? vanity.side_splash_qty) || 0);
  if (legacy >= 2) return 2;
  if (legacy === 1) return 1;
  return 0;
}

export function vanitySideSplashSfPerPiece(depthIn, chargeableCeil) {
  const depth = Math.max(0, Number(depthIn) || STANDARD_VANITY_DEPTH_IN);
  const exact = round2((depth * STANDARD_BACKSPLASH_HEIGHT_IN) / 144);
  if (!chargeableCeil || exact <= 0) return exact;
  return chargeableSplashSqftFromExact(exact);
}

export function vanitySideSplashCustomerLabel(qty) {
  if (qty <= 0) return "";
  if (qty === 1) return "Side splash";
  return "Side splash (×2)";
}

/**
 * @param {object} params
 * @param {Record<string, unknown>} params.vanity
 * @param {string} params.materialGroup
 * @param {number} params.ratePerSqft
 * @param {boolean} [params.chargeableCeil]
 * @param {boolean} [params.internalMaterialUseTax]
 */
export function priceVanitySideSplashFromPayload(params) {
  const vanity = params.vanity && typeof params.vanity === "object" ? params.vanity : {};
  const qty = resolveVanitySideSplashQty(vanity);
  if (qty <= 0) return null;
  const depthIn = Number(vanity.depth ?? vanity.depthIn ?? STANDARD_VANITY_DEPTH_IN) || STANDARD_VANITY_DEPTH_IN;
  const sfPerPiece = vanitySideSplashSfPerPiece(depthIn, params.chargeableCeil === true);
  const totalSf = round2(sfPerPiece * qty);
  const rate = Math.max(0, Number(params.ratePerSqft) || 0);
  let materialExact = round2(totalSf * rate);
  if (params.internalMaterialUseTax === true) {
    const policy = resolveInternalEstimateMaterialTaxPolicy();
    const amounts = computeInternalEstimateMaterialUseTaxAmounts(0, materialExact, policy);
    materialExact = round2(materialExact + amounts.backsplashMaterialUseTaxAmount);
  }
  return {
    qty,
    sfPerPiece,
    totalSf,
    materialExact,
    label: vanitySideSplashCustomerLabel(qty)
  };
}
