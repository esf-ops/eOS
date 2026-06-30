/**
 * reviewedTakeoffMath — single source of truth for reviewed takeoff totals and breakdowns.
 *
 * Pure functions: no I/O. Used by Measurement Summary, room cards, import preview checks,
 * and approval consistency validation.
 *
 * @module reviewedTakeoffMath
 */

import { applyReviewFiltersToTakeoffResult, classifyBacksplashTotals } from "./takeoffApprovalGate.mjs";
import {
  computeAreaSf,
  computeRoomSf,
  computeTakeoffMeasurements,
  sfFromRun,
} from "./takeoffMeasurementCalc.mjs";
import { normalizeReviewState } from "./takeoffReviewStatus.mjs";

/** Rounding tolerance for cross-surface total consistency checks (sf). */
export const MATH_ROUND_TOLERANCE = 0.02;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function excludedSet(reviewState) {
  return new Set(reviewState?.excludedRunIds ?? []);
}

function excludedRoomSet(reviewState) {
  return new Set(reviewState?.excludedRoomIds ?? []);
}

function manualRunSet(reviewState) {
  return new Set(reviewState?.manualRunIds ?? []);
}

function manualRoomSet(reviewState) {
  return new Set(reviewState?.manualRoomIds ?? []);
}

function isNoStoneScope(area) {
  return area.backsplashScope === "no_stone" || area.backsplashScope === "tile_by_others";
}

function isUnknownRoom(room) {
  const name = String(room?.name ?? "").trim().toLowerCase();
  const type = String(room?.roomType ?? room?.type ?? "").trim().toLowerCase();
  return (
    type === "unknown" ||
    name === "unknown" ||
    name === "unassigned" ||
    name.startsWith("unknown ") ||
    name.includes("unassigned")
  );
}

/**
 * Human-friendly backsplash scope label for estimator UI.
 *
 * @param {string|null|undefined} scope
 * @param {number|null|undefined} [heightIn]
 */
export function formatBacksplashScopeLabel(scope, heightIn) {
  const s = String(scope ?? "")
    .trim()
    .toLowerCase();
  const h = Number(heightIn);

  if (!s || s === "unknown" || s === "needs_review" || s === "null") {
    if (Number.isFinite(h) && h > 0) {
      if (h >= 48) return "Full-height backsplash";
      if (h > 4.5) return "Custom-height backsplash";
      return "4\" backsplash";
    }
    return "Needs review";
  }

  if (["none", "no_stone", "no_backsplash", "tile_by_others"].includes(s)) {
    return "No stone backsplash";
  }
  if (["full_height", "fhbs"].includes(s)) return "Full-height backsplash";
  if (["high", "custom_height"].includes(s)) return "Custom-height backsplash";
  if (["standard", "standard_4", "four_inch", "stone"].includes(s)) {
    if (h >= 48) return "Full-height backsplash";
    if (h > 4.5) return "Custom-height backsplash";
    return "4\" backsplash";
  }

  if (Number.isFinite(h) && h > 0) {
    if (h >= 48) return "Full-height backsplash";
    if (h > 4.5) return "Custom-height backsplash";
    return "4\" backsplash";
  }

  return "Needs review";
}

/**
 * @param {string|null|undefined} pieceType
 * @param {boolean} [isBacksplash]
 */
export function formatPieceTypeLabel(pieceType, isBacksplash = false) {
  const pt = String(pieceType ?? (isBacksplash ? "splash" : "counter")).toLowerCase();
  switch (pt) {
    case "counter":
      return "Countertop run";
    case "splash":
      return "Backsplash line";
    case "fhb":
      return "Full-height panel";
    case "island":
      return "Island";
    default:
      return pt.charAt(0).toUpperCase() + pt.slice(1);
  }
}

/**
 * Filter runs excluded by review state while keeping the area shell.
 *
 * @param {import("./takeoffContract.mjs").TakeoffArea} area
 * @param {Set<string>} excludedRunIds
 */
function areaWithIncludedRuns(area, excludedRunIds) {
  return {
    ...area,
    runs: (area.runs ?? []).filter((r) => !excludedRunIds.has(r.id)),
  };
}

