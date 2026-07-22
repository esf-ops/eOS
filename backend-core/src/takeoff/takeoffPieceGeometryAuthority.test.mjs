/**
 * Hosted-shape regression: backsplash vs finished-edge geometry authority.
 * Run: node backend-core/src/takeoff/takeoffPieceGeometryAuthority.test.mjs
 */
import assert from "node:assert/strict";
import {
  attachDraftPieceGeometry,
  assertBacksplashEligibilityConsistency,
  buildGeometryAuthoritySummary,
  draftFinishedEdgeGeometry,
  EDGE_GEOMETRY_SOURCES,
  resolvePieceBacksplashGeometry,
  resolvePieceFinishedEdgeGeometry,
  sumBacksplashEligibleGeometry,
  sumFinishedEdgeLengthIn
} from "./takeoffPieceGeometryAuthority.mjs";
import { buildApprovedScopeSummary } from "./takeoffCutoutScope.mjs";
import { resolveScopeEdgeLinearFeet } from "../elite100EstimateStudio/studioScopeBilling.mjs";
import { buildCustomerSafeEdgeOptionEffects } from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "../digitalEstimate/configuration/configurationPublicSerializer.mjs";

console.log("\ntakeoffPieceGeometryAuthority.test.mjs\n");

/**
 * Fake fixture matching the hosted six-piece kitchen shape.
 * Expected finished edges (reviewable):
 * - Sink Wall / Right Wall / Left of Stove / Right of Stove / Coffee Top:
 *   front = full run length, ends not exposed (wall runs)
 * - Peninsula Top: front = 38 in; outer end (right) = depth 38.75 in
 *
 * Backsplash: first four wall runs eligible at full length; Coffee/Peninsula no.
 */
function hostedSixPieceFixture(overrides = {}) {
  const pieces = [
    {
      id: "p1",
      name: "Sink Wall",
      pieceType: "counter",
      lengthIn: 150,
      depthIn: 25.5,
      includedInTakeoff: true,
      backsplashEligible: true,
      ...overrides.sinkWall
    },
    {
      id: "p2",
      name: "Right Wall",
      pieceType: "counter",
      lengthIn: 39,
      depthIn: 25.5,
      includedInTakeoff: true,
      backsplashEligible: true,
      ...overrides.rightWall
    },
    {
      id: "p3",
      name: "Left of Stove",
      pieceType: "counter",
      lengthIn: 24,
      depthIn: 25.5,
      includedInTakeoff: true,
      backsplashEligible: true,
      ...overrides.leftOfStove
    },
    {
      id: "p4",
      name: "Right of Stove",
      pieceType: "counter",
      lengthIn: 25,
      depthIn: 25.5,
      includedInTakeoff: true,
      backsplashEligible: true,
      ...overrides.rightOfStove
    },
    {
      id: "p5",
      name: "Coffee Top",
      pieceType: "counter",
      lengthIn: 34,
      depthIn: 25.5,
      includedInTakeoff: true,
      backsplashEligible: false,
      ...overrides.coffeeTop
    },
    {
      id: "p6",
      name: "Peninsula Top",
      pieceType: "counter",
      lengthIn: 38,
      depthIn: 38.75,
      includedInTakeoff: true,
      backsplashEligible: false,
      rightExposed: true,
      ...overrides.peninsulaTop
    }
  ];
  return pieces;
}

function approveFrontOnly(piece, extra = {}) {
  const front = Number(piece.lengthIn) || 0;
  const left = extra.leftExposedEdgeLengthIn ?? 0;
  const right = extra.rightExposedEdgeLengthIn ?? 0;
  const other = extra.otherExposedEdgeLengthIn ?? 0;
  return {
    ...piece,
    finishedEdge: {
      frontEdgeLengthIn: front,
      leftExposedEdgeLengthIn: left,
      rightExposedEdgeLengthIn: right,
      otherExposedEdgeLengthIn: other,
      totalFinishedEdgeLengthIn: front + left + right + other,
      approved: true,
      source: "estimator_confirmed",
      approvalSource: "estimator_confirmed",
      adjustmentIn: 0,
      adjustmentReason: null
    },
    backsplashGeometry: resolvePieceBacksplashGeometry(piece)
  };
}

