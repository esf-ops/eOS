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
  computeTotalsExcludingRuns,
  filterExcludedRunsFromDraft,
  isRunIncludedInTakeoff,
  patchAreaLabel,
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

const tests = [
  ["W1 patch room name persists", testPatchRoomNamePersists],
  ["W2 patch area label persists", testPatchAreaLabelPersists],
  ["W3 added run recomputes totals", testAddedRunRecomputesTotals],
  ["W4 excluded run does not count", testExcludedRunDoesNotCount],
  ["W5 include/exclude stable", testIncludeExcludeStable],
  ["W6 manual run preset mapping", testManualRunUsesPresetNotProjectName],
  ["W7 add run creates area", testAddManualRunCreatesAreaWhenMissing],
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
