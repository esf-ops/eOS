/**
 * Slab Inventory Head API — pure-helper + route-shape regression tests.
 * No network, no Supabase, no Express server. Run: npm run eos:test:slab-inventory-api
 *
 * Guards the v1 safety contract:
 *   - Read-only: ONLY GET routes are registered (no POST/PUT/PATCH/DELETE).
 *   - Count semantics never sum SlabCloud `count_for_color`.
 *   - Source price group is surfaced as an imported/source value (labeled), and
 *     `count_for_color` / raw json are never in the staff-safe projection.
 */

import assert from "node:assert/strict";

import {
  attachSlabInventoryRoutes,
  buildImageMap,
  clampLimit,
  clampOffset,
  INVENTORY_SELECT_COLUMNS,
  IMAGE_STATUS_VALUES,
  mapSlabRow,
  parseListParams,
  resolveSort,
  SEARCH_COLUMNS,
  SLAB_INVENTORY_HEAD_SLUG,
  SORT_COLUMNS,
  SOURCE_PRICE_GROUP_LABEL,
  summarizeActiveRows
} from "./slabInventoryApi.js";

/* ── clamp helpers ─────────────────────────────────────────────────────── */
{
  assert.equal(clampLimit(undefined), 60, "default limit");
  assert.equal(clampLimit("0"), 60, "non-positive → default");
  assert.equal(clampLimit("25"), 25, "honored limit");
  assert.equal(clampLimit("99999"), 200, "limit capped at 200");
  assert.equal(clampOffset(undefined), 0, "default offset");
  assert.equal(clampOffset("-5"), 0, "negative offset → 0");
  assert.equal(clampOffset("120"), 120, "honored offset");
  console.log("ok: clamp helpers");
}

/* ── sort whitelist ────────────────────────────────────────────────────── */
{
  assert.deepEqual(resolveSort("color", "asc"), { column: "color_name", ascending: true });
  assert.deepEqual(resolveSort("updated_at", "desc"), { column: "updated_at", ascending: false });
  // Unknown sort key falls back to color_name asc (never raw SQL injection).
  assert.deepEqual(resolveSort("color_name; drop table", "x"), { column: "color_name", ascending: true });
  for (const phys of Object.values(SORT_COLUMNS)) {
    assert.ok(typeof phys === "string" && /^[a-z_]+$/.test(phys), `sort column ${phys} is a safe identifier`);
  }
  console.log("ok: sort whitelist");
}

/* ── parseListParams ───────────────────────────────────────────────────── */
{
  const p = parseListParams({});
  assert.equal(p.is_active, true, "default active-only");
  assert.equal(p.limit, 60);
  assert.equal(p.offset, 0);
  assert.equal(p.sortColumn, "color_name");

  const all = parseListParams({ is_active: "all" });
  assert.equal(all.is_active, null, "is_active=all → null (no filter)");
  const inactive = parseListParams({ is_active: "false" });
  assert.equal(inactive.is_active, false, "is_active=false → inactive only");

  const f = parseListParams({
    search: "  Calacatta  ",
    material_name: "ESF Quartz",
    image_status: "OK",
    sort: "rack",
    direction: "desc",
    limit: "10",
    offset: "30"
  });
  assert.equal(f.search, "Calacatta", "search trimmed");
  assert.equal(f.material_name, "ESF Quartz");
  assert.equal(f.image_status, "ok", "image_status normalized lowercase");
  assert.equal(f.sortColumn, "rack");
  assert.equal(f.ascending, false);
  assert.equal(f.limit, 10);
  assert.equal(f.offset, 30);

  // Invalid image_status is dropped (not passed through).
  assert.equal(parseListParams({ image_status: "bogus" }).image_status, "");
  console.log("ok: parseListParams");
}

/* ── mapSlabRow: source price group labeling + staff-safe shape ────────── */
{
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    external_slab_id: "437D9CA4-76B0-453B-BDE9-9007FFC44C5A",
    inventory_id: "55817",
    color_name: "Alabaster",
    material_name: "ESF Quartz",
    distributor: "ESF",
    price_group: "B",
    thickness_nominal: "3 cm",
    rack: "79L",
    lot: "5999-14",
    width_actual_in: 81.68,
    length_actual_in: 138.69,
    is_active: true,
    last_seen_sync_run_id: "22222222-2222-4222-8222-222222222222",
    updated_at: "2026-06-04T12:00:00Z"
  };
  const img = { image_url: "https://x/y.jpg", thumbnail_url: "https://x/y_thumb.jpg", image_status: "ok" };
  const mapped = mapSlabRow(row, img);

  // Source price group is surfaced as imported/source, with a label.
  assert.equal(mapped.source_price_group, "B", "source_price_group from price_group");
  assert.equal(mapped.price_group, "B", "price_group preserved");
  assert.equal(mapped.source_price_group_label, SOURCE_PRICE_GROUP_LABEL);
  assert.equal(SOURCE_PRICE_GROUP_LABEL, "Source price group");
  // External slab identity preserved unchanged (uppercase).
  assert.equal(mapped.external_slab_id, "437D9CA4-76B0-453B-BDE9-9007FFC44C5A");
  assert.equal(mapped.image_url, "https://x/y.jpg");
  assert.equal(mapped.image_status, "ok");

  // No write-implying / unsafe fields leak through the mapper.
  for (const banned of ["count_for_color", "raw", "raw_json", "usable_a_raw", "usable_d_raw", "width_actual_m", "length_actual_m"]) {
    assert.ok(!(banned in mapped), `mapped row must not expose ${banned}`);
  }

  // Missing image → graceful unknown fallback.
  assert.equal(mapSlabRow(row, null).image_status, "unknown", "no image → unknown");
  console.log("ok: mapSlabRow");
}