// ---------------------------------------------------------------------------
// Hosted shape basics
// ---------------------------------------------------------------------------
{
  const pieces = hostedSixPieceFixture();
  const totalRun = pieces.reduce((s, p) => s + p.lengthIn, 0);
  assert.equal(totalRun, 310);
  assert.equal(Math.round((totalRun / 12) * 100) / 100, 25.83);
  console.log("ok: hosted fixture total run length = 310 in (25.83 LF)");
}

{
  // Old invalid formula would yield 310 − 272 = 38 in = 3.17 LF
  const pieces = hostedSixPieceFixture().map((p) =>
    attachDraftPieceGeometry(p, { eligible: p.backsplashEligible })
  );
  const bs = sumBacksplashEligibleGeometry(pieces);
  assert.equal(bs.eligibleBacksplashLengthIn, 150 + 39 + 24 + 25); // 238 with Coffee/Peninsula off
  // Hosted evidence used 272 — that assumed Coffee also eligible. Prove we can
  // set Coffee eligible independently without changing finished-edge authority.
  const withCoffee = hostedSixPieceFixture({
    coffeeTop: { backsplashEligible: true }
  }).map((p) => attachDraftPieceGeometry(p, { eligible: p.backsplashEligible }));
  const bs272 = sumBacksplashEligibleGeometry(withCoffee);
  assert.equal(bs272.eligibleBacksplashLengthIn, 272);
  assert.equal(bs272.backsplashEligibleRunCount, 5);
  assert.doesNotThrow(() => assertBacksplashEligibilityConsistency(bs272));

  const legacyInvalid = Math.max(0, Math.round((310 - 272) * 100) / 100);
  assert.equal(legacyInvalid, 38);
  assert.equal(Math.round((legacyInvalid / 12) * 100) / 100, 3.17);

  // Finished front edges do NOT disappear because backsplash exists.
  const approved = withCoffee.map((p, i) =>
    approveFrontOnly(p, i === 5 ? { rightExposedEdgeLengthIn: 38.75 } : {})
  );
  const finished = sumFinishedEdgeLengthIn(approved, { requireApproved: true });
  // Fronts: 310 + peninsula outer end 38.75 = 348.75 in
  assert.equal(finished.totalFinishedEdgeLengthIn, 310 + 38.75);
  assert.notEqual(finished.totalFinishedEdgeLengthIn, legacyInvalid);
  console.log("ok: finished edge ≠ run−backsplash; fronts coexist with backsplash");
}

{
  // Zero eligible runs cannot have non-zero length
  assert.throws(
    () =>
      assertBacksplashEligibilityConsistency({
        eligibleBacksplashLengthIn: 272,
        backsplashEligibleRunCount: 0
      }),
    (e) => e.code === "backsplash_eligibility_inconsistent"
  );
  console.log("ok: invariant rejects eligible runs:0 with length>0");
}

{
  // 272 in × 4 in / 144 = 7.555... raw SF
  const rawSf = (272 * 4) / 144;
  assert.ok(Math.abs(rawSf - 7.555555) < 0.001);
  console.log("ok: 272 in at 4 in → 7.555… raw SF before governed rounding");
}

// ---------------------------------------------------------------------------
// buildApprovedScopeSummary — no subtraction for pricing authority
// ---------------------------------------------------------------------------
{
  const pieces = hostedSixPieceFixture({
    coffeeTop: { backsplashEligible: true }
  }).map((p, i) =>
    approveFrontOnly(
      attachDraftPieceGeometry(p, { eligible: p.backsplashEligible }),
      i === 5 ? { rightExposedEdgeLengthIn: 38.75 } : {}
    )
  );
  const summary = buildApprovedScopeSummary({
    rooms: [{ name: "Kitchen", pieces }],
    totals: { chargeableCountertopSqft: 100 }
  });
  assert.equal(summary.eligibleBacksplashLengthIn, 272);
  assert.equal(summary.backsplashEligibleRunCount, 5);
  assert.equal(summary.edgeScopeSource, EDGE_GEOMETRY_SOURCES.FINISHED_EDGE_V2);
  assert.equal(summary.edgeGeometryConfirmationRequired, false);
  assert.equal(summary.retiredEdgeFormula, EDGE_GEOMETRY_SOURCES.DERIVED_OPEN_EDGE_V1);
  assert.equal(summary.legacyDerivedOpenEdgeLf, 3.17);
  assert.notEqual(summary.derivedOpenEdgeLf, 3.17);
  assert.equal(summary.approvedFinishedEdgeLf, Math.round(((310 + 38.75) / 12) * 100) / 100);
  console.log("ok: scope summary uses finished_edge_v2; legacy 3.17 LF audit only");
}

