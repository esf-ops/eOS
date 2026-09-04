/**
 * Lightweight request-stage timing for Brain performance investigations.
 * No secrets. Enable via ELITEOS_REQUEST_TIMING=1 or opts.enabled.
 * Keep production env unset unless actively measuring (Phase 3 measurement complete).
 */

/**
 * @param {string} label
 * @param {{ enabled?: boolean, log?: boolean }} [opts]
 */
export function createRequestStageTimer(label, opts = {}) {
  const envOn =
    String(process.env.ELITEOS_REQUEST_TIMING || "").trim() === "1" ||
    String(process.env.ELITEOS_REQUEST_TIMING || "").toLowerCase() === "true";
  const enabled = opts.enabled === true || (opts.enabled !== false && envOn);
  const started = Date.now();
  /** @type {Record<string, number>} */
  const stages = {};
  let last = started;

  return {
    enabled,
    /** @param {string} name */
    mark(name) {
      if (!enabled) return;
      const now = Date.now();
      const key = String(name || "stage").slice(0, 64);
      stages[key] = (stages[key] || 0) + (now - last);
      last = now;
    },
    /** @returns {{ label: string, totalMs: number, stages: Record<string, number> } | null} */
    finish() {
      if (!enabled) return null;
      const totalMs = Date.now() - started;
      const payload = { label: String(label || "request"), totalMs, stages: { ...stages } };
      if (opts.log !== false) {
        console.info("[eliteos-perf]", JSON.stringify(payload));
      }
      return payload;
    }
  };
}

/**
 * Attach timing JSON to response header when present (staff debugging only).
 * @param {import('express').Response} res
 * @param {{ label: string, totalMs: number, stages: Record<string, number> } | null} timing
 */
export function attachRequestTimingHeader(res, timing) {
  if (!timing || !res || typeof res.setHeader !== "function") return;
  try {
    res.setHeader("X-Eliteos-Perf", JSON.stringify(timing));
  } catch {
    // ignore header failures
  }
}
