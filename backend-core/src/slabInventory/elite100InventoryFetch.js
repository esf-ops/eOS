/**
 * elite100InventoryFetch — paginated active inventory load for Elite 100 matching.
 *
 * Uses the same scope as All Inventory (is_active + organization + active source).
 * Paginates past the Supabase/PostgREST 1000-row default cap.
 */

import { ELITE100_INVENTORY_MATCH_COLUMNS } from "./elite100CardModel.js";
import {
  fetchActiveInventoryRowsPaginatedWithMeta,
  verifyActiveInventoryFetchComplete,
} from "./slabInventorySummaryQueries.js";

const ELITE100_INVENTORY_SELECT = ELITE100_INVENTORY_MATCH_COLUMNS.join(",");

/**
 * Fetch all active slab_inventory rows for Elite 100 catalog matching.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery  Applies org + source filter (same as scopeInventory).
 * @param {{ verifyCount?: boolean }} [opts]
 */
export async function fetchAllActiveInventoryRowsForElite100Matching(
  db,
  scopeQuery,
  opts = {}
) {
  const verifyCount = opts.verifyCount !== false;
  const paginated = await fetchActiveInventoryRowsPaginatedWithMeta(
    db,
    scopeQuery,
    ELITE100_INVENTORY_SELECT
  );

  const verification = verifyCount
    ? await verifyActiveInventoryFetchComplete(db, scopeQuery, paginated)
    : {
        expected_active_count: null,
        active_inventory_fetch_complete: null,
        fetch_warning: null,
      };

  return {
    rows: paginated.rows,
    active_inventory_rows_fetched: paginated.active_inventory_rows_fetched,
    active_inventory_fetch_pages: paginated.active_inventory_fetch_pages,
    expected_active_count: verification.expected_active_count,
    active_inventory_fetch_complete: verification.active_inventory_fetch_complete,
    fetch_warning: verification.fetch_warning,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {(q: object) => object} scopeQuery
 * @param {string} selectColumns
 */
export async function fetchAllActiveInventoryRowsForScope(
  db,
  scopeQuery,
  selectColumns
) {
  const paginated = await fetchActiveInventoryRowsPaginatedWithMeta(
    db,
    scopeQuery,
    selectColumns
  );
  const verification = await verifyActiveInventoryFetchComplete(
    db,
    scopeQuery,
    paginated
  );
  return {
    rows: paginated.rows,
    ...verification,
    active_inventory_rows_fetched: paginated.active_inventory_rows_fetched,
    active_inventory_fetch_pages: paginated.active_inventory_fetch_pages,
  };
}
