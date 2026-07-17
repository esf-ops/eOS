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
const api = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const studio = readFileSync(
  join(appRoot, "..", "app-elite100-estimate-studio", "src", "ConfigurationWorkspace.tsx"),
  "utf8"
);

assert.ok(configView.includes('step === "review"'));
assert.ok(configView.includes('step === "customize"'));
assert.ok(configView.includes('step === "request"'));
assert.ok(configView.includes("material-card"));
assert.ok(configView.includes("Search colors") || configView.includes("color-search"));
assert.ok(api.includes("CustomerMaterial"));
assert.ok(api.includes("materials?"));
assert.equal(/https?:\/\//.test(configView.match(/imageAssetPath[\s\S]{0,80}/)?.[0] || ""), false);
assert.ok(studio.includes("Allowed colors for customer"));
assert.ok(studio.includes("materialCatalog"));
assert.ok(studio.includes("Save allowed colors"));

const fullDir = join(appRoot, "public", "materials", "elite100", "full");
const thumbDir = join(appRoot, "public", "materials", "elite100", "thumb");
assert.ok(existsSync(fullDir), "full textures directory missing");
assert.ok(existsSync(thumbDir), "thumb textures directory missing");
assert.equal(readdirSync(fullDir).filter((f) => f.endsWith(".jpg")).length, 11);
assert.equal(readdirSync(thumbDir).filter((f) => f.endsWith(".jpg")).length, 11);

console.log("\nphaseDe2h.materialUi.test.mjs\n");
