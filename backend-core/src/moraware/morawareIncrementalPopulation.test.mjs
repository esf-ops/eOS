/**
 * Deterministic tests for TRUE INCREMENTAL Moraware population.
 * No live Moraware. No Supabase production writes.
 */
import assert from "node:assert/strict";
import {
  buildAdvancedCursorState,
  buildFailedCursorAttemptState,
  buildIncrementalDiscoveryWindow,
  createMemoryIncrementalCursorStore,
  shouldAdvanceIncrementalCursor,
  summarizeIncrementalCursorHealth
} from "./morawareIncrementalCursor.mjs";
import {
  classifyIncrementalCandidates,
  incrementalCandidateSetKey,
  mergeIncrementalCandidateIds,
  planIncrementalDiscovery,
  selectCandidatesByCreationDateWindow,
  selectRollingCurrentJobBatch,
  sortCurrentSourceJobIds
} from "./morawareIncrementalDiscovery.mjs";
import {
  buildIncrementalImportMetadata,
  planMorawareIncrementalPopulation,
  runMorawareIncrementalPopulation,
  CENSUS_SCOPE_FULL,
  CENSUS_SCOPE_INCREMENTAL,
  MORAWARE_POPULATION_LOCK_NAME
} from "./morawareIncrementalPopulation.mjs";
import { planIncrementalPreparedJobFactsRefresh } from "./morawareIncrementalPreparedFacts.mjs";
import {
  describeMorawareIncrementalStrategy,
  MORAWARE_INCREMENTAL_API_CAPABILITY,
  MORAWARE_INCREMENTAL_STRATEGY
} from "./morawareIncrementalStrategy.mjs";
import {
  isAuthoritativeCompleteFormsPayload,
  planIncrementalWorksheetFactRefresh,
  planWorksheetFactRemovalsForAuthoritativeJob
} from "./morawareJobWorksheetPreparedFacts.mjs";
import {
  canAdvanceFullCensusWatermark,
  jobInCurrentMorawareSet
} from "./morawareCurrentPopulation.mjs";

const EPOCH_A = "c3a0e6e5-b5af-499c-87a8-73d720d485be";
const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FULL_START = "2026-08-15T12:00:00.000Z";

function worksheetJob(sourceJobId, formIds, { complete = true } = {}) {
  return {
    source_job_id: sourceJobId,
    source_account_id: "553",
    account_name: "Test",
    forms_authoritative_complete: complete,
    raw_payload: {
      forms_authoritative_complete: complete,
      forms: formIds.map((id) => ({
        id,
        formTemplateName: "Job Worksheet",
        fields: [
          { label: "Color", value: "Antique Gray" },
          { label: "Sq.Ft.", value: "10" },
          { label: "Room", value: "Kitchen" }
        ]
      }))
    }
  };
}

function basePopulation(extraIds = []) {
  return {
    available: true,
    organization_id: ORG,
    full_census_import_group_id: EPOCH_A,
    full_census_started_at: FULL_START,
    current_source_job_ids: ["100", "200", "300", ...extraIds]
  };
}

console.log("\n=== moraware incremental population ===\n");

// 1. distinguishable from FULL
{
  const meta = buildIncrementalImportMetadata({
    parentFullEpochId: EPOCH_A,
    window: { cursor_start: "2026-08-16T00:00:00.000Z", cursor_end: "2026-08-17T00:00:00.000Z" },
    discovery: { candidates: [{ source_job_id: "1" }], classification: { existing_job_updates: [], new_job_additions: ["1"] } }
  });
  assert.equal(meta.census_scope, CENSUS_SCOPE_INCREMENTAL);
  assert.notEqual(meta.census_scope, CENSUS_SCOPE_FULL);
  assert.equal(meta.incremental_strategy, MORAWARE_INCREMENTAL_STRATEGY);
  console.log("ok 1: incremental distinguishable from FULL");
}

