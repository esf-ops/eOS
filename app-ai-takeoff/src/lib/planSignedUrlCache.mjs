/**
 * Short-lived in-memory cache for plan signed download URLs within one Takeoff head session.
 * Avoids re-POSTing /api/quote-files/download-url when reopening the same plan.
 * Does not persist across tabs/reloads. Never used for worksheet/measurement authority.
 */

const cache = new Map();

/** @param {string} quoteFileId */
export function getCachedPlanSignedUrl(quoteFileId) {
  const id = String(quoteFileId || "").trim();
  if (!id) return null;
  const hit = cache.get(id);
  if (!hit) return null;
  const expiresAtMs = Date.parse(String(hit.expiresAt || ""));
  // Require ≥60s remaining so the estimator isn't handed an about-to-expire URL.
  if (!Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < 60_000) {
    cache.delete(id);
    return null;
  }
  return String(hit.signedUrl || "") || null;
}

/**
 * @param {string} quoteFileId
 * @param {{ signedUrl: string, expiresAt?: string|null }} payload
 */
export function setCachedPlanSignedUrl(quoteFileId, payload) {
  const id = String(quoteFileId || "").trim();
  const signedUrl = String(payload?.signedUrl || "").trim();
  if (!id || !signedUrl) return;
  cache.set(id, {
    signedUrl,
    expiresAt: payload?.expiresAt || null
  });
}

/** Test helper — clear session cache. */
export function clearPlanSignedUrlCache() {
  cache.clear();
}

export function planSignedUrlCacheSize() {
  return cache.size;
}
