/**
 * Customer-facing copy + room eligibility + accessory family expansion.
 * Run: node backend-core/src/digitalEstimate/catalog/customerFacingCopy.test.mjs
 */
import assert from "node:assert/strict";
import {
  conciseCustomerTitle,
  customerFacingProductCopy,
  customerPriceEffectLabel,
  isAccessoryFamilyHeading,
  looksLikeUuid,
  sideSplashPieceDisplayName,
  stripInternalChannelTerms
} from "./customerFacingCopy.mjs";
import {
  buildAccessoryOptionDefinitions,
  buildSideSplashOptionDefinitions,
  buildSinkOptionDefinitions,
  buildSpecialtyOptionDefinitions,
  inferRoomEligibilityType
} from "./digitalEstimateProductOptions.mjs";
import { toPublicConfigurationOption } from "../configuration/configurationPublicSerializer.mjs";
import { listProducts } from "./esfPlumbingCatalog.mjs";

assert.equal(stripInternalChannelTerms("Foo Wholesale and Partner (15 W)"), "Foo (15 W)");
assert.equal(
  customerFacingProductCopy({
    displayName: "Free Power 3 Device Charging Station Wholesale and Partner (15 W)"
  }).displayName,
  "FreePower 3-Device Charging Station"
);
assert.equal(
  customerFacingProductCopy({
    displayName:
      "Glowback LED panels are custom made for each project to fit the dimensions of each piece."
  }).displayName,
  "Glowback LED Backlighting"
);
assert.ok(
  !/Wholesale|Partner|Direct/i.test(
    customerFacingProductCopy({
      displayName: "Free Power 3 Device Charging Station Wholesale and Partner (15 W)"
    }).displayName
  )
);

assert.equal(looksLikeUuid("d1c2b3a4-f5e6-4d7c-8b9a-0a1b2c3d4e5f"), true);
assert.equal(
  looksLikeUuid("d1c2b3a4 f5e6 4d7c 8b9a 0a1b2c3d4e5f"),
  true
);
assert.equal(sideSplashPieceDisplayName("Island top", 1), "Island top");
assert.equal(
  sideSplashPieceDisplayName("d1c2b3a4-f5e6-4d7c-8b9a-0a1b2c3d4e5f", 2),
  "Countertop piece 2"
);

assert.equal(inferRoomEligibilityType({ name: "Kitchen" }), "kitchen");
assert.equal(inferRoomEligibilityType({ name: "Coffee Bar" }), "bar_prep");
assert.equal(inferRoomEligibilityType({ name: "Reception Desk" }), "non_plumbing");

const kitchenSinks = buildSinkOptionDefinitions({
  roomKey: "kitchen",
  roomType: "kitchen",
  includeEsfProducts: true
});
const coffeeSinks = buildSinkOptionDefinitions({
  roomKey: "coffee",
  roomType: "bar_prep",
  includeEsfProducts: true
});
const receptionSinks = buildSinkOptionDefinitions({
  roomKey: "reception",
  roomType: "non_plumbing",
  includeEsfProducts: true
});
const kitchenEsf = kitchenSinks.filter((o) => o.optionKey.includes(":esf:"));
const coffeeEsf = coffeeSinks.filter((o) => o.optionKey.includes(":esf:"));
const receptionEsf = receptionSinks.filter((o) => o.optionKey.includes(":esf:"));
assert.ok(kitchenEsf.length > 5, `kitchen should have many sinks, got ${kitchenEsf.length}`);
assert.ok(coffeeEsf.length >= 1 && coffeeEsf.length < kitchenEsf.length);
assert.equal(receptionEsf.length, 0, "reception must not inherit kitchen sink catalog");
assert.ok(receptionSinks.some((o) => o.optionKey.endsWith(":none")));
assert.ok(receptionSinks.some((o) => o.optionKey.endsWith(":customer_provided")));

