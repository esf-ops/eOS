/**
 * Exact-origin allowlist for AI Takeoff ↔ Quote Flow postMessage.
 */

export const TAKEOFF_APPROVED_MESSAGE_TYPE = "eliteos-takeoff-approved";

export const LOCAL_TAKEOFF_ORIGINS = Object.freeze([
  "http://localhost:5186",
  "http://127.0.0.1:5186"
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

export function aiTakeoffHeadUrl(env) {
  const fromEnv =
    env && typeof env === "object" ? String(env.VITE_HEAD_URL_AI_TAKEOFF ?? "").trim() : "";
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

export function buildAllowedTakeoffMessageOrigins(env = {}) {
  const set = new Set();
  const head = originFromUrl(env.VITE_HEAD_URL_AI_TAKEOFF) || originFromUrl("http://localhost:5186");
  if (head) set.add(head);
  for (const o of LOCAL_TAKEOFF_ORIGINS) set.add(o);
  const extra = String(env.VITE_TAKEOFF_POSTMESSAGE_ALLOWED_ORIGINS ?? "").trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const o = originFromUrl(part.trim());
      if (o) set.add(o);
    }
  }
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
