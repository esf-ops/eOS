/**
 * Regression checks for Internal Estimate beta fixes.
 * Run: npx --yes tsx scripts/verify-internal-estimate-beta-fixes.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
import {
  calculateQuote,
  ESF_DIRECT_PRICE_PER_SQFT,
  PROTOTYPE_TIER_PRICE_PER_SQFT
} from "../backend-core/src/quotes/quoteCalculator.js";
import { guidedCornerOverlapDeductionSf, guidedCornerOverlapSqft, round2 } from "../app-quote/src/lib/measurementEngine.ts";
import {
  priceVanityProgram2026,
  roundCustomerDisplayVanity
} from "../app-quote/src/lib/vanityProgram2026.ts";
import {
  buildCustomerRoomAreaCostBreakdown,
  buildSelectedMaterialBreakdown,
  calculateAllRoomDrafts,
  createDefaultRoom,
  createVanityRoom,
  hydrateCustomerRoomAreaBreakdown,
  hydrateRoomDraftsFromInternalUi,
  mergeRoomDraftsIntoGlobalAddOns,
  measureRoomDraft,
  priceVanityRoomDraft,
  resolveRoomUseTaxPercent,
  runLocalPrototypeQuote,
  serializeCustomerRoomAreaBreakdown,
  serializeRoomDraftsForInternalUi,
  serializeRoomsForApi
} from "../app-quote/src/lib/prototypeQuoteMath.ts";

function approx(a: number, b: number, eps = 0.02) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);
}

// Customer print room breakdown uses round2 — must import from measurementEngine (bundled frontend).
{
  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  assert.match(
    printSrc,
    /import\s*\{[^}]*\bround2\b[^}]*\}\s*from\s*["']@quote-lib\/measurementEngine["']/,
    "CustomerEstimatePrint must import round2 from @quote-lib/measurementEngine"
  );
  approx(round2(1.005), 1.01);
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

// Room-level use tax: Kitchen 5% on 10 sf Promo @ $45/sf → $472.50 material in Kitchen only
{
  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 10, splash: 0 };
  kitchen.useTaxMode = "percent";
  kitchen.useTaxPercent = 5;
  const bath = createDefaultRoom("Group Promo");
  bath.name = "Primary Bath";
  bath.calcMode = "Manual Sq Ft";
  bath.direct = { counter: 12, splash: 0 };
  bath.useTaxMode = "none";
  const { rooms: measured } = calculateAllRoomDrafts([kitchen, bath], "New Construction", "wholesale", 0);
  approx(measured[0].useTax?.taxAmount ?? 0, 22.5);
  approx(measured[0].selected, 472.5);
  approx(measured[1].useTax?.applied ?? false, false);
  approx(measured[1].selected, 540);
  const taxBd = buildSelectedMaterialBreakdown([kitchen, bath], "wholesale", { projectUseTaxPercent: 0 });
  approx(taxBd.totals.useTax?.taxAmount ?? 0, 22.5);
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
  room.useTaxMode = "percent";
  room.useTaxPercent = 5;
  const { rooms: measured } = calculateAllRoomDrafts([room], "New Construction", "wholesale", 0);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [room],
    measuredRooms: measured,
    materialBasis: "wholesale",
    projectUseTaxPercent: 0,
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

// 2026 Vanity Program rates
{
  approx(priceVanityProgram2026({ sizeCode: "25_S", tier: "kitchen_over_35" })?.exactTotal ?? 0, 190);
  approx(priceVanityProgram2026({ sizeCode: "25_S", tier: "kitchen_under_35" })?.exactTotal ?? 0, 370);
  approx(priceVanityProgram2026({ sizeCode: "61_D", tier: "kitchen_over_35" })?.exactTotal ?? 0, 410);
  approx(priceVanityProgram2026({ sizeCode: "61_D", tier: "kitchen_under_35" })?.exactTotal ?? 0, 700);
  approx(priceVanityProgram2026({ sizeCode: "120_D", tier: "kitchen_under_35" })?.exactTotal ?? 0, 1150);
  approx(
    priceVanityProgram2026({ sizeCode: "25_S", tier: "kitchen_over_35", sinkType: "rectangular_white" })?.exactTotal ?? 0,
    215
  );
  approx(
    priceVanityProgram2026({ sizeCode: "25_S", tier: "kitchen_over_35", sinkType: "oval_bisque" })?.exactTotal ?? 0,
    200
  );
  approx(
    priceVanityProgram2026({ sizeCode: "61_D", tier: "kitchen_over_35", sinkType: "rectangular_white" })?.exactTotal ?? 0,
    460
  );
  approx(priceVanityProgram2026({ sizeCode: "25_S", tier: "kitchen_over_35", extraTrips: 1 })?.exactTotal ?? 0, 340);
  assert.equal(roundCustomerDisplayVanity(192), 190);
  assert.equal(roundCustomerDisplayVanity(193), 195);
  const vRoom = createVanityRoom("Group Promo");
  vRoom.vanity.size = "61_D";
  vRoom.vanity.vanityTier = "kitchen_over_35";
  const priced = priceVanityRoomDraft(vRoom, 40);
  approx(priced?.exactTotal ?? 0, 410);
  assert.equal(priced?.displayTotal, 410);
}

console.log("verify-internal-estimate-beta-fixes: OK");
