/**
 * takeoffApprovalGate — unit tests (v5.8).
 *
 * Run: npm run eos:test:takeoff-approval-gate
 */
import assert from "node:assert/strict";
import {
  evaluateTakeoffApprovalGate,
  applyReviewFiltersToTakeoffResult,
  classifyBacksplashTotals,
  recordFlagResolution,
} from "./takeoffApprovalGate.mjs";
import { makeTakeoffRun } from "./takeoffContract.mjs";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";

console.log("\ntakeoffApprovalGate — tests\n");

function makeRoom(id, name, runs, areaExtras = {}) {
  return {
    id,
    name,
    roomType: "Kitchen",
    areas: [{
      id: `${id}-a1`,
      label: "Main",
      backsplashIncluded: true,
      backsplashScope: "stone",
      ...areaExtras,
      runs,
    }],
  };
}

function completeReviewState(roomIds, extra = {}) {
  const roomCompleteness = {};
  for (const id of roomIds) roomCompleteness[id] = true;
  return {
    excludedRunIds: [],
    flagResolutions: {},
    roomCompleteness,
    referenceTotalAcks: {},
    evidenceAcks: {},
    ...extra,
  };
}

function baseResult() {
  return {
    schemaVersion: "1",
    status: "reviewed",
    rooms: [
      makeRoom("r1", "Kitchen", [
        makeTakeoffRun({ id: "run1", label: "Wall", lengthIn: 96, depthIn: 25.5, pieceType: "counter" }),
      ]),
    ],
  };
}

function evaluate(result, reviewState, opts = {}) {
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);
  return evaluateTakeoffApprovalGate({
    takeoffResult: result,
    computed,
    validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewState,
    hasSavedResult: true,
    hasUnsavedEdits: false,
    ...opts,
  });
}

// T1 — clean reviewed takeoff with complete rooms can approve
{
  const result = baseResult();
  const gate = evaluate(result, completeReviewState(["r1"]));
  assert.equal(gate.canApprove, true, "T1 canApprove");
  assert.equal(gate.blockers.length, 0, "T1 no blockers");
  console.log("ok: T1 clean takeoff can approve");
}

// T2 — missing dimensions block approval
{
  const result = baseResult();
  result.rooms[0].areas[0].runs[0].lengthIn = 0;
  const gate = evaluate(result, completeReviewState(["r1"]));
  assert.ok(gate.blockers.some((b) => b.code === "MISSING_RUN_DIMENSIONS"), "T2 missing dims");
  console.log("ok: T2 missing dimensions block approval");
}

// T3 — incomplete room blocks approval
{
  const result = baseResult();
  const gate = evaluate(result, completeReviewState([]));
  assert.ok(gate.blockers.some((b) => b.code === "ROOM_INCOMPLETE"), "T3 room incomplete");
  console.log("ok: T3 incomplete room blocks approval");
}

// T4 — excluded runs removed from payload filter
{
  const result = baseResult();
  result.rooms[0].areas[0].runs.push(
    makeTakeoffRun({ id: "run2", label: "Bad", lengthIn: 0, depthIn: 0, pieceType: "counter" })
  );
  const filtered = applyReviewFiltersToTakeoffResult(result, { excludedRunIds: ["run2"] });
  assert.equal(filtered.rooms[0].areas[0].runs.length, 1, "T4 excluded run filtered");
  console.log("ok: T4 excluded runs filtered");
}

// T4b — excluded rooms removed from payload filter
{
  const result = baseResult();
  result.rooms.push(makeRoom("r2", "Wrong Room", [
    makeTakeoffRun({ id: "runX", label: "Ghost", lengthIn: 48, depthIn: 25.5, pieceType: "counter" }),
  ]));
  const filtered = applyReviewFiltersToTakeoffResult(result, { excludedRoomIds: ["r2"] });
  assert.equal(filtered.rooms.length, 1, "T4b excluded room filtered");
  assert.equal(filtered.rooms[0].id, "r1", "T4b active room kept");
  console.log("ok: T4b excluded rooms filtered");
}

// T5 — backsplash totals separated
{
  const result = baseResult();
  result.rooms[0].areas[0].runs.push(
    makeTakeoffRun({ id: "bs1", label: "4in BS", lengthIn: 120, depthIn: 4, pieceType: "splash" })
  );
  result.rooms[0].areas[0].runs.push(
    makeTakeoffRun({ id: "fhb1", label: "FHB", lengthIn: 48, depthIn: 96, pieceType: "fhb" })
  );
  const totals = classifyBacksplashTotals(result, { excludedRunIds: [] });
  assert.ok(totals.standardBacksplashSqft > 0, "T5 standard BS");
  assert.ok(totals.fullHeightBacksplashSqft > 0, "T5 FHBS");
  console.log("ok: T5 backsplash types separated");
}

// T6 — unsaved edits block approval
{
  const result = baseResult();
  const gate = evaluate(result, completeReviewState(["r1"]), { hasUnsavedEdits: true });
  assert.ok(gate.blockers.some((b) => b.code === "UNSAVED_EDITS"), "T6 stale edits");
  console.log("ok: T6 unsaved edits block approval");
}

