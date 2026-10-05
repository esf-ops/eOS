/**
 * Estimate Builder head — authenticated ESF-only APIs (head slug `estimate_builder`).
 *
 * GET  /api/estimate-builder/catalog      item types, options, Elite 100 colors (no prices), templates
 * POST /api/estimate-builder/price        price an item document through production engines
 * POST /api/estimate-builder/save         save to Quote Library (quote_source estimate_builder)
 * GET  /api/estimate-builder/quotes       recent current-revision Estimate Builder quotes (org-scoped)
 * GET  /api/estimate-builder/quotes/:id   reopen a saved estimate document
 */

import express from "express";

import { logAction } from "../auth/auditLog.js";
import { resolveOrganizationContext, organizationScopeOrFilter, tableHasOrganizationId } from "../organizations/organizationContext.js";
import { fetchEliteProgramMaterialColors } from "../quotes/materialColorsCatalog.js";
import { assertInternalQuoteOperator } from "../quotes/partnerContext.js";
import { buildCustomerEstimatePdfFilename } from "../quoteDelivery/customerEstimatePrintSnapshot.js";
import { isMissingRelationError } from "../quotes/quotePersist.js";
import { buildEstimateBuilderCatalog } from "./estimateBuilderCatalog.mjs";
import { normalizeEstimateDocument } from "./estimateBuilderContracts.mjs";
import { priceEstimateDocument } from "./estimateBuilderPricing.mjs";
import { ESTIMATE_BUILDER_QUOTE_SOURCE, buildCustomerPrintSnapshot } from "./estimateBuilderQuoteLibrary.mjs";
import { estimateDocumentFromQuoteRow, fetchScopedEstimateBuilderQuote, processEstimateBuilderSave } from "./estimateBuilderSave.mjs";

const HEAD = "estimate_builder";
const jsonParser = express.json({ limit: "2mb" });
const COLOR_CACHE_MS = 5 * 60 * 1000;

/**
 * `/price` response: Brain pricing plus the customer preview snapshot and production PDF filename convention.
 * @param {Record<string, unknown>|undefined} body
 * @param {Array<Record<string, unknown>>} colors
 */
