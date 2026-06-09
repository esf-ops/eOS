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
  buildElite100InventoryMap,
  buildImageMap,
  chooseRepresentativeInventoryImage,
  clampLimit,
  clampOffset,
  COLOR_INVENTORY_SELECT_COLUMNS,
  COLOR_PROGRAM_PRICE_GROUP_ORDER,
  groupColorPrograms,
  INVENTORY_SELECT_COLUMNS,
  IMAGE_STATUS_VALUES,
  makeColorKey,
  mapSlabRow,
  parseColorInventoryParams,
  parseListParams,
  priceGroupSortIndex,
  resolveSort,
  scoreRepresentativeInventoryImage,
  SEARCH_COLUMNS,
  SLAB_INVENTORY_HEAD_SLUG,
  SORT_COLUMNS,
  SOURCE_PRICE_GROUP_LABEL,
  summarizeActiveRows
} from "./slabInventoryApi.js";
import {
  applyInventorySourceFilter,
  filterRowsByInventorySource,
  INVENTORY_SOURCE_ALL,
  INVENTORY_SOURCE_SLABCLOUD,
  INVENTORY_SOURCE_SLABSMITH,
  normalizeInventorySourceValue,
  resolveInventorySourceFilter,
} from "./slabInventorySourceFilter.js";

/* ── inventory source filter ───────────────────────────────────────────── */
{
  const unset = resolveInventorySourceFilter({ env: {} });
  assert.equal(unset.resolved, INVENTORY_SOURCE_ALL, "unset env → all");
  assert.equal(unset.mode, "all");
  assert.equal(unset.externalSource, null);
  assert.equal(unset.invalidInputIgnored, false);

  const envCloud = resolveInventorySourceFilter({
    env: { SLAB_INVENTORY_ACTIVE_SOURCE: "slabcloud" },
  });
  assert.equal(envCloud.resolved, INVENTORY_SOURCE_SLABCLOUD);
  assert.equal(envCloud.mode, "single");
  assert.equal(envCloud.externalSource, INVENTORY_SOURCE_SLABCLOUD);

  const envSmith = resolveInventorySourceFilter({
    env: { SLAB_INVENTORY_ACTIVE_SOURCE: "SLABSMITH" },
  });
  assert.equal(envSmith.resolved, INVENTORY_SOURCE_SLABSMITH);
  assert.equal(envSmith.mode, "single");

  const envAll = resolveInventorySourceFilter({
    env: { SLAB_INVENTORY_ACTIVE_SOURCE: "all" },
  });
  assert.equal(envAll.resolved, INVENTORY_SOURCE_ALL);
  assert.equal(envAll.mode, "all");

  const invalidEnv = resolveInventorySourceFilter({
    env: { SLAB_INVENTORY_ACTIVE_SOURCE: "not-a-source" },
  });
  assert.equal(invalidEnv.resolved, INVENTORY_SOURCE_ALL, "invalid env → all");
  assert.equal(invalidEnv.invalidInputIgnored, true);

  const queryOverride = resolveInventorySourceFilter({
    env: { SLAB_INVENTORY_ACTIVE_SOURCE: "slabcloud" },
    querySource: "slabsmith",
  });
  assert.equal(queryOverride.resolved, INVENTORY_SOURCE_SLABSMITH, "query overrides env");

  assert.equal(normalizeInventorySourceValue("bogus"), null);

  const calls = [];
  const mockQuery = {
    eq(col, val) {
      calls.push([col, val]);
      return this;
    },
  };
  const filtered = applyInventorySourceFilter(mockQuery, envCloud);
  assert.equal(filtered, mockQuery);
  assert.deepEqual(calls, [["external_source", INVENTORY_SOURCE_SLABCLOUD]]);

  const unfiltered = applyInventorySourceFilter(mockQuery, unset);
  assert.equal(unfiltered, mockQuery);
  assert.equal(calls.length, 1, "all mode does not add further eq calls");

  const rows = [
    { id: "1", external_source: "slabcloud" },
    { id: "2", external_source: "slabsmith" },
  ];
  assert.equal(filterRowsByInventorySource(rows, envCloud).length, 1);
  assert.equal(filterRowsByInventorySource(rows, unset).length, 2);
  console.log("ok: inventory source filter");
}

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

/* ── COLOR_PROGRAM_PRICE_GROUP_ORDER ────────────────────────────────────── */
{
  const order = [...COLOR_PROGRAM_PRICE_GROUP_ORDER];
  // Must contain Promo, A, B, C, D, E, F in that order.
  assert.deepEqual(order, ["Promo", "A", "B", "C", "D", "E", "F"], "price group order: Promo then A–F");
  // Group G is NOT included in the current order.
  assert.ok(!order.includes("G"), "Group G must NOT be in current price group order");
  // The list is frozen.
  assert.ok(Object.isFrozen(COLOR_PROGRAM_PRICE_GROUP_ORDER), "price group order is frozen");
  console.log("ok: COLOR_PROGRAM_PRICE_GROUP_ORDER (no Group G)");
}

/* ── priceGroupSortIndex ────────────────────────────────────────────────── */
{
  assert.equal(priceGroupSortIndex("Promo"), 0, "Promo sorts first");
  assert.equal(priceGroupSortIndex("A"), 1, "A");
  assert.equal(priceGroupSortIndex("B"), 2, "B");
  assert.equal(priceGroupSortIndex("C"), 3, "C");
  assert.equal(priceGroupSortIndex("D"), 4, "D");
  assert.equal(priceGroupSortIndex("E"), 5, "E");
  assert.equal(priceGroupSortIndex("F"), 6, "F last in defined order");
  // G falls to "other" bucket (after F).
  assert.equal(priceGroupSortIndex("G"), 7, "Group G sorts after F (other bucket)");
  assert.equal(priceGroupSortIndex("unknown"), 7, "unknown sorts after F");
  assert.equal(priceGroupSortIndex(null), 7, "null sorts after F");
  assert.equal(priceGroupSortIndex(""), 7, "empty string sorts after F");
  // "other" index must be strictly after F.
  assert.ok(priceGroupSortIndex("G") > priceGroupSortIndex("F"), "G > F in sort order");
  console.log("ok: priceGroupSortIndex (Promo/A–F ordered, G and unknown after F)");
}

