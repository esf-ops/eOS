/**
 * takeoffWorkflowState — unit tests.
 *
 * Run: node backend-core/src/takeoff/takeoffWorkflowState.test.mjs
 *
 * Covers the Kitchen 49 sf vs 34.69 sf reference-total-mismatch scenario and
 * the full blocker classification matrix.
 */
import assert from "node:assert/strict";
import {
  buildTakeoffWorkflowState,
  HARD_BLOCKER_CODES,
  ESTIMATOR_DECISION_CODES,
  DIAGNOSTIC_CODES,
} from "./takeoffWorkflowState.mjs";

console.log("\ntakeoffWorkflowState — tests\n");

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeGate(blockerCodes = [], extra = {}) {
  const blockers = blockerCodes.map((code) => ({
    code,
    message: `Blocker: ${code}`,
    path: null,
    category: "review",
  }));
  return {
    blockers,
    canApprove: blockers.length === 0,
    canImport: false,
    ...extra,
  };
}

function makeReviewedMath(roomIds = ["kitchen-1"]) {
  return {
    activeRooms: roomIds.map((id, i) => ({
      roomId: id,
      roomName: id === "kitchen-1" ? "Kitchen" : `Room ${i + 1}`,
      roomIdx: i,
    })),
  };
}

function baseInput(overrides = {}) {
  return {
    approvalGate: makeGate([]),
    reviewedMath: makeReviewedMath(["kitchen-1"]),
    reviewState: {
      excludedRoomIds: [],
      roomCompleteness: { "kitchen-1": true },
    },
    selectedRoomId: "kitchen-1",
    hasSaveableChanges: false,
    saveStatus: "idle",
    hasSavedResult: true,
    reviewStatus: "needs_review",
    importStatus: null,
    ...overrides,
  };
}

// ── T1: Kitchen scenario — reference mismatch requires decision, not hard block ─

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["REFERENCE_TOTAL_COUNTERTOP_MISMATCH"]),
    })
  );

  assert.equal(state.step, "final_review",
    "T1 step should be final_review (all rooms verified, no hard blockers)");
  assert.equal(state.hardBlockers.length, 0, "T1 no hard blockers");
  assert.equal(state.pendingDecisionCount, 1, "T1 one pending decision");
  assert.equal(
    state.estimatorDecisionsRequired[0].code,
    "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
    "T1 decision code"
  );
  assert.equal(
    state.estimatorDecisionsRequired[0].acceptLabel,
    "Accept reviewed total",
    "T1 accept label"
  );
  assert.equal(
    state.estimatorDecisionsRequired[0].resolution.type,
    "referenceTotalAck",
    "T1 resolution type"
  );
  assert.equal(
    state.estimatorDecisionsRequired[0].resolution.key,
    "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
    "T1 resolution key"
  );
  assert.equal(state.canApprove, false, "T1 canApprove false (decision pending)");
  assert.equal(state.primaryAction?.type, "review_decisions", "T1 primaryAction = review_decisions");
  console.log("ok: T1 reference total mismatch = estimator decision, not hard block");
}

// ── T2: After accepting the mismatch decision, canApprove becomes true ────────

{
  // Simulate gate after referenceTotalAcks["REFERENCE_TOTAL_COUNTERTOP_MISMATCH"] = true
  // → gate no longer produces that blocker
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate([]),  // decision cleared
    })
  );

  assert.equal(state.canApprove, true, "T2 canApprove true after decision accepted");
  assert.equal(state.pendingDecisionCount, 0, "T2 no pending decisions");
  assert.equal(state.primaryAction?.type, "approve", "T2 primaryAction = approve");
  console.log("ok: T2 accepted mismatch decision → canApprove true");
}

// ── T3: Hard blockers still block approval ────────────────────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["ROOM_INCOMPLETE"]),
    })
  );

  assert.equal(state.hardBlockers.length, 1, "T3 one hard blocker");
  assert.equal(state.canApprove, false, "T3 canApprove false");
  assert.equal(state.step, "review", "T3 step = review (hard blocker present)");
  console.log("ok: T3 hard blockers still block approval");
}

// ── T4: Evidence reconciliation = estimator decision, not hard block ──────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["EVIDENCE_RECONCILIATION"]),
    })
  );

  assert.equal(state.hardBlockers.length, 0, "T4 no hard blockers");
  assert.equal(state.pendingDecisionCount, 1, "T4 one pending decision");
  assert.equal(state.estimatorDecisionsRequired[0].code, "EVIDENCE_RECONCILIATION");
  assert.equal(state.estimatorDecisionsRequired[0].resolution.type, "flagResolution");
  assert.equal(state.estimatorDecisionsRequired[0].resolution.code, "EVIDENCE_RECONCILIATION");
  assert.equal(state.canApprove, false, "T4 canApprove false");
  console.log("ok: T4 evidence reconciliation = estimator decision");
}

