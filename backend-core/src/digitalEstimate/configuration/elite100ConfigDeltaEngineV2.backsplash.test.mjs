/**
 * DE.Polish-3 — governed backsplash pricing inside elite100-config-delta-v2.
 * Engine-level goldens: chargeableBacksplashSf used to be silently dropped by
 * this engine (see FEATURE_DECISIONS.md §137) — these prove it is now
 * consumed, priced at the room's own material $/SF rate, independently
 * rounded, and reconciles exactly against the configured total.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT } from "./approvedPricingFixtures.mjs";
import { calculateElite100ConfigDeltaV2, ELITE100_CONFIG_DELTA_ENGINE_ID_V2 } from "./elite100ConfigDeltaEngineV2.mjs";
import { buildBacksplashPricingInput } from "./backsplashPricingAuthority.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const PUB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SNAP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ENV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const GROUP_B_RATE_CENTS = Math.round(FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT.group_b * 100);
const GROUP_C_RATE_CENTS = Math.round(FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT.group_c * 100);
const TAX_BPS = 200;

function bsAmountCents(rateCents, sf) {
  const sell = Math.round((rateCents * sf * 1000) / 1000);
  const tax = Math.round((sell * TAX_BPS) / 10000);
  return sell + tax;
}

/** Build a room + geometry input for the engine using the real geometry resolver. */
function roomWithBacksplash({
  roomKey = "kitchen",
  chargeableCounterSf = 40,
  selectedMaterialGroup = "group_b",
  baselineMaterialGroup = "group_b",
  room, // frozen geometry row for backsplashPricingAuthority
  selectedMode,
  customerInput = {}
}) {
  const resolved = buildBacksplashPricingInput(room, selectedMode, customerInput);
  return {
    roomKey,
    displayName: "Kitchen",
    chargeableCounterSf,
    selectedMaterialGroup,
    baselineMaterialGroup,
    backsplashMode: resolved.mode,
    baselineBacksplashMode: resolved.originalMode,
    backsplashReviewCodes: resolved.reviewCodes,
    backsplashOriginalBilledSf: resolved.originalBilledSf,
    backsplashConfiguredBilledSf: resolved.billedSf
  };
}

function baseInputV2(overrides = {}) {
  return {
    organizationId: ORG,
    publication: { id: PUB, snapshotId: SNAP, status: "active" },
    envelope: { id: ENV, version: 1, status: "active", publicationId: PUB },
    pricingPolicyFingerprint: "policy-fp-v2",
    catalogFingerprint: "catalog-fp-v2",
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID_V2,
    pricingBasis: "direct",
    materialProgram: "elite_100",
    frozenBaseRates: {
      direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
      wholesale: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT }
    },
    materialTaxPolicy: { bps: TAX_BPS },
    authorizedMaterialMarkup: { bps: 0 },
    options: [],
    customLines: [],
    credits: [],
    accountMemberships: [],
    materialRateOverrides: [],
    estimateAdjustments: [],
    partnerAccountId: null,
    asOf: "2026-07-20T12:00:00.000Z",
    ...overrides
  };
}

function anchoredInput(room, opts = {}) {
  return baseInputV2({
    rooms: [room],
    baseline: {
      exactTotal: opts.baselineExactTotal ?? 2040,
      displayTotal: opts.baselineExactTotal ?? 2040,
      rooms: [{ roomKey: room.roomKey, materialGroup: room.baselineMaterialGroup }]
    }
  });
}

// Case A — existing 4-inch backsplash unchanged: no mode delta.
test("golden A: unchanged original 4-inch backsplash, same material => zero backsplash delta", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 7, backsplashMeasuredLengthIn: 252 };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "standard_4in" });
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  assert.equal(r.internal.backsplashDeltaCents, 0);
  const rr = r.internal.rooms[0];
  assert.equal(rr.backsplashConfiguredAmountCents, bsAmountCents(GROUP_B_RATE_CENTS, 7));
  assert.equal(rr.backsplashBaselineAmountCents, bsAmountCents(GROUP_B_RATE_CENTS, 7));
});