{
  // Drafts without approval → confirmation required, pricing LF = 0
  const pieces = hostedSixPieceFixture().map((p) =>
    attachDraftPieceGeometry(p, { eligible: p.backsplashEligible })
  );
  const summary = buildApprovedScopeSummary({
    rooms: [{ name: "Kitchen", pieces }],
    totals: { chargeableCountertopSqft: 50 }
  });
  assert.equal(summary.edgeGeometryConfirmationRequired, true);
  assert.equal(summary.edgeScopeSource, EDGE_GEOMETRY_SOURCES.FINISHED_EDGE_CONFIRMATION_REQUIRED);
  assert.equal(summary.edgeEligibleLinearFeet, 0);
  console.log("ok: unconfirmed drafts do not invent priced edge LF");
}

// ---------------------------------------------------------------------------
// Mode independence invariants
// ---------------------------------------------------------------------------
{
  const approved = hostedSixPieceFixture().map((p, i) =>
    approveFrontOnly(
      attachDraftPieceGeometry(p, { eligible: p.backsplashEligible }),
      i === 5 ? { rightExposedEdgeLengthIn: 38.75 } : {}
    )
  );
  const edgeBefore = sumFinishedEdgeLengthIn(approved, { requireApproved: true })
    .totalFinishedEdgeLengthIn;

  // Flip all backsplash off — finished edge unchanged
  const noBs = approved.map((p) => ({
    ...p,
    backsplashEligible: false,
    backsplashGeometry: resolvePieceBacksplashGeometry({
      ...p,
      backsplashEligible: false
    })
  }));
  const edgeAfterNone = sumFinishedEdgeLengthIn(noBs, { requireApproved: true })
    .totalFinishedEdgeLengthIn;
  assert.equal(edgeAfterNone, edgeBefore);

  // All backsplash on — finished edge still unchanged
  const allBs = approved.map((p) => ({
    ...p,
    backsplashEligible: true,
    backsplashGeometry: resolvePieceBacksplashGeometry({
      ...p,
      backsplashEligible: true,
      lengthIn: p.lengthIn
    })
  }));
  const edgeAfterAll = sumFinishedEdgeLengthIn(allBs, { requireApproved: true })
    .totalFinishedEdgeLengthIn;
  assert.equal(edgeAfterAll, edgeBefore);
  console.log("ok: backsplash None/all does not alter finished-edge total");
}

{
  // Island draft: no backsplash; multiple exposed edges suggested
  const island = draftFinishedEdgeGeometry({
    lengthIn: 96,
    depthIn: 36,
    areaType: "island",
    label: "Island"
  });
  assert.equal(island.frontEdgeLengthIn, 96);
  assert.equal(island.otherExposedEdgeLengthIn, 96);
  assert.equal(island.leftExposedEdgeLengthIn, 36);
  assert.equal(island.rightExposedEdgeLengthIn, 36);
  const bs = resolvePieceBacksplashGeometry({
    lengthIn: 96,
    backsplashEligible: false
  });
  assert.equal(bs.backsplashEligibleLengthIn, 0);
  console.log("ok: island draft defaults — no backsplash; multi-edge exposure");
}

{
  // Peninsula: front + outer end
  const pen = draftFinishedEdgeGeometry({
    lengthIn: 38,
    depthIn: 38.75,
    areaType: "peninsula",
    label: "Peninsula Top",
    rightExposed: true
  });
  assert.equal(pen.frontEdgeLengthIn, 38);
  assert.equal(pen.rightExposedEdgeLengthIn, 38.75);
  assert.equal(pen.otherExposedEdgeLengthIn, 0);
  console.log("ok: peninsula draft — front + approved exposed end");
}

