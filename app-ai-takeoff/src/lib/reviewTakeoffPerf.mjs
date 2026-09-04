/**
 * Lightweight Review Takeoff open-path marks for production smoke / local diagnosis.
 * Does not change product behavior. Safe no-ops when Performance API is unavailable.
 */

const MARK_PREFIX = "eliteos-ctr:";

export function ctrPerfMark(name) {
  try {
    if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
    performance.mark(`${MARK_PREFIX}${name}`);
  } catch {
    /* ignore */
  }
}

export function ctrPerfMeasure(name, startMark, endMark) {
  try {
    if (typeof performance === "undefined" || typeof performance.measure !== "function") return null;
    const full = `${MARK_PREFIX}${name}`;
    performance.measure(full, `${MARK_PREFIX}${startMark}`, `${MARK_PREFIX}${endMark}`);
    const entries = performance.getEntriesByName(full);
    const last = entries[entries.length - 1];
    return last ? Math.round(last.duration) : null;
  } catch {
    return null;
  }
}

/** Snapshot for authenticated smoke: window.__eliteosCtrPerf */
export function publishCtrPerfSnapshot(extra = {}) {
  try {
    if (typeof window === "undefined") return;
    const marks = performance
      .getEntriesByType("mark")
      .filter((e) => String(e.name).startsWith(MARK_PREFIX))
      .map((e) => ({ name: e.name.slice(MARK_PREFIX.length), t: Math.round(e.startTime) }));
    const measures = performance
      .getEntriesByType("measure")
      .filter((e) => String(e.name).startsWith(MARK_PREFIX))
      .map((e) => ({ name: e.name.slice(MARK_PREFIX.length), ms: Math.round(e.duration) }));
    window.__eliteosCtrPerf = { marks, measures, ...extra, at: Date.now() };
  } catch {
    /* ignore */
  }
}
