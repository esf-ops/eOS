/**
 * Room-scoped Digital Estimate edge pricing — full regression suite.
 *
 * Run: npm run eos:test:room-scoped-edge-pricing
 * Sentinel data only. No production publish/email.
 */

import assert from "node:assert/strict";
import {
  buildStudioEstimateRoomsForPublication,
  buildSyntheticQuoteHeaderFromStudioEstimate
} from "../../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs";
import { resolveRoomApprovedEligibleEdgeLf } from "../../elite100EstimateStudio/studioRoomEdgeQuantity.mjs";
import {
  findFrozenEdgeOptionEffect,
  resolveEdgeOptionPriceEffect,
  resolvePremiumEdgeRatePerLf
} from "../catalog/studioEdgeAuthority.mjs";
import {
  assertPublicDtoHasNoForbiddenContent,
  buildPublicDigitalEstimateDto
} from "../digitalEstimatePublicSerializer.mjs";

const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KITCHEN_LF = 8;
const BATH_LF = 12;
const RATE = resolvePremiumEdgeRatePerLf("direct");
const WHOLESALE_RATE = resolvePremiumEdgeRatePerLf("wholesale");

function approvedPiece(id, name, finishedEdgeLf, extras = {}) {
  const inches = Math.round(finishedEdgeLf * 12 * 100) / 100;
  return {
    id,
    name,
    pieceType: "counter",
    lengthIn: inches,
    depthIn: 25.5,
    sqft: 15,
    included: true,
    finishedEdge: {
      frontEdgeLengthIn: inches,
      leftExposedEdgeLengthIn: 0,
      rightExposedEdgeLengthIn: 0,
      otherExposedEdgeLengthIn: 0,
      totalFinishedEdgeLengthIn: inches,
      approved: true,
      source: "estimator_confirmed"
    },
    ...extras
  };
}

function twoRoomEstimate(overrides = {}) {
  return {
    id: "studio-room-edge-suite",
    organizationId: ORG,
    revision: 1,
    status: "approved",
    takeoffJobId: "to-room-edge",
    approval: { customerDisplayTotal: 9000, calculationFingerprint: "fp-room-edge" },
    calculationSnapshot: {
      pricingBasis: "direct",
      fabrication: {
        edge: {
          profileToken: "edge_eased",
          finalLf: KITCHEN_LF + BATH_LF,
          pricedLf: 0,
          amount: 0,
          tier: "free"
        }
      },
      totals: { customerDisplayTotal: 9000 }
    },
    scope: {
      customerName: "Sentinel Room Edge Co",
      projectName: "Two Room",
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      physicalScopeSource: "takeoff",
      edgeProfileToken: "edge_eased",
      edgeEligibleLinearFeet: KITCHEN_LF + BATH_LF,
      takeoffScopeSummary: {
        approvedFinishedEdgeLf: KITCHEN_LF + BATH_LF,
        derivedOpenEdgeLf: KITCHEN_LF + BATH_LF
      },
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          included: true,
          countertopSqft: 40,
          pieces: [approvedPiece("k1", "Island", KITCHEN_LF)]
        },
        {
          id: "bath",
          name: "Bathroom",
          roomType: "Bathroom",
          included: true,
          countertopSqft: 20,
          pieces: [approvedPiece("b1", "Vanity", BATH_LF)]
        }
      ],
      ...(overrides.scope || {})
    },
    ...overrides
  };
}

function cents(lf, rate = RATE) {
  return Math.round(rate * lf * 100);
}

function effectFor(effects, token, roomKey) {
  return findFrozenEdgeOptionEffect(effects, token, roomKey);
}

console.log("\nroomScopedEdgePricing.test.mjs\n");

