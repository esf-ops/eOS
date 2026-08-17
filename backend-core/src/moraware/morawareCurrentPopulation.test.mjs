/**
 * CURRENT_MORAWARE_JOB_SET — Option D census watermark, SqFt, prepared-fact epoch,
 * newest-first resolver efficiency, and short TTL population cache.
 */
import assert from "node:assert/strict";
import {
  buildMorawareCensusImportMetadata,
  canAdvanceFullCensusWatermark,
  clearCurrentMorawarePopulationCacheForTests,
  CENSUS_SCOPE_FULL,
  CENSUS_SCOPE_INCREMENTAL,
  CURRENT_MORAWARE_POPULATION_CACHE_TTL_MS,
  CURRENT_MORAWARE_POPULATION_UNAVAILABLE_CACHE_TTL_MS,
  evaluateImportGroupAsFullCensus,
  filterCurrentMorawareJobSet,
  invalidateCurrentMorawarePopulationCache,
  jobInCurrentMorawareSet,
  planPreparedFactsRebuild,
  resolveCensusScopeFromRun,
  resolveCurrentMorawarePopulation,
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT
} from "./morawareCurrentPopulation.mjs";
import {
  extractJobWorksheetCensusSqft,
  sumJobWorksheetCensusSqft
} from "../sales/morawareSqftActuals.js";
import { normalizeJobs, withMorawareMirrorObservationTimestamps } from "./morawareSyncApi.js";

clearCurrentMorawarePopulationCacheForTests();

function runRow({
  id,
  gid,
  scope,
  mode,
  started,
  finished,
  chunkIndex,
  chunkCount,
  status = "success",
  capWarnings = [],
  organizationId = "org-1"
}) {
  const meta = {
    import_group_id: gid,
    chunk_index: chunkIndex,
    chunk_count: chunkCount,
    snapshot_mode: String(mode || "").includes("baseline_2026") ? "baseline_2026" : "baseline",
    cap_warnings: capWarnings,
    uncapped: capWarnings.length === 0
  };
  if (scope !== undefined && scope !== null && scope !== "") meta.census_scope = scope;
  return {
    id,
    organization_id: organizationId,
    status,
    started_at: started,
    finished_at: finished,
    mode,
    metadata: meta
  };
}

function createCountingSyncRunsDb(allRows) {
  const stats = { queries: 0, discoveryQueries: 0, groupDetailQueries: 0 };
  return {
    stats,
    from(table) {
      assert.equal(table, "moraware_sync_runs");
      const state = { eqs: {}, filters: {}, or: null, range: [0, 199], orderCol: "finished_at", ascending: false };
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
        order(col, opts = {}) {
          state.orderCol = col;
          state.ascending = Boolean(opts.ascending);
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
        stats.queries += 1;
        if (state.filters["metadata->>import_group_id"]) stats.groupDetailQueries += 1;
        else stats.discoveryQueries += 1;

        let rows = allRows.filter((r) => r.status === (state.eqs.status || r.status));
        if (state.eqs["metadata->>census_scope"]) {
          rows = rows.filter((r) => String(r.metadata?.census_scope ?? "") === String(state.eqs["metadata->>census_scope"]));
        }
        if (state.filters["metadata->>import_group_id"]) {
          rows = rows.filter(
            (r) => String(r.metadata?.import_group_id ?? "") === String(state.filters["metadata->>import_group_id"])
          );
        }
        if (state.or && String(state.or).includes("baseline_2026")) {
          rows = rows.filter(
            (r) =>
              String(r.mode ?? "").includes("baseline_2026") ||
              String(r.metadata?.snapshot_mode ?? "").includes("baseline_2026")
          );
        }
        const col = state.orderCol || "finished_at";
        rows = [...rows].sort((a, b) => {
          const cmp = String(a[col] || "").localeCompare(String(b[col] || ""));
          return state.ascending ? cmp : -cmp;
        });
        const [from, to] = state.range;
        return { data: rows.slice(from, to + 1), error: null };
      }
      return api;
    }
  };
}

