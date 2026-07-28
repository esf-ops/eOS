/**
 * elite100RoomPricingCalculator authoritative test matrix.
 * Run: node backend-core/src/elite100EstimateStudio/elite100RoomPricingCalculator.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  calculateElite100Estimate,
  computeElite100QualifyingKitchenCounterSf,
  ELITE100_ADDITIONAL_VANITY_TRIP,
  ELITE100_BACKSIDE_POLISH,
  ELITE100_CUTOUT_RATES,
  ELITE100_DIRECT_RATE_PER_SF,
  ELITE100_MITER_RATE_PER_LF,
  ELITE100_ROOM_PRICING_ENGINE,
  ELITE100_ROOM_PRICING_VERSION,
  ELITE100_UPGRADED_EDGE_RATE_PER_LF,
  ELITE100_WATERFALL_LABOR_PER_LEG,
  ELITE100_WHOLESALE_RATE_PER_SF,
  evaluateElite100VanityProgram,
  normalizeElite100PricingBasis,
  resolveElite100MaterialRatePerSf,
  resolveElite100ProductSelection,
  toCustomerSafeElite100EstimateResult,
  toCustomerSafeElite100RoomResult
} from "./elite100RoomPricingCalculator.mjs";
import {
  calculateElite100StudioEstimate,
  mapStudioEstimateToElite100Input,
  mapStudioScopeToElite100Configuration,
  mapStudioScopeToElite100Scope
} from "./elite100RoomPricingStudioAdapter.mjs";
import { PROTOTYPE_TIER_PRICE_PER_SQFT } from "../quotes/quoteCalculator.js";
import { VANITY_PROGRAM_2026_BY_CODE } from "../quotes/vanityProgram2026.js";
import { normalizeEdgeProfileToken, edgeProfileDisplayLabel } from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const WATTS_ID = "watts-trusted-1";
const SPAHN_ID = "spahn-trusted-1";
const TRUSTED_ENV = {
  ELITE100_TRUSTED_WATTS_PARTNER_ACCOUNT_IDS: WATTS_ID,
  ELITE100_TRUSTED_SPAHN_PARTNER_ACCOUNT_IDS: SPAHN_ID
};

/** Minimal one-room scope/configuration builder shared by many blocks below. */
function oneRoomInput({
  roomId = "r1",
  roomType = "Kitchen",
  pieces,
  materialGroup = "Group Promo",
  pricingBasis = "direct_retail",
  roomConfig = {},
  customLines = [],
  partnerAccountId = null
} = {}) {
  return {
    scope: {
      estimateId: "est-1",
      organizationId: "org-1",
      partnerAccountId,
      pricingBasis,
      rooms: [
        {
          id: roomId,
          name: "Room",
          roomType,
          pieces: pieces ?? [{ id: "p1", pieceType: "counter", lengthIn: 120, depthIn: 25.2, quantity: 1 }]
        }
      ],
      customLines
    },
    configuration: {
      rooms: {
        [roomId]: { materialGroup, ...roomConfig }
      }
    }
  };
}

console.log("\nelite100RoomPricingCalculator.test.mjs\n");

// =========================================================================
// IDENTITY / VERSIONING
// =========================================================================
{
  assert.equal(ELITE100_ROOM_PRICING_ENGINE, "elite100-room-pricing-v1");
  assert.equal(ELITE100_ROOM_PRICING_VERSION, 4);
  const { scope, configuration } = oneRoomInput();
  const result = await calculateElite100Estimate({ scope, configuration });
  assert.equal(result.pricingVersion, 4);
  assert.equal(result.pricingEngine, "elite100-room-pricing-v1");
  assert.equal(result.snapshot.pricingVersion, 4);
  // Old pricingVersion 1-3 tables are untouched by this module.
  assert.equal(PROTOTYPE_TIER_PRICE_PER_SQFT.Remnant, 50, "legacy v1-3 wholesale Remnant table must remain $50 (unchanged)");
  console.log("ok: new calculations report pricingEngine elite100-room-pricing-v1 / pricingVersion 4; legacy v1-3 tables untouched");
}

// =========================================================================
// MATERIAL
// =========================================================================
{
  const DIRECT_EXPECTED = {
    "Group Promo": 70,
    "Group A": 77,
    "Group B": 85,
    "Group C": 95,
    "Group D": 105,
    "Group E": 120,
    "Group F": 135,
    Remnant: 50
  };
  const WHOLESALE_EXPECTED = {
    "Group Promo": 45,
    "Group A": 57,
    "Group B": 65,
    "Group C": 75,
    "Group D": 85,
    "Group E": 100,
    "Group F": 115,
    Remnant: 45
  };
  for (const [group, rate] of Object.entries(DIRECT_EXPECTED)) {
    assert.equal(ELITE100_DIRECT_RATE_PER_SF[group], rate, `direct/retail ${group}`);
    const r = resolveElite100MaterialRatePerSf({ materialGroup: group, pricingBasis: "direct_retail" });
    assert.equal(r.rate, rate, `resolved direct/retail ${group}`);
    // No Public Quote Tool 25% markup.
    assert.notEqual(r.rate, round2(rate * 1.25), `${group} must not carry the 25% public planning markup`);
  }
  for (const [group, rate] of Object.entries(WHOLESALE_EXPECTED)) {
    assert.equal(ELITE100_WHOLESALE_RATE_PER_SF[group], rate, `wholesale ${group}`);
    const r = resolveElite100MaterialRatePerSf({ materialGroup: group, pricingBasis: "wholesale" });
    assert.equal(r.rate, rate, `resolved wholesale ${group}`);
  }
  // Explicit isolated-version divergence: v4 Wholesale Remnant is $45 (legacy v1-3 stays $50).
  assert.equal(ELITE100_WHOLESALE_RATE_PER_SF.Remnant, 45);
  assert.notEqual(ELITE100_WHOLESALE_RATE_PER_SF.Remnant, PROTOTYPE_TIER_PRICE_PER_SQFT.Remnant);
  console.log("ok: every Direct/Retail and Wholesale material group matches the exact rate table; no 25% markup; v4 Wholesale Remnant = $45 (isolated from legacy $50)");
}

{
  // lengthIn 120 x depthIn 25.2 => exactly 21.0 sqft (whole number, isolates rate math from ceiling).
  const { scope, configuration } = oneRoomInput({ materialGroup: "Group Promo", pricingBasis: "direct_retail" });
  const result = await calculateElite100Estimate({ scope, configuration });
  const room = result.rooms[0];
  assert.equal(room.measuredCountertopSf, 21);
  assert.equal(room.billedCountertopSf, 21);
  assert.equal(room.materialRatePerSf, 70);
  assert.equal(room.countertopMaterialSubtotal, 1470);
  assert.equal(room.countertopTaxAmount, round2(1470 * 0.02));
  assert.equal(room.countertopTaxAmount, 29.4);
  console.log("ok: 2% material use tax on countertop material computed exactly");
}

