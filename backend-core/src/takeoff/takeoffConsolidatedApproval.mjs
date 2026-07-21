/**
 * Consolidated estimator Takeoff review — blocking vs advisory classification.
 *
 * Used by the single-worksheet "Approve Takeoff & Build Estimate" path.
 * The reviewed worksheet is the commercial approval surface.
 * Legacy QA / evidence / structure warnings stay visible as advisory only.
 *
 * Does not replace Gemini extraction or the Takeoff job model.
 *
 * @module takeoffConsolidatedApproval
 */

import { evaluateTakeoffApprovalGate } from "./takeoffApprovalGate.mjs";
import { emptyReviewState, normalizeReviewState } from "./takeoffReviewStatus.mjs";
import { sfFromRun } from "./takeoffMeasurementCalc.mjs";
import { normalizeRunCutouts } from "./takeoffCutoutScope.mjs";

/**
 * Hard blockers only — must map to a real calculation / assignment / persist failure.
 * Legacy VALIDATION_ERRORS, QA "do not use", evidence reconciliation, room-incomplete,
 * and structure warnings are intentionally absent.
 */
export const CONSOLIDATED_BLOCKING_CODES = new Set([
  "NO_SAVED_RESULT",
  "NO_ROOMS",
  "NO_INCLUDED_PIECES",
  "NO_ROOM_ASSIGNMENT",
  "MISSING_RUN_DIMENSIONS",
  "WATERFALL_MISSING_DIMENSIONS",
  "DUPLICATE_PIECE_DOUBLE_COUNT",
  "TAKEOFF_PROCESSING",
  "TAKEOFF_FAILED",
  "CALCULATION_FAILED"
]);

/**
 * Codes that are never blocking in consolidated review.
 * Includes former legacy hard blockers that must not stop Approve & Build Estimate.
 */
export const CONSOLIDATED_ADVISORY_CODES = new Set([
  "ROOM_INCOMPLETE",
  "UNKNOWN_ROOM",
  "UNSAVED_EDITS",
  "VALIDATION_ERRORS",
  "EMPTY_AREA",
  "MATH_CONSISTENCY_COUNTERTOP",
  "MATH_CONSISTENCY_BACKSPLASH",
  "MATH_CONSISTENCY_COMBINED",
  "BACKSPLASH_NEEDS_REVIEW",
  "BACKSPLASH_SCOPE_UNRESOLVED",
  "BACKSPLASH_SCOPE_CONFLICT",
  "QA_GATE_BLOCKED",
  "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
  "REFERENCE_TOTAL_BACKSPLASH_MISMATCH",
  "REFERENCE_TOTAL_COMBINED_MISMATCH",
  "REFERENCE_TOTAL_NO_BS_CONFLICT",
  "EVIDENCE_DIMENSION_NOT_USED",
  "EVIDENCE_DIMENSION_CHANGED_IN_RUN",
  "DRAFT_ASSEMBLY_REVIEW_REQUIRED",
  "CONFLICTING_DIMENSIONS_USED_SILENTLY",
  "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE",
  "RUN_DEPTH_NOT_SUPPORTED_BY_EVIDENCE",
  "EVIDENCE_RECONCILIATION",
  "NONSTANDARD_DEPTH_UNSUPPORTED",
  "NONSTANDARD_DEPTH_ASSUMED",
  "CUTOUT_DEDUCTED_FROM_MATERIAL",
  "CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG",
  "REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET",
  "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED",
  "LOW_CONFIDENCE",
  "PENDING_REVIEW",
  "POSSIBLE_BACKSPLASH_NOTE",
  "SUSPICIOUS_DEPTH",
  "SUSPICIOUS_LENGTH",
  "TOTAL_MISMATCH_COUNTERTOP",
  "TOTAL_MISMATCH_BACKSPLASH",
  "TOTAL_MISMATCH_COMBINED"
]);

/** Generic legacy copy that must not appear as a hard blocker message alone. */
const GENERIC_LEGACY_MESSAGE_RE =
  /validation error|structure has issues|do not use this takeoff|evidence\/run reconciliation/i;

/**
 * Resolve advisory-confirmation flag from request body / service args.
 * Primary contract: confirmAdvisories. Aliases accepted for compatibility.
 * @param {object} input
 */
