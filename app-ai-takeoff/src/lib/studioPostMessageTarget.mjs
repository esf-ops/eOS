/**
 * Resolve exact Estimate Studio parent origin for Takeoff → Studio postMessage (AUDIT-005).
 * Never returns "*". Returns null when no safe origin can be derived (caller must skip send).
 */

export function originFromUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   referrer?: string,
 *   isDev?: boolean
 * }} [opts]
 * @returns {string|null}
 */
export function resolveStudioParentTargetOrigin(opts = {}) {
  const env = opts.env || {};
  const configured =
    originFromUrl(env.VITE_HEAD_URL_ELITE100_ESTIMATE_STUDIO) ||
    originFromUrl(env.VITE_HEAD_URL_ESTIMATE_STUDIO);
  if (configured) return configured;
  const fromReferrer = originFromUrl(opts.referrer);
  if (fromReferrer) return fromReferrer;
  if (opts.isDev === true) {
    return "http://localhost:5191";
  }
  return null;
}
