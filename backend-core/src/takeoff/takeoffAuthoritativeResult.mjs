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
 * True when normalized takeoff JSON carries estimator-owned rooms/runs
 * (`_estimatorOwned` / `_manual`), including empty manual rooms.
 * @param {object|null|undefined} takeoff
 */
export function hasEstimatorOwnedGeometry(takeoff) {
  for (const room of Array.isArray(takeoff?.rooms) ? takeoff.rooms : []) {
    if (room?._estimatorOwned || room?._manual) return true;
    for (const run of Array.isArray(room?.runs) ? room.runs : []) {
      if (run?._estimatorOwned || run?._manual) return true;
    }
    for (const piece of Array.isArray(room?.pieces) ? room.pieces : []) {
      if (piece?._estimatorOwned || piece?._manual) return true;
    }
    for (const area of Array.isArray(room?.areas) ? room.areas : []) {
      for (const run of Array.isArray(area?.runs) ? area.runs : []) {
        if (run?._estimatorOwned || run?._manual) return true;
      }
    }
  }
  return false;
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
      if (Array.isArray(rs.deletedRunIds) && rs.deletedRunIds.length > 0) return true;
      if (Array.isArray(rs.deletedRoomIds) && rs.deletedRoomIds.length > 0) return true;
    }
  }
  // Geometry markers survive even when result-row insert failed and only JSON remains.
  if (hasEstimatorOwnedGeometry(row?.normalized_takeoff_json)) return true;
  return false;
}

/**
 * job.result_summary looks like an estimator save (correction / owned geometry).
 * @param {object|null|undefined} summary
 */
export function resultSummaryLooksEstimatorOwned(summary) {
  if (!summary || typeof summary !== "object") return false;
  if (summary.lastCorrectionId) return true;
  if (summary.estimatorConfirmed && typeof summary.estimatorConfirmed === "object") {
    if (summary.estimatorConfirmed.confirmedAt) return true;
  }
  if (hasEstimatorOwnedGeometry(summary.normalizedTakeoffJson)) return true;
  const rs = summary.reviewState;
  if (rs && typeof rs === "object") {
    if (Array.isArray(rs.manualRoomIds) && rs.manualRoomIds.length > 0) return true;
    if (Array.isArray(rs.manualRunIds) && rs.manualRunIds.length > 0) return true;
    if (Array.isArray(rs.deletedRoomIds) && rs.deletedRoomIds.length > 0) return true;
    if (Array.isArray(rs.deletedRunIds) && rs.deletedRunIds.length > 0) return true;
  }
  return false;
}

/**
 * Build a synthetic result row from job.result_summary (quote_id insert fallback).
 * @param {object} summary
 */
export function resultRowFromJobSummary(summary) {
  const confirmedAt = summary.savedAt || new Date().toISOString();
  return {
    id: summary.resultRowId ?? null,
    schema_version: summary.schemaVersion ?? null,
    normalized_takeoff_json: summary.normalizedTakeoffJson,
    computed_measurements_json: summary.computedMeasurementsJson ?? null,
    validation_diagnostics_json: summary.validationDiagnosticsJson ?? null,
    import_plan_json: summary.importPlanJson ?? null,
    review_status: summary.reviewStatus ?? "needs_review",
    created_at: confirmedAt,
    raw_ai_result_json: {
      _corrections: summary.lastCorrectionId
        ? [{ id: summary.lastCorrectionId, correctedAt: confirmedAt }]
        : [],
      _meta: {
        estimatorConfirmed:
          summary.estimatorConfirmed && typeof summary.estimatorConfirmed === "object"
            ? summary.estimatorConfirmed
            : {
                confirmedAt,
                confirmedByUserId: null,
                source: "job_result_summary"
              },
        ...(summary.reviewState ? { reviewState: summary.reviewState } : {})
      }
    }
  };
}

