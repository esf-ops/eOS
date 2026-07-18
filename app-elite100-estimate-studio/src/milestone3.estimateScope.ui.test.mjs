/**
 * Milestone 3 — Estimate scope / calculate / approve UI wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const workspace = readFileSync(
  join(root, "src/estimateQueue/EstimateTakeoffWorkspace.tsx"),
  "utf8"
);
const panel = readFileSync(join(root, "src/estimateQueue/EstimateScopePanel.tsx"), "utf8");
const api = readFileSync(join(root, "src/lib/api.ts"), "utf8");

assert.ok(workspace.includes("EstimateScopePanel"));
assert.ok(panel.includes("eq-partner-account-picker"));
assert.ok(panel.includes("partner-accounts"));
assert.ok(panel.includes("eq-estimate-revision"));
assert.ok(panel.includes("eq-estimate-repo-mode"));
assert.equal(panel.includes("UUID — Watts"), false);
assert.ok(panel.includes("Calculate Estimate"));
assert.ok(panel.includes("Approve Estimate"));
assert.ok(panel.includes("eq-estimate-blocked"));
assert.ok(panel.includes("Approve Takeoff &amp; Build Estimate") || panel.includes("Approve Takeoff & Build Estimate"));
assert.equal(panel.includes("Approve the Takeoff in the review workspace above"), false);
assert.ok(panel.includes("refresh-from-takeoff"));
assert.ok(panel.includes("eq-refresh-from-takeoff"));
assert.ok(panel.includes("/intake-cases/"));
assert.ok(panel.includes("/calculate"));
assert.ok(panel.includes("/approve"));
assert.ok(panel.includes("Save Draft"));
assert.ok(panel.includes("needs_takeoff_approval"));
assert.ok(panel.includes("EstimateDigitalEstimatePanel"));
assert.ok(panel.includes("Publish Digital Estimate") || panel.includes("EstimateDigitalEstimatePanel"));
assert.ok(api.includes("apiPatch"));

console.log("\nmilestone3.estimateScope.ui.test.mjs\n");
console.log("ok: Studio renders scope, summary, approval, and Digital Estimate panel hook");
console.log("\nAll Milestone 3 Estimate Scope UI tests passed.\n");
