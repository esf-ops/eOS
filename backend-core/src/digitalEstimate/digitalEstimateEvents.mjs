/**
 * Event metadata sanitizer + view-event privacy policy (DE.1).
 *
 * Minimum-retention policy (document in PHASE_DE_1_NOTES):
 * - Store hashed IP prefix (SHA-256 truncated) — never full IP.
 * - Store coarse UA family only (browser/os class) — never raw UA.
 * - Retain view metadata ≤ 90 days (operator retention; no auto-purge job in DE.1).
 * - Never store raw tokens, estimate bodies, subjects, or addresses.
 */

import { createHash } from "node:crypto";

const PROHIBITED = new Set([
  "token",
  "rawtoken",
  "accesstoken",
  "ip",
  "ipaddress",
  "useragent",
  "ua",
  "subject",
  "body",
  "email",
  "address",
  "snapshot",
  "wholesale",
  "margin"
]);

/**
 * @param {unknown} metadata
 */
export function sanitizeDigitalEstimateEventMetadata(metadata) {
  if (metadata == null) return {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    const err = new Error("event metadata must be a plain object");
    err.code = "invalid_event_metadata";
    throw err;
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lower = String(key).toLowerCase().replace(/_/g, "");
    if (PROHIBITED.has(lower)) {
      const err = new Error(`Prohibited event metadata field: ${key}`);
      err.code = "prohibited_event_metadata";
      throw err;
    }
    if (typeof value === "string" && value.length > 200) {
      out[key] = value.slice(0, 200);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param {string} ip
 */
export function hashIpForViewEvent(ip) {
  const raw = String(ip ?? "unknown").trim() || "unknown";
  return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
}

/**
 * @param {string|undefined|null} ua
 */
export function coarseUserAgentFamily(ua) {
  const s = String(ua ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("edg/")) return "edge";
  if (s.includes("chrome/")) return "chrome";
  if (s.includes("firefox/")) return "firefox";
  if (s.includes("safari/") && !s.includes("chrome/")) return "safari";
  if (s.includes("mobile")) return "mobile";
  return "other";
}
