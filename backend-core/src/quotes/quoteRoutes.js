import express from "express";

import { buildMondayQuotePayload, syncQuoteToMonday } from "../integrations/mondayQuoteSync.js";
import {
  getForecastValueRollup,
  getQuoteMetricsByBranch,
  getQuoteMetricsByPartner,
  getQuoteMetricsBySalesRep,
  getQuotePipelineSummary
} from "./quoteAnalytics.js";
import { calculateQuote } from "./quoteCalculator.js";

const jsonParser = express.json({ limit: "2mb" });

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function generateQuoteNumber() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `Q-${y}${m}${day}-${rnd}`;
}

function sanitizePublicCalculateResponse(calcResult) {
  const snap = calcResult.snapshot && typeof calcResult.snapshot === "object" ? { ...calcResult.snapshot } : {};
  delete snap.inputSummary;
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

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachQuoteRoutes(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  const headAccessSystemAdmin = requireHeadAccess("system_admin", { getSupabase });
  const supabaseGetter = () => getSupabase();

  app.post("/api/quote/calculate", requireAuth(), jsonParser, async (req, res) => {
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

  app.post("/api/quote/submit", requireAuth(), jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const pricingContext = { db };
      const calc = await calculateQuote(body, pricingContext);
      const quoteNumber = String(body.quote_number || "").trim() || generateQuoteNumber();
      const userEmail = String(req.user?.email || req.user?.id || "unknown");

      const headerRow = {
        quote_number: quoteNumber,
        quote_source: String(body.quoteSource || body.quote_source || "partner_portal"),
        quote_status: "submitted",
        partner_account_id: body.partner_account_id || null,
        pricing_structure_id: calc.snapshot?.pricingStructure?.id || null,
        customer_name: body.customer_name || null,
        customer_email: body.customer_email || null,
        customer_phone: body.customer_phone || null,
        project_name: body.project_name || null,
        project_address: body.project_address || null,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        sales_rep: body.sales_rep || null,
        branch: body.branch || null,
        project_type: body.project_type || null,
        estimate_confidence: body.estimate_confidence || null,
        prepared_by: body.prepared_by || null,
        valid_days: Number(body.valid_days) || 30,
        notes_length: body.notes ? String(body.notes).length : null,
        subtotal: calc.totals.wholesale,
        markup_total: calc.totals.retail - calc.totals.wholesale,
        discount_total: 0,
        tax_total: 0,
        grand_total: calc.totals.retail,
        estimated_sqft: calc.totals.estimated_sqft,
        estimated_material_group: body.materialGroup || body.material_group || null,
        calculation_snapshot: calc.snapshot,
        created_by: userEmail
      };

      const { data: ins, error: hErr } = await db.from("quote_headers").insert(headerRow).select("id").limit(1);
      if (hErr) {
        if (isMissingRelationError(hErr)) {
          return res.status(503).json({
            ok: false,
            installed: false,
            message: "Quote platform tables not installed. Apply backend-core/supabase/eos_quote_platform.sql."
          });
        }
        throw hErr;
      }
      const quoteId = ins?.[0]?.id;
      if (!quoteId) throw new Error("Quote insert returned no id");

      const lineRows = (calc.lineItems || []).map((ln, idx) => ({
        quote_id: quoteId,
        line_type: ln.line_type || "line",
        category: ln.category || "custom",
        item_code: ln.item_code || null,
        item_name: ln.item_name || "Item",
        room_name: ln.room_name || null,
        quantity: ln.quantity ?? 1,
        unit_type: ln.unit_type || "each",
        unit_price: ln.unit_price ?? 0,
        line_subtotal: ln.line_subtotal ?? 0,
        sort_order: ln.sort_order ?? idx
      }));
      if (lineRows.length) {
        const { error: lErr } = await db.from("quote_line_items").insert(lineRows);
        if (lErr && !isMissingRelationError(lErr)) throw lErr;
      }

      const rooms = Array.isArray(body.rooms) ? body.rooms : [];
      const roomRows = rooms.map((r, idx) => ({
        quote_id: quoteId,
        room_name: r.name || r.room_name || `Room ${idx + 1}`,
        room_type: r.type || r.room_type || null,
        material_name: r.materialName || null,
        material_supplier: r.materialSupplier || null,
        material_group: r.materialGroup || r.group || null,
        countertop_sqft: r.countertopSqft || r.roomCounter || 0,
        backsplash_sqft: r.backsplashSqft || r.roomSplash || 0,
        total_sqft: (Number(r.countertopSqft) || 0) + (Number(r.backsplashSqft) || 0),
        measurement_source: r.measurementSource || null,
        sort_order: idx,
        metadata: typeof r.metadata === "object" ? r.metadata : {}
      }));
      if (roomRows.length) {
        const { error: rErr } = await db.from("quote_rooms").insert(roomRows);
        if (rErr && !isMissingRelationError(rErr)) throw rErr;
      }

      await db.from("quote_status_history").insert({
        quote_id: quoteId,
        old_status: "draft",
        new_status: "submitted",
        changed_by: userEmail,
        metadata: {}
      });

      await db.from("quote_calculation_audit").insert({
        quote_id: quoteId,
        pricing_structure_id: headerRow.pricing_structure_id,
        input_payload: body,
        output_payload: calc,
        created_by: userEmail
      });

      await db.from("quote_forecast_events").insert({
        quote_id: quoteId,
        event_type: "quote_submitted",
        sales_rep: headerRow.sales_rep,
        branch: headerRow.branch,
        partner_account_id: headerRow.partner_account_id,
        quote_value: headerRow.grand_total,
        probability_percent: null,
        forecast_value: headerRow.grand_total,
        metadata: {}
      });

      const monPayload = buildMondayQuotePayload({ ...headerRow, id: quoteId }, calc.snapshot);
      await syncQuoteToMonday({ quoteId, action: "submit", db, payload: monPayload });

      res.json({ ok: true, quoteId, quoteNumber, totals: calc.totals, snapshot: calc.snapshot });
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

  app.get(
    "/api/admin/quote-pricing-structures",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (_req, res) => {
      try {
        const db = supabaseGetter();
        const { data, error } = await db.from("quote_pricing_structures").select("*").order("code");
        if (error) {
          if (isMissingRelationError(error)) {
            return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote platform tables not installed." });
          }
          throw error;
        }
        res.json({ ok: true, installed: true, rows: data ?? [] });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.post(
    "/api/admin/quote-pricing-structures",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    jsonParser,
    async (req, res) => {
      try {
        const db = supabaseGetter();
        const b = req.body || {};
        const row = {
          name: String(b.name || "").trim() || "Unnamed",
          code: String(b.code || "").trim() || `STRUCT-${Date.now()}`,
          description: b.description || null,
          pricing_mode: String(b.pricing_mode || "custom"),
          retail_markup_percent: Number(b.retail_markup_percent) || 25,
          is_public_default: Boolean(b.is_public_default),
          is_active: b.is_active !== false
        };
        const { data, error } = await db.from("quote_pricing_structures").insert(row).select("*").limit(1);
        if (error) {
          if (isMissingRelationError(error)) {
            return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
          }
          throw error;
        }
        res.json({ ok: true, row: data?.[0] ?? null });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/quote-partners",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (_req, res) => {
      try {
        const db = supabaseGetter();
        const { data, error } = await db.from("quote_partner_accounts").select("*").order("account_name");
        if (error) {
          if (isMissingRelationError(error)) {
            return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote platform tables not installed." });
          }
          throw error;
        }
        res.json({ ok: true, installed: true, rows: data ?? [] });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.post(
    "/api/admin/quote-partners/:id/pricing-assignment",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    jsonParser,
    async (req, res) => {
      try {
        const db = supabaseGetter();
        const partnerId = String(req.params.id || "").trim();
        const pricing_structure_id = String(req.body?.pricing_structure_id || "").trim();
        if (!partnerId || !pricing_structure_id) {
          return res.status(400).json({ ok: false, error: "partner id and pricing_structure_id required" });
        }
        const userEmail = String(req.user?.email || req.user?.id || "admin");
        const { data, error } = await db
          .from("quote_partner_pricing_assignments")
          .insert({
            partner_account_id: partnerId,
            pricing_structure_id,
            assigned_by: userEmail,
            is_active: true
          })
          .select("*")
          .limit(1);
        if (error) {
          if (isMissingRelationError(error)) {
            return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
          }
          throw error;
        }
        res.json({ ok: true, assignment: data?.[0] ?? null });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/quotes",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (req, res) => {
      try {
        const db = supabaseGetter();
        const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50));
        const { data, error } = await db
          .from("quote_headers")
          .select("id,quote_number,quote_status,quote_source,customer_name,grand_total,sales_rep,branch,created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) {
          if (isMissingRelationError(error)) {
            return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote platform tables not installed." });
          }
          throw error;
        }
        res.json({ ok: true, installed: true, rows: data ?? [] });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/quotes/:id",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (req, res) => {
      try {
        const db = supabaseGetter();
        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ ok: false, error: "id required" });
        const { data: h, error: hErr } = await db.from("quote_headers").select("*").eq("id", id).limit(1);
        if (hErr) {
          if (isMissingRelationError(hErr)) {
            return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
          }
          throw hErr;
        }
        if (!h?.length) return res.status(404).json({ ok: false, error: "quote not found" });
        const [{ data: lines }, { data: rooms }] = await Promise.all([
          db.from("quote_line_items").select("*").eq("quote_id", id).order("sort_order"),
          db.from("quote_rooms").select("*").eq("quote_id", id).order("sort_order")
        ]);
        res.json({ ok: true, installed: true, quote: h[0], line_items: lines ?? [], rooms: rooms ?? [] });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  app.get(
    "/api/admin/quote-analytics/summary",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSystemAdmin,
    async (req, res) => {
      try {
        const db = supabaseGetter();
        const startDate = String(req.query.startDate || "").trim() || undefined;
        const endDate = String(req.query.endDate || "").trim() || undefined;
        const pipeline = await getQuotePipelineSummary({ startDate, endDate, db });
        const byRep = await getQuoteMetricsBySalesRep({ startDate, endDate, db });
        const byBranch = await getQuoteMetricsByBranch({ startDate, endDate, db });
        const byPartner = await getQuoteMetricsByPartner({ startDate, endDate, db });
        const forecast = await getForecastValueRollup({ startDate, endDate, db });
        res.json({ ok: true, pipeline, byRep, byBranch, byPartner, forecast });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    }
  );

  console.log(
    "[quotes] mounted POST /api/quote/calculate, POST /api/quote/submit, admin quote/* routes, GET /api/admin/quote-analytics/summary"
  );
}