console.log(
  JSON.stringify({
    kitchenEsf: kitchenEsf.length,
    coffeeEsf: coffeeEsf.length,
    receptionEsf: receptionEsf.length,
    totalActiveSinks: listProducts({ category: "sink", customerVisibleOnly: true }).filter(
      (p) => p.active
    ).length
  })
);

const sides = buildSideSplashOptionDefinitions({
  roomKey: "kitchen",
  pieces: [
    { id: "d1c2b3a4-f5e6-4d7c-8b9a-0a1b2c3d4e5f", name: "Island top", depthIn: 25.5 },
    { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", name: "", depthIn: 24 }
  ]
});
for (const o of sides) {
  assert.ok(!looksLikeUuid(o.displayLabel), o.displayLabel);
  assert.ok(!/d1c2b3a4/i.test(o.displayLabel), o.displayLabel);
}
assert.ok(sides.some((o) => /Island top/.test(o.displayLabel)));
assert.ok(sides.some((o) => /Countertop piece 2/.test(o.displayLabel)));
assert.equal(sides[0].compatibilityJson.pieceKey, "d1c2b3a4-f5e6-4d7c-8b9a-0a1b2c3d4e5f");

const accessories = buildAccessoryOptionDefinitions({
  roomKey: "kitchen",
  roomType: "kitchen"
});
assert.ok(
  !accessories.some((o) => /Accessories$/i.test(o.displayLabel) && !o.compatibilityJson.variantId),
  "family heading rows must not be selectable without variant expansion"
);
assert.ok(accessories.some((o) => o.compatibilityJson.variantId));
assert.ok(accessories.every((o) => !o.optionKey.includes("::")));
assert.ok(accessories.some((o) => o.compatibilityJson.accessoryKind === "sink_accessory"));
assert.ok(accessories.some((o) => o.compatibilityJson.accessoryKind === "plumbing_addon"));

const specialty = buildSpecialtyOptionDefinitions({
  roomKey: "kitchen",
  roomType: "kitchen"
});
for (const o of specialty) {
  assert.ok(!/Wholesale|Partner|\bDirect\b/i.test(o.displayLabel), o.displayLabel);
}
assert.ok(specialty.some((o) => /Glowback/i.test(o.displayLabel)));
assert.ok(specialty.some((o) => /InvisaCook/i.test(o.displayLabel)));

const priced = toPublicConfigurationOption({
  option_key: "specialty:kitchen:esf:x",
  display_label: "Free Power Wholesale",
  customer_price_treatment: "absolute",
  sell_price: 650,
  included_in_baseline: false,
  availability_state: "active"
});
assert.ok(!/Wholesale/i.test(priced.displayLabel));
assert.equal(priced.priceEffectLabel, "+$650");

const included = toPublicConfigurationOption({
  option_key: "edge:kitchen:edge_eased",
  display_label: "Eased",
  customer_price_treatment: "delta",
  sell_price: 0,
  included_in_baseline: true
});
assert.equal(included.priceEffectLabel, "Original selection");

const review = toPublicConfigurationOption({
  option_key: "specialty:kitchen:esf:glow",
  display_label: "Glowback",
  customer_price_treatment: "review_required",
  sell_price: 0,
  compatibility_json: { estimatorReviewRequired: true }
});
assert.equal(review.priceEffectLabel, "Requires estimator review");

assert.equal(isAccessoryFamilyHeading({ displayName: "Diamond 50/50 Accessories", variants: [{}] }), true);
assert.equal(isAccessoryFamilyHeading({ displayName: "3018 Grid", variants: [] }), false);
assert.equal(conciseCustomerTitle("221008 Diamond Grid For 50/50 Left Side"), "Diamond Grid For 50/50 Left Side");
assert.equal(customerPriceEffectLabel({ includedInBaseline: true }), "Original selection");
assert.equal(customerPriceEffectLabel({ customerPriceTreatment: "no_change" }), "No change");
assert.equal(customerPriceEffectLabel({ visibleDelta: -120 }), "−$120");

console.log("ok: customerFacingCopy + room eligibility + accessories + specialty polish");
