/**
 * Auth for QuickBooks Full Finance ingest.
 * Separate token from Sales (QB_SALES_SYNC_INGEST_TOKEN) and AD customer sync.
 */

import { timingSafeEqual } from "node:crypto";

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

export function extractQuickBooksFinanceSyncToken(req) {
  const auth = String(req.header("authorization") ?? "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  return String(req.header("x-qb-finance-sync-token") ?? "").trim();
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} [env]
 */
export function requireQuickBooksFinanceSyncToken(req, res, env = process.env) {
  const expected = String(env.QB_FINANCE_SYNC_INGEST_TOKEN ?? "").trim();
  if (!expected) {
    res.status(500).json({ ok: false, error: "QB_FINANCE_SYNC_INGEST_TOKEN not configured" });
    return false;
  }
  const sales = String(env.QB_SALES_SYNC_INGEST_TOKEN ?? "").trim();
  const ad = String(env.QB_AD_CUSTOMER_SYNC_INGEST_TOKEN ?? "").trim();
  if (sales && expected === sales) {
    res.status(500).json({ ok: false, error: "QB_FINANCE_SYNC_INGEST_TOKEN must not equal QB_SALES_SYNC_INGEST_TOKEN" });
    return false;
  }
  if (ad && expected === ad) {
    res.status(500).json({ ok: false, error: "QB_FINANCE_SYNC_INGEST_TOKEN must not equal QB_AD_CUSTOMER_SYNC_INGEST_TOKEN" });
    return false;
  }
  const got = extractQuickBooksFinanceSyncToken(req);
  if (!constantTimeEqualString(got, expected)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}