/**
 * Whether an area has no included scope and needs estimator review.
 *
 * @param {import("./takeoffContract.mjs").TakeoffArea} area
 * @param {Set<string>} excludedRunIds
 */
export function areaNeedsReview(area, excludedRunIds = new Set()) {
  if (isNoStoneScope(area)) return false;
  const includedRuns = (area.runs ?? []).filter((r) => !excludedRunIds.has(r.id));
  const hasLinear = (area.backsplashLinearIn ?? 0) > 0;
  const hasManual = (area.backsplashManualSf ?? 0) > 0;
  if (includedRuns.length > 0 || hasLinear || hasManual) return false;
  return true;
}

/**
 * Compute reviewed takeoff math from full draft + review state.
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} takeoffResult
 * @param {import("./takeoffReviewStatus.mjs").TakeoffReviewState} [reviewState]
 */
export function computeReviewedTakeoffMath(takeoffResult, reviewState = null) {
  const rs = reviewState ? normalizeReviewState(reviewState) : normalizeReviewState({});
  const excludedRuns = excludedSet(rs);
  const excludedRooms = excludedRoomSet(rs);
  const manualRuns = manualRunSet(rs);
  const manualRooms = manualRoomSet(rs);

  const filtered = applyReviewFiltersToTakeoffResult(takeoffResult, rs);
  const computed = computeTakeoffMeasurements(filtered);
  const bsClassified = classifyBacksplashTotals(takeoffResult, rs);

  const totalBacksplashSqft = round2(computed.backsplashExactSf + computed.fhbExactSf);

  /** @type {Array<object>} */
  const activeRooms = [];
  /** @type {Array<object>} */
  const excludedRoomsBreakdown = [];
  /** @type {Array<object>} */
  const unassignedItems = [];

  for (let roomIdx = 0; roomIdx < (takeoffResult.rooms ?? []).length; roomIdx++) {
    const room = takeoffResult.rooms[roomIdx];
    const roomExcluded = excludedRooms.has(room.id);

    const filteredRoom = {
      ...room,
      areas: (room.areas ?? []).map((area) => areaWithIncludedRuns(area, excludedRuns)),
    };
    const roomSf = computeRoomSf(filteredRoom);

    if (roomExcluded) {
      excludedRoomsBreakdown.push({
        roomId: room.id,
        roomIdx,
        roomName: room.name,
        manual: manualRooms.has(room.id),
        countertopSf: roomSf.countertopSf,
        backsplashSf: round2(roomSf.backsplashSf + roomSf.fhbSf),
        combinedSf: roomSf.totalSf,
      });
      continue;
    }

    /** @type {Array<object>} */
    const areas = [];
    for (let areaIdx = 0; areaIdx < (room.areas ?? []).length; areaIdx++) {
      const area = room.areas[areaIdx];
      const areaForSf = areaWithIncludedRuns(area, excludedRuns);
      const areaSf = computeAreaSf(areaForSf);
      const hasSplashRuns = (areaForSf.runs ?? []).some(
        (r) => (r.pieceType ?? (r.isBacksplash ? "splash" : "counter")) !== "counter"
      );
      const areaLevelBsSf =
        !isNoStoneScope(area) && !hasSplashRuns
          ? round2(areaSf.backsplashSf + areaSf.fhbSf)
          : 0;

      /** @type {Array<object>} */
      const pieces = [];
      for (let runIdx = 0; runIdx < (area.runs ?? []).length; runIdx++) {
        const run = area.runs[runIdx];
        const excluded = excludedRuns.has(run.id);
        const pieceType = run.pieceType ?? (run.isBacksplash ? "splash" : "counter");
        const sfExact = excluded
          ? 0
          : sfFromRun(Number(run.lengthIn) || 0, Number(run.depthIn) || 0, run.shape);

        pieces.push({
          runId: run.id,
          runIdx,
          areaIdx,
          label: run.label,
          pieceType,
          pieceTypeLabel: formatPieceTypeLabel(pieceType, Boolean(run.isBacksplash)),
          lengthIn: Number(run.lengthIn) || 0,
          depthIn: Number(run.depthIn) || 0,
          sfExact,
          excluded,
          manual: manualRuns.has(run.id),
          sourcePages: run.sourcePages ?? [],
          backsplashLabel:
            pieceType !== "counter"
              ? formatBacksplashScopeLabel(area.backsplashScope, run.depthIn ?? area.backsplashHeightIn)
              : null,
        });

        if (isUnknownRoom(room) && !excluded) {
          unassignedItems.push({
            kind: "unassigned_piece",
            runId: run.id,
            roomId: room.id,
            roomIdx,
            areaIdx,
            runIdx,
            label: run.label,
            message: `Piece "${run.label}" is in unassigned room "${room.name}".`,
          });
        }
      }

      areas.push({
        areaId: area.id,
        areaIdx,
        label: area.label,
        countertopSf: areaSf.countertopSf,
        backsplashSf: areaSf.backsplashSf,
        fhbSf: areaSf.fhbSf,
        backsplashDisplaySf: round2(areaSf.backsplashSf + areaSf.fhbSf),
        combinedSf: areaSf.totalSf,
        backsplashScopeLabel: formatBacksplashScopeLabel(area.backsplashScope, area.backsplashHeightIn),
        backsplashLinearIn: area.backsplashLinearIn,
        backsplashManualSf: area.backsplashManualSf,
        areaLevelBacksplashSf: areaLevelBsSf,
        pieces,
        needsReview: areaNeedsReview(area, excludedRuns),
        notInScope: isNoStoneScope(area),
      });
    }

    activeRooms.push({
      roomId: room.id,
      roomIdx,
      roomName: room.name,
      roomType: room.roomType,
      manual: manualRooms.has(room.id),
      unknown: isUnknownRoom(room),
      countertopSf: roomSf.countertopSf,
      backsplashSf: roomSf.backsplashSf,
      fhbSf: roomSf.fhbSf,
      backsplashDisplaySf: round2(roomSf.backsplashSf + roomSf.fhbSf),
      combinedSf: roomSf.totalSf,
      pieceCount: areas.reduce((n, a) => n + a.pieces.filter((p) => !p.excluded).length, 0),
      areas,
      hasScopeWithoutPieces:
        roomSf.totalSf > 0 ||
        areas.some(
          (a) =>
            !a.notInScope &&
            ((a.backsplashLinearIn ?? 0) > 0 || (a.backsplashManualSf ?? 0) > 0 || a.backsplashDisplaySf > 0)
        ),
      needsReview:
        isUnknownRoom(room) ||
        areas.some((a) => a.needsReview) ||
        (areas.reduce((n, a) => n + a.pieces.filter((p) => !p.excluded).length, 0) === 0 &&
          !areas.some(
            (a) =>
              a.notInScope ||
              (a.backsplashLinearIn ?? 0) > 0 ||
              (a.backsplashManualSf ?? 0) > 0 ||
              a.backsplashDisplaySf > 0
          )),
    });
  }

  const roomSubtotalSums = {
    countertopSqft: round2(activeRooms.reduce((s, r) => s + r.countertopSf, 0)),
    backsplashSqft: round2(activeRooms.reduce((s, r) => s + r.backsplashDisplaySf, 0)),
    combinedSqft: round2(activeRooms.reduce((s, r) => s + r.combinedSf, 0)),
  };

  return {
    countertopSqft: computed.countertopExactSf,
    standardBacksplashSqft: bsClassified.standardBacksplashSqft,
    highBacksplashSqft: bsClassified.highBacksplashSqft,
    fullHeightBacksplashSqft: bsClassified.fullHeightBacksplashSqft,
    backsplashExactSf: computed.backsplashExactSf,
    fhbExactSf: computed.fhbExactSf,
    totalBacksplashSqft,
    combinedSqft: computed.combinedExactSf,
    chargeableCountertopSqft: computed.chargeableCountertopSf,
    chargeableBacksplashSqft: computed.chargeableBacksplashSf,
    computed,
    bsClassified,
    activeRooms,
    excludedRoomsBreakdown,
    unassignedItems,
    roomSubtotalSums,
  };
}

