/**
 * Exact-origin allowlist for AI Takeoff ↔ Estimate Studio postMessage (AUDIT-005).
 * Shared by Studio TS and Node tests. No wildcard subdomain authorization.
 */

export const TAKEOFF_APPROVED_MESSAGE_TYPE = "eliteos-takeoff-approved";

export const LOCAL_TAKEOFF_ORIGINS = Object.freeze([
  "http://localhost:5186",
  "http://127.0.0.1:5186"
]);

export const LOCAL_STUDIO_ORIGINS = Object.freeze([
  "http://localhost:5191",
  "http://127.0.0.1:5191"
]);

export function originFromUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

/** Configured AI Takeoff head URL for iframe src + primary allowlist entry. */
export function aiTakeoffHeadUrl(env) {
  const fromEnv =
    env && typeof env === "object"
      ? String(env.VITE_HEAD_URL_AI_TAKEOFF ?? "").trim()
      : "";
  let fromMeta = "";
  try {
    fromMeta = String(
      (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_HEAD_URL_AI_TAKEOFF) ||
        ""
    ).trim();
  } catch {
    fromMeta = "";
  }
  const raw = fromEnv || fromMeta;
  return raw.replace(/\/+$/, "") || "http://localhost:5186";
}

export function configuredExtraAllowedOrigins(env = {}) {
  const raw = String(env.VITE_TAKEOFF_POSTMESSAGE_ALLOWED_ORIGINS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => originFromUrl(p.trim()))
    .filter(Boolean);
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {Set<string>}
 */
export function buildAllowedTakeoffMessageOrigins(env = {}) {
  const set = new Set();
  const head =
    originFromUrl(env.VITE_HEAD_URL_AI_TAKEOFF) ||
    originFromUrl("http://localhost:5186");
  if (head) set.add(head);
  for (const o of LOCAL_TAKEOFF_ORIGINS) set.add(o);
  for (const o of configuredExtraAllowedOrigins(env)) set.add(o);
  return set;
}

export function isAllowedTakeoffMessageOrigin(origin, env = {}) {
  const o = String(origin || "").trim();
  if (!o || o === "null" || o.startsWith("file:")) return false;
  return buildAllowedTakeoffMessageOrigins(env).has(o);
}

export function isValidTakeoffApprovedMessage(data, expectedTakeoffJobId) {
  if (!data || typeof data !== "object") return false;
  if (data.type !== TAKEOFF_APPROVED_MESSAGE_TYPE) return false;
  const jobId = String(data.takeoffJobId ?? "").trim();
  if (!jobId || jobId !== String(expectedTakeoffJobId || "").trim()) return false;
  if (data.reviewStatus != null && String(data.reviewStatus) !== "approved") return false;
  return true;
}

/**
 * Resolve exact Studio parent origin for Takeoff → Studio postMessage.
 * Never returns "*". Returns null when no safe origin can be derived.
 * @param {{ env?: Record<string,string|undefined>, referrer?: string, isDev?: boolean }} [opts]
 */
export function resolveStudioParentTargetOrigin(opts = {}) {
  const env = opts.env || {};
  const configured =
    originFromUrl(env.VITE_HEAD_URL_ELITE100_ESTIMATE_STUDIO) ||
    originFromUrl(env.VITE_HEAD_URL_ESTIMATE_STUDIO);
  if (configured) return configured;
  const fromReferrer = originFromUrl(opts.referrer);
  if (fromReferrer) return fromReferrer;
  if (opts.isDev) {
    return "http://localhost:5191";
  }
  return null;
}
