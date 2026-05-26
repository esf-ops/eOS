/**
 * Backend parity: guided shape groups, overlap modes, chargeable counter ceil (internal_quote only).
 * Run: node backend-core/src/scripts/verifyInternalEstimateGuidedMeasurement.mjs
 */
import { calculateQuote, PROTOTYPE_TIER_PRICE_PER_SQFT } from "../quotes/quoteCalculator.js";
import {
  chargeableCounterSqftFromExact,
  guidedCornerOverlapDeductionSfForPieces,
  guidedCornerOverlapSqft,
  round2
} from "../quotes/roomGuidedMeasurement.js";

function assertNear(label, actual, expected, eps = 0.05) {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e) || Math.abs(a - e) > eps) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

const wRate = PROTOTYPE_TIER_PRICE_PER_SQFT["Group Promo"];

// 36.3 exact → 37 chargeable (not piece-level 38)
{
  const len = (sf) => Math.round(((sf * 144) / 25.5) * 100) / 100;
  const pieces = [
    { type: "counter", name: "A", lengthIn: len(15.4), depthIn: 25.5, shape: "rect" },
    { type: "counter", name: "B", lengthIn: len(10.3), depthIn: 25.5, shape: "rect" },
    { type: "counter", name: "C", lengthIn: len(10.6), depthIn: 25.5, shape: "rect" }
  ];
  const room = {
    name: "Kitchen",
    materialGroup: "Group Promo",
    calcMode: "Guided Shape",
    guidedShapeGroups: [{ id: "g1", name: "Runs", shapeType: "manual", overlapMode: "none", pieces }],
    pieces
  };
  const exact = 36.3;
  if (chargeableCounterSqftFromExact(exact) !== 37) {
    throw new Error(`chargeable ceil: expected 37, got ${chargeableCounterSqftFromExact(exact)}`);
  }
  const q = await calculateQuote(
    {
      quoteSource: "internal_quote",
      engine: "rooms",
      internalMaterialBasis: "wholesale",
      materialGroup: "Group Promo",
      rooms: [room],
      addOns: {}
    },
    {}
  );
  const summaries = q.snapshot?.room_measurement_summaries || [];
  if (summaries.length !== 1) throw new Error(`expected 1 room summary, got ${summaries.length}`);
  assertNear("exact counter", summaries[0].exactCountertopSqft, exact, 0.15);
  assertNear("chargeable counter", summaries[0].chargeableCountertopSqft, 37);
  assertNear("priced material", q.totals.retail, 37 * wRate, 1);
  const pub = await calculateQuote(
    {
      quoteSource: "public_retail",
      engine: "rooms",
      materialGroup: "Group Promo",
      rooms: [room],
      addOns: {}
    },
    {}
  );
  assertNear("public counter SF (no chargeable ceil)", pub.detail?.counter, exact, 0.2);
  const pubSummaries = pub.snapshot?.room_measurement_summaries || [];
  if (pubSummaries.length === 1 && pubSummaries[0].chargeableCounterCeilApplied) {
    throw new Error("public_retail must not apply chargeable counter ceil");
  }
}

// U auto: two corners; gross: zero
{
  const overlapOne = guidedCornerOverlapSqft(25.5, 25.5);
  const uPieces = [
    { type: "counter", name: "L", lengthIn: 90, depthIn: 25.5, shape: "rect" },
    { type: "counter", name: "B", lengthIn: 120, depthIn: 25.5, shape: "rect" },
    { type: "counter", name: "R", lengthIn: 36, depthIn: 25.5, shape: "rect" }
  ];
  const autoDed = guidedCornerOverlapDeductionSfForPieces("U-Shape", uPieces, "auto");
  assertNear("U auto overlap", autoDed, round2(overlapOne * 2), 0.02);
  const noneDed = guidedCornerOverlapDeductionSfForPieces("U-Shape", uPieces, "none");
  if (noneDed !== 0) throw new Error(`U gross overlap: expected 0, got ${noneDed}`);
}

