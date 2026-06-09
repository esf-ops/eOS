import assert from "node:assert/strict";
import { buildElite100InventoryMap } from "./slabInventoryApi.js";
import { ELITE100_INVENTORY_MATCH_COLUMNS } from "./elite100CardModel.js";
import {
  buildElite100MatchReport,
  compactElite100MatchDebug,
  diagnoseElite100CatalogItem,
  suggestFuzzyInventoryCandidates,
  groupInventoryByColorMaterial,
} from "./elite100MatchDiagnostics.js";

const CATALOG = [
  {
    id: "cat-carrara",
    color_name: "Carrara Classic",
    material_name: "ASMI",
    normalized_color_name: "carrara classic",
    normalized_material_name: "asmi",
    price_group: "Promo",
  },
  {
    id: "cat-alabaster",
    color_name: "Alabaster",
    material_name: "ESF",
    normalized_color_name: "alabaster",
    normalized_material_name: "esf",
    price_group: "B",
  },
];

const ALIASES = [
  {
    normalized_alias_color_name: "bianco carrara",
    normalized_alias_material_name: "asmi",
    alias_color_name: "Bianco Carrara",
    alias_material_name: "ASMI",
    catalog_color_name: "Carrara Classic",
    catalog_material_name: "ASMI",
  },
];

/* ── exact catalog name match (slabsmith-style rows) ─────────────────────── */
{
  const invRows = [
    {
      external_source: "slabsmith",
      external_slab_id: "INV-1",
      inventory_id: "INV-1",
      color_name: "Carrara Classic",
      material_name: "ASMI",
      source_inventory_type: "Slab",
    },
    {
      external_source: "slabsmith",
      external_slab_id: "INV-2",
      inventory_id: "INV-2",
      color_name: "Alabaster",
      material_name: "ESF",
      source_inventory_type: "Remnant",
    },
  ];
  const map = buildElite100InventoryMap(invRows, CATALOG, []);
  assert.equal(map.get("cat-carrara").rows.length, 1);
  assert.equal(map.get("cat-alabaster").rows.length, 1);

  const diag = diagnoseElite100CatalogItem(CATALOG[0], invRows, CATALOG, []);
  assert.equal(diag.matched_inventory_row_count, 1);
  assert.deepEqual(diag.match_methods, ["exact"]);
  assert.equal(diag.fuzzy_candidate_inventory.length, 0);
  console.log("ok: elite100 exact catalog match (slabsmith rows)");
}

/* ── approved alias match ──────────────────────────────────────────────── */
{
  const invRows = [
    {
      external_source: "slabsmith",
      external_slab_id: "INV-3",
      inventory_id: "INV-3",
      color_name: "Bianco Carrara",
      material_name: "ASMI",
      source_inventory_type: "Slab",
    },
  ];
  const map = buildElite100InventoryMap(invRows, CATALOG, ALIASES);
  assert.equal(map.get("cat-carrara").rows.length, 1, "alias maps to Carrara Classic");

  const diag = diagnoseElite100CatalogItem(CATALOG[0], invRows, CATALOG, ALIASES);
  assert.equal(diag.matched_inventory_row_count, 1);
  assert.deepEqual(diag.match_methods, ["alias"]);
  assert.equal(diag.approved_aliases.length, 1);
  console.log("ok: elite100 approved alias match");
}

/* ── unmatched catalog returns zero count + fuzzy candidates ───────────── */
{
  const invRows = [
    {
      external_source: "slabsmith",
      external_slab_id: "INV-4",
      inventory_id: "INV-4",
      color_name: "Carrara Classico",
      material_name: "ASMI",
      source_inventory_type: "Slab",
    },
  ];
  const map = buildElite100InventoryMap(invRows, CATALOG, []);
  assert.equal(map.get("cat-carrara").rows.length, 0);

  const diag = diagnoseElite100CatalogItem(CATALOG[0], invRows, CATALOG, []);
  assert.equal(diag.matched_inventory_row_count, 0);
  assert.ok(diag.fuzzy_candidate_inventory.length >= 1);
  assert.ok(
    diag.fuzzy_candidate_inventory[0].color_name === "Carrara Classico" ||
      diag.fuzzy_candidate_inventory.some((c) => c.color_name === "Carrara Classico")
  );
  console.log("ok: elite100 unmatched catalog with fuzzy candidates");
}