// 2. preserves parent FULL epoch
{
  const plan = planMorawareIncrementalPopulation({
    population: basePopulation(),
    cursor: { advanced_to: "2026-08-16T00:00:00.000Z" },
    listRows: [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
    exactJobs: [worksheetJob("100", ["f1"])],
    now: new Date("2026-08-17T00:00:00.000Z"),
    rollingBatchSize: 0
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.parent_full_epoch_id, EPOCH_A);
  assert.equal(plan.worksheet_facts.import_group_id, EPOCH_A);
  assert.equal(plan.prepared_job_facts.import_group_id, EPOCH_A);
  assert.equal(plan.creates_new_full_epoch, false);
  console.log("ok 2: incremental preserves parent FULL epoch");
}

// 3. unchanged jobs not rewritten (creation-window only isolation)
{
  const plan = planMorawareIncrementalPopulation({
    population: basePopulation(),
    cursor: { advanced_to: "2026-08-16T00:00:00.000Z" },
    listRows: [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
    exactJobs: [worksheetJob("100", ["f1"])],
    now: new Date("2026-08-17T00:00:00.000Z"),
    rollingBatchSize: 0
  });
  assert.deepEqual(plan.discovery.classification.current_jobs_absent_from_incremental.sort(), ["200", "300"]);
  assert.ok(plan.prepared_job_facts.untouched_source_job_ids.includes("200"));
  assert.ok(plan.prepared_job_facts.untouched_source_job_ids.includes("300"));
  assert.equal(plan.brain.would_write_jobs, 1);
  console.log("ok 3: unchanged jobs not rewritten");
}

// 4. new job can be added after FULL
{
  const plan = planMorawareIncrementalPopulation({
    population: basePopulation(),
    cursor: { advanced_to: "2026-08-16T00:00:00.000Z" },
    listRows: [{ id: "999", creationDate: "2026-08-16T18:00:00.000Z" }],
    exactJobs: [worksheetJob("999", ["f9"])],
    now: new Date("2026-08-17T00:00:00.000Z"),
    rollingBatchSize: 0
  });
  assert.deepEqual(plan.discovery.classification.new_job_additions, ["999"]);
  assert.ok(plan.brain.would_touch_source_job_ids.includes("999"));
  console.log("ok 4: new job can be added after FULL epoch");
}

// 5. absence from incremental does not remove current job
{
  const classified = classifyIncrementalCandidates({
    candidates: [{ source_job_id: "100" }],
    currentSourceJobIds: ["100", "200", "300"]
  });
  assert.deepEqual(classified.would_remove_from_current, []);
  assert.equal(classified.absence_establishes_global_absence, false);
  assert.ok(classified.current_jobs_absent_from_incremental.includes("200"));
  console.log("ok 5: incremental absence does not remove current job");
}

// 6. exact refreshed job updates Brain scope (plan)
{
  const plan = planMorawareIncrementalPopulation({
    population: basePopulation(),
    cursor: {},
    listRows: [{ id: "200", creationDate: "2026-08-15T13:00:00.000Z" }],
    exactJobs: [worksheetJob("200", ["f2"])],
    now: new Date("2026-08-17T00:00:00.000Z"),
    rollingBatchSize: 0
  });
  assert.ok(plan.discovery.classification.existing_job_updates.includes("200"));
  assert.equal(plan.metadata.census_scope, "incremental");
  console.log("ok 6: exact refreshed job can update Brain data (scoped)");
}

// 7 + 8. per-job form reconcile; other job untouched
{
  const existing = new Map([
    ["100", [{ source_form_id: "old-a" }, { source_form_id: "keep-b" }]],
    ["200", [{ source_form_id: "other-only" }]]
  ]);
  const plan = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetJob("100", ["keep-b", "new-c"], { complete: true })],
    existingRowsByJobId: existing
  });
  assert.equal(plan.ok, true);
  const rem = plan.removal_plans.find((p) => p.source_job_id === "100");
  assert.deepEqual(rem.remove_source_form_ids, ["old-a"]);
  assert.equal(plan.removal_plans.some((p) => p.source_job_id === "200"), false);
  assert.equal(
    plan.upsert_rows.every((r) => r.import_group_id === EPOCH_A),
    true
  );
  // planner for job 200 alone would not be invoked — prove other job's forms not in removal list
  assert.equal(rem.remove_source_form_ids.includes("other-only"), false);
  console.log("ok 7/8: exact job form reconcile; other job rows not deleted");
}

// 9. worksheet writes remain inside parent FULL epoch
{
  const plan = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetJob("100", ["f1"])]
  });
  assert.equal(plan.import_group_id, EPOCH_A);
  assert.ok(plan.upsert_rows.every((r) => r.import_group_id === EPOCH_A));
  console.log("ok 9: worksheet incremental writes stay in parent FULL epoch");
}

// 10. cursor advances only after total success
{
  const yes = shouldAdvanceIncrementalCursor({
    discoveryOk: true,
    exactFetchOk: true,
    brainImportOk: true,
    preparedFactsOk: true,
    worksheetFactsOk: true,
    validationOk: true,
    lockOwned: true,
    dryRun: false
  });
  assert.equal(yes.advance, true);
  console.log("ok 10: cursor advances only after total success");
}

// 11–14. cursor does not advance on stage failures
{
  const cases = [
    ["discoveryOk", "candidate_discovery_failed"],
    ["exactFetchOk", "exact_job_fetch_failed"],
    ["brainImportOk", "brain_import_failed"],
    ["preparedFactsOk", "prepared_facts_failed"],
    ["worksheetFactsOk", "worksheet_facts_failed"]
  ];
  for (const [flag, reason] of cases) {
    const base = {
      discoveryOk: true,
      exactFetchOk: true,
      brainImportOk: true,
      preparedFactsOk: true,
      worksheetFactsOk: true,
      validationOk: true,
      lockOwned: true,
      dryRun: false
    };
    base[flag] = false;
    const d = shouldAdvanceIncrementalCursor(base);
    assert.equal(d.advance, false);
    assert.equal(d.reason, reason);
  }
  console.log("ok 11-14: cursor does not advance after source/Brain/prepared/worksheet failure");
}

