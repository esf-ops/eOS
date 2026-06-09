/**
 * Slabsmith inventory normalizer — unit tests.
 *
 * Pure functions only; no network, no filesystem in test bodies (fixture read once).
 * Run: node backend-core/src/slabsmith/normalizeSlabsmithInventory.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ACTIVE_ESF_SOURCE_PRICE_GROUPS,
  METERS_TO_INCHES,
  SLABSMITH_EXTERNAL_SOURCE,
  SLABSMITH_SOURCE_SCOPE,
  SQ_METERS_TO_SQFT,
  collectSlabsmithFieldNames,
  computeRowHash,
  extractSlabsmithSlabNodes,
  metersToInches,
  normalizeSlabsmithInventory,
  normalizeSlabsmithSlab,
  sqMetersToSqft,
} from "./normalizeSlabsmithInventory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "sample-slabs.xml");
const SAMPLE_XML = readFileSync(FIXTURE_PATH, "utf8");

// ── Parses multiple top-level nodes ─────────────────────────────────────────
{
  const nodes = extractSlabsmithSlabNodes(SAMPLE_XML);
  assert.equal(nodes.length, 3, "extracts three slab nodes");
  assert.ok(nodes.every((n) => typeof n.SlabID === "string"), "each node has SlabID");
  console.log("ok: parses multiple top-level Slabsmith.dbo.Slabs nodes");
}

// ── Returns correct row count ─────────────────────────────────────────────────
{
  const { rows } = normalizeSlabsmithInventory(SAMPLE_XML);
  assert.equal(rows.length, 3, "normalize returns three rows");
  console.log("ok: returns correct row count");
}

// ── Field mapping ─────────────────────────────────────────────────────────────
{
  const { rows } = normalizeSlabsmithInventory(SAMPLE_XML);
  const slab = rows.find((r) => r.inventory_id === "TEST-1001");
  assert.ok(slab, "finds slab row");
  assert.equal(slab.external_slab_id, "TEST-1001", "InventoryID preferred for external_slab_id");
  assert.equal(slab.inventory_id, "TEST-1001");
  assert.equal(slab.color_name, "Sample Alpha");
  assert.equal(slab.material_name, "Fake Quartz Co");
  assert.equal(slab.source_inventory_type, "Slab");
  assert.equal(slab.source_status, "Received");
  assert.equal(slab.source_price_group, "B");
  assert.equal(slab.rack, "A-01");
  assert.equal(slab.lot, "LOT-A-001");
  assert.equal(slab.finish, "Polished");
  assert.equal(slab.thickness_nominal, "3 cm");
  assert.equal(slab.external_source, SLABSMITH_EXTERNAL_SOURCE);
  assert.equal(slab.source_system, SLABSMITH_EXTERNAL_SOURCE);
  assert.equal(slab.source_inventory_scope, SLABSMITH_SOURCE_SCOPE);
  assert.equal(slab.needs_review, false);

  const remnant = rows.find((r) => r.inventory_id === "TEST-2002-1");
  assert.equal(remnant?.source_inventory_type, "Remnant");
  assert.equal(remnant?.source_price_group, "Remnant");
  console.log("ok: maps InventoryID, Name, Material, Type, Status, Price Group, Rack, Lot");
}

// ── Dimension and usable area conversion ──────────────────────────────────────
{
  const { rows } = normalizeSlabsmithInventory(SAMPLE_XML);
  const slab = rows.find((r) => r.inventory_id === "TEST-1001");

  assert.equal(metersToInches(3), round2(3 * METERS_TO_INCHES));
  assert.equal(slab.length_actual_in, round2(3 * METERS_TO_INCHES));
  assert.equal(slab.width_actual_in, round2(1.5 * METERS_TO_INCHES));
  assert.equal(slab.usable_sqft, round2(4.5 * SQ_METERS_TO_SQFT));

  const remnant = rows.find((r) => r.inventory_id === "TEST-2002-1");
  assert.equal(remnant.length_actual_in, round2(2 * METERS_TO_INCHES));
  assert.equal(remnant.width_actual_in, round2(0.8 * METERS_TO_INCHES));
  assert.equal(remnant.usable_sqft, round2(1.6 * SQ_METERS_TO_SQFT));
  console.log("ok: converts dimensions and usable area consistently");
}

// ── Preserves source_price_group (no managed override) ────────────────────────
{
  const { rows } = normalizeSlabsmithInventory(SAMPLE_XML);
  for (const row of rows) {
    assert.ok("managed_price_group" in row === false, "no managed_price_group field");
    assert.ok(
      row.source_price_group === null || typeof row.source_price_group === "string",
      "source_price_group preserved as string or null"
    );
  }
  assert.deepEqual([...ACTIVE_ESF_SOURCE_PRICE_GROUPS], [
    "Promo",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
  ]);
  assert.ok(!ACTIVE_ESF_SOURCE_PRICE_GROUPS.includes("G"), "Group G not in active list");
  console.log("ok: preserves source_price_group without managed override");
}

// ── Missing / unknown type → needs_review ─────────────────────────────────────
{
  const { rows } = normalizeSlabsmithInventory(SAMPLE_XML);
  const missingType = rows.find((r) => r.inventory_id === "TEST-3003");
  assert.equal(missingType.source_inventory_type, null);
  assert.equal(missingType.needs_review, true);

  const unknownTypeXml =
    '<Slabsmith.dbo.Slabs SlabID="EEEE5555-5555-4555-8555-555555555555" InventoryID="TEST-4004" Type="Mystery" Name="Sample Delta" Material="Unknown Material Co" />';
  const unknown = normalizeSlabsmithSlab(extractSlabsmithSlabNodes(unknownTypeXml)[0]);
  assert.equal(unknown.source_inventory_type, null);
  assert.equal(unknown.needs_review, true);
  console.log("ok: marks unknown or missing type as needs_review");
}

// ── row_hash stability ────────────────────────────────────────────────────────
{
  const { rows } = normalizeSlabsmithInventory(SAMPLE_XML);
  const first = rows[0];
  const again = normalizeSlabsmithSlab(rows[0].raw_payload);
  assert.equal(first.row_hash, again.row_hash, "row_hash stable for identical input");
  assert.equal(first.row_hash, computeRowHash(rows[0].raw_payload));

  const mutated = { ...rows[0].raw_payload, Name: "Sample Alpha Changed" };
  const changed = normalizeSlabsmithSlab(mutated);
  assert.notEqual(first.row_hash, changed.row_hash, "row_hash changes when color_name changes");

  const rackMutated = { ...rows[0].raw_payload, Rack: "Z-99" };
  assert.notEqual(first.row_hash, computeRowHash(rackMutated), "row_hash changes when rack changes");
  console.log("ok: row_hash stable / changes on meaningful fields");
}

// ── Identity fallback order ───────────────────────────────────────────────────
{
  const noInvXml =
    '<Slabsmith.dbo.Slabs SlabID="FFFF6666-6666-4666-8666-666666666666" Type="Slab" Name="No Inv" Material="Test" />';
  const noInv = normalizeSlabsmithSlab(extractSlabsmithSlabNodes(noInvXml)[0]);
  assert.equal(noInv.external_slab_id, "FFFF6666-6666-4666-8666-666666666666");
  assert.equal(noInv.needs_review, false, "valid Type without InventoryID is not needs_review");

  const parentOnlyXml =
    '<Slabsmith.dbo.Slabs ParentSlabUID="GGGG7777-7777-4777-8777-777777777777" Type="Remnant" Name="Parent Only" Material="Test" />';
  const parentOnly = normalizeSlabsmithSlab(extractSlabsmithSlabNodes(parentOnlyXml)[0]);
  assert.equal(parentOnly.external_slab_id, "GGGG7777-7777-4777-8777-777777777777");
  console.log("ok: external_slab_id fallback order");
}

// ── raw_payload preserved ─────────────────────────────────────────────────────
{
  const { rows } = normalizeSlabsmithInventory(SAMPLE_XML);
  assert.equal(rows[0].raw_payload.Name, "Sample Alpha");
  assert.equal(rows[0].raw_payload["Price_x0020_Group"], "B");
  console.log("ok: raw_payload preserves source fields");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

console.log("\nAll Slabsmith normalizer tests passed.");
