/**
 * Internal stale-feed check (cron-secret gated). Vercel Cron invokes GET hourly.
 * GET|POST /api/internal/integration-feeds/stale-check[?notify=0]
 *
 * Reads feed run tables; writes only the per-org alert dedupe config row. No provider calls
 * other than the alert email.
 */

import { validateCronSecret } from "../takeoff/takeoffInternalRoutes.js";
import { runStaleFeedCheck } from "./integrationFeedFreshness.mjs";

export function attachIntegrationFeedRoutes(app, deps = {}) {
  const env = deps.env ?? process.env;

  async function handler(req, res) {
    res.set("Cache-Control", "no-store");
    const secretCheck = validateCronSecret(req, env);
    if (!secretCheck.ok) return res.status(secretCheck.status).json({ ok: false, error: secretCheck.error });

    const supabase = deps.getSupabase?.();
    if (!supabase) return res.status(503).json({ ok: false, error: "Supabase unavailable", code: "store_unavailable" });

    const notify = String(req.query?.notify ?? "1") !== "0";
    try {
      const result = await runStaleFeedCheck({ supabase, env, notify, sendEmail: deps.sendEmail });
      return res.status(200).json({ ok: true, notify, ...result });
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 500);
      console.error(JSON.stringify({ integration_feed_stale_check_failed: true, error: msg }));
      return res.status(500).json({ ok: false, error: "Stale-feed check failed.", code: "stale_check_failed" });
    }
  }

  app.get("/api/internal/integration-feeds/stale-check", handler);
  app.post("/api/internal/integration-feeds/stale-check", handler);
}
