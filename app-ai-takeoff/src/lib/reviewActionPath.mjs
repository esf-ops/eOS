/**
 * Derives the next recommended action on the review → approve → import path.
 * UI-only — does not change approval gate logic.
 */

import {
  blockerFocusTarget,
  blockerPrimaryActionLabel,
} from "../../../backend-core/src/takeoff/roomVerificationView.mjs";

/** @typedef {"import"|"approve"|"review_decisions"|"save"|"room_blockers"|"verify_room"|"next_room"|"continue_review"} ReviewActionPhase */

/** @typedef {{
 *   label: string,
 *   action: string,
 *   disabled?: boolean,
 *   loading?: boolean,
 *   title?: string,
 *   roomId?: string,
 *   focusTarget?: object|null,
 * }} ReviewPrimaryAction */

/**
 * @param {{
 *   workflowStatus: string,
 *   showApprovedInUi: boolean,
 *   approvalStale: boolean,
 *   canApprove: boolean,
 *   canImport: boolean,
 *   savedAt: string|null,
 *   hasSaveableChanges: boolean,
 *   saveStatus: string,
 *   approveStatus: string,
 *   importStatus: string,
 *   activeRooms: Array<{ roomId: string, roomName: string, roomIdx?: number }>,
 *   roomCompleteness: Record<string, boolean>,
 *   excludedRoomIds: Set<string>|string[],
 *   selectedRoomId: string|null,
 *   selectedRoomVerify: {
 *     ok: boolean,
 *     roomBlockers?: Array<{ code?: string, message?: string, areaIdx?: number, runId?: string }>,
 *     globalBlockers?: Array<{ code?: string, message?: string }>,
 *     blockers?: Array<{ code?: string, message?: string }>,
 *   }|null,
 *   pendingDecisionCount?: number,
 * }} input
 */
