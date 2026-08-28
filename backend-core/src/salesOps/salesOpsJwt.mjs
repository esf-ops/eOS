/**
 * HS256 JWT verify for Monday app webhooks (no extra dependency).
 * Verifies signature + exp. Optional audience check.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function b64urlToBuf(s) {
  const pad = 4 - (s.length % 4 || 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + (pad === 4 ? "" : "=".repeat(pad));
  return Buffer.from(b64, "base64");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {{ audience?: string|null }} [opts]
 * @returns {{ ok: true, payload: Record<string, unknown> } | { ok: false, error: string }}
 */
export function verifyHs256Jwt(token, secret, opts = {}) {
  const raw = String(token ?? "").trim().replace(/^Bearer\s+/i, "");
  const sec = String(secret ?? "");
  if (!raw || !sec) return { ok: false, error: "missing_token_or_secret" };
  const parts = raw.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed_jwt" };
  const [h, p, s] = parts;
  let header;
  try {
    header = JSON.parse(b64urlToBuf(h).toString("utf8"));
  } catch {
    return { ok: false, error: "malformed_header" };
  }
  if (String(header?.alg ?? "") !== "HS256") return { ok: false, error: "unsupported_alg" };
  const expected = createHmac("sha256", sec).update(`${h}.${p}`).digest();
  let actual;
  try {
    actual = b64urlToBuf(s);
  } catch {
    return { ok: false, error: "malformed_signature" };
  }
  if (!safeEqual(expected, actual)) return { ok: false, error: "invalid_signature" };
  let payload;
  try {
    payload = JSON.parse(b64urlToBuf(p).toString("utf8"));
  } catch {
    return { ok: false, error: "malformed_payload" };
  }
  const exp = Number(payload?.exp);
  if (Number.isFinite(exp) && exp * 1000 < Date.now() - 30_000) {
    return { ok: false, error: "expired" };
  }
  const aud = opts.audience != null ? String(opts.audience).trim() : "";
  if (aud && String(payload?.aud ?? "") !== aud) {
    return { ok: false, error: "audience_mismatch" };
  }
  return { ok: true, payload };
}

/**
 * Sign a test JWT (tests only).
 * @param {Record<string, unknown>} payload
 * @param {string} secret
 */
export function signHs256Jwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