export async function buildEstimatePriceResponse(body, colors) {
  const doc = normalizeEstimateDocument(body?.document);
  const pricing = await priceEstimateDocument(doc, { materialColors: colors });
  const quoteNumber = String(body?.quoteNumber ?? "").trim();
  return {
    ...pricing,
    customerPreview: buildCustomerPrintSnapshot(doc, pricing, { quoteNumber: quoteNumber || "DRAFT" }),
    pdfFilename: buildCustomerEstimatePdfFilename(quoteNumber, String(body?.revisionLabel ?? "").trim() || null)
  };
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachEstimateBuilderRoutes(app, deps) {
  const { requireAuth, requireHeadAccess, getSupabase } = deps;
  const headGuard = requireHeadAccess(HEAD, { getSupabase });

  const rejectPartnerOnlyUser = async (req, res, next) => {
    try {
      await assertInternalQuoteOperator(req, getSupabase());
      next();
    } catch (e) {
      res.status(Number(e?.statusCode) || 403).json({ ok: false, error: String(e?.message || e), code: e?.code || "forbidden" });
    }
  };

  const stack = [requireAuth(), rejectPartnerOnlyUser, headGuard];

  /** Elite 100 color catalog is global (quote_pricing_rules material_color), same source as Internal Estimate. */
  let colorCache = { at: 0, colors: /** @type {Array<Record<string, unknown>>} */ ([]), warnings: /** @type {string[]} */ ([]) };
  async function materialColors() {
    if (colorCache.colors.length && Date.now() - colorCache.at < COLOR_CACHE_MS) return colorCache;
    const { colors, warnings } = await fetchEliteProgramMaterialColors(getSupabase());
    colorCache = { at: Date.now(), colors, warnings };
    return colorCache;
  }

  const fail = (res, e) => {
    if (isMissingRelationError(e)) {
      return res.status(503).json({ ok: false, installed: false, error: "Quote platform tables not installed." });
    }
    res.status(Number(e?.statusCode) || 500).json({ ok: false, error: String(e?.message || e) });
  };

  app.get("/api/estimate-builder/catalog", ...stack, async (_req, res) => {
    try {
      const { colors, warnings } = await materialColors();
      res.json(buildEstimateBuilderCatalog(colors, warnings));
    } catch (e) {
      fail(res, e);
    }
  });

  app.post("/api/estimate-builder/price", ...stack, jsonParser, async (req, res) => {
    try {
      const { colors } = await materialColors();
      res.json(await buildEstimatePriceResponse(req.body, colors));
    } catch (e) {
      fail(res, e);
    }
  });

  app.post("/api/estimate-builder/save", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const userEmail = String(req.user?.email || req.user?.id || "unknown");
      const { colors } = await materialColors();
      const result = await processEstimateBuilderSave(db, { body, userEmail, organizationContext: orgCtx, materialColors: colors });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({ ok: false, error: result.error, blockers: result.blockers ?? [], pricing: result.pricing ?? null });
      }
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: `estimate_builder_${result.saveMode}`,
        entityType: "quote",
        entityId: result.quoteId,
        metadata: {
          quote_source: ESTIMATE_BUILDER_QUOTE_SOURCE,
          quote_number: result.quoteNumber,
          quote_status: result.quoteStatus,
          revision_label: result.revisionLabel,
          item_count: result.pricing.totals.itemCount,
          grand_total: result.pricing.totals.total,
          organization_id: orgCtx.organizationId ?? null
        },
        req
      });
      res.json({
        ok: true,
        quote_id: result.quoteId,
        quote_number: result.quoteNumber,
        revision_number: result.revisionNumber,
        revision_label: result.revisionLabel,
        quote_status: result.quoteStatus,
        save_mode: result.saveMode,
        pricing: result.pricing
      });
    } catch (e) {
      fail(res, e);
    }
  });

  app.get("/api/estimate-builder/quotes", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const orgId = orgCtx.organizationId ? String(orgCtx.organizationId) : null;
      let qb = db
        .from("quote_headers")
        .select("id, quote_number, revision_label, quote_status, customer_name, account_name, project_name, grand_total, prepared_by, updated_at, created_at")
        .eq("quote_source", ESTIMATE_BUILDER_QUOTE_SOURCE)
        .neq("is_current_revision", false)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(25);
      if (orgId && (await tableHasOrganizationId(db, "quote_headers"))) {
        const filt = organizationScopeOrFilter(orgId);
        if (filt) qb = qb.or(filt);
      }
      const { data, error } = await qb;
      if (error) throw error;
      res.json({ ok: true, quotes: data ?? [] });
    } catch (e) {
      fail(res, e);
    }
  });

  app.get("/api/estimate-builder/quotes/:id", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const orgId = orgCtx.organizationId ? String(orgCtx.organizationId) : null;
      const hasOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;
      const row = await fetchScopedEstimateBuilderQuote(db, String(req.params.id), orgId, hasOrg);
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      const document = estimateDocumentFromQuoteRow(row);
      if (!document) return res.status(422).json({ ok: false, error: "Saved quote has no Estimate Builder document." });
      const { colors } = await materialColors();
      res.json({
        ok: true,
        quote: {
          id: row.id,
          quote_number: row.quote_number,
          revision_number: row.revision_number,
          revision_label: row.revision_label,
          quote_status: row.quote_status,
          is_current_revision: row.is_current_revision !== false,
          archived_at: row.archived_at ?? null,
          updated_at: row.updated_at
        },
        document,
        pricing: await priceEstimateDocument(document, { materialColors: colors }),
        savedPricing: row.calculation_snapshot?.estimate_builder?.pricing?.totals ?? null,
        saved: {
          grand_total: row.grand_total != null ? Number(row.grand_total) : null,
          customer_display_total: row.calculation_snapshot?.internal_ui?.customer_display_total ?? null,
          customer_print_snapshot: row.calculation_snapshot?.internal_ui?.customer_estimate_print_snapshot ?? null,
          pdf_filename: buildCustomerEstimatePdfFilename(String(row.quote_number ?? ""), row.revision_label ?? null)
        }
      });
    } catch (e) {
      fail(res, e);
    }
  });
}
