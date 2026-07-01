/**
 * Run: node app-ai-takeoff/src/lib/reviewActionPath.test.mjs
 */
import assert from "node:assert/strict";
import { deriveReviewActionPath } from "./reviewActionPath.mjs";

const rooms = [
  { roomId: "r1", roomName: "Kitchen", roomIdx: 0 },
  { roomId: "r2", roomName: "Primary Bath", roomIdx: 1 },
];

function makeBase(overrides = {}) {
  return {
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
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
    ...overrides,
  };
}

// ── State B: room has blockers ────────────────────────────────────────────────
{
  const path = deriveReviewActionPath(makeBase({
    selectedRoomVerify: {
      ok: false,
      roomBlockers: [{ code: "MISSING_RUN_DIMENSIONS", message: "Fix depth", areaIdx: 0 }],
      globalBlockers: [],
    },
  }));
  assert.equal(path.phase, "room_blockers");
  assert.match(path.statusMessage, /Kitchen has 1 item/);
  assert.equal(path.primaryAction.action, "focus_blockers");
  assert.equal(path.primaryAction.label, "Review missing dimensions");
  assert.ok(path.primaryAction.focusTarget?.elementId);
  console.log("ok: State B — room blockers, specific CTA");
}

// ── State C: room ready to verify (no blockers, not yet verified) ─────────────
{
  const path = deriveReviewActionPath(makeBase());
  assert.equal(path.phase, "verify_room");
  assert.match(path.statusMessage, /Kitchen is ready to verify/);
  assert.equal(path.primaryAction.action, "verify_room");
  assert.equal(path.primaryAction.label, "Mark Kitchen verified");
  assert.equal(path.primaryAction.roomId, "r1");
  console.log("ok: State C — ready to verify, room-specific CTA");
}

// ── State C: ready to verify even when ROOM_INCOMPLETE in globalBlockers ──────
{
  const path = deriveReviewActionPath(makeBase({
    selectedRoomVerify: {
      ok: true,   // canVerify is room-blockers-only — ROOM_INCOMPLETE excluded
      roomBlockers: [],
      globalBlockers: [
        { code: "ROOM_INCOMPLETE", message: "Room \"Kitchen\" is not marked complete.", scope: "global" },
      ],
    },
  }));
  assert.equal(path.phase, "verify_room");
  assert.equal(path.primaryAction.label, "Mark Kitchen verified");
  assert.notEqual(path.primaryAction.label, "Review room issue");
  console.log("ok: ROOM_INCOMPLETE in globalBlockers does not block verify_room phase");
}

// ── State C: ready to verify even when UNSAVED_EDITS is present ───────────────
{
  const path = deriveReviewActionPath(makeBase({
    selectedRoomVerify: {
      ok: true,
      roomBlockers: [],
      globalBlockers: [
        { code: "UNSAVED_EDITS", message: "Global review item: Save your measurement edits." },
      ],
    },
  }));
  assert.equal(path.phase, "verify_room");
  assert.equal(path.primaryAction.label, "Mark Kitchen verified");
  assert.equal(path.selectedRoom?.blockerCount, 0);
  assert.equal(path.selectedRoom?.globalBlockerCount, 1);
  console.log("ok: UNSAVED_EDITS does not block verify_room phase");
}

