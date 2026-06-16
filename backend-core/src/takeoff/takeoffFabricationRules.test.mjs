/**
 * takeoffFabricationRules.test.mjs — tests for the deterministic fabrication rules engine (v6.2).
 *
 * Tests cover all 7 business rules (A–G) plus Kelley fixture proof case.
 *
 * Run:
 *   npm run eos:test:takeoff-fabrication-rules
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateTakeoffFabricationRules,
  classifyDepthEvidence,
  shouldApplyCornerDeduction,
  classifyReferenceTotalUsage,
  classifyBacksplashRule,
  classifyCutoutRule,
  classifyInferredPieceRule,
  classifyCornerDeductionRule,
  classifyNonstandardDepth,
  noteDeclaresGlobalNoBacksplash,
  FABRICATION_RULE_CODE,
  FABRICATION_RULE_LEVEL,
} from "./takeoffFabricationRules.mjs";
import { buildSpec73Fixture } from "./fixtures/spec73.fixture.mjs";

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeRun(overrides = {}) {
  return {
    id: `run-${Math.random().toString(36).slice(2, 7)}`,
    label: overrides.label ?? "Run",
    lengthIn: overrides.lengthIn ?? 60,
    depthIn: overrides.depthIn ?? 25.5,
    pieceType: overrides.pieceType ?? "counter",
    shape: "rect",
    ...overrides,
  };
}

function makeArea(overrides = {}) {
  return {
    id: `area-${Math.random().toString(36).slice(2, 7)}`,
    label: overrides.label ?? "Kitchen",
    areaType: "countertop",
    runs: overrides.runs ?? [],
    ...overrides,
  };
}

function makeRoom(overrides = {}) {
  return {
    id: `room-${Math.random().toString(36).slice(2, 7)}`,
    name: overrides.name ?? "Kitchen",
    areas: overrides.areas ?? [],
    ...overrides,
  };
}

function makeTakeoffResult(overrides = {}) {
  return {
    schemaVersion: "1.0",
    id: "test-takeoff",
    status: "draft",
    rooms: overrides.rooms ?? [],
    projectAssumptions: overrides.projectAssumptions ?? [],
    ...overrides,
  };
}

function findCodes(findings, code) {
  return findings.filter((f) => f.code === code);
}

function hasCode(findings, code) {
  return findings.some((f) => f.code === code);
}

// ── Rule A: Reference total used as geometry target ────────────────────────────

describe("Rule A: Reference total as geometry target", () => {
  it("written reference total alone does NOT define expected geometry — no finding when no reconciliation language", () => {
    const run = makeRun({ label: "Kitchen counter", lengthIn: 80, depthIn: 25.5 });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({
      rooms: [room],
      projectAssumptions: ["Visible reference total: 50 sq' no b/s"],
    });
    const { findings } = evaluateTakeoffFabricationRules({ takeoffResult: result });
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET),
      false,
      "Should NOT fire when reference total is noted but geometry is not reconciled to it"
    );
  });

  it("assembly note 'to reconcile with reference total' emits REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET", () => {
    const run = makeRun({
      label: "Island",
      lengthIn: 64,
      depthIn: 36,
      assemblyNotes: "Length set to reconcile with reference total of 50 sq'.",
    });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyReferenceTotalUsage(result);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET),
      "Should fire when assembly note contains reconciliation language"
    );
  });

  it("'aligns with reference total' in projectAssumptions emits REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET", () => {
    const result = makeTakeoffResult({
      rooms: [],
      projectAssumptions: ["Adjusted island length to aligns with reference total of 50."],
    });
    const findings = classifyReferenceTotalUsage(result);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET)
    );
  });

  it("'to match 50' in assembly note emits REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET", () => {
    const run = makeRun({
      label: "Main counter",
      assemblyNotes: "Dimension chosen to match 50 sq ft reference.",
    });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyReferenceTotalUsage(result);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET)
    );
  });
});

// ── Rule B: No-backsplash rules ────────────────────────────────────────────────

describe("Rule B: No-backsplash rules", () => {
  it("noteDeclaresGlobalNoBacksplash distinguishes global vs partial-scope notes", () => {
    assert.equal(noteDeclaresGlobalNoBacksplash("no B/S"), true);
    assert.equal(noteDeclaresGlobalNoBacksplash("No backsplash per plan"), true);
    assert.equal(noteDeclaresGlobalNoBacksplash("open end — no backsplash on open side"), false);
    assert.equal(noteDeclaresGlobalNoBacksplash("Peninsula open end has no backsplash"), false);
    assert.equal(noteDeclaresGlobalNoBacksplash("No backsplash on open peninsula end"), false);
    assert.equal(noteDeclaresGlobalNoBacksplash("Stove opening excluded from backsplash"), false);
  });

  it("Spec 73 partial no-backsplash notes do not conflict with structured backsplash", () => {
    const result = buildSpec73Fixture();
    const findings = classifyBacksplashRule(result, null);
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.BACKSPLASH_SCOPE_CONFLICT),
      false,
      "Scoped open-end notes must not trigger whole-plan no-backsplash conflict"
    );
  });

  it("no-b/s note with computed backsplash 0 passes and emits NO_BACKSPLASH_CONFIRMED", () => {
    const run = makeRun({ label: "Kitchen counter", lengthIn: 80, depthIn: 25.5 });
    const area = makeArea({ runs: [run], backsplashLinearIn: 0 });
    const room = makeRoom({
      areas: [area],
      notes: ["No b/s per plan note"],
    });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyBacksplashRule(result, null);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.NO_BACKSPLASH_CONFIRMED),
      "Should emit NO_BACKSPLASH_CONFIRMED when plan says no b/s and backsplash = 0"
    );
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.BACKSPLASH_SCOPE_CONFLICT),
      false,
      "Should not emit BACKSPLASH_SCOPE_CONFLICT when compliant"
    );
  });

  it("no-b/s note with backsplashLinearIn > 0 emits BACKSPLASH_SCOPE_CONFLICT (error)", () => {
    const run = makeRun({ label: "Kitchen counter" });
    const area = makeArea({ runs: [run], backsplashLinearIn: 120, backsplashHeightIn: 4 });
    const room = makeRoom({
      areas: [area],
      notes: ["No backsplash per plan"],
    });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyBacksplashRule(result, null);
    const conflict = findings.filter((f) => f.code === FABRICATION_RULE_CODE.BACKSPLASH_SCOPE_CONFLICT);
    assert.ok(conflict.length > 0, "Should emit BACKSPLASH_SCOPE_CONFLICT");
    assert.equal(conflict[0].level, FABRICATION_RULE_LEVEL.ERROR);
  });

  it("no-b/s note with splash run emits BACKSPLASH_SCOPE_CONFLICT", () => {
    const counterRun = makeRun({ label: "Wall" });
    const splashRun = makeRun({ label: "Backsplash", pieceType: "splash", lengthIn: 100, depthIn: 4 });
    const area = makeArea({ runs: [counterRun, splashRun] });
    const room = makeRoom({
      areas: [area],
      notes: ["No b/s"],
    });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyBacksplashRule(result, null);
    assert.ok(hasCode(findings, FABRICATION_RULE_CODE.BACKSPLASH_SCOPE_CONFLICT));
  });

  it("no-b/s from referenceTotals.noBacksplash emits NO_BACKSPLASH_CONFIRMED when compliant", () => {
    const run = makeRun({ label: "Kitchen" });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const dimensionEvidence = {
      dimensions: [],
      referenceTotals: [
        { id: "ref-1", rawText: "50 sq' no b/s", countertopSf: 50, noBacksplash: true, confidence: "high" },
      ],
    };
    const findings = classifyBacksplashRule(result, dimensionEvidence);
    assert.ok(hasCode(findings, FABRICATION_RULE_CODE.NO_BACKSPLASH_CONFIRMED));
  });
});

// ── Rule C: Cutout rules ───────────────────────────────────────────────────────

describe("Rule C: Cutout rules", () => {
  it("sink cutout in exclusions emits CUTOUT_DEDUCTED_FROM_MATERIAL", () => {
    const run = makeRun({ label: "Kitchen counter" });
    const area = makeArea({
      runs: [run],
      exclusions: [{ label: "Sink cutout", lengthIn: 33, depthIn: 22 }],
    });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyCutoutRule(result);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.CUTOUT_DEDUCTED_FROM_MATERIAL),
      "Should emit CUTOUT_DEDUCTED_FROM_MATERIAL for sink exclusion"
    );
    const f = findings.find((x) => x.code === FABRICATION_RULE_CODE.CUTOUT_DEDUCTED_FROM_MATERIAL);
    assert.equal(f.level, FABRICATION_RULE_LEVEL.ERROR);
  });

  it("cooktop cutout in exclusions emits CUTOUT_DEDUCTED_FROM_MATERIAL", () => {
    const area = makeArea({
      runs: [makeRun()],
      exclusions: [{ label: "Cooktop opening", lengthIn: 30, depthIn: 20 }],
    });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyCutoutRule(result);
    assert.ok(hasCode(findings, FABRICATION_RULE_CODE.CUTOUT_DEDUCTED_FROM_MATERIAL));
  });

  it("non-cutout exclusion (window opening) does NOT emit CUTOUT_DEDUCTED_FROM_MATERIAL", () => {
    const area = makeArea({
      runs: [makeRun()],
      exclusions: [{ label: "Window opening", lengthIn: 36, depthIn: 25.5 }],
    });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyCutoutRule(result);
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.CUTOUT_DEDUCTED_FROM_MATERIAL),
      false
    );
  });

  it("QA gate should not be green when CUTOUT_DEDUCTED_FROM_MATERIAL fires", () => {
    const area = makeArea({
      runs: [makeRun()],
      exclusions: [{ label: "Faucet cutout" }],
    });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const { findings } = evaluateTakeoffFabricationRules({ takeoffResult: result });
    assert.ok(
      findings.some((f) => f.code === FABRICATION_RULE_CODE.CUTOUT_DEDUCTED_FROM_MATERIAL && f.level === "error"),
      "CUTOUT_DEDUCTED_FROM_MATERIAL must be at error level"
    );
  });
});

// ── Rule D: Inferred duplicate pieces ─────────────────────────────────────────

describe("Rule D: Inferred duplicate pieces", () => {
  it("'2 STOVE' assumed duplicate emits INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED", () => {
    const run = makeRun({
      label: "Stove wall",
      assemblyNotes: "Assumed two identical pieces from '2 STOVE' label — no explicit geometry for second.",
    });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyInferredPieceRule(result);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED)
    );
  });

  it("projectAssumption 'assumed duplicate' emits INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED", () => {
    const result = makeTakeoffResult({
      rooms: [],
      projectAssumptions: ["Assumed duplicate stove piece based on '2 STOVE' text."],
    });
    const findings = classifyInferredPieceRule(result);
    assert.ok(hasCode(findings, FABRICATION_RULE_CODE.INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED));
  });

  it("non-duplicate assembly note does NOT emit INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED", () => {
    const run = makeRun({
      label: "Island",
      assemblyNotes: "Length from dim-001 'Island 64\"'; depth 36\" from evidence.",
    });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyInferredPieceRule(result);
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED),
      false
    );
  });
});

// ── Rule E: Corner deductions with excluded/missing leg ───────────────────────

describe("Rule E: Corner deductions with excluded legs", () => {
  it("L-shape corner deduction with excluded run emits CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG", () => {
    const run1 = makeRun({ id: "run-a", label: "Left leg" });
    const run2 = makeRun({ id: "run-b", label: "Right leg" });
    const area = makeArea({
      runs: [run1, run2],
      overlapMode: "L-Shape",
      cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }],
    });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    // Exclude run-b (one leg excluded).
    const findings = classifyCornerDeductionRule(result, { excludedRunIds: new Set(["run-b"]) });
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG),
      "Should fire when a leg is excluded but corner deduction remains"
    );
  });

  it("L-shape corner deduction with both legs present does NOT emit CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG", () => {
    const run1 = makeRun({ id: "run-a", label: "Left leg" });
    const run2 = makeRun({ id: "run-b", label: "Right leg" });
    const area = makeArea({
      runs: [run1, run2],
      overlapMode: "L-Shape",
      cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }],
    });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    // Neither run excluded.
    const findings = classifyCornerDeductionRule(result, { excludedRunIds: new Set() });
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG),
      false
    );
  });

  it("corner deduction without L-Shape overlapMode emits CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG", () => {
    const run1 = makeRun({ id: "run-a", label: "Counter" });
    const area = makeArea({
      runs: [run1],
      overlapMode: "none",
      cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }],
    });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyCornerDeductionRule(result, null);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG)
    );
  });
});

// ── Rule F: Nonstandard depth evidence ────────────────────────────────────────

describe("Rule F: Nonstandard depth evidence", () => {
  it("nonstandard island depth 36 with matching evidence emits NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE, not unsupported", () => {
    const run = makeRun({
      label: "Island",
      lengthIn: 64,
      depthIn: 36,
      depthEvidenceId: "dim-island",
    });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const dimensionEvidence = {
      dimensions: [
        { id: "dim-island", label: "Island", lengthIn: 64, depthIn: 36, confidence: "high", category: "island" },
      ],
    };
    const findings = classifyNonstandardDepth(result, dimensionEvidence);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE),
      "Should emit VERIFIED when depth is cited in evidence"
    );
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.NONSTANDARD_DEPTH_UNSUPPORTED),
      false,
      "Should NOT emit UNSUPPORTED when evidence is present"
    );
    assert.equal(findings[0].level, FABRICATION_RULE_LEVEL.INFO, "Verified depth should be info, not warning");
  });

  it("nonstandard island depth 36 without evidence emits NONSTANDARD_DEPTH_UNSUPPORTED", () => {
    const run = makeRun({ label: "Island", lengthIn: 64, depthIn: 36 });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyNonstandardDepth(result, null);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.NONSTANDARD_DEPTH_UNSUPPORTED),
      "Should emit UNSUPPORTED when no evidence"
    );
    assert.equal(findings[0].level, FABRICATION_RULE_LEVEL.WARNING);
  });

  it("standard 25.5 depth does NOT emit any nonstandard finding", () => {
    const run = makeRun({ label: "Island", lengthIn: 60, depthIn: 25.5 });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyNonstandardDepth(result, null);
    assert.equal(findings.length, 0);
  });

  it("nonstandard desk depth matched by evidence depthIn also fires VERIFIED", () => {
    const run = makeRun({ label: "Desk", lengthIn: 72, depthIn: 30 });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const dimensionEvidence = {
      dimensions: [
        { id: "dim-d", label: "Desk", lengthIn: 72, depthIn: 30, confidence: "high" },
      ],
    };
    const findings = classifyNonstandardDepth(result, dimensionEvidence);
    assert.ok(hasCode(findings, FABRICATION_RULE_CODE.NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE));
  });
});

// ── Kelley fixture proof case ──────────────────────────────────────────────────

describe("Kelley proof case — reviewed 39.91 / 0 b/s, visible reference 50 is not authority", () => {
  function buildKelleyReviewedDraft() {
    // Reviewed estimator draft: ~39.91 sf from visible dimensions.
    // Island: 64" × 36" = 64*36/144 = 16 sf (depth evidence cited)
    // Left counter: 72" × 25.5" = 12.75 sf
    // Right counter: 64" × 25.5" = 11.33 sf (approx; let's use exact)
    // (These are representative — the exact geometry is from the private plan)
    const islandRun = makeRun({
      id: "kelley-island",
      label: "Island",
      lengthIn: 64,
      depthIn: 36,
      depthEvidenceId: "dim-island-depth",
      assemblyNotes: "Length from dim-001 'Island 64\"'; depth 36\" from visible dimension on plan (dim-island-depth).",
    });
    const leftCounterRun = makeRun({
      id: "kelley-left",
      label: "Left counter",
      lengthIn: 72,
      depthIn: 25.5,
      assemblyNotes: "Length from dim-002 'Left wall 72\"'; standard depth 25.5\".",
    });
    const rightCounterRun = makeRun({
      id: "kelley-right",
      label: "Right counter",
      lengthIn: 64,
      depthIn: 25.5,
      assemblyNotes: "Length from dim-003 'Right wall 64\"'; standard depth 25.5\".",
    });
    const area = makeArea({
      label: "Kitchen",
      runs: [islandRun, leftCounterRun, rightCounterRun],
      backsplashLinearIn: 0,
    });
    const room = makeRoom({
      name: "Kitchen",
      areas: [area],
      notes: ["No b/s per plan note"],
    });
    return makeTakeoffResult({
      rooms: [room],
      projectAssumptions: [
        "Visible reference total: 50 sq' no b/s (comparison evidence only — not calculation authority).",
        "Horizontal section excluded from estimate — questionable geometry, estimator reviewed.",
        "Island depth 36\" confirmed from visible dimension.",
      ],
    });
  }

  it("Kelley reviewed 39.91 / 0 b/s fixture passes as reviewed geometry even though reference says 50", () => {
    const result = buildKelleyReviewedDraft();
    const dimensionEvidence = {
      dimensions: [
        { id: "dim-island-depth", label: "Island depth", lengthIn: 64, depthIn: 36, confidence: "high", category: "island" },
      ],
      referenceTotals: [
        { id: "ref-1", rawText: "50 sq' no b/s", countertopSf: 50, noBacksplash: true, confidence: "high" },
      ],
    };
    const { findings, hasErrors } = evaluateTakeoffFabricationRules({
      takeoffResult: result,
      dimensionEvidence,
    });

    // Should NOT emit REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET (no reconciliation language).
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET),
      false,
      "Kelley reviewed draft should NOT emit reference-total-as-geometry-target"
    );

    // Should emit NO_BACKSPLASH_CONFIRMED.
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.NO_BACKSPLASH_CONFIRMED),
      "No backsplash should be confirmed"
    );

    // Island depth has evidence → VERIFIED, not UNSUPPORTED.
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE),
      "Island 36\" depth should be VERIFIED from evidence"
    );
    assert.equal(
      hasCode(findings, FABRICATION_RULE_CODE.NONSTANDARD_DEPTH_UNSUPPORTED),
      false,
      "Island 36\" depth should NOT be unsupported"
    );

    // No cutout errors.
    assert.equal(hasCode(findings, FABRICATION_RULE_CODE.CUTOUT_DEDUCTED_FROM_MATERIAL), false);
    // No errors overall.
    assert.equal(hasErrors, false);
  });

  it("AI-generated result with 'reconciled to 50' language is review_required via REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET", () => {
    const islandRun = makeRun({
      label: "Island",
      lengthIn: 69,
      depthIn: 36,
      assemblyNotes: "Island length adjusted to reconcile with reference total of 50 sq'.",
    });
    const area = makeArea({ runs: [islandRun] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const findings = classifyReferenceTotalUsage(result);
    assert.ok(
      hasCode(findings, FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET),
      "AI-generated result reconciled to 50 must emit the reference-total-as-target finding"
    );
    const f = findings.find((x) => x.code === FABRICATION_RULE_CODE.REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET);
    assert.equal(f.level, FABRICATION_RULE_LEVEL.WARNING);
  });

  it("Kelley no backsplash is honored — backsplash findings show no conflict", () => {
    const result = buildKelleyReviewedDraft();
    const dimensionEvidence = {
      dimensions: [],
      referenceTotals: [
        { id: "ref-1", rawText: "50 sq' no b/s", countertopSf: 50, noBacksplash: true, confidence: "high" },
      ],
    };
    const findings = classifyBacksplashRule(result, dimensionEvidence);
    assert.ok(hasCode(findings, FABRICATION_RULE_CODE.NO_BACKSPLASH_CONFIRMED));
    assert.equal(hasCode(findings, FABRICATION_RULE_CODE.BACKSPLASH_SCOPE_CONFLICT), false);
  });
});

// ── classifyDepthEvidence helper ──────────────────────────────────────────────

describe("classifyDepthEvidence helper", () => {
  it("returns hasEvidenceSupport=true when depthEvidenceId matches evidence dimension id", () => {
    const run = makeRun({ depthIn: 36, depthEvidenceId: "dim-1" });
    const evidence = { dimensions: [{ id: "dim-1", depthIn: 36, label: "Island" }] };
    const result = classifyDepthEvidence(run, evidence);
    assert.equal(result.hasEvidenceSupport, true);
    assert.ok(result.evidenceDim);
  });

  it("returns hasEvidenceSupport=true when evidence dimension depthIn matches within ±1\"", () => {
    const run = makeRun({ depthIn: 36 });
    const evidence = { dimensions: [{ id: "dim-2", depthIn: 36.5, label: "Island" }] };
    const result = classifyDepthEvidence(run, evidence);
    assert.equal(result.hasEvidenceSupport, true);
  });

  it("returns hasEvidenceSupport=false when no matching evidence", () => {
    const run = makeRun({ depthIn: 36 });
    const evidence = { dimensions: [{ id: "dim-3", depthIn: 25.5, label: "Wall counter" }] };
    const result = classifyDepthEvidence(run, evidence);
    assert.equal(result.hasEvidenceSupport, false);
  });
});

// ── shouldApplyCornerDeduction helper ─────────────────────────────────────────

describe("shouldApplyCornerDeduction helper", () => {
  it("returns false when area has cornerDeductions and a run is excluded", () => {
    const area = makeArea({
      runs: [makeRun({ id: "run-x" }), makeRun({ id: "run-y" })],
      cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }],
    });
    const excluded = new Set(["run-y"]);
    assert.equal(shouldApplyCornerDeduction(area, excluded), false);
  });

  it("returns true when area has cornerDeductions and no runs excluded", () => {
    const area = makeArea({
      runs: [makeRun({ id: "run-a" }), makeRun({ id: "run-b" })],
      cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }],
    });
    assert.equal(shouldApplyCornerDeduction(area, new Set()), true);
  });

  it("returns true when area has no cornerDeductions (nothing to deduct)", () => {
    const area = makeArea({ runs: [makeRun({ id: "run-x" })] });
    assert.equal(shouldApplyCornerDeduction(area, new Set(["run-x"])), true);
  });
});

// ── No quote mutation / no pricing side effects ────────────────────────────────

describe("Safety: no quote mutation, no pricing", () => {
  it("evaluateTakeoffFabricationRules does not mutate input TakeoffResult", () => {
    const run = makeRun({ label: "Kitchen counter" });
    const area = makeArea({ runs: [run] });
    const room = makeRoom({ areas: [area] });
    const result = makeTakeoffResult({ rooms: [room] });
    const originalJson = JSON.stringify(result);
    evaluateTakeoffFabricationRules({ takeoffResult: result });
    assert.equal(JSON.stringify(result), originalJson, "TakeoffResult must not be mutated");
  });

  it("evaluateTakeoffFabricationRules does not throw for empty result", () => {
    assert.doesNotThrow(() => {
      evaluateTakeoffFabricationRules({ takeoffResult: makeTakeoffResult() });
    });
  });
});
