/**
 * Estimate-wide percentage + commercial configuration contracts.
 */
import assert from "node:assert/strict";
import { roundPublicEstimateToNearestTen } from "../quotes/quoteCalculator.js";
import {
  distributeEstimateWideAdjustment,
  resolveEffectiveEstimateWideAdjustment,
  computeEstimateWideAdjustmentAmount,
  normalizeEstimateWideAdjustment
} from "./studioEstimateWideAdjustment.mjs";
import { buildCommercialConfiguration } from "./studioCommercialConfiguration.mjs";
import { buildCustomerSafePriceGroups } from "./studioAiEstimatorSummary.mjs";
import {
  ELITE100_WATERFALL_LABOR_PER_LEG,
  ELITE100_BACKSIDE_POLISH,
  ELITE100_MITER_RATE_PER_LF
} from "./elite100RoomPricingCalculator.mjs";

console.log("\nestimateRecordCommercial.contract.test.mjs\n");

{
  assert.equal(ELITE100_WATERFALL_LABOR_PER_LEG, 600);
  assert.equal(ELITE100_BACKSIDE_POLISH, 225);
  assert.equal(ELITE100_MITER_RATE_PER_LF["2-3in"], 65);
  assert.equal(ELITE100_MITER_RATE_PER_LF["4in"], 70);
  assert.equal(ELITE100_MITER_RATE_PER_LF["5in"], 75);
  assert.equal(ELITE100_MITER_RATE_PER_LF["6in"], 80);
  console.log("ok: waterfall rates match v4 authority");
}

{
  const lines = [
    { id: "ct", amountExact: 3150, percentageEligible: true },
    { id: "tax", amountExact: 72, percentageEligible: true },
    { id: "bs", amountExact: 450, percentageEligible: true },
    { id: "sink", amountExact: 200, percentageEligible: true },
    { id: "vanity", amountExact: 100, percentageEligible: true },
    { id: "cook", amountExact: 150, percentageEligible: true }
  ];
  const base = 4122;
  assert.equal(
    lines.reduce((s, l) => s + l.amountExact, 0),
    base
  );
  assert.equal(roundPublicEstimateToNearestTen(base), 4130);

  const d = distributeEstimateWideAdjustment({ lines, percentage: 3 });
  assert.equal(d.exactAdjustment, 123.66);
  assert.equal(d.adjustedExactTotal, 4245.66);
  assert.equal(roundPublicEstimateToNearestTen(d.adjustedExactTotal), 4250);
  for (const row of d.lines) {
    assert.ok(Math.abs(row.adjustedExact / row.baseExact - 1.03) < 0.0002);
  }
  assert.equal(d.lines.some((l) => /surcharge|markup/i.test(l.id)), false);
  console.log("ok: 3% distributed fixture → $4,245.66 / display $4,250");
}

{
  const lines = [
    { id: "ct", amountExact: 3150, percentageEligible: true },
    { id: "tax", amountExact: 72, percentageEligible: true },
    { id: "bs", amountExact: 450, percentageEligible: true },
    { id: "sink", amountExact: 200, percentageEligible: true },
    { id: "vanity", amountExact: 100, percentageEligible: true },
    { id: "cook", amountExact: 150, percentageEligible: true },
    { id: "tearout", amountExact: 750, percentageEligible: true }
  ];
  const d = distributeEstimateWideAdjustment({ lines, percentage: 3 });
  assert.equal(d.baseExactTotal, 4872);
  assert.equal(d.exactAdjustment, 146.16);
  assert.equal(d.adjustedExactTotal, 5018.16);
  assert.equal(roundPublicEstimateToNearestTen(d.adjustedExactTotal), 5020);
  console.log("ok: Tear Out included → $5,018.16 / display $5,020");
}

{
  const lines = [
    { id: "ct", amountExact: 3150, percentageEligible: true },
    { id: "tax", amountExact: 72, percentageEligible: true },
    { id: "bs", amountExact: 450, percentageEligible: true },
    { id: "sink", amountExact: 200, percentageEligible: true },
    { id: "vanity", amountExact: 100, percentageEligible: true },
    { id: "cook", amountExact: 150, percentageEligible: true },
    { id: "tearout", amountExact: 750, percentageEligible: false }
  ];
  const d = distributeEstimateWideAdjustment({ lines, percentage: 3 });
  assert.equal(d.eligibleBaseExact, 4122);
  assert.equal(d.exactAdjustment, 123.66);
  assert.equal(d.adjustedExactTotal, 4122 + 123.66 + 750);
  const tear = d.lines.find((l) => l.id === "tearout");
  assert.equal(tear.exactAdjustment, 0);
  assert.equal(tear.adjustedExact, 750);
  console.log("ok: Tear Out excluded from percentage basis");
}

{
  const env = {
    ELITE100_TRUSTED_SPAHN_PARTNER_ACCOUNT_IDS: "spahn-1"
  };
  const auto = resolveEffectiveEstimateWideAdjustment({
    partnerAccountId: "spahn-1",
    env
  });
  assert.equal(auto.active, true);
  assert.equal(auto.percentage, 3);
  assert.equal(auto.source, "trusted_account_rule");

  const manualSame = resolveEffectiveEstimateWideAdjustment({
    scopeAdjustment: { active: true, percentage: 3, reason: "manual 3", source: "manual" },
    partnerAccountId: "spahn-1",
    env
  });
  assert.equal(manualSame.source, "trusted_account_rule");
  assert.equal(manualSame.percentage, 3);

  const manualOther = resolveEffectiveEstimateWideAdjustment({
    scopeAdjustment: { active: true, percentage: 5, reason: "manual 5", source: "manual" },
    partnerAccountId: "spahn-1",
    env
  });
  assert.equal(manualOther.percentage, 5);
  assert.equal(manualOther.source, "manual");
  console.log("ok: Spahn trusted rule consolidates; no duplicate stack at 3%");
}