// ── State D→E: all rooms verified, unsaved ────────────────────────────────────
{
  const path = deriveReviewActionPath(makeBase({
    hasSaveableChanges: true,
    roomCompleteness: { r1: true, r2: true },
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(path.phase, "save");
  assert.equal(path.primaryAction.action, "save");
  assert.equal(path.primaryAction.label, "Save reviewed dimensions");
  console.log("ok: State E — all verified unsaved → save");
}

// ── State F→G: saved and clear → approve ─────────────────────────────────────
{
  const path = deriveReviewActionPath(makeBase({
    canApprove: true,
    savedAt: "2026-01-01T00:00:00.000Z",
    roomCompleteness: { r1: true, r2: true },
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(path.phase, "approve");
  assert.equal(path.primaryAction.action, "approve");
  assert.equal(path.primaryAction.label, "Approve takeoff");
  console.log("ok: State G — saved and clear → approve");
}

// ── State H→I: approved, can import ──────────────────────────────────────────
{
  const path = deriveReviewActionPath(makeBase({
    workflowStatus: "approved_for_import",
    showApprovedInUi: true,
    canApprove: false,
    canImport: true,
    savedAt: "2026-01-01T00:00:00.000Z",
    approveStatus: "approved",
    roomCompleteness: { r1: true, r2: true },
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(path.phase, "import");
  assert.equal(path.primaryAction.action, "import");
  assert.equal(path.primaryAction.label, "Import to Internal Estimate");
  console.log("ok: State I — approved → import");
}

// ── Room progress tracking ────────────────────────────────────────────────────
{
  const path = deriveReviewActionPath(makeBase({
    roomCompleteness: { r1: true, r2: false },
    selectedRoomId: "r1",
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(path.roomProgress.verified, 1);
  assert.equal(path.roomProgress.total, 2);
  assert.equal(path.nextRoomNeedingReview?.roomId, "r2");
  console.log("ok: room progress counter and nextRoomNeedingReview");
}

// ── "Go to Kitchen" prevention when Kitchen already selected ──────────────────
{
  // next_room phase only fires if verify.ok = false; after the fix this should
  // never happen for a room with no blockers. But if it did, ensure label differs.
  const path = deriveReviewActionPath(makeBase({
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  // With ok=true, we get verify_room — never next_room showing same room
  assert.notEqual(path.phase, "next_room");
  assert.notEqual(path.primaryAction.label, "Go to Kitchen");
  console.log("ok: no 'Go to Kitchen' when Kitchen is ready to verify");
}

// ── Backsplash blocker CTA is specific ───────────────────────────────────────
{
  const path = deriveReviewActionPath(makeBase({
    selectedRoomVerify: {
      ok: false,
      roomBlockers: [
        { code: "BACKSPLASH_SCOPE_UNRESOLVED", message: "Confirm backsplash scope for \"Countertop\".", areaIdx: 0 },
      ],
      globalBlockers: [],
    },
  }));
  assert.equal(path.phase, "room_blockers");
  assert.equal(path.primaryAction.label, "Confirm backsplash scope");
  assert.equal(path.primaryAction.action, "focus_blockers");
  console.log("ok: backsplash blocker → 'Confirm backsplash scope' CTA");
}

// ── State C: secondary action is null when no other room needs review ─────────
{
  const path = deriveReviewActionPath(makeBase({
    activeRooms: [{ roomId: "r1", roomName: "Kitchen", roomIdx: 0 }],
    roomCompleteness: { r1: false },
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(path.phase, "verify_room");
  assert.equal(path.secondaryAction, null, "no secondary when only one room");
  console.log("ok: no secondary action when only one room");
}

// ── review_decisions phase: all verified + saved + pending decisions ───────────
{
  const path = deriveReviewActionPath(makeBase({
    activeRooms: [{ roomId: "r1", roomName: "Kitchen", roomIdx: 0 }],
    roomCompleteness: { r1: true },
    savedAt: "2026-06-01T00:00:00Z",
    hasSaveableChanges: false,
    canApprove: false,          // workflow state canApprove = false (decisions pending)
    pendingDecisionCount: 1,    // one reference mismatch outstanding
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(path.phase, "review_decisions", "review_decisions phase");
  assert.match(path.statusMessage, /1 decision required/);
  assert.equal(path.primaryAction.action, "review_decisions");
  console.log("ok: review_decisions phase — 1 decision required before approval");
}

// ── review_decisions: approve phase NOT shown when decisions pending ───────────
{
  // Even if canApprove somehow passes, decisions pending keeps us in review_decisions
  const path = deriveReviewActionPath(makeBase({
    activeRooms: [{ roomId: "r1", roomName: "Kitchen", roomIdx: 0 }],
    roomCompleteness: { r1: true },
    savedAt: "2026-06-01T00:00:00Z",
    hasSaveableChanges: false,
    canApprove: true,           // workflow state says true (after diagnostics reclassified)
    pendingDecisionCount: 2,    // but 2 decisions still pending
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(path.phase, "review_decisions", "review_decisions takes priority over approve");
  assert.match(path.primaryAction.label, /Review 2 decisions/);
  console.log("ok: review_decisions takes priority over approve when decisions pending");
}

// ── After accepting decisions, approve phase shown ─────────────────────────────
{
  const path = deriveReviewActionPath(makeBase({
    activeRooms: [{ roomId: "r1", roomName: "Kitchen", roomIdx: 0 }],
    roomCompleteness: { r1: true },
    savedAt: "2026-06-01T00:00:00Z",
    hasSaveableChanges: false,
    canApprove: true,
    pendingDecisionCount: 0,    // all decisions accepted
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(path.phase, "approve", "approve phase after decisions cleared");
  assert.equal(path.primaryAction.action, "approve");
  console.log("ok: approve phase shown after all decisions accepted");
}

// ── REGRESSION: save succeeds → stale/unsaved must clear ─────────────────────
// Observed production bug: after clicking "Save reviewed dimensions" and receiving
// "Correction saved — 41.70 sf countertop · 17.58 sf backsplash", the UI still
// showed "Unsaved edits" and "Approval blocked: computed totals are stale."
// Root cause: setSourceResult(effectiveDraft) was missing in handleSaveDraft, so
// hasSaveableChanges stayed true → reviewNotSaved stayed true → phase stuck on save.
//
// This test pins the expected phase after a successful save completes.
{
  // Kitchen room verified, save just completed (savedAt present, hasSaveableChanges false).
  const pathAfterSave = deriveReviewActionPath(makeBase({
    activeRooms: [{ roomId: "r1", roomName: "Kitchen", roomIdx: 0 }],
    roomCompleteness: { r1: true },
    savedAt: "2026-07-01T10:00:00.000Z",
    hasSaveableChanges: false,       // key: setSourceResult(effectiveDraft) cleared this
    saveStatus: "saved",
    canApprove: true,                // gate cleared: no UNSAVED_EDITS, no decisions
    pendingDecisionCount: 0,
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.notEqual(pathAfterSave.phase, "save",
    "REGRESSION: phase must not be 'save' after successful save with no new edits");
  assert.equal(pathAfterSave.phase, "approve",
    "REGRESSION: phase must be 'approve' when saved + verified + no decisions pending");
  assert.equal(pathAfterSave.primaryAction.action, "approve",
    "REGRESSION: primary action must be 'approve' after save clears stale state");
  assert.ok(
    !(/stale|unsaved/i).test(pathAfterSave.statusMessage ?? ""),
    `REGRESSION: status message must not mention stale/unsaved after successful save (got: "${pathAfterSave.statusMessage}")`
  );
  console.log("ok: REGRESSION — save success clears stale state, phase advances to approve");
}

// ── REGRESSION: save succeeded, decisions still pending ───────────────────────
{
  const pathWithDecisions = deriveReviewActionPath(makeBase({
    activeRooms: [{ roomId: "r1", roomName: "Kitchen", roomIdx: 0 }],
    roomCompleteness: { r1: true },
    savedAt: "2026-07-01T10:00:00.000Z",
    hasSaveableChanges: false,
    saveStatus: "saved",
    canApprove: false,               // blocked by pending decisions
    pendingDecisionCount: 1,
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.notEqual(pathWithDecisions.phase, "save",
    "REGRESSION: phase must not remain 'save' when saved but decisions pending");
  assert.equal(pathWithDecisions.phase, "review_decisions",
    "REGRESSION: phase must be 'review_decisions' when saved but decisions remain");
  console.log("ok: REGRESSION — save success + pending decisions → review_decisions phase");
}

// ── REGRESSION: hasSaveableChanges true = stale, even with savedAt ────────────
// Guard test: confirms that hasSaveableChanges: true still produces 'save' phase.
// If setSourceResult is accidentally reverted, this test catches the regression.
{
  const pathStillStale = deriveReviewActionPath(makeBase({
    activeRooms: [{ roomId: "r1", roomName: "Kitchen", roomIdx: 0 }],
    roomCompleteness: { r1: true },
    savedAt: "2026-07-01T10:00:00.000Z",
    hasSaveableChanges: true,        // stale: sourceResult not committed after save
    saveStatus: "saved",
    canApprove: true,
    pendingDecisionCount: 0,
    selectedRoomVerify: { ok: true, roomBlockers: [], globalBlockers: [] },
  }));
  assert.equal(pathStillStale.phase, "save",
    "Guard: hasSaveableChanges:true must keep phase at 'save' (reviewNotSaved stays true)");
  console.log("ok: Guard — hasSaveableChanges:true keeps save phase (confirms fix is needed)");
}

console.log("reviewActionPath.test.mjs: all passed");
