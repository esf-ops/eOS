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
  computeLocalUpgradedEdgeTotal,
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
  serializeRoomsForApi,
  UPGRADED_EDGE_PREVIEW_RATE_PER_LF,
  UPGRADED_EDGE_PROFILES
} from "../app-quote/src/lib/prototypeQuoteMath.ts";
import { parseCustomerFacingNoteLines } from "../app-internal-estimate/src/lib/customerFacingNotes.ts";
import { buildCustomerEstimateDisplayModel } from "../app-internal-estimate/src/lib/customerEstimateDisplayModel.ts";
import { formatPreparedByDisplayName } from "../app-internal-estimate/src/lib/formatPreparedByName.ts";

function approx(a: number, b: number, eps = 0.02) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);
}

// Customer print uses pre-rounded display amounts from customerDisplay model.
{
  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  assert.match(
    printSrc,
    /display\.estimateSummaryRows/,
    "CustomerEstimatePrint must render estimate summary from customerDisplay model"
  );
  assert.match(printSrc, /roundCustomerDisplay/, "CustomerEstimatePrint must use customer display rounding helpers");
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
  assert.match(ieSrc, /handleRestoreAsRevision/, "historical revision must support restore-as-revision");
  assert.match(ieSrc, /restore-as-revision/, "must call internal restore-as-revision API");
  assert.match(ieSrc, /Start new quote/, "must expose Start new quote control");
  assert.match(ieSrc, /pickLatestFamilyRevision/, "must resolve latest revision from family list");
  assert.match(ieSrc, /Older revision open/, "historical copy must explain restore path");
}

// Loughren regression: multiple customer-facing fixtures + optional comparison color labels
{
  const kitchen = createDefaultRoom("Group D");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 57, splash: 38 };
  kitchen.addons["qty-sink"] = 1;
  const laundry = createDefaultRoom("Group D");
  laundry.name = "Laundry";
  laundry.calcMode = "Manual Sq Ft";
  laundry.direct = { counter: 7, splash: 1 };
  laundry.addons["qty-sink-small"] = 1;
  const { rooms: measured } = calculateAllRoomDrafts([kitchen, laundry], "Kitchen", "direct", 0);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [kitchen, laundry],
    measuredRooms: measured,
    materialBasis: "direct",
    customLines: [
      {
        lineKey: "laundry-sink",
        name: 'Blanco Precis 30" UM Sink color 442531',
        quantity: 1,
        unitPrice: 560,
        customerFacing: true,
        roomName: "Laundry",
        roomId: laundry.id,
        category: "Plumbing fixture"
      },
      {
        lineKey: "kitchen-sink",
        name: "Blanco Diamond Super Single Silgranit UM Sink, Truffle 441765",
        quantity: 1,
        unitPrice: 450,
        customerFacing: true,
        roomName: "Kitchen",
        roomId: kitchen.id,
        category: "Plumbing fixture"
      }
    ]
  });
  const kitchenRow = bd.rooms.find((r) => r.roomName === "Kitchen");
  const laundryRow = bd.rooms.find((r) => r.roomName === "Laundry");
  assert.equal(kitchenRow?.customerCustomLines.length, 1);
  assert.equal(laundryRow?.customerCustomLines.length, 1);
  assert.equal(kitchenRow?.customerCustomLines[0]?.amountExact, 450);
  assert.equal(laundryRow?.customerCustomLines[0]?.amountExact, 560);

  const calcTwoFixtures = await calculateQuote(
    {
      quoteSource: "internal_quote",
      engine: "legacy",
      internalMaterialBasis: "direct",
      materialGroup: "Group D",
      areas: { countertopSqft: 64, backsplashSqft: 39 },
      rooms: [],
      addOns: {},
      customLineItems: [
        {
          lineKey: "laundry-sink",
          name: 'Blanco Precis 30" UM Sink color 442531',
          category: "Plumbing fixture",
          quantity: 1,
          unitPrice: 560,
          customerFacing: true,
          roomName: "Laundry",
          roomId: laundry.id
        },
        {
          lineKey: "kitchen-sink",
          name: "Blanco Diamond Super Single Silgranit UM Sink, Truffle 441765",
          category: "Plumbing fixture",
          quantity: 1,
          unitPrice: 450,
          customerFacing: true,
          roomName: "Kitchen",
          roomId: kitchen.id
        }
      ]
    },
    {}
  );
  const customItems = calcTwoFixtures.snapshot?.custom_line_items ?? [];
  assert.equal(customItems.length, 2, "backend keeps both custom fixture lines");
  assert.equal(
    customItems.reduce((s: number, r: { line_total?: number }) => s + (Number(r.line_total) || 0), 0),
    1010
  );

  const displaySrc = readFileSync(join(repoRoot, "app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"), "utf8");
  assert.match(displaySrc, /customerFixtureDetailLines/, "display model exposes customer fixture detail lines");
  assert.match(displaySrc, /lineKey/, "display model uses stable line keys");

  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  // Comparison color labels now come through display.roomComparisonTable.selectedGroups[].colorLabel
  assert.match(printSrc, /colorLabel/, "customer print shows optional comparison color labels via selectedGroups");
  // customerFixtureDetailLines are now handled in the display model's estimateSummaryRows, not rendered directly
  assert.match(printSrc, /estimateSummaryRows/, "customer print renders estimateSummaryRows (which includes fixture lines)");

  const ieSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/InternalEstimateApp.tsx"), "utf8");
  assert.match(ieSrc, /comparisonGroupColorLabels/, "IE UI stores optional comparison color labels");
  assert.match(ieSrc, /roomId/, "custom lines link to room draft id");
}

