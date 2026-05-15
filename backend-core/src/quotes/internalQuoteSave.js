/**
 * Internal Estimate durable save modes (Phase 2): create, update_existing, save_revision, save_as_new_quote.
 */

import { buildMondayQuotePayload, syncQuoteToMonday } from "../integrations/mondayQuoteSync.js";
import {
  mergeRowOrganizationId,
  organizationScopeOrFilter,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";
import * as esf from "./quoteEsfNumber.js";
import { generateQuoteNumber, isMissingRelationError, persistQuoteSubmission, replaceQuoteLinesAndRooms } from "./quotePersist.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string|null} orgId
 * @param {boolean} hasQuoteHeadersOrg
 */
function applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg) {
  if (!orgId || !hasQuoteHeadersOrg) return qb;
  const filt = organizationScopeOrFilter(orgId);
  return filt ? qb.or(filt) : qb;
}

/**
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} calc
 */
function internalEstimatedMaterialGroup(body, calc) {
  const mb = calc.snapshot?.material_breakdown;
  if (Array.isArray(mb) && mb.length) {
    const gs = new Set(mb.map((m) => String(m.materialGroup || "").trim()).filter(Boolean));
    if (gs.size > 1) return "MULTI_GROUP";
    const one = mb[0]?.materialGroup;
    if (one) return String(one);
  }
  return body.materialGroup || body.material_group || null;
}

/**
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} calc
 */
