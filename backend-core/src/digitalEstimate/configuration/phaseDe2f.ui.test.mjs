/**
 * Phase DE.2F — public + Studio UI static checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../..");
const publicSrc = join(repoRoot, "app-digital-estimate/src");
const studioSrc = join(repoRoot, "app-elite100-estimate-studio/src");

const configView = readFileSync(join(publicSrc, "ConfigurationView.tsx"), "utf8");
const publicApi = readFileSync(join(publicSrc, "publicConfigApi.ts"), "utf8");
const publicEnv = readFileSync(join(repoRoot, "app-digital-estimate/.env.example"), "utf8");
const studioApp = readFileSync(join(studioSrc, "StudioApp.tsx"), "utf8");
const reviewWs = readFileSync(join(studioSrc, "ReviewWorkspace.tsx"), "utf8");
const studioEnv = readFileSync(join(repoRoot, "app-elite100-estimate-studio/.env.example"), "utf8");

assert.ok(publicEnv.includes("VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED=false"));
assert.ok(studioEnv.includes("VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED=false"));
assert.ok(publicApi.includes("submitReviewRequest"));
assert.ok(publicApi.includes("/api/public-digital-estimate/v2/review-requests"));
// DE.2F originally forbade any acceptance CTA. Customer acceptance has since
// shipped; the review-request path must stay wired and acceptance must stay
// explicitly non-final (staff confirm before the job is sold).
assert.ok(configView.includes("submitReviewRequest"));
assert.ok(configView.includes("We couldn’t send your review request"));
assert.ok(configView.includes("This is not final acceptance. Elite will confirm details before the job is sold."));
assert.equal(configView.includes("payment"), false);
assert.equal(configView.includes("signature"), false);
assert.ok(studioApp.includes("<ReviewWorkspace"));
assert.ok(reviewWs.includes("Review Requests"));
assert.ok(reviewWs.includes('data-testid="review-pricing-comparison"'));
assert.ok(reviewWs.includes('data-testid="review-selection-comparison"'));
assert.ok(reviewWs.includes("Republish a replacement Digital Estimate link?"));
assert.ok(reviewWs.includes("One-time replacement link"));
assert.equal(reviewWs.includes("quote_headers"), false);
assert.equal(/Accept order|sold workflow|Send email/i.test(reviewWs), false);

console.log("\nphaseDe2f.ui.test.mjs\n");
console.log("ok: review nonacceptance copy, Studio queue, no sold/email");
console.log("\nAll phase DE.2F UI tests passed.\n");
