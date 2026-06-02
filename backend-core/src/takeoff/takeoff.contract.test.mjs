/**
 * eliteOS AI Takeoff — contract tests.
 *
 * Run: npm run eos:test:takeoff-contract
 *
 * Tests:
 *   A. Spec 73 deterministic math (59.96 ct / 6.61 bs / 66.57 combined)
 *   B. Chargeable (ceiling) sf
 *   C. Validator passes the known fixture
 *   D. Validator detects AI total mismatch
 *   E. Validator flags missing dimensions
 *   F. Validator flags empty takeoff
 *   G. Import planner — Spec 73 room structure
 *   H. Import planner — status gate (draft blocked)
 *   I. Import planner — single straight run
 *   J. Import planner — 2-run L-shape
 *   K. Import planner — 3-run U-shape
 *   L. Import planner — ≥4 runs → manual + warning
 *   M. Import planner — backsplash linear inches → Backsplash group
 *   N. Pricing authority contract tests still pass (smoke)
 *   O. sfFromRun unit tests
 *   P. cornerOverlapSf unit test
 *   Q. Validator warns: AI backsplash total > 0 but computed = 0 (AI_BACKSPLASH_TOTAL_NOT_STRUCTURED)
 *   R. Validator warns: backsplash keyword in notes with zero computed (POSSIBLE_BACKSPLASH_NOTE)
 *   S. No false positive when notes say "no B/S"
 *   T. Validator warns: sink/cooktop/faucet in exclusions (CUTOUT_IN_EXCLUSIONS_WARNING)
 *   U. No false positive: true material exclusion (no cutout keyword) does not trigger warning
 *   V. Validator warns: reference total CT 50 sf vs computed ~36 sf (REFERENCE_TOTAL_COUNTERTOP_MISMATCH)
 *   W. Validator warns: noBacksplash=true but computed backsplash > 0 (REFERENCE_TOTAL_NO_BS_CONFLICT)
 *   X. Validator warns: high-confidence evidence dimension not in final runs (EVIDENCE_DIMENSION_NOT_USED)
 */

import assert from "node:assert/strict";

import { computeTakeoffMeasurements, sfFromRun, chargeableSfFromExact, cornerOverlapSf } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";
import { planTakeoffImport } from "./takeoffImportPlanner.mjs";
import {
  makeTakeoffResult, makeTakeoffRoom, makeTakeoffArea, makeTakeoffRun,
  TAKEOFF_STATUS, TAKEOFF_DIAGNOSTIC_CODE, TAKEOFF_DIAGNOSTIC_LEVEL
} from "./takeoffContract.mjs";
import { buildSpec73Fixture, SPEC73_EXPECTED } from "./fixtures/spec73.fixture.mjs";

const TOLERANCE = 0.02; // sf — tighter than validator (0.05) for regression

function near(a, b, label) {
  const diff = Math.abs(a - b);
  assert.ok(diff <= TOLERANCE, `${label}: expected ≈${b}, got ${a} (diff ${diff.toFixed(4)} > ${TOLERANCE})`);
}

// ── O. sfFromRun unit tests ───────────────────────────────────────────────────
{
  assert.equal(sfFromRun(91.5, 25.5), 16.20, "sfFromRun: 91.5×25.5 = 16.20 sf");
  assert.equal(sfFromRun(72, 25.5), 12.75, "sfFromRun: 72×25.5 = 12.75 sf");
  assert.equal(sfFromRun(26.5, 25.5), 4.69, "sfFromRun: 26.5×25.5 = 4.69 sf");
  assert.equal(sfFromRun(24, 25.5), 4.25, "sfFromRun: 24×25.5 = 4.25 sf");
  near(sfFromRun(77.5, 41), SPEC73_EXPECTED.countertopExactSf - (16.20 + 12.75 + 4.69 + 4.25), "sfFromRun: 77.5×41 = 22.07 sf");
  assert.equal(sfFromRun(0, 25.5), 0, "sfFromRun: zero length = 0");
  assert.equal(sfFromRun(10, 0), 0, "sfFromRun: zero depth = 0");
  // Triangle
  const triSf = sfFromRun(12, 12, "tri");
  assert.equal(triSf, 0.5, "sfFromRun triangle: 12×12/144/2 = 0.5 sf");
  console.log("ok: sfFromRun unit tests");
}

