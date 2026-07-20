/**
 * Digital Estimate — breakdowns, controls, assets, layout phase tests.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildChangesBreakdown,
  buildOriginalBreakdown,
  buildUpdatedBreakdown,
} from "./customerEstimateBreakdown.ts";
import { resolveProductCatalogImageUrl } from "./productCatalogImages.ts";
import { listProducts } from "../../backend-core/src/digitalEstimate/catalog/esfPlumbingCatalog.mjs";
import { isNonSinkPlumbingRow } from "../../backend-core/src/digitalEstimate/catalog/digitalEstimateProductOptions.mjs";
import { customerPriceEffectLabel } from "../../backend-core/src/digitalEstimate/catalog/customerFacingCopy.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = __dirname;
const appRoot = join(srcRoot, "..");
const repoRoot = join(appRoot, "..");

const configView = readFileSync(join(srcRoot, "ConfigurationView.tsx"), "utf8");
const vm = readFileSync(join(srcRoot, "lovableViewModel.ts"), "utf8");
const api = readFileSync(join(srcRoot, "publicConfigApi.ts"), "utf8");
const copy = readFileSync(
  join(repoRoot, "backend-core/src/digitalEstimate/catalog/customerFacingCopy.mjs"),
  "utf8",
);

// Layout
assert.ok(configView.includes("de-page-shell"));
assert.ok(configView.includes("w-[min(95vw,1650px)]") || configView.includes("max-w-[1650px]"));
assert.ok(configView.includes("de-main-layout"));
assert.ok(configView.includes("lg:sticky"));
assert.ok(configView.includes("de-estimate-workspace"));
assert.ok(configView.includes("de-room-selections") || configView.includes("md:grid-cols-2"));
assert.ok(configView.includes("xl:grid-cols-4") || configView.includes("lg:grid-cols-3"));
assert.ok(configView.includes("max-w-[1200px]"));
assert.equal(configView.includes("Wholesale"), false);
assert.equal(/\bcost\b/i.test(configView.match(/data-testid="de-estimate-breakdown"[\s\S]{0,800}/)?.[0] || ""), false);

// Estimate tabs / breakdown
assert.ok(configView.includes("de-estimate-tabs"));
assert.ok(configView.includes("de-estimate-tab-"));
assert.ok(configView.includes('["original", "Original"]') || configView.includes('"original"'));
assert.ok(configView.includes('["updated", "Updated"]') || configView.includes('"updated"'));
assert.ok(configView.includes('["changes", "Changes"]') || configView.includes('"changes"'));
assert.ok(configView.includes("buildOriginalBreakdown"));
assert.ok(configView.includes("buildUpdatedBreakdown"));
assert.ok(configView.includes("buildChangesBreakdown"));

const original = buildOriginalBreakdown({
  lineItems: [{ label: "Fabrication", amount: 1200 }],
  rooms: [{ name: "Kitchen", colorLabel: "Carrara Classic", materialLabel: "Group Promo", summaryLines: [] }],
  totals: { estimatedProjectTotal: 8400 },
});
assert.equal(original.kind, "original");
assert.equal(original.total, 8400);
assert.ok(original.lines.some((l) => l.label === "Fabrication"));

const updated = buildUpdatedBreakdown({
  calculation: {
    configuredDisplayTotal: 9000,
    options: [{ optionKey: "edge:k:d", displayLabel: "D edge", quantity: 1, visiblePrice: 200 }],
    customFacingLines: [],
    rooms: [{ roomKey: "k", displayName: "Kitchen", selectedMaterialLabel: "Skara Brae" }],
  },
});
assert.equal(updated.total, 9000);
assert.ok(updated.lines.some((l) => /D edge|Skara/.test(l.label)));

const changes = buildChangesBreakdown({
  changeLines: [
    {
      roomName: "Reception Desk",
      category: "Material",
      originalLabel: "Group Promo",
      newLabel: "Skara Brae, Group F",
      delta: 2064,
    },
  ],
  displayTotalDelta: 2064,
});
assert.ok(changes.lines[0].label.includes("Material:"));
assert.ok(changes.lines[0].amountLabel.startsWith("+$"));

// Edge dropdown
assert.ok(configView.includes("de-edge-dropdown"));
assert.ok(configView.includes("Edge profile"));
assert.equal(configView.includes("de-edge-modal"), false);
assert.ok(configView.includes("onEdgeChange"));

// Backsplash / price effect wording
assert.ok(copy.includes("Original selection"));
assert.ok(vm.includes("Original selection"));
assert.equal(customerPriceEffectLabel({ includedInBaseline: true }), "Original selection");
assert.equal(customerPriceEffectLabel({ customerPriceTreatment: "no_change" }), "No change");
assert.equal(customerPriceEffectLabel({ reviewRequired: true }), "Requires estimator review");

// Customer info autosave pipeline
assert.ok(configView.includes("saveFnRef"));
assert.ok(configView.includes("hydrateReadyRef"));
assert.ok(configView.includes("450"));
assert.ok(configView.includes('setSaveState("unsaved")'));
assert.ok(configView.includes("infoDraft"));

// Sink hierarchy
assert.ok(configView.includes("de-sink-source-stock"));
assert.ok(configView.includes("de-sink-source-special-order"));
assert.ok(configView.includes("ESF Stock Sinks"));
assert.ok(configView.includes("Special-Order Sinks"));
assert.ok(configView.includes("de-${role}-source-${kind}") || configView.includes('["none", noneLabel]'));
assert.ok(configView.includes("customer_provided"));

const sinks = listProducts({ category: "sink", customerVisibleOnly: true }).filter(
  (p) => p.active && !isNonSinkPlumbingRow(p),
);
const stock = sinks.filter((p) => p.availability === "stock");
const special = sinks.filter((p) => p.availability !== "stock");
assert.ok(stock.length >= 10, `expected stock sinks, got ${stock.length}`);
assert.ok(special.length >= 10, `expected special-order sinks, got ${special.length}`);
assert.ok(!sinks.some((p) => /strainer|flange/i.test(p.displayName)));

// Images
assert.ok(existsSync(join(appRoot, "public/product-catalog/sinks")));
assert.ok(existsSync(join(appRoot, "public/materials/elite100/thumb")));
const eliteThumbs = readdirSync(join(appRoot, "public/materials/elite100/thumb")).filter((f) =>
  /\.(jpg|jpeg|png|webp)$/i.test(f),
);
assert.equal(eliteThumbs.length, 11, "Elite 100 deployable thumbs remain the 11 reconciled pilots");
assert.ok(resolveProductCatalogImageUrl({ productId: "kansas:1512UM18" }));
assert.ok(resolveProductCatalogImageUrl({ productId: "blanco:diamond-50-50" }));
assert.equal(resolveProductCatalogImageUrl({ productId: "totally-unknown-xyz" }), null);

const imageMap = JSON.parse(readFileSync(join(srcRoot, "productCatalogImageMap.json"), "utf8"));
assert.ok(Object.keys(imageMap).length > 50);

assert.ok(configView.includes("de-color-preview-full"));
assert.ok(configView.includes('loading="lazy"'));
assert.ok(configView.includes("de-material-thumb"));
assert.ok(vm.includes("thumbnailUrl"));
assert.ok(api.includes("thumbnailUrl") && api.includes("previewUrl"));

// Modal sticky header
assert.ok(configView.includes("sticky top-0"));

console.log(
  JSON.stringify(
    {
      stockSinks: stock.length,
      specialOrderSinks: special.length,
      eliteThumbs: eliteThumbs.length,
      productCatalogMapKeys: Object.keys(imageMap).length,
      productCatalogPublicBytes: (() => {
        function walk(d) {
          let n = 0;
          for (const f of readdirSync(d)) {
            const p = join(d, f);
            const st = statSync(p);
            n += st.isDirectory() ? walk(p) : st.size;
          }
          return n;
        }
        return walk(join(appRoot, "public/product-catalog"));
      })(),
    },
    null,
    2,
  ),
);
console.log("ok: phaseBreakdownsControlsAssetsLayout");
