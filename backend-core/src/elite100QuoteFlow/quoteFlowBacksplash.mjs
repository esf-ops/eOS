/**
 * Carry Review Takeoff backsplash eligibility onto Official Estimate rooms.
 * Mirrors open-edge stamp: afterEnsure must not leave stale includeBacksplash / SF.
 */

import { deriveRoomBacksplashFromImportRoom } from "../elite100EstimateStudio/studioRoomBacksplash.mjs";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Flatten takeoffResult rooms/areas/runs into import-shaped rooms for backsplash derive.
 * @param {object|null|undefined} takeoffResult
 */
export function collectImportRoomsFromTakeoffResult(takeoffResult) {
  if (!takeoffResult || typeof takeoffResult !== "object") return [];
  const rooms = Array.isArray(takeoffResult.rooms) ? takeoffResult.rooms : [];
  return rooms.map((room, roomIdx) => {
    const pieces = [];
    for (const area of Array.isArray(room?.areas) ? room.areas : []) {
      for (const run of Array.isArray(area?.runs) ? area.runs : []) {
        if (!run || typeof run !== "object") continue;
        const lengthIn = Number(run.lengthIn) || 0;
        const depthIn = Number(run.depthIn) || 0;
        const qty = Math.max(1, Number(run.quantity) || 1);
        const eligible = run.backsplashEligible === true;
        const eligibleLen =
          Number(run.backsplashEligibleLengthIn) ||
          (eligible ? lengthIn : 0);
        pieces.push({
          id: String(run.id || "").trim() || null,
          takeoffRunId: String(run.id || "").trim() || null,
          name: String(run.label || run.name || "").trim() || "Piece",
          pieceType: run.pieceType || "counter",
          lengthIn,
          depthIn,
          quantity: qty,
          included: run.included !== false,
          sqft: round2((lengthIn * depthIn * qty) / 144),
          backsplashEligible: eligible,
          backsplashEligibleLengthIn: eligibleLen > 0 ? eligibleLen : undefined,
          cookingAppliance: run.cookingAppliance || null,
          cutouts: Array.isArray(run.cutouts) ? run.cutouts : undefined,
          waterfallPanels: Array.isArray(run.waterfallPanels) ? run.waterfallPanels : undefined,
          backsplash: {
            eligible,
            type: eligible ? "eligible" : "none",
            linearIn: eligible ? eligibleLen || lengthIn : 0,
            heightIn:
              run.backsplashHeightIn != null
                ? Number(run.backsplashHeightIn)
                : run.backsplash?.heightIn != null
                  ? Number(run.backsplash.heightIn)
                  : null,
            sqft: Number(run.backsplash?.sqft) || 0
          }
        });
      }
    }
    const eligibleBacksplashLengthIn = pieces
      .filter((p) => p.backsplashEligible)
      .reduce((s, p) => s + (Number(p.backsplashEligibleLengthIn) || Number(p.lengthIn) || 0), 0);
    return {
      id: String(room?.id || "").trim() || `room-${roomIdx}`,
      name: String(room?.name || "").trim() || `Room ${roomIdx + 1}`,
      roomType: room?.roomType || "Kitchen",
      included: room?.included !== false,
      eligibleBacksplashLengthIn:
        eligibleBacksplashLengthIn > 0 ? round2(eligibleBacksplashLengthIn) : 0,
      pieces
    };
  });
}

function roomKey(room) {
  const id = String(room?.id || room?.takeoffRoomId || "").trim();
  if (id) return `id:${id}`;
  const name = String(room?.name || "")
    .trim()
    .toLowerCase();
  return name ? `name:${name}` : "";
}

/**
 * Re-apply takeoff backsplash fields onto official rooms (match by id/name).
 * @param {unknown} rooms
 * @param {object|null|undefined} takeoffResult
 */
export function applyTakeoffBacksplashToOfficialRooms(rooms, takeoffResult = null) {
  const importRooms = collectImportRoomsFromTakeoffResult(takeoffResult);
  if (!Array.isArray(rooms) || importRooms.length === 0) {
    return Array.isArray(rooms) ? rooms : [];
  }
  /** @type {Map<string, object>} */
  const byKey = new Map();
  for (const ir of importRooms) {
    const k = roomKey(ir);
    if (k) byKey.set(k, ir);
  }

  return rooms.map((room) => {
    if (!room || typeof room !== "object") return room;
    const k = roomKey(room);
    const importRoom = (k && byKey.get(k)) || null;
    if (!importRoom) return room;
    const derived = deriveRoomBacksplashFromImportRoom(importRoom);
    return {
      ...room,
      includeBacksplash: derived.includeBacksplash,
      backsplashHeightIn: derived.backsplashHeightIn,
      backsplashMeasuredLengthIn: derived.backsplashMeasuredLengthIn,
      backsplashSqft: derived.backsplashSqft,
      backsplashHeightMode: derived.backsplashHeightMode,
      backsplashSource: derived.backsplashSource || "estimator"
    };
  });
}

/**
 * Carry length/depth/qty/name/inclusion from takeoff runs onto matched official pieces.
 * @param {unknown} rooms
 * @param {object|null|undefined} takeoffResult
 */
export function applyTakeoffPieceGeometryToOfficialRooms(rooms, takeoffResult = null) {
  const importRooms = collectImportRoomsFromTakeoffResult(takeoffResult);
  if (!Array.isArray(rooms) || importRooms.length === 0) {
    return Array.isArray(rooms) ? rooms : [];
  }
  /** @type {Map<string, object>} */
  const pieceByKey = new Map();
  for (const ir of importRooms) {
    for (const p of ir.pieces || []) {
      const id = String(p.id || p.takeoffRunId || "").trim();
      const name = String(p.name || "")
        .trim()
        .toLowerCase();
      if (id) pieceByKey.set(`id:${id}`, p);
      if (name) pieceByKey.set(`name:${name}`, p);
    }
  }

  return rooms.map((room) => {
    if (!room || typeof room !== "object") return room;
    const pieces = Array.isArray(room.pieces)
      ? room.pieces.map((piece) => {
          if (!piece || typeof piece !== "object") return piece;
          const runId = String(piece.takeoffRunId || piece.runId || piece.id || "").trim();
          const name = String(piece.name || piece.label || "")
            .trim()
            .toLowerCase();
          let src = null;
          if (runId && pieceByKey.has(`id:${runId}`)) src = pieceByKey.get(`id:${runId}`);
          else if (name && pieceByKey.has(`name:${name}`)) src = pieceByKey.get(`name:${name}`);
          if (!src) return piece;
          const lengthIn = Number(src.lengthIn) || 0;
          const depthIn = Number(src.depthIn) || 0;
          const quantity = Math.max(1, Number(src.quantity) || 1);
          const sqft = round2((lengthIn * depthIn * quantity) / 144);
          return {
            ...piece,
            name: src.name || piece.name,
            lengthIn,
            depthIn,
            quantity,
            included: src.included !== false,
            sqft,
            ...(src.cookingAppliance != null
              ? { cookingAppliance: src.cookingAppliance }
              : {})
          };
        })
      : [];
    const countertopSqft = pieces
      .filter((p) => p?.included !== false)
      .filter((p) => !String(p?.pieceType || "").toLowerCase().includes("backsplash"))
      .reduce((s, p) => s + (Number(p.sqft) || 0), 0);
    return { ...room, pieces, countertopSqft: round2(countertopSqft) };
  });
}