// Customer-facing project notes — normalize, print model, pricing unchanged
{
  const LOUGHREN_NOTES =
    "Sink accessories not included.\nConfirm sink base size before ordering.\n\nLaminate must be removed before template.\nFull-height backsplash requires second template/install.";

  assert.deepEqual(parseCustomerFacingNoteLines(""), []);
  assert.deepEqual(parseCustomerFacingNoteLines("   \n  "), []);
  assert.deepEqual(parseCustomerFacingNoteLines(LOUGHREN_NOTES), [
    "Sink accessories not included.",
    "Confirm sink base size before ordering.",
    "Laminate must be removed before template.",
    "Full-height backsplash requires second template/install."
  ]);
  assert.equal(parseCustomerFacingNoteLines(Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n")).length, 12);

  const kitchen = createDefaultRoom("Group D");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 57, splash: 38 };
  const calcBase = await calculateQuote(
    {
      quoteSource: "internal_quote",
      engine: "legacy",
      internalMaterialBasis: "direct",
      materialGroup: "Group D",
      areas: { countertopSqft: 57, backsplashSqft: 38 },
      rooms: [],
      addOns: {}
    },
    {}
  );
  const calcWithNotes = await calculateQuote(
    {
      quoteSource: "internal_quote",
      engine: "legacy",
      internalMaterialBasis: "direct",
      materialGroup: "Group D",
      areas: { countertopSqft: 57, backsplashSqft: 38 },
      rooms: [],
      addOns: {},
      customerFacingNotes: LOUGHREN_NOTES,
      customer_estimate_customer_facing_notes: LOUGHREN_NOTES
    },
    {}
  );
  assert.equal(calcBase.totals?.retail, calcWithNotes.totals?.retail, "project notes must not change pricing totals");

  const displaySrc = readFileSync(join(repoRoot, "app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"), "utf8");
  assert.match(displaySrc, /customerFacingNoteLines/, "display model exposes normalized project note lines");
  assert.match(displaySrc, /parseCustomerFacingNoteLines/, "display model normalizes raw notes");

  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  assert.match(printSrc, /Project Notes/, "customer print renders Project Notes section");
  assert.match(printSrc, /customerFacingNoteLines/, "customer print reads normalized note lines from display model");

  const ieSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/InternalEstimateApp.tsx"), "utf8");
  assert.match(ieSrc, /customerFacingNotes/, "IE stores customer-facing notes state");
  assert.match(ieSrc, /Customer estimate note|customer.facing.*note/i, "IE shows customer-facing notes field");

  const apiSrc = readFileSync(join(repoRoot, "backend-core/src/quotes/internalQuotesApi.js"), "utf8");
  assert.match(apiSrc, /customer_estimate_customer_facing_notes/, "internal save persists customer-facing notes in snapshot");
}

// computeLocalUpgradedEdgeTotal — local preview matches backend rate
{
  const baseRoom = {
    id: "r1",
    name: "Kitchen",
    materialGroup: "Group Promo",
    shape: "rectangle" as const,
    width: 10,
    depth: 5,
    backsplashHeight: 4,
    backsplashWall: "back" as const,
    sinkCount: 0,
    sinkType: "undermount" as const,
    addons: {}
  };

  // Standard edge — zero charge, no warning
  const std = computeLocalUpgradedEdgeTotal([{ ...baseRoom, edgeProfile: "Eased", upgradedEdgeLf: 20 }]);
  assert.equal(std.total, 0, "EDGE-LOCAL-1: standard edge produces zero charge");
  assert.equal(std.warnings.length, 0, "EDGE-LOCAL-1: standard edge produces no warnings");

  // Upgraded edge with LF — expect lf × rate
  const upgraded = computeLocalUpgradedEdgeTotal([{ ...baseRoom, edgeProfile: "Ogee", upgradedEdgeLf: 12 }]);
  assert.equal(upgraded.total, 12 * UPGRADED_EDGE_PREVIEW_RATE_PER_LF, "EDGE-LOCAL-2: Ogee 12 LF charges 12 × rate");
  assert.equal(upgraded.roomCount, 1, "EDGE-LOCAL-2: one room counted");
  assert.equal(upgraded.warnings.length, 0, "EDGE-LOCAL-2: no warnings when LF provided");

  // Upgraded edge without LF — zero charge, one warning
  const noLf = computeLocalUpgradedEdgeTotal([{ ...baseRoom, edgeProfile: "Waterfall", upgradedEdgeLf: 0 }]);
  assert.equal(noLf.total, 0, "EDGE-LOCAL-3: upgraded with LF=0 produces zero charge");
  assert.equal(noLf.warnings.length, 1, "EDGE-LOCAL-3: upgraded with LF=0 emits one warning");

  // Multi-room: one upgraded, one standard
  const multi = computeLocalUpgradedEdgeTotal([
    { ...baseRoom, id: "r1", name: "Kitchen", edgeProfile: "Ogee", upgradedEdgeLf: 10 },
    { ...baseRoom, id: "r2", name: "Bath", edgeProfile: "Eased", upgradedEdgeLf: 0 }
  ]);
  assert.equal(multi.total, 10 * UPGRADED_EDGE_PREVIEW_RATE_PER_LF, "EDGE-LOCAL-4: only upgraded room adds charge");
  assert.equal(multi.roomCount, 1, "EDGE-LOCAL-4: only one upgraded room counted");

  // Constant matches backend and is consistent with UPGRADED_EDGE_PROFILES
  assert.equal(UPGRADED_EDGE_PREVIEW_RATE_PER_LF, 15, "EDGE-LOCAL-5: preview rate is $15/LF (matches backend fallback)");
  assert.ok(UPGRADED_EDGE_PROFILES.includes("Ogee"), "EDGE-LOCAL-5: Ogee is in UPGRADED_EDGE_PROFILES");

  // Source check: InternalEstimateApp wires edge into partRetail and stickyLiveRollup
  const appSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/InternalEstimateApp.tsx"), "utf8");
  assert.match(appSrc, /liveUpgradedEdgeTotal/, "IE must compute liveUpgradedEdgeTotal");
  assert.match(appSrc, /Edge upgrades/, "IE sticky panel must show Edge upgrades row");
  assert.match(appSrc, /upgradedEdgeTotalExact/, "IE must pass upgradedEdgeTotalExact to display model");

  // Source check: display model exposes summaryEdgeDisplay
  const dmSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"), "utf8");
  assert.match(dmSrc, /summaryEdgeDisplay/, "display model must expose summaryEdgeDisplay");
}

// VANITY-TAX-1: vanity program price is isolated from use tax and fold; displays at nearest $5
{
  // 37" single bowl, kitchen_over_35 tier, rectangular_white sink (+$25 upgrade):
  // base=$240, sinkUpgrade=$25, exactTotal=$265, displayTotal=$265
  // This matches the Hunter beta bug scenario: "Program estimate: $265.00 exact · $265 customer"
  const vanityResult = priceVanityProgram2026({
    sizeCode: "37_S",
    tier: "kitchen_over_35",
    qualifyingKitchenCounterSf: 40,
    sinkType: "rectangular_white"
  });
  assert.ok(vanityResult != null, "VANITY-TAX-1: priceVanityProgram2026 returned result");
  assert.equal(vanityResult!.exactTotal, 265, "VANITY-TAX-1: 37_S over35 + rectangular_white = $265 exactTotal");
  assert.equal(vanityResult!.displayTotal, 265, "VANITY-TAX-1: displayTotal = $265 (already multiple of $5)");

  // measureRoomDraft stores exactTotal as selected, and displayTotal in vanityProgram sub-object
  const vanityDraft = createVanityRoom();
  vanityDraft.name = "Master Bath Vanity";
  vanityDraft.vanity.size = "37_S";
  vanityDraft.vanity.isVanityProgram = true;
  vanityDraft.vanity.vanitySinkType = "rectangular_white"; // matches the $265 = $240 + $25 upgrade scenario

  const measured = measureRoomDraft(vanityDraft, 40, "direct", 7); // 7% project use tax
  assert.equal(measured.isVanityProgram, true, "VANITY-TAX-1: vanity room is marked isVanityProgram");
  assert.equal(measured.selected, 265, "VANITY-TAX-1: measured.selected = exactTotal = $265");
  assert.equal(measured.vanityProgram?.exactTotal, 265, "VANITY-TAX-1: vanityProgram.exactTotal = $265");
  assert.equal(measured.vanityProgram?.displayTotal, 265, "VANITY-TAX-1: vanityProgram.displayTotal = $265");

  // Use tax must NOT be applied to vanity program rooms in buildSelectedMaterialBreakdown
  const singleVanityBreakdown = buildSelectedMaterialBreakdown([vanityDraft], "direct", {
    projectUseTaxPercent: 7
  });
  // Vanity is excluded from selectedBreakdown (its price goes through vanityMaterialExact path)
  assert.equal(
    singleVanityBreakdown.totals.countertopMaterial,
    0,
    "VANITY-TAX-1: vanity must not appear in selectedBreakdown.countertopMaterial"
  );
  assert.equal(
    singleVanityBreakdown.totals.useTax?.taxAmount ?? 0,
    0,
    "VANITY-TAX-1: no use tax on vanity-only breakdown"
  );

  // buildCustomerRoomAreaCostBreakdown must set fixedDisplayTotal for vanity rooms
  const roomBreakdown = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [vanityDraft],
    measuredRooms: [measured],
    materialBasis: "direct",
    projectUseTaxPercent: 7
  });
  const vanityRow = roomBreakdown.rooms[0];
  assert.ok(vanityRow != null, "VANITY-TAX-1: room breakdown has vanity row");
  assert.equal(vanityRow.isVanity, true, "VANITY-TAX-1: vanityRow.isVanity = true");
  assert.equal(vanityRow.fixedDisplayTotal, 265, "VANITY-TAX-1: vanityRow.fixedDisplayTotal = $265 (program price)");
  assert.equal(vanityRow.materialAmountExact, 265, "VANITY-TAX-1: vanityRow.materialAmountExact = $265");

  // Customer-facing rounding: roundCustomerDisplayVanity($265) = $265
  assert.equal(roundCustomerDisplayVanity(265), 265, "VANITY-TAX-1: roundCustomerDisplayVanity($265) = $265");
}

