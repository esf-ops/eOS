/**
 * Customer-visible cutout lines: one canonical label per governed charge.
 * Run: node backend-core/src/elite100EstimateStudio/customerSafeCutoutDisplay.test.mjs
 */
import assert from "node:assert/strict";
import { calculateElite100StudioEstimate } from "./elite100RoomPricingStudioAdapter.mjs";
import {
  CUSTOMER_SAFE_CUTOUT_LABELS,
  dedupeCustomerSafeCutoutLines,
  customerSafeCutoutLinesFromCharges
} from "./customerSafeCutoutPresentation.mjs";
import { buildCustomerSafePriceGroups } from "./studioAiEstimatorSummary.mjs";
import { buildUpdatedRoomPricingProjection } from "../digitalEstimate/configuration/customerRoomPricingProjection.mjs";
import { cutoutDisplayLabelForRoom } from "../digitalEstimate/catalog/roomEligibility.mjs";

console.log("\ncustomerSafeCutoutDisplay.test.mjs\n");

assert.equal(cutoutDisplayLabelForRoom("kitchen", "Kitchen"), CUSTOMER_SAFE_CUTOUT_LABELS.kitchenSink);
assert.equal(cutoutDisplayLabelForRoom("vanity", "Bath"), CUSTOMER_SAFE_CUTOUT_LABELS.vanityBarSink);

{
  const lines = dedupeCustomerSafeCutoutLines(
    [
      { label: "Kitchen — Sink cutout", amount: 200 },
      { label: "Kitchen Sink Cutouts", amount: 200 },
      { label: "Countertop Material", amount: 1000 }
    ],
    { amountUnit: "dollars" }
  );
  const cutouts = lines.filter((l) => /cutout/i.test(l.label));
  assert.equal(cutouts.length, 1);
  assert.equal(cutouts[0].label, CUSTOMER_SAFE_CUTOUT_LABELS.kitchenSink);
  assert.equal(cutouts[0].amount, 200);
  console.log("ok: alias kitchen cutout lines collapse to one $200 line");
}

{
  const lines = dedupeCustomerSafeCutoutLines(
    [
      { label: "Bathroom — Vanity sink cutout", amountCents: 10000 },
      { label: "Vanity/Bar Sink Cutouts", amountCents: 10000 }
    ],
    { amountUnit: "cents" }
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].label, CUSTOMER_SAFE_CUTOUT_LABELS.vanityBarSink);
  assert.equal(lines[0].amountCents, 10000);
  console.log("ok: alias vanity cutout lines collapse to one $100 line");
}

{
  const result = await calculateElite100StudioEstimate({
    scope: {
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      edgeEligibleLinearFeet: 8,
      rooms: [
        {
          id: "room-kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          included: true,
          pieces: [
            {
              id: "p1",
              name: "Run",
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
      addOns: { "qty-sink": 1 }
    },
    env: {}
  });
  const cfLines = result.customerFacing.rooms[0].lineItems.filter((l) => /cutout/i.test(l.label));
  assert.equal(cfLines.length, 1);
  assert.equal(cfLines[0].label, CUSTOMER_SAFE_CUTOUT_LABELS.kitchenSink);
  assert.equal(cfLines[0].amount, 200);
  assert.equal(
    result.rooms[0].cutouts.kitchenSinkCharge,
    200,
    "authoritative charge unchanged"
  );
  const groups = buildCustomerSafePriceGroups({
    calculation: {
      totals: { customerDisplayTotal: result.customerFacing.estimateTotal },
      reviewSummary: result.reviewSummary || {
        countertopMaterialTotal: 0,
        backsplashTotal: 0,
        materialTaxTotal: 0,
        fabricationTotal: 200,
        cutoutLines: customerSafeCutoutLinesFromCharges(result.rooms[0].cutouts)
      },
      customerFacing: result.customerFacing
    }
  });
  const groupCutouts = groups.filter((g) => /cutout/i.test(g.label));
  assert.equal(groupCutouts.length, 1);
  assert.equal(groupCutouts[0].label, CUSTOMER_SAFE_CUTOUT_LABELS.kitchenSink);
  assert.equal(groupCutouts[0].amount, 200);
  console.log("ok: estimator breakdown shows one kitchen sink cutout $200");
}

{
  const result = await calculateElite100StudioEstimate({
    scope: {
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
              name: "Vanity",
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
      addOns: { "qty-bar": 1 }
    },
    env: {}
  });
  const cfLines = result.customerFacing.rooms[0].lineItems.filter((l) => /cutout/i.test(l.label));
  assert.equal(cfLines.length, 1);
  assert.equal(cfLines[0].label, CUSTOMER_SAFE_CUTOUT_LABELS.vanityBarSink);
  assert.equal(cfLines[0].amount, 100);
  console.log("ok: estimator/customerFacing shows one vanity/bar cutout $100");
}

{
  // Public Digital Estimate projection: alias pair collapses
  const updated = buildUpdatedRoomPricingProjection({
    internal: {
      configuredExactTotalCents: 120000,
      configuredDisplayTotalCents: 120000,
      rooms: [
        {
          roomKey: "kitchen",
          displayName: "Kitchen",
          chargeableCountertopSf: 20,
          materialSellCents: 100000,
          materialUseTaxCents: 0,
          materialDeltaCents: 0
        }
      ],
      options: [
        {
          optionKey: "qty-sink:kitchen",
          displayLabel: "Kitchen — Sink cutout",
          qty: 1,
          amountCents: 20000
        },
        {
          optionKey: "qty-sink",
          displayLabel: "Kitchen Sink Cutouts",
          qty: 1,
          amountCents: 20000
        }
      ],
      customLines: [],
      credits: []
    }
  });
  const kitchen = updated.rooms.find((r) => r.roomName === "Kitchen");
  const cutoutLines = (kitchen?.customerFacingLines || []).filter((l) => /cutout/i.test(l.label));
  assert.equal(cutoutLines.length, 1, "public DE shows one cutout line");
  assert.equal(cutoutLines[0].label, CUSTOMER_SAFE_CUTOUT_LABELS.kitchenSink);
  assert.equal(cutoutLines[0].amountCents, 20000);
  console.log("ok: public Digital Estimate breakdown dedupes cutout aliases");
}

console.log("\ncustomerSafeCutoutDisplay.test.mjs — passed\n");
