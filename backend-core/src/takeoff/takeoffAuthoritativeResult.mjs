/**
 * Authoritative takeoff geometry selection — confirmed estimator work wins.
 * Pure helpers; no I/O.
 */

/**
 * @param {object|null|undefined} row quote_takeoff_results-shaped row
 */
export function isApprovedTakeoffResult(row) {
  return String(row?.review_status ?? "").toLowerCase() === "approved";
}

/**
 * @param {object|null|undefined} row
 */
export function readEstimatorConfirmedMeta(row) {
  const meta =
    row?.raw_ai_result_json &&
    typeof row.raw_ai_result_json === "object" &&
    row.raw_ai_result_json._meta &&
    typeof row.raw_ai_result_json._meta === "object"
      ? row.raw_ai_result_json._meta
      : null;
  const confirmed = meta?.estimatorConfirmed;
  if (confirmed && typeof confirmed === "object" && confirmed.confirmedAt) {
    return confirmed;
  }
  return null;
}

/**
 * @param {object|null|undefined} row
 */
export function hasEstimatorSavedEdits(row) {
  if (readEstimatorConfirmedMeta(row)) return true;
  const raw = row?.raw_ai_result_json;
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw._corrections) && raw._corrections.length > 0) return true;
    const rs = raw._meta?.reviewState;
    if (rs && typeof rs === "object") {
      if (Array.isArray(rs.manualRunIds) && rs.manualRunIds.length > 0) return true;
      if (Array.isArray(rs.manualRoomIds) && rs.manualRoomIds.length > 0) return true;
    }
  }
  return false;
}

/**
 * Priority: approved → estimator-confirmed/saved draft → latest AI/other.
 * @param {object[]} rows newest-first preferred
 * @returns {{ row: object|null, source: 'approved'|'estimator_draft'|'ai_draft'|'empty' }}
 */
export function selectAuthoritativeTakeoffResult(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.length === 0) return { row: null, source: "empty" };

  const approved = list.find((r) => isApprovedTakeoffResult(r));
  if (approved) return { row: approved, source: "approved" };

  const estimator = list.find((r) => hasEstimatorSavedEdits(r));
  if (estimator) return { row: estimator, source: "estimator_draft" };

  return { row: list[0], source: "ai_draft" };
}

/**
 * Build estimatorConfirmed metadata (additive, no migration).
 * @param {{ userId?: string|null, source?: string, now?: string }} opts
 */
export function buildEstimatorConfirmedMeta(opts = {}) {
  return {
    confirmedAt: opts.now || new Date().toISOString(),
    confirmedByUserId: opts.userId ?? null,
    source: opts.source || "estimator_save"
  };
}

function collectRoomIds(takeoff) {
  const rooms = Array.isArray(takeoff?.rooms) ? takeoff.rooms : [];
  return new Set(rooms.map((r) => String(r?.id ?? "").trim()).filter(Boolean));
}

function collectRunIds(takeoff) {
  const out = new Set();
  for (const room of Array.isArray(takeoff?.rooms) ? takeoff.rooms : []) {
    for (const run of Array.isArray(room?.runs) ? room.runs : []) {
      const id = String(run?.id ?? "").trim();
      if (id) out.add(id);
    }
    for (const piece of Array.isArray(room?.pieces) ? room.pieces : []) {
      const id = String(piece?.id ?? "").trim();
      if (id) out.add(id);
    }
    for (const area of Array.isArray(room?.areas) ? room.areas : []) {
      for (const run of Array.isArray(area?.runs) ? area.runs : []) {
        const id = String(run?.id ?? "").trim();
        if (id) out.add(id);
      }
    }
  }
  return out;
}

