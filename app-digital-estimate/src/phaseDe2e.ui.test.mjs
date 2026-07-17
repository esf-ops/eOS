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
assert.ok(api.includes("/api/public-digital-estimate/v2/configuration"));
assert.ok(api.includes("/api/public-digital-estimate/v2/selections"));
assert.ok(api.includes("/api/public-digital-estimate/v2/recalculate"));
assert.ok(api.includes("/api/public-digital-estimate/v2/review-requests"));
assert.ok(api.includes("credentials: \"include\""));
assert.equal(/localStorage\./.test(api + app + configView), false);
assert.equal(/sessionStorage\./.test(api + app + configView), false);
assert.ok(app.includes("parseTokenFromHash") || api.includes("parseTokenFromHash"));
assert.ok(app.includes("ReadOnlyEstimateView"));
assert.ok(configView.includes("Original estimate"));
assert.ok(configView.includes("Updated estimate"));
assert.ok(configView.includes("Change from original") || configView.includes("Selected changes"));
assert.ok(configView.includes("not final acceptance") || configView.includes("not an order or acceptance"));
assert.ok(configView.includes("Pick an approved Elite 100 color"));
assert.ok(configView.includes("Search color"));
assert.ok(configView.includes("ColorPickerModal"));
assert.ok(configView.includes("lg:sticky"));
assert.ok(configView.includes("fixed inset-x-0 bottom-0"));
assert.ok(configView.includes("/materials/elite100/") || api.includes("imageAssetPath") || configView.includes("imageAssetPath"));
assert.equal(configView.includes("Wholesale"), false);
assert.equal(configView.includes("use tax"), false);
assert.equal(configView.includes("Watt"), false);
assert.equal(/\bAccept\b/.test(configView), false, "no Accept CTA");
assert.equal(configView.includes("payment"), false);
assert.equal(configView.includes("sold"), false);
assert.ok(
  configView.includes("not final acceptance") || configView.includes("not an order or acceptance")
);
assert.ok(indexHtml.includes('content="no-referrer"'));
const viteCfg = readFileSync(join(appRoot, "vite.config.ts"), "utf8");
assert.ok(viteCfg.includes("digital-estimate-html-csp"), "vite must inject production CSP at build time");
const effectBlock = app.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/);
assert.ok(effectBlock, "App useEffect bootstrap required");
assert.ok(
  /if \(fragmentToken\) \{/.test(effectBlock[0]),
  "fragment bootstrap must not require configurationUiEnabled()"
);
assert.equal(
  /fragmentToken && configurationUiEnabled\(\)/.test(effectBlock[0]),
  false,
  "Vite UI flag must not gate token exchange"
);
assert.ok(
  effectBlock[0].indexOf("clearFragmentFromUrl") < effectBlock[0].indexOf("exchangeFragmentToken"),
  "fragment must be cleared after capture and before exchange"
);
assert.ok(app.includes("state.estimate"), "read-only baseline path when estimate present");
assert.ok(app.includes("configurationUiEnabled()"), "UI flag may still gate interactive configure mode");
assert.ok(app.includes("DE-EXCHANGE-404") || api.includes("DE-EXCHANGE-404"), "safe exchange diagnostic codes");
assert.ok(app.includes("eliteos-de-build") || app.includes("build marker"), "unavailable screen shows build marker");
assert.ok(app.includes("diagnosticCode") || api.includes("diagnosticCode"), "diagnostic code plumbing");
const main = readFileSync(join(srcRoot, "main.tsx"), "utf8");
assert.ok(main.includes("EstimateErrorBoundary"), "top-level error boundary required");
const boundary = readFileSync(join(srcRoot, "EstimateErrorBoundary.tsx"), "utf8");
assert.ok(boundary.includes("This estimate could not be displayed."));
assert.ok(boundary.includes("DE-RENDER"));
assert.ok(boundary.includes("DE-RENDER-BASELINE") || readFileSync(join(srcRoot, "normalizePublicEstimate.ts"), "utf8").includes("DE-RENDER-BASELINE"));
assert.equal(boundary.includes("error.message"), false, "boundary must not render raw error details");
assert.ok(/style-src 'self'/.test(indexHtml), "source CSP must allow same-origin stylesheets");
assert.equal(
  /style-src[^;]*'unsafe-inline'/.test(indexHtml),
  false,
  "source CSP must not default to unsafe-inline only"
);
assert.ok(
  readFileSync(join(srcRoot, "normalizePublicEstimate.ts"), "utf8").includes("unwrapEstimatePayload"),
  "must unwrap nested serializer wrapper"
);
assert.ok(app.includes("normalizePublicEstimate"), "App must normalize estimate before render");
console.log("\nphaseDe2e.ui.test.mjs\n");
console.log("ok: unconditional fragment exchange, clear-after-capture, no storage tokens");
console.log("\nAll phase DE.2E UI tests passed.\n");
