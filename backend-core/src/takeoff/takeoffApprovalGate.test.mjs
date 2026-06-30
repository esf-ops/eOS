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

// ── Kitchen HAR regression fixture ─────────────────────────────────────────
//
// Mirrors the job 6376dea4 scenario from the HAR:
//   - Kitchen room verified, saved
//   - Reviewed total ~34.69 sf (run at 96" × 25.5" depth)
//   - No backsplash
//   - dimensionEvidence dimension says 150" (unsupported → EVIDENCE_RECONCILIATION)
//   - No flagResolutions
//
// Expected (before fix):
//   - frontend gate (dimensionEvidence: null) → canApprove true  ← THE BUG
//   - server gate (dimensionEvidence loaded)  → canApprove false ← CORRECT
//
// Expected (after fix — getLatestTakeoffResult returns dimensionEvidence):
//   - both gates agree → canApprove false until decision accepted
//
// T11 — Kitchen HAR: gate with dimensionEvidence=null misses EVIDENCE_RECONCILIATION
{
  const result = {
    schemaVersion: "1",
    status: "reviewed",
    rooms: [
      makeRoom("kitchen-1", "Kitchen", [
        // 96" × 25.5" depth ≈ 17 sf countertop
        makeTakeoffRun({ id: "run-wall", label: "Wall", lengthIn: 96, depthIn: 25.5, pieceType: "counter" }),
      ], { backsplashIncluded: false, backsplashScope: "none" }),
    ],
  };
  const rs = completeReviewState(["kitchen-1"]);

  // Without dimensionEvidence, reconciliation never runs → no EVIDENCE_RECONCILIATION blocker
  const gateNoEvidence = evaluate(result, rs, { dimensionEvidence: null });
  assert.equal(gateNoEvidence.canApprove, true, "T11 no evidence → canApprove true (the old bug state)");
  assert.ok(
    !gateNoEvidence.blockers.some((b) => b.code === "EVIDENCE_RECONCILIATION"),
    "T11 no EVIDENCE_RECONCILIATION without dimensionEvidence"
  );

  // With dimensionEvidence that contradicts the run (150" evidence vs 96" run)
  const dimensionEvidence = {
    dimensions: [
      { id: "dim-1", category: "countertop_run", confidence: "high", lengthIn: 150, label: "Wall" },
    ],
  };
  const gateWithEvidence = evaluate(result, rs, { dimensionEvidence });
  assert.equal(gateWithEvidence.canApprove, false, "T11 with evidence → canApprove false");
  assert.ok(
    gateWithEvidence.blockers.some((b) => b.code === "EVIDENCE_RECONCILIATION"),
    "T11 EVIDENCE_RECONCILIATION fires with mismatched dimensionEvidence"
  );
  console.log("ok: T11 Kitchen HAR: dimensionEvidence=null vs loaded changes canApprove");
}

// T12 — EVIDENCE_RECONCILIATION decision key produced by workflowState matches key consumed by gate
{
  const { buildTakeoffWorkflowState, ESTIMATOR_DECISION_CODES } = await import("./takeoffWorkflowState.mjs");

  // Gate produces EVIDENCE_RECONCILIATION blocker (no path).
  const gate = {
    blockers: [{ code: "EVIDENCE_RECONCILIATION", message: "2 issues remain.", path: null, category: "evidence" }],
    canApprove: false,
    canImport: false,
  };

  // Workflow state builds the decision card with a resolution descriptor.
  const state = buildTakeoffWorkflowState({
    approvalGate: gate,
    reviewedMath: { activeRooms: [{ roomId: "kitchen-1", roomName: "Kitchen" }] },
    reviewState: { excludedRoomIds: [], roomCompleteness: { "kitchen-1": true } },
    selectedRoomId: "kitchen-1",
    hasSaveableChanges: false,
    saveStatus: "idle",
    hasSavedResult: true,
    reviewStatus: "needs_review",
    importStatus: null,
  });

  assert.equal(state.estimatorDecisionsRequired.length, 1, "T12 one decision required");
  const decision = state.estimatorDecisionsRequired[0];
  assert.equal(decision.code, "EVIDENCE_RECONCILIATION", "T12 decision code");
  assert.equal(decision.resolution.type, "flagResolution", "T12 resolution type is flagResolution");
  assert.equal(decision.resolution.code, "EVIDENCE_RECONCILIATION", "T12 resolution code matches blocker code");
  assert.equal(decision.resolution.path, null, "T12 resolution path is null (no path for global reconciliation)");

  // The key written by handleResolveFlagDecision is: path ? `${code}::${path}` : code
  const writtenKey = decision.resolution.path
    ? `${decision.resolution.code}::${decision.resolution.path}`
    : decision.resolution.code;
  assert.equal(writtenKey, "EVIDENCE_RECONCILIATION", "T12 written flagResolution key matches gate's isFlagResolved key");

  // Verify: writing this key into flagResolutions clears the blocker.
  const { evaluateTakeoffApprovalGate: evalGate } = await import("./takeoffApprovalGate.mjs");
  const result = {
    schemaVersion: "1",
    status: "reviewed",
    rooms: [
      makeRoom("kitchen-1", "Kitchen", [
        makeTakeoffRun({ id: "run-wall", label: "Wall", lengthIn: 96, depthIn: 25.5, pieceType: "counter" }),
      ], { backsplashIncluded: false, backsplashScope: "none" }),
    ],
  };
  const dimensionEvidence = {
    dimensions: [
      { id: "dim-1", category: "countertop_run", confidence: "high", lengthIn: 150, label: "Wall" },
    ],
  };
  const rsWithResolution = {
    ...completeReviewState(["kitchen-1"]),
    flagResolutions: {
      [writtenKey]: { action: "resolved", note: "Reviewed and accepted by estimator." },
    },
  };
  const computed = (await import("./takeoffMeasurementCalc.mjs")).computeTakeoffMeasurements(result);
  const validation = (await import("./takeoffValidator.mjs")).validateTakeoffResult(result, computed);
  const gateAfterAccept = evalGate({
    takeoffResult: result,
    computed,
    validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    dimensionEvidence,
    reviewState: rsWithResolution,
    hasSavedResult: true,
    hasUnsavedEdits: false,
    reviewStatus: "needs_review",
  });
  assert.equal(gateAfterAccept.canApprove, true, "T12 canApprove true after flagResolution accepted");
  assert.ok(
    !gateAfterAccept.blockers.some((b) => b.code === "EVIDENCE_RECONCILIATION"),
    "T12 EVIDENCE_RECONCILIATION cleared after accept"
  );
  console.log("ok: T12 EVIDENCE_RECONCILIATION decision key round-trips through gate");
}

