/**
 * Ensure a quote_headers row exists for Studio → Digital Estimate publishAtomic.
 *
 * quote_publications.source_quote_id FK → quote_headers(id). Studio estimates live in
 * studio_estimates only; without this bridge, hosted publish fails with Postgres 23503
 * and the Studio UI collapses to a generic 500.
 *
 * Bridge rows use quote_source = elite100_studio_bridge (not listed as Internal Estimate)
 * and are archived so Quote Library default lists exclude them. Publish eligibility still
 * uses the in-memory synthetic header (internal_quote), not this DB row.
 */

import {
  studioEstimateQuoteNumber,
  studioEstimatePublicationFamilyRoot
} from "./studioEstimatePublicationAdapter.mjs";

function deError(message, code, statusCode = 503) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Map Supabase / Postgres persistence failures to safe structured errors.
 * @param {unknown} e
 */
export function mapStudioPublicationPersistenceError(e) {
  if (e && typeof e === "object" && e.statusCode && e.code) {
    return e;
  }
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? e?.details ?? e?.hint ?? "").toLowerCase();
  if (
    code === "23503" ||
    msg.includes("quote_publications_source_quote_id_fkey") ||
    msg.includes("foreign key") ||
    msg.includes("violates foreign key")
  ) {
    return deError(
      "Publication storage is unavailable — Studio estimate is not linked for Digital Estimate publication.",
      "publication_source_missing",
      503
    );
  }
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  ) {
    return deError("Publication storage is unavailable.", "publication_storage_unavailable", 503);
  }
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return deError(
      "Publication storage conflict while linking the Studio estimate. Retry publish.",
      "publication_source_conflict",
      409
    );
  }
  if (
    code === "23514" ||
    msg.includes("check constraint") ||
    msg.includes("violates check") ||
    msg.includes("event_type")
  ) {
    return deError(
      "Configuration contract rejected by database. Apply eliteos_digital_estimate_configuration_updated_event_v1.sql if missing.",
      "DE-CONFIGURATION-CONTRACT-INVALID",
      422
    );
  }
  return deError("Publication storage is unavailable.", "publication_storage_unavailable", 503);
}

/**
 * Upsert a minimal quote_headers bridge row for the Studio estimate id.
 *
 * @param {{
 *   db?: { from: Function }|null,
 *   deRepository?: { seedQuote?: Function, mode?: string }|null,
 *   organizationId: string,
 *   estimate: object,
 *   syntheticHeader: object
 * }} input
 */
export async function ensureStudioEstimatePublicationSource(input) {
  const estimate = input.estimate;
  const synthetic = input.syntheticHeader;
  if (!estimate?.id) {
    throw deError("Studio estimate required", "estimate_required", 400);
  }

  const organizationId = str(input.organizationId);
  const revision = Number(estimate.revision) || 1;
  const baseNumber = studioEstimateQuoteNumber(estimate);
  // quote_number is globally unique — include revision so re-approvals of new estimate ids work.
  const quoteNumber = `${baseNumber}-R${revision}`;
  const customerDisplayTotal = Math.round(
    Number(
      estimate.approval?.customerDisplayTotal ??
        estimate.calculationSnapshot?.totals?.customerDisplayTotal ??
        0
    ) || 0
  );
  const scope = estimate.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const nowIso = new Date().toISOString();

  const bridgeRow = {
    id: estimate.id,
    organization_id: organizationId || null,
    quote_number: quoteNumber,
    quote_number_base: baseNumber,
    quote_source: "elite100_studio_bridge",
    quote_status: "approved",
    customer_name: str(scope.customerName) || null,
    project_name: str(scope.projectName) || null,
    project_address: str(scope.projectAddress) || null,
    estimated_material_group: str(scope.materialGroup) || "Group Promo",
    partner_account_id: null,
    calculation_snapshot: synthetic?.calculation_snapshot || {},
    revision_number: revision,
    revision_label: `R${revision}`,
    // Self-root only — intake case id is NOT a quote_headers id (FK on quote_headers.family).
    quote_family_root_id: estimate.id,
    is_current_revision: true,
    grand_total: customerDisplayTotal,
    // Hide from Quote Library default lists; DE publish uses synthetic header (not archived).
    archived_at: nowIso,
    archived_by: "elite100_studio_bridge",
    updated_at: nowIso
  };

  // Memory / test repositories: seed without Postgres.
  if (typeof input.deRepository?.seedQuote === "function" && !input.db) {
    input.deRepository.seedQuote({
      ...bridgeRow,
      quote_source: "internal_quote",
      archived_at: null,
      quote_family_root_id: studioEstimatePublicationFamilyRoot(estimate) || estimate.id
    });
    return { ok: true, mode: "memory", quoteId: estimate.id };
  }

  const db = input.db;
  if (!db || typeof db.from !== "function") {
    // Hosted publish requires Supabase; without db the FK insert will fail later.
    throw deError("Publication storage is unavailable.", "publication_storage_unavailable", 503);
  }

  let { error } = await db.from("quote_headers").upsert(bridgeRow, { onConflict: "id" });
  if (error && (String(error.code) === "23505" || /duplicate|unique/i.test(String(error.message || "")))) {
    // Global quote_number uniqueness — fall back to estimate-id based number.
    const shortId = String(estimate.id).replace(/-/g, "").slice(0, 12).toUpperCase();
    bridgeRow.quote_number = `SE-${shortId}-R${revision}`;
    bridgeRow.quote_number_base = `SE-${shortId}`;
    ({ error } = await db.from("quote_headers").upsert(bridgeRow, { onConflict: "id" }));
  }
  if (error) {
    throw mapStudioPublicationPersistenceError(error);
  }
  return { ok: true, mode: "supabase", quoteId: estimate.id };
}
