/**
 * takeoffApprovalGate — estimator approval + import readiness blockers (v5.8).
 *
 * Pure function: no I/O. Shared by backend approve route and AI Takeoff Lab UI.
 *
 * @module takeoffApprovalGate
 */

import { reconcileRunsWithEvidence } from "./takeoffEvidenceRunReconciliation.mjs";
import { evaluateTakeoffFabricationRules } from "./takeoffFabricationRules.mjs";
import { computeAreaSf } from "./takeoffMeasurementCalc.mjs";
import { TAKEOFF_DIAGNOSTIC_CODE } from "./takeoffContract.mjs";
import {
  deriveTakeoffWorkflowStatus,
  emptyReviewState,
  normalizeReviewState,
} from "./takeoffReviewStatus.mjs";

const C = TAKEOFF_DIAGNOSTIC_CODE;

const STANDARD_BACKSPLASH_HEIGHT_IN = 4;
const HIGH_BACKSPLASH_MIN_IN = 4.5;
const FULL_HEIGHT_BACKSPLASH_MIN_IN = 48;

const REFERENCE_TOTAL_CODES = new Set([
  C.REFERENCE_TOTAL_COUNTERTOP_MISMATCH,
  C.REFERENCE_TOTAL_BACKSPLASH_MISMATCH,
  "REFERENCE_TOTAL_COMBINED_MISMATCH",
  "REFERENCE_TOTAL_NO_BS_CONFLICT",
]);

const UNRESOLVED_SEVERITIES = new Set(["critical", "warning", "missing", "review_required"]);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function sfFromRun(lengthIn, depthIn) {
  const l = Number(lengthIn) || 0;
  const d = Number(depthIn) || 0;
  if (l <= 0 || d <= 0) return 0;
  return round2((l * d) / 144);
}

/**
 * @param {import('./takeoffContract.mjs').TakeoffResult} takeoffResult
 * @param {import('./takeoffReviewStatus.mjs').TakeoffReviewState} reviewState
 */
