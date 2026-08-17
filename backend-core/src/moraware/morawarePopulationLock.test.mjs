/**
 * CURRENT_MORAWARE_JOB_SET — distributed moraware_population lock + census_scope + resolver.
 * Local/store mocks only. No live Supabase writes. No Moraware contact.
 */
import assert from "node:assert/strict";
import {
  acquireMorawarePopulationLock,
  assertMorawarePopulationLockOwner,
  guardLiveMorawarePopulationWrite,
  handleMorawarePopulationLockAction,
  MORAWARE_POPULATION_LOCK_NAME,
  pickMorawarePopulationLockOwnerFromRequest,
  releaseMorawarePopulationLock,
  renewMorawarePopulationLock,
  requireLiveCensusScope
} from "./morawarePopulationLock.mjs";
import {
  canAdvanceFullCensusWatermark,
  clearCurrentMorawarePopulationCacheForTests,
  CENSUS_SCOPE_FULL,
  CENSUS_SCOPE_INCREMENTAL,
  evaluateImportGroupAsFullCensus,
  planPreparedFactsRebuild,
  resolveCensusScopeFromRun,
  resolveCurrentMorawarePopulation
} from "./morawareCurrentPopulation.mjs";
import { withMorawareMirrorObservationTimestamps, normalizeJobs } from "./morawareSyncApi.js";

function createMemoryEosSyncLocksDb() {
  const rows = new Map();
  function matches(row, filters) {
    for (const f of filters) {
      const actual = row[f.col];
      if (f.op === "eq" && String(actual ?? "") !== String(f.val ?? "")) return false;
      if (f.op === "lt" && String(actual ?? "") >= String(f.val ?? "")) return false;
    }
    return true;
  }
  return {
    from(table) {
      assert.equal(table, "eos_sync_locks");
      const state = { op: "select", payload: null, filters: [] };
      const api = {
        select() {
          return api;
        },
        insert(payload) {
          state.op = "insert";
          state.payload = payload;
          return api;
        },
        update(payload) {
          state.op = "update";
          state.payload = payload;
          return api;
        },
        delete() {
          state.op = "delete";
          return api;
        },
        eq(col, val) {
          state.filters.push({ op: "eq", col, val });
          return api;
        },
        lt(col, val) {
          state.filters.push({ op: "lt", col, val });
          return api;
        },
        limit() {
          return api;
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        }
      };
      function execute() {
        if (state.op === "insert") {
          const row = { ...state.payload };
          const name = String(row.lock_name ?? "");
          if (rows.has(name)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          rows.set(name, row);
          return { data: [row], error: null };
        }
        const matched = [...rows.values()].filter((row) => matches(row, state.filters));
        if (state.op === "select") return { data: matched, error: null };
        if (state.op === "update") {
          const updated = [];
          for (const row of matched) {
            const next = { ...row, ...state.payload };
            rows.set(String(next.lock_name), next);
            updated.push(next);
          }
          return { data: updated, error: null };
        }
        if (state.op === "delete") {
          const removed = [];
          for (const row of matched) {
            rows.delete(String(row.lock_name));
            removed.push(row);
          }
          return { data: removed, error: null };
        }
        return { data: [], error: null };
      }
      return api;
    }
  };
}

function runRow({ id, gid, scope, mode, started, finished, chunkIndex, chunkCount, status = "success", capWarnings = [] }) {
  return {
    id,
    status,
    started_at: started,
    finished_at: finished,
    mode,
    metadata: {
      import_group_id: gid,
      census_scope: scope,
      chunk_index: chunkIndex,
      chunk_count: chunkCount,
      snapshot_mode: mode?.includes("baseline_2026") ? "baseline_2026" : "baseline",
      cap_warnings: capWarnings,
      uncapped: capWarnings.length === 0
    }
  };
}

function createSyncRunsDb(allRows) {
  return {
    from(table) {
      assert.equal(table, "moraware_sync_runs");
      const state = { eqs: {}, filters: {}, or: null, range: [0, 199] };
      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          state.eqs[col] = val;
          return api;
        },
        not() {
          return api;
        },
        filter(col, _op, val) {
          state.filters[col] = val;
          return api;
        },
        or(expr) {
          state.or = expr;
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        range(from, to) {
          state.range = [from, to];
          return api;
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        }
      };
      function execute() {
        let rows = allRows.filter((r) => r.status === (state.eqs.status || r.status));
        if (state.eqs.organization_id) rows = rows.filter(() => true);
        if (state.eqs["metadata->>census_scope"]) {
          rows = rows.filter((r) => String(r.metadata?.census_scope ?? "") === String(state.eqs["metadata->>census_scope"]));
        }
        if (state.filters["metadata->>import_group_id"]) {
          rows = rows.filter((r) => String(r.metadata?.import_group_id ?? "") === String(state.filters["metadata->>import_group_id"]));
        }
        if (state.or && String(state.or).includes("baseline_2026")) {
          rows = rows.filter(
            (r) =>
              String(r.mode ?? "").includes("baseline_2026") || String(r.metadata?.snapshot_mode ?? "").includes("baseline_2026")
          );
        }
        rows = [...rows].sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)));
        if (state.filters["metadata->>import_group_id"]) {
          rows = [...rows].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
        }
        const [from, to] = state.range;
        return { data: rows.slice(from, to + 1), error: null };
      }
      return api;
    }
  };
}