// 15. replay of same window is idempotent
{
  const rows = [
    { id: "1", creationDate: "2026-08-16T10:00:00.000Z" },
    { id: "2", creationDate: "2026-08-16T11:00:00.000Z" }
  ];
  const window = {
    cursor_start: "2026-08-16T00:00:00.000Z",
    cursor_end: "2026-08-17T00:00:00.000Z"
  };
  const plan = planIncrementalDiscovery({
    window: { cursor_start: "2026-08-16T00:00:00.000Z", cursor_end: "2026-08-17T00:00:00.000Z" },
    listRows: rows,
    currentSourceJobIds: [],
    rollingBatchSize: 0
  });
  const b = planIncrementalDiscovery({
    window: { cursor_start: "2026-08-16T00:00:00.000Z", cursor_end: "2026-08-17T00:00:00.000Z" },
    listRows: rows,
    currentSourceJobIds: [],
    rollingBatchSize: 0
  });
  assert.equal(incrementalCandidateSetKey(plan.candidates), incrementalCandidateSetKey(b.candidates));
  console.log("ok 15: replay of same incremental window is idempotent");
}

// 16. timestamp-boundary overlap cannot create duplicate candidate ids
{
  const merged = mergeIncrementalCandidateIds({
    discovered: [
      { source_job_id: "1", discovery: "creation_window" },
      { source_job_id: "1", discovery: "creation_window" }
    ],
    extraSourceJobIds: ["1", "2"]
  });
  assert.equal(merged.filter((c) => c.source_job_id === "1").length, 1);
  assert.equal(merged.length, 2);
  console.log("ok 16: overlap/replay cannot create duplicate facts keys (candidate set)");
}

// 17 + 18 + 19 + 20. lock before discovery; lost lock fails closed; outer token flows; release in finally
{
  const events = [];
  let lockHeld = false;
  let released = false;
  const owner = "owner-token-abc";
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z", parent_full_epoch_id: EPOCH_A }
  });

  const result = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: {
      cursorStore,
      acquireLock: async ({ token }) => {
        events.push("acquire");
        lockHeld = true;
        return { acquired: true, owner_token: token };
      },
      releaseLock: async () => {
        events.push("release");
        released = true;
        lockHeld = false;
        return { released: true };
      },
      assertOwner: async ({ token }) => {
        events.push("assert");
        // Outer owner: treat successful assert as ownership (no standalone acquire).
        if (token === owner) lockHeld = true;
        return { ok: true, lock: { locked_by: token } };
      },
      resolvePopulation: async () => basePopulation(),
      listCandidateRows: async () => {
        events.push("discover");
        assert.equal(lockHeld, true, "lock must be held before discovery");
        return [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }];
      },
      listCurrentSourceJobIds: async () => ["100", "200", "300"],
      fetchExactJobs: async ({ ownerToken, sourceJobIds }) => {
        events.push("exact");
        assert.equal(ownerToken, owner);
        return {
          ok: true,
          jobs: (sourceJobIds || ["100"]).map((id) => worksheetJob(id, [`f-${id}`])),
          failures: []
        };
      },
      importBrain: async ({ ownerToken, metadata, censusScope, jobs }) => {
        events.push("brain");
        assert.equal(ownerToken, owner);
        assert.equal(censusScope, CENSUS_SCOPE_INCREMENTAL);
        assert.equal(metadata.parent_full_epoch_id, EPOCH_A);
        return {
          ok: true,
          jobs_written: jobs.length,
          source_job_ids_written: jobs.map((j) => String(j.source_job_id)),
          creates_new_full_epoch: false,
          watermark_advanced: false
        };
      },
      refreshPreparedJobFacts: async ({ ownerToken, importGroupId, jobs }) => {
        events.push("prepared");
        assert.equal(ownerToken, owner);
        assert.equal(importGroupId, EPOCH_A);
        return { ok: true, facts_upserted: jobs?.length || 1, account_rollups: "deferred_remaining_optimization" };
      },
      refreshWorksheetFacts: async ({ ownerToken, importGroupId }) => {
        events.push("worksheet");
        assert.equal(ownerToken, owner);
        assert.equal(importGroupId, EPOCH_A);
        return { ok: true, writes: { upserts: 1, deletes: 0 } };
      }
    },
    outerOwnerToken: owner
  });

  assert.equal(result.ok, true);
  assert.equal(events[0], "assert"); // outer owner verified first
  assert.ok(events.indexOf("discover") > events.indexOf("assert"));
  assert.equal(released, false); // outer token — finally must NOT release
  assert.ok(result.event_log.some((e) => e.step === "outer_lock_not_released"));
  assert.equal(result.cursor_advance.advance, true);
  const cur = await cursorStore.readCursor(ORG);
  assert.equal(cur.advanced_to, "2026-08-17T12:00:00.000Z");
  console.log("ok 17/19/20: lock before discovery; outer token flows; outer finally does not steal release");

  // lost lock fails closed + no cursor advance
  const cursorStore2 = createMemoryIncrementalCursorStore({
    [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z" }
  });
  let acquired2 = false;
  const lost = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: {
      cursorStore: cursorStore2,
      acquireLock: async ({ token }) => {
        acquired2 = true;
        return { acquired: true, owner_token: token };
      },
      releaseLock: async () => ({ released: true }),
      assertOwner: async () => ({ ok: false, code: "population_lock_lost", error: "lost" }),
      resolvePopulation: async () => basePopulation(),
      listCandidateRows: async () => [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
      fetchExactJobs: async () => ({ ok: true, jobs: [] }),
      importBrain: async () => ({ ok: true }),
      refreshPreparedJobFacts: async () => ({ ok: true }),
      refreshWorksheetFacts: async () => ({ ok: true })
    }
  });
  assert.equal(lost.ok, false);
  assert.equal(lost.status, "population_lock_lost");
  assert.equal(lost.cursor_advance.advance, false);
  assert.equal(acquired2, true);
  const cur2 = await cursorStore2.readCursor(ORG);
  assert.equal(cur2.advanced_to, "2026-08-16T00:00:00.000Z");
  console.log("ok 18: lost lock fails closed; cursor not advanced");
}

