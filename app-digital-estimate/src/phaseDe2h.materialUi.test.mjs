/**
 * Phase DE.2H — Digital Estimate UI material/color journey static checks.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const fullDir = join(appRoot, "public", "materials", "elite100", "full");
const thumbDir = join(appRoot, "public", "materials", "elite100", "thumb");
assert.ok(existsSync(fullDir), "full textures directory missing");
assert.ok(existsSync(thumbDir), "thumb textures directory missing");
assert.equal(readdirSync(fullDir).filter((f) => f.endsWith(".jpg")).length, 11);
assert.equal(readdirSync(thumbDir).filter((f) => f.endsWith(".jpg")).length, 11);

console.log("\nphaseDe2h.materialUi.test.mjs\n");
