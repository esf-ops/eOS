/**
 * Estimate Builder head — authenticated ESF-only APIs (head slug `estimate_builder`).
 *
 * GET  /api/estimate-builder/catalog      item types, options, Elite 100 colors (no prices), templates, branch/rep directory
 * GET  /api/estimate-builder/qb-customers?q=  account type-ahead (org QuickBooks customer mirror)
 * POST /api/estimate-builder/price        price an item document through production engines
 * POST /api/estimate-builder/save         save to Quote Library (quote_source estimate_builder)
 * GET  /api/estimate-builder/quotes       recent current-revision Estimate Builder quotes (org-scoped)
 * GET  /api/estimate-builder/quotes/:id   reopen a saved estimate document
 * POST /api/estimate-builder/proposal/preview         proposal HTML for the open document (not persisted)
 * GET  /api/estimate-builder/quotes/:id/proposal      saved proposal snapshot → PDF (default) or ?format=html
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
import {
  ESTIMATE_PROPOSAL_VERSION,
  buildEstimateProposalPdfFilename,
  buildEstimateProposalSnapshot,
  renderEstimateProposalHtml
} from "./estimateBuilderProposal.mjs";
import {
  findQuickbooksCustomer,
  loadEstimatingDirectory,
  resolveHeaderQuickbooks,
  searchQuickbooksCustomers
} from "./estimateBuilderDirectory.mjs";
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
 * `/proposal/preview` response: proposal HTML for the open (possibly unsaved) document. Display only.
 * @param {Record<string, unknown>|undefined} body
 * @param {Array<Record<string, unknown>>} colors
 */
export async function buildEstimateProposalPreviewResponse(body, colors) {
  const doc = normalizeEstimateDocument(body?.document);
  const pricing = await priceEstimateDocument(doc, { materialColors: colors });
  const proposal = buildEstimateProposalSnapshot(doc, pricing, { quoteNumber: String(body?.quoteNumber ?? "").trim() });
  return {
    ok: true,
    html: renderEstimateProposalHtml(proposal),
    total: proposal.total,
    skippedIncomplete: proposal.skippedIncomplete,
    filename: buildEstimateProposalPdfFilename(proposal.header)
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

  const orgIdFor = async (req, db) => {
    const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
    return { orgCtx, orgId: orgCtx.organizationId ? String(orgCtx.organizationId) : null };
  };

  app.get("/api/estimate-builder/catalog", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const { colors, warnings } = await materialColors();
      const { orgId } = await orgIdFor(req, db);
      let directory;
      try {
        directory = await loadEstimatingDirectory(db, orgId);
      } catch (e) {
        console.warn("[estimate-builder] directory unavailable", { organizationId: orgId, error: String(e?.message || e) });
        directory = { configured: false, branches: [], salesReps: [], unavailable: true };
      }
      res.json({ ...buildEstimateBuilderCatalog(colors, warnings), directory });
    } catch (e) {
      fail(res, e);
    }
  });

  /** Account type-ahead over the org's QuickBooks customer mirror (top-level, active). */
  app.get("/api/estimate-builder/qb-customers", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const { orgId } = await orgIdFor(req, db);
      res.json({ ok: true, customers: await searchQuickbooksCustomers(db, orgId, String(req.query.q ?? "")) });
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
      const orgId = orgCtx.organizationId ? String(orgCtx.organizationId) : null;
      const resolveQuickbooks = async (header) => {
        const [directory, customer] = await Promise.all([
          loadEstimatingDirectory(db, orgId),
          findQuickbooksCustomer(db, orgId, header.qbCustomerListId)
        ]);
        return resolveHeaderQuickbooks(header, directory, customer);
      };
      const result = await processEstimateBuilderSave(db, {
        body,
        userEmail,
        organizationContext: orgCtx,
        materialColors: colors,
        resolveQuickbooks
      });
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
          quickbooks_ready: result.quickbooks?.ready ?? null,
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
        pricing: result.pricing,
        document: result.document,
        quickbooks: result.quickbooks ?? null
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
      const proposal = row.calculation_snapshot?.internal_ui?.estimate_builder_proposal ?? null;
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
        quickbooks: row.calculation_snapshot?.estimate_builder?.quickbooks ?? null,
        saved: {
          grand_total: row.grand_total != null ? Number(row.grand_total) : null,
          customer_display_total: row.calculation_snapshot?.internal_ui?.customer_display_total ?? null,
          customer_print_snapshot: row.calculation_snapshot?.internal_ui?.customer_estimate_print_snapshot ?? null,
          pdf_filename: buildCustomerEstimatePdfFilename(String(row.quote_number ?? ""), row.revision_label ?? null),
          has_proposal: Boolean(proposal),
          proposal_total: proposal ? Number(proposal.total) : null,
          proposal_filename: proposal ? buildEstimateProposalPdfFilename(proposal.header) : null
        }
      });
    } catch (e) {
      fail(res, e);
    }
  });

  /** Live proposal preview for the open (possibly unsaved) document. Display only; never persisted. */
  app.post("/api/estimate-builder/proposal/preview", ...stack, jsonParser, async (req, res) => {
    try {
      const { colors } = await materialColors();
      res.json(await buildEstimateProposalPreviewResponse(req.body, colors));
    } catch (e) {
      fail(res, e);
    }
  });

  /** Saved proposal (from the snapshot stored at save time) as HTML or PDF. */
  app.get("/api/estimate-builder/quotes/:id/proposal", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const orgId = orgCtx.organizationId ? String(orgCtx.organizationId) : null;
      const hasOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;
      const row = await fetchScopedEstimateBuilderQuote(db, String(req.params.id), orgId, hasOrg);
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      const proposal = row.calculation_snapshot?.internal_ui?.estimate_builder_proposal;
      if (!proposal || proposal.version !== ESTIMATE_PROPOSAL_VERSION) {
        return res.status(409).json({ ok: false, error: "This quote was saved before proposals existed. Open it and save again to generate one." });
      }
      const html = renderEstimateProposalHtml(proposal);
      const filename = buildEstimateProposalPdfFilename(proposal.header);
      if (String(req.query.format ?? "pdf") === "html") {
        return res.json({ ok: true, html, total: proposal.total, filename });
      }
      const { renderHtmlToPdfBytes } = await import("../quoteDelivery/customerEstimatePdfBuilder.js");
      const pdf = await renderHtmlToPdfBytes(html);
      if (!pdf.ok) {
        console.warn("[estimate-builder] proposal pdf failed", { quoteId: row.id, reason: pdf.reason });
        return res.status(503).json({ ok: false, error: "PDF generation is unavailable right now.", reason: pdf.reason });
      }
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "estimate_builder_proposal_pdf",
        entityType: "quote",
        entityId: row.id,
        metadata: {
          quote_number: row.quote_number,
          proposal_total: proposal.total,
          byte_length: pdf.buffer.length,
          organization_id: orgCtx.organizationId ?? null
        },
        req
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(pdf.buffer);
    } catch (e) {
      fail(res, e);
    }
  });
}