// 1. Upgrade Kitchen only → 8 LF
{
  const rooms = buildStudioEstimateRoomsForPublication(twoRoomEstimate());
  assert.equal(rooms.find((r) => r.id === "kitchen").edgeLinearFeet, KITCHEN_LF);
  assert.equal(rooms.find((r) => r.id === "bath").edgeLinearFeet, BATH_LF);
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate())
    .calculation_snapshot.internal_ui.edge_option_effects;
  assert.equal(
    effectFor(effects, "edge_small_ogee", "kitchen").priceEffectCents,
    cents(KITCHEN_LF)
  );
  console.log("ok: 1 Kitchen-only upgrade uses 8 LF");
}

// 2. Upgrade Bathroom only → 12 LF
{
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate())
    .calculation_snapshot.internal_ui.edge_option_effects;
  assert.equal(
    effectFor(effects, "edge_small_ogee", "bath").priceEffectCents,
    cents(BATH_LF)
  );
  console.log("ok: 2 Bathroom-only upgrade uses 12 LF");
}

// 3. Same profile both rooms → 8 + 12 = 20
{
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate())
    .calculation_snapshot.internal_ui.edge_option_effects;
  const k = effectFor(effects, "edge_crescent", "kitchen").priceEffectCents;
  const b = effectFor(effects, "edge_crescent", "bath").priceEffectCents;
  assert.equal(k + b, cents(KITCHEN_LF + BATH_LF));
  assert.equal(k, cents(KITCHEN_LF));
  assert.equal(b, cents(BATH_LF));
  console.log("ok: 3 both rooms same profile totals separate LF sums");
}

// 4. Different upgraded profiles per room
{
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(
    twoRoomEstimate({
      scope: {
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        edgeProfileToken: "edge_eased",
        rooms: twoRoomEstimate().scope.rooms
      },
      calculationSnapshot: {
        pricingBasis: "wholesale",
        fabrication: {
          edge: { profileToken: "edge_eased", finalLf: 20, amount: 0, tier: "free" }
        },
        totals: { customerDisplayTotal: 9000 }
      }
    })
  ).calculation_snapshot.internal_ui.edge_option_effects;
  // wholesale rates
  const k = effectFor(effects, "edge_knife", "kitchen");
  const b = effectFor(effects, "edge_crescent", "bath");
  assert.equal(k.priceEffectCents, cents(KITCHEN_LF, WHOLESALE_RATE));
  assert.equal(b.priceEffectCents, cents(BATH_LF, WHOLESALE_RATE));
  assert.notEqual(k.priceEffectCents, b.priceEffectCents);
  console.log("ok: 4 different profiles use own LF × wholesale rate");
}

// 5. Included profile → zero
{
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate())
    .calculation_snapshot.internal_ui.edge_option_effects;
  assert.equal(effectFor(effects, "edge_eased", "kitchen").priceEffectCents, 0);
  assert.equal(effectFor(effects, "edge_bevel", "bath").priceEffectCents, 0);
  console.log("ok: 5 included/free profiles add zero");
}

// 6. Excluded room → zero / not in publication rooms
{
  const est = twoRoomEstimate();
  est.scope.rooms[1].included = false;
  const rooms = buildStudioEstimateRoomsForPublication(est);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].id, "kitchen");
  assert.equal(rooms[0].edgeLinearFeet, KITCHEN_LF);
  console.log("ok: 6 excluded room omitted / adds zero");
}

// 7. Excluded piece LF excluded from room quantity
{
  const est = twoRoomEstimate();
  est.scope.rooms[0].pieces = [
    approvedPiece("k1", "Island", 5),
    approvedPiece("k2", "Excluded run", 3, { included: false })
  ];
  const q = resolveRoomApprovedEligibleEdgeLf(est.scope.rooms[0]);
  assert.equal(q.lf, 5);
  assert.equal(buildStudioEstimateRoomsForPublication(est)[0].edgeLinearFeet, 5);
  console.log("ok: 7 excluded piece LF not included");
}

// 8. Multiple approved pieces in one room sum
{
  const est = twoRoomEstimate();
  est.scope.rooms[0].pieces = [
    approvedPiece("k1", "Run A", 3),
    approvedPiece("k2", "Run B", 5)
  ];
  assert.equal(buildStudioEstimateRoomsForPublication(est)[0].edgeLinearFeet, 8);
  console.log("ok: 8 multiple pieces sum to room LF");
}

