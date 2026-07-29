/**
 * deriveAiEstimatorStage — pure stage derivation contracts.
 * Run: node app-elite100-estimate-studio/src/estimateQueue/deriveAiEstimatorStage.test.mjs
 */
import assert from "node:assert/strict";
import {
  deriveAiEstimatorStage,
  shouldOfferPublishRevised
} from "./deriveAiEstimatorStage.mjs";

console.log("\nderiveAiEstimatorStage.test.mjs\n");

assert.equal(deriveAiEstimatorStage({ takeoffDisplayStatus: "Takeoff processing" }), "processing");
assert.equal(deriveAiEstimatorStage({}), "draft");
assert.equal(deriveAiEstimatorStage({ handoffBusy: true }), "approving");
assert.equal(deriveAiEstimatorStage({ publishBusy: true, measurementsApproved: true }), "publishing");
assert.equal(deriveAiEstimatorStage({ measurementsApproved: true }), "approved");
assert.equal(
  deriveAiEstimatorStage({
    measurementsApproved: true,
    customerUrl: "https://example.test/e/t",
    estimateRevision: 1,
    publishedRevision: 1
  }),
  "published"
);
assert.equal(
  deriveAiEstimatorStage({
    measurementsApproved: true,
    customerUrl: "https://example.test/e/t",
    estimateRevision: 2,
    publishedRevision: 1
  }),
  "approved"
);
assert.equal(
  deriveAiEstimatorStage({ editingRevision: true, measurementsApproved: false }),
  "revision_draft"
);
assert.equal(deriveAiEstimatorStage({ fatalError: true }), "error");
assert.equal(shouldOfferPublishRevised({ publishedRevision: 1, estimateRevision: 2, measurementsApproved: true }), true);
assert.equal(shouldOfferPublishRevised({ publishedRevision: 1, estimateRevision: 1, measurementsApproved: true }), false);
console.log("ok: stage derivation covers processing→published + revision");
console.log("\nderiveAiEstimatorStage.test.mjs — passed\n");