{
  assert.equal(computeEstimateWideAdjustmentAmount(4122, 3), 123.66);
  const n = normalizeEstimateWideAdjustment({ active: true, percentage: 150 });
  assert.equal(n.percentage, 100);
  const z = normalizeEstimateWideAdjustment({ active: true, percentage: -3 });
  assert.equal(z.percentage, 0);
  console.log("ok: percentage clamp 0–100");
}

{
  const estimate = {
    revision: 1,
    status: "approved",
    approval: { approvedAt: "2026-07-29T12:00:00.000Z" },
    scope: {
      customLineItems: [
        {
          id: "tear",
          name: "Tear Out",
          customerDescription: "Tear Out",
          category: "Tear-out",
          quantity: 1,
          unitPrice: 750,
          customerFacing: true,
          commercialRole: "customer_charge",
          percentageEligible: true
        }
      ],
      estimateWideAdjustment: {
        active: true,
        percentage: 3,
        reason: "Spahn & Rose account pricing",
        source: "manual"
      },
      rooms: [
        {
          id: "bath",
          name: "Bathroom",
          roomType: "Bath",
          pieces: [{ name: "Vanity Top", lengthIn: 37, depthIn: 22.5, quantity: 1 }],
          vanityProgram: { useStandardPricing: true, additionalTrips: 0 },
          configuration: {
            waterfalls: [
              {
                id: "wf1",
                side: "left",
                legHeightIn: 36,
                targetPieceId: "island",
                backsidePolish: true,
                customerOptional: true,
                miterKey: "2-3in"
              }
            ]
          }
        }
      ]
    },
    calculation: {
      totals: {
        exactTotal: 5018.16,
        accountAdjustment: 146.16,
        customerDisplayTotal: 5020
      }
    }
  };
  const commercial = buildCommercialConfiguration(estimate);
  assert.equal(commercial.customLines.length, 1);
  assert.equal(commercial.customLines[0].amountExact, 750);
  assert.equal(commercial.estimateAdjustment.active, true);
  assert.equal(commercial.estimateAdjustment.percentage, 3);
  assert.equal(commercial.vanityPrograms.length, 1);
  assert.equal(commercial.waterfalls.length, 1);
  assert.equal(commercial.waterfalls[0].customerOptional, true);

  const groups = buildCustomerSafePriceGroups({
    ...estimate,
    calculation: {
      ...estimate.calculation,
      reviewSummary: {
        countertopMaterialTotal: 3150,
        backsplashTotal: 450,
        materialTaxTotal: 72,
        fabricationTotal: 450,
        cutoutLines: [
          { label: "Kitchen sink cutout", amount: 200 },
          { label: "Vanity/bar sink cutout", amount: 100 },
          { label: "Cooktop cutout", amount: 150 }
        ]
      }
    }
  });
  assert.equal(groups.some((g) => /surcharge|markup|percentage/i.test(g.label)), false);
  const tear = groups.find((g) => /tear/i.test(g.label));
  assert.ok(tear, "Tear Out appears once");
  assert.ok(Math.abs(tear.amount - 750 * 1.03) < 0.02);
  console.log("ok: commercialConfiguration read model + no customer surcharge line");
}

{
  // Browser-supplied totals / pre-adjusted amounts must not drive distribution.
  const d = distributeEstimateWideAdjustment({
    lines: [
      {
        id: "ct",
        amountExact: 1000,
        percentageEligible: true,
        adjustedExact: 9999,
        exactAdjustment: 8888
      }
    ],
    percentage: 3,
    clientAdjustedExactTotal: 1,
    exactTotal: 99999,
    totals: { exactTotal: 1 }
  });
  assert.equal(d.baseExactTotal, 1000);
  assert.equal(d.exactAdjustment, 30);
  assert.equal(d.adjustedExactTotal, 1030);
  assert.equal(d.lines[0].adjustedExact, 1030);
  console.log("ok: browser-supplied totals/adjusted amounts ignored");
}

{
  const estimate = {
    revision: 1,
    status: "approved",
    scope: {
      customLineItems: [
        {
          id: "hidden",
          name: "Internal cost",
          customerDescription: "Internal cost",
          category: "Other",
          quantity: 1,
          unitPrice: 500,
          customerFacing: false,
          commercialRole: "internal_only",
          percentageEligible: false
        }
      ],
      estimateWideAdjustment: { active: true, percentage: 3, source: "manual" },
      rooms: []
    },
    calculation: {
      totals: { exactTotal: 4122, accountAdjustment: 123.66 },
      reviewSummary: {
        countertopMaterialTotal: 3150,
        backsplashTotal: 450,
        materialTaxTotal: 72,
        fabricationTotal: 450,
        cutoutLines: []
      }
    }
  };
  const commercial = buildCommercialConfiguration(estimate);
  assert.equal(commercial.customLines[0].internalOnly, true);
  assert.equal(commercial.customLines[0].customerVisible, false);
  const blob = JSON.stringify(commercial);
  assert.equal(/margin|laborRate|serviceRole|apiKey/i.test(blob), false);
  const groups = buildCustomerSafePriceGroups(estimate);
  assert.equal(groups.some((g) => /internal/i.test(g.label)), false);
  console.log("ok: internal-only lines and rates do not leak to customer-safe groups");
}

console.log("\nAll estimateRecordCommercial contract tests passed.\n");
