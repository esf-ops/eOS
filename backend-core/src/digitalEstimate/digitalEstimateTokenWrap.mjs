/**
 * Staff-recoverable wrap for Digital Estimate access tokens.
 * Public validation still uses SHA-256 hashes only.
 * Wrapped ciphertext is AES-256-GCM; key from DIGITAL_ESTIMATE_LINK_WRAP_KEY.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readDigitalEstimatePublicBaseUrl } from "./digitalEstimateConfig.mjs";

/**
 * Normalize Vercel/dashboard secrets: BOM, CR/LF, surrounding quotes, embedded newlines.
 * @param {unknown} raw
 */
export function normalizeLinkWrapKeySecret(raw) {
  let s = String(raw ?? "");
  s = s.replace(/^\uFEFF/, "").replace(/\r/g, "");
  s = s.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  // Vercel multi-line paste sometimes injects newlines inside the secret.
  s = s.replace(/[\n\t]+/g, "");
  return s;
}

function resolveWrapKey(env = process.env) {
  const raw = normalizeLinkWrapKeySecret(env.DIGITAL_ESTIMATE_LINK_WRAP_KEY);
  if (raw) return createHash("sha256").update(raw, "utf8").digest();
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
 * Safe diagnostics — never includes key, plaintext, ciphertext, or URL.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ token_wrapped?: string|null, revoked_at?: string|null, id?: string }|null} [tokenRow]
 * @param {{ decryptSucceeded?: boolean|null, activeTokenRows?: number|null, code?: string|null }} [extra]
 */
export function buildLinkRecoveryDiagnostics(env = process.env, tokenRow = null, extra = {}) {
  const keyMaterial = normalizeLinkWrapKeySecret(env.DIGITAL_ESTIMATE_LINK_WRAP_KEY);
  const wrapped = tokenRow?.token_wrapped != null ? String(tokenRow.token_wrapped) : "";
  return {
    wrapKeyPresent: Boolean(keyMaterial) || resolveWrapKey(env) != null,
    wrapKeyLength: keyMaterial ? keyMaterial.length : 0,
    tokenWrappedPresent: Boolean(wrapped.trim()),
    tokenWrappedLength: wrapped.trim() ? wrapped.trim().length : 0,
    activeTokenRows: extra.activeTokenRows ?? null,
    selectedTokenStatus: tokenRow
      ? tokenRow.revoked_at
        ? "revoked"
        : "active"
      : "missing",
    decryptSucceeded: extra.decryptSucceeded ?? null,
    code: extra.code || null
  };
}

export function isDigitalEstimateLinkWrapConfigured(env = process.env) {
  return resolveWrapKey(env) != null;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertDigitalEstimateLinkWrapConfigured(env = process.env) {
  if (isDigitalEstimateLinkWrapConfigured(env)) return;
  const err = new Error(
    "Customer link recovery is not configured. Set DIGITAL_ESTIMATE_LINK_WRAP_KEY on Brain and redeploy."
  );
  err.code = "link_wrap_key_missing";
  err.statusCode = 503;
  err.diagnostics = buildLinkRecoveryDiagnostics(env, null, { code: "link_wrap_key_missing" });
  throw err;
}

/**
 * @param {string} rawToken
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function wrapDigitalEstimateAccessToken(rawToken, env = process.env) {
  assertDigitalEstimateLinkWrapConfigured(env);
  const key = resolveWrapKey(env);
  const token = String(rawToken || "").trim();
  if (!key || !token) {
    const err = new Error("Unable to protect the customer link for recovery.");
    err.code = "link_wrap_failed";
    err.statusCode = 503;
    err.diagnostics = buildLinkRecoveryDiagnostics(env, null, { code: "link_wrap_failed" });
    throw err;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

/**
 * @param {string|null|undefined} wrapped
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ activeTokenRows?: number|null, tokenRow?: object|null }} [ctx]
 * @returns {{ ok: true, rawToken: string, diagnostics: object } | { ok: false, code: string, diagnostics: object }}
 */
export function unwrapDigitalEstimateAccessTokenDetailed(wrapped, env = process.env, ctx = {}) {
  const tokenRow = ctx.tokenRow || { token_wrapped: wrapped, revoked_at: null };
  const key = resolveWrapKey(env);
  const raw = String(wrapped || "").trim();
  if (!key) {
    return {
      ok: false,
      code: "link_wrap_key_missing",
      diagnostics: buildLinkRecoveryDiagnostics(env, tokenRow, {
        activeTokenRows: ctx.activeTokenRows,
        decryptSucceeded: false,
        code: "link_wrap_key_missing"
      })
    };
  }
  if (!raw) {
    return {
      ok: false,
      code: "token_wrapped_missing",
      diagnostics: buildLinkRecoveryDiagnostics(env, tokenRow, {
        activeTokenRows: ctx.activeTokenRows,
        decryptSucceeded: false,
        code: "token_wrapped_missing"
      })
    };
  }
  try {
    const buf = Buffer.from(raw, "base64url");
    if (buf.length < 12 + 16 + 1) {
      return {
        ok: false,
        code: "link_unwrap_failed",
        diagnostics: buildLinkRecoveryDiagnostics(env, tokenRow, {
          activeTokenRows: ctx.activeTokenRows,
          decryptSucceeded: false,
          code: "link_unwrap_failed"
        })
      };
    }
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const rawToken = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    if (!rawToken || rawToken.length < 20) {
      return {
        ok: false,
        code: "link_unwrap_failed",
        diagnostics: buildLinkRecoveryDiagnostics(env, tokenRow, {
          activeTokenRows: ctx.activeTokenRows,
          decryptSucceeded: false,
          code: "link_unwrap_failed"
        })
      };
    }
    return {
      ok: true,
      rawToken,
      diagnostics: buildLinkRecoveryDiagnostics(env, tokenRow, {
        activeTokenRows: ctx.activeTokenRows,
        decryptSucceeded: true,
        code: null
      })
    };
  } catch {
    return {
      ok: false,
      code: "link_unwrap_failed",
      diagnostics: buildLinkRecoveryDiagnostics(env, tokenRow, {
        activeTokenRows: ctx.activeTokenRows,
        decryptSucceeded: false,
        code: "link_unwrap_failed"
      })
    };
  }
}

/**
 * Backward-compatible helper — prefer unwrapDigitalEstimateAccessTokenDetailed.
 * @param {string|null|undefined} wrapped
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
export function unwrapDigitalEstimateAccessToken(wrapped, env = process.env) {
  const result = unwrapDigitalEstimateAccessTokenDetailed(wrapped, env);
  return result.ok ? result.rawToken : null;
}

/**
 * @param {string} rawToken
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildDigitalEstimateCustomerUrl(rawToken, env = process.env) {
  const base = readDigitalEstimatePublicBaseUrl(env);
  const token = String(rawToken || "").trim();
  if (!token) return null;
  return `${base}/e/${encodeURIComponent(token)}`;
}
