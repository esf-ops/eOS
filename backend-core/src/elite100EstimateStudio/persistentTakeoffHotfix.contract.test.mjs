/**
 * Production-shaped AI estimator SF + warning safety + cross-surface contract.
 */
import assert from "node:assert/strict";
import {
  buildAiEstimatorSummary,
  buildVerifiedRoomsFromEstimate
} from "./studioAiEstimatorSummary.mjs";
import { isBacksplashPiece } from "./estimatorPieceClassification.mjs";
import { partitionEstimatorWarnings } from "./estimatorWarningSafety.mjs";

console.log("\npersistentTakeoffHotfix.contract.test.mjs\n");

/** Exact production kitchen+bath fixture from hotfix acceptance plan. */
function productionShapedEstimate() {
  return {
    revision: 1,
    scope: {
      addOns: { "qty-sink": 1, "qty-bar": 1, "qty-cook": 1, "qty-outlet": 0 },
      edgeEligibleLinearFeet: 26.25,
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          included: true,
          // Inflated historical field (CT+BS) — display must ignore this.
          countertopSqft: 61.02,
          backsplashSqft: 7.72,
          edgeEligibleLinearFeet: 23.17,
          pieces: [
            {
              id: "k-left",
              name: "Left run",
              pieceType: "counter",
              lengthIn: 69.5,
              depthIn: 36,
              quantity: 1,
              sqft: 17.38,
              included: true
            },
            {
              id: "k-back",
              name: "Back run",
              pieceType: "counter",
              lengthIn: 112.5,
              depthIn: 25.5,
              quantity: 1,
              sqft: 19.92,
              included: true
            },
            {
              id: "k-right",
              name: "Right run",
              pieceType: "counter",
              lengthIn: 96,
              depthIn: 24,
              quantity: 1,
              sqft: 16.0,
              included: true
            },
            {
              id: "k-bs",
              name: "Kitchen backsplash",
              pieceType: "splash",
              lengthIn: 278,
              depthIn: 4,
              quantity: 1,
              sqft: 7.72,
              included: true
            }
          ]
        },
        {
          id: "bath",
          name: "Bathroom",
          included: true,
          countertopSqft: 6.81,
          backsplashSqft: 1.03,
          edgeEligibleLinearFeet: 3.08,
          pieces: [
            {
              id: "b-vanity",
              name: "Vanity Top",
              pieceType: "counter",
              lengthIn: 37,
              depthIn: 22.5,
              quantity: 1,
              sqft: 5.78,
              included: true
            },
            {
              id: "b-bs",
              name: "Bathroom backsplash",
              pieceType: "splash",
              lengthIn: 37,
              depthIn: 4,
              quantity: 1,
              sqft: 1.03,
              included: true
            }
          ]
        }
      ]
    },
    calculation: {
      totals: { customerDisplayTotal: 7840.5 },
      fabrication: { edge: { finalLf: 26.25 } },
      warnings: [
        {
          code: "adapter_edge_lf_single_room_assignment",
          message:
            'Studio tracks one estimate-wide finished-edge total (26.25 LF); the adapter assigned it in full to room "takeoff-kitchen-0". Pass opts.edgeRoomId to change this.'
        },
        {
          code: "adapter_addon_room_assignment_ambiguous",
          message:
            'Studio add-on "qty-sink" is an estimate-wide quantity; multiple eligible rooms exist, so the adapter assigned it to room "takeoff-kitchen-0" by default. Pass opts.roomAssignments["qty-sink"] to target a different room.'
        },
        {
          code: "genuine_estimator_warning",
          message: "Review vanity program eligibility before publish."
        }
      ],
      unresolvedItems: []
    },
    approval: { approvedAt: "2026-07-28T12:00:00.000Z" },
    activeReview: { eligible: true, blockers: [] }
  };
}

{
  assert.equal(isBacksplashPiece({ pieceType: "splash" }), true);
  assert.equal(isBacksplashPiece({ pieceType: "fhb" }), true);
  assert.equal(isBacksplashPiece({ pieceType: "counter", name: "Kitchen FHB" }), true);
  assert.equal(isBacksplashPiece({ pieceType: "counter", name: "Left run" }), false);
  console.log("ok: piece classification");
}

{
  const est = productionShapedEstimate();
  const rooms = buildVerifiedRoomsFromEstimate(est);
  const kitchen = rooms.find((r) => r.name === "Kitchen");
  const bath = rooms.find((r) => r.name === "Bathroom");
  assert.equal(kitchen.countertopSf, 53.3);
  assert.equal(kitchen.backsplashSf, 7.72);
  assert.equal(bath.countertopSf, 5.78);
  assert.equal(bath.backsplashSf, 1.03);

  const summary = buildAiEstimatorSummary({ estimate: est });
  assert.equal(summary.measurements.countertopSf, 59.08);
  assert.equal(summary.measurements.backsplashSf, 8.75);
  assert.equal(summary.measurements.exposedEdgeLf, 26.25);
  assert.equal(summary.measurements.openingsByType.kitchenSink, 1);
  assert.equal(summary.measurements.openingsByType.vanityBarSink, 1);
  assert.equal(summary.measurements.openingsByType.cooktop, 1);
  assert.equal(summary.measurements.openingsByType.outlet, 0);
  assert.equal(summary.measurements.totalBillableStoneSf, 67.83);
  // Cross-surface: Takeoff piece sums === approved summary
  assert.equal(summary.rooms[0].countertopSf, kitchen.countertopSf);
  assert.equal(summary.rooms[1].countertopSf, bath.countertopSf);
  console.log("ok: production fixture SF contract (59.08 / 8.75 / 26.25)");
}

{
  const est = productionShapedEstimate();
  const summary = buildAiEstimatorSummary({ estimate: est });
  assert.equal(summary.pricing.warnings.length, 1);
  assert.equal(summary.pricing.warnings[0].code, "genuine_estimator_warning");
  assert.equal(summary.pricing.estimatorWarnings.length, 1);
  assert.equal(summary.internalDiagnostics.length, 2);
  for (const w of summary.pricing.warnings) {
    assert.equal(/\bopts\./i.test(w.message), false);
    assert.equal(/qty-sink|takeoff-kitchen/i.test(w.message), false);
  }
  console.log("ok: estimatorWarnings vs internalDiagnostics");
}

{
  const parted = partitionEstimatorWarnings([
    {
      code: "adapter_scope_adjustments_not_translated",
      message: "Governed countertop scope adjustments exist — not translated."
    },
    "Pass opts.edgeRoomId to change this"
  ]);
  assert.equal(parted.estimatorWarnings.length, 0);
  assert.equal(parted.internalDiagnostics.length, 2);
  console.log("ok: partitionEstimatorWarnings strips adapter copy");
}

console.log("\nAll persistentTakeoffHotfix contract tests passed.\n");
