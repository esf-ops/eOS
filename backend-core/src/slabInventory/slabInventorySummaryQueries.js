/**
 * slabInventorySummaryQueries — exact counts + paginated fetches for summary aggregation.
 *
 * Supabase/PostgREST defaults to 1000 rows per SELECT. Summary metrics must not rely on
 * unbounded row fetches. Use head/count for totals and paginate when row scans are required.
 */

import {
  INVENTORY_SOURCE_SLABCLOUD,
  INVENTORY_SOURCE_SLABSMITH,
} from "./slabInventorySourceFilter.js";

export const SUMMARY_FETCH_PAGE_SIZE = 1000;

/** Lightweight projection for summarizeActiveRows (never includes count_for_color). */
export const SUMMARY_ACTIVE_SELECT_COLUMNS =
  "color_name,material_name,price_group,last_seen_sync_run_id";

/** Sources included when computing source=all active_not_seen coverage. */
export const SUMMARY_COVERAGE_SOURCES = Object.freeze([
  INVENTORY_SOURCE_SLABCLOUD,
  INVENTORY_SOURCE_SLABSMITH,
]);

const SYNC_RUN_SELECT =
  "id,status,started_at,finished_at,warning_count,slab_upserted_count,image_row_written_count,triggered_by,external_source";

/**
 * Exact count of active slab_inventory rows after scopeQuery is applied.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery
 */
export async function countActiveInventoryRows(db, scopeQuery) {
  let q = db
    .from("slab_inventory")
    .select("id", { head: true, count: "exact" })
    .eq("is_active", true)
    .limit(0);
  q = scopeQuery(q);
  const { count, error } = await q;
  if (error) throw error;
  return Number(count ?? 0);
}

/**
 * Exact count of active rows not seen in the given sync run.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery
 * @param {string|null} latestSyncId
 */
export async function countActiveNotSeenInSync(db, scopeQuery, latestSyncId) {
  if (!latestSyncId) return 0;
  let q = db
    .from("slab_inventory")
    .select("id", { head: true, count: "exact" })
    .eq("is_active", true)
    .neq("last_seen_sync_run_id", latestSyncId)
    .limit(0);
  q = scopeQuery(q);
  const { count, error } = await q;
  if (error) throw error;
  return Number(count ?? 0);
}

/**
 * Fetch all active rows for summary aggregation, paginating past the 1000-row cap.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery
 * @param {string} [selectColumns]
 */
export async function fetchActiveInventoryRowsPaginated(
  db,
  scopeQuery,
  selectColumns = SUMMARY_ACTIVE_SELECT_COLUMNS
) {
  const { rows } = await fetchActiveInventoryRowsPaginatedWithMeta(
    db,
    scopeQuery,
    selectColumns
  );
  return rows;
}

/**
 * Paginated active inventory fetch with page metadata (Supabase default cap = 1000).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery
 * @param {string} [selectColumns]
 * @returns {Promise<{
 *   rows: Array<Record<string, unknown>>,
 *   active_inventory_rows_fetched: number,
 *   active_inventory_fetch_pages: number,
 * }>}
 */
export async function fetchActiveInventoryRowsPaginatedWithMeta(
  db,
  scopeQuery,
  selectColumns = SUMMARY_ACTIVE_SELECT_COLUMNS
) {
  /** @type {Array<Record<string, unknown>>} */
  const all = [];
  let offset = 0;
  let pages = 0;

  while (true) {
    let q = db
      .from("slab_inventory")
      .select(selectColumns)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + SUMMARY_FETCH_PAGE_SIZE - 1);
    q = scopeQuery(q);
    const { data, error } = await q;
    if (error) throw error;

    const batch = data ?? [];
    all.push(...batch);
    pages += 1;
    if (batch.length < SUMMARY_FETCH_PAGE_SIZE) break;
    offset += SUMMARY_FETCH_PAGE_SIZE;
  }

  return {
    rows: all,
    active_inventory_rows_fetched: all.length,
    active_inventory_fetch_pages: pages,
  };
}

/**
 * Verify paginated fetch against exact head count; surface incomplete-fetch warnings.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery
 * @param {{ rows: Array, active_inventory_rows_fetched: number, active_inventory_fetch_pages: number }} fetchResult
 */
export async function verifyActiveInventoryFetchComplete(db, scopeQuery, fetchResult) {
  const expected = await countActiveInventoryRows(db, scopeQuery);
  const fetched = fetchResult.active_inventory_rows_fetched;
  const complete = fetched === expected;
  /** @type {string|null} */
  let fetch_warning = null;

  if (!complete) {
    fetch_warning = `Inventory fetch incomplete: fetched ${fetched} active rows but exact count is ${expected}. Elite 100 matching may be under-counted.`;
  } else if (
    fetched === SUMMARY_FETCH_PAGE_SIZE &&
    expected > SUMMARY_FETCH_PAGE_SIZE &&
    fetchResult.active_inventory_fetch_pages < 2
  ) {
    fetch_warning = `Fetched exactly ${SUMMARY_FETCH_PAGE_SIZE} rows in one page while ${expected} active rows exist — pagination may be broken.`;
  }

  return {
    expected_active_count: expected,
    active_inventory_fetch_complete: complete,
    fetch_warning,
  };
}

/**
 * Latest completed (non-dry-run) sync run for the scoped query (limit 1).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery
 */