// VANITY-TAX-2: customerEstimateDisplayModel uses vanityProgram.displayTotal (not exactTotal) for vanity contribution
{
  const dmSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"), "utf8");
  assert.match(dmSrc, /vanityDisplayContribution/, "display model must use vanityDisplayContribution (not vanityMaterialExact)");
  assert.match(dmSrc, /vanityProgram\?\.displayTotal/, "display model must read vanityProgram.displayTotal");
  assert.match(dmSrc, /allocateCustomerDisplayFives/, "display model must use allocateCustomerDisplayFives");
  assert.match(dmSrc, /fixedDisplayTotal/, "display model buildRoomAreaPrintRows must handle fixedDisplayTotal");

  // roundCustomerDisplay must use nearest-$5 (not nearest-$10 ceiling)
  const roundingSrc = readFileSync(join(repoRoot, "app-quote/src/lib/customerDisplayRounding.ts"), "utf8");
  assert.match(roundingSrc, /Math\.round\(n \/ 5\) \* 5/, "roundCustomerDisplay must be nearest-$5 round");
  assert.doesNotMatch(roundingSrc, /Math\.ceil\(n \/ 10\) \* 10/, "roundCustomerDisplay must not be nearest-$10 ceil");

  // CustomerEstimatePrint must say nearest $5
  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  assert.match(printSrc, /nearest \$5/, "CustomerEstimatePrint copy must say 'nearest $5'");
  assert.doesNotMatch(printSrc, /nearest \$10/, "CustomerEstimatePrint must not have old nearest-$10 copy");
}

