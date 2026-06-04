/**
 * slabCloudPersistence — unit tests.
 *
 * Uses a recording MOCK Supabase client. No real Supabase, no network.
 * Run: npm run eos:test:slabcloud-cache
 */
import assert from "node:assert/strict";

import {
  persistSlabCloudInventory,
  isCacheWriteEnabled,
  buildInventoryRows,
  buildRawRecordRows,
  buildImageRows,
  buildMaterialRows,
  materialNameOf,
  CACHE_WRITE_ENV,
  TABLE_SYNC_RUNS,
  TABLE_RAW_RECORDS,
  TABLE_INVENTORY,
  TABLE_MATERIALS,
  TABLE_IMAGES,
  INVENTORY_CONFLICT_KEY,
  MATERIALS_CONFLICT_KEY,
  IMAGES_CONFLICT_KEY,
  SENTINEL_ORG_ID,
} from "./slabCloudPersistence.js";
import { normalizeSlabRecords } from "./normalizeSlabCloudInventory.js";

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";

// ── Recording mock Supabase client ───────────────────────────────────────────
//
// Supports the chain shapes used by the persistence module:
//   db.from(t).insert(payload).select("id").limit(1)  → { data:[{id}], error }
//   db.from(t).insert(rows)                            → { error }
//   db.from(t).upsert(rows, { onConflict })            → { error }
//   db.from(t).update(payload).eq("id", id)            → { error }
//   db.from(t).delete()                                → recorded (should never happen)
function createMockSupabase({ failOn = null } = {}) {
  const calls = { inserts: [], upserts: [], updates: [], deletes: [], selects: [] };
  let idCounter = 0;

  function shouldFail(table, op) {
    if (!failOn) return false;
    return failOn.table === table && failOn.op === op;
  }

  function makeBuilder(table, op, payload, opts) {
    const builder = {
      _table: table,
      _op: op,
      _payload: payload,
      _opts: opts,
      _select: false,
      select(cols) {
        this._select = true;
        this._selectCols = cols;
        calls.selects.push({ table, cols });
        return this;
      },
      limit() {
        return this;
      },
      eq(col, val) {
        this._eqCol = col;
        this._eqVal = val;
        return this;
      },
      then(resolve, reject) {
        let result;
        try {
          if (shouldFail(table, op)) {
            result = { data: null, error: { message: `mock failure on ${table}.${op}`, code: "MOCK" } };
          } else if (op === "insert" && this._select) {
            idCounter += 1;
            result = { data: [{ id: `mock-${table}-${idCounter}` }], error: null };
          } else {
            result = { data: null, error: null };
          }
        } catch (e) {
          return reject(e);
        }
        return resolve(result);
      },
    };
    return builder;
  }

  return {
    calls,
    from(table) {
      return {
        insert(payload) {
          calls.inserts.push({ table, payload });
          return makeBuilder(table, "insert", payload);
        },
        upsert(payload, opts) {
          calls.upserts.push({ table, payload, opts });
          return makeBuilder(table, "upsert", payload, opts);
        },
        update(payload) {
          calls.updates.push({ table, payload });
          return makeBuilder(table, "update", payload);
        },
        delete() {
          calls.deletes.push({ table });
          return makeBuilder(table, "delete");
        },
      };
    },
  };
}

const SAMPLE_RAW = [
  {
    SlabID: "437D9CA4-76B0-453B-BDE9-9007FFC44C5A",
    Name: "Alabaster",
    Material: "ESF Quartz",
    Width_Actual: "2.07475210775013",
    Length_Actual: "3.52267981545561",
    InventoryID: "55817",
    Thickness_Nominal: "3 cm",
    Rack: "79L",
    Lot: "5999-14",
    Price_Group: "B",
    Distributor: "ESF",
    UsableA: "3441.754",
    UsableD: "1980.318",
    count: 3,
  },
  {
    SlabID: "B2222222-0000-0000-0000-000000000002",
    Name: "Alabaster",
    Material: "ESF Quartz",
    Width_Actual: "2.10",
    Length_Actual: "3.50",
    InventoryID: "55818",
    Thickness_Nominal: "3 cm",
    Price_Group: "B",
    Distributor: "ESF",
    count: 3, // same group-level count repeated — must NOT be summed
  },
  {
    // Missing SlabID — must be preserved in raw, skipped from inventory/images.
    SlabID: "",
    Name: "NoId Color",
    Material: "Mystery",
    Width_Actual: null,
    Length_Actual: null,
    count: 1,
  },
];

