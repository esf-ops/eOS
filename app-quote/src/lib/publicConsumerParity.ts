/**
 * Browser fallback for POST /api/public-quote/calculate — must match
 * backend-core `computePublicConsumerEstimatesByGroup` (prototype rules, no DB).
 */

import { round2 } from "./measurementEngine";
import { PROTOTYPE_TIERS, sumGlobalAddOns } from "./prototypeQuoteMath";

const MIN_PUBLIC_RETAIL_MARKUP = 25;

export type PublicEstimateRow = {
  group: string;
  countertop: number;
  backsplash: number;
  addons: number;
  total: number;
};

function tierRateForGroup(name: string): number {
  const g = String(name || "Group Promo").trim();
  return PROTOTYPE_TIERS.find((t) => t.n === g)?.p ?? PROTOTYPE_TIERS[0].p;
}

/**
 * Same economics as `legacyWholesale` + `applyRetailProtection` for public_retail in quoteCalculator.js.
 */
export function computePublicConsumerEstimatesLocal(params: {
  countertopSqft: number;
  backsplashSqft: number;
  addOns: Record<string, number>;
}): PublicEstimateRow[] {
  const ct = Number(params.countertopSqft) || 0;
  const bs = Number(params.backsplashSqft) || 0;
  const addOnTotal = sumGlobalAddOns(params.addOns).total;
  const m = MIN_PUBLIC_RETAIL_MARKUP;
  const out: PublicEstimateRow[] = [];

  for (const tier of PROTOTYPE_TIERS) {
    const group = tier.n;
    const rate = tierRateForGroup(group);
    const ctW = round2(ct * rate);
    const bsW = round2(bs * rate);
    const addW = round2(addOnTotal);
    const totalW = round2(ctW + bsW + addW);
    const retail = round2(totalW * (1 + m / 100));
    const mult = totalW > 0 ? retail / totalW : 1;
    out.push({
      group,
      countertop: round2(ctW * mult),
      backsplash: round2(bsW * mult),
      addons: round2(addW * mult),
      total: retail
    });
  }
  return out;
}
