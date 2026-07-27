/**
 * Explicit Takeoff Save draft — local edits never POST corrections.
 *
 * Persistence boundary:
 * - field / structural / Confirm exposed edges → local draft only
 * - Save draft → exactly one correction POST
 * - Approve Takeoff → approval only (requires clean saved draft)
 */

import { markRunEstimatorOwned } from "./emptyManualTakeoffDraft.mjs";
import { patchRun, patchRunFinishedEdge } from "./consolidatedWorksheetRows.mjs";

/** @typedef {'idle'|'dirty'|'saving'|'saved'|'conflict'|'error'} SaveUiStatus */

/**
 * Human-facing save status labels for the worksheet chrome.
 * @param {SaveUiStatus} status
 */
export function formatTakeoffSaveStatus(status) {
  switch (status) {
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "conflict":
      return "Conflict — review latest draft";
    case "error":
      return "Save failed";
    default:
      return "";
  }
}

/**
 * Whether a piece requires countertop exposed-edge confirmation.
 * Backsplash-only (`splash`) and non-countertop pieces are excluded.
 *
 * @param {{ pieceType?: string|null, isBacksplash?: boolean, included?: boolean }} row
 */
export function pieceRequiresExposedEdgeConfirmation(row) {
  if (row?.included === false) return false;
  const pt = String(row?.pieceType ?? (row?.isBacksplash ? "splash" : "counter")).toLowerCase();
  if (pt === "splash" || pt === "backsplash" || pt === "fhb") return false;
  return pt === "counter" || pt === "countertop" || pt === "";
}

/**
 * Clear confirmation flags on finishedEdge without changing side lengths.
 * @param {object|null|undefined} finishedEdge
 */
export function invalidateFinishedEdgeConfirmation(finishedEdge) {
  if (!finishedEdge || typeof finishedEdge !== "object") return finishedEdge ?? null;
  return {
    ...finishedEdge,
    finishedEdgeConfirmed: false,
    approved: false,
    source: "draft_suggestion",
    approvalSource: null,
    approvedAt: null
  };
}

/**
 * Patch fields that invalidate exposed-edge confirmation.
 * Backsplash / notes / cutouts must NOT call this with invalidateEdge true.
 *
 * @param {object} run
 * @param {Record<string, unknown>} patch
 * @param {{ invalidateEdge?: boolean }} [options]
 */
export function applyRunPatchWithEdgeInvalidation(run, patch, options = {}) {
  const next = { ...run, ...patch };
  if (options.invalidateEdge !== false) {
    const keys = Object.keys(patch);
    const invalidates = keys.some((k) =>
      ["lengthIn", "depthIn", "quantity", "pieceTopology", "attachedSide", "pieceType"].includes(
        k
      )
    );
    if (invalidates && next.finishedEdge) {
      next.finishedEdge = invalidateFinishedEdgeConfirmation(next.finishedEdge);
    }
  }
  return next;
}

/**
 * Local-only backsplash toggle. Does not touch exposed-edge confirmation or LF.
 *
 * @param {object} draft
 * @param {{ roomId: string, areaId?: string|null, runId: string }} locator
 * @param {boolean} checked
 * @param {number} [lengthIn]
 */
export function applyLocalBacksplashToggle(draft, locator, checked, lengthIn = 0) {
  const eligibleLength = checked ? Math.max(0, Number(lengthIn) || 0) : 0;
  return markRunEstimatorOwned(
    patchRun(draft, locator, {
      backsplashEligible: checked,
      backsplashEligibilitySource: "estimator_confirmed",
      backsplashEligibilityUpdatedAt: new Date().toISOString(),
      backsplashEligibleLengthIn: eligibleLength,
      backsplashGeometry: {
        backsplashEligible: checked,
        backsplashEligibleLengthIn: eligibleLength,
        backsplashEdge: "back",
        approved: true,
        source: "estimator_confirmed",
        approvalSource: "estimator_confirmed"
      }
    }),
    locator.roomId,
    locator.runId
  );
}

