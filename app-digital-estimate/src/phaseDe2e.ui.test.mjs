/**
 * Phase DE.2E — public Digital Estimate UI static checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = __dirname;
const appRoot = join(srcRoot, "..");

const app = readFileSync(join(srcRoot, "App.tsx"), "utf8");
const api = readFileSync(join(srcRoot, "publicConfigApi.ts"), "utf8");
const configView = readFileSync(join(srcRoot, "ConfigurationView.tsx"), "utf8");
const envEx = readFileSync(join(appRoot, ".env.example"), "utf8");
const indexHtml = readFileSync(join(appRoot, "index.html"), "utf8");

assert.ok(envEx.includes("VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED=false"));
assert.ok(api.includes("parseTokenFromHash"));
assert.ok(api.includes("clearFragmentFromUrl"));
assert.ok(api.includes("/api/public-digital-estimate/v2/session"));
assert.ok(api.includes("credentials: \"include\""));
assert.equal(/localStorage\./.test(api + app + configView), false);
assert.equal(/sessionStorage\./.test(api + app + configView), false);
assert.ok(app.includes("parseTokenFromHash") || api.includes("parseTokenFromHash"));
assert.ok(app.includes("ReadOnlyEstimateView"));
assert.ok(configView.includes("Original estimate"));
assert.ok(configView.includes("Updated estimate"));
assert.ok(configView.includes("not final acceptance"));
assert.equal(configView.includes("Wholesale"), false);
assert.equal(configView.includes("use tax"), false);
assert.equal(configView.includes("Watt"), false);
assert.equal(/\bAccept\b/.test(configView), false, "no Accept CTA");
assert.equal(configView.includes("payment"), false);
assert.equal(configView.includes("sold"), false);
assert.ok(configView.includes("not final acceptance"));
assert.ok(indexHtml.includes('content="no-referrer"'));

console.log("\nphaseDe2e.ui.test.mjs\n");
console.log("ok: fragment helpers, v2 credentials API, no storage tokens, no acceptance/sold");
console.log("\nAll phase DE.2E UI tests passed.\n");
