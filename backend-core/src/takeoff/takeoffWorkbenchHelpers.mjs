/**
 * Pure helpers for AI Takeoff Review Workbench — add/rename/exclude without quote math changes.
 */

import { makeTakeoffRun, makeTakeoffArea } from "./takeoffContract.mjs";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { computeRoomSubtotalsFromMath } from "./reviewedTakeoffMath.mjs";

function normLabel(value) {
  return String(value ?? "").trim().toLowerCase();
}

export const ROOM_TYPE_OPTIONS = Object.freeze([
  "Kitchen",
  "Bathroom",
  "Laundry",
  "Bar",
  "Pantry",
  "Vanity",
  "Office",
  "Other",
]);

/**
 * Apply excluded rooms + runs for totals/import (mirrors approval gate filter).
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} takeoffResult
 * @param {{ excludedRunIds?: Set<string>|string[], excludedRoomIds?: Set<string>|string[] }} reviewState
 */
export function filterReviewStateFromDraft(takeoffResult, reviewState = {}) {
  const excludedRuns =
    reviewState.excludedRunIds instanceof Set
      ? reviewState.excludedRunIds
      : new Set(reviewState.excludedRunIds ?? []);
  const excludedRooms =
    reviewState.excludedRoomIds instanceof Set
      ? reviewState.excludedRoomIds
      : new Set(reviewState.excludedRoomIds ?? []);
  if (!excludedRuns.size && !excludedRooms.size) return takeoffResult;
  return {
    ...takeoffResult,
    rooms: (takeoffResult.rooms ?? [])
      .filter((room) => !excludedRooms.has(room.id))
      .map((room) => ({
        ...room,
        areas: (room.areas ?? []).map((area) => ({
          ...area,
          runs: (area.runs ?? []).filter((run) => !excludedRuns.has(run.id)),
        })),
      })),
  };
}

/**
 * @param {import("./takeoffContract.mjs").TakeoffRoom} room
 * @param {Set<string>} excludedRunIds
 */
export function computeRoomSubtotals(room, excludedRunIds = new Set()) {
  return computeRoomSubtotalsFromMath(room, excludedRunIds);
}

/**
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {string} runId
 * @param {number} targetRoomIdx
 * @param {string} [areaLabel]
 */
export function moveRunToRoom(draft, runId, targetRoomIdx, areaLabel) {
  let movedRun = null;
  let source = null;
  const roomsAfterRemove = (draft.rooms ?? []).map((room, ri) => ({
    ...room,
    areas: (room.areas ?? []).map((area, ai) => {
      const idx = (area.runs ?? []).findIndex((r) => r.id === runId);
      if (idx < 0) return area;
      movedRun = area.runs[idx];
      source = { roomIdx: ri, areaIdx: ai, runIdx: idx };
      return {
        ...area,
        runs: area.runs.filter((r) => r.id !== runId),
      };
    }),
  }));
  if (!movedRun) return draft;

  const targetRoom = roomsAfterRemove[targetRoomIdx];
  if (!targetRoom) return draft;

  const label =
    String(areaLabel ?? "").trim() ||
    (movedRun.pieceType === "splash" || movedRun.isBacksplash ? "Backsplash" : "Main");
  let areaIdx = findAreaIndexByLabel(targetRoom, label);
  let nextRooms = roomsAfterRemove;

  if (areaIdx < 0 && (targetRoom.areas?.length ?? 0) > 0) {
    areaIdx = 0;
  } else if (areaIdx < 0) {
    const preset =
      movedRun.pieceType === "splash" || movedRun.isBacksplash
        ? ADD_PIECE_PRESETS.backsplash
        : ADD_PIECE_PRESETS.countertop;
    const newArea = makeTakeoffArea({
      label,
      areaType: preset.areaType,
      runs: [],
    });
    nextRooms = roomsAfterRemove.map((room, ri) =>
      ri !== targetRoomIdx ? room : { ...room, areas: [...(room.areas ?? []), newArea] }
    );
    areaIdx = nextRooms[targetRoomIdx].areas.length - 1;
  }

  return {
    ...draft,
    rooms: nextRooms.map((room, ri) =>
      ri !== targetRoomIdx
        ? room
        : {
            ...room,
            areas: room.areas.map((area, ai) =>
              ai !== areaIdx ? area : { ...area, runs: [...(area.runs ?? []), movedRun] }
            ),
          }
    ),
  };
}

/**
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {number} roomIdx
 * @param {Partial<{ name: string, roomType: string }>} patch
 */
export function patchRoomFields(draft, roomIdx, patch) {
  return {
    ...draft,
    rooms: draft.rooms.map((room, ri) => (ri !== roomIdx ? room : { ...room, ...patch })),
  };
}

/**
 * Whether excluded rooms/runs are omitted from computed totals.
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {{ excludedRunIds?: Set<string>, excludedRoomIds?: Set<string> }} reviewState
 */