// ─── CUSTOMER PDF CLEANUP REGRESSION CHECKS ───────────────────────────────

// PREP-BY-1: formatPreparedByDisplayName converts email to full name
{
  assert.equal(formatPreparedByDisplayName("peg.reid@elitestonefabrication.com"), "Peg Reid", "PREP-BY-1: peg.reid email → Peg Reid");
  assert.equal(formatPreparedByDisplayName("chris.henely@elitestonefabrication.com"), "Chris Henely", "PREP-BY-1: chris.henely email → Chris Henely");
  assert.equal(formatPreparedByDisplayName("Casey Johnson"), "Casey Johnson", "PREP-BY-1: plain name returned as-is");
  assert.equal(formatPreparedByDisplayName(""), "", "PREP-BY-1: empty → empty string");
  assert.equal(formatPreparedByDisplayName(null), "", "PREP-BY-1: null → empty string");
  assert.equal(formatPreparedByDisplayName("casey@esf.com"), "Casey", "PREP-BY-1: single-segment local → capitalized");
}

// PDF-STRUCT-1: CustomerEstimatePrint source checks — removed sections + structure
{
  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");

  // Removed sections
  assert.doesNotMatch(printSrc, /Scope summary/i, "PDF-STRUCT-1: Scope Summary section removed");
  assert.doesNotMatch(printSrc, /Quoted material breakdown/i, "PDF-STRUCT-1: Quoted Material Breakdown section removed");
  assert.doesNotMatch(printSrc, /cep-breakdown/, "PDF-STRUCT-1: Quoted Material Breakdown container removed");
  assert.doesNotMatch(printSrc, /materialScopeGroups/, "PDF-STRUCT-1: materialScopeGroups not rendered in print");
  assert.doesNotMatch(printSrc, /Add-ons \/ fixtures/, "PDF-STRUCT-1: separate Add-ons / Fixtures section removed");
  assert.doesNotMatch(printSrc, /Total sf/i, "PDF-STRUCT-1: Total SF column removed from room table");
  assert.doesNotMatch(printSrc, /displayRow\.totalSqft/, "PDF-STRUCT-1: totalSqft not rendered in room table");
  assert.doesNotMatch(printSrc, /scope reference.*not a second/, "PDF-STRUCT-1: internal scope reference copy removed");
  assert.doesNotMatch(printSrc, /comparisonRows/, "PDF-STRUCT-1: comparisonRows prop not used directly (now via display model)");

  // Room/Area table column headers
  assert.match(printSrc, /Room \/ area/, "PDF-STRUCT-1: Room / area column present");
  assert.match(printSrc, /Material/, "PDF-STRUCT-1: Material column present");
  assert.match(printSrc, /Add-ons/, "PDF-STRUCT-1: Add-ons column present");
  assert.match(printSrc, /Area total/, "PDF-STRUCT-1: Area total column present");

  // Includes: add-on label format under room row
  assert.match(printSrc, /Includes:/, "PDF-STRUCT-1: Includes: label under room row");

  // Customer-facing room notes render
  assert.match(printSrc, /customerNoteLines/, "PDF-STRUCT-1: customerNoteLines rendered under room");

  // Comparison table uses display model
  assert.match(printSrc, /display\.roomComparisonTable/, "PDF-STRUCT-1: comparison uses display.roomComparisonTable");
  assert.match(printSrc, /groupDisplayTotals/, "PDF-STRUCT-1: per-room group totals rendered");
  assert.match(printSrc, /projectDisplayTotals/, "PDF-STRUCT-1: project total per group rendered");

  // Prepared by uses display model name
  assert.match(printSrc, /preparedByDisplayName/, "PDF-STRUCT-1: preparedByDisplayName used from display model");

  // Project notes still present (rendered conditionally)
  assert.match(printSrc, /Project Notes/, "PDF-STRUCT-1: Project Notes section still present");
  assert.match(printSrc, /customerFacingNoteLines/, "PDF-STRUCT-1: customerFacingNoteLines still rendered");

  // nearest $5 copy preserved
  assert.match(printSrc, /nearest \$5/, "PDF-STRUCT-1: nearest $5 copy preserved");
  assert.doesNotMatch(printSrc, /nearest \$10/, "PDF-STRUCT-1: no nearest $10 copy");
}

