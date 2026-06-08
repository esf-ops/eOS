/**
 * Regression checks for Internal Estimate beta fixes.
 * Run: npx --yes tsx --tsconfig app-internal-estimate/tsconfig.json scripts/verify-internal-estimate-beta-fixes.ts
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
  chargeableSplashSqftFromExact,
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
  STANDARD_EDGE_PROFILES,
  UPGRADED_EDGE_PREVIEW_RATE_PER_LF,
  UPGRADED_EDGE_PROFILES
} from "../app-quote/src/lib/prototypeQuoteMath.ts";
import { parseCustomerFacingNoteLines } from "../app-internal-estimate/src/lib/customerFacingNotes.ts";
import { buildCustomerEstimateDisplayModel } from "../app-internal-estimate/src/lib/customerEstimateDisplayModel.ts";
import { formatPreparedByDisplayName } from "../app-internal-estimate/src/lib/formatPreparedByName.ts";
import { roundCustomerDisplay } from "../app-quote/src/lib/customerDisplayRounding.ts";
import { splitInternalEstimateCustomLines } from "../app-internal-estimate/src/lib/internalEstimateCustomLines.ts";

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

  // roundCustomerDisplay must use ceil-to-$5 for positive (not nearest-$5 Math.round)
  const roundingSrc = readFileSync(join(repoRoot, "app-quote/src/lib/customerDisplayRounding.ts"), "utf8");
  assert.match(roundingSrc, /Math\.ceil\(n \/ 5\) \* 5/, "roundCustomerDisplay must use Math.ceil for ceiling-to-$5");
  assert.doesNotMatch(roundingSrc, /Math\.round\(n \/ 5\) \* 5/, "roundCustomerDisplay must not use old nearest-$5 Math.round");
  assert.doesNotMatch(roundingSrc, /Math\.ceil\(n \/ 10\) \* 10/, "roundCustomerDisplay must not be nearest-$10 ceil");

  // CustomerEstimatePrint must NOT mention rounding to the customer
  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  assert.doesNotMatch(printSrc, /nearest \$5/, "CustomerEstimatePrint must not mention 'nearest $5' rounding");
  assert.doesNotMatch(printSrc, /nearest \$10/, "CustomerEstimatePrint must not have old nearest-$10 copy");
  assert.match(printSrc, /Estimate only/, "CustomerEstimatePrint must retain Estimate only disclaimer");
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

  // No rounding language on customer-facing PDF; only legal disclaimer
  assert.doesNotMatch(printSrc, /nearest \$5/, "PDF-STRUCT-1: no 'nearest $5' rounding language on customer PDF");
  assert.doesNotMatch(printSrc, /nearest \$10/, "PDF-STRUCT-1: no nearest $10 copy");
  assert.match(printSrc, /Estimate only/, "PDF-STRUCT-1: legal disclaimer retained");
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

// ── BACKSPLASH-CEIL-1: chargeableSplashSqftFromExact rounds up correctly ─────
{
  assert.strictEqual(chargeableSplashSqftFromExact(7), 7, "BACKSPLASH-CEIL-1: whole SF unchanged");
  assert.strictEqual(chargeableSplashSqftFromExact(2.944), 3, "BACKSPLASH-CEIL-1: 2.944 → 3");
  assert.strictEqual(chargeableSplashSqftFromExact(6.01), 7, "BACKSPLASH-CEIL-1: 6.01 → 7");
  assert.strictEqual(chargeableSplashSqftFromExact(0.1), 1, "BACKSPLASH-CEIL-1: 0.1 → 1");
}

// ── BACKSPLASH-CEIL-2: buildSelectedMaterialBreakdown applies backsplash ceil ─
// Uses Manual Sq Ft with a fractional backsplash SF to confirm applyChargeableSplashCeilToRoomRows
// is wired in and adds the delta to the priced total.
{
  const room = createDefaultRoom("Group Promo");
  room.name = "Kitchen";
  room.calcMode = "Manual Sq Ft";
  // Counter 19 sf (whole), backsplash 2.94 sf (fractional → should ceil to 3 sf)
  room.direct = { counter: 19, splash: 2.94 };

  const bd = buildSelectedMaterialBreakdown([room], "wholesale", {
    chargeableCounterCeil: true
  });
  // At Group Promo $45/sf: 3 sf × $45 = $135
  const bsDollars = bd.totals.backsplashMaterial;
  assert.ok(
    bsDollars >= 135,
    `BACKSPLASH-CEIL-2: backsplash priced at ≥ $135 (3 sf × $45), got ${bsDollars}`
  );
  const totalBsSf = bd.groups.reduce((s, g) => s + g.backsplashSf, 0);
  assert.ok(
    totalBsSf >= 3,
    `BACKSPLASH-CEIL-2: backsplash SF ≥ 3 after ceil, got ${totalBsSf}`
  );
}

// ── EDGE-CLEANUP-1: Large Eased is standard, Bullnose gone, Dupont gone ──────
{
  assert.ok(
    (STANDARD_EDGE_PROFILES as readonly string[]).includes("Large Eased"),
    "EDGE-CLEANUP-1: Large Eased in STANDARD_EDGE_PROFILES"
  );
  assert.ok(
    !(STANDARD_EDGE_PROFILES as readonly string[]).includes("Bullnose"),
    "EDGE-CLEANUP-1: Bullnose removed from STANDARD_EDGE_PROFILES"
  );
  assert.ok(
    (UPGRADED_EDGE_PROFILES as readonly string[]).includes("Full Bullnose"),
    "EDGE-CLEANUP-1: Full Bullnose remains in UPGRADED_EDGE_PROFILES"
  );
  assert.ok(
    !(UPGRADED_EDGE_PROFILES as readonly string[]).includes("Dupont"),
    "EDGE-CLEANUP-1: Dupont removed from selectable UPGRADED_EDGE_PROFILES"
  );
}

// ── EDGE-CLEANUP-2: Large Eased not charged as upgraded edge ────────────────
{
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 20, splash: 0 };
  room.edgeProfile = "Large Eased";
  room.upgradedEdgeLf = 10;
  const { total } = computeLocalUpgradedEdgeTotal([room]);
  assert.strictEqual(total, 0, "EDGE-CLEANUP-2: Large Eased is standard — no edge charge");
}

// ── MANUAL-SF-1: manual countertop SF priced correctly at Group Promo rate ───
{
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 20, splash: 0 };
  const bd = buildSelectedMaterialBreakdown([room], "wholesale", { chargeableCounterCeil: true });
  // 20 sf (whole) × $45/sf = $900
  assert.strictEqual(bd.totals.countertopMaterial, 900, "MANUAL-SF-1: 20 sf × $45 = $900");
  assert.strictEqual(bd.totals.backsplashMaterial, 0, "MANUAL-SF-1: no backsplash entered");
}

// ── MANUAL-SF-2: manual counter SF fraction ceiled for pricing ────────────────
{
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 19.3, splash: 0 };
  const bd = buildSelectedMaterialBreakdown([room], "wholesale", { chargeableCounterCeil: true });
  // 19.3 → ceil 20 sf × $45 = $900
  assert.strictEqual(bd.totals.countertopMaterial, 900, "MANUAL-SF-2: 19.3 sf ceiled to 20 → $900");
}

// ── MANUAL-SF-3: manual backsplash SF fraction ceiled for pricing ─────────────
{
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 20, splash: 2.94 };
  const bd = buildSelectedMaterialBreakdown([room], "wholesale", { chargeableCounterCeil: true });
  // 2.94 → ceil 3 sf × $45 = $135
  assert.ok(bd.totals.backsplashMaterial >= 135, `MANUAL-SF-3: splash ceiled to 3 sf → ≥$135, got ${bd.totals.backsplashMaterial}`);
}

// ── MANUAL-SF-4: manual room add-ons save and calculate ─────────────────────
{
  const room = createDefaultRoom("Group Promo");
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 15, splash: 0 };
  room.addons["qty-sink"] = 2;
  const { totals } = calculateAllRoomDrafts([room], "New Construction", "wholesale", 0, INTERNAL_ESTIMATE_MEASURE_OPTIONS);
  // 2 sink cutouts × $200 = $400
  assert.ok(totals.fixed >= 400, `MANUAL-SF-4: 2 sink cutouts → fixed ≥ $400, got ${totals.fixed}`);
}

// ── MANUAL-SF-5: manual room save / restore preserves direct SF ──────────────
{
  const room = createDefaultRoom("Group Promo");
  room.name = "Bathroom";
  room.calcMode = "Manual Sq Ft";
  room.direct = { counter: 12.5, splash: 1.75 };

  const serialized = serializeRoomDraftsForInternalUi([room]);
  const restored = hydrateRoomDraftsFromInternalUi(serialized);

  assert.strictEqual(restored.length, 1, "MANUAL-SF-5: one room restored");
  assert.strictEqual(restored[0].calcMode, "Manual Sq Ft", "MANUAL-SF-5: calcMode preserved");
  assert.strictEqual(restored[0].direct?.counter, 12.5, "MANUAL-SF-5: counter SF preserved");
  assert.strictEqual(restored[0].direct?.splash, 1.75, "MANUAL-SF-5: splash SF preserved");
}

// ── MANUAL-SF-6: guided shape rooms not affected by manual SF restore ─────────
{
  const guided = createEstimatorRoom("Group Promo");
  guided.name = "Kitchen";
  const withGroup = appendGuidedShapeGroup(guided, "straight");
  if (withGroup.guidedShapeGroups?.[0]) {
    withGroup.guidedShapeGroups[0].pieces[0].lengthIn = 120;
    withGroup.guidedShapeGroups[0].pieces[0].depthIn = 25.5;
    withGroup.guidedShapeGroups[0].pieces[0].addSplash = true;
  }
  const serialized = serializeRoomDraftsForInternalUi([withGroup]);
  const restored = hydrateRoomDraftsFromInternalUi(serialized);
  assert.strictEqual(restored[0].calcMode, "Guided Shape", "MANUAL-SF-6: guided room still Guided Shape after serialize/restore");
  assert.ok((restored[0].guidedShapeGroups?.length ?? 0) > 0, "MANUAL-SF-6: guided groups preserved");
}

// ── CEIL-ROUND-1: roundCustomerDisplay uses ceil-to-$5 for positive amounts ───
{
  // $342.00: nearest-$5 = $340, ceil-to-$5 = $345
  assert.strictEqual(roundCustomerDisplay(342), 345, "CEIL-ROUND-1a: 342 → 345 (ceil)");
  // $3531.15: nearest-$5 = $3530, ceil-to-$5 = $3535
  assert.strictEqual(roundCustomerDisplay(3531.15), 3535, "CEIL-ROUND-1b: 3531.15 → 3535 (ceil)");
  // Exact $5 multiples unchanged
  assert.strictEqual(roundCustomerDisplay(200), 200, "CEIL-ROUND-1c: 200 → 200 (exact)");
  assert.strictEqual(roundCustomerDisplay(1500), 1500, "CEIL-ROUND-1d: 1500 → 1500 (exact)");
  // Zero
  assert.strictEqual(roundCustomerDisplay(0), 0, "CEIL-ROUND-1e: 0 → 0");
}

// ── CEIL-ROUND-2: negative credits preserved exactly (not rounded) ────────────
{
  assert.strictEqual(roundCustomerDisplay(-25), -25, "CEIL-ROUND-2a: -25 → -25 (exact)");
  assert.strictEqual(roundCustomerDisplay(-5000), -5000, "CEIL-ROUND-2b: -5000 → -5000 (exact)");
  assert.strictEqual(roundCustomerDisplay(-123.45), -123.45, "CEIL-ROUND-2c: -123.45 preserved exactly");
}

// ── DISCOUNT-DISPLAY-1: customer-facing Discount/Credit appears in Estimate Summary ──
{
  // Build a display model with a customer-facing discount line
  const emptyBreakdown = buildSelectedMaterialBreakdown([], "wholesale");
  const discountLine = {
    lineKey: "disc-display-1",
    name: "Discount / Credit",
    description: "No second bowl",
    qty: 1,
    unitPrice: -25,
    lineTotal: -25,
    roomName: ""
  };
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: emptyBreakdown,
    measuredRooms: [],
    visibleCustomerLines: [discountLine],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: null
  });
  // Discount row appears in estimateSummaryRows
  const discRow = displayModel.estimateSummaryRows.find((r: any) => r.key === "disc-display-1");
  assert.ok(discRow != null, "DISCOUNT-DISPLAY-1a: discount row present in estimateSummaryRows");
  assert.strictEqual(discRow.displayAmount, -25, "DISCOUNT-DISPLAY-1b: discount amount = -$25 exactly");
  // finalRounded = 0 (no material) + (-25) = -25
  assert.strictEqual(displayModel.finalRounded, -25, "DISCOUNT-DISPLAY-1c: finalRounded reduced by $25");
  // Summary rows sum to finalRounded
  const summarySum = displayModel.estimateSummaryRows.reduce((s: number, r: any) => s + r.displayAmount, 0);
  assert.strictEqual(summarySum, displayModel.finalRounded, "DISCOUNT-DISPLAY-1d: summary rows sum to finalRounded");
}

// ── DISCOUNT-DISPLAY-2: placeholder description not printed as customer label ──
{
  const oldInstructionalText = "Enter the credit amount — always applied as a reduction.";
  const discountLineWithPlaceholder = {
    lineKey: "disc-old",
    name: "Discount / Credit",
    description: oldInstructionalText, // old saved-quote text, should be suppressed
    qty: 1,
    unitPrice: -100,
    lineTotal: -100,
    roomName: ""
  };
  const emptyBreakdown = buildSelectedMaterialBreakdown([], "wholesale");
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: emptyBreakdown,
    measuredRooms: [],
    visibleCustomerLines: [discountLineWithPlaceholder],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: null
  });
  const discRow = displayModel.estimateSummaryRows.find((r: any) => r.key === "disc-old");
  assert.ok(discRow != null, "DISCOUNT-DISPLAY-2a: discount row present");
  // Label must be "Discount / Credit" — NOT "Discount / Credit — Enter the credit amount..."
  assert.strictEqual(discRow.label, "Discount / Credit", "DISCOUNT-DISPLAY-2b: placeholder description suppressed from label");
}

// ── DISCOUNT-DISPLAY-3: real customer note prints in label ─────────────────────
{
  const discountWithNote = {
    lineKey: "disc-note",
    name: "Discount / Credit",
    description: "No second bowl in basement bath",
    qty: 1,
    unitPrice: -25,
    lineTotal: -25,
    roomName: ""
  };
  const emptyBreakdown = buildSelectedMaterialBreakdown([], "wholesale");
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: emptyBreakdown,
    measuredRooms: [],
    visibleCustomerLines: [discountWithNote],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: null
  });
  const discRow = displayModel.estimateSummaryRows.find((r: any) => r.key === "disc-note");
  assert.ok(discRow != null, "DISCOUNT-DISPLAY-3a: discount row present");
  assert.strictEqual(
    discRow.label,
    "Discount / Credit — No second bowl in basement bath",
    "DISCOUNT-DISPLAY-3b: real customer note printed in label"
  );
}

// ── DISCOUNT-DISPLAY-4: customLineAmountFromInput auto-negates positive Discount/Credit ──
{
  // Verify the room breakdown correctly treats positive unitPrice as a credit
  const emptyBreakdown = buildSelectedMaterialBreakdown([], "wholesale");
  const roomBreakdown = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [],
    measuredRooms: [],
    materialBasis: "wholesale",
    customLines: [
      {
        lineKey: "disc-pos",
        name: "Discount / Credit",
        quantity: 1,
        unitPrice: 100, // positive entry — should be auto-negated to -$100
        customerFacing: true,
        roomName: "",
        category: "Discount/Credit"
      }
    ]
  });
  // unassignedCustomerCustomExact should be -100 (auto-negated), not +100
  assert.strictEqual(
    roomBreakdown.unassignedCustomerCustomExact,
    -100,
    "DISCOUNT-DISPLAY-4: positive unitPrice in Discount/Credit auto-negated in room breakdown"
  );
}

// ── PDF-NO-ROUNDING-LANGUAGE: customer-facing PDF must not mention rounding ───
{
  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  assert.ok(!printSrc.includes("nearest $5"), "PDF-ROUNDING-LANG-1: no 'nearest $5' text in PDF");
  assert.ok(!printSrc.includes("rounded lines"), "PDF-ROUNDING-LANG-2: no 'rounded lines' text in PDF");
  assert.ok(printSrc.includes("Estimate only"), "PDF-ROUNDING-LANG-3: legal disclaimer retained");

  const roundingSrc = readFileSync(join(repoRoot, "app-quote/src/lib/customerDisplayRounding.ts"), "utf8");
  assert.ok(roundingSrc.includes("Math.ceil(n / 5) * 5"), "PDF-ROUNDING-LANG-4: customerDisplayRounding uses Math.ceil");
  assert.ok(!roundingSrc.includes("Math.round(n / 5) * 5"), "PDF-ROUNDING-LANG-5: no old Math.round nearest-$5");
}

// ── ROOM-COMP-1: Per-room comparison selection — Room A (Promo+B), Room B (Promo), Room C (none) ──
{
  const roomA = createDefaultRoom("Group Promo");
  roomA.name = "Kitchen";
  roomA.calcMode = "Manual Sq Ft";
  roomA.direct = { counter: 40, splash: 8 };
  roomA.customerComparisonGroups = ["Group Promo", "Group B"];

  const roomB = createDefaultRoom("Group Promo");
  roomB.name = "Primary Bath";
  roomB.calcMode = "Manual Sq Ft";
  roomB.direct = { counter: 12, splash: 4 };
  roomB.customerComparisonGroups = ["Group Promo"];

  const roomC = createDefaultRoom("Group C");
  roomC.name = "Pantry";
  roomC.calcMode = "Manual Sq Ft";
  roomC.direct = { counter: 8, splash: 0 };
  // no customerComparisonGroups → excluded from comparison

  const drafts = [roomA, roomB, roomC];
  const { rooms: measured } = calculateAllRoomDrafts(drafts, "New Construction", "wholesale", 0);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: drafts,
    measuredRooms: measured,
    materialBasis: "wholesale"
  });

  // customerComparisonGroups carried through to CustomerRoomAreaCostRow
  assert.deepEqual(bd.rooms.find((r) => r.roomName === "Kitchen")?.customerComparisonGroups, ["Group Promo", "Group B"], "ROOM-COMP-1: Kitchen row carries customerComparisonGroups");
  assert.deepEqual(bd.rooms.find((r) => r.roomName === "Primary Bath")?.customerComparisonGroups, ["Group Promo"], "ROOM-COMP-1: Bath row carries customerComparisonGroups");
  assert.equal(bd.rooms.find((r) => r.roomName === "Pantry")?.customerComparisonGroups, undefined, "ROOM-COMP-1: Pantry row has no customerComparisonGroups");

  const allGroupRates = buildInternalEstimateGroupComparison({
    countertopSqft: 60,
    backsplashSqft: 12,
    roomFixedDollars: 0,
    customLineDollars: 0,
    basis: "wholesale"
  });
  const selectedBd = buildSelectedMaterialBreakdown(drafts, "wholesale");
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: bd,
    allGroupComparisonRates: allGroupRates
  });

  const ct = displayModel.roomComparisonTable;
  assert.ok(ct != null, "ROOM-COMP-1: comparison table built");
  assert.equal(ct!.isPerRoomMode, true, "ROOM-COMP-1: per-room mode detected");

  // Only Kitchen and Bath appear in comparison (Pantry excluded)
  assert.equal(ct!.roomRows.length, 2, "ROOM-COMP-1: 2 rooms in comparison (Pantry excluded)");
  assert.ok(ct!.roomRows.some((r) => r.roomDisplayName === "Kitchen"), "ROOM-COMP-1: Kitchen in comparison");
  assert.ok(ct!.roomRows.some((r) => r.roomDisplayName === "Primary Bath"), "ROOM-COMP-1: Bath in comparison");
  assert.ok(!ct!.roomRows.some((r) => r.roomDisplayName === "Pantry"), "ROOM-COMP-1: Pantry NOT in comparison");

  // Selected groups = union = Promo + B
  const groupNames = ct!.selectedGroups.map((g) => g.group);
  assert.ok(groupNames.includes("Group Promo"), "ROOM-COMP-1: Group Promo in selectedGroups");
  assert.ok(groupNames.includes("Group B"), "ROOM-COMP-1: Group B in selectedGroups");

  // Kitchen has both Promo and B; Bath has only Promo
  const kitchenRow = ct!.roomRows.find((r) => r.roomDisplayName === "Kitchen");
  const bathRow = ct!.roomRows.find((r) => r.roomDisplayName === "Primary Bath");
  assert.ok((kitchenRow!.groupDisplayTotals["Group Promo"] ?? 0) > 0, "ROOM-COMP-1: Kitchen has Promo display total");
  assert.ok((kitchenRow!.groupDisplayTotals["Group B"] ?? 0) > 0, "ROOM-COMP-1: Kitchen has Group B display total");
  assert.ok((bathRow!.groupDisplayTotals["Group Promo"] ?? 0) > 0, "ROOM-COMP-1: Bath has Promo display total");
  assert.equal(bathRow!.groupDisplayTotals["Group B"], undefined, "ROOM-COMP-1: Bath does NOT have Group B display total");

  // Bath activeGroups does NOT include Group B (so cell renders as em dash)
  assert.deepEqual(bathRow!.activeGroups, ["Group Promo"], "ROOM-COMP-1: Bath activeGroups = [Promo]");

  // Project totals: Group B includes only Kitchen
  const projPromo = ct!.projectDisplayTotals["Group Promo"] ?? 0;
  const projB = ct!.projectDisplayTotals["Group B"] ?? 0;
  assert.ok(projPromo > 0, "ROOM-COMP-1: project Promo total > 0");
  assert.ok(projB > 0, "ROOM-COMP-1: project Group B total > 0");
  // Group B total should equal Kitchen-only Group B (not Kitchen+Bath)
  approx(projB, kitchenRow!.groupDisplayTotals["Group B"] ?? 0, 1);
}

// ── ROOM-COMP-2: Hosch-style — only Lower Bar has Promo+F ────────────────────
{
  const kitchen = createDefaultRoom("Group A");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 45, splash: 10 };
  // no customerComparisonGroups

  const pantry = createDefaultRoom("Group A");
  pantry.name = "Pantry";
  pantry.calcMode = "Manual Sq Ft";
  pantry.direct = { counter: 12, splash: 0 };
  // no customerComparisonGroups

  const primaryBath = createDefaultRoom("Group C");
  primaryBath.name = "Primary Bath (Double)";
  primaryBath.calcMode = "Manual Sq Ft";
  primaryBath.direct = { counter: 28, splash: 6 };
  // no customerComparisonGroups

  const lowerBar = createDefaultRoom("Group Promo");
  lowerBar.name = "Bar (Lower Level)";
  lowerBar.calcMode = "Manual Sq Ft";
  lowerBar.direct = { counter: 15, splash: 3 };
  lowerBar.customerComparisonGroups = ["Group Promo", "Group F"];

  const drafts = [kitchen, pantry, primaryBath, lowerBar];
  const { rooms: measured } = calculateAllRoomDrafts(drafts, "Kitchen", "wholesale", 0);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: drafts,
    measuredRooms: measured,
    materialBasis: "wholesale"
  });

  const allGroupRates = buildInternalEstimateGroupComparison({
    countertopSqft: 100,
    backsplashSqft: 19,
    roomFixedDollars: 0,
    customLineDollars: 0,
    basis: "wholesale"
  });
  const selectedBd = buildSelectedMaterialBreakdown(drafts, "wholesale");
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: bd,
    allGroupComparisonRates: allGroupRates
  });

  const ct = displayModel.roomComparisonTable;
  assert.ok(ct != null, "ROOM-COMP-2 (Hosch): comparison table built");
  assert.equal(ct!.isPerRoomMode, true, "ROOM-COMP-2 (Hosch): per-room mode");

  // Only Lower Bar appears
  assert.equal(ct!.roomRows.length, 1, "ROOM-COMP-2 (Hosch): exactly 1 room in comparison (Lower Bar only)");
  assert.equal(ct!.roomRows[0]!.roomDisplayName, "Bar (Lower Level)", "ROOM-COMP-2 (Hosch): Lower Bar in comparison");

  // Group F column present but NOT for Kitchen/Pantry/Bath (they are not in rowRows)
  const groupNames = ct!.selectedGroups.map((g) => g.group);
  assert.ok(groupNames.includes("Group Promo"), "ROOM-COMP-2 (Hosch): Promo in selected groups");
  assert.ok(groupNames.includes("Group F"), "ROOM-COMP-2 (Hosch): Group F in selected groups");

  // Group F project total = only Lower Bar's Group F value (no other rooms contribute)
  const lowerBarRow = ct!.roomRows[0]!;
  const projF = ct!.projectDisplayTotals["Group F"] ?? 0;
  approx(projF, lowerBarRow.groupDisplayTotals["Group F"] ?? 0, 1);

  // Kitchen, Pantry, Primary Bath not in comparison rows at all
  assert.ok(!ct!.roomRows.some((r) => r.roomDisplayName === "Kitchen"), "ROOM-COMP-2 (Hosch): Kitchen NOT in comparison");
  assert.ok(!ct!.roomRows.some((r) => r.roomDisplayName === "Pantry"), "ROOM-COMP-2 (Hosch): Pantry NOT in comparison");
  assert.ok(!ct!.roomRows.some((r) => r.roomDisplayName.includes("Bath")), "ROOM-COMP-2 (Hosch): Bath NOT in comparison");
}

// ── ROOM-COMP-3: No rooms with customerComparisonGroups → no comparison table ──
{
  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 40, splash: 8 };

  const { rooms: measured } = calculateAllRoomDrafts([kitchen], "New Construction", "wholesale", 0);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: [kitchen],
    measuredRooms: measured,
    materialBasis: "wholesale"
  });

  const allGroupRates = buildInternalEstimateGroupComparison({
    countertopSqft: 40,
    backsplashSqft: 8,
    roomFixedDollars: 0,
    customLineDollars: 0,
    basis: "wholesale"
  });
  const selectedBd = buildSelectedMaterialBreakdown([kitchen], "wholesale");
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: bd,
    allGroupComparisonRates: allGroupRates
    // No comparisonRows (global) either
  });

  assert.equal(displayModel.roomComparisonTable, null, "ROOM-COMP-3: no comparison table when no rooms and no global selection");
}

// ── ROOM-COMP-4: Legacy global fallback — comparisonRows without per-room groups ──
{
  const kitchen = createDefaultRoom("Group Promo");
  kitchen.name = "Kitchen";
  kitchen.calcMode = "Manual Sq Ft";
  kitchen.direct = { counter: 40, splash: 8 };
  // No customerComparisonGroups on room (legacy behavior)

  const bath = createDefaultRoom("Group Promo");
  bath.name = "Bath";
  bath.calcMode = "Manual Sq Ft";
  bath.direct = { counter: 12, splash: 0 };

  const drafts = [kitchen, bath];
  const { rooms: measured } = calculateAllRoomDrafts(drafts, "New Construction", "wholesale", 0);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: drafts,
    measuredRooms: measured,
    materialBasis: "wholesale"
  });

  const allGroupRates = buildInternalEstimateGroupComparison({
    countertopSqft: 52,
    backsplashSqft: 8,
    roomFixedDollars: 0,
    customLineDollars: 0,
    basis: "wholesale"
  });

  // Simulate global selection of just Group Promo (legacy global mode)
  const globalComparisonRows = allGroupRates
    .filter((r) => r.group === "Group Promo")
    .map((r) => ({ ...r, comparisonColorLabel: undefined }));

  const selectedBd = buildSelectedMaterialBreakdown(drafts, "wholesale");
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: bd,
    comparisonRows: globalComparisonRows,
    allGroupComparisonRates: allGroupRates
  });

  const ct = displayModel.roomComparisonTable;
  assert.ok(ct != null, "ROOM-COMP-4: comparison table built in legacy global mode");
  assert.equal(ct!.isPerRoomMode, false, "ROOM-COMP-4: legacy global mode (not per-room)");
  assert.equal(ct!.roomRows.length, 2, "ROOM-COMP-4: both rooms shown in global mode");
  assert.ok(ct!.rowRows === undefined || ct!.roomRows.every((r) => !r.activeGroups), "ROOM-COMP-4: no activeGroups filter in global mode");
  assert.ok(ct!.roomRows.every((r) => (r.groupDisplayTotals["Group Promo"] ?? 0) > 0), "ROOM-COMP-4: all rooms have Promo total in global mode");
}

// ── ROOM-COMP-5: Comparison totals only sum rooms that include that group ────
{
  const roomX = createDefaultRoom("Group Promo");
  roomX.name = "Room X";
  roomX.calcMode = "Manual Sq Ft";
  roomX.direct = { counter: 20, splash: 0 };
  roomX.customerComparisonGroups = ["Group Promo", "Group F"];

  const roomY = createDefaultRoom("Group Promo");
  roomY.name = "Room Y";
  roomY.calcMode = "Manual Sq Ft";
  roomY.direct = { counter: 20, splash: 0 };
  roomY.customerComparisonGroups = ["Group Promo"]; // no Group F

  const drafts = [roomX, roomY];
  const { rooms: measured } = calculateAllRoomDrafts(drafts, "New Construction", "wholesale", 0);
  const bd = buildCustomerRoomAreaCostBreakdown({
    roomDrafts: drafts,
    measuredRooms: measured,
    materialBasis: "wholesale"
  });
  const allGroupRates = buildInternalEstimateGroupComparison({
    countertopSqft: 40,
    backsplashSqft: 0,
    roomFixedDollars: 0,
    customLineDollars: 0,
    basis: "wholesale"
  });
  const selectedBd = buildSelectedMaterialBreakdown(drafts, "wholesale");
  const displayModel = buildCustomerEstimateDisplayModel({
    selectedBreakdown: selectedBd,
    measuredRooms: measured,
    visibleCustomerLines: [],
    internalMaterialFoldDollars: 0,
    roomAreaBreakdown: bd,
    allGroupComparisonRates: allGroupRates
  });

  const ct = displayModel.roomComparisonTable;
  assert.ok(ct != null, "ROOM-COMP-5: comparison table built");
  assert.equal(ct!.isPerRoomMode, true, "ROOM-COMP-5: per-room mode");

  const rowX = ct!.roomRows.find((r) => r.roomDisplayName === "Room X")!;
  const rowY = ct!.roomRows.find((r) => r.roomDisplayName === "Room Y")!;

  // Project Group F total = Room X only (Room Y does not have Group F)
  const projF = ct!.projectDisplayTotals["Group F"] ?? 0;
  approx(projF, rowX.groupDisplayTotals["Group F"] ?? 0, 1);

  // Room Y Group F is absent (em-dash in print) — cell value should be undefined
  assert.equal(rowY.groupDisplayTotals["Group F"], undefined, "ROOM-COMP-5: Room Y has no Group F value");

  // Project Promo total = Room X + Room Y
  const projPromo = ct!.projectDisplayTotals["Group Promo"] ?? 0;
  const expectedPromo = (rowX.groupDisplayTotals["Group Promo"] ?? 0) + (rowY.groupDisplayTotals["Group Promo"] ?? 0);
  approx(projPromo, expectedPromo, 1);
}

// ── ROOM-COMP-6: Source checks — per-room comparison wired in InternalEstimateApp ──
{
  const appSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/InternalEstimateApp.tsx"), "utf8");
  // customerComparisonGroups/ColorLabels and the "Apply to all rooms" shortcut now live in the
  // extracted CompareGroupsAndNotesStep component; wiring still flows through InternalEstimateApp props.
  const compareStepSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/components/internal-estimate/CompareGroupsAndNotesStep.tsx"), "utf8");
  assert.match(compareStepSrc, /customerComparisonGroups/, "ROOM-COMP-6: CompareGroupsAndNotesStep references customerComparisonGroups");
  assert.match(compareStepSrc, /customerComparisonColorLabels/, "ROOM-COMP-6: CompareGroupsAndNotesStep references customerComparisonColorLabels");
  assert.match(appSrc, /allGroupComparisonRates/, "ROOM-COMP-6: allGroupComparisonRates passed to display model");
  assert.match(appSrc, /isPerRoomMode/, "ROOM-COMP-6: isPerRoomMode used in sticky panel");
  assert.match(compareStepSrc, /Apply to all rooms/, "ROOM-COMP-6: 'Apply to all rooms' global shortcut present");

  const dmSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/lib/customerEstimateDisplayModel.ts"), "utf8");
  assert.match(dmSrc, /isPerRoomMode/, "ROOM-COMP-6: display model exposes isPerRoomMode");
  assert.match(dmSrc, /allGroupComparisonRates/, "ROOM-COMP-6: display model accepts allGroupComparisonRates");
  assert.match(dmSrc, /perRoomMode/, "ROOM-COMP-6: per-room mode detection in display model");
  assert.match(dmSrc, /activeGroups/, "ROOM-COMP-6: activeGroups on CustomerPrintComparisonRoomRow");

  const printSrc = readFileSync(join(repoRoot, "app-internal-estimate/src/CustomerEstimatePrint.tsx"), "utf8");
  assert.match(printSrc, /isPerRoomMode/, "ROOM-COMP-6: CustomerEstimatePrint uses isPerRoomMode for heading");
  assert.match(printSrc, /Optional material comparison by room/, "ROOM-COMP-6: per-room heading copy present");
  assert.match(printSrc, /activeGroups/, "ROOM-COMP-6: activeGroups checked for em-dash rendering");
  assert.match(printSrc, /Subtotal \(shown rooms\)/, "ROOM-COMP-6: per-room footer label");

  const mathSrc = readFileSync(join(repoRoot, "app-quote/src/lib/prototypeQuoteMath.ts"), "utf8");
  assert.match(mathSrc, /customerComparisonGroups.*string\[\]/, "ROOM-COMP-6: CustomerRoomAreaCostRow.customerComparisonGroups typed");

  const quoteTypesSrc = readFileSync(join(repoRoot, "app-quote/src/lib/quoteTypes.ts"), "utf8");
  assert.match(quoteTypesSrc, /customerComparisonGroups/, "ROOM-COMP-6: RoomDraft.customerComparisonGroups field present");
}

console.log("verify-internal-estimate-beta-fixes: OK");
