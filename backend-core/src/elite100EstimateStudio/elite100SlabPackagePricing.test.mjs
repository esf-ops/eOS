/**
 * Custom slab package pricing (quantity × cost per slab × 2.25).
 * Run: node backend-core/src/elite100EstimateStudio/elite100SlabPackagePricing.test.mjs
 */
import assert from "node:assert/strict";
import {
  allocateSlabPackageCents,
  priceSlabPackages,
  slabPackageTotalCents,
  suggestSlabQuantity,
  SLAB_PACKAGE_COST_MULTIPLIER,
  SLAB_PACKAGE_DEFAULT_WASTE_PERCENT
} from "./elite100SlabPackagePricing.mjs";
import { calculateStudioEstimateV4 } from "./elite100RoomPricingStudioAdapter.mjs";

console.log("\nelite100SlabPackagePricing.test.mjs\n");

{
  assert.equal(SLAB_PACKAGE_COST_MULTIPLIER, 2.25);
  assert.equal(SLAB_PACKAGE_DEFAULT_WASTE_PERCENT, 20);
  // 126" × 63" = 55.125 sf full slab; 20% is added to required area, no trim deduction.
  const s = suggestSlabQuantity({ requiredSf: 60, slabLengthIn: 126, slabWidthIn: 63 });
  assert.equal(s.slabAreaSf, 55.125);
  assert.equal(s.requiredWithWasteSf, 72);
  assert.equal(s.suggestedQuantity, 2);
  // Exactly one slab after waste stays one slab (no float creep).
  assert.equal(
    suggestSlabQuantity({ requiredSf: 45.9375, slabLengthIn: 126, slabWidthIn: 63 }).suggestedQuantity,
    1
  );
  // 80%-yield would need 45.9375 / 0.8 = 57.42 sf → 2 slabs; the approved rule yields 1.
  assert.equal(suggestSlabQuantity({ requiredSf: 0, slabLengthIn: 126, slabWidthIn: 63 }).suggestedQuantity, 0);
  console.log("ok: suggestion adds 20% to required area over the full slab area");
}

{
  assert.equal(slabPackageTotalCents(3, 1234.56), 833328);
  assert.equal(slabPackageTotalCents(1, 0.01), 2);
  const a = allocateSlabPackageCents(10001, [
    { roomId: "a", requiredSf: 1 },
    { roomId: "b", requiredSf: 1 },
    { roomId: "c", requiredSf: 1 }
  ]);
  assert.equal(a.reduce((s, x) => s + x.amountCents, 0), 10001);
  console.log("ok: package total in exact cents; allocation sums to the package total");
}

{
  const priced = priceSlabPackages({
    packages: [{ id: "pk", colorName: "Taj Mahal", slabLengthIn: 126, slabWidthIn: 63, costPerSlab: 1500, confirmedSlabQuantity: 1 }],
    roomAreas: [{ roomId: "k", roomName: "Kitchen", packageId: "pk", requiredSf: 60 }]
  });
  assert.ok(priced.unresolved.some((u) => u.code === "slab_quantity_override_reason_missing"));
  const withReason = priceSlabPackages({
    packages: [{ id: "pk", colorName: "Taj Mahal", slabLengthIn: 126, slabWidthIn: 63, costPerSlab: 1500, confirmedSlabQuantity: 1, quantityOverrideReason: "Island from a remnant" }],
    roomAreas: [{ roomId: "k", roomName: "Kitchen", packageId: "pk", requiredSf: 60 }]
  });
  assert.equal(withReason.unresolved.length, 0);
  assert.ok(withReason.warnings.some((w) => w.code === "slab_quantity_below_suggestion"));
  assert.equal(withReason.packages[0].total, 3375);
  const incomplete = priceSlabPackages({
    packages: [{ id: "pk", colorName: "X", slabLengthIn: 0, slabWidthIn: 63, costPerSlab: 0 }],
    roomAreas: [{ roomId: "k", roomName: "Kitchen", packageId: "pk", requiredSf: 60 }]
  });
  assert.ok(incomplete.unresolved.some((u) => u.code === "slab_package_incomplete"));
  assert.equal(incomplete.packages[0].total, 0);
  console.log("ok: override needs a documented reason; incomplete packages never invent a price");
}