export async function fetchLatestSyncRun(db, scopeQuery) {
  let q = db
    .from("slabcloud_sync_runs")
    .select(SYNC_RUN_SELECT)
    .neq("status", "dry_run")
    .order("started_at", { ascending: false })
    .limit(1);
  q = scopeQuery(q);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * Build a single-source filter object for per-source coverage queries.
 * @param {string} externalSource
 */
export function singleSourceFilter(externalSource) {
  return {
    resolved: externalSource,
    mode: "single",
    externalSource,
    invalidInputIgnored: false,
  };
}

/**
 * Compute active_not_seen count and the latest sync metadata for summary.
 *
 * - source=slabcloud|slabsmith: compare against that source's latest sync only.
 * - source=all: sum per-source not-seen counts (each source vs its own latest sync).
 *   latestSync returned is the global most recent sync (any source).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string|null} organizationId
 * @param {{ mode?: string, externalSource?: string|null }} sourceFilter
 * @param {(q: object, organizationId: string|null, sourceFilter: object) => object} scopeInventory
 */
export async function resolveSummarySyncCoverage(
  db,
  organizationId,
  sourceFilter,
  scopeInventory
) {
  const scope = (filter) => (q) => scopeInventory(q, organizationId, filter);

  if (sourceFilter.mode === "single" && sourceFilter.externalSource) {
    const lastSync = await fetchLatestSyncRun(db, scope(sourceFilter));
    const activeNotSeenCount = await countActiveNotSeenInSync(db, scope(sourceFilter), lastSync?.id ?? null);
    return {
      lastSync,
      activeNotSeenCount,
      coverage_mode: "single_source",
    };
  }

  let activeNotSeenCount = 0;
  for (const externalSource of SUMMARY_COVERAGE_SOURCES) {
    const perSourceFilter = singleSourceFilter(externalSource);
    const perSourceSync = await fetchLatestSyncRun(db, scope(perSourceFilter));
    if (perSourceSync?.id) {
      activeNotSeenCount += await countActiveNotSeenInSync(
        db,
        scope(perSourceFilter),
        perSourceSync.id
      );
    }
  }

  const lastSync = await fetchLatestSyncRun(db, scope(sourceFilter));
  return {
    lastSync,
    activeNotSeenCount,
    coverage_mode: "all_sources_summed",
  };
}

/**
 * Fetch every row of an arbitrary query, paginating past the PostgREST 1000-row cap.
 * buildQuery must return a fresh, fully-filtered builder each call (the table needs an `id` column).
 * @param {() => object} buildQuery
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchAllRowsPaginated(buildQuery) {
  /** @type {Array<Record<string, unknown>>} */
  const all = [];
  for (let offset = 0; ; offset += SUMMARY_FETCH_PAGE_SIZE) {
    const { data, error } = await buildQuery()
      .order("id", { ascending: true })
      .range(offset, offset + SUMMARY_FETCH_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < SUMMARY_FETCH_PAGE_SIZE) break;
  }
  return all;
}

/** external_slab_id values per `.in()` request — keeps PostgREST URLs well under length limits. */
export const SLAB_IMAGE_ID_CHUNK_SIZE = 100;
const SLAB_IMAGE_FETCH_CONCURRENCY = 4;

/**
 * Load slab_images only for the given inventory rows. slab_images keeps rows for retired slabs
 * (thousands for Slabsmith), so an unscoped org-wide read silently truncates at 1000 rows and
 * drops photos for in-stock pieces.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery
 * @param {Array<{ external_slab_id?: unknown }>} rows
 * @param {string} selectColumns
 */
export async function fetchSlabImagesForInventoryRows(db, scopeQuery, rows, selectColumns) {
  return fetchRowsForInventorySlabIds(db, "slab_images", scopeQuery, rows, selectColumns);
}

/**
 * Load rows of a per-slab table (keyed by external_slab_id) only for the given inventory rows,
 * chunking `.in()` lists and paginating each chunk.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} table
 * @param {(q: object) => object} scopeQuery
 * @param {Array<{ external_slab_id?: unknown }>} rows
 * @param {string} selectColumns
 */
export async function fetchRowsForInventorySlabIds(db, table, scopeQuery, rows, selectColumns) {
  const ids = [
    ...new Set(
      (Array.isArray(rows) ? rows : [])
        .map((r) => (r?.external_slab_id == null ? "" : String(r.external_slab_id).trim()))
        .filter(Boolean)
    ),
  ];
  const chunks = [];
  for (let i = 0; i < ids.length; i += SLAB_IMAGE_ID_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + SLAB_IMAGE_ID_CHUNK_SIZE));
  }
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (let i = 0; i < chunks.length; i += SLAB_IMAGE_FETCH_CONCURRENCY) {
    const batches = await Promise.all(
      chunks.slice(i, i + SLAB_IMAGE_FETCH_CONCURRENCY).map((chunk) =>
        fetchAllRowsPaginated(() =>
          scopeQuery(db.from(table).select(selectColumns).in("external_slab_id", chunk))
        )
      )
    );
    for (const b of batches) out.push(...b);
  }
  return out;
}

/**
 * Simulate a truncated single-page fetch (Supabase default cap) for regression tests.
 * @param {Array<Record<string, unknown>>} allRows
 * @param {number} [pageSize]
 */
export function simulateTruncatedActiveFetch(allRows, pageSize = SUMMARY_FETCH_PAGE_SIZE) {
  return (Array.isArray(allRows) ? allRows : []).slice(0, pageSize);
}