export function deriveReviewActionPath(input) {
  const excluded =
    input.excludedRoomIds instanceof Set
      ? input.excludedRoomIds
      : new Set(input.excludedRoomIds ?? []);

  const includedRooms = (input.activeRooms ?? []).filter((r) => !excluded.has(r.roomId));
  const verifiedCount = includedRooms.filter((r) => input.roomCompleteness[r.roomId]).length;
  const totalRooms = includedRooms.length;
  const allRoomsVerified = totalRooms > 0 && verifiedCount === totalRooms;
  const reviewNotSaved = !input.savedAt || input.hasSaveableChanges;

  const roomProgress = {
    verified: verifiedCount,
    total: totalRooms,
    label: totalRooms > 0 ? `${verifiedCount} of ${totalRooms} rooms verified` : "No rooms in scope",
  };

  const nextRoomNeedingReview = includedRooms.find((r) => !input.roomCompleteness[r.roomId]) ?? null;

  const selectedRoom =
    (input.selectedRoomId
      ? includedRooms.find((r) => r.roomId === input.selectedRoomId)
      : null) ??
    nextRoomNeedingReview ??
    includedRooms[0] ??
    null;

  const selectedVerified = selectedRoom ? Boolean(input.roomCompleteness[selectedRoom.roomId]) : false;
  const verify = input.selectedRoomVerify ?? { ok: false, roomBlockers: [], globalBlockers: [] };
  const roomBlockers =
    verify.roomBlockers ??
    verify.blockers ??
    [];
  const globalBlockers = verify.globalBlockers ?? [];

  /** @type {ReviewPrimaryAction} */
  const baseContinue = {
    label: "Continue review",
    action: "next_room",
    disabled: false,
  };

  // ── Import (approved) ─────────────────────────────────────────────────────
  if (
    input.showApprovedInUi &&
    !input.approvalStale &&
    input.canImport &&
    input.workflowStatus !== "imported"
  ) {
    return {
      phase: "import",
      statusMessage: "Approved — import verified measurements into Internal Estimate.",
      roomProgress,
      selectedRoom: selectedRoom
        ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
        : null,
      nextRoomNeedingReview,
      primaryAction: {
        label: input.importStatus === "importing" ? "Importing…" : "Import to Internal Estimate",
        action: "import",
        disabled: input.importStatus === "importing",
        loading: input.importStatus === "importing",
      },
      secondaryAction: null,
    };
  }

  if (input.workflowStatus === "imported") {
    return {
      phase: "import",
      statusMessage: "Draft Internal Estimate created from this takeoff.",
      roomProgress,
      selectedRoom: selectedRoom
        ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
        : null,
      nextRoomNeedingReview,
      primaryAction: { label: "Imported", action: "none", disabled: true },
      secondaryAction: null,
    };
  }

  // ── Final review decisions (all verified + saved, decisions pending) ─────
  const pendingDecisions = input.pendingDecisionCount ?? 0;
  if (
    allRoomsVerified &&
    !reviewNotSaved &&
    pendingDecisions > 0 &&
    !input.showApprovedInUi &&
    !input.approvalStale
  ) {
    return {
      phase: "review_decisions",
      statusMessage: `${pendingDecisions} decision${pendingDecisions !== 1 ? "s" : ""} required before approval.`,
      roomProgress,
      selectedRoom: selectedRoom
        ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
        : null,
      nextRoomNeedingReview,
      primaryAction: {
        label: pendingDecisions === 1 ? "Accept and continue" : `Review ${pendingDecisions} decisions`,
        action: "review_decisions",
        disabled: false,
      },
      secondaryAction: null,
    };
  }

  // ── Approve (saved + clear) ───────────────────────────────────────────────
  const readyToApprove =
    allRoomsVerified &&
    !reviewNotSaved &&
    input.canApprove &&
    !input.showApprovedInUi &&
    !input.approvalStale;

  if (readyToApprove) {
    return {
      phase: "approve",
      statusMessage: "All rooms verified and saved — approve to unlock import.",
      roomProgress,
      selectedRoom: selectedRoom
        ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
        : null,
      nextRoomNeedingReview,
      primaryAction: {
        label: input.approveStatus === "approving" ? "Approving…" : "Approve takeoff",
        action: "approve",
        disabled: input.approveStatus === "approving" || input.saveStatus === "saving",
        loading: input.approveStatus === "approving",
      },
      secondaryAction: null,
    };
  }

  // ── Save (all verified, not saved) ────────────────────────────────────────
  if (allRoomsVerified && reviewNotSaved) {
    return {
      phase: "save",
      statusMessage: "All rooms verified — save reviewed dimensions before approval.",
      roomProgress,
      selectedRoom: selectedRoom
        ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
        : null,
      nextRoomNeedingReview,
      primaryAction: {
        label: input.saveStatus === "saving" ? "Saving…" : "Save reviewed dimensions",
        action: "save",
        disabled: input.saveStatus === "saving" || input.approveStatus === "approving",
        loading: input.saveStatus === "saving",
      },
      secondaryAction: null,
    };
  }

  // ── Per-room review ───────────────────────────────────────────────────────
  if (selectedRoom && !selectedVerified) {
    if (roomBlockers.length > 0) {
      const first = roomBlockers[0];
      const count = roomBlockers.length;
      const focusTarget = blockerFocusTarget(first, {
        roomIdx: selectedRoom.roomIdx,
        roomId: selectedRoom.roomId,
      });
      return {
        phase: "room_blockers",
        statusMessage: `${selectedRoom.roomName} has ${count} item${count !== 1 ? "s" : ""} to review before verification.`,
        roomProgress,
        selectedRoom: {
          roomId: selectedRoom.roomId,
          roomName: selectedRoom.roomName,
          verified: false,
          blockerCount: count,
          globalBlockerCount: globalBlockers.length,
        },
        nextRoomNeedingReview,
        primaryAction: {
          label: blockerPrimaryActionLabel(first),
          action: "focus_blockers",
          disabled: false,
          title: roomBlockers.map((b) => b.message).join(" "),
          focusTarget,
        },
        secondaryAction: nextRoomNeedingReview && nextRoomNeedingReview.roomId !== selectedRoom.roomId
          ? {
              label: `Next: ${nextRoomNeedingReview.roomName}`,
              action: "next_room",
              roomId: nextRoomNeedingReview.roomId,
            }
          : null,
      };
    }

    if (verify.ok) {
      return {
        phase: "verify_room",
        statusMessage: `${selectedRoom.roomName} is ready to verify.`,
        roomProgress,
        selectedRoom: {
          roomId: selectedRoom.roomId,
          roomName: selectedRoom.roomName,
          verified: false,
          blockerCount: 0,
          globalBlockerCount: globalBlockers.length,
        },
        nextRoomNeedingReview,
        primaryAction: {
          label: `Mark ${selectedRoom.roomName} verified`,
          action: "verify_room",
          disabled: false,
          roomId: selectedRoom.roomId,
        },
        // Only show "next room" secondary when there is a different room to go to
        secondaryAction: nextRoomNeedingReview && nextRoomNeedingReview.roomId !== selectedRoom.roomId
          ? {
              label: `Next: ${nextRoomNeedingReview.roomName}`,
              action: "next_room",
              roomId: nextRoomNeedingReview.roomId,
            }
          : null,
      };
    }
  }

  // ── Continue room-by-room ─────────────────────────────────────────────────
  if (nextRoomNeedingReview) {
    // Avoid "Go to Kitchen" when Kitchen is already the selected room.
    const nextIsDifferent = nextRoomNeedingReview.roomId !== selectedRoom?.roomId;
    return {
      phase: "next_room",
      statusMessage: `Review rooms — ${roomProgress.label}.`,
      roomProgress,
      selectedRoom: selectedRoom
        ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
        : null,
      nextRoomNeedingReview,
      primaryAction: nextIsDifferent
        ? {
            label: `Go to ${nextRoomNeedingReview.roomName}`,
            action: "next_room",
            roomId: nextRoomNeedingReview.roomId,
          }
        : {
            label: `Review ${nextRoomNeedingReview.roomName}`,
            action: "next_room",
            roomId: nextRoomNeedingReview.roomId,
          },
      secondaryAction: null,
    };
  }

  // ── Fallback: save if unsaved, else approve if possible ───────────────────
  if (reviewNotSaved) {
    return {
      phase: "save",
      statusMessage: "Save reviewed dimensions to continue toward approval.",
      roomProgress,
      selectedRoom: selectedRoom
        ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
        : null,
      nextRoomNeedingReview,
      primaryAction: {
        label: input.saveStatus === "saving" ? "Saving…" : "Save reviewed dimensions",
        action: "save",
        disabled: input.saveStatus === "saving",
        loading: input.saveStatus === "saving",
      },
      secondaryAction: null,
    };
  }

  return {
    phase: "continue_review",
    statusMessage: "Confirm each room's scope and dimensions before approval.",
    roomProgress,
    selectedRoom: selectedRoom
      ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
      : null,
    nextRoomNeedingReview,
    primaryAction: baseContinue,
    secondaryAction: null,
  };
}