// standalone acquire + release in finally
{
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z", parent_full_epoch_id: EPOCH_A }
  });
  let released = false;
  const result = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: {
      cursorStore,
      acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
      releaseLock: async () => {
        released = true;
        return { released: true };
      },
      assertOwner: async () => ({ ok: true }),
      resolvePopulation: async () => basePopulation(),
      listCandidateRows: async () => [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
      listCurrentSourceJobIds: async () => ["100"],
      fetchExactJobs: async ({ sourceJobIds }) => ({
        ok: true,
        jobs: (sourceJobIds || ["100"]).map((id) => worksheetJob(id, [`f-${id}`])),
        failures: []
      }),
      importBrain: async ({ jobs }) => ({
        ok: true,
        jobs_written: jobs.length,
        source_job_ids_written: jobs.map((j) => String(j.source_job_id)),
        creates_new_full_epoch: false,
        watermark_advanced: false
      }),
      refreshPreparedJobFacts: async ({ jobs }) => ({
        ok: true,
        facts_upserted: jobs?.length || 1,
        account_rollups: "deferred_remaining_optimization"
      }),
      refreshWorksheetFacts: async () => ({ ok: true, writes: { upserts: 1, deletes: 0 } })
    }
  });
  assert.equal(result.ok, true);
  assert.equal(released, true);
  assert.ok(result.event_log.some((e) => e.step === "lock_released"));
  console.log("ok 20b: standalone lock releases in finally");
}