// Case B — material upgrade with 4-inch backsplash: backsplash reprices at new rate too.
test("golden B: material group upgrade also reprices unchanged 4-inch backsplash at the new rate", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 7, backsplashMeasuredLengthIn: 252 };
  const room = roomWithBacksplash({
    room: geomRoom,
    selectedMode: "standard_4in",
    selectedMaterialGroup: "group_c",
    baselineMaterialGroup: "group_b"
  });
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  const expectedDelta = bsAmountCents(GROUP_C_RATE_CENTS, 7) - bsAmountCents(GROUP_B_RATE_CENTS, 7);
  assert.equal(r.internal.backsplashDeltaCents, expectedDelta);
  assert.notEqual(expectedDelta, 0);
});

// Case C — remove original 4-inch backsplash: exact governed credit, never exceeding original.
test("golden C: switching to No backsplash credits exactly the governed original amount", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 7, backsplashMeasuredLengthIn: 252 };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "none" });
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  const originalAmount = bsAmountCents(GROUP_B_RATE_CENTS, 7);
  assert.equal(r.internal.backsplashDeltaCents, -originalAmount);
  assert.equal(r.internal.rooms[0].backsplashConfiguredAmountCents, 0);
  // Credit never exceeds the original amount (it IS the original amount, by construction).
  assert.ok(Math.abs(r.internal.backsplashDeltaCents) <= originalAmount);
});

// Case D — add 4-inch backsplash where none existed (island excluded implicitly — no length captured for it).
test("golden D: adding 4-inch backsplash where none existed prices from measured wall-backed length only", () => {
  const geomRoom = { backsplashHeightMode: "none", backsplashSf: 0, backsplashMeasuredLengthIn: 216 };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "standard_4in" });
  // 216in * 4in / 144 = 6 sf exactly, no ceiling needed.
  const expected = bsAmountCents(GROUP_B_RATE_CENTS, 6);
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  assert.equal(r.internal.backsplashDeltaCents, expected);
  assert.equal(r.internal.rooms[0].backsplashConfiguredBilledSf, 6);
});

// Case E — island-only room: no eligible segments, nothing priced, no review-blocking.
test("golden E: island-only room (no measured length, no billed sf) prices $0 with no delta", () => {
  const geomRoom = { backsplashHeightMode: "none", backsplashSf: 0, backsplashMeasuredLengthIn: null };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "none" });
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  assert.equal(r.internal.backsplashDeltaCents, 0);
  assert.equal(r.internal.rooms[0].backsplashReviewCodes.length, 0);
});

// Case F — full height without vertical authority: review required, no invented amount.
test("golden F: full height without authoritative wall-height measurement stays $0 delta + review flag", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 7, backsplashMeasuredLengthIn: 252 };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "full_height" });
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  assert.equal(r.internal.backsplashDeltaCents, 0);
  assert.deepEqual(r.internal.rooms[0].backsplashReviewCodes, ["full_height_measurement_required"]);
  assert.equal(r.internal.rooms[0].backsplashConfiguredAmountCents, null);
});

// Case G — full height with authoritative height: governed price, reconciles.
test("golden G: full height with an authoritative original wall-height measurement prices automatically", () => {
  const geomRoom = {
    backsplashHeightMode: "full_height",
    backsplashSf: 22,
    backsplashHeightIn: 18,
    backsplashMeasuredLengthIn: 176
  };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "full_height" });
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  assert.equal(r.internal.backsplashDeltaCents, 0); // unchanged from original — no mode delta
  assert.equal(r.internal.rooms[0].backsplashConfiguredAmountCents, bsAmountCents(GROUP_B_RATE_CENTS, 22));
});

// Case H — custom height within governed range: governed price from approved run + selected height only.
test("golden H: custom height within governed range prices from approved run length + selected height", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 6, backsplashMeasuredLengthIn: 216 };
  const room = roomWithBacksplash({
    room: geomRoom,
    selectedMode: "custom_height",
    customerInput: { requestedHeightInches: 10 }
  });
  // 216in * 10in / 144 = 15 sf exactly
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  assert.equal(r.internal.rooms[0].backsplashConfiguredBilledSf, 15);
  const expectedDelta = bsAmountCents(GROUP_B_RATE_CENTS, 15) - bsAmountCents(GROUP_B_RATE_CENTS, 6);
  assert.equal(r.internal.backsplashDeltaCents, expectedDelta);
});