const SAMPLE_MATERIALS = [
  { Material: "ESF Quartz" },
  { Material: "Caesarstone" },
  { Material: "ESF Quartz" }, // duplicate — should dedup
];

function normalized() {
  return normalizeSlabRecords(SAMPLE_RAW, { companyCode: "kbyd" });
}

// ── isCacheWriteEnabled reflects env ─────────────────────────────────────────
{
  const prev = process.env[CACHE_WRITE_ENV];
  delete process.env[CACHE_WRITE_ENV];
  assert.equal(isCacheWriteEnabled(), false, "absent → false");
  process.env[CACHE_WRITE_ENV] = "0";
  assert.equal(isCacheWriteEnabled(), false, "'0' → false");
  process.env[CACHE_WRITE_ENV] = "true";
  assert.equal(isCacheWriteEnabled(), false, "'true' → false (must be exactly '1')");
  process.env[CACHE_WRITE_ENV] = "1";
  assert.equal(isCacheWriteEnabled(), true, "'1' → true");
  if (prev === undefined) delete process.env[CACHE_WRITE_ENV];
  else process.env[CACHE_WRITE_ENV] = prev;
  console.log("ok: isCacheWriteEnabled gate");
}

// ── No writes when gate is absent (dry-run) ──────────────────────────────────
{
  const prev = process.env[CACHE_WRITE_ENV];
  delete process.env[CACHE_WRITE_ENV];

  const db = createMockSupabase();
  const result = await persistSlabCloudInventory({
    db, // provided, but must NOT be used in dry-run
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: SAMPLE_MATERIALS,
  });

  assert.equal(result.mode, "dry-run", "dry-run mode");
  assert.equal(result.writeEnabled, false, "writeEnabled false");
  assert.equal(result.syncRunId, null, "no sync run id");
  assert.equal(db.calls.inserts.length, 0, "no inserts");
  assert.equal(db.calls.upserts.length, 0, "no upserts");
  assert.equal(db.calls.updates.length, 0, "no updates");
  assert.ok(result.wouldWrite.rawRecords === 3, "would write 3 raw records");
  assert.ok(result.wouldWrite.slabInventory === 2, "would write 2 inventory rows (null id skipped)");
  assert.ok(result.wouldWrite.slabImages === 2, "would write 2 image rows");
  assert.ok(result.wouldWrite.slabMaterials === 2, "would write 2 material rows (deduped)");

  if (prev === undefined) delete process.env[CACHE_WRITE_ENV];
  else process.env[CACHE_WRITE_ENV] = prev;
  console.log("ok: no writes when gate absent (dry-run)");
}

// ── Creates sync run + writes when writeEnabled ──────────────────────────────
{
  const db = createMockSupabase();
  const result = await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: SAMPLE_MATERIALS,
    warnings: [],
    writeEnabled: true,
  });

  assert.equal(result.mode, "write", "write mode");
  assert.ok(result.syncRunId, "sync run id returned");
  assert.equal(result.status, "completed", "status completed");

  // Sync run created (insert into slabcloud_sync_runs with select for id)
  const runInsert = db.calls.inserts.find((c) => c.table === TABLE_SYNC_RUNS);
  assert.ok(runInsert, "sync run inserted");
  assert.equal(runInsert.payload.status, "running", "sync run starts as running");

  // Final update marks completed
  const runUpdate = db.calls.updates.find(
    (c) => c.table === TABLE_SYNC_RUNS && c.payload.status === "completed"
  );
  assert.ok(runUpdate, "sync run updated to completed");
  assert.equal(runUpdate.payload.slab_deactivated_count, 0, "no deactivation in phase 1");

  console.log("ok: creates sync run + writes when enabled");
}

