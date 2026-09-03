/**
 * Estimator piece segmentation helpers for cooking-appliance gaps.
 * Pure functions — browser + Node safe via @takeoff-core alias.
 */

import {
  applyCookingApplianceToRun,
  cookingApplianceInterruptsCountertop,
  buildTakeoffCorrectionEvent
} from "./takeoffCookingAppliance.mjs";

function newId(prefix) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function cloneTakeoff(takeoff) {
  return takeoff && typeof takeoff === "object" ? structuredClone(takeoff) : { rooms: [] };
}

function findRunPath(takeoff, roomId, runId) {
  const rooms = Array.isArray(takeoff?.rooms) ? takeoff.rooms : [];
  for (let ri = 0; ri < rooms.length; ri += 1) {
    const room = rooms[ri];
    if (String(room?.id) !== String(roomId)) continue;
    const areas = Array.isArray(room.areas) ? room.areas : [];
    for (let ai = 0; ai < areas.length; ai += 1) {
      const runs = Array.isArray(areas[ai].runs) ? areas[ai].runs : [];
      const idx = runs.findIndex((r) => String(r?.id) === String(runId));
      if (idx >= 0) return { roomIndex: ri, areaIndex: ai, runIndex: idx, via: "areas" };
    }
    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    const pidx = pieces.findIndex((r) => String(r?.id) === String(runId));
    if (pidx >= 0) return { roomIndex: ri, areaIndex: -1, runIndex: pidx, via: "pieces" };
    const roomRuns = Array.isArray(room.runs) ? room.runs : [];
    const ridx = roomRuns.findIndex((r) => String(r?.id) === String(runId));
    if (ridx >= 0) return { roomIndex: ri, areaIndex: -1, runIndex: ridx, via: "runs" };
  }
  return null;
}

function getRunList(room, path) {
  if (path.via === "areas") return room.areas[path.areaIndex].runs;
  if (path.via === "pieces") return room.pieces;
  return room.runs;
}

function setRunList(room, path, runs) {
  if (path.via === "areas") {
    const areas = [...room.areas];
    areas[path.areaIndex] = { ...areas[path.areaIndex], runs };
    return { ...room, areas };
  }
  if (path.via === "pieces") return { ...room, pieces: runs };
  return { ...room, runs };
}

/**
 * Split one countertop run into two at leftLengthIn (inches).
 * Right piece length = original − left. Depth/qty preserved. Cutouts stay on left by default.
 */
export function splitPieceAtLength(takeoff, roomId, runId, leftLengthIn, opts = {}) {
  const base = cloneTakeoff(takeoff);
  const path = findRunPath(base, roomId, runId);
  if (!path) {
    const err = new Error("Piece not found");
    err.code = "piece_not_found";
    throw err;
  }
  const room = base.rooms[path.roomIndex];
  const runs = [...getRunList(room, path)];
  const run = { ...runs[path.runIndex] };
  const total = Number(run.lengthIn) || 0;
  const left = Number(leftLengthIn);
  if (!(left > 0) || !(total > left)) {
    const err = new Error("Split position must be between 0 and piece length");
    err.code = "split_position_invalid";
    throw err;
  }
  const rightLen = Math.round((total - left) * 1000) / 1000;
  const leftRun = {
    ...run,
    lengthIn: left,
    _estimatorOwned: true,
    label: opts.leftLabel || run.label || "Piece A"
  };
  const rightRun = {
    ...run,
    id: newId("run"),
    lengthIn: rightLen,
    cutouts: [],
    cookingAppliance: null,
    applianceGap: false,
    _estimatorOwned: true,
    _manual: true,
    label: opts.rightLabel || `${run.label || "Piece"} B`
  };
  runs.splice(path.runIndex, 1, leftRun, rightRun);
  base.rooms[path.roomIndex] = setRunList({ ...room, _estimatorOwned: true }, path, runs);
  return {
    takeoff: base,
    leftRunId: leftRun.id,
    rightRunId: rightRun.id,
    event: buildTakeoffCorrectionEvent("piece_split", {
      roomId,
      runId,
      leftLengthIn: left,
      rightLengthIn: rightLen,
      rightRunId: rightRun.id
    })
  };
}

/**
 * Merge two adjacent compatible pieces (same depth) into one.
 */
