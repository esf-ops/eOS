/**
 * Run: node backend-core/src/takeoff/takeoffWorkbenchHelpers.test.mjs
 */
import assert from "node:assert/strict";

import { buildSpec73Fixture } from "./fixtures/spec73.fixture.mjs";
import { makeTakeoffRoom, makeTakeoffArea, makeTakeoffRun } from "./takeoffContract.mjs";
import {
  ADD_PIECE_PRESETS,
  addManualRunToDraft,
  buildManualRunFromInput,
  computeRoomSubtotals,
  computeTotalsExcludingRuns,
  computeTotalsWithReviewState,
  deriveRoomVerificationStatus,
  filterExcludedRunsFromDraft,
  filterReviewStateFromDraft,
  isRoomIncludedInTakeoff,
  isRunIncludedInTakeoff,
  moveRunToRoom,
  removeRunFromDraft,
  patchAreaLabel,
  patchRoomFields,
  patchRoomName,
} from "./takeoffWorkbenchHelpers.mjs";

function testPatchRoomNamePersists() {
  const draft = buildSpec73Fixture();
  const before = draft.rooms[0]?.name;
  const next = patchRoomName(draft, 0, "Powder Bath");
  assert.notEqual(next.rooms[0].name, before);
  assert.equal(next.rooms[0].name, "Powder Bath");
  assert.equal(draft.rooms[0].name, before);
}

function testPatchAreaLabelPersists() {
  const draft = buildSpec73Fixture();
  const areaLabel = draft.rooms[0].areas[0].label;
  const next = patchAreaLabel(draft, 0, 0, "Hall Bath");
  assert.equal(next.rooms[0].areas[0].label, "Hall Bath");
  assert.equal(draft.rooms[0].areas[0].label, areaLabel);
}

function testAddedRunRecomputesTotals() {
  const base = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [makeTakeoffArea({ label: "Countertop", areaType: "countertop", runs: [] })],
      }),
    ],
  };
  const before = computeTotalsExcludingRuns(base, new Set()).countertopExactSf;
  const { draft: after } = addManualRunToDraft(base, {
    roomIdx: 0,
    areaLabel: "Countertop",
    preset: "countertop",
    pieceLabel: "Snack bar",
    lengthIn: 96,
    depthIn: 25.5,
  });
  const afterSf = computeTotalsExcludingRuns(after, new Set()).countertopExactSf;
  assert.ok(afterSf > before);
}

function testExcludedRunDoesNotCount() {
  const run = makeTakeoffRun({ label: "Island", lengthIn: 120, depthIn: 25.5, pieceType: "counter" });
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Island",
            areaType: "island",
            runs: [run],
          }),
        ],
      }),
    ],
  };
  const included = computeTotalsExcludingRuns(draft, new Set()).countertopExactSf;
  const excluded = computeTotalsExcludingRuns(draft, new Set([run.id])).countertopExactSf;
  assert.ok(included > excluded);
  assert.equal(filterExcludedRunsFromDraft(draft, new Set([run.id])).rooms[0].areas[0].runs.length, 0);
}

function testIncludeExcludeStable() {
  const id = "run-1";
  const excluded = new Set([id]);
  assert.equal(isRunIncludedInTakeoff(id, excluded), false);
  assert.equal(isRunIncludedInTakeoff("run-2", excluded), true);
}

function testManualRunUsesPresetNotProjectName() {
  const run = buildManualRunFromInput({
    preset: "island",
    pieceLabel: "Island",
    lengthIn: 84,
    depthIn: 25.5,
  });
  assert.equal(run.pieceType, "counter");
  assert.equal(run.label, "Island");
  assert.equal(ADD_PIECE_PRESETS.island.areaType, "island");
}

function testAddManualRunCreatesAreaWhenMissing() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [makeTakeoffRoom({ name: "Bath", areas: [] })],
  };
  const { draft: next, run } = addManualRunToDraft(draft, {
    roomIdx: 0,
    areaLabel: "Vanity",
    preset: "vanity",
    lengthIn: 60,
    depthIn: 22,
  });
  assert.equal(next.rooms[0].areas.length, 1);
  assert.equal(next.rooms[0].areas[0].label, "Vanity");
  assert.equal(next.rooms[0].areas[0].runs.length, 1);
  assert.equal(next.rooms[0].areas[0].runs[0].id, run.id);
}

