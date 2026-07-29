/**
 * Regression: one kitchen sink opening → exactly one $200 cutout charge;
 * one vanity/bar sink opening → exactly one $100 cutout charge.
 *
 * Proves the authoritative v4 calculator does not double-charge openings
 * via qty-sink / qty-bar Studio addOns. Display labels on Digital Estimate
 * may differ; the customer-impact cutout total must not duplicate.
 */
import assert from "node:assert/strict";
import { calculateElite100StudioEstimate } from "./elite100RoomPricingStudioAdapter.mjs";
import { ELITE100_CUTOUT_RATES } from "./elite100RoomPricingCalculator.mjs";

function kitchenScope(addOns) {
  return {
    materialGroup: "Group Promo",
    pricingBasis: "direct",
    edgeEligibleLinearFeet: 10,
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          {
            id: "p1",
            name: "Sink wall",
            pieceType: "counter",
            measurementMode: "dimensions",
            lengthIn: 96,
            depthIn: 25.5,
            quantity: 1,
            included: true
          }
        ]
      }
    ],
    addOns
  };
}

function vanityScope(addOns) {
  return {
    materialGroup: "Group Promo",
    pricingBasis: "direct",
    edgeEligibleLinearFeet: 6,
    rooms: [
      {
        id: "room-bath",
        name: "Bathroom",
        roomType: "Vanity",
        included: true,
        pieces: [
          {
            id: "p1",
            name: "Vanity top",
            pieceType: "counter",
            measurementMode: "dimensions",
            lengthIn: 60,
            depthIn: 22,
            quantity: 1,
            included: true
          }
        ]
      }
    ],
    addOns
  };
}

function cutoutLineAmounts(result) {
  const room = result.customerFacing?.rooms?.[0] || result.rooms?.[0];
  return (room?.lineItems || [])
    .filter((li) => /cutout/i.test(String(li.label || "")))
    .map((li) => Number(li.amount) || 0);
}

console.log("\ncutoutSingleCharge.regression.test.mjs\n");

assert.equal(ELITE100_CUTOUT_RATES.kitchenSink, 200);
assert.equal(ELITE100_CUTOUT_RATES.vanitySink, 100);

{
  const result = await calculateElite100StudioEstimate({
    scope: kitchenScope({ "qty-sink": 1 }),
    env: {}
  });
  const room = result.rooms[0];
  assert.equal(room.cutouts.kitchenSinkQty, 1);
  assert.equal(room.cutouts.kitchenSinkCharge, 200, "exactly one $200 kitchen sink cutout");
  assert.equal(room.cutoutsTotal, 200, "cutoutsTotal is $200 for one kitchen sink");
  const cutoutLines = cutoutLineAmounts(result);
  assert.equal(cutoutLines.length, 1, "customer-facing Cutouts line appears once");
  assert.equal(cutoutLines[0], 200);
  const cutoutImpact = cutoutLines.reduce((s, n) => s + n, 0);
  assert.equal(cutoutImpact, 200, "customerFacing cutout impact is $200 once");
  console.log("ok: one kitchen sink → exactly one $200 cutout charge");
}

{
  const result = await calculateElite100StudioEstimate({
    scope: vanityScope({ "qty-bar": 1 }),
    env: {}
  });
  const room = result.rooms[0];
  assert.equal(room.cutouts.vanitySinkQty, 1);
  assert.equal(room.cutouts.vanitySinkCharge, 100, "exactly one $100 vanity/bar cutout");
  assert.equal(room.cutoutsTotal, 100, "cutoutsTotal is $100 for one vanity/bar sink");
  const cutoutLines = cutoutLineAmounts(result);
  assert.equal(cutoutLines.length, 1, "customer-facing Cutouts line appears once");
  assert.equal(cutoutLines[0], 100);
  console.log("ok: one vanity/bar sink → exactly one $100 cutout charge");
}

console.log("\nAll cutout single-charge regressions passed.\n");