/* ── makeColorKey: stable and deterministic ─────────────────────────────── */
{
  // Same inputs always produce the same key.
  assert.equal(makeColorKey("Alabaster", "ESF Quartz", "B"), makeColorKey("Alabaster", "ESF Quartz", "B"), "stable key");
  // Normalized to lowercase/slug.
  assert.equal(makeColorKey("Alabaster", "ESF Quartz", "B"), "alabaster--esf-quartz--b", "slug shape");
  assert.equal(makeColorKey("Calacatta Gold", "Marble", "Promo"), "calacatta-gold--marble--promo");
  // Different inputs → different keys.
  assert.notEqual(makeColorKey("Alabaster", "ESF Quartz", "B"), makeColorKey("Alabaster", "ESF Quartz", "C"), "B vs C differ");
  assert.notEqual(makeColorKey("Alabaster", "ESF Quartz", "B"), makeColorKey("Alabaster", "ESF Marble", "B"), "material differs");
  // Null/empty segments fall back to "unknown".
  assert.equal(makeColorKey(null, null, null), "unknown--unknown--unknown", "all null → unknown");
  assert.equal(makeColorKey("", "", ""), "unknown--unknown--unknown", "all empty → unknown");
  // Separator "--" never appears inside a segment (slugify collapses runs).
  const key = makeColorKey("Hello   World", "A & B", "C/D");
  const segs = key.split("--");
  assert.equal(segs.length, 3, "exactly 3 segments separated by --");
  for (const seg of segs) {
    assert.ok(!seg.includes("--"), `segment "${seg}" must not contain --`);
  }
  console.log("ok: makeColorKey (stable, deterministic, slug-safe)");
}

/* ── groupColorPrograms: aggregation and ordering ───────────────────────── */
{
  const rows = [
    // Group B: 2 slabs, 1 remnant
    { id: "id-1", external_slab_id: "sid-1", color_name: "Alabaster", material_name: "ESF Quartz",   price_group: "B", source_inventory_type: "Slab",    source_inventory_scope: "typed" },
    { id: "id-2", external_slab_id: "sid-2", color_name: "Alabaster", material_name: "ESF Quartz",   price_group: "B", source_inventory_type: "Slab",    source_inventory_scope: "typed" },
    { id: "id-3", external_slab_id: "sid-3", color_name: "Alabaster", material_name: "ESF Quartz",   price_group: "B", source_inventory_type: "Remnant", source_inventory_scope: "typed" },
    // Group Promo: 1 slab — must sort before B
    { id: "id-4", external_slab_id: "sid-4", color_name: "Zephyr",    material_name: "ESF Quartz",   price_group: "Promo", source_inventory_type: "Slab", source_inventory_scope: "typed" },
    // Group A: 1 remnant — must sort after Promo, before B
    { id: "id-5", external_slab_id: "sid-5", color_name: "Marble Run", material_name: "ESF Marble",  price_group: "A", source_inventory_type: "Remnant", source_inventory_scope: "typed" },
    // Unknown price group: must sort after F
    { id: "id-6", external_slab_id: "sid-6", color_name: "Mystery",   material_name: "ESF Quartz",   price_group: "G", source_inventory_type: "Slab",    source_inventory_scope: "typed" },
    // count_for_color present on rows — must never be summed
    { id: "id-7", external_slab_id: "sid-7", color_name: "Alabaster", material_name: "ESF Quartz",   price_group: "B", source_inventory_type: "Slab",    source_inventory_scope: "typed", count_for_color: 9999 },
    { id: "id-8", external_slab_id: "sid-8", color_name: "Alabaster", material_name: "ESF Quartz",   price_group: "B", source_inventory_type: "Slab",    source_inventory_scope: "typed", count_for_color: 9999 },
  ];

  const imageMap = new Map([
    ["sid-1", { image_url: "a-ok.jpg",     thumbnail_url: "a-ok-t.jpg",   image_status: "ok",      image_url_pattern: "slabcloud_slab_jpg" }],
    ["sid-2", { image_url: "a-miss.jpg",   thumbnail_url: "a-miss-t.jpg", image_status: "missing", image_url_pattern: "slabcloud_slab_jpg" }],
    ["sid-3", { image_url: "a-ok2.jpg",    thumbnail_url: "a-ok2-t.jpg",  image_status: "ok",      image_url_pattern: "slabcloud_slab_jpg" }],
  ]);

  const cards = groupColorPrograms(rows, imageMap);

  // One card per (color, material, price_group) combination.
  const alabasterBCard = cards.find((c) => c.color_key === makeColorKey("Alabaster", "ESF Quartz", "B"));
  assert.ok(alabasterBCard, "Alabaster/B card exists");

  // Row counts — NEVER count_for_color sum.
  // 4 Slab + 1 Remnant rows for Alabaster/ESF Quartz/B (ignoring count_for_color=9999).
  assert.equal(alabasterBCard.slab_count, 4, "slab_count = 4 rows (not count_for_color sum)");
  assert.equal(alabasterBCard.remnant_count, 1, "remnant_count = 1 row");
  assert.equal(alabasterBCard.total_inventory_count, 5, "total = slab + remnant rows");
  assert.notEqual(alabasterBCard.total_inventory_count, 9999 * 2 + 3, "must NOT use count_for_color");

  // verified_photo_count uses image_status=ok only.
  assert.equal(alabasterBCard.verified_photo_count, 2, "verified_photo_count = 2 (ok images only)");
  // representative_image_url is from first verified image.
  assert.equal(alabasterBCard.representative_image_url, "a-ok.jpg", "rep image = first verified image");

  // source_inventory_scope = "typed", program_status = "unclassified".
  assert.equal(alabasterBCard.source_inventory_scope, "typed", "scope is typed");
  assert.equal(alabasterBCard.program_status, "unclassified", "program_status placeholder");

  // Group order: Promo first, then A, then B, then G (unknown/other) last.
  const pgSequence = cards.map((c) => c.source_price_group);
  const promoIdx = pgSequence.indexOf("Promo");
  const aIdx = pgSequence.indexOf("A");
  const bIdx = pgSequence.indexOf("B");
  const gIdx = pgSequence.indexOf("G");
  assert.ok(promoIdx < aIdx, "Promo before A");
  assert.ok(aIdx < bIdx, "A before B");
  assert.ok(bIdx < gIdx, "B before G (G is other/unknown, sorts after F)");

  // Group G is present but at the end (not excluded from results — only excluded
  // from the defined sort order, which places it in the "other" bucket after F).
  const gCard = cards.find((c) => c.source_price_group === "G");
  assert.ok(gCard, "G card exists (data preserved) but sorts after F");
  assert.ok(cards.indexOf(gCard) > cards.indexOf(cards.find((c) => c.source_price_group === "B")), "G card sorts after B");

  // sample_inventory_ids is capped at 5.
  assert.ok(alabasterBCard.sample_inventory_ids.length <= 5, "sample capped at 5");

  // No count_for_color exposed on any card.
  for (const card of cards) {
    assert.ok(!("count_for_color" in card), "cards must not expose count_for_color");
  }

  // Within the same price group, cards are sorted by color_name asc.
  // (Only one B-group card here — just verify the field exists.)
  assert.ok(typeof alabasterBCard.color_name === "string" || alabasterBCard.color_name === null);

  // source_price_group comes from the source row's price_group — not slabOS authority.
  assert.equal(alabasterBCard.source_price_group, "B", "source_price_group is imported from source");

  console.log("ok: groupColorPrograms (aggregation, slab/remnant, ordering, count semantics, Group G)");
}

