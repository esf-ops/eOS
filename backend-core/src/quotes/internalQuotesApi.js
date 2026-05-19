/**
 * Internal Quote Tool — authenticated APIs (eliteOS Brain / Supabase).
 * @see docs/quote-platform/internal-quote-test-plan.md
 */

import express from "express";

import { logAction } from "../auth/auditLog.js";
import { internalMondayColumnMappingConfigured } from "../integrations/mondayQuoteSync.js";
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
import { generateQuoteNumber, isMissingRelationError } from "./quotePersist.js";


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

function buildInternalEstimateSummary(calc, body) {
  const g = String(body.materialGroup || body.material_group || "Group Promo");
  const mode = String(body.internalMaterialBasis || body.internal_material_basis || "wholesale");
  const r = Number(calc?.totals?.retail || 0);
  const sf = Number(calc?.totals?.estimated_sqft || 0);
  return `${g} · ${mode} · $${r.toFixed(2)} · ${sf.toFixed(1)} sf`.slice(0, 1800);
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
  const stack = [requireAuth(), headQuote];

  app.post("/api/internal-quotes/calculate", ...stack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const calc = await calculateQuote({ ...body, quoteSource: "internal_quote" }, { db });
      await logAction({
        user: req.user,
        head: "quote",
        actionType: "internal_quote_calculated",
        entityType: "quote_calculation",
        entityId: null,
        metadata: {
          engine: body.engine ?? null,
          estimated_sqft: calc.totals?.estimated_sqft ?? null,
          internal_material_basis: body.internalMaterialBasis ?? body.internal_material_basis ?? null
        },
        req
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
      const calc = await calculateQuote({ ...body, quoteSource: "internal_quote" }, { db });
      const userEmail = String(req.user?.email || req.user?.id || "unknown");
      const snapshotToStore = {
        ...calc.snapshot,
        internal_ui_version: 1,
        internal_ui: {
          quote_workflow: body.quote_workflow ?? null,
          internal_material_basis: body.internalMaterialBasis ?? body.internal_material_basis ?? null,
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
          estimate_room_drafts: body.estimateRoomDrafts ?? body.estimate_room_drafts ?? null,
          color_tbd: Boolean(body.colorTbd ?? body.color_tbd),
          use_tax_percent: Math.max(0, Number(body.useTaxPercent ?? body.use_tax_percent ?? 0) || 0)
        }
      };
      const internalEstimateSummary = buildInternalEstimateSummary(calc, body);
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
          internalStatuses: INTERNAL_STATUSES
        });
        if (!result.ok) {
          return res.status(result.httpStatus || 400).json({ ok: false, error: result.error });
        }
        const quoteId = result.quoteId;
        const quoteNumber = result.quote_number;
        const mondaySync = {
          status: result.monday_sync_status,
          monday_item_id: result.monday_item_id,
          warning: null
        };
        if (mondaySync?.warning) warnings.push(mondaySync.warning);
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

  console.log("[quotes] mounted /api/internal-quotes/* (calculate, save, list, material-colors, get, patch, duplicate)");
}
