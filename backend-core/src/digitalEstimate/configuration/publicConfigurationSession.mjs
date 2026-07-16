/**
 * DE.2E — configuration session secret + cookie helpers.
 * Raw secret never logged; DB stores SHA-256 hash only.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  DE_PUBLIC_CONFIG_COOKIE_PATH,
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

export function hashConfigurationSessionSecret(rawSecret) {
  return createHash("sha256").update(String(rawSecret), "utf8").digest("hex");
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
    const v = trimmed.slice(eq + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function readSessionSecretFromCookie(req) {
  const cookies = parseCookieHeader(req);
  const raw = cookies[DE_PUBLIC_CONFIG_SESSION_COOKIE];
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length < 20 || s.length > 256) return null;
  return s;
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
  return {
    httpOnly: true,
    secure: isProd || !allowInsecureDev,
    sameSite: "strict",
    path: DE_PUBLIC_CONFIG_COOKIE_PATH,
    maxAge,
    // Do not set Domain — host-only cookie for the Brain API host.
  };
}

/**
 * @param {import('express').Response} res
 * @param {string} rawSecret
 * @param {NodeJS.ProcessEnv} [env]
 */
export function setConfigurationSessionCookie(res, rawSecret, env = process.env) {
  const opts = buildSessionCookieOptions({ env, rawSecret });
  const parts = [
    `${DE_PUBLIC_CONFIG_SESSION_COOKIE}=${encodeURIComponent(rawSecret)}`,
    `Path=${opts.path}`,
    `Max-Age=${Math.max(0, Number(opts.maxAge) || 0)}`,
    `SameSite=Strict`,
    "HttpOnly"
  ];
  if (opts.secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

/**
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} [env]
 */
export function clearConfigurationSessionCookie(res, env = process.env) {
  const opts = buildSessionCookieOptions({ env, rawSecret: "x", maxAgeSeconds: 0 });
  const parts = [
    `${DE_PUBLIC_CONFIG_SESSION_COOKIE}=`,
    `Path=${DE_PUBLIC_CONFIG_COOKIE_PATH}`,
    "Max-Age=0",
    "SameSite=Strict",
    "HttpOnly"
  ];
  if (opts.secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
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
  // Development: allow localhost Vite public head when explicitly enabled
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
    .replace(new RegExp(`${DE_PUBLIC_CONFIG_SESSION_COOKIE}=[^;\\s]+`, "gi"), `${DE_PUBLIC_CONFIG_SESSION_COOKIE}=[redacted]`)
    .replace(/(\/api\/public-digital-estimate\/v1\/)([^/?#]+)/gi, "$1[redacted]")
    .replace(/(\/e\/)([^/?#]+)/gi, "$1[redacted]")
    .replace(/(#)([A-Za-z0-9_-]{20,})/g, "$1[redacted]");
}
