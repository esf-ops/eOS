/**
 * AI Takeoff-first UI — identity optional for Publish Digital Estimate.
 * Run: node app-elite100-estimate-studio/src/estimateQueue/aiTakeoffIdentityOptional.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const panel = readFileSync(join(root, "src/estimateQueue/AiEstimatorWorkspace.tsx"), "utf8");

console.log("\naiTakeoffIdentityOptional.ui.test.mjs\n");

assert.equal(panel.includes("eq-ai-publish-required-fields"), false);
assert.equal(panel.includes("Required to publish"), false);
assert.equal(panel.includes("eq-ai-project-name"), false);
assert.equal(panel.includes("eq-ai-customer-email"), false);
assert.equal(panel.includes("Details saved."), false);
assert.equal(panel.includes("saveProjectFields"), false);
assert.equal(panel.includes("/project-details"), false);
assert.ok(panel.includes("eq-publish-digital-estimate"));
assert.ok(panel.includes("eq-copy-customer-link"));
assert.ok(panel.includes("eq-open-customer-preview"));
assert.ok(panel.includes("eq-ai-approved-measurements"));
assert.ok(panel.includes("Edit Measurements") || panel.includes("Edit measurements"));
assert.match(
  panel,
  /disabled=\{props\.publishBusy \|\| !props\.estimateId \|\| !props\.eligible\}|disabled=\{publishBusy \|\| !estimateId \|\| !eligible\}/
);
assert.ok(
  panel.includes("activeReview ? activeReview.eligible") ||
    panel.includes("activeReview.eligible")
);
console.log("ok: AI approved card has publish actions; no identity form/blockers");
console.log("\naiTakeoffIdentityOptional.ui.test.mjs — passed\n");
