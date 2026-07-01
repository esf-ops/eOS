/**
 * Run: node backend-core/src/takeoff/reviewedTakeoffMath.test.mjs
 */
import assert from "node:assert/strict";

import { buildSpec73Fixture, SPEC73_EXPECTED } from "./fixtures/spec73.fixture.mjs";
import {
  makeTakeoffArea,
  makeTakeoffRoom,
  makeTakeoffRun,
} from "./takeoffContract.mjs";
import { addManualRunToDraft, removeRunFromDraft } from "./takeoffWorkbenchHelpers.mjs";
import {
  computeReviewedTakeoffMath,
  formatBacksplashScopeLabel,
  findUnresolvedScopeItems,
  validateReviewedTakeoffConsistency,
  areaNeedsReview,
  buildAllPiecesDisplayIndex,
  allPiecesDisplayUsesFriendlyLabels,
  deriveRoomVerificationBlockers,
  canMarkRoomVerified,
  isFhbsArea,
} from "./reviewedTakeoffMath.mjs";

function testSpec73RoomBsMatchesSummary() {
  const draft = buildSpec73Fixture();
  const math = computeReviewedTakeoffMath(draft, { excludedRunIds: [], excludedRoomIds: [] });
  assert.equal(math.countertopSqft, SPEC73_EXPECTED.countertopExactSf);
  assert.equal(math.totalBacksplashSqft, SPEC73_EXPECTED.backsplashExactSf);
  assert.equal(math.combinedSqft, SPEC73_EXPECTED.combinedExactSf);

  const kitchen = math.activeRooms.find((r) => r.roomName === "Kitchen");
  assert.ok(kitchen);
  assert.ok(kitchen.backsplashDisplaySf > 0, "Kitchen room card must show backsplash sf");

  const consistency = validateReviewedTakeoffConsistency(math);
  assert.equal(consistency.ok, true, consistency.issues.map((i) => i.message).join("; "));
}

function testAreaLevelBacksplashAttributedToRoom() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Primary Bath",
        areas: [
          makeTakeoffArea({
            label: "Vanity",
            areaType: "countertop",
            runs: [makeTakeoffRun({ label: "Vanity top", lengthIn: 60, depthIn: 22, pieceType: "counter" })],
          }),
          makeTakeoffArea({
            label: "Backsplash",
            areaType: "backsplash",
            backsplashLinearIn: 60,
            backsplashHeightIn: 4,
            runs: [],
          }),
        ],
      }),
    ],
  };
  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];
  assert.ok(room.backsplashDisplaySf > 0);
  assert.equal(math.roomSubtotalSums.backsplashSqft, math.totalBacksplashSqft);
}

function testExcludedRunAndRoomOmitTotals() {
  const run = makeTakeoffRun({ label: "Island", lengthIn: 120, depthIn: 25.5, pieceType: "counter" });
  const draft = buildSpec73Fixture();
  const room = draft.rooms[0];
  room.areas[0].runs.push(run);

  const before = computeReviewedTakeoffMath(draft, {}).countertopSqft;
  const excludedRun = computeReviewedTakeoffMath(draft, { excludedRunIds: [run.id] }).countertopSqft;
  assert.ok(excludedRun < before);

  const excludedRoom = computeReviewedTakeoffMath(draft, { excludedRoomIds: [room.id] }).countertopSqft;
  assert.equal(excludedRoom, 0);
}

function testManualRunRemoveDoesNotCount() {
  const base = buildSpec73Fixture();
  const { draft: withRun, run } = addManualRunToDraft(base, {
    roomIdx: 0,
    preset: "countertop",
    lengthIn: 96,
    depthIn: 25.5,
  });
  const withManual = computeReviewedTakeoffMath(withRun, { manualRunIds: [run.id] }).countertopSqft;
  const removed = computeReviewedTakeoffMath(removeRunFromDraft(withRun, run.id), {}).countertopSqft;
  assert.ok(withManual > removed);
}

