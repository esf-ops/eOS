/**
 * Custom Quote Tool — authenticated ESF-only APIs.
 * @see docs/quote-platform/custom-quote-tool-plan.md
 */

import express from "express";

import { logAction } from "../auth/auditLog.js";
import { assertInternalQuoteOperator } from "./partnerContext.js";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { calculateCustomQuote } from "./customQuoteCalculator.js";
import { processCustomQuoteSave } from "./customQuoteSave.js";
import { isMissingRelationError } from "./quotePersist.js";

const jsonParser = express.json({ limit: "2mb" });

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachCustomQuoteRoutes(app, deps) {
  const { requireAuth, requireHeadAccess, getSupabase } = deps;
  const headCustomQuote = requireHeadAccess("custom_quote", { getSupabase });

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

  const stack = [requireAuth(), rejectPartnerOnlyUser, headCustomQuote];

  app.post("/api/custom-quotes/calculate", ...stack, jsonParser, async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const calc = await calculateCustomQuote(body);

      await logAction({
        user: req.user,
        head: "custom_quote",
        actionType: "custom_quote_calculated",
        entityType: "quote_calculation",
        entityId: null,
        metadata: {
          quote_source: "custom_quote",
          pricing_mode: calc.pricingMode ?? null,
          sell_price: calc.sellPrice ?? null,
          project_sqft: calc.projectSqft ?? null,
          material_type: calc.input?.materialType ?? null
        },
        req
      });

      res.json(calc);
    } catch (e) {
      const status = Number(e?.statusCode) || 500;
      res.status(status).json({ ok: false, error: String(e?.message || e), code: e?.code || null });
    }
  });

  app.post("/api/custom-quotes/save", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const userEmail = String(req.user?.email || req.user?.id || "unknown");

      const { quoteId, quoteNumber, calc } = await processCustomQuoteSave(db, {
        body,
        userEmail,
        organizationContext: orgCtx
      });

      await logAction({
        user: req.user,
        head: "custom_quote",
        actionType: "custom_quote_saved",
        entityType: "quote",
        entityId: quoteId,
        metadata: {
          quote_source: "custom_quote",
          quote_number: quoteNumber,
          pricing_mode: calc.pricingMode ?? null,
          sell_price: calc.sellPrice ?? null,
          organization_id: orgCtx.organizationId ?? null
        },
        req
      });

      res.json({
        ok: true,
        quote_id: quoteId,
        quote_number: quoteNumber,
        quote_source: "custom_quote",
        quote_status: "draft",
        sell_price: calc.sellPrice ?? null,
        total_cost_basis: calc.totalCostBasis ?? null,
        project_sqft: calc.projectSqft ?? null,
        warnings: calc.warnings ?? []
      });
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({
          ok: false,
          installed: false,
          message: "Quote platform tables not installed. Apply backend-core/supabase/eos_quote_platform.sql."
        });
      }
      const status = Number(e?.statusCode) || 500;
      res.status(status).json({ ok: false, error: String(e?.message || e), code: e?.code || null });
    }
  });
}
