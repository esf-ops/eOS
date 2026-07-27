/**
 * Job-level Takeoff correction coordinator.
 *
 * Guarantees:
 * - at most one correction POST in flight per Takeoff job
 * - pending edits coalesce to the newest full draft snapshot
 * - concurrency keys (baseResultId, clientMutationRevision) resolve at SEND time
 * - successful response updates keys before any queued follow-up send
 * - real 409 pauses automatic processing (no auto-replay)
 * - newer local edits are never overwritten by an older success
 *
 * Pure logic — React/browser wires timers and fetch.
 */

/** @typedef {'idle'|'dirty'|'saving'|'saved'|'conflict'|'error'} SaveUiStatus */

/**
 * @returns {import('./takeoffCorrectionCoordinator.mjs').CoordinatorState}
 */
export function createTakeoffCorrectionCoordinatorState() {
  return {
    localEditSequence: 0,
    inFlight: false,
    inFlightSequence: null,
    /** @type {null | { draft: object, sequence: number, opts: object }} */
    pending: null,
    conflictPaused: false,
    latestResultId: null,
    latestClientMutationRevision: 0,
    /** @type {SaveUiStatus} */
    saveUiStatus: "idle"
  };
}

/**
 * Record a local draft edit. Coalesces pending to the newest snapshot.
 * Does not start a network request.
 *
 * @param {ReturnType<typeof createTakeoffCorrectionCoordinatorState>} state
 * @param {object} draftSnapshot
 * @param {object} [opts]
 */
export function noteLocalDraftEdit(state, draftSnapshot, opts = {}) {
  const sequence = state.localEditSequence + 1;
  return {
    ...state,
    localEditSequence: sequence,
    pending: {
      draft: draftSnapshot,
      sequence,
      // Replace opts each edit — do not carry stale aiHandling into later autosaves.
      opts: {
        correctionNotes: opts.correctionNotes,
        aiHandling: opts.aiHandling ?? null
      }
    },
    saveUiStatus: state.conflictPaused ? "conflict" : "dirty"
  };
}

/**
 * Whether autosave/flush may start a send.
 * @param {ReturnType<typeof createTakeoffCorrectionCoordinatorState>} state
 */
export function canStartCorrectionSend(state) {
  return Boolean(
    !state.conflictPaused && !state.inFlight && state.pending && state.pending.draft
  );
}

/**
 * Begin one send from the current pending snapshot.
 * Captures concurrency keys at this moment (send time).
 *
 * @param {ReturnType<typeof createTakeoffCorrectionCoordinatorState>} state
 * @returns {{ state: typeof state, send: null | {
 *   draft: object,
 *   sequence: number,
 *   opts: object,
 *   baseResultId: string|null,
 *   clientMutationRevision: number
 * }}}
 */
export function beginCorrectionSend(state) {
  if (!canStartCorrectionSend(state)) {
    return { state, send: null };
  }
  const pending = state.pending;
  const clientMutationRevision = Math.max(
    pending.sequence,
    state.latestClientMutationRevision + 1
  );
  return {
    state: {
      ...state,
      inFlight: true,
      inFlightSequence: pending.sequence,
      pending: null,
      saveUiStatus: "saving"
    },
    send: {
      draft: pending.draft,
      sequence: pending.sequence,
      opts: pending.opts || {},
      baseResultId: state.latestResultId,
      clientMutationRevision
    }
  };
}

/**
 * Apply a successful correction response BEFORE any follow-up send.
 * If local edits landed after this request started, keep pending and mark dirty.
 *
 * @param {ReturnType<typeof createTakeoffCorrectionCoordinatorState>} state
 * @param {{
 *   resultId?: string|null,
 *   clientMutationRevision?: number|null,
 *   requestSequence: number
 * }} response
 */
