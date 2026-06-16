/**
 * takeoffValidationFixes — deterministic UI fixes for common approval blockers.
 *
 * Pure functions: no I/O, no quote mutation, no pricing logic.
 * Used by AI Takeoff Lab to resolve cutout-in-exclusions issues without raw JSON edits.
 */

/** @typedef {"move_to_cutouts" | "move_to_notes" | "remove"} CutoutExclusionFixAction */

/** Matches sink/cooktop/faucet cutout labels misplaced in exclusions[]. */
export const CUTOUT_KEYWORDS_RE = /\b(sink|cooktop|faucet|cutout|undermount|range|stove)\b/i;

export const CUTOUT_EXCLUSION_DIAGNOSTIC_CODES = new Set([
  "CUTOUT_IN_EXCLUSIONS_WARNING",
  "CUTOUT_DEDUCTED_FROM_MATERIAL",
]);

/**
 * @param {string} label
 * @returns {"sink"|"cooktop"|"faucet"|"cutout"}
 */
export function inferCutoutType(label) {
  const l = String(label ?? "").toLowerCase();
  if (/\b(sink|undermount)\b/.test(l)) return "sink";
  if (/\b(cooktop|range|stove)\b/.test(l)) return "cooktop";
  if (/\bfaucet\b/.test(l)) return "faucet";
  return "cutout";
}

/**
 * List cutout-like exclusions that should be moved out of material exclusions.
 *
 * @param {object} takeoffResult
 * @returns {Array<{
 *   id: string,
 *   code: string,
 *   roomIdx: number,
 *   areaIdx: number,
 *   exclusionIdx: number,
 *   roomName: string,
 *   areaLabel: string,
 *   exclusionLabel: string,
 *   path: string,
 * }>}
 */
export function listCutoutExclusionFixes(takeoffResult) {
  const fixes = [];
  for (let ri = 0; ri < (takeoffResult?.rooms ?? []).length; ri++) {
    const room = takeoffResult.rooms[ri];
    for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      for (let ei = 0; ei < (area?.exclusions ?? []).length; ei++) {
        const excl = area.exclusions[ei];
        const label = String(excl?.label ?? "").trim();
        if (!label || !CUTOUT_KEYWORDS_RE.test(label)) continue;
        fixes.push({
          id: `cutout-excl-${ri}-${ai}-${ei}`,
          code: "CUTOUT_IN_EXCLUSIONS",
          roomIdx: ri,
          areaIdx: ai,
          exclusionIdx: ei,
          roomName: room.name ?? `Room ${ri + 1}`,
          areaLabel: area.label ?? `Area ${ai + 1}`,
          exclusionLabel: label,
          path: `rooms[${ri}].areas[${ai}].exclusions`,
        });
      }
    }
  }
  return fixes;
}

/**
 * @param {object} takeoffResult
 * @param {ReturnType<typeof listCutoutExclusionFixes>[number]} fix
 * @param {CutoutExclusionFixAction} action
 * @returns {object} new TakeoffResult draft
 */
export function applyCutoutExclusionFix(takeoffResult, fix, action) {
  if (!takeoffResult || typeof takeoffResult !== "object") {
    throw new Error("takeoffResult must be an object");
  }

  const { roomIdx, areaIdx, exclusionIdx } = fix;
  const rooms = (takeoffResult.rooms ?? []).map((room, ri) => {
    if (ri !== roomIdx) return room;
    return {
      ...room,
      areas: (room.areas ?? []).map((area, ai) => {
        if (ai !== areaIdx) return area;
        const exclusions = [...(area.exclusions ?? [])];
        if (exclusionIdx < 0 || exclusionIdx >= exclusions.length) {
          throw new Error("Exclusion index out of range");
        }
        const [removed] = exclusions.splice(exclusionIdx, 1);
        const label = String(removed?.label ?? fix.exclusionLabel ?? "Cutout").trim();
        const next = {
          ...area,
          exclusions: exclusions.length > 0 ? exclusions : undefined,
        };

        if (action === "remove") {
          return next;
        }

        if (action === "move_to_notes") {
          const note = `Fabrication cutout (not a material exclusion): ${label}`;
          const notes = [...(area.notes ?? [])];
          if (!notes.includes(note)) notes.push(note);
          return { ...next, notes };
        }

        const cutoutEntry = {
          type: inferCutoutType(label),
          label,
          confidence: "reviewed",
          notes: ["Moved from exclusions[] by estimator — fabrication only, does not reduce material sf."],
        };
        const cutouts = [...(area.cutouts ?? []), cutoutEntry];
        return { ...next, cutouts };
      }),
    };
  });

  return { ...takeoffResult, rooms };
}

/**
 * @param {object} takeoffResult
 * @param {import('./takeoffValidator.mjs').validateTakeoffResult} validationResult optional precomputed
 */
export function listFixableValidationIssues(takeoffResult, validationResult = null) {
  const cutoutFixes = listCutoutExclusionFixes(takeoffResult);
  const diagnostics = validationResult?.diagnostics ?? [];
  const hasCutoutDiagnostic = diagnostics.some(
    (d) => CUTOUT_EXCLUSION_DIAGNOSTIC_CODES.has(d.code)
  );

  if (cutoutFixes.length === 0) return [];

  return cutoutFixes.map((fix) => ({
    ...fix,
    title: "Cutout listed as material exclusion",
    message:
      `"${fix.exclusionLabel}" in ${fix.roomName} / ${fix.areaLabel} reduces countertop sf incorrectly. ` +
      "Cutouts are fabrication operations — move to cutouts[] or notes[], or remove from exclusions.",
    hasDiagnostic: hasCutoutDiagnostic,
  }));
}
