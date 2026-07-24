/**
 * ROOT-CAUSE / regression — Digital Estimate room-scoped edge pricing.
 *
 * Kitchen 8 LF + Bathroom 12 LF; customer upgrades Kitchen only (Small Ogee).
 * Correct: Kitchen option uses 8 LF. Incorrect (pre-fix): project 20 LF.
 *
 * Run: node backend-core/src/digitalEstimate/configuration/roomScopedEdgePricing.rootCause.test.mjs
 */

import assert from "node:assert/strict";
import {
  buildStudioEstimateRoomsForPublication,
  buildSyntheticQuoteHeaderFromStudioEstimate
} from "../../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs";
import {
  findFrozenEdgeOptionEffect,
  resolveEdgeOptionPriceEffect,
  resolvePremiumEdgeRatePerLf
} from "../catalog/studioEdgeAuthority.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KITCHEN_LF = 8;
const BATH_LF = 12;
const PROJECT_LF = KITCHEN_LF + BATH_LF; // 20
const RATE = resolvePremiumEdgeRatePerLf("direct");
const INCORRECT_PROJECT_CENTS = Math.round(RATE * PROJECT_LF * 100);
const CORRECT_KITCHEN_CENTS = Math.round(RATE * KITCHEN_LF * 100);

function approvedPiece(id, name, finishedEdgeLf) {
  const inches = Math.round(finishedEdgeLf * 12 * 100) / 100;
  return {
    id,
    name,
    pieceType: "counter",
    lengthIn: inches,
    depthIn: 25.5,
    sqft: 20,
    included: true,
    finishedEdge: {
      frontEdgeLengthIn: inches,
      leftExposedEdgeLengthIn: 0,
      rightExposedEdgeLengthIn: 0,
      otherExposedEdgeLengthIn: 0,
      totalFinishedEdgeLengthIn: inches,
      approved: true,
      source: "estimator_confirmed"
    }
  };
}

function twoRoomStudioEstimate() {
  return {
    id: "studio-root-cause-edge",
    organizationId: ORG,
    revision: 1,
    status: "approved",
    takeoffJobId: "to-root-cause",
    approval: {
      customerDisplayTotal: 9000,
      calculationFingerprint: "fp-root-cause-edge"
    },
    calculationSnapshot: {
      pricingBasis: "direct",
      fabrication: {
        edge: {
          profileToken: "edge_eased",
          finalLf: PROJECT_LF,
          pricedLf: 0,
          ratePerLf: 0,
          amount: 0,
          tier: "free"
        }
      },
      totals: { customerDisplayTotal: 9000 }
    },
    scope: {
      customerName: "Sentinel Edge Root Cause Co",
      projectName: "Two Room Remodel",
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      physicalScopeSource: "takeoff",
      edgeProfileToken: "edge_eased",
      edgeLinearFeet: 0,
      edgeEligibleLinearFeet: PROJECT_LF,
      takeoffScopeSummary: {
        derivedOpenEdgeLf: PROJECT_LF,
        approvedFinishedEdgeLf: PROJECT_LF
      },
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          included: true,
          countertopSqft: 40,
          backsplashSqft: 0,
          pieces: [approvedPiece("k-p1", "Kitchen Island", KITCHEN_LF)]
        },
        {
          id: "bath",
          name: "Bathroom",
          roomType: "Bathroom",
          included: true,
          countertopSqft: 25,
          backsplashSqft: 0,
          pieces: [approvedPiece("b-p1", "Bath Vanity", BATH_LF)]
        }
      ]
    }
  };
}

console.log("\nroomScopedEdgePricing.rootCause.test.mjs\n");

const estimate = twoRoomStudioEstimate();
const rooms = buildStudioEstimateRoomsForPublication(estimate);
const kitchen = rooms.find((r) => r.id === "kitchen");
const bath = rooms.find((r) => r.id === "bath");
assert.ok(kitchen && bath);

// Diagnostic dump (always printed for the audit report)
const header = buildSyntheticQuoteHeaderFromStudioEstimate(estimate);
const effects = header.calculation_snapshot?.internal_ui?.edge_option_effects || [];
const kitchenOgee =
  findFrozenEdgeOptionEffect(effects, "edge_small_ogee", "kitchen") ||
  findFrozenEdgeOptionEffect(effects, "edge_small_ogee");
const runtime = resolveEdgeOptionPriceEffect({
  profileToken: "edge_small_ogee",
  originalProfileToken: "edge_eased",
  edgeLinearFeet: Number(kitchen.edgeLinearFeet) || 0,
  pricingBasis: "direct"
});

console.log(
  "DIAGNOSTIC",
  JSON.stringify(
    {
      kitchenEdgeLinearFeet: kitchen.edgeLinearFeet,
      bathroomEdgeLinearFeet: bath.edgeLinearFeet,
      projectFinalLf: PROJECT_LF,
      frozenSmallOgeeCents: kitchenOgee?.priceEffectCents ?? null,
      frozenRoomKey: kitchenOgee?.roomKey ?? null,
      runtimeCentsFromKitchenField: runtime.priceEffectCents,
      incorrectProjectCents: INCORRECT_PROJECT_CENTS,
      correctKitchenCents: CORRECT_KITCHEN_CENTS,
      rootCauseFunction: "buildStudioEstimateRoomsForPublication",
      rootCauseField: "edgeLinearFeet ← fabrication.edge.finalLf (project-wide)",
      secondary: "buildCustomerSafeEdgeOptionEffects(finalPricedEdgeLf=project)"
    },
    null,
    2
  )
);

// Correctness assertions (RED before fix, GREEN after)
assert.equal(
  kitchen.edgeLinearFeet,
  KITCHEN_LF,
  `Kitchen edgeLinearFeet must be ${KITCHEN_LF}, not project ${PROJECT_LF} (got ${kitchen.edgeLinearFeet})`
);
assert.equal(
  bath.edgeLinearFeet,
  BATH_LF,
  `Bathroom edgeLinearFeet must be ${BATH_LF} (got ${bath.edgeLinearFeet})`
);
assert.equal(
  kitchenOgee?.priceEffectCents,
  CORRECT_KITCHEN_CENTS,
  `Kitchen Small Ogee must be ${CORRECT_KITCHEN_CENTS} cents (8×rate), not ${INCORRECT_PROJECT_CENTS}`
);
assert.notEqual(
  kitchen.edgeLinearFeet,
  PROJECT_LF,
  "Kitchen must never receive project-wide finalLf"
);

console.log("roomScopedEdgePricing.rootCause.test.mjs: ok\n");
