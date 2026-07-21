/**
 * Internal-only custom-line allocation policy (internal_custom_line_allocation_v1)
 * + room pricing publish snapshot v2 custom-line freeze.
 * Run: node src/digitalEstimate/configuration/internalCustomLineAllocation.test.mjs
 */
import assert from "node:assert/strict";

import {
  allocateInternalOnlyCustomLines,
  normalizeSnapshotCustomLines,
  stoneTargetForCategory,
  INTERNAL_CUSTOM_LINE_ALLOCATION_VERSION
} from "./internalCustomLineAllocation.mjs";
import {
  buildRoomPricingPublishSnapshot,
  ROOM_PRICING_SNAPSHOT_VERSION
} from "./roomPricingPublishSnapshot.mjs";
import {
  buildOriginalRoomPricingProjectionFromSnapshot,
  toPublicRoomPricingDto
} from "./customerRoomPricingProjection.mjs";

const ROOMS = [
  { roomId: "kitchen", roomName: "Kitchen", countertopAmountCents: 300000, backsplashAmountCents: 60000 },
  { roomId: "bath", roomName: "Bath", countertopAmountCents: 100000, backsplashAmountCents: 0 }
];

function internalLine(extra = {}) {
  return {
    lineKey: "l1",
    label: "Slab yield loss",
    amountCents: 10001,
    customerFacing: false,
    roomId: null,
    roomName: null,
    category: null,
    quantity: null,
    unit: null,
    ...extra
  };
}

// Policy version constant.
assert.equal(INTERNAL_CUSTOM_LINE_ALLOCATION_VERSION, "internal_custom_line_allocation_v1");
console.log("ok: policy version is internal_custom_line_allocation_v1");

// Category → stone target mapping.
{
  assert.equal(stoneTargetForCategory("Countertop"), "countertop");
  assert.equal(stoneTargetForCategory("Backsplash"), "backsplash");
  assert.equal(stoneTargetForCategory("splash"), "backsplash");
  assert.equal(stoneTargetForCategory("side_splash"), null);
  assert.equal(stoneTargetForCategory("Side splash"), null);
  assert.equal(stoneTargetForCategory("Labor"), null);
  console.log("ok: stone category ownership resolves from line category");
}

// 35. Room-owned countertop-only line allocates entirely to that room's Countertop.
{
  const r = allocateInternalOnlyCustomLines({
    lines: [internalLine({ roomId: "kitchen", category: "Countertop" })],
    rooms: ROOMS
  });
  assert.equal(r.allocations.length, 1);
  assert.deepEqual(r.allocations[0].targets, [
    { roomId: "kitchen", category: "countertop", allocatedCents: 10001 }
  ]);
  assert.equal(r.allocations[0].allocationRule, "room_category");
  console.log("ok: rule 1 — room + Countertop category → that room's Countertop");
}

// 36. Room-owned backsplash-only line allocates to that room's Backsplash.
{
  const r = allocateInternalOnlyCustomLines({
    lines: [internalLine({ roomId: "kitchen", category: "Backsplash" })],
    rooms: ROOMS
  });
  assert.deepEqual(r.allocations[0].targets, [
    { roomId: "kitchen", category: "backsplash", allocatedCents: 10001 }
  ]);
  console.log("ok: rule 1 — room + Backsplash category → that room's Backsplash");
}

// 37. Room-owned, no category → proportional across that room's stone amounts.
{
  const r = allocateInternalOnlyCustomLines({
    lines: [internalLine({ roomId: "kitchen", amountCents: 12000 })],
    rooms: ROOMS
  });
  const targets = r.allocations[0].targets;
  const ct = targets.find((t) => t.category === "countertop");
  const bs = targets.find((t) => t.category === "backsplash");
  // 300000:60000 = 5:1 → 10000 / 2000
  assert.equal(ct.allocatedCents, 10000);
  assert.equal(bs.allocatedCents, 2000);
  assert.equal(ct.allocatedCents + bs.allocatedCents, 12000);
  console.log("ok: rule 2 — shared room line splits proportionally across room stone amounts");
}

// 38. Project-owned with category → proportional across eligible rooms in that category.
{
  const r = allocateInternalOnlyCustomLines({
    lines: [internalLine({ category: "Countertop", amountCents: 40000 })],
    rooms: ROOMS
  });
  const targets = r.allocations[0].targets;
  // Countertop weights 300000:100000 = 3:1 → 30000/10000
  assert.deepEqual(
    targets.map((t) => [t.roomId, t.allocatedCents]),
    [["kitchen", 30000], ["bath", 10000]]
  );
  assert.ok(targets.every((t) => t.category === "countertop"));
  console.log("ok: rule 3 — project + category allocates across eligible rooms proportionally");
}

