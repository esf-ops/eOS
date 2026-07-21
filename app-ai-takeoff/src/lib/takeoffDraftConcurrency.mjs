/**
 * Editable Takeoff request coordination.
 *
 * Status polling and draft persistence are intentionally separate:
 * - job status may poll only while processing
 * - full editable drafts load initially and once when a result version changes
 * - saves are serialized and coalesced to the newest local snapshot
 */

export const TAKEOFF_TERMINAL_JOB_STATUSES = Object.freeze(
  new Set(["completed", "failed", "cancelled", "canceled", "approved"])
);

export function isTakeoffJobTerminal(status, reviewStatus = "") {
  const job = String(status ?? "").toLowerCase();
  const review = String(reviewStatus ?? "").toLowerCase();
  return TAKEOFF_TERMINAL_JOB_STATUSES.has(job) || review === "approved";
}

export function shouldPollTakeoffJob({ jobStatus, reviewStatus, visibilityState }) {
  if (String(visibilityState ?? "visible") !== "visible") return false;
  if (isTakeoffJobTerminal(jobStatus, reviewStatus)) return false;
  return ["processing", "pending", "queued"].includes(String(jobStatus ?? "").toLowerCase());
}

export function resultVersionOf(payload) {
  if (!payload || typeof payload !== "object") return null;
  const id =
    payload.resultId ??
    payload.latestResultId ??
    payload.latestResult?.id ??
    payload.resultSummary?.resultRowId ??
    null;
  const savedAt =
    payload.savedAt ??
    payload.latestResultCreatedAt ??
    payload.latestResult?.createdAt ??
    payload.resultSummary?.savedAt ??
    null;
  if (!id && !savedAt) return null;
  return `${id ?? "summary"}@${savedAt ?? "unknown"}`;
}

/**
 * A server draft may replace the editable draft only when there are no local
 * mutations newer than the request and its result version is not stale.
 */
export function shouldAcceptServerDraft({
  requestMutationRevision,
  currentMutationRevision,
  requestSequence,
  latestAppliedSequence,
  serverSavedAt,
  latestLocalSaveAt
}) {
  if (Number(requestMutationRevision) < Number(currentMutationRevision)) return false;
  if (Number(requestSequence) < Number(latestAppliedSequence)) return false;
  if (
    serverSavedAt &&
    latestLocalSaveAt &&
    Date.parse(serverSavedAt) < Date.parse(latestLocalSaveAt)
  ) {
    return false;
  }
  return true;
}

/**
 * Serialize saves and coalesce edits made while a request is in flight.
 * An older response is observable for diagnostics but can never replace state.
 *
 * @param {{
 *   save: (snapshot: any, revision: number) => Promise<any>,
 *   onSaved?: (response: any, revision: number, isLatest: boolean) => void,
 *   onError?: (error: unknown, revision: number, isLatest: boolean) => void
 * }} options
 */
export function createTakeoffSaveCoordinator({ save, onSaved, onError }) {
  let stopped = false;
  let inFlight = false;
  let latestRevision = 0;
  let pending = null;

  async function drain() {
    if (stopped || inFlight || !pending) return;
    const current = pending;
    pending = null;
    inFlight = true;
    try {
      const response = await save(current.snapshot, current.revision);
      if (!stopped) {
        onSaved?.(response, current.revision, current.revision === latestRevision);
      }
    } catch (error) {
      if (!stopped) {
        onError?.(error, current.revision, current.revision === latestRevision);
      }
    } finally {
      inFlight = false;
      if (!stopped && pending) void drain();
    }
  }

  return {
    enqueue(snapshot, revision) {
      if (stopped) return;
      latestRevision = Math.max(latestRevision, Number(revision) || 0);
      pending = { snapshot: structuredClone(snapshot), revision: Number(revision) || 0 };
      void drain();
    },
    stop() {
      stopped = true;
      pending = null;
    },
    inFlight: () => inFlight,
    hasPending: () => Boolean(pending),
    latestRevision: () => latestRevision
  };
}

/**
 * Error backoff for status polling: 5s, 10s, 20s, capped at 60s.
 */
export function takeoffPollBackoffMs(errorCount) {
  const count = Math.max(0, Math.floor(Number(errorCount) || 0));
  return Math.min(60_000, 5_000 * 2 ** count);
}
