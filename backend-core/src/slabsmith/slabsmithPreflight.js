/**
 * slabsmithPreflight — read-only Supabase readiness checks before Slabsmith writes.
 *
 * SCOPE / SAFETY:
 *   - SELECT / count queries only. Never insert, update, delete, or upsert.
 *   - Requires service-role Supabase client injected by caller.
 *   - No SlabCloud persistence changes.
 *
 * COUNTING:
 *   Source breakdowns use head/count queries (never unbounded row fetches) so orgs
 *   with >1000 slab_inventory rows report accurate external_source totals.
 */

import {
  SLABSMITH_EXTERNAL_SOURCE,
  SLABSMITH_SOURCE_SCOPE,
} from "./normalizeSlabsmithInventory.js";
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

/** Typed inventory rows included in Slab Inventory program views. */
export const TYPED_INVENTORY_TYPES = Object.freeze(["Slab", "Remnant"]);

/** Known external_source values reported explicitly in preflight breakdowns. */
export const KNOWN_INVENTORY_SOURCES = Object.freeze([
  SLABCLOUD_EXTERNAL_SOURCE,
  SLABSMITH_EXTERNAL_SOURCE,
]);

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
 * Exact count for org (+ optional external_source). Uses head/count — no row fetch limit.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string|null} externalSource
 * @param {{ activeOnly?: boolean|null, typedOnly?: boolean }} [options]
 */
export async function countInventoryForOrg(
  db,
  organizationId,
  externalSource = null,
  options = {}
) {
  let q = db
    .from(TABLE_INVENTORY)
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", organizationId)
    .limit(0);

  if (externalSource) q = q.eq("external_source", externalSource);

  const { activeOnly = null, typedOnly = false } = options;
  if (activeOnly === true) q = q.eq("is_active", true);
  if (activeOnly === false) q = q.eq("is_active", false);
  if (typedOnly) {
    q = q
      .eq("source_inventory_scope", SLABSMITH_SOURCE_SCOPE)
      .in("source_inventory_type", [...TYPED_INVENTORY_TYPES]);
  }

  const { count, error } = await q;
  if (error) throw new Error(formatSupabaseError(error));
  return Number(count ?? 0);
}

/**
 * Aggregate external_source counts from fetched rows (legacy / diagnostic only).
 * WARNING: Supabase defaults to 1000 rows per select — this under-counts when
 * org inventory exceeds that limit unless caller paginates.
 *
 * @param {Array<{ external_source?: string|null }>} rows
 */
export function aggregateSourceCountsFromFetchedRows(rows) {
  /** @type {Record<string, number>} */
  const bySource = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.external_source ?? "(none)");
    bySource[key] = (bySource[key] || 0) + 1;
  }
  return bySource;
}

/**
 * @deprecated Prefer buildInventorySourceBreakdown — subject to Supabase row-limit truncation.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
export async function countInventoryByExternalSource(db, organizationId) {
  const breakdown = await buildInventorySourceBreakdown(db, organizationId);
  return breakdown.total_by_external_source;
}

/**
 * Exact inventory counts grouped by external_source for an org (read-only).
 * Uses parallel head/count queries — safe for orgs with thousands of rows.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
export async function buildInventorySourceBreakdown(db, organizationId) {
  const [totalOrg, ...knownTotals] = await Promise.all([
    countInventoryForOrg(db, organizationId),
    ...KNOWN_INVENTORY_SOURCES.map((source) =>
      countInventoryForOrg(db, organizationId, source)
    ),
  ]);

  /** @type {Record<string, number>} */
  const total_by_external_source = {};
  KNOWN_INVENTORY_SOURCES.forEach((source, index) => {
    total_by_external_source[source] = knownTotals[index];
  });

  const knownSum = knownTotals.reduce((sum, n) => sum + n, 0);
  const otherCount = totalOrg - knownSum;
  if (otherCount > 0) {
    total_by_external_source["(other)"] = otherCount;
  }

  const activeEntries = await Promise.all(
    KNOWN_INVENTORY_SOURCES.map(async (source) => [
      source,
      await countInventoryForOrg(db, organizationId, source, { activeOnly: true }),
    ])
  );
  /** @type {Record<string, number>} */
  const active_by_external_source = Object.fromEntries(activeEntries);

  const typedEntries = await Promise.all(
    KNOWN_INVENTORY_SOURCES.map(async (source) => [
      source,
      await countInventoryForOrg(db, organizationId, source, { typedOnly: true }),
    ])
  );
  /** @type {Record<string, number>} */
  const typed_by_external_source = Object.fromEntries(typedEntries);

  return {
    total_by_external_source,
    active_by_external_source,
    typed_by_external_source,
    total: totalOrg,
    slabsmith: total_by_external_source[SLABSMITH_EXTERNAL_SOURCE] ?? 0,
    slabcloud: total_by_external_source[SLABCLOUD_EXTERNAL_SOURCE] ?? 0,
  };
}

/**
 * Detect inconsistent preflight facts (e.g. truncated row fetch vs exact ID match).
 * @param {object} params
 */
