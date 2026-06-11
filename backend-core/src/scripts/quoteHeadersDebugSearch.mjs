#!/usr/bin/env node
/**
 * Targeted quote_headers debug search for support.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node backend-core/src/scripts/quoteHeadersDebugSearch.mjs Denger
 *   node backend-core/src/scripts/quoteHeadersDebugSearch.mjs "Interior Elements"
 *   node backend-core/src/scripts/quoteHeadersDebugSearch.mjs ESF-DYER-000061
 *   node backend-core/src/scripts/quoteHeadersDebugSearch.mjs Peg
 *
 * Examples documented in script header for Peg Reid / Denger investigations.
 */
import { createClient } from "@supabase/supabase-js";

import { tokenizeQuoteSearchQuery } from "../quotes/quoteLibrarySearch.js";

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function deriveAccountName(row) {
  const explicit = pickStr(row.account_name);
  if (explicit) return explicit;
  const snap = row.calculation_snapshot && typeof row.calculation_snapshot === "object" ? row.calculation_snapshot : {};
  const iu = snap.internal_ui && typeof snap.internal_ui === "object" ? snap.internal_ui : {};
  return pickStr(iu.account) || pickStr(row.customer_name) || pickStr(row.project_name) || null;
}

function rowMatchesTerm(row, term) {
  const t = term.toLowerCase();
  const hay = [
    row.quote_number,
    row.quote_number_base,
    row.quote_source,
    row.quote_status,
    row.customer_name,
    row.account_name,
    row.project_name,
    row.project_address,
    row.city,
    row.state,
    row.zip,
    row.sales_rep,
    row.prepared_by,
    row.created_by,
    deriveAccountName(row),
    row.calculation_snapshot?.internal_ui?.project_name,
    row.calculation_snapshot?.internal_ui?.account
  ]
    .map((v) => pickStr(v).toLowerCase())
    .filter(Boolean);

  if (hay.some((v) => v.includes(t))) return true;

  try {
    const snapText = JSON.stringify(row.calculation_snapshot ?? {}).toLowerCase();
    return snapText.includes(t);
  } catch {
    return false;
  }
}

function mapResultRow(row) {
  return {
    id: row.id,
    quote_number: row.quote_number ?? null,
    quote_number_base: row.quote_number_base ?? null,
    account_name: deriveAccountName(row),
    project_name: row.project_name ?? null,
    customer_name: row.customer_name ?? null,
    created_by: row.created_by ?? null,
    prepared_by: row.prepared_by ?? null,
    sales_rep: row.sales_rep ?? null,
    created_at: row.created_at ?? null,
    revision_number: row.revision_number ?? null,
    revision_label: row.revision_label ?? null,
    is_current_revision: row.is_current_revision ?? null,
    quote_family_root_id: row.quote_family_root_id ?? null
  };
}

async function fetchCandidates(supabase, query) {
  const tokens = tokenizeQuoteSearchQuery(query);
  if (!tokens.length) return [];

  const pageSize = 500;
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();

  for (const term of tokens) {
    const pat = `%${term}%`;
    let q = supabase
      .from("quote_headers")
      .select(
        "id,quote_number,quote_number_base,quote_family_root_id,is_current_revision,revision_number,revision_label," +
          "quote_source,quote_status,customer_name,account_name,project_name,project_address,city,state,zip," +
          "sales_rep,prepared_by,created_by,created_at,calculation_snapshot"
      )
      .or(
        `customer_name.ilike.${pat},account_name.ilike.${pat},project_name.ilike.${pat},project_address.ilike.${pat},` +
          `quote_number.ilike.${pat},quote_number_base.ilike.${pat},prepared_by.ilike.${pat},created_by.ilike.${pat},` +
          `sales_rep.ilike.${pat},city.ilike.${pat},state.ilike.${pat},zip.ilike.${pat}`
      )
      .limit(pageSize);
    const { data, error } = await q;
    if (error) throw error;
    for (const row of data || []) byId.set(String(row.id), row);
  }

  const all = [...byId.values()];
  return all
    .filter((row) => tokens.every((term) => rowMatchesTerm(row, term)))
    .map(mapResultRow)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error("Usage: node quoteHeadersDebugSearch.mjs <query>");
    console.error("Examples: Denger | Interior Elements | Lisa Manternach | Peg | ESF-DYER-000061");
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const results = await fetchCandidates(supabase, query);
  console.log(
    JSON.stringify(
      {
        ok: true,
        query,
        match_count: results.length,
        results
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("quoteHeadersDebugSearch failed:", e?.message || e);
  process.exit(1);
});
