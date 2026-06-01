/**
 * eliteOS AI Takeoff — import planner.
 *
 * Maps an approved TakeoffResult → an import plan compatible with
 * RoomScopeBuilder (app-quote/src/ui/RoomScopeBuilder.tsx) guided shape groups.
 *
 * DOES NOT mutate any quote state. Returns a plain import plan object that future
 * UI code can inspect and optionally apply.
 *
 * Design principles:
 *   - One TakeoffRoom → one RoomScopeBuilder room draft skeleton.
 *   - One TakeoffArea → one or more GuidedShapeGroup entries.
 *   - Runs within an area → GuidedPiece entries.
 *   - If a shape cannot be cleanly represented, a warning is returned instead of
 *     forcing a malformed import.
 *   - Corner deductions from the takeoff flow into the group's overlapMode.
 *   - Backsplash linear inches (not run-by-run) map to a separate Backsplash group.
 *
 * Supported area → shape group mappings:
 *   1 counter run           → "straight" group
 *   2 counter runs          → "L-Shape" group (overlapMode: auto)
 *   3 counter runs          → "U-Shape" group (overlapMode: auto)
 *   ≥4 counter runs         → "manual" group with warning
 *   all splash/fhb runs     → "Backsplash" or "Waterfall" group
 *   backsplashLinearIn area → "Backsplash" group (single splash run)
 */

import { TAKEOFF_DIAGNOSTIC_LEVEL, TAKEOFF_DIAGNOSTIC_CODE, TAKEOFF_STATUS } from "./takeoffContract.mjs";

const { WARNING, INFO } = TAKEOFF_DIAGNOSTIC_LEVEL;
const C = TAKEOFF_DIAGNOSTIC_CODE;

const STANDARD_COUNTER_DEPTH_IN = 25.5;
const STANDARD_BACKSPLASH_HEIGHT_IN = 4;

function diag(level, code, message, path) {
  const d = { level, code, message };
  if (path) d.path = path;
  return d;
}

/**
 * Map a pieceType string from the takeoff contract to a RoomScopeBuilder pieceType.
 * @param {string} [pieceType]
 * @param {boolean} [isBacksplash]
 * @returns {"counter"|"splash"|"fhb"}
 */
function resolvePieceType(pieceType, isBacksplash) {
  if (pieceType === "splash" || isBacksplash) return "splash";
  if (pieceType === "fhb") return "fhb";
  return "counter";
}

/**
 * Select the best GuidedShapeGroupType for a set of counter runs.
 * Returns { shapeType, overlapMode, warning? }
 * @param {number} counterRunCount
 * @param {string} areaLabel
 * @param {string} areaPath
 * @returns {{ shapeType: string, overlapMode: string, warning?: object }}
 */
function shapeTypeForCounterRuns(counterRunCount, areaLabel, areaPath) {
  if (counterRunCount <= 1) return { shapeType: "straight", overlapMode: "none" };
  if (counterRunCount === 2) return { shapeType: "L-Shape", overlapMode: "auto" };
  if (counterRunCount === 3) return { shapeType: "U-Shape", overlapMode: "auto" };
  return {
    shapeType: "manual",
    overlapMode: "none",
    warning: diag(
      WARNING,
      C.UNSUPPORTED_SHAPE,
      `Area "${areaLabel}": ${counterRunCount} counter runs mapped to "manual" shape group — review corner overlaps manually.`,
      `${areaPath}.runs`
    )
  };
}

/**
 * Map a single TakeoffArea to one or two ImportPlanGroup entries.
 *
 * @param {import('./takeoffContract.mjs').TakeoffArea} area
 * @param {string} areaPath
 * @returns {{ groups: ImportPlanGroup[], warnings: object[] }}
 *
 * @typedef {Object} ImportPlanGroup
 * @property {string} label   What to name the GuidedShapeGroup
 * @property {string} shapeType
 * @property {string} overlapMode
 * @property {"include"|"exclude"} backsplashMode
 * @property {ImportPlanPiece[]} pieces
 * @property {string[]} [notes]
 * @property {string[]} [assumptions]
 * @property {number[]} [sourcePages]
 *
 * @typedef {Object} ImportPlanPiece
 * @property {string} label
 * @property {"counter"|"splash"|"fhb"} pieceType
 * @property {number} lengthIn
 * @property {number} depthIn
 * @property {"rect"|"tri"} shape
 * @property {boolean} [addSplash]
 */
