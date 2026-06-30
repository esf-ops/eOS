/**
 * Derives the next recommended action on the review → approve → import path.
 * UI-only — does not change approval gate logic.
 */

/** @typedef {"import"|"approve"|"save"|"room_blockers"|"verify_room"|"next_room"|"continue_review"} ReviewActionPhase */

/** @typedef {{
 *   label: string,
 *   action: string,
 *   disabled?: boolean,
 *   loading?: boolean,
 *   title?: string,
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
 *   activeRooms: Array<{ roomId: string, roomName: string }>,
 *   roomCompleteness: Record<string, boolean>,
 *   excludedRoomIds: Set<string>|string[],
 *   selectedRoomId: string|null,
 *   selectedRoomVerify: { ok: boolean, blockers: Array<{ code?: string, message?: string }> }|null,
 *   hasGlobalBlockers: boolean,
 *   globalBlockerCount: number,
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
  const verify = input.selectedRoomVerify ?? { ok: false, blockers: [] };

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
    const localBlockers = verify.blockers ?? [];
    const blockerCount =
      localBlockers.length > 0
        ? localBlockers.length
        : input.hasGlobalBlockers
          ? Math.max(1, input.globalBlockerCount)
          : 0;

    if (blockerCount > 0 || input.hasGlobalBlockers) {
      const count = localBlockers.length > 0 ? localBlockers.length : input.globalBlockerCount || 1;
      return {
        phase: "room_blockers",
        statusMessage: `${selectedRoom.roomName} has ${count} item${count !== 1 ? "s" : ""} to review before verification.`,
        roomProgress,
        selectedRoom: {
          roomId: selectedRoom.roomId,
          roomName: selectedRoom.roomName,
          verified: false,
          blockerCount: count,
        },
        nextRoomNeedingReview,
        primaryAction: {
          label: localBlockers.length > 0 ? "Review room issue" : "Review items to resolve",
          action: "focus_blockers",
          disabled: false,
          title: localBlockers.map((b) => b.message).join(" "),
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
        },
        nextRoomNeedingReview,
        primaryAction: {
          label: "Mark room verified",
          action: "verify_room",
          disabled: false,
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
  }

  // ── Continue room-by-room ─────────────────────────────────────────────────
  if (nextRoomNeedingReview) {
    return {
      phase: "next_room",
      statusMessage: `Continue reviewing rooms — ${roomProgress.label}.`,
      roomProgress,
      selectedRoom: selectedRoom
        ? { roomId: selectedRoom.roomId, roomName: selectedRoom.roomName, verified: selectedVerified }
        : null,
      nextRoomNeedingReview,
      primaryAction: {
        label: `Go to ${nextRoomNeedingReview.roomName}`,
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
