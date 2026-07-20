/**
 * DE.2E — configuration session secret + cookie helpers.
 * Raw secret never logged; DB stores SHA-256 hash only.
 *
 * Canonical production cookie (API host only — digital.eliteosfab.com → api.eliteosfab.com):
 *   de_cfg_session=<base64url>; Path=/; Secure; HttpOnly; SameSite=None
 *
 * SameSite=None is required so credentialed cross-origin fetches from the public head
 * reliably store and return the host-only API cookie. Path=/ avoids path-prefix ambiguity
 * with /v2/selections vs /v2/review-requests/*. Legacy Path=/api/public-digital-estimate/v2
 * cookies are expired on every set/clear.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  DE_PUBLIC_CONFIG_COOKIE_PATH,
  DE_PUBLIC_CONFIG_COOKIE_PATH_LEGACY,
  DE_PUBLIC_CONFIG_SESSION_COOKIE,
  readDigitalEstimateSessionTtlHours
} from "./publicConfigurationConfig.mjs";

export const DE_SESSION_SECRET_BYTES = 32;

/**
 * @returns {{ rawSecret: string, secretHash: string }}
 */
export function generateConfigurationSessionSecret() {
  const rawSecret = randomBytes(DE_SESSION_SECRET_BYTES).toString("base64url");
  return { rawSecret, secretHash: hashConfigurationSessionSecret(rawSecret) };
}

/**
 * Canonical hash used at create AND lookup — must stay identical.
 * @param {string} rawSecret
 */
export function hashConfigurationSessionSecret(rawSecret) {
  return createHash("sha256").update(normalizeSessionSecret(rawSecret), "utf8").digest("hex");
}

/**
 * Strip quotes / URI encoding so create-time and Cookie-header values match.
 * @param {unknown} raw
 */
export function normalizeSessionSecret(raw) {
  let s = String(raw ?? "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {
      /* keep */
    }
  }
  return s.trim();
}

export function constantTimeEqualSessionHash(a, b) {
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
 * @param {import('express').Request} req
 * @returns {Record<string, string>}
 */
export function parseCookieHeader(req) {
  if (req?.cookies && typeof req.cookies === "object") return req.cookies;
  /** @type {Record<string, string>} */
  const out = {};
  const header = String(req?.headers?.cookie || "");
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = normalizeSessionSecret(trimmed.slice(eq + 1));
    out[k] = v;
  }
  return out;
}

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function readSessionSecretFromCookie(req) {
  const candidates = readSessionSecretCandidatesFromCookie(req);
  return candidates.length ? candidates[candidates.length - 1] : null;
}

/**
 * Collect every de_cfg_session value (duplicates from Path=/ vs legacy path).
 * Order: header order. Callers should try from the end (newest / Path=/ last).
 * @param {import('express').Request} req
 * @returns {string[]}
 */
export function listSessionSecretsFromCookieHeader(req) {
  const header = String(req?.headers?.cookie || "");
  const out = [];
  const seen = new Set();
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    if (k !== DE_PUBLIC_CONFIG_SESSION_COOKIE) continue;
    const v = normalizeSessionSecret(trimmed.slice(eq + 1));
    if (v.length < 20 || v.length > 256) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Candidates for lookup — reverse order so the canonical/newest cookie is tried first.
 * @param {import('express').Request} req
 * @returns {string[]}
 */
export function readSessionSecretCandidatesFromCookie(req) {
  const listed = listSessionSecretsFromCookieHeader(req);
  if (listed.length) return [...listed].reverse();
  return [];
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   rawSecret: string,
 *   maxAgeSeconds?: number
 * }} args
 */
export function buildSessionCookieOptions(args) {
  const env = args.env ?? process.env;
  const isProd =
    String(env.NODE_ENV || "").trim() === "production" ||
    String(env.VERCEL_ENV || "").trim() === "production";
  const allowInsecureDev =
    !isProd && String(env.DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE ?? "").trim() === "1";
  const ttlHours = readDigitalEstimateSessionTtlHours(env);
  const maxAge = args.maxAgeSeconds ?? ttlHours * 3600;
  const secure = isProd || !allowInsecureDev;
  // Cross-origin SPA (digital.*) → API (api.*) requires SameSite=None; Secure in production.
  // Local insecure-dev keeps Lax so browsers accept non-Secure cookies.
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: DE_PUBLIC_CONFIG_COOKIE_PATH,
    maxAge,
    // Do not set Domain — host-only cookie for the Brain API host.
  };
}