export function computeTotalsWithReviewState(draft, reviewState = {}) {
  const effective = filterReviewStateFromDraft(draft, reviewState);
  return computeTakeoffMeasurements(effective);
}

/**
 * @param {string} roomId
 * @param {Set<string>} excludedRoomIds
 */
export function isRoomIncludedInTakeoff(roomId, excludedRoomIds) {
  return !excludedRoomIds.has(roomId);
}

/**
 * Room verification label for UI.
 *
 * @param {import("./takeoffContract.mjs").TakeoffRoom} room
 * @param {{
 *   excludedRoomIds?: Set<string>,
 *   roomCompleteness?: Record<string, boolean>,
 *   hasRoomBlockers?: boolean,
 *   hasUnresolvedBlockers?: boolean,
 * }} ctx
 */
export function deriveRoomVerificationStatus(room, ctx = {}) {
  const excluded = ctx.excludedRoomIds ?? new Set();
  const completeness = ctx.roomCompleteness ?? {};
  const hasRoomBlockers = ctx.hasRoomBlockers ?? ctx.hasUnresolvedBlockers ?? false;
  if (excluded.has(room.id)) return "excluded";
  if (completeness[room.id]) return "verified";
  if (hasRoomBlockers) return "needs_review";
  return "ready_to_verify";
}

/**
 * Remove excluded runs from a draft (same semantics as save/approve effectiveDraft).
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} takeoffResult
 * @param {Set<string> | string[]} excludedRunIds
 */
export function filterExcludedRunsFromDraft(takeoffResult, excludedRunIds) {
  const excluded = excludedRunIds instanceof Set
    ? excludedRunIds
    : new Set(excludedRunIds ?? []);
  if (!excluded.size) return takeoffResult;
  return {
    ...takeoffResult,
    rooms: (takeoffResult.rooms ?? []).map((room) => ({
      ...room,
      areas: (room.areas ?? []).map((area) => ({
        ...area,
        runs: (area.runs ?? []).filter((run) => !excluded.has(run.id)),
      })),
    })),
  };
}

/**
 * @param {import("./takeoffContract.mjs").TakeoffRoom} room
 * @param {string} areaLabel
 * @returns {number}
 */
export function findAreaIndexByLabel(room, areaLabel) {
  const target = normLabel(areaLabel);
  if (!target) return -1;
  return (room.areas ?? []).findIndex((area) => normLabel(area.label) === target);
}

/** @type {Record<string, { defaultAreaLabel: string; defaultPieceLabel: string; areaType: string; pieceType: string; defaultDepth: number }>} */
export const ADD_PIECE_PRESETS = {
  countertop: {
    defaultAreaLabel: "Countertop",
    defaultPieceLabel: "Countertop run",
    areaType: "countertop",
    pieceType: "counter",
    defaultDepth: 25.5,
  },
  island: {
    defaultAreaLabel: "Island",
    defaultPieceLabel: "Island",
    areaType: "island",
    pieceType: "counter",
    defaultDepth: 25.5,
  },
  vanity: {
    defaultAreaLabel: "Vanity",
    defaultPieceLabel: "Vanity top",
    areaType: "countertop",
    pieceType: "counter",
    defaultDepth: 22,
  },
  backsplash: {
    defaultAreaLabel: "Backsplash",
    defaultPieceLabel: "Backsplash line",
    areaType: "backsplash",
    pieceType: "splash",
    defaultDepth: 4,
  },
  waterfall: {
    defaultAreaLabel: "Waterfall",
    defaultPieceLabel: "Waterfall panel",
    areaType: "countertop",
    pieceType: "fhb",
    defaultDepth: 25.5,
  },
};

/**
 * @param {{
 *   preset?: string;
 *   pieceLabel?: string;
 *   lengthIn?: number;
 *   depthIn?: number;
 *   pageNumber?: number | string | null;
 *   note?: string;
 * }} input
 */
export function buildManualRunFromInput(input) {
  const presetKey = String(input.preset ?? "countertop");
  const preset = ADD_PIECE_PRESETS[presetKey] ?? ADD_PIECE_PRESETS.countertop;
  const pageRaw = input.pageNumber;
  const pageNum = pageRaw != null && String(pageRaw).trim() !== "" ? Number(pageRaw) : NaN;
  const note = String(input.note ?? "").trim();
  return makeTakeoffRun({
    label: String(input.pieceLabel ?? preset.defaultPieceLabel).trim() || preset.defaultPieceLabel,
    lengthIn: Number(input.lengthIn) || 0,
    depthIn: Number(input.depthIn) || preset.defaultDepth,
    pieceType: preset.pieceType,
    shape: "rect",
    ...(Number.isFinite(pageNum) && pageNum > 0 ? { sourcePages: [pageNum] } : {}),
    ...(note ? { assemblyNotes: note } : {}),
  });
}