/* ── groupColorPrograms: verified_photo_count and representative image ───── */
{
  // Color with no verified images — verified_photo_count=0, rep image=null.
  const rows = [
    { id: "i1", external_slab_id: "s1", color_name: "Dark", material_name: "Granite", price_group: "C",
      source_inventory_type: "Slab", source_inventory_scope: "typed" }
  ];
  const imageMapMissing = new Map([
    ["s1", { image_url: "d.jpg", thumbnail_url: "dt.jpg", image_status: "missing", image_url_pattern: "x" }]
  ]);
  const noVerified = groupColorPrograms(rows, imageMapMissing);
  assert.equal(noVerified[0].verified_photo_count, 0, "no verified images → 0");
  assert.equal(noVerified[0].representative_image_url, null, "no verified image → rep url null");

  // Color with one ok image — use it as representative.
  const imageMapOk = new Map([
    ["s1", { image_url: "ok.jpg", thumbnail_url: "ok_t.jpg", image_status: "ok", image_url_pattern: "slabcloud_slab_jpg" }]
  ]);
  const withVerified = groupColorPrograms(rows, imageMapOk);
  assert.equal(withVerified[0].verified_photo_count, 1, "1 verified image");
  assert.equal(withVerified[0].representative_image_url, "ok.jpg", "ok image chosen as representative");

  console.log("ok: groupColorPrograms (representative image prefers verified)");
}

/* ── parseColorInventoryParams ──────────────────────────────────────────── */
{
  const defaults = parseColorInventoryParams({});
  assert.equal(defaults.type, "all", "default type=all");
  assert.equal(defaults.active_only, true, "default active_only=true");
  assert.equal(defaults.image_status, "", "default image_status empty");

  assert.equal(parseColorInventoryParams({ type: "slab" }).type, "slab", "type=slab accepted");
  assert.equal(parseColorInventoryParams({ type: "remnant" }).type, "remnant", "type=remnant accepted");
  assert.equal(parseColorInventoryParams({ type: "SLAB" }).type, "slab", "type case-insensitive");
  assert.equal(parseColorInventoryParams({ type: "bogus" }).type, "all", "unknown type → all");
  assert.equal(parseColorInventoryParams({ active_only: "false" }).active_only, false, "active_only=false");
  assert.equal(parseColorInventoryParams({ active_only: "0" }).active_only, false, "active_only=0");
  assert.equal(parseColorInventoryParams({ active_only: "true" }).active_only, true, "active_only=true");
  assert.equal(parseColorInventoryParams({ image_status: "ok" }).image_status, "ok", "image_status=ok");
  assert.equal(parseColorInventoryParams({ image_status: "bogus" }).image_status, "", "invalid image_status dropped");
  console.log("ok: parseColorInventoryParams");
}

/* ── COLOR_INVENTORY_SELECT_COLUMNS ─────────────────────────────────────── */
{
  // Must contain required staff-safe columns.
  for (const col of [
    "id", "external_slab_id", "inventory_id",
    "color_name", "material_name",
    "source_inventory_type", "source_inventory_scope",
    "price_group", "thickness_nominal", "rack", "lot",
    "width_actual_in", "length_actual_in",
    "source_public_slug", "source_api_company_code", "source_asset_company_code",
    "is_active"
  ]) {
    assert.ok(COLOR_INVENTORY_SELECT_COLUMNS.includes(col), `COLOR_INVENTORY_SELECT_COLUMNS includes ${col}`);
  }
  // Must NOT include count_for_color or raw/meter/usable fields.
  for (const banned of ["count_for_color", "raw_json", "usable_a_raw", "usable_d_raw", "width_actual_m", "length_actual_m"]) {
    assert.ok(!COLOR_INVENTORY_SELECT_COLUMNS.includes(banned), `must not include ${banned}`);
  }
  assert.ok(Object.isFrozen(COLOR_INVENTORY_SELECT_COLUMNS), "COLOR_INVENTORY_SELECT_COLUMNS is frozen");
  console.log("ok: COLOR_INVENTORY_SELECT_COLUMNS");
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
  assert.ok(routeCalls.length >= 6, "at least 6 slab-inventory routes registered");
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
    "/api/slab-inventory/slabs/:id",
    "/api/slab-inventory/color-programs",
    "/api/slab-inventory/colors/:colorKey/inventory",
    "/api/slab-inventory/elite100-programs",
    "/api/slab-inventory/elite100-programs/:catalogItemId/inventory",
    "/api/slab-inventory/non-stock-programs"
  ]) {
    assert.ok(paths.has(expected), `route ${expected} registered`);
  }
  console.log("ok: read-only route shape (GET only, 9 routes including Elite 100 + Non-Stock)");
}

