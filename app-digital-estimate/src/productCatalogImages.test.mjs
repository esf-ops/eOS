/**
 * Faucet / product catalog image resolution (exact keys only).
 * Run: node app-digital-estimate/src/productCatalogImages.test.mjs
 */
import assert from "node:assert/strict";
import {
  resolveProductCatalogImage,
  resolveProductImageFields
} from "./productCatalogImages.ts";
import { getCatalogProducts } from "../../backend-core/src/digitalEstimate/catalog/esfPlumbingCatalog.mjs";

console.log("\nproductCatalogImages.test.mjs\n");

const faucets = getCatalogProducts().filter((p) =>
  ["kitchen_faucet", "bar_prep_faucet", "bathroom_faucet", "beverage_faucet"].includes(p.category)
);
assert.equal(faucets.length, 28, `expected 28 faucets, got ${faucets.length}`);

let matched = 0;
const unmatched = [];
for (const f of faucets) {
  const m = resolveProductCatalogImage({
    productId: f.productId,
    sku: f.sku,
    manufacturer: f.manufacturer,
    model: f.model,
    finish: f.finish
  });
  if (m.url) matched += 1;
  else unmatched.push({ productId: f.productId, sku: f.sku, matchType: m.matchType });
}
assert.ok(matched >= 25, `matched faucet images ${matched}/28`);
console.log("ok: faucet image audit", { matched, unmatched: unmatched.length, unmatched });

const delta = resolveProductCatalogImage({
  productId: "faucet:delta-9176-cz-pr-dst",
  sku: "Delta 9176 CZ PR DST"
});
assert.ok(delta.url, "Delta 9176 product_id/sku match");
assert.ok(delta.matchType === "product_id" || delta.matchType === "sku");

const moenSku = resolveProductCatalogImage({
  productId: "faucet:moen-7864-orb",
  sku: "Moen 7864 ORB"
});
assert.ok(moenSku.url, "Moen ORB exact match");

const moenNorm = resolveProductCatalogImage({
  productId: "faucet:moen-7864srs",
  sku: "Moen 7864SRS"
});
assert.ok(moenNorm.url, "hyphen/colon product id + compact model match");
assert.equal(moenNorm.matchType, "product_id");

const moenSkuExact = resolveProductCatalogImage({
  productId: "x",
  sku: "Moen 7864 ORB"
});
assert.ok(moenSkuExact.url, "exact SKU map key");
assert.ok(moenSkuExact.matchType === "sku" || moenSkuExact.matchType === "normalized_sku");

const moenCompact = resolveProductCatalogImage({
  productId: "x",
  sku: "MOEN7864ORB"
});
assert.ok(moenCompact.url, "normalized compact SKU match");
assert.equal(moenCompact.matchType, "normalized_sku");

// Reject broad substring: unrelated model must not steal another faucet's image via partial id.
const wrong = resolveProductCatalogImage({
  productId: "faucet:delta-9999-fake",
  sku: "Delta 9999 FAKE"
});
assert.equal(wrong.url, null);
assert.equal(wrong.matchType, "none");
console.log("ok: exact Delta/Moen matches; broad miss rejected");

const missing = resolveProductImageFields({
  productId: "faucet:moen-5965",
  sku: "Moen 5965"
});
assert.equal(missing.imageStatus, "fallback");
assert.equal(missing.thumbnailUrl, null);
console.log("ok: missing image falls back without blocking fields");

console.log("\nAll productCatalogImages tests passed.\n");
