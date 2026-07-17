/**
 * Studio estimate pricing authority tests.
 * Run: node backend-core/src/elite100EstimateStudio/studioEstimatePricing.test.mjs
 */
import assert from "node:assert/strict";
import {
  ESF_DIRECT_PRICE_PER_SQFT,
  PROTOTYPE_TIER_PRICE_PER_SQFT,
  UPGRADED_EDGE_RATE_DIRECT_V2,
  UPGRADED_EDGE_RATE_WHOLESALE_V2
} from "../quotes/quoteCalculator.js";
import {
  calculateStudioEstimate,
  resolveStudioWEdgeRatePerLf,
  STUDIO_D_EDGE_RATE_PER_LF
} from "./studioEstimatePricing.mjs";
import {
  resolveStudioMaterialRatePerSf,
  WATTS_PROMO_RATE_PER_SF
} from "./studioEstimateTrustedAccounts.mjs";

const WATTS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPAHN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_MARKUP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

console.log("\nstudioEstimatePricing.test.mjs\n");

{
  // DECISION: Wholesale Remnant = $50 (calculator authority). Product brief $45 equals Promo wholesale
  // and would shadow Remnant → Promo; pricingAuthority.contract locks $50.
  assert.equal(ESF_DIRECT_PRICE_PER_SQFT.Remnant, 50);
  assert.equal(PROTOTYPE_TIER_PRICE_PER_SQFT.Remnant, 50);
  assert.notEqual(PROTOTYPE_TIER_PRICE_PER_SQFT.Remnant, PROTOTYPE_TIER_PRICE_PER_SQFT["Group Promo"]);
  console.log("ok: Remnant Direct+Wholesale = $50 (explicit; not product-brief $45)");
}

{
  assert.equal(UPGRADED_EDGE_RATE_WHOLESALE_V2, 15);
  assert.equal(UPGRADED_EDGE_RATE_DIRECT_V2, 25);
  assert.equal(resolveStudioWEdgeRatePerLf("wholesale"), 15);
  assert.equal(resolveStudioWEdgeRatePerLf("direct"), 25);
  assert.equal(STUDIO_D_EDGE_RATE_PER_LF, 25);
  console.log("ok: W edge is basis-dependent ($15 wholesale / $25 direct); D edge $25");
}

{
  for (const [group, rate] of Object.entries(ESF_DIRECT_PRICE_PER_SQFT)) {
    const r = resolveStudioMaterialRatePerSf({
      materialGroup: group,
      pricingBasis: "direct",
      env: {}
    });
    assert.equal(r.rate, rate, `direct ${group}`);
  }
  for (const [group, rate] of Object.entries(PROTOTYPE_TIER_PRICE_PER_SQFT)) {
    const r = resolveStudioMaterialRatePerSf({
      materialGroup: group,
      pricingBasis: "wholesale",
      env: {}
    });
    assert.equal(r.rate, rate, `wholesale ${group}`);
  }
  console.log("ok: Direct and Wholesale material groups match calculator tables");
}

{
  const env = {
    ELITE100_TRUSTED_WATTS_PARTNER_ACCOUNT_IDS: WATTS_ID,
    ELITE100_TRUSTED_SPAHN_PARTNER_ACCOUNT_IDS: SPAHN_ID,
    ELITE100_INTERNAL_MARKUP_ALLOWED_USER_IDS: USER_MARKUP
  };
  const baseRooms = [
    {
      id: "r1",
      name: "Kitchen",
      included: true,
      countertopSqft: 100,
      backsplashSqft: 0,
      pieces: []
    }
  ];

  const rem = await calculateStudioEstimate({
    scope: {
      materialGroup: "Remnant",
      pricingBasis: "wholesale",
      rooms: baseRooms,
      addOns: {},
      edgeMode: "included"
    },
    actorUserId: USER_MARKUP,
    env
  });
  assert.equal(rem.material.ratePerSf, 50);
  assert.equal(rem.material.subtotal, 5000);
  assert.equal(rem.material.useTaxAmount, 100);
  assert.equal(rem.material.useTaxPercent, 2);

  const wEdge = await calculateStudioEstimate({
    scope: {
      materialGroup: "Group Promo",
      pricingBasis: "wholesale",
      rooms: [{ ...baseRooms[0], countertopSqft: 10 }],
      addOns: {},
      edgeMode: "w_edge",
      edgeLinearFeet: 10
    },
    actorUserId: USER_MARKUP,
    env
  });
  assert.equal(wEdge.fabrication.subtotal, 150); // 10 LF × $15

  const wEdgeDirect = await calculateStudioEstimate({
    scope: {
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      rooms: [{ ...baseRooms[0], countertopSqft: 10 }],
      addOns: {},
      edgeMode: "w_edge",
      edgeLinearFeet: 10
    },
    actorUserId: USER_MARKUP,
    env
  });
  assert.equal(wEdgeDirect.fabrication.subtotal, 250); // 10 LF × $25

  const dEdge = await calculateStudioEstimate({
    scope: {
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      rooms: [{ ...baseRooms[0], countertopSqft: 10 }],
      addOns: {},
      edgeMode: "d_edge",
      edgeLinearFeet: 4
    },
    actorUserId: USER_MARKUP,
    env
  });
  assert.equal(dEdge.fabrication.subtotal, 100); // 4 × $25

  const watts = await calculateStudioEstimate({
    scope: {
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      partnerAccountId: WATTS_ID,
      rooms: baseRooms,
      addOns: {}
    },
    actorUserId: USER_MARKUP,
    env
  });
  assert.equal(watts.material.ratePerSf, WATTS_PROMO_RATE_PER_SF);
  assert.equal(watts.material.wattsOverrideApplied, true);

  const spahn = await calculateStudioEstimate({
    scope: {
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      partnerAccountId: SPAHN_ID,
      rooms: baseRooms,
      addOns: { "qty-sink": 1 },
      internalMarkupPercent: 10
    },
    actorUserId: USER_MARKUP,
    env
  });
  // material 7000 + tax 140 + sink 200 = 7340; spahn 3% = 220.2; markup 700; internal 8260.2
  assert.equal(spahn.material.useTaxAmount, 140);
  assert.equal(spahn.account.accountAdjustment, 220.2);
  assert.equal(spahn.internalMarkup.amount, 700);
  assert.equal(spahn.totals.customerDisplayTotal, 7560.2);
  assert.equal(spahn.totals.exactInternalTotal, 8260.2);
  assert.equal(spahn.internalMarkup.customerVisible, false);
  assert.ok(spahn.totals.customerDisplayTotal < spahn.totals.exactInternalTotal);
  console.log("ok: use tax once; Watts; Spahn after tax; markup excluded from customer total");
}

console.log("\nAll studioEstimatePricing tests passed.\n");
