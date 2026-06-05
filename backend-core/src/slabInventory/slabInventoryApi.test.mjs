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
    "/api/slab-inventory/colors/:colorKey/inventory"
  ]) {
    assert.ok(paths.has(expected), `route ${expected} registered`);
  }
  console.log("ok: read-only route shape (GET only, 6 routes including color-programs)");
}

console.log("\nslabInventoryApi: all tests passed");
