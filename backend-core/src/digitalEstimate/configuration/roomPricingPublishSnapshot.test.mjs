/**
 * Immutable publish-time room pricing snapshot — tests (sections 13-19, 27, 30).
 * Run: node backend-core/src/digitalEstimate/configuration/roomPricingPublishSnapshot.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildRoomPricingPublishSnapshot,
  ROOM_PRICING_SNAPSHOT_VERSION,
  COUNTERTOP_BACKSPLASH_PRICING_SOURCE,
  ADD_ONS_NOT_ATTRIBUTABLE
} from "./roomPricingPublishSnapshot.mjs";
import {
  buildOriginalRoomPricingProjectionFromSnapshot,
  buildOriginalRoomPricingProjection,
  toPublicRoomPricingDto
} from "./customerRoomPricingProjection.mjs";

console.log("\nroomPricingPublishSnapshot.test.mjs\n");

function room(overrides = {}) {
  return {
    id: "kitchen",
    name: "Kitchen",
    countertopSqft: 40,
    backsplashSqft: 10,
    backsplashHeightMode: "standard",
    materialGroup: "Group Promo",
    colorName: "White",
    ...overrides
  };
}

// 1. Snapshot reconciles exactly to the customer display total (largest-remainder allocation).
{
  const snap = buildRoomPricingPublishSnapshot({
    estimateId: "est-1",
    quoteNumber: "SE-ABC12345",
    revision: 1,
    rooms: [room(), room({ id: "powder", name: "Powder Bath", countertopSqft: 6, backsplashSqft: 4 })],
    customerDisplayTotalCents: 4_523_017
  });
  assert.equal(snap.snapshotVersion, ROOM_PRICING_SNAPSHOT_VERSION);
  assert.equal(snap.rooms.length, 2);
  const sum = snap.rooms.reduce((s, r) => s + r.roomTotalCents, 0);
  assert.equal(sum, 4_523_017);
  assert.equal(snap.roomSubtotalCents, 4_523_017);
  assert.equal(snap.totalCents, 4_523_017);
  assert.equal(snap.reconciliationStatus, "reconciled");
  console.log("ok: snapshot rooms sum exactly to the frozen customer display total (no remainder loss)");
}

// 2. Each room's countertop + backsplash + add-ons == room total; add-ons always $0 with explicit status.
{
  const snap = buildRoomPricingPublishSnapshot({
    rooms: [room()],
    customerDisplayTotalCents: 1_234_500
  });
  const r = snap.rooms[0];
  assert.equal(r.countertopAmountCents + r.backsplashAmountCents + r.addOnsAmountCents, r.roomTotalCents);
  assert.equal(r.addOnsAmountCents, 0);
  assert.equal(r.addOnsAttributionStatus, ADD_ONS_NOT_ATTRIBUTABLE);
  assert.equal(r.pricingSourceVersion, COUNTERTOP_BACKSPLASH_PRICING_SOURCE);
  console.log("ok: room total = countertop + backsplash + add-ons; add-ons explicitly not-yet-attributable, never invented");
}

// 3. Countertop/backsplash split is weighted by each room's own SF — bigger backsplash SF share => bigger backsplash amount.
{
  const snap = buildRoomPricingPublishSnapshot({
    rooms: [room({ countertopSqft: 40, backsplashSqft: 40 })],
    customerDisplayTotalCents: 100_00
  });
  const r = snap.rooms[0];
  // Equal SF weights => roughly even split (allowing largest-remainder single-cent skew).
  assert.ok(Math.abs(r.countertopAmountCents - r.backsplashAmountCents) <= 1);
  console.log("ok: countertop/backsplash split is SF-weighted within one room");
}

// 4. A room with zero backsplash SF gets exactly $0 backsplash, never a fabricated share.
{
  const snap = buildRoomPricingPublishSnapshot({
    rooms: [room({ backsplashSqft: 0, backsplashHeightMode: "none" })],
    customerDisplayTotalCents: 50_00
  });
  const r = snap.rooms[0];
  assert.equal(r.backsplashAmountCents, 0);
  assert.equal(r.countertopAmountCents, 5000);
  assert.equal(r.originalBacksplashMode, "none");
  console.log("ok: room with no backsplash SF gets $0 backsplash, full total goes to countertop");
}

// 5. originalBacksplashMode reflects frozen studio height mode (full_height / custom / standard / none).
{
  const snap = buildRoomPricingPublishSnapshot({
    rooms: [
      room({ id: "a", backsplashHeightMode: "full_height" }),
      room({ id: "b", backsplashHeightMode: "custom" }),
      room({ id: "c", backsplashHeightMode: "standard" }),
      room({ id: "d", backsplashSqft: 0, backsplashHeightMode: "none" })
    ],
    customerDisplayTotalCents: 400_00
  });
  const byId = new Map(snap.rooms.map((r) => [r.roomId, r]));
  assert.equal(byId.get("a").originalBacksplashMode, "full_height");
  assert.equal(byId.get("b").originalBacksplashMode, "custom_height");
  assert.equal(byId.get("c").originalBacksplashMode, "standard_4in");
  assert.equal(byId.get("d").originalBacksplashMode, "none");
  console.log("ok: originalBacksplashMode is derived from frozen height mode, never a customer selection");
}

// 6. No rooms => snapshot still well-formed, empty rooms, subtotal 0 (defensive edge case).
{
  const snap = buildRoomPricingPublishSnapshot({ rooms: [], customerDisplayTotalCents: 0 });
  assert.deepEqual(snap.rooms, []);
  assert.equal(snap.roomSubtotalCents, 0);
  assert.equal(snap.reconciliationStatus, "reconciled");
  console.log("ok: empty-room snapshot is well-formed and trivially reconciled");
}

// 7. publicationId is intentionally never part of the frozen payload (generated after this runs).
{
  const snap = buildRoomPricingPublishSnapshot({ rooms: [room()], customerDisplayTotalCents: 100_00 });
  assert.ok(!("publicationId" in snap));
  console.log("ok: publicationId is intentionally omitted from the frozen snapshot payload");
}

// 8. Deterministic: identical inputs always produce an identical snapshot (never recomputed differently).
{
  const args = { rooms: [room(), room({ id: "powder", countertopSqft: 7, backsplashSqft: 3 })], customerDisplayTotalCents: 987_65 };
  const a = buildRoomPricingPublishSnapshot(args);
  const b = buildRoomPricingPublishSnapshot(args);
  assert.deepEqual(a, b);
  console.log("ok: snapshot construction is deterministic given identical frozen inputs");
}

// ---------------------------------------------------------------------------
// Original view built FROM the snapshot (section 20)
// ---------------------------------------------------------------------------

// 9. Original projection built from the snapshot exposes countertop/backsplash/add-ons/roomTotal,
//    reconciles to the project total, and is marked snapshotAvailability: "available".
{
  const snap = buildRoomPricingPublishSnapshot({
    rooms: [room(), room({ id: "powder", name: "Powder Bath", countertopSqft: 6, backsplashSqft: 4 })],
    customerDisplayTotalCents: 452_301
  });
  const original = buildOriginalRoomPricingProjectionFromSnapshot(snap);
  assert.equal(original.kind, "original");
  assert.equal(original.snapshotAvailability, "available");
  assert.equal(original.rooms.length, 2);
  const sum = original.rooms.reduce((s, r) => s + r.roomTotalCents, 0);
  assert.equal(sum, 452_301);
  assert.equal(original.projectTotalCents, 452_301);
  const dto = toPublicRoomPricingDto(original);
  assert.equal(dto.rooms.length, 2);
  assert.ok(dto.rooms.every((r) => typeof r.roomTotal === "number"));
  console.log("ok: Original projection from the immutable snapshot reconciles and serializes to a safe public DTO");
}

// 10. Legacy fallback: a customer snapshot with no roomPricing field uses the old
//     not_currently_attributable path and is explicitly tagged as legacy-unavailable.
{
  const original = buildOriginalRoomPricingProjection({
    rooms: [{ name: "Kitchen", materialLabel: "Group Promo" }],
    lineItems: [],
    totals: { estimatedProjectTotal: 45230 }
  });
  assert.equal(original.snapshotAvailability, "legacy_room_pricing_snapshot_unavailable");
  assert.equal(original.rooms[0].countertopAmountCents, null);
  assert.equal(original.rooms[0].backsplashAmountCents, null);
  console.log("ok: publications without a room pricing snapshot use the explicit legacy fallback, never invented dollars");
}

// 11. Dispatcher prefers the snapshot when present over the legacy flat summary.
{
  const snap = buildRoomPricingPublishSnapshot({ rooms: [room()], customerDisplayTotalCents: 100_00 });
  const original = buildOriginalRoomPricingProjection({
    roomPricing: snap,
    rooms: [{ name: "Kitchen" }],
    lineItems: [],
    totals: { estimatedProjectTotal: 100 }
  });
  assert.equal(original.snapshotAvailability, "available");
  assert.equal(original.rooms[0].roomTotalCents, 100_00);
  console.log("ok: Original dispatcher prefers the immutable snapshot over the legacy flat summary when both exist");
}

// 12. Golden L (section 27): legacy publication — the link still works, no fake exact
// room category dollars are fabricated, and the fallback status is explicit so callers
// can distinguish it from a real, priced Original.
{
  const original = buildOriginalRoomPricingProjection({
    roomPricing: null,
    rooms: [{ name: "Kitchen", materialLabel: "Group Promo" }, { name: "Powder Bath", materialLabel: "Group A" }],
    lineItems: [{ label: "Delivery", amount: 75 }],
    totals: { estimatedProjectTotal: 4200 }
  });
  assert.equal(original.snapshotAvailability, "legacy_room_pricing_snapshot_unavailable");
  assert.equal(original.reconciliationStatus, "not_attributable");
  for (const r of original.rooms) {
    assert.equal(r.countertopAmountCents, null);
    assert.equal(r.backsplashAmountCents, null);
    assert.equal(r.roomTotalCents, null);
  }
  assert.equal(original.projectTotalCents, 420000);
  const dto = toPublicRoomPricingDto(original);
  assert.equal(dto.rooms.length, 2);
  assert.equal(dto.reconciliationStatus, "not_attributable");
  console.log("ok: golden L — legacy publication link still works, with an explicit (never fabricated) fallback");
}

console.log("\nAll roomPricingPublishSnapshot tests passed.\n");