function foundationChunks({
  gid,
  chunkCount,
  scope = "",
  startedBase = "2026-08-15T18:48:47.614Z",
  finishedBaseMs = Date.parse("2026-08-15T19:08:06.524Z")
}) {
  return Array.from({ length: chunkCount }, (_, i) => {
    const idx = i + 1;
    const started = new Date(Date.parse(startedBase) + i * 1000).toISOString();
    const finished = new Date(finishedBaseMs - (chunkCount - idx) * 1000).toISOString();
    return runRow({
      id: `${gid}-c${idx}`,
      gid,
      scope,
      mode: "baseline_2026-real-snapshot",
      started,
      finished,
      chunkIndex: idx,
      chunkCount
    });
  });
}

const WATERMARK = "2026-08-15T10:00:00.000Z";
const POP = {
  available: true,
  census_scope: CENSUS_SCOPE_FULL,
  complete: true,
  uncapped: true,
  full_census_import_group_id: "full-epoch",
  full_census_started_at: WATERMARK
};

function wsJob(id, sqft, lastSeen, extra = {}) {
  return {
    source_job_id: String(id),
    last_seen_at: lastSeen,
    sync_run_id: extra.sync_run_id || "full-run",
    raw_payload: {
      forms: [
        {
          id: `form-${id}`,
          formTemplateName: "Job Worksheet",
          fields: [{ label: "Sq.Ft.", numericValue: sqft, value: String(sqft) }]
        },
        {
          id: `acct-${id}`,
          formTemplateName: "Accounting Form",
          fields: [{ label: "Sq.Ft.", numericValue: 999 }]
        }
      ]
    }
  };
}

{
  assert.equal(resolveCensusScopeFromRun({ metadata: { census_scope: "incremental" }, mode: "baseline_2026-real-snapshot" }), CENSUS_SCOPE_INCREMENTAL);
  assert.equal(resolveCensusScopeFromRun({ metadata: { census_scope: "full" } }), CENSUS_SCOPE_FULL);
  assert.equal(resolveCensusScopeFromRun({ mode: "baseline_2026-real-snapshot", metadata: {} }), CENSUS_SCOPE_FULL);
  assert.equal(resolveCensusScopeFromRun({ metadata: { snapshot_mode: "baseline_2026" } }), CENSUS_SCOPE_FULL);
  assert.equal(resolveCensusScopeFromRun({ mode: "baseline-real-snapshot", metadata: { snapshot_mode: "baseline" } }), "");
  assert.equal(resolveCensusScopeFromRun({ metadata: { chunk_count: 527 } }), "", "must not infer full from chunk_count");
  console.log("ok: census_scope explicit + legacy baseline_2026; never chunk_count");
}

{
  assert.equal(
    canAdvanceFullCensusWatermark({
      census_scope: CENSUS_SCOPE_FULL,
      complete: true,
      uncapped: true,
      importSucceeded: true
    }),
    true
  );
  assert.equal(canAdvanceFullCensusWatermark({ census_scope: CENSUS_SCOPE_INCREMENTAL, complete: true, uncapped: true, importSucceeded: true }), false);
  assert.equal(canAdvanceFullCensusWatermark({ census_scope: CENSUS_SCOPE_FULL, complete: false, uncapped: true, importSucceeded: true }), false);
  assert.equal(canAdvanceFullCensusWatermark({ census_scope: CENSUS_SCOPE_FULL, complete: true, uncapped: false, importSucceeded: true }), false);
  assert.equal(canAdvanceFullCensusWatermark({ census_scope: CENSUS_SCOPE_FULL, complete: true, uncapped: true, importSucceeded: false }), false);
  console.log("ok: watermark advances only on successful complete uncapped full census");
}