{
  const db = createMemoryEosSyncLocksDb();
  const full = await acquireMorawarePopulationLock(db, { ownerToken: "full-owner", lockedBy: "ubuntu", now: new Date("2026-08-15T09:00:00.000Z") });
  assert.equal(full.acquired, true);
  const inc = await acquireMorawarePopulationLock(db, { ownerToken: "inc-owner", lockedBy: "mac", now: new Date("2026-08-15T09:10:00.000Z") });
  assert.equal(inc.acquired, false);
  assert.equal(inc.reason, "locked");
  console.log("ok A: FULL owns moraware_population → INCREMENTAL cannot acquire");
}

{
  const db = createMemoryEosSyncLocksDb();
  const inc = await acquireMorawarePopulationLock(db, { ownerToken: "inc-owner", now: new Date("2026-08-16T08:00:00.000Z") });
  assert.equal(inc.acquired, true);
  const full = await acquireMorawarePopulationLock(db, { ownerToken: "full-owner", now: new Date("2026-08-16T08:01:00.000Z") });
  assert.equal(full.acquired, false);
  console.log("ok B: INCREMENTAL owns it → FULL cannot acquire");
}

{
  const db = createMemoryEosSyncLocksDb();
  await acquireMorawarePopulationLock(db, { ownerToken: "host-a" });
  const stealRelease = await releaseMorawarePopulationLock(db, { ownerToken: "host-b" });
  assert.equal(stealRelease.released, false);
  assert.equal(stealRelease.reason, "not_owner");
  const ownRelease = await releaseMorawarePopulationLock(db, { ownerToken: "host-a" });
  assert.equal(ownRelease.released, true);
  console.log("ok C: second host cannot release first owner's lock");
}

{
  const db = createMemoryEosSyncLocksDb();
  const t0 = new Date("2026-08-15T09:00:00.000Z");
  await acquireMorawarePopulationLock(db, { ownerToken: "old", ttlMs: 1000, now: t0 });
  const t1 = new Date("2026-08-15T09:00:02.000Z");
  const recovered = await acquireMorawarePopulationLock(db, { ownerToken: "new", ttlMs: 1000, now: t1 });
  assert.equal(recovered.acquired, true);
  assert.equal(recovered.recovered_stale, true);
  console.log("ok D: expired/stale lock can be recovered");
}

{
  const db = createMemoryEosSyncLocksDb();
  const t0 = new Date("2026-08-15T09:00:00.000Z");
  await acquireMorawarePopulationLock(db, { ownerToken: "healthy", ttlMs: 60_000, now: t0 });
  const steal = await acquireMorawarePopulationLock(db, { ownerToken: "thief", ttlMs: 60_000, now: new Date("2026-08-15T09:00:10.000Z") });
  assert.equal(steal.acquired, false);
  const renew = await renewMorawarePopulationLock(db, { ownerToken: "healthy", now: new Date("2026-08-15T09:00:10.000Z"), ttlMs: 60_000 });
  assert.equal(renew.renewed, true);
  const stealRenew = await renewMorawarePopulationLock(db, { ownerToken: "thief" });
  assert.equal(stealRenew.renewed, false);
  console.log("ok E: healthy lock cannot be stolen; only owner renews");
}