export function resolveConfirmAdvisories(input = {}) {
  const v =
    input.confirmAdvisories ??
    input.acceptAdvisoryWarnings ??
    input.acknowledgeAdvisories ??
    input.allowAdvisoryApproval ??
    input.confirm;
  return v === true || v === "1" || v === 1 || v === "true";
}

/**
 * Rewrite legacy blocking-flavored advisory copy for consolidated mode.
 * @param {{ code?: string, message?: string, path?: string|null, category?: string }} issue
 */
export function rewriteConsolidatedAdvisoryMessage(issue) {
  const code = String(issue?.code ?? "").trim();
  const raw = String(issue?.message ?? "").trim();
  let message = raw;

  if (
    code === "VALIDATION_ERRORS" ||
    /validation error/i.test(raw) ||
    /structure has issues/i.test(raw)
  ) {
    message =
      "AI validation found a possible issue; estimator review is recommended.";
  } else if (
    code === "QA_GATE_BLOCKED" ||
    /do not use this takeoff/i.test(raw)
  ) {
    message = "AI quality checks flagged possible inconsistencies; review recommended.";
  } else if (
    code === "EVIDENCE_RECONCILIATION" ||
    code.startsWith("EVIDENCE_") ||
    code === "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE" ||
    code === "RUN_DEPTH_NOT_SUPPORTED_BY_EVIDENCE" ||
    code === "CONFLICTING_DIMENSIONS_USED_SILENTLY" ||
    code === "DRAFT_ASSEMBLY_REVIEW_REQUIRED" ||
    /evidence\/run reconciliation/i.test(raw)
  ) {
    message = "The source evidence contains inconsistencies.";
  } else if (
    code.startsWith("REFERENCE_TOTAL_") ||
    code.startsWith("TOTAL_MISMATCH_") ||
    code.startsWith("MATH_CONSISTENCY_")
  ) {
    message = "Review this item if it affects the estimate.";
  } else if (
    code === "BACKSPLASH_NEEDS_REVIEW" ||
    code.startsWith("BACKSPLASH_") ||
    code === "ROOM_INCOMPLETE" ||
    code === "UNKNOWN_ROOM" ||
    code === "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED" ||
    code === "NONSTANDARD_DEPTH_UNSUPPORTED" ||
    code === "EMPTY_AREA"
  ) {
    message = "Review this item if it affects the estimate.";
  } else if (/must be resolved before approval/i.test(raw)) {
    message =
      "AI validation found a possible issue; estimator review is recommended.";
  }

  return {
    ...issue,
    code: code || issue?.code,
    message,
    path: issue?.path ?? null,
    category: issue?.category ?? "advisory"
  };
}

/**
 * Mark every included room complete so ROOM_INCOMPLETE never fires.
 * @param {object} takeoffResult
 * @param {object|null} reviewState
 */
export function autoCompleteRoomReviewState(takeoffResult, reviewState = null) {
  const rs = reviewState ? normalizeReviewState(reviewState) : emptyReviewState();
  const roomCompleteness = { ...(rs.roomCompleteness || {}) };
  for (const room of takeoffResult?.rooms ?? []) {
    const id = String(room?.id ?? "").trim();
    if (id) roomCompleteness[id] = true;
  }
  return { ...rs, roomCompleteness };
}

function isUnknownRoom(room) {
  const name = String(room?.name ?? "").trim().toLowerCase();
  const type = String(room?.roomType ?? room?.type ?? "").trim().toLowerCase();
  return (
    type === "unknown" ||
    name === "" ||
    name === "unknown" ||
    name === "unassigned" ||
    name.startsWith("unknown ") ||
    name.includes("unassigned")
  );
}

function pieceLabel(run, pieceIndex) {
  const label = String(run?.label ?? "").trim();
  return label || `Piece ${pieceIndex}`;
}

function roomLabel(room) {
  const name = String(room?.name ?? "").trim();
  return name || "Unassigned room";
}

/**
 * Explicit SF override on a run (optional fields; dimensions remain primary).
 * @param {object} run
 */
export function runHasValidSfOverride(run) {
  const sf = Number(
    run?.manualSf ?? run?.exactSf ?? run?.sfOverride ?? run?.overrideSf ?? run?.aiProvidedSf ?? 0
  );
  return Number.isFinite(sf) && sf > 0;
}

/**
 * Included measurable piece: positive L×D or valid explicit SF override.
 * @param {object} run
 */