{
  // Fractional measured SF: lengthIn 100 x depthIn 30 = 20.8333 measured, billed ceils to 21.
  const { scope, configuration } = oneRoomInput({
    pieces: [{ id: "p1", pieceType: "counter", lengthIn: 100, depthIn: 30, quantity: 1 }]
  });
  const result = await calculateElite100Estimate({ scope, configuration });
  const room = result.rooms[0];
  assert.equal(room.measuredCountertopSf, round2((100 * 30) / 144));
  assert.equal(room.measuredCountertopSf, 20.83);
  assert.equal(room.billedCountertopSf, 21);
  assert.notEqual(room.measuredCountertopSf, room.billedCountertopSf, "measured and billed SF must be distinguishable/auditable");
  console.log("ok: measured vs billed SF returned separately and auditable");
}

{
  // Multiple rooms, different material groups, same pricing basis.
  const scope = {
    estimateId: "est-multi",
    organizationId: "org-1",
    pricingBasis: "direct_retail",
    rooms: [
      { id: "r1", name: "Kitchen", roomType: "Kitchen", pieces: [{ id: "p1", pieceType: "counter", lengthIn: 120, depthIn: 24, quantity: 1 }] },
      { id: "r2", name: "Bar", roomType: "Kitchen", pieces: [{ id: "p2", pieceType: "counter", lengthIn: 72, depthIn: 24, quantity: 1 }] }
    ],
    customLines: []
  };
  const configuration = { rooms: { r1: { materialGroup: "Group Promo" }, r2: { materialGroup: "Group F" } } };
  const result = await calculateElite100Estimate({ scope, configuration });
  const r1 = result.rooms.find((r) => r.roomId === "r1");
  const r2 = result.rooms.find((r) => r.roomId === "r2");
  assert.equal(r1.materialRatePerSf, 70);
  assert.equal(r2.materialRatePerSf, 135);
  assert.equal(r1.billedCountertopSf, 20);
  assert.equal(r2.billedCountertopSf, 12);
  assert.equal(r1.countertopMaterialSubtotal, 1400);
  assert.equal(r2.countertopMaterialSubtotal, 1620);
  console.log("ok: multiple rooms price independently against their own selected material group");
}

// =========================================================================
// EDGES
// =========================================================================
{
  const FREE = ["edge_eased", "edge_large_eased", "edge_full_bullnose", "edge_large_ogee", "edge_bevel"];
  const PREMIUM = ["edge_small_ogee", "edge_crescent", "edge_knife"];
  for (const basis of ["direct_retail", "wholesale"]) {
    for (const token of FREE) {
      const { scope, configuration } = oneRoomInput({ pricingBasis: basis, roomConfig: { edgeProfile: token }, roomId: "r1" });
      scope.rooms[0].edgeFinishedLf = 10;
      const result = await calculateElite100Estimate({ scope, configuration });
      assert.equal(result.rooms[0].edge.amount, 0, `${token} (${basis}) must be $0/LF`);
    }
    for (const token of PREMIUM) {
      const { scope, configuration } = oneRoomInput({ pricingBasis: basis, roomConfig: { edgeProfile: token }, roomId: "r1" });
      scope.rooms[0].edgeFinishedLf = 10;
      const result = await calculateElite100Estimate({ scope, configuration });
      assert.equal(result.rooms[0].edge.amount, 150, `${token} (${basis}) must be 10 LF * $15`);
      assert.equal(result.rooms[0].edge.ratePerLf, ELITE100_UPGRADED_EDGE_RATE_PER_LF);
    }
  }
  assert.equal(ELITE100_UPGRADED_EDGE_RATE_PER_LF, 15);
  console.log("ok: 5 included profiles = $0/LF; Small Ogee/Crescent/Knife = $15/LF identically for Direct/Retail and Wholesale");
}

{
  // No W/D label in new customer-safe output.
  const { scope, configuration } = oneRoomInput({ roomConfig: { edgeProfile: "edge_small_ogee" } });
  scope.rooms[0].edgeFinishedLf = 5;
  const result = await calculateElite100Estimate({ scope, configuration });
  const label = result.rooms[0].edge.profileLabel;
  assert.ok(!/\bW\b|\bD\b|w_edge|d_edge/i.test(label), `edge label "${label}" must not leak legacy W/D tokens`);
  assert.equal(label, "Small Ogee");
  const customerSafe = toCustomerSafeElite100RoomResult(result.rooms[0]);
  assert.ok(customerSafe.lineItems.every((l) => !/w_edge|d_edge/i.test(l.label)));
  // Historical W/D compatibility remains loadable (unchanged studioEdgeAuthority behavior).
  assert.equal(normalizeEdgeProfileToken("w_edge"), "edge_small_ogee");
  assert.equal(normalizeEdgeProfileToken("d_edge"), "edge_small_ogee");
  assert.equal(edgeProfileDisplayLabel("w_edge"), "Small Ogee");
  console.log("ok: no W/D edge label anywhere in new customer-safe output; legacy W/D tokens remain loadable via studioEdgeAuthority");
}

{
  // Per-piece finished edge LF + per-piece profile override.
  const { scope, configuration } = oneRoomInput({
    pieces: [
      { id: "p1", pieceType: "counter", lengthIn: 120, depthIn: 25, quantity: 1, finishedEdgeLf: 8 },
      { id: "p2", pieceType: "counter", lengthIn: 60, depthIn: 25, quantity: 1, finishedEdgeLf: 4 }
    ],
    roomConfig: { edgeProfile: "edge_eased", pieceEdgeProfiles: { p2: "edge_knife" } }
  });
  const result = await calculateElite100Estimate({ scope, configuration });
  const edge = result.rooms[0].edge;
  assert.equal(edge.amount, 60, "only p2 (4 LF knife) should be charged: 4 * 15 = 60");
  assert.equal(edge.byPiece.find((p) => p.pieceId === "p1").amount, 0);
  assert.equal(edge.byPiece.find((p) => p.pieceId === "p2").amount, 60);
  console.log("ok: per-piece finished-edge LF and per-piece profile override price independently");
}

// =========================================================================
// MITERS
// =========================================================================
{
  const RATES = { "2-3in": 65, "4in": 70, "5in": 75, "6in": 80 };
  for (const [key, rate] of Object.entries(RATES)) {
    assert.equal(ELITE100_MITER_RATE_PER_LF[key], rate);
    const { scope, configuration } = oneRoomInput({ roomConfig: { miter: { lf: 10, key } } });
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].standaloneMiter.amount, 10 * rate, `${key} miter charge`);
  }
  console.log("ok: miter rates exact — 2-3in=65, 4in=70, 5in=75, 6in=80 per LF");
}

