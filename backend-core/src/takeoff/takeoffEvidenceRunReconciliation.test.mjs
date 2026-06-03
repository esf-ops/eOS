/**
 * takeoffEvidenceRunReconciliation.test.mjs — unit tests for v6.0 evidence traceability.
 *
 * Test fixture: Spec 73-like scenario.
 *   Evidence: 109.5" stove wall, 34.5" floor-plan stove segment, 25.5" elevation segment,
 *             54" possible stove-side segment, 100" sink wall, 40" fridge wall,
 *             23" unusual perimeter depth (depth only, not countertop_run category),
 *             90"×41" island.
 *
 * Final runs in various test scenarios explore:
 *   - Exact match → supported
 *   - Changed dimension → EVIDENCE_DIMENSION_CHANGED_IN_RUN
 *   - Unsupported dimension → RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE
 *   - Conflicting evidence → CONFLICTING_DIMENSIONS_USED_SILENTLY
 *   - Unsupported corner deduction → UNSUPPORTED_CORNER_DEDUCTION
 *   - AI-flagged review → DRAFT_ASSEMBLY_REVIEW_REQUIRED
 *   - Standard depth assumption exemption
 */

import assert from "node:assert/strict";
import { reconcileRunsWithEvidence } from "./takeoffEvidenceRunReconciliation.mjs";

// ── Fixtures ───────────────────────────────────────────────────────────────────

/**
 * Spec 73-like DimensionEvidence fixture.
 * Category "depth" dims are intentionally excluded from countertop matching.
 */
const SPEC73_EVIDENCE = {
  schemaVersion: "1.0",
  evidencePromptVersion: "v2",
  dimensions: [
    { id: "d1", label: "Stove wall",            lengthIn: 109.5, depthIn: null, category: "countertop_run", confidence: "high",   pageNumber: 1 },
    { id: "d2", label: "Floor-plan stove seg",   lengthIn: 34.5,  depthIn: null, category: "countertop_run", confidence: "high",   pageNumber: 1 },
    { id: "d3", label: "Elevation-derived seg",  lengthIn: 25.5,  depthIn: null, category: "countertop_run", confidence: "high",   pageNumber: 2 },
    { id: "d4", label: "Possible stove-side",    lengthIn: 54,    depthIn: null, category: "countertop_run", confidence: "high",   pageNumber: 1 },
    { id: "d5", label: "Sink wall",              lengthIn: 100,   depthIn: null, category: "countertop_run", confidence: "high",   pageNumber: 1 },
    { id: "d6", label: "Fridge wall",            lengthIn: 40,    depthIn: null, category: "countertop_run", confidence: "high",   pageNumber: 1 },
    { id: "d7", label: "Unusual perimeter depth",lengthIn: 23,    depthIn: null, category: "depth",          confidence: "medium", pageNumber: 1 },
    { id: "d8", label: "Island",                 lengthIn: 90,    depthIn: 41,   category: "island",         confidence: "high",   pageNumber: 1 },
  ],
  notes: [], cutouts: [], referenceTotals: [], uncertainItems: [], reviewRequired: false,
};

/** Build a minimal TakeoffResult with one room, one area, and the given runs. */
function makeTakeoffResult(runs, { overlapMode = "none", cornerDeductions = [] } = {}) {
  return {
    schemaVersion: "1.0",
    id: "test",
    status: "draft",
    rooms: [{
      id: "room1",
      name: "Kitchen",
      areas: [{
        id: "area1",
        label: "Perimeter counters",
        areaType: "countertop",
        overlapMode,
        cornerDeductions,
        runs,
      }],
    }],
  };
}

