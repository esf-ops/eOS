import express from "express";

import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { calculateQuote, computePublicConsumerEstimatesByGroup, roundPublicEstimateToNearestTen } from "./quoteCalculator.js";
import { attachQuoteDeliveryRoutes } from "../quoteDelivery/quoteDeliveryApi.js";
import { maybeAttachDigitalEstimateRoutes } from "../digitalEstimate/digitalEstimateRoutes.js";
import { maybeAttachElite100EstimateStudioRoutes } from "../elite100EstimateStudio/elite100EstimateStudioRoutes.js";
import { attachInternalQuoteRoutes } from "./internalQuotesApi.js";
import { attachCustomQuoteRoutes } from "./customQuotesApi.js";
import { attachPartnerQuoteRoutes } from "./partnerQuotesApi.js";
import { assertInternalQuoteOperator } from "./partnerContext.js";
import { attachQuoteLibraryRoutes } from "./quoteLibraryApi.js";
import { attachPricingAdminHeadApi } from "./pricingAdminHeadApi.js";
import { attachQuotePricingAdminApi } from "./quotePricingAdminApi.js";
import { attachQuotePipelineRoutes } from "./quotePipelineApi.js";
import { assignSalesRepForPublicQuote } from "./quoteTerritoryAssignment.js";
import { generateQuoteNumber, isMissingRelationError, persistQuoteSubmission } from "./quotePersist.js";

const jsonParser = express.json({ limit: "2mb" });

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function sanitizePublicCalculateResponse(calcResult) {
  const snap = calcResult.snapshot && typeof calcResult.snapshot === "object" ? { ...calcResult.snapshot } : {};
  delete snap.inputSummary;
  delete snap.measurement_source;
  delete snap.quoteInputMode;
  delete snap.lineItems;
  return {
    ok: true,
    display: "public_retail_safe",
    totals: {
      retail: calcResult.totals?.retail,
      estimated_sqft: calcResult.totals?.estimated_sqft
    },
    snapshot: snap,
    warnings: calcResult.warnings || []
  };
}