// =========================================================================
// WATERFALLS
// =========================================================================
{
  // Island piece; waterfalls on opposite sides with different leg heights (one polished, one not).
  const { scope, configuration } = oneRoomInput({
    materialGroup: "Group Promo",
    pricingBasis: "wholesale", // rate 45
    pieces: [
      { id: "island-1", pieceType: "counter", lengthIn: 96, depthIn: 42, quantity: 1 },
      { id: "peninsula-1", pieceType: "counter", lengthIn: 60, depthIn: 25, quantity: 1 }
    ],
    roomConfig: {
      waterfalls: [
        { id: "wf-left", targetPieceId: "island-1", side: "left", legHeightIn: 36, backsidePolish: true, miterKey: "4in" },
        { id: "wf-right", targetPieceId: "island-1", side: "right", legHeightIn: 30, backsidePolish: false, miterKey: "2-3in" },
        { id: "wf-front", targetPieceId: "peninsula-1", side: "front", legHeightIn: 36, backsidePolish: false }
      ]
    }
  });
  const result = await calculateElite100Estimate({ scope, configuration });
  const room = result.rooms[0];
  assert.equal(room.waterfalls.length, 3, "waterfalls on multiple pieces + both sides of one island");

  const left = room.waterfalls.find((w) => w.id === "wf-left");
  assert.equal(left.measuredSf, 10.5, "42 depth x 36 leg / 144");
  assert.equal(left.billedSf, 11);
  assert.equal(left.materialAmount, 495, "11 billed SF * $45");
  assert.equal(left.taxAmount, 9.9, "2% of material only");
  assert.equal(left.laborAmount, ELITE100_WATERFALL_LABOR_PER_LEG);
  assert.equal(left.laborAmount, 600);
  assert.equal(left.polishAmount, ELITE100_BACKSIDE_POLISH);
  assert.equal(left.polishAmount, 225);
  assert.equal(left.miterLf, 3.5, "42 / 12");
  assert.equal(left.miterRatePerLf, 70);
  assert.equal(left.miterAmount, 245);
  assert.equal(left.total, round2(495 + 9.9 + 600 + 225 + 245));
  assert.equal(left.total, 1574.9);

  const right = room.waterfalls.find((w) => w.id === "wf-right");
  assert.equal(right.measuredSf, 8.75, "42 depth x 30 leg / 144 — different leg height than left");
  assert.equal(right.billedSf, 9);
  assert.equal(right.materialAmount, 405);
  assert.equal(right.taxAmount, 8.1);
  assert.equal(right.polishAmount, 0, "no backside polish selected");
  assert.equal(right.miterRatePerLf, 65);
  assert.equal(right.miterAmount, round2(3.5 * 65));
  assert.equal(right.miterAmount, 227.5);
  assert.equal(right.total, round2(405 + 8.1 + 600 + 0 + 227.5));

  const front = room.waterfalls.find((w) => w.id === "wf-front");
  assert.equal(front.measuredSf, 15, "60 length x 36 leg / 144 — derived from lengthIn on front/back side");
  assert.equal(front.billedSf, 15);
  assert.equal(front.materialAmount, 675);
  assert.equal(front.miterAmount, 0, "no miterKey supplied");

  assert.equal(room.waterfallMeasuredSf, round2(10.5 + 8.75 + 15));
  assert.equal(room.waterfallBilledSf, 11 + 9 + 15);
  assert.equal(room.waterfallMaterialSubtotal, round2(495 + 405 + 675));
  assert.equal(room.waterfallTaxTotal, round2(9.9 + 8.1 + 13.5));
  assert.equal(room.waterfallLaborTotal, 1800, "3 legs * 600");
  assert.equal(room.waterfallPolishTotal, 225, "only one leg polished");
  assert.equal(room.waterfallMiterTotal, round2(245 + 227.5 + 0));

  // Old 15/LF waterfall rule must not be used anywhere in these numbers.
  const oldRuleLeft = round2(left.miterLf * 15);
  assert.notEqual(left.materialAmount, oldRuleLeft);
  assert.notEqual(left.total, round2(3.5 * 15));

  // Full-room consistency: room total is the exact sum of every component (no silent extra/missing charge).
  const expectedRoomTotal = round2(
    room.countertopMaterialSubtotal +
      room.materialUseTaxAmount +
      room.waterfallMaterialSubtotal +
      room.waterfallLaborTotal +
      room.waterfallPolishTotal +
      room.waterfallMiterTotal +
      room.edge.amount
  );
  assert.equal(room.exactTotal, expectedRoomTotal);
  console.log("ok: waterfalls — measured/billed SF, material at room rate, tax only on material, $600 labor/leg, backside polish, derived miter LF/charge, multiple pieces + opposite sides with different leg heights; old 15/LF rule unused");
}

{
  // Waterfall referencing an unknown piece is reported unresolved, not silently zeroed.
  const { scope, configuration } = oneRoomInput({
    roomConfig: { waterfalls: [{ id: "wf-bad", targetPieceId: "does-not-exist", side: "left", legHeightIn: 36 }] }
  });
  const result = await calculateElite100Estimate({ scope, configuration });
  assert.equal(result.rooms[0].waterfalls.length, 0);
  assert.ok(result.rooms[0].unresolved.some((u) => u.code === "waterfall_target_piece_missing"));
  console.log("ok: waterfall on an unknown piece is reported unresolved (no waterfall unresolved blocker remains for valid waterfalls)");
}

