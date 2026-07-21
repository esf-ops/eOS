/**
 * Consolidated Takeoff worksheet — pure row/update helpers.
 *
 * Row identity contract: every room, area, and run carries a draft-wide-unique id
 * (enforced by ensureUniqueTakeoffIdentity at AI normalization and at workspace
 * hydration). Update helpers here additionally scope by room and area so a patch
 * can only ever land on exactly one run.
 *
 * Pure functions — no I/O, no React. Safe for browser + Node tests.
 */

/** Rounded square feet from length × depth inches. */
export function sfFrom(lengthIn, depthIn) {
  const l = Number(lengthIn) || 0;
  const d = Number(depthIn) || 0;
  if (l <= 0 || d <= 0) return 0;
  return Math.round(((l * d) / 144) * 100) / 100;
}

/**
 * Flatten rooms/areas/runs into worksheet rows.
 * Row key = `${roomId}:${areaId}:${runId}` — unique per row given unique run ids.
 *
 * @param {object|null|undefined} result normalized takeoff JSON
 * @param {Set<string>} excludedRunIds
 */
export function flattenPieces(result, excludedRunIds) {
  const rows = [];
  for (const room of result?.rooms ?? []) {
    for (const area of room.areas ?? []) {
      for (const run of area.runs ?? []) {
        const cutouts = run.cutouts || {};
        const parts = Object.entries(cutouts)
          .filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => `${k}:${v}`);
        rows.push({
          key: `${room.id}:${area.id}:${run.id}`,
          roomId: room.id,
          roomName: room.name || "Room",
          areaId: area.id,
          runId: run.id,
          pieceName: run.label || area.label || "Piece",
          lengthIn: Number(run.lengthIn) || 0,
          depthIn: Number(run.depthIn) || 0,
          quantity: Number(run.quantity) || 1,
          countertopSf: sfFrom(Number(run.lengthIn) || 0, Number(run.depthIn) || 0),
          backsplashHeightIn: Number(area.backsplashHeightIn ?? area.backsplashHeight ?? 0) || 0,
          included: !excludedRunIds.has(run.id),
          cutoutsLabel: parts.join(", "),
          note: String(run.notes?.[0] ?? run.note ?? ""),
          lowConfidence:
            Boolean(run.requiresEstimatorReview) ||
            String(run.confidence ?? "").toLowerCase() === "low"
        });
      }
    }
  }
  return rows;
}

/**
 * Immutably patch exactly one run, located by room + area + run id.
 * areaId is part of the locator so even a (never-expected) cross-area id
 * collision cannot fan an edit out to another row.
 *
 * @param {object} result
 * @param {{ roomId: string, areaId?: string|null, runId: string }} locator
 * @param {Record<string, unknown>} patch
 */
export function patchRun(result, locator, patch) {
  const { roomId, areaId, runId } = locator;
  return {
    ...result,
    rooms: (result.rooms ?? []).map((room) => {
      if (room.id !== roomId) return room;
      return {
        ...room,
        areas: (room.areas ?? []).map((area) => {
          if (areaId != null && area.id !== areaId) return area;
          return {
            ...area,
            runs: (area.runs ?? []).map((run) =>
              run.id === runId ? { ...run, ...patch } : run
            )
          };
        })
      };
    })
  };
}

/**
 * Rename a room. Intentionally room-wide: the room header renames the room
 * (and therefore every child piece's room label) — distinct from piece edits.
 *
 * @param {object} result
 * @param {string} roomId
 * @param {string} name
 */
export function renameRoom(result, roomId, name) {
  return {
    ...result,
    rooms: (result.rooms ?? []).map((room) =>
      room.id === roomId ? { ...room, name } : room
    )
  };
}

/**
 * Move exactly one run from one room to another (first area of the target room).
 *
 * @param {object} result
 * @param {string} fromRoomId
 * @param {string} runId
 * @param {string} toRoomId
 */
export function reassignRun(result, fromRoomId, runId, toRoomId) {
  if (fromRoomId === toRoomId) return result;
  let moved = null;
  const stripped = {
    ...result,
    rooms: (result.rooms ?? []).map((room) => {
      if (room.id !== fromRoomId) return room;
      return {
        ...room,
        areas: (room.areas ?? []).map((area) => ({
          ...area,
          runs: (area.runs ?? []).filter((r) => {
            if (!moved && r.id === runId) {
              moved = r;
              return false;
            }
            return true;
          })
        }))
      };
    })
  };
  if (!moved) return result;
  return {
    ...stripped,
    rooms: (stripped.rooms ?? []).map((room) => {
      if (room.id !== toRoomId) return room;
      const areas =
        room.areas?.length > 0
          ? [...room.areas]
          : [{ id: `${room.id}-a1`, label: "Main", runs: [], backsplashScope: "stone" }];
      areas[0] = { ...areas[0], runs: [...(areas[0].runs ?? []), moved] };
      return { ...room, areas };
    })
  };
}
