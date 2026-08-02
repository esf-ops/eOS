/**
 * takeoffJobStatusLabels — plain-English job status mapping (pure).
 * Run: node app-ai-takeoff/src/lib/takeoffJobStatusLabels.test.mjs
 */
import assert from "node:assert/strict";
import {
  deriveTakeoffJobDisplayStatus,
  takeoffJobStatusChipClass,
} from "./takeoffJobStatusLabels.mjs";

console.log("\ntakeoffJobStatusLabels.test.mjs\n");

// 1. Pending / no results → Not started
{
  const s = deriveTakeoffJobDisplayStatus({ status: "pending", reviewStatus: "needs_review", resultCount: 0 });
  assert.equal(s.label, "Not started");
  assert.equal(s.tone, "neutral");
}

// 2. Processing → Running (wins over review status)
{
  const s = deriveTakeoffJobDisplayStatus({ status: "processing", reviewStatus: "needs_review" });
  assert.equal(s.label, "Running");
  assert.equal(s.tone, "info");
}

// 3. Failed → Failed (wins over everything except imported signal)
{
  const s = deriveTakeoffJobDisplayStatus({ status: "failed", reviewStatus: "needs_review" });
  assert.equal(s.label, "Failed");
  assert.equal(s.tone, "danger");
}

// 4. Completed + needs review → Needs review
{
  const s = deriveTakeoffJobDisplayStatus({ status: "completed", reviewStatus: "needs_review", resultCount: 1 });
  assert.equal(s.label, "Needs review");
  assert.equal(s.tone, "warn");
}

// 5. Approved (review or approval status) → Approved
{
  const a = deriveTakeoffJobDisplayStatus({ status: "completed", reviewStatus: "approved" });
  const b = deriveTakeoffJobDisplayStatus({ status: "completed", approvalStatus: "approved" });
  assert.equal(a.label, "Approved");
  assert.equal(b.label, "Approved");
  assert.equal(a.tone, "success");
}

// 6. Rejected still needs human review (never a fake persisted state)
{
  const s = deriveTakeoffJobDisplayStatus({ status: "completed", reviewStatus: "rejected" });
  assert.equal(s.label, "Needs review");
}

// 7. Explicit downstream link signal → Imported / linked (only when present)
{
  const s = deriveTakeoffJobDisplayStatus({ status: "completed", reviewStatus: "approved", linkedEstimateId: "est-1" });
  assert.equal(s.label, "Imported / linked");
  assert.equal(s.tone, "success");
}

// 8. Labels never leak raw backend tokens
{
  const labels = [
    deriveTakeoffJobDisplayStatus({ status: "pending" }).label,
    deriveTakeoffJobDisplayStatus({ status: "processing" }).label,
    deriveTakeoffJobDisplayStatus({ status: "failed" }).label,
    deriveTakeoffJobDisplayStatus({ status: "completed", reviewStatus: "needs_review" }).label,
  ];
  for (const l of labels) {
    assert.ok(!/_/.test(l), `label must be plain English, got "${l}"`);
  }
}

// 9. Chip class maps every tone to an existing takeoff-inbox-chip modifier
{
  assert.ok(takeoffJobStatusChipClass("neutral").includes("takeoff-inbox-chip--neutral"));
  assert.ok(takeoffJobStatusChipClass("info").includes("takeoff-inbox-chip--processing"));
  assert.ok(takeoffJobStatusChipClass("warn").includes("takeoff-inbox-chip--pending"));
  assert.ok(takeoffJobStatusChipClass("danger").includes("takeoff-inbox-chip--failed"));
  assert.ok(takeoffJobStatusChipClass("success").includes("takeoff-inbox-chip--completed"));
}

console.log("  ✓ plain-English mapping, precedence, no invented persisted statuses");
console.log("\ntakeoffJobStatusLabels.test.mjs — passed\n");
