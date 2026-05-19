/**
 * Regression checks for Internal Estimate beta fixes.
 * Run: npx --yes tsx scripts/verify-internal-estimate-beta-fixes.ts
 */
import assert from "node:assert/strict";
import {
  calculateQuote,
  ESF_DIRECT_PRICE_PER_SQFT,
  PROTOTYPE_TIER_PRICE_PER_SQFT
} from "../backend-core/src/quotes/quoteCalculator.js";
import { guidedCornerOverlapDeductionSf, guidedCornerOverlapSqft, round2 } from "../app-quote/src/lib/measurementEngine.ts";
import {
  buildSelectedMaterialBreakdown,
  createDefaultRoom,
  hydrateRoomDraftsFromInternalUi,
  mergeRoomDraftsIntoGlobalAddOns,
  measureRoomDraft,
  serializeRoomDraftsForInternalUi,
  serializeRoomsForApi
} from "../app-quote/src/lib/prototypeQuoteMath.ts";

function approx(a: number, b: number, eps = 0.02) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);
}

// Manual sqft room add-ons + persistence
{
  const room = createDefaultRoom("Group Promo");
  room.name = "Kitchen";
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 10, splash: 0 };
  room.addons["qty-sink"] = 2;
  room.tear = true;
  room.materialCatalogId = "color-test-id";
  room.materialColor = "Calacatta Gold";
  const merged = mergeRoomDraftsIntoGlobalAddOns([room]);
  assert.equal(merged["qty-sink"], 2);
  assert.equal(merged.tearout, 1);
  const hydrated = hydrateRoomDraftsFromInternalUi(serializeRoomDraftsForInternalUi([room]), serializeRoomsForApi([room]))[0];
  assert.equal(hydrated.addons["qty-sink"], 2);
  assert.equal(hydrated.tear, true);
  assert.equal(hydrated.materialCatalogId, "color-test-id");
  assert.equal(hydrated.materialColor, "Calacatta Gold");
}

// Guided L-shape corner overlap @ 25.5"
{
  const overlapOne = guidedCornerOverlapSqft(25.5, 25.5);
  approx(overlapOne, 4.515625);
  const lRoom = createDefaultRoom("Group Promo");
  lRoom.calcMode = "Guided Shape";
  lRoom.guidedLayoutPreset = "L-Shape";
  lRoom.guidedPieces = [
    { id: "a", pieceType: "counter", name: "Main", lengthIn: 120, depthIn: 25.5, shape: "rect" },
    { id: "b", pieceType: "counter", name: "Return", lengthIn: 60, depthIn: 25.5, shape: "rect" }
  ];
  lRoom.addons["qty-cook"] = 1;
  approx(guidedCornerOverlapDeductionSf(lRoom), overlapOne);
  const measured = measureRoomDraft(lRoom, 0, "wholesale", 0);
  const rawL = (120 * 25.5) / 144 + (60 * 25.5) / 144;
  approx(measured.counter, rawL - overlapOne);
  const mergedGuided = mergeRoomDraftsIntoGlobalAddOns([lRoom]);
  assert.equal(mergedGuided["qty-cook"], 1);
}

// U-shape: two corner overlaps
{
  const overlapOne = guidedCornerOverlapSqft(25.5, 25.5);
  const uRoom = createDefaultRoom("Group Promo");
  uRoom.calcMode = "Guided Shape";
  uRoom.guidedLayoutPreset = "U-Shape";
  uRoom.guidedPieces = [
    { id: "a", pieceType: "counter", name: "Left", lengthIn: 96, depthIn: 25.5, shape: "rect" },
    { id: "b", pieceType: "counter", name: "Back", lengthIn: 120, depthIn: 25.5, shape: "rect" },
    { id: "c", pieceType: "counter", name: "Right", lengthIn: 96, depthIn: 25.5, shape: "rect" }
  ];
  approx(guidedCornerOverlapDeductionSf(uRoom), round2(overlapOne * 2));
}

// Use tax 5% on 10 sf Promo @ $45/sf → $472.50 countertop material
{
  const taxBd = buildSelectedMaterialBreakdown(
    [{ ...createDefaultRoom("Group Promo"), calcMode: "Manual Sq Ft", direct: { counter: 10, splash: 0 } }],
    "wholesale",
    { useTaxPercent: 5 }
  );
  approx(taxBd.totals.useTax?.baseCountertopMaterial ?? 0, 450);
  approx(taxBd.totals.useTax?.taxAmount ?? 0, 22.5);
  approx(taxBd.totals.countertopMaterial, 472.5);
  const taxCalc = await calculateQuote(
    {
      quoteSource: "internal_quote",
      internalMaterialBasis: "wholesale",
      engine: "legacy",
      materialGroup: "Group Promo",
      areas: { countertopSqft: 10, backsplashSqft: 0 },
      useTaxPercent: 5,
      rooms: [],
      addOns: {}
    },
    {}
  );
  approx(taxCalc.totals.retail, 472.5);
}

// Direct/wholesale — no public markup on internal
{
  const w = await calculateQuote(
    {
      quoteSource: "internal_quote",
      internalMaterialBasis: "wholesale",
      engine: "legacy",
      materialGroup: "Group Promo",
      areas: { countertopSqft: 10, backsplashSqft: 0 },
      rooms: [],
      addOns: {}
    },
    {}
  );
  const d = await calculateQuote(
    {
      quoteSource: "internal_quote",
      internalMaterialBasis: "direct",
      engine: "legacy",
      materialGroup: "Group Promo",
      areas: { countertopSqft: 10, backsplashSqft: 0 },
      rooms: [],
      addOns: {}
    },
    {}
  );
  approx(w.totals.retail, 10 * PROTOTYPE_TIER_PRICE_PER_SQFT["Group Promo"]);
  approx(d.totals.retail, 10 * ESF_DIRECT_PRICE_PER_SQFT["Group Promo"]);
}

console.log("verify-internal-estimate-beta-fixes: OK");
