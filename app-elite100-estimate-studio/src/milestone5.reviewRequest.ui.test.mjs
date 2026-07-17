/**
 * Milestone 5 — Customer review-request resolve / revise / republish UI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const review = readFileSync(join(root, "src/ReviewWorkspace.tsx"), "utf8");
const app = readFileSync(join(root, "src/StudioApp.tsx"), "utf8");
const dePanel = readFileSync(
  join(root, "src/estimateQueue/EstimateDigitalEstimatePanel.tsx"),
  "utf8"
);

assert.ok(review.includes("/api/elite100-estimate-studio/review-requests"));
assert.ok(review.includes("Start Review"));
assert.ok(review.includes("No Revision Needed"));
assert.ok(review.includes("Revise Estimate"));
assert.ok(review.includes("Reject Request"));
assert.ok(review.includes("Republish"));
assert.ok(review.includes("Copy New Customer Link"));
assert.ok(review.includes("Open Revised Estimate"));
assert.ok(review.includes("resolve-no-change"));
assert.ok(review.includes("revise-estimate"));
assert.ok(review.includes("operatorStatus"));
assert.equal(review.includes("accessToken"), false);
assert.ok(app.includes("onOpenEstimate"));
assert.ok(dePanel.includes("eq-de-review-banner") || dePanel.includes("Active customer review"));

console.log("\nmilestone5.reviewRequest.ui.test.mjs\n");
console.log("ok: Review workspace wires Studio resolve/revise/republish actions");
console.log("\nAll Milestone 5 review-request UI tests passed.\n");
