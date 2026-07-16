/**
 * Token generation / hashing — Phase DE.1.
 * Raw token returned only at create/replace; only hash is persisted.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const DIGITAL_ESTIMATE_TOKEN_BYTES = 32; // 256 bits

/**
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export function generateDigitalEstimateAccessToken() {
  const buf = randomBytes(DIGITAL_ESTIMATE_TOKEN_BYTES);
  const rawToken = buf.toString("base64url");
  return { rawToken, tokenHash: hashDigitalEstimateToken(rawToken) };
}

/**
 * @param {string} rawToken
 */
export function hashDigitalEstimateToken(rawToken) {
  return createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

/**
 * Constant-time compare of two hex digests (or equal-length strings).
 * @param {string} a
 * @param {string} b
 */
export function constantTimeEqualHex(a, b) {
  const aa = String(a ?? "");
  const bb = String(b ?? "");
  if (aa.length !== bb.length || aa.length === 0) return false;
  try {
    return timingSafeEqual(Buffer.from(aa, "utf8"), Buffer.from(bb, "utf8"));
  } catch {
    return false;
  }
}

/**
 * SHA-256 hex of canonical JSON (sorted keys at top level via JSON.stringify of sorted rebuild).
 * @param {unknown} value
 */
export function sha256CanonicalJson(value) {
  const canonical = canonicalize(value);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
}

/**
 * Redact token path segments for logs.
 * @param {string} urlOrPath
 */
export function redactDigitalEstimateTokenPath(urlOrPath) {
  return String(urlOrPath ?? "")
    .replace(
      /(\/api\/public-digital-estimate\/v1\/)([^/?#]+)/gi,
      "$1[redacted]"
    )
    .replace(/(\/e\/)([^/?#]+)/gi, "$1[redacted]")
    .replace(/(\/e#)([^/?\s]+)/gi, "$1[redacted]");
}