// PDF-DM-1: display model source — exposes new fields, uses helpers correctly
{
  const dmSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"), "utf8");
  assert.match(dmSrc, /preparedByDisplayName/, "PDF-DM-1: display model exposes preparedByDisplayName");
  assert.match(dmSrc, /roomComparisonTable/, "PDF-DM-1: display model exposes roomComparisonTable");
  assert.match(dmSrc, /CustomerPrintComparisonTable/, "PDF-DM-1: CustomerPrintComparisonTable type defined");
  assert.match(dmSrc, /CustomerPrintComparisonRoomRow/, "PDF-DM-1: CustomerPrintComparisonRoomRow type defined");
  assert.match(dmSrc, /formatPreparedByDisplayName/, "PDF-DM-1: formatPreparedByDisplayName imported and used");
  // Summary rows expand specific addon lines; generic row only as fallback when no specific lines exist
  assert.match(dmSrc, /addonDetailLines/, "PDF-DM-1: addonDetailLines expanded in summary rows");
  assert.match(dmSrc, /specificCount/, "PDF-DM-1: specificCount logic present — generic fallback only when no specifics");
  // Vanity fixed display total preserved in comparison
  assert.match(dmSrc, /fixedDisplayTotal/, "PDF-DM-1: fixedDisplayTotal used in comparison builder");
}