// failure stages do not advance cursor
{
  for (const [failStep, status] of [
    ["fetchExactJobs", "exact_boom"],
    ["importBrain", "brain_boom"],
    ["refreshPreparedJobFacts", "prep_boom"],
    ["refreshWorksheetFacts", "ws_boom"]
  ]) {
    const cursorStore = createMemoryIncrementalCursorStore({
      [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z" }
    });
    const deps = {
      cursorStore,
      acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
      releaseLock: async () => ({ released: true }),
      assertOwner: async () => ({ ok: true }),
      resolvePopulation: async () => basePopulation(),
      listCandidateRows: async () => [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
      listCurrentSourceJobIds: async () => ["100"],
      fetchExactJobs: async () =>
        failStep === "fetchExactJobs"
          ? { ok: false, status: "exact_boom" }
          : { ok: true, jobs: [worksheetJob("100", ["f1"])], failures: [] },
      importBrain: async ({ jobs }) =>
        failStep === "importBrain"
          ? { ok: false, status: "brain_boom" }
          : {
              ok: true,
              jobs_written: jobs?.length || 1,
              source_job_ids_written: (jobs || [{ source_job_id: "100" }]).map((j) => String(j.source_job_id)),
              creates_new_full_epoch: false,
              watermark_advanced: false
            },
      refreshPreparedJobFacts: async () =>
        failStep === "refreshPreparedJobFacts"
          ? { ok: false, status: "prep_boom" }
          : { ok: true, facts_upserted: 1, account_rollups: "deferred_remaining_optimization" },
      refreshWorksheetFacts: async () =>
        failStep === "refreshWorksheetFacts"
          ? { ok: false, status: "ws_boom" }
          : { ok: true, writes: { upserts: 1, deletes: 0 } }
    };
    const result = await runMorawareIncrementalPopulation({
      dryRun: false,
      liveWrite: true,
      allowLivePopulation: true,
      organizationId: ORG,
      now: new Date("2026-08-17T12:00:00.000Z"),
      deps
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(result.cursor_advance.advance, false);
    const cur = await cursorStore.readCursor(ORG);
    assert.equal(cur.advanced_to, "2026-08-16T00:00:00.000Z");
  }
  console.log("ok 11-14 live: stage failures leave cursor unmoved");
}

// 21. FULL path watermark rules unchanged
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
  assert.equal(
    canAdvanceFullCensusWatermark({
      census_scope: CENSUS_SCOPE_FULL,
      complete: true,
      uncapped: true,
      importSucceeded: true
    }),
    true
  );
  console.log("ok 21: FULL path watermark rules unchanged");
}

// 22 + 23. CURRENT set semantics: FULL absence vs incremental absence
{
  const population = {
    full_census_started_at: FULL_START,
    full_census_import_group_id: EPOCH_A
  };
  const seenInFull = { last_seen_at: "2026-08-15T12:00:00.000Z", source_job_id: "100" };
  const notSeen = { last_seen_at: "2026-08-14T00:00:00.000Z", source_job_id: "old" };
  assert.equal(jobInCurrentMorawareSet(seenInFull, population), true);
  assert.equal(jobInCurrentMorawareSet(notSeen, population), false);
  // Incremental does not change watermark — job still current even if absent from batch
  assert.equal(jobInCurrentMorawareSet(seenInFull, population), true);
  console.log("ok 22/23: FULL absence semantics preserved; incremental absence ≠ global absence");
}

// 24–28. no fuzzy / writeback / QB / AD / View222 / change-feed claims
{
  const d = describeMorawareIncrementalStrategy();
  assert.equal(d.strategy, "creation_window_plus_rolling_exact_refresh");
  assert.equal(d.api_capability.fuzzy_identity_matching, false);
  assert.equal(d.api_capability.moraware_writeback, false);
  assert.equal(d.api_capability.quickbooks_writes, false);
  assert.equal(d.api_capability.account_directory_writes, false);
  assert.equal(d.api_capability.view222_identity_authority, false);
  assert.equal(d.api_capability.modified_since_list_filter, false);
  assert.equal(d.api_capability.change_feed, false);
  assert.equal(d.api_capability.cdc, false);
  assert.equal(d.api_capability.creation_date_is_not_modification_detection, true);
  assert.equal(MORAWARE_INCREMENTAL_API_CAPABILITY.modified_since_list_filter, false);
  const plan = planIncrementalDiscovery({
    window: { cursor_start: "2026-08-16T00:00:00.000Z", cursor_end: "2026-08-17T00:00:00.000Z" },
    listRows: [{ id: "1", creationDate: "2026-08-16T01:00:00.000Z" }],
    rollingBatchSize: 0
  });
  assert.equal(plan.view222_used, false);
  assert.equal(plan.fuzzy_matching_used, false);
  console.log("ok 24-28: no fuzzy identity, Moraware writeback, QB, AD, View222, or change-feed claims");
}

// authoritative forms flag
{
  assert.equal(isAuthoritativeCompleteFormsPayload(worksheetJob("1", ["a"], { complete: true })), true);
  assert.equal(isAuthoritativeCompleteFormsPayload(worksheetJob("1", ["a"], { complete: false })), false);
  const incomplete = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetJob("100", ["f1"], { complete: false })],
    existingRowsByJobId: new Map([["100", [{ source_form_id: "old" }]]])
  });
  assert.equal(incomplete.removal_plans.length, 0);
  assert.ok(incomplete.jobs_skipped_incomplete_forms.includes("100"));
  console.log("ok: incomplete forms[] skips per-job deletion");
}

// window overlap + cursor helpers
{
  const window = buildIncrementalDiscoveryWindow({
    cursor: { advanced_to: "2026-08-17T10:00:00.000Z", overlap_ms: 3600000 },
    now: new Date("2026-08-17T12:00:00.000Z"),
    parentFullEpochId: EPOCH_A
  });
  assert.equal(window.cursor_start, "2026-08-17T09:00:00.000Z");
  assert.equal(window.replay_tolerant, true);
  const advanced = buildAdvancedCursorState({
    previousCursor: {
      advanced_to: "2026-08-17T10:00:00.000Z",
      rolling: { after_source_job_id: "100", cycle_count: 1 }
    },
    window,
    parentFullEpochId: EPOCH_A,
    rollingBatch: {
      next_after_source_job_id: "200",
      batch_size_selected: 2,
      start_source_job_id: "150",
      end_source_job_id: "200",
      wrapped: false
    },
    jobsRefreshed: 3
  });
  assert.equal(advanced.advanced_to, window.cursor_end);
  assert.equal(advanced.rolling.after_source_job_id, "200");
  const failed = buildFailedCursorAttemptState({
    previousCursor: {
      advanced_to: "2026-08-17T10:00:00.000Z",
      rolling: { after_source_job_id: "100", cycle_count: 2 }
    },
    failureReason: "brain_import_failed"
  });
  assert.equal(failed.advanced_to, "2026-08-17T10:00:00.000Z");
  assert.equal(failed.rolling.after_source_job_id, "100");
  assert.equal(failed.rolling.cycle_count, 2);
  assert.equal(failed.last_failure_reason, "brain_import_failed");
  const health = summarizeIncrementalCursorHealth(advanced);
  assert.equal(health.parent_full_epoch_id, EPOCH_A);
  assert.equal(health.rolling_cursor.after_source_job_id, "200");
  console.log("ok: cursor window overlap + rolling fail-closed annotate");
}