{
  const rows = [
    {
      id: "c1",
      status: "success",
      started_at: WATERMARK,
      finished_at: "2026-08-15T18:00:00.000Z",
      mode: "baseline_2026-real-snapshot",
      metadata: {
        import_group_id: "legacy-full",
        chunk_index: 1,
        chunk_count: 1,
        snapshot_mode: "baseline_2026",
        cap_warnings: []
      }
    }
  ];
  const ev = evaluateImportGroupAsFullCensus("legacy-full", rows, rows[0]);
  assert.equal(ev.eligible, true);
  assert.equal(ev.full_census_started_at, WATERMARK);
  assert.equal(ev.census_scope, CENSUS_SCOPE_FULL);

  const capped = evaluateImportGroupAsFullCensus("capped", [
    {
      ...rows[0],
      metadata: { ...rows[0].metadata, census_scope: "full", cap_warnings: ["jobs reached cap 5000"], uncapped: false }
    }
  ], null);
  assert.equal(capped.eligible, false);

  const partial = evaluateImportGroupAsFullCensus("partial", [
    {
      id: "p1",
      status: "success",
      started_at: WATERMARK,
      mode: "baseline_2026-real-snapshot",
      metadata: { import_group_id: "partial", chunk_index: 1, chunk_count: 3, census_scope: "full", uncapped: true }
    }
  ], null);
  assert.equal(partial.complete, false);
  assert.equal(partial.eligible, false);

  const inc = evaluateImportGroupAsFullCensus("inc", [
    {
      id: "i1",
      status: "success",
      started_at: "2026-08-16T00:00:00.000Z",
      finished_at: "2026-08-16T00:05:00.000Z",
      mode: "incremental",
      metadata: { import_group_id: "inc", chunk_index: 1, chunk_count: 1, census_scope: "incremental", uncapped: true }
    }
  ], null);
  assert.equal(inc.census_scope, CENSUS_SCOPE_INCREMENTAL);
  assert.equal(inc.complete, true);
  assert.equal(inc.eligible, false);
  console.log("ok: legacy baseline_2026 qualifies; capped/partial/incremental do not advance watermark");
}

{
  assert.equal(jobInCurrentMorawareSet({ last_seen_at: "2026-05-18T16:00:00.000Z" }, POP), false);
  assert.equal(jobInCurrentMorawareSet({ last_seen_at: WATERMARK }, POP), true);
  assert.equal(jobInCurrentMorawareSet({ last_seen_at: "2026-08-16T09:00:00.000Z" }, POP), true);
  const stored = [
    ...Array.from({ length: VERIFIED_FOUNDATION_2026_JOB_COUNT }, (_, i) => ({
      source_job_id: `c${i + 1}`,
      last_seen_at: "2026-08-15T12:00:00.000Z"
    })),
    ...Array.from({ length: 24 }, (_, i) => ({
      source_job_id: `stale${i + 1}`,
      last_seen_at: "2026-06-29T07:00:00.000Z"
    }))
  ];
  const current = filterCurrentMorawareJobSet(stored, POP);
  assert.equal(current.length, VERIFIED_FOUNDATION_2026_JOB_COUNT);
  assert.equal(stored.length, VERIFIED_FOUNDATION_2026_JOB_COUNT + 24);
  console.log("ok: 4097 stored → 4073 current; 24 stale excluded");
}

{
  const broihahn = [
    wsJob("b1", 543, "2026-08-15T12:00:00.000Z"),
    wsJob("b2", 740.5, "2026-08-15T12:00:00.000Z")
  ];
  const stale = [wsJob("s1", 917.5, "2026-05-18T16:00:00.000Z")];
  const current = filterCurrentMorawareJobSet([...broihahn, ...stale], POP);
  assert.equal(current.length, 2);
  assert.equal(sumJobWorksheetCensusSqft(current), 1283.5);
  assert.equal(sumJobWorksheetCensusSqft([...broihahn, ...stale]), 2201);
  assert.equal(extractJobWorksheetCensusSqft(broihahn[0]).totalSqft, 543);
  console.log("ok: Broihahn-style 1283.5 on current set; accounting-form Sq.Ft. ignored; stale 917.5 excluded");
}