// PDF-DM-VANITY-1: customerNote field propagates through CustomerRoomAreaCostRow
{
  const vanity = createVanityRoom();
  vanity.name = "Master Vanity";
  vanity.vanity.size = "37_S";
  vanity.vanity.isVanityProgram = true;
  vanity.vanity.vanitySinkType = "rectangular_white";

  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 40, splash: 8 };
  (kitchen as typeof kitchen & { customerNote?: string }).customerNote = "Confirm sink base before template.";

  const mKitchen = measureRoomDraft(kitchen, 0, "direct", 0);
  const mVanity = measureRoomDraft(vanity, 40, "direct", 0);

  const rab = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [kitchen, vanity],
    measuredRooms: [mKitchen, mVanity],
    materialBasis: "direct",
    projectUseTaxPercent: 0
  });

  // Kitchen row customerNote should be propagated
  const kitchenRow = rab.rooms.find((r) => r.roomId === kitchen.id);
  assert.ok(kitchenRow != null, "PDF-DM-VANITY-1: kitchen row in breakdown");
  assert.equal(kitchenRow!.customerNote, "Confirm sink base before template.", "PDF-DM-VANITY-1: customerNote propagated to breakdown row");

  // Vanity row customerNote defaults to empty string
  const vanityRow = rab.rooms.find((r) => r.roomId === vanity.id);
  assert.ok(vanityRow != null, "PDF-DM-VANITY-1: vanity row in breakdown");
  assert.equal(vanityRow!.isVanity, true, "PDF-DM-VANITY-1: vanity row isVanity");
  assert.equal(vanityRow!.fixedDisplayTotal, 265, "PDF-DM-VANITY-1: vanity fixedDisplayTotal = $265");
  assert.equal(vanityRow!.customerNote, "", "PDF-DM-VANITY-1: vanity customerNote defaults to empty string");
}

// PDF-SOURCE-1: no default seeded project notes in InternalEstimateApp
{
  const appSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/InternalEstimateApp.tsx"), "utf8");
  assert.doesNotMatch(appSrc, /Sink accessories not included/, "PDF-SOURCE-1: no default seeded project notes in app");
  assert.doesNotMatch(appSrc, /Laminate must be removed/, "PDF-SOURCE-1: no prefill project notes in app");
}

// PDF-SOURCE-2: InternalEstimateApp passes new params to buildCustomerEstimateDisplayModel
{
  const appSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/InternalEstimateApp.tsx"), "utf8");
  assert.match(appSrc, /preparedBy.*enteredBy/, "PDF-SOURCE-2: preparedBy wired from enteredBy");
  assert.match(appSrc, /comparisonRows.*customerEstimateComparisonRows/, "PDF-SOURCE-2: comparisonRows passed to display model");
  assert.match(appSrc, /projectUseTaxPercent/, "PDF-SOURCE-2: projectUseTaxPercent passed to display model");
}

// PDF-SOURCE-3: CustomerEstimatePrint no longer accepts removed props
{
  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  assert.doesNotMatch(printSrc, /measuredRooms.*MeasuredRoom/, "PDF-SOURCE-3: measuredRooms prop removed from CustomerEstimatePrint");
  assert.doesNotMatch(printSrc, /selectedBreakdown.*SelectedMaterialBreakdown/, "PDF-SOURCE-3: selectedBreakdown prop removed from CustomerEstimatePrint");
}

