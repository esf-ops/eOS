/**
 * Phase DE.2D — Elite 100 Estimate Studio configuration UI static checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const app = readFileSync(join(root, "src/StudioApp.tsx"), "utf8");
const configUi = readFileSync(join(root, "src/ConfigurationWorkspace.tsx"), "utf8");
const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
const envEx = readFileSync(join(root, ".env.example"), "utf8");
const api = readFileSync(join(root, "src/lib/api.ts"), "utf8");

assert.ok(vite.includes("5191"), "Studio port must be 5191");
assert.ok(envEx.includes("VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED=false"));
assert.ok(envEx.includes("VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED=false"));
assert.equal(envEx.includes("PILOT_USER"), false, "no pilot secrets in Vite env example");

assert.ok(app.includes("EliteosTopbar"));
assert.ok(app.includes("/api/elite100-estimate-studio/"));
assert.ok(app.includes("ConfigurationWorkspace"));
assert.equal(app.includes("calculateQuote"), false);
assert.equal(app.includes("service_role"), false);

assert.ok(configUi.includes("configurationUiEnabled"));
assert.ok(configUi.includes("VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED"));
assert.ok(configUi.includes("/api/digital-estimate/configuration/"));
assert.ok(configUi.includes("Internal preview"));
assert.ok(configUi.includes("Customer-safe preview"));
assert.ok(configUi.includes("acknowledgeFreeze") || configUi.includes("acknowledge freeze") || configUi.includes("ackFreeze"));
assert.ok(configUi.includes("Clone to new draft"));
assert.equal(configUi.includes("calculateQuote"), false);
assert.equal(configUi.includes("localStorage"), false);
assert.equal(configUi.includes("dangerouslySetInnerHTML"), false);
assert.equal(configUi.includes("sellPrice"), false, "no arbitrary sell price inputs in UI");
assert.ok(configUi.includes("readOnly") || configUi.includes("Locked SF"));
assert.ok(configUi.includes("onAuthFailure"));
assert.ok(configUi.includes("clearSensitive") || configUi.includes("abortRef"));

assert.ok(api.includes("apiPut"));
assert.ok(api.includes("apiPatch"));

console.log("\nphaseDe2d.ui.test.mjs\n");
console.log("ok: configuration UI flag default off, Brain APIs, preview separation, no price spoof inputs");
console.log("\nAll phase DE.2D UI tests passed.\n");