{
  const currentJobs = Array.from({ length: VERIFIED_FOUNDATION_2026_JOB_COUNT }, (_, i) => ({
    source_job_id: `j${i + 1}`,
    last_seen_at: "2026-08-15T12:00:00.000Z",
    sync_run_id: i < 10 ? "inc-run" : "full-run"
  }));
  const newJobs = Array.from({ length: 7 }, (_, i) => ({
    source_job_id: `n${i + 1}`,
    last_seen_at: "2026-08-16T08:00:00.000Z",
    sync_run_id: "inc-run"
  }));
  const stale = Array.from({ length: 24 }, (_, i) => ({
    source_job_id: `stale${i + 1}`,
    last_seen_at: "2026-06-01T00:00:00.000Z",
    sync_run_id: "old-run"
  }));
  const plan = planPreparedFactsRebuild({
    jobs: [...currentJobs, ...newJobs, ...stale],
    population: POP,
    latestCompleteGroup: {
      import_group_id: "incremental-17",
      successful_sync_run_ids: ["inc-run"]
    }
  });
  assert.equal(plan.import_group_id, "full-epoch");
  assert.equal(plan.fact_count, VERIFIED_FOUNDATION_2026_JOB_COUNT + 7);
  assert.equal(plan.would_collapse_to_latest_group_count, 17);
  assert.equal(plan.uses_latest_complete_group_as_universe, false);
  assert.equal(plan.requires_held_population_lock, true);
  assert.notEqual(plan.fact_count, 17);
  console.log("ok: prepared facts stay on full-census epoch; 4073+7 new ≠ collapse to 17");
}

{
  const meta = buildMorawareCensusImportMetadata({
    censusScope: CENSUS_SCOPE_INCREMENTAL,
    snapshotMode: "baseline_2026",
    capWarnings: []
  });
  assert.equal(meta.census_scope, CENSUS_SCOPE_INCREMENTAL);
  assert.equal(meta.uncapped, true);
  console.log("ok: future import metadata stamps census_scope");
}

{
  const stamped = withMorawareMirrorObservationTimestamps({ source_job_id: "1" }, "2026-08-16T00:00:00.000Z");
  assert.equal(stamped.last_seen_at, "2026-08-16T00:00:00.000Z");
  assert.equal("first_seen_at" in stamped, false);
  const jobs = normalizeJobs([{ id: "9", job_name: "X" }], { organizationId: "o", syncRunId: "r" });
  assert.equal("first_seen_at" in jobs[0], false);
  assert.ok(jobs[0].last_seen_at);
  console.log("ok: upsert payload omits first_seen_at (DB default on insert)");
}

assert.equal(VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT, 271432.5);

{
  clearCurrentMorawarePopulationCacheForTests();
  const eligible = foundationChunks({ gid: "newest-full", chunkCount: 3, scope: CENSUS_SCOPE_FULL });
  const older = foundationChunks({
    gid: "older-full",
    chunkCount: 2,
    scope: CENSUS_SCOPE_FULL,
    startedBase: "2026-08-01T10:00:00.000Z",
    finishedBaseMs: Date.parse("2026-08-01T12:00:00.000Z")
  });
  const db = createCountingSyncRunsDb([...eligible, ...older]);
  const pop = await resolveCurrentMorawarePopulation(db, "org-1", { includeStats: true, skipCache: true });
  assert.equal(pop.available, true);
  assert.equal(pop.full_census_import_group_id, "newest-full");
  assert.equal(pop._resolveStats.groupsEvaluated, 1);
  assert.ok(pop._resolveStats.discoveryPages <= 1);
  assert.ok(db.stats.queries < 10);
  console.log("ok A: newest qualifying full census — stop after evaluating it");
}

