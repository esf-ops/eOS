/**
 * Domain × dataset × month-window checkpoints for resumable finance sync.
 * Failed 2025-08 AP must not force restart of 2025-01 Sales or other domains.
 */

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
 * @param {{ force?: boolean }} [opts]
 */
export function shouldSkipCheckpoint(existing, opts = {}) {
  if (opts.force) return false;
  if (!existing) return false;
  return existing.status === "success";
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
 */
export function remainingWindows(windows, checkpoints, { force = false } = {}) {
  const byPeriod = new Map();
  for (const c of checkpoints || []) {
    byPeriod.set(`${c.period_start}|${c.period_end}`, c);
  }
  return (windows || []).filter((w) => {
    const existing = byPeriod.get(`${w.period_start}|${w.period_end}`);
    return !shouldSkipCheckpoint(existing, { force });
  });
}
