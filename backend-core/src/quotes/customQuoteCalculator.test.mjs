/**
 * Custom Quote calculator tests.
 *
 * Run: npm run eos:test:custom-quote
 */
import assert from "node:assert/strict";

import { calculateCustomQuote } from "./customQuoteCalculator.js";
import {
  DEFAULT_FABRICATION_RATE_PER_SQFT,
  RETAIL_UPLIFT_PERCENT,
  WHOLESALE_UPLIFT_PERCENT
} from "./customQuotePricingResolver.js";
import { isDealerSafeHeadSlug, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { attachCustomQuoteRoutes } from "./customQuotesApi.js";

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

async function testRetailMarkupUplift() {
  const r = await calculateCustomQuote(baseInput({ pricingMode: "retail" }));
  const slabSqft = (120 * 60) / 144;
  const material = 18 * slabSqft * 2;
  const fab = DEFAULT_FABRICATION_RATE_PER_SQFT.quartz * 45;
  const basis = material + 500 + fab;
  assert.equal(r.totalCostBasis, Math.round(basis * 100) / 100);
  assert.equal(r.pricingUpliftPercent, RETAIL_UPLIFT_PERCENT);
  assert.equal(r.sellPrice, Math.round(basis * 1.25 * 100) / 100);
  assert.notEqual(r.sellPrice, Math.round((basis / 0.75) * 100) / 100);
}

async function testWholesaleMarkupUplift() {
  const r = await calculateCustomQuote(baseInput({ pricingMode: "wholesale" }));
  assert.equal(r.pricingUpliftPercent, WHOLESALE_UPLIFT_PERCENT);
  assert.equal(r.sellPrice, Math.round(r.totalCostBasis * 1.15 * 100) / 100);
}

async function testGraniteFabricationDefault() {
  const r = await calculateCustomQuote(baseInput({ materialType: "granite", projectSqft: 10 }));
  assert.equal(r.fabricationCost, DEFAULT_FABRICATION_RATE_PER_SQFT.granite * 10);
}

async function testCostPerSlab() {
  const r = await calculateCustomQuote(
    baseInput({
      costPerSlab: 2200,
      costPerSqft: undefined,
      slabQuantity: 3
    })
  );
  assert.equal(r.materialCost, 6600);
}

async function testFreightIncludedInBasis() {
  const r = await calculateCustomQuote(baseInput({ freightCostToEsf: 750 }));
  assert.ok(r.totalCostBasis >= r.materialCost + 750);
  assert.equal(r.freightCost, 750);
}

async function testUtilizationWarningAbove70() {
  const r = await calculateCustomQuote(
    baseInput({
      slabWidth: 60,
      slabHeight: 30,
      slabQuantity: 1,
      projectSqft: 40
    })
  );
  assert.ok(r.utilizationPercent > 70);
  assert.ok(r.warnings.some((w) => /utilization/i.test(w)));
}

async function testMultiplierWarningBelow225() {
  const r = await calculateCustomQuote(baseInput());
  assert.ok(r.multiplier < 2.25);
  assert.ok(r.warnings.some((w) => /multiplier/i.test(w)));
}

async function testSnapshotContainsPricingInputsAndOutputs() {
  const r = await calculateCustomQuote(baseInput());
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
  ["retail markup/uplift", testRetailMarkupUplift],
  ["wholesale markup/uplift", testWholesaleMarkupUplift],
  ["granite fabrication default", testGraniteFabricationDefault],
  ["cost per slab", testCostPerSlab],
  ["freight in cost basis", testFreightIncludedInBasis],
  ["utilization warning >70%", testUtilizationWarningAbove70],
  ["multiplier warning <2.25", testMultiplierWarningBelow225],
  ["snapshot inputs/outputs", testSnapshotContainsPricingInputsAndOutputs],
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
