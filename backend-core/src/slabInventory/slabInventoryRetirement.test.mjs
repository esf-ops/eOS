/**
 * slabInventoryRetirement — unit tests for the pure planner, safety guard, and
 * payload builders, plus the batched DB helpers against a recording mock client.
 *
 * No live Supabase, no network.
 * Run: npm run eos:test:slab-inventory-retirement
 */
import assert from "node:assert/strict";

import {
  batchRetireInventoryRows,
  buildReactivationFields,
  buildRetirementUpdate,
  DEFAULT_RETIRE_MIN_RATIO,
  evaluateRetirementSafety,
  fetchInventoryForSourceScope,
  INVENTORY_STATUS_ACTIVE,
  INVENTORY_STATUS_RETIRED,
  isRetireLowCountOverrideEnabled,
  isRetireMissingEnabled,
  planMissingInventoryRetirement,
  RETIRE_MISSING_ENV,
  RETIRE_OVERRIDE_ENV,
  RETIRED_REASON,
  resolveRetireMinRatio,
} from "./slabInventoryRetirement.js";

// ── Feature gates ─────────────────────────────────────────────────────────────
{
  assert.equal(isRetireMissingEnabled({}), false);
  assert.equal(isRetireMissingEnabled({ [RETIRE_MISSING_ENV]: "1" }), true);
  assert.equal(isRetireMissingEnabled({ [RETIRE_MISSING_ENV]: "0" }), false);
  assert.equal(isRetireMissingEnabled({ [RETIRE_MISSING_ENV]: "true" }), false);

  assert.equal(isRetireLowCountOverrideEnabled({}), false);
  assert.equal(isRetireLowCountOverrideEnabled({ [RETIRE_OVERRIDE_ENV]: "1" }), true);
  console.log("ok: feature gates");
}

// ── Min ratio resolution ──────────────────────────────────────────────────────
{
  assert.equal(resolveRetireMinRatio({}), DEFAULT_RETIRE_MIN_RATIO);
  assert.equal(resolveRetireMinRatio({ SLAB_INVENTORY_RETIRE_MIN_RATIO: "0.5" }), 0.5);
  assert.equal(resolveRetireMinRatio({ SLAB_INVENTORY_RETIRE_MIN_RATIO: "abc" }), DEFAULT_RETIRE_MIN_RATIO);
  assert.equal(resolveRetireMinRatio({ SLAB_INVENTORY_RETIRE_MIN_RATIO: "2" }), DEFAULT_RETIRE_MIN_RATIO);
  assert.equal(resolveRetireMinRatio({ SLAB_INVENTORY_RETIRE_MIN_RATIO: "-1" }), DEFAULT_RETIRE_MIN_RATIO);
  console.log("ok: resolveRetireMinRatio");
}

// ── Safety guard ────────────────────────────────────────────────────────────────
{
  // Healthy: snapshot >= 80% of prior active → allowed.
  let r = evaluateRetirementSafety({ previousActiveCount: 100, latestSeenCount: 95 });
  assert.equal(r.allowed, true);
  assert.equal(r.skippedRetirementReason, null);

  // Drop below threshold → blocked.
  r = evaluateRetirementSafety({ previousActiveCount: 100, latestSeenCount: 50 });
  assert.equal(r.allowed, false);
  assert.equal(r.skippedRetirementReason, "suspicious_low_count_drop");
  assert.ok(r.warnings.length >= 1);

  // Drop below threshold but override → allowed.
  r = evaluateRetirementSafety({ previousActiveCount: 100, latestSeenCount: 50, overrideEnabled: true });
  assert.equal(r.allowed, true);
  assert.equal(r.skippedRetirementReason, null);

  // Empty snapshot → blocked (the dangerous case).
  r = evaluateRetirementSafety({ previousActiveCount: 100, latestSeenCount: 0 });
  assert.equal(r.allowed, false);
  assert.equal(r.skippedRetirementReason, "suspicious_low_count_zero_snapshot");

  // Nothing existed before → safe no-op allowed.
  r = evaluateRetirementSafety({ previousActiveCount: 0, latestSeenCount: 0 });
  assert.equal(r.allowed, true);

  // Custom ratio.
  r = evaluateRetirementSafety({ previousActiveCount: 100, latestSeenCount: 60, minRatio: 0.5 });
  assert.equal(r.allowed, true);
  console.log("ok: evaluateRetirementSafety");
}