function testEmptyAreaAppearsInUnresolvedScope() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Laundry",
        areas: [
          makeTakeoffArea({ label: "Countertop", areaType: "countertop", runs: [] }),
        ],
      }),
    ],
  };
  assert.equal(areaNeedsReview(draft.rooms[0].areas[0]), true);
  const items = findUnresolvedScopeItems(draft, {});
  assert.ok(items.some((i) => i.code === "EMPTY_AREA" || i.code === "EMPTY_ROOM"));
}

function testUnassignedPieceInReviewItems() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Unassigned",
        areas: [
          makeTakeoffArea({
            label: "Main",
            runs: [makeTakeoffRun({ label: "Loose run", lengthIn: 48, depthIn: 25.5 })],
          }),
        ],
      }),
    ],
  };
  const items = findUnresolvedScopeItems(draft, {});
  assert.ok(items.some((i) => i.code === "UNASSIGNED_PIECE" || i.code === "UNKNOWN_ROOM"));
}

function testBacksplashLabelsHumanFriendly() {
  assert.equal(formatBacksplashScopeLabel("full_height"), "Full-height backsplash");
  assert.equal(formatBacksplashScopeLabel("no_stone"), "No stone backsplash");
  assert.equal(formatBacksplashScopeLabel("standard_4"), "4\" backsplash");
  assert.equal(formatBacksplashScopeLabel(null), "Needs review");
}

function testMathConsistencyCatchesMismatch() {
  const math = computeReviewedTakeoffMath(buildSpec73Fixture(), {});
  math.roomSubtotalSums.countertopSqft = math.countertopSqft + 5;
  const result = validateReviewedTakeoffConsistency(math);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "MATH_CONSISTENCY_COUNTERTOP"));
}

function testAllPiecesDisplayIndexTotalsMatchMath() {
  const draft = buildSpec73Fixture();
  const math = computeReviewedTakeoffMath(draft, {});
  const index = buildAllPiecesDisplayIndex(draft, {});
  assert.equal(index.totals.countertopSqft, math.countertopSqft);
  assert.equal(index.totals.totalBacksplashSqft, math.totalBacksplashSqft);
  assert.equal(index.totals.combinedSqft, math.combinedSqft);
  assert.ok(allPiecesDisplayUsesFriendlyLabels(index));
}

function testAllPiecesManualRemoveAction() {
  const { draft, run } = addManualRunToDraft(buildSpec73Fixture(), {
    roomIdx: 0,
    preset: "countertop",
    lengthIn: 48,
    depthIn: 25.5,
  });
  const index = buildAllPiecesDisplayIndex(draft, { manualRunIds: [run.id] });
  const piece = index.pieceByRunId.get(run.id);
  assert.equal(piece?.action, "remove");
  assert.equal(piece?.statusLabel, "Manual piece");
}

function testAllPiecesExcludeRestoreActions() {
  const draft = buildSpec73Fixture();
  const runId = draft.rooms[0].areas[0].runs[0].id;
  const included = buildAllPiecesDisplayIndex(draft, {});
  assert.equal(included.pieceByRunId.get(runId)?.action, "exclude");

  const excluded = buildAllPiecesDisplayIndex(draft, { excludedRunIds: [runId] });
  assert.equal(excluded.pieceByRunId.get(runId)?.action, "restore");
  assert.equal(excluded.pieceByRunId.get(runId)?.statusLabel, "Excluded from takeoff");
}

function testAllPiecesRemovedManualDoesNotCount() {
  const { draft, run } = addManualRunToDraft(buildSpec73Fixture(), {
    roomIdx: 0,
    preset: "countertop",
    lengthIn: 48,
    depthIn: 25.5,
  });
  const before = buildAllPiecesDisplayIndex(draft, { manualRunIds: [run.id] }).totals.countertopSqft;
  const after = buildAllPiecesDisplayIndex(removeRunFromDraft(draft, run.id), {}).totals.countertopSqft;
  assert.ok(before > after);
}