export function runIsMeasurable(run) {
  const len = Number(run?.lengthIn) || 0;
  const dep = Number(run?.depthIn) || 0;
  if (len > 0 && dep > 0) return true;
  return runHasValidSfOverride(run);
}

/**
 * @param {object} takeoffResult
 * @param {object} reviewState
 * @returns {Array<{ room: object, area: object, run: object, roomIdx: number, areaIdx: number, runIdx: number, pieceIndex: number }>}
 */
export function listIncludedPieces(takeoffResult, reviewState) {
  const excludedRuns = new Set(reviewState?.excludedRunIds ?? []);
  const excludedRooms = new Set(reviewState?.excludedRoomIds ?? []);
  const out = [];
  let pieceIndex = 0;
  for (let ri = 0; ri < (takeoffResult?.rooms ?? []).length; ri++) {
    const room = takeoffResult.rooms[ri];
    if (excludedRooms.has(room.id)) continue;
    for (let ai = 0; ai < (room.areas ?? []).length; ai++) {
      const area = room.areas[ai];
      for (let runi = 0; runi < (area.runs ?? []).length; runi++) {
        const run = area.runs[runi];
        if (excludedRuns.has(run.id)) continue;
        pieceIndex += 1;
        out.push({
          room,
          area,
          run,
          roomIdx: ri,
          areaIdx: ai,
          runIdx: runi,
          pieceIndex
        });
      }
    }
  }
  return out;
}

/**
 * Count included countertop-capable runs after exclusions that are measurable.
 * @param {object} takeoffResult
 * @param {object} reviewState
 */
export function countIncludedMeasurablePieces(takeoffResult, reviewState) {
  return listIncludedPieces(takeoffResult, reviewState).filter((p) => runIsMeasurable(p.run))
    .length;
}

function blocker(code, message, path, category = "review") {
  return { code, message, path: path ?? null, category };
}

/**
 * Detect material double-count: two included measurable rows with identical L×D
 * and the same (or empty) label — strong signal the same physical piece was copied.
 * Parallel galley runs with distinct labels are not treated as duplicates.
 * @param {ReturnType<typeof listIncludedPieces>} pieces
 */
export function findMaterialDoubleCounts(pieces) {
  const measurable = pieces.filter((p) => runIsMeasurable(p.run));
  const issues = [];
  const seen = new Map();

  for (const p of measurable) {
    const len = Number(p.run.lengthIn) || 0;
    const dep = Number(p.run.depthIn) || 0;
    if (!(len > 0 && dep > 0)) continue;
    const label = String(p.run.label ?? "")
      .trim()
      .toLowerCase();
    const key = `${String(p.room?.id ?? "")}::${label}::${len}x${dep}`;
    const prior = seen.get(key);
    if (prior) {
      const a = pieceLabel(prior.run, prior.pieceIndex);
      const b = pieceLabel(p.run, p.pieceIndex);
      issues.push(
        blocker(
          "DUPLICATE_PIECE_DOUBLE_COUNT",
          `Two included rows appear to duplicate the same ${len} × ${dep} piece (${a} and ${b})`,
          `rooms[${p.roomIdx}].areas[${p.areaIdx}].runs[${p.runIdx}]`,
          "dimensions"
        )
      );
    } else {
      seen.set(key, p);
    }
  }

  // Cross-room identical label + dimensions (same physical piece copied twice)
  const byLabelDims = new Map();
  for (const p of measurable) {
    const len = Number(p.run.lengthIn) || 0;
    const dep = Number(p.run.depthIn) || 0;
    if (!(len > 0 && dep > 0)) continue;
    const label = String(p.run.label ?? "")
      .trim()
      .toLowerCase();
    if (!label) continue;
    const key = `${label}::${len}x${dep}`;
    const prior = byLabelDims.get(key);
    if (prior && String(prior.room?.id) !== String(p.room?.id)) {
      issues.push(
        blocker(
          "DUPLICATE_PIECE_DOUBLE_COUNT",
          `Two included rows appear to duplicate the same ${len} × ${dep} piece (${pieceLabel(prior.run, prior.pieceIndex)} in ${roomLabel(prior.room)} and ${pieceLabel(p.run, p.pieceIndex)} in ${roomLabel(p.room)})`,
          `rooms[${p.roomIdx}].areas[${p.areaIdx}].runs[${p.runIdx}]`,
          "dimensions"
        )
      );
    } else if (!prior) {
      byLabelDims.set(key, p);
    }
  }

  return issues;
}

