/**
 * Phase DE.2H — Digital Estimate UI material/color journey static checks.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listElite100CustomerMaterials } from "../../backend-core/src/digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const configView = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const adapter = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const api = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");

assert.ok(configView.includes("ColorPickerModal"));
assert.ok(configView.includes("Search color"));
assert.ok(configView.includes("CustomerRoomCard"));
assert.ok(configView.includes("lg:sticky"));
assert.ok(configView.includes("fixed inset-x-0 bottom-0"));
assert.ok(api.includes("CustomerMaterial"));
assert.ok(api.includes("materials?"));
assert.ok(adapter.includes("mapEliteOsToLovableViewModel"));
assert.ok(adapter.includes("buildSelectionItems"));
assert.equal(/priceOrder|GROUP_PRICING|customer-supplied total/.test(configView + adapter), false);
assert.equal(/https?:\/\//.test(adapter.match(/imageAssetPath[\s\S]{0,80}/)?.[0] || ""), false);
assert.ok(configView.includes("de-color-modal") || configView.includes("ColorPickerModal"));
assert.ok(configView.includes("groupColorsByPricingGroup") || configView.includes("pricingGroupLabel"));
assert.ok(configView.includes("de-customer-info") || configView.includes("Customer information"));

// Thumbs lazy; full image only in preview pane
assert.ok(configView.includes('loading="lazy"') || configView.includes("loading={'lazy'}"));
assert.ok(configView.includes("de-color-preview") || configView.includes("de-color-preview-full"));
assert.ok(configView.includes("imageThumb"));
assert.ok(configView.includes("imageFull"));
assert.ok(
  configView.includes("de-material-placeholder") || configView.includes("No image"),
  "polished no-image placeholder required"
);

const fullDir = join(appRoot, "public", "materials", "elite100", "full");
const thumbDir = join(appRoot, "public", "materials", "elite100", "thumb");
assert.ok(existsSync(fullDir), "full textures directory missing");
assert.ok(existsSync(thumbDir), "thumb textures directory missing");
const fullCount = readdirSync(fullDir).filter((f) => f.endsWith(".jpg")).length;
const thumbCount = readdirSync(thumbDir).filter((f) => f.endsWith(".jpg")).length;
assert.ok(fullCount >= 11, `expected reconciled textures, got ${fullCount}`);
assert.equal(thumbCount, fullCount);

const materials = listElite100CustomerMaterials(true);
assert.equal(materials.length, 100, "Elite 100 customer-visible catalog must expose 100 colors");

console.log("\nphaseDe2h.materialUi.test.mjs\n");
console.log(`ok: ${materials.length} catalog colors; ${thumbCount} texture thumbs; lazy thumbs + full preview`);
