/**
 * CURRENT_MORAWARE_JOB_SET — Option D census watermark, SqFt, prepared-fact epoch.
 */
import assert from "node:assert/strict";
import {
  buildMorawareCensusImportMetadata,
  canAdvanceFullCensusWatermark,
  CENSUS_SCOPE_FULL,
  CENSUS_SCOPE_INCREMENTAL,
  evaluateImportGroupAsFullCensus,
  filterCurrentMorawareJobSet,
  jobInCurrentMorawareSet,
  planPreparedFactsRebuild,
  resolveCensusScopeFromRun,
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT
} from "./morawareCurrentPopulation.mjs";
import {
  extractJobWorksheetCensusSqft,
  sumJobWorksheetCensusSqft
} from "../sales/morawareSqftActuals.js";
import { normalizeJobs, withMorawareMirrorObservationTimestamps } from "./morawareSyncApi.js";

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
console.log("morawareCurrentPopulation.test.mjs — all passed");
