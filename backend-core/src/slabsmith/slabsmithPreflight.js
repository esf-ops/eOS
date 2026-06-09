/**
 * slabsmithPreflight — read-only Supabase readiness checks before Slabsmith writes.
 *
 * SCOPE / SAFETY:
 *   - SELECT / count queries only. Never insert, update, delete, or upsert.
 *   - Requires service-role Supabase client injected by caller.
 *   - No SlabCloud persistence changes.
 */

import { SLABSMITH_EXTERNAL_SOURCE } from "./normalizeSlabsmithInventory.js";
import {
  DEFAULT_EXTERNAL_COMPANY_CODE,
  fetchExistingSlabsmithInventory,
} from "./slabsmithPersistence.js";
import {
  formatSupabaseError,
  TABLE_INVENTORY,
  TABLE_RAW_RECORDS,
  TABLE_SYNC_RUNS,
} from "../slabcloud/slabCloudPersistence.js";

export const SLABCLOUD_EXTERNAL_SOURCE = "slabcloud";

/**
 * Validate preflight environment. Requires SLABOS_ORGANIZATION_ID (no fallback).
 */
export function validatePreflightEnv(env = process.env) {
  /** @type {string[]} */
  const missing = [];
  if (!env.SUPABASE_URL?.trim()) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env.SLABOS_ORGANIZATION_ID?.trim()) missing.push("SLABOS_ORGANIZATION_ID");
  if (missing.length) {
    throw new Error(`Preflight requires: ${missing.join(", ")}`);
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} tableName
 * @param {string|null} organizationId
 */
export async function probeTableReadable(db, tableName, organizationId = null) {
  try {
    let q = db.from(tableName).select("id", { head: true, count: "exact" }).limit(0);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { count, error } = await q;
    if (error) {
      return { readable: false, count: null, error: formatSupabaseError(error) };
    }
    return { readable: true, count: Number(count ?? 0), error: null };
  } catch (err) {
    return { readable: false, count: null, error: String(err?.message || err) };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string|null} externalSource
 */
export async function countInventoryForOrg(db, organizationId, externalSource = null) {
  let q = db
    .from(TABLE_INVENTORY)
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", organizationId)
    .limit(0);
  if (externalSource) q = q.eq("external_source", externalSource);
  const { count, error } = await q;
  if (error) throw new Error(formatSupabaseError(error));
  return Number(count ?? 0);
}

/**
 * Count slab_inventory rows grouped by external_source for an org (read-only).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
export async function countInventoryByExternalSource(db, organizationId) {
  const { data, error } = await db
    .from(TABLE_INVENTORY)
    .select("external_source")
    .eq("organization_id", organizationId);
  if (error) throw new Error(formatSupabaseError(error));

  /** @type {Record<string, number>} */
  const bySource = {};
  for (const row of data ?? []) {
    const key = String(row?.external_source ?? "(none)");
    bySource[key] = (bySource[key] || 0) + 1;
  }
  return bySource;
}

/**
 * Count incoming rows whose external_slab_id already exists in slabsmith cache (pure).
 * @param {Array<{ external_slab_id?: string|null }>} incomingRows
 * @param {Array<{ external_slab_id?: string|null }>} existingRows
 */
export function countIncomingMatchingExistingSlabsmith(incomingRows, existingRows) {
  const existingIds = new Set(
    (existingRows ?? [])
      .map((r) => String(r?.external_slab_id ?? "").trim())
      .filter(Boolean)
  );
  let matches = 0;
  for (const row of Array.isArray(incomingRows) ? incomingRows : []) {
    const id = String(row?.external_slab_id ?? "").trim();
    if (id && existingIds.has(id)) matches += 1;
  }
  return matches;
}

/**
 * Build safe_to_write recommendation from preflight facts (pure).
 * @param {object} params
 */
export function buildPreflightRecommendation({
  tablesReadable,
  incomingRowCount = 0,
  needsReviewCount = 0,
  existingSlabcloudCount = 0,
}) {
  /** @type {string[]} */
  const unreadable = [];
  for (const [table, probe] of Object.entries(tablesReadable ?? {})) {
    if (!probe?.readable) unreadable.push(table);
  }

  if (unreadable.length) {
    const details = unreadable
      .map((t) => `${t} (${tablesReadable[t]?.error ?? "not readable"})`)
      .join("; ");
    return {
      safe_to_write: false,
      reason: `Cache tables not readable: ${details}`,
    };
  }

  if (incomingRowCount <= 0) {
    return {
      safe_to_write: false,
      reason: "No incoming Slabsmith rows to write.",
    };
  }

  /** @type {string[]} */
  const notes = ["Cache tables are readable and incoming XML parsed successfully."];
  if (existingSlabcloudCount > 0) {
    notes.push(
      `Org already has ${existingSlabcloudCount} slabcloud cache row(s) — Slab Inventory head will show mixed external_source values until operators understand the separation.`
    );
  }
  if (needsReviewCount > 0) {
    notes.push(`${needsReviewCount} incoming row(s) have unknown/missing Type (needs_review).`);
  }

  return {
    safe_to_write: true,
    reason: notes.join(" "),
  };
}

/**
 * @param {object} report
 */