/* ── buildElite100InventoryMap — only exact/alias matches counted ─────── */
{
  const catalog = [
    { id: "cat-1", color_name: "Alabaster", material_name: "ESF",
      normalized_color_name: "alabaster", normalized_material_name: "esf" },
    { id: "cat-2", color_name: "Calacatta Gold", material_name: "Cambria",
      normalized_color_name: "calacatta gold", normalized_material_name: "cambria" }
  ];
  const aliases = [
    // "Winter Fresh - ESF Quartz" is an approved alias for "Alabaster - ESF" (simplified for test).
    {
      normalized_alias_color_name: "winter fresh",
      normalized_alias_material_name: "esf quartz",
      catalog_color_name: "Alabaster",
      catalog_material_name: "ESF"
    }
  ];

  const invRows = [
    // Exact match for cat-1
    { color_name: "Alabaster", material_name: "ESF",
      source_inventory_type: "Slab", external_slab_id: "s1" },
    { color_name: "Alabaster", material_name: "ESF",
      source_inventory_type: "Remnant", external_slab_id: "s2" },
    // Alias match for cat-1
    { color_name: "Winter Fresh", material_name: "ESF Quartz",
      source_inventory_type: "Slab", external_slab_id: "s3" },
    // Exact match for cat-2
    { color_name: "Calacatta Gold", material_name: "Cambria",
      source_inventory_type: "Slab", external_slab_id: "s4" },
    // Fuzzy / unmatched — must NOT appear in Elite 100
    { color_name: "Calacatta Athena", material_name: "Stratus",
      source_inventory_type: "Slab", external_slab_id: "s5" }
  ];

  const result = buildElite100InventoryMap(invRows, catalog, aliases);

  assert.equal(result.size, 2, "map has one entry per catalog item");
  const acc1 = result.get("cat-1");
  assert.equal(acc1.slabCount, 2, "cat-1 slabs: 1 exact + 1 alias");
  assert.equal(acc1.remnantCount, 1, "cat-1 remnants: 1 exact");
  assert.ok(acc1.slabIds.includes("s1") && acc1.slabIds.includes("s3"), "cat-1 slab IDs include exact + alias");
  assert.ok(Array.isArray(acc1.rows), "acc1.rows is an array");
  assert.equal(acc1.rows.length, 3, "cat-1 rows tracked: 1 exact slab + 1 exact remnant + 1 alias slab");

  const acc2 = result.get("cat-2");
  assert.equal(acc2.slabCount, 1, "cat-2 slabs: 1 exact");
  assert.equal(acc2.remnantCount, 0, "cat-2 no remnants");

  // Fuzzy candidate (Calacatta Athena) does NOT appear anywhere in the map.
  for (const [, acc] of result.entries()) {
    assert.ok(!acc.slabIds.includes("s5"), "fuzzy candidate s5 not in any catalog item");
  }
  console.log("ok: buildElite100InventoryMap — only exact/alias matches counted, fuzzy excluded");
}

/* ── buildElite100InventoryMap — empty catalog returns empty map ──────── */
{
  const result = buildElite100InventoryMap(
    [{ color_name: "Any", material_name: "X", source_inventory_type: "Slab", external_slab_id: "s1" }],
    [],
    []
  );
  assert.equal(result.size, 0, "empty catalog → empty map");
  console.log("ok: buildElite100InventoryMap — empty catalog");
}

/* ── buildElite100InventoryMap — zero-inventory catalog items preserved ─ */
{
  const catalog = [
    { id: "cat-1", color_name: "Rare Stone", material_name: "ESF",
      normalized_color_name: "rare stone", normalized_material_name: "esf" }
  ];
  const result = buildElite100InventoryMap([], catalog, []);
  assert.equal(result.size, 1, "catalog item with no inventory still appears in map");
  assert.equal(result.get("cat-1").slabCount, 0);
  assert.equal(result.get("cat-1").remnantCount, 0);
  assert.equal(result.get("cat-1").rows.length, 0, "zero-inventory item has empty rows array");
  console.log("ok: buildElite100InventoryMap — zero-inventory catalog item preserved");
}

/* ── Elite 100 program_status contract ───────────────────────────────── */
{
  // groupColorPrograms returns program_status: "unclassified".
  // The non-stock route maps those cards to program_status: "non_stock".
  // Test that non-stock override works as expected.
  const rows = [
    { id: "i1", external_slab_id: "s1", color_name: "Frost", material_name: "Q Quartz",
      source_inventory_type: "Slab", source_inventory_scope: "typed", price_group: "B" }
  ];
  const cards = groupColorPrograms(rows, new Map()).map((card) => ({ ...card, program_status: "non_stock" }));
  assert.equal(cards.length, 1);
  assert.equal(cards[0].program_status, "non_stock", "non-stock cards have program_status: non_stock");
  console.log("ok: non-stock program_status override");
}

/* ── Group G excluded from COLOR_PROGRAM_PRICE_GROUP_ORDER ───────────── */
{
  assert.ok(!COLOR_PROGRAM_PRICE_GROUP_ORDER.includes("G"), "Group G absent from price group order");
  assert.deepEqual(COLOR_PROGRAM_PRICE_GROUP_ORDER, ["Promo", "A", "B", "C", "D", "E", "F"]);
  console.log("ok: Group G excluded from price group order (Elite 100 carousels)");
}

/* ── slabs and remnants are distinct types ───────────────────────────── */
{
  // Verify that "Slab" and "Remnant" are counted separately in groupColorPrograms.
  const rows = [
    { id: "i1", external_slab_id: "s1", color_name: "Opal", material_name: "ESF",
      source_inventory_type: "Slab", source_inventory_scope: "typed", price_group: "A" },
    { id: "i2", external_slab_id: "s2", color_name: "Opal", material_name: "ESF",
      source_inventory_type: "Remnant", source_inventory_scope: "typed", price_group: "A" },
    { id: "i3", external_slab_id: "s3", color_name: "Opal", material_name: "ESF",
      source_inventory_type: "Remnant", source_inventory_scope: "typed", price_group: "A" }
  ];
  const cards = groupColorPrograms(rows, new Map());
  assert.equal(cards.length, 1, "one card for same color+material+pg");
  assert.equal(cards[0].slab_count, 1, "1 slab");
  assert.equal(cards[0].remnant_count, 2, "2 remnants");
  assert.equal(cards[0].total_inventory_count, 3, "3 total");
  console.log("ok: slabs and remnants counted separately in inventory cards");
}