export function detectPreflightCountMismatch({
  existingSlabsmithTotal = 0,
  matchingIncomingSlabsmith = 0,
  existingSlabsmithRowsMatched = 0,
}) {
  /** @type {string[]} */
  const warnings = [];

  if (matchingIncomingSlabsmith > 0 && existingSlabsmithTotal === 0) {
    warnings.push(
      "Incoming rows match existing slabsmith external_slab_id values, but slabsmith total count is 0 — source counts and ID matching filters may be inconsistent."
    );
  }

  if (
    existingSlabsmithRowsMatched > 0 &&
    existingSlabsmithTotal > 0 &&
    existingSlabsmithRowsMatched > existingSlabsmithTotal
  ) {
    warnings.push(
      "Matched slabsmith row count exceeds slabsmith total count — recount or filter mismatch."
    );
  }

  return warnings;
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
 * Summarize incoming vs existing slabsmith ID overlap (pure).
 * @param {Array<{ external_slab_id?: string|null }>} incomingRows
 * @param {Array<{ external_slab_id?: string|null }>} existingRows
 */
export function summarizeSlabsmithIdMatches(incomingRows, existingRows) {
  return {
    matching_incoming_rows: countIncomingMatchingExistingSlabsmith(incomingRows, existingRows),
    existing_slabsmith_rows_matched: (existingRows ?? []).length,
    incoming_row_count: Array.isArray(incomingRows) ? incomingRows.length : 0,
  };
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
  existingSlabsmithCount = 0,
  matchingIncomingSlabsmith = 0,
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

  if (existingSlabsmithCount > 0 && matchingIncomingSlabsmith >= incomingRowCount) {
    notes.push(
      `Org already has ${existingSlabsmithCount} slabsmith cache row(s); incoming XML fully overlaps existing slabsmith external_slab_id values (re-import/update scenario).`
    );
  } else if (existingSlabsmithCount > 0) {
    notes.push(`Org already has ${existingSlabsmithCount} slabsmith cache row(s).`);
  }

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
 * @param {Record<string, number>|undefined} counts
 * @returns {string[]}
 */
function formatCountLines(counts) {
  const entries = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) return ["  (none)"];
  return entries.map(([key, count]) => `  ${key}: ${count}`);
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
    "existing slab_inventory counts (exact, organization_id scoped):",
    "  total by external_source (all rows, active + inactive):",
    ...formatCountLines(report.existing.total_by_external_source),
    `  org total: ${report.existing.total}`,
    `  external_source=slabsmith: ${report.existing.slabsmith}`,
    `  external_source=slabcloud: ${report.existing.slabcloud}`,
    "",
    "  active by external_source:",
    ...formatCountLines(report.existing.active_by_external_source),
    "",
    "  typed by external_source (source_inventory_scope=typed, Slab|Remnant):",
    ...formatCountLines(report.existing.typed_by_external_source),
    "",
    `incoming rows (XML): ${report.incoming.row_count}`,
    "incoming source_inventory_type:",
    ...formatCountLines(report.incoming.by_source_inventory_type),
    "incoming source_price_group:",
    ...formatCountLines(report.incoming.by_source_price_group),
    "",
    "slabsmith external_slab_id overlap (filters: external_source=slabsmith, external_company_code):",
    `  incoming matching existing slabsmith external_slab_id: ${report.incoming.matching_existing_slabsmith}`,
    `  existing slabsmith rows matched (by ID lookup): ${report.incoming.existing_slabsmith_rows_matched}`,
    `  lookup external_company_code: ${report.incoming.external_company_code}`,
    `  incoming needs_review: ${report.incoming.needs_review}`,
    "",
  ];

  if (Array.isArray(report.warnings) && report.warnings.length) {
    lines.push("warnings:");
    for (const warning of report.warnings) {
      lines.push(`  ${warning}`);
    }
    lines.push("");
  }

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

  /** @type {Awaited<ReturnType<typeof buildInventorySourceBreakdown>>} */
  let sourceBreakdown = {
    total_by_external_source: {},
    active_by_external_source: {},
    typed_by_external_source: {},
    total: 0,
    slabsmith: 0,
    slabcloud: 0,
  };

  if (inventory.readable) {
    sourceBreakdown = await buildInventorySourceBreakdown(db, organizationId);
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

  const idMatchSummary = summarizeSlabsmithIdMatches(incomingRows, existingMatches);
  const warnings = detectPreflightCountMismatch({
    existingSlabsmithTotal: sourceBreakdown.slabsmith,
    matchingIncomingSlabsmith: idMatchSummary.matching_incoming_rows,
    existingSlabsmithRowsMatched: idMatchSummary.existing_slabsmith_rows_matched,
  });

  const duplicateSourceRisk = {
    has_existing_slabcloud_rows: sourceBreakdown.slabcloud > 0,
    existing_slabcloud_count: sourceBreakdown.slabcloud,
    message: sourceBreakdown.slabcloud
      ? `Organization already has ${sourceBreakdown.slabcloud} slabcloud cache row(s). Slabsmith writes use external_source="${SLABSMITH_EXTERNAL_SOURCE}" and will not overwrite SlabCloud rows, but the Slab Inventory head aggregates all sources for the org.`
      : null,
  };

  const recommendation = buildPreflightRecommendation({
    tablesReadable,
    incomingRowCount: incomingRows.length,
    needsReviewCount: incomingSummary.needs_review ?? 0,
    existingSlabcloudCount: sourceBreakdown.slabcloud,
    existingSlabsmithCount: sourceBreakdown.slabsmith,
    matchingIncomingSlabsmith: idMatchSummary.matching_incoming_rows,
  });

  return {
    organization_id: organizationId,
    tables: tablesReadable,
    existing: {
      ...sourceBreakdown,
      // Back-compat alias for callers expecting by_external_source.
      by_external_source: sourceBreakdown.total_by_external_source,
    },
    incoming: {
      row_count: incomingRows.length,
      by_source_inventory_type: incomingSummary.by_type ?? {},
      by_source_price_group: incomingSummary.by_source_price_group ?? {},
      matching_existing_slabsmith: idMatchSummary.matching_incoming_rows,
      existing_slabsmith_rows_matched: idMatchSummary.existing_slabsmith_rows_matched,
      external_company_code: companyCode,
      needs_review: incomingSummary.needs_review ?? 0,
    },
    warnings,
    duplicate_source_risk: duplicateSourceRisk,
    recommendation,
  };
}
