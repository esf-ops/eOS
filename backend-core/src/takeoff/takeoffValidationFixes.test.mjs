/**
 * takeoffValidationFixes — unit tests.
 *
 * Run: npm run eos:test:takeoff-validation-fixes
 */
import assert from "node:assert/strict";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";
import { evaluateTakeoffQaGate } from "./takeoffQaGate.mjs";
import {
  listCutoutExclusionFixes,
  applyCutoutExclusionFix,
  listFixableValidationIssues,
  inferCutoutType,
} from "./takeoffValidationFixes.mjs";

function makeTakeoffWithSinkExclusion() {
  return {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        areas: [
          {
            id: "area-1",
            label: "Main counter",
            runs: [{ id: "run-1", label: "Main", lengthIn: 120, depthIn: 25.5 }],
            exclusions: [{ label: "Undermount sink cutout", sfExcluded: 4.5 }],
          },
        ],
      },
    ],
  };
}

{
  assert.equal(inferCutoutType("Undermount sink"), "sink");
  assert.equal(inferCutoutType("Cooktop opening"), "cooktop");
  console.log("ok: inferCutoutType");
}

{
  const takeoff = makeTakeoffWithSinkExclusion();
  const fixes = listCutoutExclusionFixes(takeoff);
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].exclusionLabel, "Undermount sink cutout");
  console.log("ok: listCutoutExclusionFixes");
}

{
  const takeoff = makeTakeoffWithSinkExclusion();
  const computed = computeTakeoffMeasurements(takeoff);
  const validation = validateTakeoffResult(takeoff, computed);
  assert.equal(validation.hasErrors, true, "sink exclusion causes validation error before fix");
  assert.ok(
    validation.diagnostics.some((d) => d.code === "CUTOUT_DEDUCTED_FROM_MATERIAL"),
    "CUTOUT_DEDUCTED_FROM_MATERIAL present"
  );

  const fixes = listCutoutExclusionFixes(takeoff);
  const fixed = applyCutoutExclusionFix(takeoff, fixes[0], "move_to_cutouts");
  const fixedComputed = computeTakeoffMeasurements(fixed);
  const fixedValidation = validateTakeoffResult(fixed, fixedComputed);
  assert.equal(fixedValidation.hasErrors, false, "validation passes after move_to_cutouts");
  assert.ok((fixed.rooms[0].areas[0].cutouts ?? []).length === 1);
  assert.equal(fixed.rooms[0].areas[0].exclusions, undefined);

  const qa = evaluateTakeoffQaGate({
    takeoffResult: fixed,
    computedMeasurements: fixedComputed,
    validationDiagnostics: fixedValidation,
  });
  assert.notEqual(qa.status, "do_not_import", "QA gate not do_not_import after fix");
  console.log("ok: applyCutoutExclusionFix move_to_cutouts clears validation + QA block");
}

{
  const takeoff = makeTakeoffWithSinkExclusion();
  const fixes = listCutoutExclusionFixes(takeoff);
  const fixed = applyCutoutExclusionFix(takeoff, fixes[0], "move_to_notes");
  const validation = validateTakeoffResult(fixed, computeTakeoffMeasurements(fixed));
  assert.equal(validation.hasErrors, false);
  assert.ok((fixed.rooms[0].areas[0].notes ?? []).some((n) => n.includes("Fabrication cutout")));
  console.log("ok: applyCutoutExclusionFix move_to_notes");
}

{
  const takeoff = makeTakeoffWithSinkExclusion();
  const fixes = listCutoutExclusionFixes(takeoff);
  const fixed = applyCutoutExclusionFix(takeoff, fixes[0], "remove");
  const validation = validateTakeoffResult(fixed, computeTakeoffMeasurements(fixed));
  assert.equal(validation.hasErrors, false);
  console.log("ok: applyCutoutExclusionFix remove");
}

{
  const takeoff = makeTakeoffWithSinkExclusion();
  const computed = computeTakeoffMeasurements(takeoff);
  const validation = validateTakeoffResult(takeoff, computed);
  const issues = listFixableValidationIssues(takeoff, validation);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].hasDiagnostic, true);
  console.log("ok: listFixableValidationIssues");
}

console.log("\ntakeoffValidationFixes: all tests passed");
