/**
 * Internal Quote Tool — authenticated APIs (eliteOS Brain / Supabase).
 * @see docs/quote-platform/internal-quote-test-plan.md
 */

import express from "express";

import { logAction } from "../auth/auditLog.js";
import { assertInternalQuoteOperator } from "./partnerContext.js";
import {
  buildInternalEstimateSummaryForMonday,
  internalMondayColumnMappingConfigured,
  introspectInternalMondayBoard,
  resolveEstimatorDisplayNameFromDb
} from "../integrations/mondayQuoteSync.js";
import {
  mergeRowOrganizationId,
  organizationScopeOrFilter,
  resolveOrganizationContext,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";
import { calculateQuote } from "./quoteCalculator.js";
import { fetchEliteProgramMaterialColors } from "./materialColorsCatalog.js";
import * as esf from "./quoteEsfNumber.js";
import { validateInternalQuotePatchContext } from "./internalQuotePatchPolicy.js";
import { processInternalQuoteSave } from "./internalQuoteSave.js";
import { restoreInternalQuoteAsNewRevision } from "./internalQuoteRestore.js";
import { generateQuoteNumber, isMissingRelationError } from "./quotePersist.js";
import { importInternalEstimateFromTakeoff } from "./internalQuoteTakeoffImport.mjs";
import { detachTakeoffImportFromQuote } from "./internalQuoteTakeoffDetach.mjs";
import {
  appendTakeoffImportAuditEvent,
  takeoffImportContextFromSaveBody,
} from "./internalQuoteTakeoffAudit.mjs";
import { isActiveTakeoffImport } from "./internalQuoteTakeoffImportChecklist.mjs";


const jsonParser = express.json({ limit: "2mb" });

const INTERNAL_STATUSES = new Set([
  "draft",
  "testing_review",
  "sent",
  "follow_up",
  "revised",
  "sold",
  "lost",
  "archived",
  "submitted"
]);

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function buildInternalEstimateSummary(calc, body, snapshotToStore) {
  return buildInternalEstimateSummaryForMonday({
    calc,
    body,
    snapshot: snapshotToStore
  });
}

function pricingModeLabel(body) {
  const m = String(body.internalMaterialBasis || body.internal_material_basis || "wholesale").toLowerCase();
  return m === "direct" ? "Direct" : "Wholesale";
}

async function loadInternalOrgScope(db, req) {
  const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
  const orgId = orgCtx.organizationId;
  const hasQuoteHeadersOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;
  return { orgCtx, orgId, hasQuoteHeadersOrg };
}

function applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg) {
  if (!orgId || !hasQuoteHeadersOrg) return qb;
  const filt = organizationScopeOrFilter(orgId);
  return filt ? qb.or(filt) : qb;
}

async function loadExistingTakeoffImport(db, quoteId, orgId, hasQuoteHeadersOrg) {
  if (!isUuid(quoteId)) return null;
  let qb = db
    .from("quote_headers")
    .select("calculation_snapshot")
    .eq("id", quoteId)
    .eq("quote_source", "internal_quote")
    .limit(1);
  qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
  const { data, error } = await qb;
  if (error || !data?.[0]) return null;
  const snap = data[0].calculation_snapshot;
  const iu = snap?.internal_ui;
  return iu?.takeoff_import ?? null;
}

function resolveTakeoffImportBlock(body, existingTakeoffImport) {
  const incoming = body.takeoff_import ?? body.takeoffImport ?? null;
  if (incoming && typeof incoming === "object") return incoming;
  return existingTakeoffImport ?? null;
}

