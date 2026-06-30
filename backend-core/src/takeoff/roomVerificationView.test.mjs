/**
 * Run: node backend-core/src/takeoff/roomVerificationView.test.mjs
 */
import assert from "node:assert/strict";

import { buildSpec73Fixture } from "./fixtures/spec73.fixture.mjs";
import { makeTakeoffArea, makeTakeoffRoom, makeTakeoffRun } from "./takeoffContract.mjs";
import {
  computeReviewedTakeoffMath,
  deriveRoomVerificationBlockers,
  canMarkRoomVerified,
  findUnresolvedScopeItems,
} from "./reviewedTakeoffMath.mjs";
import {
  buildRoomVerificationView,
  blockerPrimaryActionLabel,
  formatBlockerDisplayMessage,
} from "./roomVerificationView.mjs";

/** One-room kitchen with 3 countertop pieces, no backsplash. */
function makeSimpleKitchenDraft() {
  return {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Countertop",
            areaType: "countertop",
            backsplashScope: "no_stone",
            runs: [
              makeTakeoffRun({ label: "Left counter", lengthIn: 72, depthIn: 25.5, pieceType: "counter" }),
              makeTakeoffRun({ label: "Right counter", lengthIn: 60, depthIn: 25.5, pieceType: "counter" }),
              makeTakeoffRun({ label: "Island", lengthIn: 96, depthIn: 42, pieceType: "counter" }),
            ],
          }),
        ],
      }),
    ],
  };
}

// ── no_stone clears backsplash blocker ────────────────────────────────────────

function testNoStoneBacksplashClearsRoomBlocker() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Perimeter counters",
            areaType: "countertop",
            backsplashScope: "needs_review",
            backsplashLinearIn: 120,
            runs: [
              makeTakeoffRun({
                label: "Main run",
                lengthIn: 120,
                depthIn: 25.5,
                pieceType: "counter",
              }),
            ],
          }),
        ],
      }),
    ],
  };

  const beforeMath = computeReviewedTakeoffMath(draft, {});
  const beforeRoom = beforeMath.activeRooms[0];
  assert.ok(
    deriveRoomVerificationBlockers(beforeRoom).some((b) => b.code === "BACKSPLASH_SCOPE_UNRESOLVED"),
    "unresolved backsplash should block verification"
  );

  const resolvedDraft = {
    ...draft,
    rooms: [
      {
        ...draft.rooms[0],
        areas: [
          {
            ...draft.rooms[0].areas[0],
            backsplashScope: "no_stone",
            backsplashLinearIn: 0,
            backsplashManualSf: 0,
          },
        ],
      },
    ],
  };

  const afterMath = computeReviewedTakeoffMath(resolvedDraft, {});
  const afterRoom = afterMath.activeRooms[0];
  assert.equal(afterRoom.areas[0].notInScope, true);
  assert.equal(
    deriveRoomVerificationBlockers(afterRoom).some((b) => b.code === "BACKSPLASH_SCOPE_UNRESOLVED"),
    false
  );
  assert.equal(canMarkRoomVerified(afterRoom).ok, true);

  const scopeItems = findUnresolvedScopeItems(resolvedDraft, {});
  assert.equal(
    scopeItems.some((i) => i.code === "BACKSPLASH_SCOPE_UNRESOLVED"),
    false,
    "no_stone backsplash should remove Items to Review backsplash entry"
  );
}

// ── ROOM_INCOMPLETE must not block room verification ─────────────────────────

function testRoomIncompleteBlockerNeverBlocksVerification() {
  const draft = makeSimpleKitchenDraft();
  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];

  // Simulate what the approval gate emits when the room is not yet marked complete.
  const approvalBlockers = [
    {
      code: "ROOM_INCOMPLETE",
      message: `Room "Kitchen" is not marked complete.`,
      path: `rooms.${draft.rooms[0].id}`,
    },
  ];

  const view = buildRoomVerificationView(room, { approvalBlockers });
  assert.equal(view.canVerify, true, "ROOM_INCOMPLETE must not block verification");
  assert.equal(view.roomBlockerCount, 0);
  // ROOM_INCOMPLETE should not appear in roomBlockers or roomApprovalBlockers
  const allDisplayed = [...view.roomBlockers, ...view.roomApprovalBlockers];
  assert.equal(
    allDisplayed.some((b) => b.code === "ROOM_INCOMPLETE"),
    false,
    "ROOM_INCOMPLETE must not appear in room verification display"
  );
}

// ── UNSAVED_EDITS must not block room verification ────────────────────────────