/**
 * Local-only Confirm exposed edges. Updates draft; never POSTs.
 *
 * @param {object} draft
 * @param {{ roomId: string, areaId?: string|null, runId: string }} locator
 * @param {Record<string, unknown>} finishedEdgePayload
 */
export function applyLocalExposedEdgeConfirm(draft, locator, finishedEdgePayload) {
  return markRunEstimatorOwned(
    patchRunFinishedEdge(draft, locator, finishedEdgePayload),
    locator.roomId,
    locator.runId
  );
}

/**
 * Next clientMutationRevision for an explicit Save draft.
 * @param {number} canonicalRevision
 */
export function nextExplicitMutationRevision(canonicalRevision) {
  const rev = Number(canonicalRevision);
  return Math.max(1, (Number.isSafeInteger(rev) ? rev : 0) + 1);
}

/**
 * Stable JSON for dirty comparison (sorts object keys shallowly via stringify of clone).
 * @param {unknown} value
 */
export function stableDraftFingerprint(value) {
  return JSON.stringify(value ?? null);
}

/**
 * Worksheet is dirty when local draft or exclusion set differs from canonical.
 *
 * @param {{
 *   localDraft: object|null,
 *   canonicalDraft: object|null,
 *   localExcludedRunIds?: Iterable<string>,
 *   canonicalExcludedRunIds?: Iterable<string>
 * }} input
 */
export function isTakeoffWorksheetDirty(input) {
  const localEx = [...(input.localExcludedRunIds || [])].map(String).sort();
  const canonEx = [...(input.canonicalExcludedRunIds || [])].map(String).sort();
  if (stableDraftFingerprint(localEx) !== stableDraftFingerprint(canonEx)) return true;
  return (
    stableDraftFingerprint(input.localDraft) !== stableDraftFingerprint(input.canonicalDraft)
  );
}

/**
 * Sole correction writer for the worksheet. Calls saveCorrection exactly once.
 * Injectable for network-spy tests.
 *
 * @param {{
 *   saveCorrection: (body: object) => Promise<object>,
 *   takeoffResult: object,
 *   baseResultId: string|null,
 *   clientMutationRevision: number,
 *   reviewState: object,
 *   correctionNotes?: string,
 *   aiHandling?: object|null
 * }} args
 */
export async function saveTakeoffDraftExplicit(args) {
  if (typeof args.saveCorrection !== "function") {
    throw new Error("saveTakeoffDraftExplicit requires saveCorrection");
  }
  if (!args.takeoffResult) {
    throw new Error("saveTakeoffDraftExplicit requires takeoffResult");
  }
  return args.saveCorrection({
    takeoffResult: args.takeoffResult,
    baseResultId: args.baseResultId,
    clientMutationRevision: args.clientMutationRevision,
    reviewState: args.reviewState,
    correctionNotes: args.correctionNotes ?? "Consolidated worksheet Save draft",
    aiHandling: args.aiHandling ?? null
  });
}

/**
 * Row summary for exposed edges when local confirmation is unsaved.
 * @param {{ finishedEdgeApproved?: boolean, finishedEdgeTotalIn?: number|null, localUnsavedEdge?: boolean }} row
 */
export function formatExposedEdgeTriggerLabel(row) {
  const lf =
    row.finishedEdgeTotalIn != null
      ? `${((Number(row.finishedEdgeTotalIn) || 0) / 12).toFixed(2)} LF`
      : null;
  if (!lf) return "Set exposed sides";
  if (row.localUnsavedEdge || (row.finishedEdgeApproved && row.localUnsavedEdge !== false && row.dirtyEdge)) {
    return `${lf} · unsaved`;
  }
  if (row.finishedEdgeApproved) return `${lf} ✓`;
  return `${lf} draft`;
}