function buildInternalFinancialHeader(body, calc) {
  const primaryRetail = Number(calc.totals.retail);
  return {
    pricing_structure_id: calc.snapshot?.pricingStructure?.id || null,
    subtotal: calc.totals.wholesale,
    markup_total: round2(calc.totals.retail - calc.totals.wholesale),
    discount_total: 0,
    tax_total: 0,
    grand_total: round2(primaryRetail),
    estimated_sqft: calc.totals.estimated_sqft,
    estimated_material_group: internalEstimatedMaterialGroup(body, calc)
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} id
 * @param {string|null} orgId
 * @param {boolean} hasQuoteHeadersOrg
 */
async function fetchScopedInternalQuote(db, id, orgId, hasQuoteHeadersOrg) {
  let qb = db.from("quote_headers").select("*").eq("id", id).eq("quote_source", "internal_quote").limit(1);
  qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
  const { data, error } = await qb;
  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} rootId
 * @param {string|null} orgId
 * @param {boolean} hasQuoteHeadersOrg
 */
async function markFamilyNotCurrent(db, rootId, orgId, hasQuoteHeadersOrg) {
  let qb = db
    .from("quote_headers")
    .update({ is_current_revision: false, updated_at: new Date().toISOString() })
    .eq("quote_source", "internal_quote")
    .or(`id.eq.${rootId},quote_family_root_id.eq.${rootId}`);
  qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
  const { error } = await qb;
  if (error) throw error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} rootId
 * @param {string|null} orgId
 * @param {boolean} hasQuoteHeadersOrg
 */
async function fetchMaxRevisionNumber(db, rootId, orgId, hasQuoteHeadersOrg) {
  let qb = db
    .from("quote_headers")
    .select("revision_number")
    .eq("quote_source", "internal_quote")
    .or(`id.eq.${rootId},quote_family_root_id.eq.${rootId}`);
  qb = applyQuoteHeaderOrgScope(qb, orgId, hasQuoteHeadersOrg);
  const { data, error } = await qb;
  if (error) throw error;
  let max = 1;
  for (const r of data || []) {
    const n = Number(r.revision_number) || 1;
    if (n > max) max = n;
  }
  return max;
}

function noteFromBody(body) {
  const n = body.revision_note ?? body.revisionNote;
  if (n == null) return null;
  const s = String(n).trim();
  return s ? s.slice(0, 4000) : null;
}

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.db
 * @param {Record<string, unknown>} params.body
 * @param {Record<string, unknown>} params.calc
 * @param {import("../organizations/organizationContext.js").OrganizationContext|null} params.organizationContext
 * @param {string} params.userEmail
 * @param {Record<string, unknown>} params.snapshotToStore
 * @param {string|null} params.internalEstimateSummary
 * @param {string|null} params.pricingModeLabel
 * @param {Set<string>} params.internalStatuses
 */
export async function processInternalQuoteSave(params) {
  const {
    db,
    body,
    calc,
    organizationContext,
    userEmail,
    snapshotToStore,
    internalEstimateSummary,
    pricingModeLabel,
    internalStatuses
  } = params;

  const orgId = organizationContext?.organizationId ? String(organizationContext.organizationId) : null;
  const hasQuoteHeadersOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;

  const rawStatus = String(body.quote_status || "testing_review").trim();
  const quoteStatus = internalStatuses.has(rawStatus) ? rawStatus : "testing_review";

  const existingId = String(body.quote_id ?? body.quoteId ?? "").trim();
  const saveModeRaw = String(body.save_mode ?? body.saveMode ?? "").trim().toLowerCase();
  let saveMode = saveModeRaw;
  if (!saveModeRaw) {
    saveMode = existingId ? "update_existing" : "create";
  }

  const persistBody = {
    ...body,
    entered_by: body.entered_by || body.prepared_by || body.preparedBy,
    prepared_by: body.entered_by || body.prepared_by || body.preparedBy,
    customer_name: body.customer_name,
    project_name: body.project_name,
    city: body.city,
    state: body.state
  };

  /** --- save_as_new_quote / create --- */
  async function runFreshInsert(revisedFromId) {
    const orgKey = esf.organizationKeyForQuotes(orgId);
    const bp = esf.branchPrefixFromBranchLabel(String(body.branch ?? ""));
    let quoteNumber;
    let quote_number_base = null;
    try {
      const seq = await esf.allocateEsfSequence(db, orgKey, bp);
      quote_number_base = esf.formatEsfQuoteNumberBase(bp, seq);
      quoteNumber = esf.quoteNumberForRevision(quote_number_base, 1);
    } catch {
      quoteNumber = generateQuoteNumber();
      quote_number_base = null;
    }

    const headerExtras = {
      quote_family_root_id: null,
      revision_number: 1,
      revision_label: "R1",
      quote_number_base,
      is_current_revision: true,
      revised_from_quote_id: revisedFromId || null,
      revision_note: noteFromBody(body),
      monday_item_id: null,
      monday_board_id: null
    };

    const { quoteId, mondaySync } = await persistQuoteSubmission(db, {
      body: persistBody,
      calc,
      userEmail,
      quoteNumber,
      quoteSource: "internal_quote",
      quoteStatus,
      snapshotToStore,
      estimatesByGroup: null,
      assignment: null,
      publicResponsePayload: null,
      organizationContext,
      internalEstimateSummary,
      pricingModeLabel,
      headerExtras
    });

    await db
      .from("quote_headers")
      .update({
        quote_family_root_id: quoteId,
        updated_at: new Date().toISOString()
      })
      .eq("id", quoteId)
      .eq("quote_source", "internal_quote");

    return {
      ok: true,
      quoteId,
      quote_number: quoteNumber,
      quote_number_base,
      revision_number: 1,
      revision_label: "R1",
      quote_family_root_id: quoteId,
      monday_sync_status: mondaySync?.status ?? null,
      monday_item_id: mondaySync?.monday_item_id ?? null,
      save_mode: revisedFromId ? "save_as_new_quote" : "create"
    };
  }

  /** --- update_existing --- */
  async function runUpdateExisting() {
    if (!existingId) {
      return { ok: false, httpStatus: 400, error: "quote_id is required for update_existing" };
    }
    const row = await fetchScopedInternalQuote(db, existingId, orgId, hasQuoteHeadersOrg);
    if (!row) return { ok: false, httpStatus: 404, error: "Not found" };
    if (row.archived_at) return { ok: false, httpStatus: 400, error: "Quote is archived — restore before editing." };
    if (row.is_current_revision === false) {
      return {
        ok: false,
        httpStatus: 400,
        error: "This is a historical revision. Open the latest revision or save a new revision."
      };
    }

    const fin = buildInternalFinancialHeader(persistBody, calc);
    const updates = {
      ...fin,
      customer_name: persistBody.customer_name ?? null,
      customer_email: persistBody.customer_email ?? null,
      customer_phone: persistBody.customer_phone ?? null,
      project_name: persistBody.project_name ?? null,
      project_address: persistBody.project_address ?? null,
      city: persistBody.city ?? null,
      state: persistBody.state ?? null,
      zip: persistBody.zip ?? null,
      sales_rep: persistBody.sales_rep ?? null,
      branch: persistBody.branch ?? null,
      project_type: persistBody.project_type ?? null,
      estimate_confidence: persistBody.estimate_confidence ?? null,
      prepared_by: persistBody.prepared_by ?? null,
      valid_days: Number(persistBody.valid_days) || 30,
      notes_length: persistBody.notes ? String(persistBody.notes).length : null,
      calculation_snapshot: snapshotToStore,
      revision_note: noteFromBody(body) != null ? noteFromBody(body) : row.revision_note,
      updated_at: new Date().toISOString()
    };

    let ub = db.from("quote_headers").update(updates).eq("id", existingId).eq("quote_source", "internal_quote");
    ub = applyQuoteHeaderOrgScope(ub, orgId, hasQuoteHeadersOrg);
    const { error: uErr } = await ub;
    if (uErr) throw uErr;

    await replaceQuoteLinesAndRooms(db, {
      quoteId: existingId,
      body: persistBody,
      calc,
      organizationContext,
      quoteSource: "internal_quote"
    });

    await db.from("quote_calculation_audit").insert({
      quote_id: existingId,
      pricing_structure_id: fin.pricing_structure_id,
      input_payload: persistBody,
      output_payload: calc,
      created_by: userEmail
    });

    try {
      const orgTablesFe = new Set();
      if (orgId && (await tableHasOrganizationId(db, "quote_forecast_events"))) orgTablesFe.add("quote_forecast_events");
      await db.from("quote_forecast_events").insert(
        mergeRowOrganizationId(
          {
            quote_id: existingId,
            event_type: "internal_quote_updated",
            sales_rep: updates.sales_rep,
            branch: updates.branch,
            partner_account_id: null,
            quote_value: updates.grand_total,
            probability_percent: null,
            forecast_value: updates.grand_total,
            metadata: {
              quote_source: "internal_quote",
              internal_pricing_mode: pricingModeLabel,
              save_mode: "update_existing"
            }
          },
          orgId,
          orgTablesFe.has("quote_forecast_events")
        )
      );
    } catch {
      /* optional */
    }

    const headerForMonday = { ...row, ...updates, id: existingId };
    const monPayload = buildMondayQuotePayload(headerForMonday, snapshotToStore, {
      internal_estimate_summary: internalEstimateSummary,
      pricing_mode_label: pricingModeLabel,
      revision_label: row.revision_label,
      quote_family_root_id: row.quote_family_root_id || row.id
    });
    let mondaySync = { ok: true, skipped: true, status: null, monday_item_id: row.monday_item_id };
    try {
      mondaySync = await syncQuoteToMonday({
        quoteId: existingId,
        action: "update",
        db,
        payload: monPayload,
        quoteSource: "internal_quote",
        organizationId: orgId
      });
    } catch {
      mondaySync = { ok: true, skipped: true, status: "internal_monday_update_failed" };
    }

    return {
      ok: true,
      quoteId: existingId,
      quote_number: row.quote_number,
      quote_number_base: row.quote_number_base,
      revision_number: row.revision_number,
      revision_label: row.revision_label,
      quote_family_root_id: row.quote_family_root_id || row.id,
      monday_sync_status: mondaySync?.status ?? null,
      monday_item_id: mondaySync?.monday_item_id ?? row.monday_item_id,
      save_mode: "update_existing"
    };
  }

  /** --- save_revision --- */
  async function runSaveRevision() {
    if (!existingId) return { ok: false, httpStatus: 400, error: "quote_id is required for save_revision" };
    const row = await fetchScopedInternalQuote(db, existingId, orgId, hasQuoteHeadersOrg);
    if (!row) return { ok: false, httpStatus: 404, error: "Not found" };
    if (row.archived_at) return { ok: false, httpStatus: 400, error: "Quote is archived." };
    if (row.is_current_revision === false) {
      return { ok: false, httpStatus: 400, error: "Open the latest revision before saving a new revision." };
    }

    const root = String(row.quote_family_root_id || row.id);
    const base = esf.deriveQuoteNumberBaseFromRow(row);
    if (!base) {
      return {
        ok: false,
        httpStatus: 400,
        error:
          "Cannot determine quote number base for this quote — apply eliteos_internal_quote_phase2.sql and save once as update_existing to attach ESF metadata."
      };
    }

    await markFamilyNotCurrent(db, root, orgId, hasQuoteHeadersOrg);
    const maxRev = await fetchMaxRevisionNumber(db, root, orgId, hasQuoteHeadersOrg);
    const nextRev = maxRev + 1;
    const quoteNumber = esf.quoteNumberForRevision(base, nextRev);

    const headerExtras = {
      quote_family_root_id: root,
      revision_number: nextRev,
      revision_label: esf.revisionLabelFromNumber(nextRev),
      quote_number_base: base,
      is_current_revision: true,
      revised_from_quote_id: row.id,
      revision_note: noteFromBody(body),
      monday_item_id: null,
      monday_board_id: null
    };

    const { quoteId, mondaySync } = await persistQuoteSubmission(db, {
      body: persistBody,
      calc,
      userEmail,
      quoteNumber,
      quoteSource: "internal_quote",
      quoteStatus,
      snapshotToStore,
      estimatesByGroup: null,
      assignment: null,
      publicResponsePayload: null,
      organizationContext,
      internalEstimateSummary,
      pricingModeLabel,
      headerExtras
    });

    try {
      const orgTablesFe = new Set();
      if (orgId && (await tableHasOrganizationId(db, "quote_forecast_events"))) orgTablesFe.add("quote_forecast_events");
      await db.from("quote_forecast_events").insert(
        mergeRowOrganizationId(
          {
            quote_id: quoteId,
            event_type: "internal_quote_revision",
            sales_rep: persistBody.sales_rep ?? null,
            branch: persistBody.branch ?? null,
            partner_account_id: null,
            quote_value: round2(Number(calc.totals.retail)),
            probability_percent: null,
            forecast_value: round2(Number(calc.totals.retail)),
            metadata: {
              quote_source: "internal_quote",
              internal_pricing_mode: pricingModeLabel,
              save_mode: "save_revision",
              quote_family_root_id: root,
              revision_number: nextRev
            }
          },
          orgId,
          orgTablesFe.has("quote_forecast_events")
        )
      );
    } catch {
      /* optional */
    }

    return {
      ok: true,
      quoteId,
      quote_number: quoteNumber,
      quote_number_base: base,
      revision_number: nextRev,
      revision_label: headerExtras.revision_label,
      quote_family_root_id: root,
      monday_sync_status: mondaySync?.status ?? null,
      monday_item_id: mondaySync?.monday_item_id ?? null,
      save_mode: "save_revision"
    };
  }

  try {
    if (saveMode === "update_existing") {
      return await runUpdateExisting();
    }
    if (saveMode === "save_revision") {
      return await runSaveRevision();
    }
    if (saveMode === "save_as_new_quote") {
      if (!existingId) return { ok: false, httpStatus: 400, error: "quote_id is required for save_as_new_quote (source row)." };
      const src = await fetchScopedInternalQuote(db, existingId, orgId, hasQuoteHeadersOrg);
      if (!src) return { ok: false, httpStatus: 404, error: "Source quote not found" };
      return await runFreshInsert(existingId);
    }
    if (saveMode === "create") {
      if (existingId) {
        return { ok: false, httpStatus: 400, error: "Remove quote_id for create, or use save_as_new_quote / update_existing." };
      }
      return await runFreshInsert(null);
    }
    /* default create path when saveMode defaulted */
    if (!saveModeRaw && !existingId) {
      return await runFreshInsert(null);
    }
    return { ok: false, httpStatus: 400, error: `Unknown save_mode: ${saveModeRaw}` };
  } catch (e) {
    if (isMissingRelationError(e)) throw e;
    return { ok: false, httpStatus: 500, error: String(e?.message || e) };
  }
}
