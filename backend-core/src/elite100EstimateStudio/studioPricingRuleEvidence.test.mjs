/**
 * The publication pin is built from the rates the real Studio calculation used.
 * Run: node backend-core/src/elite100EstimateStudio/studioPricingRuleEvidence.test.mjs
 */
import assert from "node:assert/strict";

import { calculateStudioEstimateV4 } from "./elite100RoomPricingStudioAdapter.mjs";
import { buildStudioPricingRuleEvidence } from "./studioEstimatePublicationAdapter.mjs";
import { emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import {
  PIN_RULE_SPAHN_TRUSTED_ACCOUNT,
  pinForNewPublication,
  resolvePublicationPricingPin
} from "../digitalEstimate/configuration/publicationPricingPin.mjs";

const WATTS = "acct-watts-synthetic";
const ENV_WATTS = { ELITE100_TRUSTED_WATTS_PARTNER_ACCOUNT_IDS: WATTS };

function scope(overrides = {}) {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Synthetic",
    projectName: "Kitchen",
    pricingBasis: "direct",
    materialGroup: "Group B",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        materialGroup: overrides.materialGroup || "Group B",
        pieces: [
          { id: "run-1", name: "Sink run", pieceType: "counter", included: true, lengthIn: 96, depthIn: 25.5, quantity: 1, sqft: 17 }
        ]
      }
    ],
    addOns: { "qty-sink": 1 },
    ...overrides
  };
}

async function pinFor(s, env = {}) {
  const calc = await calculateStudioEstimateV4({ scope: s, env });
  const evidence = buildStudioPricingRuleEvidence(calc, { scope: s });
  const basis = s.pricingBasis === "wholesale" ? "wholesale" : "direct";
  return { calc, evidence, pin: pinForNewPublication({ pricingBasis: basis, pricingRuleEvidence: evidence }) };
}

// Plain retail calculation: the pin reproduces the room's rate and is repriceable.
{
  const { calc, evidence, pin } = await pinFor(scope());
  const room = calc.elite100.rooms[0];
  assert.equal(evidence.rooms[0].ratePerSf, room.materialRatePerSf);
  assert.equal(pin.source, "calculation");
  assert.equal(pin.pricingBasis, "direct");
  assert.equal(pin.rates.direct.group_b, room.materialRatePerSf);
  assert.deepEqual(pin.repricingBlockedReasons, []);
  assert.equal(resolvePublicationPricingPin({ pricingPin: pin }).ok, true);
  console.log(`ok: real calculation pins Group B at $${room.materialRatePerSf} (retail), repriceable`);
}

// Wholesale calculation pins the wholesale basis and rate.
{
  const { calc, pin } = await pinFor(scope({ pricingBasis: "wholesale" }));
  assert.equal(pin.pricingBasis, "wholesale");
  assert.equal(pin.rates.wholesale.group_b, calc.elite100.rooms[0].materialRatePerSf);
  assert.deepEqual(pin.repricingBlockedReasons, []);
  console.log("ok: real wholesale calculation pins the wholesale basis");
}

// Watts account on Promo: the calculation used $40, and so does the pin.
{
  const { calc, pin } = await pinFor(scope({ partnerAccountId: WATTS, materialGroup: "Group Promo" }), ENV_WATTS);
  assert.equal(calc.elite100.rooms[0].materialRatePerSf, 40);
  assert.equal(calc.elite100.rooms[0].wattsOverrideApplied, true);
  assert.equal(pin.rates.direct.promo, 40);
  assert.deepEqual(pin.repricingBlockedReasons, []);
  console.log("ok: real Watts Promo calculation pins $40");
}

// Estimate-wide adjustment (e.g. Spahn & Rose or manual): the customer path cannot reproduce
// it, so the pin blocks repricing instead of silently dropping it.
{
  const { calc, pin } = await pinFor(
    scope({ estimateWideAdjustment: { active: true, percentage: 3, reason: "s&r", source: "manual" } })
  );
  assert.ok(Number(calc.totals.accountAdjustment) > 0);
  assert.ok(pin.repricingBlockedReasons.some((r) => r.startsWith("estimate_wide_adjustment")));
  const resolved = resolvePublicationPricingPin({ pricingPin: pin });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "pricing_rules_not_reproducible");
  console.log("ok: real calculation with an estimate-wide adjustment pins a blocked rate set");
}

// Spahn & Rose trusted account: the 3% is pinned as a rule (applied to customer deltas), not blocked.
{
  const SPAHN = "acct-spahn-synthetic";
  const { calc, pin } = await pinFor(scope({ partnerAccountId: SPAHN }), {
    ELITE100_TRUSTED_SPAHN_PARTNER_ACCOUNT_IDS: SPAHN
  });
  assert.ok(Number(calc.totals.accountAdjustment) > 0);
  assert.equal(calc.totals.estimateWideAdjustment.source, "trusted_account_rule");
  assert.ok(pin.rules.includes(PIN_RULE_SPAHN_TRUSTED_ACCOUNT));
  assert.deepEqual(pin.repricingBlockedReasons, []);
  console.log("ok: real Spahn & Rose calculation pins the 3% rule and stays repriceable");
}

// Same inputs → same technical id; different rates → different id.
{
  const a = (await pinFor(scope())).pin;
  const b = (await pinFor(scope())).pin;
  const w = (await pinFor(scope({ pricingBasis: "wholesale" }))).pin;
  assert.equal(a.rateSetId, b.rateSetId);
  assert.notEqual(a.rateSetId, w.rateSetId);
  console.log("ok: rateSetId is deterministic and content-addressed");
}

console.log("\nAll Studio pricing-rule evidence tests passed.");