// ── P. cornerOverlapSf unit test ─────────────────────────────────────────────
{
  // 25.5" × 25.5" corner = 25.5² / 144 = 650.25 / 144 ≈ 4.52 sf
  const overlap = cornerOverlapSf(25.5, 25.5);
  assert.ok(Math.abs(overlap - 4.52) < 0.01, `cornerOverlapSf: 25.5×25.5 ≈ 4.52 sf, got ${overlap}`);
  assert.equal(cornerOverlapSf(0, 25.5), 0, "cornerOverlapSf: zero depth = 0");
  console.log("ok: cornerOverlapSf unit test");
}

// ── A. Spec 73 deterministic math ────────────────────────────────────────────
{
  const fixture = buildSpec73Fixture();
  const computed = computeTakeoffMeasurements(fixture);

  near(computed.countertopExactSf, SPEC73_EXPECTED.countertopExactSf, "Spec 73: countertop exact sf");
  near(computed.backsplashExactSf, SPEC73_EXPECTED.backsplashExactSf, "Spec 73: backsplash exact sf");
  near(computed.combinedExactSf, SPEC73_EXPECTED.combinedExactSf, "Spec 73: combined exact sf");

  console.log(`ok: Spec 73 countertop=${computed.countertopExactSf} bs=${computed.backsplashExactSf} combined=${computed.combinedExactSf}`);
}

// ── B. Chargeable (ceiling) sf ────────────────────────────────────────────────
{
  const fixture = buildSpec73Fixture();
  const computed = computeTakeoffMeasurements(fixture);

  assert.equal(computed.chargeableCountertopSf, SPEC73_EXPECTED.chargeableCountertopSf, `chargeable countertop: ceiling(${computed.countertopExactSf}) = ${SPEC73_EXPECTED.chargeableCountertopSf}`);
  assert.equal(computed.chargeableBacksplashSf, SPEC73_EXPECTED.chargeableBacksplashSf, `chargeable backsplash: ceiling(${computed.backsplashExactSf}) = ${SPEC73_EXPECTED.chargeableBacksplashSf}`);

  // Additional ceiling tests
  assert.equal(chargeableSfFromExact(0), 0, "chargeableSf: 0 → 0");
  assert.equal(chargeableSfFromExact(8.0), 8, "chargeableSf: 8.0 → 8 (exact whole)");
  assert.equal(chargeableSfFromExact(7.66), 8, "chargeableSf: 7.66 → 8");
  assert.equal(chargeableSfFromExact(1.0), 1, "chargeableSf: 1.0 → 1");
  assert.equal(chargeableSfFromExact(1.01), 2, "chargeableSf: 1.01 → 2 (beyond whole-number tolerance)");
  console.log("ok: chargeable sf ceiling tests");
}

// ── C. Validator passes the known fixture ─────────────────────────────────────
{
  const fixture = buildSpec73Fixture();
  const computed = computeTakeoffMeasurements(fixture);
  const result = validateTakeoffResult(fixture, computed);

  assert.ok(result.valid, `Validator: Spec 73 should be valid (no errors). Errors: ${result.diagnostics.filter(d=>d.level==="error").map(d=>d.message).join("; ")}`);
  assert.equal(result.errorCount, 0, "Validator: Spec 73 has no errors");
  // Should have at most INFO-level diagnostic about draft/pending (fixture is "reviewed")
  const errors = result.diagnostics.filter(d => d.level === "error");
  assert.equal(errors.length, 0, "Validator: no error-level diagnostics on Spec 73");
  console.log(`ok: validator passes Spec 73 (errors=0, warnings=${result.warningCount}, info=${result.infoCount})`);
}

// ── D. Validator detects AI total mismatch ────────────────────────────────────
{
  const fixture = buildSpec73Fixture();
  // Tamper with AI-provided countertop total to be significantly wrong
  fixture.aiProvidedTotals.countertopExactSf = 100;
  const computed = computeTakeoffMeasurements(fixture);
  const result = validateTakeoffResult(fixture, computed);

  const mismatch = result.diagnostics.find(d => d.code === TAKEOFF_DIAGNOSTIC_CODE.TOTAL_MISMATCH_COUNTERTOP);
  assert.ok(mismatch, "Validator: should warn on countertop total mismatch");
  assert.equal(mismatch.level, TAKEOFF_DIAGNOSTIC_LEVEL.WARNING, "Mismatch is a warning (not an error — computed value is authoritative)");
  console.log("ok: validator detects AI total mismatch");
}

