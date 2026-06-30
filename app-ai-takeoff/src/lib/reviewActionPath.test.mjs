import assert from "node:assert/strict";
import { deriveReviewActionPath } from "./reviewActionPath.mjs";

const rooms = [
  { roomId: "r1", roomName: "Kitchen", roomIdx: 0 },
  { roomId: "r2", roomName: "Primary Bath", roomIdx: 1 },
];

{
  const path = deriveReviewActionPath({
    workflowStatus: "needs_review",
    showApprovedInUi: false,
    approvalStale: false,
    canApprove: false,
    canImport: false,
    savedAt: null,
    hasSaveableChanges: false,
    saveStatus: "idle",
    approveStatus: "idle",
    importStatus: "idle",
    activeRooms: rooms,
    roomCompleteness: { r1: false, r2: false },
    excludedRoomIds: new Set(),
    selectedRoomId: "r1",
    selectedRoomVerify: {
      ok: false,
      roomBlockers: [{ code: "MISSING_RUN_DIMENSIONS", message: "Fix depth" }],
      globalBlockers: [],
    },
  });
  assert.equal(path.phase, "room_blockers");
  assert.match(path.statusMessage, /Kitchen has 1 item/);
  assert.equal(path.primaryAction.action, "focus_blockers");
  assert.equal(path.primaryAction.label, "Review missing dimensions");
  assert.ok(path.primaryAction.focusTarget?.elementId);
  console.log("ok: room blockers message and specific CTA");
}

{
  const path = deriveReviewActionPath({
    workflowStatus: "needs_review",
    showApprovedInUi: false,
    approvalStale: false,
    canApprove: false,
    canImport: false,
    savedAt: null,
    hasSaveableChanges: false,
    saveStatus: "idle",
    approveStatus: "idle",
    importStatus: "idle",
    activeRooms: rooms,
    roomCompleteness: { r1: false, r2: false },
    excludedRoomIds: new Set(),
    selectedRoomId: "r1",
    selectedRoomVerify: {
      ok: true,
      roomBlockers: [],
      globalBlockers: [{ code: "EVIDENCE_RECONCILIATION", message: "Global review item: 1 evidence issue." }],
    },
  });
  assert.equal(path.phase, "verify_room");
  assert.match(path.statusMessage, /ready to verify/i);
  assert.equal(path.primaryAction.label, "Mark room verified");
  assert.notEqual(path.primaryAction.label, "Review room issue");
  assert.equal(path.selectedRoom?.blockerCount, 0);
  assert.equal(path.selectedRoom?.globalBlockerCount, 1);
  console.log("ok: verify room ready despite global items");
}

{
  const path = deriveReviewActionPath({
    workflowStatus: "needs_review",
    showApprovedInUi: false,
    approvalStale: false,
    canApprove: false,
    canImport: false,
    savedAt: null,
    hasSaveableChanges: false,
    saveStatus: "idle",
    approveStatus: "idle",
    importStatus: "idle",
    activeRooms: rooms,
    roomCompleteness: { r1: false, r2: false },
    excludedRoomIds: new Set(),
    selectedRoomId: "r1",
    selectedRoomVerify: {
      ok: true,
      roomBlockers: [],
      globalBlockers: [],
    },
  });
  assert.equal(path.phase, "verify_room");
  assert.match(path.statusMessage, /ready to verify/i);
  assert.equal(path.primaryAction.label, "Mark room verified");
  console.log("ok: verify room ready");
}

{
  const path = deriveReviewActionPath({
    workflowStatus: "needs_review",
    showApprovedInUi: false,
    approvalStale: false,
    canApprove: true,
    canImport: false,
    savedAt: "2026-01-01T00:00:00.000Z",
    hasSaveableChanges: false,
    saveStatus: "idle",
    approveStatus: "idle",
    importStatus: "idle",
    activeRooms: rooms,
    roomCompleteness: { r1: true, r2: true },
    excludedRoomIds: new Set(),
    selectedRoomId: "r2",
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  });
  assert.equal(path.phase, "approve");
  assert.equal(path.primaryAction.action, "approve");
  console.log("ok: approve when saved and verified");
}

{
  const path = deriveReviewActionPath({
    workflowStatus: "needs_review",
    showApprovedInUi: false,
    approvalStale: false,
    canApprove: false,
    canImport: false,
    savedAt: null,
    hasSaveableChanges: true,
    saveStatus: "idle",
    approveStatus: "idle",
    importStatus: "idle",
    activeRooms: rooms,
    roomCompleteness: { r1: true, r2: true },
    excludedRoomIds: new Set(),
    selectedRoomId: "r1",
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  });
  assert.equal(path.phase, "save");
  assert.equal(path.primaryAction.action, "save");
  console.log("ok: save when all verified unsaved");
}

{
  const path = deriveReviewActionPath({
    workflowStatus: "approved_for_import",
    showApprovedInUi: true,
    approvalStale: false,
    canApprove: false,
    canImport: true,
    savedAt: "2026-01-01T00:00:00.000Z",
    hasSaveableChanges: false,
    saveStatus: "idle",
    approveStatus: "approved",
    importStatus: "idle",
    activeRooms: rooms,
    roomCompleteness: { r1: true, r2: true },
    excludedRoomIds: new Set(),
    selectedRoomId: "r1",
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  });
  assert.equal(path.phase, "import");
  assert.equal(path.primaryAction.action, "import");
  console.log("ok: import when approved");
}

{
  const path = deriveReviewActionPath({
    workflowStatus: "needs_review",
    showApprovedInUi: false,
    approvalStale: false,
    canApprove: false,
    canImport: false,
    savedAt: null,
    hasSaveableChanges: false,
    saveStatus: "idle",
    approveStatus: "idle",
    importStatus: "idle",
    activeRooms: rooms,
    roomCompleteness: { r1: true, r2: false },
    excludedRoomIds: new Set(),
    selectedRoomId: "r1",
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  });
  assert.equal(path.roomProgress.verified, 1);
  assert.equal(path.roomProgress.total, 2);
  assert.equal(path.nextRoomNeedingReview?.roomId, "r2");
  console.log("ok: room progress and next room");
}

{
  const path = deriveReviewActionPath({
    workflowStatus: "needs_review",
    showApprovedInUi: false,
    approvalStale: false,
    canApprove: false,
    canImport: false,
    savedAt: null,
    hasSaveableChanges: false,
    saveStatus: "idle",
    approveStatus: "idle",
    importStatus: "idle",
    activeRooms: rooms,
    roomCompleteness: { r1: false, r2: false },
    excludedRoomIds: new Set(),
    selectedRoomId: "r1",
    selectedRoomVerify: {
      ok: true,
      roomBlockers: [],
      globalBlockers: [],
    },
  });
  assert.equal(path.phase, "verify_room");
  assert.notEqual(path.primaryAction.label, "Review room issue");
  console.log("ok: no Review room issue when no blockers");
}

console.log("reviewActionPath.test.mjs: all passed");