function testUnsavedEditsDoesNotBlockVerification() {
  const draft = makeSimpleKitchenDraft();
  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];

  const approvalBlockers = [
    { code: "UNSAVED_EDITS", message: "Save your measurement edits — computed totals are stale.", path: null },
  ];

  const view = buildRoomVerificationView(room, { approvalBlockers });
  assert.equal(view.canVerify, true, "UNSAVED_EDITS must not block verification");
  assert.equal(view.roomBlockerCount, 0);
  // Should not appear in room-level display
  const roomDisplay = [...view.roomBlockers, ...view.roomApprovalBlockers];
  assert.equal(roomDisplay.some((b) => b.code === "UNSAVED_EDITS"), false);
}

// ── canVerify is based only on room blockers ──────────────────────────────────

function testCanVerifyIgnoresApprovalGateWorkflowBlockers() {
  const draft = makeSimpleKitchenDraft();
  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];

  // Multiple workflow-level approval gate blockers
  const approvalBlockers = [
    { code: "ROOM_INCOMPLETE", message: `Room "Kitchen" is not marked complete.`, path: `rooms.${draft.rooms[0].id}` },
    { code: "UNSAVED_EDITS", message: "Save your measurement edits — computed totals are stale.", path: null },
    { code: "EVIDENCE_RECONCILIATION", message: "2 evidence/run reconciliation issue(s) remain.", path: null },
  ];

  const view = buildRoomVerificationView(room, { approvalBlockers });
  assert.equal(view.canVerify, true);
  assert.equal(view.roomBlockerCount, 0);
}

// ── Exact blocker count matches displayed count ──────────────────────────────

function testExactBlockerCountMatchesDisplay() {
  const draft = {
    ...buildSpec73Fixture(),
    rooms: [
      makeTakeoffRoom({
        name: "Kitchen",
        areas: [
          makeTakeoffArea({
            label: "Countertop",
            runs: [
              makeTakeoffRun({
                label: "Bad run",
                lengthIn: 0,
                depthIn: 0,
                pieceType: "counter",
              }),
            ],
          }),
        ],
      }),
    ],
  };
  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];
  const view = buildRoomVerificationView(room, {
    approvalBlockers: [
      {
        code: "EVIDENCE_RECONCILIATION",
        message: "2 evidence/run reconciliation issue(s) remain.",
        path: null,
      },
    ],
  });
  assert.equal(view.roomBlockerCount, view.roomBlockers.length);
  assert.equal(view.roomBlockerCount, 1, "only the MISSING_RUN_DIMENSIONS blocker");
  assert.equal(view.globalBlockerCount, 1, "EVIDENCE_RECONCILIATION is global");
  assert.equal(view.canVerify, false, "room has a real room blocker");
}

// ── Blocker action labels ──────────────────────────────────────────────────

function testBlockerPrimaryActionLabels() {
  assert.equal(blockerPrimaryActionLabel({ code: "BACKSPLASH_SCOPE_UNRESOLVED" }), "Confirm backsplash scope");
  assert.equal(blockerPrimaryActionLabel({ code: "MISSING_RUN_DIMENSIONS" }), "Review missing dimensions");
  assert.equal(blockerPrimaryActionLabel({ code: "EMPTY_AREA" }), "Review missing scope");
  assert.equal(blockerPrimaryActionLabel({ code: "UNKNOWN_ROOM" }), "Assign room name");
  assert.equal(
    formatBlockerDisplayMessage({ message: "Save before approve." }, { scope: "global" }),
    "Global review item: Save before approve."
  );
  // Does not double-prefix
  assert.equal(
    formatBlockerDisplayMessage({ message: "Global review item: Already prefixed." }, { scope: "global" }),
    "Global review item: Already prefixed."
  );
}

// ── Simple kitchen golden path: no blockers, canVerify true ──────────────────

function testSimpleKitchenCanVerifyWithNoBlockers() {
  const draft = makeSimpleKitchenDraft();
  const math = computeReviewedTakeoffMath(draft, {});
  const room = math.activeRooms[0];

  assert.equal(room.roomName, "Kitchen");
  assert.equal(deriveRoomVerificationBlockers(room).length, 0);
  assert.equal(canMarkRoomVerified(room).ok, true);

  const view = buildRoomVerificationView(room, { approvalBlockers: [] });
  assert.equal(view.canVerify, true);
  assert.equal(view.roomBlockerCount, 0);
  assert.equal(view.roomBlockers.length, 0);
  assert.equal(view.globalBlockers.length, 0);
}

const tests = [
  testNoStoneBacksplashClearsRoomBlocker,
  testRoomIncompleteBlockerNeverBlocksVerification,
  testUnsavedEditsDoesNotBlockVerification,
  testCanVerifyIgnoresApprovalGateWorkflowBlockers,
  testExactBlockerCountMatchesDisplay,
  testBlockerPrimaryActionLabels,
  testSimpleKitchenCanVerifyWithNoBlockers,
];

let passed = 0;
for (const t of tests) {
  t();
  passed++;
}
console.log(`roomVerificationView.test.mjs: ${passed}/${tests.length} passed`);
