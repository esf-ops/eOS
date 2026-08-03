/**
 * Public Digital Estimate bootstrap — unavailable banner must not share the
 * page with a loaded frozen estimate (production defect).
 *
 * Run: node app-digital-estimate/src/phaseUnavailableBanner.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideConfigurationView } from "./configurationBootstrap.ts";

const root = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(root, "App.tsx"), "utf8");

console.log("\nphaseUnavailableBanner.ui.test.mjs\n");

assert.ok(app.includes('const UNAVAILABLE_MESSAGE = "This estimate isn’t available right now."'));
assert.ok(app.includes("UnavailableScreen"));

// UnavailableScreen is the only full-page unavailable path.
const unavailableScreen = app.slice(
  app.indexOf("function UnavailableScreen"),
  app.indexOf("function clearAllState")
);
assert.ok(unavailableScreen.includes("UNAVAILABLE_MESSAGE"));
assert.equal(unavailableScreen.includes("ReadOnlyEstimateView"), false);

// Loaded-estimate branch must not fall through to generic unavailable copy.
const estimateIdx = app.indexOf("if (estimate) {");
assert.ok(estimateIdx > 0);
const estimateBranch = app.slice(estimateIdx, app.indexOf("return <UnavailableScreen", estimateIdx));
assert.equal(
  /:\s*"This estimate is unavailable\."/.test(estimateBranch),
  false,
  "estimate branch must not use generic unavailable beside ReadOnlyEstimateView"
);
assert.ok(estimateBranch.includes("Your options could not be loaded"));
assert.ok(estimateBranch.includes("ReadOnlyEstimateView"));

// Valid interactive publication → configure mode (never static-only).
const configure = decideConfigurationView({
  uiEnabled: true,
  lifecycle: "active",
  hasConfiguration: true,
  hasEstimate: true
});
assert.equal(configure.mode, "configure");
assert.equal(configure.fallbackReason, null);

// Truly missing estimate → none (UnavailableScreen path).
const missing = decideConfigurationView({
  uiEnabled: true,
  lifecycle: null,
  hasConfiguration: false,
  hasEstimate: false
});
assert.equal(missing.mode, "none");

console.log("ok: unavailable banner isolated; interactive publications enter configure mode");
console.log("\nphaseUnavailableBanner.ui.test.mjs — passed\n");
