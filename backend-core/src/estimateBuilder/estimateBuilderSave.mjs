/**
 * Estimate Builder durable save — shared `quote_headers` persistence via the existing Quote Library writers.
 *
 * Save modes mirror Internal Estimate Phase 2 semantics (internalQuoteSave.js), scoped to
 * quote_source `estimate_builder`:
 *  - create          → ESF quote number (R1), new revision family
 *  - update_existing → re-price + replace snapshot/lines on the current revision only
 *  - save_revision   → prior revisions frozen (is_current_revision=false), new row R{n+1}
 *
 * Pricing is always recomputed server-side from the posted item document; client totals are ignored.
 * Monday sync is skipped (no external write enablement for this source).
 */

import { patchPrintSnapshotQuoteNumber } from "../quoteDelivery/customerEstimatePrintSnapshot.js";
import { organizationScopeOrFilter, tableHasOrganizationId } from "../organizations/organizationContext.js";
import { fetchEliteProgramMaterialColors } from "../quotes/materialColorsCatalog.js";
import * as esf from "../quotes/quoteEsfNumber.js";
import { generateQuoteNumber, persistQuoteSubmission, replaceQuoteLinesAndRooms } from "../quotes/quotePersist.js";
import { normalizeEstimateDocument } from "./estimateBuilderContracts.mjs";
import { priceEstimateDocument } from "./estimateBuilderPricing.mjs";
import { ESTIMATE_BUILDER_QUOTE_SOURCE, buildQuoteLibraryArtifacts } from "./estimateBuilderQuoteLibrary.mjs";

export const ESTIMATE_BUILDER_STATUSES = new Set(["draft", "testing_review", "sent", "follow_up", "revised", "sold", "lost"]);
const FINAL_STATUSES = new Set(["testing_review", "sent", "follow_up", "sold"]);

function scope(qb, orgId, hasOrg) {
  if (!orgId || !hasOrg) return qb;
  const filt = organizationScopeOrFilter(orgId);
  return filt ? qb.or(filt) : qb;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} id
 * @param {string|null} orgId
 * @param {boolean} hasOrg
 */
export async function fetchScopedEstimateBuilderQuote(db, id, orgId, hasOrg) {
  let qb = db.from("quote_headers").select("*").eq("id", id).eq("quote_source", ESTIMATE_BUILDER_QUOTE_SOURCE).limit(1);
  qb = scope(qb, orgId, hasOrg);
  const { data, error } = await qb;
  if (error) throw error;
  return data?.[0] ?? null;
}

function revisionNote(body) {
  const s = String(body.revision_note ?? body.revisionNote ?? "").trim();
  return s ? s.slice(0, 4000) : null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{
 *   body: Record<string, unknown>,
 *   userEmail: string,
 *   organizationContext: { organizationId?: string|null } | null,
 *   materialColors?: Array<Record<string, unknown>>
 * }} opts
 */