// PDF-SOURCE-4: CustomerRoomAreaCostRow has customerNote field
{
  const mathSrc = readFileSync(join(repoRoot, "app-quote/src/lib/prototypeQuoteMath.ts"), "utf8");
  assert.match(mathSrc, /customerNote.*string/, "PDF-SOURCE-4: customerNote: string field on CustomerRoomAreaCostRow");
}

// PDF-SOURCE-5: RoomScopeBuilder has customer-facing notes field
{
  const uiSrc = readFileSync(join(repoRoot, "app-quote/src/ui/RoomScopeBuilder.tsx"), "utf8");
  assert.match(uiSrc, /Customer-facing room notes/, "PDF-SOURCE-5: Customer-facing room notes label in RoomScopeBuilder");
  assert.match(uiSrc, /customerNote/, "PDF-SOURCE-5: customerNote field updated in RoomScopeBuilder");
  assert.match(uiSrc, /Prints under this room/, "PDF-SOURCE-5: helper copy for customer-facing notes field");
}

// CUSTOM-SINK-DEDUP-1: customer-facing custom sink appears exactly once in Estimate Summary
// Regression for: same custom line appearing both as "Name · ROOM" (from customerFixtureDetailLines)
// and as "Name (ROOM)" (from visibleCustomerLines), producing a visual duplicate on the customer PDF.
{
  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "KITCHEN";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 57, splash: 0 };
  kitchen.addons["qty-sink"] = 1; // catalog sink cutout

  const { rooms: measured } = calculateAllRoomDrafts([kitchen], "New Construction", "wholesale", 0);
  const selectedBd = buildSelectedMaterialBreakdown([kitchen], "wholesale");
  const roomBd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [kitchen],
    measuredRooms: measured,
    materialBasis: "wholesale",
    customLines: [
      {
        lineKey: "blanco-sink-kitchen",
        name: "BLANCO White Double Bowl",
        quantity: 1,
        unitPrice: 1500,
        customerFacing: true,
        roomName: "KITCHEN",
        roomId: kitchen.id,
        category: "Sink"
      }
    ]
  });

  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [
      {
        lineKey: "blanco-sink-kitchen",
        name: "BLANCO White Double Bowl",
        description: 'Blanco IKON 33" Apron Front Sink - White 402324',
        qty: 1,
        roomName: "KITCHEN",
        lineTotal: 1500
      }
    ],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: roomBd
  });

  const sinkRows = displayModel.estimateSummaryRows.filter((r) => r.label.includes("BLANCO White Double Bowl"));
  assert.equal(sinkRows.length, 1, "CUSTOM-SINK-DEDUP-1: custom sink appears exactly once in estimateSummaryRows");

  const summarySum = displayModel.estimateSummaryRows.reduce((s, r) => s + r.displayAmount, 0);
  assert.equal(summarySum, displayModel.finalRounded, "CUSTOM-SINK-DEDUP-1: no double-count — summary rows sum to finalRounded");

  // Room area totals must reconcile (sink counted once in total)
  const roomAreaSum =
    displayModel.roomAreaPrintRows.reduce((s, r) => s + r.displayedAreaTotal, 0) +
    displayModel.unassignedDisplayTotal;
  assert.equal(roomAreaSum, displayModel.finalRounded, "CUSTOM-SINK-DEDUP-1: room area totals reconcile to finalRounded");
}

// CUSTOM-SINK-DEDUP-2: internal-only custom line does not appear as a named summary row
{
  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "KITCHEN";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 40, splash: 0 };

  const { rooms: measured } = calculateAllRoomDrafts([kitchen], "New Construction", "wholesale", 0);
  const selectedBd = buildSelectedMaterialBreakdown([kitchen], "wholesale");
  const roomBd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [kitchen],
    measuredRooms: measured,
    materialBasis: "wholesale",
    customLines: [
      {
        lineKey: "internal-fee",
        name: "Internal handling fee",
        quantity: 1,
        unitPrice: 150,
        customerFacing: false,
        roomName: "KITCHEN",
        roomId: kitchen.id,
        category: "Fee"
      }
    ]
  });

  // Internal-only lines do not reach visibleCustomerLines
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [], // internal-only lines are excluded by splitInternalEstimateCustomLines
    internalMaterialFoldDollars: 150,
    roomAreaBreakdown: roomBd
  });

  const namedRows = displayModel.estimateSummaryRows.filter(
    (r) => !["countertop", "backsplash", "addons", "edge_upgrades"].includes(r.key) && !r.key.startsWith("addon-")
  );
  assert.equal(namedRows.length, 0, "CUSTOM-SINK-DEDUP-2: no named summary row for internal-only line");
  assert.equal(displayModel.finalRounded, displayModel.summaryCounterDisplay + displayModel.summaryBacksplashDisplay, "CUSTOM-SINK-DEDUP-2: finalRounded has no extra line total (internal fold absorbed into material)");
}

