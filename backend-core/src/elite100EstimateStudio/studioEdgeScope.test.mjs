/**
 * Canonical edge profiles + derived open-edge scope pricing.
 * Run: node src/elite100EstimateStudio/studioEdgeScope.test.mjs
 */
import assert from "node:assert/strict";

import { calculateStudioEstimate } from "./studioEstimatePricing.mjs";
import {
  FREE_EDGE_PROFILES,
  PREMIUM_EDGE_PROFILES,
  isPremiumEdgeProfile,
  normalizeEdgeProfileToken,
  resolvePremiumEdgeRatePerLf
} from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";
import { EDGE_SCOPE_SOURCES } from "./studioEstimateTypes.mjs";
import { buildApprovedScopeSummary } from "../takeoff/takeoffCutoutScope.mjs";

const env = {};
const USER = "user-estimator-1";

function takeoffScope(extra = {}) {
  return {
    customerName: "Acme",
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    colorName: "Alpine White",
    physicalScopeSource: "takeoff",
    takeoffScopeSummary: {
      pieceCount: 2,
      backsplashEligibleRunCount: 2,
      eligibleBacksplashLengthIn: 120,
      totalRunLengthIn: 305.04,
      derivedOpenEdgeLengthIn: 185.04,
      derivedOpenEdgeLf: 15.42,
      approvedFinishedEdgeLf: 15.42,
      edgeEligibleLinearFeet: 15.42,
      edgeScopeSource: "finished_edge_v2",
      edgeGeometryConfirmationRequired: false,
      countertopSqft: 30
    },
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        included: true,
        countertopSqft: 30,
        approvedFinishedEdgeLf: 15.42,
        edgeEligibleLinearFeet: 15.42,
        pieces: [
          {
            id: "p1",
            name: "Run A",
            pieceType: "counter",
            sqft: 30,
            included: true,
            finishedEdge: {
              frontEdgeLengthIn: 185.04,
              leftExposedEdgeLengthIn: 0,
              rightExposedEdgeLengthIn: 0,
              otherExposedEdgeLengthIn: 0,
              totalFinishedEdgeLengthIn: 185.04,
              approved: true,
              source: "estimator_confirmed"
            }
          }
        ]
      }
    ],
    addOns: {},
    customLineItems: [],
    edgeProfileToken: "edge_eased",
    edgeMode: null,
    edgeLinearFeet: 0,
    countertopScopeAdjustments: [],
    edgeScopeAdjustment: null,
    internalMarkupPercent: 0,
    ...extra
  };
}

// 24-25. Canonical roster: 5 included, 3 premium — legacy tokens absent.
{
  assert.deepEqual(
    FREE_EDGE_PROFILES.map((p) => p.optionToken),
    ["edge_eased", "edge_large_eased", "edge_full_bullnose", "edge_large_ogee", "edge_bevel"]
  );
  assert.deepEqual(
    PREMIUM_EDGE_PROFILES.map((p) => p.optionToken),
    ["edge_small_ogee", "edge_crescent", "edge_knife"]
  );
  const all = [...FREE_EDGE_PROFILES, ...PREMIUM_EDGE_PROFILES].map((p) => p.optionToken);
  assert.equal(all.includes("w_edge"), false);
  assert.equal(all.includes("d_edge"), false);
  console.log("ok: canonical roster — 5 included + 3 premium profiles, no W/D tokens");
}

// 22-23. Legacy W/D tokens normalize into canonical profiles (never rendered as W/D).
{
  assert.equal(normalizeEdgeProfileToken("w_edge"), "edge_small_ogee");
  assert.equal(normalizeEdgeProfileToken("d_edge"), "edge_small_ogee");
  assert.equal(normalizeEdgeProfileToken("included"), "edge_eased");
  console.log("ok: legacy w_edge/d_edge/included map onto canonical tokens");
}

