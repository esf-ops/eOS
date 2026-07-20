/**
 * Blanco sink variant resolution + Inteos selection contract.
 * Run: node backend-core/src/digitalEstimate/catalog/blancoInteosSelection.test.mjs
 */
import assert from "node:assert/strict";
import {
  getCatalogProducts,
  getProductById,
  resolveBlancoVariant
} from "./esfPlumbingCatalog.mjs";
import {
  buildSinkOptionDefinitions,
  cutoutKeyForSinkSelection,
  resolveCatalogProductSelection
} from "./digitalEstimateProductOptions.mjs";

console.log("\nblancoInteosSelection.test.mjs\n");

const REQUIRED_FAMILIES = [
  "blanco:inteos-33-workstation",
  "blanco:diamond-50-50",
  "blanco:diamond-60-40",
  "blanco:precis-21",
  "blanco:precis-24",
  "blanco:precis-30-single-bowl",
  "blanco:precis-50-50",
  "blanco:precis-60-40",
  "blanco:super-single",
  "blanco:liven-laundry-12-depth",
  "blanco:ikon-apron-front-single-bowl"
];

const blanco = getCatalogProducts().filter((p) => String(p.productId).startsWith("blanco:"));
const sinkFamilies = blanco.filter((p) => p.category === "sink" && !/strainer|flange/.test(p.productId));
const accessoryFamilies = blanco.filter((p) => p.category === "sink_accessory");

const idCounts = new Map();
for (const p of blanco) {
  idCounts.set(p.productId, (idCounts.get(p.productId) || 0) + 1);
}
const dupIds = [...idCounts.entries()].filter(([, n]) => n > 1);
assert.equal(dupIds.length, 0, `duplicate Blanco productIds: ${JSON.stringify(dupIds)}`);

const skuOwners = new Map();
for (const p of blanco) {
  for (const v of p.variants || []) {
    const sku = String(v.sku || "").toLowerCase();
    if (!sku) continue;
    if (!skuOwners.has(sku)) skuOwners.set(sku, []);
    skuOwners.get(sku).push(p.productId);
  }
}
const dupSkus = [...skuOwners.entries()].filter(([, owners]) => owners.length > 1);
assert.equal(dupSkus.length, 0, `duplicate Blanco SKUs: ${JSON.stringify(dupSkus.slice(0, 5))}`);

for (const sink of sinkFamilies) {
  const accessoryId = `${sink.productId}:accessories`;
  const accessory = getProductById(accessoryId);
  if (accessory) {
    assert.notEqual(accessory.productId, sink.productId);
    assert.equal(accessory.category, "sink_accessory");
  }
}
console.log("ok: Blanco ID collision audit", {
  sinks: sinkFamilies.length,
  accessories: accessoryFamilies.length,
  duplicateIds: 0,
  duplicateSkus: 0
});

const inteos = getProductById("blanco:inteos-33-workstation");
assert.ok(inteos, "Inteos family exists");
assert.equal(inteos.category, "sink");
assert.ok((inteos.variants || []).length >= 2, "Inteos is multi-finish");
assert.equal(inteos.sellPrice, 850);
assert.equal(inteos.requiresCutout, true);
assert.equal(cutoutKeyForSinkSelection("kitchen", inteos), "qty-sink");

const inteosAcc = getProductById("blanco:inteos-33-workstation:accessories");
assert.ok(inteosAcc);
assert.equal(inteosAcc.category, "sink_accessory");
assert.notEqual(inteosAcc.productId, inteos.productId);

assert.throws(
  () => resolveCatalogProductSelection("blanco:inteos-33-workstation", { source: "esf" }),
  (e) => e?.code === "missing_variant_sku"
);
assert.throws(
  () => resolveCatalogProductSelection("blanco:inteos-33-workstation", null),
  (e) => e?.code === "missing_variant_sku"
);

const coal = resolveCatalogProductSelection("blanco:inteos-33-workstation", {
  source: "esf",
  productId: "blanco:inteos-33-workstation",
  variantSku: "443311",
  finish: "Coal Black"
});
assert.equal(coal.variant.sku, "443311");
assert.equal(coal.sellPrice, 850);

const byVariantId = resolveCatalogProductSelection("blanco:inteos-33-workstation", {
  source: "esf",
  variantId: "blanco:inteos-33-workstation:sku:443312"
});
assert.equal(byVariantId.variant.sku, "443312");
assert.equal(byVariantId.sellPrice, 850);

const byResolve = resolveBlancoVariant(
  "blanco:inteos-33-workstation",
  "blanco:inteos-33-workstation:sku:443313"
);
assert.equal(byResolve.sku, "443313");
console.log("ok: Inteos exact finish/SKU/variantId resolution; missing finish throws");

const roomKey = "kitchen-room";
const seeded = buildSinkOptionDefinitions({
  roomKey,
  roomType: "kitchen",
  includeEsfProducts: true
});
const inteosOpt = seeded.find(
  (o) => o.optionKey === `sink:${roomKey}:esf:blanco:inteos-33-workstation`
);
assert.ok(inteosOpt, "Inteos envelope option key");
assert.equal(inteosOpt.compatibilityJson?.productId, "blanco:inteos-33-workstation");
assert.ok(inteosOpt.compatibilityJson?.hasVariants);
assert.ok((inteosOpt.compatibilityJson?.customerSafe?.variants || []).length >= 2);

for (const familyId of REQUIRED_FAMILIES) {
  const product = getProductById(familyId);
  assert.ok(product, `missing family ${familyId}`);
  assert.equal(product.category, "sink", familyId);
  assert.ok((product.variants || []).length >= 1, `${familyId} needs finishes`);
  const roomType = (product.roomEligibility || []).includes("laundry_utility")
    && !(product.roomEligibility || []).includes("kitchen")
    ? "laundry_utility"
    : (product.roomEligibility || []).includes("bar_prep") &&
        !(product.roomEligibility || []).includes("kitchen")
      ? "bar_prep"
      : "kitchen";
  const roomOpts = buildSinkOptionDefinitions({
    roomKey,
    roomType,
    includeEsfProducts: true
  });
  const opt = roomOpts.find((o) => o.optionKey === `sink:${roomKey}:esf:${familyId}`);
  assert.ok(opt, `envelope option missing for ${familyId} in ${roomType}`);
  for (const v of product.variants) {
    const resolved = resolveCatalogProductSelection(familyId, {
      source: "esf",
      productId: familyId,
      variantSku: v.sku,
      variantId: v.variantId,
      finish: v.finish
    });
    assert.equal(resolved.variant.sku, v.sku, `${familyId} ${v.sku}`);
    assert.ok(
      Number.isFinite(resolved.sellPrice) && resolved.sellPrice > 0,
      `${familyId} ${v.sku} price`
    );
  }
}
console.log("ok: table-driven Blanco family/finish/SKU/price/cutout contract");

console.log("\nAll blancoInteosSelection tests passed.\n");
