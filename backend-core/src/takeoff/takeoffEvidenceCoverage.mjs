/**
 * takeoffEvidenceCoverage — compares dimension evidence to final TakeoffResult runs.
 *
 * Pure helper: no I/O, no AI calls, no pricing, no DB.
 *
 * Purpose:
 *   Identifies high-confidence evidence dimensions (from the dimension evidence pass)
 *   that were NOT represented by any run in the final TakeoffResult. This distinguishes
 *   two failure modes:
 *     A) "Model failed to see the dimension in the plan" (evidence pass also missed it)
 *     B) "Model saw the dimension but dropped it during TakeoffResult assembly"
 *
 *   Case B — evidenced but not used — is flagged here as EVIDENCE_DIMENSION_NOT_USED.
 *
 * Matching rules:
 *   - Only check dimensions with confidence = "high".
 *   - Only check categories that should produce TakeoffResult runs: countertop_run, island.
 *   - Ignore dimensions with no lengthIn (cannot match without a length).
 *   - Match by length within ±MATCH_TOLERANCE_IN; also match depth if evidence has it.
 *   - A "match" means the dimension was likely represented, even if labeled differently.
 */

/** Tolerance (inches) for length/depth matching between evidence and final runs. */
const MATCH_TOLERANCE_IN = 5;

/** Evidence dimension categories that should produce countertop TakeoffResult runs. */
const COUNTERTOP_CATEGORIES = new Set(["countertop_run", "island"]);

/**
 * Check whether a single evidence dimension is matched by any run in a flat runs array.
 *
 * @param {object} dim - EvidenceDimension (from DimensionEvidence)
 * @param {object[]} allRuns - flat array of TakeoffRun objects from the final result
 * @returns {boolean}
 */
function isMatchedByAnyRun(dim, allRuns) {
  if (dim.lengthIn == null) return true; // no length to compare — skip
  const dimLen = Number(dim.lengthIn);
  for (const run of allRuns) {
    const runLen = Number(run.lengthIn) || 0;
    if (Math.abs(runLen - dimLen) <= MATCH_TOLERANCE_IN) {
      // Length matches. Also check depth if the evidence has it.
      if (dim.depthIn != null) {
        const dimDep = Number(dim.depthIn);
        const runDep = Number(run.depthIn) || 0;
        if (Math.abs(runDep - dimDep) <= MATCH_TOLERANCE_IN) {
          return true;
        }
      } else {
        // Length matched, no depth constraint — considered matched.
        return true;
      }
    }
  }
  return false;
}

/**
 * Flatten all TakeoffRun objects from a TakeoffResult tree.
 *
 * @param {import('./takeoffContract.mjs').TakeoffResult} takeoffResult
 * @returns {import('./takeoffContract.mjs').TakeoffRun[]}
 */
function flattenAllRuns(takeoffResult) {
  const runs = [];
  for (const room of takeoffResult.rooms ?? []) {
    for (const area of room.areas ?? []) {
      for (const run of area.runs ?? []) {
        runs.push(run);
      }
    }
  }
  return runs;
}

/**
 * Compare dimension evidence to the final TakeoffResult runs.
 *
 * Returns the list of high-confidence countertop evidence dimensions that are
 * not represented by any run in the TakeoffResult (within matching tolerance).
 *
 * @param {object} dimensionEvidence - DimensionEvidence object from evidence pass
 * @param {import('./takeoffContract.mjs').TakeoffResult} takeoffResult - normalized TakeoffResult
 * @returns {{
 *   unusedDimensions:         object[],  — EvidenceDimension[] not matched to any run
 *   coveredCount:             number,    — evidence dims matched to at least one run
 *   totalHighConfidenceCount: number,    — eligible evidence dims checked
 * }}
 */
export function compareDimensionEvidenceToTakeoffRuns(dimensionEvidence, takeoffResult) {
  if (!dimensionEvidence || !Array.isArray(dimensionEvidence.dimensions)) {
    return { unusedDimensions: [], coveredCount: 0, totalHighConfidenceCount: 0 };
  }

  const allRuns = flattenAllRuns(takeoffResult);

  // Only check high-confidence countertop-category dimensions with a known length.
  const eligible = dimensionEvidence.dimensions.filter(
    (d) =>
      d.confidence === "high" &&
      COUNTERTOP_CATEGORIES.has(d.category) &&
      d.lengthIn != null
  );

  const unusedDimensions = eligible.filter((d) => !isMatchedByAnyRun(d, allRuns));

  return {
    unusedDimensions,
    coveredCount:             eligible.length - unusedDimensions.length,
    totalHighConfidenceCount: eligible.length,
  };
}
