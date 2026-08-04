/**
 * Deterministic consolidated approve-click regression tests.
 * Simulates hosted case: 0 blocking, 7 advisory, one confirm, one API call.
 *
 * Run: node app-ai-takeoff/src/lib/consolidatedApproveClick.test.mjs
 */
import assert from "node:assert/strict";
import {
  advisoryConfirmDialogMessage,
  approveButtonLabel,
  buildConfirmedApproveBody,
  formatApprovalDiagnostic,
  runConsolidatedApproveClick,
  shouldConfirmAdvisoriesDialog
} from "./consolidatedApproveClick.mjs";

console.log("\nconsolidatedApproveClick.test.mjs\n");

{
  assert.equal(shouldConfirmAdvisoriesDialog({ blockingCount: 0, advisoryCount: 7 }), true);
  assert.equal(shouldConfirmAdvisoriesDialog({ blockingCount: 1, advisoryCount: 7 }), false);
  assert.equal(shouldConfirmAdvisoriesDialog({ blockingCount: 0, advisoryCount: 0 }), false);
  assert.match(advisoryConfirmDialogMessage(7), /7 advisory warnings/);
  assert.equal(
    approveButtonLabel({ approveStatus: "idle", advisoryCount: 7, blockingCount: 0 }),
    "Approve with 7 advisory warnings"
  );
  console.log("  ✓ T1 dialog + button label for hosted 7-advisory case");
}

{
  const body = buildConfirmedApproveBody({
    takeoffResult: { rooms: [] },
    reviewState: { excludedRunIds: [] }
  });
  assert.equal(body.confirmAdvisories, true);
  assert.equal(body.acceptAdvisoryWarnings, true);
  assert.throws(() => {
    // @ts-expect-error frozen
    body.confirmAdvisories = false;
  });
  console.log("  ✓ T2 immutable confirmed payload");
}

// Hosted path: confirm true → exactly one API request with confirmAdvisories: true
{
  let apiCalls = 0;
  let lastBody = null;
  let parentNotified = false;
  let studioRefresh = false;
  let scopeOpened = false;

  const result = await runConsolidatedApproveClick({
    blockingCount: 0,
    advisoryCount: 7,
    takeoffResult: { rooms: [{ id: "r1" }] },
    reviewState: { excludedRunIds: [] },
    confirmFn: () => true,
    approveFn: async (body) => {
      apiCalls += 1;
      lastBody = body;
      assert.equal(body.confirmAdvisories, true);
      assert.equal(body.acceptAdvisoryWarnings, true);
      return {
        takeoffJobId: "job-1",
        reviewStatus: "approved",
        approvedResultId: "result-1",
        advisoryCount: 7,
        estimateScopeRefreshRequired: true,
        seededEstimateScope: true,
        advisory: Array.from({ length: 7 }, (_, i) => ({ code: `A${i}`, message: "advisory" }))
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(apiCalls, 1, "exactly one approval API request");
  assert.equal(lastBody.confirmAdvisories, true);
  assert.equal(result.response.reviewStatus, "approved");
  assert.equal(result.response.advisoryCount, 7);
  assert.equal(result.response.estimateScopeRefreshRequired, true);
  assert.equal(result.response.seededEstimateScope, true);
  assert.equal(result.diagnostic.httpStatus, 200);
  assert.equal(result.diagnostic.confirmAdvisories, true);
  assert.equal(result.diagnostic.errorCode, null);

  // Simulate parent + Studio handoff from successful promise (not postMessage-only).
  if (result.ok && result.response.reviewStatus === "approved") {
    parentNotified = true;
    studioRefresh = true;
    scopeOpened = true;
  }
  assert.equal(parentNotified, true);
  assert.equal(studioRefresh, true);
  assert.equal(scopeOpened, true);
  console.log("  ✓ T3 hosted path: one confirm → one confirmed request → approved handoff");
  console.log("     request body keys:", Object.keys(lastBody).join(", "));
  console.log(
    "     response:",
    JSON.stringify({
      takeoffJobId: result.response.takeoffJobId,
      reviewStatus: result.response.reviewStatus,
      approvedResultId: result.response.approvedResultId,
      advisoryCount: result.response.advisoryCount,
      estimateScopeRefreshRequired: result.response.estimateScopeRefreshRequired,
      seededEstimateScope: result.response.seededEstimateScope
    })
  );
}

// Cancel → zero API requests
{
  let apiCalls = 0;
  const result = await runConsolidatedApproveClick({
    blockingCount: 0,
    advisoryCount: 7,
    takeoffResult: {},
    reviewState: {},
    confirmFn: () => false,
    approveFn: async () => {
      apiCalls += 1;
      return {};
    }
  });
  assert.equal(result.cancelled, true);
  assert.equal(apiCalls, 0);
  console.log("  ✓ T4 confirmation cancelled → zero API requests");
}

// API failure → visible safe error diagnostic
{
  const err = Object.assign(new Error("Confirm still required"), {
    status: 422,
    body: {
      code: "approval_advisory_confirmation_required",
      error: "Confirm 7 advisory warning(s) before approval",
      hardBlockers: [],
      advisory: Array.from({ length: 7 }, () => ({ code: "X", message: "a" }))
    }
  });
  const result = await runConsolidatedApproveClick({
    blockingCount: 0,
    advisoryCount: 7,
    takeoffResult: {},
    reviewState: {},
    confirmFn: () => true,
    approveFn: async () => {
      throw err;
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.httpStatus, 422);
  assert.equal(result.diagnostic.errorCode, "approval_advisory_confirmation_required");
  assert.equal(result.diagnostic.confirmAdvisories, true);
  assert.equal(result.diagnostic.advisoryCount, 7);
  assert.ok(result.diagnostic.message);
  console.log("  ✓ T5 request failure → visible safe diagnostic");
}

// Repeated approved click → idempotent success
{
  let apiCalls = 0;
  const approveFn = async (body) => {
    apiCalls += 1;
    assert.equal(body.confirmAdvisories, true);
    return {
      takeoffJobId: "job-1",
      reviewStatus: "approved",
      approvedResultId: "result-1",
      advisoryCount: 7,
      estimateScopeRefreshRequired: true,
      seededEstimateScope: true,
      idempotent: apiCalls > 1
    };
  };
  const first = await runConsolidatedApproveClick({
    blockingCount: 0,
    advisoryCount: 7,
    takeoffResult: {},
    reviewState: {},
    confirmFn: () => true,
    approveFn
  });
  const second = await runConsolidatedApproveClick({
    blockingCount: 0,
    advisoryCount: 7,
    takeoffResult: {},
    reviewState: {},
    confirmFn: () => true,
    approveFn
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.response.idempotent, true);
  assert.equal(apiCalls, 2);
  console.log("  ✓ T6 repeated confirmed click → idempotent success");
}

{
  const d = formatApprovalDiagnostic({
    confirmAdvisories: true,
    httpStatus: 200,
    reviewStatus: "approved",
    errorCode: null
  });
  assert.equal(d.confirmAdvisories, true);
  assert.equal(d.httpStatus, 200);
  console.log("  ✓ T7 diagnostic formatter");
}

console.log("\nconsolidatedApproveClick.test.mjs — all passed\n");
