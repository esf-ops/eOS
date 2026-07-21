/**
 * Smart polling schedule for async takeoff job status.
 *
 * - 2s interval for first 30s, then ~4.5s with jitter
 * - Skips ticks while a request is in flight
 * - Stops immediately when terminal
 * - Pauses requests while the document is hidden
 * - Exponential backoff after errors
 *
 * OPTIONS preflights on each poll are expected for cross-origin API calls with
 * Authorization headers. Reducing them later would require same-origin proxy/rewrite
 * (not implemented here).
 */

const FAST_INTERVAL_MS = 2000;
const SLOW_BASE_INTERVAL_MS = 4500;
const BACKOFF_AFTER_MS = 30_000;
const JITTER_MS = 400;

/**
 * @param {number} elapsedMs
 * @returns {number}
 */
export function pollIntervalMs(elapsedMs) {
  if (elapsedMs < BACKOFF_AFTER_MS) return FAST_INTERVAL_MS;
  const jitter = Math.floor(Math.random() * JITTER_MS) - JITTER_MS / 2;
  return SLOW_BASE_INTERVAL_MS + jitter;
}

/**
 * @param {{
 *   poll: () => Promise<"continue"|"completed"|"failed">,
 *   startedAtMs?: number,
 *   onTick?: (elapsedMs: number) => void,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   isVisible?: () => boolean,
 *   onStop?: () => void,
 * }} options
 * @returns {{ stop: () => void, pollInFlight: () => boolean, wake: () => void }}
 */
export function createJobStatusPoller({
  poll,
  startedAtMs = Date.now(),
  onTick,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  isVisible = () => true,
  onStop,
}) {
  let stopped = false;
  let inFlight = false;
  let timer = null;
  let errorCount = 0;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    onStop?.();
  };

  const scheduleNext = (delayMs) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void tick(), delayMs);
  };

  const tick = async () => {
    if (stopped || inFlight) {
      if (!stopped && inFlight) {
        scheduleNext(FAST_INTERVAL_MS);
      }
      return;
    }
    if (!isVisible()) {
      scheduleNext(10_000);
      return;
    }

    inFlight = true;
    const elapsedMs = Math.max(0, now() - startedAtMs);
    onTick?.(elapsedMs);

    try {
      const outcome = await poll();
      errorCount = 0;
      if (stopped) return;
      if (outcome === "completed" || outcome === "failed") {
        stop();
        return;
      }
      scheduleNext(pollIntervalMs(elapsedMs));
    } catch {
      errorCount += 1;
      if (!stopped) scheduleNext(Math.min(60_000, 5_000 * 2 ** (errorCount - 1)));
    } finally {
      inFlight = false;
    }
  };

  void tick();

  return {
    stop,
    pollInFlight: () => inFlight,
    wake: () => scheduleNext(0),
  };
}
