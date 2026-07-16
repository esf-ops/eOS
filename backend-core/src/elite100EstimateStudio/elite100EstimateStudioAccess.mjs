/**
 * Elite 100 Estimate Studio access middleware — Phase DE.1.1.
 * Chain: requireAuth → internal operator → requireHeadAccess(studio) → this pilot gate.
 */

import {
  isElite100EstimateStudioEnabled,
  isElite100EstimateStudioPilotUser
} from "./elite100EstimateStudioConfig.mjs";

/**
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
export function requireElite100EstimateStudioPilot(options = {}) {
  const env = options.env ?? process.env;
  return function elite100EstimateStudioPilotMiddleware(req, res, next) {
    try {
      if (!isElite100EstimateStudioEnabled(env)) {
        return res.status(404).json({ ok: false, error: "Not found" });
      }
      const u = req.user;
      if (!u || !u.id) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      // Reject spoofed identity claims on body/query/headers — auth user only.
      if (!isElite100EstimateStudioPilotUser(u, env)) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }
      return next();
    } catch {
      return res.status(500).json({ ok: false, error: "Access check failed" });
    }
  };
}
