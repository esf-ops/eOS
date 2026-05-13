/**
 * Browser fallback for POST /api/public-quote/calculate — must match
 * backend-core `computePublicConsumerEstimatesByGroup` (prototype rules, no DB).
 */

import { round2 } from "./measurementEngine";
import {
  enrichPublicConsumerEstimatesForDisplayLocal,
  type PublicEstimateRow
} from "./publicEstimateDisplay";
import { ESF_DIRECT_TIER_RATES, sumGlobalAddOns } from "./prototypeQuoteMath";

export type { PublicEstimateRow } from "./publicEstimateDisplay";

/** Local fallback assumes 25% public planning markup (matches default `public_retail` structure). */
const PUBLIC_PLANNING_MARKUP_MULT = 1.25;

/**
 * Same economics as `computePublicConsumerEstimatesByGroup` in quoteCalculator.js (prototype / no-DB path, 25% markup).
 * Public consumer estimates use ESF Direct pricing plus a 25% public planning markup.
 */
export function computePublicConsumerEstimatesLocal(params: {
  countertopSqft: number;
  backsplashSqft: number;
  addOns: Record<string, number>;
}): PublicEstimateRow[] {
  const ct = Number(params.countertopSqft) || 0;
  const bs = Number(params.backsplashSqft) || 0;
  const addOnTotal = sumGlobalAddOns(params.addOns).total;
  const rateMult = PUBLIC_PLANNING_MARKUP_MULT;
  const out: PublicEstimateRow[] = [];

  for (const tier of ESF_DIRECT_TIER_RATES) {
    const group = tier.n;
    const directR = tier.directPerSqft;
    const publicR = round2(directR * rateMult);
    const countertop = round2(ct * publicR);
    const backsplash = round2(bs * publicR);
    const addons = round2(addOnTotal * rateMult);
    const total = round2(countertop + backsplash + addons);
    out.push({ group, countertop, backsplash, addons, total });
  }
  return enrichPublicConsumerEstimatesForDisplayLocal(out);
}
