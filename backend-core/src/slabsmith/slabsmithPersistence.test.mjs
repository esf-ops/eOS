/**
 * slabsmithPersistence — unit tests.
 *
 * Pure helpers + recording mock Supabase client. No live Supabase.
 * Run: npm run eos:test:slabsmith-persistence
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSlabsmithInventory, SLABSMITH_EXTERNAL_SOURCE, SLABSMITH_SOURCE_SCOPE } from "./normalizeSlabsmithInventory.js";
import {
  buildSlabsmithInventoryRows,
  buildSlabsmithRawRecordRows,
  buildSlabsmithSyncRunInsert,
  classifyInventoryChanges,
  isSlabsmithWriteEnabled,
  mapSlabsmithInventoryRow,
  persistSlabsmithInventory,
  planSlabsmithPersistence,
  SLABSMITH_WRITE_ENV,
} from "./slabsmithPersistence.js";
import {
  INVENTORY_CONFLICT_KEY,
  TABLE_INVENTORY,
  TABLE_RAW_RECORDS,
  TABLE_SYNC_RUNS,
} from "../slabcloud/slabCloudPersistence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = readFileSync(join(__dirname, "fixtures/sample-slabs.xml"), "utf8");
const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";

function createMockSupabase({ selectData = [] } = {}) {
  const calls = { inserts: [], upserts: [], updates: [], selects: [] };
  let idCounter = 0;

  function makeThenable(table, op, resolveValue) {
    return {
      select() {
        return this;
      },
      limit() {
        return this;
      },
      eq(col, val) {
        calls.selects.push({ table, op, col, val });
        return this;
      },
      in(col, vals) {
        calls.selects.push({ table, op, col, vals });
        return this;
      },
      then(resolve) {
        return resolve(resolveValue);
      },
    };
  }

  return {
    calls,
    from(table) {
      return {
        insert(payload) {
          calls.inserts.push({ table, payload });
          idCounter += 1;
          return makeThenable(table, "insert", {
            data: [{ id: `mock-sync-${idCounter}` }],
            error: null,
          });
        },
        upsert(payload, opts) {
          calls.upserts.push({ table, payload, opts });
          return makeThenable(table, "upsert", { data: null, error: null });
        },
        update(payload) {
          calls.updates.push({ table, payload });
          return makeThenable(table, "update", { data: null, error: null });
        },
        select(cols) {
          calls.selects.push({ table, op: "select", cols });
          return makeThenable(table, "select", { data: selectData, error: null });
        },
      };
    },
  };
}

const { rows } = normalizeSlabsmithInventory(FIXTURE_XML);

// ── Write gate ────────────────────────────────────────────────────────────────
{
  const prev = process.env[SLABSMITH_WRITE_ENV];
  delete process.env[SLABSMITH_WRITE_ENV];
  assert.equal(isSlabsmithWriteEnabled(), false);
  process.env[SLABSMITH_WRITE_ENV] = "1";
  assert.equal(isSlabsmithWriteEnabled(), true);
  process.env[SLABSMITH_WRITE_ENV] = "0";
  assert.equal(isSlabsmithWriteEnabled(), false);
  if (prev === undefined) delete process.env[SLABSMITH_WRITE_ENV];
  else process.env[SLABSMITH_WRITE_ENV] = prev;
  console.log("ok: write gate");
}

// ── Sync run payload ──────────────────────────────────────────────────────────
{
  const payload = buildSlabsmithSyncRunInsert({
    organizationId: ORG_ID,
    runMeta: {
      triggeredBy: "local_script",
      slabRowCount: 1,
      remnantRowCount: 1,
      allInventoryRowCount: 3,
      warnings: [],
    },
  });
  assert.equal(payload.external_source, SLABSMITH_EXTERNAL_SOURCE);
  assert.equal(payload.inventory_scope, SLABSMITH_SOURCE_SCOPE);
  assert.equal(payload.status, "running");
  assert.equal(payload.slab_deactivated_count, undefined);
  console.log("ok: sync run insert payload");
}

// ── Inventory row mapping ─────────────────────────────────────────────────────
{
  const slab = rows.find((r) => r.inventory_id === "TEST-1001");
  const mapped = mapSlabsmithInventoryRow(slab, {
    organizationId: ORG_ID,
    syncRunId: "run-1",
    config: {},
    now: () => "2026-01-01T00:00:00.000Z",
  });
  assert.equal(mapped.external_source, SLABSMITH_EXTERNAL_SOURCE);
  assert.equal(mapped.price_group, "B");
  assert.equal(mapped.source_inventory_scope, SLABSMITH_SOURCE_SCOPE);
  assert.equal(mapped.source_inventory_type, "Slab");
  assert.equal(mapped.dimension_source, "slabsmith_xml");
  assert.equal(mapped.is_active, true);
  assert.ok(!("managed_price_group" in mapped));
  console.log("ok: inventory row mapping");
}

// ── Raw + inventory builders ──────────────────────────────────────────────────
{
  const rawRows = buildSlabsmithRawRecordRows({
    organizationId: ORG_ID,
    normalized: rows,
  });
  assert.equal(rawRows.length, 3);
  assert.equal(rawRows[0].record_source, "slabsmith_xml");
  assert.equal(rawRows[0].external_source, SLABSMITH_EXTERNAL_SOURCE);

  const invRows = buildSlabsmithInventoryRows({
    organizationId: ORG_ID,
    normalized: rows,
  });
  assert.equal(invRows.length, 3);
  assert.ok(invRows.every((r) => r.external_slab_id));
  console.log("ok: raw and inventory builders");
}

// ── Change classification ─────────────────────────────────────────────────────
{
  const incoming = buildSlabsmithInventoryRows({
    organizationId: ORG_ID,
    normalized: rows,
  });
  const counts = classifyInventoryChanges([], incoming);
  assert.equal(counts.inserted, 3);
  assert.equal(counts.updated, 0);
  assert.equal(counts.unchanged, 0);

  const same = classifyInventoryChanges(incoming, incoming);
  assert.equal(same.inserted, 0);
  assert.equal(same.updated, 0);
  assert.equal(same.unchanged, 3);

  const changed = classifyInventoryChanges(incoming, [
    { ...incoming[0], color_name: "Changed Name" },
    incoming[1],
    incoming[2],
  ]);
  assert.equal(changed.updated, 1);
  assert.equal(changed.unchanged, 2);
  console.log("ok: classifyInventoryChanges");
}

// ── Dry-run persistence (no Supabase) ─────────────────────────────────────────
{
  const result = await persistSlabsmithInventory({
    normalized: rows,
    organizationId: ORG_ID,
    writeEnabled: false,
  });
  assert.equal(result.mode, "dry-run");
  assert.equal(result.writeEnabled, false);
  assert.equal(result.syncRunId, null);
  assert.equal(result.rows_seen, 3);
  assert.equal(result.wouldWrite.slabInventory, 3);
  assert.equal(result.needs_review, 1);
  console.log("ok: persistSlabsmithInventory dry-run");
}

// ── Write path with mock Supabase ─────────────────────────────────────────────
{
  const db = createMockSupabase({ selectData: [] });
  const result = await persistSlabsmithInventory({
    db,
    organizationId: ORG_ID,
    normalized: rows,
    writeEnabled: true,
    runMeta: { triggeredBy: "test" },
  });

  assert.equal(result.mode, "write");
  assert.equal(result.status, "completed");
  assert.ok(result.syncRunId);
  assert.equal(result.rows_seen, 3);
  assert.equal(result.inserted, 3);
  assert.equal(result.raw_records_written, 3);
  assert.equal(result.slab_inventory_upserted, 3);
  assert.equal(result.needs_review, 1);

  assert.equal(db.calls.inserts.length, 2);
  assert.equal(db.calls.inserts[0].table, TABLE_SYNC_RUNS);
  assert.equal(db.calls.inserts[1].table, TABLE_RAW_RECORDS);
  assert.equal(db.calls.upserts.length, 1);
  assert.equal(db.calls.upserts[0].table, TABLE_INVENTORY);
  assert.equal(db.calls.upserts[0].opts.onConflict, INVENTORY_CONFLICT_KEY);
  assert.equal(db.calls.deletes?.length ?? 0, 0);
  console.log("ok: persistSlabsmithInventory write path (mock)");
}

// ── Plan helper ───────────────────────────────────────────────────────────────
{
  const plan = planSlabsmithPersistence({
    organizationId: ORG_ID,
    normalized: rows,
  });
  assert.equal(plan.inventoryRows.length, 3);
  assert.equal(plan.inputSummary.needsReview, 1);
  console.log("ok: planSlabsmithPersistence");
}

console.log("\nAll slabsmithPersistence tests passed.");
