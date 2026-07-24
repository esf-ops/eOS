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
const css = readFileSync(join(root, "src/styles.css"), "utf8");

console.log("\nmilestone5.reviewRequest.ui.test.mjs\n");

assert.ok(review.includes("/api/elite100-estimate-studio/review-requests"));
assert.ok(review.includes("Start Review"));
assert.ok(review.includes("No Revision Needed"));
assert.ok(review.includes("Revise Estimate"));
assert.ok(review.includes("Reject Request"));
assert.ok(review.includes("Republish"));
assert.ok(review.includes("Copy New Customer Link"));
assert.ok(review.includes("Open source estimate") || review.includes("Open Current Estimate"));
assert.ok(review.includes("resolve-no-change"));
assert.ok(review.includes("revise-estimate"));
assert.ok(review.includes("operatorStatus"));
assert.equal(review.includes("accessToken"), false);
assert.match(review, /role="dialog"/);
assert.match(review, /aria-modal="true"/);
assert.match(review, /Escape/);
assert.match(review, /review-detail-drawer/);
assert.match(review, /review-drawer-close/);
assert.match(review, /review-open-details/);
assert.match(review, /review-open-customer/);
assert.match(review, /Open details/);
assert.match(review, /setSelectedId\(id\)/);
assert.match(review, /review-action--\$\{tone\}/);
assert.match(review, /ActionTone = "primary" \| "secondary" \| "warning" \| "destructive" \| "neutral"/);
assert.match(review, /looksRawToken/);
assert.match(review, /canApply/);
assert.match(review, /publicationGuidance/);
assert.match(review, /review-publication-guidance/);
assert.match(review, /Published estimate/);
assert.match(review, /Return to list/);
assert.match(review, /review-readonly/);
assert.match(review, /"destructive"/);
assert.match(review, /"primary"/);
assert.doesNotMatch(review, /eq-btn-primary/);
assert.match(css, /\.review-drawer/);
assert.match(css, /\.review-action--destructive/);
assert.match(css, /\.review-action--primary/);
assert.match(css, /\.review-table-wrap/);
assert.match(css, /\.review-customer-open/);
assert.match(css, /th:last-child/);
assert.ok(app.includes("onOpenEstimate"));
assert.ok(dePanel.includes("eq-de-review-banner") || dePanel.includes("Active customer review"));

console.log("ok: Review workspace layout, drawer, action hierarchy, and safety contracts");
console.log("ok: explicit Open details + customer/project controls");
console.log("\nAll Milestone 5 review-request UI tests passed.\n");