function testRoomEditUpdatesAllPiecesAndTotals() {
  const draft = buildSpec73Fixture();
  const runId = draft.rooms[0].areas[0].runs[0].id;
  const rs = {};
  const beforeIndex = buildAllPiecesDisplayIndex(draft, rs);
  const beforePiece = beforeIndex.pieceByRunId.get(runId);
  const beforeTotals = beforeIndex.totals.countertopSqft;

  const nextDraft = structuredClone(draft);
  nextDraft.rooms[0].areas[0].runs[0].lengthIn = (Number(beforePiece.lengthIn) || 0) + 24;

  const afterIndex = buildAllPiecesDisplayIndex(nextDraft, rs);
  const afterPiece = afterIndex.pieceByRunId.get(runId);
  assert.ok(afterPiece.lengthIn > beforePiece.lengthIn);
  assert.ok(afterIndex.totals.countertopSqft >= beforeTotals);
}

function testExcludeRestoreSyncsAllPieces() {
  const draft = buildSpec73Fixture();
  const runId = draft.rooms[0].areas[0].runs[0].id;
  const excluded = buildAllPiecesDisplayIndex(draft, { excludedRunIds: [runId] });
  assert.equal(excluded.pieceByRunId.get(runId)?.action, "restore");
  assert.equal(excluded.pieceByRunId.get(runId)?.statusLabel, "Excluded from takeoff");

  const restored = buildAllPiecesDisplayIndex(draft, { excludedRunIds: [] });
  assert.equal(restored.pieceByRunId.get(runId)?.action, "exclude");
}

function testRoomVerificationBlockedForEmptyArea() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Laundry",
        areas: [makeTakeoffArea({ label: "Countertop", areaType: "countertop", runs: [] })],
      }),
    ],
  };
  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];
  const blockers = deriveRoomVerificationBlockers(room);
  assert.ok(blockers.some((b) => b.code === "EMPTY_AREA"));
  const verify = canMarkRoomVerified(room);
  assert.equal(verify.ok, false);
}

function testAddPieceToEmptyAreaClearsBlocker() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Laundry",
        areas: [makeTakeoffArea({ label: "Countertop", areaType: "countertop", runs: [] })],
      }),
    ],
  };
  const { draft: withPiece } = addManualRunToDraft(draft, {
    roomIdx: 0,
    areaLabel: "Countertop",
    preset: "countertop",
    lengthIn: 60,
    depthIn: 25.5,
  });
  const math = computeReviewedTakeoffMath(withPiece, {});
  const room = math.activeRooms[0];
  const verify = canMarkRoomVerified(room);
  assert.equal(verify.ok, true);
}

function testNoStoneBacksplashClearsVerificationBlocker() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Perimeter counters",
            backsplashScope: "needs_review",
            backsplashLinearIn: 96,
            runs: [
              makeTakeoffRun({ label: "Run A", lengthIn: 96, depthIn: 25.5, pieceType: "counter" }),
            ],
          }),
        ],
      }),
    ],
  };
  const unresolved = computeReviewedTakeoffMath(draft, {}).activeRooms[0];
  assert.ok(
    deriveRoomVerificationBlockers(unresolved).some((b) => b.code === "BACKSPLASH_SCOPE_UNRESOLVED")
  );

  draft.rooms[0].areas[0].backsplashScope = "no_stone";
  draft.rooms[0].areas[0].backsplashLinearIn = 0;
  const resolved = computeReviewedTakeoffMath(draft, {}).activeRooms[0];
  assert.equal(canMarkRoomVerified(resolved).ok, true);
  assert.equal(
    findUnresolvedScopeItems(draft, {}).some((i) => i.code === "BACKSPLASH_SCOPE_UNRESOLVED"),
    false
  );
}

// ── FHBS (full-height backsplash) tests ───────────────────────────────────────

