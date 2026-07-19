/**
 * Milestone 4 — Digital Estimate publish panel after Studio approval.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const panel = readFileSync(join(root, "src/estimateQueue/EstimateScopePanel.tsx"), "utf8");
const dePanel = readFileSync(
  join(root, "src/estimateQueue/EstimateDigitalEstimatePanel.tsx"),
  "utf8"
);

assert.ok(panel.includes("EstimateDigitalEstimatePanel"));
assert.ok(dePanel.includes("Publish Digital Estimate"));
assert.ok(dePanel.includes("Copy Customer Link"));
assert.ok(dePanel.includes("Open Customer Preview"));
assert.ok(dePanel.includes("Replace Link"));
assert.ok(dePanel.includes("Revoke Publication"));
assert.ok(dePanel.includes("/digital-estimate/publish"));
assert.ok(dePanel.includes("eq-digital-estimate"));
assert.ok(dePanel.includes("eq-de-review-requests") || dePanel.includes("eq-de-review-empty"));
assert.equal(dePanel.includes("oneTimeLink"), false);
assert.ok(dePanel.includes("customerUrl"));
assert.ok(dePanel.includes("eq-de-stable-link") || dePanel.includes("stable and reusable"));
assert.ok(dePanel.includes("eq-copy-customer-link"));
assert.ok(dePanel.includes("eq-open-customer-preview"));
assert.ok(!dePanel.includes("cannot be recovered after refresh"));
assert.ok(dePanel.includes("formatStructuredPublishError"));
assert.ok(dePanel.includes("eq-de-pilot-diagnostic"));
assert.ok(dePanel.includes("readinessQuery"));
assert.ok(
  dePanel.includes("e instanceof ApiError") &&
    dePanel.includes("Unable to publish Digital Estimate")
);

console.log("\nmilestone4.digitalEstimate.ui.test.mjs\n");
console.log("ok: Studio Digital Estimate panel wires publish / link / revoke / review status");
console.log("ok: stable reusable customer URL (no one-time ephemeral link)");
console.log("\nAll Milestone 4 Digital Estimate UI tests passed.\n");