function sameSiteAttribute(sameSite) {
  if (sameSite === "none") return "SameSite=None";
  if (sameSite === "lax") return "SameSite=Lax";
  return "SameSite=Strict";
}

/**
 * @param {import('express').Response} res
 * @param {string} rawSecret
 * @param {NodeJS.ProcessEnv} [env]
 */
export function setConfigurationSessionCookie(res, rawSecret, env = process.env) {
  clearObsoleteConfigurationSessionCookies(res, env);
  const secret = normalizeSessionSecret(rawSecret);
  const opts = buildSessionCookieOptions({ env, rawSecret: secret });
  // base64url is cookie-octet safe — do not URI-encode (avoids create/lookup asymmetry).
  const parts = [
    `${DE_PUBLIC_CONFIG_SESSION_COOKIE}=${secret}`,
    `Path=${opts.path}`,
    `Max-Age=${Math.max(0, Number(opts.maxAge) || 0)}`,
    sameSiteAttribute(opts.sameSite),
    "HttpOnly"
  ];
  if (opts.secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function expireConfigurationSessionCookieAtPath(res, path, env = process.env) {
  const opts = buildSessionCookieOptions({ env, rawSecret: "x", maxAgeSeconds: 0 });
  for (const sameSite of ["None", "Lax", "Strict"]) {
    const parts = [
      `${DE_PUBLIC_CONFIG_SESSION_COOKIE}=`,
      `Path=${path}`,
      "Max-Age=0",
      `SameSite=${sameSite}`,
      "HttpOnly"
    ];
    if (opts.secure || sameSite === "None") parts.push("Secure");
    res.append("Set-Cookie", parts.join("; "));
  }
}

/**
 * Expire every known path/SameSite variant so only the next Set-Cookie remains.
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} [env]
 */
export function clearObsoleteConfigurationSessionCookies(res, env = process.env) {
  expireConfigurationSessionCookieAtPath(res, DE_PUBLIC_CONFIG_COOKIE_PATH, env);
  expireConfigurationSessionCookieAtPath(res, DE_PUBLIC_CONFIG_COOKIE_PATH_LEGACY, env);
}

/**
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} [env]
 */
export function clearConfigurationSessionCookie(res, env = process.env) {
  clearObsoleteConfigurationSessionCookies(res, env);
}

/**
 * Strict Origin check for credentialed public configuration mutations.
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} expectedOrigin
 */
export function assertPublicConfigurationOrigin(req, expectedOrigin, env = process.env) {
  const origin = String(req.get("origin") || "").trim();
  const expected = String(expectedOrigin || "").trim().replace(/\/+$/, "");
  if (!expected) {
    const err = new Error("Configuration unavailable");
    err.code = "origin_not_configured";
    err.statusCode = 403;
    throw err;
  }
  const allowLocal =
    String(env.DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN ?? "").trim() === "1";
  if (allowLocal && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return origin;
  }
  if (!origin || origin.replace(/\/+$/, "") !== expected) {
    const err = new Error("Configuration unavailable");
    err.code = "origin_rejected";
    err.statusCode = 403;
    throw err;
  }
  return origin;
}

/**
 * Redact Authorization / cookie values from log strings.
 * @param {string} text
 */
export function redactPublicConfigurationSecrets(text) {
  return String(text ?? "")
    .replace(/(Authorization:\s*Bearer\s+)[^\s,]+/gi, "$1[redacted]")
    .replace(
      new RegExp(`${DE_PUBLIC_CONFIG_SESSION_COOKIE}=[^;\\s]+`, "gi"),
      `${DE_PUBLIC_CONFIG_SESSION_COOKIE}=[redacted]`
    )
    .replace(/(\/api\/public-digital-estimate\/v1\/)([^/?#]+)/gi, "$1[redacted]")
    .replace(/(\/e\/)([^/?#]+)/gi, "$1[redacted]")
    .replace(/(#)([A-Za-z0-9_-]{20,})/g, "$1[redacted]");
}
