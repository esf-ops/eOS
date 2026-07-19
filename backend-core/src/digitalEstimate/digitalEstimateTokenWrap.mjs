/**
 * Staff-recoverable wrap for Digital Estimate access tokens.
 * Public validation still uses SHA-256 hashes only.
 * Wrapped ciphertext is AES-256-GCM; key from DIGITAL_ESTIMATE_LINK_WRAP_KEY.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readDigitalEstimatePublicBaseUrl } from "./digitalEstimateConfig.mjs";

function resolveWrapKey(env = process.env) {
  const raw = String(env.DIGITAL_ESTIMATE_LINK_WRAP_KEY || "").trim();
  if (raw) return createHash("sha256").update(raw, "utf8").digest();
  // Dev/test only — never rely on this in production hosts without an explicit key.
  const allowDev =
    String(env.NODE_ENV || "").trim() === "test" ||
    String(env.ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH || "").trim() === "1" ||
    String(env.DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP || "").trim() === "1";
  if (allowDev) {
    return createHash("sha256").update("digital-estimate-dev-link-wrap", "utf8").digest();
  }
  return null;
}

/**
 * @param {string} rawToken
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null} base64url(iv||tag||ciphertext) or null if wrap key unavailable
 */
export function wrapDigitalEstimateAccessToken(rawToken, env = process.env) {
  const key = resolveWrapKey(env);
  const token = String(rawToken || "").trim();
  if (!key || !token) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

/**
 * @param {string|null|undefined} wrapped
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function unwrapDigitalEstimateAccessToken(wrapped, env = process.env) {
  const key = resolveWrapKey(env);
  const raw = String(wrapped || "").trim();
  if (!key || !raw) return null;
  try {
    const buf = Buffer.from(raw, "base64url");
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Stable reusable customer URL (path token). Legacy `#` fragment links remain readable.
 * @param {string} rawToken
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildDigitalEstimateCustomerUrl(rawToken, env = process.env) {
  const base = readDigitalEstimatePublicBaseUrl(env);
  const token = String(rawToken || "").trim();
  if (!token) return null;
  return `${base}/e/${encodeURIComponent(token)}`;
}

export function isDigitalEstimateLinkWrapConfigured(env = process.env) {
  return resolveWrapKey(env) != null;
}