{
  const db = createMemoryEosSyncLocksDb();
  await acquireMorawarePopulationLock(db, { ownerToken: "full-owner" });
  const missing = await guardLiveMorawarePopulationWrite(db, {
    ownerToken: "",
    censusScope: CENSUS_SCOPE_FULL,
    requireCensusScope: true
  });
  assert.equal(missing.ok, false);
  const wrong = await guardLiveMorawarePopulationWrite(db, {
    ownerToken: "other",
    censusScope: CENSUS_SCOPE_FULL,
    requireCensusScope: true
  });
  assert.equal(wrong.ok, false);
  const noScope = requireLiveCensusScope("");
  assert.equal(noScope.ok, false);
  const ok = await guardLiveMorawarePopulationWrite(db, {
    ownerToken: "full-owner",
    censusScope: CENSUS_SCOPE_FULL,
    requireCensusScope: true
  });
  assert.equal(ok.ok, true);
  console.log("ok F: live import without valid ownership / census_scope fails closed");
}

{
  const db = createMemoryEosSyncLocksDb();
  await acquireMorawarePopulationLock(db, { ownerToken: "full-owner" });
  const chunks = [];
  for (let i = 1; i <= 3; i += 1) {
    const guard = await guardLiveMorawarePopulationWrite(db, {
      ownerToken: "full-owner",
      censusScope: CENSUS_SCOPE_FULL,
      requireCensusScope: true
    });
    assert.equal(guard.ok, true);
    chunks.push(i);
  }
  assert.deepEqual(chunks, [1, 2, 3]);
  const req = { header: (name) => (name === "x-moraware-population-lock-owner" ? "full-owner" : ""), body: {} };
  assert.equal(pickMorawarePopulationLockOwnerFromRequest(req), "full-owner");
  console.log("ok G: valid owner can post all chunks under one held lock");
}

{
  const partial = evaluateImportGroupAsFullCensus(
    "in-flight",
    [
      runRow({
        id: "c1",
        gid: "in-flight",
        scope: CENSUS_SCOPE_FULL,
        mode: "baseline_2026-real-snapshot",
        started: "2026-08-15T09:00:00.000Z",
        finished: "2026-08-15T09:05:00.000Z",
        chunkIndex: 1,
        chunkCount: 527
      })
    ],
    null
  );
  assert.equal(partial.complete, false);
  assert.equal(partial.eligible, false);
  console.log("ok H: partial/in-flight FULL does not advance watermark");
}

{
  assert.equal(
    canAdvanceFullCensusWatermark({
      census_scope: CENSUS_SCOPE_INCREMENTAL,
      complete: true,
      uncapped: true,
      importSucceeded: true
    }),
    false
  );
  const inc = evaluateImportGroupAsFullCensus(
    "inc",
    [
      runRow({
        id: "i1",
        gid: "inc",
        scope: CENSUS_SCOPE_INCREMENTAL,
        mode: "baseline_2026-real-snapshot",
        started: "2026-08-16T08:00:00.000Z",
        finished: "2026-08-16T08:02:00.000Z",
        chunkIndex: 1,
        chunkCount: 1
      })
    ],
    null
  );
  assert.equal(inc.eligible, false);
  assert.equal(resolveCensusScopeFromRun({ metadata: { census_scope: "incremental" }, mode: "baseline_2026-real-snapshot" }), CENSUS_SCOPE_INCREMENTAL);
  console.log("ok I: incremental never advances watermark (including baseline_2026-looking mode)");
}

{
  const db = createMemoryEosSyncLocksDb();
  await acquireMorawarePopulationLock(db, { ownerToken: "full-owner" });
  const held = await assertMorawarePopulationLockOwner(db, { ownerToken: "full-owner" });
  assert.equal(held.ok, true);
  const plan = planPreparedFactsRebuild({
    jobs: [
      ...Array.from({ length: 4073 }, (_, i) => ({ source_job_id: `j${i}`, last_seen_at: "2026-08-15T12:00:00.000Z", sync_run_id: "full" })),
      ...Array.from({ length: 7 }, (_, i) => ({ source_job_id: `n${i}`, last_seen_at: "2026-08-16T08:00:00.000Z", sync_run_id: "inc" }))
    ],
    population: {
      available: true,
      full_census_import_group_id: "epoch-a",
      full_census_started_at: "2026-08-15T09:00:00.000Z"
    },
    latestCompleteGroup: { import_group_id: "inc-17", successful_sync_run_ids: ["inc"] }
  });
  assert.equal(plan.import_group_id, "epoch-a");
  assert.equal(plan.fact_count, 4080);
  assert.equal(plan.uses_latest_complete_group_as_universe, false);
  assert.equal(plan.requires_held_population_lock, true);
  console.log("ok J: prepared rebuild uses stable current population (4080 under epoch A) while lock held");
}

