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
import {
  chargeableCounterSqftFromExact,
  guidedCornerOverlapDeductionSf,
  guidedCornerOverlapDeductionSfForGroup,
  guidedCornerOverlapSqft,
  round2
} from "../app-quote/src/lib/measurementEngine.ts";
import { appendGuidedShapeGroup, updateGuidedShapeGroup } from "../app-quote/src/lib/guidedShapeGroups.ts";
import {
  buildGuidedShapeMathAudit,
  cedarValleySpec73StyleFixture,
  detectLikelyBacksplashDoubleCount
} from "../app-quote/src/lib/guidedShapeMathAudit.ts";
import {
  priceVanityProgram2026,
  roundCustomerDisplayAddonLine,
  roundCustomerDisplayVanity
} from "../app-quote/src/lib/vanityProgram2026.ts";
import {
  buildCustomerRoomAreaCostBreakdown,
  buildSelectedMaterialBreakdown,
  calculateAllRoomDrafts,
  createDefaultRoom,
  createEstimatorRoom,
  createVanityRoom,
  INTERNAL_ESTIMATE_MEASURE_OPTIONS,
  hydrateCustomerRoomAreaBreakdown,
  hydrateRoomDraftsFromInternalUi,
  mergeRoomDraftsIntoGlobalAddOns,
  aggregateComparisonScope,
  buildInternalEstimateGroupComparison,
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
  assert.equal(roundCustomerDisplayAddonLine(252), 255);
  assert.equal(roundCustomerDisplayAddonLine(0), 0);
  const vRoom = createVanityRoom("Group Promo");
  vRoom.vanity.size = "61_D";
  vRoom.vanity.vanityTier = "kitchen_over_35";
  const priced = priceVanityRoomDraft(vRoom, 40);
  approx(priced?.exactTotal ?? 0, 410);
  assert.equal(priced?.displayTotal, 410);
}

// Guided shape math audit (internal breakdown)
{
  const lRoom = createDefaultRoom("Group Promo");
  lRoom.calcMode = "Guided Shape";
  lRoom.guidedLayoutPreset = "L-Shape";
  lRoom.guidedPieces = [
    { id: "a", pieceType: "counter", name: "Main", lengthIn: 120, depthIn: 25.5, shape: "rect" },
    { id: "b", pieceType: "counter", name: "Return", lengthIn: 60, depthIn: 25.5, shape: "rect" }
  ];
  const audit = buildGuidedShapeMathAudit(lRoom);
  assert.ok(audit);
  assert.ok(audit!.finalCounterSf > 0);
  assert.ok(audit!.cornerOverlapDeductionSf > 0);
  assert.ok(audit!.detailLines.some((ln) => /overlap/i.test(ln)));
  const cv = cedarValleySpec73StyleFixture(createDefaultRoom);
  const overlapOne = guidedCornerOverlapSqft(25.5, 25.5);
  const rawL = (120 * 25.5) / 144 + (60 * 25.5) / 144;
  const exactL = rawL - overlapOne;
  approx(cv.counterSf, chargeableCounterSqftFromExact(exactL));
  approx(cv.backsplashSf, (120 * 4) / 144);
}