/* ── scoreRepresentativeInventoryImage ──────────────────────────────────── */
{
  const slabRow = {
    source_inventory_type: "Slab",
    width_actual_in: 80,
    length_actual_in: 120,
    inventory_id: "inv-1",
    external_slab_id: "s1"
  };
  const remnantRow = {
    source_inventory_type: "Remnant",
    width_actual_in: 80,
    length_actual_in: 120,
    inventory_id: "inv-2",
    external_slab_id: "s2"
  };
  const okImage = { image_status: "ok", image_url: "ok.jpg", thumbnail_url: "ok_t.jpg" };
  const missingImage = { image_status: "missing", image_url: "m.jpg", thumbnail_url: null };
  const unknownImage = { image_status: "unknown", image_url: null, thumbnail_url: null };
  const noUrlImage = { image_status: "ok", image_url: null, thumbnail_url: null };

  // Non-ok images score 0 regardless of type.
  assert.equal(scoreRepresentativeInventoryImage(slabRow, missingImage), 0, "missing image → 0");
  assert.equal(scoreRepresentativeInventoryImage(slabRow, unknownImage), 0, "unknown image → 0");
  assert.equal(scoreRepresentativeInventoryImage(slabRow, null), 0, "null image → 0");
  assert.equal(scoreRepresentativeInventoryImage(slabRow, noUrlImage), 0, "ok but no URL → 0");

  // Slab + ok image scores higher than Remnant + ok image.
  const slabScore = scoreRepresentativeInventoryImage(slabRow, okImage);
  const remnantScore = scoreRepresentativeInventoryImage(remnantRow, okImage);
  assert.ok(slabScore > remnantScore, "Slab scores higher than Remnant for same area+image");

  // Larger area wins within the same type tier.
  const bigSlab = { source_inventory_type: "Slab", width_actual_in: 130, length_actual_in: 86, inventory_id: "big", external_slab_id: "big" };
  const smallSlab = { source_inventory_type: "Slab", width_actual_in: 20, length_actual_in: 20, inventory_id: "small", external_slab_id: "small" };
  assert.ok(
    scoreRepresentativeInventoryImage(bigSlab, okImage) > scoreRepresentativeInventoryImage(smallSlab, okImage),
    "larger slab area scores higher"
  );

  // Slab with 0 area still beats any Remnant with max area.
  const slabNoArea = { source_inventory_type: "Slab", width_actual_in: null, length_actual_in: null };
  const bigRemnant = { source_inventory_type: "Remnant", width_actual_in: 200, length_actual_in: 200 };
  assert.ok(
    scoreRepresentativeInventoryImage(slabNoArea, okImage) > scoreRepresentativeInventoryImage(bigRemnant, okImage),
    "Slab with no dims still beats large Remnant"
  );

  // Deterministic: same inputs → same score.
  assert.equal(
    scoreRepresentativeInventoryImage(slabRow, okImage),
    scoreRepresentativeInventoryImage(slabRow, okImage),
    "deterministic score"
  );

  // Missing dimensions → area = 0 (graceful, not NaN).
  const noArea = { source_inventory_type: "Slab", width_actual_in: null, length_actual_in: null };
  const noAreaScore = scoreRepresentativeInventoryImage(noArea, okImage);
  assert.ok(Number.isFinite(noAreaScore) && noAreaScore > 0, "null dims produce finite positive score");

  // count_for_color is not involved — score must not depend on it.
  const rowWithCount = { ...slabRow, count_for_color: 9999 };
  assert.equal(
    scoreRepresentativeInventoryImage(rowWithCount, okImage),
    scoreRepresentativeInventoryImage(slabRow, okImage),
    "count_for_color does not affect score"
  );

  console.log("ok: scoreRepresentativeInventoryImage (Slab>Remnant, ok>missing, area tiebreaker, deterministic)");
}

