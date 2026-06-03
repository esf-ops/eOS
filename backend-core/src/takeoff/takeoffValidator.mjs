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
import { compareDimensionEvidenceToTakeoffRuns } from "./takeoffEvidenceCoverage.mjs";
import { reconcileRunsWithEvidence } from "./takeoffEvidenceRunReconciliation.mjs";
import { evaluateTakeoffFabricationRules } from "./takeoffFabricationRules.mjs";

const { INFO, WARNING, ERROR } = TAKEOFF_DIAGNOSTIC_LEVEL;
const C = TAKEOFF_DIAGNOSTIC_CODE;

/** Tolerance (sf) for AI-provided vs computed total comparison. */
const SF_TOLERANCE = 0.05;

/** Tolerances (sf) for reference total vs computed reconciliation (v5.6). */
const REF_TOTAL_CT_TOLERANCE       = 2;
const REF_TOTAL_BS_TOLERANCE       = 1;
const REF_TOTAL_COMBINED_TOLERANCE = 2;

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
 * @param {object|null} [dimensionEvidence] - passed down for depth evidence check
 * @returns {import('./takeoffContract.mjs').TakeoffDiagnostic[]}
 */
function validateRun(run, runPath, dimensionEvidence = null) {
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
    } else if (d > 26) {
      // Nonstandard depth check (v5.9.2 / v6.2):
      // Island/peninsula/raised-bar/desk/waterfall depths must come from visible plan dimensions.
      // Standard wall counters are 25.5"; anything notably above that for a specialty piece
      // requires explicit plan evidence.
      //
      // v6.2 refinement: if the run has depthEvidenceId set, or if the dimension evidence table
      // contains a matching depth, we emit NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE (info, via
      // fabrication rules module) rather than NONSTANDARD_DEPTH_ASSUMED (warning).
      // The validator emits NONSTANDARD_DEPTH_ASSUMED only when evidence is absent.
      const NONSTANDARD_PIECE_RE = /\b(island|peninsula|raised[\s-]bar|bar[\s-]top|desk|waterfall|specialty)\b/i;
      if (NONSTANDARD_PIECE_RE.test(String(run.label ?? ""))) {
        // Check if depth has evidence support.
        const hasDepthEvidence = _hasDepthEvidence(run, dimensionEvidence);

        if (!hasDepthEvidence) {
          ds.push(diag(
            WARNING,
            C.NONSTANDARD_DEPTH_ASSUMED,
            `Run "${run.label}": depth ${d}" is nonstandard for a standard wall counter (standard = 25.5"). ` +
            `Island, peninsula, raised bar, desk, and waterfall depths must come from visible plan dimensions — ` +
            `they cannot be assumed or invented. Verify this dimension is documented on the plan before using this takeoff.`,
            `${runPath}.depthIn`,
            run.sourcePages
          ));
        }
        // If depth HAS evidence, the fabrication rules module emits NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE (info).
        // We do not emit a warning here — the validator is silent when evidence is present.
      }
    }
  }

  return ds;
}

/**
 * Validate a single area.
 * @param {import('./takeoffContract.mjs').TakeoffArea} area
 * @param {string} areaPath
 * @param {object|null} [dimensionEvidence]
 * @returns {import('./takeoffContract.mjs').TakeoffDiagnostic[]}
 */