function listRow(r) {
  return {
    id: r.id,
    quote_number: r.quote_number,
    revision_number: r.revision_number ?? null,
    revision_label: r.revision_label ?? null,
    quote_number_base: r.quote_number_base ?? null,
    quote_family_root_id: r.quote_family_root_id ?? null,
    is_current_revision: r.is_current_revision ?? null,
    archived_at: r.archived_at ?? null,
    customer_name: r.customer_name,
    project_name: r.project_name,
    city: r.city,
    state: r.state,
    sales_rep: r.sales_rep,
    branch: r.branch,
    entered_by: r.prepared_by,
    quote_source: r.quote_source,
    quote_status: r.quote_status,
    grand_total: r.grand_total,
    estimated_sqft: r.estimated_sqft,
    created_at: r.created_at,
    updated_at: r.updated_at,
    monday_item_id: r.monday_item_id,
    monday_board_id: r.monday_board_id
  };
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachInternalQuoteRoutes(app, deps) {
  const { requireAuth, requireHeadAccess, getSupabase } = deps;
  const headQuote = requireHeadAccess("quote", { getSupabase });
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
  /** Partner users blocked before head check so 403 always uses partner_use_partner_routes (not head-only denial). */
  const stack = [requireAuth(), rejectPartnerOnlyUser, headQuote];

  app.post("/api/internal-quotes/calculate", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const calc = await calculateQuote({ ...body, quoteSource: "internal_quote" }, { db });
      const takeoffCtx = takeoffImportContextFromSaveBody(body);
      await logAction({
        user: req.user,
        head: "quote",
        actionType: takeoffCtx ? "quote_calculated_from_takeoff_import" : "internal_quote_calculated",
        entityType: "quote_calculation",
        entityId: body.quote_id ?? body.quoteId ?? null,
        metadata: takeoffCtx
          ? {
              ...takeoffCtx,
              engine: body.engine ?? null,
              estimated_sqft: calc.totals?.estimated_sqft ?? null,
              internal_material_basis: body.internalMaterialBasis ?? body.internal_material_basis ?? null,
            }
          : {
              engine: body.engine ?? null,
              estimated_sqft: calc.totals?.estimated_sqft ?? null,
              internal_material_basis: body.internalMaterialBasis ?? body.internal_material_basis ?? null,
            },
        req,
      });
      res.json({ ok: true, ...calc });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/internal-quotes/save", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const organizationContext = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const orgId = organizationContext.organizationId;
      const hasQuoteHeadersOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;
      const existingQuoteId = String(body.quote_id ?? body.quoteId ?? "").trim();
      const existingTakeoffImport =
        existingQuoteId && isUuid(existingQuoteId)
          ? await loadExistingTakeoffImport(db, existingQuoteId, orgId, hasQuoteHeadersOrg)
          : null;
      let takeoffImportBlock = resolveTakeoffImportBlock(body, existingTakeoffImport);
      const takeoffChecklist =
        body.takeoff_import_checklist ?? body.takeoffImportChecklist ?? null;
      if (isActiveTakeoffImport(takeoffImportBlock)) {
        takeoffImportBlock = appendTakeoffImportAuditEvent(takeoffImportBlock, {
          type: "quote_saved_from_takeoff_import",
          userId: req.user?.id ?? null,
          userEmail: String(req.user?.email || req.user?.id || "unknown"),
          metadata: { quoteId: existingQuoteId || null },
        });
      }

      const calc = await calculateQuote({ ...body, quoteSource: "internal_quote" }, { db });
      const userEmail = String(req.user?.email || req.user?.id || "unknown");

      const customerDisplayTotal = (() => {
        const cdt = Number(body.customerDisplayTotal ?? body.customer_display_total);
        return Number.isFinite(cdt) && cdt > 0 ? Math.round(cdt) : null;
      })();
      const printSnapshotRaw =
        body.customerEstimatePrintSnapshot ?? body.customer_estimate_print_snapshot ?? null;
      if (printSnapshotRaw != null && typeof printSnapshotRaw !== "object") {
        return res.status(400).json({
          ok: false,
          error: "customer_estimate_print_snapshot must be an object when provided"
        });
      }
      if (printSnapshotRaw) {
        const finalRounded = Math.round(Number(printSnapshotRaw.finalRounded));
        if (!Number.isFinite(finalRounded) || finalRounded <= 0) {
          return res.status(400).json({
            ok: false,
            error: "customer_estimate_print_snapshot.finalRounded is invalid"
          });
        }
        if (customerDisplayTotal != null && finalRounded !== customerDisplayTotal) {
          return res.status(400).json({
            ok: false,
            error: `customer_estimate_print_snapshot.finalRounded (${finalRounded}) must equal customer_display_total (${customerDisplayTotal})`
          });
        }
      }

      const snapshotToStore = {
        ...calc.snapshot,
        internal_ui_version: 1,
        internal_ui: {
          quote_workflow: body.quote_workflow ?? null,
          internal_material_basis: body.internalMaterialBasis ?? body.internal_material_basis ?? null,
          material_program_default: "elite_100",
          custom_passthrough_items: body.customPassthroughItems ?? body.custom_pass_through_items ?? [],
          custom_line_items: body.customLineItems ?? body.custom_line_items ?? [],
          quote_default_material: body.quoteDefaultMaterial ?? body.quote_default_material ?? null,
          estimate_rooms: body.rooms ?? null,
          readiness: body.readiness ?? null,
          file_checklist: body.fileChecklist ?? body.file_checklist ?? null,
          entered_by: body.entered_by ?? body.prepared_by ?? null,
          preparedByLegacy: body.preparedBy ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          project_name: body.project_name ?? null,
          job_info: body.job_info && typeof body.job_info === "object" ? body.job_info : null,
          customer_estimate_display_groups: Array.isArray(body.customerEstimateDisplayGroups)
            ? body.customerEstimateDisplayGroups
            : Array.isArray(body.customer_estimate_display_groups)
              ? body.customer_estimate_display_groups
              : [],
          customer_estimate_comparison_color_labels:
            body.customerEstimateComparisonColorLabels &&
            typeof body.customerEstimateComparisonColorLabels === "object"
              ? body.customerEstimateComparisonColorLabels
              : body.customer_estimate_comparison_color_labels &&
                  typeof body.customer_estimate_comparison_color_labels === "object"
                ? body.customer_estimate_comparison_color_labels
                : {},
          customer_estimate_customer_facing_notes: (() => {
            const raw =
              body.customerFacingNotes ??
              body.customer_facing_notes ??
              body.customer_estimate_customer_facing_notes;
            if (raw == null) return null;
            const trimmed = String(raw).trim();
            return trimmed || null;
          })(),
          estimate_room_drafts: body.estimateRoomDrafts ?? body.estimate_room_drafts ?? null,
          color_tbd: Boolean(body.colorTbd ?? body.color_tbd),
          use_tax_percent: Math.max(0, Number(body.useTaxPercent ?? body.use_tax_percent ?? 0) || 0),
          customer_room_area_breakdown:
            body.customerRoomAreaBreakdown ?? body.customer_room_area_breakdown ?? null,
          /** Customer-facing Estimated project total = sum of rounded visible Estimate Summary rows.
           * Matches CustomerEstimatePrint.finalRounded. Preferred by Quote Library over grand_total. */
          customer_display_total: customerDisplayTotal,
          customer_estimate_print_snapshot:
            printSnapshotRaw && typeof printSnapshotRaw === "object" ? printSnapshotRaw : null,
          takeoff_import: takeoffImportBlock,
          takeoff_import_checklist: takeoffChecklist,
        },
      };
      const internalEstimateSummary = buildInternalEstimateSummary(calc, body, snapshotToStore);
      const estimatorDisplayName = await resolveEstimatorDisplayNameFromDb(db, req, body);
      const pMode = pricingModeLabel(body);
      const warnings = [...(calc.warnings || [])];
      if (!internalMondayColumnMappingConfigured() && String(process.env.MONDAY_INTERNAL_QUOTES_BOARD_ID || "").trim()) {
        warnings.push(
          "Monday internal column env vars are not set — item may sync as name-only until MONDAY_INTERNAL_COL_* are configured."
        );
      } else if (!String(process.env.MONDAY_INTERNAL_QUOTES_BOARD_ID || "").trim()) {
        warnings.push("MONDAY_INTERNAL_QUOTES_BOARD_ID is not set — Monday internal sync skipped (quote still saved).");
      }

      try {
        const result = await processInternalQuoteSave({
          db,
          body,
          calc,
          organizationContext,
          userEmail,
          snapshotToStore,
          internalEstimateSummary,
          pricingModeLabel: pMode,
          estimatorDisplayName,
          internalStatuses: INTERNAL_STATUSES
        });
        if (!result.ok) {
          return res.status(result.httpStatus || 400).json({ ok: false, error: result.error });
        }
        const quoteId = result.quoteId;
        const quoteNumber = result.quote_number;
        const mondaySync = {
          status: result.monday_sync_status,
          monday_item_id: result.monday_item_id
        };
        // monday_sync_warning not yet returned by processInternalQuoteSave — defer propagation
        const saveMode = String(result.save_mode ?? "").trim();
        await logAction({
          user: req.user,
          head: "quote",
          actionType:
            saveMode === "save_revision"
              ? "internal_quote_revision_created"
              : saveMode === "update_existing"
                ? "internal_quote_updated"
                : saveMode === "save_as_new_quote"
                  ? "internal_quote_saved_as_new"
                  : "internal_quote_created",
          entityType: "quote_header",
          entityId: quoteId,
          entityLabel: quoteNumber,
          metadata: {
            save_mode: saveMode || null,
            quote_number: quoteNumber,
            revision_number: result.revision_number ?? null,
            revision_label: result.revision_label ?? null
          },
          req
        });
        res.json({
          ok: true,
          quoteId,
          quote_id: quoteId,
          quote_number: quoteNumber,
          revision_number: result.revision_number ?? null,
          revision_label: result.revision_label ?? null,
          quote_family_root_id: result.quote_family_root_id ?? null,
          quote_number_base: result.quote_number_base ?? null,
          is_current_revision:
            result.is_current_revision !== undefined ? result.is_current_revision : null,
          save_mode: result.save_mode ?? null,
          totals: calc.totals,
          snapshot: snapshotToStore,
          monday_sync_status: mondaySync?.status ?? null,
          monday_item_id: mondaySync?.monday_item_id ?? null,
          warnings
        });
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
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/internal-quotes/monday/board-schema", ...stack, async (req, res) => {
    try {
      const result = await introspectInternalMondayBoard();
      if (!result.ok) {
        const msg =
          result.error === "missing_config"
            ? "MONDAY_API_TOKEN and MONDAY_INTERNAL_QUOTES_BOARD_ID must be set on the server."
            : "Could not load Monday board schema.";
        return res.status(result.error === "missing_config" ? 400 : 502).json({ ok: false, error: msg });
      }
      const schema = result.schema;
      res.json({
        ok: true,
        board_id: schema.boardId,
        board_name: schema.boardName,
        columns: schema.columns.map((c) => ({ id: c.id, title: c.title, type: c.type })),
        groups: schema.groups,
        resolved_column_map: result.resolved,
        env_mapping_configured: internalMondayColumnMappingConfigured()
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/internal-quotes/material-colors", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const result = await fetchEliteProgramMaterialColors(db);
      res.json({ ok: true, colors: result.colors, warnings: result.warnings || [] });
    } catch (e) {
      res.status(500).json({ ok: false, colors: [], warnings: [String(e?.message || e)], error: String(e?.message || e) });
    }
  });

  app.get("/api/internal-quotes", ...stack, async (req, res) => {
    try {
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadInternalOrgScope(db, req);
      let qb = db
        .from("quote_headers")
        .select(
          "id,quote_number,revision_number,revision_label,quote_number_base,quote_family_root_id,is_current_revision,archived_at,quote_source,quote_status,customer_name,project_name,city,state,sales_rep,branch,prepared_by,grand_total,estimated_sqft,created_at,updated_at,monday_item_id,monday_board_id"
        )
        .eq("quote_source", "internal_quote")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const st = String(req.query.status || "").trim();
      if (st && INTERNAL_STATUSES.has(st)) qb = qb.eq("quote_status", st);
      const rep = String(req.query.sales_rep || "").trim();
      if (rep) qb = qb.ilike("sales_rep", `%${rep.slice(0, 40)}%`);
      const br = String(req.query.branch || "").trim();
      if (br) qb = qb.ilike("branch", `%${br.slice(0, 40)}%`);
      const qn = String(req.query.quote_number || "").trim();
      if (qn) qb = qb.ilike("quote_number", `%${qn.slice(0, 40)}%`);
      const search = String(req.query.q || req.query.search || "").trim();
      if (search) {
        const s = search.replace(/%/g, "").slice(0, 80);
        const pat = `%${s}%`;
        qb = qb.or(`customer_name.ilike.${pat},project_name.ilike.${pat},quote_number.ilike.${pat}`);
      }
      const from = String(req.query.date_from || "").trim();
      if (from) qb = qb.gte("created_at", from);
      const to = String(req.query.date_to || "").trim();
      if (to) qb = qb.lte("created_at", to);
      const { data: rows, error } = await qb.limit(500);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, quotes: [] });
        }
        throw error;
      }
      res.json({ ok: true, quotes: (rows || []).map(listRow) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/internal-quotes/:id", ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadInternalOrgScope(db, req);
      let qb = db
        .from("quote_headers")
        .select("*")
        .eq("id", id)
        .eq("quote_source", "internal_quote")
        .limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data, error } = await qb;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false });
        }
        throw error;
      }
      const row = data?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      res.json({
        ok: true,
        quote: {
          ...listRow(row),
          calculation_snapshot: row.calculation_snapshot,
          customer_email: row.customer_email,
          customer_phone: row.customer_phone,
          project_address: row.project_address,
          project_type: row.project_type,
          zip: row.zip,
          subtotal: row.subtotal,
          markup_total: row.markup_total,
          grand_total: row.grand_total,
          revision_note: row.revision_note ?? null
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/internal-quotes/:id", ...stack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadInternalOrgScope(db, req);
      let qb = db
        .from("quote_headers")
        .select("id,quote_status,is_current_revision,archived_at")
        .eq("id", id)
        .eq("quote_source", "internal_quote")
        .limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: existing, error: exErr } = await qb;
      if (exErr) throw exErr;
      const row = existing?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      const patch = req.body && typeof req.body === "object" ? req.body : {};
      const gate = validateInternalQuotePatchContext(patch, row);
      if (!gate.ok) return res.status(gate.httpStatus).json({ ok: false, error: gate.error });
      /** @type {Record<string, unknown>} */
      const updates = { updated_at: new Date().toISOString() };
      const ns = String(patch.quote_status || "").trim();
      if (ns && INTERNAL_STATUSES.has(ns)) updates.quote_status = ns;
      if (patch.entered_by != null) updates.prepared_by = String(patch.entered_by).trim() || null;
      if (patch.customer_name != null) updates.customer_name = patch.customer_name;
      if (patch.project_name != null) updates.project_name = patch.project_name;
      if (patch.city != null) updates.city = patch.city;
      if (patch.state != null) updates.state = patch.state;
      if (patch.sales_rep != null) updates.sales_rep = patch.sales_rep;
      if (patch.branch != null) updates.branch = patch.branch;
      const { error: uErr } = await db.from("quote_headers").update(updates).eq("id", id).eq("quote_source", "internal_quote");
      if (uErr) throw uErr;
      try {
        await logAction({
          user: req.user,
          head: "quote",
          actionType: "internal_quote_patch",
          entityType: "quote_header",
          entityId: id,
          metadata: { fields: Object.keys(updates) },
          req
        });
      } catch {
        /* eos_action_log optional */
      }
      res.json({ ok: true, id });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/internal-quotes/:id/duplicate", ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadInternalOrgScope(db, req);
      let qb = db.from("quote_headers").select("*").eq("id", id).eq("quote_source", "internal_quote").limit(1);
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data: srcRows, error: sErr } = await qb;
      if (sErr) throw sErr;
      const src = srcRows?.[0];
      if (!src) return res.status(404).json({ ok: false, error: "Not found" });
      const orgKey = esf.organizationKeyForQuotes(orgId);
      const bp = esf.branchPrefixFromBranchLabel(String(src.branch ?? ""));
      let quoteNumber;
      /** @type {Record<string, unknown>} */
      let revExtras = {
        revision_number: 1,
        revision_label: "R1",
        quote_number_base: null,
        quote_family_root_id: null,
        is_current_revision: true,
        revised_from_quote_id: id,
        monday_item_id: null,
        monday_board_id: null,
        archived_at: null,
        archived_by: null
      };
      try {
        const seq = await esf.allocateEsfSequence(db, orgKey, bp);
        revExtras.quote_number_base = esf.formatEsfQuoteNumberBase(bp, seq);
        quoteNumber = esf.quoteNumberForRevision(String(revExtras.quote_number_base), 1);
      } catch {
        quoteNumber = generateQuoteNumber();
        revExtras = {
          revision_number: 1,
          revision_label: "R1",
          quote_number_base: null,
          quote_family_root_id: null,
          is_current_revision: true,
          revised_from_quote_id: id,
          monday_item_id: null,
          monday_board_id: null,
          archived_at: null,
          archived_by: null
        };
      }
      const userEmail = String(req.user?.email || req.user?.id || "unknown");
      const snap = src.calculation_snapshot && typeof src.calculation_snapshot === "object" ? { ...src.calculation_snapshot } : {};
      snap.internal_ui = { ...(snap.internal_ui || {}), duplicated_from_quote_id: id };
      const orgTables = new Set();
      if (orgId) {
        if (await tableHasOrganizationId(db, "quote_headers")) orgTables.add("quote_headers");
      }
      const insRow = {
        quote_number: quoteNumber,
        quote_source: "internal_quote",
        quote_status: "draft",
        partner_account_id: null,
        pricing_structure_id: src.pricing_structure_id,
        customer_name: src.customer_name,
        customer_email: src.customer_email,
        customer_phone: src.customer_phone,
        project_name: src.project_name ? `${src.project_name} (copy)` : "Copy",
        project_address: src.project_address,
        city: src.city,
        state: src.state,
        zip: src.zip,
        sales_rep: src.sales_rep,
        branch: src.branch,
        project_type: src.project_type,
        estimate_confidence: src.estimate_confidence,
        prepared_by: src.prepared_by,
        valid_days: src.valid_days ?? 30,
        notes_length: src.notes_length,
        subtotal: src.subtotal,
        markup_total: src.markup_total,
        discount_total: src.discount_total,
        tax_total: src.tax_total,
        grand_total: src.grand_total,
        estimated_sqft: src.estimated_sqft,
        estimated_material_group: src.estimated_material_group,
        calculation_snapshot: snap,
        created_by: userEmail,
        ...revExtras
      };
      const merged = mergeRowOrganizationId(insRow, orgId, orgTables.has("quote_headers"));
      const { data: ins, error: hErr } = await db.from("quote_headers").insert(merged).select("id").limit(1);
      if (hErr) throw hErr;
      const newId = ins?.[0]?.id;
      if (newId) {
        await db
          .from("quote_headers")
          .update({ quote_family_root_id: newId, updated_at: new Date().toISOString() })
          .eq("id", newId)
          .eq("quote_source", "internal_quote");
      }
      res.json({ ok: true, quoteId: newId, quote_number: quoteNumber });
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({ ok: false, installed: false });
      }
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/internal-quotes/:id/revisions", ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const { orgId, hasQuoteHeadersOrg } = await loadInternalOrgScope(db, req);
      let qb0 = db
        .from("quote_headers")
        .select("id,quote_source,quote_family_root_id,quote_number_base")
        .eq("id", id)
        .eq("quote_source", "internal_quote")
        .limit(1);
      qb0 = applyQuoteHeaderOrgScope(qb0, orgId, hasQuoteHeadersOrg);
      const { data: seedRows, error: seedErr } = await qb0;
      if (seedErr) throw seedErr;
      const seed = seedRows?.[0];
      if (!seed) return res.status(404).json({ ok: false, error: "Not found" });
      const root = String(seed.quote_family_root_id || seed.id);
      let qb = db
        .from("quote_headers")
        .select(
          "id,quote_number,revision_number,revision_label,is_current_revision,grand_total,quote_status,created_at,updated_at,quote_family_root_id"
        )
        .eq("quote_source", "internal_quote")
        .or(`id.eq.${root},quote_family_root_id.eq.${root}`)
        .order("revision_number", { ascending: true });
      qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
      const { data, error } = await qb;
      if (error) throw error;
      res.json({
        ok: true,
        quote_family_root_id: root,
        quote_number_base: seed.quote_number_base ?? null,
        revisions: (data || []).map((r) => ({
          id: r.id,
          quote_number: r.quote_number,
          revision_number: r.revision_number,
          revision_label: r.revision_label,
          is_current_revision: r.is_current_revision,
          grand_total: r.grand_total,
          quote_status: r.quote_status,
          created_at: r.created_at,
          updated_at: r.updated_at
        }))
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/internal-quotes/:id/restore-as-revision", ...stack, jsonParser, async (req, res) => {
    try {
      const restoreFromId = String(req.params.id || "").trim();
      if (!isUuid(restoreFromId)) return res.status(400).json({ ok: false, error: "Invalid id" });
      const db = getSupabase();
      const organizationContext = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const userEmail = String(req.user?.email || req.user?.id || "unknown");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const revisionNote = body.revision_note ?? body.revisionNote ?? null;
      const estimatorDisplayName = await resolveEstimatorDisplayNameFromDb(db, req, body);
      const result = await restoreInternalQuoteAsNewRevision({
        db,
        restoreFromId,
        organizationContext,
        userEmail,
        revisionNote,
        internalStatuses: INTERNAL_STATUSES,
        buildInternalEstimateSummary,
        pricingModeLabel,
        estimatorDisplayName
      });
      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({ ok: false, error: result.error });
      }
      res.json({
        ok: true,
        quoteId: result.quoteId,
        quote_id: result.quoteId,
        quote_number: result.quote_number,
        revision_number: result.revision_number,
        revision_label: result.revision_label,
        quote_family_root_id: result.quote_family_root_id,
        is_current_revision: result.is_current_revision,
        save_mode: result.save_mode,
        monday_sync_status: result.monday_sync_status ?? null
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/internal-quotes/import-from-takeoff", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const takeoffJobId = String(body.takeoffJobId ?? body.takeoff_job_id ?? "").trim();
      const takeoffResultId = String(body.takeoffResultId ?? body.takeoff_result_id ?? "").trim() || null;

      if (!isUuid(takeoffJobId)) {
        return res.status(400).json({ ok: false, error: "takeoffJobId must be a valid UUID" });
      }

      const organizationContext = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!organizationContext.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      await logAction({
        user: req.user,
        head: "quote",
        actionType: "takeoff_import_started",
        entityType: "quote_takeoff_job",
        entityId: takeoffJobId,
        metadata: { takeoff_job_id: takeoffJobId, takeoff_result_id: takeoffResultId },
        req,
      });

      let result;
      try {
        result = await importInternalEstimateFromTakeoff({
          db,
          organizationId: organizationContext.organizationId,
          userId: req.user?.id ?? null,
          userEmail: String(req.user?.email || req.user?.id || "unknown"),
          takeoffJobId,
          takeoffResultId,
          organizationContext,
        });
      } catch (importErr) {
        await logAction({
          user: req.user,
          head: "quote",
          actionType: "takeoff_import_failed",
          entityType: "quote_takeoff_job",
          entityId: takeoffJobId,
          metadata: {
            takeoff_job_id: takeoffJobId,
            error: String(importErr?.message || importErr),
            status_code: importErr?.statusCode ?? 500,
          },
          req,
        });
        throw importErr;
      }

      await logAction({
        user: req.user,
        head: "quote",
        actionType: "takeoff_import_succeeded",
        entityType: "quote_header",
        entityId: result.quoteId,
        metadata: {
          takeoff_job_id: takeoffJobId,
          takeoff_snapshot_id: result.takeoffSnapshotId,
          quote_number: result.quote_number,
        },
        req,
      });
      await logAction({
        user: req.user,
        head: "quote",
        actionType: "internal_quote_imported_from_takeoff",
        entityType: "quote_header",
        entityId: result.quoteId,
        metadata: {
          takeoff_job_id: takeoffJobId,
          takeoff_snapshot_id: result.takeoffSnapshotId,
          quote_number: result.quote_number,
        },
        req,
      });

      res.status(201).json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      res.status(status).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/internal-quotes/:id/detach-takeoff-import", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const quoteId = String(req.params.id ?? "").trim();
      if (!isUuid(quoteId)) {
        return res.status(400).json({ ok: false, error: "quote id must be a valid UUID" });
      }

      const organizationContext = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!organizationContext.organizationId) {
        return res.status(503).json({ ok: false, error: "Organization context not available" });
      }

      const result = await detachTakeoffImportFromQuote({
        db,
        organizationId: organizationContext.organizationId,
        quoteId,
        userId: req.user?.id ?? null,
        userEmail: String(req.user?.email || req.user?.id || "unknown"),
      });

      await logAction({
        user: req.user,
        head: "quote",
        actionType: "takeoff_import_detached",
        entityType: "quote_header",
        entityId: quoteId,
        metadata: {
          takeoff_job_id: result.takeoffJobId,
          removed_room_count: result.removedRoomCount,
        },
        req,
      });

      res.json(result);
    } catch (e) {
      const status = e.statusCode ?? 500;
      res.status(status).json({ ok: false, error: String(e?.message || e) });
    }
  });

  console.log(
    "[quotes] mounted /api/internal-quotes/* (calculate, save, list, material-colors, get, patch, duplicate, revisions, restore-as-revision, import-from-takeoff, detach-takeoff-import)"
  );
}