function listRoomRuns(room) {
  if (Array.isArray(room?.runs) && room.runs.length) return { key: "runs", container: room, runs: room.runs };
  if (Array.isArray(room?.pieces) && room.pieces.length) {
    return { key: "pieces", container: room, runs: room.pieces };
  }
  if (Array.isArray(room?.areas) && room.areas.length) {
    const area = room.areas[0];
    if (!Array.isArray(area.runs)) area.runs = [];
    return { key: "runs", container: area, runs: area.runs, viaArea: true };
  }
  // Prefer consolidated areas shape for empty rooms.
  if (!Array.isArray(room.areas)) room.areas = [];
  if (!room.areas.length) {
    room.areas.push({
      id: `${room.id || "room"}-a1`,
      label: "Main",
      backsplashScope: "stone",
      runs: []
    });
  }
  if (!Array.isArray(room.areas[0].runs)) room.areas[0].runs = [];
  return { key: "runs", container: room.areas[0], runs: room.areas[0].runs, viaArea: true };
}

function listAiRoomRuns(aiRoom) {
  if (Array.isArray(aiRoom?.runs)) return aiRoom.runs;
  if (Array.isArray(aiRoom?.pieces)) return aiRoom.pieces;
  const out = [];
  for (const area of Array.isArray(aiRoom?.areas) ? aiRoom.areas : []) {
    for (const run of Array.isArray(area?.runs) ? area.runs : []) out.push(run);
  }
  return out;
}

/**
 * Merge a new AI draft into confirmed estimator geometry.
 * Confirmed rooms/runs win; AI-only rooms/runs are appended as unconfirmed findings.
 *
 * @param {object} confirmedTakeoff normalized_takeoff_json
 * @param {object} aiTakeoff normalized_takeoff_json
 * @returns {{ merged: object, unconfirmedAiFindings: object }}
 */
export function mergeAiDraftPreservingConfirmed(confirmedTakeoff, aiTakeoff) {
  const base =
    confirmedTakeoff && typeof confirmedTakeoff === "object"
      ? structuredClone(confirmedTakeoff)
      : { rooms: [] };
  const ai = aiTakeoff && typeof aiTakeoff === "object" ? aiTakeoff : { rooms: [] };
  if (!Array.isArray(base.rooms)) base.rooms = [];

  const confirmedRoomIds = collectRoomIds(base);
  const confirmedRunIds = collectRunIds(base);
  const confirmedNames = new Set(
    base.rooms.map((r) => String(r?.name ?? "").trim().toLowerCase()).filter(Boolean)
  );

  const unconfirmedRooms = [];
  const unconfirmedRuns = [];

  for (const aiRoom of Array.isArray(ai.rooms) ? ai.rooms : []) {
    const roomId = String(aiRoom?.id ?? "").trim();
    const roomName = String(aiRoom?.name ?? "").trim().toLowerCase();
    if (roomId && confirmedRoomIds.has(roomId)) {
      const target = base.rooms.find((r) => String(r?.id ?? "") === roomId);
      if (!target) continue;
      const slot = listRoomRuns(target);
      for (const run of listAiRoomRuns(aiRoom)) {
        const rid = String(run?.id ?? "").trim();
        if (rid && confirmedRunIds.has(rid)) continue;
        if (rid) confirmedRunIds.add(rid);
        const draftRun = { ...run, _aiUnconfirmed: true };
        slot.container[slot.key].push(draftRun);
        unconfirmedRuns.push({ roomId, runId: rid || null });
      }
      continue;
    }
    if (roomName && confirmedNames.has(roomName)) {
      // Name match without id match — do not replace room; skip wholesale replace.
      continue;
    }
    const draftRoom = { ...structuredClone(aiRoom), _aiUnconfirmed: true };
    base.rooms.push(draftRoom);
    if (roomId) confirmedRoomIds.add(roomId);
    unconfirmedRooms.push({ roomId: roomId || null, name: aiRoom?.name ?? null });
  }

  return {
    merged: base,
    unconfirmedAiFindings: {
      addedAt: new Date().toISOString(),
      rooms: unconfirmedRooms,
      runs: unconfirmedRuns
    }
  };
}
