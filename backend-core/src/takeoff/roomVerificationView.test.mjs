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
  assert.equal(view.roomBlockerCount, 1);
  assert.equal(view.globalBlockerCount, 1);
  assert.equal(view.displayBlockers.length, 2);
}

function testBlockerPrimaryActionLabels() {
  assert.equal(blockerPrimaryActionLabel({ code: "BACKSPLASH_SCOPE_UNRESOLVED" }), "Confirm backsplash scope");
  assert.equal(blockerPrimaryActionLabel({ code: "MISSING_RUN_DIMENSIONS" }), "Review missing dimensions");
  assert.equal(
    formatBlockerDisplayMessage({ message: "Save before approve." }, { scope: "global" }),
    "Global review item: Save before approve."
  );
}

const tests = [
  testNoStoneBacksplashClearsRoomBlocker,
  testExactBlockerCountMatchesDisplay,
  testBlockerPrimaryActionLabels,
];

let passed = 0;
for (const t of tests) {
  t();
  passed++;
}
console.log(`roomVerificationView.test.mjs: ${passed}/${tests.length} passed`);