// Rule 4: project-owned, no category → across all room stone cells.
{
  const r = allocateInternalOnlyCustomLines({
    lines: [internalLine({ amountCents: 46000 })],
    rooms: ROOMS
  });
  const targets = r.allocations[0].targets;
  const sum = targets.reduce((s, t) => s + t.allocatedCents, 0);
  assert.equal(sum, 46000);
  // Weights 300000/60000/100000 → 30000/6000/10000
  assert.equal(targets.find((t) => t.roomId === "kitchen" && t.category === "countertop").allocatedCents, 30000);
  assert.equal(targets.find((t) => t.roomId === "kitchen" && t.category === "backsplash").allocatedCents, 6000);
  assert.equal(targets.find((t) => t.roomId === "bath" && t.category === "countertop").allocatedCents, 10000);
  console.log("ok: rule 4 — project line with no category spreads across all stone cells");
}

// 39. No backsplash anywhere → nothing allocates to Backsplash.
{
  const noSplashRooms = ROOMS.map((r) => ({ ...r, backsplashAmountCents: 0 }));
  const r = allocateInternalOnlyCustomLines({
    lines: [internalLine({ category: "Backsplash", amountCents: 5000 })],
    rooms: noSplashRooms
  });
  assert.equal(r.unresolved.length, 0);
  assert.ok(r.allocations[0].targets.every((t) => t.category === "countertop"));
  console.log("ok: rule 5 — no backsplash exists → backsplash-owned line absorbs into Countertop");
}

// Rule 6: no eligible stone category → unresolved, never fabricated.
{
  const r = allocateInternalOnlyCustomLines({
    lines: [internalLine({ amountCents: 7500 })],
    rooms: []
  });
  assert.equal(r.allocations.length, 0);
  assert.equal(r.unresolved.length, 1);
  assert.equal(r.unresolved[0].reason, "no_eligible_stone_category");
  assert.equal(r.unresolvedCents, 7500);
  console.log("ok: rule 6 — no eligible stone category stays unresolved (no fabricated breakdown)");
}

// 40-41. Integer cents reconcile; largest-remainder distribution is deterministic.
{
  const args = {
    lines: [internalLine({ amountCents: 10001 })],
    rooms: ROOMS
  };
  const a = allocateInternalOnlyCustomLines(args);
  const b = allocateInternalOnlyCustomLines(args);
  assert.deepEqual(a, b);
  const sum = a.allocations[0].targets.reduce((s, t) => s + t.allocatedCents, 0);
  assert.equal(sum, 10001);
  assert.ok(a.allocations[0].targets.every((t) => Number.isInteger(t.allocatedCents)));
  console.log("ok: deterministic largest-remainder allocation, integer cents, exact reconciliation");
}

// Customer-facing lines are never absorbed by this allocator.
{
  const r = allocateInternalOnlyCustomLines({
    lines: [internalLine({ customerFacing: true })],
    rooms: ROOMS
  });
  assert.equal(r.allocations.length, 0);
  assert.equal(r.totalAllocatedCents, 0);
  console.log("ok: customer-facing lines pass through untouched (never absorbed)");
}

// Normalization from Studio scope shapes.
{
  const lines = normalizeSnapshotCustomLines([
    { name: "Support brackets", quantity: 2, unitPrice: 150, customerFacing: true, roomId: "kitchen" },
    { name: "Internal haul", lineTotal: 80.5, customerFacing: false },
    { label: "", quantity: 1, unitPrice: 10 } // no label → dropped
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].amountCents, 30000);
  assert.equal(lines[0].customerFacing, true);
  assert.equal(lines[1].amountCents, 8050);
  assert.equal(lines[1].customerFacing, false);
  console.log("ok: custom line normalization (qty×unitPrice / lineTotal, label required)");
}

// ---------------------------------------------------------------------------
// Snapshot v2 freeze behavior
// ---------------------------------------------------------------------------

const SNAPSHOT_ROOMS = [
  {
    id: "kitchen",
    name: "Kitchen",
    countertopSqft: 40,
    backsplashSqft: 8,
    backsplashHeightMode: "standard",
    materialGroup: "Group Promo"
  },
  { id: "bath", name: "Bath", countertopSqft: 10, backsplashSqft: 0, materialGroup: "Group Promo" }
];

