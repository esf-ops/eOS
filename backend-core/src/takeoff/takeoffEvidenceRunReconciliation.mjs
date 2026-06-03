/**
 * takeoffEvidenceRunReconciliation — per-run evidence traceability check (v6.0).
 *
 * Pure helper: no I/O, no AI calls, no pricing, no DB.
 * Safe to import in both Node.js (backend) and browser (via @takeoff-core alias).
 *
 * Problem this solves:
 *   The dimension evidence pass produces a table of labeled lengths/depths directly
 *   read from the plan. The final extraction pass assembles TakeoffResult runs from
 *   that table (or in some cases, invents dimensions). This helper checks whether
 *   every final run can be traced back to evidence — and flags runs that cannot.
 *
 * Three-tier per-run length verdict:
 *   supported  — run length is within EXACT_MATCH_IN of at least one high-confidence
 *                countertop-category evidence dimension (same dimension, rounding only)
 *   changed    — nearest evidence dimension is within SUPPORT_RANGE_IN but NOT within
 *                EXACT_MATCH_IN (model modified a dimension without explanation)
 *   unsupported — no evidence dimension is within SUPPORT_RANGE_IN of the run's length
 *                (model invented this dimension, or evidence was never extracted)
 *
 * Conflict detection:
 *   When a run's length has 2+ evidence dimensions all within SUPPORT_RANGE_IN, the
 *   model silently chose one without explanation → CONFLICTING_DIMENSIONS_USED_SILENTLY.
 *
 * Corner deduction check:
 *   If an area has cornerDeductions but no overlapMode set (L-Shape/U-Shape), the
 *   deduction is likely unjustified → UNSUPPORTED_CORNER_DEDUCTION.
 *
 * requiresEstimatorReview flag:
 *   If the AI model set run.requiresEstimatorReview = true on any run →
 *   DRAFT_ASSEMBLY_REVIEW_REQUIRED (the model itself flagged an issue).
 *
 * Standard depth exemption:
 *   25.5" (standard kitchen counter) and 21.5" (standard vanity) are accepted
 *   without depth evidence — they are universal fabrication defaults.
 *
 * @module takeoffEvidenceRunReconciliation
 */

import {
  TAKEOFF_DIAGNOSTIC_CODE,
  TAKEOFF_DIAGNOSTIC_LEVEL,
} from "./takeoffContract.mjs";

const { WARNING } = TAKEOFF_DIAGNOSTIC_LEVEL;
const C = TAKEOFF_DIAGNOSTIC_CODE;

// ── Matching thresholds (inches) ───────────────────────────────────────────────

/** Within 1" = same dimension (rounding tolerance). Runs ≤EXACT_MATCH_IN away are "supported". */
const EXACT_MATCH_IN = 1;

/**
 * Within 10" = possibly derived from that dimension.
 * Runs >EXACT_MATCH_IN but ≤SUPPORT_RANGE_IN → "changed" (EVIDENCE_DIMENSION_CHANGED_IN_RUN).
 * Runs >SUPPORT_RANGE_IN from all evidence → "unsupported" (RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE).
 */
const SUPPORT_RANGE_IN = 10;

/** Standard kitchen counter depth — no depth evidence required. */
const STANDARD_COUNTER_DEPTH_IN = 25.5;

/** Standard bathroom vanity depth — no depth evidence required. */
const STANDARD_VANITY_DEPTH_IN = 21.5;

/** Tolerance for "is this a standard depth?" check (±1"). */
const STANDARD_DEPTH_TOLERANCE_IN = 1;

/** Evidence dimension categories that should produce TakeoffResult counter runs. */
const COUNTERTOP_CATEGORIES = new Set(["countertop_run", "island"]);

// ── Diagnostic builder ─────────────────────────────────────────────────────────