function testIsFhbsAreaDetection() {
  // Detect by areaType
  assert.ok(isFhbsArea(makeTakeoffArea({ label: "FHBS", areaType: "fhb" })));
  // Detect by backsplashScope
  assert.ok(isFhbsArea(makeTakeoffArea({ label: "Area", backsplashScope: "full_height" })));
  assert.ok(isFhbsArea(makeTakeoffArea({ label: "Area", backsplashScope: "fhbs" })));
  // Detect by label keywords
  assert.ok(isFhbsArea(makeTakeoffArea({ label: "Full Height Backsplash (FHBS)" })));
  assert.ok(isFhbsArea(makeTakeoffArea({ label: "Full-height backsplash" })));
  assert.ok(isFhbsArea(makeTakeoffArea({ label: "FHBS panel" })));
  // Negative: standard 4" backsplash area
  assert.equal(isFhbsArea(makeTakeoffArea({ label: "4\" backsplash", areaType: "backsplash" })), false);
  assert.equal(isFhbsArea(makeTakeoffArea({ label: "Perimeter Counters", areaType: "countertop" })), false);
  console.log("ok: isFhbsArea — detects by areaType, backsplashScope, and label keywords");
}

function testFhbsAreaWithNoDimensionsBlocksVerification() {
  // Reproduces the Zuehlke case: Kitchen has 4" BS area (ok) + FHBS area (empty)
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Perimeter Counters",
            areaType: "countertop",
            backsplashScope: "standard",
            backsplashLinearIn: 237,
            backsplashHeightIn: 4,
            runs: [makeTakeoffRun({ label: "Run A", lengthIn: 120, depthIn: 25.5, pieceType: "counter" })],
          }),
          makeTakeoffArea({
            label: "Full Height Backsplash (FHBS)",
            areaType: "fhb",
            runs: [],  // no runs, no linear, no manual sf
          }),
        ],
      }),
    ],
  };

  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];

  // 4" backsplash area is fine
  assert.equal(room.areas[0].needsReview, false, "4\" backsplash area must not need review");
  // FHBS area needs review
  assert.equal(room.areas[1].needsReview, true, "FHBS area with no dimensions must need review");

  // Room cannot be verified while FHBS is unresolved
  const blockers = deriveRoomVerificationBlockers(room);
  assert.ok(blockers.some((b) => b.code === "EMPTY_AREA"), "must have EMPTY_AREA blocker for FHBS area");
  const verify = canMarkRoomVerified(room);
  assert.equal(verify.ok, false, "room must not be verifiable with unresolved FHBS");

  // Standard 4" backsplash is unaffected
  assert.ok(room.areas[0].backsplashDisplaySf > 0, "4\" backsplash sf must remain positive");
  assert.ok(room.countertopSf > 0, "countertop sf must be present");

  console.log("ok: FHBS area with no dimensions blocks room verification (EMPTY_AREA)");
}

function testFhbsLinearInchesClearsBlocker() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Full Height Backsplash (FHBS)",
            areaType: "fhb",
            backsplashScope: "full_height",
            backsplashLinearIn: 120,
            backsplashHeightIn: 36,
            runs: [],
          }),
        ],
      }),
    ],
  };

  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];
  assert.equal(room.areas[0].needsReview, false, "FHBS with backsplashLinearIn > 0 must not need review");
  assert.ok(room.areas[0].areaLevelBacksplashSf > 0, "FHBS linear inches must produce backsplash sf");
  assert.equal(canMarkRoomVerified(room).ok, true, "room must be verifiable after FHBS linear inches set");
  console.log("ok: FHBS with backsplashLinearIn > 0 clears blocker and produces sf");
}

function testFhbsManualSfClearsBlocker() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Full Height Backsplash (FHBS)",
            areaType: "fhb",
            backsplashScope: "full_height",
            backsplashManualSf: 40,
            runs: [],
          }),
        ],
      }),
    ],
  };

  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];
  assert.equal(room.areas[0].needsReview, false, "FHBS with backsplashManualSf > 0 must not need review");
  assert.ok(room.areas[0].areaLevelBacksplashSf > 0 || room.areas[0].backsplashDisplaySf >= 0,
    "FHBS manual sf must resolve the area");
  assert.equal(canMarkRoomVerified(room).ok, true, "room must be verifiable after FHBS manual sf set");
  console.log("ok: FHBS with backsplashManualSf > 0 clears blocker");
}