{
  clearCurrentMorawarePopulationCacheForTests();
  const incomplete = [
    runRow({
      id: "incpl-1",
      gid: "newest-incomplete",
      scope: CENSUS_SCOPE_FULL,
      mode: "baseline_2026-real-snapshot",
      started: "2026-08-20T10:00:00.000Z",
      finished: "2026-08-20T11:00:00.000Z",
      chunkIndex: 1,
      chunkCount: 3
    })
  ];
  const prior = foundationChunks({
    gid: "prior-full",
    chunkCount: 2,
    scope: CENSUS_SCOPE_FULL,
    startedBase: "2026-08-15T10:00:00.000Z",
    finishedBaseMs: Date.parse("2026-08-15T12:00:00.000Z")
  });
  const db = createCountingSyncRunsDb([...incomplete, ...prior]);
  const pop = await resolveCurrentMorawarePopulation(db, "org-1", { includeStats: true, skipCache: true });
  assert.equal(pop.full_census_import_group_id, "prior-full");
  assert.equal(pop._resolveStats.groupsEvaluated, 2);
  console.log("ok B: newest full incomplete — skip and find previous eligible full");
}

{
  clearCurrentMorawarePopulationCacheForTests();
  const capped = [
    runRow({
      id: "cap-1",
      gid: "newest-capped",
      scope: CENSUS_SCOPE_FULL,
      mode: "baseline_2026-real-snapshot",
      started: "2026-08-21T10:00:00.000Z",
      finished: "2026-08-21T11:00:00.000Z",
      chunkIndex: 1,
      chunkCount: 1,
      capWarnings: ["jobs reached cap 5000"]
    })
  ];
  const prior = foundationChunks({
    gid: "uncapped-full",
    chunkCount: 1,
    scope: CENSUS_SCOPE_FULL,
    startedBase: "2026-08-15T10:00:00.000Z",
    finishedBaseMs: Date.parse("2026-08-15T12:00:00.000Z")
  });
  const pop = await resolveCurrentMorawarePopulation(createCountingSyncRunsDb([...capped, ...prior]), "org-1", {
    includeStats: true,
    skipCache: true
  });
  assert.equal(pop.full_census_import_group_id, "uncapped-full");
  console.log("ok C: newest full capped — skip it");
}

{
  clearCurrentMorawarePopulationCacheForTests();
  const failed = [
    runRow({
      id: "fail-1",
      gid: "newest-failed",
      scope: CENSUS_SCOPE_FULL,
      mode: "baseline_2026-real-snapshot",
      started: "2026-08-22T10:00:00.000Z",
      finished: "2026-08-22T10:30:00.000Z",
      chunkIndex: 1,
      chunkCount: 2,
      status: "success"
    }),
    runRow({
      id: "fail-2",
      gid: "newest-failed",
      scope: CENSUS_SCOPE_FULL,
      mode: "baseline_2026-real-snapshot",
      started: "2026-08-22T10:31:00.000Z",
      finished: "2026-08-22T11:00:00.000Z",
      chunkIndex: 2,
      chunkCount: 2,
      status: "failed"
    })
  ];
  // Discovery only surfaces success rows; failed chunk still loaded via group detail.
  const prior = foundationChunks({
    gid: "good-full",
    chunkCount: 1,
    scope: CENSUS_SCOPE_FULL,
    startedBase: "2026-08-15T10:00:00.000Z",
    finishedBaseMs: Date.parse("2026-08-15T12:00:00.000Z")
  });
  const pop = await resolveCurrentMorawarePopulation(createCountingSyncRunsDb([...failed, ...prior]), "org-1", {
    includeStats: true,
    skipCache: true
  });
  assert.equal(pop.full_census_import_group_id, "good-full");
  console.log("ok D: newest full failed — skip it");
}

