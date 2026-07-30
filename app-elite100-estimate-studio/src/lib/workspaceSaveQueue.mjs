/**
 * One coalescing workspace save queue for the Elite 100 estimator.
 *
 * The estimator sees a single save state for the whole workspace even though
 * internal services use distinct endpoints. Exactly one save may be in flight;
 * edits that arrive while a save is running are retained and sent as one newer
 * payload afterwards. "Saved" is only reported for the newest queued payload.
 */

const DEFAULT_DEBOUNCE_MS = 600;

/**
 * @template P
 * @param {{
 *   run: (payload: P, ctx: { seq: number, onPhase: (phase: "persisting"|"calculating") => void }) => Promise<void>,
 *   debounceMs?: number,
 *   onStateChange?: (state: string) => void,
 *   setTimeoutImpl?: (fn: () => void, ms: number) => unknown,
 *   clearTimeoutImpl?: (handle: unknown) => void
 * }} options
 */
export function createWorkspaceSaveQueue(options) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const setTimeoutImpl =
    options.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutImpl =
    options.clearTimeoutImpl ?? ((handle) => clearTimeout(/** @type {any} */ (handle)));

  let seq = 0;
  let acknowledged = 0;
  /** @type {{ payload: any, seq: number }|null} */
  let pendingPayload = null;
  /** @type {Promise<void>|null} */
  let inFlight = null;
  /** @type {unknown} */
  let timer = null;
  let failed = false;
  let state = "Saved";

  function setState(next) {
    if (state === next) return;
    state = next;
    options.onStateChange?.(next);
  }

  function clearTimer() {
    if (timer != null) {
      clearTimeoutImpl(timer);
      timer = null;
    }
  }

  async function drain() {
    if (inFlight) return inFlight;
    const next = pendingPayload;
    if (!next) return;
    pendingPayload = null;
    setState("Saving…");
    const attempt = (async () => {
      try {
        await options.run(next.payload, {
          seq: next.seq,
          onPhase: (phase) =>
            setState(phase === "calculating" ? "Updating estimate…" : "Saving…")
        });
        failed = false;
        if (next.seq > acknowledged) acknowledged = next.seq;
      } catch {
        failed = true;
        if (!pendingPayload) {
          pendingPayload = next;
        }
      } finally {
        inFlight = null;
      }

      if (pendingPayload) {
        if (failed) {
          setState("Save failed");
          return;
        }
        await drain();
        return;
      }
      setState(failed ? "Save failed" : acknowledged >= seq ? "Saved" : "Unsaved changes");
    })();
    inFlight = attempt;
    return attempt;
  }

  return {
    queue(payload) {
      seq += 1;
      pendingPayload = { payload, seq };
      failed = false;
      setState("Unsaved changes");
      clearTimer();
      timer = setTimeoutImpl(() => {
        timer = null;
        void drain();
      }, debounceMs);
      return seq;
    },
    async flush() {
      clearTimer();
      await drain();
      while (pendingPayload && !failed) {
        await drain();
      }
    },
    isDirty() {
      return Boolean(pendingPayload) || acknowledged < seq;
    },
    isSaving() {
      return Boolean(inFlight);
    },
    state() {
      return state;
    },
    latestSeq() {
      return seq;
    },
    acknowledgedSeq() {
      return acknowledged;
    },
    cancel() {
      clearTimer();
      pendingPayload = null;
    }
  };
}

/**
 * Whether a server response identified by `seq` may still update authoritative
 * totals. Stale responses are dropped so newer local input always wins.
 */
export function isFreshCalculationResponse(seq, lastAppliedSeq) {
  return Number(seq) >= Number(lastAppliedSeq);
}