{
  // Adjustment requires reason
  assert.throws(
    () =>
      resolvePieceFinishedEdgeGeometry({
        lengthIn: 10,
        depthIn: 25,
        finishedEdge: {
          frontEdgeLengthIn: 10,
          leftExposedEdgeLengthIn: 0,
          rightExposedEdgeLengthIn: 0,
          otherExposedEdgeLengthIn: 0,
          adjustmentIn: 2,
          adjustmentReason: "",
          approved: true,
          source: "estimator_confirmed"
        }
      }),
    (e) => e.code === "finished_edge_adjustment_reason_required"
  );
  console.log("ok: finished-edge adjustment requires reason");
}

// ---------------------------------------------------------------------------
// resolveScopeEdgeLinearFeet + publication effects
// ---------------------------------------------------------------------------
{
  const lf = Math.round(((310 + 38.75) / 12) * 100) / 100;
  const scope = {
    physicalScopeSource: "takeoff",
    takeoffScopeSummary: {
      derivedOpenEdgeLf: lf,
      edgeEligibleLinearFeet: lf,
      approvedFinishedEdgeLf: lf,
      edgeScopeSource: EDGE_GEOMETRY_SOURCES.FINISHED_EDGE_V2,
      edgeGeometryConfirmationRequired: false
    },
    edgeScopeAdjustment: null
  };
  const resolved = resolveScopeEdgeLinearFeet(scope);
  assert.equal(resolved.finalLf, lf);
  assert.equal(resolved.confirmationRequired, false);

  const effects = buildCustomerSafeEdgeOptionEffects({
    finalPricedEdgeLf: resolved.finalLf,
    pricingBasis: "direct",
    originalProfileToken: "edge_eased",
    roomKey: "kitchen",
    roomName: "Kitchen"
  });
  const crescent = effects.find((e) => e.profileKey === "edge_crescent");
  assert.ok(crescent.priceEffectCents > 0);
  assert.match(crescent.priceEffectLabel, /^\+\$/);
  const publicRaw = JSON.stringify({ options: effects });
  assert.equal(publicRaw.includes("ratePerLf"), false);
  assert.equal(publicRaw.includes("pricingBasis"), false);
  assertPublicConfigurationHasNoForbiddenContent({ edgeOptions: effects.map((e) => ({
    profile: e.profile,
    priceEffectLabel: e.priceEffectLabel,
    priceEffectCents: e.priceEffectCents
  })) });
  console.log("ok: publication edge effects use finished-edge LF; no rates publicly");
}

{
  const scope = {
    physicalScopeSource: "takeoff",
    takeoffScopeSummary: {
      derivedOpenEdgeLf: 0,
      edgeEligibleLinearFeet: 0,
      approvedFinishedEdgeLf: 0,
      edgeScopeSource: EDGE_GEOMETRY_SOURCES.FINISHED_EDGE_CONFIRMATION_REQUIRED,
      edgeGeometryConfirmationRequired: true,
      suggestedFinishedEdgeLf: 25.83
    }
  };
  const resolved = resolveScopeEdgeLinearFeet(scope);
  assert.equal(resolved.finalLf, 0);
  assert.equal(resolved.confirmationRequired, true);
  console.log("ok: confirmation-required scope does not price suggested edge LF");
}

{
  // Reordering pieces does not alter totals
  const approved = hostedSixPieceFixture().map((p, i) =>
    approveFrontOnly(
      attachDraftPieceGeometry(p, { eligible: p.backsplashEligible }),
      i === 5 ? { rightExposedEdgeLengthIn: 38.75 } : {}
    )
  );
  const a = buildGeometryAuthoritySummary(approved);
  const b = buildGeometryAuthoritySummary([...approved].reverse());
  assert.equal(a.approvedFinishedEdgeLf, b.approvedFinishedEdgeLf);
  assert.equal(a.eligibleBacksplashLengthIn, b.eligibleBacksplashLengthIn);
  console.log("ok: reordering pieces does not alter geometry totals");
}

console.log("\nAll takeoffPieceGeometryAuthority tests passed.\n");