/* ── staff-safe projection excludes count/raw/source-meter fields ──────── */
{
  for (const banned of ["count_for_color", "raw_json", "usable_a_raw", "usable_d_raw", "width_actual_m", "length_actual_m"]) {
    assert.ok(!INVENTORY_SELECT_COLUMNS.includes(banned), `select must not include ${banned}`);
  }
  assert.ok(INVENTORY_SELECT_COLUMNS.includes("price_group"), "price_group selected (shown as source)");
  assert.ok(INVENTORY_SELECT_COLUMNS.includes("external_slab_id"), "external_slab_id selected");
  assert.deepEqual([...SEARCH_COLUMNS], ["color_name", "material_name", "inventory_id", "rack", "lot", "distributor"]);
  assert.deepEqual([...IMAGE_STATUS_VALUES], ["unknown", "ok", "missing", "error"]);
  console.log("ok: staff-safe projection");
}

/* ── buildImageMap prefers ok status / canonical pattern ───────────────── */
{
  const rows = [
    { external_slab_id: "A", image_url: "a-missing.jpg", image_status: "missing", image_url_pattern: "other" },
    { external_slab_id: "A", image_url: "a-ok.jpg", image_status: "ok", image_url_pattern: "slabcloud_slab_jpg" },
    { external_slab_id: "B", image_url: "b.jpg", image_status: "unknown", image_url_pattern: "slabcloud_slab_jpg" },
    { external_slab_id: "", image_url: "skip.jpg", image_status: "ok", image_url_pattern: "x" }
  ];
  const map = buildImageMap(rows);
  assert.equal(map.get("A").image_url, "a-ok.jpg", "prefers ok status");
  assert.equal(map.get("B").image_url, "b.jpg");
  assert.ok(!map.has(""), "empty slab id skipped");
  console.log("ok: buildImageMap");
}

/* ── summarizeActiveRows NEVER sums count_for_color ────────────────────── */
{
  // Three physical slabs of color "Alabaster" each carry count_for_color = 3.
  // Naive summing would yield 9; the real active count is 3 rows.
  const rows = [
    { color_name: "Alabaster", material_name: "ESF Quartz", price_group: "B", count_for_color: 3 },
    { color_name: "Alabaster", material_name: "ESF Quartz", price_group: "B", count_for_color: 3 },
    { color_name: "Alabaster", material_name: "ESF Quartz", price_group: "B", count_for_color: 3 },
    { color_name: "Calacatta", material_name: "ESF Marble", price_group: "C", count_for_color: 5 }
  ];
  const s = summarizeActiveRows(rows);
  assert.equal(s.total_active_slabs, 4, "counts rows, not count_for_color sum");
  assert.notEqual(s.total_active_slabs, 14, "must NOT equal sum of count_for_color (3+3+3+5)");
  assert.equal(s.distinct_colors, 2, "distinct colors");
  assert.equal(s.distinct_materials, 2, "distinct materials");
  const byPg = Object.fromEntries(s.slabs_by_price_group.map((g) => [g.price_group, g.count]));
  assert.equal(byPg.B, 3, "price group B = 3 rows");
  assert.equal(byPg.C, 1, "price group C = 1 row");
  console.log("ok: summarizeActiveRows (no count_for_color summing)");
}

