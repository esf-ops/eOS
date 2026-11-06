/**
 * Auth for the Elite-controlled Slabsmith partner API (Thryve / external integrators).
 *
 * Distinct from SLABSMITH_SYNC_TOKEN (Windows connector ingest). Partner token must
 * never equal the sync token.
 */

import { timingSafeEqual } from "node:crypto";

export const SLABSMITH_PARTNER_TOKEN_ENV = "SLABSMITH_PARTNER_API_TOKEN";
export const SLABSMITH_PARTNER_ENABLED_ENV = "SLABSMITH_PARTNER_API_ENABLED";
export const SLABSMITH_PARTNER_WRITE_ENABLED_ENV = "SLABSMITH_PARTNER_WRITE_ENABLED";
export const SLABSMITH_PARTNER_ORG_ENV = "SLABSMITH_PARTNER_ORGANIZATION_ID";
export const SLABSMITH_PARTNER_TOKEN_HEADER = "x-eliteos-slabsmith-partner-token";

/**
 * @param {string} a
 * @param {string} b
 */
export function constantTimeEqualString(a, b) {
  const aa = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (aa.length === 0 || bb.length === 0) return false;
  if (aa.length !== bb.length) {
    const pad = Buffer.alloc(aa.length);
    timingSafeEqual(aa, pad);
    return false;
  }
  try {
    return timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isSlabsmithPartnerApiEnabled(env = process.env) {
  return String(env?.[SLABSMITH_PARTNER_ENABLED_ENV] ?? "").trim() === "1";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isSlabsmithPartnerWriteEnabled(env = process.env) {
  return String(env?.[SLABSMITH_PARTNER_WRITE_ENABLED_ENV] ?? "").trim() === "1";
}

/**
 * @param {import("express").Request} req
 */
export function extractSlabsmithPartnerToken(req) {
  const auth = String(req.header?.("authorization") ?? req.headers?.authorization ?? "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  return String(
    req.header?.(SLABSMITH_PARTNER_TOKEN_HEADER) ??
      req.headers?.[SLABSMITH_PARTNER_TOKEN_HEADER] ??
      ""
  ).trim();
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveSlabsmithPartnerOrganizationId(env = process.env) {
  return (
    String(env?.[SLABSMITH_PARTNER_ORG_ENV] ?? "").trim() ||
    String(env?.SLABSMITH_SYNC_ORGANIZATION_ID ?? "").trim() ||
    String(env?.SLABOS_ORGANIZATION_ID ?? "").trim() ||
    null
  );
}

/**
 * @param {import("express").Request} req
 * @param {NodeJS.ProcessEnv} [env]
 */
export function validateSlabsmithPartnerAccess(req, env = process.env) {
  if (!isSlabsmithPartnerApiEnabled(env)) {
    return { ok: false, status: 404, error: "Partner API not enabled" };
  }

  const expected = String(env?.[SLABSMITH_PARTNER_TOKEN_ENV] ?? "").trim();
  if (!expected) {
    return {
      ok: false,
      status: 500,
      error: `${SLABSMITH_PARTNER_TOKEN_ENV} not configured`,
    };
  }

  const syncToken = String(env?.SLABSMITH_SYNC_TOKEN ?? "").trim();
  if (syncToken && constantTimeEqualString(expected, syncToken)) {
    return {
      ok: false,
      status: 500,
      error: `${SLABSMITH_PARTNER_TOKEN_ENV} must not equal SLABSMITH_SYNC_TOKEN`,
    };
  }

  const orgId = resolveSlabsmithPartnerOrganizationId(env);
  if (!orgId) {
    return {
      ok: false,
      status: 500,
      error: `${SLABSMITH_PARTNER_ORG_ENV}, SLABSMITH_SYNC_ORGANIZATION_ID, or SLABOS_ORGANIZATION_ID required`,
    };
  }

  const got = extractSlabsmithPartnerToken(req);
  if (!constantTimeEqualString(got, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true, organizationId: orgId };
}
