/**
 * Elite 100 Quote Flow Brain API — Slice 1A shell stub.
 * No inbox/takeoff/set-scope/pricing/publish behavior yet.
 */

import { assertInternalQuoteOperator } from "../quotes/partnerContext.js";
import { requireHeadAccess } from "../auth/headAccessMiddleware.js";
import { requireElite100QuoteFlowEnabled } from "./elite100QuoteFlowAccess.mjs";
import {
  ELITE100_QUOTE_FLOW_HEAD_SLUG,
  isElite100QuoteFlowEnabled,
  readSafeElite100QuoteFlowConfig
} from "./elite100QuoteFlowConfig.mjs";

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function maybeAttachElite100QuoteFlowRoutes(app, deps) {
  const env = deps.env ?? process.env;
  if (!isElite100QuoteFlowEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }
  return attachElite100QuoteFlowRoutes(app, deps);
}

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function attachElite100QuoteFlowRoutes(app, deps) {
  const { requireAuth, getSupabase } = deps;
  const env = deps.env ?? process.env;

  if (!isElite100QuoteFlowEnabled(env)) {
    return { mounted: false, reason: "flag_off" };
  }

  const rejectPartnerOnlyUser = async (req, res, next) => {
    try {
      await assertInternalQuoteOperator(req, getSupabase());
      next();
    } catch (e) {
      res.status(Number(e?.statusCode) || 403).json({
        ok: false,
        error: "Forbidden",
        code: e?.code || "forbidden"
      });
    }
  };

  const staffStack = [
    requireAuth(),
    rejectPartnerOnlyUser,
    requireHeadAccess(ELITE100_QUOTE_FLOW_HEAD_SLUG, { getSupabase }),
    requireElite100QuoteFlowEnabled({ env })
  ];

  app.get("/api/elite100-quote-flow/health", ...staffStack, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      shell: "slice-1a",
      headSlug: ELITE100_QUOTE_FLOW_HEAD_SLUG
    });
  });

  app.get("/api/elite100-quote-flow/config", ...staffStack, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      config: readSafeElite100QuoteFlowConfig(env)
    });
  });

  console.log(
    "[elite100-quote-flow] mounted GET /api/elite100-quote-flow/health|config (Slice 1A shell)"
  );
  return { mounted: true, reason: "ok" };
}