export function applyReviewFiltersToTakeoffResult(takeoffResult, reviewState) {
  const excluded = new Set(reviewState?.excludedRunIds ?? []);
  if (excluded.size === 0) return takeoffResult;

  return {
    ...takeoffResult,
    rooms: (takeoffResult.rooms ?? []).map((room) => ({
      ...room,
      areas: (room.areas ?? []).map((area) => ({
        ...area,
        runs: (area.runs ?? []).filter((r) => !excluded.has(r.id)),
      })),
    })),
  };
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

function backsplashNeedsReview(area) {
  if (area.backsplashScope === "no_stone" || area.backsplashScope === "tile_by_others") {
    return false;
  }
  const hasSplashRuns = (area.runs ?? []).some(
    (r) => r.pieceType === "splash" || r.isBacksplash
  );
  const hasLinear = (area.backsplashLinearIn ?? 0) > 0;
  const hasManual = (area.backsplashManualSf ?? 0) > 0;
  if (!hasSplashRuns && !hasLinear && !hasManual) return false;

  if (area.backsplashIncluded === false) return false;
  if (area.backsplashScope === "stone" || area.backsplashScope === "standard") return false;

  // Explicit reviewer note on area resolves ambiguity.
  const notes = [...(area.notes ?? []), ...(area.assumptions ?? [])].join(" ");
  if (/\b(reviewed|confirmed|approved)\b/i.test(notes)) return false;

  return area.backsplashIncluded == null || area.backsplashScope == null;
}

function flagKey(code, path) {
  return path ? `${code}::${path}` : code;
}

function isFlagResolved(code, path, reviewState) {
  const key = flagKey(code, path);
  const res = reviewState.flagResolutions?.[key] ?? reviewState.flagResolutions?.[code];
  if (!res) return false;
  if (res.action === "resolved") return true;
  if (res.action === "ignored") return Boolean(String(res.note ?? "").trim());
  return false;
}

/**
 * @param {string} code
 * @param {string} message
 * @param {string} [path]
 * @param {string} [category]
 */
function blocker(code, message, path, category = "review") {
  return { code, message, path: path ?? null, category };
}

/**
 * Evaluate whether a reviewed takeoff may be approved or imported.
 *
 * @param {{
 *   takeoffResult: object,
 *   computed?: object|null,
 *   validation?: object|null,
 *   qaGate?: object|null,
 *   dimensionEvidence?: object|null,
 *   reviewState?: import('./takeoffReviewStatus.mjs').TakeoffReviewState|null,
 *   hasSavedResult?: boolean,
 *   hasUnsavedEdits?: boolean,
 *   reviewStatus?: string|null,
 *   importStatus?: string|null,
 * }} params
 */
export function evaluateTakeoffApprovalGate({
  takeoffResult,
  computed = null,
  validation = null,
  qaGate = null,
  dimensionEvidence = null,
  reviewState = null,
  hasSavedResult = true,
  hasUnsavedEdits = false,
  reviewStatus = "needs_review",
  importStatus = null,
}) {
  const rs = reviewState ? normalizeReviewState(reviewState) : emptyReviewState();
  const filtered = applyReviewFiltersToTakeoffResult(takeoffResult, rs);
  const blockers = [];

  if (!hasSavedResult) {
    blockers.push(blocker("NO_SAVED_RESULT", "Save reviewed corrections before approval."));
  }
  if (hasUnsavedEdits) {
    blockers.push(blocker("UNSAVED_EDITS", "Save your measurement edits — computed totals are stale."));
  }

  if (validation?.hasErrors || (validation?.errorCount ?? 0) > 0) {
    blockers.push(
      blocker(
        "VALIDATION_ERRORS",
        `${validation.errorCount ?? 1} validation error(s) must be resolved before approval.`,
        null,
        "validation"
      )
    );
  }

  if (qaGate?.status === "do_not_import") {
    blockers.push(
      blocker(
        "QA_GATE_BLOCKED",
        qaGate.headline ?? "QA gate blocks approval for this takeoff.",
        null,
        "qa"
      )
    );
  }

  // QA gate issues (AI flags)
  for (const issue of qaGate?.topIssues ?? []) {
    const sev = String(issue.severity ?? "").toLowerCase();
    if (!UNRESOLVED_SEVERITIES.has(sev)) continue;
    if (isFlagResolved(issue.code, issue.path, rs)) continue;
    blockers.push(
      blocker(
        issue.code,
        issue.message ?? issue.label ?? issue.code,
        issue.path ?? null,
        "ai_flag"
      )
    );
  }

  // Validation diagnostics requiring acknowledgment
  for (const d of validation?.diagnostics ?? []) {
    const code = String(d.code ?? "");
    if (REFERENCE_TOTAL_CODES.has(code) && !rs.referenceTotalAcks?.[code]) {
      blockers.push(
        blocker(code, d.message ?? "Reference total mismatch must be acknowledged.", d.path, "reference")
      );
    }
    if (code === C.EVIDENCE_DIMENSION_NOT_USED) {
      const ek = d.path ? `evidence:${d.path}` : `evidence:${d.message}`;
      if (!rs.evidenceAcks?.[ek] && !isFlagResolved(code, d.path, rs)) {
        blockers.push(
          blocker(code, d.message ?? "High-confidence evidence dimension is unused.", d.path, "evidence")
        );
      }
    }
    if (
      code === C.DRAFT_ASSEMBLY_REVIEW_REQUIRED ||
      code === C.RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE ||
      code === C.EVIDENCE_DIMENSION_CHANGED_IN_RUN ||
      code === C.CONFLICTING_DIMENSIONS_USED_SILENTLY
    ) {
      if (!isFlagResolved(code, d.path, rs)) {
        blockers.push(blocker(code, d.message ?? code, d.path, "evidence"));
      }
    }
  }

  // Fabrication rules — FHBS / waterfall / backsplash conflicts
  try {
    const { findings } = evaluateTakeoffFabricationRules({
      takeoffResult: filtered,
      dimensionEvidence,
      reviewState: { excludedRunIds: rs.excludedRunIds },
    });
    for (const f of findings) {
      if (f.level !== "error" && f.level !== "warning") continue;
      const codesNeedingReview = new Set([
        "BACKSPLASH_SCOPE_CONFLICT",
        "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED",
        "NONSTANDARD_DEPTH_UNSUPPORTED",
        "REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET",
        "CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG",
        "CUTOUT_DEDUCTED_FROM_MATERIAL",
      ]);
      if (!codesNeedingReview.has(f.code)) continue;
      if (isFlagResolved(f.code, f.path, rs)) continue;
      blockers.push(blocker(f.code, f.message, f.path, "fabrication"));
    }
  } catch {
    /* non-fatal */
  }

  // Included runs — missing dimensions
  for (let ri = 0; ri < (filtered.rooms ?? []).length; ri++) {
    const room = filtered.rooms[ri];
    for (let ai = 0; ai < (room.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      const areaPath = `rooms[${ri}].areas[${ai}]`;

      if (backsplashNeedsReview(area)) {
        blockers.push(
          blocker(
            "BACKSPLASH_NEEDS_REVIEW",
            `Backsplash scope for "${area.label}" needs estimator confirmation.`,
            areaPath,
            "backsplash"
          )
        );
      }

      for (let runi = 0; runi < (area.runs ?? []).length; runi++) {
        const run = area.runs[runi];
        const runPath = `${areaPath}.runs[${runi}]`;
        const len = Number(run.lengthIn) || 0;
        const dep = Number(run.depthIn) || 0;
        const sf = sfFromRun(len, dep);
        if (len <= 0 || dep <= 0 || sf <= 0) {
          blockers.push(
            blocker(
              "MISSING_RUN_DIMENSIONS",
              `Included piece "${run.label}" is missing length, depth, or sf.`,
              runPath,
              "dimensions"
            )
          );
        }
        if (run.requiresEstimatorReview && !isFlagResolved("DRAFT_ASSEMBLY_REVIEW_REQUIRED", runPath, rs)) {
          blockers.push(
            blocker(
              "DRAFT_ASSEMBLY_REVIEW_REQUIRED",
              `Piece "${run.label}" is flagged for estimator review.`,
              runPath,
              "review"
            )
          );
        }
        // Waterfall / vertical panel without explicit reviewed dimensions
        const pieceType = run.pieceType ?? (run.isBacksplash ? "splash" : "counter");
        const isWaterfall =
          pieceType === "fhb" ||
          String(run.label ?? "").toLowerCase().includes("waterfall") ||
          String(area.label ?? "").toLowerCase().includes("waterfall");
        if (isWaterfall && (len <= 0 || dep <= 0)) {
          blockers.push(
            blocker(
              "WATERFALL_MISSING_DIMENSIONS",
              `Waterfall / full-height panel "${run.label}" needs explicit reviewed dimensions.`,
              runPath,
              "waterfall"
            )
          );
        }
      }
    }
  }

  // Room completeness
  for (const room of filtered.rooms ?? []) {
    if (isUnknownRoom(room)) {
      blockers.push(
        blocker(
          "UNKNOWN_ROOM",
          `Room "${room.name}" is unassigned — assign pieces to a named room.`,
          `rooms.${room.id}`,
          "rooms"
        )
      );
      continue;
    }
    if (!rs.roomCompleteness?.[room.id]) {
      blockers.push(
        blocker(
          "ROOM_INCOMPLETE",
          `Room "${room.name}" is not marked complete.`,
          `rooms.${room.id}`,
          "rooms"
        )
      );
    }
  }

  if ((filtered.rooms ?? []).length === 0) {
    blockers.push(blocker("NO_ROOMS", "At least one room is required before approval.", null, "rooms"));
  }

  // Evidence reconciliation unresolved (workbench signal)
  try {
    const recon = reconcileRunsWithEvidence({ takeoffResult: filtered, dimensionEvidence });
    const unresolvedCount =
      (recon.unsupportedRuns?.length ?? 0) +
      (recon.changedRuns?.length ?? 0) +
      (recon.conflictingRuns?.length ?? 0) +
      (recon.unusedHighConfidenceDimensions?.length ?? 0) +
      (recon.assemblyReviewRuns?.length ?? 0);
    if (unresolvedCount > 0) {
      const unresolvedHandled = isFlagResolved("EVIDENCE_RECONCILIATION", null, rs);
      if (!unresolvedHandled) {
        blockers.push(
          blocker(
            "EVIDENCE_RECONCILIATION",
            `${unresolvedCount} evidence/run reconciliation issue(s) remain.`,
            null,
            "evidence"
          )
        );
      }
    }
  } catch {
    /* non-fatal */
  }

  const canApprove = blockers.length === 0 && reviewStatus !== "approved";
  const canImport =
    reviewStatus === "approved" &&
    !hasUnsavedEdits &&
    blockers.length === 0 &&
    importStatus !== "imported";

  const workflowStatus = deriveTakeoffWorkflowStatus({
    reviewStatus,
    hasSavedResult,
    importStatus,
    hasUnsavedEdits,
    approvalGate: { canApprove: blockers.length === 0, blockers },
  });

  return {
    canApprove,
    canImport,
    blockers,
    workflowStatus,
    blockerCount: blockers.length,
  };
}

/**
 * Classify backsplash sqft by type for import totals.
 *
 * @param {import('./takeoffContract.mjs').TakeoffResult} takeoffResult
 * @param {import('./takeoffReviewStatus.mjs').TakeoffReviewState} [reviewState]
 */
export function classifyBacksplashTotals(takeoffResult, reviewState = null) {
  const rs = reviewState ? normalizeReviewState(reviewState) : emptyReviewState();
  const filtered = applyReviewFiltersToTakeoffResult(takeoffResult, rs);

  let standardBacksplashSqft = 0;
  let highBacksplashSqft = 0;
  let fullHeightBacksplashSqft = 0;
  let countertopSqft = 0;

  for (const room of filtered.rooms ?? []) {
    for (const area of room.areas ?? []) {
      if (area.backsplashScope === "no_stone" || area.backsplashScope === "tile_by_others") {
        const ctOnly = computeAreaSf({ ...area, runs: (area.runs ?? []).filter((r) => {
          const pt = r.pieceType ?? (r.isBacksplash ? "splash" : "counter");
          return pt === "counter";
        })});
        countertopSqft = round2(countertopSqft + ctOnly.countertopSf);
        continue;
      }

      const a = computeAreaSf(area);
      countertopSqft = round2(countertopSqft + a.countertopSf);

      for (const run of area.runs ?? []) {
        const pt = run.pieceType ?? (run.isBacksplash ? "splash" : "counter");
        if (pt === "counter") continue;
        const sf = sfFromRun(run.lengthIn, run.depthIn);
        const h = Number(run.depthIn) || STANDARD_BACKSPLASH_HEIGHT_IN;
        if (pt === "fhb" || h >= FULL_HEIGHT_BACKSPLASH_MIN_IN) {
          fullHeightBacksplashSqft = round2(fullHeightBacksplashSqft + sf);
        } else if (h > HIGH_BACKSPLASH_MIN_IN) {
          highBacksplashSqft = round2(highBacksplashSqft + sf);
        } else {
          standardBacksplashSqft = round2(standardBacksplashSqft + sf);
        }
      }

      // Area-level linear backsplash
      if ((area.backsplashLinearIn ?? 0) > 0 && !(area.runs ?? []).some((r) => r.pieceType === "splash")) {
        const h = area.backsplashHeightIn ?? STANDARD_BACKSPLASH_HEIGHT_IN;
        const sf = sfFromRun(area.backsplashLinearIn, h);
        if (h >= FULL_HEIGHT_BACKSPLASH_MIN_IN) {
          fullHeightBacksplashSqft = round2(fullHeightBacksplashSqft + sf);
        } else if (h > HIGH_BACKSPLASH_MIN_IN) {
          highBacksplashSqft = round2(highBacksplashSqft + sf);
        } else {
          standardBacksplashSqft = round2(standardBacksplashSqft + sf);
        }
      } else if ((area.backsplashManualSf ?? 0) > 0) {
        const h = area.backsplashHeightIn ?? STANDARD_BACKSPLASH_HEIGHT_IN;
        const sf = round2(Number(area.backsplashManualSf));
        if (h >= FULL_HEIGHT_BACKSPLASH_MIN_IN) {
          fullHeightBacksplashSqft = round2(fullHeightBacksplashSqft + sf);
        } else if (h > HIGH_BACKSPLASH_MIN_IN) {
          highBacksplashSqft = round2(highBacksplashSqft + sf);
        } else {
          standardBacksplashSqft = round2(standardBacksplashSqft + sf);
        }
      }
    }
  }

  const combinedSqft = round2(
    countertopSqft + standardBacksplashSqft + highBacksplashSqft + fullHeightBacksplashSqft
  );

  return {
    countertopSqft,
    standardBacksplashSqft,
    highBacksplashSqft,
    fullHeightBacksplashSqft,
    combinedSqft,
  };
}

/**
 * Record a flag resolution with audit fields.
 *
 * @param {import('./takeoffReviewStatus.mjs').TakeoffReviewState} reviewState
 * @param {{ code: string, path?: string|null, action: "resolved"|"ignored", note: string, userId?: string|null }} params
 */
export function recordFlagResolution(reviewState, { code, path, action, note, userId }) {
  const rs = normalizeReviewState(reviewState);
  const key = flagKey(code, path ?? null);
  rs.flagResolutions[key] = {
    action,
    note: String(note ?? "").trim(),
    userId: userId ?? null,
    at: new Date().toISOString(),
  };
  return rs;
}
