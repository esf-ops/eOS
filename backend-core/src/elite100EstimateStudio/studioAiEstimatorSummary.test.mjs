/**
 * studioAiEstimatorSummary — room scope, comparison, price groups.
 */
import assert from "node:assert/strict";
import {
  buildAiEstimatorSummary,
  buildMeasurementRevisionComparison,
  buildVerifiedRoomsFromEstimate
} from "./studioAiEstimatorSummary.mjs";

console.log("\nstudioAiEstimatorSummary.test.mjs\n");

const kitchenEstimate = {
  revision: 1,
  scope: {
    addOns: { "qty-sink": 1, "qty-cook": 1, "qty-outlet": 1 },
    edgeEligibleLinearFeet: 26.25,
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        included: true,
        countertopSqft: 46.25,
        backsplashSqft: 5.79,
        edgeEligibleLinearFeet: 26.25,
        pieces: [
          {
            id: "p1",
            name: "Cooktop wall",
            pieceType: "counter",
            lengthIn: 112.5,
            depthIn: 25.5,
            quantity: 1,
            sqft: 19.92,
            included: true
          },
          {
            id: "p2",
            name: "Sink wall",
            pieceType: "counter",
            lengthIn: 96,
            depthIn: 25.5,
            quantity: 1,
            sqft: 17,
            included: true
          },
          {
            id: "p3",
            name: "Cooktop wall FHB",
            pieceType: "counter",
            lengthIn: 112.5,
            depthIn: 18,
            quantity: 1,
            sqft: 14.06,
            included: true
          },
          {
            id: "p4",
            name: "Sink wall FHB",
            pieceType: "counter",
            lengthIn: 96,
            depthIn: 18,
            quantity: 1,
            sqft: 12,
            included: true
          }
        ]
      }
    ]
  },
  calculation: {
    totals: { customerDisplayTotal: 5120 },
    reviewSummary: {
      countertopMaterialTotal: 4000,
      backsplashTotal: 400,
      materialTaxTotal: 80,
      fabricationTotal: 640
    },
    warnings: [],
    unresolvedItems: []
  },
  activeReview: { eligible: true, blockers: [] }
};

{
  const rooms = buildVerifiedRoomsFromEstimate(kitchenEstimate);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].name, "Kitchen");
  assert.equal(rooms[0].pieces.length, 4);
  assert.equal(rooms[0].pieces[0].name, "Cooktop wall");
  assert.equal(rooms[0].pieces[0].lengthIn, 112.5);
  assert.equal(rooms[0].openingsByType.kitchenSink, 1);
  assert.equal(rooms[0].openingsByType.cooktop, 1);
  assert.equal(rooms[0].openingsByType.outlet, 1);
  // FHB pieces are backsplash — not countertop
  assert.equal(rooms[0].countertopSf, 36.92);
  assert.equal(rooms[0].backsplashSf, 5.79);
  console.log("ok: room-by-room verified scope from Scope");
}

{
  const summary = buildAiEstimatorSummary({ estimate: kitchenEstimate });
  assert.equal(summary.measurements.countertopSf, 36.92);
  assert.equal(summary.measurements.backsplashSf, 5.79);
  assert.equal(summary.measurements.openingsByType.kitchenSink, 1);
  assert.ok(summary.pricing.customerSafeGroups.length >= 1);
  assert.equal(summary.pricing.customerDisplayTotal, 5120);
  assert.equal(summary.rooms[0].pieces.find((p) => p.name === "Sink wall").lengthIn, 96);
  console.log("ok: aiEstimatorSummary pricing + measurements");
}

{
  const draft = structuredClone(kitchenEstimate);
  draft.revision = 2;
  draft.scope.rooms[0].pieces[1].lengthIn = 120;
  draft.scope.rooms[0].pieces[1].sqft = 21.25;
  draft.scope.rooms[0].countertopSqft = 50;
  draft.calculation.totals.customerDisplayTotal = 5480;
  const comparison = buildMeasurementRevisionComparison(kitchenEstimate, draft);
  assert.ok(
    comparison.changedItems.some(
      (c) => c.kind === "length" && c.from === 96 && c.to === 120
    ),
    "length 96 → 120"
  );
  assert.equal(comparison.previousTotal, 5120);
  assert.equal(comparison.revisedTotal, 5480);
  assert.equal(comparison.difference, 360);
  console.log("ok: revision comparison geometry + server totals");
}

{
  const summary = buildAiEstimatorSummary({
    estimate: kitchenEstimate,
    publicationSummary: {
      active: true,
      revision: 1,
      publishedAt: "2026-07-28T12:00:00.000Z",
      customerUrl: "https://example.test/e/abc",
      customerUrlAvailable: true,
      customerActivityState: "waiting",
      customerActivityLabel: "Not viewed",
      reviewRequestOpen: false
    }
  });
  assert.equal(summary.publication.isPublished, true);
  assert.equal(summary.publication.customerActivityLabel, "Not viewed");
  assert.equal(summary.revision.published, 1);
  console.log("ok: publication activity from safe summary");
}

console.log("\nAll studioAiEstimatorSummary tests passed.\n");
