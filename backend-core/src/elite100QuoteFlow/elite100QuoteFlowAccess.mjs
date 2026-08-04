/**
 * Elite 100 Quote Flow access middleware — feature flag gate.
 * Chain: requireAuth → internal operator → requireHeadAccess(quote_flow) → this.
 */

import { isElite100QuoteFlowEnabled } from "./elite100QuoteFlowConfig.mjs";

/**
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
export function requireElite100QuoteFlowEnabled(options = {}) {
  const env = options.env ?? process.env;
  return function elite100QuoteFlowEnabledMiddleware(req, res, next) {
    try {
      if (!isElite100QuoteFlowEnabled(env)) {
        return res.status(404).json({ ok: false, error: "Not found" });
      }
      const u = req.user;
      if (!u || !u.id) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      return next();
    } catch {
      return res.status(500).json({ ok: false, error: "Access check failed" });
    }
  };
}