/**
 * Generic math consistency validation across summary, room subtotals, and import preview.
 *
 * @param {ReturnType<typeof computeReviewedTakeoffMath>} math
 * @param {{ countertopSqft?: number, combinedSqft?: number, standardBacksplashSqft?: number, highBacksplashSqft?: number, fullHeightBacksplashSqft?: number }|null} [importTotals]
 */
export function validateReviewedTakeoffConsistency(math, importTotals = null) {
  /** @type {Array<{ code: string, message: string, category?: string }>} */
  const issues = [];
  const tol = MATH_ROUND_TOLERANCE;

  const ctDelta = Math.abs(math.roomSubtotalSums.countertopSqft - math.countertopSqft);
  if (ctDelta > tol) {
    issues.push({
      code: "MATH_CONSISTENCY_COUNTERTOP",
      message: `Room countertop subtotals (${math.roomSubtotalSums.countertopSqft.toFixed(2)} sf) do not match measurement summary (${math.countertopSqft.toFixed(2)} sf).`,
      category: "validation",
    });
  }

  const bsDelta = Math.abs(math.roomSubtotalSums.backsplashSqft - math.totalBacksplashSqft);
  if (bsDelta > tol) {
    issues.push({
      code: "MATH_CONSISTENCY_BACKSPLASH",
      message: `Room backsplash subtotals (${math.roomSubtotalSums.backsplashSqft.toFixed(2)} sf) do not match measurement summary (${math.totalBacksplashSqft.toFixed(2)} sf).`,
      category: "validation",
    });
  }

  const combinedDelta = Math.abs(math.roomSubtotalSums.combinedSqft - math.combinedSqft);
  if (combinedDelta > tol) {
    issues.push({
      code: "MATH_CONSISTENCY_COMBINED",
      message: `Room combined subtotals (${math.roomSubtotalSums.combinedSqft.toFixed(2)} sf) do not match measurement summary (${math.combinedSqft.toFixed(2)} sf).`,
      category: "validation",
    });
  }

  if (importTotals) {
    const importBs = round2(
      (importTotals.standardBacksplashSqft ?? 0) +
        (importTotals.highBacksplashSqft ?? 0) +
        (importTotals.fullHeightBacksplashSqft ?? 0)
    );
    const importCombined =
      importTotals.combinedSqft ??
      round2((importTotals.countertopSqft ?? 0) + importBs);

    if (Math.abs((importTotals.countertopSqft ?? 0) - math.countertopSqft) > tol) {
      issues.push({
        code: "IMPORT_TOTAL_COUNTERTOP_MISMATCH",
        message: `Import preview countertop (${Number(importTotals.countertopSqft ?? 0).toFixed(2)} sf) does not match reviewed takeoff (${math.countertopSqft.toFixed(2)} sf).`,
        category: "validation",
      });
    }
    if (Math.abs(importBs - math.totalBacksplashSqft) > tol) {
      issues.push({
        code: "IMPORT_TOTAL_BACKSPLASH_MISMATCH",
        message: `Import preview backsplash (${importBs.toFixed(2)} sf) does not match reviewed takeoff (${math.totalBacksplashSqft.toFixed(2)} sf).`,
        category: "validation",
      });
    }
    if (Math.abs(importCombined - math.combinedSqft) > tol) {
      issues.push({
        code: "IMPORT_TOTAL_COMBINED_MISMATCH",
        message: `Import preview combined (${importCombined.toFixed(2)} sf) does not match reviewed takeoff (${math.combinedSqft.toFixed(2)} sf).`,
        category: "validation",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Detect unresolved scope items for Items to Review / approval blockers.
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} takeoffResult
 * @param {import("./takeoffReviewStatus.mjs").TakeoffReviewState} [reviewState]
 * @param {{ diagnostics?: Array<{ code?: string, message?: string, path?: string }> }|null} [validation]
 */
export function findUnresolvedScopeItems(takeoffResult, reviewState = null, validation = null) {
  const rs = reviewState ? normalizeReviewState(reviewState) : normalizeReviewState({});
  const excludedRuns = excludedSet(rs);
  const excludedRooms = excludedRoomSet(rs);
  const math = computeReviewedTakeoffMath(takeoffResult, rs);
  /** @type {Array<{ code: string, message: string, path?: string|null, category?: string }>} */
  const items = [];

  for (const room of math.activeRooms) {
    if (room.unknown) {
      items.push({
        code: "UNKNOWN_ROOM",
        message: `Room "${room.roomName}" needs assignment — move pieces to a named room or exclude.`,
        path: `rooms.${room.roomId}`,
        category: "rooms",
      });
    }
    if (room.pieceCount === 0 && !room.unknown && !room.hasScopeWithoutPieces) {
      items.push({
        code: "EMPTY_ROOM",
        message: `Room "${room.roomName}" has no included pieces — add scope, exclude, or mark not in scope.`,
        path: `rooms.${room.roomId}`,
        category: "rooms",
      });
    }
    for (const area of room.areas) {
      if (area.needsReview) {
        items.push({
          code: "EMPTY_AREA",
          message: `Area "${area.label}" in "${room.roomName}" needs review — add a piece, mark not in scope, or exclude.`,
          path: `rooms[${room.roomIdx}].areas[${area.areaIdx}]`,
          category: "rooms",
        });
      }
      if (
        !area.notInScope &&
        area.backsplashDisplaySf > 0 &&
        area.backsplashScopeLabel === "Needs review"
      ) {
        items.push({
          code: "BACKSPLASH_SCOPE_UNRESOLVED",
          message: `Backsplash scope for "${area.label}" in "${room.roomName}" needs confirmation.`,
          path: `rooms[${room.roomIdx}].areas[${area.areaIdx}]`,
          category: "backsplash",
        });
      }
    }
  }

  for (const u of math.unassignedItems) {
    items.push({
      code: "UNASSIGNED_PIECE",
      message: u.message,
      path: `rooms[${u.roomIdx}].areas[${u.areaIdx}].runs[${u.runIdx}]`,
      category: "rooms",
    });
  }

  const consistency = validateReviewedTakeoffConsistency(math);
  for (const issue of consistency.issues) {
    items.push({ ...issue, path: null });
  }

  for (const d of validation?.diagnostics ?? []) {
    const code = String(d.code ?? "");
    if (code === "EMPTY_AREA") {
      const already = items.some((i) => i.message === d.message);
      if (!already) {
        items.push({
          code,
          message: d.message ?? "Empty area needs review.",
          path: d.path ?? null,
          category: "rooms",
        });
      }
    }
  }

  return items;
}

/**
 * Display index for All Pieces table — friendly labels, totals, and piece actions.
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} takeoffResult
 * @param {import("./takeoffReviewStatus.mjs").TakeoffReviewState} [reviewState]
 */
export function buildAllPiecesDisplayIndex(takeoffResult, reviewState = null) {
  const rs = reviewState ? normalizeReviewState(reviewState) : normalizeReviewState({});
  const math = computeReviewedTakeoffMath(takeoffResult, rs);
  const excludedRooms = excludedRoomSet(rs);
  const manualRuns = manualRunSet(rs);

  /** @type {Map<string, object>} */
  const pieceByRunId = new Map();
  /** @type {Map<string, object>} */
  const areaByKey = new Map();

  for (const room of math.activeRooms) {
    if (excludedRooms.has(room.roomId)) continue;
    for (const area of room.areas) {
      const key = `${room.roomIdx}:${area.areaIdx}`;
      areaByKey.set(key, {
        backsplashScopeLabel: area.backsplashScopeLabel,
        areaLevelBacksplashSf: area.areaLevelBacksplashSf,
        backsplashDisplaySf: area.backsplashDisplaySf,
        needsReview: area.needsReview,
        notInScope: area.notInScope,
      });
      for (const piece of area.pieces) {
        pieceByRunId.set(piece.runId, {
          ...piece,
          isManual: manualRuns.has(piece.runId),
          statusLabel: piece.excluded
            ? "Excluded from takeoff"
            : manualRuns.has(piece.runId)
              ? "Manual piece"
              : "Included in takeoff",
          action: piece.excluded
            ? manualRuns.has(piece.runId)
              ? "remove"
              : "restore"
            : manualRuns.has(piece.runId)
              ? "remove"
              : "exclude",
        });
      }
    }
  }

  return {
    totals: {
      countertopSqft: math.countertopSqft,
      totalBacksplashSqft: math.totalBacksplashSqft,
      combinedSqft: math.combinedSqft,
    },
    pieceByRunId,
    areaByKey,
  };
}

/**
 * @param {ReturnType<typeof buildAllPiecesDisplayIndex>} index
 * @param {string} [scopeLabel]
 */
export function allPiecesDisplayUsesFriendlyLabels(index, scopeLabel) {
  const rawEnum = /\b(no_stone|full_height|standard_4|needs_review|tile_by_others|fhbs)\b/;
  for (const piece of index.pieceByRunId.values()) {
    if (rawEnum.test(String(piece.pieceTypeLabel ?? ""))) return false;
    if (piece.backsplashLabel && rawEnum.test(String(piece.backsplashLabel))) return false;
  }
  for (const area of index.areaByKey.values()) {
    if (rawEnum.test(String(area.backsplashScopeLabel ?? ""))) return false;
  }
  if (scopeLabel && rawEnum.test(scopeLabel)) return false;
  return true;
}

/**
 * Blockers that prevent marking a room verified in the room-first workbench.
 *
 * @param {object} reviewedRoom — entry from computeReviewedTakeoffMath().activeRooms
 */
export function deriveRoomVerificationBlockers(reviewedRoom) {
  /** @type {Array<{ code: string, message: string }>} */
  const blockers = [];
  if (!reviewedRoom) return blockers;

  if (reviewedRoom.unknown) {
    blockers.push({
      code: "UNKNOWN_ROOM",
      message: "Assign this room a proper name before verification.",
    });
  }

  for (const area of reviewedRoom.areas ?? []) {
    if (area.needsReview) {
      blockers.push({
        code: "EMPTY_AREA",
        message: `Area "${area.label}" needs review — add a piece or mark not in scope.`,
      });
    }
    if (
      !area.notInScope &&
      area.backsplashScopeLabel === "Needs review" &&
      (area.backsplashDisplaySf ?? 0) > 0
    ) {
      blockers.push({
        code: "BACKSPLASH_SCOPE_UNRESOLVED",
        message: `Confirm backsplash scope for "${area.label}".`,
      });
    }
  }

  for (const area of reviewedRoom.areas ?? []) {
    for (const piece of area.pieces ?? []) {
      if (piece.excluded) continue;
      const pt = String(piece.pieceType ?? "counter");
      if (pt === "counter" && (piece.lengthIn <= 0 || piece.depthIn <= 0)) {
        blockers.push({
          code: "MISSING_RUN_DIMENSIONS",
          message: `Piece "${piece.label}" is missing length or depth.`,
        });
      }
    }
  }

  return blockers;
}

/**
 * Whether a room can be marked verified.
 *
 * @param {object} reviewedRoom
 * @param {{ hasGlobalBlockers?: boolean }} [opts]
 */
export function canMarkRoomVerified(reviewedRoom, opts = {}) {
  if (opts.hasGlobalBlockers) {
    return {
      ok: false,
      blockers: [{ code: "GLOBAL_BLOCKERS", message: "Resolve Items to review before verifying rooms." }],
    };
  }
  const blockers = deriveRoomVerificationBlockers(reviewedRoom);
  return { ok: blockers.length === 0, blockers };
}

/**
 * Room subtotals for a single room (used by workbench when full math object unavailable).
 *
 * @param {import("./takeoffContract.mjs").TakeoffRoom} room
 * @param {Set<string>|string[]} excludedRunIds
 */
export function computeRoomSubtotalsFromMath(room, excludedRunIds = new Set()) {
  const excluded =
    excludedRunIds instanceof Set ? excludedRunIds : new Set(excludedRunIds ?? []);
  const filteredRoom = {
    ...room,
    areas: (room.areas ?? []).map((area) => areaWithIncludedRuns(area, excluded)),
  };
  const roomSf = computeRoomSf(filteredRoom);
  const pieceCount = filteredRoom.areas.reduce(
    (n, area) => n + (area.runs?.length ?? 0),
    0
  );
  return {
    countertopSf: roomSf.countertopSf,
    backsplashSf: roomSf.backsplashSf,
    fhbSf: roomSf.fhbSf,
    backsplashDisplaySf: round2(roomSf.backsplashSf + roomSf.fhbSf),
    combinedSf: roomSf.totalSf,
    pieceCount,
    areaBreakdown: roomSf.areaBreakdown,
  };
}
