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
  buildSlabsmithSyncRunFinalUpdate,
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
import { RETIRE_MISSING_ENV } from "../slabInventory/slabInventoryRetirement.js";

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

// ── Retirement: enhanced recording mock (supports scope fetch + retire update) ─
//
// Distinguishes the source-scope select ("id,external_slab_id,is_active") from
// the change-classification select. Records updates and would-be deletes.
function createRetireMockSupabase({ scopeRows = [] } = {}) {
  const calls = {
    inserts: [],
    upserts: [],
    updates: [],
    deletes: [],
    scopeSelects: [],
    retireFilters: [],
  };
  let idCounter = 0;
  const SCOPE_COLS = "id,external_slab_id,is_active";

  function selectQuery(table, terminalData) {
    const filters = {};
    let isScope = false;
    const q = {
      _cols: null,
      select(cols) {
        this._cols = cols;
        if (cols === SCOPE_COLS) isScope = true;
        return this;
      },
      eq(col, val) {
        filters[col] = val;
        return this;
      },
      in() {
        // change-classification terminal
        return Promise.resolve({ data: terminalData, error: null });
      },
      order() {
        return this;
      },
      range() {
        // source-scope terminal
        if (isScope) calls.scopeSelects.push({ table, filters: { ...filters } });
        return Promise.resolve({ data: isScope ? scopeRows : terminalData, error: null });
      },
      limit() {
        return this;
      },
      then(resolve) {
        return resolve({ data: terminalData, error: null });
      },
    };
    return q;
  }

  return {
    calls,
    from(table) {
      return {
        insert(payload) {
          calls.inserts.push({ table, payload });
          idCounter += 1;
          const id = `mock-${idCounter}`;
          return {
            select() {
              return {
                limit() {
                  return Promise.resolve({ data: [{ id }], error: null });
                },
              };
            },
            then(resolve) {
              return resolve({ data: [{ id }], error: null });
            },
          };
        },
        upsert(payload, opts) {
          calls.upserts.push({ table, payload, opts });
          return Promise.resolve({ data: null, error: null });
        },
        update(payload) {
          calls.updates.push({ table, payload });
          return {
            in(col, vals) {
              calls.retireFilters.push({ table, col, vals });
              return Promise.resolve({ data: null, error: null });
            },
            eq() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        delete() {
          calls.deletes.push({ table });
          return { in: () => Promise.resolve({ data: null, error: null }) };
        },
        select(cols) {
          return selectQuery(table, []).select(cols);
        },
      };
    },
  };
}

function withRetireEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v == null) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

const SEEN_IDS = rows.map((r) => r.external_slab_id);

// 1+2. Full sync upserts active slabs AND retires a missing active row.
// (min ratio relaxed to 0.5 so a 3-of-4 snapshot clears the low-count guard.)
await withRetireEnv(
  { [RETIRE_MISSING_ENV]: "1", SLAB_INVENTORY_RETIRE_MIN_RATIO: "0.5" },
  async () => {
  const scopeRows = [
    ...SEEN_IDS.map((id, i) => ({ id: `row-${i}`, external_slab_id: id, is_active: true })),
    { id: "gone-1", external_slab_id: "GONE-1", is_active: true }, // missing → retire
  ];
  const db = createRetireMockSupabase({ scopeRows });
  const result = await persistSlabsmithInventory({
    db,
    organizationId: ORG_ID,
    normalized: rows,
    writeEnabled: true,
    runMeta: { triggeredBy: "test" },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.slab_inventory_upserted, 3, "all seen rows upserted active");
  assert.equal(result.retired_missing_count, 1, "the missing active row is retired");
  assert.deepEqual(result.sample_retired_ids, ["GONE-1"]);
  assert.equal(result.skipped_retirement_reason, null);
  assert.equal(db.calls.deletes.length, 0, "NEVER deletes");
  assert.equal(db.calls.retireFilters.length, 1, "one retire UPDATE batch");
  assert.equal(db.calls.retireFilters[0].table, TABLE_INVENTORY);
  assert.deepEqual(db.calls.retireFilters[0].vals, ["gone-1"]);
  console.log("ok: retirement upserts active + retires missing");
  }
);

// 3. Not retired when sync FAILS (upsert error before retirement).
await withRetireEnv({ [RETIRE_MISSING_ENV]: "1" }, async () => {
  const scopeRows = [{ id: "gone-1", external_slab_id: "GONE-1", is_active: true }];
  const db = createRetireMockSupabase({ scopeRows });
  // Force the inventory upsert to fail.
  const origFrom = db.from.bind(db);
  db.from = (table) => {
    const t = origFrom(table);
    if (table === TABLE_INVENTORY) {
      const origUpsert = t.upsert;
      t.upsert = () => Promise.resolve({ data: null, error: { message: "boom" } });
      void origUpsert;
    }
    return t;
  };

  await assert.rejects(
    persistSlabsmithInventory({
      db,
      organizationId: ORG_ID,
      normalized: rows,
      writeEnabled: true,
    }),
    /boom/
  );
  assert.equal(db.calls.retireFilters.length, 0, "no retire on failed sync");
  assert.equal(db.calls.deletes.length, 0);
  console.log("ok: no retirement on failed sync");
});

// 4. Not retired on DRY-RUN.
await withRetireEnv({ [RETIRE_MISSING_ENV]: "1" }, async () => {
  const scopeRows = [{ id: "gone-1", external_slab_id: "GONE-1", is_active: true }];
  const db = createRetireMockSupabase({ scopeRows });
  const result = await persistSlabsmithInventory({
    db,
    organizationId: ORG_ID,
    normalized: rows,
    writeEnabled: false,
  });
  assert.equal(result.mode, "dry-run");
  assert.equal(result.retirement_plan.enabled, true);
  assert.equal(result.retirement_plan.would_retire_count, 1, "previews retirement only");
  assert.equal(db.calls.retireFilters.length, 0, "no retire writes in dry-run");
  assert.equal(db.calls.upserts.length, 0, "no upsert writes in dry-run");
  assert.equal(db.calls.deletes.length, 0);
  console.log("ok: no retirement writes on dry-run (preview only)");
});

// 5. Not retired on suspicious LOW-COUNT sync (snapshot << prior active).
await withRetireEnv({ [RETIRE_MISSING_ENV]: "1" }, async () => {
  // 20 prior active rows, snapshot has only 3 (15%) → below 80% guard.
  const scopeRows = [
    ...SEEN_IDS.map((id, i) => ({ id: `row-${i}`, external_slab_id: id, is_active: true })),
    ...Array.from({ length: 17 }, (_, i) => ({
      id: `extra-${i}`,
      external_slab_id: `EXTRA-${i}`,
      is_active: true,
    })),
  ];
  const db = createRetireMockSupabase({ scopeRows });
  const result = await persistSlabsmithInventory({
    db,
    organizationId: ORG_ID,
    normalized: rows,
    writeEnabled: true,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.retired_missing_count, 0, "low-count guard blocks retirement");
  assert.equal(result.skipped_retirement_reason, "suspicious_low_count_drop");
  assert.equal(db.calls.retireFilters.length, 0, "no retire UPDATE when blocked");
  assert.equal(db.calls.deletes.length, 0);
  console.log("ok: no retirement on suspicious low-count sync");
});

// 5b. Low-count override forces retirement.
await withRetireEnv(
  { [RETIRE_MISSING_ENV]: "1", SLAB_INVENTORY_RETIRE_OVERRIDE_LOW_COUNT: "1" },
  async () => {
    const scopeRows = [
      ...SEEN_IDS.map((id, i) => ({ id: `row-${i}`, external_slab_id: id, is_active: true })),
      ...Array.from({ length: 17 }, (_, i) => ({
        id: `extra-${i}`,
        external_slab_id: `EXTRA-${i}`,
        is_active: true,
      })),
    ];
    const db = createRetireMockSupabase({ scopeRows });
    const result = await persistSlabsmithInventory({
      db,
      organizationId: ORG_ID,
      normalized: rows,
      writeEnabled: true,
    });
    assert.equal(result.retired_missing_count, 17, "override retires the missing rows");
    assert.equal(result.skipped_retirement_reason, null);
    console.log("ok: low-count override forces retirement");
  }
);

// 6. Retired slab REAPPEARING in a later sync is reactivated.
await withRetireEnv({ [RETIRE_MISSING_ENV]: "1" }, async () => {
  const reappearId = SEEN_IDS[0];
  const scopeRows = [
    { id: "react-1", external_slab_id: reappearId, is_active: false }, // retired, reappears
    { id: "row-1", external_slab_id: SEEN_IDS[1], is_active: true },
    { id: "row-2", external_slab_id: SEEN_IDS[2], is_active: true },
  ];
  const db = createRetireMockSupabase({ scopeRows });
  const result = await persistSlabsmithInventory({
    db,
    organizationId: ORG_ID,
    normalized: rows,
    writeEnabled: true,
  });
  assert.equal(result.reactivated_count, 1, "the reappearing retired row is reactivated");
  assert.equal(result.retired_missing_count, 0, "nothing missing → nothing retired");
  // Reactivation happens via the upsert carrying is_active:true + cleared retired fields.
  const invUpsert = db.calls.upserts.find((u) => u.table === TABLE_INVENTORY);
  assert.ok(invUpsert, "inventory upsert occurred");
  assert.ok(
    invUpsert.payload.every((r) => r.is_active === true && r.retired_at === null),
    "upsert rows are active with cleared retirement state"
  );
  assert.equal(invUpsert.payload[0].inventory_status, "active");
  console.log("ok: retired slab reappearing is reactivated");
});

// 7. Retirement scoped by organization_id + external_source + company code.
await withRetireEnv({ [RETIRE_MISSING_ENV]: "1" }, async () => {
  const db = createRetireMockSupabase({ scopeRows: [] });
  await persistSlabsmithInventory({
    db,
    organizationId: ORG_ID,
    normalized: rows,
    config: { externalCompanyCode: "local" },
    writeEnabled: true,
  });
  assert.ok(db.calls.scopeSelects.length >= 1, "scope select ran");
  const f = db.calls.scopeSelects[0].filters;
  assert.equal(f.organization_id, ORG_ID, "scoped by org");
  assert.equal(f.external_source, "slabsmith", "scoped by external_source");
  assert.equal(f.external_company_code, "local", "scoped by company code");
  console.log("ok: retirement scoped by org + source + company");
});

// 8. Flag OFF → no scope fetch, no retire, no delete (back-compat).
await withRetireEnv({ [RETIRE_MISSING_ENV]: null }, async () => {
  const db = createRetireMockSupabase({
    scopeRows: [{ id: "gone-1", external_slab_id: "GONE-1", is_active: true }],
  });
  const result = await persistSlabsmithInventory({
    db,
    organizationId: ORG_ID,
    normalized: rows,
    writeEnabled: true,
  });
  assert.equal(result.retired_missing_count, 0);
  assert.equal(result.skipped_retirement_reason, "flag_disabled");
  assert.equal(db.calls.scopeSelects.length, 0, "no scope fetch when flag off");
  assert.equal(db.calls.retireFilters.length, 0);
  assert.equal(db.calls.deletes.length, 0);
  console.log("ok: flag off → original behavior, no retirement");
});

// 9. Sync-run final update records retirement counts + slab_deactivated_count.
{
  const finalUpdate = buildSlabsmithSyncRunFinalUpdate({
    status: "completed",
    writtenCounts: { rawRecords: 3, slabInventory: 3 },
    retirementCounts: {
      activeUpserts: 3,
      reactivatedCount: 1,
      retiredMissingCount: 2,
      previousActiveCount: 5,
      latestSeenCount: 3,
      skippedRetirementReason: null,
      warnings: [],
    },
  });
  assert.equal(finalUpdate.slab_deactivated_count, 2, "deactivated count reflects retirement");
  assert.ok(
    finalUpdate.warnings.some((w) => w.includes("retired_missing=2")),
    "retirement warning recorded"
  );
  console.log("ok: sync run final update records retirement counts");
}

console.log("\nAll slabsmithPersistence tests passed.");
