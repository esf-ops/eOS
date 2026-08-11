/**
 * Lightweight server-side timing for GET /api/sales/dashboard.
 * Logs when NODE_ENV=development or SALES_DASHBOARD_DEBUG_TIMING=true.
 */

export function isDashboardTimingEnabled() {
  if (process.env.SALES_DASHBOARD_DEBUG_TIMING === "true") return true;
  if (process.env.SALES_DASHBOARD_DEBUG_TIMING === "1") return true;
  return process.env.NODE_ENV === "development";
}

/**
 * @returns {{
 *   mark: (label: string) => void,
 *   note: (label: string, value: number) => void,
 *   finish: () => Record<string, number>
 * }}
 */
export function createDashboardTimer(enabled = isDashboardTimingEnabled()) {
  const steps = [];
  const notes = {};
  let last = enabled ? performance.now() : 0;
  const startedAt = enabled ? performance.now() : 0;

  return {
    mark(label) {
      if (!enabled) return;
      const now = performance.now();
      steps.push({ label, ms: Math.round((now - last) * 10) / 10 });
      last = now;
    },
    note(label, value) {
      if (!enabled) return;
      notes[label] = Number(value);
    },
    finish() {
      if (!enabled) return { totalMs: 0, steps: [] };
      const totalMs = Math.round((performance.now() - startedAt) * 10) / 10;
      const out = { ...notes };
      for (const { label, ms } of steps) out[label] = ms;
      out.totalMs = totalMs;
      if (isDashboardTimingEnabled()) {
        const slowest = [...steps].sort((a, b) => b.ms - a.ms)[0];
        console.info(
          `[sales-dashboard timing] total=${totalMs}ms slowest=${slowest?.label ?? "—"} (${slowest?.ms ?? 0}ms)`,
          out
        );
      }
      return out;
    }
  };
}