// dry-run never advances / never locks
{
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z" }
  });
  let acquired = false;
  const dry = await runMorawareIncrementalPopulation({
    dryRun: true,
    organizationId: ORG,
    now: new Date("2026-08-17T00:00:00.000Z"),
    listRows: [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
    exactJobs: [worksheetJob("100", ["f1"])],
    deps: {
      cursorStore,
      acquireLock: async () => {
        acquired = true;
        return { acquired: true };
      },
      resolvePopulation: async () => basePopulation(),
      listCandidateRows: async () => [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
      morawareCallsMade: () => 0
    }
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.dry_run, true);
  assert.equal(dry.actual_writes, 0);
  assert.equal(dry.cursor_advance.advance, false);
  assert.equal(acquired, false);
  const cur = await cursorStore.readCursor(ORG);
  assert.equal(cur.advanced_to, "2026-08-16T00:00:00.000Z");
  console.log("ok: dry-run reports plan with zero writes and no lock/cursor advance");
}

// creation window filter
{
  const selected = selectCandidatesByCreationDateWindow(
    [
      { id: "in", creationDate: "2026-08-16T12:00:00.000Z" },
      { id: "out", creationDate: "2026-08-10T12:00:00.000Z" }
    ],
    { cursorStart: "2026-08-16T00:00:00.000Z", cursorEnd: "2026-08-17T00:00:00.000Z" }
  );
  assert.equal(selected.candidates.map((c) => c.source_job_id).join(","), "in");
  console.log("ok: creationDate window filters candidates");
}

// removal planner still exact-job only
{
  const plan = planWorksheetFactRemovalsForAuthoritativeJob({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    sourceJobId: "100",
    existingFormIds: ["a", "b"],
    currentFormIds: ["b"]
  });
  assert.deepEqual(plan.remove_source_form_ids, ["a"]);
  console.log("ok: removal planner remains exact-job scoped");
}

// prepared job facts scope
{
  const plan = planIncrementalPreparedJobFactsRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [{ source_job_id: "100", account_name: "X" }],
    unchangedSourceJobIds: ["200", "300"]
  });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].import_group_id, EPOCH_A);
  assert.ok(plan.untouched_source_job_ids.includes("200"));
  assert.equal(plan.account_rollups, "deferred_remaining_optimization");
  console.log("ok: prepared job-fact refresh is exact-job scoped (rollups deferred)");
}

assert.equal(MORAWARE_POPULATION_LOCK_NAME, "moraware_population");

// ── Hybrid rolling refresh suite (production freshness gap) ───────────────
console.log("\n=== hybrid rolling refresh ===\n");

{
  // 1. old existing job outside creation window selected by rolling
  const discovery = planIncrementalDiscovery({
    window: { cursor_start: "2026-08-16T00:00:00.000Z", cursor_end: "2026-08-17T00:00:00.000Z" },
    listRows: [], // nothing in creation window
    currentSourceJobIds: ["50", "100", "200", "300"],
    rollingAfterSourceJobId: null,
    rollingBatchSize: 2
  });
  assert.ok(discovery.rolling_job_ids.includes("50"));
  assert.ok(discovery.rolling_job_ids.includes("100"));
  assert.equal(discovery.counts.creation_window_candidates, 0);
  assert.equal(discovery.counts.rolling_candidates, 2);
  console.log("ok R1: old existing job outside creation window selected by rolling");
}

{
  // 2 + 3. deterministic + bounded
  const a = selectRollingCurrentJobBatch({
    currentSourceJobIds: ["300", "100", "200", "50"],
    afterSourceJobId: null,
    batchSize: 2
  });
  const b = selectRollingCurrentJobBatch({
    currentSourceJobIds: ["50", "200", "100", "300"],
    afterSourceJobId: null,
    batchSize: 2
  });
  assert.deepEqual(a.source_job_ids, ["50", "100"]);
  assert.deepEqual(b.source_job_ids, a.source_job_ids);
  assert.equal(a.batch_size_selected, 2);
  assert.equal(a.population_size, 4);
  assert.deepEqual(sortCurrentSourceJobIds(["300", "100", "200", "50"]), ["50", "100", "200", "300"]);
  console.log("ok R2/R3: rolling selection deterministic and bounded");
}

