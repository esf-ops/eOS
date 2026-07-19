/**
 * Intake→takeoff link status derivation.
 * Run: node backend-core/src/takeoff/intakeTakeoffLinkStatus.test.mjs
 */
import assert from "node:assert/strict";
import {
  deriveIntakeLinkStatusFromJob,
  syncIntakeTakeoffLinkFromJob
} from "./intakeTakeoffLinkStatus.mjs";

console.log("\nintakeTakeoffLinkStatus.test.mjs\n");

{
  assert.equal(deriveIntakeLinkStatusFromJob("processing", "needs_review", "queued"), "queued");
  assert.equal(
    deriveIntakeLinkStatusFromJob("processing", "needs_review", "extraction"),
    "processing"
  );
  assert.equal(deriveIntakeLinkStatusFromJob("completed", "needs_review", "done"), "ready");
  assert.equal(deriveIntakeLinkStatusFromJob("completed", "approved", "done"), "ready");
  assert.equal(deriveIntakeLinkStatusFromJob("failed", "needs_review", "failed"), "failed");
  console.log("  ✓ derive link status from job status/phase");
}

{
  let patch = null;
  const supabase = {
    from(table) {
      assert.equal(table, "quote_intake_takeoff_links");
      return {
        update(p) {
          patch = p;
          return this;
        },
        eq() {
          return this;
        },
        select() {
          return Promise.resolve({ data: [{ id: "link-1" }], error: null });
        }
      };
    }
  };
  const result = await syncIntakeTakeoffLinkFromJob(supabase, {
    id: "job-1",
    organization_id: "org-1",
    status: "completed",
    review_status: "needs_review",
    metadata: { processing: { phase: "done" } }
  });
  assert.equal(result.updated, 1);
  assert.equal(patch.relationship_status, "ready");
  assert.ok(patch.completed_at);
  console.log("  ✓ sync updates link to ready when job completed");
}

console.log("\nintakeTakeoffLinkStatus.test.mjs — passed\n");
