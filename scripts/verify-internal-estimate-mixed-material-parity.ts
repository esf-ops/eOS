/**
 * Fast parity checks: measureRoomDraft scoped stone vs buildSelectedMaterialBreakdown,
 * tier overrides, custom line rollup, merged addOns keys.
 *
 * Run from repo root:
 *   npx --yes tsx scripts/verify-internal-estimate-mixed-material-parity.ts
 */

import assert from "node:assert/strict";
import {
  qualifyingSfFromRoomDrafts,
  STANDARD_BACKSPLASH_HEIGHT_IN
} from "../app-quote/src/lib/measurementEngine.ts";
import {
  buildSelectedMaterialBreakdown,
  createDefaultRoom,
  measureRoomDraft,
  mergeRoomDraftsIntoGlobalAddOns,
  newId,
  materialRateForInternalBasis,
  runLocalPrototypeQuote
} from "../app-quote/src/lib/prototypeQuoteMath.ts";

function approxEq(a: number, b: number, eps = 0.02): boolean {
  return Math.abs(a - b) <= eps;
}

// Case 1: Promo default + one piece Group F override — scoped stone in measureRoomDraft matches breakdown.
{
  const room = createDefaultRoom("Group Promo");
  room.name = "Kitchen";
  room.guidedPieces = [
    {
      id: newId(),
      pieceType: "counter",
      name: "Piece 1",
      lengthIn: 60,
      depthIn: 24,
      shape: "rect",
      addSplash: false
    },
    {
      id: newId(),
      pieceType: "counter",
      name: "Piece 2",
      lengthIn: 60,
      depthIn: 24,
      shape: "rect",
      addSplash: false,
      materialOverride: true,
      materialGroup: "Group F"
    }
  ];
  const qs = qualifyingSfFromRoomDrafts([room]);
  const m = measureRoomDraft(room, qs, "wholesale");
  const bd = buildSelectedMaterialBreakdown([room], "wholesale");
  const scopedFromMeasured = m.selected - m.extras;
  assert.ok(
    approxEq(scopedFromMeasured, bd.totals.materialSubtotal),
    `Case1 scoped stone: measured ${scopedFromMeasured} vs breakdown ${bd.totals.materialSubtotal}`
  );
}

// Case 2: Counter uses Group C; separate backsplash piece uses Group E.
{
  const room = createDefaultRoom("Group C");
  room.name = "Kitchen";
  room.guidedPieces = [
    {
      id: newId(),
      pieceType: "counter",
      name: "Countertop",
      lengthIn: 60,
      depthIn: 24,
      shape: "rect",
      addSplash: false
    },
    {
      id: newId(),
      pieceType: "splash",
      name: "Backsplash",
      lengthIn: 120,
      depthIn: STANDARD_BACKSPLASH_HEIGHT_IN,
      shape: "rect",
      materialOverride: true,
      materialGroup: "Group E"
    }
  ];
  const qs = qualifyingSfFromRoomDrafts([room]);
  const m = measureRoomDraft(room, qs, "wholesale");
  const bd = buildSelectedMaterialBreakdown([room], "wholesale");
  assert.ok(approxEq(m.selected - m.extras, bd.totals.materialSubtotal));

  const blockC = bd.groups.find((g) => g.group === "Group C");
  const blockE = bd.groups.find((g) => g.group === "Group E");
  assert.ok(blockC && blockE, "expected Group C and Group E blocks");
  const rateC = materialRateForInternalBasis("Group C", "wholesale");
  const rateE = materialRateForInternalBasis("Group E", "wholesale");
  assert.ok(approxEq(blockC!.materialSubtotal, blockC!.countertopSf * rateC));
  assert.ok(
    approxEq(blockE!.materialSubtotal, (blockE!.backsplashSf + blockE!.fhbSf) * rateE),
    `Case2 Group E material $ ${blockE!.materialSubtotal} vs sf×rate`
  );
}

// Case 3: Mixed scope + customer $150 + internal-only $250 — preview wholesale matches rollup formula.
{
  const room = createDefaultRoom("Group Promo");
  room.name = "Kitchen";
  room.guidedPieces = [
    {
      id: newId(),
      pieceType: "counter",
      name: "Main",
      lengthIn: 60,
      depthIn: 24,
      shape: "rect",
      addSplash: false
    }
  ];
  const qs = qualifyingSfFromRoomDrafts([room]);
  const m = measureRoomDraft(room, qs, "wholesale");
  const bd = buildSelectedMaterialBreakdown([room], "wholesale");
  const customAll = 400;
  const visibleCustom = 150;
  const internalOnly = 250;
  assert.equal(visibleCustom + internalOnly, customAll);

  const lr = runLocalPrototypeQuote({
    quoteMode: "internal",
    internalMaterialBasis: "wholesale",
    materialGroupTop: "Group Promo",
    roomDrafts: [room],
    globalAddOns: {},
    applyGlobalAddOns: false,
    workflowLabel: "room_by_room",
    projectType: "Kitchen",
    customLineItemsTotal: customAll
  });

  const expectedFull = bd.totals.materialSubtotal + m.extras + customAll;
  assert.ok(
    approxEq(lr.wholesale, expectedFull),
    `Case3 wholesale ${lr.wholesale} vs ${expectedFull}`
  );
  assert.ok(
    approxEq(lr.wholesale - internalOnly, bd.totals.materialSubtotal + m.extras + visibleCustom),
    "Case3 customer-visible line subset should match total minus internal-only adjustment"
  );
}

// mergeRoomDraftsIntoGlobalAddOns mirrors catalog + tear + FHB outlets when scope exists.
{
  const room = createDefaultRoom("Group Promo");
  room.addons["qty-sink"] = 2;
  room.tear = true;
  room.fhbMode = "Manual Sq Ft";
  room.fhbDirectSf = 8;
  room.fhbOutlets = 3;
  const merged = mergeRoomDraftsIntoGlobalAddOns([room]);
  assert.equal(merged["qty-sink"], 2);
  assert.equal(merged.tearout, 1);
  assert.equal(merged["qty-outlet"], 3);
}

console.log("verify-internal-estimate-mixed-material-parity: OK");