// ── Plan: missing retired, seen kept, reappeared reactivated ────────────────────
{
  const existingRows = [
    { id: "a", external_slab_id: "SLAB-1", is_active: true }, // seen → keep
    { id: "b", external_slab_id: "SLAB-2", is_active: true }, // missing → retire
    { id: "c", external_slab_id: "SLAB-3", is_active: false }, // retired + reappears → reactivate
    { id: "d", external_slab_id: "SLAB-4", is_active: false }, // retired, still gone → stays retired
  ];
  const seen = new Set(["SLAB-1", "SLAB-3"]);

  const plan = planMissingInventoryRetirement({ existingRows, seenExternalIds: seen });
  assert.equal(plan.previousActiveCount, 2, "two were active before");
  assert.deepEqual(plan.retiredIds, ["b"], "only the missing active row is retired");
  assert.equal(plan.retiredMissingCount, 1);
  assert.equal(plan.reactivatedCount, 1, "SLAB-3 reappears → reactivated");
  assert.deepEqual(plan.sampleRetiredIds, ["SLAB-2"]);
  console.log("ok: planMissingInventoryRetirement");
}

// ── Plan: accepts an array (not only a Set) for seen ids ────────────────────────
{
  const existingRows = [{ id: "a", external_slab_id: "X", is_active: true }];
  const plan = planMissingInventoryRetirement({ existingRows, seenExternalIds: ["X"] });
  assert.equal(plan.retiredMissingCount, 0);
  console.log("ok: plan accepts array seen ids");
}

// ── Payload builders ────────────────────────────────────────────────────────────
{
  const update = buildRetirementUpdate({ syncRunId: "run-9", now: () => "2026-01-01T00:00:00.000Z" });
  assert.equal(update.is_active, false);
  assert.equal(update.inventory_status, INVENTORY_STATUS_RETIRED);
  assert.equal(update.retired_at, "2026-01-01T00:00:00.000Z");
  assert.equal(update.retired_by_sync_run_id, "run-9");
  assert.equal(update.retired_reason, RETIRED_REASON);

  const react = buildReactivationFields({ syncRunId: "run-9", now: () => "2026-01-01T00:00:00.000Z" });
  assert.equal(react.is_active, true);
  assert.equal(react.inventory_status, INVENTORY_STATUS_ACTIVE);
  assert.equal(react.retired_at, null);
  assert.equal(react.retired_by_sync_run_id, null);
  assert.equal(react.retired_reason, null);
  assert.equal(react.last_seen_sync_run_id, "run-9");
  console.log("ok: payload builders");
}

// ── batchRetireInventoryRows: UPDATE only, never DELETE ─────────────────────────
{
  const calls = { updates: [], deletes: [], filters: [] };
  const db = {
    from() {
      return {
        update(payload) {
          calls.updates.push(payload);
          return {
            in(col, vals) {
              calls.filters.push({ col, vals });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        delete() {
          calls.deletes.push(true);
          return { in: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    },
  };

  const n = await batchRetireInventoryRows(db, ["id1", "id2"], buildRetirementUpdate({ syncRunId: "r" }));
  assert.equal(n, 2);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.deletes.length, 0, "must never DELETE");
  assert.deepEqual(calls.filters[0].vals, ["id1", "id2"]);

  const zero = await batchRetireInventoryRows(db, [], {});
  assert.equal(zero, 0, "no ids → no update");
  console.log("ok: batchRetireInventoryRows (update-only)");
}

// ── fetchInventoryForSourceScope: scoped query, paginates ───────────────────────
{
  const seenFilters = [];
  const db = {
    from() {
      const q = {
        _eq: {},
        select() { return this; },
        eq(col, val) { this._eq[col] = val; return this; },
        order() { return this; },
        range() {
          seenFilters.push({ ...this._eq });
          return Promise.resolve({
            data: [{ id: "a", external_slab_id: "S1", is_active: true }],
            error: null,
          });
        },
      };
      return q;
    },
  };

  const rows = await fetchInventoryForSourceScope(db, {
    organizationId: "org-1",
    externalSource: "slabsmith",
    externalCompanyCode: "local",
  });
  assert.equal(rows.length, 1);
  assert.equal(seenFilters[0].organization_id, "org-1");
  assert.equal(seenFilters[0].external_source, "slabsmith");
  assert.equal(seenFilters[0].external_company_code, "local");
  console.log("ok: fetchInventoryForSourceScope (scoped)");
}

console.log("\nAll slabInventoryRetirement tests passed.");
