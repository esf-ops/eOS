/**
 * Partner Quote Foundation v1 — authenticated, partner-scoped APIs.
 */

import express from "express";

import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { calculateQuote } from "./quoteCalculator.js";
import { PartnerContextError, assertInternalQuoteOperator, resolvePartnerContext } from "./partnerContext.js";
import {
  buildPartnerPersistSnapshot,
  partnerRoleAllowsCalculate,
  partnerRoleAllowsSubmit,
  sanitizePartnerCalculateResponse,
  sanitizePartnerQuoteListRow
} from "./partnerQuoteSanitize.js";
import { generateQuoteNumber, isMissingRelationError, persistQuoteSubmission } from "./quotePersist.js";
import { tableHasOrganizationId } from "../organizations/organizationContext.js";

const jsonParser = express.json({ limit: "2mb" });

function partnerCapabilities(role) {
  return {
    can_view_quotes: true,
    can_calculate: partnerRoleAllowsCalculate(role),
    can_submit: partnerRoleAllowsSubmit(role)
  };
}

function handlePartnerError(res, e) {
  if (e instanceof PartnerContextError) {
    const body = { ok: false, error: e.message, code: e.code };
    if (e.details) body.details = e.details;
    return res.status(e.statusCode || 403).json(body);
  }
  const status = Number(e?.statusCode) || 500;
  if (status === 403) {
    return res.status(403).json({ ok: false, error: String(e?.message || e), code: e?.code || "forbidden" });
  }
  return res.status(500).json({ ok: false, error: String(e?.message || e) });
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachPartnerQuoteRoutes(app, { requireAuth, requireHeadAccess, getSupabase }) {
  const supabaseGetter = () => getSupabase();
  const requirePartnerHead = requireHeadAccess("partner_quote", { getSupabase });

  app.get("/api/partner-quote/context", requireAuth(), requirePartnerHead, async (req, res) => {
    try {
      const db = supabaseGetter();
      const ctx = await resolvePartnerContext(req, { supabase: db });
      const caps = partnerCapabilities(ctx.partnerRole);
      res.json({
        ok: true,
        organization: {
          id: ctx.organizationId,
          key: ctx.organizationKey,
          display_name: ctx.organizationDisplayName
        },
        partner_account: ctx.partnerAccount,
        branding: ctx.branding,
        pricing: ctx.pricingAssignment
          ? {
              structure_label: ctx.pricingAssignment.structure_name || ctx.pricingAssignment.structure_code,
              structure_code: ctx.pricingAssignment.structure_code,
              assignment_active: ctx.pricingAssignment.structure_active !== false
            }
          : { structure_label: null, structure_code: null, assignment_active: false },
        capabilities: caps
      });
    } catch (e) {
      return handlePartnerError(res, e);
    }
  });

  app.post("/api/partner-quote/calculate", requireAuth(), requirePartnerHead, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const ctx = await resolvePartnerContext(req, { supabase: db });
      if (!partnerRoleAllowsCalculate(ctx.partnerRole)) {
        return res.status(403).json({ ok: false, error: "Your partner role cannot run estimates.", code: "partner_role_forbidden" });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const calcInput = {
        ...body,
        quoteSource: "partner_quote",
        quote_source: "partner_quote",
        partnerAccountId: ctx.partnerAccountId
      };
      const calc = await calculateQuote(calcInput, { db });
      res.json(sanitizePartnerCalculateResponse(calc));
    } catch (e) {
      return handlePartnerError(res, e);
    }
  });

  app.post("/api/partner-quote/submit", requireAuth(), requirePartnerHead, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const ctx = await resolvePartnerContext(req, { supabase: db });
      if (!partnerRoleAllowsSubmit(ctx.partnerRole)) {
        return res.status(403).json({ ok: false, error: "Your partner role cannot submit quotes.", code: "partner_role_forbidden" });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const organizationContext = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const calcInput = {
        ...body,
        quoteSource: "partner_quote",
        quote_source: "partner_quote",
        partnerAccountId: ctx.partnerAccountId,
        partner_account_id: ctx.partnerAccountId
      };
      const calc = await calculateQuote(calcInput, { db });
      const quoteNumber = String(body.quote_number || "").trim() || generateQuoteNumber();
      const userEmail = String(req.user?.email || req.user?.id || "unknown");
      const userId = String(req.user?.id || "").trim();
      const snapshotToStore = buildPartnerPersistSnapshot(calc.snapshot, {
        partnerAccountId: ctx.partnerAccountId,
        organizationId: ctx.organizationId,
        createdByUserId: userId
      });

      const headerExtras = {
        partner_account_id: ctx.partnerAccountId,
        created_by_user_id: userId || null
      };

      const { quoteId } = await persistQuoteSubmission(db, {
        body: { ...body, partner_account_id: ctx.partnerAccountId },
        calc,
        userEmail,
        quoteNumber,
        quoteSource: "partner_quote",
        quoteStatus: "submitted",
        snapshotToStore,
        estimatesByGroup: null,
        assignment: null,
        publicResponsePayload: null,
        organizationContext,
        headerExtras
      });

      res.json({
        ok: true,
        quote_id: quoteId,
        quote_number: quoteNumber,
        quote_status: "submitted",
        estimate_total: calc.totals?.retail ?? null,
        estimated_sqft: calc.totals?.estimated_sqft ?? null
      });
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({
          ok: false,
          installed: false,
          message: "Quote platform tables not installed. Apply backend-core/supabase/eos_quote_platform.sql and partner_quote_foundation_v1_additive.sql."
        });
      }
      return handlePartnerError(res, e);
    }
  });

  app.get("/api/partner-quote/my-quotes", requireAuth(), requirePartnerHead, async (req, res) => {
    try {
      const db = supabaseGetter();
      const ctx = await resolvePartnerContext(req, { supabase: db });
      const hasOrgCol = await tableHasOrganizationId(db, "quote_headers");
      let q = db
        .from("quote_headers")
        .select(
          "id,quote_number,quote_status,customer_name,project_name,grand_total,estimated_sqft,created_at,updated_at,partner_account_id,quote_source,organization_id"
        )
        .eq("quote_source", "partner_quote")
        .eq("partner_account_id", ctx.partnerAccountId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (hasOrgCol) q = q.eq("organization_id", ctx.organizationId);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote headers not available." });
        }
        throw error;
      }
      const rows = (data || []).filter(
        (r) => String(r.partner_account_id) === ctx.partnerAccountId && String(r.quote_source) === "partner_quote"
      );
      res.json({
        ok: true,
        partner_account_id: ctx.partnerAccountId,
        quotes: rows.map(sanitizePartnerQuoteListRow)
      });
    } catch (e) {
      return handlePartnerError(res, e);
    }
  });
}