export function mergePieces(takeoff, roomId, runIdA, runIdB) {
  const base = cloneTakeoff(takeoff);
  const pathA = findRunPath(base, roomId, runIdA);
  const pathB = findRunPath(base, roomId, runIdB);
  if (!pathA || !pathB || pathA.via !== pathB.via || pathA.areaIndex !== pathB.areaIndex) {
    const err = new Error("Pieces cannot be merged");
    err.code = "merge_incompatible";
    throw err;
  }
  const room = base.rooms[pathA.roomIndex];
  const runs = [...getRunList(room, pathA)];
  const iA = runs.findIndex((r) => String(r?.id) === String(runIdA));
  const iB = runs.findIndex((r) => String(r?.id) === String(runIdB));
  if (iA < 0 || iB < 0 || Math.abs(iA - iB) !== 1) {
    const err = new Error("Only adjacent pieces can be merged");
    err.code = "merge_not_adjacent";
    throw err;
  }
  const firstIdx = Math.min(iA, iB);
  const secondIdx = Math.max(iA, iB);
  const a = runs[firstIdx];
  const b = runs[secondIdx];
  const depthA = Number(a.depthIn) || 0;
  const depthB = Number(b.depthIn) || 0;
  if (depthA > 0 && depthB > 0 && Math.abs(depthA - depthB) > 0.05) {
    const err = new Error("Piece depths differ — confirm before merge");
    err.code = "merge_depth_mismatch";
    throw err;
  }
  const cutouts = [
    ...(Array.isArray(a.cutouts) ? a.cutouts : []),
    ...(Array.isArray(b.cutouts) ? b.cutouts : [])
  ];
  const merged = {
    ...a,
    lengthIn: Math.round(((Number(a.lengthIn) || 0) + (Number(b.lengthIn) || 0)) * 1000) / 1000,
    depthIn: depthA || depthB,
    cutouts,
    cookingAppliance: a.cookingAppliance || b.cookingAppliance || null,
    applianceGap: false,
    _estimatorOwned: true,
    label: a.label || b.label || "Merged piece"
  };
  runs.splice(firstIdx, 2, merged);
  base.rooms[pathA.roomIndex] = setRunList({ ...room, _estimatorOwned: true }, pathA, runs);
  return {
    takeoff: base,
    mergedRunId: merged.id,
    event: buildTakeoffCorrectionEvent("pieces_merged", {
      roomId,
      runIdA,
      runIdB,
      mergedRunId: merged.id,
      lengthIn: merged.lengthIn
    })
  };
}

/**
 * Insert an appliance gap into a continuous piece: left | gap | right.
 * Gap does not contribute countertop SF (not added as a counter piece).
 * Requires estimator-provided gap width — never invents range width.
 */
export function insertApplianceGap(takeoff, roomId, runId, args = {}) {
  const gapWidthIn = Number(args.gapWidthIn);
  const leftLengthIn = Number(args.leftLengthIn);
  const applianceType = String(args.applianceType || "freestanding_range");
  if (!(gapWidthIn > 0)) {
    const err = new Error("Appliance gap width is required");
    err.code = "appliance_gap_width_required";
    throw err;
  }
  if (!cookingApplianceInterruptsCountertop(applianceType) && applianceType !== "unknown_cooking_appliance") {
    const err = new Error("Appliance type does not interrupt countertop");
    err.code = "appliance_type_not_interrupt";
    throw err;
  }
  const base = cloneTakeoff(takeoff);
  const path = findRunPath(base, roomId, runId);
  if (!path) {
    const err = new Error("Piece not found");
    err.code = "piece_not_found";
    throw err;
  }
  const room = base.rooms[path.roomIndex];
  const runs = [...getRunList(room, path)];
  const run = runs[path.runIndex];
  const total = Number(run.lengthIn) || 0;
  if (!(leftLengthIn > 0) || !(leftLengthIn + gapWidthIn < total)) {
    const err = new Error("Left length + gap must be less than piece length");
    err.code = "appliance_gap_geometry_invalid";
    throw err;
  }
  const rightLen = Math.round((total - leftLengthIn - gapWidthIn) * 1000) / 1000;
  if (!(rightLen > 0)) {
    const err = new Error("Right piece length must be positive");
    err.code = "appliance_gap_geometry_invalid";
    throw err;
  }

  const leftRun = {
    ...run,
    lengthIn: leftLengthIn,
    cutouts: (Array.isArray(run.cutouts) ? run.cutouts : []).filter((c) => c.type !== "cooktop"),
    cookingAppliance: null,
    applianceGap: false,
    _estimatorOwned: true,
    label: args.leftLabel || `${run.label || "Piece"} L`
  };
  const rightRun = applyCookingApplianceToRun(
    {
      ...run,
      id: newId("run"),
      lengthIn: rightLen,
      cutouts: [],
      _estimatorOwned: true,
      _manual: true,
      label: args.rightLabel || `${run.label || "Piece"} R`
    },
    "not_applicable"
  );
  // Store gap metadata on left run for audit (gap itself is not a SF piece).
  leftRun.adjacentApplianceGap = {
    widthIn: gapWidthIn,
    applianceType,
    source: "estimator_confirmed"
  };
  // Mark cooking appliance on a synthetic note run attachment via left piece.
  const withAppliance = applyCookingApplianceToRun(leftRun, applianceType, {
    widthIn: gapWidthIn,
    source: "estimator_confirmed",
    confidence: "high"
  });
  // Range must not keep cooktop cutout on either piece.
  withAppliance.cutouts = (withAppliance.cutouts || []).filter((c) => c.type !== "cooktop");
  withAppliance.applianceGap = false; // the piece itself is stone; gap is adjacent
  withAppliance.adjacentApplianceGap = {
    widthIn: gapWidthIn,
    applianceType,
    source: "estimator_confirmed"
  };

  runs.splice(path.runIndex, 1, withAppliance, rightRun);
  base.rooms[path.roomIndex] = setRunList({ ...room, _estimatorOwned: true }, path, runs);

  return {
    takeoff: base,
    leftRunId: withAppliance.id,
    rightRunId: rightRun.id,
    gapWidthIn,
    event: buildTakeoffCorrectionEvent("appliance_gap_inserted", {
      roomId,
      runId,
      applianceType,
      gapWidthIn,
      leftLengthIn,
      rightLengthIn: rightLen,
      leftRunId: withAppliance.id,
      rightRunId: rightRun.id
    })
  };
}