// =========================================================================
// BACKSPLASH / SIDE SPLASH
// =========================================================================
{
  const base = { materialGroup: "Group Promo", pricingBasis: "direct_retail" }; // rate 70

  // Four-inch backsplash.
  {
    const { scope, configuration } = oneRoomInput({ ...base, roomConfig: { backsplash: { selected: true } } });
    scope.rooms[0].backsplashEligibleRunLengthIn = 120;
    const result = await calculateElite100Estimate({ scope, configuration });
    const bs = result.rooms[0].backsplash;
    assert.equal(bs.heightIn, 4);
    assert.equal(bs.measuredSf, round2((120 * 4) / 144));
    assert.equal(bs.billedSf, 4);
    assert.equal(bs.materialSubtotal, 280);
    assert.equal(bs.taxAmount, 5.6);
  }
  // Custom-height backsplash.
  {
    const { scope, configuration } = oneRoomInput({ ...base, roomConfig: { backsplash: { selected: true, heightIn: 18 } } });
    scope.rooms[0].backsplashEligibleRunLengthIn = 120;
    const result = await calculateElite100Estimate({ scope, configuration });
    const bs = result.rooms[0].backsplash;
    assert.equal(bs.heightIn, 18);
    assert.equal(bs.measuredSf, 15);
    assert.equal(bs.billedSf, 15);
    assert.equal(bs.materialSubtotal, 1050);
    assert.equal(bs.taxAmount, 21);
  }
  // No backsplash.
  {
    const { scope, configuration } = oneRoomInput({ ...base, roomConfig: { backsplash: { selected: false } } });
    const result = await calculateElite100Estimate({ scope, configuration });
    const bs = result.rooms[0].backsplash;
    assert.equal(bs.selected, false);
    assert.equal(bs.materialSubtotal, 0);
  }
  // Left / right / both side splashes (piece depth 25.2).
  for (const [sel, expectedSides] of [["left", 1], ["right", 1], ["both", 2]]) {
    const { scope, configuration } = oneRoomInput({ ...base, roomConfig: { sideSplashes: { p1: sel } } });
    const result = await calculateElite100Estimate({ scope, configuration });
    const ss = result.rooms[0].sideSplash;
    const measured = round2((25.2 * 4 * expectedSides) / 144);
    assert.equal(ss.measuredSf, measured, `${sel} side splash measured SF`);
    const billed = Math.ceil(measured);
    assert.equal(ss.billedSf, billed);
    assert.equal(ss.materialSubtotal, round2(billed * 70));
    assert.equal(ss.taxAmount, round2(ss.materialSubtotal * 0.02));
  }
  console.log("ok: 4-inch and custom-height backsplash, no-backsplash, left/right/both side splashes all price at the room material rate with correct 2% tax");
}

// =========================================================================
// CUTOUTS / PRODUCTS
// =========================================================================
{
  assert.equal(ELITE100_CUTOUT_RATES.kitchenSink, 200);
  assert.equal(ELITE100_CUTOUT_RATES.vanitySink, 100);
  assert.equal(ELITE100_CUTOUT_RATES.cooktop, 150);
  assert.equal(ELITE100_CUTOUT_RATES.electricalOutlet, 30);

  // Kitchen sink cutout.
  {
    const { scope, configuration } = oneRoomInput({ roomConfig: { sinks: [{ id: "s1", sinkKind: "kitchen", quantity: 1 }] } });
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].cutouts.kitchenSinkQty, 1);
    assert.equal(result.rooms[0].cutouts.kitchenSinkCharge, 200);
  }
  // Vanity sink cutout, customer-supplied (no product price) — cutout still applies.
  {
    const { scope, configuration } = oneRoomInput({
      roomType: "Vanity",
      roomConfig: { sinks: [{ id: "s1", sinkKind: "vanity", quantity: 1 }], vanityProgram: { useStandardPricing: true } }
    });
    const result = await calculateElite100Estimate({ scope, configuration });
    const sinkLine = result.rooms[0].sinks[0];
    assert.equal(result.rooms[0].cutouts.vanitySinkCharge, 100);
    assert.equal(sinkLine.customerSupplied, true);
    assert.equal(sinkLine.product, null);
    assert.equal(result.rooms[0].sinkProductsTotal, 0);
  }
  // Two bathroom sinks => two cutouts.
  {
    const { scope, configuration } = oneRoomInput({
      roomType: "Vanity",
      roomConfig: {
        sinks: [
          { id: "s1", sinkKind: "vanity", quantity: 1 },
          { id: "s2", sinkKind: "vanity", quantity: 1 }
        ],
        vanityProgram: { useStandardPricing: true }
      }
    });
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].cutouts.vanitySinkQty, 2);
    assert.equal(result.rooms[0].cutouts.vanitySinkCharge, 200);
  }
  // Cooktop + electrical outlet cutouts.
  {
    const { scope, configuration } = oneRoomInput({ roomConfig: { cutouts: { cooktopQuantity: 1, electricalOutletQuantity: 2 } } });
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].cutouts.cooktopCharge, 150);
    assert.equal(result.rooms[0].cutouts.electricalOutletCharge, 60);
  }
  // Active catalog product resolves real price (kansas:1512UM18, sellPrice 90).
  {
    const resolved = resolveElite100ProductSelection({ productId: "kansas:1512UM18", quantity: 1 });
    assert.equal(resolved.active, true);
    assert.equal(resolved.reviewRequired, false);
    assert.equal(resolved.unitPrice, 90);
    assert.equal(resolved.lineTotal, 90);
  }
  // Not found.
  {
    const resolved = resolveElite100ProductSelection({ productId: "does-not-exist-in-catalog", quantity: 1 });
    assert.equal(resolved.reviewRequired, true);
    assert.equal(resolved.unitPrice, null);
    assert.match(resolved.reason, /not found/);
  }
  // Inactive product (injected fake catalog — live seed has none inactive today).
  {
    const fakeLookup = (id) =>
      id === "fake:inactive-1"
        ? { productId: id, displayName: "Fake Inactive", category: "sink", active: false, pricingTreatment: "priced", sellPrice: 100 }
        : null;
    const resolved = resolveElite100ProductSelection({ productId: "fake:inactive-1", quantity: 1, catalogLookupImpl: fakeLookup });
    assert.equal(resolved.active, false);
    assert.equal(resolved.reviewRequired, true);
    assert.match(resolved.reason, /inactive/);
  }
  // Unpriced product (real catalog review_only item).
  {
    const unpricedId =
      "specialty:glowback-led-panels-are-custom-made-for-each-project-to-fit-the-dimensions-of-each-piece-project";
    const resolved = resolveElite100ProductSelection({ productId: unpricedId, quantity: 1 });
    assert.equal(resolved.active, true);
    assert.equal(resolved.reviewRequired, true);
    assert.equal(resolved.unitPrice, null);
    assert.match(resolved.reason, /no resolved catalog price/);

    const { scope, configuration } = oneRoomInput({ roomConfig: { products: [{ id: "pr1", productId: unpricedId, quantity: 1 }] } });
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].productsTotal, 0, "unpriced product must not contribute an invented price");
    assert.ok(result.rooms[0].unresolved.some((u) => u.code === "product_review_required"));
  }
  console.log("ok: cutouts (kitchen/vanity/cooktop/outlet), customer-supplied sinks, and active/inactive/unpriced/not-found product resolution all behave exactly per spec");
}