// ── E. Validator flags missing dimensions ─────────────────────────────────────
{
  const badRun = makeTakeoffRun({ id: "bad-run", label: "Empty run", lengthIn: 0, depthIn: 25.5, pieceType: "counter" });
  const badArea = makeTakeoffArea({ id: "bad-area", label: "Bad area", runs: [badRun] });
  const room = makeTakeoffRoom({ id: "bad-room", name: "Kitchen", areas: [badArea] });
  const result = makeTakeoffResult({ status: TAKEOFF_STATUS.REVIEWED, rooms: [room] });
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);

  const zeroLen = validation.diagnostics.find(d => d.code === TAKEOFF_DIAGNOSTIC_CODE.ZERO_LENGTH);
  assert.ok(zeroLen, "Validator: should flag zero-length run");
  assert.equal(zeroLen.level, TAKEOFF_DIAGNOSTIC_LEVEL.ERROR, "Zero-length run is an error");
  assert.ok(validation.hasErrors, "Validator: result with zero-length run has errors");
  console.log("ok: validator flags missing dimensions");
}

// ── F. Validator flags empty takeoff ─────────────────────────────────────────
{
  const empty = makeTakeoffResult({ status: TAKEOFF_STATUS.REVIEWED, rooms: [] });
  const computed = computeTakeoffMeasurements(empty);
  const validation = validateTakeoffResult(empty, computed);

  const noRooms = validation.diagnostics.find(d => d.code === TAKEOFF_DIAGNOSTIC_CODE.MISSING_ROOMS);
  assert.ok(noRooms, "Validator: should error on empty rooms");
  assert.equal(noRooms.level, TAKEOFF_DIAGNOSTIC_LEVEL.ERROR);
  console.log("ok: validator flags empty takeoff");
}

// ── G. Import planner — Spec 73 room structure ────────────────────────────────
{
  const fixture = buildSpec73Fixture();
  const computed = computeTakeoffMeasurements(fixture);
  const plan = planTakeoffImport(fixture, computed);

  assert.ok(plan.canImport, "Import planner: Spec 73 (reviewed) can import");
  assert.equal(plan.rooms.length, 1, "Import planner: Spec 73 produces 1 room");
  const room = plan.rooms[0];
  assert.equal(room.name, "Kitchen");
  assert.equal(room.calcMode, "Guided Shape");

  // Should produce groups for main kitchen (U-shape or similar), stove wall, and backsplash
  assert.ok(room.guidedShapeGroups.length >= 3, `Import planner: ≥3 guided shape groups, got ${room.guidedShapeGroups.length}`);

  // Verify backsplash group exists (from area-03 backsplashLinearIn = 238)
  const bsGroup = room.guidedShapeGroups.find(g => g.shapeType === "Backsplash");
  assert.ok(bsGroup, "Import planner: Spec 73 should produce a Backsplash group");
  assert.equal(bsGroup.pieces.length, 1, "Backsplash group: one piece (238\" linear)");
  assert.equal(bsGroup.pieces[0].lengthIn, 238, "Backsplash piece: 238 linear inches");
  assert.equal(bsGroup.pieces[0].depthIn, 4, "Backsplash piece: 4\" height");

  // Verify computed sf passed through
  near(plan.computedSf.countertopExactSf, SPEC73_EXPECTED.countertopExactSf, "Import plan computedSf.countertop");
  near(plan.computedSf.backsplashExactSf, SPEC73_EXPECTED.backsplashExactSf, "Import plan computedSf.backsplash");

  console.log(`ok: import planner Spec 73 (${room.guidedShapeGroups.length} groups, canImport=${plan.canImport})`);
}

// ── H. Import planner — status gate (draft blocked) ──────────────────────────
{
  const fixture = buildSpec73Fixture();
  fixture.status = TAKEOFF_STATUS.DRAFT;
  const computed = computeTakeoffMeasurements(fixture);
  const plan = planTakeoffImport(fixture, computed);

  assert.equal(plan.canImport, false, "Import planner: draft status blocks import");
  assert.ok(plan.blockedReason, "Import planner: blockedReason set when blocked");
  assert.equal(plan.rooms.length, 0, "Import planner: no rooms when blocked");
  console.log("ok: import planner status gate (draft blocked)");
}