/**
 * Build hard blockers from the reviewed worksheet only.
 * @param {object} takeoffResult
 * @param {object} reviewState
 * @param {object|null} computed
 */
export function collectConsolidatedHardBlockers(takeoffResult, reviewState, computed = null) {
  const blocking = [];
  const pieces = listIncludedPieces(takeoffResult, reviewState);

  if ((takeoffResult?.rooms ?? []).length === 0 || pieces.length === 0) {
    blocking.push(
      blocker(
        "NO_INCLUDED_PIECES",
        "At least one included measurable piece is required.",
        null,
        "rooms"
      )
    );
    return blocking;
  }

  const measurable = pieces.filter((p) => runIsMeasurable(p.run));
  if (measurable.length === 0) {
    blocking.push(
      blocker(
        "NO_INCLUDED_PIECES",
        "At least one included piece with positive dimensions (or a valid SF override) is required.",
        null,
        "rooms"
      )
    );
  }

  for (const p of pieces) {
    const path = `rooms[${p.roomIdx}].areas[${p.areaIdx}].runs[${p.runIdx}]`;
    const name = pieceLabel(p.run, p.pieceIndex);
    const room = roomLabel(p.room);

    if (isUnknownRoom(p.room)) {
      blocking.push(
        blocker(
          "NO_ROOM_ASSIGNMENT",
          `${name} has no room`,
          path,
          "rooms"
        )
      );
      continue;
    }

    const len = Number(p.run.lengthIn) || 0;
    const dep = Number(p.run.depthIn) || 0;
    const hasOverride = runHasValidSfOverride(p.run);

    if (!(len > 0 && dep > 0) && !hasOverride) {
      if (!(len > 0) && !(dep > 0)) {
        blocking.push(
          blocker(
            "MISSING_RUN_DIMENSIONS",
            `${room} · ${name}: length and depth are required`,
            path,
            "dimensions"
          )
        );
      } else if (!(len > 0)) {
        blocking.push(
          blocker(
            "MISSING_RUN_DIMENSIONS",
            `${room} · ${name}: length must be greater than zero`,
            path,
            "dimensions"
          )
        );
      } else {
        blocking.push(
          blocker(
            "MISSING_RUN_DIMENSIONS",
            `${room} · ${name}: depth is required`,
            path,
            "dimensions"
          )
        );
      }
    }
  }

  for (const dup of findMaterialDoubleCounts(pieces)) {
    const already = blocking.some(
      (b) => b.code === dup.code && b.message === dup.message && b.path === dup.path
    );
    if (!already) blocking.push(dup);
  }

  // Deterministic SF must succeed when measurable pieces exist.
  if (measurable.length > 0) {
    try {
      let totalSf = 0;
      for (const p of measurable) {
        if (runHasValidSfOverride(p.run) && !(Number(p.run.lengthIn) > 0 && Number(p.run.depthIn) > 0)) {
          totalSf += Number(
            p.run.manualSf ?? p.run.exactSf ?? p.run.sfOverride ?? p.run.overrideSf ?? p.run.aiProvidedSf ?? 0
          );
          continue;
        }
        const sf = sfFromRun(p.run.lengthIn, p.run.depthIn, p.run.shape);
        if (!(sf > 0)) {
          blocking.push(
            blocker(
              "CALCULATION_FAILED",
              `${roomLabel(p.room)} · ${pieceLabel(p.run, p.pieceIndex)}: deterministic SF calculation failed`,
              `rooms[${p.roomIdx}].areas[${p.areaIdx}].runs[${p.runIdx}]`,
              "math"
            )
          );
        } else {
          totalSf += sf;
        }
      }
      const computedCt =
        Number(computed?.countertopExactSf ?? computed?.totals?.countertopExactSf ?? NaN);
      if (computed != null && Number.isFinite(computedCt) && computedCt < 0) {
        blocking.push(
          blocker(
            "CALCULATION_FAILED",
            "Deterministic countertop SF calculation failed.",
            null,
            "math"
          )
        );
      }
      if (!(totalSf > 0) && blocking.every((b) => b.code !== "CALCULATION_FAILED" && b.code !== "MISSING_RUN_DIMENSIONS")) {
        blocking.push(
          blocker(
            "CALCULATION_FAILED",
            "Deterministic SF calculation produced no measurable area.",
            null,
            "math"
          )
        );
      }
    } catch (e) {
      blocking.push(
        blocker(
          "CALCULATION_FAILED",
          `Deterministic SF calculation failed: ${e instanceof Error ? e.message : String(e)}`,
          null,
          "math"
        )
      );
    }
  }

  return blocking;
}