// =========================================================================
// VANITY PROGRAM
// =========================================================================
{
  // Every program-table row, both tiers.
  for (const [code, row] of Object.entries(VANITY_PROGRAM_2026_BY_CODE)) {
    for (const tier of ["over", "under"]) {
      const kitchenSf = tier === "over" ? 40 : 20;
      const expected = tier === "over" ? row.over35 : row.under35;
      const sinks = Array.from({ length: row.bowlCount }, (_, i) => ({ id: `s${i}`, sinkKind: "vanity", quantity: 1 }));
      const scope = {
        estimateId: "est-vp",
        organizationId: "org-1",
        pricingBasis: "wholesale",
        rooms: [
          { id: "kitchen", name: "Kitchen", roomType: "Kitchen", pieces: [{ id: "kp1", pieceType: "counter", lengthIn: 1, depthIn: 1, quantity: 1, directArea: kitchenSf }] },
          { id: "van", name: "Vanity", roomType: "Vanity", pieces: [{ id: "vp1", pieceType: "counter", lengthIn: row.widthIn, depthIn: 22.5, quantity: 1 }] }
        ],
        customLines: []
      };
      const configuration = { rooms: { kitchen: { materialGroup: "Group Promo" }, van: { materialGroup: "Group Promo", sinks } } };
      const result = await calculateElite100Estimate({ scope, configuration });
      const vanRoom = result.rooms.find((r) => r.roomId === "van");
      assert.equal(vanRoom.vanityProgram.qualifies, true, `${code} ${tier}35 should qualify`);
      assert.equal(vanRoom.vanityProgram.bundleExactTotal, expected, `${code} ${tier}35 bundle price`);
      assert.equal(vanRoom.countertopMaterialSubtotal, 0, "bundle replaces the per-SF material charge");
      assert.equal(vanRoom.exactTotal, expected, `${code} ${tier}35 room total is exactly the bundle price (no double add)`);
    }
  }
  console.log(`ok: all ${Object.keys(VANITY_PROGRAM_2026_BY_CODE).length} Vanity Program table rows price exactly in both kitchen-SF tiers`);
}

{
  // Exactly 35 kitchen SF => lower (over35) column; 34.99 => higher (under35) column.
  const row = VANITY_PROGRAM_2026_BY_CODE["61_D"];
  for (const [directArea, expectedField] of [[35, "over35"], [34.99, "under35"]]) {
    const scope = {
      estimateId: "est-boundary",
      pricingBasis: "wholesale",
      rooms: [
        { id: "kitchen", roomType: "Kitchen", name: "Kitchen", pieces: [{ id: "kp1", pieceType: "counter", lengthIn: 1, depthIn: 1, directArea }] },
        { id: "van", roomType: "Vanity", name: "Vanity", pieces: [{ id: "vp1", pieceType: "counter", lengthIn: 61, depthIn: 22.5 }] }
      ],
      customLines: []
    };
    const configuration = {
      rooms: {
        kitchen: { materialGroup: "Group Promo" },
        van: {
          materialGroup: "Group Promo",
          sinks: [{ id: "s1", sinkKind: "vanity", quantity: 2 }]
        }
      }
    };
    const result = await calculateElite100Estimate({ scope, configuration });
    const vanRoom = result.rooms.find((r) => r.roomId === "van");
    assert.equal(vanRoom.vanityProgram.bundleExactTotal, row[expectedField], `kitchen SF ${directArea} => ${expectedField}`);
  }
  console.log("ok: exactly 35 kitchen SF uses the lower (>=35) column; 34.99 uses the higher (<35) column");
}

{
  // Material qualification: Promo qualifies; available remnant qualifies; unavailable non-Promo remnant does not.
  const buildVanity = (materialGroup, vanityProgram) => ({
    scope: {
      pricingBasis: "wholesale",
      rooms: [{ id: "van", roomType: "Vanity", name: "Vanity", pieces: [{ id: "vp1", pieceType: "counter", lengthIn: 25, depthIn: 22.5 }] }],
      customLines: []
    },
    configuration: { rooms: { van: { materialGroup, sinks: [{ id: "s1", sinkKind: "vanity", quantity: 1 }], vanityProgram } } }
  });

  {
    const { scope, configuration } = buildVanity("Group Promo", undefined);
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].vanityProgram.qualifies, true, "Promo qualifies");
  }
  {
    const { scope, configuration } = buildVanity("Remnant", { remnantQualifies: true });
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].vanityProgram.qualifies, true, "available qualifying Elite 100 remnant qualifies");
  }
  {
    const { scope, configuration } = buildVanity("Remnant", { remnantQualifies: false });
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].vanityProgram.qualifies, false, "unavailable non-Promo remnant does not qualify");
    assert.ok(result.rooms[0].vanityProgram.disqualifyReasons.includes("material_not_qualifying"));
  }
  {
    const { scope, configuration } = buildVanity("Group A", undefined);
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].vanityProgram.qualifies, false, "non-Promo, non-remnant group does not qualify");
  }
  console.log("ok: Vanity Program material qualification — Promo qualifies, approved-available remnant qualifies, unavailable/non-Promo remnant and other groups do not");
}

{
  // Non-program vanity behaves as an ordinary countertop room.
  const scope = {
    pricingBasis: "direct_retail",
    rooms: [{ id: "van", roomType: "Vanity", name: "Vanity", pieces: [{ id: "vp1", pieceType: "counter", lengthIn: 61, depthIn: 22.5, quantity: 1 }] }],
    customLines: []
  };
  const configuration = {
    rooms: {
      van: {
        materialGroup: "Group Promo",
        vanityProgram: { useStandardPricing: true },
        backsplash: { selected: true },
        sideSplashes: { vp1: "both" },
        sinks: [
          { id: "s1", sinkKind: "vanity", quantity: 1, productId: "kansas:1512UM18" },
          { id: "s2", sinkKind: "vanity", quantity: 1 }
        ],
        edgeProfile: "edge_small_ogee",
        vanityProgram_additionalTrips: undefined
      }
    }
  };
  configuration.rooms.van.vanityProgram.additionalTrips = 1;
  scope.rooms[0].edgeFinishedLf = 8;
  const result = await calculateElite100Estimate({ scope, configuration });
  const room = result.rooms[0];
  assert.equal(room.vanityProgram.qualifies, false);
  assert.equal(room.bundled, false);
  const topSqft = round2((61 * 22.5) / 144); // 9.53 measured
  assert.equal(room.measuredCountertopSf, topSqft);
  assert.equal(room.billedCountertopSf, Math.ceil(topSqft));
  assert.equal(room.countertopMaterialSubtotal, round2(Math.ceil(topSqft) * 70), "ordinary countertop material pricing applies");
  // Backsplash defaults to the vanity piece's own width (61in) when no explicit run length is given.
  assert.equal(room.backsplash.measuredSf, round2((61 * 4) / 144));
  // Two selected bathroom sinks => two cutouts + two sink product lines (one priced, one customer-supplied).
  assert.equal(room.cutouts.vanitySinkQty, 2);
  assert.equal(room.cutouts.vanitySinkCharge, 200);
  assert.equal(room.sinkProductsTotal, 90);
  // Upgraded edge still applies (not bundled).
  assert.equal(room.edge.amount, 8 * 15);
  // Additional trip charge applies outside the program.
  assert.equal(room.nonProgramTripAmount, ELITE100_ADDITIONAL_VANITY_TRIP);
  console.log("ok: non-program vanity prices as an ordinary countertop room — top+backsplash+side splash material, per-sink cutouts, upgraded edge, additional trip");
}

