/**
 * productCatalogFaucetAssetImport — unit tests
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  expectedProductIdFromFolder,
  findCatalogMatches,
  buildProposedFaucetOverride,
  pickDefaultFinishKey,
  FAUCET_IMPORT_ACTION,
  manufacturerMatchesCatalogItem,
} from "./productCatalogFaucetAssetImport.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CATALOG_DATA = path.join(ROOT, "app-slab-inventory/src/lib/productCatalogData.ts");

function test(name, fn) {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}

const sampleCatalog = [
  {
    id: "faucet-delta-559lf-blmpu",
    category: "faucet",
    name: "Trinsic Pro Single Handle Pull Down",
    sku: "Delta 559LF BLMPU",
    type: "Faucet",
  },
  {
    id: "faucet-delta-9176-cz-pr-dst",
    category: "faucet",
    name: "Stryke Single Handle Pull Down Kitchen Faucet",
    sku: "Delta 9176 CZ PR DST",
    type: "Faucet",
  },
  {
    id: "faucet-moen-6702-bl",
    category: "faucet",
    name: "Align Single Handle Pull Down",
    sku: "Moen 6702 BL",
    type: "Faucet",
  },
  {
    id: "faucet-delta-1930-ar-dst",
    category: "faucet",
    name: "Pilar Single Handle Pull Down",
    sku: "Delta 1930 AR DST",
    type: "Faucet",
  },
];

test("expectedProductIdFromFolder slug matches catalog ids", () => {
  assert.equal(expectedProductIdFromFolder("Delta 559LF BLMPU"), "faucet-delta-559lf-blmpu");
  assert.equal(expectedProductIdFromFolder("Moen 6702 BL"), "faucet-moen-6702-bl");
});

test("findCatalogMatches resolves Delta 559LF BLMPU folder", () => {
  const matches = findCatalogMatches(sampleCatalog, "Delta", "Delta 559LF BLMPU", new Map());
  assert.equal(matches.length, 1);
  assert.equal(matches[0].item.id, "faucet-delta-559lf-blmpu");
});

test("findCatalogMatches does not cross-match Moen folder to Delta item", () => {
  const matches = findCatalogMatches(sampleCatalog, "Moen", "Moen 6702 BL", new Map());
  assert.equal(matches.length, 1);
  assert.equal(matches[0].item.id, "faucet-moen-6702-bl");
  assert.notEqual(matches[0].item.id, "faucet-delta-559lf-blmpu");
});

test("manufacturer guard blocks cross-brand id", () => {
  const deltaItem = sampleCatalog[0];
  assert.equal(manufacturerMatchesCatalogItem("Delta", deltaItem), true);
  assert.equal(manufacturerMatchesCatalogItem("Moen", deltaItem), false);
});

test("pickDefaultFinishKey prefers matte-black", () => {
  assert.equal(
    pickDefaultFinishKey(["chrome.png", "matte-black.png"]),
    "matte-black"
  );
});

test("buildProposedFaucetOverride uses finish map hero", () => {
  const override = buildProposedFaucetOverride({
    productId: "faucet-delta-559lf-blmpu",
    finishImages: ["matte-black.png"],
    defaultFinishKey: "matte-black",
    sourceNotes: "test",
  });
  assert.equal(override.imageUrl, "/product-catalog/faucets/faucet-delta-559lf-blmpu/matte-black.png");
  assert.equal(override.finishImageUrls["matte-black"], override.imageUrl);
  assert.equal(override.specSheetUrl, "/product-catalog/spec-sheets/faucet-delta-559lf-blmpu/faucet-delta-559lf-blmpu.pdf");
});

test("Calacatta unrelated — Delta Lucent folder would not match Athena", () => {
  const catalog = [
    ...sampleCatalog,
    {
      id: "faucet-delta-9176-cz-pr-dst",
      category: "faucet",
      name: "Stryke",
      sku: "Delta 9176 CZ PR DST",
      type: "Faucet",
    },
  ];
  const matches = findCatalogMatches(catalog, "Delta", "Delta 9176 CZ PR DST", new Map());
  assert.equal(matches[0].item.id, "faucet-delta-9176-cz-pr-dst");
  assert.notEqual(matches[0].item.id, "faucet-delta-559lf-blmpu");
});

console.log("\nproductCatalogFaucetAssetImport tests passed.");
