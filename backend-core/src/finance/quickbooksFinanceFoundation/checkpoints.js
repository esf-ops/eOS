/**
 * Domain × dataset × month-window checkpoints for resumable finance sync.
 * Failed 2025-08 AP must not force restart of 2025-01 Sales or other domains.
 *
 * Skip is run-kind aware:
 * - window (historical): reuse successful checkpoints unless force
 * - incremental: never skip; always reread the rolling lookback
 */

const HISTORICAL_RESUME_RUN_KINDS = new Set(["window"]);

export function checkpointNaturalKey({ organizationId, domain, dataset, periodStart, periodEnd }) {
  return {
    organization_id: organizationId,
    domain,
    dataset,
    period_start: periodStart,
    period_end: periodEnd
  };
}

/**
 * @param {{ status?: string } | null} existing
 * @param {{ force?: boolean, runKind?: string }} [opts]
 */
export function shouldSkipCheckpoint(existing, opts = {}) {
  if (opts.force) return false;
  if (!existing) return false;
  if (existing.status !== "success") return false;
  const runKind = String(opts.runKind ?? "").trim();
  if (runKind === "incremental") return false;
  return HISTORICAL_RESUME_RUN_KINDS.has(runKind);
}

/**
 * @param {'pending'|'running'|'success'|'failed'} current
 * @param {'start'|'succeed'|'fail'|'reset'} event
 */
export function nextCheckpointStatus(current, event) {
  if (event === "reset") return "pending";
  if (event === "start") return "running";
  if (event === "succeed") return "success";
  if (event === "fail") return "failed";
  return current || "pending";
}

export function isResumableFailed(existing) {
  return Boolean(existing && existing.status === "failed");
}

/**
 * Given ordered windows and checkpoint rows, return windows still needing work.
 * Defaults to historical/window resume (skip successful periods) unless runKind is incremental.
 */
export function remainingWindows(windows, checkpoints, { force = false, runKind = "window" } = {}) {
  const byPeriod = new Map();
  for (const c of checkpoints || []) {
    byPeriod.set(`${c.period_start}|${c.period_end}`, c);
  }
  return (windows || []).filter((w) => {
    const existing = byPeriod.get(`${w.period_start}|${w.period_end}`);
    return !shouldSkipCheckpoint(existing, { force, runKind });
  });
}
