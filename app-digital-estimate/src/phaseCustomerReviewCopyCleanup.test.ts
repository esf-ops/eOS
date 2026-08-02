/**
 * Digital Estimate customer review copy — no false estimator-review warnings.
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseCustomerReviewCopyCleanup.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

console.log("\nphaseCustomerReviewCopyCleanup.test.ts\n");

const panel = readFileSync(
  join(__dirname, "CustomerConfigurationFoundationPanel.tsx"),
  "utf8"
);
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");

{
  // 1. No yellow warning when there are no true scope requests
  assert.ok(panel.includes('data-testid="de-no-scope-requests"'));
  assert.ok(panel.includes("No additional scope requests."));
  assert.ok(panel.includes('data-testid="de-scope-review-warning"'));
  // Warning markup must be gated on scopeItems.length > 0
  assert.ok(/scopeItems\.length === 0[\s\S]*de-no-scope-requests/.test(panel));
  assert.ok(/scopeItems\.length === 0[\s\S]*?\{scopeItems\.length === 0 \?/.test(panel) || panel.includes("{scopeItems.length === 0 ? ("));
  // Yellow amber warning must only appear in the non-empty branch
  const warningIdx = panel.indexOf('data-testid="de-scope-review-warning"');
  const emptyIdx = panel.indexOf('data-testid="de-no-scope-requests"');
  assert.ok(emptyIdx > 0 && warningIdx > emptyIdx, "empty state precedes warning branch");
  assert.ok(!panel.includes("No review-required requests yet."));
  assert.ok(!panel.includes("Requests that need estimator review"));
  console.log("ok: 1 no yellow warning when scope requests are empty");
}

{
  // 2. Scope warning copy only when requests exist
  assert.ok(panel.includes("These requests need Elite review before final approval."));
  assert.ok(panel.includes("Additional scope requests"));
  console.log("ok: 2 scope warning copy present for non-empty scope requests");
}

{
  // 3. Normal priced selections are not labeled as review blockers
  assert.ok(panel.includes("Your selections"));
  assert.ok(panel.includes("Finish choosing your options. Your estimate updates as selections are saved."));
  assert.ok(!panel.includes("Your selections &amp; requests") && !panel.includes("Your selections & requests"));
  assert.ok(!/Finish choices can update your estimate\. Scope change requests need estimator review/.test(panel));
  console.log("ok: 3 normal selections use non-scary helper copy");
}

{
  // 4. Submission reframed — not broken-price language
  assert.ok(view.includes("Send your selections to Elite"));
  assert.ok(
    view.includes("This is not final acceptance. Elite will confirm details before the job is sold.")
  );
  assert.ok(!view.includes("Ready for Elite to review your selections?"));
  assert.ok(view.includes('"Send selections"') || view.includes(">Send selections<"));
  assert.ok(view.includes("Selections already sent") || view.includes("Selections already sent"));
  console.log("ok: 4 submission copy reframed");
}

{
  // 5. Final acceptance remains gated / unavailable language preserved elsewhere is fine
  assert.ok(view.includes("Final approval will be available after estimator review."));
  console.log("ok: 5 final acceptance remains unavailable");
}

{
  // 6. No raw/internal leak markers introduced
  for (const src of [panel, view]) {
    assert.ok(!/service_role|pricing_evidence|internal_evidence|raw_payload/i.test(src));
  }
  console.log("ok: 6 no raw/internal fields in customer UI sources");
}

console.log("\nAll phaseCustomerReviewCopyCleanup tests passed.\n");