// 26. Finished-edge authority is independent of backsplash (retired: run − splash).
{
  const pieces = [
    {
      id: "a",
      pieceType: "counter",
      lengthIn: 150,
      depthIn: 25.5,
      includedInTakeoff: true,
      backsplashEligible: true,
      backsplashEligibleLengthIn: 100,
      finishedEdge: {
        frontEdgeLengthIn: 150,
        leftExposedEdgeLengthIn: 0,
        rightExposedEdgeLengthIn: 0,
        otherExposedEdgeLengthIn: 0,
        totalFinishedEdgeLengthIn: 150,
        approved: true,
        source: "estimator_confirmed"
      }
    },
    {
      id: "b",
      pieceType: "counter",
      lengthIn: 100,
      depthIn: 25.5,
      includedInTakeoff: true,
      backsplashEligible: false,
      finishedEdge: {
        frontEdgeLengthIn: 100,
        leftExposedEdgeLengthIn: 0,
        rightExposedEdgeLengthIn: 0,
        otherExposedEdgeLengthIn: 0,
        totalFinishedEdgeLengthIn: 100,
        approved: true,
        source: "estimator_confirmed"
      }
    },
    // Splash pieces are vertical geometry — never finished edge.
    { pieceType: "backsplash", lengthIn: 100, includedInTakeoff: true },
    // Excluded pieces never count.
    { pieceType: "counter", lengthIn: 55, includedInTakeoff: false }
  ];
  const summary = buildApprovedScopeSummary({
    rooms: [{ name: "Kitchen", pieces }],
    totals: { chargeableCountertopSqft: 30 }
  });
  assert.equal(summary.totalRunLengthIn, 250);
  assert.equal(summary.eligibleBacksplashLengthIn, 100);
  assert.equal(summary.backsplashEligibleRunCount, 1);
  // Front edges sum to 250 in — NOT 250 − 100 = 150 (retired subtraction).
  assert.equal(summary.derivedOpenEdgeLengthIn, 250);
  assert.equal(summary.derivedOpenEdgeLf, Math.round((250 / 12) * 100) / 100);
  assert.equal(summary.edgeScopeSource, "finished_edge_v2");
  assert.equal(summary.retiredEdgeFormula, "derived_open_edge_v1");
  assert.equal(summary.legacyDerivedOpenEdgeLengthIn, 150); // audit only
  console.log("ok: finished_edge_v2 = sum of approved fronts (not run − backsplash)");
}

// 27. Unconfirmed drafts do not invent priced edge LF (confirmation required).
{
  const summary = buildApprovedScopeSummary({
    rooms: [
      {
        name: "Bath",
        pieces: [
          {
            pieceType: "counter",
            lengthIn: 100,
            depthIn: 25,
            includedInTakeoff: true,
            backsplashEligible: false
          }
        ]
      }
    ],
    totals: { chargeableCountertopSqft: 8 }
  });
  assert.equal(summary.edgeGeometryConfirmationRequired, true);
  assert.equal(summary.derivedOpenEdgeLengthIn, 0);
  assert.equal(summary.edgeScopeSource, "finished_edge_geometry_required");
  console.log("ok: unconfirmed drafts require geometry confirmation (priced LF = 0)");
}

// Free canonical profile prices $0 regardless of LF.
{
  const calc = await calculateStudioEstimate({
    scope: takeoffScope({ edgeProfileToken: "edge_full_bullnose" }),
    actorUserId: USER,
    env
  });
  assert.equal(calc.fabrication.edge.tier, "free");
  assert.equal(calc.fabrication.edge.amount, 0);
  assert.equal(calc.fabrication.edge.finalLf, 15.42);
  console.log("ok: included canonical profile (Full Bullnose) prices $0");
}

// 30. Premium profile: final priced edge = derived + adjustment, at governed rate.
{
  const calc = await calculateStudioEstimate({
    scope: takeoffScope({
      edgeProfileToken: "edge_knife",
      edgeScopeAdjustment: { adjustmentLf: 2.5, adjustmentReason: "waterfall side edges" }
    }),
    actorUserId: USER,
    env
  });
  const edge = calc.fabrication.edge;
  assert.equal(edge.tier, "premium");
  assert.equal(edge.derivedLf, 15.42);
  assert.equal(edge.adjustmentLf, 2.5);
  assert.equal(edge.finalLf, 17.92);
  assert.equal(edge.ratePerLf, resolvePremiumEdgeRatePerLf("wholesale"));
  assert.equal(edge.amount, Math.round(17.92 * resolvePremiumEdgeRatePerLf("wholesale") * 100) / 100);
  assert.equal(edge.source, EDGE_SCOPE_SOURCES.ADJUSTED);
  console.log("ok: premium canonical edge prices derived+adjustment LF once at the governed rate");
}

// Negative adjustment reduces but never drops final edge below zero.
{
  const calc = await calculateStudioEstimate({
    scope: takeoffScope({
      edgeProfileToken: "edge_crescent",
      edgeScopeAdjustment: { adjustmentLf: -100, adjustmentReason: "credit larger than derived" }
    }),
    actorUserId: USER,
    env
  });
  assert.equal(calc.fabrication.edge.finalLf, 0);
  assert.equal(calc.fabrication.edge.amount, 0);
  console.log("ok: edge adjustment can never produce negative priced edge");
}