/**
 * Convert appliance type on a run. Cooktop→range removes cooktop cutout.
 * Does not invent split geometry — returns needsSegmentation when interrupt required
 * and piece still looks continuous (no adjacentApplianceGap).
 */
export function convertCookingApplianceType(takeoff, roomId, runId, nextType, opts = {}) {
  const base = cloneTakeoff(takeoff);
  const path = findRunPath(base, roomId, runId);
  if (!path) {
    const err = new Error("Piece not found");
    err.code = "piece_not_found";
    throw err;
  }
  const room = base.rooms[path.roomIndex];
  const runs = [...getRunList(room, path)];
  const prev = runs[path.runIndex];
  const next = applyCookingApplianceToRun(prev, nextType, opts);
  runs[path.runIndex] = { ...next, _estimatorOwned: true };
  base.rooms[path.roomIndex] = setRunList({ ...room, _estimatorOwned: true }, path, runs);

  const needsSegmentation =
    cookingApplianceInterruptsCountertop(nextType) === true &&
    !next.adjacentApplianceGap &&
    !(opts.gapWidthIn > 0);

  return {
    takeoff: base,
    needsSegmentation,
    event: buildTakeoffCorrectionEvent("appliance_type_corrected", {
      roomId,
      runId,
      fromType: prev?.cookingAppliance?.type || (prev?.cutouts || []).some((c) => c.type === "cooktop")
        ? "cooktop"
        : null,
      toType: nextType,
      removedCooktopCutout: cookingApplianceInterruptsCountertop(nextType) === true
    })
  };
}

/**
 * Countertop SF for a run — never includes adjacent appliance gap width.
 */
export function countertopSfForRun(run) {
  if (!run || run.includedInTakeoff === false) return 0;
  if (run.applianceGap === true && !(Number(run.lengthIn) > 0)) return 0;
  // Gap metadata must not be treated as stone length.
  const lengthIn = Number(run.lengthIn) || 0;
  const depthIn = Number(run.depthIn) || 0;
  const qty = Math.max(1, Number(run.quantity) || 1);
  if (!(lengthIn > 0) || !(depthIn > 0)) return 0;
  return (lengthIn * depthIn * qty) / 144;
}

export function totalCountertopSfExcludingApplianceGaps(takeoff) {
  let sf = 0;
  for (const room of takeoff?.rooms || []) {
    const lists = [];
    for (const area of room?.areas || []) lists.push(area?.runs || []);
    if (Array.isArray(room?.pieces)) lists.push(room.pieces);
    if (Array.isArray(room?.runs)) lists.push(room.runs);
    for (const list of lists) {
      for (const run of list) sf += countertopSfForRun(run);
    }
  }
  return Math.round(sf * 10000) / 10000;
}
