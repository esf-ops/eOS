/**
 * Auth for Account Directory QuickBooks customer ODBC sync ingest (backend-only).
 * Separate token from Sales QuickBooks sync (QB_SALES_SYNC_INGEST_TOKEN).
 */

import { timingSafeEqual } from "node:crypto";

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
 * @param {import('express').Request} req
 */
export function extractAdQbCustomerSyncToken(req) {
  const auth = String(req.header("authorization") ?? "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  return String(req.header("x-ad-qb-customer-sync-token") ?? "").trim();
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} [env]
 */
export function requireAdQbCustomerSyncToken(req, res, env = process.env) {
  const expected = String(env.QB_AD_CUSTOMER_SYNC_INGEST_TOKEN ?? "").trim();
  if (!expected) {
    res.status(500).json({ ok: false, error: "QB_AD_CUSTOMER_SYNC_INGEST_TOKEN not configured" });
    return false;
  }
  const got = extractAdQbCustomerSyncToken(req);
  if (!constantTimeEqualString(got, expected)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}
