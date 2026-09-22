/**
 * Deterministic rectangular dimensional fit — authoritative server-side math.
 * Bounding-box only; does not model defects, veins, kerf, seams, or fabrication.
 */

import { makeEvidence } from "../evidence.mjs";

export const RECTANGULAR_FIT_DISCLAIMER =
  "Dimensional fit only — does not account for defects, usable area, vein direction, kerf, seam strategy, edge loss, handling allowance, or fabrication constraints.";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Evaluate whether a rectangle (availableLength × availableWidth) can contain
 * requiredLength × requiredWidth, optionally allowing 90° rotation.
 *
 * @returns {{ fits: boolean, orientation: 'as_is'|'rotated'|'none', marginLength: number|null, marginWidth: number|null }}
 */
export function evaluateOneRectangularFit({
  requiredLength,
  requiredWidth,
  availableLength,
  availableWidth,
  allowRotation = true,
}) {
  const reqL = num(requiredLength);
  const reqW = num(requiredWidth);
  const availL = num(availableLength);
  const availW = num(availableWidth);

  if (reqL == null || reqW == null || availL == null || availW == null) {
    return {
      fits: false,
      orientation: "none",
      marginLength: null,
      marginWidth: null,
      error: "All dimensions must be finite numbers",
    };
  }
  if (reqL <= 0 || reqW <= 0 || availL <= 0 || availW <= 0) {
    return {
      fits: false,
      orientation: "none",
      marginLength: null,
      marginWidth: null,
      error: "Dimensions must be positive",
    };
  }

  const asIs = availL >= reqL && availW >= reqW;
  if (asIs) {
    return {
      fits: true,
      orientation: "as_is",
      marginLength: +(availL - reqL).toFixed(4),
      marginWidth: +(availW - reqW).toFixed(4),
    };
  }

  if (allowRotation) {
    const rotated = availL >= reqW && availW >= reqL;
    if (rotated) {
      return {
        fits: true,
        orientation: "rotated",
        marginLength: +(availL - reqW).toFixed(4),
        marginWidth: +(availW - reqL).toFixed(4),
      };
    }
  }

  return {
    fits: false,
    orientation: "none",
    marginLength: +(availL - reqL).toFixed(4),
    marginWidth: +(availW - reqW).toFixed(4),
  };
}

/**
 * Batch evaluate candidates. Returns evidence-backed result for Brain Agent.
 */
export function evaluateRectangularFitBatch({
  requiredLength,
  requiredWidth,
  candidates = [],
  allowRotation = true,
}) {
  const reqL = num(requiredLength);
  const reqW = num(requiredWidth);
  if (reqL == null || reqW == null || reqL <= 0 || reqW <= 0) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      error: "requiredLength and requiredWidth must be positive numbers",
      evidence: [],
    };
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      error: "candidates must be a non-empty array",
      evidence: [],
    };
  }

  if (candidates.length > 50) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      error: "candidates limited to 50 per call",
      evidence: [],
    };
  }

  const allowRot = allowRotation !== false;
  const results = [];

  for (const c of candidates) {
    const id = c?.id != null ? String(c.id) : null;
    const length = num(c?.length ?? c?.lengthIn ?? c?.availableLength);
    const width = num(c?.width ?? c?.widthIn ?? c?.availableWidth);
    const fit = evaluateOneRectangularFit({
      requiredLength: reqL,
      requiredWidth: reqW,
      availableLength: length,
      availableWidth: width,
      allowRotation: allowRot,
    });
    results.push({
      id,
      fits: Boolean(fit.fits),
      orientation: fit.orientation,
      requiredLength: reqL,
      requiredWidth: reqW,
      availableLength: length,
      availableWidth: width,
      marginLength: fit.marginLength,
      marginWidth: fit.marginWidth,
      ...(fit.error ? { error: fit.error } : {}),
    });
  }

  const fitsCount = results.filter((r) => r.fits).length;
  const evidence = makeEvidence({
    sourceDomain: "computation",
    sourceSystem: "brain_evaluate_rectangular_fit",
    entityType: "rectangular_fit",
    entityId: `fit_${reqL}x${reqW}`,
    authoritative: true,
    freshnessNote: RECTANGULAR_FIT_DISCLAIMER,
    data: {
      computation: "rectangular_fit",
      requiredLength: reqL,
      requiredWidth: reqW,
      allowRotation: allowRot,
      disclaimer: RECTANGULAR_FIT_DISCLAIMER,
      fitsCount,
      candidateCount: results.length,
      results,
    },
  });

  return {
    ok: true,
    computation: "rectangular_fit",
    requiredLength: reqL,
    requiredWidth: reqW,
    allowRotation: allowRot,
    disclaimer: RECTANGULAR_FIT_DISCLAIMER,
    results,
    fitsCount,
    evidence: [evidence],
  };
}
