/**
 * Dev helper: print public consumer estimates from the same core as POST /api/public-quote/calculate
 * (prototype mirror rules when no DB). Compare output to app-quote local fallback
 * `computePublicConsumerEstimatesLocal` for the standard parity case.
 *
 * Usage from repo root:
 *   node backend-core/src/scripts/checkQuotePublicParity.js
 */
import { computePublicConsumerEstimatesByGroup } from "../quotes/quoteCalculator.js";

const body = {
  quoteSource: "public_retail",
  materialGroup: "Group Promo",
  areas: { countertopSqft: 45, backsplashSqft: 12 },
  addOns: { "qty-sink": 1, "qty-cook": 1, tearout: 0 },
  engine: "legacy",
  rooms: []
};

const multi = await computePublicConsumerEstimatesByGroup(body, {});
console.log("estimates_by_group (Promo row):");
const promo = (multi.estimates_by_group || []).find((r) => r.group === "Group Promo");
console.log(JSON.stringify(promo, null, 2));
console.log("\nFull rows:", (multi.estimates_by_group || []).length);
