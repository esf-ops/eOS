/**
 * Milestone 2 — Open Estimate → linked Takeoff workspace wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveEstimateTakeoffDisplayStatus } from "./lib/estimateTakeoffStatus.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const app = readFileSync(join(root, "src/StudioApp.tsx"), "utf8");
const workspace = readFileSync(
  join(root, "src/estimateQueue/EstimateTakeoffWorkspace.tsx"),
  "utf8"
);
const api = readFileSync(join(root, "src/lib/quoteIntakeApi.mjs"), "utf8");
const queue = readFileSync(join(root, "src/estimateQueue/EstimateQueuePage.tsx"), "utf8");

assert.ok(app.includes("EstimateTakeoffWorkspace"));
assert.equal(app.includes("EstimateWorkspacePlaceholder"), false);
assert.ok(workspace.includes("openEstimate"));
assert.ok(workspace.includes("eq-takeoff-iframe"));
assert.ok(workspace.includes("takeoffJobId"));
assert.ok(workspace.includes("consolidated=1"));
assert.ok(workspace.includes("eliteos-takeoff-approved"));
assert.ok(workspace.includes("isAllowedTakeoffMessageOrigin"));
assert.ok(workspace.includes("eq-takeoff-handoff-notice") || workspace.includes("handoffNotice"));
assert.ok(workspace.includes("scopeRefreshKey"));
assert.ok(workspace.includes("schedule(20_000)"));
assert.ok(!workspace.includes("setInterval"), "status polling uses non-overlapping timeout");
assert.ok(workspace.includes("Back to Estimate Queue"));
assert.equal(workspace.includes("Approve the Takeoff in the review workspace above"), false);
assert.ok(api.includes("/open-estimate"));
assert.ok(api.includes("async openEstimate"));
assert.ok(workspace.includes("deriveEstimateTakeoffDisplayStatus"));
assert.ok(queue.includes("Open in Estimate Studio") || queue.includes("onOpenEstimate"));
assert.ok(queue.includes("openTarget") || app.includes("openTarget"));
assert.ok(app.includes("Keep intakeCaseId") || app.includes("intakeCaseId"));

// Back to queue preserves selected case: workspace clear must not clear intakeCaseId.
assert.ok(app.includes("setEstimateWorkspaceCaseId(null)"));
assert.ok(app.includes("selectedCaseId={intakeCaseId}"));

assert.equal(deriveEstimateTakeoffDisplayStatus({}), "New");
assert.equal(
  deriveEstimateTakeoffDisplayStatus({ takeoffJobId: "job-1", linkStatus: "queued" }),
  "Takeoff queued"
);
assert.equal(
  deriveEstimateTakeoffDisplayStatus({ jobStatus: "processing" }),
  "Takeoff processing"
);
assert.equal(
  deriveEstimateTakeoffDisplayStatus({ jobStatus: "completed", reviewStatus: "needs_review", pieceCount: 1 }),
  "Takeoff draft ready"
);
assert.equal(
  deriveEstimateTakeoffDisplayStatus({ jobStatus: "completed", reviewStatus: "needs_review" }),
  "Takeoff queued"
);
assert.equal(
  deriveEstimateTakeoffDisplayStatus({ reviewStatus: "approved" }),
  "Needs estimator review"
);
assert.equal(deriveEstimateTakeoffDisplayStatus({ jobStatus: "failed" }), "Takeoff failed");

console.log("\nmilestone2.openEstimate.ui.test.mjs\n");
console.log("ok: Studio opens returned takeoff job; Back preserves case; status labels");
console.log("\nAll Milestone 2 Open Estimate UI tests passed.\n");
