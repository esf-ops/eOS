/**
 * Room verification display — exact blockers for room-first workbench UI.
 * Does not change approval gate logic; separates room vs global blockers for transparency.
 *
 * @module roomVerificationView
 */

import { deriveRoomVerificationBlockers } from "./reviewedTakeoffMath.mjs";

/**
 * @param {{ code?: string, message?: string, path?: string|null }} blocker
 * @param {{ scope?: "room"|"global" }} [opts]
 */
export function formatBlockerDisplayMessage(blocker, opts = {}) {
  const msg = String(blocker?.message ?? "").trim();
  if (!msg) return "Review item needs attention.";
  if (opts.scope === "global") {
    return msg.startsWith("Global review item:") ? msg : `Global review item: ${msg}`;
  }
  return msg;
}

/**
 * @param {{ path?: string|null, message?: string }} blocker
 * @param {{ roomId?: string, roomIdx?: number, roomName?: string }} room
 */
export function approvalBlockerAppliesToRoom(blocker, room) {
  const path = String(blocker?.path ?? "");
  const roomId = room?.roomId ?? room?.id ?? "";
  const roomName = room?.roomName ?? room?.name ?? "";
  const roomIdx = room?.roomIdx;
  if (roomId && (path.includes(roomId) || path.includes(`rooms.${roomId}`))) return true;
  if (roomIdx != null && path.includes(`rooms[${roomIdx}]`)) return true;
  if (roomName && blocker?.message?.includes(roomName)) return true;
  return false;
}

/**
 * @param {Array<{ code?: string, message?: string, path?: string|null }>} approvalBlockers
 * @param {object} reviewedRoom
 */
export function filterRoomApprovalBlockers(approvalBlockers, reviewedRoom) {
  return (approvalBlockers ?? []).filter((b) => approvalBlockerAppliesToRoom(b, reviewedRoom));
}

/**
 * @param {Array<{ code?: string, message?: string, path?: string|null }>} approvalBlockers
 * @param {object} reviewedRoom
 */
export function filterGlobalApprovalBlockersForRoom(approvalBlockers, reviewedRoom) {
  return (approvalBlockers ?? []).filter((b) => !approvalBlockerAppliesToRoom(b, reviewedRoom));
}

function dedupeBlocker(existing, candidate) {
  return existing.some(
    (b) => b.code === candidate.code && b.message === candidate.message
  );
}

/**
 * Build exact room + global blockers for UI (workbench, sticky bar).
 *
 * @param {object} reviewedRoom — entry from computeReviewedTakeoffMath().activeRooms
 * @param {{
 *   approvalBlockers?: Array<{ code?: string, message?: string, path?: string|null, category?: string }>,
 *   mathConsistencyIssues?: Array<{ code?: string, message?: string }>,
 * }} [opts]
 */
export function buildRoomVerificationView(reviewedRoom, opts = {}) {
  const roomBlockers = deriveRoomVerificationBlockers(reviewedRoom).map((b) => ({
    ...b,
    scope: "room",
  }));

  const roomApprovalRaw = filterRoomApprovalBlockers(opts.approvalBlockers ?? [], reviewedRoom);
  /** @type {Array<object>} */
  const roomApprovalBlockers = [];
  for (const b of roomApprovalRaw) {
    const entry = {
      code: String(b.code ?? "APPROVAL_BLOCKER"),
      message: String(b.message ?? "Review item needs attention."),
      scope: "room",
      path: b.path ?? null,
      source: "approval_gate",
    };
    if (!dedupeBlocker(roomBlockers, entry)) {
      roomApprovalBlockers.push(entry);
    }
  }

  /** @type {Array<object>} */
  const globalBlockers = [];
  for (const b of filterGlobalApprovalBlockersForRoom(opts.approvalBlockers ?? [], reviewedRoom)) {
    globalBlockers.push({
      code: String(b.code ?? "APPROVAL_BLOCKER"),
      message: formatBlockerDisplayMessage(b, { scope: "global" }),
      scope: "global",
      path: b.path ?? null,
      source: "approval_gate",
    });
  }
  for (const issue of opts.mathConsistencyIssues ?? []) {
    globalBlockers.push({
      code: String(issue.code ?? "MATH_CONSISTENCY"),
      message: formatBlockerDisplayMessage(issue, { scope: "global" }),
      scope: "global",
      source: "math_consistency",
    });
  }

  const displayBlockers = [...roomBlockers, ...roomApprovalBlockers, ...globalBlockers];
  const roomBlockerCount = roomBlockers.length + roomApprovalBlockers.length;

  return {
    roomBlockers,
    roomApprovalBlockers,
    globalBlockers,
    displayBlockers,
    roomBlockerCount,
    globalBlockerCount: globalBlockers.length,
    canVerify: roomBlockerCount === 0,
    firstRoomBlocker: roomBlockers[0] ?? roomApprovalBlockers[0] ?? null,
    firstActionableBlocker: roomBlockers[0] ?? roomApprovalBlockers[0] ?? globalBlockers[0] ?? null,
  };
}

/**
 * Primary CTA label for the first actionable blocker.
 *
 * @param {{ code?: string, scope?: string }|null|undefined} blocker
 */
export function blockerPrimaryActionLabel(blocker) {
  const code = String(blocker?.code ?? "");
  switch (code) {
    case "BACKSPLASH_SCOPE_UNRESOLVED":
      return "Confirm backsplash scope";
    case "MISSING_RUN_DIMENSIONS":
      return "Review missing dimensions";
    case "EMPTY_AREA":
      return "Review missing scope";
    case "UNKNOWN_ROOM":
      return "Assign room name";
    default:
      if (blocker?.scope === "global") return "Review global items";
      return "Review room blockers";
  }
}

/**
 * Scroll/focus hint for a blocker (UI layer).
 *
 * @param {{ code?: string, scope?: string, areaIdx?: number, runId?: string, path?: string|null }|null|undefined} blocker
 * @param {{ roomIdx?: number, roomId?: string }} [roomCtx]
 */
export function blockerFocusTarget(blocker, roomCtx = {}) {
  if (!blocker) return null;
  if (blocker.scope === "global") {
    return { kind: "global", elementId: "takeoff-items-to-review" };
  }

  const code = String(blocker.code ?? "");
  const roomIdx = roomCtx.roomIdx;
  const areaIdx = blocker.areaIdx;

  if (code === "BACKSPLASH_SCOPE_UNRESOLVED" && roomIdx != null && areaIdx != null) {
    return {
      kind: "area_backsplash",
      elementId: `takeoff-blocker-backsplash-${roomIdx}-${areaIdx}`,
      blockerCode: code,
    };
  }
  if (code === "EMPTY_AREA" && roomIdx != null && areaIdx != null) {
    return {
      kind: "area",
      elementId: `takeoff-blocker-area-${roomIdx}-${areaIdx}`,
      blockerCode: code,
    };
  }
  if (code === "MISSING_RUN_DIMENSIONS" && blocker.runId) {
    return {
      kind: "piece",
      elementId: `takeoff-blocker-piece-${blocker.runId}`,
      blockerCode: code,
    };
  }

  return {
    kind: "room_blockers",
    elementId: "takeoff-room-verify-blockers",
    blockerCode: code,
  };
}