function kitchenIslandVanityScope(extra = {}) {
  return {
    pricingBasis: "direct",
    materialGroup: "Group Promo",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        slabPackageId: "taj",
        pieces: [{ id: "k1", name: "Perimeter", lengthIn: 144, depthIn: 25.5, quantity: 1 }]
      },
      {
        id: "island",
        name: "Island",
        roomType: "Kitchen",
        slabPackageId: "taj",
        pieces: [{ id: "i1", name: "Island", lengthIn: 96, depthIn: 42, quantity: 1 }]
      },
      {
        id: "hall-bath",
        name: "Hall Bath",
        roomType: "Bathroom",
        pieces: [{ id: "v1", name: "Vanity", lengthIn: 49, depthIn: 22.5, quantity: 1 }]
      }
    ],
    addOns: { "qty-sink": 1 },
    slabPackages: [
      {
        id: "taj",
        colorName: "Taj Mahal",
        supplier: "Arizona Tile",
        slabLengthIn: 126,
        slabWidthIn: 63,
        costPerSlab: 1850.5,
        confirmedSlabQuantity: null,
        ...extra
      }
    ]
  };
}

{
  const unconfirmed = await calculateStudioEstimateV4({ scope: kitchenIslandVanityScope(), env: {} });
  assert.ok(
    unconfirmed.unresolvedItems.some((u) => u.code === "slab_quantity_unconfirmed"),
    "unconfirmed slab quantity must block review"
  );

  const calc = await calculateStudioEstimateV4({
    scope: kitchenIslandVanityScope({ confirmedSlabQuantity: 2 }),
    env: {}
  });
  assert.equal(calc.unresolvedItems.filter((u) => String(u.code).startsWith("slab_")).length, 0);
  const pkg = calc.elite100.slabPackages[0];
  // Kitchen 25.5 sf + island 28 sf = 53.5 sf → ×1.2 = 64.2 sf → 2 slabs of 55.125 sf.
  assert.equal(pkg.requiredSf, 53.5);
  assert.equal(pkg.suggestedQuantity, 2);
  assert.equal(pkg.quantityPriced, 2);
  assert.equal(pkg.total, 8327.25, "2 × $1,850.50 × 2.25 charged once");
  assert.equal(pkg.shared, true);

  const rooms = calc.elite100.rooms;
  const kitchen = rooms.find((r) => r.roomId === "kitchen");
  const island = rooms.find((r) => r.roomId === "island");
  const bath = rooms.find((r) => r.roomId === "hall-bath");
  assert.equal(kitchen.countertopMaterialSubtotal, 0, "no per-sf stone charge on package rooms");
  assert.equal(kitchen.materialUseTaxAmount, 0, "no use tax added on top of the package");
  assert.equal(
    Math.round((kitchen.slabPackage.allocatedAmount + island.slabPackage.allocatedAmount) * 100),
    832725,
    "room allocations sum to the package once"
  );
  assert.ok(kitchen.cutoutsTotal > 0, "explicit sink cutout extra is still charged");
  assert.ok(bath.countertopMaterialSubtotal > 0, "Elite 100 room keeps collection pricing");
  assert.equal(bath.materialGroup, "Group Promo");

  const roomSum = Math.round(rooms.reduce((s, r) => s + r.exactTotal, 0) * 100);
  assert.equal(Math.round(calc.totals.exactTotal * 100), roomSum, "estimate total equals room totals");
  assert.equal(calc.totals.customerDisplayTotal, calc.totals.exactTotal, "exact cents to the customer");

  const customerJson = JSON.stringify(calc.elite100.customerFacing);
  for (const leak of ["costPerSlab", "costMultiplier", "1850.5", "suggestedQuantity", "slabAreaSf", "quantityPriced"]) {
    assert.equal(customerJson.includes(leak), false, `customer projection must not include ${leak}`);
  }
  const kLines = calc.elite100.customerFacing.rooms.find((r) => r.roomId === "kitchen").lineItems;
  assert.ok(kLines.some((l) => l.label === "Installed Material Package — Taj Mahal"));
  assert.equal(customerJson.includes("Arizona Tile"), false);
  assert.ok(kLines.every((l) => l.label !== "Countertop Material" && l.label !== "Material Use Tax"));
  assert.equal(calc.elite100.customerFacing.slabPackages[0].total, 8327.25);
  console.log("ok: shared package charged once, allocated across rooms, extras kept, costs private");
}

{
  const base = kitchenIslandVanityScope();
  const elite100Only = {
    ...base,
    rooms: base.rooms.map(({ slabPackageId, ...r }) => r),
    slabPackages: []
  };
  const withUnusedPackage = { ...elite100Only, slabPackages: base.slabPackages };
  const a = await calculateStudioEstimateV4({ scope: elite100Only, env: {} });
  const b = await calculateStudioEstimateV4({ scope: withUnusedPackage, env: {} });
  assert.equal(a.totals.exactTotal, b.totals.exactTotal, "unused package never changes Elite 100 pricing");
  assert.ok(b.warnings.some((w) => w.code === "slab_package_unused"));
  console.log("ok: Elite 100-only estimates are unchanged by the slab feature");
}

console.log("\nelite100SlabPackagePricing.test.mjs — passed\n");