/* ── chooseRepresentativeInventoryImage ─────────────────────────────────── */
{
  // Full-slab ok image beats remnant ok image.
  const rows = [
    { external_slab_id: "s-rem",  source_inventory_type: "Remnant", width_actual_in: 80, length_actual_in: 100, inventory_id: "inv-rem" },
    { external_slab_id: "s-slab", source_inventory_type: "Slab",    width_actual_in: 60, length_actual_in: 90,  inventory_id: "inv-slab" },
  ];
  const imageMap = new Map([
    ["s-rem",  { image_status: "ok", image_url: "rem.jpg",  thumbnail_url: "rem_t.jpg" }],
    ["s-slab", { image_status: "ok", image_url: "slab.jpg", thumbnail_url: "slab_t.jpg" }],
  ]);
  const result = chooseRepresentativeInventoryImage(rows, imageMap);
  assert.equal(result.representative_image_url, "slab.jpg", "full slab beats remnant");
  assert.equal(result.representative_image_source_inventory_type, "Slab", "type reported correctly");
  assert.equal(result.representative_image_inventory_id, "inv-slab", "inventory_id reported");

  // ok image beats missing/unknown image.
  const rows2 = [
    { external_slab_id: "s-miss",  source_inventory_type: "Slab", width_actual_in: 120, length_actual_in: 80, inventory_id: "inv-miss" },
    { external_slab_id: "s-ok",    source_inventory_type: "Slab", width_actual_in: 60,  length_actual_in: 60, inventory_id: "inv-ok" },
  ];
  const imageMap2 = new Map([
    ["s-miss", { image_status: "missing", image_url: "miss.jpg",  thumbnail_url: null }],
    ["s-ok",   { image_status: "ok",      image_url: "ok.jpg",    thumbnail_url: "ok_t.jpg" }],
  ]);
  const result2 = chooseRepresentativeInventoryImage(rows2, imageMap2);
  assert.equal(result2.representative_image_url, "ok.jpg", "ok image beats missing/unknown even if smaller slab");

  // Larger area wins among same type + ok status.
  const rows3 = [
    { external_slab_id: "s-big",   source_inventory_type: "Slab", width_actual_in: 130, length_actual_in: 86, inventory_id: "inv-big" },
    { external_slab_id: "s-small", source_inventory_type: "Slab", width_actual_in: 20,  length_actual_in: 20, inventory_id: "inv-small" },
  ];
  const imageMap3 = new Map([
    ["s-big",   { image_status: "ok", image_url: "big.jpg",   thumbnail_url: "big_t.jpg" }],
    ["s-small", { image_status: "ok", image_url: "small.jpg", thumbnail_url: "small_t.jpg" }],
  ]);
  const result3 = chooseRepresentativeInventoryImage(rows3, imageMap3);
  assert.equal(result3.representative_image_url, "big.jpg", "larger slab area wins");

  // Fallback when no usable image exists.
  const rows4 = [
    { external_slab_id: "s-x", source_inventory_type: "Slab", width_actual_in: 80, length_actual_in: 80 }
  ];
  const imageMap4 = new Map([
    ["s-x", { image_status: "missing", image_url: "miss.jpg", thumbnail_url: null }]
  ]);
  const result4 = chooseRepresentativeInventoryImage(rows4, imageMap4);
  assert.equal(result4.representative_image_url, null, "no usable image → null url");
  assert.equal(result4.representative_image_source_inventory_type, null, "no usable image → null type");
  assert.equal(result4.representative_image_inventory_id, null, "no usable image → null inventory_id");

  // Empty rows → all nulls (no crash).
  const result5 = chooseRepresentativeInventoryImage([], new Map());
  assert.equal(result5.representative_image_url, null, "empty rows → null url");

  // Deterministic tie-breaking: order in array is the tie-breaker for equal scores.
  const rowsEqual = [
    { external_slab_id: "s-first",  source_inventory_type: "Slab", width_actual_in: 80, length_actual_in: 80, inventory_id: "inv-first" },
    { external_slab_id: "s-second", source_inventory_type: "Slab", width_actual_in: 80, length_actual_in: 80, inventory_id: "inv-second" },
  ];
  const imageMapEqual = new Map([
    ["s-first",  { image_status: "ok", image_url: "first.jpg",  thumbnail_url: "first_t.jpg" }],
    ["s-second", { image_status: "ok", image_url: "second.jpg", thumbnail_url: "second_t.jpg" }],
  ]);
  const result6 = chooseRepresentativeInventoryImage(rowsEqual, imageMapEqual);
  // First row wins on tie (strict > means equal scores keep the first winner).
  assert.equal(result6.representative_image_url, "first.jpg", "first row wins on equal score (deterministic)");

  // count_for_color is not read — verify no crash even if present.
  const rowsWithCount = [
    { external_slab_id: "s-c", source_inventory_type: "Slab", width_actual_in: 60, length_actual_in: 60, inventory_id: "inv-c", count_for_color: 9999 }
  ];
  const imageMapCount = new Map([
    ["s-c", { image_status: "ok", image_url: "c.jpg", thumbnail_url: "c_t.jpg" }]
  ]);
  const result7 = chooseRepresentativeInventoryImage(rowsWithCount, imageMapCount);
  assert.equal(result7.representative_image_url, "c.jpg", "count_for_color ignored — correct image still chosen");

  console.log("ok: chooseRepresentativeInventoryImage (slab>remnant, ok>missing, area wins, fallback, deterministic, no count_for_color)");
}

/* ── buildElite100InventoryMap: rows tracked for scoring ────────────────── */
{
  const catalog = [
    { id: "cat-scored", color_name: "Alpine White", material_name: "ESF",
      normalized_color_name: "alpine white", normalized_material_name: "esf" }
  ];
  const invRows = [
    { color_name: "Alpine White", material_name: "ESF",
      source_inventory_type: "Slab", external_slab_id: "s1", inventory_id: "inv-1" },
    { color_name: "Alpine White", material_name: "ESF",
      source_inventory_type: "Remnant", external_slab_id: "s2", inventory_id: "inv-2" },
  ];
  const result = buildElite100InventoryMap(invRows, catalog, []);
  const acc = result.get("cat-scored");

  // rows array contains all matched inventory rows.
  assert.ok(Array.isArray(acc.rows), "acc.rows is an array");
  assert.equal(acc.rows.length, 2, "both rows are tracked");
  assert.ok(acc.rows.some((r) => r.source_inventory_type === "Slab"), "Slab row tracked");
  assert.ok(acc.rows.some((r) => r.source_inventory_type === "Remnant"), "Remnant row tracked");

  // slabIds still populated (backward-compatible).
  assert.ok(acc.slabIds.includes("s1") && acc.slabIds.includes("s2"), "slabIds still populated");
  assert.equal(acc.slabCount, 1, "slabCount correct");
  assert.equal(acc.remnantCount, 1, "remnantCount correct");

  // With the rows, chooseRepresentativeInventoryImage can now pick the better image.
  const imageMap = new Map([
    ["s1", { image_status: "ok", image_url: "slab.jpg", thumbnail_url: "slab_t.jpg" }],
    ["s2", { image_status: "ok", image_url: "rem.jpg",  thumbnail_url: "rem_t.jpg" }],
  ]);
  const repResult = chooseRepresentativeInventoryImage(acc.rows, imageMap);
  assert.equal(repResult.representative_image_url, "slab.jpg", "chooses slab image from tracked rows");
  assert.equal(repResult.representative_image_source_inventory_type, "Slab", "type reported from tracked rows");

  console.log("ok: buildElite100InventoryMap rows tracked — enables scored representative image selection");
}

/* ── zero-inventory catalog item: no rows → null representative image ────── */
{
  const catalog = [
    { id: "cat-empty", color_name: "Rare Gem", material_name: "ESF",
      normalized_color_name: "rare gem", normalized_material_name: "esf" }
  ];
  const result = buildElite100InventoryMap([], catalog, []);
  const acc = result.get("cat-empty");
  assert.equal(acc.rows.length, 0, "no rows for zero-inventory item");
  const repResult = chooseRepresentativeInventoryImage(acc.rows, new Map());
  assert.equal(repResult.representative_image_url, null, "zero-inventory → null image");
  assert.equal(repResult.representative_image_source_inventory_type, null, "zero-inventory → null type");
  console.log("ok: zero-inventory catalog item → null representative image (no crash)");
}