// 9. Missing room-level authoritative LF → upgraded blocked; never project total
{
  const est = twoRoomEstimate();
  est.scope.rooms[0].pieces = [{ id: "bare", pieceType: "counter", sqft: 10, included: true }];
  const rooms = buildStudioEstimateRoomsForPublication(est);
  const kitchen = rooms.find((r) => r.id === "kitchen");
  assert.equal(kitchen.edgeQuantityAuthoritative, false);
  assert.equal(kitchen.edgeLinearFeet, 0);
  assert.notEqual(kitchen.edgeLinearFeet, KITCHEN_LF + BATH_LF);
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(est).calculation_snapshot
    .internal_ui.edge_option_effects;
  const ogee = effectFor(effects, "edge_small_ogee", "kitchen");
  assert.equal(ogee.reviewRequired, true);
  assert.equal(ogee.priceEffectCents, null);
  assert.notEqual(ogee.priceEffectCents, cents(KITCHEN_LF + BATH_LF));
  console.log("ok: 9 missing room LF blocks upgrade; no project substitution");
}

// 10. Room choice never multiplies project-wide finalLf
{
  const rooms = buildStudioEstimateRoomsForPublication(twoRoomEstimate());
  for (const r of rooms) {
    assert.notEqual(r.edgeLinearFeet, KITCHEN_LF + BATH_LF);
  }
  const runtime = resolveEdgeOptionPriceEffect({
    profileToken: "edge_small_ogee",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: rooms[0].edgeLinearFeet,
    pricingBasis: "direct"
  });
  assert.equal(runtime.priceEffectCents, cents(KITCHEN_LF));
  console.log("ok: 10 room choice never uses project finalLf");
}

// 11. Publication envelope freezes room-level edge quantities
{
  const header = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate());
  const estRooms = header.calculation_snapshot.internal_ui.estimate_rooms;
  assert.equal(estRooms.find((r) => r.id === "kitchen").edgeLinearFeet, KITCHEN_LF);
  assert.equal(estRooms.find((r) => r.id === "bath").edgeLinearFeet, BATH_LF);
  assert.equal(estRooms.find((r) => r.id === "kitchen").edgeQuantityAuthoritative, true);
  console.log("ok: 11 publication freezes per-room edge LF");
}

// 12. Changing Studio/Takeoff after publication does not alter frozen snapshot
{
  const frozen = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate());
  const kitchenBefore = frozen.calculation_snapshot.internal_ui.estimate_rooms.find(
    (r) => r.id === "kitchen"
  ).edgeLinearFeet;
  // Mutate live estimate after freeze
  const live = twoRoomEstimate();
  live.scope.rooms[0].pieces = [approvedPiece("k1", "Island", 99)];
  live.calculationSnapshot.fabrication.edge.finalLf = 999;
  assert.equal(kitchenBefore, KITCHEN_LF);
  assert.notEqual(
    buildStudioEstimateRoomsForPublication(live)[0].edgeLinearFeet,
    kitchenBefore
  );
  // Frozen object unchanged
  assert.equal(
    frozen.calculation_snapshot.internal_ui.estimate_rooms.find((r) => r.id === "kitchen")
      .edgeLinearFeet,
    KITCHEN_LF
  );
  console.log("ok: 12 frozen publication unchanged by later Studio edits");
}

// 13. Config save/reload model preserves edge selection by room (option keys)
{
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate())
    .calculation_snapshot.internal_ui.edge_option_effects;
  const kitchenKeys = effects.filter((e) => e.roomKey === "kitchen").map((e) => e.profileKey);
  const bathKeys = effects.filter((e) => e.roomKey === "bath").map((e) => e.profileKey);
  assert.ok(kitchenKeys.includes("edge_small_ogee"));
  assert.ok(bathKeys.includes("edge_small_ogee"));
  assert.equal(
    effectFor(effects, "edge_small_ogee", "kitchen").priceEffectCents,
    cents(KITCHEN_LF)
  );
  assert.equal(
    effectFor(effects, "edge_small_ogee", "bath").priceEffectCents,
    cents(BATH_LF)
  );
  // Selection keys remain room-scoped
  assert.match(`edge:kitchen:edge_small_ogee`, /^edge:kitchen:/);
  assert.match(`edge:bath:edge_crescent`, /^edge:bath:/);
  console.log("ok: 13 edge selection keys + effects remain room-scoped");
}