/**
 * @param {{ code?: string, message?: string, path?: string|null, category?: string }} issue
 * @returns {"blocking"|"advisory"}
 */
export function classifyConsolidatedSeverity(issue) {
  const code = String(issue?.code ?? "").trim();
  if (CONSOLIDATED_BLOCKING_CODES.has(code)) return "blocking";
  if (CONSOLIDATED_ADVISORY_CODES.has(code)) return "advisory";
  // Unknown legacy codes: advisory only. Hard blockers are collected from the worksheet.
  return "advisory";
}

/**
 * Split legacy gate blockers into consolidated blocking vs advisory.
 * Prefer worksheet-collected hard blockers; this helper is for tests / legacy lists.
 * @param {Array<{ code?: string, message?: string, path?: string|null, category?: string }>} blockers
 */
export function splitConsolidatedIssues(blockers) {
  const blocking = [];
  const advisory = [];
  for (const b of blockers ?? []) {
    if (classifyConsolidatedSeverity(b) === "blocking") {
      // Never promote generic legacy copy into hard blockers.
      if (GENERIC_LEGACY_MESSAGE_RE.test(String(b.message ?? ""))) {
        advisory.push(b);
      } else {
        blocking.push(b);
      }
    } else {
      advisory.push(b);
    }
  }
  return { blocking, advisory };
}

/**
 * Evaluate approval for the consolidated worksheet path.
 *
 * @param {Parameters<typeof evaluateTakeoffApprovalGate>[0] & {
 *   jobStatus?: string|null
 * }} params
 */
export function evaluateConsolidatedApprovalGate(params) {
  const jobStatus = String(params.jobStatus ?? "").toLowerCase();
  const takeoffResult = params.takeoffResult;
  const reviewState = autoCompleteRoomReviewState(takeoffResult, params.reviewState);

  if (jobStatus === "processing" || jobStatus === "pending" || jobStatus === "queued") {
    const item = blocker("TAKEOFF_PROCESSING", "Takeoff is still processing.", null, "processing");
    return {
      canApprove: false,
      canApproveWithAdvisory: false,
      blocking: [item],
      advisory: [],
      blockers: [item],
      reviewState,
      workflowStatus: "needs_review",
      blockerCount: 1
    };
  }
  if (jobStatus === "failed" || jobStatus === "error") {
    const item = blocker(
      "TAKEOFF_FAILED",
      "Takeoff processing failed — no usable draft is available.",
      null,
      "processing"
    );
    return {
      canApprove: false,
      canApproveWithAdvisory: false,
      blocking: [item],
      advisory: [],
      blockers: [item],
      reviewState,
      workflowStatus: "needs_review",
      blockerCount: 1
    };
  }

  if (params.hasSavedResult === false || takeoffResult == null) {
    const item = blocker(
      "NO_SAVED_RESULT",
      "No usable Takeoff draft is available to approve.",
      null,
      "review"
    );
    return {
      canApprove: false,
      canApproveWithAdvisory: false,
      blocking: [item],
      advisory: [],
      blockers: [item],
      reviewState,
      workflowStatus: "needs_review",
      blockerCount: 1
    };
  }

  const blocking = collectConsolidatedHardBlockers(
    takeoffResult,
    reviewState,
    params.computed ?? null
  );

  // Legacy gate still runs so advisors (QA / evidence / structure) remain visible.
  const gate = evaluateTakeoffApprovalGate({
    ...params,
    reviewState,
    hasUnsavedEdits: false,
    hasSavedResult: params.hasSavedResult !== false
  });

  const hardKeys = new Set(blocking.map((b) => `${b.code}::${b.path ?? ""}::${b.message}`));
  const advisory = [];
  const seenAdvisory = new Set();
  for (const b of gate.blockers ?? []) {
    const code = String(b.code ?? "");
    // Never re-promote legacy codes that we intentionally demoted.
    if (CONSOLIDATED_BLOCKING_CODES.has(code) && !GENERIC_LEGACY_MESSAGE_RE.test(String(b.message ?? ""))) {
      // Already represented by worksheet hard blockers (or not applicable).
      const key = `${code}::${b.path ?? ""}::${b.message}`;
      if (hardKeys.has(key)) continue;
      // Dimension-like legacy codes without our row-specific message → advisory if
      // we did not independently confirm them on the worksheet.
      if (
        code === "MISSING_RUN_DIMENSIONS" ||
        code === "WATERFALL_MISSING_DIMENSIONS" ||
        code === "NO_INCLUDED_PIECES" ||
        code === "NO_ROOMS" ||
        code === "DUPLICATE_PIECE_DOUBLE_COUNT" ||
        code === "NO_ROOM_ASSIGNMENT"
      ) {
        continue;
      }
    }
    const rewritten = rewriteConsolidatedAdvisoryMessage(b);
    const dedupeKey = `${rewritten.code}::${rewritten.path ?? ""}::${rewritten.message}`;
    if (seenAdvisory.has(dedupeKey)) continue;
    seenAdvisory.add(dedupeKey);
    advisory.push(rewritten);
  }

  const reviewStatus = String(params.reviewStatus ?? "needs_review").toLowerCase();
  const alreadyApproved = reviewStatus === "approved";
  const canApprove = blocking.length === 0 && !alreadyApproved;
  const canApproveWithAdvisory = blocking.length === 0;

  return {
    canApprove,
    canApproveWithAdvisory,
    blocking,
    advisory,
    blockers: blocking,
    reviewState,
    workflowStatus: gate.workflowStatus,
    blockerCount: blocking.length,
    alreadyApproved
  };
}