/**
 * Priority: approved → estimator-confirmed/saved draft → job summary estimator
 * fallback → latest AI/other.
 *
 * Critically: a newer raw AI row must never displace an older estimator-confirmed row,
 * and job.result_summary after a correction must outrank a pure AI table row when the
 * correction insert was blocked (quote_id NOT NULL fallback).
 *
 * @param {object[]} rows newest-first preferred
 * @param {{ jobResultSummary?: object|null }} [opts]
 * @returns {{ row: object|null, source: 'approved'|'estimator_draft'|'ai_draft'|'empty' }}
 */
export function selectAuthoritativeTakeoffResult(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const summary =
    opts.jobResultSummary && typeof opts.jobResultSummary === "object"
      ? opts.jobResultSummary
      : null;

  if (list.length === 0) {
    if (summary?.normalizedTakeoffJson && resultSummaryLooksEstimatorOwned(summary)) {
      return { row: resultRowFromJobSummary(summary), source: "estimator_draft" };
    }
    if (summary?.normalizedTakeoffJson) {
      return { row: resultRowFromJobSummary(summary), source: "ai_draft" };
    }
    return { row: null, source: "empty" };
  }

  const approved = list.find((r) => isApprovedTakeoffResult(r));
  if (approved) return { row: approved, source: "approved" };

  const estimator = list.find((r) => hasEstimatorSavedEdits(r));
  if (estimator) return { row: estimator, source: "estimator_draft" };

  // Table only has raw AI rows, but job.result_summary holds a successful correction.
  if (summary?.normalizedTakeoffJson && resultSummaryLooksEstimatorOwned(summary)) {
    return { row: resultRowFromJobSummary(summary), source: "estimator_draft" };
  }

  return { row: list[0], source: "ai_draft" };
}

/**
 * Read AI handling markers from a result row or job summary meta.
 * @param {object|null|undefined} row
 * @param {object|null|undefined} [jobResultSummary]
 */
export function readAiHandlingMeta(row, jobResultSummary = null) {
  const meta =
    row?.raw_ai_result_json &&
    typeof row.raw_ai_result_json === "object" &&
    row.raw_ai_result_json._meta &&
    typeof row.raw_ai_result_json._meta === "object"
      ? row.raw_ai_result_json._meta
      : {};
  const summaryMeta =
    jobResultSummary && typeof jobResultSummary === "object" ? jobResultSummary : {};
  const lastMergedAiResultId = String(
    meta.lastMergedAiResultId ?? summaryMeta.lastMergedAiResultId ?? ""
  ).trim() || null;
  const dismissedRaw = meta.dismissedAiResultIds ?? summaryMeta.dismissedAiResultIds ?? [];
  const dismissedAiResultIds = Array.isArray(dismissedRaw)
    ? [...new Set(dismissedRaw.map(String).filter(Boolean))]
    : [];
  return { lastMergedAiResultId, dismissedAiResultIds };
}

/**
 * True when a result row looks like AI-origin output (not a pure estimator correction).
 * @param {object|null|undefined} row
 */
export function isAiOriginTakeoffResult(row) {
  if (!row?.normalized_takeoff_json) return false;
  const meta =
    row.raw_ai_result_json &&
    typeof row.raw_ai_result_json === "object" &&
    row.raw_ai_result_json._meta &&
    typeof row.raw_ai_result_json._meta === "object"
      ? row.raw_ai_result_json._meta
      : {};
  if (meta.promptVersion || meta.modelUsed || meta.aiExtraction === true) return true;
  if (meta.unconfirmedAiFindings) return true;
  if (meta.aiDraftOnly === true) return true;
  // Pure AI rows lack estimatorConfirmed and lack _corrections.
  if (!hasEstimatorSavedEdits(row)) return true;
  return false;
}