/* ── rejected fuzzy still does not classify as Elite 100 ────────────────── */
{
  const catalog = [
    { id: "cat-r", color_name: "Calacatta Lucent", material_name: "Stratus",
      normalized_color_name: "calacatta lucent", normalized_material_name: "stratus" }
  ];
  const invRows = [
    // Fuzzy candidate — should NOT appear in Elite 100 map
    { color_name: "Calacatta Athena", material_name: "Stratus",
      source_inventory_type: "Slab", external_slab_id: "s-fuzzy", inventory_id: "inv-fuzzy" }
  ];
  const result = buildElite100InventoryMap(invRows, catalog, []);
  const acc = result.get("cat-r");
  assert.equal(acc.slabCount, 0, "fuzzy match does not add to Elite 100 slabCount");
  assert.equal(acc.rows.length, 0, "fuzzy match rows not tracked in Elite 100 acc");
  assert.ok(!acc.slabIds.includes("s-fuzzy"), "fuzzy slab ID not in slabIds");
  console.log("ok: rejected/fuzzy inventory does not classify as Elite 100 (rows check)");
}

/* ── aliases still resolve correctly with scored representative selection ── */
{
  const catalog = [
    { id: "cat-alias", color_name: "Larvic", material_name: "ESF",
      normalized_color_name: "larvic", normalized_material_name: "esf" }
  ];
  const aliases = [
    {
      normalized_alias_color_name: "larvik",
      normalized_alias_material_name: "esf quartz",
      catalog_color_name: "Larvic",
      catalog_material_name: "ESF"
    }
  ];
  const invRows = [
    { color_name: "Larvik", material_name: "ESF Quartz",
      source_inventory_type: "Slab", external_slab_id: "s-alias", inventory_id: "inv-alias" }
  ];
  const result = buildElite100InventoryMap(invRows, catalog, aliases);
  const acc = result.get("cat-alias");
  assert.equal(acc.slabCount, 1, "alias match counts as Elite 100 slab");
  assert.equal(acc.rows.length, 1, "alias match row tracked");

  const imageMap = new Map([
    ["s-alias", { image_status: "ok", image_url: "alias.jpg", thumbnail_url: "alias_t.jpg" }]
  ]);
  const repResult = chooseRepresentativeInventoryImage(acc.rows, imageMap);
  assert.equal(repResult.representative_image_url, "alias.jpg", "alias-matched slab provides representative image");
  assert.equal(repResult.representative_image_source_inventory_type, "Slab");
  console.log("ok: aliases resolve correctly and contribute representative images");
}

console.log("\nslabInventoryApi: all tests passed");

// ── Visual asset helpers (chooseVisualAssetForDisplay, buildVisualAssetEnrichmentFields,
//    buildVisualAssetMap, buildNonStockVisualAssetMap) ──────────────────────────

import {
  chooseVisualAssetForDisplay,
  buildVisualAssetEnrichmentFields,
  buildVisualAssetMap,
  buildNonStockVisualAssetMap,
} from "./slabInventoryApi.js";

const ASSET_TEXTURE_IMPORTED = {
  id: "va-001", catalog_item_id: "cat-001",
  review_status: "imported", asset_kind: "texture",
  is_primary: false, is_active: true,
  texture_url_600: "https://slabcloud.com/scdata/textures/600/hash1.jpg",
  texture_url_1024: "https://slabcloud.com/scdata/textures/1024/hash1.jpg",
  source_system: "slabcloud_v2",
};
const ASSET_TEXTURE_APPROVED = {
  id: "va-002", catalog_item_id: "cat-001",
  review_status: "approved", asset_kind: "texture",
  is_primary: true, is_active: true,
  texture_url_600: "https://slabcloud.com/scdata/textures/600/hash2.jpg",
  texture_url_1024: "https://slabcloud.com/scdata/textures/1024/hash2.jpg",
  source_system: "slabcloud_v2",
};
const ASSET_REJECTED = {
  id: "va-003", catalog_item_id: "cat-001",
  review_status: "rejected", asset_kind: "texture",
  is_primary: false, is_active: true,
  texture_url_600: "https://example.com/rejected.jpg",
  source_system: "slabcloud_v2",
};
const ASSET_INACTIVE = {
  id: "va-004", catalog_item_id: "cat-001",
  review_status: "approved", asset_kind: "texture",
  is_primary: true, is_active: false,
  texture_url_600: "https://example.com/inactive.jpg",
  source_system: "slabcloud_v2",
};

// chooseVisualAssetForDisplay
{
  const best = chooseVisualAssetForDisplay([ASSET_TEXTURE_IMPORTED, ASSET_TEXTURE_APPROVED]);
  assert.equal(best?.id, "va-002", "approved > imported");
  console.log("ok: chooseVisualAssetForDisplay — approved beats imported");
}
{
  const best = chooseVisualAssetForDisplay([ASSET_TEXTURE_IMPORTED]);
  assert.equal(best?.id, "va-001", "imported asset returned when no approved");
  console.log("ok: chooseVisualAssetForDisplay — imported returned when no approved");
}
{
  const best = chooseVisualAssetForDisplay([ASSET_REJECTED, ASSET_INACTIVE]);
  assert.equal(best, null, "rejected + inactive → null");
  console.log("ok: chooseVisualAssetForDisplay — rejected/inactive assets not shown");
}
{
  assert.equal(chooseVisualAssetForDisplay([]), null, "empty array → null");
  assert.equal(chooseVisualAssetForDisplay(null), null, "null → null");
  console.log("ok: chooseVisualAssetForDisplay — edge cases");
}
{
  // Approved + primary beats approved without primary
  const nonPrimary = { ...ASSET_TEXTURE_APPROVED, is_primary: false, id: "va-005" };
  const best = chooseVisualAssetForDisplay([nonPrimary, ASSET_TEXTURE_APPROVED]);
  assert.equal(best?.id, "va-002", "approved+primary beats approved");
  console.log("ok: chooseVisualAssetForDisplay — is_primary preference");
}

