/**
 * Accessory compatibility + sink/cutout composition + breakdown clarity.
 * Run: node app-digital-estimate/src/phaseSinkEligibilityAccessories.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyAccessoryKind,
  buildSinkOptionDefinitions,
  buildAccessoryOptionDefinitions,
  cutoutKeyForSinkSelection
} from "../../backend-core/src/digitalEstimate/catalog/digitalEstimateProductOptions.mjs";
import { getProductById, listProducts } from "../../backend-core/src/digitalEstimate/catalog/esfPlumbingCatalog.mjs";
import { cutoutDisplayLabelForRoom } from "../../backend-core/src/digitalEstimate/catalog/roomEligibility.mjs";
import { buildUpdatedBreakdown } from "./customerEstimateBreakdown.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewSrc = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const svcSrc = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/configuration/publicConfigurationService.mjs"),
  "utf8"
);

console.log("\nphaseSinkEligibilityAccessories.ui.test.mjs\n");

assert.ok(viewSrc.includes("clearIncompatibleAccessoriesForRoom"));
assert.ok(viewSrc.includes("de-accessory-compat-notice"));
assert.ok(svcSrc.includes("Strip / reject sink-specific accessories") || svcSrc.includes("incompatible_accessory"));
assert.ok(svcSrc.includes("cutoutDisplayLabelForRoom"));
console.log("ok: accessory strip + notice + cutout labels wired");

const grid = listProducts({ category: "sink_accessory", customerVisibleOnly: true })[0];
assert.ok(grid);
assert.equal(classifyAccessoryKind(grid), "sink_accessory");
const soap = listProducts({ category: "soap_dispenser", customerVisibleOnly: true })[0];
assert.ok(soap);
assert.equal(classifyAccessoryKind(soap), "plumbing_addon");
console.log("ok: accessory classification");

const kitchenAccessories = buildAccessoryOptionDefinitions({
  roomKey: "k1",
  roomType: "kitchen"
});
assert.ok(kitchenAccessories.some((o) => o.compatibilityJson?.accessoryKind === "sink_accessory"));
assert.ok(kitchenAccessories.some((o) => o.compatibilityJson?.accessoryKind === "plumbing_addon"));
console.log("ok: accessories separate sink-specific vs plumbing add-ons");

const sink = getProductById("kansas:3218UM18SS") || listProducts({ category: "sink" })[0];
assert.ok(sink);
assert.equal(cutoutKeyForSinkSelection("kitchen", sink), "qty-sink");
assert.equal(cutoutKeyForSinkSelection("bar_prep", null), "qty-bar");

const updated = buildUpdatedBreakdown({
  calculation: {
    configuredDisplayTotal: 1000,
    options: [
      {
        optionKey: `sink:k1:esf:${sink.productId}`,
        displayLabel: `ESF Sink — ${sink.displayName}`,
        visiblePrice: Number(sink.sellPrice) || 100,
        included: false
      },
      {
        optionKey: "qty-sink:k1",
        displayLabel: cutoutDisplayLabelForRoom("kitchen", "Kitchen"),
        visiblePrice: 150,
        included: false
      }
    ]
  }
});
const labels = updated.lines.map((l) => l.label);
assert.ok(labels.some((l) => /^ESF Sink/.test(l)), labels.join(" | "));
assert.ok(labels.some((l) => l === "Kitchen — Sink cutout"), labels.join(" | "));
assert.ok(!labels.includes("Vanity / bar sink cutout"));
console.log("ok: room-specific updated breakdown lines");

// Price reconciliation sample: every kitchen sink option sellPrice matches catalog.
const kitchenOpts = buildSinkOptionDefinitions({
  roomKey: "k1",
  roomType: "kitchen",
  includeEsfProducts: true
});
let mismatches = 0;
for (const opt of kitchenOpts.filter((o) => String(o.optionKey).includes(":esf:"))) {
  const id = opt.compatibilityJson?.productId;
  const product = getProductById(id);
  if (!product) {
    mismatches += 1;
    continue;
  }
  if (Number(opt.sellPrice) !== Number(product.sellPrice)) mismatches += 1;
}
assert.equal(mismatches, 0, "kitchen sink option prices must match catalog");
console.log("ok: kitchen sink price reconciliation");

console.log("\nAll phaseSinkEligibilityAccessories tests passed.\n");
