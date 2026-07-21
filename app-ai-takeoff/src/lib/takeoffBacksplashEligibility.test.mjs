/**
 * Per-run backsplash eligibility — regression tests.
 *
 * Proves the remaining linked-backsplash bug is gone (area-level height shared
 * across sibling rows) and that eligibility is independent per run, persists,
 * and flows into the approve / Estimate Scope handoff.
 *
 * Run: node app-ai-takeoff/src/lib/takeoffBacksplashEligibility.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flattenPieces, patchRun, reassignRun } from "./consolidatedWorksheetRows.mjs";
import { addManualPiece } from "./emptyManualTakeoffDraft.mjs";
import {
  normalizeTakeoffBacksplashEligibility,
  resolveRunBacksplashEligible,
  sumEligibleBacksplashLengthIn
} from "../../../backend-core/src/takeoff/takeoffBacksplashEligibility.mjs";
import {
  ensureUniqueTakeoffIdentity,
  removePieceFromTakeoff
} from "../../../backend-core/src/takeoff/takeoffAuthoritativeResult.mjs";
import { buildTakeoffImportPayload } from "../../../backend-core/src/takeoff/takeoffImportPayload.mjs";
import { deriveRoomBacksplashFromImportRoom } from "../../../backend-core/src/elite100EstimateStudio/studioRoomBacksplash.mjs";
import { resolveBilledSfForMode } from "../../../backend-core/src/digitalEstimate/configuration/backsplashPricingAuthority.mjs";
import { computeTakeoffMeasurements } from "../../../backend-core/src/takeoff/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "../../../backend-core/src/takeoff/takeoffValidator.mjs";

console.log("\ntakeoffBacksplashEligibility.test.mjs\n");

function fourRunKitchen(overrides = {}) {
  return {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        areas: [
          {
            id: "area-main",
            label: "Main",
            backsplashScope: "stone",
            backsplashIncluded: true,
            // Legacy shared height that previously linked every sibling row.
            backsplashHeightIn: overrides.legacyHeight ?? undefined,
            runs: [
              {
                id: "run-1",
                label: "Sink wall",
                lengthIn: 100,
                depthIn: 25.5,
                quantity: 1,
                pieceType: "counter",
                ...(overrides.r1 ?? {})
              },
              {
                id: "run-2",
                label: "Stove wall",
                lengthIn: 80,
                depthIn: 25.5,
                quantity: 1,
                pieceType: "counter",
                ...(overrides.r2 ?? {})
              },
              {
                id: "run-3",
                label: "Fridge wall",
                lengthIn: 60,
                depthIn: 25.5,
                quantity: 1,
                pieceType: "counter",
                ...(overrides.r3 ?? {})
              },
              {
                id: "run-4",
                label: "Island",
                lengthIn: 72,
                depthIn: 40,
                quantity: 1,
                pieceType: "counter",
                ...(overrides.r4 ?? {})
              }
            ]
          }
        ]
      }
    ]
  };
}

function eligibilityByRun(draft) {
  const map = new Map();
  for (const row of flattenPieces(draft, new Set())) {
    map.set(row.runId, row.backsplashEligible);
  }
  return map;
}

function approvedPayload(result) {
  const computed = computeTakeoffMeasurements(result);
  const validation = validateTakeoffResult(result, computed);
  return buildTakeoffImportPayload({
    takeoffJobId: "job-bs",
    takeoffResultId: "result-bs",
    takeoffResult: result,
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { "room-kitchen": true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    computed,
    validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
}

// ── 1. eligibility toggle updates only one row ───────────────────────────────
{
  let draft = normalizeTakeoffBacksplashEligibility(
    fourRunKitchen({
      r1: { backsplashEligible: false },
      r2: { backsplashEligible: false },
      r3: { backsplashEligible: false },
      r4: { backsplashEligible: false }
    })
  ).takeoff;
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-1" },
    { backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" }
  );
  const map = eligibilityByRun(draft);
  assert.equal(map.get("run-1"), true, "1: run-1 toggled on");
  assert.equal(map.get("run-2"), false, "1: run-2 unchanged");
  assert.equal(map.get("run-3"), false, "1: run-3 unchanged");
  assert.equal(map.get("run-4"), false, "1: run-4 unchanged");
  console.log("  ✓ 1. eligibility toggle updates only one row");
}

// ── 2. four rows can have four independent eligibility values ────────────────
{
  let draft = fourRunKitchen({
    r1: { backsplashEligible: true },
    r2: { backsplashEligible: false },
    r3: { backsplashEligible: true },
    r4: { backsplashEligible: false }
  });
  const map = eligibilityByRun(draft);
  assert.deepEqual(
    [...map.values()],
    [true, false, true, false],
    "2: four independent values"
  );
  console.log("  ✓ 2. four independent eligibility values");
}

// ── 3. save/reload preserves each value (normalize is idempotent) ────────────
{
  const saved = {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        areas: [
          {
            id: "area-main",
            label: "Main",
            backsplashScope: "stone",
            runs: [
              { id: "run-1", label: "A", lengthIn: 100, depthIn: 25.5, pieceType: "counter", backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" },
              { id: "run-2", label: "B", lengthIn: 80, depthIn: 25.5, pieceType: "counter", backsplashEligible: false, backsplashEligibilitySource: "estimator_confirmed" },
              { id: "run-3", label: "C", lengthIn: 60, depthIn: 25.5, pieceType: "counter", backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" },
              { id: "run-4", label: "D", lengthIn: 40, depthIn: 25.5, pieceType: "counter", backsplashEligible: false, backsplashEligibilitySource: "estimator_confirmed" }
            ]
          }
        ]
      }
    ]
  };
  const reloaded = normalizeTakeoffBacksplashEligibility(
    ensureUniqueTakeoffIdentity(structuredClone(saved)).takeoff
  ).takeoff;
  assert.deepEqual(
    eligibilityByRun(reloaded),
    eligibilityByRun(saved),
    "3: save/reload preserves eligibility"
  );
  console.log("  ✓ 3. save/reload preserves each value");
}

// ── 4. add piece creates independent false/default state ─────────────────────
{
  let draft = fourRunKitchen({
    r1: { backsplashEligible: true },
    r2: { backsplashEligible: true },
    r3: { backsplashEligible: true },
    r4: { backsplashEligible: false }
  });
  draft = addManualPiece(draft, "room-kitchen", { label: "New piece" });
  const rows = flattenPieces(draft, new Set());
  const added = rows.find((r) => r.pieceName === "New piece");
  assert.ok(added, "4: added piece present");
  assert.equal(added.backsplashEligible, false, "4: new piece defaults false");
  assert.equal(
    rows.find((r) => r.runId === "run-1").backsplashEligible,
    true,
    "4: existing eligibility unchanged"
  );
  console.log("  ✓ 4. add piece creates independent false default");
}

// ── 5. delete one piece does not shift another row’s state ────────────────────
{
  let draft = fourRunKitchen({
    r1: { backsplashEligible: true },
    r2: { backsplashEligible: false },
    r3: { backsplashEligible: true },
    r4: { backsplashEligible: false }
  });
  const pack = removePieceFromTakeoff(draft, "room-kitchen", "run-2");
  draft = pack.takeoff;
  const map = eligibilityByRun(draft);
  assert.equal(map.has("run-2"), false, "5: deleted run gone");
  assert.equal(map.get("run-1"), true, "5: run-1 still eligible");
  assert.equal(map.get("run-3"), true, "5: run-3 still eligible");
  assert.equal(map.get("run-4"), false, "5: run-4 still not eligible");
  console.log("  ✓ 5. delete does not shift other eligibility");
}

// ── 6. moving a piece preserves its eligibility ──────────────────────────────
{
  let draft = {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-a",
        name: "Kitchen",
        areas: [
          {
            id: "area-a",
            label: "Main",
            backsplashScope: "stone",
            runs: [
              {
                id: "run-move",
                label: "Wall",
                lengthIn: 90,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: true
              }
            ]
          }
        ]
      },
      {
        id: "room-b",
        name: "Bath",
        areas: [{ id: "area-b", label: "Main", backsplashScope: "stone", runs: [] }]
      }
    ]
  };
  draft = reassignRun(draft, "room-a", "run-move", "room-b");
  const rows = flattenPieces(draft, new Set());
  const moved = rows.find((r) => r.runId === "run-move");
  assert.equal(moved.roomId, "room-b", "6: moved to bath");
  assert.equal(moved.backsplashEligible, true, "6: eligibility preserved");
  console.log("  ✓ 6. move preserves eligibility");
}

// ── 7. positive legacy height normalizes to eligible ─────────────────────────
{
  const legacy = fourRunKitchen({ legacyHeight: 4 });
  // Strip any explicit eligibility so legacy height applies.
  for (const run of legacy.rooms[0].areas[0].runs) {
    delete run.backsplashEligible;
  }
  // Island lives in same area in this fixture — legacy area height suggests
  // eligible for all counter runs in the area (islands are normally separate).
  const { takeoff, changed } = normalizeTakeoffBacksplashEligibility(legacy);
  assert.equal(changed, true, "7: normalization changed draft");
  const map = eligibilityByRun(takeoff);
  assert.equal(map.get("run-1"), true, "7: positive legacy height → eligible");
  assert.equal(
    takeoff.rooms[0].areas[0].runs[0].backsplashEligibilitySource,
    "legacy_height",
    "7: source tagged legacy_height"
  );
  console.log("  ✓ 7. positive legacy height → eligible");
}

// ── 8. blank/zero legacy height normalizes to not eligible ───────────────────
{
  const legacy = fourRunKitchen({ legacyHeight: 0 });
  for (const run of legacy.rooms[0].areas[0].runs) {
    delete run.backsplashEligible;
  }
  legacy.rooms[0].areas[0].backsplashIncluded = false;
  const { takeoff } = normalizeTakeoffBacksplashEligibility(legacy);
  const map = eligibilityByRun(takeoff);
  assert.equal(map.get("run-1"), false, "8: zero/blank → not eligible");
  assert.equal(map.get("run-4"), false, "8: island not eligible");
  console.log("  ✓ 8. blank/zero legacy height → not eligible");
}

// ── 9. ordinary takeoff no longer requires a height value ────────────────────
{
  const draft = normalizeTakeoffBacksplashEligibility(
    fourRunKitchen({
      r1: { backsplashEligible: true },
      r2: { backsplashEligible: false },
      r3: { backsplashEligible: true },
      r4: { backsplashEligible: false }
    })
  ).takeoff;
  for (const run of draft.rooms[0].areas[0].runs) {
    assert.equal(
      run.backsplashHeightIn,
      undefined,
      "9: no per-run height required"
    );
    assert.equal(typeof run.backsplashEligible, "boolean", "9: boolean eligibility");
  }
  const component = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.ok(!component.includes("ctr-backsplash-height"), "9: height input removed");
  assert.ok(component.includes("ctr-backsplash-eligible"), "9: eligibility control present");
  console.log("  ✓ 9. ordinary takeoff no longer requires height");
}

// ── 10. approval payload includes backsplashEligible per run ─────────────────
{
  const draft = normalizeTakeoffBacksplashEligibility(
    fourRunKitchen({
      r1: { backsplashEligible: true },
      r2: { backsplashEligible: false },
      r3: { backsplashEligible: true },
      r4: { backsplashEligible: false }
    })
  ).takeoff;
  draft.status = "approved";
  const payload = approvedPayload(draft);
  const pieces = payload.rooms[0].pieces;
  assert.equal(pieces.length, 4, "10: four pieces");
  const byName = Object.fromEntries(pieces.map((p) => [p.name, p.backsplashEligible]));
  assert.deepEqual(
    byName,
    {
      "Sink wall": true,
      "Stove wall": false,
      "Fridge wall": true,
      Island: false
    },
    "10: payload eligibility matches"
  );
  console.log("  ✓ 10. approval payload includes backsplashEligible per run");
}

// ── 11. room eligible length sums only eligible runs ─────────────────────────
{
  const draft = normalizeTakeoffBacksplashEligibility(
    fourRunKitchen({
      r1: { backsplashEligible: true },
      r2: { backsplashEligible: false },
      r3: { backsplashEligible: true },
      r4: { backsplashEligible: false }
    })
  ).takeoff;
  const sum = sumEligibleBacksplashLengthIn(draft.rooms[0]);
  assert.equal(sum.eligibleBacksplashLengthIn, 160, "11: 100+60 eligible length");
  assert.equal(sum.eligibleRunCount, 2, "11: two eligible runs");
  assert.equal(sum.excludedRunCount, 2, "11: two excluded counter runs");

  const payload = approvedPayload({ ...draft, status: "approved" });
  assert.equal(payload.rooms[0].eligibleBacksplashLengthIn, 160, "11: payload room length");
  const seeded = deriveRoomBacksplashFromImportRoom(payload.rooms[0]);
  assert.equal(seeded.backsplashMeasuredLengthIn, 160, "11: scope measured length");
  console.log("  ✓ 11. room eligible length sums only eligible runs");
}

// ── 12. island run is excluded ───────────────────────────────────────────────
{
  const draft = {
    schemaVersion: "1.0",
    status: "approved",
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        areas: [
          {
            id: "area-wall",
            label: "Perimeter",
            backsplashScope: "stone",
            runs: [
              {
                id: "wall-1",
                label: "Wall",
                lengthIn: 120,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: true
              }
            ]
          },
          {
            id: "area-island",
            label: "Island",
            backsplashScope: "stone",
            backsplashIncluded: false,
            runs: [
              {
                id: "island-1",
                label: "Island",
                lengthIn: 96,
                depthIn: 42,
                pieceType: "counter",
                backsplashEligible: false
              }
            ]
          }
        ]
      }
    ]
  };
  const sum = sumEligibleBacksplashLengthIn(draft.rooms[0]);
  assert.equal(sum.eligibleBacksplashLengthIn, 120, "12: island length excluded");
  const payload = approvedPayload(draft);
  const island = payload.rooms[0].pieces.find((p) => p.name === "Island");
  assert.equal(island.backsplashEligible, false, "12: island not eligible in payload");
  console.log("  ✓ 12. island run is excluded");
}

// ── 13. customer cannot alter eligible run length ────────────────────────────
{
  const room = {
    backsplashMeasuredLengthIn: 160,
    backsplashSf: 5,
    backsplashHeightMode: "standard",
    rawBacksplashSf: 4.44
  };
  const priced = resolveBilledSfForMode(room, "custom_height", {
    requestedHeightInches: 12,
    // Hostile / ignored: customer must not be able to change approved length.
    requestedLengthInches: 9999,
    backsplashMeasuredLengthIn: 9999
  });
  assert.equal(priced.source, "measured_length_recompute", "13: uses approved length");
  assert.ok(
    Math.abs(priced.rawSf - (160 * 12) / 144) < 0.001,
    "13: SF from estimator length × customer height only"
  );
  console.log("  ✓ 13. customer cannot alter eligible run length");
}

// ── 14. no duplicate row keys or shared state ────────────────────────────────
{
  // Reproduce the OLD shared-state bug shape: area-level height written for one
  // row used to change every sibling. With the new model, patching eligibility
  // on run-1 must not change run-2/3/4 even when legacy area height is present.
  let draft = normalizeTakeoffBacksplashEligibility(
    fourRunKitchen({
      legacyHeight: 4,
      r1: { backsplashEligible: false },
      r2: { backsplashEligible: false },
      r3: { backsplashEligible: false },
      r4: { backsplashEligible: false }
    })
  ).takeoff;
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-1" },
    { backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" }
  );
  const rows = flattenPieces(draft, new Set());
  const keys = rows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "14: unique row keys");
  assert.deepEqual(
    rows.map((r) => r.backsplashEligible),
    [true, false, false, false],
    "14: no shared eligibility state"
  );
  // Explicitly prove we do NOT write area.backsplashHeightIn from the control.
  const component = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.ok(
    !component.includes("backsplashHeightIn: h"),
    "14: area-level height write removed from UI"
  );
  console.log("  ✓ 14. no duplicate keys or shared eligibility state");
}

// ── 15. general row-identity helpers still isolate piece edits ───────────────
{
  let draft = ensureUniqueTakeoffIdentity(
    fourRunKitchen({
      r1: { backsplashEligible: true },
      r2: { backsplashEligible: false },
      r3: { backsplashEligible: true },
      r4: { backsplashEligible: false }
    })
  ).takeoff;
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-2" },
    { label: "Only piece 2", lengthIn: 81 }
  );
  const rows = flattenPieces(draft, new Set());
  assert.equal(rows.find((r) => r.runId === "run-2").pieceName, "Only piece 2");
  assert.equal(rows.find((r) => r.runId === "run-2").lengthIn, 81);
  assert.equal(rows.find((r) => r.runId === "run-1").pieceName, "Sink wall");
  assert.equal(rows.find((r) => r.runId === "run-1").lengthIn, 100);
  assert.equal(rows.find((r) => r.runId === "run-3").backsplashEligible, true);
  assert.equal(rows.find((r) => r.runId === "run-4").backsplashEligible, false);
  console.log("  ✓ 15. general row-identity isolation still holds");
}

// Wiring: resolve helper + extraction import + prompt field
{
  assert.equal(
    resolveRunBacksplashEligible({ backsplashEligible: true }, null).eligible,
    true
  );
  const extraction = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../backend-core/src/takeoff/takeoffExtractionService.mjs"
    ),
    "utf8"
  );
  assert.ok(extraction.includes("normalizeTakeoffBacksplashEligibility"));
  const prompt = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../backend-core/src/takeoff/takeoffExtractionPrompt.mjs"
    ),
    "utf8"
  );
  assert.ok(prompt.includes("backsplashEligible"));
  assert.ok(prompt.includes('PROMPT_VERSION = "v6.2"'));
  console.log("  ✓ wiring: extraction + prompt + resolve helper");
}

console.log("\ntakeoffBacksplashEligibility.test.mjs — passed\n");