// Backsplash excluded group
{
  const room = {
    name: "Kitchen",
    materialGroup: "Group Promo",
    calcMode: "Guided Shape",
    guidedShapeGroups: [
      {
        id: "stove",
        name: "Stove",
        shapeType: "straight",
        overlapMode: "none",
        backsplashMode: "exclude",
        pieces: [{ type: "counter", name: "Run", lengthIn: 48, depthIn: 25.5, shape: "rect" }]
      },
      {
        id: "u",
        name: "U",
        shapeType: "U-Shape",
        overlapMode: "none",
        backsplashMode: "include",
        pieces: [
          { type: "counter", name: "Back", lengthIn: 120, depthIn: 25.5, shape: "rect", addSplash: false },
          { type: "splash", name: "Splash", lengthIn: 126, depthIn: 4, shape: "rect" }
        ]
      }
    ],
    pieces: []
  };
  room.pieces = room.guidedShapeGroups.flatMap((g) => g.pieces);
  const q = await calculateQuote(
    {
      quoteSource: "internal_quote",
      engine: "rooms",
      internalMaterialBasis: "wholesale",
      materialGroup: "Group Promo",
      rooms: [room],
      addOns: {}
    },
    {}
  );
  const splashSf = (126 * 4) / 144; // 3.5 exact → 4 chargeable (ceiled)
  const chargeableSplash = Math.ceil(splashSf);
  // q.detail.splash is chargeable (ceiled) for internal_quote
  assertNear("backsplash only from U group (chargeable)", q.detail.splash, chargeableSplash, 0.05);
  // Exact splash preserved in snapshot
  const summaries = q.snapshot?.room_measurement_summaries || [];
  if (summaries.length === 1) {
    assertNear("backsplash only from U group (exact in snapshot)", summaries[0].exactBacksplashFhbSqft ?? summaries[0].backsplashSqft, splashSf, 0.05);
  }
}

// Spec 73 style: straight + U gross
{
  const straightPieces = [
    { type: "counter", name: "Left stove", lengthIn: 48, depthIn: 25.5, shape: "rect" },
    { type: "counter", name: "Right stove", lengthIn: 36, depthIn: 25.5, shape: "rect" }
  ];
  const uPieces = [
    { type: "counter", name: "Left Run", lengthIn: 90, depthIn: 25.5, shape: "rect" },
    { type: "counter", name: "Sink Run", lengthIn: 123, depthIn: 25.5, shape: "rect" },
    { type: "counter", name: "Fridge", lengthIn: 36, depthIn: 25.5, shape: "rect" }
  ];
  const straightSf = straightPieces.reduce((s, p) => s + (p.lengthIn * p.depthIn) / 144, 0);
  const uGross = uPieces.reduce((s, p) => s + (p.lengthIn * p.depthIn) / 144, 0);
  const room = {
    name: "Kitchen",
    materialGroup: "Group Promo",
    calcMode: "Guided Shape",
    guidedShapeGroups: [
      {
        id: "s",
        name: "Stove Side",
        shapeType: "straight",
        overlapMode: "none",
        backsplashMode: "exclude",
        pieces: straightPieces
      },
      {
        id: "u",
        name: "Main U-shape",
        shapeType: "U-Shape",
        overlapMode: "none",
        backsplashMode: "include",
        pieces: uPieces
      }
    ],
    pieces: [...straightPieces, ...uPieces]
  };
  const exactCounter = straightSf + uGross;
  const chargeable = chargeableCounterSqftFromExact(exactCounter);
  const q = await calculateQuote(
    {
      quoteSource: "internal_quote",
      engine: "rooms",
      internalMaterialBasis: "wholesale",
      materialGroup: "Group Promo",
      rooms: [room],
      addOns: {}
    },
    {}
  );
  assertNear("spec73 exact", q.snapshot.room_measurement_summaries[0].exactCountertopSqft, exactCounter, 0.2);
  assertNear("spec73 chargeable", q.snapshot.room_measurement_summaries[0].chargeableCountertopSqft, chargeable);
  if (q.snapshot.room_measurement_summaries[0].guidedShapeGroups.length !== 2) {
    throw new Error("spec73: expected 2 guided shape groups on snapshot");
  }
}

console.log("verifyInternalEstimateGuidedMeasurement: ok");