{
  // Single vs double non-program vanity sink/cutout counts, and 0/1/2 side splashes.
  for (const [sinkCount, expectedQty, expectedCharge] of [[1, 1, 100], [2, 2, 200]]) {
    const sinks = Array.from({ length: sinkCount }, (_, i) => ({ id: `s${i}`, sinkKind: "vanity", quantity: 1 }));
    const scope = {
      pricingBasis: "wholesale",
      rooms: [{ id: "van", roomType: "Vanity", name: "Vanity", pieces: [{ id: "vp1", pieceType: "counter", lengthIn: 30, depthIn: 22.5 }] }],
      customLines: []
    };
    const configuration = { rooms: { van: { materialGroup: "Group A", vanityProgram: { useStandardPricing: true }, sinks } } };
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.rooms[0].cutouts.vanitySinkQty, expectedQty);
    assert.equal(result.rooms[0].cutouts.vanitySinkCharge, expectedCharge);
  }
  for (const [sel, sides] of [["none", 0], ["left", 1], ["both", 2]]) {
    const scope = {
      pricingBasis: "wholesale",
      rooms: [{ id: "van", roomType: "Vanity", name: "Vanity", pieces: [{ id: "vp1", pieceType: "counter", lengthIn: 30, depthIn: 22.5 }] }],
      customLines: []
    };
    const configuration = {
      rooms: { van: { materialGroup: "Group A", vanityProgram: { useStandardPricing: true }, sideSplashes: { vp1: sel } } }
    };
    const result = await calculateElite100Estimate({ scope, configuration });
    const expectedSf = round2((22.5 * 4 * sides) / 144);
    assert.equal(result.rooms[0].sideSplash.measuredSf, expectedSf, `${sel} side splash`);
  }
  console.log("ok: single non-program vanity = 1 cutout+1 sink; double = 2 cutouts+2 sinks; zero/one/two side splashes price correctly");
}

{
  // No obsolete Soci references anywhere in the new calculator or its adapter.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const calcSrc = readFileSync(path.join(here, "elite100RoomPricingCalculator.mjs"), "utf8");
  const adapterSrc = readFileSync(path.join(here, "elite100RoomPricingStudioAdapter.mjs"), "utf8");
  assert.ok(!/soci/i.test(calcSrc), "calculator source must not reference obsolete Soci model names");
  assert.ok(!/soci/i.test(adapterSrc), "adapter source must not reference obsolete Soci model names");
  console.log("ok: no obsolete Soci references in the new calculator or adapter source");
}

// =========================================================================
// CUSTOM LINES
// =========================================================================
{
  // Visible charge appears separately.
  {
    const { scope, configuration } = oneRoomInput({
      customLines: [{ id: "c1", description: "Extra Polish", roomId: "r1", quantity: 1, unitPrice: 100, kind: "charge", customerFacing: true }]
    });
    const result = await calculateElite100Estimate({ scope, configuration });
    const room = result.rooms[0];
    assert.equal(room.customerFacingLinesTotal, 100);
    assert.ok(room.customerFacingLines.some((l) => l.description === "Extra Polish" && l.amount === 100));
    const safe = toCustomerSafeElite100RoomResult(room);
    assert.ok(safe.lineItems.some((l) => l.label === "Extra Polish" && l.amount === 100));
  }
  // Hidden customer charge increases total, folds into Countertop Material, and is NOT taxed as stone.
  {
    const withoutHidden = oneRoomInput({});
    const withHidden = oneRoomInput({
      customLines: [{ id: "c2", description: "Job adjustment", roomId: "r1", fixedAmount: 400, kind: "charge", customerFacing: false }]
    });
    const r0 = await calculateElite100Estimate(withoutHidden);
    const r1 = await calculateElite100Estimate(withHidden);
    const room0 = r0.rooms[0];
    const room1 = r1.rooms[0];
    assert.equal(room1.hiddenCustomerChargeTotal, 400);
    assert.equal(room1.countertopMaterialDisplayAmount, round2(room0.countertopMaterialDisplayAmount + 400));
    assert.equal(room1.exactTotal, round2(room0.exactTotal + 400));
    // Not taxed as stone: material use tax is identical with or without the hidden charge.
    assert.equal(room1.materialUseTaxAmount, room0.materialUseTaxAmount);
    const safe = toCustomerSafeElite100RoomResult(room1);
    assert.ok(safe.lineItems.some((l) => l.label === "Countertop Material" && l.amount === room1.countertopMaterialDisplayAmount));
    assert.ok(!safe.lineItems.some((l) => l.label === "Job adjustment"), "hidden line must not appear under its own name");
  }
  // Hidden room line allocates to the correct room (multi-room).
  {
    const scope = {
      pricingBasis: "direct_retail",
      rooms: [
        { id: "r1", name: "Kitchen", roomType: "Kitchen", pieces: [{ id: "p1", pieceType: "counter", lengthIn: 120, depthIn: 25, quantity: 1 }] },
        { id: "r2", name: "Bar", roomType: "Kitchen", pieces: [{ id: "p2", pieceType: "counter", lengthIn: 60, depthIn: 25, quantity: 1 }] }
      ],
      customLines: [{ id: "c3", description: "Hidden r2 only", roomId: "r2", fixedAmount: 250, kind: "charge", customerFacing: false }]
    };
    const configuration = { rooms: { r1: { materialGroup: "Group Promo" }, r2: { materialGroup: "Group Promo" } } };
    const result = await calculateElite100Estimate({ scope, configuration });
    const r1 = result.rooms.find((r) => r.roomId === "r1");
    const r2 = result.rooms.find((r) => r.roomId === "r2");
    assert.equal(r1.hiddenCustomerChargeTotal, 0);
    assert.equal(r2.hiddenCustomerChargeTotal, 250);
  }
  // Hidden estimate-level line allocates to an estimate-level Countertop Material line.
  {
    const { scope, configuration } = oneRoomInput({
      customLines: [{ id: "c4", description: "Estimate-level hidden", roomId: null, fixedAmount: 300, kind: "charge", customerFacing: false }]
    });
    const withoutIt = await calculateElite100Estimate(oneRoomInput({}));
    const result = await calculateElite100Estimate({ scope, configuration });
    assert.equal(result.estimateLevelCountertopMaterialAllocation, 300);
    assert.equal(result.totals.exactTotal, round2(withoutIt.totals.exactTotal + 300));
    const safe = toCustomerSafeElite100EstimateResult(result);
    assert.ok(safe.estimateLineItems.some((l) => l.label === "Countertop Material" && l.amount === 300));
  }
  // Discount and credit.
  {
    const { scope, configuration } = oneRoomInput({
      customLines: [
        { id: "d1", description: "Loyalty discount", roomId: "r1", fixedAmount: 50, kind: "discount" },
        { id: "cr1", description: "Goodwill credit", roomId: "r1", fixedAmount: 25, kind: "credit" }
      ]
    });
    const withoutThem = await calculateElite100Estimate(oneRoomInput({}));
    const result = await calculateElite100Estimate({ scope, configuration });
    const room = result.rooms[0];
    assert.ok(room.customerFacingLines.some((l) => l.description === "Loyalty discount" && l.amount === -50));
    assert.ok(room.customerFacingLines.some((l) => l.description === "Goodwill credit" && l.amount === -25));
    assert.equal(room.exactTotal, round2(withoutThem.rooms[0].exactTotal - 75));
  }
  // Internal-only and absorbed lines never affect the customer total.
  {
    const withoutThem = await calculateElite100Estimate(oneRoomInput({}));
    const { scope, configuration } = oneRoomInput({
      customLines: [
        { id: "i1", description: "Internal cost note", roomId: "r1", fixedAmount: 999, kind: "charge", commercialRole: "internal_only" },
        { id: "a1", description: "Absorbed cost", roomId: "r1", fixedAmount: 500, kind: "charge", commercialRole: "absorbed" }
      ]
    });
    const result = await calculateElite100Estimate({ scope, configuration });
    const room = result.rooms[0];
    assert.equal(room.internalOnlyTotal, 999);
    assert.equal(room.absorbedTotal, 500);
    assert.equal(room.exactTotal, withoutThem.rooms[0].exactTotal, "internal_only/absorbed must not change the customer total");
    assert.equal(result.totals.exactTotal, withoutThem.totals.exactTotal);
  }
  console.log("ok: customer-facing charge/discount/credit, hidden customer charge (folded into Countertop Material, untaxed, room- and estimate-level allocation), and internal-only/absorbed lines all behave exactly per spec");
}

