/**
 * Pure lifecycle type helpers.
 * Run via eos:test:estimate-lifecycle-closeout
 */
import assert from "node:assert/strict";
import {
  deriveStudioLifecycleStatus,
  emptySoldReviewChecklist,
  isSoldReviewChecklistComplete,
  normalizeSoldReviewChecklist,
  studioLifecycleStatusLabel,
  STUDIO_LIFECYCLE_STATUSES
} from "./studioLifecycleTypes.mjs";

console.log("\nstudioLifecycleTypes.test.mjs\n");

assert.equal(studioLifecycleStatusLabel("accepted_awaiting_sold_review"), "Accepted — Awaiting Sold Review");
assert.equal(studioLifecycleStatusLabel("sold"), "Sold");

const c = normalizeSoldReviewChecklist({ customerAccountCorrect: true, junk: true });
assert.equal(c.customerAccountCorrect, true);
assert.equal(c.readyForOperationalHandoff, false);
assert.equal("junk" in c, false);
assert.equal(isSoldReviewChecklistComplete(c), false);
assert.equal(isSoldReviewChecklistComplete(emptySoldReviewChecklist()), false);

assert.equal(
  deriveStudioLifecycleStatus({ hasOpenReviewRequest: true, hasActivePublication: true }),
  STUDIO_LIFECYCLE_STATUSES.CHANGES_REQUESTED
);
assert.equal(
  deriveStudioLifecycleStatus({ archived: true, hasSoldSnapshot: true }),
  STUDIO_LIFECYCLE_STATUSES.ARCHIVED
);

console.log("ok: lifecycle type helpers\n");
