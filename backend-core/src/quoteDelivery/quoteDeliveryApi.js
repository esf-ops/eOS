/**
 * Quote Delivery HTTP routes — preview and env-gated send.
 */

import express from "express";

import { isDealerSafeHeadSlug, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { resolveHeadAccessContext } from "../me/launcherHeads.js";
import { assertInternalQuoteOperator } from "../quotes/partnerContext.js";
import { runQuoteDelivery } from "./quoteDeliveryService.js";

const jsonParser = express.json({ limit: "512kb" });

const HEAD_ACCESS_DENIED = Object.freeze({
  ok: false,
  error: "You do not have access to this head."
});

const QUOTE_DELIVERY_HEADS = new Set(["quote", "quote_library"]);

/**
 * Allow Internal Estimate (`quote`) or Quote Library (`quote_library`) head grants.
 * @param {{ getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} options
 */
function requireQuoteDeliveryHeadAccess(options = {}) {
  const getSupabase = options.getSupabase;
  if (typeof getSupabase !== "function") {
    throw new Error("requireQuoteDeliveryHeadAccess: options.getSupabase must be a function");
  }

  return async function quoteDeliveryHeadMiddleware(req, res, next) {
    try {
      const u = req.user;
      if (!u || !u.id) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      if (u.isActive === false) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }

      const role = String(u.role ?? "").trim();
      if (role === "admin" || role === "super_admin") {
        return next();
      }

      const supabase = getSupabase();
      const ctx = await resolveHeadAccessContext(supabase, u);
      if (!ctx.ok || !ctx.active) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }

      if (ctx.dealer && ![...QUOTE_DELIVERY_HEADS].some((slug) => isDealerSafeHeadSlug(slug))) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }

      const hasGrant = [...QUOTE_DELIVERY_HEADS].some((slug) => {
        if (!isKnownHeadSlug(slug)) return false;
        return ctx.actionableGrantSet.has(slug);
      });

      if (!hasGrant) {
        return res.status(403).json(HEAD_ACCESS_DENIED);
      }

      return next();
    } catch (e) {
      console.error("requireQuoteDeliveryHeadAccess failed", e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  };
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachQuoteDeliveryRoutes(app, deps) {
  const { requireAuth, getSupabase } = deps;

  const rejectPartnerOnlyUser = async (req, res, next) => {
    try {
      await assertInternalQuoteOperator(req, getSupabase());
      next();
    } catch (e) {
      res.status(Number(e?.statusCode) || 403).json({
        ok: false,
        error: String(e?.message || e),
        code: e?.code || "forbidden"
      });
    }
  };

  const stack = [requireAuth(), rejectPartnerOnlyUser, requireQuoteDeliveryHeadAccess({ getSupabase })];

  app.post("/api/quote-delivery/quotes/:quoteId/preview", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const quoteId = String(req.params.quoteId || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await runQuoteDelivery(db, req, quoteId, body, { mode: "preview" });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json(result);
      }
      res.json(result);
    } catch (e) {
      console.error("[quote-delivery] preview failed", e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/quote-delivery/quotes/:quoteId/send", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const quoteId = String(req.params.quoteId || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await runQuoteDelivery(db, req, quoteId, body, { mode: "send" });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json(result);
      }
      res.json(result);
    } catch (e) {
      console.error("[quote-delivery] send failed", e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
