/**
 * eliteOS AI Takeoff — validator and diagnostics.
 *
 * Pure function: takes a TakeoffResult + precomputed TakeoffComputedMeasurements,
 * returns structured diagnostics. Does NOT mutate either input.
 *
 * Diagnostic levels:
 *   error   — takeoff cannot be imported without manual correction
 *   warning — human review recommended before import
 *   info    — informational; does not block import
 *
 * All codes are defined in TAKEOFF_DIAGNOSTIC_CODE (takeoffContract.mjs).
 */

import {
  TAKEOFF_DIAGNOSTIC_CODE,
  TAKEOFF_DIAGNOSTIC_LEVEL,
  TAKEOFF_SCHEMA_VERSION
} from "./takeoffContract.mjs";

const { INFO, WARNING, ERROR } = TAKEOFF_DIAGNOSTIC_LEVEL;
const C = TAKEOFF_DIAGNOSTIC_CODE;

/** Tolerance (sf) for AI-provided vs computed total comparison. */
const SF_TOLERANCE = 0.05;

/** Maximum plausible single run length in inches (beyond this is suspicious). */
const MAX_PLAUSIBLE_LENGTH_IN = 240;

/** Minimum plausible counter depth in inches. */
const MIN_COUNTER_DEPTH_IN = 4;

/** Maximum plausible counter depth in inches. */
const MAX_COUNTER_DEPTH_IN = 60;

/**
 * Create a diagnostic object.
 * @param {"info"|"warning"|"error"} level
 * @param {string} code
 * @param {string} message
 * @param {string} [path]
 * @param {number[]} [sourcePages]
 * @returns {import('./takeoffContract.mjs').TakeoffDiagnostic}
 */
function diag(level, code, message, path, sourcePages) {
  const d = { level, code, message };
  if (path) d.path = path;
  if (sourcePages?.length) d.sourcePages = sourcePages;
  return d;
}

/**
 * Validate a single run and return any diagnostics.
 * @param {import('./takeoffContract.mjs').TakeoffRun} run
 * @param {string} runPath
 * @returns {import('./takeoffContract.mjs').TakeoffDiagnostic[]}
 */
function validateRun(run, runPath) {
  const ds = [];
  const l = Number(run.lengthIn) || 0;
  const d = Number(run.depthIn) || 0;

  if (l <= 0) {
    ds.push(diag(ERROR, C.ZERO_LENGTH, `Run "${run.label}": lengthIn is zero or missing.`, `${runPath}.lengthIn`, run.sourcePages));
  } else if (l > MAX_PLAUSIBLE_LENGTH_IN) {
    ds.push(diag(WARNING, C.SUSPICIOUS_LENGTH, `Run "${run.label}": lengthIn ${l}" is unusually large (>${MAX_PLAUSIBLE_LENGTH_IN}").`, `${runPath}.lengthIn`, run.sourcePages));
  }

  if (d <= 0) {
    ds.push(diag(ERROR, C.ZERO_DEPTH, `Run "${run.label}": depthIn is zero or missing.`, `${runPath}.depthIn`, run.sourcePages));
  } else if (run.pieceType === "counter" || run.pieceType == null) {
    if (d < MIN_COUNTER_DEPTH_IN) {
      ds.push(diag(WARNING, C.SUSPICIOUS_DEPTH, `Run "${run.label}": counter depthIn ${d}" is unusually shallow (<${MIN_COUNTER_DEPTH_IN}").`, `${runPath}.depthIn`, run.sourcePages));
    } else if (d > MAX_COUNTER_DEPTH_IN) {
      ds.push(diag(WARNING, C.SUSPICIOUS_DEPTH, `Run "${run.label}": counter depthIn ${d}" is unusually deep (>${MAX_COUNTER_DEPTH_IN}").`, `${runPath}.depthIn`, run.sourcePages));
    }
  }

  return ds;
}

/**
 * Validate a single area.
 * @param {import('./takeoffContract.mjs').TakeoffArea} area
 * @param {string} areaPath
 * @returns {import('./takeoffContract.mjs').TakeoffDiagnostic[]}
 */