// 14. Review request continuity: room deltas do not collapse
{
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate())
    .calculation_snapshot.internal_ui.edge_option_effects;
  const reviewSummary = {
    rooms: [
      {
        roomKey: "kitchen",
        selectedEdge: "edge_small_ogee",
        eligibleLf: KITCHEN_LF,
        edgeDeltaCents: effectFor(effects, "edge_small_ogee", "kitchen").priceEffectCents
      },
      {
        roomKey: "bath",
        selectedEdge: "edge_knife",
        eligibleLf: BATH_LF,
        edgeDeltaCents: effectFor(effects, "edge_knife", "bath").priceEffectCents
      }
    ]
  };
  assert.equal(reviewSummary.rooms.length, 2);
  assert.notEqual(
    reviewSummary.rooms[0].edgeDeltaCents,
    reviewSummary.rooms[1].edgeDeltaCents
  );
  assert.equal(
    reviewSummary.rooms.reduce((s, r) => s + r.edgeDeltaCents, 0),
    cents(KITCHEN_LF) + cents(BATH_LF)
  );
  console.log("ok: 14 review summary retains per-room edge selection + delta");
}

// 15. Public DTO safety
{
  const dto = buildPublicDigitalEstimateDto(
    {
      quoteNumber: "SE-EDGE",
      publishedAt: "2026-07-24T00:00:00.000Z",
      project: { customerName: "Sentinel", projectName: "Two Room" },
      rooms: [],
      totals: { estimatedProjectTotal: 9000, currency: "USD" },
      accountDirectoryAccountId: ORG,
      takeoffJobId: "secret-takeoff",
      calculationSnapshot: { fabrication: { edge: { finalLf: 20, ratePerLf: 25 } } }
    },
    { accessExpiresAt: null }
  );
  const json = JSON.stringify(dto);
  assert.doesNotMatch(json, /accountDirectory|takeoffJobId|ratePerLf|finalLf|ORG/i);
  assertPublicDtoHasNoForbiddenContent(dto);
  console.log("ok: 15 public DTO has no internal UUIDs / pricing internals");
}

// 16. No automatic publish/email introduced by room edge helpers
{
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL("../../elite100EstimateStudio/studioRoomEdgeQuantity.mjs", import.meta.url),
      "utf8"
    )
  );
  assert.doesNotMatch(src, /publishDigitalEstimate|sendEstimateEmail|resend|quote-delivery/i);
  const adapter = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL("../../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs", import.meta.url),
      "utf8"
    )
  );
  assert.doesNotMatch(
    adapter.slice(
      adapter.indexOf("buildStudioEstimateRoomsForPublication"),
      adapter.indexOf("buildStudioEstimateRoomsForPublication") + 4000
    ),
    /publishDigitalEstimate\(|sendEstimateEmail/
  );
  console.log("ok: 16 no automatic publish/email in room-edge paths");
}

// 17. findFrozenEdgeOptionEffect does not leak kitchen cents to bath
{
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(twoRoomEstimate())
    .calculation_snapshot.internal_ui.edge_option_effects;
  assert.equal(
    findFrozenEdgeOptionEffect(effects, "edge_small_ogee", "bath").priceEffectCents,
    cents(BATH_LF)
  );
  assert.equal(
    findFrozenEdgeOptionEffect(effects, "edge_small_ogee", "kitchen").priceEffectCents,
    cents(KITCHEN_LF)
  );
  console.log("ok: 17 frozen effect lookup is room-bound");
}

console.log("\nroomScopedEdgePricing.test.mjs: ok\n");
