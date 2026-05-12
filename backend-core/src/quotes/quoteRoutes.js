import express from "express";

import { buildMondayQuotePayload, syncQuoteToMonday } from "../integrations/mondayQuoteSync.js";
import { calculateQuote, computePublicConsumerEstimatesByGroup } from "./quoteCalculator.js";
import { attachQuotePricingAdminApi } from "./quotePricingAdminApi.js";
import { attachQuotePipelineRoutes } from "./quotePipelineApi.js";
import { assignSalesRepForPublicQuote, buildLeadAssignmentRow } from "./quoteTerritoryAssignment.js";

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
  return {
    version: 1,
    public_safe: true,
    quote_source: "public_consumer",
    estimates_by_group: estimatesByGroup || [],
    totals: {
      retail_planning: estimatesByGroup?.[0]?.total ?? calc?.totals?.retail ?? null,
      estimated_sqft: calc?.totals?.estimated_sqft ?? null
    },
    warnings: [...(warnings || []), ...(calc?.warnings || [])]
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {object} opts
 */
async function persistQuoteSubmission(db, opts) {
  const {
    body,
    calc,
    userEmail,
    quoteNumber,
    quoteSource,
    quoteStatus,
    snapshotToStore,
    estimatesByGroup,
    assignment,
    publicResponsePayload
  } = opts;

  const isPublicConsumer = quoteSource === "public_consumer";
  const primaryRetail =
    isPublicConsumer && Array.isArray(estimatesByGroup) && estimatesByGroup.length
      ? Number(estimatesByGroup[0].total)
      : Number(calc.totals.retail);

  const headerRow = {
    quote_number: quoteNumber,
    quote_source: quoteSource,
    quote_status: quoteStatus,
    partner_account_id: body.partner_account_id || null,
    pricing_structure_id: isPublicConsumer ? null : calc.snapshot?.pricingStructure?.id || null,
    customer_name: body.customer_name || null,
    customer_email: body.customer_email || null,
    customer_phone: body.customer_phone || null,
    project_name: body.project_name || null,
    project_address: body.project_address || null,
    city: body.city || null,
    state: body.state || null,
    zip: body.zip || null,
    sales_rep: assignment?.assigned_sales_rep ?? body.sales_rep ?? null,
    branch: assignment?.branch ?? body.branch ?? null,
    project_type: body.project_type || null,
    estimate_confidence: body.estimate_confidence || null,
    prepared_by: body.prepared_by || null,
    valid_days: Number(body.valid_days) || 30,
    notes_length: body.notes ? String(body.notes).length : null,
    subtotal: isPublicConsumer ? round2(primaryRetail) : calc.totals.wholesale,
    markup_total: isPublicConsumer ? 0 : round2(calc.totals.retail - calc.totals.wholesale),
    discount_total: 0,
    tax_total: 0,
    grand_total: round2(primaryRetail),
    estimated_sqft: calc.totals.estimated_sqft,
    estimated_material_group: isPublicConsumer ? "ALL_GROUPS" : body.materialGroup || body.material_group || null,
    calculation_snapshot: snapshotToStore,
    created_by: userEmail
  };

  const { data: ins, error: hErr } = await db.from("quote_headers").insert(headerRow).select("id").limit(1);
  if (hErr) throw hErr;
  const quoteId = ins?.[0]?.id;
  if (!quoteId) throw new Error("Quote insert returned no id");

  const lineRows = isPublicConsumer
    ? []
    : (calc.lineItems || []).map((ln, idx) => ({
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
    new_status: quoteStatus,
    changed_by: userEmail,
    metadata: { quote_source: quoteSource }
  });

  await db.from("quote_calculation_audit").insert({
    quote_id: quoteId,
    pricing_structure_id: headerRow.pricing_structure_id,
    input_payload: body,
    output_payload: isPublicConsumer ? { public_safe: true, estimates_by_group: estimatesByGroup } : calc,
    created_by: userEmail
  });

  await db.from("quote_forecast_events").insert({
    quote_id: quoteId,
    event_type: isPublicConsumer ? "public_lead_submitted" : "quote_submitted",
    sales_rep: headerRow.sales_rep,
    branch: headerRow.branch,
    partner_account_id: headerRow.partner_account_id,
    quote_value: headerRow.grand_total,
    probability_percent: null,
    forecast_value: headerRow.grand_total,
    metadata: { quote_source: quoteSource }
  });

  if (isPublicConsumer && assignment) {
    try {
      await db.from("quote_lead_assignments").insert(buildLeadAssignmentRow({ quoteId, assignmentResult: assignment }));
    } catch {
      /* optional table */
    }
  }

  if (isPublicConsumer) {
    try {
      await db.from("quote_submission_payloads").insert({
        quote_id: quoteId,
        quote_source: "public_consumer",
        submitted_payload: body,
        normalized_payload: { areas: body.areas, addOns: body.addOns, engine: body.engine },
        public_response_payload: publicResponsePayload || null
      });
    } catch {
      /* optional table */
    }
  }

  const monPayload = buildMondayQuotePayload(
    { ...headerRow, id: quoteId },
    snapshotToStore,
    {
      estimates_by_group_summary: isPublicConsumer
        ? (estimatesByGroup || []).map((r) => ({ group: r.group, total: r.total }))
        : null
    }
  );
  await syncQuoteToMonday({
    quoteId,
    action: "submit",
    db,
    payload: monPayload,
    quoteSource
  });

  return { quoteId, headerRow };
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
      const retail = multi.estimates_by_group?.[0]?.total ?? 0;
      res.json({
        ok: true,
        quote_source: "public_consumer",
        totals: {
          retail_planning: retail,
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
          publicResponsePayload
        });
        quoteId = saved.quoteId;
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

      res.json({
        ok: true,
        quote_source: "public_consumer",
        quoteId,
        quote_number: quoteNumber,
        message: "Thank you — your measurements were received.",
        branch_display: assignment.branch || "Elite team",
        sales_rep: assignment.assigned_sales_rep || null,
        estimates_by_group: multi.estimates_by_group,
        warnings: multi.warnings || []
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

  app.post("/api/partner-quote/submit", requireAuth(), jsonParser, async (_req, res) => {
    res.status(501).json({
      ok: false,
      notImplemented: true,
      message:
        "POST /api/partner-quote/submit is scaffolded. Use POST /api/quote/submit with quote_source partner_quote / partner_portal until this route is completed. See docs/quote-platform/three-head-quote-architecture.md."
    });
  });

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
          publicResponsePayload: null
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
  attachQuotePricingAdminApi(app, { requireAuth, requireRole, requireHeadAccess, getSupabase });

  console.log(
    "[quotes] mounted POST /api/public-quote/calculate, POST /api/public-quote/submit-measurements, POST /api/internal-quote/submit (501), POST /api/partner-quote/submit (501), POST /api/quote/calculate, POST /api/quote/submit; quote pipeline GET/PATCH /api/quotes/pipeline*; admin quote APIs via quotePricingAdminApi.js"
  );
}