// Case I — custom height without governed policy (no requested height): review required, no invented total.
test("golden I: custom height without a requested height stays review-required, zero delta", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 6, backsplashMeasuredLengthIn: 216 };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "custom_height", customerInput: {} });
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room));
  assert.equal(r.internal.backsplashDeltaCents, 0);
  assert.deepEqual(r.internal.rooms[0].backsplashReviewCodes, ["custom_backsplash_height_review"]);
});

// Case K — multiple eligible rooms round independently.
test("golden K: two rooms with fractional SF each ceil independently, never combined before ceiling", () => {
  const kitchenGeom = { backsplashHeightMode: "none", backsplashSf: 0, backsplashMeasuredLengthIn: 363.6 }; // 10.1 sf -> 11
  const bathGeom = { backsplashHeightMode: "none", backsplashSf: 0, backsplashMeasuredLengthIn: 835.2 }; // 23.2 sf -> 24
  const kitchen = roomWithBacksplash({ roomKey: "kitchen", room: kitchenGeom, selectedMode: "standard_4in" });
  const bath = roomWithBacksplash({
    roomKey: "powder_bath",
    room: bathGeom,
    selectedMode: "standard_4in",
    chargeableCounterSf: 5
  });
  const input = baseInputV2({
    rooms: [kitchen, bath],
    baseline: {
      exactTotal: 3000,
      displayTotal: 3000,
      rooms: [
        { roomKey: "kitchen", materialGroup: "group_b" },
        { roomKey: "powder_bath", materialGroup: "group_b" }
      ]
    }
  });
  const r = calculateElite100ConfigDeltaV2(input);
  assert.equal(r.internal.rooms[0].backsplashConfiguredBilledSf, 11);
  assert.equal(r.internal.rooms[1].backsplashConfiguredBilledSf, 24);
});

// Case J — side splash stays independent of the primary backsplash: it is priced once as
// its own option line (Add-ons ownership, see FEATURE_DECISIONS.md §137), never folded into
// or duplicated against the room's governed backsplash amount.
test("golden J: side splash prices independently of primary backsplash, no duplicate charge", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 7, backsplashMeasuredLengthIn: 252 };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "standard_4in" });
  const sideSplashCents = 4500;
  const input = anchoredInput(room, { baselineExactTotal: 3000 });
  input.options = [
    {
      optionKey: "sidesplash:kitchen:piece-1:left",
      displayLabel: "Side splash",
      quantity: 1,
      sellPrice: sideSplashCents / 100,
      pricingMode: "fixed",
      customerPriceTreatment: "absolute",
      availabilityState: "active",
      includedInBaseline: false
    }
  ];
  const r = calculateElite100ConfigDeltaV2(input);
  const backsplashAmount = r.internal.rooms[0].backsplashConfiguredAmountCents;
  assert.ok(backsplashAmount > 0, "primary backsplash still prices normally");
  // Side splash appears exactly once, as its own option line, additive to (never inside) the
  // governed backsplash amount.
  assert.equal(r.internal.options.length, 1);
  assert.equal(r.internal.options[0].amountCents, sideSplashCents);
  assert.equal(
    r.internal.configuredExactTotalCents,
    300000 + r.internal.backsplashDeltaCents + sideSplashCents
  );
});

// Standalone (non-anchor) mode — backsplash absolute is included directly in the total.
test("standalone mode: configured backsplash amount is included directly in the absolute reprice total", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 7, backsplashMeasuredLengthIn: 252 };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "standard_4in" });
  const r = calculateElite100ConfigDeltaV2(baseInputV2({ rooms: [room] })); // no baseline => standalone
  assert.equal(r.internal.frozenBaselineAnchor, false);
  const expectedBacksplash = bsAmountCents(GROUP_B_RATE_CENTS, 7);
  const expectedCountertop = Math.round((GROUP_B_RATE_CENTS * 40 * 1000) / 1000);
  const expectedCountertopTax = Math.round((expectedCountertop * TAX_BPS) / 10000);
  assert.equal(
    r.internal.configuredExactTotalCents,
    expectedCountertop + expectedCountertopTax + expectedBacksplash
  );
});

