/**
 * Empty manual Takeoff draft + room/piece helpers for estimator work before AI.
 * Pure functions — no I/O. Safe for browser + Node tests.
 */

function newId(prefix) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}
/**
 * @returns {object} TakeoffResult with zero rooms
 */
export function createEmptyManualTakeoffDraft() {
  return {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [],
    confidence: "low",
    projectAssumptions: [
      "Manual estimator draft — AI findings will be added when ready."
    ]
  };
}

/**
 * @param {object|null|undefined} takeoff
 * @returns {boolean}
 */
export function hasUsableTakeoffGeometry(takeoff) {
  const rooms = Array.isArray(takeoff?.rooms) ? takeoff.rooms : [];
  for (const room of rooms) {
    for (const area of room?.areas ?? []) {
      for (const run of area?.runs ?? []) {
        if (run && String(run.id ?? "").trim()) return true;
      }
    }
    // pieces alias
    for (const piece of room?.pieces ?? []) {
      if (piece && String(piece.id ?? "").trim()) return true;
    }
    for (const run of room?.runs ?? []) {
      if (run && String(run.id ?? "").trim()) return true;
    }
  }
  return false;
}

/**
 * @param {object} takeoff
 * @param {{ name?: string, roomType?: string }} [opts]
 */
export function addManualRoom(takeoff, opts = {}) {
  const base =
    takeoff && typeof takeoff === "object"
      ? structuredClone(takeoff)
      : createEmptyManualTakeoffDraft();
  if (!Array.isArray(base.rooms)) base.rooms = [];
  const roomId = newId("room");
  base.rooms.push({
    id: roomId,
    name: String(opts.name ?? "New room").trim() || "New room",
    roomType: String(opts.roomType ?? "Kitchen").trim() || "Kitchen",
    _estimatorOwned: true,
    _manual: true,
    areas: [
      {
        id: `${roomId}-a1`,
        label: "Main",
        backsplashScope: "stone",
        backsplashIncluded: true,
        runs: []
      }
    ]
  });
  return base;
}

/**
 * @param {object} takeoff
 * @param {string} roomId
 * @param {{ label?: string, lengthIn?: number, depthIn?: number, quantity?: number }} [opts]
 */
export function addManualPiece(takeoff, roomId, opts = {}) {
  const base =
    takeoff && typeof takeoff === "object"
      ? structuredClone(takeoff)
      : createEmptyManualTakeoffDraft();
  const runId = newId("run");
  const piece = {
    id: runId,
    label: String(opts.label ?? "New piece").trim() || "New piece",
    lengthIn: Number(opts.lengthIn) || 0,
    depthIn: Number(opts.depthIn) || 25.5,
    quantity: Number(opts.quantity) || 1,
    pieceType: "counter",
    _estimatorOwned: true,
    _manual: true
  };
  base.rooms = (base.rooms ?? []).map((room) => {
    if (String(room?.id) !== String(roomId)) return room;
    const areas = Array.isArray(room.areas) && room.areas.length
      ? room.areas
      : [{ id: `${room.id}-a1`, label: "Main", backsplashScope: "stone", runs: [] }];
    const first = {
      ...areas[0],
      runs: [...(areas[0].runs ?? []), piece]
    };
    return {
      ...room,
      _estimatorOwned: true,
      _manual: true,
      areas: [first, ...areas.slice(1)]
    };
  });
  return base;
}

/**
 * Collect manual ownership ids for reviewState / merge protection.
 * @param {object|null|undefined} takeoff
 */
export function collectManualOwnershipIds(takeoff) {
  const manualRoomIds = [];
  const manualRunIds = [];
  for (const room of takeoff?.rooms ?? []) {
    const roomId = String(room?.id ?? "").trim();
    if (!roomId) continue;
    if (room._estimatorOwned || room._manual) manualRoomIds.push(roomId);
    for (const area of room.areas ?? []) {
      for (const run of area.runs ?? []) {
        const runId = String(run?.id ?? "").trim();
        if (!runId) continue;
        if (run._estimatorOwned || run._manual) {
          manualRunIds.push(runId);
          if (!manualRoomIds.includes(roomId)) manualRoomIds.push(roomId);
        }
      }
    }
    for (const run of room.runs ?? []) {
      const runId = String(run?.id ?? "").trim();
      if (runId && (run._estimatorOwned || run._manual)) {
        manualRunIds.push(runId);
        if (!manualRoomIds.includes(roomId)) manualRoomIds.push(roomId);
      }
    }
  }
  return { manualRoomIds, manualRunIds };
}

/**
 * Mark a run as estimator-owned after edit.
 * @param {object} takeoff
 * @param {string} roomId
 * @param {string} runId
 */
export function markRunEstimatorOwned(takeoff, roomId, runId) {
  if (!takeoff || typeof takeoff !== "object") return takeoff;
  return {
    ...takeoff,
    rooms: (takeoff.rooms ?? []).map((room) => {
      if (String(room.id) !== String(roomId)) return room;
      return {
        ...room,
        _estimatorOwned: true,
        areas: (room.areas ?? []).map((area) => ({
          ...area,
          runs: (area.runs ?? []).map((run) =>
            String(run.id) === String(runId)
              ? { ...run, _estimatorOwned: true, _manual: true }
              : run
          )
        }))
      };
    })
  };
}

/**
 * User-facing consolidated Takeoff status (never "idle").
 * @param {{
 *   jobStatus?: string,
 *   reviewStatus?: string,
 *   hasUsableGeometry?: boolean,
 *   aiEnabled?: boolean
 * }} input
 */
export function deriveConsolidatedWorksheetStatus(input = {}) {
  const job = String(input.jobStatus ?? "").toLowerCase();
  const review = String(input.reviewStatus ?? "").toLowerCase();
  const usable = Boolean(input.hasUsableGeometry);
  const pendingAi = Boolean(input.pendingAiAvailable);
  if (job === "failed" || job === "error") return "Takeoff failed";
  if (review === "approved") return "Approved";
  if (job === "processing" || job === "pending" || job === "queued") {
    return usable
      ? "Takeoff processing · manual draft in progress"
      : "Takeoff processing";
  }
  if (usable && pendingAi) return "Takeoff draft ready · AI findings pending review";
  if (usable) return "Takeoff draft ready";
  if (input.aiEnabled === false) return "AI unavailable — build takeoff manually";
  return "Takeoff queued";
}