// CUSTOM-SINK-DEDUP-3: two genuinely distinct customer-facing custom lines both appear exactly once
{
  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "KITCHEN";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 40, splash: 0 };

  const { rooms: measured } = calculateAllRoomDrafts([kitchen], "New Construction", "wholesale", 0);
  const selectedBd = buildSelectedMaterialBreakdown([kitchen], "wholesale");
  const roomBd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [kitchen],
    measuredRooms: measured,
    materialBasis: "wholesale",
    customLines: [
      {
        lineKey: "sink-a",
        name: "BLANCO White Double Bowl",
        quantity: 1,
        unitPrice: 1500,
        customerFacing: true,
        roomName: "KITCHEN",
        roomId: kitchen.id,
        category: "Sink"
      },
      {
        lineKey: "faucet-b",
        name: "Delta Pull-Down Faucet",
        quantity: 1,
        unitPrice: 350,
        customerFacing: true,
        roomName: "KITCHEN",
        roomId: kitchen.id,
        category: "Fixture"
      }
    ]
  });

  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [
      {
        lineKey: "sink-a",
        name: "BLANCO White Double Bowl",
        description: "Apron Front Sink",
        qty: 1,
        roomName: "KITCHEN",
        lineTotal: 1500
      },
      {
        lineKey: "faucet-b",
        name: "Delta Pull-Down Faucet",
        description: "",
        qty: 1,
        roomName: "KITCHEN",
        lineTotal: 350
      }
    ],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: roomBd
  });

  const sinkRow = displayModel.estimateSummaryRows.find((r) => r.key === "sink-a");
  const faucetRow = displayModel.estimateSummaryRows.find((r) => r.key === "faucet-b");
  assert.ok(sinkRow != null, "CUSTOM-SINK-DEDUP-3: sink-a row present");
  assert.ok(faucetRow != null, "CUSTOM-SINK-DEDUP-3: faucet-b row present");

  const sinkOccurrences = displayModel.estimateSummaryRows.filter((r) => r.label.includes("BLANCO White Double Bowl")).length;
  const faucetOccurrences = displayModel.estimateSummaryRows.filter((r) => r.label.includes("Delta Pull-Down Faucet")).length;
  assert.equal(sinkOccurrences, 1, "CUSTOM-SINK-DEDUP-3: BLANCO sink appears exactly once");
  assert.equal(faucetOccurrences, 1, "CUSTOM-SINK-DEDUP-3: Delta faucet appears exactly once");

  const summarySum = displayModel.estimateSummaryRows.reduce((s, r) => s + r.displayAmount, 0);
  assert.equal(summarySum, displayModel.finalRounded, "CUSTOM-SINK-DEDUP-3: summary rows sum to finalRounded");
}

// CUSTOM-SINK-DEDUP-4: room separator in customer line summary label uses · not ()
{
  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 40, splash: 0 };

  const { rooms: measured } = calculateAllRoomDrafts([kitchen], "New Construction", "wholesale", 0);
  const selectedBd = buildSelectedMaterialBreakdown([kitchen], "wholesale");
  const roomBd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [kitchen],
    measuredRooms: measured,
    materialBasis: "wholesale",
    customLines: []
  });

  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [
      {
        lineKey: "blanco-sink",
        name: "BLANCO Sink",
        description: "Apron Front",
        qty: 1,
        roomName: "Kitchen",
        lineTotal: 1200
      }
    ],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: roomBd
  });

  const sinkRow = displayModel.estimateSummaryRows.find((r) => r.key === "blanco-sink");
  assert.ok(sinkRow != null, "CUSTOM-SINK-DEDUP-4: blanco-sink row found");
  assert.ok(
    sinkRow!.label.includes(" · Kitchen"),
    `CUSTOM-SINK-DEDUP-4: label uses '· ROOM' format, got: ${sinkRow!.label}`
  );
  assert.ok(
    !sinkRow!.label.includes("(Kitchen)"),
    `CUSTOM-SINK-DEDUP-4: label must NOT use '(ROOM)' format, got: ${sinkRow!.label}`
  );
}

console.log("verify-internal-estimate-beta-fixes: OK");