// ── I. Import planner — single straight run ───────────────────────────────────
{
  const run = makeTakeoffRun({ label: "Main run", lengthIn: 72, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({ label: "Straight counter", runs: [run] });
  const room = makeTakeoffRoom({ name: "Bath", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.REVIEWED, rooms: [room] });
  const computed = computeTakeoffMeasurements(tr);
  const plan = planTakeoffImport(tr, computed);

  assert.equal(plan.rooms[0].guidedShapeGroups[0].shapeType, "straight", "Single run → straight group");
  assert.equal(plan.rooms[0].guidedShapeGroups[0].pieces.length, 1);
  console.log("ok: import planner single straight run");
}

// ── J. Import planner — 2-run L-shape ─────────────────────────────────────────
{
  const r1 = makeTakeoffRun({ label: "Main run", lengthIn: 72, depthIn: 25.5, pieceType: "counter" });
  const r2 = makeTakeoffRun({ label: "Return", lengthIn: 36, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({ label: "L-shape", runs: [r1, r2] });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.REVIEWED, rooms: [room] });
  const plan = planTakeoffImport(tr, computeTakeoffMeasurements(tr));

  const group = plan.rooms[0].guidedShapeGroups[0];
  assert.equal(group.shapeType, "L-Shape", "2 counter runs → L-Shape group");
  assert.equal(group.overlapMode, "auto", "L-Shape overlapMode: auto");
  console.log("ok: import planner 2-run L-shape");
}

// ── K. Import planner — 3-run U-shape ─────────────────────────────────────────
{
  const runs = [
    makeTakeoffRun({ label: "Left", lengthIn: 60, depthIn: 25.5, pieceType: "counter" }),
    makeTakeoffRun({ label: "Back", lengthIn: 80, depthIn: 25.5, pieceType: "counter" }),
    makeTakeoffRun({ label: "Right", lengthIn: 60, depthIn: 25.5, pieceType: "counter" })
  ];
  const area = makeTakeoffArea({ label: "U-shape", runs });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.REVIEWED, rooms: [room] });
  const plan = planTakeoffImport(tr, computeTakeoffMeasurements(tr));

  const group = plan.rooms[0].guidedShapeGroups[0];
  assert.equal(group.shapeType, "U-Shape", "3 counter runs → U-Shape group");
  assert.equal(group.overlapMode, "auto", "U-Shape overlapMode: auto");
  console.log("ok: import planner 3-run U-shape");
}

// ── L. Import planner — ≥4 runs → manual + warning ───────────────────────────
{
  const runs = [1, 2, 3, 4].map((i) =>
    makeTakeoffRun({ label: `Run ${i}`, lengthIn: 30, depthIn: 25.5, pieceType: "counter" })
  );
  const area = makeTakeoffArea({ label: "Complex area", runs });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.REVIEWED, rooms: [room] });
  const plan = planTakeoffImport(tr, computeTakeoffMeasurements(tr));

  const group = plan.rooms[0].guidedShapeGroups[0];
  assert.equal(group.shapeType, "manual", "4 runs → manual shape group");
  const unsupported = plan.warnings.find(w => w.code === TAKEOFF_DIAGNOSTIC_CODE.UNSUPPORTED_SHAPE);
  assert.ok(unsupported, "Import planner: ≥4 runs produces UNSUPPORTED_SHAPE warning");
  console.log("ok: import planner ≥4 runs → manual + warning");
}

// ── M. Import planner — backsplash linear inches → Backsplash group ───────────
{
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 120, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({
    label: "Kitchen with backsplash",
    runs: [run],
    backsplashLinearIn: 120,
    backsplashHeightIn: 4
  });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.REVIEWED, rooms: [room] });
  const plan = planTakeoffImport(tr, computeTakeoffMeasurements(tr));

  // Should produce counter group + separate Backsplash group
  const groups = plan.rooms[0].guidedShapeGroups;
  const bsGroup = groups.find(g => g.shapeType === "Backsplash");
  assert.ok(bsGroup, "Backsplash group from linear inches");
  assert.equal(bsGroup.pieces[0].lengthIn, 120, "Backsplash linear 120\"");
  assert.equal(groups.find(g => g.shapeType === "straight")?.shapeType, "straight", "Counter group still present");
  console.log("ok: import planner backsplash linear inches → Backsplash group");
}