{
  assert.equal(resolveCensusScopeFromRun({ metadata: { census_scope: "full" } }), CENSUS_SCOPE_FULL);
  assert.equal(resolveCensusScopeFromRun({ mode: "baseline_2026-real-snapshot", metadata: {} }), CENSUS_SCOPE_FULL);
  assert.equal(resolveCensusScopeFromRun({ metadata: { census_scope: "incremental", snapshot_mode: "baseline_2026" }, mode: "baseline_2026-real-snapshot" }), CENSUS_SCOPE_INCREMENTAL);
  const missingNew = requireLiveCensusScope(undefined);
  assert.equal(missingNew.ok, false);
  console.log("ok: explicit full/incremental + missing new-format scope rejected; legacy baseline_2026 still readable");
}

{
  const incrementals = Array.from({ length: 90 }, (_, i) =>
    runRow({
      id: `inc-${i}`,
      gid: `inc-g-${i}`,
      scope: CENSUS_SCOPE_INCREMENTAL,
      mode: "incremental",
      started: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T08:00:00.000Z`,
      finished: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T08:01:00.000Z`,
      chunkIndex: 1,
      chunkCount: 1
    })
  );
  const fullChunks = Array.from({ length: 3 }, (_, i) =>
    runRow({
      id: `full-${i + 1}`,
      gid: "legacy-or-full-epoch",
      scope: CENSUS_SCOPE_FULL,
      mode: "baseline_2026-real-snapshot",
      started: `2026-08-15T09:0${i}:00.000Z`,
      finished: `2026-08-15T18:0${i}:00.000Z`,
      chunkIndex: i + 1,
      chunkCount: 3
    })
  );
  clearCurrentMorawarePopulationCacheForTests();
  const db = createSyncRunsDb([...incrementals, ...fullChunks]);
  const pop = await resolveCurrentMorawarePopulation(db, "00000000-0000-4000-8000-000000000001", {
    skipCache: true
  });
  assert.equal(pop.available, true);
  assert.equal(pop.full_census_import_group_id, "legacy-or-full-epoch");
  assert.equal(pop.full_census_started_at, "2026-08-15T09:00:00.000Z");
  console.log("ok: resolver finds explicit FULL after 90 incrementals (no bounded-window miss)");
}

{
  const legacy = [
    runRow({
      id: "leg-1",
      gid: "prod-foundation",
      scope: "",
      mode: "baseline_2026-real-snapshot",
      started: "2026-08-15T10:00:00.000Z",
      finished: "2026-08-15T18:00:00.000Z",
      chunkIndex: 1,
      chunkCount: 1
    })
  ];
  legacy[0].metadata.census_scope = undefined;
  clearCurrentMorawarePopulationCacheForTests();
  const db = createSyncRunsDb(legacy);
  const pop = await resolveCurrentMorawarePopulation(db, "org", { skipCache: true });
  assert.equal(pop.available, true);
  assert.equal(pop.full_census_import_group_id, "prod-foundation");
  assert.notEqual(pop.full_census_import_group_id, "c3a0e6e5-b5af-499c-87a8-73d720d485be");
  console.log("ok: legacy 2026 Foundation still resolves without hardcoded group id");
}

{
  const stamped = withMorawareMirrorObservationTimestamps({ source_job_id: "1" }, "2026-08-16T00:00:00.000Z");
  assert.equal("first_seen_at" in stamped, false);
  const jobs = normalizeJobs([{ id: "9" }], { organizationId: "o", syncRunId: "r" });
  assert.equal("first_seen_at" in jobs[0], false);
  console.log("ok: upsert payload still omits first_seen_at");
}

{
  const db = createMemoryEosSyncLocksDb();
  const acquired = await handleMorawarePopulationLockAction(db, { action: "acquire", ownerToken: "t1" });
  assert.equal(acquired.acquired, true);
  assert.equal(acquired.lock.lock_name, MORAWARE_POPULATION_LOCK_NAME);
  console.log("ok: lock action helper acquire");
}

console.log("morawarePopulationLock.test.mjs — all passed");
