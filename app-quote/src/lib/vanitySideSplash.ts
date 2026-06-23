import {
  computeInternalEstimateMaterialUseTaxAmounts,
  resolveInternalEstimateMaterialTaxPolicy
} from "./internalEstimateMaterialTaxPolicy";
import {
  chargeableSplashSqftFromExact,
  round2,
  STANDARD_BACKSPLASH_HEIGHT_IN
} from "./measurementEngine";
import type { RoomDraft } from "./quoteTypes";

export type VanitySideSplashQty = 0 | 1 | 2;

type VanitySideSplashFields = Partial<RoomDraft["vanity"]> & Record<string, unknown>;

/** Normalize side splash quantity from persisted vanity fields (including legacy toggles). */
export function resolveVanitySideSplashQty(vanity: VanitySideSplashFields | null | undefined): VanitySideSplashQty {
  if (!vanity) return 0;
  if (vanity.sideSplashQty != null && vanity.sideSplashQty !== "") {
    const n = Math.floor(Number(vanity.sideSplashQty));
    if (n >= 2) return 2;
    if (n === 1) return 1;
    return 0;
  }
  if (vanity.sideSplash === true || vanity.hasSideSplash === true) return 1;
  const legacy = Math.floor(
    Number(vanity.sideSplashCount ?? vanity.side_splash_qty ?? vanity.sideSplashCount) || 0
  );
  if (legacy >= 2) return 2;
  if (legacy === 1) return 1;
  return 0;
}

/** Exact or chargeable SF for one vanity side splash piece (4″ × vanity depth). */
export function vanitySideSplashSfPerPiece(depthIn: number, chargeableCeil?: boolean): number {
  const depth = Math.max(0, Number(depthIn) || 22.5);
  const exact = round2((depth * STANDARD_BACKSPLASH_HEIGHT_IN) / 144);
  if (!chargeableCeil || exact <= 0) return exact;
  return chargeableSplashSqftFromExact(exact);
}

export function vanitySideSplashCustomerLabel(qty: VanitySideSplashQty): string {
  if (qty === 0) return "";
  if (qty === 1) return "Side splash";
  return "Side splash (×2)";
}

export type VanitySideSplashPricing = {
  qty: VanitySideSplashQty;
  sfPerPiece: number;
  totalSf: number;
  materialExact: number;
  label: string;
};

export function priceVanitySideSplash(
  room: RoomDraft,
  materialBasis: "wholesale" | "direct",
  materialRateFn: (group: string, basis: "wholesale" | "direct") => number,
  options?: {
    chargeableCounterCeil?: boolean;
    internalMaterialUseTax?: boolean;
  }
): VanitySideSplashPricing | null {
  const qty = resolveVanitySideSplashQty(room.vanity);
  if (qty <= 0) return null;
  const sfPerPiece = vanitySideSplashSfPerPiece(room.vanity.depth, options?.chargeableCounterCeil);
  const totalSf = round2(sfPerPiece * qty);
  const group = String(room.materialGroup || "Group Promo").trim();
  const rate = materialRateFn(group, materialBasis);
  let materialExact = round2(totalSf * rate);
  if (options?.internalMaterialUseTax) {
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