function validateArea(area, areaPath, dimensionEvidence = null) {
  const ds = [];
  const runs = area.runs ?? [];

  if (runs.length === 0 && !(area.backsplashLinearIn > 0) && !(area.backsplashManualSf > 0)) {
    ds.push(diag(WARNING, C.EMPTY_AREA, `Area "${area.label}": no runs and no backsplash linear inches defined.`, areaPath));
  }

  for (let i = 0; i < runs.length; i++) {
    ds.push(...validateRun(runs[i], `${areaPath}.runs[${i}]`, dimensionEvidence));
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
 * @param {object|null} [dimensionEvidence]
 * @returns {import('./takeoffContract.mjs').TakeoffDiagnostic[]}
 */
function validateRoom(room, roomPath, dimensionEvidence = null) {
  const ds = [];

  if (!room.name?.trim()) {
    ds.push(diag(WARNING, C.MISSING_ROOM_NAME, `Room at ${roomPath} has no name.`, `${roomPath}.name`));
  }

  if (room.confidence === "low") {
    ds.push(diag(WARNING, C.LOW_CONFIDENCE, `Room "${room.name}": confidence is low — manual review required.`, `${roomPath}.confidence`));
  }

  for (let i = 0; i < (room.areas ?? []).length; i++) {
    ds.push(...validateArea(room.areas[i], `${roomPath}.areas[${i}]`, dimensionEvidence));
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
 * Check if a run's depth has supporting evidence (v6.2 depth refinement).
 * @param {object} run
 * @param {object|null} dimensionEvidence
 * @returns {boolean}
 */
function _hasDepthEvidence(run, dimensionEvidence) {
  // Direct citation.
  if (run.depthEvidenceId) {
    if (dimensionEvidence?.dimensions) {
      return dimensionEvidence.dimensions.some(
        (d) => (d.id ?? d.label) === run.depthEvidenceId
      );
    }
    return true; // depthEvidenceId set but no evidence table — trust reviewer assertion
  }
  // Table scan: any evidence dimension with a matching depthIn.
  if (dimensionEvidence?.dimensions) {
    const d = Number(run.depthIn);
    return dimensionEvidence.dimensions.some(
      (dim) => dim.depthIn != null && Math.abs(Number(dim.depthIn) - d) <= 1
    );
  }
  return false;
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
 * @param {object|null} [dimensionEvidence] - optional DimensionEvidence from evidence pass (v5.6)
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
export function validateTakeoffResult(takeoffResult, computed, dimensionEvidence = null) {
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
      diagnostics.push(...validateRoom(takeoffResult.rooms[i], `rooms[${i}]`, dimensionEvidence));
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
    // v6.3: suppress when estimator has explicitly chosen no-stone or tile-by-others scope
    //       (natural suppression also occurs when computed.backsplashExactSf > 0 after manual sf entry).
    const aiBsTotal = Number(ai.backsplashExactSf ?? 0);
    const estimatorChoseNoBS = (takeoffResult.rooms ?? []).some(
      (r) => (r.areas ?? []).some((a) =>
        a.backsplashScope === "no_stone" || a.backsplashScope === "tile_by_others"
      )
    );
    if (aiBsTotal > 0 && computed.backsplashExactSf === 0 && !estimatorChoseNoBS) {
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

  // Reference total reconciliation (v5.6)
  // Compare visible estimator reference totals against eliteOS computed values.
  // These are warnings only — eliteOS computed structured runs remain authoritative.
  if (Array.isArray(dimensionEvidence?.referenceTotals) && dimensionEvidence.referenceTotals.length > 0) {
    for (const ref of dimensionEvidence.referenceTotals) {
      if (ref.confidence === "low") continue;
      const pageNums = ref.pageNumber ? [ref.pageNumber] : undefined;

      if (ref.countertopSf != null) {
        const diff = round2(Math.abs(round2(Number(ref.countertopSf)) - round2(computed.countertopExactSf)));
        if (diff > REF_TOTAL_CT_TOLERANCE) {
          diagnostics.push(diag(
            WARNING,
            C.REFERENCE_TOTAL_COUNTERTOP_MISMATCH,
            `Visible reference total "${ref.rawText}" shows ${round2(Number(ref.countertopSf))} sf countertop ` +
            `but eliteOS computed ${round2(computed.countertopExactSf)} sf ` +
            `(diff ${diff.toFixed(2)} sf, tolerance ${REF_TOTAL_CT_TOLERANCE} sf). ` +
            `Estimator review required — verify whether structured dimensions or the reference total is correct.`,
            "dimensionEvidence.referenceTotals",
            pageNums
          ));
        }
      }

      if (ref.backsplashSf != null && !ref.noBacksplash) {
        const diff = round2(Math.abs(round2(Number(ref.backsplashSf)) - round2(computed.backsplashExactSf)));
        if (diff > REF_TOTAL_BS_TOLERANCE) {
          diagnostics.push(diag(
            WARNING,
            C.REFERENCE_TOTAL_BACKSPLASH_MISMATCH,
            `Visible reference total "${ref.rawText}" shows ${round2(Number(ref.backsplashSf))} sf backsplash ` +
            `but eliteOS computed ${round2(computed.backsplashExactSf)} sf ` +
            `(diff ${diff.toFixed(2)} sf, tolerance ${REF_TOTAL_BS_TOLERANCE} sf). ` +
            `Estimator review required.`,
            "dimensionEvidence.referenceTotals",
            pageNums
          ));
        }
      }

      if (ref.combinedSf != null) {
        const diff = round2(Math.abs(round2(Number(ref.combinedSf)) - round2(computed.combinedExactSf)));
        if (diff > REF_TOTAL_COMBINED_TOLERANCE) {
          diagnostics.push(diag(
            WARNING,
            C.REFERENCE_TOTAL_COMBINED_MISMATCH,
            `Visible reference total "${ref.rawText}" shows ${round2(Number(ref.combinedSf))} sf combined ` +
            `but eliteOS computed ${round2(computed.combinedExactSf)} sf ` +
            `(diff ${diff.toFixed(2)} sf, tolerance ${REF_TOTAL_COMBINED_TOLERANCE} sf). ` +
            `Estimator review required.`,
            "dimensionEvidence.referenceTotals",
            pageNums
          ));
        }
      }

      if (ref.noBacksplash === true && computed.backsplashExactSf > 0) {
        diagnostics.push(diag(
          WARNING,
          C.REFERENCE_TOTAL_NO_BS_CONFLICT,
          `Plan note "${ref.rawText}" indicates no backsplash, ` +
          `but eliteOS computed ${round2(computed.backsplashExactSf)} sf backsplash. ` +
          `Estimator review required — check whether backsplash should be removed from all areas.`,
          "dimensionEvidence.referenceTotals",
          ref.pageNumber ? [ref.pageNumber] : undefined
        ));
      }
    }
  }

  // Evidence coverage check (v5.6)
  // Warn about high-confidence evidence dimensions not represented in the final TakeoffResult.
  if (dimensionEvidence) {
    const coverage = compareDimensionEvidenceToTakeoffRuns(dimensionEvidence, takeoffResult);
    for (const dim of coverage.unusedDimensions) {
      const depthStr = dim.depthIn != null ? ` × ${dim.depthIn}"` : "";
      diagnostics.push(diag(
        WARNING,
        C.EVIDENCE_DIMENSION_NOT_USED,
        `High-confidence dimension "${dim.label}" (${dim.lengthIn}"${depthStr}, page ${dim.pageNumber ?? "?"}) ` +
        `was extracted in the evidence pass but has no matching run in the final TakeoffResult ` +
        `(within ±5"). Estimator review required — was this dimension dropped or merged?`,
        "rooms",
        dim.pageNumber != null ? [dim.pageNumber] : undefined
      ));
    }
  }

  // Evidence-to-run reconciliation (v6.0)
  // Per-run check: is every final run traceable to extracted dimension evidence?
  // Produces new diagnostic codes: RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE,
  // EVIDENCE_DIMENSION_CHANGED_IN_RUN, CONFLICTING_DIMENSIONS_USED_SILENTLY,
  // UNSUPPORTED_CORNER_DEDUCTION, DRAFT_ASSEMBLY_REVIEW_REQUIRED.
  if (dimensionEvidence) {
    try {
      const reconciliation = reconcileRunsWithEvidence({ takeoffResult, dimensionEvidence });
      // Only add reconciliation diagnostics when evidence checks actually ran
      // (i.e., there were high-confidence countertop evidence dimensions to check against).
      if (reconciliation.checksRan) {
        for (const d of reconciliation.diagnostics) {
          // Avoid duplicating UNSUPPORTED_CORNER_DEDUCTION if already added (it cannot be,
          // since this is the only place it is emitted, but guard defensively).
          diagnostics.push(d);
        }
      } else {
        // No eligible evidence dims to match against, but still check corner deductions
        // and requiresEstimatorReview flags (these don't require evidence to be present).
        for (const d of reconciliation.diagnostics) {
          if (
            d.code === C.UNSUPPORTED_CORNER_DEDUCTION ||
            d.code === C.DRAFT_ASSEMBLY_REVIEW_REQUIRED
          ) {
            diagnostics.push(d);
          }
        }
      }
    } catch {
      // Reconciliation is non-fatal — never block validation for a reconciliation error.
    }
  } else {
    // No evidence available: still check corner deductions and review flags.
    try {
      const reconciliation = reconcileRunsWithEvidence({ takeoffResult, dimensionEvidence: null });
      for (const d of reconciliation.diagnostics) {
        if (
          d.code === C.UNSUPPORTED_CORNER_DEDUCTION ||
          d.code === C.DRAFT_ASSEMBLY_REVIEW_REQUIRED
        ) {
          diagnostics.push(d);
        }
      }
    } catch {
      // Non-fatal.
    }
  }

  // Fabrication rules engine (v6.2)
  // Run all deterministic fabrication rules and merge findings into diagnostics.
  // This is non-fatal — never blocks validation for a fabrication rules error.
  try {
    const fabrication = evaluateTakeoffFabricationRules({
      takeoffResult,
      dimensionEvidence,
      validationDiagnostics: null, // diagnostics still accumulating
    });
    for (const f of fabrication.findings) {
      // Convert fabrication finding to a TakeoffDiagnostic for consistency.
      // Fabrication findings always have source: "fabrication_rule" but diagnostics use level/code/message.
      diagnostics.push({
        level:   f.level,
        code:    f.code,
        message: f.message,
        ...(f.path ? { path: f.path } : {}),
        source:  "fabrication_rule",
      });
    }
  } catch {
    // Non-fatal — fabrication rules must never block validation.
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