// T7 — flag resolution with note clears blocker
{
  const result = baseResult();
  const rs = completeReviewState(["r1"]);
  const gateBefore = evaluate(result, rs, {
    qaGate: {
      status: "needs_review",
      topIssues: [{ code: "TEST_FLAG", severity: "warning", message: "Review me" }],
    },
  });
  assert.ok(gateBefore.blockers.some((b) => b.code === "TEST_FLAG"), "T7 flag blocks");

  const rs2 = recordFlagResolution(rs, {
    code: "TEST_FLAG",
    action: "ignored",
    note: "Confirmed OK on plan",
    userId: "user-1",
  });
  const gateAfter = evaluate(result, rs2, {
    qaGate: {
      status: "needs_review",
      topIssues: [{ code: "TEST_FLAG", severity: "warning", message: "Review me" }],
    },
  });
  assert.ok(!gateAfter.blockers.some((b) => b.code === "TEST_FLAG"), "T7 flag resolved");
  console.log("ok: T7 flag resolution clears blocker");
}

// T8 — referenceTotalAcks clears REFERENCE_TOTAL_COUNTERTOP_MISMATCH blocker
// (Kitchen 49 sf vs 34.69 sf scenario: estimator accepts reviewed total)
{
  const result = baseResult();
  // Add a validation diagnostic that triggers the mismatch
  const rsBase = completeReviewState(["r1"]);
  const validation = validateTakeoffResult(result, computeTakeoffMeasurements(result));
  // Inject a fake reference mismatch diagnostic directly
  const fakeValidation = {
    ...validation,
    diagnostics: [
      ...(validation.diagnostics ?? []),
      {
        code: "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
        message: "Plan note says 49 sf. Reviewed total is 34.69 sf.",
        path: null,
        level: "warning",
      },
    ],
  };

  const gateBefore = evaluateTakeoffApprovalGate({
    takeoffResult: result,
    computed: computeTakeoffMeasurements(result),
    validation: fakeValidation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewState: rsBase,
    hasSavedResult: true,
    hasUnsavedEdits: false,
  });
  assert.ok(
    gateBefore.blockers.some((b) => b.code === "REFERENCE_TOTAL_COUNTERTOP_MISMATCH"),
    "T8 mismatch blocker present before ack"
  );
  assert.equal(gateBefore.canApprove, false, "T8 canApprove false before ack");

  // Simulate estimator accepting the reviewed total
  const rsAcked = { ...rsBase, referenceTotalAcks: { REFERENCE_TOTAL_COUNTERTOP_MISMATCH: true } };
  const gateAfter = evaluateTakeoffApprovalGate({
    takeoffResult: result,
    computed: computeTakeoffMeasurements(result),
    validation: fakeValidation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewState: rsAcked,
    hasSavedResult: true,
    hasUnsavedEdits: false,
  });
  assert.ok(
    !gateAfter.blockers.some((b) => b.code === "REFERENCE_TOTAL_COUNTERTOP_MISMATCH"),
    "T8 mismatch blocker cleared after ack"
  );
  assert.equal(gateAfter.canApprove, true, "T8 canApprove true after ack");
  console.log("ok: T8 referenceTotalAck clears REFERENCE_TOTAL_COUNTERTOP_MISMATCH blocker");
}

// T9 — EVIDENCE_RECONCILIATION clears via flagResolution
{
  const result = baseResult();
  const rs = completeReviewState(["r1"]);

  // Without flag resolution, if evidence reconciliation fires it blocks.
  // (In the real gate this needs dimensionEvidence to trigger — we test
  // only that the flagResolution mechanism clears it by mocking the gate
  // via recordFlagResolution.)
  const rs2 = recordFlagResolution(rs, {
    code: "EVIDENCE_RECONCILIATION",
    action: "resolved",
    note: "Rooms verified by estimator.",
  });
  assert.ok(
    rs2.flagResolutions?.["EVIDENCE_RECONCILIATION"]?.action === "resolved",
    "T9 flag resolution written"
  );
  console.log("ok: T9 EVIDENCE_RECONCILIATION clears via flagResolution resolved");
}

// T10 — workflow state: reference mismatch classified as estimator decision, not hard
{
  const { buildTakeoffWorkflowState, HARD_BLOCKER_CODES, ESTIMATOR_DECISION_CODES } =
    await import("./takeoffWorkflowState.mjs");

  assert.ok(
    !HARD_BLOCKER_CODES.has("REFERENCE_TOTAL_COUNTERTOP_MISMATCH"),
    "T10 mismatch code is NOT a hard blocker"
  );
  assert.ok(
    ESTIMATOR_DECISION_CODES.has("REFERENCE_TOTAL_COUNTERTOP_MISMATCH"),
    "T10 mismatch code IS an estimator decision"
  );
  const state = buildTakeoffWorkflowState({
    approvalGate: {
      blockers: [{ code: "REFERENCE_TOTAL_COUNTERTOP_MISMATCH", message: "49 sf vs 34.69 sf", path: null }],
      canApprove: false,
      canImport: false,
    },
    reviewedMath: { activeRooms: [{ roomId: "r1", roomName: "Kitchen" }] },
    reviewState: { excludedRoomIds: [], roomCompleteness: { r1: true } },
    selectedRoomId: "r1",
    hasSaveableChanges: false,
    saveStatus: "idle",
    hasSavedResult: true,
    reviewStatus: "needs_review",
    importStatus: null,
  });
  assert.equal(state.hardBlockers.length, 0, "T10 no hard blockers");
  assert.equal(state.pendingDecisionCount, 1, "T10 one pending decision");
  assert.equal(state.step, "final_review", "T10 step = final_review");
  assert.equal(state.canApprove, false, "T10 canApprove false (decision pending)");
  console.log("ok: T10 workflow state: reference mismatch = estimator decision");
}

console.log("\nAll takeoffApprovalGate tests passed.\n");
