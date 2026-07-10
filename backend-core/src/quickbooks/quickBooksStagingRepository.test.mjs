/**
 * quickBooksStagingRepository — in-memory fake repository tests (fake data only).
 *
 * Run: node backend-core/src/quickbooks/quickBooksStagingRepository.test.mjs
 */

import assert from "node:assert/strict";

import { createInMemoryQuickBooksStagingRepository } from "./quickBooksStagingRepository.js";

// ── Inserts stamp first_seen_at/created_at/last_seen_at/updated_at ───────────
{
  const repo = createInMemoryQuickBooksStagingRepository();
  await repo.upsertRows("t", [{ organization_id: "o", qb_list_id: "A", val: 1 }], ["organization_id", "qb_list_id"], ["val"]);
  const row = repo.getTableRows("t")[0];
  assert.ok(row.first_seen_at, "first_seen_at stamped on insert");
  assert.ok(row.created_at, "created_at stamped on insert");
  assert.ok(row.last_seen_at, "last_seen_at stamped on insert");
  assert.ok(row.updated_at, "updated_at stamped on insert");
  console.log("ok: upsert stamps first_seen_at/created_at/last_seen_at/updated_at on insert");
}

// ── Re-upsert advances last_seen_at/updated_at; preserves first_seen_at/created_at ─
{
  const repo = createInMemoryQuickBooksStagingRepository();
  const key = ["organization_id", "qb_list_id"];
  await repo.upsertRows("t", [{ organization_id: "o", qb_list_id: "A", val: 1 }], key, ["val"]);
  const afterInsert = { ...repo.getTableRows("t")[0] };

  const second = await repo.upsertRows("t", [{ organization_id: "o", qb_list_id: "A", val: 2 }], key, ["val"]);
  const afterUpdate = repo.getTableRows("t")[0];

  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 1);
  assert.equal(repo.getTableCount("t"), 1, "still one row (upsert, not duplicate)");
  assert.equal(afterUpdate.val, 2, "updateColumn applied");
  assert.equal(afterUpdate.first_seen_at, afterInsert.first_seen_at, "first_seen_at preserved");
  assert.equal(afterUpdate.created_at, afterInsert.created_at, "created_at preserved");
  assert.ok(afterUpdate.last_seen_at > afterInsert.last_seen_at, "last_seen_at advances");
  assert.ok(afterUpdate.updated_at > afterInsert.updated_at, "updated_at advances");
  console.log("ok: re-upsert advances last_seen_at/updated_at and preserves first_seen_at/created_at");
}

// ── Undefined update values never overwrite existing values ──────────────────
{
  const repo = createInMemoryQuickBooksStagingRepository();
  const key = ["organization_id", "qb_list_id"];
  await repo.upsertRows("t", [{ organization_id: "o", qb_list_id: "A", keep: "ORIGINAL" }], key, ["keep", "other"]);
  // Second row omits `keep` (undefined) — must NOT wipe the existing value.
  await repo.upsertRows("t", [{ organization_id: "o", qb_list_id: "A", other: "NEW" }], key, ["keep", "other"]);
  const row = repo.getTableRows("t")[0];
  assert.equal(row.keep, "ORIGINAL", "undefined update value did not overwrite existing");
  assert.equal(row.other, "NEW", "present update value applied");
  console.log("ok: undefined update values do not overwrite existing values");
}

// ── Upsert call count tracks chunking ───────────────────────────────────────
{
  const repo = createInMemoryQuickBooksStagingRepository();
  const key = ["organization_id", "qb_list_id"];
  await repo.upsertRows("t", [{ organization_id: "o", qb_list_id: "A" }], key, []);
  await repo.upsertRows("t", [{ organization_id: "o", qb_list_id: "B" }], key, []);
  assert.equal(repo.getUpsertCallCount("t"), 2);
  assert.equal(repo.getUpsertCallCount("missing"), 0);
  console.log("ok: getUpsertCallCount tracks upsert calls per table");
}

// ── createSyncRun preserves chunk/resume metadata ───────────────────────────
{
  const repo = createInMemoryQuickBooksStagingRepository();
  const { id } = await repo.createSyncRun({
    organization_id: "o",
    source_system: "quickbooks",
    qb_run_id: "run-1",
    qb_xml_version: "16.0",
    mode: "manual-import",
    status: "running",
    import_group_id: "group-1",
    chunk_index: 3,
    chunk_count: 10,
  });
  const run = repo.getRuns().find((r) => r.id === id);
  assert.equal(run.import_group_id, "group-1");
  assert.equal(run.chunk_index, 3);
  assert.equal(run.chunk_count, 10);
  assert.ok(run.imported_at, "imported_at stamped");
  // Defaults to null when omitted.
  const { id: id2 } = await repo.createSyncRun({ organization_id: "o", source_system: "quickbooks", qb_run_id: "run-2", qb_xml_version: null, mode: "manual-import", status: "running" });
  const run2 = repo.getRuns().find((r) => r.id === id2);
  assert.equal(run2.import_group_id, null);
  assert.equal(run2.chunk_index, null);
  assert.equal(run2.chunk_count, null);
  console.log("ok: createSyncRun stores chunk/resume metadata (and defaults to null)");
}

// ── upsertRows requires conflict columns ────────────────────────────────────
{
  const repo = createInMemoryQuickBooksStagingRepository();
  await assert.rejects(() => repo.upsertRows("t", [{ a: 1 }], [], []), /requires conflictColumns/);
  console.log("ok: upsertRows rejects an empty conflict key");
}

console.log("\nAll quickBooksStagingRepository tests passed.");