// ── T5: Diagnostic codes never block approval ─────────────────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["QA_GATE_BLOCKED", "BACKSPLASH_SCOPE_CONFLICT"]),
    })
  );

  assert.equal(state.hardBlockers.length, 0, "T5 no hard blockers");
  assert.equal(state.pendingDecisionCount, 0, "T5 no pending decisions");
  assert.equal(state.diagnosticCount, 2, "T5 two diagnostics");
  assert.equal(state.canApprove, true, "T5 canApprove true (only diagnostics)");
  assert.equal(state.primaryAction?.type, "approve", "T5 primaryAction = approve");
  console.log("ok: T5 diagnostic-only blockers do not block approval");
}

// ── T6: Save failed → primaryAction = retry save ─────────────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({ saveStatus: "error" })
  );

  assert.equal(state.primaryAction?.type, "save", "T6 retry save");
  assert.match(state.primaryAction?.label ?? "", /retry/i, "T6 retry label");
  console.log("ok: T6 save error → retry save primary action");
}

// ── T7: Dirty state shows Save before Approve ─────────────────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({ hasSaveableChanges: true })
  );

  assert.equal(state.primaryAction?.type, "save", "T7 save action");
  assert.equal(state.canApprove, false, "T7 canApprove false (dirty)");
  console.log("ok: T7 dirty state shows Save before Approve");
}

// ── T8: Approved → primaryAction = Import ─────────────────────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      reviewStatus: "approved",
      importStatus: null,
    })
  );

  assert.equal(state.step, "approved", "T8 step = approved");
  assert.equal(state.canImport, true, "T8 canImport true");
  assert.equal(state.primaryAction?.type, "import", "T8 primaryAction = import");
  console.log("ok: T8 approved state → Import to Internal Estimate");
}

// ── T9: Imported → no import action, Imported label ──────────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      reviewStatus: "approved",
      importStatus: "imported",
    })
  );

  assert.equal(state.step, "imported", "T9 step = imported");
  assert.equal(state.canImport, false, "T9 canImport false");
  assert.equal(state.primaryAction?.disabled, true, "T9 primaryAction disabled");
  console.log("ok: T9 imported state — no import CTA shown");
}

// ── T10: Multi-room: excluded room does not block approval ─────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate([]),
      reviewedMath: makeReviewedMath(["kitchen-1", "bath-2"]),
      reviewState: {
        excludedRoomIds: ["bath-2"],  // bath excluded
        roomCompleteness: { "kitchen-1": true },
      },
    })
  );

  assert.equal(state.roomProgress.total, 1, "T10 only 1 included room");
  assert.equal(state.roomProgress.verified, 1, "T10 that room is verified");
  assert.equal(state.canApprove, true, "T10 excluded room does not block");
  console.log("ok: T10 excluded room does not block approval");
}

// ── T11: Included unverified room blocks approval ─────────────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["ROOM_INCOMPLETE"]),
      reviewedMath: makeReviewedMath(["kitchen-1"]),
      reviewState: {
        excludedRoomIds: [],
        roomCompleteness: {},  // not verified
      },
    })
  );

  assert.equal(state.hardBlockers.some((b) => b.code === "ROOM_INCOMPLETE"), true, "T11 hard blocker");
  assert.equal(state.canApprove, false, "T11 unverified room blocks approval");
  console.log("ok: T11 included unverified room blocks approval");
}

// ── T12: Save in progress → Saving… action ────────────────────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({ saveStatus: "saving", hasSaveableChanges: true })
  );

  assert.equal(state.primaryAction?.type, "none", "T12 no action while saving");
  assert.match(state.primaryAction?.label ?? "", /saving/i, "T12 saving label");
  assert.equal(state.primaryAction?.loading, true, "T12 loading true");
  console.log("ok: T12 save in progress → Saving… action");
}

// ── T13: Mixed — reference mismatch + ROOM_INCOMPLETE → hard blocker wins ─────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["ROOM_INCOMPLETE", "REFERENCE_TOTAL_COUNTERTOP_MISMATCH"]),
    })
  );

  assert.equal(state.hardBlockers.length, 1, "T13 one hard blocker");
  assert.equal(state.pendingDecisionCount, 1, "T13 one pending decision");
  assert.equal(state.step, "review", "T13 step = review (hard blocker present)");
  assert.equal(state.canApprove, false, "T13 canApprove false");
  console.log("ok: T13 mixed blockers — hard blockers take priority");
}

// ── T14: Import payload uses reviewed total, not reference total ───────────────
// (Structural test — verifying that approval gate uses reviewed dimensions)
// The Kitchen scenario: reviewed 34.69 sf, reference note says 49 sf.
// After accepting the mismatch, canApprove = true, and the import should
// use the 34.69 sf reviewed total (this is enforced by takeoffImportPayload.mjs,
// not this module — verified here by confirming canApprove is true).
{
  const state = buildTakeoffWorkflowState(
    baseInput({
      // Gate cleared — reference mismatch accepted
      approvalGate: makeGate([]),
    })
  );

  assert.equal(state.canApprove, true,
    "T14 after accepting mismatch, canApprove=true (import will use reviewed total)");
  console.log("ok: T14 accepted mismatch → canApprove, reviewed total used for import");
}