// ── Raw records inserted ─────────────────────────────────────────────────────
{
  const db = createMockSupabase();
  await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: SAMPLE_MATERIALS,
    writeEnabled: true,
  });

  const rawInsert = db.calls.inserts.find((c) => c.table === TABLE_RAW_RECORDS);
  assert.ok(rawInsert, "raw records inserted");
  assert.equal(rawInsert.payload.length, 3, "all 3 raw records (incl. missing id)");
  for (const row of rawInsert.payload) {
    assert.ok("raw_json" in row, "raw_json present");
    assert.ok(row.sync_run_id, "sync_run_id attached");
  }
  console.log("ok: raw records inserted (incl. missing slab id)");
}

// ── Inventory upsert uses the expected unique key + skips missing slab id ─────
{
  const db = createMockSupabase();
  await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: SAMPLE_MATERIALS,
    writeEnabled: true,
  });

  const invUpsert = db.calls.upserts.find((c) => c.table === TABLE_INVENTORY);
  assert.ok(invUpsert, "inventory upsert happened");
  assert.equal(invUpsert.opts.onConflict, INVENTORY_CONFLICT_KEY, "inventory onConflict key");
  assert.equal(invUpsert.payload.length, 2, "missing slab id skipped from inventory");
  for (const row of invUpsert.payload) {
    assert.ok(row.external_slab_id, "every inventory row has external_slab_id");
    assert.equal(row.is_active, true, "rows are active (no deactivation)");
    assert.equal(row.dimension_source, "slabcloud_api", "dimension source set");
  }
  console.log("ok: inventory upsert key + skips missing slab id");
}

// ── count_for_color stored as-is, never summed ───────────────────────────────
{
  const db = createMockSupabase();
  await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: [],
    writeEnabled: true,
  });

  const invUpsert = db.calls.upserts.find((c) => c.table === TABLE_INVENTORY);
  // Both Alabaster rows carry count_for_color = 3 (group-level), not 6.
  for (const row of invUpsert.payload) {
    assert.equal(row.count_for_color, 3, "count_for_color stored as-is (3, not summed)");
  }
  console.log("ok: count_for_color stored as-is, never summed");
}

// ── Materials upsert works ───────────────────────────────────────────────────
{
  const db = createMockSupabase();
  await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: SAMPLE_MATERIALS,
    writeEnabled: true,
  });

  const matUpsert = db.calls.upserts.find((c) => c.table === TABLE_MATERIALS);
  assert.ok(matUpsert, "materials upsert happened");
  assert.equal(matUpsert.opts.onConflict, MATERIALS_CONFLICT_KEY, "materials onConflict key");
  assert.equal(matUpsert.payload.length, 2, "deduped to 2 materials");
  const names = matUpsert.payload.map((r) => r.material_name).sort();
  assert.deepEqual(names, ["Caesarstone", "ESF Quartz"], "material names");
  console.log("ok: materials upsert (deduped)");
}

// ── Images upsert writes image_status unknown ────────────────────────────────
{
  const db = createMockSupabase();
  await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: [],
    writeEnabled: true,
  });

  const imgUpsert = db.calls.upserts.find((c) => c.table === TABLE_IMAGES);
  assert.ok(imgUpsert, "images upsert happened");
  assert.equal(imgUpsert.opts.onConflict, IMAGES_CONFLICT_KEY, "images onConflict key");
  assert.equal(imgUpsert.payload.length, 2, "2 image rows (missing slab id skipped)");
  for (const row of imgUpsert.payload) {
    assert.equal(row.image_status, "unknown", "image_status unknown");
    assert.equal(row.image_url_pattern, "slabcloud_slab_jpg", "image url pattern");
  }
  console.log("ok: images upsert with image_status unknown");
}

// ── All write payloads include organization_id ───────────────────────────────
{
  const db = createMockSupabase();
  await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: SAMPLE_MATERIALS,
    writeEnabled: true,
  });

  // Sync run insert
  for (const c of db.calls.inserts) {
    const rows = Array.isArray(c.payload) ? c.payload : [c.payload];
    for (const row of rows) {
      assert.equal(row.organization_id, ORG_ID, `insert ${c.table} has org id`);
    }
  }
  for (const c of db.calls.upserts) {
    for (const row of c.payload) {
      assert.equal(row.organization_id, ORG_ID, `upsert ${c.table} has org id`);
    }
  }
  console.log("ok: all write payloads include organization_id");
}