function validateArea(area, areaPath) {
  const ds = [];
  const runs = area.runs ?? [];

  if (runs.length === 0 && !(area.backsplashLinearIn > 0)) {
    ds.push(diag(WARNING, C.EMPTY_AREA, `Area "${area.label}": no runs and no backsplash linear inches defined.`, areaPath));
  }

  for (let i = 0; i < runs.length; i++) {
    ds.push(...validateRun(runs[i], `${areaPath}.runs[${i}]`));
  }

  // If backsplashLinearIn is set but no height, default 4" will be used — flag as info.
  if ((area.backsplashLinearIn ?? 0) > 0 && !(area.backsplashHeightIn > 0)) {
    ds.push(diag(INFO, C.MISSING_BACKSPLASH_HEIGHT, `Area "${area.label}": backsplashLinearIn set but backsplashHeightIn missing — defaulting to 4".`, `${areaPath}.backsplashHeightIn`));
  }

  // Cutout-in-exclusions guard (v5.5): sink/cooktop/faucet should never reduce material sf.
  const CUTOUT_KEYWORDS_RE = /\b(sink|cooktop|faucet|cutout|undermount)\b/i;
  for (const excl of (area.exclusions ?? [])) {
    if (CUTOUT_KEYWORDS_RE.test(String(excl.label ?? ""))) {
      ds.push(diag(
        WARNING,
        C.CUTOUT_IN_EXCLUSIONS_WARNING,
        `Area "${area.label}": exclusion "${excl.label}" appears to be a cutout (sink / cooktop / faucet). ` +
        `Cutouts are fabrication operations and should not reduce material square footage. ` +
        `Move this to area.notes[], area.cutouts[], or project notes unless it is a true material exclusion (e.g. a missing slab section or window opening).`,
        `${areaPath}.exclusions`
      ));
    }
  }

  return ds;
}

/**
 * Validate a single room.
 * @param {import('./takeoffContract.mjs').TakeoffRoom} room
 * @param {string} roomPath
 * @returns {import('./takeoffContract.mjs').TakeoffDiagnostic[]}
 */
function validateRoom(room, roomPath) {
  const ds = [];

  if (!room.name?.trim()) {
    ds.push(diag(WARNING, C.MISSING_ROOM_NAME, `Room at ${roomPath} has no name.`, `${roomPath}.name`));
  }

  if (room.confidence === "low") {
    ds.push(diag(WARNING, C.LOW_CONFIDENCE, `Room "${room.name}": confidence is low — manual review required.`, `${roomPath}.confidence`));
  }

  for (let i = 0; i < (room.areas ?? []).length; i++) {
    ds.push(...validateArea(room.areas[i], `${roomPath}.areas[${i}]`));
  }

  return ds;
}

/**
 * Compare AI-provided total vs eliteOS-computed total.
 * Returns a diagnostic if the difference exceeds SF_TOLERANCE.
 * @param {number|undefined} aiTotal
 * @param {number} computed
 * @param {string} code
 * @param {string} label
 * @returns {import('./takeoffContract.mjs').TakeoffDiagnostic|null}
 */
