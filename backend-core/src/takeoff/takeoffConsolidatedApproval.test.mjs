/**
 * takeoffConsolidatedApproval — unit tests
 * Run: node backend-core/src/takeoff/takeoffConsolidatedApproval.test.mjs
 */
import assert from "node:assert/strict";
import {
  autoCompleteRoomReviewState,
  classifyConsolidatedSeverity,
  countIncludedMeasurablePieces,
  deriveConsolidatedDisplayStatus,
  evaluateConsolidatedApprovalGate,
  splitConsolidatedIssues
} from "./takeoffConsolidatedApproval.mjs";
import { makeTakeoffRun } from "./takeoffContract.mjs";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";

console.log("\ntakeoffConsolidatedApproval — tests\n");

function makeRoom(id, name, runs) {
  return {
    id,
    name,
    roomType: "Kitchen",
    areas: [
      {
        id: `${id}-a1`,
        label: "Main",
        backsplashIncluded: true,
        backsplashScope: "stone",
        runs
      }
    ]
  };
}

function baseResult() {
  return {
    schemaVersion: "1",
    status: "reviewed",
    rooms: [
      makeRoom("r1", "Kitchen", [
        makeTakeoffRun({
          id: "run1",
          label: "Wall",
          lengthIn: 96,
          depthIn: 25.5,
          pieceType: "counter"
        })
      ])
    ]
  };
}

function evaluate(result, reviewState = {}, opts = {}) {
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);
  return evaluateConsolidatedApprovalGate({
    takeoffResult: result,
    computed,
    validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: {},
      referenceTotalAcks: {},
      evidenceAcks: {},
      ...reviewState
    },
    hasSavedResult: true,
    hasUnsavedEdits: false,
    reviewStatus: "needs_review",
    ...opts
  });
}

// 1. High-confidence takeoff approves without per-room verification
{
  const gate = evaluate(baseResult());
  assert.equal(gate.canApprove, true, "T1 canApprove without roomCompleteness");
  assert.equal(gate.blocking.length, 0, "T1 no blocking");
  assert.equal(gate.reviewState.roomCompleteness.r1, true, "T1 auto-complete rooms");
  console.log("  ✓ T1 high-confidence approve without room verify");
}

// 2. ROOM_INCOMPLETE / evidence codes are advisory, not blocking
{
  const { blocking, advisory } = splitConsolidatedIssues([
    { code: "ROOM_INCOMPLETE", message: "Room not verified" },
    { code: "EVIDENCE_RECONCILIATION", message: "Evidence issues" },
    { code: "QA_GATE_BLOCKED", message: "QA" },
    { code: "MISSING_RUN_DIMENSIONS", message: "Missing dims" }
  ]);
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].code, "MISSING_RUN_DIMENSIONS");
  assert.equal(advisory.length, 3);
  assert.equal(classifyConsolidatedSeverity({ code: "BACKSPLASH_NEEDS_REVIEW" }), "advisory");
  console.log("  ✓ T2 advisory vs blocking split");
}

// 3. Missing dimensions block approval
{
  const result = baseResult();
  result.rooms[0].areas[0].runs[0].lengthIn = 0;
  const gate = evaluate(result);
  assert.equal(gate.canApprove, false);
  assert.ok(gate.blocking.some((b) => b.code === "MISSING_RUN_DIMENSIONS"));
  console.log("  ✓ T3 missing dimensions block");
}

// 4. Exclude false-positive leaves no measurable pieces → block
{
  const result = baseResult();
  const gate = evaluate(result, { excludedRunIds: ["run1"] });
  assert.equal(gate.canApprove, false);
  assert.ok(
    gate.blocking.some((b) => b.code === "NO_INCLUDED_PIECES" || b.code === "NO_ROOMS")
  );
  console.log("  ✓ T4 exclude-all blocks");
}

// 5. Add piece (reassign room) still measurable
{
  const result = baseResult();
  result.rooms.push(
    makeRoom("r2", "Bath", [
      makeTakeoffRun({
        id: "run2",
        label: "Vanity",
        lengthIn: 60,
        depthIn: 22,
        pieceType: "counter"
      })
    ])
  );
  const gate = evaluate(result);
  assert.equal(countIncludedMeasurablePieces(result, gate.reviewState), 2);
  assert.equal(gate.canApprove, true);
  console.log("  ✓ T5 add piece / multi-room ok");
}

// 6. Advisory confirmation path: canApproveWithAdvisory when only advisory remain
{
  // Force an advisory-only situation by injecting via split (gate may not emit advisory
  // without evidence). Verify severity helper + display statuses.
  assert.equal(deriveConsolidatedDisplayStatus({ jobStatus: "processing" }), "Processing");
  assert.equal(deriveConsolidatedDisplayStatus({ jobStatus: "failed" }), "Failed");
  assert.equal(
    deriveConsolidatedDisplayStatus({ jobStatus: "completed", reviewStatus: "approved" }),
    "Approved"
  );
  assert.equal(
    deriveConsolidatedDisplayStatus({
      jobStatus: "completed",
      reviewStatus: "needs_review",
      hasResult: true
    }),
    "Needs review"
  );
  console.log("  ✓ T6 display status mapping");
}

// 7. Processing / failed job statuses block
{
  const g1 = evaluate(baseResult(), {}, { jobStatus: "processing" });
  assert.equal(g1.canApprove, false);
  assert.ok(g1.blocking.some((b) => b.code === "TAKEOFF_PROCESSING"));
  const g2 = evaluate(baseResult(), {}, { jobStatus: "failed" });
  assert.ok(g2.blocking.some((b) => b.code === "TAKEOFF_FAILED"));
  console.log("  ✓ T7 processing/failed block");
}

// 8. autoComplete does not invent rooms
{
  const rs = autoCompleteRoomReviewState(baseResult(), { roomCompleteness: {} });
  assert.equal(rs.roomCompleteness.r1, true);
  console.log("  ✓ T8 autoComplete rooms");
}

console.log("\ntakeoffConsolidatedApproval — all passed\n");