// =========================================================================
// ACCOUNT RULES
// =========================================================================
{
  // Watt's Promo = $40/SF; other groups normal.
  {
    const { scope, configuration } = oneRoomInput({ materialGroup: "Group Promo", pricingBasis: "direct_retail", partnerAccountId: WATTS_ID });
    const result = await calculateElite100Estimate({ scope, configuration, pricingContext: { env: TRUSTED_ENV } });
    assert.equal(result.rooms[0].materialRatePerSf, 40);
    assert.equal(result.rooms[0].wattsOverrideApplied, true);
  }
  {
    const { scope, configuration } = oneRoomInput({ materialGroup: "Group A", pricingBasis: "direct_retail", partnerAccountId: WATTS_ID });
    const result = await calculateElite100Estimate({ scope, configuration, pricingContext: { env: TRUSTED_ENV } });
    assert.equal(result.rooms[0].materialRatePerSf, 77, "Watts override only applies to Group Promo");
    assert.equal(result.rooms[0].wattsOverrideApplied, false);
  }
  // Spahn & Rose: +3% on the complete estimate, as a separate internal line.
  {
    const { scope, configuration } = oneRoomInput({ materialGroup: "Group Promo", pricingBasis: "direct_retail", partnerAccountId: SPAHN_ID });
    const withoutSpahn = await calculateElite100Estimate(oneRoomInput({ materialGroup: "Group Promo", pricingBasis: "direct_retail" }));
    const result = await calculateElite100Estimate({ scope, configuration, pricingContext: { env: TRUSTED_ENV } });
    assert.equal(result.account.spahnTrusted, true);
    assert.equal(result.account.accountAdjustment, round2(withoutSpahn.totals.exactTotal * 0.03));
    assert.equal(result.totals.exactTotal, round2(withoutSpahn.totals.exactTotal * 1.03));
    // Internal-only mechanics never exposed to the customer-facing projection.
    const safeStr = JSON.stringify(result.customerFacing);
    assert.ok(!safeStr.includes(SPAHN_ID));
    assert.ok(!/spahn/i.test(safeStr));
  }
  // No customer-name inference — an untrusted partnerAccountId never gets the override, regardless of org/account naming.
  {
    const scope = {
      organizationId: "Watts Plumbing Supply Co",
      accountId: "Contains Watts In The Name",
      pricingBasis: "direct_retail",
      partnerAccountId: "not-a-trusted-id",
      rooms: [{ id: "r1", name: "Kitchen", roomType: "Kitchen", pieces: [{ id: "p1", pieceType: "counter", lengthIn: 120, depthIn: 24, quantity: 1 }] }],
      customLines: []
    };
    const configuration = { rooms: { r1: { materialGroup: "Group Promo" } } };
    const result = await calculateElite100Estimate({ scope, configuration, pricingContext: { env: TRUSTED_ENV } });
    assert.equal(result.rooms[0].materialRatePerSf, 70, "must use the normal Promo rate — no inference from org/account name");
    assert.equal(result.rooms[0].wattsOverrideApplied, false);
  }
  console.log("ok: Watt's Promo override, Spahn & Rose 3% adjustment (internal-only, never customer-exposed), and no name-based inference");
}

// =========================================================================
// ROUNDING
// =========================================================================
{
  // A deliberately non-multiple-of-10 total.
  const { scope, configuration } = oneRoomInput({
    pieces: [{ id: "p1", pieceType: "counter", lengthIn: 101, depthIn: 25, quantity: 1 }],
    materialGroup: "Group A",
    pricingBasis: "direct_retail"
  });
  const result = await calculateElite100Estimate({ scope, configuration });
  const exact = result.totals.exactTotal;
  assert.notEqual(exact % 10, 0, "test fixture must produce a non-multiple-of-10 exact total");
  assert.equal(result.totals.displayTotal, Math.ceil(exact / 10) * 10);
  assert.ok(result.totals.displayTotal >= exact);
  assert.ok(result.totals.displayTotal - exact < 10);
  // Room lines are never independently rounded to the nearest 10.
  assert.equal(result.rooms[0].exactTotal, exact, "single-room estimate: room exact total must equal the unrounded estimate exact total");
  assert.notEqual(result.rooms[0].exactTotal % 10 === 0 ? "rounded" : "exact", "rounded");
  console.log(`ok: exact total (${exact}) preserved internally; display total (${result.totals.displayTotal}) rounds up once to the nearest $10; room totals are not independently rounded`);
}