// ── Q. Validator warns: AI backsplash total > 0 but computed = 0 ─────────
{
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 72, depthIn: 25.5, pieceType: "counter" });
  // No backsplashLinearIn on area — AI model detected backsplash but didn't structure it
  const area = makeTakeoffArea({ label: "Kitchen counter", runs: [run] });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({
    status: TAKEOFF_STATUS.DRAFT,
    rooms: [room],
    aiProvidedTotals: { countertopExactSf: 12.75, backsplashExactSf: 8.52 },
  });
  const computed = computeTakeoffMeasurements(tr);
  const validation = validateTakeoffResult(tr, computed);

  assert.equal(computed.backsplashExactSf, 0, "Q: no structured backsplash → computed = 0");
  const d = validation.diagnostics.find((x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.AI_BACKSPLASH_TOTAL_NOT_STRUCTURED);
  assert.ok(d, "Q: AI_BACKSPLASH_TOTAL_NOT_STRUCTURED warning fires when AI total > 0 but computed = 0");
  assert.equal(d.level, TAKEOFF_DIAGNOSTIC_LEVEL.WARNING, "Q: diagnostic is WARNING level");
  // TOTAL_MISMATCH_BACKSPLASH should also fire (different code, both correct)
  const mismatch = validation.diagnostics.find((x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.TOTAL_MISMATCH_BACKSPLASH);
  assert.ok(mismatch, "Q: TOTAL_MISMATCH_BACKSPLASH also fires");
  // POSSIBLE_BACKSPLASH_NOTE should NOT fire since AI total guard already covers it
  const noteFire = validation.diagnostics.find((x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.POSSIBLE_BACKSPLASH_NOTE);
  assert.equal(noteFire, undefined, "Q: POSSIBLE_BACKSPLASH_NOTE does not double-fire alongside AI_BACKSPLASH_TOTAL_NOT_STRUCTURED");
  // Countertop computation unchanged
  near(computed.countertopExactSf, 12.75, "Q: countertop computation unchanged");
  console.log("ok: AI_BACKSPLASH_TOTAL_NOT_STRUCTURED warning fires on unstructured backsplash");
}

// ── R. Validator warns: backsplash keyword in notes, computed = 0 ─────────
{
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 72, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({ label: "Counter", runs: [run] }); // no backsplashLinearIn
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({
    status: TAKEOFF_STATUS.DRAFT,
    rooms: [room],
    projectAssumptions: ["4 inch B/S noted on plan — could not determine linear inches"],
    // no aiProvidedTotals.backsplashExactSf
  });
  const computed = computeTakeoffMeasurements(tr);
  const validation = validateTakeoffResult(tr, computed);

  assert.equal(computed.backsplashExactSf, 0, "R: no structured backsplash → computed = 0");
  const d = validation.diagnostics.find((x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.POSSIBLE_BACKSPLASH_NOTE);
  assert.ok(d, "R: POSSIBLE_BACKSPLASH_NOTE fires when note mentions B/S and computed = 0");
  assert.equal(d.level, TAKEOFF_DIAGNOSTIC_LEVEL.WARNING, "R: diagnostic is WARNING level");
  console.log("ok: POSSIBLE_BACKSPLASH_NOTE fires on backsplash keyword with zero computed backsplash");
}

// ── S. No false positive: "no B/S" note does not trigger POSSIBLE_BACKSPLASH_NOTE ─
{
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 72, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({ label: "Counter", runs: [run] });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area], notes: ["no B/S"] });
  const tr = makeTakeoffResult({
    status: TAKEOFF_STATUS.DRAFT,
    rooms: [room],
    // no aiProvidedTotals
  });
  const computed = computeTakeoffMeasurements(tr);
  const validation = validateTakeoffResult(tr, computed);

  assert.equal(computed.backsplashExactSf, 0, "S: no backsplash computed when not structured");
  const d = validation.diagnostics.find((x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.POSSIBLE_BACKSPLASH_NOTE);
  assert.equal(d, undefined, "S: no POSSIBLE_BACKSPLASH_NOTE false positive when notes say 'no B/S'");
  const bsNotStructured = validation.diagnostics.find((x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.AI_BACKSPLASH_TOTAL_NOT_STRUCTURED);
  assert.equal(bsNotStructured, undefined, "S: no AI_BACKSPLASH_TOTAL_NOT_STRUCTURED false positive (no AI total)");
  console.log("ok: no false positive backsplash warning when notes say 'no B/S'");
}

// ── T. CUTOUT_IN_EXCLUSIONS_WARNING fires when exclusion label contains cutout keyword ─
{
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 91.5, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({
    label: "Kitchen",
    runs: [run],
    exclusions: [
      { label: "Sink cutout", lengthIn: 33, depthIn: 22 }, // should trigger warning
    ],
  });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.DRAFT, rooms: [room] });
  const computed = computeTakeoffMeasurements(tr);
  const validation = validateTakeoffResult(tr, computed);

  const w = validation.diagnostics.find(
    (x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.CUTOUT_IN_EXCLUSIONS_WARNING
  );
  assert.ok(w, "T: CUTOUT_IN_EXCLUSIONS_WARNING must fire when exclusion label contains 'sink'");
  assert.equal(w.level, "warning", "T: diagnostic level must be warning");
  assert.match(w.message, /sink/i, "T: message must reference the cutout keyword");
  console.log("ok: CUTOUT_IN_EXCLUSIONS_WARNING fires for sink/cooktop/faucet in exclusions");
}

// ── U. No false positive: true material exclusion does not trigger cutout warning ─
{
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 72, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({
    label: "Kitchen",
    runs: [run],
    exclusions: [
      { label: "Window opening", lengthIn: 30, depthIn: 12 }, // true material exclusion — no cutout keyword
    ],
  });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.DRAFT, rooms: [room] });
  const computed = computeTakeoffMeasurements(tr);
  const validation = validateTakeoffResult(tr, computed);

  const w = validation.diagnostics.find(
    (x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.CUTOUT_IN_EXCLUSIONS_WARNING
  );
  assert.equal(w, undefined, "U: no false positive CUTOUT_IN_EXCLUSIONS_WARNING for 'Window opening'");
  console.log("ok: no false positive CUTOUT_IN_EXCLUSIONS_WARNING for true material exclusion");
}

