/**
 * Consolidated Takeoff review UI — wiring tests (no browser).
 * Run: node app-ai-takeoff/src/lib/consolidatedTakeoffReview.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(root, "components/ConsolidatedTakeoffReview.tsx"), "utf8");
const main = readFileSync(join(root, "main.tsx"), "utf8");
const api = readFileSync(join(root, "lib/api.ts"), "utf8");

console.log("\nconsolidatedTakeoffReview.ui.test.mjs\n");

assert.ok(main.includes("consolidated") && main.includes("ConsolidatedTakeoffReview"));
assert.ok(component.includes("Approve Takeoff & Build Estimate"));
assert.ok(component.includes("data-testid=\"consolidated-takeoff-review\""));
assert.ok(component.includes("data-testid=\"ctr-worksheet\""));
assert.ok(!component.includes("Mark") || !component.includes("verified"));
assert.ok(!component.includes("Continue review"));
assert.ok(!component.includes("Save Corrections"));
assert.ok(component.includes("approveAndBuildEstimate"));
assert.ok(component.includes("eliteos-takeoff-approved"));
assert.ok(api.includes("approve-and-build-estimate"));
assert.ok(component.includes("Add piece"));

// Confirmation contract
assert.ok(component.includes("confirmAdvisories"));
assert.ok(component.includes("confirmAdvisoriesRef"));
assert.ok(component.includes("confirm_advisory"));
assert.ok(component.includes("ctr-approve-advisory"));
assert.ok(api.includes("confirmAdvisories"));
assert.ok(component.includes("You may approve with these"));

// Must not keep legacy blocking language in confirm UX
assert.ok(!component.includes("must be resolved before approval"));

console.log("  ✓ consolidated review UI wiring + confirmAdvisories contract");
console.log("\nconsolidatedTakeoffReview.ui.test.mjs — passed\n");