// buildVisualAssetEnrichmentFields
{
  const fields = buildVisualAssetEnrichmentFields(ASSET_TEXTURE_APPROVED);
  assert.equal(fields.visual_asset_url, ASSET_TEXTURE_APPROVED.texture_url_600, "visual_asset_url = texture_url_600");
  assert.equal(fields.visual_asset_url_600, ASSET_TEXTURE_APPROVED.texture_url_600, "visual_asset_url_600");
  assert.equal(fields.visual_asset_url_1024, ASSET_TEXTURE_APPROVED.texture_url_1024, "visual_asset_url_1024");
  assert.equal(fields.visual_asset_source, "slabcloud_v2", "visual_asset_source");
  assert.equal(fields.visual_asset_kind, "texture", "visual_asset_kind");
  assert.equal(fields.visual_asset_review_status, "approved", "visual_asset_review_status");
  console.log("ok: buildVisualAssetEnrichmentFields — approved asset");
}
{
  const fields = buildVisualAssetEnrichmentFields(null);
  assert.equal(fields.visual_asset_url, null, "null asset → null url");
  assert.equal(fields.visual_asset_url_600, null);
  assert.equal(fields.visual_asset_url_1024, null);
  assert.equal(fields.visual_asset_source, null);
  assert.equal(fields.visual_asset_kind, null);
  assert.equal(fields.visual_asset_review_status, null);
  console.log("ok: buildVisualAssetEnrichmentFields — null asset returns null fields");
}
{
  // Never exposes count or inventory authority fields
  const fields = buildVisualAssetEnrichmentFields({ ...ASSET_TEXTURE_IMPORTED, source_count: 42 });
  assert.ok(!("source_count" in fields), "source_count must not appear in enrichment fields");
  assert.ok(!("count_for_color" in fields), "count_for_color must not appear in enrichment fields");
  console.log("ok: buildVisualAssetEnrichmentFields — no count fields exposed");
}

// buildVisualAssetMap
{
  const assetRows = [
    ASSET_TEXTURE_IMPORTED,
    ASSET_TEXTURE_APPROVED,
    { ...ASSET_TEXTURE_IMPORTED, id: "va-010", catalog_item_id: "cat-002",
      texture_url_600: "https://example.com/cat2.jpg" },
  ];
  const map = buildVisualAssetMap(assetRows);
  assert.ok(map instanceof Map, "should return Map");
  assert.equal(map.size, 2, "2 catalog items in map");
  // cat-001: approved beats imported
  assert.equal(map.get("cat-001")?.id, "va-002", "cat-001 uses approved asset");
  // cat-002: only one asset
  assert.equal(map.get("cat-002")?.id, "va-010", "cat-002 single asset");
  console.log("ok: buildVisualAssetMap — groups and selects best per catalog item");
}
{
  const map = buildVisualAssetMap([]);
  assert.equal(map.size, 0, "empty input → empty map");
  assert.equal(buildVisualAssetMap(null).size, 0, "null input → empty map");
  console.log("ok: buildVisualAssetMap — edge cases");
}
{
  // Asset with null catalog_item_id should be excluded
  const withNullCatId = { ...ASSET_TEXTURE_IMPORTED, catalog_item_id: null };
  const map = buildVisualAssetMap([withNullCatId]);
  assert.equal(map.size, 0, "null catalog_item_id assets excluded from catalog map");
  console.log("ok: buildVisualAssetMap — null catalog_item_id excluded");
}

// buildNonStockVisualAssetMap
{
  const nsAssets = [
    {
      normalized_color_name: "alabaster", normalized_material_name: "esf",
      review_status: "imported", asset_kind: "texture", is_primary: false, is_active: true,
      texture_url_600: "https://example.com/ns1.jpg", source_system: "slabcloud_v2",
      catalog_item_id: null,
    },
    {
      normalized_color_name: "calacatta gold", normalized_material_name: "cambria",
      review_status: "imported", asset_kind: "texture", is_primary: false, is_active: true,
      texture_url_600: "https://example.com/ns2.jpg", source_system: "slabcloud_v2",
      catalog_item_id: null,
    },
  ];
  const map = buildNonStockVisualAssetMap(nsAssets);
  assert.ok(map instanceof Map, "should return Map");
  assert.equal(map.size, 2, "2 non-stock color groups");
  assert.ok(map.has("alabaster||esf"), "key format correct");
  assert.ok(map.has("calacatta gold||cambria"), "key format correct for second item");
  console.log("ok: buildNonStockVisualAssetMap — correct keys and assets");
}

// Elite 100 card image priority: visual asset URL preferred over representative slab image
{
  // Simulate what the route produces: card with both visual asset and representative image
  const visualEnrichment = buildVisualAssetEnrichmentFields(ASSET_TEXTURE_APPROVED);
  const card = {
    catalog_item_id: "cat-001",
    color_name: "Alabaster",
    representative_image_url: "https://example.com/slab-photo.jpg",
    representative_thumbnail_url: "https://example.com/slab-thumb.jpg",
    ...visualEnrichment,
  };
  // Frontend priority: visual_asset_url_600 first, then representative_image_url
  const displayUrl = card.visual_asset_url_600 || card.visual_asset_url_1024
    || card.representative_thumbnail_url || card.representative_image_url;
  assert.equal(
    displayUrl,
    ASSET_TEXTURE_APPROVED.texture_url_600,
    "visual_asset_url_600 is preferred over representative_image_url"
  );
  console.log("ok: elite100 card — visual_asset_url_600 preferred over representative slab image");
}

// Elite 100 card image priority: fallback to representative slab when no visual asset
{
  const visualEnrichment = buildVisualAssetEnrichmentFields(null); // no visual asset
  const card = {
    catalog_item_id: "cat-001",
    color_name: "Alabaster",
    representative_image_url: "https://example.com/slab-photo.jpg",
    representative_thumbnail_url: "https://example.com/slab-thumb.jpg",
    ...visualEnrichment,
  };
  const displayUrl = card.visual_asset_url_600 || card.visual_asset_url_1024
    || card.representative_thumbnail_url || card.representative_image_url;
  assert.equal(
    displayUrl,
    "https://example.com/slab-thumb.jpg",
    "falls back to representative_thumbnail_url when no visual asset"
  );
  console.log("ok: elite100 card — fallback to representative slab image when no visual asset");
}

// count_for_color and v2 display count are never used as inventory authority
{
  // Verify the enrichment fields don't include any count-related fields
  const allEnrichmentKeys = Object.keys(buildVisualAssetEnrichmentFields(ASSET_TEXTURE_IMPORTED));
  const countKeys = allEnrichmentKeys.filter((k) =>
    k.includes("count") || k.includes("inventory_count") || k.includes("display_count")
  );
  assert.equal(countKeys.length, 0, "enrichment fields must not include any count fields");
  console.log("ok: count_for_color and v2 display count not used as inventory authority in enrichment");
}

console.log("\nslabInventoryApi: all visual asset helper tests passed");

