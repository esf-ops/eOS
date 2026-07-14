/**
 * Deterministic turnaround / age formatting for the Quote Intake Lab.
 */

/**
 * @param {string|Date|null|undefined} receivedAt
 * @param {string|Date|null|undefined} [asOf]
 * @returns {number|null} elapsed milliseconds, or null if invalid
 */
export function elapsedMs(receivedAt, asOf = new Date()) {
  const start = Date.parse(String(receivedAt ?? ""));
  const end = Date.parse(String(asOf ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

/**
 * Human-readable age, e.g. "2h 15m", "1d 4h", "37m".
 * @param {string|Date|null|undefined} receivedAt
 * @param {string|Date|null|undefined} [asOf]
 */
export function formatTurnaround(receivedAt, asOf = new Date()) {
  const ms = elapsedMs(receivedAt, asOf);
  if (ms == null) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * Age bucket for filtering.
 * @returns {"under_4h"|"under_24h"|"under_3d"|"over_3d"|"unknown"}
 */
export function ageBucket(receivedAt, asOf = new Date()) {
  const ms = elapsedMs(receivedAt, asOf);
  if (ms == null) return "unknown";
  const hours = ms / 3600000;
  if (hours < 4) return "under_4h";
  if (hours < 24) return "under_24h";
  if (hours < 72) return "under_3d";
  return "over_3d";
}

export const AGE_BUCKET_LABELS = Object.freeze({
  under_4h: "Under 4 hours",
  under_24h: "Under 24 hours",
  under_3d: "Under 3 days",
  over_3d: "Over 3 days"
});
