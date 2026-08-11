/**
 * Auth helpers for QuickBooks Sales ODBC sync ingest (backend-only).
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string equality for bearer tokens (pads via length check first).
 * @param {string} a
 * @param {string} b
 */
export function constantTimeEqualString(a, b) {
  const aa = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (aa.length === 0 || bb.length === 0) return false;
  if (aa.length !== bb.length) {
    // Still compare to avoid trivial short-circuit timing on length alone for equal-length guesses.
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
 * @param {NodeJS.ProcessEnv} [env]
 */
export function extractQuickBooksSalesSyncToken(req) {
  const auth = String(req.header("authorization") ?? "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  return String(req.header("x-qb-sales-sync-token") ?? "").trim();
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} [env]
 */
export function requireQuickBooksSalesSyncToken(req, res, env = process.env) {
  const expected = String(env.QB_SALES_SYNC_INGEST_TOKEN ?? "").trim();
  if (!expected) {
    res.status(500).json({ ok: false, error: "QB_SALES_SYNC_INGEST_TOKEN not configured" });
    return false;
  }
  const got = extractQuickBooksSalesSyncToken(req);
  if (!constantTimeEqualString(got, expected)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}