function diag(level, code, message, path, sourcePages) {
  const d = { level, code, message };
  if (path)        d.path = path;
  if (sourcePages?.length) d.sourcePages = sourcePages;
  return d;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Return all high-confidence countertop-category evidence dimensions with a known length.
 */
function eligibleEvidenceDims(dimensionEvidence) {
  if (!dimensionEvidence || !Array.isArray(dimensionEvidence.dimensions)) return [];
  return dimensionEvidence.dimensions.filter(
    (d) =>
      d.confidence === "high" &&
      COUNTERTOP_CATEGORIES.has(d.category) &&
      d.lengthIn != null
  );
}

/**
 * Is the given depth "standard" and therefore exempt from evidence checks?
 */
function isStandardDepth(depthIn) {
  const d = Number(depthIn);
  return (
    Math.abs(d - STANDARD_COUNTER_DEPTH_IN) <= STANDARD_DEPTH_TOLERANCE_IN ||
    Math.abs(d - STANDARD_VANITY_DEPTH_IN)  <= STANDARD_DEPTH_TOLERANCE_IN
  );
}

/**
 * Find all evidence dimensions within a given inch tolerance of a target length.
 */
function evidenceWithinRange(eligible, targetLength, toleranceIn) {
  const t = Number(targetLength);
  return eligible.filter((d) => Math.abs(Number(d.lengthIn) - t) <= toleranceIn);
}

/**
 * Flatten all TakeoffRun objects from a TakeoffResult, preserving location context.
 * @returns {Array<{ run: object, runPath: string, areaPath: string, area: object }>}
 */
function flattenRunsWithContext(takeoffResult) {
  const out = [];
  for (let ri = 0; ri < (takeoffResult?.rooms ?? []).length; ri++) {
    const room = takeoffResult.rooms[ri];
    for (let ai = 0; ai < (room?.areas ?? []).length; ai++) {
      const area    = room.areas[ai];
      const areaPath = `rooms[${ri}].areas[${ai}]`;
      for (let xi = 0; xi < (area?.runs ?? []).length; xi++) {
        out.push({
          run:      area.runs[xi],
          runPath:  `${areaPath}.runs[${xi}]`,
          areaPath,
          area,
        });
      }
    }
  }
  return out;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Reconcile final TakeoffResult runs against extracted dimension evidence.
 *
 * @param {{
 *   takeoffResult:        object,   — TakeoffResult (required)
 *   dimensionEvidence:    object|null — DimensionEvidence from evidence pass (required for checks)
 *   computedMeasurements: object|null — TakeoffComputedMeasurements (unused here, reserved)
 * }} params
 *
 * @returns {{
 *   runLinks:                   RunLink[],
 *   unusedHighConfidenceDimensions: object[],
 *   unsupportedRuns:            RunLink[],
 *   changedRuns:                RunLink[],
 *   conflictingRuns:            RunLink[],
 *   cornerDeductionWarnings:    Array<{ areaPath: string, areaLabel: string }>,
 *   assemblyReviewRuns:         RunLink[],
 *   diagnostics:                TakeoffDiagnostic[],
 *   checksRan:                  boolean,
 * }}
 *
 * @typedef {{
 *   runId:          string,
 *   runLabel:       string,
 *   runPath:        string,
 *   lengthIn:       number,
 *   depthIn:        number,
 *   sourcePages:    number[],
 *   verdict:        "supported" | "changed" | "unsupported" | "exempt",
 *   matchedDims:    object[],
 *   nearestChanged: object | null,
 *   conflicting:    boolean,
 *   depthStandard:  boolean,
 * }} RunLink
 */
export function reconcileRunsWithEvidence({
  takeoffResult,
  dimensionEvidence = null,
}) {
  const eligible  = eligibleEvidenceDims(dimensionEvidence);
  const flatRuns  = flattenRunsWithContext(takeoffResult);
  const diagnostics = [];

  // ── Per-run length analysis ──────────────────────────────────────────────

  /** @type {RunLink[]} */
  const runLinks = [];

  // Track which evidence dims are matched by at least one run (for unused-dim reporting).
  const matchedEvidenceIds = new Set();

  for (const { run, runPath, areaPath, area } of flatRuns) {
    // Only check counter-type runs (not splash or fhb).
    const pType = run.pieceType ?? "counter";
    if (pType !== "counter") {
      runLinks.push({
        runId: run.id, runLabel: run.label, runPath, lengthIn: Number(run.lengthIn),
        depthIn: Number(run.depthIn), sourcePages: run.sourcePages ?? [],
        verdict: "exempt", matchedDims: [], nearestChanged: null, conflicting: false,
        depthStandard: isStandardDepth(run.depthIn),
      });
      continue;
    }

    // Skip length check when no evidence is available.
    if (eligible.length === 0) {
      runLinks.push({
        runId: run.id, runLabel: run.label, runPath, lengthIn: Number(run.lengthIn),
        depthIn: Number(run.depthIn), sourcePages: run.sourcePages ?? [],
        verdict: "exempt", matchedDims: [], nearestChanged: null, conflicting: false,
        depthStandard: isStandardDepth(run.depthIn),
      });
      continue;
    }

    const runLen = Number(run.lengthIn) || 0;

    // Exact matches (within EXACT_MATCH_IN).
    const exactMatches = evidenceWithinRange(eligible, runLen, EXACT_MATCH_IN);
    // Nearby matches (within SUPPORT_RANGE_IN but not within EXACT_MATCH_IN).
    const nearMatches  = evidenceWithinRange(eligible, runLen, SUPPORT_RANGE_IN)
      .filter((d) => Math.abs(Number(d.lengthIn) - runLen) > EXACT_MATCH_IN);

    // Only track exact matches as "used evidence".
    // Near matches indicate the dimension was changed/conflicting — they do not
    // count as "used" and therefore remain in unusedHighConfidenceDimensions.
    for (const d of exactMatches) matchedEvidenceIds.add(d.id ?? d.label);

    let verdict;
    let nearestChanged = null;
    // Conflict: multiple exact matches, OR one exact + at least one near
    // (a clear match exists but there are also nearby alternatives suggesting
    //  a floor-plan vs elevation discrepancy that the model chose without explanation).
    const conflicting = exactMatches.length >= 2 ||
      (exactMatches.length === 1 && nearMatches.length >= 1);

    if (exactMatches.length >= 1) {
      verdict = "supported";
    } else if (nearMatches.length >= 1) {
      verdict = "changed";
      nearestChanged = nearMatches.reduce((best, d) =>
        Math.abs(Number(d.lengthIn) - runLen) < Math.abs(Number(best.lengthIn) - runLen)
          ? d : best
      );
    } else {
      verdict = "unsupported";
    }

    const depthStandard = isStandardDepth(run.depthIn);

    runLinks.push({
      runId:   run.id,
      runLabel: run.label,
      runPath,
      lengthIn: runLen,
      depthIn:  Number(run.depthIn) || 0,
      sourcePages: run.sourcePages ?? [],
      verdict,
      matchedDims: exactMatches.length >= 1 ? exactMatches : nearMatches,
      nearestChanged,
      conflicting,
      depthStandard,
    });

    // ── Emit diagnostics for this run ────────────────────────────────────

    if (verdict === "unsupported") {
      diagnostics.push(diag(
        WARNING,
        C.RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE,
        `Run "${run.label}" (${runLen}"): length is not supported by any high-confidence dimension evidence ` +
        `(no evidence within ±${SUPPORT_RANGE_IN}"). ` +
        `The model may have invented this dimension. Estimator must verify against the plan.`,
        `${runPath}.lengthIn`,
        run.sourcePages
      ));
    } else if (verdict === "changed" && nearestChanged) {
      const evLen = Number(nearestChanged.lengthIn);
      const delta = Math.abs(runLen - evLen).toFixed(1);
      diagnostics.push(diag(
        WARNING,
        C.EVIDENCE_DIMENSION_CHANGED_IN_RUN,
        `Run "${run.label}" (${runLen}"): length differs from nearest evidence dimension ` +
        `"${nearestChanged.label}" (${evLen}", page ${nearestChanged.pageNumber ?? "?"}) ` +
        `by ${delta}". The model may have silently modified this dimension. ` +
        `Estimator must verify which value is correct.`,
        `${runPath}.lengthIn`,
        run.sourcePages
      ));
    }

    if (conflicting) {
      const allConflicting = [...exactMatches, ...nearMatches];
      const dimList = allConflicting
        .map((d) => `"${d.label}" ${d.lengthIn}"`)
        .join(", ");
      diagnostics.push(diag(
        WARNING,
        C.CONFLICTING_DIMENSIONS_USED_SILENTLY,
        `Run "${run.label}" (${runLen}"): multiple evidence dimensions are nearby (${dimList}). ` +
        `The model chose one without explanation. ` +
        `If these represent different plan views of the same wall, estimator must verify which is correct.`,
        `${runPath}.lengthIn`,
        run.sourcePages
      ));
    }

    // Flag runs where the AI model itself set requiresEstimatorReview.
    if (run.requiresEstimatorReview === true) {
      diagnostics.push(diag(
        WARNING,
        C.DRAFT_ASSEMBLY_REVIEW_REQUIRED,
        `Run "${run.label}": the AI model flagged this run as requiring estimator review ` +
        `(requiresEstimatorReview=true). ` +
        (run.assemblyNotes ? `Assembly note: "${run.assemblyNotes}". ` : "") +
        `Verify this run's dimensions against the plan before using this takeoff.`,
        `${runPath}.requiresEstimatorReview`,
        run.sourcePages
      ));
    }
  }

  // ── Unused high-confidence evidence dimensions ──────────────────────────
  //
  // Note: this overlaps with EVIDENCE_DIMENSION_NOT_USED in takeoffValidator.mjs.
  // The validator uses a ±5" match tolerance (compareDimensionEvidenceToTakeoffRuns).
  // Here we use the exclusive-match set (matchedEvidenceIds) which is stricter.
  // Both produce warnings — the validator's code is the authoritative one for QA gate.
  // We still compute this here for UI display purposes (Evidence Trace panel).

  const unusedHighConfidenceDimensions = eligible.filter(
    (d) => !matchedEvidenceIds.has(d.id ?? d.label)
  );

  // ── Corner deduction checks ─────────────────────────────────────────────

  const cornerDeductionWarnings = [];

  for (const { area, areaPath } of flatRuns) {
    if (!(area.cornerDeductions?.length > 0)) continue;
    // Corner deductions are expected when overlapMode is L-Shape or U-Shape.
    const hasShapeMode = area.overlapMode === "L-Shape" || area.overlapMode === "U-Shape";
    if (!hasShapeMode) {
      // Only emit once per area (flatRuns may include multiple runs in the same area).
      const alreadyAdded = cornerDeductionWarnings.some((w) => w.areaPath === areaPath);
      if (!alreadyAdded) {
        cornerDeductionWarnings.push({ areaPath, areaLabel: area.label ?? areaPath });
        diagnostics.push(diag(
          WARNING,
          C.UNSUPPORTED_CORNER_DEDUCTION,
          `Area "${area.label}": has cornerDeductions but overlapMode is "${area.overlapMode ?? "none"}". ` +
          `Corner deductions are only valid for L-Shape or U-Shape layouts. ` +
          `If this is not an L/U-shape, these deductions incorrectly reduce countertop sf. ` +
          `Verify the layout type and remove unsupported deductions.`,
          `${areaPath}.cornerDeductions`
        ));
      }
    }
  }

  // ── Categorised run lists ───────────────────────────────────────────────

  const unsupportedRuns   = runLinks.filter((r) => r.verdict === "unsupported");
  const changedRuns       = runLinks.filter((r) => r.verdict === "changed");
  const conflictingRuns   = runLinks.filter((r) => r.conflicting);
  const assemblyReviewRuns = flatRuns
    .filter(({ run }) => run.requiresEstimatorReview === true)
    .map(({ run, runPath }) => ({ runId: run.id, runLabel: run.label, runPath }));

  return {
    runLinks,
    unusedHighConfidenceDimensions,
    unsupportedRuns,
    changedRuns,
    conflictingRuns,
    cornerDeductionWarnings,
    assemblyReviewRuns,
    diagnostics,
    checksRan: eligible.length > 0,
  };
}