function checkTotalMismatch(aiTotal, computed, code, label) {
  if (aiTotal == null) return null;
  const diff = Math.abs(round2(Number(aiTotal)) - round2(computed));
  if (diff > SF_TOLERANCE) {
    return diag(
      WARNING,
      code,
      `${label}: AI-provided ${round2(Number(aiTotal)).toFixed(2)} sf vs eliteOS computed ${computed.toFixed(2)} sf (diff ${diff.toFixed(3)} sf, tolerance ${SF_TOLERANCE} sf). eliteOS computed value is authoritative.`,
      `aiProvidedTotals.${label.toLowerCase().replace(/\s+/g, "_")}`
    );
  }
  return null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Collect every note/assumption string from the full TakeoffResult tree.
 * Used for keyword-based backsplash heuristics.
 * @param {import('./takeoffContract.mjs').TakeoffResult} result
 * @returns {string[]}
 */
function gatherAllNotes(result) {
  return [
    ...(result.projectAssumptions ?? []),
    ...(result.rooms ?? []).flatMap((r) => [
      ...(r.notes ?? []),
      ...(r.assumptions ?? []),
      ...(r.areas ?? []).flatMap((a) => [
        ...(a.notes ?? []),
        ...(a.assumptions ?? []),
        ...(a.runs ?? []).flatMap((rn) => rn.notes ?? [])
      ])
    ])
  ];
}

/**
 * Validate a TakeoffResult against its computed measurements.
 * Returns a structured validation result with all diagnostics.
 *
 * @param {import('./takeoffContract.mjs').TakeoffResult} takeoffResult
 * @param {import('./takeoffMeasurementCalc.mjs').TakeoffComputedMeasurements} computed
 * @returns {TakeoffValidationResult}
 *
 * @typedef {Object} TakeoffValidationResult
 * @property {boolean} valid  true = no errors (may still have warnings/infos)
 * @property {boolean} hasErrors
 * @property {boolean} hasWarnings
 * @property {import('./takeoffContract.mjs').TakeoffDiagnostic[]} diagnostics
 * @property {number} errorCount
 * @property {number} warningCount
 * @property {number} infoCount
 */
export function validateTakeoffResult(takeoffResult, computed) {
  const diagnostics = [];

  // Schema version
  if (takeoffResult.schemaVersion !== TAKEOFF_SCHEMA_VERSION) {
    diagnostics.push(diag(WARNING, C.UNKNOWN_SCHEMA_VERSION, `Schema version "${takeoffResult.schemaVersion}" is not the current "${TAKEOFF_SCHEMA_VERSION}" — some fields may not be recognized.`, "schemaVersion"));
  }

  // Rooms
  if (!takeoffResult.rooms?.length) {
    diagnostics.push(diag(ERROR, C.MISSING_ROOMS, "TakeoffResult has no rooms.", "rooms"));
  } else {
    for (let i = 0; i < takeoffResult.rooms.length; i++) {
      diagnostics.push(...validateRoom(takeoffResult.rooms[i], `rooms[${i}]`));
    }
  }

  // Project-level confidence
  if (takeoffResult.confidence === "low") {
    diagnostics.push(diag(WARNING, C.LOW_CONFIDENCE, "Overall takeoff confidence is low — full manual review recommended before import.", "confidence"));
  }

  // Status check
  if (takeoffResult.status === "draft") {
    diagnostics.push(diag(INFO, C.PENDING_REVIEW, "Takeoff status is \"draft\" — must be set to \"reviewed\" or \"approved\" before import into a quote.", "status"));
  }

  // AI total vs computed comparisons
  const ai = takeoffResult.aiProvidedTotals;
  if (ai) {
    const ctMismatch = checkTotalMismatch(ai.countertopExactSf, computed.countertopExactSf, C.TOTAL_MISMATCH_COUNTERTOP, "countertopExactSf");
    if (ctMismatch) diagnostics.push(ctMismatch);

    const bsMismatch = checkTotalMismatch(ai.backsplashExactSf, computed.backsplashExactSf, C.TOTAL_MISMATCH_BACKSPLASH, "backsplashExactSf");
    if (bsMismatch) diagnostics.push(bsMismatch);

    const combMismatch = checkTotalMismatch(ai.combinedExactSf, computed.combinedExactSf, C.TOTAL_MISMATCH_COMBINED, "combinedExactSf");
    if (combMismatch) diagnostics.push(combMismatch);

    // Guard: AI reference backsplash total present but no structured backsplash was extracted.
    // This happens when the model detected backsplash but didn't populate backsplashLinearIn.
    const aiBsTotal = Number(ai.backsplashExactSf ?? 0);
    if (aiBsTotal > 0 && computed.backsplashExactSf === 0) {
      diagnostics.push(diag(
        WARNING,
        C.AI_BACKSPLASH_TOTAL_NOT_STRUCTURED,
        `Backsplash detected in AI reference total (${aiBsTotal.toFixed(2)} sf) but eliteOS computed 0.00 sf — ` +
        `no structured backsplashLinearIn / backsplashHeightIn was found in any area. ` +
        `AI reference total is not authoritative; eliteOS value is based on structured run dimensions. ` +
        `Estimator must review backsplash and enter dimensions manually if applicable.`,
        "aiProvidedTotals.backsplashExactSf"
      ));
    }
  }

  // Guard: backsplash keyword found in notes/assumptions but computed backsplash is zero.
  // Fires only when there is no AI reference total (the guard above covers that case).
  if (computed.backsplashExactSf === 0) {
    const aiProvidedBs = Number(takeoffResult.aiProvidedTotals?.backsplashExactSf ?? 0);
    if (!(aiProvidedBs > 0)) {
      const POSITIVE_BS_RE = /(?:^|[^a-z])(?:b\/s|backsplash|splash)/i;
      const NEGATIVE_BS_RE = /\bno\s+(?:b\/s|backsplash)\b/i;
      const hasPosNote = gatherAllNotes(takeoffResult).some((t) => {
        const text = String(t);
        return !NEGATIVE_BS_RE.test(text) && POSITIVE_BS_RE.test(text);
      });
      if (hasPosNote) {
        diagnostics.push(diag(
          WARNING,
          C.POSSIBLE_BACKSPLASH_NOTE,
          "Backsplash keyword found in notes or assumptions but eliteOS computed 0.00 sf backsplash. " +
          "Review whether structured backsplashLinearIn / backsplashHeightIn should be added to any area.",
          "projectAssumptions"
        ));
      }
    }
  }

  const errorCount = diagnostics.filter((d) => d.level === ERROR).length;
  const warningCount = diagnostics.filter((d) => d.level === WARNING).length;
  const infoCount = diagnostics.filter((d) => d.level === INFO).length;

  return {
    valid: errorCount === 0,
    hasErrors: errorCount > 0,
    hasWarnings: warningCount > 0,
    diagnostics,
    errorCount,
    warningCount,
    infoCount
  };
}
