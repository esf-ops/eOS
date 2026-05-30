/**
 * Restore a historical internal quote revision as a new latest revision (non-destructive).
 */

import { calculateQuote } from "./quoteCalculator.js";
import { processInternalQuoteSave } from "./internalQuoteSave.js";
import {
  mergeRowOrganizationId,
  organizationScopeOrFilter,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";

function applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg) {
  if (!orgId || !hasQuoteHeadersOrg) return qb;
  const filt = organizationScopeOrFilter(orgId);
  return filt ? qb.or(filt) : qb;
}

/**
 * Rebuild a save/calculate payload from a stored quote row (snapshot + header).
 * @param {Record<string, unknown>} row quote_headers row
 */
export function buildInternalSavePayloadFromQuoteRow(row) {
  const snap = row.calculation_snapshot && typeof row.calculation_snapshot === "object" ? row.calculation_snapshot : {};
  const iu = snap.internal_ui && typeof snap.internal_ui === "object" ? snap.internal_ui : {};
  const input = snap.inputSummary && typeof snap.inputSummary === "object" ? snap.inputSummary : {};
  const rooms = Array.isArray(iu.estimate_rooms)
    ? iu.estimate_rooms
    : Array.isArray(snap.estimate_rooms)
      ? snap.estimate_rooms
      : [];
  const engine = rooms.length ? "rooms" : String(input.engine || "legacy");
  const areas =
    input.areas && typeof input.areas === "object"
      ? input.areas
      : { countertopSqft: 0, backsplashSqft: 0 };

  return {
    quoteSource: "internal_quote",
    quote_source: "internal_quote",
    engine,
    materialGroup: input.materialGroup || row.estimated_material_group || "Group Promo",
    internalMaterialBasis: iu.internal_material_basis || "wholesale",
    rooms,
    vanities: iu.vanities || [],
    areas,
    addOns: iu.addOns || iu.add_ons || {},
    customLineItems: iu.custom_line_items || [],
    customPassthroughItems: iu.custom_passthrough_items || [],
    estimateRoomDrafts: iu.estimate_room_drafts ?? null,
    customerEstimateDisplayGroups: iu.customer_estimate_display_groups || [],
    customerRoomAreaBreakdown: iu.customer_room_area_breakdown || null,
    customerFacingNotes: iu.customer_estimate_customer_facing_notes ?? iu.customerFacingNotes ?? null,
    quoteDefaultMaterial: iu.quote_default_material || null,
    quote_workflow: iu.quote_workflow || null,
    colorTbd: Boolean(iu.color_tbd),
    useTaxPercent: Math.max(0, Number(iu.use_tax_percent) || 0),
    readiness: snap.readiness || null,
    fileChecklist: snap.file_checklist || null,
    job_info: iu.job_info || null,
    account: iu.account_name || iu.account || null,
    account_name: iu.account_name || iu.account || null,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    customer_phone: row.customer_phone,
    project_name: row.project_name,
    project_address: row.project_address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    sales_rep: row.sales_rep,
    branch: row.branch,
    project_type: row.project_type,
    entered_by: row.prepared_by,
    prepared_by: row.prepared_by,
    quote_status: row.quote_status
  };
}

function buildSnapshotToStore(calc, body) {
  return {
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
      use_tax_percent: Math.max(0, Number(body.useTaxPercent ?? body.use_tax_percent ?? 0) || 0),
      customer_room_area_breakdown:
        body.customerRoomAreaBreakdown ?? body.customer_room_area_breakdown ?? null,
      customer_estimate_customer_facing_notes: (() => {
        const raw =
          body.customerFacingNotes ??
          body.customer_facing_notes ??
          body.customer_estimate_customer_facing_notes;
        if (raw == null) return null;
        const trimmed = String(raw).trim();
        return trimmed || null;
      })(),
      restored_from_quote_id: body._restored_from_quote_id ?? null,
      restored_from_revision_label: body._restored_from_revision_label ?? null
    }
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} restoreFromId historical revision row id
 * @param {string|null} orgId
 * @param {boolean} hasQuoteHeadersOrg
 */
async function fetchInternalQuoteRow(db, id, orgId, hasQuoteHeadersOrg) {
  let qb = db.from("quote_headers").select("*").eq("id", id).eq("quote_source", "internal_quote").limit(1);
  qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
  const { data, error } = await qb;
  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * Create a new latest revision from a historical snapshot (does not mutate the historical row).
 * @param {object} params
 */
export async function restoreInternalQuoteAsNewRevision(params) {
  const {
    db,
    restoreFromId,
    organizationContext,
    userEmail,
    revisionNote,
    internalStatuses,
    buildInternalEstimateSummary,
    pricingModeLabel,
    estimatorDisplayName = null
  } = params;

  const orgId = organizationContext?.organizationId ? String(organizationContext.organizationId) : null;
  const hasQuoteHeadersOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;

  const historical = await fetchInternalQuoteRow(db, restoreFromId, orgId, hasQuoteHeadersOrg);
  if (!historical) return { ok: false, httpStatus: 404, error: "Revision not found" };
  if (historical.archived_at) return { ok: false, httpStatus: 400, error: "Cannot restore from an archived quote." };

  const root = String(historical.quote_family_root_id || historical.id);
  let latestQb = db
    .from("quote_headers")
    .select("id,is_current_revision,archived_at")
    .eq("quote_source", "internal_quote")
    .or(`id.eq.${root},quote_family_root_id.eq.${root}`)
    .eq("is_current_revision", true)
    .limit(1);
  latestQb = applyQuoteHeaderOrgScope(latestQb, orgId, hasQuoteHeadersOrg);
  const { data: latestRows, error: latestErr } = await latestQb;
  if (latestErr) throw latestErr;
  const latest = latestRows?.[0];
  if (!latest) return { ok: false, httpStatus: 404, error: "No current revision found for this quote family." };
  if (latest.archived_at) return { ok: false, httpStatus: 400, error: "Quote family is archived." };
  if (String(latest.id) === String(historical.id)) {
    return { ok: false, httpStatus: 400, error: "This revision is already the latest." };
  }

  const body = buildInternalSavePayloadFromQuoteRow(historical);
  body._restored_from_quote_id = historical.id;
  body._restored_from_revision_label = historical.revision_label ?? null;
  body.quote_id = latest.id;
  body.save_mode = "save_revision";
  body.revision_note =
    revisionNote != null && String(revisionNote).trim()
      ? String(revisionNote).trim().slice(0, 4000)
      : `Restored from ${historical.revision_label || historical.quote_number || "prior revision"}`;

  const calc = await calculateQuote({ ...body, quoteSource: "internal_quote" }, { db });
  const snapshotToStore = buildSnapshotToStore(calc, body);
  const internalEstimateSummary = buildInternalEstimateSummary(calc, body, snapshotToStore);
  const pMode = pricingModeLabel(body);

  return processInternalQuoteSave({
    db,
    body,
    calc,
    organizationContext,
    userEmail,
    snapshotToStore,
    internalEstimateSummary,
    pricingModeLabel: pMode,
    estimatorDisplayName,
    internalStatuses
  });
}
