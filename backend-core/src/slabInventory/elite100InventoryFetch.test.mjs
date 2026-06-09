import assert from "node:assert/strict";
import { buildElite100InventoryMap } from "./slabInventoryApi.js";
import {
  fetchAllActiveInventoryRowsForElite100Matching,
  fetchAllActiveInventoryRowsForScope,
} from "./elite100InventoryFetch.js";
import { buildElite100MatchReport } from "./elite100MatchDiagnostics.js";
import { ELITE100_INVENTORY_MATCH_COLUMNS } from "./elite100CardModel.js";
import {
  SUMMARY_FETCH_PAGE_SIZE,
  verifyActiveInventoryFetchComplete,
} from "./slabInventorySummaryQueries.js";
import { INVENTORY_SOURCE_SLABSMITH } from "./slabInventorySourceFilter.js";

const CATALOG = [
  {
    id: "cat-alabaster",
    color_name: "Alabaster",
    material_name: "ESF",
    normalized_color_name: "alabaster",
    normalized_material_name: "esf",
    price_group: "B",
  },
];

function makePaginatedMockDb(rows) {
  return {
    from(table) {
      if (table !== "slab_inventory") {
        throw new Error(`unexpected table ${table}`);
      }
      /** @type {Record<string, unknown>} */
      const filters = {};
      const isCount = { value: false };
      const range = { from: 0, to: SUMMARY_FETCH_PAGE_SIZE - 1 };
      const chain = {
        select(_cols, opts) {
          if (opts?.head) isCount.value = true;
          return chain;
        },
        eq(col, val) {
          filters[col] = val;
          return chain;
        },
        order() {
          return chain;
        },
        range(from, to) {
          range.from = from;
          range.to = to;
          return chain;
        },
        limit() {
          return chain;
        },
        async then(resolve) {
          let matched = rows.filter((r) => r.is_active !== false);
          if (filters.organization_id) {
            matched = matched.filter((r) => r.organization_id === filters.organization_id);
          }
          if (filters.external_source) {
            matched = matched.filter((r) => r.external_source === filters.external_source);
          }

          if (isCount.value) {
            resolve({ count: matched.length, error: null });
            return;
          }

          const sorted = [...matched].sort((a, b) => String(a.id).localeCompare(String(b.id)));
          const page = sorted.slice(range.from, range.to + 1);
          resolve({ data: page, error: null });
        },
      };
      return chain;
    },
  };
}

function buildSlabsmithRows(count, { color_name, material_name, idPrefix }) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${idPrefix}-${String(i).padStart(5, "0")}`,
    organization_id: "org-1",
    external_source: INVENTORY_SOURCE_SLABSMITH,
    external_slab_id: `${idPrefix}-${i}`,
    inventory_id: `${idPrefix}-${i}`,
    color_name,
    material_name,
    source_inventory_type: "Slab",
    is_active: true,
  }));
}

/* ── paginated fetch returns all rows past 1000 cap ─────────────────────── */
{
  const filler = buildSlabsmithRows(1200, {
    color_name: "Filler Stone",
    material_name: "Granite",
    idPrefix: "fill",
  });
  const alabaster = buildSlabsmithRows(450, {
    color_name: "Alabaster",
    material_name: "ESF",
    idPrefix: "alb",
  });
  const allRows = [...filler, ...alabaster];
  assert.equal(allRows.length, 1650);

  const mockDb = makePaginatedMockDb(allRows);
  const scopeInv = (q) =>
    q.eq("organization_id", "org-1").eq("external_source", INVENTORY_SOURCE_SLABSMITH);

  const result = await fetchAllActiveInventoryRowsForElite100Matching(mockDb, scopeInv);
  assert.equal(result.active_inventory_rows_fetched, 1650);
  assert.equal(result.active_inventory_fetch_pages, 2);
  assert.equal(result.expected_active_count, 1650);
  assert.equal(result.active_inventory_fetch_complete, true);
  assert.equal(result.fetch_warning, null);

  const map = buildElite100InventoryMap(result.rows, CATALOG, []);
  assert.equal(map.get("cat-alabaster").rows.length, 450, "matches include page-2 rows");

  const report = buildElite100MatchReport({
    catalogItemList: CATALOG,
    invRows: result.rows,
    resolvedAliases: [],
    activeInventorySource: INVENTORY_SOURCE_SLABSMITH,
    inventoryFetch: result,
  });
  assert.equal(report.matched_catalog_count, 1);
  assert.equal(report.active_inventory_fetch_complete, true);
  console.log("ok: elite100 paginated fetch >1000 rows and page-2 matches");
}

/* ── scope helper uses Elite 100 match columns ─────────────────────────── */
{
  const rows = buildSlabsmithRows(5, {
    color_name: "Alabaster",
    material_name: "ESF",
    idPrefix: "small",
  });
  const mockDb = makePaginatedMockDb(rows);
  const scopeInv = (q) => q.eq("organization_id", "org-1");
  const result = await fetchAllActiveInventoryRowsForScope(
    mockDb,
    scopeInv,
    ELITE100_INVENTORY_MATCH_COLUMNS.join(",")
  );
  assert.equal(result.rows.length, 5);
  assert.ok("color_name" in result.rows[0]);
  console.log("ok: fetchAllActiveInventoryRowsForScope returns requested columns");
}

/* ── incomplete fetch surfaces loud warning ──────────────────────────────── */
{
  const rows = buildSlabsmithRows(1500, {
    color_name: "Stone",
    material_name: "Granite",
    idPrefix: "warn",
  });
  const mockDb = makePaginatedMockDb(rows);
  const scopeInv = (q) => q.eq("organization_id", "org-1");

  const truncated = {
    rows: rows.slice(0, SUMMARY_FETCH_PAGE_SIZE),
    active_inventory_rows_fetched: SUMMARY_FETCH_PAGE_SIZE,
    active_inventory_fetch_pages: 1,
  };
  const verification = await verifyActiveInventoryFetchComplete(mockDb, scopeInv, truncated);
  assert.equal(verification.expected_active_count, 1500);
  assert.equal(verification.active_inventory_fetch_complete, false);
  assert.ok(
    verification.fetch_warning?.includes("Inventory fetch incomplete"),
    "warns when fetched count < expected"
  );
  console.log("ok: verifyActiveInventoryFetchComplete warns on truncated fetch");
}