function planArea(area, areaPath) {
  const groups = [];
  const warnings = [];
  const runs = area.runs ?? [];

  const counterRuns = runs.filter((r) => resolvePieceType(r.pieceType, r.isBacksplash) === "counter");
  const splashRuns = runs.filter((r) => resolvePieceType(r.pieceType, r.isBacksplash) === "splash");
  const fhbRuns = runs.filter((r) => resolvePieceType(r.pieceType, r.isBacksplash) === "fhb");

  // Counter runs → shaped group
  if (counterRuns.length > 0) {
    const { shapeType, overlapMode, warning } = shapeTypeForCounterRuns(counterRuns.length, area.label, areaPath);
    if (warning) warnings.push(warning);

    const hasBsRuns = splashRuns.length > 0;
    const hasLinearBs = (area.backsplashLinearIn ?? 0) > 0;
    // backsplashMode: exclude only when area explicitly has no backsplash
    const backsplashMode = (area.backsplashIncluded === false) ? "exclude" : "include";

    const pieces = counterRuns.map((r) => ({
      label: r.label,
      pieceType: "counter",
      lengthIn: Number(r.lengthIn) || 0,
      depthIn: Number(r.depthIn) || STANDARD_COUNTER_DEPTH_IN,
      shape: r.shape ?? "rect",
      ...(r.notes?.length && { notes: r.notes })
    }));

    // If area has splash runs co-located (not a separate backsplash area), fold them in.
    if (hasBsRuns && !hasLinearBs) {
      for (const r of splashRuns) {
        pieces.push({
          label: r.label,
          pieceType: "splash",
          lengthIn: Number(r.lengthIn) || 0,
          depthIn: Number(r.depthIn) || STANDARD_BACKSPLASH_HEIGHT_IN,
          shape: r.shape ?? "rect"
        });
      }
    }

    const group = {
      label: area.label,
      shapeType,
      overlapMode,
      backsplashMode,
      pieces,
      ...(area.notes?.length && { notes: area.notes }),
      ...(area.assumptions?.length && { assumptions: area.assumptions }),
      ...(area.sourcePages?.length && { sourcePages: area.sourcePages })
    };
    groups.push(group);

    // If backsplash is expressed as linear inches, add a separate Backsplash group.
    if (hasLinearBs) {
      const heightIn = area.backsplashHeightIn ?? STANDARD_BACKSPLASH_HEIGHT_IN;
      groups.push({
        label: `${area.label} — Backsplash`,
        shapeType: "Backsplash",
        overlapMode: "none",
        backsplashMode: "include",
        pieces: [{
          label: "4\" backsplash",
          pieceType: "splash",
          lengthIn: Number(area.backsplashLinearIn),
          depthIn: heightIn,
          shape: "rect"
        }],
        ...(area.sourcePages?.length && { sourcePages: area.sourcePages })
      });
    }
  } else if (splashRuns.length > 0) {
    // Splash-only area
    groups.push({
      label: area.label,
      shapeType: "Backsplash",
      overlapMode: "none",
      backsplashMode: "include",
      pieces: splashRuns.map((r) => ({
        label: r.label,
        pieceType: "splash",
        lengthIn: Number(r.lengthIn) || 0,
        depthIn: Number(r.depthIn) || STANDARD_BACKSPLASH_HEIGHT_IN,
        shape: r.shape ?? "rect"
      })),
      ...(area.sourcePages?.length && { sourcePages: area.sourcePages })
    });
  } else if (fhbRuns.length > 0) {
    groups.push({
      label: area.label,
      shapeType: "Waterfall",
      overlapMode: "none",
      backsplashMode: "include",
      pieces: fhbRuns.map((r) => ({
        label: r.label,
        pieceType: "fhb",
        lengthIn: Number(r.lengthIn) || 0,
        depthIn: Number(r.depthIn) || 96,
        shape: r.shape ?? "rect"
      })),
      ...(area.sourcePages?.length && { sourcePages: area.sourcePages })
    });
  } else if ((area.backsplashLinearIn ?? 0) > 0) {
    // Backsplash-only area with linear inches
    const heightIn = area.backsplashHeightIn ?? STANDARD_BACKSPLASH_HEIGHT_IN;
    groups.push({
      label: area.label,
      shapeType: "Backsplash",
      overlapMode: "none",
      backsplashMode: "include",
      pieces: [{
        label: "4\" backsplash",
        pieceType: "splash",
        lengthIn: Number(area.backsplashLinearIn),
        depthIn: heightIn,
        shape: "rect"
      }],
      ...(area.sourcePages?.length && { sourcePages: area.sourcePages })
    });
  } else {
    warnings.push(diag(WARNING, C.EMPTY_AREA, `Area "${area.label}": no runs or backsplash linear inches — skipped in import plan.`, areaPath));
  }

  return { groups, warnings };
}