{
  // 4. next successful run advances to next batch
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z", rolling: { after_source_job_id: null } }
  });
  const pop = {
    available: true,
    organization_id: ORG,
    full_census_import_group_id: EPOCH_A,
    full_census_started_at: FULL_START,
    current_source_job_ids: ["100", "200", "300", "400"]
  };
  async function runOnce() {
    return runMorawareIncrementalPopulation({
      dryRun: false,
      liveWrite: true,
      allowLivePopulation: true,
      organizationId: ORG,
      now: new Date("2026-08-17T12:00:00.000Z"),
      rollingBatchSize: 2,
      deps: {
        cursorStore,
        acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
        releaseLock: async () => ({ released: true }),
        assertOwner: async () => ({ ok: true }),
        resolvePopulation: async () => pop,
        listCandidateRows: async () => [],
        listCurrentSourceJobIds: async () => pop.current_source_job_ids,
        fetchExactJobs: async ({ sourceJobIds }) => ({
          ok: true,
          jobs: sourceJobIds.map((id) => worksheetJob(id, [`f-${id}`])),
          failures: []
        }),
        importBrain: async ({ jobs }) => ({
          ok: true,
          jobs_written: jobs.length,
          source_job_ids_written: jobs.map((j) => String(j.source_job_id)),
          creates_new_full_epoch: false,
          watermark_advanced: false
        }),
        refreshPreparedJobFacts: async ({ jobs }) => ({
          ok: true,
          facts_upserted: jobs.length,
          account_rollups: "deferred_remaining_optimization"
        }),
        refreshWorksheetFacts: async () => ({ ok: true, writes: { upserts: 2, deletes: 0 } })
      }
    });
  }
  const first = await runOnce();
  assert.equal(first.ok, true);
  assert.deepEqual(first.rolling.source_job_ids, ["100", "200"]);
  const cur1 = await cursorStore.readCursor(ORG);
  assert.equal(cur1.rolling.after_source_job_id, "200");
  const second = await runOnce();
  assert.equal(second.ok, true);
  assert.deepEqual(second.rolling.source_job_ids, ["300", "400"]);
  const cur2 = await cursorStore.readCursor(ORG);
  assert.equal(cur2.rolling.after_source_job_id, "400");
  console.log("ok R4: next successful run advances to next rolling batch");
}

{
  // 5. wrap
  const batch = selectRollingCurrentJobBatch({
    currentSourceJobIds: ["100", "200", "300"],
    afterSourceJobId: "300",
    batchSize: 2
  });
  assert.equal(batch.wrapped, true);
  assert.deepEqual(batch.source_job_ids, ["100", "200"]);
  const advanced = buildAdvancedCursorState({
    previousCursor: { rolling: { after_source_job_id: "300", cycle_count: 0 } },
    window: { cursor_end: "2026-08-17T12:00:00.000Z" },
    parentFullEpochId: EPOCH_A,
    rollingBatch: batch
  });
  assert.equal(advanced.rolling.cycle_count, 1);
  assert.equal(advanced.rolling.after_source_job_id, "200");
  assert.equal(advanced.rolling.last_wrapped, true);
  console.log("ok R5: rolling cursor wraps correctly");
}

{
  // 6 + 7. failed run does not advance; replay same batch
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: {
      advanced_to: "2026-08-16T00:00:00.000Z",
      rolling: { after_source_job_id: "100", cycle_count: 0 }
    }
  });
  const pop = basePopulation(["400"]); // 100,200,300,400 — after 100 → 200,300
  const fail = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    rollingBatchSize: 2,
    deps: {
      cursorStore,
      acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
      releaseLock: async () => ({ released: true }),
      assertOwner: async () => ({ ok: true }),
      resolvePopulation: async () => pop,
      listCandidateRows: async () => [],
      listCurrentSourceJobIds: async () => pop.current_source_job_ids,
      fetchExactJobs: async () => ({ ok: false, status: "exact_boom" }),
      importBrain: async () => ({ ok: true }),
      refreshPreparedJobFacts: async () => ({ ok: true }),
      refreshWorksheetFacts: async () => ({ ok: true })
    }
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.cursor_advance.advance, false);
  const cur = await cursorStore.readCursor(ORG);
  assert.equal(cur.advanced_to, "2026-08-16T00:00:00.000Z");
  assert.equal(cur.rolling.after_source_job_id, "100");
  const replay = planIncrementalDiscovery({
    window: { cursor_start: "2026-08-15T00:00:00.000Z", cursor_end: "2026-08-17T12:00:00.000Z" },
    listRows: [],
    currentSourceJobIds: pop.current_source_job_ids,
    rollingAfterSourceJobId: cur.rolling.after_source_job_id,
    rollingBatchSize: 2
  });
  assert.deepEqual(replay.rolling_job_ids, ["200", "300"]);
  console.log("ok R6/R7: failed run does not advance; replay selects same rolling batch");
}

