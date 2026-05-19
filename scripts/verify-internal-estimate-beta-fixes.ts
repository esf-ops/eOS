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
  buildCustomerRoomAreaCostBreakdown,
  buildSelectedMaterialBreakdown,
  calculateAllRoomDrafts,
  createDefaultRoom,
  hydrateCustomerRoomAreaBreakdown,
  hydrateRoomDraftsFromInternalUi,
  mergeRoomDraftsIntoGlobalAddOns,
  measureRoomDraft,
  runLocalPrototypeQuote,
  serializeCustomerRoomAreaBreakdown,
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

// Kitchen + Primary Bath room breakdown reconciles to estimate total
{
  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 40, splash: 8 };
  const bath = createDefaultRoom("Group 1");
  bath.name = "Primary Bath";
  bath.calcMode = "Manual Sq Ft";
  bath.direct = { counter: 12, splash: 4 };
  const drafts = [kitchen, bath];
  const { rooms: measured } = calculateAllRoomDrafts(drafts, "New Construction", "wholesale", 0);
  const quote = runLocalPrototypeQuote({
    quoteMode: "internal",
    internalMaterialBasis: "wholesale",
    materialGroupTop: "Group Promo",
    roomDrafts: drafts,
    globalAddOns: {},
    applyGlobalAddOns: false,
    workflowLabel: "Internal",
    projectType: "New Construction",
    customLineItemsTotal: 0
  });
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: drafts,
    measuredRooms: measured,
    materialBasis: "wholesale",
    customLines: []
  });
  assert.equal(bd.rooms.length, 2);
  assert.equal(bd.rooms[0]?.displayName, "Kitchen");
  assert.equal(bd.rooms[1]?.displayName, "Primary Bath");
  approx(bd.projectTotalExact, quote.retail);
  approx(bd.rooms.reduce((s, r) => s + r.roomTotalExact, 0), quote.retail);
}

// Use tax folded into room material (not separate line)
{
  const room = createDefaultRoom("Group Promo");
  room.name = "Kitchen";
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 10, splash: 0 };
  const { rooms: measured } = calculateAllRoomDrafts([room], "New Construction", "wholesale", 5);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [room],
    measuredRooms: measured,
    materialBasis: "wholesale",
    useTaxPercent: 5,
    customLines: []
  });
  approx(bd.rooms[0]?.materialAmountExact ?? 0, 472.5);
}

// Internal-only custom absorbed into room material; customer line stays visible
{
  const room = createDefaultRoom("Group Promo");
  room.name = "Kitchen";
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 10, splash: 0 };
  const { rooms: measured } = calculateAllRoomDrafts([room], "New Construction", "wholesale", 0);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [room],
    measuredRooms: measured,
    materialBasis: "wholesale",
    customLines: [
      {
        name: "Internal-only fee",
        quantity: 1,
        unitPrice: 100,
        customerFacing: false,
        roomName: "Kitchen",
        category: "Fee"
      },
      {
        name: "Trip charge",
        quantity: 1,
        unitPrice: 75,
        customerFacing: true,
        roomName: "Kitchen",
        category: "Fee"
      }
    ]
  });
  const baseMat = buildSelectedMaterialBreakdown([room], "wholesale").totals.materialSubtotal;
  approx(bd.rooms[0]?.materialAmountExact ?? 0, baseMat + 100);
  assert.equal(bd.rooms[0]?.customerCustomLines.length, 1);
  assert.equal(bd.rooms[0]?.customerCustomLines[0]?.name, "Trip charge");
}

// Snapshot hydrate round-trip
{
  const room = createDefaultRoom("Group Promo");
  room.name = "Pantry";
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 5, splash: 0 };
  const { rooms: measured } = calculateAllRoomDrafts([room], "New Construction", "wholesale", 0);
  const built = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [room],
    measuredRooms: measured,
    materialBasis: "wholesale"
  });
  const snap = serializeCustomerRoomAreaBreakdown(built);
  const again = hydrateCustomerRoomAreaBreakdown(snap, () => built);
  assert.equal(again.rooms[0]?.displayName, "Pantry");
  approx(again.projectTotalExact, built.projectTotalExact);
}

console.log("verify-internal-estimate-beta-fixes: OK");