/* ── source scoping: only active-source rows match ─────────────────────── */
{
  const invRows = [
    {
      external_source: "slabsmith",
      external_slab_id: "S1",
      color_name: "Alabaster",
      material_name: "ESF",
      source_inventory_type: "Slab",
    },
    {
      external_source: "slabcloud",
      external_slab_id: "C1",
      color_name: "Alabaster",
      material_name: "ESF",
      source_inventory_type: "Slab",
    },
  ];
  const slabsmithOnly = invRows.filter((r) => r.external_source === "slabsmith");
  const map = buildElite100InventoryMap(slabsmithOnly, CATALOG, []);
  assert.equal(map.get("cat-alabaster").rows.length, 1);
  console.log("ok: elite100 source scoping uses slabsmith rows only");
}

/* ── match report aggregates ───────────────────────────────────────────── */
{
  const invRows = [
    {
      external_source: "slabsmith",
      color_name: "Alabaster",
      material_name: "ESF",
      source_inventory_type: "Slab",
      external_slab_id: "A1",
    },
    {
      external_source: "slabsmith",
      color_name: "Mystery Stone",
      material_name: "Granite",
      source_inventory_type: "Slab",
      external_slab_id: "M1",
    },
  ];
  const report = buildElite100MatchReport({
    catalogItemList: CATALOG,
    invRows,
    resolvedAliases: ALIASES,
    activeInventorySource: "slabsmith",
  });
  assert.equal(report.active_inventory_source, "slabsmith");
  assert.equal(report.matched_catalog_count, 1);
  assert.equal(report.unmatched_catalog_count, 1);
  assert.ok(report.unmapped_inventory.some((u) => u.color_name === "Mystery Stone"));
  console.log("ok: buildElite100MatchReport aggregates");
}

/* ── compact debug payload ─────────────────────────────────────────────── */
{
  const compact = compactElite100MatchDebug(
    diagnoseElite100CatalogItem(CATALOG[1], [], CATALOG, [])
  );
  assert.equal(compact.matched_inventory_row_count, 0);
  assert.ok(Array.isArray(compact.approved_aliases));
  console.log("ok: compactElite100MatchDebug");
}

/* ── Elite 100 inventory columns match All Inventory basis (no scope/type) ─ */
{
  assert.ok(ELITE100_INVENTORY_MATCH_COLUMNS.includes("color_name"));
  assert.ok(ELITE100_INVENTORY_MATCH_COLUMNS.includes("material_name"));
  assert.ok(ELITE100_INVENTORY_MATCH_COLUMNS.includes("external_source"));
  assert.ok(!ELITE100_INVENTORY_MATCH_COLUMNS.includes("source_inventory_scope"));
  console.log("ok: ELITE100_INVENTORY_MATCH_COLUMNS (no scope filter columns)");
}

/* ── groupInventoryByColorMaterial ───────────────────────────────────── */
{
  const groups = groupInventoryByColorMaterial([
    { color_name: "A", material_name: "M", id: 1 },
    { color_name: "A", material_name: "M", id: 2 },
  ]);
  assert.equal(groups.size, 1);
  assert.equal(groups.values().next().value.rows.length, 2);
  console.log("ok: groupInventoryByColorMaterial");
}

/* ── suggestFuzzyInventoryCandidates material gate ───────────────────── */
{
  const groups = groupInventoryByColorMaterial([
    { color_name: "Carrara Classico", material_name: "ASMI" },
  ]);
  const candidates = suggestFuzzyInventoryCandidates(CATALOG[0], groups, { limit: 3 });
  assert.ok(candidates.length >= 1);
  console.log("ok: suggestFuzzyInventoryCandidates");
}
