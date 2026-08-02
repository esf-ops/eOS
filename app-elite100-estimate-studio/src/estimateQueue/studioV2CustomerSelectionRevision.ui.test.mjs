/**
 * Studio V2 customer-selection revision UI contracts.
 * Run: node src/estimateQueue/studioV2CustomerSelectionRevision.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(here, "StudioV2CustomerSelectionReviewPanel.tsx"), "utf8");
const shell = readFileSync(join(here, "StudioV2EstimatorShell.tsx"), "utf8");

console.log("\nstudioV2CustomerSelectionRevision.ui.test.mjs\n");

assert.ok(panel.includes('data-testid="studio-v2-selection-create-revision"'));
assert.ok(panel.includes("Create revision from customer selections"));
assert.ok(panel.includes("Customer selections have not been sent for Elite review."));
assert.ok(panel.includes('data-testid="studio-v2-selection-revision-not-required"'));
assert.ok(panel.includes("No physical scope changes were requested"));
assert.ok(panel.includes("requiresEliteReview"));
assert.ok(panel.includes("Customer final selections"));
assert.ok(panel.includes('data-testid="studio-v2-selection-revision-accepted-blocked"'));
assert.ok(panel.includes('data-testid="studio-v2-accepted-mode"'));
assert.ok(panel.includes("acceptedAsConfigured"));
assert.ok(panel.includes("Configured selections"));
assert.ok(panel.includes('data-testid="studio-v2-selection-revision-existing"'));
assert.ok(panel.includes("Revision already created"));
assert.ok(
  panel.includes(
    "Some customer requests were added as review notes and were not automatically"
  )
);
assert.ok(panel.includes("reviewRequested"));
assert.ok(panel.includes("requiresEliteReview &&"));
assert.ok(panel.includes("revisionAffordance?.canCreateRevision"));
assert.ok(panel.includes("!accepted"));
assert.ok(panel.includes("!alreadyCreated"));
assert.ok(panel.includes("activeReviewRequestId"));
assert.ok(panel.includes("sourceReviewRequestId === activeReviewRequestId"));
console.log("ok: 1 action gating covers sent, accepted, source, selection-only, and already-created states");

assert.ok(
  shell.includes(
    "/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/customer-selections/create-revision"
  )
);
assert.ok(shell.includes("confirmed: true"));
assert.ok(shell.includes("publicationId"));
assert.ok(shell.includes("reviewRequestId"));
assert.ok(shell.includes("clientMutationId"));
assert.ok(shell.includes("await load()"));
assert.ok(
  shell.includes(
    "Revision created from customer selections. Review scope, recalculate, approve, then republish."
  )
);
assert.ok(shell.includes("Some customer requests were added as review notes"));
assert.ok(shell.includes("customerSelectionRevision"));
console.log("ok: 2 click posts safe identifiers, reloads workspace, and shows required notices");

for (const forbidden of [
  "requestedTotal",
  "configuredDisplayTotal:",
  "baselineDisplayTotal:",
  "pricingFormula",
  "autoApprove",
  "autoPublish",
  "autoAccept",
  "markSold"
]) {
  assert.equal(
    shell.includes(forbidden),
    false,
    `customer-selection revision UI must not send or invoke ${forbidden}`
  );
}
assert.equal(panel.includes("apply changes"), false);
console.log("ok: 3 browser sends no trusted economics and exposes no direct-apply action");

console.log("\nAll Studio V2 customer-selection revision UI tests passed.\n");