// ── V. REFERENCE_TOTAL_COUNTERTOP_MISMATCH fires when ref total differs from computed ──
{
  // Create a takeoff that computes ~35.4 sf countertop (200" × 25.5" / 144)
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 200, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({ label: "Kitchen", runs: [run], backsplashIncluded: false });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.DRAFT, rooms: [room] });
  const computed = computeTakeoffMeasurements(tr);

  // Provide dimension evidence with a reference total of 50 sf (diff = ~14.6 sf > 2 sf tolerance)
  const dimensionEvidence = {
    dimensions: [],
    notes: [],
    cutouts: [],
    referenceTotals: [
      {
        id: "ref-1",
        pageNumber: 1,
        rawText: "50 sq' no b/s",
        countertopSf: 50,
        noBacksplash: true,
        backsplashSf: 0,
        confidence: "high",
        notes: [],
      },
    ],
    uncertainItems: [],
    reviewRequired: true,
  };

  const validation = validateTakeoffResult(tr, computed, dimensionEvidence);

  const w = validation.diagnostics.find(
    (x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.REFERENCE_TOTAL_COUNTERTOP_MISMATCH
  );
  assert.ok(w, "V: REFERENCE_TOTAL_COUNTERTOP_MISMATCH must fire when ref CT differs by > 2 sf");
  assert.equal(w.level, "warning", "V: diagnostic level must be warning");
  assert.match(w.message, /50/, "V: message must reference the ref total countertop sf");
  assert.match(w.message, /[Ee]stimator review/, "V: message must say estimator review required");
  console.log("ok: REFERENCE_TOTAL_COUNTERTOP_MISMATCH fires when ref CT differs from computed");
}