/**
 * Compact estimator-facing summary from takeoff + review state.
 * @param {object} takeoffResult
 * @param {object} reviewState
 * @param {object|null} computed
 * @param {{ blocking?: object[], advisory?: object[] }} issues
 */
export function buildConsolidatedTakeoffSummary(takeoffResult, reviewState, computed, issues = {}) {
  const excludedRuns = new Set(reviewState?.excludedRunIds ?? []);
  const excludedRooms = new Set(reviewState?.excludedRoomIds ?? []);
  let rooms = 0;
  let includedPieces = 0;
  let kitchenSink = 0;
  let vanitySink = 0;
  let cooktop = 0;
  let outlet = 0;

  for (const room of takeoffResult?.rooms ?? []) {
    if (excludedRooms.has(room.id)) continue;
    rooms += 1;
    for (const area of room.areas ?? []) {
      for (const run of area.runs ?? []) {
        if (excludedRuns.has(run.id)) continue;
        includedPieces += 1;
        // Structured or legacy cutouts — normalized once, never string-parsed here.
        const { cutouts } = normalizeRunCutouts(run.cutouts ?? area.cutouts);
        for (const c of cutouts) {
          if (c.type === "kitchen_sink") kitchenSink += c.quantity;
          else if (c.type === "vanity_bar_sink") vanitySink += c.quantity;
          else if (c.type === "cooktop") cooktop += c.quantity;
          else if (c.type === "electrical_outlet") outlet += c.quantity;
        }
      }
    }
  }

  const countertopSf =
    Number(computed?.countertopExactSf ?? computed?.totals?.countertopExactSf ?? 0) || 0;
  const backsplashSf =
    Number(computed?.backsplashExactSf ?? computed?.totals?.backsplashExactSf ?? 0) || 0;

  return {
    rooms,
    includedPieces,
    countertopSf,
    backsplashSf,
    kitchenSinkCutouts: kitchenSink,
    vanityBarSinkCutouts: vanitySink,
    cooktopCutouts: cooktop,
    outletCutouts: outlet,
    blockingCount: (issues.blocking ?? []).length,
    advisoryCount: (issues.advisory ?? []).length,
    blocking: issues.blocking ?? [],
    advisory: issues.advisory ?? []
  };
}

/**
 * Estimator-facing Takeoff status (4 values).
 * @param {{ jobStatus?: string, reviewStatus?: string, hasResult?: boolean }} input
 */
export function deriveConsolidatedDisplayStatus(input) {
  const job = String(input.jobStatus ?? "").toLowerCase();
  const review = String(input.reviewStatus ?? "").toLowerCase();
  if (job === "failed" || job === "error") return "Failed";
  if (job === "processing" || job === "pending" || job === "queued") return "Processing";
  if (review === "approved") return "Approved";
  if (input.hasResult || review === "needs_review" || job === "completed") return "Needs review";
  return "Processing";
}