/**
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {number} roomIdx
 * @param {number} areaIdx
 * @param {import("./takeoffContract.mjs").TakeoffRun} run
 */
export function appendRunToDraft(draft, roomIdx, areaIdx, run) {
  return {
    ...draft,
    rooms: draft.rooms.map((room, ri) =>
      ri !== roomIdx
        ? room
        : {
            ...room,
            areas: room.areas.map((area, ai) =>
              ai !== areaIdx ? area : { ...area, runs: [...(area.runs ?? []), run] }
            ),
          }
    ),
  };
}

/**
 * Patch a room name immutably.
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {number} roomIdx
 * @param {string} name
 */
export function patchRoomName(draft, roomIdx, name) {
  const nextName = String(name ?? "").trim();
  if (!nextName) return draft;
  return {
    ...draft,
    rooms: draft.rooms.map((room, ri) => (ri !== roomIdx ? room : { ...room, name: nextName })),
  };
}

/**
 * Patch an area label immutably.
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {number} roomIdx
 * @param {number} areaIdx
 * @param {string} label
 */
export function patchAreaLabel(draft, roomIdx, areaIdx, label) {
  const nextLabel = String(label ?? "").trim();
  if (!nextLabel) return draft;
  return {
    ...draft,
    rooms: draft.rooms.map((room, ri) =>
      ri !== roomIdx
        ? room
        : {
            ...room,
            areas: room.areas.map((area, ai) => (ai !== areaIdx ? area : { ...area, label: nextLabel })),
          }
    ),
  };
}

/**
 * Resolve room/area placement and append a manually entered run.
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {{
 *   roomIdx: number;
 *   areaLabel?: string;
 *   preset?: string;
 *   pieceLabel?: string;
 *   lengthIn?: number;
 *   depthIn?: number;
 *   pageNumber?: number | string | null;
 *   note?: string;
 * }} input
 * @returns {{ draft: import("./takeoffContract.mjs").TakeoffResult; run: import("./takeoffContract.mjs").TakeoffRun; roomIdx: number; areaIdx: number }}
 */
export function addManualRunToDraft(draft, input) {
  const roomIdx = Number(input.roomIdx);
  const room = draft.rooms?.[roomIdx];
  if (!room) throw new Error("Invalid room selection.");

  const presetKey = String(input.preset ?? "countertop");
  const preset = ADD_PIECE_PRESETS[presetKey] ?? ADD_PIECE_PRESETS.countertop;
  const areaLabel = String(input.areaLabel ?? preset.defaultAreaLabel).trim() || preset.defaultAreaLabel;

  let nextDraft = draft;
  let areaIdx = findAreaIndexByLabel(room, areaLabel);
  if (areaIdx < 0) {
    const newArea = makeTakeoffArea({
      label: areaLabel,
      areaType: preset.areaType,
      runs: [],
    });
    nextDraft = {
      ...draft,
      rooms: draft.rooms.map((r, ri) =>
        ri !== roomIdx ? r : { ...r, areas: [...(r.areas ?? []), newArea] }
      ),
    };
    areaIdx = nextDraft.rooms[roomIdx].areas.length - 1;
  }

  const run = buildManualRunFromInput({
    preset: presetKey,
    pieceLabel: input.pieceLabel,
    lengthIn: input.lengthIn,
    depthIn: input.depthIn,
    pageNumber: input.pageNumber,
    note: input.note,
  });

  nextDraft = appendRunToDraft(nextDraft, roomIdx, areaIdx, run);
  return { draft: nextDraft, run, roomIdx, areaIdx };
}

/**
 * Whether excluded runs are omitted from computed totals.
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {Set<string>} excludedRunIds
 */
export function computeTotalsExcludingRuns(draft, excludedRunIds) {
  return computeTotalsWithReviewState(draft, { excludedRunIds });
}

/**
 * @param {string} runId
 * @param {Set<string>} excludedRunIds
 */
export function isRunIncludedInTakeoff(runId, excludedRunIds) {
  return !excludedRunIds.has(runId);
}

/**
 * Hard-remove a run from the draft (manual pieces only).
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {string} runId
 */
export function removeRunFromDraft(draft, runId) {
  return {
    ...draft,
    rooms: (draft.rooms ?? []).map((room) => ({
      ...room,
      areas: (room.areas ?? []).map((area) => ({
        ...area,
        runs: (area.runs ?? []).filter((run) => run.id !== runId),
      })),
    })),
  };
}

/**
 * Hard-remove a room from the draft (manual rooms only).
 *
 * @param {import("./takeoffContract.mjs").TakeoffResult} draft
 * @param {string} roomId
 */
export function removeRoomFromDraft(draft, roomId) {
  return {
    ...draft,
    rooms: (draft.rooms ?? []).filter((room) => room.id !== roomId),
  };
}
