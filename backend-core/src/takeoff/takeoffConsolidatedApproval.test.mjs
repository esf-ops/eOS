/**
 * takeoffConsolidatedApproval — unit tests
 * Run: node backend-core/src/takeoff/takeoffConsolidatedApproval.test.mjs
 */
import assert from "node:assert/strict";
import {
  autoCompleteRoomReviewState,
  classifyConsolidatedSeverity,
  collectConsolidatedHardBlockers,
  countIncludedMeasurablePieces,
  deriveConsolidatedDisplayStatus,
  evaluateConsolidatedApprovalGate,
  splitConsolidatedIssues
} from "./takeoffConsolidatedApproval.mjs";
import { evaluateTakeoffApprovalGate } from "./takeoffApprovalGate.mjs";
import { makeTakeoffRun } from "./takeoffContract.mjs";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";

console.log("\ntakeoffConsolidatedApproval — tests\n");

function makeRoom(id, name, runs, extras = {}) {
  return {
    id,
    name,
    roomType: extras.roomType ?? "Kitchen",
    areas: [
      {
        id: `${id}-a1`,
        label: extras.areaLabel ?? "Main",
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

/** Hosted failure shape: 1 room, 5 pieces, valid dims, positive SF, legacy QA/evidence noise. */
function hostedShapeResult() {
  // Dimensions chosen to produce ~72.33 CT SF (matches observed hosted case magnitude).
  const pieces = [
    { id: "p1", label: "Sink wall", lengthIn: 100, depthIn: 25.5 },
    { id: "p2", label: "Stove wall", lengthIn: 88, depthIn: 25.5 },
    { id: "p3", label: "Island", lengthIn: 106.56, depthIn: 36 },
    { id: "p4", label: "Return A", lengthIn: 42, depthIn: 25.5 },
    { id: "p5", label: "Return B", lengthIn: 28, depthIn: 25.5 }
  ];
  return {
    schemaVersion: "1",
    status: "reviewed",
    rooms: [
      makeRoom(
        "r1",
        "Kitchen",
        pieces.map((p) =>
          makeTakeoffRun({
            ...p,
            pieceType: "counter",
            requiresEstimatorReview: true,
            assemblyNotes: "evidence assembly uncertain"
          })
        )
      )
    ]
  };
}

function hostedQaGate() {
  return {
    status: "do_not_import",
    headline: "Do not use this takeoff — likely missing or conflicting data",
    topIssues: [
      {
        code: "VALIDATION_ERRORS",
        severity: "critical",
        message:
          "2 validation errors found — the takeoff structure has issues that must be resolved."
      },
      {
        code: "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
        severity: "warning",
        message: "Reference countertop total does not match computed SF."
      },
      {
        code: "BACKSPLASH_NEEDS_REVIEW",
        severity: "warning",
        message: "Backsplash scope uncertain."
      }
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

// 2. ROOM_INCOMPLETE / evidence / VALIDATION_ERRORS are advisory, not blocking
{
  const { blocking, advisory } = splitConsolidatedIssues([
    { code: "ROOM_INCOMPLETE", message: "Room not verified" },
    { code: "EVIDENCE_RECONCILIATION", message: "Evidence issues" },
    { code: "QA_GATE_BLOCKED", message: "Do not use this takeoff" },
    { code: "VALIDATION_ERRORS", message: "2 validation error(s) must be resolved before approval." },
    { code: "MISSING_RUN_DIMENSIONS", message: "Kitchen · Island: depth is required" }
  ]);
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].code, "MISSING_RUN_DIMENSIONS");
  assert.equal(advisory.length, 4);
  assert.equal(classifyConsolidatedSeverity({ code: "BACKSPLASH_NEEDS_REVIEW" }), "advisory");
  assert.equal(classifyConsolidatedSeverity({ code: "VALIDATION_ERRORS" }), "advisory");
  assert.equal(classifyConsolidatedSeverity({ code: "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED" }), "advisory");
  console.log("  ✓ T2 advisory vs blocking split (incl. VALIDATION_ERRORS demotion)");
}

// 3. Missing depth blocks with row-specific message
{
  const result = baseResult();
  result.rooms[0].areas[0].runs[0].label = "Island";
  result.rooms[0].areas[0].runs[0].depthIn = 0;
  const gate = evaluate(result);
  assert.equal(gate.canApprove, false);
  const miss = gate.blocking.find((b) => b.code === "MISSING_RUN_DIMENSIONS");
  assert.ok(miss, "missing dims blocker");
  assert.match(miss.message, /Kitchen · Island: depth is required/);
  assert.ok(!/validation error/i.test(miss.message));
  console.log("  ✓ T3 missing depth → row-specific block");
}

// 4. Exclude false-positive leaves no measurable pieces → block
{
  const result = baseResult();
  const gate = evaluate(result, { excludedRunIds: ["run1"] });
  assert.equal(gate.canApprove, false);
  assert.ok(
    gate.blocking.some((b) => b.code === "NO_INCLUDED_PIECES" || b.code === "NO_ROOMS")
  );
  console.log("  ✓ T4 exclude-all / zero pieces blocks");
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

// 6. Display status mapping
{
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

// 9. HOSTED REGRESSION — 5 pieces + legacy QA/evidence must not hard-block
{
  const result = hostedShapeResult();
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);
  // Force validation.hasErrors path the way hosted does (even if validator is clean).
  const forcedValidation = {
    ...validation,
    hasErrors: true,
    errorCount: 2,
    diagnostics: [
      ...(validation.diagnostics ?? []),
      {
        code: "TOTAL_MISMATCH_COUNTERTOP",
        level: "error",
        message: "AI total does not match computed"
      },
      {
        code: "EVIDENCE_DIMENSION_NOT_USED",
        level: "warning",
        message: "High-confidence evidence unused",
        path: "rooms[0].areas[0].runs[0]"
      }
    ]
  };

  const gate = evaluateConsolidatedApprovalGate({
    takeoffResult: result,
    computed,
    validation: forcedValidation,
    qaGate: hostedQaGate(),
    dimensionEvidence: {
      dimensions: [
        { id: "d1", valueIn: 150, confidence: "high", kind: "length" }
      ]
    },
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: {},
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    hasSavedResult: true,
    hasUnsavedEdits: false,
    reviewStatus: "needs_review",
    jobStatus: "completed"
  });

  assert.equal(gate.blocking.length, 0, `hosted blocking must be 0, got: ${JSON.stringify(gate.blocking)}`);
  assert.ok(gate.advisory.length > 0, "hosted advisory may be > 0");
  assert.equal(gate.canApproveWithAdvisory, true);
  assert.equal(gate.canApprove, true);

  // Advisory may include legacy messages; hard blockers must not.
  for (const b of gate.blocking) {
    assert.ok(!/validation error/i.test(b.message));
    assert.ok(!/do not use this takeoff/i.test(b.message));
    assert.ok(!/structure has issues/i.test(b.message));
  }

  // Confirm legacy gate WOULD have blocked (proves demotion is the fix).
  const legacy = evaluateTakeoffApprovalGate({
    takeoffResult: result,
    computed,
    validation: forcedValidation,
    qaGate: hostedQaGate(),
    dimensionEvidence: {
      dimensions: [{ id: "d1", valueIn: 150, confidence: "high", kind: "length" }]
    },
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { r1: true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    hasSavedResult: true,
    hasUnsavedEdits: false,
    reviewStatus: "needs_review"
  });
  assert.ok(legacy.blockers.length >= 2, "legacy gate still emits multiple blockers");
  assert.ok(
    legacy.blockers.some((b) => b.code === "VALIDATION_ERRORS" || /validation error/i.test(b.message)),
    "legacy still has VALIDATION_ERRORS"
  );
  assert.ok(
    legacy.blockers.some((b) => b.code === "QA_GATE_BLOCKED" || /do not use/i.test(b.message)),
    "legacy still has QA do-not-use"
  );

  assert.ok(
    computed.countertopExactSf > 72 && computed.countertopExactSf < 73,
    `expected ~72.33 SF, got ${computed.countertopExactSf}`
  );
  console.log(
    `  ✓ T9 hosted regression: blocking=0 advisory=${gate.advisory.length} CT=${computed.countertopExactSf}`
  );
}

// 10. No room assignment blocks with row-specific message
{
  const result = hostedShapeResult();
  result.rooms[0].name = "Unknown";
  result.rooms[0].roomType = "unknown";
  const gate = evaluate(result);
  assert.equal(gate.canApprove, false);
  assert.ok(gate.blocking.some((b) => b.code === "NO_ROOM_ASSIGNMENT"));
  assert.ok(gate.blocking.some((b) => /has no room/i.test(b.message)));
  console.log("  ✓ T10 no room assignment blocks");
}

// 11. True material double-count blocks (same label + same L×D)
{
  const result = {
    schemaVersion: "1",
    status: "reviewed",
    rooms: [
      makeRoom("r1", "Kitchen", [
        makeTakeoffRun({ id: "a", label: "Island", lengthIn: 86, depthIn: 36, pieceType: "counter" }),
        makeTakeoffRun({ id: "b", label: "Island", lengthIn: 86, depthIn: 36, pieceType: "counter" })
      ])
    ]
  };
  const gate = evaluate(result);
  assert.equal(gate.canApprove, false);
  const dup = gate.blocking.find((b) => b.code === "DUPLICATE_PIECE_DOUBLE_COUNT");
  assert.ok(dup);
  assert.match(dup.message, /86 × 36/);
  console.log("  ✓ T11 true duplicate material double-count blocks");
}

// 12. Inferred-duplicate note alone does not block (advisory via legacy gate)
{
  const result = baseResult();
  result.rooms[0].areas[0].runs[0].assemblyNotes = "Assumed duplicate stove piece based on '2 STOVE' text.";
  result.projectAssumptions = ["Assumed duplicate stove piece"];
  const gate = evaluate(result, {}, {
    qaGate: {
      status: "needs_review",
      topIssues: [
        {
          code: "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED",
          severity: "warning",
          message: "Possible duplicate piece"
        }
      ]
    }
  });
  assert.equal(gate.blocking.length, 0, "inferred duplicate is advisory only");
  assert.equal(gate.canApprove, true);
  console.log("  ✓ T12 inferred-duplicate note is advisory, not blocking");
}

// 13. collectConsolidatedHardBlockers: zero pieces
{
  const blockers = collectConsolidatedHardBlockers(
    { schemaVersion: "1", rooms: [] },
    { excludedRunIds: [], excludedRoomIds: [] }
  );
  assert.ok(blockers.some((b) => b.code === "NO_INCLUDED_PIECES"));
  console.log("  ✓ T13 zero pieces hard-blocks");
}

// 14. Legacy non-consolidated gate unchanged for VALIDATION_ERRORS
{
  const result = baseResult();
  const computed = computeTakeoffMeasurements(result);
  const legacy = evaluateTakeoffApprovalGate({
    takeoffResult: result,
    computed,
    validation: { hasErrors: true, errorCount: 1, diagnostics: [] },
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { r1: true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    hasSavedResult: true,
    hasUnsavedEdits: false,
    reviewStatus: "needs_review"
  });
  assert.equal(legacy.canApprove, false);
  assert.ok(legacy.blockers.some((b) => b.code === "VALIDATION_ERRORS"));
  console.log("  ✓ T14 legacy gate still blocks on VALIDATION_ERRORS");
}

console.log("\ntakeoffConsolidatedApproval — all passed\n");