function resultCreatedMs(row) {
  const ms = Date.parse(String(row?.created_at ?? ""));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Find a newer raw AI result that is still pending review against the authoritative draft.
 * Authoritative draft remains for editing; AI is returned separately.
 *
 * @param {object[]} rows newest-first
 * @param {object|null} authoritativeRow
 * @param {{ lastMergedAiResultId?: string|null, dismissedAiResultIds?: string[] }} [handling]
 */
export function findPendingAiTakeoffResult(rows, authoritativeRow, handling = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const authId = authoritativeRow?.id != null ? String(authoritativeRow.id) : null;
  const authMs = resultCreatedMs(authoritativeRow);
  const lastMerged = String(handling.lastMergedAiResultId ?? "").trim();
  const dismissed = new Set((handling.dismissedAiResultIds ?? []).map(String));

  for (const row of list) {
    const id = row?.id != null ? String(row.id) : "";
    if (!id) continue;
    if (authId && id === authId) continue;
    if (lastMerged && id === lastMerged) continue;
    if (dismissed.has(id)) continue;
    if (!isAiOriginTakeoffResult(row)) continue;
    if (!row.normalized_takeoff_json) continue;
    // Prefer AI rows that are newer than the authoritative estimator draft.
    if (authMs && resultCreatedMs(row) < authMs) continue;
    // If authoritative itself is pure AI, nothing is "pending" separately.
    if (
      authoritativeRow &&
      !hasEstimatorSavedEdits(authoritativeRow) &&
      isAiOriginTakeoffResult(authoritativeRow)
    ) {
      return null;
    }
    return {
      pendingAiAvailable: true,
      pendingAiResultId: id,
      pendingAiDraft: row.normalized_takeoff_json,
      pendingAiSavedAt: row.created_at ?? null,
      lastMergedAiResultId: lastMerged || null,
      dismissedAiResultIds: [...dismissed]
    };
  }
  return {
    pendingAiAvailable: false,
    pendingAiResultId: null,
    pendingAiDraft: null,
    pendingAiSavedAt: null,
    lastMergedAiResultId: lastMerged || null,
    dismissedAiResultIds: [...dismissed]
  };
}

/**
 * Compact read-only summary of AI findings for the pending banner list.
 * @param {object|null|undefined} takeoff
 */
export function summarizeAiFindingsPreview(takeoff) {
  const rooms = [];
  for (const room of Array.isArray(takeoff?.rooms) ? takeoff.rooms : []) {
    const pieces = [];
    const pushPiece = (run) => {
      const lengthIn = Number(run?.lengthIn) || 0;
      const depthIn = Number(run?.depthIn) || 0;
      const quantity = Number(run?.quantity) || 1;
      const sf =
        lengthIn > 0 && depthIn > 0
          ? Math.round(((lengthIn * depthIn) / 144) * quantity * 100) / 100
          : 0;
      pieces.push({
        id: String(run?.id ?? ""),
        name: String(run?.label ?? run?.name ?? "Piece"),
        lengthIn,
        depthIn,
        quantity,
        sf
      });
    };
    for (const run of Array.isArray(room?.runs) ? room.runs : []) pushPiece(run);
    for (const piece of Array.isArray(room?.pieces) ? room.pieces : []) pushPiece(piece);
    for (const area of Array.isArray(room?.areas) ? room.areas : []) {
      for (const run of Array.isArray(area?.runs) ? area.runs : []) pushPiece(run);
    }
    rooms.push({
      id: String(room?.id ?? ""),
      name: String(room?.name ?? "Room"),
      pieces
    });
  }
  return { rooms };
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
 * Collect run ids under a room (areas[].runs / runs / pieces).
 * @param {object|null|undefined} room
 */
export function collectRunIdsFromRoom(room) {
  const out = [];
  for (const run of Array.isArray(room?.runs) ? room.runs : []) {
    const id = String(run?.id ?? "").trim();
    if (id) out.push(id);
  }
  for (const piece of Array.isArray(room?.pieces) ? room.pieces : []) {
    const id = String(piece?.id ?? "").trim();
    if (id) out.push(id);
  }
  for (const area of Array.isArray(room?.areas) ? room.areas : []) {
    for (const run of Array.isArray(area?.runs) ? area.runs : []) {
      const id = String(run?.id ?? "").trim();
      if (id) out.push(id);
    }
  }
  return out;
}

/**
 * Strip hard-deleted rooms/runs from a takeoff draft (durable tombstones).
 * @param {object|null|undefined} takeoff
 * @param {{ deletedRoomIds?: Iterable<string>, deletedRunIds?: Iterable<string> }} tombstones
 */
export function applyDeletionTombstones(takeoff, tombstones = {}) {
  const deletedRooms = new Set(
    [...(tombstones.deletedRoomIds ?? [])].map(String).filter(Boolean)
  );
  const deletedRuns = new Set(
    [...(tombstones.deletedRunIds ?? [])].map(String).filter(Boolean)
  );
  if (!takeoff || typeof takeoff !== "object") {
    return { schemaVersion: "1.0", status: "draft", rooms: [] };
  }
  const base = structuredClone(takeoff);
  if (!Array.isArray(base.rooms)) base.rooms = [];
  if (deletedRooms.size === 0 && deletedRuns.size === 0) return base;

  base.rooms = base.rooms
    .filter((room) => {
      const id = String(room?.id ?? "").trim();
      return !id || !deletedRooms.has(id);
    })
    .map((room) => {
      const next = { ...room };
      if (Array.isArray(next.runs)) {
        next.runs = next.runs.filter((r) => !deletedRuns.has(String(r?.id ?? "")));
      }
      if (Array.isArray(next.pieces)) {
        next.pieces = next.pieces.filter((r) => !deletedRuns.has(String(r?.id ?? "")));
      }
      if (Array.isArray(next.areas)) {
        next.areas = next.areas.map((area) => ({
          ...area,
          runs: (area.runs ?? []).filter((r) => !deletedRuns.has(String(r?.id ?? "")))
        }));
      }
      return next;
    });
  return base;
}

/**
 * Remove a room and all child pieces from the draft.
 * @param {object} takeoff
 * @param {string} roomId
 */
export function removeRoomFromTakeoff(takeoff, roomId) {
  const id = String(roomId ?? "").trim();
  const base =
    takeoff && typeof takeoff === "object"
      ? structuredClone(takeoff)
      : { schemaVersion: "1.0", status: "draft", rooms: [] };
  if (!Array.isArray(base.rooms)) base.rooms = [];
  const room = base.rooms.find((r) => String(r?.id ?? "") === id);
  const deletedRunIds = room ? collectRunIdsFromRoom(room) : [];
  base.rooms = base.rooms.filter((r) => String(r?.id ?? "") !== id);
  return {
    takeoff: base,
    deletedRoomIds: id ? [id] : [],
    deletedRunIds
  };
}

/**
 * Remove a single piece/run; leave the room even if empty.
 * @param {object} takeoff
 * @param {string} roomId
 * @param {string} runId
 */
export function removePieceFromTakeoff(takeoff, roomId, runId) {
  const rid = String(runId ?? "").trim();
  const roomKey = String(roomId ?? "").trim();
  const base =
    takeoff && typeof takeoff === "object"
      ? structuredClone(takeoff)
      : { schemaVersion: "1.0", status: "draft", rooms: [] };
  if (!Array.isArray(base.rooms)) base.rooms = [];
  base.rooms = base.rooms.map((room) => {
    if (String(room?.id ?? "") !== roomKey) return room;
    return {
      ...room,
      runs: Array.isArray(room.runs)
        ? room.runs.filter((r) => String(r?.id ?? "") !== rid)
        : room.runs,
      pieces: Array.isArray(room.pieces)
        ? room.pieces.filter((r) => String(r?.id ?? "") !== rid)
        : room.pieces,
      areas: (room.areas ?? []).map((area) => ({
        ...area,
        runs: (area.runs ?? []).filter((r) => String(r?.id ?? "") !== rid)
      }))
    };
  });
  return {
    takeoff: base,
    deletedRoomIds: [],
    deletedRunIds: rid ? [rid] : []
  };
}

/**
 * Merge a new AI draft into confirmed estimator geometry.
 * Precedence: deletion tombstones → estimator-owned → AI append → empty.
 *
 * @param {object} confirmedTakeoff normalized_takeoff_json
 * @param {object} aiTakeoff normalized_takeoff_json
 * @param {{ deletedRoomIds?: Iterable<string>, deletedRunIds?: Iterable<string> }} [opts]
 * @returns {{ merged: object, unconfirmedAiFindings: object }}
 */
export function mergeAiDraftPreservingConfirmed(confirmedTakeoff, aiTakeoff, opts = {}) {
  const deletedRoomIds = new Set(
    [...(opts.deletedRoomIds ?? [])].map(String).filter(Boolean)
  );
  const deletedRunIds = new Set(
    [...(opts.deletedRunIds ?? [])].map(String).filter(Boolean)
  );

  const base = applyDeletionTombstones(
    confirmedTakeoff && typeof confirmedTakeoff === "object"
      ? confirmedTakeoff
      : { rooms: [] },
    { deletedRoomIds, deletedRunIds }
  );
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
    // Estimator deleted this room — never re-append.
    if (roomId && deletedRoomIds.has(roomId)) continue;

    if (roomId && confirmedRoomIds.has(roomId)) {
      const target = base.rooms.find((r) => String(r?.id ?? "") === roomId);
      if (!target) continue;
      const slot = listRoomRuns(target);
      for (const run of listAiRoomRuns(aiRoom)) {
        const rid = String(run?.id ?? "").trim();
        if (rid && deletedRunIds.has(rid)) continue;
        if (rid && confirmedRunIds.has(rid)) continue;
        if (rid) confirmedRunIds.add(rid);
        const draftRun = { ...run, _aiUnconfirmed: true };
        slot.container[slot.key].push(draftRun);
        unconfirmedRuns.push({ roomId, runId: rid || null });
      }
      continue;
    }
    if (roomName && confirmedNames.has(roomName)) {
      // Name match without id match — do not replace confirmed room.
      continue;
    }
    // Filter deleted runs inside a new AI room before append.
    const draftRoom = { ...structuredClone(aiRoom), _aiUnconfirmed: true };
    if (Array.isArray(draftRoom.runs)) {
      draftRoom.runs = draftRoom.runs.filter((r) => !deletedRunIds.has(String(r?.id ?? "")));
    }
    if (Array.isArray(draftRoom.pieces)) {
      draftRoom.pieces = draftRoom.pieces.filter((r) => !deletedRunIds.has(String(r?.id ?? "")));
    }
    if (Array.isArray(draftRoom.areas)) {
      draftRoom.areas = draftRoom.areas.map((area) => ({
        ...area,
        runs: (area.runs ?? []).filter((r) => !deletedRunIds.has(String(r?.id ?? "")))
      }));
    }
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

/**
 * Client Save & merge: keep estimator draft, honor tombstones, append AI-only findings.
 * @param {object} localDraft
 * @param {object|null|undefined} serverAiTakeoff
 * @param {{ deletedRoomIds?: Iterable<string>, deletedRunIds?: Iterable<string> }} [opts]
 */
export function saveMergeTakeoffDrafts(localDraft, serverAiTakeoff, opts = {}) {
  const local =
    localDraft && typeof localDraft === "object"
      ? localDraft
      : { schemaVersion: "1.0", status: "draft", rooms: [] };
  if (!serverAiTakeoff || typeof serverAiTakeoff !== "object") {
    return {
      merged: applyDeletionTombstones(local, opts),
      unconfirmedAiFindings: { rooms: [], runs: [], addedAt: new Date().toISOString() }
    };
  }
  return mergeAiDraftPreservingConfirmed(local, serverAiTakeoff, opts);
}
