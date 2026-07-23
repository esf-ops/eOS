/**
 * Command Center view-model adapter tests (read-only; no workflow writes).
 * Run: node backend-core/src/elite100EstimateStudio/studioCommandCenterViewModel.test.mjs
 */
import assert from "node:assert/strict";
import {
  attentionCopyFromReasons,
  attentionSeverity,
  apiFilterForStageTab,
  commandCenterSummaryCounts,
  filterCommandCenterItems,
  nextActionFromRow,
  resolveCommandCenterStageKey,
  sortCommandCenterItems,
  stageLabelForWorkflow,
  toCommandCenterItem
} from "./studioCommandCenterViewModel.mjs";

console.log("\nstudioCommandCenterViewModel.test.mjs\n");

function row(extra = {}) {
  return {
    id: "case-1",
    customerName: "Monticello Custom Interiors",
    projectName: "Nietert Kitchen",
    workflowStatus: "Takeoff draft ready",
    needsAttention: true,
    attentionReasons: ["takeoff_needs_review"],
    openTarget: "takeoff",
    assignedEstimatorLabel: "Chris",
    receivedAt: "2026-07-22T10:00:00Z",
    lastActivityAt: "2026-07-22T11:00:00Z",
    roomCount: 1,
    pieceCount: 6,
    ...extra
  };
}

// 1–2. One primary stage; no raw enum leak in labels
{
  const item = toCommandCenterItem(row());
  assert.equal(item.stageKey, "takeoff");
  assert.equal(item.stageLabel, "Needs Takeoff review");
  assert.equal(item.stageLabel.includes("Takeoff draft ready"), false);
  assert.equal(/qil_|ready_to_price|needs_review/.test(item.stageLabel), false);
  console.log("ok: one primary stage; technical statuses do not leak into labels");
}

// 3–4. Attention reason plain language; stage precedence deterministic
{
  const copy = attentionCopyFromReasons(["takeoff_needs_review"]);
  assert.equal(copy.title, "Needs Takeoff review");
  assert.ok(copy.detail.includes("Pricing Setup"));
  assert.equal(resolveCommandCenterStageKey(row({ workflowStatus: "Takeoff failed" })), "takeoff_failed");
  assert.equal(
    resolveCommandCenterStageKey(row({ workflowStatus: "Customer submitted" })),
    "review_requested"
  );
  assert.equal(
    resolveCommandCenterStageKey(
      row({ workflowStatus: "Scope in progress", attentionReasons: ["estimate_stale"], staleReason: "x" })
    ),
    "pricing_stale"
  );
  assert.equal(
    resolveCommandCenterStageKey(row({ workflowStatus: "Ready for approval" })),
    "ready_to_publish"
  );
  console.log("ok: attention reason clear; stage precedence deterministic");
}

// 5–6. Blocked / review-requested
{
  const failed = toCommandCenterItem(
    row({
      workflowStatus: "Takeoff failed",
      attentionReasons: ["failed"],
      openTarget: "takeoff"
    })
  );
  assert.equal(failed.blocked, true);
  assert.ok(failed.blockedReason);
  assert.equal(failed.nextActionLabel, "Review request");

  const review = toCommandCenterItem(
    row({
      workflowStatus: "Customer submitted",
      attentionReasons: ["customer_requested_changes"],
      openTarget: "review",
      needsAttention: true
    })
  );
  assert.equal(review.stageKey, "review_requested");
  assert.equal(review.nextActionRoute, "review");
  assert.equal(review.severity, 2);
  console.log("ok: blocked + review-requested priority");
}

// 7–9. Ready to publish / stale / routes use existing open targets
{
  const ready = toCommandCenterItem(
    row({
      workflowStatus: "Ready for approval",
      needsAttention: true,
      attentionReasons: ["approved_not_published"],
      openTarget: "digital"
    })
  );
  assert.equal(ready.stageKey, "ready_to_publish");
  assert.equal(ready.nextActionRoute, "digital");
  assert.equal(ready.nextActionLabel, "Publish Estimate");

  const stale = nextActionFromRow(
    row({
      workflowStatus: "Scope in progress",
      openTarget: "scope",
      attentionReasons: ["estimate_stale"]
    })
  );
  assert.equal(stale.nextActionRoute, "scope");
  assert.equal(stale.nextActionLabel, "Calculate Estimate");

  assert.equal(apiFilterForStageTab("ready_to_publish"), "estimating");
  assert.equal(apiFilterForStageTab("needs_attention"), "needs_attention");
  console.log("ok: ready-to-publish / stale / API filter mapping");
}

// 10. Unclassifiable → needs attention warning
{
  const odd = toCommandCenterItem(
    row({ workflowStatus: "Unexpected Future Status", needsAttention: true, attentionReasons: [] })
  );
  assert.equal(odd.stageKey, "unclassified");
  assert.ok(odd.classificationWarning);
  console.log("ok: unclassifiable records become Needs attention");
}

// 11–12. Mapping does not mutate input; labels independent of backend records
{
  const input = row();
  const before = JSON.stringify(input);
  toCommandCenterItem(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(stageLabelForWorkflow("Ready for approval"), "Ready to publish");
  console.log("ok: no mapping writes; labels do not alter backend records");
}

// Summary counts + filter + sort single source of truth
{
  const items = [
    toCommandCenterItem(row({ id: "a", needsAttention: true })),
    toCommandCenterItem(
      row({
        id: "b",
        workflowStatus: "Ready for approval",
        needsAttention: true,
        attentionReasons: ["approved_not_published"],
        openTarget: "digital"
      })
    ),
    toCommandCenterItem(
      row({
        id: "c",
        workflowStatus: "Published",
        needsAttention: false,
        attentionReasons: [],
        openTarget: "digital"
      })
    ),
    toCommandCenterItem(
      row({
        id: "d",
        workflowStatus: "Customer submitted",
        needsAttention: true,
        attentionReasons: ["customer_requested_changes"],
        openTarget: "review",
        receivedAt: "2026-07-20T10:00:00Z"
      })
    )
  ];
  const counts = commandCenterSummaryCounts(items);
  assert.equal(counts.needs_attention, 3);
  assert.equal(counts.ready_to_publish, 1);
  assert.equal(counts.waiting_on_customer, 1);
  assert.equal(counts.review_requested, 1);
  assert.equal(filterCommandCenterItems(items, "ready_to_publish").length, 1);
  const sorted = sortCommandCenterItems(items, "attention");
  assert.equal(sorted[0].stageKey, "review_requested"); // severity 2 before takeoff severity 1
  assert.ok(attentionSeverity(["failed"], "Takeoff failed") > attentionSeverity(["takeoff_needs_review"], ""));
  console.log("ok: summary counts match filtered queue; attention sort deterministic");
}

console.log("\nAll studioCommandCenterViewModel tests passed.\n");