export async function processEstimateBuilderSave(db, opts) {
  const body = opts.body && typeof opts.body === "object" ? opts.body : {};
  const userEmail = String(opts.userEmail || "unknown");
  const orgId = opts.organizationContext?.organizationId ? String(opts.organizationContext.organizationId) : null;
  const hasOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;

  const doc = normalizeEstimateDocument(body.document);
  const rawStatus = String(body.quote_status ?? "draft").trim();
  const quoteStatus = ESTIMATE_BUILDER_STATUSES.has(rawStatus) ? rawStatus : "draft";
  const existingId = String(body.quote_id ?? "").trim();
  const saveMode = String(body.save_mode ?? (existingId ? "update_existing" : "create")).trim();

  const materialColors = opts.materialColors ?? (await fetchEliteProgramMaterialColors(db)).colors;
  const pricing = await priceEstimateDocument(doc, { materialColors });
  if (FINAL_STATUSES.has(quoteStatus) && !pricing.readiness.ready) {
    return { ok: false, httpStatus: 422, error: "Estimate is not ready to finalize.", blockers: pricing.readiness.blockers, pricing };
  }
  if (!doc.items.length) {
    return { ok: false, httpStatus: 422, error: "Add at least one item before saving.", pricing };
  }

  const build = (quoteNumber) => {
    const artifacts = buildQuoteLibraryArtifacts(doc, pricing, { quoteNumber });
    artifacts.snapshotToStore = patchPrintSnapshotQuoteNumber(artifacts.snapshotToStore, quoteNumber);
    return artifacts;
  };

  const persist = async (quoteNumber, headerExtras) => {
    const { saveBody, calc, snapshotToStore } = build(quoteNumber);
    const { quoteId } = await persistQuoteSubmission(db, {
      body: saveBody,
      calc,
      userEmail,
      quoteNumber,
      quoteSource: ESTIMATE_BUILDER_QUOTE_SOURCE,
      quoteStatus,
      snapshotToStore,
      estimatesByGroup: null,
      assignment: null,
      publicResponsePayload: null,
      organizationContext: opts.organizationContext ?? null,
      internalEstimateSummary: null,
      pricingModeLabel: doc.pricingChannel === "wholesale" ? "Wholesale" : "Direct",
      headerExtras,
      skipMondaySync: true
    });
    return quoteId;
  };

  if (saveMode === "create") {
    if (existingId) return { ok: false, httpStatus: 400, error: "Remove quote_id for create." };
    const bp = esf.branchPrefixFromBranchLabel(doc.header.branch);
    let quoteNumber;
    let quoteNumberBase = null;
    try {
      const seq = await esf.allocateEsfSequence(db, esf.organizationKeyForQuotes(orgId), bp);
      quoteNumberBase = esf.formatEsfQuoteNumberBase(bp, seq);
      quoteNumber = esf.quoteNumberForRevision(quoteNumberBase, 1);
    } catch {
      quoteNumber = generateQuoteNumber();
    }
    const quoteId = await persist(quoteNumber, {
      revision_number: 1,
      revision_label: "R1",
      quote_number_base: quoteNumberBase,
      is_current_revision: true,
      revision_note: revisionNote(body)
    });
    let ub = db
      .from("quote_headers")
      .update({ quote_family_root_id: quoteId, updated_at: new Date().toISOString() })
      .eq("id", quoteId)
      .eq("quote_source", ESTIMATE_BUILDER_QUOTE_SOURCE);
    ub = scope(ub, orgId, hasOrg);
    const { error } = await ub;
    if (error) throw error;
    return { ok: true, quoteId, quoteNumber, revisionNumber: 1, revisionLabel: "R1", saveMode, quoteStatus, pricing };
  }

  if (!existingId) return { ok: false, httpStatus: 400, error: `quote_id is required for ${saveMode}` };
  const row = await fetchScopedEstimateBuilderQuote(db, existingId, orgId, hasOrg);
  if (!row) return { ok: false, httpStatus: 404, error: "Not found" };
  if (row.archived_at) return { ok: false, httpStatus: 400, error: "Quote is archived — restore it in Quote Library before editing." };
  if (row.is_current_revision === false) {
    return { ok: false, httpStatus: 409, error: "This is a historical revision. Open the latest revision to edit." };
  }

  if (saveMode === "update_existing") {
    const { saveBody, calc, snapshotToStore } = build(row.quote_number);
    const updates = {
      quote_status: quoteStatus,
      customer_name: saveBody.customer_name,
      customer_email: saveBody.customer_email,
      customer_phone: saveBody.customer_phone,
      account_name: saveBody.account_name,
      project_name: saveBody.project_name,
      project_address: saveBody.project_address,
      city: saveBody.city,
      state: saveBody.state,
      zip: saveBody.zip,
      sales_rep: saveBody.sales_rep,
      branch: saveBody.branch,
      prepared_by: saveBody.prepared_by,
      notes_length: saveBody.notes ? saveBody.notes.length : null,
      subtotal: calc.totals.wholesale,
      markup_total: 0,
      grand_total: calc.totals.retail,
      estimated_sqft: calc.totals.estimated_sqft,
      calculation_snapshot: snapshotToStore,
      updated_at: new Date().toISOString()
    };
    let ub = db.from("quote_headers").update(updates).eq("id", existingId).eq("quote_source", ESTIMATE_BUILDER_QUOTE_SOURCE);
    ub = scope(ub, orgId, hasOrg);
    const { error } = await ub;
    if (error) throw error;
    await replaceQuoteLinesAndRooms(db, {
      quoteId: existingId,
      body: saveBody,
      calc,
      organizationContext: opts.organizationContext ?? null,
      quoteSource: ESTIMATE_BUILDER_QUOTE_SOURCE
    });
    if (row.quote_status !== quoteStatus) {
      await db.from("quote_status_history").insert({
        quote_id: existingId,
        old_status: row.quote_status,
        new_status: quoteStatus,
        changed_by: userEmail,
        metadata: { quote_source: ESTIMATE_BUILDER_QUOTE_SOURCE, save_mode: "update_existing" }
      });
    }
    await db.from("quote_calculation_audit").insert({
      quote_id: existingId,
      pricing_structure_id: null,
      input_payload: { document: doc },
      output_payload: calc,
      created_by: userEmail
    });
    return {
      ok: true,
      quoteId: existingId,
      quoteNumber: row.quote_number,
      revisionNumber: row.revision_number ?? 1,
      revisionLabel: row.revision_label ?? "R1",
      saveMode,
      quoteStatus,
      pricing
    };
  }

  if (saveMode === "save_revision") {
    const root = String(row.quote_family_root_id || row.id);
    const base = esf.deriveQuoteNumberBaseFromRow(row);
    if (!base) return { ok: false, httpStatus: 400, error: "Cannot determine the quote number base for a revision." };
    let fam = db
      .from("quote_headers")
      .select("revision_number")
      .eq("quote_source", ESTIMATE_BUILDER_QUOTE_SOURCE)
      .or(`id.eq.${root},quote_family_root_id.eq.${root}`);
    fam = scope(fam, orgId, hasOrg);
    const { data: famRows, error: famErr } = await fam;
    if (famErr) throw famErr;
    const nextRev = Math.max(1, ...(famRows || []).map((r) => Number(r.revision_number) || 1)) + 1;
    let mark = db
      .from("quote_headers")
      .update({ is_current_revision: false, updated_at: new Date().toISOString() })
      .eq("quote_source", ESTIMATE_BUILDER_QUOTE_SOURCE)
      .or(`id.eq.${root},quote_family_root_id.eq.${root}`);
    mark = scope(mark, orgId, hasOrg);
    const { error: markErr } = await mark;
    if (markErr) throw markErr;
    const quoteNumber = esf.quoteNumberForRevision(base, nextRev);
    const revisionLabel = esf.revisionLabelFromNumber(nextRev);
    const quoteId = await persist(quoteNumber, {
      quote_family_root_id: root,
      revision_number: nextRev,
      revision_label: revisionLabel,
      quote_number_base: base,
      is_current_revision: true,
      revised_from_quote_id: row.id,
      revision_note: revisionNote(body)
    });
    return { ok: true, quoteId, quoteNumber, revisionNumber: nextRev, revisionLabel, saveMode, quoteStatus, pricing };
  }

  return { ok: false, httpStatus: 400, error: `Unknown save_mode: ${saveMode}` };
}

/**
 * Extract the canonical item document from a saved row (for reopening in the builder).
 * @param {Record<string, any>} row
 */
export function estimateDocumentFromQuoteRow(row) {
  const eb = row?.calculation_snapshot?.estimate_builder;
  if (!eb || typeof eb !== "object" || !eb.document) return null;
  return normalizeEstimateDocument(eb.document);
}
