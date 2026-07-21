/**
 * Customer-safe side-splash summaries + shared room pricing hierarchy.
 * Run: node --experimental-strip-types src/phaseBacksplashDeltaRoomBreakdown.test.ts
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

const roomPricing: PublicRoomPricing = {
  kind: "updated",
  rooms: [
    {
      roomName: "Kitchen",
      countertopAmount: 4800,
      backsplashAmount: 650,
      addOnsAmount: 775,
      roomTotal: 6225,
      addOnLines: [
        { category: "Sink", label: 'Sink — Precis 27"', amount: 575 },
        { category: "Sink cutout", label: "Kitchen sink cutout", amount: 200 },
      ],
    },
  ],
  projectAddOns: [{ label: "Delivery service", amount: 75 }],
  projectTotal: 6300,
  reconciliationStatus: "reconciled",
};

// Side-splash summary contract.
assert.equal(summarizeSideSplashSelections([]), "None selected");
assert.equal(
  summarizeSideSplashSelections([
    { pieceKey: "opaque-a", pieceLabel: "Sink Run", summary: "Right", options: [] },
    { pieceKey: "opaque-b", pieceLabel: "Left of Stove", summary: "None", options: [] },
  ]),
  "Right side — Sink Run",
);
assert.equal(
  summarizeSideSplashSelections([
    { pieceKey: "opaque-a", pieceLabel: "Sink Run", summary: "Right", options: [] },
    { pieceKey: "opaque-b", pieceLabel: "Left of Stove", summary: "Left", options: [] },
  ]),
  "2 locations selected",
);
console.log("ok: side-splash summaries are concise and omit unchanged rows");

// Original and Updated use the same room hierarchy.
const original = buildOriginalBreakdown({
  documentTitle: "Estimate",
  quoteNumber: "Q-1",
  revisionLabel: null,
  revisionNumber: 1,
  publishedAt: null,
  pricingValidThrough: null,
  project: { customerName: null, projectName: null, projectAddress: null },
  rooms: [],
  lineItems: [],
  totals: { estimatedProjectTotal: 6300, currency: "USD", rounding: "none" },
  notes: [],
  disclosures: { version: null, text: null },
  roomPricing: { ...roomPricing, kind: "original" },
});
const updated = buildUpdatedBreakdown({
  calculation: {
    configuredDisplayTotal: 6300,
    roomPricing,
  },
});

for (const breakdown of [original, updated]) {
  const kitchen = groupBreakdownLinesByRoom(breakdown.lines).find(
    (group) => group.roomName === "Kitchen",
  );
  assert.ok(kitchen);
  assert.deepEqual(
    kitchen.lines.slice(0, 3).map((line) => line.label),
    ["Countertop", "Backsplash", "Add-ons"],
  );
  assert.ok(kitchen.lines.some((line) => line.label === 'Sink — Precis 27"'));
  assert.ok(kitchen.lines.some((line) => line.label === "Kitchen sink cutout"));
  assert.equal(kitchen.lines.at(-1)?.label, "Kitchen total");
  const project = groupBreakdownLinesByRoom(breakdown.lines).find(
    (group) => group.roomName === null,
  );
  assert.ok(project?.lines.some((line) => line.label === "Delivery service"));
  assert.equal(project?.lines.at(-1)?.label, "Project total");
  assert.equal(breakdown.total, 6300);
}
console.log("ok: Original and Updated share Countertop/Backsplash/Add-ons/Room total hierarchy");

// Changes uses the same room grouping and formatter.
const roomPricingChanges: PublicRoomPricingChanges = {
  kind: "changes",
  rows: [
    {
      roomName: "Kitchen",
      category: "backsplash",
      categoryLabel: "Backsplash",
      originalLabel: "4-inch backsplash",
      updatedLabel: "No backsplash",
      amountDelta: -650,
      status: "removed",
    },
  ],
  totalDelta: -650,
};
const changes = buildChangesBreakdown({
  changeLines: [],
  roomPricingChanges,
  displayTotalDelta: -650,
});
const changeGroups = groupBreakdownLinesByRoom(changes.lines);
assert.equal(changeGroups[0].roomName, "Kitchen");
assert.equal(changeGroups[0].lines[0].category, "Backsplash");
assert.equal(
  changeGroups[0].lines[0].label,
  "4-inch backsplash → No backsplash",
);
assert.equal(changeGroups[0].lines[0].amountLabel, "−$650");
assert.equal(changeGroups[0].lines.at(-1)?.label, "Kitchen total change");
assert.equal(changes.totalLabel, "−$650");
console.log("ok: Changes uses room hierarchy with sign-preserving customer-facing delta");

// Public rendering data contains no raw ids / implementation keys / geometry.
const raw = JSON.stringify({ original, updated, changes });
for (const forbidden of [
  "d1c2b3a4-f5e6-4d7c-8b9a-0a1b2c3d4e5f",
  "runId",
  "roomId",
  "areaId",
  "optionKey",
  "squareFeet",
  "linearFeet",
  "ratePer",
]) {
  assert.equal(raw.includes(forbidden), false, `forbidden token leaked: ${forbidden}`);
}
console.log("ok: breakdown rendering data contains no internal ids, option keys, SF/LF, or rates");

console.log("\nAll backsplash delta / room breakdown UI tests passed.\n");