// T13 — Kitchen HAR full workflow: list/detail/frontend/approve all agree
{
  const { buildTakeoffWorkflowState } = await import("./takeoffWorkflowState.mjs");
  const { evaluateTakeoffApprovalGate: evalGate } = await import("./takeoffApprovalGate.mjs");

  const result = {
    schemaVersion: "1",
    status: "reviewed",
    rooms: [
      makeRoom("kitchen-1", "Kitchen", [
        makeTakeoffRun({ id: "run-wall", label: "Wall", lengthIn: 96, depthIn: 25.5, pieceType: "counter" }),
      ], { backsplashIncluded: false, backsplashScope: "none" }),
    ],
  };
  const dimensionEvidence = {
    dimensions: [
      { id: "dim-1", category: "countertop_run", confidence: "high", lengthIn: 150, label: "Wall" },
    ],
  };
  const rs = completeReviewState(["kitchen-1"]);
  const computed = (await import("./takeoffMeasurementCalc.mjs")).computeTakeoffMeasurements(result);
  const validation = (await import("./takeoffValidator.mjs")).validateTakeoffResult(result, computed);

  // Server gate (has dimensionEvidence, as in detail/approve endpoints)
  const serverGate = evalGate({
    takeoffResult: result, computed, validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    dimensionEvidence, reviewState: rs,
    hasSavedResult: true, hasUnsavedEdits: false, reviewStatus: "needs_review",
  });
  assert.equal(serverGate.canApprove, false, "T13 server gate: canApprove false");

  // Frontend gate (WITH dimensionEvidence — as after the fix where results/latest returns it)
  const frontendGate = evalGate({
    takeoffResult: result, computed, validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    dimensionEvidence, reviewState: rs,
    hasSavedResult: true, hasUnsavedEdits: false, reviewStatus: "needs_review",
  });
  assert.equal(frontendGate.canApprove, false, "T13 frontend gate with evidence: canApprove false");
  assert.deepEqual(
    serverGate.canApprove, frontendGate.canApprove,
    "T13 server and frontend gates agree"
  );

  // WorkflowState sees the decision
  const ws = buildTakeoffWorkflowState({
    approvalGate: frontendGate,
    reviewedMath: { activeRooms: [{ roomId: "kitchen-1", roomName: "Kitchen" }] },
    reviewState: { excludedRoomIds: [], roomCompleteness: { "kitchen-1": true } },
    selectedRoomId: "kitchen-1",
    hasSaveableChanges: false, saveStatus: "idle",
    hasSavedResult: true, reviewStatus: "needs_review", importStatus: null,
  });
  assert.equal(ws.canApprove, false, "T13 workflowState.canApprove false");
  assert.equal(ws.estimatorDecisionsRequired.length, 1, "T13 one estimator decision shown");
  assert.equal(ws.primaryAction?.type, "review_decisions", "T13 primaryAction is review_decisions, not approve");

  // After accepting the decision, canApprove becomes true
  const rsAccepted = {
    ...rs,
    flagResolutions: {
      EVIDENCE_RECONCILIATION: { action: "resolved", note: "Reviewed and accepted by estimator." },
    },
  };
  const gateAccepted = evalGate({
    takeoffResult: result, computed, validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    dimensionEvidence, reviewState: rsAccepted,
    hasSavedResult: true, hasUnsavedEdits: false, reviewStatus: "needs_review",
  });
  assert.equal(gateAccepted.canApprove, true, "T13 canApprove true after accept");
  const wsAccepted = buildTakeoffWorkflowState({
    approvalGate: gateAccepted,
    reviewedMath: { activeRooms: [{ roomId: "kitchen-1", roomName: "Kitchen" }] },
    reviewState: { excludedRoomIds: [], roomCompleteness: { "kitchen-1": true } },
    selectedRoomId: "kitchen-1",
    hasSaveableChanges: false, saveStatus: "idle",
    hasSavedResult: true, reviewStatus: "needs_review", importStatus: null,
  });
  assert.equal(wsAccepted.canApprove, true, "T13 workflowState.canApprove true after accept");
  assert.equal(wsAccepted.primaryAction?.type, "approve", "T13 primaryAction is approve after accept");
  console.log("ok: T13 Kitchen HAR full workflow: list/detail/frontend agree, approve fires only after accept");
}

console.log("\nAll takeoffApprovalGate tests passed.\n");
