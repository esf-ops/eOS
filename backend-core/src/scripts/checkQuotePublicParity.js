/**
 * Dev helper: print public consumer estimates from the same core as POST /api/public-quote/calculate
 * (prototype mirror rules when no DB). Compare output to app-quote local fallback
 * `computePublicConsumerEstimatesLocal` for the standard parity case.
 *
 * Usage from repo root:
 *   node backend-core/src/scripts/checkQuotePublicParity.js
 */
import { computePublicConsumerEstimatesByGroup, verifyPublicPlanningPricingSanity } from "../quotes/quoteCalculator.js";

verifyPublicPlanningPricingSanity();

const bodyA = {
  quoteSource: "public_retail",
  materialGroup: "Group A",
  areas: { countertopSqft: 10, backsplashSqft: 0 },
  addOns: {},
  engine: "legacy",
  rooms: []
};
const onlyA = await computePublicConsumerEstimatesByGroup(bodyA, {});
const rowA = (onlyA.estimates_by_group || []).find((r) => r.group === "Group A");
if (!rowA || rowA.countertop !== 962.5 || rowA.total !== 962.5) {
  console.error("Expected Group A 10sf countertop and total 962.5", rowA);
  process.exitCode = 1;
}

const bodyB = {
  quoteSource: "public_retail",
  materialGroup: "Group Promo",
  areas: { countertopSqft: 0, backsplashSqft: 0 },
  addOns: { "qty-sink": 1 },
  engine: "legacy",
  rooms: []
};
const sinkOnly = await computePublicConsumerEstimatesByGroup(bodyB, {});
const promoSink = (sinkOnly.estimates_by_group || []).find((r) => r.group === "Group Promo");
if (!promoSink || promoSink.addons !== 250) {
  console.error("Expected sink-only addons 250", promoSink);
  process.exitCode = 1;
}

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
if (promo && promo.total !== 5425) {
  console.error(`Expected Promo exact total 5425, got ${promo.total}`);
  process.exitCode = 1;
}
if (promo && promo.total_display !== 5430) {
  console.error(`Expected Promo total_display 5430, got ${promo.total_display}`);
  process.exitCode = 1;
}
console.log("\nFull rows:", (multi.estimates_by_group || []).length);