export function applyCorrectionSuccess(state, response) {
  const resultId =
    typeof response.resultId === "string" && response.resultId
      ? response.resultId
      : state.latestResultId;
  const rev = Number(response.clientMutationRevision);
  const nextRevision =
    Number.isSafeInteger(rev) && rev > 0
      ? Math.max(state.latestClientMutationRevision, rev)
      : Math.max(state.latestClientMutationRevision, response.requestSequence);

  const newerLocalEdits = state.localEditSequence > response.requestSequence;
  const hasPending = Boolean(state.pending);

  return {
    ...state,
    inFlight: false,
    inFlightSequence: null,
    conflictPaused: false,
    latestResultId: resultId,
    latestClientMutationRevision: nextRevision,
    saveUiStatus: newerLocalEdits || hasPending ? "dirty" : "saved"
  };
}

/**
 * Real stale-write conflict: pause autosave, preserve pending/local draft.
 *
 * @param {ReturnType<typeof createTakeoffCorrectionCoordinatorState>} state
 * @param {{ latestResultId?: string|null, latestClientMutationRevision?: number|null }} meta
 * @param {null | { draft: object, sequence: number, opts?: object }} [failedSend]
 */
export function applyCorrectionConflict(state, meta = {}, failedSend = null) {
  const latestResultId =
    typeof meta.latestResultId === "string" && meta.latestResultId
      ? meta.latestResultId
      : state.latestResultId;
  const serverRev = Number(meta.latestClientMutationRevision);
  const latestClientMutationRevision =
    Number.isSafeInteger(serverRev) && serverRev > 0
      ? Math.max(state.latestClientMutationRevision, serverRev)
      : state.latestClientMutationRevision;

  // Prefer newer local pending edits made while the request was in flight;
  // otherwise restore the draft that failed so nothing is discarded.
  const pending =
    state.pending ||
    (failedSend
      ? {
          draft: failedSend.draft,
          sequence: failedSend.sequence,
          opts: failedSend.opts || {}
        }
      : null);

  return {
    ...state,
    inFlight: false,
    inFlightSequence: null,
    conflictPaused: true,
    latestResultId,
    latestClientMutationRevision,
    pending,
    saveUiStatus: "conflict"
  };
}

/**
 * Non-409 failure. Keep pending; allow retry.
 * @param {ReturnType<typeof createTakeoffCorrectionCoordinatorState>} state
 * @param {null | { draft: object, sequence: number, opts?: object }} [failedSend]
 */
export function applyCorrectionFailure(state, failedSend = null) {
  const pending =
    state.pending ||
    (failedSend
      ? {
          draft: failedSend.draft,
          sequence: failedSend.sequence,
          opts: failedSend.opts || {}
        }
      : null);
  return {
    ...state,
    inFlight: false,
    inFlightSequence: null,
    pending,
    saveUiStatus: "error"
  };
}

/**
 * Estimator chose to review latest draft — clear pause so a deliberate flush may run.
 * Does not discard local pending edits.
 * @param {ReturnType<typeof createTakeoffCorrectionCoordinatorState>} state
 */
export function clearConflictPause(state) {
  return {
    ...state,
    conflictPaused: false,
    saveUiStatus: state.pending ? "dirty" : "idle"
  };
}

/**
 * Seed keys after workspace load / review-latest hydrate.
 * @param {ReturnType<typeof createTakeoffCorrectionCoordinatorState>} state
 * @param {{ resultId?: string|null, clientMutationRevision?: number|null }} keys
 */
export function seedCoordinatorServerKeys(state, keys = {}) {
  const rev = Number(keys.clientMutationRevision);
  return {
    ...state,
    latestResultId:
      typeof keys.resultId === "string" && keys.resultId
        ? keys.resultId
        : state.latestResultId,
    latestClientMutationRevision:
      Number.isSafeInteger(rev) && rev > 0
        ? Math.max(state.latestClientMutationRevision, rev)
        : state.latestClientMutationRevision,
    conflictPaused: false,
    pending: null,
    inFlight: false,
    inFlightSequence: null,
    saveUiStatus: "idle"
  };
}

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
 * Do not infer backsplash-only from `backsplashEligible` alone.
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
 * Used when geometry/topology that the confirmation covers changes.
 *
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
 * Backsplash / notes / cutouts must NOT call this.
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