// Spec 73: additive shape groups — U-shape after straight wall does not reset prior group
{
  let kitchen = createEstimatorRoom("Group Promo");
  kitchen.name = "Kitchen";
  const straightId = kitchen.guidedShapeGroups![0].id;
  kitchen = updateGuidedShapeGroup(kitchen, straightId, {
    name: "Left stove wall",
    pieces: [
      { id: "a", pieceType: "counter", name: "Left of stove", lengthIn: 48, depthIn: 25.5, shape: "rect" },
      { id: "b", pieceType: "counter", name: "Right of stove", lengthIn: 36, depthIn: 25.5, shape: "rect" }
    ]
  });
  kitchen = appendGuidedShapeGroup(kitchen, "U-Shape", "Main U-shape");
  assert.equal(kitchen.guidedShapeGroups!.length, 2);
  const straightAfter = kitchen.guidedShapeGroups!.find((g) => g.id === straightId);
  assert.equal(straightAfter?.pieces[0].lengthIn, 48);
  assert.equal(straightAfter?.pieces[1].lengthIn, 36);
  const uGrp = kitchen.guidedShapeGroups!.find((g) => g.shapeType === "U-Shape");
  assert.ok(uGrp);
  kitchen = updateGuidedShapeGroup(kitchen, uGrp!.id, {
    pieces: uGrp!.pieces.map((p, i) => ({
      ...p,
      lengthIn: i === 0 ? 96 : i === 1 ? 120 : 96,
      depthIn: 25.5
    }))
  });
  const straightSf = (48 * 25.5) / 144 + (36 * 25.5) / 144;
  const uRaw = ((96 + 120 + 96) * 25.5) / 144;
  const overlapOne = guidedCornerOverlapSqft(25.5, 25.5);
  const measured = measureRoomDraft(kitchen, 0, "wholesale", 0, INTERNAL_ESTIMATE_MEASURE_OPTIONS);
  const exactCounter = straightSf + uRaw - round2(overlapOne * 2);
  approx(measured.counter, exactCounter, 0.15);
  approx(measured.priceableCounter, chargeableCounterSqftFromExact(exactCounter), 0.01);
  const audit = buildGuidedShapeMathAudit(kitchen, INTERNAL_ESTIMATE_MEASURE_OPTIONS);
  assert.ok(audit);
  assert.equal(audit!.groupAudits.length, 2);
  assert.ok(audit!.groupAudits.some((g) => g.overlapDeductionSf > 0 && /U/i.test(g.shapeType)));
  assert.ok(audit!.groupAudits.some((g) => g.overlapDeductionSf === 0 && g.groupName === "Left stove wall"));
}

// Chargeable counter SF: 36.3 exact → 37 priced (not per-piece round-up to 38)
{
  const len = (sf: number) => round2((sf * 144) / 25.5);
  const pieces = [
    { id: "a", pieceType: "counter" as const, name: "A", lengthIn: len(15.4), depthIn: 25.5, shape: "rect" as const },
    { id: "b", pieceType: "counter" as const, name: "B", lengthIn: len(10.3), depthIn: 25.5, shape: "rect" as const },
    { id: "c", pieceType: "counter" as const, name: "C", lengthIn: len(10.6), depthIn: 25.5, shape: "rect" as const }
  ];
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Guided Shape";
  room.guidedShapeGroups = [{ id: "g1", name: "Runs", shapeType: "manual", overlapMode: "none", pieces }];
  room.guidedPieces = pieces;
  const { rooms: measured } = calculateAllRoomDrafts(
    [room],
    "New Construction",
    "wholesale",
    0,
    INTERNAL_ESTIMATE_MEASURE_OPTIONS
  );
  const raw = round2(15.4 + 10.3 + 10.6);
  approx(raw, 36.3, 0.02);
  assert.equal(chargeableCounterSqftFromExact(raw), 37);
  approx(measured[0].counter, raw, 0.05);
  approx(measured[0].priceableCounter, 37);
  approx(measured[0].chargeableCounter ?? measured[0].priceableCounter, 37);
  const perPieceCeil = Math.ceil(15.4) + Math.ceil(10.3) + Math.ceil(10.6);
  assert.notEqual(perPieceCeil, 37, "per-piece ceiling must not be used");
}