function testExcludedRoomDoesNotCount() {
  const run = makeTakeoffRun({ label: "Island", lengthIn: 120, depthIn: 25.5, pieceType: "counter" });
  const room = makeTakeoffRoom({
    id: "room-kitchen",
    name: "Kitchen",
    areas: [makeTakeoffArea({ label: "Island", areaType: "island", runs: [run] })],
  });
  const draft = { ...buildSpec73Fixture(), rooms: [room] };
  const included = computeTotalsWithReviewState(draft, { excludedRoomIds: new Set() }).countertopExactSf;
  const excluded = computeTotalsWithReviewState(draft, { excludedRoomIds: new Set(["room-kitchen"]) }).countertopExactSf;
  assert.ok(included > excluded);
  assert.equal(filterReviewStateFromDraft(draft, { excludedRoomIds: new Set(["room-kitchen"]) }).rooms.length, 0);
}

function testMoveRunToAnotherRoom() {
  const run = makeTakeoffRun({ id: "run-move", label: "Vanity", lengthIn: 60, depthIn: 22 });
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({ id: "r1", name: "Kitchen", areas: [makeTakeoffArea({ label: "Main", runs: [run] })] }),
      makeTakeoffRoom({ id: "r2", name: "Bath", areas: [makeTakeoffArea({ label: "Vanity", runs: [] })] }),
    ],
  };
  const next = moveRunToRoom(draft, "run-move", 1);
  assert.equal(next.rooms[0].areas[0].runs.length, 0);
  assert.equal(next.rooms[1].areas[0].runs.length, 1);
  assert.equal(next.rooms[1].areas[0].runs[0].id, "run-move");
}

function testPatchRoomTypePersists() {
  const draft = buildSpec73Fixture();
  const next = patchRoomFields(draft, 0, { roomType: "Bathroom" });
  assert.equal(next.rooms[0].roomType, "Bathroom");
}

function testRoomVerificationStatus() {
  const room = makeTakeoffRoom({ id: "r1", name: "Kitchen" });
  assert.equal(deriveRoomVerificationStatus(room, { excludedRoomIds: new Set(["r1"]) }), "excluded");
  assert.equal(deriveRoomVerificationStatus(room, { roomCompleteness: { r1: true } }), "verified");
  assert.equal(
    deriveRoomVerificationStatus(room, { hasRoomBlockers: true }),
    "needs_review"
  );
  assert.equal(
    deriveRoomVerificationStatus(room, { hasRoomBlockers: false }),
    "ready_to_verify"
  );
}

function testIsRoomIncludedInTakeoff() {
  assert.equal(isRoomIncludedInTakeoff("r1", new Set(["r1"])), false);
  assert.equal(isRoomIncludedInTakeoff("r2", new Set(["r1"])), true);
}

function testComputeRoomSubtotalsIncludesAreaBacksplash() {
  const draft = buildSpec73Fixture();
  const room = draft.rooms[0];
  const sub = computeRoomSubtotals(room, new Set());
  assert.ok(sub.backsplashDisplaySf > 0, "room subtotals must include area-level backsplash");
  assert.ok(sub.backsplashDisplaySf >= sub.backsplashSf);
}

function testRemoveRunFromDraft() {
  const { draft, run } = addManualRunToDraft(buildSpec73Fixture(), {
    roomIdx: 0,
    preset: "countertop",
    lengthIn: 48,
    depthIn: 25.5,
  });
  const next = removeRunFromDraft(draft, run.id);
  const found = next.rooms.some((r) => r.areas.some((a) => a.runs.some((rn) => rn.id === run.id)));
  assert.equal(found, false);
}

const tests = [
  ["W1 patch room name persists", testPatchRoomNamePersists],
  ["W2 patch area label persists", testPatchAreaLabelPersists],
  ["W3 added run recomputes totals", testAddedRunRecomputesTotals],
  ["W4 excluded run does not count", testExcludedRunDoesNotCount],
  ["W5 include/exclude stable", testIncludeExcludeStable],
  ["W6 manual run preset mapping", testManualRunUsesPresetNotProjectName],
  ["W7 add run creates area", testAddManualRunCreatesAreaWhenMissing],
  ["W8 excluded room does not count", testExcludedRoomDoesNotCount],
  ["W9 move run to another room", testMoveRunToAnotherRoom],
  ["W10 patch room type persists", testPatchRoomTypePersists],
  ["W11 room verification status", testRoomVerificationStatus],
  ["W12 is room included", testIsRoomIncludedInTakeoff],
  ["W13 room subtotals include area backsplash", testComputeRoomSubtotalsIncludesAreaBacksplash],
  ["W14 remove run from draft", testRemoveRunFromDraft],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}:`, e.message);
  }
}

if (failed) process.exit(1);
console.log(`takeoffWorkbenchHelpers: all ${tests.length} tests passed`);