export function formatPreflightReport(report) {
  const lines = [
    "Slabsmith inventory import — PREFLIGHT (read-only, no mutations)",
    "",
    `organization_id: ${report.organization_id}`,
    "",
    "table readiness:",
    `  slabcloud_sync_runs: ${report.tables.slabcloud_sync_runs.readable ? "readable" : "NOT READABLE"}${report.tables.slabcloud_sync_runs.error ? ` (${report.tables.slabcloud_sync_runs.error})` : ""}`,
    `  slab_inventory_raw_records: ${report.tables.slab_inventory_raw_records.readable ? "readable" : "NOT READABLE"}${report.tables.slab_inventory_raw_records.error ? ` (${report.tables.slab_inventory_raw_records.error})` : ""}`,
    `  slab_inventory: ${report.tables.slab_inventory.readable ? "readable" : "NOT READABLE"}${report.tables.slab_inventory.error ? ` (${report.tables.slab_inventory.error})` : ""}`,
    "",
    "existing slab_inventory (organization):",
    ...Object.entries(report.existing.by_external_source)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([source, count]) => `  ${source}: ${count}`),
    `  total: ${report.existing.total}`,
    `  external_source=slabsmith: ${report.existing.slabsmith}`,
    `  external_source=slabcloud: ${report.existing.slabcloud}`,
    "",
    `incoming rows (XML): ${report.incoming.row_count}`,
    "incoming source_inventory_type:",
    ...formatCountLines(report.incoming.by_source_inventory_type),
    "incoming source_price_group:",
    ...formatCountLines(report.incoming.by_source_price_group),
    "",
    `incoming matching existing slabsmith external_slab_id: ${report.incoming.matching_existing_slabsmith}`,
    `incoming needs_review: ${report.incoming.needs_review}`,
    "",
  ];

  if (report.duplicate_source_risk.has_existing_slabcloud_rows) {
    lines.push("duplicate/source risk:");
    lines.push(`  ${report.duplicate_source_risk.message}`);
    lines.push("");
  }

  lines.push(`recommendation.safe_to_write: ${report.recommendation.safe_to_write}`);
  lines.push(`recommendation.reason: ${report.recommendation.reason}`);

  return lines.join("\n");
}

/**
 * @param {Record<string, number>|undefined} counts
 * @returns {string[]}
 */
function formatCountLines(counts) {
  const entries = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) return ["  (none)"];
  return entries.map(([key, count]) => `  ${key}: ${count}`);
}

/**
 * Run read-only Supabase preflight checks.
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.db
 * @param {string} params.organizationId
 * @param {Array<Record<string, unknown>>} params.incomingRows
 * @param {object} [params.config]
 * @param {import("./normalizeSlabsmithInventory.js").summarizeSlabsmithRows} [params.summarizeIncoming]
 */
export async function runSlabsmithPreflight({
  db,
  organizationId,
  incomingRows = [],
  config = {},
  summarizeIncoming,
}) {
  if (!db) throw new Error("runSlabsmithPreflight: db required");
  if (!organizationId) throw new Error("runSlabsmithPreflight: organizationId required");

  const companyCode = config.externalCompanyCode || DEFAULT_EXTERNAL_COMPANY_CODE;

  const [syncRuns, rawRecords, inventory] = await Promise.all([
    probeTableReadable(db, TABLE_SYNC_RUNS, organizationId),
    probeTableReadable(db, TABLE_RAW_RECORDS, organizationId),
    probeTableReadable(db, TABLE_INVENTORY, organizationId),
  ]);

  const tablesReadable = {
    slabcloud_sync_runs: syncRuns,
    slab_inventory_raw_records: rawRecords,
    slab_inventory: inventory,
  };

  let byExternalSource = {};
  let existingSlabcloud = 0;
  let existingSlabsmith = 0;

  if (inventory.readable) {
    byExternalSource = await countInventoryByExternalSource(db, organizationId);
    existingSlabcloud = byExternalSource[SLABCLOUD_EXTERNAL_SOURCE] ?? 0;
    existingSlabsmith = byExternalSource[SLABSMITH_EXTERNAL_SOURCE] ?? 0;
  }

  const incomingSummary =
    typeof summarizeIncoming === "function"
      ? summarizeIncoming(incomingRows)
      : { by_type: {}, by_source_price_group: {}, needs_review: 0, row_count: incomingRows.length };

  const incomingIds = incomingRows.map((r) => r.external_slab_id).filter(Boolean);
  let existingMatches = [];
  if (inventory.readable && incomingIds.length) {
    existingMatches = await fetchExistingSlabsmithInventory(
      db,
      organizationId,
      companyCode,
      incomingIds
    );
  }

  const matchingExisting = countIncomingMatchingExistingSlabsmith(incomingRows, existingMatches);

  const duplicateSourceRisk = {
    has_existing_slabcloud_rows: existingSlabcloud > 0,
    existing_slabcloud_count: existingSlabcloud,
    message: existingSlabcloud
      ? `Organization already has ${existingSlabcloud} slabcloud cache row(s). Slabsmith writes use external_source="${SLABSMITH_EXTERNAL_SOURCE}" and will not overwrite SlabCloud rows, but the Slab Inventory head aggregates all sources for the org.`
      : null,
  };

  const recommendation = buildPreflightRecommendation({
    tablesReadable,
    incomingRowCount: incomingRows.length,
    needsReviewCount: incomingSummary.needs_review ?? 0,
    existingSlabcloudCount: existingSlabcloud,
  });

  return {
    organization_id: organizationId,
    tables: tablesReadable,
    existing: {
      by_external_source: byExternalSource,
      total: Object.values(byExternalSource).reduce((sum, n) => sum + n, 0),
      slabsmith: existingSlabsmith,
      slabcloud: existingSlabcloud,
    },
    incoming: {
      row_count: incomingRows.length,
      by_source_inventory_type: incomingSummary.by_type ?? {},
      by_source_price_group: incomingSummary.by_source_price_group ?? {},
      matching_existing_slabsmith: matchingExisting,
      needs_review: incomingSummary.needs_review ?? 0,
    },
    duplicate_source_risk: duplicateSourceRisk,
    recommendation,
  };
}