{
  clearCurrentMorawarePopulationCacheForTests();
  const incrementals = Array.from({ length: 40 }, (_, i) =>
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
  const full = foundationChunks({
    gid: "full-under-incrementals",
    chunkCount: 3,
    scope: CENSUS_SCOPE_FULL,
    startedBase: "2026-08-15T09:00:00.000Z",
    finishedBaseMs: Date.parse("2026-08-15T18:00:00.000Z")
  });
  const db = createCountingSyncRunsDb([...incrementals, ...full]);
  const pop = await resolveCurrentMorawarePopulation(db, "org-1", { includeStats: true, skipCache: true });
  assert.equal(pop.full_census_import_group_id, "full-under-incrementals");
  assert.equal(pop._resolveStats.path, "explicit_full");
  assert.equal(pop._resolveStats.groupsEvaluated, 1);
  assert.ok(db.stats.queries < 15, `expected few queries, got ${db.stats.queries}`);
  console.log("ok E: many incrementals after full — finds most recent full without scanning old history");
}

{
  clearCurrentMorawarePopulationCacheForTests();
  const oldNoise = Array.from({ length: 2500 }, (_, i) =>
    runRow({
      id: `old-${i}`,
      gid: `old-g-${Math.floor(i / 50)}`,
      scope: "",
      mode: "baseline_2026-real-snapshot",
      started: `2026-06-01T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
      finished: `2026-06-02T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
      chunkIndex: (i % 50) + 1,
      chunkCount: 50
    })
  );
  const newestLegacy = foundationChunks({
    gid: "legacy-newest",
    chunkCount: 2,
    scope: "",
    startedBase: "2026-08-15T18:48:47.614Z",
    finishedBaseMs: Date.parse("2026-08-15T19:08:06.524Z")
  });
  const db = createCountingSyncRunsDb([...oldNoise, ...newestLegacy]);
  const pop = await resolveCurrentMorawarePopulation(db, "org-1", { includeStats: true, skipCache: true });
  assert.equal(pop.available, true);
  assert.equal(pop.full_census_import_group_id, "legacy-newest");
  assert.equal(pop._resolveStats.path, "legacy_baseline_2026");
  assert.equal(pop._resolveStats.groupsEvaluated, 1);
  assert.ok(
    db.stats.discoveryQueries <= 3,
    `must not page entire legacy history first; discoveryQueries=${db.stats.discoveryQueries}`
  );
  assert.ok(db.stats.queries < 20, `expected early exit, got ${db.stats.queries} queries`);
  console.log("ok F: legacy baseline_2026 newest qualifying group without loading entire legacy history");
}

{
  clearCurrentMorawarePopulationCacheForTests();
  const chunks = foundationChunks({
    gid: "foundation-527",
    chunkCount: 527,
    scope: "",
    startedBase: "2026-08-15T18:48:47.614Z",
    finishedBaseMs: Date.parse("2026-08-15T19:08:06.524Z")
  });
  const olderNoise = Array.from({ length: 4000 }, (_, i) =>
    runRow({
      id: `hist-${i}`,
      gid: `hist-g-${Math.floor(i / 100)}`,
      scope: "",
      mode: "baseline_2026-real-snapshot",
      started: `2026-05-01T00:00:00.000Z`,
      finished: `2026-05-02T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
      chunkIndex: (i % 100) + 1,
      chunkCount: 100
    })
  );
  const db = createCountingSyncRunsDb([...chunks, ...olderNoise]);
  const pop = await resolveCurrentMorawarePopulation(db, "org-1", { includeStats: true, skipCache: true });
  assert.equal(pop.available, true);
  assert.equal(pop.full_census_import_group_id, "foundation-527");
  assert.equal(pop.full_census_started_at, "2026-08-15T18:48:47.614Z");
  assert.equal(pop._resolveStats.qualifyingChunkRows, 527);
  assert.equal(pop._resolveStats.groupsEvaluated, 1);
  // explicit empty discovery (1) + legacy discovery (1) + group pages ceil(527/200)=3 → ~5
  assert.ok(
    pop._resolveStats.queryEstimate <= 8,
    `production-like 527-chunk case must stay near 5 queries, got estimate=${pop._resolveStats.queryEstimate}`
  );
  assert.ok(db.stats.queries <= 8, `got ${db.stats.queries} queries (must not approach ~90)`);
  assert.ok(db.stats.discoveryQueries <= 3);
  assert.equal(db.stats.groupDetailQueries, 3);
  console.log("ok G + perf guard: 527-chunk group fully verified; ~5 queries not ~90");
}

{
  clearCurrentMorawarePopulationCacheForTests();
  assert.equal(CURRENT_MORAWARE_POPULATION_CACHE_TTL_MS, 60_000);
  assert.equal(CURRENT_MORAWARE_POPULATION_UNAVAILABLE_CACHE_TTL_MS, 10_000);
  const rows = foundationChunks({ gid: "cache-full", chunkCount: 1, scope: CENSUS_SCOPE_FULL });
  const db = createCountingSyncRunsDb(rows);
  const t0 = Date.parse("2026-08-17T12:00:00.000Z");
  const first = await resolveCurrentMorawarePopulation(db, "org-cache", { nowMs: t0, includeStats: true });
  assert.equal(first.available, true);
  assert.equal(first._resolveStats.cacheHit, false);
  const qAfterFirst = db.stats.queries;
  const second = await resolveCurrentMorawarePopulation(db, "org-cache", { nowMs: t0 + 1_000, includeStats: true });
  assert.equal(second._resolveStats.cacheHit, true);
  assert.equal(second.full_census_import_group_id, "cache-full");
  assert.equal(db.stats.queries, qAfterFirst, "cached resolve must not hit backing store");
  console.log("ok H: cached second resolve avoids repeated backing-store scan");

  const afterExpiry = await resolveCurrentMorawarePopulation(db, "org-cache", {
    nowMs: t0 + CURRENT_MORAWARE_POPULATION_CACHE_TTL_MS + 1,
    includeStats: true
  });
  assert.equal(afterExpiry._resolveStats.cacheHit, false);
  assert.ok(db.stats.queries > qAfterFirst);
  console.log("ok I: cache expiry performs authoritative resolution again");

  invalidateCurrentMorawarePopulationCache("org-cache");
  const qBeforeInvalidate = db.stats.queries;
  const afterInvalidate = await resolveCurrentMorawarePopulation(db, "org-cache", {
    nowMs: t0 + 5_000,
    includeStats: true
  });
  assert.equal(afterInvalidate._resolveStats.cacheHit, false);
  assert.ok(db.stats.queries > qBeforeInvalidate);
  console.log("ok: invalidateCurrentMorawarePopulationCache forces re-resolve");
}

{
  clearCurrentMorawarePopulationCacheForTests();
  const onlyIncremental = [
    runRow({
      id: "only-inc",
      gid: "inc-only",
      scope: CENSUS_SCOPE_INCREMENTAL,
      mode: "incremental",
      started: "2026-08-16T08:00:00.000Z",
      finished: "2026-08-16T08:01:00.000Z",
      chunkIndex: 1,
      chunkCount: 1
    })
  ];
  const pop = await resolveCurrentMorawarePopulation(createCountingSyncRunsDb(onlyIncremental), "org-1", {
    includeStats: true,
    skipCache: true
  });
  assert.equal(pop.available, false);
  assert.equal(pop.full_census_import_group_id, null);
  assert.equal(pop.full_census_started_at, null);
  console.log("ok J: no qualifying full — available:false, never all-jobs fallback");
}

{
  // Broihahn / Foundation regression labels remain documentation constants (membership unchanged).
  assert.equal(VERIFIED_FOUNDATION_2026_JOB_COUNT, 4073);
  assert.equal(VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT, 271432.5);
  const broihahn = [
    wsJob("b1", 543, "2026-08-15T12:00:00.000Z"),
    wsJob("b2", 740.5, "2026-08-15T12:00:00.000Z")
  ];
  assert.equal(sumJobWorksheetCensusSqft(filterCurrentMorawareJobSet(broihahn, POP)), 1283.5);
  console.log("ok: Broihahn 13-job / 1,283.5 SqFt membership math unchanged (2-job fixture sum)");
}

console.log("morawareCurrentPopulation.test.mjs — all passed");