/**
 * Plan the import of a single TakeoffRoom.
 *
 * @param {import('./takeoffContract.mjs').TakeoffRoom} room
 * @param {string} roomPath
 * @returns {ImportPlanRoom}
 *
 * @typedef {Object} ImportPlanRoom
 * @property {string} roomId      Source takeoff room id
 * @property {string} name
 * @property {string} [roomType]
 * @property {string} calcMode   Always "Guided Shape" for takeoff imports
 * @property {ImportPlanGroup[]} guidedShapeGroups
 * @property {string[]} [notes]
 * @property {string[]} [assumptions]
 * @property {number[]} [sourcePages]
 * @property {import('./takeoffContract.mjs').TakeoffDiagnostic[]} warnings
 */
function planRoom(room, roomPath) {
  const allGroups = [];
  const allWarnings = [];

  if (!room.name?.trim()) {
    allWarnings.push(diag(WARNING, C.MISSING_ROOM_NAME, `Room at ${roomPath} has no name — a name must be set before import.`, `${roomPath}.name`));
  }

  for (let i = 0; i < (room.areas ?? []).length; i++) {
    const { groups, warnings } = planArea(room.areas[i], `${roomPath}.areas[${i}]`);
    allGroups.push(...groups);
    allWarnings.push(...warnings);
  }

  return {
    roomId: room.id,
    name: room.name ?? "",
    calcMode: "Guided Shape",
    guidedShapeGroups: allGroups,
    ...(room.roomType && { roomType: room.roomType }),
    ...(room.notes?.length && { notes: room.notes }),
    ...(room.assumptions?.length && { assumptions: room.assumptions }),
    ...(room.sourcePages?.length && { sourcePages: room.sourcePages }),
    warnings: allWarnings
  };
}

/**
 * Map an approved TakeoffResult to a RoomScopeBuilder-compatible import plan.
 * Does NOT mutate any quote state.
 *
 * @param {import('./takeoffContract.mjs').TakeoffResult} takeoffResult
 * @param {import('./takeoffMeasurementCalc.mjs').TakeoffComputedMeasurements} computed
 * @returns {TakeoffImportPlan}
 *
 * @typedef {Object} TakeoffImportPlan
 * @property {boolean} canImport   false if status is not reviewed/approved or has blocking errors
 * @property {string} [blockedReason]
 * @property {ImportPlanRoom[]} rooms
 * @property {import('./takeoffContract.mjs').TakeoffDiagnostic[]} warnings
 * @property {{ countertopExactSf: number, backsplashExactSf: number, combinedExactSf: number }} computedSf
 */
export function planTakeoffImport(takeoffResult, computed) {
  const allWarnings = [];

  // Status gate
  const importableStatuses = [TAKEOFF_STATUS.REVIEWED, TAKEOFF_STATUS.APPROVED];
  if (!importableStatuses.includes(takeoffResult.status)) {
    return {
      canImport: false,
      blockedReason: `Takeoff status is "${takeoffResult.status}" — set to "reviewed" or "approved" before importing.`,
      rooms: [],
      warnings: [],
      computedSf: {
        countertopExactSf: computed.countertopExactSf,
        backsplashExactSf: computed.backsplashExactSf,
        combinedExactSf: computed.combinedExactSf
      }
    };
  }

  const rooms = [];
  for (let i = 0; i < (takeoffResult.rooms ?? []).length; i++) {
    const planned = planRoom(takeoffResult.rooms[i], `rooms[${i}]`);
    rooms.push(planned);
    allWarnings.push(...planned.warnings);
  }

  if (rooms.length === 0) {
    allWarnings.push(diag(WARNING, C.MISSING_ROOMS, "No rooms produced an import plan.", "rooms"));
  }

  return {
    canImport: true,
    rooms,
    warnings: allWarnings,
    computedSf: {
      countertopExactSf: computed.countertopExactSf,
      backsplashExactSf: computed.backsplashExactSf,
      combinedExactSf: computed.combinedExactSf
    }
  };
}