// 29. Edge adjustment requires a reason when non-zero.
{
  let rejected = false;
  try {
    await calculateStudioEstimate({
      scope: takeoffScope({
        edgeProfileToken: "edge_knife",
        edgeScopeAdjustment: { adjustmentLf: 2, adjustmentReason: "" }
      }),
      actorUserId: USER,
      env
    });
  } catch (e) {
    rejected = true;
    assert.equal(e.code, "adjustment_reason_required");
  }
  assert.equal(rejected, true);
  console.log("ok: non-zero edge adjustment without reason is rejected");
}

// 28. Adjustment persists through the calculation snapshot (audit surface).
{
  const calc = await calculateStudioEstimate({
    scope: takeoffScope({
      edgeProfileToken: "edge_small_ogee",
      edgeScopeAdjustment: {
        adjustmentLf: 1.5,
        adjustmentReason: "unfinished cabinet end",
        adjustedBy: USER,
        adjustedAt: "2026-07-20T00:00:00Z"
      }
    }),
    actorUserId: USER,
    env
  });
  assert.equal(calc.fabrication.edge.adjustmentLf, 1.5);
  assert.ok(calc.fingerprint);
  console.log("ok: edge adjustment is snapshotted and fingerprinted");
}

// 32. Existing premium-edge pricing unchanged: legacy scopes without a
// canonical token keep the historical W/D branch byte-for-byte.
{
  const legacy = await calculateStudioEstimate({
    scope: takeoffScope({
      edgeProfileToken: null,
      edgeMode: "w_edge",
      edgeLinearFeet: 10,
      physicalScopeSource: null,
      takeoffScopeSummary: null
    }),
    actorUserId: USER,
    env
  });
  assert.equal(legacy.fabrication.edge.source, "legacy_edge_mode");
  assert.equal(legacy.fabrication.edge.pricedLf, 10);
  assert.ok(legacy.fabrication.edge.amount > 0);
  assert.equal(isPremiumEdgeProfile(legacy.fabrication.edge.profileToken), true);
  console.log("ok: legacy W-edge scopes keep historical pricing (no canonical re-rate)");
}

// 31. Customer-safe publication freeze exposes no edge LF, rate, or adjustment.
{
  const { buildSyntheticQuoteHeaderFromStudioEstimate } = await import(
    "./studioEstimatePublicationAdapter.mjs"
  );
  const scope = takeoffScope({
    edgeProfileToken: "edge_knife",
    edgeScopeAdjustment: { adjustmentLf: 2.5, adjustmentReason: "waterfall side edges" }
  });
  const calc = await calculateStudioEstimate({ scope, actorUserId: USER, env });
  const estimate = {
    id: "est-1",
    revision: 1,
    scope,
    calculationSnapshot: calc,
    approval: {
      approvedAt: "2026-07-20T00:00:00Z",
      calculationFingerprint: calc.fingerprint,
      customerDisplayTotal: calc.totals.customerDisplayTotal
    }
  };
  const header = buildSyntheticQuoteHeaderFromStudioEstimate(estimate);
  const raw = JSON.stringify(header.calculation_snapshot);
  assert.equal(raw.includes("ratePerLf"), false);
  assert.equal(raw.includes("derivedLf"), false);
  assert.equal(raw.includes("edgeScopeAdjustment"), false);
  assert.equal(raw.includes("waterfall side edges"), false);
  const effects = header.calculation_snapshot?.internal_ui?.edge_option_effects;
  assert.ok(Array.isArray(effects) && effects.length === 8);
  const knife = effects.find((e) => e.profileKey === "edge_knife");
  assert.equal(knife.originalSelection, true);
  assert.equal(knife.priceEffectCents, 0);
  assert.equal(knife.priceEffectLabel, "Original selection");
  // Other premiums still carry the calculated project edge effect (not review-required).
  const crescent = effects.find((e) => e.profileKey === "edge_crescent");
  assert.ok(crescent.priceEffectCents > 0);
  assert.equal(crescent.reviewRequired, false);
  assert.equal(JSON.stringify(effects).includes("ratePerLf"), false);
  console.log("ok: customer-facing publication freeze carries no edge LF, rate, or adjustment detail");
}

console.log("\nAll studioEdgeScope tests passed.\n");
