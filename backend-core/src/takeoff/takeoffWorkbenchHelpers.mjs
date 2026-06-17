/**
 * Pure helpers for AI Takeoff Review Workbench — add/rename/exclude without quote math changes.
 */

import { makeTakeoffRun, makeTakeoffArea } from "./takeoffContract.mjs";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";

function normLabel(value) {
  return String(value ?? "").trim().toLowerCase();
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
  const effective = filterExcludedRunsFromDraft(draft, excludedRunIds);
  return computeTakeoffMeasurements(effective);
}

/**
 * @param {string} runId
 * @param {Set<string>} excludedRunIds
 */
export function isRunIncludedInTakeoff(runId, excludedRunIds) {
  return !excludedRunIds.has(runId);
}
