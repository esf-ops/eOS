/**
 * Shared room hierarchy + side-splash summary regressions for option authority.
 * Run: node --experimental-strip-types src/phasePricingBreakdownAndOptionAuthority.test.ts
 */
import assert from "node:assert/strict";

import {
  buildChangesBreakdown,
  buildOriginalBreakdown,
  buildUpdatedBreakdown,
  groupBreakdownLinesByRoom,
} from "./customerEstimateBreakdown.ts";
import { summarizeSideSplashSelections } from "./sideSplashSummary.ts";
import type {
  PublicRoomPricing,
  PublicRoomPricingChanges,
} from "./publicConfigApi.ts";

const original: PublicRoomPricing = {
  kind: "original",
  rooms: [
    {
      roomName: "Kitchen",
      roomLabel: "Kitchen",
      countertopAmount: 4000,
      backsplashAmount: 1000,
      addOnsAmount: 200,
      roomTotal: 5200,
      selectedMaterial: "Group Promo",
      selectedBacksplash: "4-inch backsplash",
      addOnLines: [
        { category: "Sink", label: "Customer-provided sink", amount: 0 },
        { category: "Sink cutout", label: "Kitchen Sink Cutouts", amount: 200 },
      ],
      countertop: { amountCents: 4000_00, displayAmount: 4000 },
      backsplash: {
        mode: "standard_4in",
        label: "4-inch backsplash",
        amountCents: 1000_00,
        displayAmount: 1000,
      },
      addOns: {
        amountCents: 200_00,
        displayAmount: 200,
        lines: [
          { category: "Sink", label: "Customer-provided sink", amount: 0 },
          { category: "Sink cutout", label: "Kitchen Sink Cutouts", amount: 200 },
        ],
      },
      roomTotalDetail: { amountCents: 5200_00, displayAmount: 5200 },
    },
  ],
  projectAddOns: [{ label: "Trip charge", amount: 150 }],
  projectTotal: 5350,
  reconciliationStatus: "reconciled",
};

const updated: PublicRoomPricing = {
  kind: "updated",
  rooms: [
    {
      roomName: "Kitchen",
      countertopAmount: 4000,
      backsplashAmount: 0,
      addOnsAmount: 352,
      roomTotal: 4352,
      selectedBacksplash: "No backsplash",
      addOnLines: [
        { category: "Sink", label: "Customer-provided sink", amount: 0 },
        { category: "Sink cutout", label: "Kitchen Sink Cutouts", amount: 200 },
        { category: "Edge", label: "Edge — Small Ogee", amount: 152 },
      ],
      backsplash: {
        mode: "none",
        label: "No backsplash",
        amountCents: 0,
        displayAmount: 0,
      },
    },
  ],
  projectAddOns: [{ label: "Trip charge", amount: 150 }],
  projectTotal: 4502,
  reconciliationStatus: "reconciled",
};

const changes: PublicRoomPricingChanges = {
  kind: "changes",
  rows: [
    {
      roomName: "Kitchen",
      category: "backsplash",
      categoryLabel: "Backsplash",
      originalLabel: "4-inch backsplash",
      updatedLabel: "No backsplash",
      amountDelta: -1000,
      status: "removed",
    },
    {
      roomName: "Kitchen",
      category: "edge",
      categoryLabel: "Edge",
      originalLabel: "Eased",
      updatedLabel: "Small Ogee",
      amountDelta: 152,
      status: "new_selection",
    },
  ],
  totalDelta: -848,
};

const originalView = buildOriginalBreakdown({
  roomPricing: original,
  totals: { estimatedProjectTotal: 5350 },
});
const updatedView = buildUpdatedBreakdown({
  calculation: {
    roomPricing: updated,
    configuredDisplayTotal: 4502,
  },
});
const changesView = buildChangesBreakdown({
  changeLines: [],
  roomPricingChanges: changes,
  displayTotalDelta: -848,
});

assert.equal(originalView.kind, "original");
assert.ok(originalView.lines.some((l) => l.label === "Countertop" && l.amount === 4000));
assert.ok(originalView.lines.some((l) => l.label === "Backsplash" && l.amount === 1000));
assert.ok(originalView.lines.some((l) => /Kitchen Sink Cutouts/i.test(l.label)));
assert.ok(originalView.lines.some((l) => /Trip charge/i.test(l.label)));
assert.equal(originalView.total, 5350);

assert.equal(updatedView.kind, "updated");
assert.ok(updatedView.lines.some((l) => l.label === "Backsplash" && l.amount === 0));
assert.ok(updatedView.lines.some((l) => /Edge — Small Ogee/i.test(l.label) && l.amount === 152));
assert.equal(updatedView.total, 4502);

assert.ok(
  changesView.lines.some(
    (l) => /No backsplash/i.test(l.label) || /4-inch/.test(l.label),
  ),
);

const groups = groupBreakdownLinesByRoom(updatedView.lines);
assert.equal(groups[0]?.roomName, "Kitchen");
assert.ok(groups.some((g) => g.roomName == null || g.lines.some((l) => /Trip/i.test(l.label))));

assert.equal(summarizeSideSplashSelections([]), "None selected");
assert.equal(
  summarizeSideSplashSelections([{ pieceLabel: "Sink Run", summary: "Right" }]),
  "Right side — Sink Run",
);
assert.equal(
  summarizeSideSplashSelections([
    { pieceLabel: "Sink Run", summary: "Right" },
    { pieceLabel: "Peninsula", summary: "Both" },
  ]),
  "2 locations selected",
);

console.log("ok: phasePricingBreakdownAndOptionAuthority UI hierarchy + side-splash summaries");