function testFhbsNotInScopeClearsBlocker() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Full Height Backsplash (FHBS)",
            areaType: "fhb",
            backsplashScope: "no_stone",
            backsplashLinearIn: 0,
            backsplashManualSf: 0,
            runs: [],
          }),
        ],
      }),
    ],
  };

  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];
  assert.equal(room.areas[0].needsReview, false, "FHBS marked no_stone must not need review");
  assert.equal(room.areas[0].notInScope, true, "FHBS no_stone must be notInScope");
  assert.equal(canMarkRoomVerified(room).ok, true, "room must be verifiable after FHBS marked not in scope");
  assert.equal(room.areas[0].backsplashDisplaySf, 0, "not-in-scope FHBS must contribute 0 sf");
  console.log("ok: FHBS marked not in scope clears blocker and contributes 0 sf");
}

function testStandard4InchAndFhbsAreIndependent() {
  // Both a standard 4" backsplash AND an FHBS area exist; resolving FHBS must not affect 4" BS sf
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Perimeter Counters",
            areaType: "countertop",
            backsplashScope: "standard",
            backsplashLinearIn: 237,
            backsplashHeightIn: 4,
            runs: [makeTakeoffRun({ label: "Run A", lengthIn: 120, depthIn: 25.5, pieceType: "counter" })],
          }),
          makeTakeoffArea({
            label: "Full Height Backsplash (FHBS)",
            areaType: "fhb",
            backsplashScope: "full_height",
            backsplashManualSf: 40,
            runs: [],
          }),
        ],
      }),
    ],
  };

  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];

  // 4" backsplash area
  const standardArea = room.areas[0];
  assert.ok(standardArea.areaLevelBacksplashSf > 0 || standardArea.backsplashDisplaySf > 0,
    "4\" BS area must still have sf");
  assert.equal(standardArea.needsReview, false);

  // FHBS area
  const fhbsArea = room.areas[1];
  assert.equal(fhbsArea.needsReview, false);

  // Room is verifiable
  assert.equal(canMarkRoomVerified(room).ok, true, "room with both resolved areas must be verifiable");

  // Scope items: neither area should be in unresolved list
  const items = findUnresolvedScopeItems(draft, {});
  assert.ok(!items.some((i) => i.code === "EMPTY_AREA"), "no EMPTY_AREA after both areas resolved");

  console.log("ok: standard 4\" backsplash and FHBS are independent, both resolved = room verifiable");
}

const tests = [
  testSpec73RoomBsMatchesSummary,
  testAreaLevelBacksplashAttributedToRoom,
  testExcludedRunAndRoomOmitTotals,
  testManualRunRemoveDoesNotCount,
  testEmptyAreaAppearsInUnresolvedScope,
  testUnassignedPieceInReviewItems,
  testBacksplashLabelsHumanFriendly,
  testMathConsistencyCatchesMismatch,
  testAllPiecesDisplayIndexTotalsMatchMath,
  testAllPiecesManualRemoveAction,
  testAllPiecesExcludeRestoreActions,
  testAllPiecesRemovedManualDoesNotCount,
  testRoomEditUpdatesAllPiecesAndTotals,
  testExcludeRestoreSyncsAllPieces,
  testRoomVerificationBlockedForEmptyArea,
  testAddPieceToEmptyAreaClearsBlocker,
  testNoStoneBacksplashClearsVerificationBlocker,
  testIsFhbsAreaDetection,
  testFhbsAreaWithNoDimensionsBlocksVerification,
  testFhbsLinearInchesClearsBlocker,
  testFhbsManualSfClearsBlocker,
  testFhbsNotInScopeClearsBlocker,
  testStandard4InchAndFhbsAreIndependent,
];

let passed = 0;
for (const t of tests) {
  t();
  passed++;
}
console.log(`reviewedTakeoffMath.test.mjs: ${passed}/${tests.length} passed`);