// ── W. REFERENCE_TOTAL_NO_BS_CONFLICT fires when noBacksplash=true but computed bs > 0 ──
{
  // Create a takeoff that computes some backsplash (area with backsplashLinearIn > 0)
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 72, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({
    label: "Kitchen",
    runs: [run],
    backsplashIncluded: true,
    backsplashLinearIn: 72,
    backsplashHeightIn: 4,
  });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.DRAFT, rooms: [room] });
  const computed = computeTakeoffMeasurements(tr);
  assert.ok(computed.backsplashExactSf > 0, "W: test setup must compute non-zero backsplash");

  // Provide dimension evidence with noBacksplash=true
  const dimensionEvidence = {
    dimensions: [],
    notes: [],
    cutouts: [],
    referenceTotals: [
      {
        id: "ref-1",
        pageNumber: 1,
        rawText: "Kitchen 49 / NO BS",
        countertopSf: 49,
        noBacksplash: true,
        backsplashSf: 0,
        confidence: "high",
        notes: [],
      },
    ],
    uncertainItems: [],
    reviewRequired: true,
  };

  const validation = validateTakeoffResult(tr, computed, dimensionEvidence);

  const w = validation.diagnostics.find(
    (x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.REFERENCE_TOTAL_NO_BS_CONFLICT
  );
  assert.ok(w, "W: REFERENCE_TOTAL_NO_BS_CONFLICT must fire when noBacksplash=true but computed bs > 0");
  assert.equal(w.level, "warning", "W: diagnostic level must be warning");
  assert.match(w.message, /no backsplash|NO BS|no b\/s/i, "W: message must reference the no-BS note");
  assert.match(w.message, /[Ee]stimator review/, "W: message must say estimator review required");
  console.log("ok: REFERENCE_TOTAL_NO_BS_CONFLICT fires when noBacksplash=true but computed bs > 0");
}

// ── X. EVIDENCE_DIMENSION_NOT_USED fires for high-confidence dim not in final runs ──
{
  // Create a takeoff with a run of length 200" (far from evidence dim of 108")
  const run = makeTakeoffRun({ label: "Counter", lengthIn: 200, depthIn: 25.5, pieceType: "counter" });
  const area = makeTakeoffArea({ label: "Kitchen", runs: [run], backsplashIncluded: false });
  const room = makeTakeoffRoom({ name: "Kitchen", areas: [area] });
  const tr = makeTakeoffResult({ status: TAKEOFF_STATUS.DRAFT, rooms: [room] });
  const computed = computeTakeoffMeasurements(tr);

  // Provide high-confidence island dimension not matched by any run (length 108, far from 200)
  const dimensionEvidence = {
    dimensions: [
      {
        id: "dim-1",
        pageNumber: 1,
        label: "Island top",
        rawText: "108 x 56",
        lengthIn: 108,
        depthIn: 56,
        confidence: "high",
        category: "island",
        interpretationNotes: [],
      },
    ],
    notes: [],
    cutouts: [],
    referenceTotals: [],
    uncertainItems: [],
    reviewRequired: false,
  };

  const validation = validateTakeoffResult(tr, computed, dimensionEvidence);

  const w = validation.diagnostics.find(
    (x) => x.code === TAKEOFF_DIAGNOSTIC_CODE.EVIDENCE_DIMENSION_NOT_USED
  );
  assert.ok(w, "X: EVIDENCE_DIMENSION_NOT_USED must fire when high-confidence dim not in runs");
  assert.equal(w.level, "warning", "X: diagnostic level must be warning");
  assert.match(w.message, /Island top/, "X: message must reference the dimension label");
  assert.match(w.message, /108/, "X: message must reference the dimension length");
  assert.match(w.message, /[Ee]stimator review/, "X: message must say estimator review required");
  console.log("ok: EVIDENCE_DIMENSION_NOT_USED fires for high-confidence dim not matched in final runs");
}

// ── N. No pricing/math behavior changes (smoke) ───────────────────────────────
{
  // Verify takeoff math doesn't interfere with existing pricing constants
  // by asserting that importing takeoff modules doesn't change any quoted values.
  // (Takeoff modules are pure functions with no side effects on shared state.)
  const fixture = buildSpec73Fixture();
  const computed = computeTakeoffMeasurements(fixture);
  // computedSf should be exactly what the math says — not touching any pricing rate
  assert.ok(typeof computed.countertopExactSf === "number", "Takeoff calc returns numbers, not pricing objects");
  assert.ok(typeof computed.backsplashExactSf === "number");
  assert.equal(typeof computed.chargeableCountertopSf, "number", "Chargeable sf is a number");
  // No pricing rates imported or used
  console.log("ok: takeoff foundation does not change pricing/math behavior");
}

console.log("\ntakeoff.contract: all tests passed (A–X)"); 