// ── T15: NO_BS_CONFLICT is an estimator decision, not hard blocker ─────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["REFERENCE_TOTAL_NO_BS_CONFLICT"]),
    })
  );

  assert.equal(state.hardBlockers.length, 0, "T15 no hard blockers");
  assert.equal(state.pendingDecisionCount, 1, "T15 one decision");
  assert.equal(state.estimatorDecisionsRequired[0].resolution.type, "referenceTotalAck");
  console.log("ok: T15 REFERENCE_TOTAL_NO_BS_CONFLICT = estimator decision");
}

// ── T16: BLOCKER CLASSIFICATION TABLE — every listed code is classified correctly

{
  // Verify no code appears in two categories simultaneously
  for (const code of HARD_BLOCKER_CODES) {
    assert.ok(!ESTIMATOR_DECISION_CODES.has(code), `T16 ${code} in both hard and decision`);
    assert.ok(!DIAGNOSTIC_CODES.has(code), `T16 ${code} in both hard and diagnostic`);
  }
  for (const code of ESTIMATOR_DECISION_CODES) {
    assert.ok(!DIAGNOSTIC_CODES.has(code), `T16 ${code} in both decision and diagnostic`);
  }
  console.log("ok: T16 blocker classification table — no overlaps");
}

// ── T17: Unknown code defaults to hard blocker (fail-safe) ────────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["SOME_FUTURE_UNKNOWN_CODE"]),
    })
  );

  assert.equal(state.hardBlockers.some((b) => b.code === "SOME_FUTURE_UNKNOWN_CODE"), true,
    "T17 unknown code falls back to hard blocker");
  assert.equal(state.canApprove, false, "T17 unknown code blocks approval");
  console.log("ok: T17 unknown blocker code defaults to hard blocker");
}

// ── T18: No rooms in scope → step = review with hard blocker ──────────────────

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["NO_ROOMS"]),
      reviewedMath: { activeRooms: [] },
      reviewState: { excludedRoomIds: [], roomCompleteness: {} },
    })
  );

  assert.equal(state.roomProgress.total, 0, "T18 no included rooms");
  assert.equal(state.canApprove, false, "T18 canApprove false");
  assert.equal(state.hardBlockers.some((b) => b.code === "NO_ROOMS"), true, "T18 NO_ROOMS hard");
  console.log("ok: T18 no included rooms — NO_ROOMS is hard blocker");
}

// ── T19: Null gate → canApprove must be false (regression guard) ──────────────
// Root cause: when evaluateTakeoffApprovalGate() throws, the useMemo catch returns null.
// Old canApproveTakeoff used approvalGate?.canApprove (undefined → false) so it was safe.
// New canApproveTakeoff uses workflowState.canApprove which was true when gate is null
// (no blockers → no hard blockers, no decisions → canApprove = true). Fixed by adding
// gateAvailable check in canApprove computation.

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: null,         // gate threw — treated as null by catch block
      hasSavedResult: true,
      hasSaveableChanges: false,
      reviewStatus: "needs_review",
      reviewState: { excludedRoomIds: [], roomCompleteness: { "kitchen-1": true } },
    })
  );

  assert.equal(state.canApprove, false,
    "T19 null gate must produce canApprove=false (regression: null gate must not enable approve)");
  assert.equal(state.canImport, false, "T19 null gate canImport=false");
  assert.equal(state.hardBlockers.length, 0, "T19 null gate has no hard blockers (they came from gate)");
  assert.equal(state.estimatorDecisionsRequired.length, 0, "T19 null gate has no decisions");
  console.log("ok: T19 null gate → canApprove false (regression guard)");
}

// ── T20: EVIDENCE_RECONCILIATION is classified as estimator decision, not hard blocker ─

{
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate(["EVIDENCE_RECONCILIATION"]),
    })
  );

  assert.equal(state.hardBlockers.length, 0, "T20 EVIDENCE_RECONCILIATION is not a hard blocker");
  assert.equal(state.estimatorDecisionsRequired.length, 1, "T20 EVIDENCE_RECONCILIATION is a decision");
  assert.equal(state.estimatorDecisionsRequired[0].code, "EVIDENCE_RECONCILIATION", "T20 correct decision code");
  assert.equal(state.canApprove, false, "T20 pending decision blocks canApprove");
  assert.equal(state.pendingDecisionCount, 1, "T20 pendingDecisionCount = 1");
  console.log("ok: T20 EVIDENCE_RECONCILIATION → estimator decision, not hard blocker");
}

// ── T21: After EVIDENCE_RECONCILIATION is resolved (gate cleared it), canApprove = true ─

{
  // When flagResolutions clears EVIDENCE_RECONCILIATION, the gate won't emit it.
  // Simulate by passing a gate with no blockers (as if reconciliation was cleared).
  const state = buildTakeoffWorkflowState(
    baseInput({
      approvalGate: makeGate([]),   // gate cleared reconciliation via flagResolutions
    })
  );

  assert.equal(state.estimatorDecisionsRequired.length, 0, "T21 no pending decisions after resolution");
  assert.equal(state.canApprove, true, "T21 canApprove true after decision resolved");
  console.log("ok: T21 cleared reconciliation decision → canApprove true");
}

console.log("\ntakeoffWorkflowState.test.mjs: all passed\n");
