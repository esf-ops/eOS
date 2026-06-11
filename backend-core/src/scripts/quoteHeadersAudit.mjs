#!/usr/bin/env node
/**
 * Quote headers reliability audit — support/admin reporting.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node backend-core/src/scripts/quoteHeadersAudit.mjs
 *   node backend-core/src/scripts/quoteHeadersAudit.mjs --organization-id=<uuid>
 */
import { createClient } from "@supabase/supabase-js";

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function parseOrgArg() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--organization-id=")) return arg.slice("--organization-id=".length).trim();
  }
  return "";
}

async function fetchAllQuoteHeaders(supabase, organizationId) {
  const pageSize = 1000;
  let offset = 0;
  /** @type {Record<string, unknown>[]} */
  const rows = [];
  for (;;) {
    let q = supabase
      .from("quote_headers")
      .select(
        "id,quote_number,quote_number_base,quote_family_root_id,is_current_revision,created_at,updated_at,calculation_snapshot,organization_id"
      )
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

function auditRows(rows) {
  const quoteNumbers = new Map();
  /** @type {Map<string, Record<string, unknown>[]>} */
  const families = new Map();

  for (const row of rows) {
    const qn = pickStr(row.quote_number);
    if (qn) {
      if (!quoteNumbers.has(qn)) quoteNumbers.set(qn, []);
      quoteNumbers.get(qn).push(row.id);
    }
    const root = pickStr(row.quote_family_root_id) || pickStr(row.id);
    if (!families.has(root)) families.set(root, []);
    families.get(root).push(row);
  }

  const duplicateQuoteNumbers = [...quoteNumbers.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([qn, ids]) => ({ quote_number: qn, count: ids.length, ids }));

  const familiesZeroCurrent = [];
  const familiesMultiCurrent = [];
  for (const [root, members] of families.entries()) {
    const current = members.filter((m) => m.is_current_revision === true);
    if (!current.length) familiesZeroCurrent.push({ quote_family_root_id: root, member_count: members.length });
    if (current.length > 1) familiesMultiCurrent.push({ quote_family_root_id: root, current_count: current.length });
  }

  const missingSnapshot = rows.filter((r) => !r.calculation_snapshot || typeof r.calculation_snapshot !== "object");
  const missingQuoteNumber = rows.filter((r) => !pickStr(r.quote_number));
  const missingCreatedAt = rows.filter((r) => !pickStr(r.created_at));

  const currentRevisions = rows.filter((r) => r.is_current_revision === true).length;
  const oldRevisions = rows.filter((r) => r.is_current_revision === false).length;

  const sortedByCreated = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  return {
    total: rows.length,
    current_revision_count: currentRevisions,
    old_revision_count: oldRevisions,
    duplicate_quote_numbers: duplicateQuoteNumbers,
    families_zero_current: familiesZeroCurrent,
    families_multi_current: familiesMultiCurrent,
    missing_calculation_snapshot: missingSnapshot.map((r) => ({
      id: r.id,
      quote_number: r.quote_number ?? null
    })),
    missing_quote_number: missingQuoteNumber.map((r) => ({ id: r.id, created_at: r.created_at ?? null })),
    missing_created_at: missingCreatedAt.map((r) => ({ id: r.id, quote_number: r.quote_number ?? null })),
    oldest_quote: sortedByCreated[0]
      ? { id: sortedByCreated[0].id, quote_number: sortedByCreated[0].quote_number, created_at: sortedByCreated[0].created_at }
      : null,
    newest_quote: sortedByCreated.length
      ? {
          id: sortedByCreated[sortedByCreated.length - 1].id,
          quote_number: sortedByCreated[sortedByCreated.length - 1].quote_number,
          created_at: sortedByCreated[sortedByCreated.length - 1].created_at
        }
      : null
  };
}

async function main() {
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const organizationId = parseOrgArg();
  const supabase = createClient(
    process.env.SUPABASE_URL.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const rows = await fetchAllQuoteHeaders(supabase, organizationId);
  const report = auditRows(rows);

  console.log(JSON.stringify({ ok: true, organization_id: organizationId || null, ...report }, null, 2));
}

main().catch((e) => {
  console.error("quoteHeadersAudit failed:", e?.message || e);
  process.exit(1);
});