function makeRun(overrides) {
  return {
    id: overrides.id ?? `run-${Math.random().toString(36).slice(2, 8)}`,
    label: overrides.label ?? "Run",
    lengthIn: overrides.lengthIn ?? 0,
    depthIn: overrides.depthIn ?? 25.5,
    shape: overrides.shape ?? "rect",
    pieceType: overrides.pieceType ?? "counter",
    sourcePages: overrides.sourcePages ?? [1],
    ...(overrides.requiresEstimatorReview != null && { requiresEstimatorReview: overrides.requiresEstimatorReview }),
    ...(overrides.assemblyNotes != null && { assemblyNotes: overrides.assemblyNotes }),
  };
}

function hasDiagCode(diagnostics, code) {
  return diagnostics.some((d) => d.code === code);
}

function diagsWithCode(diagnostics, code) {
  return diagnostics.filter((d) => d.code === code);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok  — ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL — ${name}`);
    console.error("     ", err.message);
    failed++;
  }
}

// ── T1: Clean match — runs exactly matching evidence → supported, no diagnostics ──

test("T1: runs exactly matching evidence are supported", () => {
  const runs = [
    makeRun({ label: "Sink wall",    lengthIn: 100,  depthIn: 25.5 }),
    makeRun({ label: "Fridge wall",  lengthIn: 40,   depthIn: 25.5 }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  assert.ok(result.checksRan, "T1: checksRan should be true");
  assert.equal(result.unsupportedRuns.length, 0, "T1: no unsupported runs");
  assert.equal(result.changedRuns.length, 0,     "T1: no changed runs");
  assert.ok(!hasDiagCode(result.diagnostics, "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE"), "T1: no unsupported code");
  assert.ok(!hasDiagCode(result.diagnostics, "EVIDENCE_DIMENSION_CHANGED_IN_RUN"),   "T1: no changed code");

  const sinkLink = result.runLinks.find((r) => r.runLabel === "Sink wall");
  assert.equal(sinkLink?.verdict, "supported", "T1: sink wall verdict = supported");
});

// ── T2: Run using 24" where evidence says 25.5" → EVIDENCE_DIMENSION_CHANGED_IN_RUN ──

test("T2: run with 24\" where evidence has 25.5\" triggers EVIDENCE_DIMENSION_CHANGED_IN_RUN", () => {
  const runs = [
    makeRun({ label: "Left of stove",  lengthIn: 25.5, depthIn: 25.5 }),
    makeRun({ label: "Right of stove", lengthIn: 24,   depthIn: 25.5 }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  const changedDiags = diagsWithCode(result.diagnostics, "EVIDENCE_DIMENSION_CHANGED_IN_RUN");
  assert.ok(changedDiags.length > 0, "T2: EVIDENCE_DIMENSION_CHANGED_IN_RUN should fire");

  const rightOfStoveLink = result.runLinks.find((r) => r.runLabel === "Right of stove");
  assert.equal(rightOfStoveLink?.verdict, "changed", "T2: right of stove verdict = changed");
  assert.ok(
    changedDiags.some((d) => d.message.includes("Right of stove")),
    "T2: diagnostic references the flagged run"
  );
});

// ── T3: Run using 24" when only 34.5" and 54" evidence exists → RUN_LENGTH_NOT_SUPPORTED ──

test("T3: run with 24\" when only 34.5\" and 54\" evidence exist → RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE", () => {
  // Subset evidence without the 25.5" dim — now 24" has no match within 10".
  const evidenceNoElevation = {
    ...SPEC73_EVIDENCE,
    dimensions: SPEC73_EVIDENCE.dimensions.filter((d) => d.id !== "d3"), // remove 25.5" dim
  };

  const runs = [
    makeRun({ label: "Right of stove", lengthIn: 24, depthIn: 25.5 }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: evidenceNoElevation,
  });

  assert.ok(
    hasDiagCode(result.diagnostics, "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE"),
    "T3: RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE should fire"
  );
  const link = result.runLinks.find((r) => r.runLabel === "Right of stove");
  assert.equal(link?.verdict, "unsupported", "T3: verdict = unsupported");
});

// ── T4: Multiple conflicting evidence dimensions near one run → CONFLICTING_DIMENSIONS_USED_SILENTLY ──

test("T4: run with 25.5\" where 25.5\" and 34.5\" both exist → CONFLICTING_DIMENSIONS_USED_SILENTLY", () => {
  // 25.5" is within 1" of d3 (exact match).
  // 34.5" is 9" away from 25.5" — within SUPPORT_RANGE_IN=10".
  // So two evidence dims are nearby → conflict.
  const runs = [
    makeRun({ label: "Left of stove", lengthIn: 25.5, depthIn: 25.5 }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  assert.ok(
    hasDiagCode(result.diagnostics, "CONFLICTING_DIMENSIONS_USED_SILENTLY"),
    "T4: CONFLICTING_DIMENSIONS_USED_SILENTLY should fire (25.5 and 34.5 both within range)"
  );
  const link = result.runLinks.find((r) => r.runLabel === "Left of stove");
  assert.ok(link?.conflicting, "T4: runLink.conflicting = true");
});

// ── T5: Island 90"×41" matches evidence → supported (length check passes) ──

test("T5: island 90×41 with matching evidence passes length support", () => {
  const islandRun = makeRun({ label: "Island top", lengthIn: 90, depthIn: 41 });
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult([islandRun]),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  const islandLink = result.runLinks.find((r) => r.runLabel === "Island top");
  assert.equal(islandLink?.verdict, "supported", "T5: island 90\" verdict = supported");
  assert.ok(!hasDiagCode(result.diagnostics, "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE"), "T5: no unsupported code");
});

// ── T6: Standard 25.5" wall counter depth is exempt from depth check ──

test("T6: run with standard 25.5\" depth — no depth evidence required", () => {
  const runs = [makeRun({ label: "Sink wall", lengthIn: 100, depthIn: 25.5 })];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  const link = result.runLinks.find((r) => r.runLabel === "Sink wall");
  assert.ok(link?.depthStandard, "T6: depthStandard = true for 25.5\"");
  assert.ok(!hasDiagCode(result.diagnostics, "RUN_DEPTH_NOT_SUPPORTED_BY_EVIDENCE"), "T6: no depth code");
});

// ── T7: Standard 21.5" vanity depth is also exempt ──

test("T7: run with standard 21.5\" vanity depth — no depth evidence required", () => {
  const runs = [makeRun({ label: "Vanity top", lengthIn: 60, depthIn: 21.5 })];
  // Evidence with 60" countertop_run so length passes.
  const vanityEvidence = {
    ...SPEC73_EVIDENCE,
    dimensions: [
      { id: "v1", label: "Vanity top", lengthIn: 60, depthIn: null, category: "countertop_run", confidence: "high", pageNumber: 1 },
    ],
  };
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: vanityEvidence,
  });

  const link = result.runLinks.find((r) => r.runLabel === "Vanity top");
  assert.ok(link?.depthStandard, "T7: depthStandard = true for 21.5\"");
});

// ── T8: L-shape corner deduction without explicit overlapMode → UNSUPPORTED_CORNER_DEDUCTION ──

test("T8: cornerDeductions without L-Shape overlapMode → UNSUPPORTED_CORNER_DEDUCTION", () => {
  const runs = [
    makeRun({ label: "Sink wall",   lengthIn: 100 }),
    makeRun({ label: "Fridge wall", lengthIn: 40 }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs, {
      overlapMode: "none",
      cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }],
    }),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  assert.ok(
    hasDiagCode(result.diagnostics, "UNSUPPORTED_CORNER_DEDUCTION"),
    "T8: UNSUPPORTED_CORNER_DEDUCTION should fire"
  );
});

// ── T9: L-shape corner deduction WITH explicit overlapMode → no warning ──

test("T9: cornerDeductions WITH L-Shape overlapMode → no UNSUPPORTED_CORNER_DEDUCTION", () => {
  const runs = [
    makeRun({ label: "Sink wall",   lengthIn: 100 }),
    makeRun({ label: "Fridge wall", lengthIn: 40 }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs, {
      overlapMode: "L-Shape",
      cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }],
    }),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  assert.ok(
    !hasDiagCode(result.diagnostics, "UNSUPPORTED_CORNER_DEDUCTION"),
    "T9: no UNSUPPORTED_CORNER_DEDUCTION for proper L-Shape"
  );
});

// ── T10: requiresEstimatorReview=true on run → DRAFT_ASSEMBLY_REVIEW_REQUIRED ──

test("T10: run with requiresEstimatorReview=true → DRAFT_ASSEMBLY_REVIEW_REQUIRED", () => {
  const runs = [
    makeRun({
      label: "Stove wall (conflict)",
      lengthIn: 34.5,
      requiresEstimatorReview: true,
      assemblyNotes: "Floor plan says 34.5\" but elevation says 25.5\" — conflict unresolved.",
    }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  assert.ok(
    hasDiagCode(result.diagnostics, "DRAFT_ASSEMBLY_REVIEW_REQUIRED"),
    "T10: DRAFT_ASSEMBLY_REVIEW_REQUIRED should fire"
  );
  assert.equal(result.assemblyReviewRuns.length, 1, "T10: one assembly review run");
  assert.ok(
    result.diagnostics.find((d) => d.code === "DRAFT_ASSEMBLY_REVIEW_REQUIRED")
      ?.message.includes("Floor plan says"),
    "T10: diagnostic includes assemblyNotes"
  );
});

// ── T11: No evidence available → checksRan=false, corner deductions still checked ──

test("T11: no evidence available → checksRan=false, corner deductions still fire", () => {
  const runs = [makeRun({ label: "Sink wall", lengthIn: 100 })];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs, {
      overlapMode: "none",
      cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }],
    }),
    dimensionEvidence: null,
  });

  assert.ok(!result.checksRan, "T11: checksRan=false when no evidence");
  assert.ok(
    hasDiagCode(result.diagnostics, "UNSUPPORTED_CORNER_DEDUCTION"),
    "T11: UNSUPPORTED_CORNER_DEDUCTION still fires without evidence"
  );
  assert.ok(
    !hasDiagCode(result.diagnostics, "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE"),
    "T11: no length codes without evidence"
  );
});

// ── T12: High-confidence unused countertop evidence reported in unusedHighConfidenceDimensions ──

test("T12: high-confidence evidence not matched by any run → reported as unused", () => {
  // Only 100" and 40" runs — 109.5, 34.5, 25.5, 54, 90" not represented.
  const runs = [
    makeRun({ label: "Sink wall",   lengthIn: 100 }),
    makeRun({ label: "Fridge wall", lengthIn: 40 }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  // At least 109.5, 34.5, 54, 90 should be unused
  // (25.5 is also unused but may fall in near-match via 100/40 range — check explicitly)
  assert.ok(result.unusedHighConfidenceDimensions.length >= 3, "T12: multiple unused dims reported");
  const unusedLabels = result.unusedHighConfidenceDimensions.map((d) => d.label);
  assert.ok(unusedLabels.some((l) => l.includes("Stove")), "T12: stove wall dim is unused");
});

// ── T13: Spec73 all-matching runs → no evidence diagnostics ──

test("T13: runs exactly matching Spec73 evidence → no evidence diagnostics", () => {
  const runs = [
    makeRun({ label: "Sink wall",   lengthIn: 100 }),
    makeRun({ label: "Fridge wall", lengthIn: 40 }),
    makeRun({ label: "Left of stove", lengthIn: 25.5 }),
    makeRun({ label: "Island",        lengthIn: 90, depthIn: 41 }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  const unsupportedCount = diagsWithCode(result.diagnostics, "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE").length;
  assert.equal(unsupportedCount, 0, "T13: no unsupported runs");
  assert.ok(result.unsupportedRuns.length === 0, "T13: unsupportedRuns array empty");
});

// ── T14: splash / fhb pieceType runs are exempt from length checks ──

test("T14: splash and fhb runs are exempt from length checks", () => {
  const runs = [
    makeRun({ label: "BS run",  lengthIn: 999, pieceType: "splash" }),
    makeRun({ label: "FHB run", lengthIn: 888, pieceType: "fhb" }),
  ];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  assert.equal(result.unsupportedRuns.length, 0, "T14: splash/fhb not flagged as unsupported");
  const links = result.runLinks;
  for (const l of links) assert.equal(l.verdict, "exempt", "T14: all verdicts = exempt");
});

// ── T15: empty evidence dimensions array → checksRan=false ──

test("T15: empty evidence dimensions array → checksRan=false", () => {
  const emptyEvidence = { ...SPEC73_EVIDENCE, dimensions: [] };
  const runs = [makeRun({ label: "Sink wall", lengthIn: 100 })];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: emptyEvidence,
  });

  assert.ok(!result.checksRan, "T15: checksRan=false when dimensions array empty");
});

// ── T16: medium-confidence dimensions are not checked (only high) ──

test("T16: medium-confidence evidence dimensions are not eligible for matching", () => {
  const medEvidence = {
    ...SPEC73_EVIDENCE,
    dimensions: [
      { id: "m1", label: "Medium dim", lengthIn: 100, depthIn: null, category: "countertop_run", confidence: "medium", pageNumber: 1 },
    ],
  };
  const runs = [makeRun({ label: "Sink wall", lengthIn: 100 })];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: medEvidence,
  });

  // Medium-confidence dims are ineligible → checksRan=false
  assert.ok(!result.checksRan, "T16: medium-only evidence → checksRan=false");
});

// ── T17: QA gate escalates evidence reconciliation warnings to needs_review ──

test("T17: QA gate escalates EVIDENCE_DIMENSION_CHANGED_IN_RUN to needs_review", async () => {
  // Dynamic import to avoid circular deps in test file.
  const { evaluateTakeoffQaGate } = await import("./takeoffQaGate.mjs");
  const { computeTakeoffMeasurements } = await import("./takeoffMeasurementCalc.mjs");
  const { validateTakeoffResult } = await import("./takeoffValidator.mjs");

  // A run that changes a dimension: 24" vs evidence 25.5"
  const runs = [
    makeRun({ label: "Right of stove", lengthIn: 24, depthIn: 25.5 }),
    makeRun({ label: "Sink wall",      lengthIn: 100, depthIn: 25.5 }),
    makeRun({ label: "Fridge wall",    lengthIn: 40, depthIn: 25.5 }),
  ];
  const takeoffResult = {
    schemaVersion: "1.0",
    id: "qa-test",
    status: "draft",
    rooms: [{ id: "r1", name: "Kitchen", areas: [{ id: "a1", label: "Perimeter", areaType: "countertop", overlapMode: "none", cornerDeductions: [], runs }] }],
  };
  const computed   = computeTakeoffMeasurements(takeoffResult);
  const validation = validateTakeoffResult(takeoffResult, computed, SPEC73_EVIDENCE);
  const qaGate     = evaluateTakeoffQaGate({
    takeoffResult, computedMeasurements: computed, validationDiagnostics: validation,
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  assert.ok(
    qaGate.status === "needs_review" || qaGate.status === "do_not_import",
    `T17: QA gate should not be ready_for_review when changed dims exist (got: ${qaGate.status})`
  );
});

// ── T18: No quote mutation / no pricing — reconciliation function returns pure data ──

test("T18: reconciliation returns only pure data (no quote/pricing fields)", () => {
  const runs = [makeRun({ label: "Sink wall", lengthIn: 100 })];
  const result = reconcileRunsWithEvidence({
    takeoffResult: makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  const resultStr = JSON.stringify(result);
  assert.ok(!resultStr.includes("price"),   "T18: no price in output");
  assert.ok(!resultStr.includes("markup"),  "T18: no markup in output");
  assert.ok(!resultStr.includes("quote_id"),"T18: no quote_id in output");
  assert.ok(!resultStr.includes("import"),  "T18: no import in output");
});

// ── T19–T24: Review workbench behavior — pure helper checks ───────────────────
//
// These tests verify the measurement math that underpins the workbench:
//   T19: editing a run's length changes the computed total
//   T20: excluding a run (filtering it out) removes it from the computed total
//   T21: adding unused evidence as a run updates the computed total
//   T22: marking evidence reviewed softens unresolved issue count
//   T23: save path uses effectiveDraft (excluded runs absent) — verified structurally
//   T24: no quote / pricing mutation in workbench helpers

// Dynamic import of calc helpers (same ESM pattern as T17).
const { computeTakeoffMeasurements } = await import("./takeoffMeasurementCalc.mjs");

function makeWorkbenchResult(runs, overrides = {}) {
  return makeTakeoffResult(runs, overrides);
}

/**
 * Filter excluded run IDs from a TakeoffResult (mirrors effectiveDraft logic in TakeoffLabApp).
 */
function filterExcludedRuns(takeoffResult, excludedRunIds) {
  return {
    ...takeoffResult,
    rooms: takeoffResult.rooms.map((room) => ({
      ...room,
      areas: room.areas.map((area) => ({
        ...area,
        runs: area.runs.filter((run) => !excludedRunIds.has(run.id)),
      })),
    })),
  };
}

/**
 * Count unresolved issues (mirrors countUnresolvedWorkbenchIssues in TakeoffReviewWorkbench.tsx).
 */
function countUnresolvedIssues(reconciliation, { excludedRunIds, reviewNotes, evidenceReviewState }) {
  if (!reconciliation?.checksRan) return 0;
  let count = 0;
  for (const l of reconciliation.unsupportedRuns) {
    if (!excludedRunIds.has(l.runId) && !reviewNotes[l.runId]) count++;
  }
  for (const l of reconciliation.changedRuns) {
    if (!excludedRunIds.has(l.runId) && !reviewNotes[l.runId]) count++;
  }
  for (const l of reconciliation.conflictingRuns) {
    if (!excludedRunIds.has(l.runId) && !reviewNotes[l.runId]) count++;
  }
  for (const d of reconciliation.unusedHighConfidenceDimensions) {
    const dimId = d.id ?? d.label;
    if (!evidenceReviewState[dimId]) count++;
  }
  return count;
}

// ── T19: editing a run's length changes computed total ──

test("T19: editing a run length changes computed countertop total", () => {
  const runId = "run-edit-test";
  const original = makeWorkbenchResult([
    { id: runId, label: "Sink wall", lengthIn: 100, depthIn: 25.5, shape: "rect", pieceType: "counter", sourcePages: [1] },
  ]);

  const edited = makeWorkbenchResult([
    { id: runId, label: "Sink wall", lengthIn: 80, depthIn: 25.5, shape: "rect", pieceType: "counter", sourcePages: [1] },
  ]);

  const originalMeas = computeTakeoffMeasurements(original);
  const editedMeas   = computeTakeoffMeasurements(edited);

  // 100 × 25.5 / 144 ≈ 17.71 sf; 80 × 25.5 / 144 ≈ 14.17 sf
  assert.ok(originalMeas.countertopExactSf > editedMeas.countertopExactSf,
    "T19: editing 100\" → 80\" reduces countertop sf");
  assert.ok(
    Math.abs(originalMeas.countertopExactSf - 17.71) < 0.05,
    `T19: original sf ≈ 17.71 (got ${originalMeas.countertopExactSf})`
  );
  assert.ok(
    Math.abs(editedMeas.countertopExactSf - 14.17) < 0.05,
    `T19: edited sf ≈ 14.17 (got ${editedMeas.countertopExactSf})`
  );
});

// ── T20: excluding a run removes it from computed total ──

test("T20: excluding a run removes it from the computed total", () => {
  const excludeId = "run-to-exclude";
  const result = makeWorkbenchResult([
    { id: "run-keep",    label: "Sink wall",  lengthIn: 100, depthIn: 25.5, shape: "rect", pieceType: "counter", sourcePages: [1] },
    { id: excludeId,     label: "Extra run",  lengthIn: 60,  depthIn: 25.5, shape: "rect", pieceType: "counter", sourcePages: [1] },
  ]);

  const excludedRunIds = new Set([excludeId]);
  const effectiveDraft = filterExcludedRuns(result, excludedRunIds);

  const fullMeas      = computeTakeoffMeasurements(result);
  const effectiveMeas = computeTakeoffMeasurements(effectiveDraft);

  assert.ok(fullMeas.countertopExactSf > effectiveMeas.countertopExactSf,
    "T20: excluding a run reduces total sf");

  // Full: (100 + 60) × 25.5 / 144 = 28.33 sf; effective: 100 × 25.5 / 144 = 17.71 sf
  assert.ok(
    Math.abs(effectiveMeas.countertopExactSf - 17.71) < 0.05,
    `T20: effective sf ≈ 17.71 (got ${effectiveMeas.countertopExactSf})`
  );

  // Excluded run should not appear in effectiveDraft
  const effectiveRuns = effectiveDraft.rooms.flatMap((r) => r.areas.flatMap((a) => a.runs));
  assert.ok(!effectiveRuns.some((r) => r.id === excludeId),
    "T20: excluded run not present in effectiveDraft");
});

// ── T21: adding unused evidence as a run updates computed total ──

test("T21: adding an unused evidence dim as a run updates computed total", () => {
  const original = makeWorkbenchResult([
    { id: "run-keep", label: "Sink wall", lengthIn: 100, depthIn: 25.5, shape: "rect", pieceType: "counter", sourcePages: [1] },
  ]);

  // Simulate "Add as run" for the 90"×41" island dim (d8 in SPEC73_EVIDENCE).
  const newRun = {
    id:         "evidence-run-d8",
    label:      "Island",
    lengthIn:   90,
    depthIn:    41,
    shape:      "rect",
    pieceType:  "counter",
    sourcePages: [1],
  };

  const withAdded = {
    ...original,
    rooms: original.rooms.map((room, ri) =>
      ri !== 0 ? room : {
        ...room,
        areas: room.areas.map((area, ai) =>
          ai !== 0 ? area : { ...area, runs: [...area.runs, newRun] }
        ),
      }
    ),
  };

  const origMeas  = computeTakeoffMeasurements(original);
  const addedMeas = computeTakeoffMeasurements(withAdded);

  // Island adds 90 × 41 / 144 = 25.63 sf
  const islandSf = (90 * 41) / 144;
  const expectedTotal = origMeas.countertopExactSf + islandSf;
  assert.ok(
    Math.abs(addedMeas.countertopExactSf - expectedTotal) < 0.1,
    `T21: total after adding island ≈ ${expectedTotal.toFixed(2)} sf (got ${addedMeas.countertopExactSf})`
  );
});

// ── T22: marking evidence reviewed reduces unresolved issue count ──

test("T22: marking evidence reviewed reduces unresolved issue count to zero", () => {
  // One changed run + one unused dim → 2 unresolved issues.
  const runs = [
    makeRun({ label: "Right of stove", lengthIn: 24, depthIn: 25.5 }),  // changed (nearest: 25.5")
    makeRun({ label: "Sink wall",      lengthIn: 100, depthIn: 25.5 }), // supported
  ];
  const reconciliation = reconcileRunsWithEvidence({
    takeoffResult:     makeTakeoffResult(runs),
    dimensionEvidence: SPEC73_EVIDENCE,
  });

  assert.ok(reconciliation.checksRan, "T22: checks ran");

  const changedRun = reconciliation.changedRuns[0];
  assert.ok(changedRun, "T22: at least one changed run exists");

  // Initially: changed run unresolved + multiple unused dims unresolved.
  const initialCount = countUnresolvedIssues(reconciliation, {
    excludedRunIds:     new Set(),
    reviewNotes:        {},
    evidenceReviewState: {},
  });
  assert.ok(initialCount > 0, `T22: initial unresolved count > 0 (got ${initialCount})`);

  // Mark the changed run as reviewed via a note.
  const reviewNotes = {};
  reviewNotes[changedRun.runId] = "Verified against plan — right side is 24\"";

  // Also mark any conflicting runs as reviewed (sink wall at 100" has 109.5" nearby → conflict).
  for (const l of reconciliation.conflictingRuns) {
    reviewNotes[l.runId] = "Conflict reviewed — correct dimension confirmed";
  }

  // Mark all unused dims as reviewed.
  const evidenceReviewState = {};
  for (const d of reconciliation.unusedHighConfidenceDimensions) {
    evidenceReviewState[d.id ?? d.label] = "reviewed";
  }

  const afterCount = countUnresolvedIssues(reconciliation, {
    excludedRunIds: new Set(),
    reviewNotes,
    evidenceReviewState,
  });

  assert.equal(afterCount, 0, `T22: all issues resolved after marking reviewed (got ${afterCount})`);
});

// ── T23: save path uses effectiveDraft (excluded runs absent) ──

test("T23: effectiveDraft excludes specified run IDs, used for save", () => {
  const excludeId = "run-bad";
  const result = makeWorkbenchResult([
    { id: "run-good", label: "Good run",   lengthIn: 100, depthIn: 25.5, shape: "rect", pieceType: "counter", sourcePages: [1] },
    { id: excludeId,  label: "Bad run",    lengthIn: 50,  depthIn: 25.5, shape: "rect", pieceType: "counter", sourcePages: [1] },
  ]);

  const effectiveDraft = filterExcludedRuns(result, new Set([excludeId]));
  const allRunIds = effectiveDraft.rooms.flatMap((r) => r.areas.flatMap((a) => a.runs.map((run) => run.id)));

  assert.ok(!allRunIds.includes(excludeId),  "T23: excluded run absent from effectiveDraft");
  assert.ok(allRunIds.includes("run-good"), "T23: included run present in effectiveDraft");

  // Measurement only counts the included run.
  const meas = computeTakeoffMeasurements(effectiveDraft);
  assert.ok(
    Math.abs(meas.countertopExactSf - (100 * 25.5 / 144)) < 0.05,
    "T23: measurement reflects only included runs"
  );
});

// ── T24: no quote / pricing mutation in workbench helpers ──

test("T24: workbench helpers produce no quote/pricing fields", () => {
  const runs = [makeRun({ label: "Sink wall", lengthIn: 100 })];
  const result = makeTakeoffResult(runs);
  const excluded = filterExcludedRuns(result, new Set());
  const recon    = reconcileRunsWithEvidence({ takeoffResult: result, dimensionEvidence: SPEC73_EVIDENCE });
  const meas     = computeTakeoffMeasurements(excluded);

  const allJson = JSON.stringify({ excluded, recon, meas });
  assert.ok(!allJson.includes("price"),   "T24: no price field in output");
  assert.ok(!allJson.includes("markup"),  "T24: no markup field in output");
  assert.ok(!allJson.includes("quote_id"),"T24: no quote_id in output");
  assert.ok(!allJson.includes("\"import\""), "T24: no import field in output");
});

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