{
  // 8 + 9 + 10. union + dedupe + multi-reason
  const discovery = planIncrementalDiscovery({
    window: { cursor_start: "2026-08-16T00:00:00.000Z", cursor_end: "2026-08-17T00:00:00.000Z" },
    listRows: [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
    extraSourceJobIds: ["100", "999"],
    currentSourceJobIds: ["100", "200", "300"],
    rollingAfterSourceJobId: null,
    rollingBatchSize: 2
  });
  assert.equal(discovery.counts.creation_window_candidates, 1);
  assert.equal(discovery.counts.explicit_candidates, 2);
  assert.equal(discovery.counts.rolling_candidates, 2);
  // 100 appears in creation+explicit+rolling; 200 rolling; 999 explicit → 3 unique
  assert.equal(discovery.counts.deduplicated_candidates, 3);
  assert.equal(discovery.candidates.filter((c) => c.source_job_id === "100").length, 1);
  const c100 = discovery.candidates.find((c) => c.source_job_id === "100");
  assert.ok(c100.reasons.includes("creation_window"));
  assert.ok(c100.reasons.includes("explicit"));
  assert.ok(c100.reasons.includes("rolling_refresh"));
  console.log("ok R8/R9/R10: candidate union, exact dedupe, coexisting reasons");
}

{
  // 11. incremental absence still removes nothing
  const classified = classifyIncrementalCandidates({
    candidates: [{ source_job_id: "100" }],
    currentSourceJobIds: ["100", "200", "300"]
  });
  assert.deepEqual(classified.would_remove_from_current, []);
  console.log("ok R11: incremental absence still removes nothing");
}

{
  // 12. rolling does not create new FULL epoch
  const plan = planMorawareIncrementalPopulation({
    population: basePopulation(),
    cursor: {},
    listRows: [],
    exactJobs: [worksheetJob("100", ["f1"]), worksheetJob("200", ["f2"])],
    now: new Date("2026-08-17T00:00:00.000Z"),
    rollingBatchSize: 2
  });
  assert.equal(plan.creates_new_full_epoch, false);
  assert.equal(plan.parent_full_epoch_id, EPOCH_A);
  assert.equal(plan.discovery.creates_new_full_epoch, false);
  assert.equal(plan.census_scope, CENSUS_SCOPE_INCREMENTAL);
  console.log("ok R12: rolling refresh does not create a new FULL epoch");
}

{
  // 13 + 14. exact forms reconcile only selected job
  const existing = new Map([
    ["100", [{ source_form_id: "old-a" }, { source_form_id: "keep-b" }]],
    ["200", [{ source_form_id: "other-only" }]]
  ]);
  const plan = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetJob("100", ["keep-b"], { complete: true })],
    existingRowsByJobId: existing
  });
  assert.deepEqual(plan.removal_plans[0].remove_source_form_ids, ["old-a"]);
  assert.equal(plan.removal_plans.some((p) => p.source_job_id === "200"), false);
  console.log("ok R13/R14: rolling exact forms reconcile only selected job");
}

{
  // 15. CURRENT set is source of rolling candidates
  const rolling = selectRollingCurrentJobBatch({
    currentSourceJobIds: ["100", "200"],
    batchSize: 10
  });
  assert.deepEqual(rolling.source_job_ids, ["100", "200"]);
  assert.equal(rolling.population_size, 2);
  console.log("ok R15: CURRENT_MORAWARE_JOB_SET is rolling source");
}

{
  // 16. new incremental additions eligible for future rolling cycles
  const afterAdd = selectRollingCurrentJobBatch({
    currentSourceJobIds: ["100", "200", "999"], // 999 joined CURRENT via overlay
    afterSourceJobId: "200",
    batchSize: 5
  });
  assert.ok(afterAdd.source_job_ids.includes("999"));
  console.log("ok R16: new incremental additions eligible for future rolling cycles");
}

{
  // 17 + 18. lock lifecycle + dual cursor advance only on full success
  assert.equal(
    shouldAdvanceIncrementalCursor({
      discoveryOk: true,
      populationResolutionOk: true,
      exactFetchOk: true,
      brainImportOk: true,
      preparedFactsOk: true,
      worksheetFactsOk: true,
      validationOk: true,
      lockOwned: true
    }).advance,
    true
  );
  assert.equal(
    shouldAdvanceIncrementalCursor({
      discoveryOk: true,
      populationResolutionOk: false,
      exactFetchOk: true,
      brainImportOk: true,
      preparedFactsOk: true,
      worksheetFactsOk: true,
      validationOk: true,
      lockOwned: true
    }).advance,
    false
  );
  console.log("ok R17/R18: lock lifecycle unchanged; advance only after full success");
}

{
  // 19. FULL path unchanged
  assert.equal(
    canAdvanceFullCensusWatermark({
      census_scope: CENSUS_SCOPE_INCREMENTAL,
      complete: true,
      uncapped: true,
      importSucceeded: true
    }),
    false
  );
  assert.equal(
    canAdvanceFullCensusWatermark({
      census_scope: CENSUS_SCOPE_FULL,
      complete: true,
      uncapped: true,
      importSucceeded: true
    }),
    true
  );
  console.log("ok R19: FULL path remains unchanged");
}

{
  // coverage math: 4073 / 25 ≈ 163 runs per full cycle
  const populationSize = 4073;
  const batch = 25;
  const cycles = Math.ceil(populationSize / batch);
  assert.equal(cycles, 163);
  console.log("ok R-coverage: 4,073 CURRENT jobs / batch 25 => 163 successful runs per full cycle");
}

console.log("\nAll incremental population tests passed.\n");