// 33. Customer-facing line appears explicitly (room-owned → room; project → project add-on).
{
  const snap = buildRoomPricingPublishSnapshot({
    estimateId: "est-1",
    rooms: SNAPSHOT_ROOMS,
    customLineItems: [
      { name: "Additional support brackets", quantity: 1, unitPrice: 300, customerFacing: true, roomId: "kitchen" },
      { name: "Extra trip", quantity: 1, unitPrice: 150, customerFacing: true }
    ],
    customerDisplayTotalCents: 500000,
    createdAt: "2026-07-20T00:00:00Z"
  });
  assert.equal(snap.snapshotVersion, "v2");
  assert.equal(ROOM_PRICING_SNAPSHOT_VERSION, "v2");
  const kitchen = snap.rooms.find((r) => r.roomId === "kitchen");
  assert.equal(kitchen.customerFacingLines.length, 1);
  assert.equal(kitchen.customerFacingLines[0].label, "Additional support brackets");
  assert.equal(kitchen.customerFacingLines[0].amountCents, 30000);
  assert.equal(kitchen.customerFacingLines[0].customerVisible, true);
  assert.equal(snap.projectAddOnLines.length, 1);
  assert.equal(snap.projectAddOnLines[0].label, "Extra trip");
  assert.equal(snap.reconciliationStatus, "reconciled");
  console.log("ok: customer-facing lines are frozen explicitly (room + project), never hidden");
}

// 34 + absorption + reconciliation: internal-only line is absorbed, name never public.
{
  const snapNoInternal = buildRoomPricingPublishSnapshot({
    rooms: SNAPSHOT_ROOMS,
    customLineItems: [],
    customerDisplayTotalCents: 490000,
    createdAt: "2026-07-20T00:00:00Z"
  });
  const snap = buildRoomPricingPublishSnapshot({
    rooms: SNAPSHOT_ROOMS,
    customLineItems: [
      { name: "SECRET internal haul-off", quantity: 1, unitPrice: 100, customerFacing: false, roomId: "kitchen", category: "Countertop" }
    ],
    customerDisplayTotalCents: 500000, // includes the internal 10000c
    createdAt: "2026-07-20T00:00:00Z"
  });
  // Stone pool identical in both cases (490000) → base allocation identical,
  // then the internal 10000c lands on Kitchen Countertop.
  const kBase = snapNoInternal.rooms.find((r) => r.roomId === "kitchen");
  const k = snap.rooms.find((r) => r.roomId === "kitchen");
  assert.equal(k.countertopAmountCents, kBase.countertopAmountCents + 10000);
  assert.equal(snap.internalAbsorbedCents, 10000);
  assert.equal(snap.customLineAllocationPolicyVersion, "internal_custom_line_allocation_v1");
  assert.equal(snap.reconciliationStatus, "reconciled");
  assert.equal(snap.subtotalCents, snap.totalCents);

  // 45. Internal audit retains the original line inside the snapshot…
  assert.equal(snap.customLineAllocations.length, 1);
  assert.equal(snap.customLineAllocations[0].label, "SECRET internal haul-off");
  assert.equal(snap.customLineAllocations[0].originalAmountCents, 10000);
  assert.equal(snap.customLineAllocations[0].customerVisible, false);

  // 34/46. …but the public Original DTO never carries the internal name.
  const original = buildOriginalRoomPricingProjectionFromSnapshot(snap);
  const dto = toPublicRoomPricingDto(original);
  const raw = JSON.stringify(dto);
  assert.equal(raw.includes("SECRET"), false);
  assert.equal(raw.includes("customLineAllocations"), false);
  assert.equal(raw.includes("Cents"), false);
  console.log("ok: internal-only line absorbed into stone amounts; name/audit never in public DTO");
}

// 42. Historical Original allocation is immutable — same inputs, identical snapshot.
{
  const args = {
    rooms: SNAPSHOT_ROOMS,
    customLineItems: [
      { name: "Internal haul", quantity: 1, unitPrice: 100.01, customerFacing: false }
    ],
    customerDisplayTotalCents: 500001,
    createdAt: "2026-07-20T00:00:00Z"
  };
  assert.deepEqual(
    buildRoomPricingPublishSnapshot(args),
    buildRoomPricingPublishSnapshot(args)
  );
  console.log("ok: snapshot build is pure/deterministic — frozen Original never drifts");
}

// Unresolved internal line → review_required, total still accounted for.
{
  const snap = buildRoomPricingPublishSnapshot({
    rooms: [],
    customLineItems: [{ name: "Orphan internal", quantity: 1, unitPrice: 50, customerFacing: false }],
    customerDisplayTotalCents: 5000,
    createdAt: "2026-07-20T00:00:00Z"
  });
  assert.equal(snap.reconciliationStatus, "review_required");
  assert.equal(snap.unresolvedInternalCents, 5000);
  assert.equal(snap.unresolvedInternalLines[0].reason, "no_eligible_stone_category");
  console.log("ok: unresolved internal pricing is explicit review_required — no balancing plug");
}

console.log("\nAll internalCustomLineAllocation tests passed.\n");
