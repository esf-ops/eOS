/**
 * Shared quote persistence (public + partner + internal) to avoid circular imports
 * between quoteRoutes and internalQuotesApi.
 */

import { buildMondayQuotePayload, syncQuoteToMonday } from "../integrations/mondayQuoteSync.js";
import {
  mergeRowOrganizationId,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";
import { calculateRoomAreas, roundPublicEstimateToNearestTen } from "./quoteCalculator.js";
import { buildLeadAssignmentRow } from "./quoteTerritoryAssignment.js";

export function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

export function generateQuoteNumber() {
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

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string|null} orgId
 */
async function collectQuoteOrgTables(db, orgId) {
  const orgTables = new Set();
  if (orgId) {
    for (const t of [
      "quote_headers",
      "quote_line_items",
      "quote_rooms",
      "quote_forecast_events",
      "quote_lead_assignments",
      "quote_submission_payloads",
      "quote_monday_sync_log"
    ]) {
      if (await tableHasOrganizationId(db, t)) orgTables.add(t);
    }
  }
  return orgTables;
}

/**
 * Replace persisted rooms + priced line items for an existing quote (internal/partner paths).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{
 *   quoteId: string,
 *   body: Record<string, unknown>,
 *   calc: Record<string, unknown>,
 *   organizationContext?: import("../organizations/organizationContext.js").OrganizationContext|null,
 *   quoteSource?: string
 * }} opts
 */
export async function replaceQuoteLinesAndRooms(db, opts) {
  const quoteId = String(opts.quoteId || "").trim();
  if (!quoteId) throw new Error("replaceQuoteLinesAndRooms: missing quoteId");
  const body = opts.body && typeof opts.body === "object" ? opts.body : {};
  const calc = opts.calc;
  const quoteSource = String(opts.quoteSource || "internal_quote");
  const orgId = opts.organizationContext?.organizationId ? String(opts.organizationContext.organizationId) : null;
  const orgTables = await collectQuoteOrgTables(db, orgId);
  const isPublicConsumer = quoteSource === "public_consumer";

  const { error: dLi } = await db.from("quote_line_items").delete().eq("quote_id", quoteId);
  if (dLi && !isMissingRelationError(dLi)) throw dLi;

  const { error: dRm } = await db.from("quote_rooms").delete().eq("quote_id", quoteId);
  if (dRm && !isMissingRelationError(dRm)) throw dRm;

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
      }))
      .map((r) => mergeRowOrganizationId(r, orgId, orgTables.has("quote_line_items")));
  if (lineRows.length) {
    const { error: lErr } = await db.from("quote_line_items").insert(lineRows);
    if (lErr && !isMissingRelationError(lErr)) throw lErr;
  }

  const rooms = Array.isArray(body.rooms) ? body.rooms : [];
  const roomRows = rooms.map((r, idx) => {
    let ct = Number(r.countertopSqft ?? r.roomCounter ?? 0) || 0;
    let bs = Number(r.backsplashSqft ?? r.roomSplash ?? 0) || 0;
    if (Array.isArray(r.pieces) && r.pieces.length) {
      ct = 0;
      bs = 0;
      for (const p of r.pieces) {
        const { sf } = calculateRoomAreas(p);
        const t = String(p.type || "counter");
        if (t === "splash") bs += sf;
        else ct += sf;
      }
      ct = round2(ct);
      bs = round2(bs);
    }
    const totalSq = round2(ct + bs);
    return {
      quote_id: quoteId,
      room_name: r.name || r.room_name || `Room ${idx + 1}`,
      room_type: r.type || r.room_type || null,
      material_name: r.materialColor || r.materialName || null,
      material_supplier: r.materialSupplier || null,
      material_group: r.materialGroup || r.group || null,
      countertop_sqft: ct,
      backsplash_sqft: bs,
      total_sqft: totalSq,
      measurement_source: r.measurementSource || null,
      sort_order: idx,
      metadata: {
        ...(typeof r.metadata === "object" && r.metadata ? r.metadata : {}),
        pieces: Array.isArray(r.pieces) ? r.pieces : undefined,
        material_color: r.materialColor || null,
        material_type: r.materialType || null
      }
    };
  }).map((r) => mergeRowOrganizationId(r, orgId, orgTables.has("quote_rooms")));
  if (roomRows.length) {
    const { error: rErr } = await db.from("quote_rooms").insert(roomRows);
    if (rErr && !isMissingRelationError(rErr)) throw rErr;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {object} opts
 */
export async function persistQuoteSubmission(db, opts) {
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
    publicResponsePayload,
    organizationContext,
    internalEstimateSummary = null,
    pricingModeLabel = null,
    headerExtras = null,
    skipMondaySync = false
  } = opts;

  const orgId = organizationContext?.organizationId ? String(organizationContext.organizationId) : null;
  const orgTables = await collectQuoteOrgTables(db, orgId);

  const isPublicConsumer = quoteSource === "public_consumer";
  const promoRow = (estimatesByGroup || []).find((r) => String(r.group || "").trim() === "Group Promo");
  const primaryRetail =
    isPublicConsumer && promoRow
      ? Number(
          promoRow.total_display ?? roundPublicEstimateToNearestTen(Number(promoRow.total) || 0)
        )
      : isPublicConsumer && Array.isArray(estimatesByGroup) && estimatesByGroup.length
        ? Number(
            estimatesByGroup[0].total_display ??
              roundPublicEstimateToNearestTen(Number(estimatesByGroup[0].total) || 0)
          )
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
    prepared_by: body.entered_by || body.prepared_by || null,
    valid_days: Number(body.valid_days) || 30,
    notes_length: body.notes ? String(body.notes).length : null,
    subtotal: isPublicConsumer ? round2(primaryRetail) : calc.totals.wholesale,
    markup_total: isPublicConsumer ? 0 : round2(calc.totals.retail - calc.totals.wholesale),
    discount_total: 0,
    tax_total: 0,
    grand_total: round2(primaryRetail),
    estimated_sqft: calc.totals.estimated_sqft,
    estimated_material_group: isPublicConsumer
      ? "ALL_GROUPS"
      : (() => {
          const mb = calc.snapshot?.material_breakdown;
          if (Array.isArray(mb) && mb.length) {
            const gs = new Set(mb.map((m) => String(m.materialGroup || "").trim()).filter(Boolean));
            if (gs.size > 1) return "MULTI_GROUP";
            const one = mb[0]?.materialGroup;
            if (one) return String(one);
          }
          return body.materialGroup || body.material_group || null;
        })(),
    calculation_snapshot: snapshotToStore,
    created_by: userEmail
  };

  const headerMerged =
    headerExtras && typeof headerExtras === "object" ? { ...headerRow, ...headerExtras } : headerRow;

  const headerRowIns = mergeRowOrganizationId(headerMerged, orgId, orgTables.has("quote_headers"));

  const { data: ins, error: hErr } = await db.from("quote_headers").insert(headerRowIns).select("id").limit(1);
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
      }))
      .map((r) => mergeRowOrganizationId(r, orgId, orgTables.has("quote_line_items")));
  if (lineRows.length) {
    const { error: lErr } = await db.from("quote_line_items").insert(lineRows);
    if (lErr && !isMissingRelationError(lErr)) throw lErr;
  }

  const rooms = Array.isArray(body.rooms) ? body.rooms : [];
  const roomRows = rooms.map((r, idx) => {
    let ct = Number(r.countertopSqft ?? r.roomCounter ?? 0) || 0;
    let bs = Number(r.backsplashSqft ?? r.roomSplash ?? 0) || 0;
    if (Array.isArray(r.pieces) && r.pieces.length) {
      ct = 0;
      bs = 0;
      for (const p of r.pieces) {
        const { sf } = calculateRoomAreas(p);
        const t = String(p.type || "counter");
        if (t === "splash") bs += sf;
        else ct += sf;
      }
      ct = round2(ct);
      bs = round2(bs);
    }
    const totalSq = round2(ct + bs);
    return {
      quote_id: quoteId,
      room_name: r.name || r.room_name || `Room ${idx + 1}`,
      room_type: r.type || r.room_type || null,
      material_name: r.materialColor || r.materialName || null,
      material_supplier: r.materialSupplier || null,
      material_group: r.materialGroup || r.group || null,
      countertop_sqft: ct,
      backsplash_sqft: bs,
      total_sqft: totalSq,
      measurement_source: r.measurementSource || null,
      sort_order: idx,
      metadata: {
        ...(typeof r.metadata === "object" && r.metadata ? r.metadata : {}),
        pieces: Array.isArray(r.pieces) ? r.pieces : undefined,
        material_color: r.materialColor || null,
        material_type: r.materialType || null
      }
    };
  }).map((r) => mergeRowOrganizationId(r, orgId, orgTables.has("quote_rooms")));
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
    pricing_structure_id: headerMerged.pricing_structure_id,
    input_payload: body,
    output_payload: isPublicConsumer ? { public_safe: true, estimates_by_group: estimatesByGroup } : calc,
    created_by: userEmail
  });

  const forecastMeta = { quote_source: quoteSource };
  if (quoteSource === "internal_quote" && pricingModeLabel) {
    forecastMeta.internal_pricing_mode = pricingModeLabel;
  }

  await db.from("quote_forecast_events").insert(
    mergeRowOrganizationId(
      {
        quote_id: quoteId,
        event_type: isPublicConsumer ? "public_lead_submitted" : "quote_submitted",
        sales_rep: headerMerged.sales_rep,
        branch: headerMerged.branch,
        partner_account_id: headerMerged.partner_account_id,
        quote_value: headerMerged.grand_total,
        probability_percent: null,
        forecast_value: headerMerged.grand_total,
        metadata: forecastMeta
      },
      orgId,
      orgTables.has("quote_forecast_events")
    )
  );

  if (isPublicConsumer && assignment) {
    try {
      const leadRow = buildLeadAssignmentRow({
        quoteId,
        assignmentResult: assignment,
        organizationId: orgTables.has("quote_lead_assignments") ? orgId : null
      });
      await db.from("quote_lead_assignments").insert(leadRow);
    } catch {
      /* optional table */
    }
  }

  if (isPublicConsumer) {
    try {
      await db.from("quote_submission_payloads").insert(
        mergeRowOrganizationId(
          {
            quote_id: quoteId,
            quote_source: "public_consumer",
            submitted_payload: body,
            normalized_payload: { areas: body.areas, addOns: body.addOns, engine: body.engine },
            public_response_payload: publicResponsePayload || null
          },
          orgId,
          orgTables.has("quote_submission_payloads")
        )
      );
    } catch {
      /* optional table */
    }
  }

  const monPayload = buildMondayQuotePayload(
    { ...headerMerged, id: quoteId },
    snapshotToStore,
    {
      estimates_by_group_summary: isPublicConsumer
        ? (estimatesByGroup || []).map((r) => ({
            group: r.group,
            total: r.total,
            total_display:
              r.total_display != null ? r.total_display : roundPublicEstimateToNearestTen(Number(r.total) || 0)
          }))
        : null,
      internal_estimate_summary: internalEstimateSummary,
      pricing_mode_label: pricingModeLabel
    }
  );
  let mondaySync = { ok: true, skipped: true, status: "skipped" };
  if (!skipMondaySync) {
    mondaySync = await syncQuoteToMonday({
      quoteId,
      action: "submit",
      db,
      payload: monPayload,
      quoteSource,
      organizationId: orgId
    });
  }

  return { quoteId, headerRow: headerMerged, mondaySync };
}