// ── No delete calls are ever made ────────────────────────────────────────────
{
  const db = createMockSupabase();
  await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: SAMPLE_MATERIALS,
    writeEnabled: true,
  });
  assert.equal(db.calls.deletes.length, 0, "no delete calls");
  console.log("ok: no delete calls");
}

// ── Failure updates sync run status to failed ────────────────────────────────
{
  const db = createMockSupabase({ failOn: { table: TABLE_INVENTORY, op: "upsert" } });
  let threw = false;
  try {
    await persistSlabCloudInventory({
      db,
      organizationId: ORG_ID,
      config: { companyCode: "kbyd" },
      normalized: normalized(),
      materials: SAMPLE_MATERIALS,
      writeEnabled: true,
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "persistence rethrows on write failure");
  const failUpdate = db.calls.updates.find(
    (c) => c.table === TABLE_SYNC_RUNS && c.payload.status === "failed"
  );
  assert.ok(failUpdate, "sync run marked failed");
  assert.ok(failUpdate.payload.error_message, "error message recorded");
  console.log("ok: failure marks sync run failed");
}

// ── Write enabled but no client / no org id → throws ─────────────────────────
{
  let threwNoDb = false;
  try {
    await persistSlabCloudInventory({
      db: null,
      organizationId: ORG_ID,
      normalized: normalized(),
      writeEnabled: true,
    });
  } catch {
    threwNoDb = true;
  }
  assert.equal(threwNoDb, true, "no db client → throws");

  let threwNoOrg = false;
  try {
    await persistSlabCloudInventory({
      db: createMockSupabase(),
      organizationId: null,
      normalized: normalized(),
      writeEnabled: true,
    });
  } catch {
    threwNoOrg = true;
  }
  assert.equal(threwNoOrg, true, "no org id → throws");
  console.log("ok: write enabled requires db + org id");
}

// ── Inactive marking is not implemented in this phase ────────────────────────
{
  const db = createMockSupabase();
  const result = await persistSlabCloudInventory({
    db,
    organizationId: ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
    materials: SAMPLE_MATERIALS,
    writeEnabled: true,
  });
  // No payload anywhere should set is_active=false.
  for (const c of db.calls.upserts) {
    for (const row of c.payload) {
      assert.notEqual(row.is_active, false, "no row deactivated");
    }
  }
  assert.equal(result.written.slabInventory, 2, "inventory write count");
  console.log("ok: no inactive marking in phase 1");
}

// ── Pure builders: dry-run uses sentinel org when none provided ───────────────
{
  const rows = buildInventoryRows({
    organizationId: SENTINEL_ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
  });
  assert.equal(rows.length, 2, "2 inventory rows from builder");
  assert.equal(rows[0].organization_id, SENTINEL_ORG_ID, "sentinel org id");

  const raw = buildRawRecordRows({
    organizationId: SENTINEL_ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
  });
  assert.equal(raw.length, 3, "3 raw rows from builder");

  const imgs = buildImageRows({
    organizationId: SENTINEL_ORG_ID,
    config: { companyCode: "kbyd" },
    normalized: normalized(),
  });
  assert.equal(imgs.length, 2, "2 image rows from builder");

  const mats = buildMaterialRows({
    organizationId: SENTINEL_ORG_ID,
    config: { companyCode: "kbyd" },
    materials: SAMPLE_MATERIALS,
  });
  assert.equal(mats.length, 2, "2 material rows from builder");

  assert.equal(materialNameOf({ Material: "Quartz" }), "Quartz", "materialNameOf Material");
  assert.equal(materialNameOf({ name: "Granite" }), "Granite", "materialNameOf name");
  assert.equal(materialNameOf({}), null, "materialNameOf empty → null");
  assert.equal(materialNameOf(null), null, "materialNameOf null → null");
  console.log("ok: pure builders");
}

console.log("\nslabCloudPersistence: all tests passed");
