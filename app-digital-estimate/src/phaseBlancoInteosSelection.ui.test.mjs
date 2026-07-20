/**
 * Blanco Inteos selection UI contract — finish variants from envelope, no 500 path.
 * Run: node app-digital-estimate/src/phaseBlancoInteosSelection.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCatalogProductSelection } from "../../backend-core/src/digitalEstimate/catalog/digitalEstimateProductOptions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewSrc = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const vmSrc = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const apiSrc = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const svcSrc = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/configuration/publicConfigurationService.mjs"),
  "utf8"
);
const routesSrc = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/configuration/publicConfigurationRoutes.js"),
  "utf8"
);

console.log("\nphaseBlancoInteosSelection.ui.test.mjs\n");

assert.ok(viewSrc.includes("o.variants") || viewSrc.includes("variants:"));
assert.ok(viewSrc.includes("Choose a finish for this product before saving"));
assert.ok(viewSrc.includes("productDraftsRef.current = nextDrafts"));
assert.ok(vmSrc.includes("variants: Array.isArray(o.variants)"));
assert.ok(apiSrc.includes("product_variant_required"));
assert.ok(apiSrc.includes("DE-PRODUCT-VARIANT-REQUIRED"));
assert.ok(svcSrc.includes("DE-PRODUCT-VARIANT-REQUIRED"));
assert.ok(routesSrc.includes("DE-PRODUCT-VARIANT-REQUIRED"));
console.log("ok: UI + API wire finish variants and typed 422");

assert.throws(
  () =>
    resolveCatalogProductSelection("blanco:inteos-33-workstation", {
      source: "esf",
      productId: "blanco:inteos-33-workstation",
    }),
  (e) => e.code === "missing_variant_sku",
);
const ok = resolveCatalogProductSelection("blanco:inteos-33-workstation", {
  source: "esf",
  productId: "blanco:inteos-33-workstation",
  variantSku: "443311",
});
assert.equal(ok.sellPrice, 850);
assert.equal(ok.variant.sku, "443311");
console.log("ok: Inteos missing finish vs Coal Black SKU");

console.log("\nphaseBlancoInteosSelection.ui.test.mjs PASSED\n");