// =========================================================================
// STUDIO ADAPTER (additive — does not touch calculateStudioEstimate v3)
// =========================================================================
{
  const studioScope = {
    materialGroup: "Group Promo",
    pricingBasis: "wholesale",
    partnerAccountId: null,
    edgeProfileToken: "edge_small_ogee",
    edgeLinearFeet: 10,
    edgeMode: "included",
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        roomType: "Kitchen",
        includeBacksplash: true,
        backsplashSqft: 4,
        backsplashHeightIn: 4,
        pieces: [{ id: "piece-1", name: "Main run", pieceType: "counter", lengthIn: 120, depthIn: 25.2, sqft: 21, included: true }]
      }
    ],
    addOns: { "qty-sink": 1, "qty-cook": 1 },
    customLineItems: [
      { id: "cli-1", name: "Extra Trip", category: "Other", quantity: 1, unitPrice: 75, customerFacing: true }
    ]
  };

  const mapped = mapStudioEstimateToElite100Input(studioScope);
  assert.equal(mapped.scope.rooms[0].pieces[0].directArea, 21, "adapter preserves Studio's stored piece.sqft as directArea");
  assert.equal(mapped.configuration.rooms["room-1"].materialGroup, "Group Promo");
  assert.equal(mapped.configuration.rooms["room-1"].edgeProfile, "edge_small_ogee");

  const result = await calculateElite100StudioEstimate({ scope: studioScope, env: {} });
  assert.equal(result.pricingVersion, 4);
  const room = result.rooms[0];
  assert.equal(room.billedCountertopSf, 21);
  assert.equal(room.materialRatePerSf, 45);
  assert.equal(room.cutouts.kitchenSinkCharge, 200, "qty-sink addOn assigned to the single kitchen room");
  assert.equal(room.cutouts.cooktopCharge, 150, "qty-cook addOn assigned to the single kitchen room");
  assert.equal(room.edge.amount, 10 * 15, "estimate-wide edge LF assigned to the single room");
  // customLineItems entry has no roomId, so normalizeStudioCommercialLines
  // (and thus the calculator) correctly treats it as estimate-level, not
  // room-level — it surfaces under result.estimateCustomLines, not room.customerFacingLines.
  assert.ok(
    result.estimateCustomLines.customerFacing.some((l) => l.description === "Extra Trip" && l.amount === 75)
  );

  console.log("ok: Studio adapter translates a real Studio scope into the canonical contract and prices it under pricingVersion 4 without touching calculateStudioEstimate (v3)");
}

{
  // Multi-room Studio scope: ambiguous add-on/edge attribution is flagged, not silently guessed.
  const studioScope = {
    materialGroup: "Group Promo",
    pricingBasis: "direct",
    edgeLinearFeet: 6,
    rooms: [
      { id: "k1", name: "Kitchen 1", roomType: "Kitchen", pieces: [{ id: "p1", lengthIn: 100, depthIn: 25, sqft: 17.36, pieceType: "counter" }] },
      { id: "k2", name: "Kitchen 2", roomType: "Kitchen", pieces: [{ id: "p2", lengthIn: 80, depthIn: 25, sqft: 13.89, pieceType: "counter" }] }
    ],
    addOns: { "qty-sink": 1 },
    customLineItems: []
  };
  const mapped = mapStudioEstimateToElite100Input(studioScope);
  assert.ok(mapped.warnings.some((w) => w.code === "adapter_addon_room_assignment_ambiguous"));
  assert.ok(mapped.warnings.some((w) => w.code === "adapter_edge_lf_single_room_assignment"));
  const explicit = mapStudioScopeToElite100Configuration(studioScope, { roomAssignments: { "qty-sink": "k2" } });
  assert.equal(explicit.configuration.rooms.k2.sinks[0].quantity, 1);
  assert.ok(!explicit.configuration.rooms.k1?.sinks?.length);
  console.log("ok: multi-room Studio scopes flag ambiguous legacy estimate-wide add-on/edge attribution and honor an explicit room assignment override");
}

{
  // Vanity rooms never silently auto-enroll in the fixed bundle.
  const studioScope = {
    materialGroup: "Group Promo",
    pricingBasis: "wholesale",
    rooms: [{ id: "v1", name: "Vanity", roomType: "Vanity", pieces: [{ id: "vp1", lengthIn: 61, depthIn: 22.5, sqft: 9.53, pieceType: "counter" }] }],
    addOns: {},
    customLineItems: []
  };
  const mapped = mapStudioScopeToElite100Scope(studioScope);
  const config = mapStudioScopeToElite100Configuration(studioScope);
  assert.equal(config.configuration.rooms.v1.vanityProgram.useStandardPricing, true);
  const result = await calculateElite100Estimate({ scope: mapped.scope, configuration: config.configuration });
  assert.equal(result.rooms[0].bundled, false, "adapter must not silently enroll a plain Studio vanity into the fixed-price program");
  console.log("ok: Studio vanities translate with useStandardPricing by default — never silently auto-enrolled in the Vanity Program bundle");
}

// =========================================================================
// MISC HELPERS
// =========================================================================
{
  assert.equal(normalizeElite100PricingBasis("direct"), "direct_retail");
  assert.equal(normalizeElite100PricingBasis("retail"), "direct_retail");
  assert.equal(normalizeElite100PricingBasis("direct_retail"), "direct_retail");
  assert.equal(normalizeElite100PricingBasis("wholesale"), "wholesale");
  assert.equal(normalizeElite100PricingBasis("WHOLESALE"), "wholesale");
  assert.equal(normalizeElite100PricingBasis(undefined), "direct_retail");
  console.log("ok: legacy 'direct' pricing basis normalizes to the same Direct/Retail book without breaking API compatibility");
}

{
  assert.equal(computeElite100QualifyingKitchenCounterSf([{ id: "k1", roomType: "Kitchen", pieces: [{ lengthIn: 144, depthIn: 25, quantity: 1 }] }]), 25);
  assert.equal(
    computeElite100QualifyingKitchenCounterSf([{ id: "v1", roomType: "Vanity", pieces: [{ lengthIn: 144, depthIn: 25, quantity: 1 }] }]),
    0,
    "vanity rooms are excluded from qualifying kitchen counter SF"
  );
  const vp = evaluateElite100VanityProgram({
    piece: { lengthIn: 25, depthIn: 22.5 },
    sinkCount: 0,
    materialGroup: "Group Promo",
    vanityConfig: {},
    qualifyingKitchenCounterSf: 40
  });
  assert.equal(vp.qualifies, false);
  assert.ok(vp.disqualifyReasons.includes("sink_count_not_1_or_2"));
  console.log("ok: qualifying-kitchen-counter-SF excludes vanity rooms; vanity program requires a resolvable 1- or 2-sink bowl configuration");
}

console.log("\nAll elite100RoomPricingCalculator tests passed.\n");
