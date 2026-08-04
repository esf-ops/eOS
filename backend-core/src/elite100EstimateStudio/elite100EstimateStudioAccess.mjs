/**
 * Elite 100 Estimate Studio access middleware — feature flag gate.
 * Chain: requireAuth → internal operator → requireHeadAccess(studio) → this.
 *
 * System Admin `user_head_access` (via requireHeadAccess) is the access source of
 * truth. Env pilot ID/email lists are advisory only and must not block users who
 * already passed head access — that mismatch hid the Home Launcher tile / API
 * after a legitimate grant.
 */

import { isElite100EstimateStudioEnabled } from "./elite100EstimateStudioConfig.mjs";

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
      // Head access already enforced upstream. Do not re-gate on env pilot lists.
      return next();
    } catch {
      return res.status(500).json({ ok: false, error: "Access check failed" });
    }
  };
}
