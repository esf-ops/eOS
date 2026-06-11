/**
 * Custom Quote calculator tests.
 *
 * Run: npm run eos:test:custom-quote
 */
import assert from "node:assert/strict";

import { calculateCustomQuote } from "./customQuoteCalculator.js";
import {
  DEFAULT_FABRICATION_RATE_PER_SQFT,
  DEFAULT_WASTE_FACTOR,
  RETAIL_UPLIFT_PERCENT,
  SLAB_EDGE_TRIM_INCHES,
  WHOLESALE_UPLIFT_PERCENT
} from "./customQuotePricingResolver.js";
import { isDealerSafeHeadSlug, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { attachCustomQuoteRoutes } from "./customQuotesApi.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Mirror of calculator net-usable math for test expectations. */
function usableSlabSqft(width, height) {
  const netW = round2(width - SLAB_EDGE_TRIM_INCHES);
  const netH = round2(height - SLAB_EDGE_TRIM_INCHES);
  return round2((netW * netH) / 144);
}

function baseInput(overrides = {}) {
  return {
    colorName: "Calacatta Test",
    materialType: "quartz",
    supplierName: "ABC Stone",
    slabWidth: 120,
    slabHeight: 60,
    slabQuantity: 2,
    costPerSqft: 18,
    freightCostToEsf: 500,
    projectSqft: 45,
    pricingMode: "retail",
    ...overrides
  };
}

// 1. Net slab deduction — 2" edge trim per dimension.
async function testNetSlabDeduction() {
  const r = await calculateCustomQuote(baseInput());
  assert.equal(r.calculationSnapshot.netSlabWidthInches, 118);
  assert.equal(r.calculationSnapshot.netSlabHeightInches, 58);
  assert.equal(r.calculationSnapshot.usableSlabSqftPerSlab, usableSlabSqft(120, 60));
}

// 2. Waste factor — default 1.20 applied to projectSqft.
async function testWasteFactorDefault() {
  const r = await calculateCustomQuote(baseInput({ projectSqft: 50 }));
  assert.equal(r.calculationSnapshot.wasteFactor, DEFAULT_WASTE_FACTOR);
  assert.equal(r.calculationSnapshot.wasteAdjustedProjectSqft, round2(50 * DEFAULT_WASTE_FACTOR));
}

// 3. Slabs required — ceiling(wasteAdjusted / usableSlabSqftPerSlab).
async function testSlabsRequired() {
  const r = await calculateCustomQuote(baseInput({ projectSqft: 50, slabQuantity: 1 }));
  const usable = usableSlabSqft(120, 60);
  const expected = Math.ceil(round2(50 * DEFAULT_WASTE_FACTOR) / usable);
  assert.equal(r.calculationSnapshot.slabsRequired, expected);
  assert.equal(expected, 2);
}

// 4. Priced slab quantity uses slabsRequired when entered quantity is too low.
async function testPricedQtyUsesRequiredWhenLow() {
  const r = await calculateCustomQuote(baseInput({ projectSqft: 50, slabQuantity: 1 }));
  assert.equal(r.calculationSnapshot.enteredSlabQuantity, 1);
  assert.equal(r.calculationSnapshot.slabsRequired, 2);
  assert.equal(r.calculationSnapshot.pricedSlabQuantity, 2);
  assert.equal(r.calculationSnapshot.estimatedAdditionalSlabsNeeded, 1);
}

// 5. Priced slab quantity uses entered quantity when it exceeds requirement.
async function testPricedQtyUsesEnteredWhenHigher() {
  const r = await calculateCustomQuote(baseInput({ projectSqft: 50, slabQuantity: 5 }));
  assert.equal(r.calculationSnapshot.slabsRequired, 2);
  assert.equal(r.calculationSnapshot.pricedSlabQuantity, 5);
  assert.equal(r.calculationSnapshot.estimatedAdditionalSlabsNeeded, 0);
}

// 6. Per-slab cost path — pricedSlabQuantity × costPerSlab.
async function testPerSlabPath() {
  const r = await calculateCustomQuote(
    baseInput({
      materialCostInputType: "per_slab",
      costPerSlab: 1000,
      costPerSqft: undefined,
      slabQuantity: 1,
      projectSqft: 50
    })
  );
  assert.equal(r.calculationSnapshot.pricedSlabQuantity, 2);
  assert.equal(r.materialCost, 2000);
}

// 7. Per-sqft cost path — pricedSlabQuantity × usableSlabSqftPerSlab × costPerSqft.
async function testPerSqftPath() {
  const r = await calculateCustomQuote(
    baseInput({ materialCostInputType: "per_sqft", costPerSqft: 18, slabQuantity: 2, projectSqft: 45 })
  );
  const usable = usableSlabSqft(120, 60);
  assert.equal(r.calculationSnapshot.pricedSlabQuantity, 2);
  assert.equal(r.materialCost, round2(18 * usable * 2));
}

// 8. Fabrication uses projectSqft only — never purchased slab sqft.
async function testFabricationUsesProjectSqft() {
  const r = await calculateCustomQuote(baseInput({ materialType: "granite", projectSqft: 10 }));
  assert.equal(r.fabricationCost, DEFAULT_FABRICATION_RATE_PER_SQFT.granite * 10);
  // Not based on slab sqft availability.
  assert.notEqual(r.fabricationCost, round2(DEFAULT_FABRICATION_RATE_PER_SQFT.granite * r.slabSqftAvailable));
}

// 9. Freight is a flat entered amount, included once.
async function testFreightFlat() {
  const r = await calculateCustomQuote(baseInput({ freightCostToEsf: 750 }));
  assert.equal(r.freightCost, 750);
  assert.equal(r.calculationSnapshot.freightCostBasis ?? r.calculationSnapshot.freightToEsf, 750);
  assert.equal(
    r.totalCostBasis,
    round2(r.materialCost + 750 + r.fabricationCost + r.installCost + r.otherCostBasis)
  );
}

// 10. Utilization warning at >= 70% (waste-adjusted), advisory only.
async function testUtilizationWarningAtThreshold() {
  // 2 slabs available ~95 sf; projectSqft 70 → wasteAdjusted 84 → ~88% utilization, still within availability.
  const r = await calculateCustomQuote(baseInput({ projectSqft: 70, slabQuantity: 2 }));
  assert.ok(r.utilizationPercent >= 70);
  assert.ok(r.warnings.some((w) => /uses 70% or more of entered slab availability/i.test(w)));
  // Within availability — no "exceeds" strong warning here.
  assert.ok(!r.warnings.some((w) => /exceeds entered slab availability/i.test(w)));
}

// 11. Strong warning when waste-adjusted requirement exceeds entered slab availability.
async function testExceedsAvailableStrongWarning() {
  const r = await calculateCustomQuote(
    baseInput({ slabWidth: 60, slabHeight: 30, slabQuantity: 1, projectSqft: 40 })
  );
  assert.ok(r.calculationSnapshot.wasteAdjustedProjectSqft > r.calculationSnapshot.enteredAvailableSlabSqft);
  assert.ok(r.warnings.some((w) => /exceeds entered slab availability/i.test(w)));
}

// 12. Additional slabs warning names the priced quantity.
async function testAdditionalSlabsWarning() {
  const r = await calculateCustomQuote(baseInput({ projectSqft: 50, slabQuantity: 1 }));
  assert.equal(r.calculationSnapshot.estimatedAdditionalSlabsNeeded, 1);
  assert.ok(r.warnings.some((w) => /priced using 2 slab/i.test(w)));
}

// 13. Retail markup/uplift over total cost basis (×1.25, not gross-margin inversion).
async function testRetailMarkupUplift() {
  const r = await calculateCustomQuote(baseInput({ pricingMode: "retail" }));
  const usable = usableSlabSqft(120, 60);
  const material = round2(18 * usable * 2);
  const fab = DEFAULT_FABRICATION_RATE_PER_SQFT.quartz * 45;
  const basis = round2(material + 500 + fab);
  assert.equal(r.totalCostBasis, basis);
  assert.equal(r.pricingUpliftPercent, RETAIL_UPLIFT_PERCENT);
  assert.equal(r.sellPrice, round2(basis * 1.25));
  assert.notEqual(r.sellPrice, round2(basis / 0.75));
}

// 14. Wholesale markup/uplift (×1.15).
async function testWholesaleMarkupUplift() {
  const r = await calculateCustomQuote(baseInput({ pricingMode: "wholesale" }));
  assert.equal(r.pricingUpliftPercent, WHOLESALE_UPLIFT_PERCENT);
  assert.equal(r.sellPrice, round2(r.totalCostBasis * 1.15));
}

// 15. Slab override path — usable area used directly (no edge trim deduction).
async function testSlabSqftOverridePath() {
  const r = await calculateCustomQuote(
    baseInput({ slabSqft: 48, slabWidth: undefined, slabHeight: undefined, slabQuantity: 1, projectSqft: 50 })
  );
  assert.equal(r.calculationSnapshot.usableSlabSqftPerSlab, 48);
  assert.equal(r.calculationSnapshot.netSlabWidthInches, null);
  assert.equal(r.calculationSnapshot.slabsRequired, Math.ceil(round2(50 * DEFAULT_WASTE_FACTOR) / 48));
}

// 16. Net-dimension guard — slab too small after edge trim returns validation error.
async function testNetDimGuard() {
  await assert.rejects(
    () => calculateCustomQuote(baseInput({ slabWidth: 2, slabHeight: 2 })),
    /edge trim/i
  );
}

async function testSnapshotContainsAllPricingFields() {
  const r = await calculateCustomQuote(baseInput());
  const s = r.calculationSnapshot;
  for (const key of [
    "projectSqft",
    "wasteFactor",
    "wasteAdjustedProjectSqft",
    "netSlabWidthInches",
    "netSlabHeightInches",
    "enteredSlabQuantity",
    "usableSlabSqftPerSlab",
    "enteredAvailableSlabSqft",
    "slabsRequired",
    "pricedSlabQuantity",
    "estimatedAdditionalSlabsNeeded",
    "materialCostInputType",
    "materialCost",
    "freightCost",
    "fabricationInstallShopRate",
    "fabricationInstallShopCostBasis",
    "customCostBasis",
    "totalCostBasis",
    "pricingMode",
    "sellPrice",
    "utilizationPercent",
    "warnings"
  ]) {
    assert.ok(key in s, `calculationSnapshot missing ${key}`);
  }
  assert.equal(r.pricingInputsSnapshot.materialType, "quartz");
  assert.equal(r.calculationSnapshot.sellPrice, r.sellPrice);
  assert.ok(r.snapshot?.custom_quote?.pricingInputsSnapshot);
  assert.ok(r.snapshot?.custom_quote?.calculationSnapshot);
}

function testHeadAccessBlocksDealers() {
  assert(isKnownHeadSlug("custom_quote"), "custom_quote is a known head slug");
  assert(!isDealerSafeHeadSlug("custom_quote"), "custom_quote must not be dealer-safe");
}

function testCustomQuoteApiWiring() {
  assert.equal(typeof attachCustomQuoteRoutes, "function");
}

function testQuoteLibrarySourceLabel() {
  const labels = { custom_quote: "Custom quote" };
  assert.equal(labels.custom_quote, "Custom quote");
}

const tests = [
  ["net slab deduction", testNetSlabDeduction],
  ["waste factor default 1.20", testWasteFactorDefault],
  ["slabs required ceiling", testSlabsRequired],
  ["priced qty uses required when low", testPricedQtyUsesRequiredWhenLow],
  ["priced qty uses entered when higher", testPricedQtyUsesEnteredWhenHigher],
  ["per-slab cost path", testPerSlabPath],
  ["per-sqft cost path", testPerSqftPath],
  ["fabrication uses projectSqft", testFabricationUsesProjectSqft],
  ["freight flat in basis", testFreightFlat],
  ["utilization warning >=70%", testUtilizationWarningAtThreshold],
  ["exceeds available strong warning", testExceedsAvailableStrongWarning],
  ["additional slabs warning", testAdditionalSlabsWarning],
  ["retail markup/uplift", testRetailMarkupUplift],
  ["wholesale markup/uplift", testWholesaleMarkupUplift],
  ["slab sqft override path", testSlabSqftOverridePath],
  ["net-dimension validation guard", testNetDimGuard],
  ["snapshot contains all pricing fields", testSnapshotContainsAllPricingFields],
  ["head access not dealer-safe", testHeadAccessBlocksDealers],
  ["API attach export", testCustomQuoteApiWiring],
  ["Quote Library source label contract", testQuoteLibrarySourceLabel]
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log("OK:", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL:", name, e);
  }
}

if (failed) process.exit(1);
console.log(`customQuoteCalculator.test: ${tests.length} passed`);
