/**
 * ESF plumbing workbook normalizer + customer-safe projection tests.
 * Run: node backend-core/src/digitalEstimate/catalog/normalizeEsfPlumbingWorkbook.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CUSTOMER_UNSAFE_PRODUCT_KEYS,
  customerAvailabilityText,
  toCustomerSafeProduct
} from "./esfPlumbingCatalogContract.mjs";
import {
  normalizeEsfPlumbingWorkbook,
  isExcludedHelperText,
  SHEET_KANSAS,
  SHEET_BLANCO,
  SHEET_FAUCETS,
  SHEET_SPECIALTY
} from "./normalizeEsfPlumbingWorkbook.mjs";
import {
  getProductById,
  listProducts,
  resolveBlancoVariant,
  getCutoutCatalogKeyForProduct
} from "./esfPlumbingCatalog.mjs";
import {
  MISSING_INFO_REQUIREMENT_CODES,
  buildMissingInformationRequirements
} from "./customerDraftRequirements.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const WORKBOOK = path.join(
  ROOT,
  "_local/catalog-source/esf-plumbing-specialty-program-2026-07-10.xlsx"
);

assert.ok(fs.existsSync(WORKBOOK), `workbook missing: ${WORKBOOK}`);

const result = normalizeEsfPlumbingWorkbook(WORKBOOK);
const { products, excludedRows, qualityReport } = result;

assert.equal(result.contract, "esf-plumbing-specialty-catalog-v1");
assert.ok(products.length > 0, "expected normalized products");

// --- headings / helpers excluded ---
assert.ok(isExcludedHelperText("Pricing Calculator"));
assert.ok(isExcludedHelperText("Input item cost and your selling price will populate."));
assert.ok(
  isExcludedHelperText(
    "Any plumbing items not included in the program will use a 35% margin calculation.  Calculator to the right."
  )
);

const helperProducts = products.filter(
  (p) =>
    /pricing calculator/i.test(p.displayName) ||
    /input item cost/i.test(p.description || "") ||
    /margin calculation/i.test(p.description || "") ||
    /any plumbing items not included/i.test(p.description || "")
);
assert.equal(helperProducts.length, 0, "cost/margin calculator rows must never become products");

const excludedReasons = new Set(excludedRows.map((r) => r.reason));
assert.ok(excludedReasons.has("helper_or_heading") || excludedReasons.has("blank_row"));

const calculatorExcluded = excludedRows.filter(
  (r) =>
    r.reason === "helper_or_heading" ||
    r.reason === "zero_value_calculator_output"
);
assert.ok(calculatorExcluded.length > 0, "expected calculator/helper exclusions");

// --- Kansas real rows with sell prices ---
const kansas = products.filter((p) => p.sourceSheet === SHEET_KANSAS);
assert.ok(kansas.length >= 40, `expected Kansas products, got ${kansas.length}`);
for (const p of kansas) {
  assert.equal(p.pricingTreatment, "priced");
  assert.equal(typeof p.sellPrice, "number");
  assert.ok(p.sellPrice > 0, `${p.productId} sellPrice`);
  assert.ok(p.productId.startsWith("kansas:"));
}
const kansasSink = kansas.find((p) => p.sku === "1512UM18" || p.productId === "kansas:1512UM18");
assert.ok(kansasSink, "1512UM18 Kansas sink");
assert.equal(kansasSink.sellPrice, 90);
assert.equal(kansasSink.availability, "stock");
assert.equal(kansasSink.requiresCutout, true);
assert.ok(kansasSink.roomEligibility.includes("bar_prep"));

const kansasGrid = kansas.find((p) => /grid/i.test(p.displayName) && /2317/i.test(p.sku || p.productId));
assert.ok(kansasGrid, "2317 grid accessory");
assert.equal(kansasGrid.category, "sink_accessory");
assert.equal(kansasGrid.requiresCutout, false);

const vanity = kansas.find((p) => /VC1512/i.test(p.sku || ""));
assert.ok(vanity);
assert.ok(vanity.roomEligibility.includes("vanity"));
assert.equal(vanity.relatedCutoutType, "vanity_cutout");

// --- Stock / Non Stock → customer availability text ---
assert.equal(customerAvailabilityText("stock"), "In stock");
assert.equal(customerAvailabilityText("special_order"), "Special order");
const stockSafe = toCustomerSafeProduct(kansasSink);
assert.equal(stockSafe.availabilityText, "In stock");
const nonStock = kansas.find((p) => p.availability === "special_order");
assert.ok(nonStock);
assert.equal(toCustomerSafeProduct(nonStock).availabilityText, "Special order");

// --- Blanco family + variants ---
const blanco = products.filter((p) => p.sourceSheet === SHEET_BLANCO);
assert.ok(blanco.length > 5, "expected Blanco family products");
const diamond5050 = blanco.find(
  (p) =>
    p.category === "sink" &&
    /diamond/i.test(p.displayName) &&
    /50\/50|50-50/i.test(p.displayName + p.productId)
);
assert.ok(diamond5050, "Blanco Diamond 50/50 family");
assert.ok(Array.isArray(diamond5050.variants) && diamond5050.variants.length > 1);
const cafeVariant = diamond5050.variants.find((v) => String(v.sku) === "440182");
assert.ok(cafeVariant);
assert.equal(cafeVariant.sellPrice, 500);
assert.ok(cafeVariant.finish || cafeVariant.color);

// Color SKUs are variants — not separate top-level products per SKU
const topLevelColorSku = products.filter((p) => p.productId.includes("440182"));
assert.equal(topLevelColorSku.length, 0);

const accessories = blanco.filter((p) => p.category === "sink_accessory");
assert.ok(accessories.length > 0);
const linked = accessories.find((p) => (p.compatibleFamilyIds || []).includes(diamond5050.productId));
assert.ok(linked, "accessory linked via compatibleFamilyIds");

// --- Faucet sell prices ---
const faucets = products.filter((p) => p.sourceSheet === SHEET_FAUCETS);
assert.ok(faucets.length >= 30);
for (const f of faucets) {
  assert.ok(f.productId.startsWith("faucet:"));
  assert.equal(typeof f.sellPrice, "number");
  assert.ok(f.sellPrice > 0);
}
const stryke = faucets.find((p) => /9176/i.test(p.sku || p.productId));
assert.ok(stryke);
assert.equal(stryke.sellPrice, 850);
assert.equal(stryke.category, "kitchen_faucet");

const bathroom = faucets.find((p) => p.category === "bathroom_faucet");
assert.ok(bathroom);
const soap = faucets.find((p) => p.category === "soap_dispenser");
assert.ok(soap);

// --- Specialty priced vs review-only ---
const specialty = products.filter((p) => p.sourceSheet === SHEET_SPECIALTY);
assert.ok(specialty.length >= 10);
const pricedSpecialty = specialty.filter((p) => p.pricingTreatment === "priced");
const reviewSpecialty = specialty.filter((p) => p.pricingTreatment === "review_only");
assert.ok(pricedSpecialty.length >= 8);
assert.ok(reviewSpecialty.length >= 2);
for (const p of pricedSpecialty) {
  assert.equal(typeof p.sellPrice, "number");
  assert.ok(p.sellPrice > 0);
  assert.equal(p.estimatorReviewRequired, false);
}
for (const p of reviewSpecialty) {
  assert.equal(p.sellPrice, undefined);
  assert.equal(p.customerVisible, true);
  assert.equal(p.estimatorReviewRequired, true);
}
assert.ok(reviewSpecialty.some((p) => /glowback/i.test(p.displayName)));
assert.ok(reviewSpecialty.some((p) => /invisacook/i.test(p.displayName)));

// --- customer-safe projection strips cost/margin ---
const dirty = {
  ...kansasSink,
  itemCost: 40,
  margin: 0.35,
  wholesale: 50,
  vendorCost: 35,
  internalNotes: "do not show",
  rawPricing: { itemCost: 40 }
};
const safe = toCustomerSafeProduct(dirty);
assert.ok(safe);
for (const key of CUSTOMER_UNSAFE_PRODUCT_KEYS) {
  assert.equal(Object.prototype.hasOwnProperty.call(safe, key), false, `leaked ${key}`);
}
assert.equal(safe.sellPrice, kansasSink.sellPrice);
assert.equal(safe.availabilityText, "In stock");

// --- Seed catalog accessors (after build; seed may be empty placeholder) ---
// Inject by re-reading if seed was built; otherwise exercise resolve on in-memory family.
{
  assert.ok(cafeVariant.finish || cafeVariant.color, "variant has finish/color");
  const finishNeedle = String(cafeVariant.finish || cafeVariant.color).toLowerCase();
  assert.ok(/caf/.test(finishNeedle), `expected cafe-like finish, got ${finishNeedle}`);
  // Exact SKU resolution uniqueness
  const exact = diamond5050.variants.find((v) => String(v.sku) === "440182");
  assert.equal(exact.sku, "440182");
}

assert.equal(getCutoutCatalogKeyForProduct(kansasSink), "qty-bar");
assert.equal(getCutoutCatalogKeyForProduct(vanity), "qty-bar");
assert.equal(getCutoutCatalogKeyForProduct(kansasGrid), null);
const kitchenKansas = kansas.find((p) => p.sku === "3018UM18" || p.productId === "kansas:3018UM18");
assert.ok(kitchenKansas);
assert.equal(getCutoutCatalogKeyForProduct(kitchenKansas), "qty-sink");

// If seed has been built, exercise catalog module APIs
const seeded = listProducts({});
if (seeded.length > 0) {
  const id = seeded[0].productId;
  assert.equal(getProductById(id)?.productId, id);
  const kitchen = listProducts({ roomType: "kitchen", customerVisibleOnly: true });
  assert.ok(kitchen.length > 0);
  const family = seeded.find((p) => p.productId === diamond5050.productId);
  if (family) {
    const v = resolveBlancoVariant(family.productId, "440182");
    assert.ok(v);
    assert.equal(String(v.sku), "440182");
    const ambiguous = resolveBlancoVariant(family.productId, "nonexistent-finish-xyz");
    assert.equal(ambiguous, null);
  }
}

// --- missing information requirements (non-blocking) ---
const reqs = buildMissingInformationRequirements({
  rooms: [
    {
      roomKey: "kitchen-1",
      sink: { source: "customer_provided" },
      faucet: { source: "customer_provided", requiresHoleCount: true },
      backsplash: { mode: "custom", requestedHeightIn: 8 },
      specialtyItems: [{ productId: "specialty:glowback", pricingTreatment: "review_only" }]
    },
    {
      roomKey: "kitchen-2",
      backsplash: { mode: "full_height" },
      sink: { source: "esf", availability: "special_order" }
    }
  ]
});
const codes = new Set(reqs.map((r) => r.code));
assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.customer_sink_model_required));
assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.customer_faucet_model_required));
assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.faucet_hole_count_required));
assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.custom_backsplash_height_review));
assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.specialty_item_quote_required));
assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.full_height_measurement_required));
assert.ok(codes.has(MISSING_INFO_REQUIREMENT_CODES.product_availability_confirmation_required));
assert.ok(reqs.every((r) => r.blocksSave === false));

console.log("ok: normalizeEsfPlumbingWorkbook tests passed");
console.log(
  JSON.stringify(
    {
      productCount: products.length,
      countsBySheet: qualityReport.countsBySheet,
      countsByCategory: qualityReport.countsByCategory,
      excludedRowCount: excludedRows.length
    },
    null,
    2
  )
);
