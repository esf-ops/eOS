/**
 * Public API rejects crafted governed scope quantity saves.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseGovernedScopeQuantityReject.test.mjs
 */
import assert from "node:assert/strict";
import { rejectGovernedScopeQuantitySelections } from "./publicConfigurationService.mjs";
import { resolveEdgeOptionPriceEffect } from "../catalog/studioEdgeAuthority.mjs";

console.log("\nphaseGovernedScopeQuantityReject.test.mjs\n");

const cases = [
  "qty-cook",
  "qty-sink",
  "qty-bar",
  "qty-outlet",
  "qty-ss",
  "tearout",
  "waterfall",
  "popup_outlet_cutout",
  "qty-sink:kitchen",
];

for (const key of cases) {
  assert.throws(
    () => rejectGovernedScopeQuantitySelections([{ optionKey: key, quantity: 1 }]),
    (err) => err && err.code === "governed_scope_quantity_forbidden",
    `reject ${key}`,
  );
}

rejectGovernedScopeQuantitySelections([]);
rejectGovernedScopeQuantitySelections([{ optionKey: "edge:kitchen:edge_small_ogee", quantity: 1 }]);
rejectGovernedScopeQuantitySelections([{ optionKey: "qty-cook", quantity: 0 }]);
console.log("ok: governed fabrication quantity keys rejected");

// Premium edge with LF + rate must not be review-required
const premium = resolveEdgeOptionPriceEffect({
  profileToken: "edge_small_ogee",
  originalProfileToken: "edge_eased",
  edgeLinearFeet: 12.5,
  pricingBasis: "direct",
});
assert.match(premium.priceEffectLabel, /^\+\$/);
assert.equal(premium.customerPriceTreatment, "delta");
assert.equal(premium.reviewReasonCode, null);

const noLf = resolveEdgeOptionPriceEffect({
  profileToken: "edge_crescent",
  originalProfileToken: "edge_eased",
  edgeLinearFeet: 0,
  pricingBasis: "direct",
});
assert.equal(noLf.priceEffectLabel, "Elite will confirm this option and price.");
assert.equal(noLf.reviewReasonCode, "missing_edge_lf");
console.log("ok: premium edge immediate effect vs missing-LF review");

console.log("\nphaseGovernedScopeQuantityReject: all checks passed\n");