function buildPublicConsumerSnapshot(estimatesByGroup, calc, warnings) {
  const rows = Array.isArray(estimatesByGroup) ? estimatesByGroup : [];
  const promo = rows.find((r) => String(r.group || "").trim() === "Group Promo");
  const exact = promo != null && promo.total != null ? Number(promo.total) : null;
  const display =
    promo != null
      ? Number(promo.total_display ?? (exact != null ? roundPublicEstimateToNearestTen(exact) : NaN))
      : null;
  return {
    version: 1,
    public_safe: true,
    quote_source: "public_consumer",
    estimates_by_group: rows,
    totals: {
      retail_planning_promo_exact: Number.isFinite(exact) ? exact : null,
      retail_planning_promo_display: Number.isFinite(display) ? display : null,
      retail_planning: Number.isFinite(display) ? display : Number.isFinite(exact) ? exact : calc?.totals?.retail ?? null,
      estimated_sqft: calc?.totals?.estimated_sqft ?? null
    },
    warnings: [...(warnings || []), ...(calc?.warnings || [])]
  };
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachQuoteRoutes(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  const supabaseGetter = () => getSupabase();

  app.post("/api/public-quote/calculate", jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const multi = await computePublicConsumerEstimatesByGroup(body, { db });
      const input = body;
      const ctSf = Number(input.areas?.countertopSqft ?? input.countertopSqft ?? 0) || 0;
      const bsSf = Number(input.areas?.backsplashSqft ?? input.backsplashSqft ?? 0) || 0;
      const promo = multi.estimates_by_group?.find((r) => String(r.group || "").trim() === "Group Promo");
      res.json({
        ok: true,
        quote_source: "public_consumer",
        totals: {
          retail_planning: promo ? Number(promo.total_display ?? promo.total) : 0,
          retail_planning_promo_exact: promo?.total ?? null,
          retail_planning_promo_display: promo?.total_display ?? null,
          estimated_sqft: round2(ctSf + bsSf)
        },
        estimates_by_group: multi.estimates_by_group,
        warnings: multi.warnings || [],
        applied_retail_markup_percent: multi.appliedRetailMarkupPercent
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/public-quote/submit-measurements", jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const organizationContext = await resolveOrganizationContext({ req, supabase: db, mode: "public" });
      const pricingContext = { db };
      const multi = await computePublicConsumerEstimatesByGroup(body, pricingContext);
      const calc = await calculateQuote({ ...body, quoteSource: "public_retail", materialGroup: "Group Promo" }, pricingContext);
      const quoteNumber = String(body.quote_number || "").trim() || generateQuoteNumber();
      const userEmail = String(body.customer_email || "public_web").trim() || "public_web";

      const assignment = await assignSalesRepForPublicQuote({
        zip: body.zip,
        city: body.city,
        county: body.county,
        state: body.state,
        branch: body.branch,
        organizationId: organizationContext.organizationId,
        db
      });

      const snapshotToStore = buildPublicConsumerSnapshot(multi.estimates_by_group, calc, multi.warnings);

      const publicResponsePayload = {
        ok: true,
        thank_you: true,
        quote_number: quoteNumber,
        branch_display: assignment.branch || "Elite team",
        estimates_by_group: multi.estimates_by_group,
        warnings: multi.warnings || []
      };

      let quoteId;
      let mondaySync = null;
      try {
        const saved = await persistQuoteSubmission(db, {
          body,
          calc,
          userEmail,
          quoteNumber,
          quoteSource: "public_consumer",
          quoteStatus: "lead_submitted",
          snapshotToStore,
          estimatesByGroup: multi.estimates_by_group,
          assignment,
          publicResponsePayload,
          organizationContext
        });
        quoteId = saved.quoteId;
        mondaySync = saved.mondaySync;
      } catch (e) {
        if (isMissingRelationError(e)) {
          return res.status(503).json({
            ok: false,
            installed: false,
            message: "Quote platform tables not installed. Apply backend-core/supabase migrations."
          });
        }
        throw e;
      }

      const warningsOut = [...(multi.warnings || [])];
      if (mondaySync?.warning) {
        warningsOut.push(mondaySync.warning);
      }

      res.json({
        ok: true,
        quote_source: "public_consumer",
        quoteId,
        quote_number: quoteNumber,
        message: "Thank you — your measurements were received.",
        branch_display: assignment.branch || "Elite team",
        sales_rep: assignment.assigned_sales_rep || null,
        estimates_by_group: multi.estimates_by_group,
        warnings: warningsOut,
        monday_item_id: mondaySync?.monday_item_id || null,
        monday_board_id: mondaySync?.monday_board_id || null,
        monday_sync_status: mondaySync?.status || null
      });
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({
          ok: false,
          installed: false,
          message: "Quote platform tables not installed."
        });
      }
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/internal-quote/submit", requireAuth(), jsonParser, async (_req, res) => {
    res.status(501).json({
      ok: false,
      notImplemented: true,
      message:
        "POST /api/internal-quote/submit is scaffolded. Use POST /api/quote/submit with quote_source internal_quote until this route is completed. See docs/quote-platform/three-head-quote-architecture.md."
    });
  });

  const blockPartnerOnlyOnGenericQuote = async (req, res, next) => {
    try {
      await assertInternalQuoteOperator(req, supabaseGetter());
      next();
    } catch (e) {
      res.status(Number(e?.statusCode) || 403).json({
        ok: false,
        error: String(e?.message || e),
        code: e?.code || "forbidden"
      });
    }
  };

  app.post("/api/quote/calculate", requireAuth(), blockPartnerOnlyOnGenericQuote, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const pricingContext = { db };
      const calc = await calculateQuote(body, pricingContext);
      if (String(body.quoteSource || body.quote_source) === "public_retail") {
        return res.json(sanitizePublicCalculateResponse(calc));
      }
      res.json(calc);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/quote/submit", requireAuth(), blockPartnerOnlyOnGenericQuote, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const organizationContext = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const pricingContext = { db };
      const calc = await calculateQuote(body, pricingContext);
      const quoteNumber = String(body.quote_number || "").trim() || generateQuoteNumber();
      const userEmail = String(req.user?.email || req.user?.id || "unknown");
      const quoteSource = String(body.quoteSource || body.quote_source || "partner_portal");

      try {
        const { quoteId } = await persistQuoteSubmission(db, {
          body,
          calc,
          userEmail,
          quoteNumber,
          quoteSource,
          quoteStatus: "submitted",
          snapshotToStore: calc.snapshot,
          estimatesByGroup: null,
          assignment: null,
          publicResponsePayload: null,
          organizationContext
        });
        res.json({ ok: true, quoteId, quoteNumber, totals: calc.totals, snapshot: calc.snapshot });
      } catch (e) {
        if (isMissingRelationError(e)) {
          return res.status(503).json({
            ok: false,
            installed: false,
            message: "Quote platform tables not installed. Apply backend-core/supabase/eos_quote_platform.sql."
          });
        }
        throw e;
      }
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({
          ok: false,
          installed: false,
          message: "Quote platform tables not installed. Apply backend-core/supabase/eos_quote_platform.sql."
        });
      }
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  attachQuotePipelineRoutes(app, { requireAuth, requireRole, requireHeadAccess, getSupabase });
  attachPartnerQuoteRoutes(app, { requireAuth, requireHeadAccess, getSupabase });
  attachInternalQuoteRoutes(app, { requireAuth, requireHeadAccess, getSupabase });
  attachCustomQuoteRoutes(app, { requireAuth, requireHeadAccess, getSupabase });
  attachQuoteLibraryRoutes(app, { requireAuth, requireHeadAccess, getSupabase });
  attachQuoteDeliveryRoutes(app, { requireAuth, getSupabase });
  maybeAttachDigitalEstimateRoutes(app, { requireAuth, getSupabase });
  maybeAttachElite100EstimateStudioRoutes(app, { requireAuth, getSupabase });
  attachQuotePricingAdminApi(app, { requireAuth, requireRole, requireHeadAccess, getSupabase });
  attachPricingAdminHeadApi(app, { requireAuth, requireRole, requireHeadAccess, getSupabase });

  console.log(
    "[quotes] mounted POST /api/public-quote/calculate, POST /api/public-quote/submit-measurements, GET/POST /api/partner-quote/*, POST /api/quote/calculate, POST /api/quote/submit, /api/internal-quotes/*, /api/custom-quotes/*, /api/quote-library/*, POST /api/quote-delivery/quotes/:quoteId/preview|send; digital-estimate flag-gated; quote pipeline GET/PATCH /api/quotes/pipeline*; admin quote APIs via quotePricingAdminApi.js; Pricing Admin head via pricingAdminHeadApi.js"
  );
}