// Reconciliation: room-level backsplash + countertop + everything else always sums to configured total.
test("reconciliation: backsplash delta is fully captured inside configuredExactTotalCents", () => {
  const geomRoom = { backsplashHeightMode: "standard", backsplashSf: 7, backsplashMeasuredLengthIn: 252 };
  const room = roomWithBacksplash({ room: geomRoom, selectedMode: "none" });
  // anchoredInput's `exactTotal` is in DOLLARS (dollarsToCents conversion inside the engine).
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room, { baselineExactTotal: 5000 }));
  const originalAmount = bsAmountCents(GROUP_B_RATE_CENTS, 7);
  assert.equal(r.internal.configuredExactTotalCents, 500000 - originalAmount);
  assert.equal(r.internal.selectionDeltaSubtotalCents, -originalAmount);
});

// Hosted regression — an unresolved removal on a frozen $3,208 publication
// previously re-ceiled the unchanged exact total to $3,210, producing a fake
// +$2 customer delta.
test("hosted regression: unresolved 4-inch removal never turns $3,208 into $3,210", () => {
  const room = {
    roomKey: "kitchen",
    displayName: "Kitchen",
    chargeableCounterSf: 40,
    selectedMaterialGroup: "group_b",
    baselineMaterialGroup: "group_b",
    backsplashMode: "none",
    baselineBacksplashMode: "standard_4in",
    backsplashReviewCodes: ["backsplash_removal_credit_unresolved"],
    backsplashOriginalBilledSf: null,
    backsplashConfiguredBilledSf: 0
  };
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room, { baselineExactTotal: 3208 }));
  assert.equal(r.internal.backsplashDeltaCents, 0);
  assert.equal(r.internal.configuredExactTotalCents, 320800);
  assert.equal(r.internal.configuredDisplayTotalCents, 320800);
  assert.equal(r.internal.customerDisplayTotalDeltaCents, 0);
  assert.ok(r.internal.customerDisplayTotalDeltaCents <= 0);
});

test("frozen published backsplash carve-out is credited exactly and preserves removal sign", () => {
  const frozenBacksplashCents = 47_890;
  const room = {
    ...roomWithBacksplash({
      room: {
        backsplashHeightMode: "standard",
        backsplashSf: 7,
        backsplashMeasuredLengthIn: 252
      },
      selectedMode: "none"
    }),
    backsplashBaselineAmountCents: frozenBacksplashCents
  };
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room, { baselineExactTotal: 3208 }));
  assert.equal(r.internal.backsplashDeltaCents, -frozenBacksplashCents);
  assert.equal(r.internal.rooms[0].backsplashConfiguredAmountCents, 0);
  assert.equal(r.internal.configuredExactTotalCents, 320800 - frozenBacksplashCents);
  assert.equal(r.internal.configuredDisplayTotalCents, 320800 - frozenBacksplashCents);
  assert.ok(r.internal.customerDisplayTotalDeltaCents < 0);
});

test("unchanged 4-inch mode preserves frozen carve-out byte-for-byte", () => {
  const frozenBacksplashCents = 47_890;
  const room = {
    ...roomWithBacksplash({
      room: {
        backsplashHeightMode: "standard",
        backsplashSf: 7,
        backsplashMeasuredLengthIn: 252
      },
      selectedMode: "standard_4in"
    }),
    backsplashBaselineAmountCents: frozenBacksplashCents
  };
  const r = calculateElite100ConfigDeltaV2(anchoredInput(room, { baselineExactTotal: 3208 }));
  assert.equal(r.internal.backsplashDeltaCents, 0);
  assert.equal(r.internal.rooms[0].backsplashConfiguredAmountCents, frozenBacksplashCents);
  assert.equal(r.internal.configuredDisplayTotalCents, 320800);
});