// U-shape gross / no deduction
{
  const uRoom = createDefaultRoom("Group Promo");
  uRoom.calcMode = "Guided Shape";
  uRoom.guidedShapeGroups = [
    {
      id: "u1",
      name: "Main U",
      shapeType: "U-Shape",
      overlapMode: "none",
      pieces: [
        { id: "a", pieceType: "counter", name: "L", lengthIn: 90, depthIn: 25.5, shape: "rect" },
        { id: "b", pieceType: "counter", name: "B", lengthIn: 120, depthIn: 25.5, shape: "rect" },
        { id: "c", pieceType: "counter", name: "R", lengthIn: 36, depthIn: 25.5, shape: "rect" }
      ]
    }
  ];
  uRoom.guidedPieces = uRoom.guidedShapeGroups[0].pieces;
  const grp = uRoom.guidedShapeGroups[0];
  assert.equal(guidedCornerOverlapDeductionSfForGroup(grp), 0);
  const rawU = ((90 + 120 + 36) * 25.5) / 144;
  const measured = measureRoomDraft(uRoom, 0, "wholesale", 0, INTERNAL_ESTIMATE_MEASURE_OPTIONS);
  approx(measured.counter, rawU, 0.1);
}

// Backsplash: counter without addSplash; explicit splash piece only
{
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Guided Shape";
  room.guidedShapeGroups = [
    {
      id: "g1",
      name: "U runs",
      shapeType: "U-Shape",
      overlapMode: "U-Shape",
      backsplashMode: "include",
      pieces: [
        { id: "a", pieceType: "counter", name: "Run", lengthIn: 120, depthIn: 25.5, shape: "rect", addSplash: false },
        {
          id: "s",
          pieceType: "splash",
          name: "Sink splash",
          lengthIn: 126,
          depthIn: 4,
          shape: "rect"
        }
      ]
    }
  ];
  room.guidedPieces = room.guidedShapeGroups[0].pieces;
  const { rooms: measured } = calculateAllRoomDrafts([room], "New Construction", "wholesale", 0, INTERNAL_ESTIMATE_MEASURE_OPTIONS);
  approx(measured[0].splash, (126 * 4) / 144);
  assert.ok(measured[0].splash < 4);
}

// L-shape overlap within single group only
{
  const lGroup = createDefaultRoom("Group Promo");
  lGroup.calcMode = "Guided Shape";
  lGroup.guidedShapeGroups = [
    {
      id: "g1",
      name: "L run",
      shapeType: "L-Shape",
      pieces: [
        { id: "a", pieceType: "counter", name: "Main", lengthIn: 120, depthIn: 25.5, shape: "rect" },
        { id: "b", pieceType: "counter", name: "Return", lengthIn: 60, depthIn: 25.5, shape: "rect" }
      ]
    }
  ];
  lGroup.guidedPieces = lGroup.guidedShapeGroups[0].pieces;
  const overlapOne = guidedCornerOverlapSqft(25.5, 25.5);
  approx(guidedCornerOverlapDeductionSf(lGroup), overlapOne);
}

// Pricing authority: tier comparison + live preview use chargeable counter SF (not exact)
{
  const len = (sf: number) => round2((sf * 144) / 25.5);
  const pieces = [
    { id: "a", pieceType: "counter" as const, name: "A", lengthIn: len(15.4), depthIn: 25.5, shape: "rect" as const },
    { id: "b", pieceType: "counter" as const, name: "B", lengthIn: len(10.3), depthIn: 25.5, shape: "rect" as const },
    { id: "c", pieceType: "counter" as const, name: "C", lengthIn: len(10.6), depthIn: 25.5, shape: "rect" as const }
  ];
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Guided Shape";
  room.guidedShapeGroups = [{ id: "g1", name: "Runs", shapeType: "manual", overlapMode: "none", pieces }];
  room.guidedPieces = pieces;
  const scope = aggregateComparisonScope([room], "New Construction", { materialBasis: "wholesale" });
  const exact = round2(15.4 + 10.3 + 10.6);
  approx(scope.exactCounterSqft, exact, 0.02);
  assert.equal(scope.countertopSqft, 37);
  const rate = PROTOTYPE_TIER_PRICE_PER_SQFT["Group Promo"];
  const exactCounter$ = round2(exact * rate);
  const chargeableCounter$ = round2(37 * rate);
  assert.notEqual(exactCounter$, chargeableCounter$);
  const compRow = buildInternalEstimateGroupComparison({
    countertopSqft: scope.countertopSqft,
    backsplashSqft: scope.backsplashSqft,
    roomFixedDollars: scope.addonDollars,
    customLineDollars: 0,
    basis: "wholesale"
  }).find((r) => r.group === "Group Promo");
  approx(compRow!.materialCounter, chargeableCounter$);
  const live = runLocalPrototypeQuote({
    quoteMode: "internal",
    internalMaterialBasis: "wholesale",
    materialGroupTop: "Group Promo",
    roomDrafts: [room],
    globalAddOns: {},
    applyGlobalAddOns: false,
    workflowLabel: "Internal",
    projectType: "New Construction"
  });
  const matrixRow = live.allGroupMatrix.find((r) => r.group === "Group Promo");
  approx(matrixRow!.counter, chargeableCounter$);
  approx(live.mathCheck.countertopSf, 37);
}

