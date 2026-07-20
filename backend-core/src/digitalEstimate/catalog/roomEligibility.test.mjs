/**
 * Canonical room eligibility + envelope sink seeding.
 * Run: node backend-core/src/digitalEstimate/catalog/roomEligibility.test.mjs
 */
import assert from "node:assert/strict";
import {
  cutoutDisplayLabelForRoom,
  inferRoomEligibilityType,
  productMatchesRoomType
} from "./roomEligibility.mjs";
import {
  buildDefaultRoomProductOptions,
  buildSinkOptionDefinitions
} from "./digitalEstimateProductOptions.mjs";
import { getCatalogMeta, listProducts } from "./esfPlumbingCatalog.mjs";
import { hashConfigurationEnvelope as studioHash } from "../../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs";

console.log("\nroomEligibility.test.mjs\n");

const LABEL_CASES = [
  ["Kitchen", "kitchen"],
  ["Coffee Bar", "bar_prep"],
  ["Wet Bar", "bar_prep"],
  ["Pantry", "bar_prep"],
  ["Laundry", "laundry_utility"],
  ["Master Bath", "vanity"],
  ["Guest Bath", "vanity"],
  ["Reception Desk", "non_plumbing"]
];

for (const [label, expected] of LABEL_CASES) {
  assert.equal(
    inferRoomEligibilityType({ displayName: label, name: label }),
    expected,
    `${label} → ${expected}`
  );
}
console.log("ok: room labels normalize to canonical types");

const sinks = listProducts({ category: "sink", customerVisibleOnly: true });
assert.ok(sinks.length >= 40, `active sinks ${sinks.length}`);

const byRoom = {
  kitchen: sinks.filter((p) => productMatchesRoomType(p.roomEligibility, "kitchen")).length,
  bar_prep: sinks.filter((p) => productMatchesRoomType(p.roomEligibility, "bar_prep")).length,
  vanity: sinks.filter((p) => productMatchesRoomType(p.roomEligibility, "vanity")).length,
  laundry_utility: sinks.filter((p) =>
    productMatchesRoomType(p.roomEligibility, "laundry_utility")
  ).length,
  non_plumbing: sinks.filter((p) => productMatchesRoomType(p.roomEligibility, "non_plumbing"))
    .length
};

assert.ok(byRoom.kitchen >= 30, `kitchen sinks ${byRoom.kitchen}`);
assert.ok(byRoom.bar_prep >= 3, `bar_prep sinks ${byRoom.bar_prep}`);
assert.ok(byRoom.vanity >= 5, `vanity sinks ${byRoom.vanity}`);
assert.ok(byRoom.laundry_utility >= 1, `laundry sinks ${byRoom.laundry_utility}`);
assert.equal(byRoom.non_plumbing, 0);
console.log("ok: approved sink counts by room type", byRoom);

for (const [label, roomType] of LABEL_CASES) {
  const opts = buildSinkOptionDefinitions({
    roomKey: "room-1",
    roomType,
    includeEsfProducts: roomType !== "non_plumbing"
  });
  const esf = opts.filter((o) => String(o.optionKey).includes(":esf:"));
  if (roomType === "non_plumbing") {
    assert.equal(esf.length, 0, `${label} must not seed ESF sinks`);
  } else {
    assert.ok(esf.length >= 1, `${label} (${roomType}) should seed sinks, got ${esf.length}`);
    for (const o of esf) {
      assert.match(o.optionKey, /^sink:room-1:esf:/);
      assert.ok(o.compatibilityJson?.productId, "productId on option");
      assert.equal(o.compatibilityJson?.roomType, roomType);
      assert.ok(Number(o.sellPrice) > 0 || o.sellPrice === 0, "priced or zero");
    }
  }
}
console.log("ok: envelope sink option keys are savable + room-scoped");

const seeded = buildDefaultRoomProductOptions({
  rooms: [
    { roomKey: "kitchen-1", displayName: "Kitchen", roomType: "kitchen" },
    { roomKey: "coffee-1", displayName: "Coffee Bar", roomType: "bar_prep" },
    { roomKey: "reception-1", displayName: "Reception Desk", roomType: "non_plumbing" }
  ],
  choiceGroups: ["sink", "faucet", "accessories"],
  groupId: "g1"
});
const kitchenEsf = seeded.filter((o) => o.optionKey.startsWith("sink:kitchen-1:esf:"));
const coffeeEsf = seeded.filter((o) => o.optionKey.startsWith("sink:coffee-1:esf:"));
const receptionEsf = seeded.filter((o) => o.optionKey.startsWith("sink:reception-1:esf:"));
assert.ok(kitchenEsf.length > coffeeEsf.length, "kitchen vs coffee differ");
assert.equal(receptionEsf.length, 0);
console.log("ok: kitchen/coffee/reception filtering", {
  kitchen: kitchenEsf.length,
  coffee: coffeeEsf.length,
  reception: receptionEsf.length
});

assert.equal(cutoutDisplayLabelForRoom("kitchen", "Kitchen"), "Kitchen — Sink cutout");
assert.equal(cutoutDisplayLabelForRoom("bar_prep", "Coffee Bar"), "Coffee Bar — Bar/prep sink cutout");
assert.equal(cutoutDisplayLabelForRoom("vanity", "Master Bath"), "Master Bath — Vanity sink cutout");
console.log("ok: room-specific cutout labels");

const meta = getCatalogMeta();
assert.ok(meta.fingerprint, "catalog fingerprint");
const cfg = { customerChoiceGroups: ["sink", "faucet"], allowedMaterialIds: [] };
const a = studioHash(cfg, { productCatalogFingerprint: meta.fingerprint });
const b = studioHash(cfg, { productCatalogFingerprint: `${meta.fingerprint}:changed` });
assert.notEqual(a, b, "catalog fingerprint must change envelope hash");
const c = studioHash(cfg, { productCatalogFingerprint: meta.fingerprint });
assert.equal(a, c);
console.log("ok: catalog fingerprint forces envelope reseed hash");

console.log("\nAll roomEligibility tests passed.\n");
