/**
 * Approved product catalog cleanup — hierarchy, project add-ons, pricing authority.
 * Run: node app-digital-estimate/src/phaseApprovedProductCatalog.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCatalogProducts,
  listProducts,
  resolveBlancoVariant,
} from "../../backend-core/src/digitalEstimate/catalog/esfPlumbingCatalog.mjs";
import { customerAvailabilityText } from "../../backend-core/src/digitalEstimate/catalog/esfPlumbingCatalogContract.mjs";
import { isAccessoryFamilyHeading } from "../../backend-core/src/digitalEstimate/catalog/customerFacingCopy.mjs";
import { resolveCatalogProductSelection } from "../../backend-core/src/digitalEstimate/catalog/digitalEstimateProductOptions.mjs";
import { buildQuoteLibraryCustomerConfigProjection } from "../../backend-core/src/digitalEstimate/catalog/quoteLibraryCustomerConfigProjection.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewSrc = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const vmSrc = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const quality = JSON.parse(
  readFileSync(
    join(__dirname, "../../docs/digital-estimate/ESF_PLUMBING_CATALOG_QUALITY_REPORT.json"),
    "utf8",
  ),
);

console.log("\nphaseApprovedProductCatalog.ui.test.mjs\n");

const products = getCatalogProducts();
const sinks = listProducts({ category: "sink", customerVisibleOnly: true });
const faucets = [
  ...listProducts({ category: "kitchen_faucet", customerVisibleOnly: true }),
  ...listProducts({ category: "bar_prep_faucet", customerVisibleOnly: true }),
  ...listProducts({ category: "bathroom_faucet", customerVisibleOnly: true }),
  ...listProducts({ category: "beverage_faucet", customerVisibleOnly: true }),
];
const accessories = listProducts({ category: "sink_accessory", customerVisibleOnly: true });
const specialty = listProducts({ category: "specialty", customerVisibleOnly: true });

assert.equal(quality.productCount, products.length);
assert.ok(sinks.length >= 20, `approved sinks: ${sinks.length}`);
assert.ok(faucets.length >= 20, `approved faucets: ${faucets.length}`);
assert.ok(accessories.length >= 10, `accessories: ${accessories.length}`);
assert.ok(specialty.length >= 5, `specialty: ${specialty.length}`);
assert.equal(quality.excludedRowCount, 53);
assert.ok(Array.isArray(quality.excludedRows) && quality.excludedRows.length === 53);
assert.ok(quality.excludedRows.every((r) => r.reason), "every excluded row has a reason");
console.log("ok: 1–7 workbook classification + exclusion reasons");

const ids = new Set(products.map((p) => p.productId));
assert.equal(ids.size, products.length, "stable unique product IDs");
const skuCounts = new Map();
for (const p of products) {
  for (const v of p.variants || []) {
    if (!v.sku) continue;
    const k = String(v.sku).toLowerCase();
    skuCounts.set(k, (skuCounts.get(k) || 0) + 1);
  }
  if (p.sku) {
    const k = String(p.sku).toLowerCase();
    skuCounts.set(k, (skuCounts.get(k) || 0) + 1);
  }
}
const dupSkus = [...skuCounts.entries()].filter(([, n]) => n > 1);
assert.equal(dupSkus.length, 0, `duplicate SKUs: ${JSON.stringify(dupSkus.slice(0, 5))}`);
console.log("ok: unique IDs / no duplicate SKUs");

assert.ok(viewSrc.includes("ESF Sinks") && viewSrc.includes("ESF Faucets"));
assert.ok(viewSrc.includes("de-${role}-source-esf") || viewSrc.includes('source-esf'));
assert.ok(!viewSrc.includes("ESF Stock Sinks"));
assert.ok(!viewSrc.includes("Special-Order Sinks"));
assert.ok(!viewSrc.includes("de-sink-source-stock"));
assert.ok(!viewSrc.includes('"Special order"'));
assert.equal(customerAvailabilityText("stock"), null);
assert.equal(customerAvailabilityText("special_order"), null);
console.log("ok: 8–11 / 17–18 unified ESF hierarchy; no Stock/Special Order labels");

{
  const family = sinks.find((p) => Array.isArray(p.variants) && p.variants.length > 1);
  assert.ok(family, "multi-finish sink family");
  const v = family.variants[0];
  const resolved = resolveCatalogProductSelection(family.productId, {
    source: "esf",
    productId: family.productId,
    variantSku: v.sku,
  });
  assert.equal(resolved.variant.sku, v.sku);
  assert.equal(resolved.sellPrice, v.sellPrice);
  assert.throws(
    () =>
      resolveCatalogProductSelection(family.productId, {
        source: "esf",
        productId: family.productId,
      }),
    (e) => e.code === "missing_variant_sku",
  );
  const bySku = resolveBlancoVariant(family.productId, v.sku);
  assert.equal(bySku.sku, v.sku);
}
console.log("ok: 12–14 / 20–21 exact finish → SKU → price");

assert.ok(viewSrc.includes("customer_sink_model_required") || viewSrc.includes("provide the model later"));
assert.ok(viewSrc.includes("de-faucet-hole-count") || viewSrc.includes("holeCount"));
assert.ok(viewSrc.includes("Faucet and plumbing add-ons"));
assert.ok(viewSrc.includes("Project add-ons"));
assert.ok(!viewSrc.includes("Approved add-ons"));
assert.ok(vmSrc.includes("qty-sink") && vmSrc.includes("return false"));
console.log("ok: customer-provided fields + project add-ons filter");

assert.ok(
  accessories.every((p) => !isAccessoryFamilyHeading(p) || (p.variants || []).length > 0),
);
console.log("ok: accessory family headings are not bare selectable products without variants");

{
  const proj = buildQuoteLibraryCustomerConfigProjection({
    configuredTotal: 9000,
    baselineTotal: 8000,
    selectedMaterialSummary: "Carrara Classic",
    selectedSinkSummary: "3218UM18SS",
    selectedFaucetSummary: "Delta Trinsic",
    reviewRequested: true,
    reviewOnlyOutstandingCount: 1,
    missingInformationRequirements: [{ code: "customer_sink_model_required" }],
  });
  assert.equal(proj.configuredTotal, 9000);
  assert.equal(proj.deltaFromPublished, 1000);
  assert.equal(proj.selectedSinkSummary, "3218UM18SS");
  assert.equal(proj.selectedFaucetSummary, "Delta Trinsic");
  assert.equal(proj.reviewRequested, true);
  assert.equal(proj.missingInformationCount, 1);
  assert.equal(proj.status, "Customer configuring");
}
console.log("ok: Quote Library projection contract");

assert.ok(viewSrc.includes("de-${role}-product-catalog") || viewSrc.includes("product-catalog"));
assert.ok(viewSrc.includes("de-${role}-catalog-search") || viewSrc.includes("catalog-search"));
assert.ok(viewSrc.includes("xl:grid-cols-4"));
assert.ok(viewSrc.includes('loading="lazy"') || viewSrc.includes("MaterialThumb"));
console.log("ok: catalog modal search / responsive grid / lazy thumbs");

console.log("\nphaseApprovedProductCatalog.ui.test.mjs PASSED\n");
console.log(
  JSON.stringify(
    {
      sinks: sinks.length,
      faucets: faucets.length,
      accessories: accessories.length,
      specialty: specialty.length,
      excluded: quality.excludedRowCount,
      missingImages: (quality.missingImages || []).length,
    },
    null,
    2,
  ),
);