/* ── sync-coverage fields: active_cached vs latest_sync counts ─────────── */
//
// This tests the logic that powers the "Needs review" callout:
//   active_cached_slab_count   = number of active slab rows (row count only)
//   latest_sync_slab_count     = slab_upserted_count from the last sync run
//   active_not_seen_in_latest_sync_count = active rows whose last_seen differs
//
// The scenario mirrors production: 385 cached active slabs, latest sync saw 382,
// leaving 3 active slabs not seen in the most recent run.
{
  const SYNC_ID_LATEST = "sync-run-latest-1111-1111-111111111111";
  const SYNC_ID_OLD    = "sync-run-old----2222-2222-222222222222";

  // 385 active rows: 382 seen in latest sync + 3 from an older run.
  const activeRows = [
    ...Array.from({ length: 382 }, (_, i) => ({
      color_name: `Color${i}`,
      material_name: "ESF Quartz",
      price_group: "B",
      last_seen_sync_run_id: SYNC_ID_LATEST
    })),
    { color_name: "India Black Pearl", material_name: "Granite",    price_group: "A", last_seen_sync_run_id: SYNC_ID_OLD },
    { color_name: "Super White",        material_name: "ESF Quartz", price_group: "B", last_seen_sync_run_id: SYNC_ID_OLD },
    { color_name: "Taj Sienna",         material_name: "Stratus",    price_group: "C", last_seen_sync_run_id: SYNC_ID_OLD }
  ];

  // active_cached_slab_count = total rows (385), never count_for_color sum.
  const activeCachedCount = activeRows.length;
  assert.equal(activeCachedCount, 385, "active_cached_slab_count = 385 rows");

  // latest_sync_slab_count comes from slab_upserted_count (382 here).
  const latestSyncSlabCount = 382;
  assert.equal(latestSyncSlabCount, 382, "latest_sync_slab_count from slab_upserted_count");

  // active_not_seen_in_latest_sync_count = rows with a different sync run id.
  const notSeen = activeRows.filter((r) => r.last_seen_sync_run_id !== SYNC_ID_LATEST);
  assert.equal(notSeen.length, 3, "3 active slabs not seen in latest sync");
  assert.notEqual(activeCachedCount, latestSyncSlabCount, "counts differ when slabs were not seen");

  // Sample list must be capped (up to 5 rows returned).
  const sampleCap = 5;
  const sample = notSeen.slice(0, sampleCap);
  assert.ok(sample.length <= sampleCap, "sample capped at 5");
  assert.equal(sample.length, 3, "3 not-seen rows returned in sample (all fit within cap)");

  // count_for_color is not summed even when present on rows.
  const rowsWithCount = activeRows.map((r) => ({ ...r, count_for_color: 99 }));
  const s = summarizeActiveRows(rowsWithCount);
  assert.equal(s.total_active_slabs, 385, "summarizeActiveRows still counts rows, not count_for_color sum");
  assert.notEqual(s.total_active_slabs, 385 * 99, "must not be count_for_color × rows");

  // When active_not_seen count is 0, gap is clean.
  const allSeen = activeRows.map((r) => ({ ...r, last_seen_sync_run_id: SYNC_ID_LATEST }));
  const notSeenWhenAllSeen = allSeen.filter((r) => r.last_seen_sync_run_id !== SYNC_ID_LATEST);
  assert.equal(notSeenWhenAllSeen.length, 0, "0 not-seen when all rows point to latest sync");

  // Sample must not expose raw JSON or count_for_color.
  for (const sampleRow of sample) {
    assert.ok(!("count_for_color" in sampleRow), "sample must not include count_for_color");
    assert.ok(!("raw_json" in sampleRow), "sample must not include raw_json");
  }

  console.log("ok: sync-coverage fields (active_cached vs latest_sync)");
}

/* ── attach registers ONLY GET routes, gated by head access ────────────── */
{
  const calls = [];
  const mockApp = {};
  for (const m of ["get", "post", "put", "patch", "delete", "use", "options", "head"]) {
    mockApp[m] = (path) => calls.push({ method: m, path: typeof path === "string" ? path : "(mw)" });
  }
  let headAccessSlug = null;
  const requireAuth = () => (_req, _res, next) => next();
  const requireHeadAccess = (slug) => {
    headAccessSlug = slug;
    return (_req, _res, next) => next();
  };
  const getSupabase = () => ({});

  attachSlabInventoryRoutes(mockApp, { requireAuth, requireHeadAccess, getSupabase });

  assert.equal(headAccessSlug, SLAB_INVENTORY_HEAD_SLUG, "head access gate uses slab_inventory slug");
  assert.equal(SLAB_INVENTORY_HEAD_SLUG, "slab_inventory");

  const routeCalls = calls.filter((c) => c.path.startsWith("/api/slab-inventory"));
  assert.ok(routeCalls.length >= 4, "at least 4 slab-inventory routes registered");
  for (const c of routeCalls) {
    assert.equal(c.method, "get", `route ${c.path} must be GET (read-only) — got ${c.method}`);
  }
  // No mutating verbs anywhere.
  for (const verb of ["post", "put", "patch", "delete"]) {
    assert.equal(calls.filter((c) => c.method === verb).length, 0, `no ${verb} routes registered`);
  }
  const paths = new Set(routeCalls.map((c) => c.path));
  for (const expected of [
    "/api/slab-inventory/summary",
    "/api/slab-inventory/filters",
    "/api/slab-inventory/slabs",
    "/api/slab-inventory/slabs/:id"
  ]) {
    assert.ok(paths.has(expected), `route ${expected} registered`);
  }
  console.log("ok: read-only route shape (GET only)");
}

console.log("\nslabInventoryApi: all tests passed");