// Live total aligns with all-group matrix + custom lines (use tax included when set)
{
  const room = createEstimatorRoom("Group Promo");
  room.name = "Kitchen";
  room.addons = { "qty-sink": 1, "qty-cook": 1 };
  const scope = aggregateComparisonScope([room], "New Construction", {
    materialBasis: "wholesale",
    projectUseTaxPercent: 2
  });
  const comp = buildInternalEstimateGroupComparison({
    countertopSqft: scope.countertopSqft,
    backsplashSqft: scope.backsplashSqft,
    roomFixedDollars: scope.addonDollars,
    customLineDollars: 0,
    useTaxPercent: 2,
    basis: "wholesale"
  }).find((r) => r.group === "Group Promo");
  const live = runLocalPrototypeQuote({
    quoteMode: "internal",
    internalMaterialBasis: "wholesale",
    materialGroupTop: "Group Promo",
    roomDrafts: [room],
    globalAddOns: {},
    applyGlobalAddOns: false,
    workflowLabel: "Internal",
    projectType: "New Construction",
    useTaxPercent: 2
  });
  const matrixPromo = live.allGroupMatrix.find((r) => r.group === "Group Promo")!;
  approx(comp!.fullTotal, matrixPromo.wholesale, 0.05);
  approx(live.retail, matrixPromo.wholesale, 0.05);
}

// Backsplash double-count warning (does not delete pieces)
{
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Guided Shape";
  room.guidedShapeGroups = [
    {
      id: "g1",
      name: "Main",
      shapeType: "straight",
      overlapMode: "none",
      backsplashMode: "include",
      pieces: [
        {
          id: "c",
          pieceType: "counter",
          name: "Run",
          lengthIn: 120,
          depthIn: 25.5,
          shape: "rect",
          addSplash: true
        },
        {
          id: "s",
          pieceType: "splash",
          name: "Manual splash",
          lengthIn: 120,
          depthIn: 4,
          shape: "rect"
        }
      ]
    }
  ];
  room.guidedPieces = room.guidedShapeGroups[0].pieces;
  const warns = detectLikelyBacksplashDoubleCount(room);
  assert.ok(warns.length >= 1);
  assert.match(warns[0], /double-count|counted twice/i);
}

// Internal Estimate save / revision UX (sticky footer forces save_mode)
{
  const ieSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/InternalEstimateApp.tsx"), "utf8");
  assert.match(ieSrc, /handleSubmit\("save_revision"\)/, "sticky Save revision must force save_revision");
  assert.match(ieSrc, /handleSubmit\("update_existing"\)/, "sticky Update must force update_existing");
  assert.match(ieSrc, /buildSubmitPayload\(urlQuoteId \? intent/, "save payload must use forced intent");
  assert.match(ieSrc, /Saved as \$\{savedLabel\}/, "success copy must show Saved as ESF-…-R#");
  assert.match(ieSrc, /setSaveIntent\(ic \? "save_revision"/, "current revision must default to save_revision");
  assert.doesNotMatch(
    ieSrc,
    /value=\{saveIntent\}[\s\S]{0,120}<option value="save_as_new_quote"/,
    "select must not bind invalid create intent to save_as_new_quote option"
  );
}

console.log("verify-internal-estimate-beta-fixes: OK");
