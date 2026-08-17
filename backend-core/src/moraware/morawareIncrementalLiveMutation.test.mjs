/**
 * Governed production mutation path tests for Moraware incremental.
 * No live Moraware. No production Supabase writes.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  evaluateMorawareIncrementalLiveGates,
  MORAWARE_INCREMENTAL_EXECUTE_PHRASE
} from "./morawareIncrementalLiveGates.mjs";
import {
  buildIncrementalBrainJobRows,
  importIncrementalMorawareBrainJobs
} from "./morawareIncrementalBrainImport.mjs";
import {
  runMorawareIncrementalPopulation,
  normalizeIncrementalListDiscoveryResult,
  resolveLiveIncrementalCandidateCeiling,
  validateIncrementalLiveWriteResult,
  MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING_DEFAULT,
  CENSUS_SCOPE_INCREMENTAL,
  CENSUS_SCOPE_FULL
} from "./morawareIncrementalPopulation.mjs";
import { createMemoryIncrementalCursorStore } from "./morawareIncrementalCursor.mjs";
import { planIncrementalWorksheetFactRefresh } from "./morawareJobWorksheetPreparedFacts.mjs";
import { describeMorawareIncrementalStrategy } from "./morawareIncrementalStrategy.mjs";
import { canAdvanceFullCensusWatermark, jobInCurrentMorawareSet } from "./morawareCurrentPopulation.mjs";
import { createLiveReadDryRunDeps } from "./morawareIncrementalLiveReadDryRun.mjs";

const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const EPOCH_A = "c3a0e6e5-b5af-499c-87a8-73d720d485be";
const FULL_START = "2026-08-15T18:48:47.614Z";
const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE_SCRIPT = join(HERE, "../scripts/moraware/incrementalLive.mjs");

function basePopulation(extra = {}) {
  return {
    available: true,
    organization_id: ORG,
    full_census_import_group_id: EPOCH_A,
    full_census_started_at: FULL_START,
    current_source_job_ids: ["100", "200", "300"],
    ...extra
  };
}

function worksheetJob(sourceJobId, formIds, { complete = true } = {}) {
  return {
    source_job_id: String(sourceJobId),
    source_account_id: "acc-1",
    account_name: "Acme",
    name: `Job ${sourceJobId}`,
    status_name: "Active",
    salesperson_name: "Rep",
    created_at_source: "2026-08-16T12:00:00.000Z",
    forms_authoritative_complete: complete,
    raw_payload: {
      forms_authoritative_complete: complete,
      forms: formIds.map((id) => ({
        id,
        formTemplateName: "Job Worksheet",
        fields: [
          { label: "Color", value: "Gray" },
          { label: "Sq.Ft.", value: "12" }
        ]
      })),
      activities: [{ id: `${sourceJobId}-a0`, activityIndex: 0, startDate: "2026-08-16" }]
    }
  };
}

function successDeps(overrides = {}) {
  const events = [];
  let lockHeld = false;
  let released = false;
  const cursorStore =
    overrides.cursorStore ||
    createMemoryIncrementalCursorStore({
      [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z", parent_full_epoch_id: EPOCH_A }
    });
  const deps = {
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
    assertOwner: async () => {
      events.push("assert");
      return { ok: true };
    },
    startHeartbeat: () => {
      events.push("heartbeat_start");
      return () => {
        events.push("heartbeat_stop");
      };
    },
    resolvePopulation: async () => basePopulation(),
    listCandidateRows: async () => {
      events.push("discover");
      assert.equal(lockHeld, true);
      return [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }];
    },
    listCurrentSourceJobIds: async () => ["100", "200", "300"],
    fetchExactJobs: async ({ sourceJobIds }) => {
      events.push("exact");
      return {
        ok: true,
        jobs: (sourceJobIds || ["100"]).map((id) => worksheetJob(id, [`f-${id}`])),
        failures: []
      };
    },
    importBrain: async ({ censusScope, parentFullEpochId, jobs }) => {
      events.push("brain");
      assert.equal(censusScope, CENSUS_SCOPE_INCREMENTAL);
      assert.equal(parentFullEpochId, EPOCH_A);
      return {
        ok: true,
        jobs_written: jobs.length,
        source_job_ids_written: jobs.map((j) => String(j.source_job_id)),
        creates_new_full_epoch: false,
        watermark_advanced: false
      };
    },
    refreshPreparedJobFacts: async ({ importGroupId, jobs }) => {
      events.push("prepared");
      assert.equal(importGroupId, EPOCH_A);
      return {
        ok: true,
        facts_upserted: jobs.length,
        source_job_ids: jobs.map((j) => String(j.source_job_id)),
        account_rollups: "deferred_remaining_optimization"
      };
    },
    refreshWorksheetFacts: async ({ importGroupId }) => {
      events.push("worksheet");
      assert.equal(importGroupId, EPOCH_A);
      return { ok: true, writes: { upserts: 1, deletes: 0 }, cross_job_removals: [] };
    },
    ...overrides.deps
  };
  return { events, get lockHeld() { return lockHeld; }, get released() { return released; }, cursorStore, deps };
}

console.log("\n=== incremental live mutation path ===\n");

// 1–3. all four gates; missing any prevents contact/mutation
{
  const all = evaluateMorawareIncrementalLiveGates({
    argv: ["--live", "--allow-live-incremental"],
    env: {
      MORAWARE_INCREMENTAL_LIVE: "1",
      MORAWARE_INCREMENTAL_EXECUTE: MORAWARE_INCREMENTAL_EXECUTE_PHRASE
    }
  });
  assert.equal(all.ok, true);

  for (const missing of [
    { argv: ["--allow-live-incremental"], env: { MORAWARE_INCREMENTAL_LIVE: "1", MORAWARE_INCREMENTAL_EXECUTE: MORAWARE_INCREMENTAL_EXECUTE_PHRASE } },
    { argv: ["--live"], env: { MORAWARE_INCREMENTAL_LIVE: "1", MORAWARE_INCREMENTAL_EXECUTE: MORAWARE_INCREMENTAL_EXECUTE_PHRASE } },
    { argv: ["--live", "--allow-live-incremental"], env: { MORAWARE_INCREMENTAL_EXECUTE: MORAWARE_INCREMENTAL_EXECUTE_PHRASE } },
    { argv: ["--live", "--allow-live-incremental"], env: { MORAWARE_INCREMENTAL_LIVE: "1" } }
  ]) {
    const g = evaluateMorawareIncrementalLiveGates(missing);
    assert.equal(g.ok, false);
    assert.equal(g.status, "live_incremental_gates_refused");
  }

  const refused = spawnSync(process.execPath, [LIVE_SCRIPT], {
    env: { ...process.env, MORAWARE_INCREMENTAL_LIVE: "", MORAWARE_INCREMENTAL_EXECUTE: "" },
    encoding: "utf8"
  });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr + refused.stdout, /REFUSED|live_incremental_gates_refused/);
  assert.equal((refused.stderr + refused.stdout).includes("Login Success"), false);
  console.log("ok 1-3: all four gates required; missing gate refuses before Moraware/Supabase");
}

// 4–6. lock before discovery; assert before brain; heartbeat
{
  const ctx = successDeps();
  const res = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: ctx.deps
  });
  assert.equal(res.ok, true);
  assert.ok(ctx.events.indexOf("acquire") < ctx.events.indexOf("discover"));
  assert.ok(ctx.events.indexOf("assert") < ctx.events.indexOf("brain"));
  assert.ok(ctx.events.includes("heartbeat_start"));
  assert.ok(ctx.events.includes("heartbeat_stop"));
  assert.ok(res.event_log.some((e) => e.step === "assert_owner_before_brain"));
  console.log("ok 4-6: lock before discovery; assert before Brain; heartbeat renews");
}

// 7–8. complete discovery required; incomplete ⇒ zero writes
{
  let brain = 0;
  let exact = 0;
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z" }
  });
  const res = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: {
      cursorStore,
      acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
      releaseLock: async () => ({ released: true }),
      assertOwner: async () => ({ ok: true }),
      resolvePopulation: async () => basePopulation(),
      listCandidateRows: async () => ({
        ok: false,
        status: "CREATION_DISCOVERY_INCOMPLETE",
        pagination_complete: false,
        list_rows: []
      }),
      fetchExactJobs: async () => {
        exact += 1;
        return { ok: true, jobs: [] };
      },
      importBrain: async () => {
        brain += 1;
        return { ok: true };
      },
      refreshPreparedJobFacts: async () => ({ ok: true }),
      refreshWorksheetFacts: async () => ({ ok: true })
    }
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, "CREATION_DISCOVERY_INCOMPLETE");
  assert.equal(exact, 0);
  assert.equal(brain, 0);
  assert.equal((await cursorStore.readCursor(ORG)).advanced_to, "2026-08-16T00:00:00.000Z");
  console.log("ok 7-8: incomplete discovery causes zero writes / no cursor advance");
}

// 9. candidate safety ceiling stops before writes
{
  let exact = 0;
  let brain = 0;
  const ids = Array.from({ length: 20 }, (_, i) => String(1000 + i));
  const res = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    liveCandidateCeiling: 10,
    rollingBatchSize: 20,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: {
      cursorStore: createMemoryIncrementalCursorStore({ [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z" } }),
      acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
      releaseLock: async () => ({ released: true }),
      assertOwner: async () => ({ ok: true }),
      resolvePopulation: async () => basePopulation({ current_source_job_ids: ids }),
      listCandidateRows: async () => [],
      fetchExactJobs: async () => {
        exact += 1;
        return { ok: true, jobs: [] };
      },
      importBrain: async () => {
        brain += 1;
        return { ok: true };
      },
      refreshPreparedJobFacts: async () => ({ ok: true }),
      refreshWorksheetFacts: async () => ({ ok: true })
    }
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, "LIVE_CANDIDATE_CEILING_EXCEEDED");
  assert.equal(exact, 0);
  assert.equal(brain, 0);
  assert.equal(resolveLiveIncrementalCandidateCeiling(undefined), MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING_DEFAULT);
  console.log("ok 9: live candidate ceiling stops before exact/writes");
}

// 10–14. Brain only candidates; unrelated untouched; new job CURRENT; refresh; absence removes nothing
{
  const newJob = worksheetJob("41456", ["nf"]);
  const existing = worksheetJob("100", ["f1"]);
  let brainJobs = null;
  const res = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: {
      cursorStore: createMemoryIncrementalCursorStore({ [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z" } }),
      acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
      releaseLock: async () => ({ released: true }),
      assertOwner: async () => ({ ok: true }),
      resolvePopulation: async () => basePopulation({ current_source_job_ids: ["100", "200", "300"] }),
      listCandidateRows: async () => [
        { id: "41456", creationDate: "2026-08-16T12:00:00.000Z" },
        { id: "100", creationDate: "2026-08-16T12:00:00.000Z" }
      ],
      fetchExactJobs: async ({ sourceJobIds }) => ({
        ok: true,
        jobs: sourceJobIds.map((id) =>
          id === "41456" ? newJob : worksheetJob(id, [`f-${id}`])
        ),
        failures: []
      }),
      importBrain: async ({ jobs }) => {
        brainJobs = jobs.map((j) => j.source_job_id);
        return {
          ok: true,
          jobs_written: jobs.length,
          source_job_ids_written: jobs.map((j) => j.source_job_id),
          creates_new_full_epoch: false,
          watermark_advanced: false,
          unrelated_jobs_touched: 0,
          jobs_removed_from_current: 0
        };
      },
      refreshPreparedJobFacts: async ({ jobs }) => ({
        ok: true,
        facts_upserted: jobs.length,
        source_job_ids: jobs.map((j) => j.source_job_id),
        account_rollups: "deferred_remaining_optimization"
      }),
      refreshWorksheetFacts: async () => ({ ok: true, writes: { upserts: 2, deletes: 0 } })
    }
  });
  assert.equal(res.ok, true);
  assert.ok(brainJobs.includes("41456"));
  assert.ok(brainJobs.includes("100"));
  assert.equal(brainJobs.includes("999"), false);
  assert.equal(res.metadata.absence_establishes_global_absence, false);
  assert.equal(res.creates_new_full_epoch, false);
  const stamped = buildIncrementalBrainJobRows([newJob], {
    organizationId: ORG,
    syncRunId: "run-1",
    seenAt: "2026-08-17T12:00:00.000Z"
  })[0];
  assert.equal(jobInCurrentMorawareSet(stamped, basePopulation()), true);
  assert.equal("first_seen_at" in stamped, false);
  console.log("ok 10-14: Brain candidates only; new job CURRENT-eligible; absence deletes nothing");
}

// 15–20. prepared/worksheet scope; complete reconcile; incomplete no delete; cross-job fail closed
{
  const planComplete = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetJob("100", ["keep", "new"], { complete: true })],
    existingRowsByJobId: new Map([
      ["100", [{ source_form_id: "keep" }, { source_form_id: "gone" }]],
      ["200", [{ source_form_id: "other-job-form" }]]
    ])
  });
  assert.equal(planComplete.import_group_id, EPOCH_A);
  const removals = planComplete.removal_plans.flatMap((p) =>
    (p.remove_source_form_ids || []).map((fid) => ({ source_job_id: p.source_job_id, source_form_id: fid }))
  );
  assert.ok(removals.some((r) => r.source_form_id === "gone" && r.source_job_id === "100"));
  assert.equal(removals.some((r) => r.source_job_id === "200"), false);

  const planIncomplete = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetJob("100", ["keep"], { complete: false })],
    existingRowsByJobId: new Map([["100", [{ source_form_id: "gone" }]]])
  });
  assert.equal(planIncomplete.jobs_skipped_incomplete_forms.includes("100"), true);
  assert.equal(
    planIncomplete.removal_plans.every((p) => !(p.remove_source_form_ids || []).length),
    true
  );

  const crossFail = await validateIncrementalLiveWriteResult({
    population: basePopulation(),
    parentFullEpochId: EPOCH_A,
    discovery: { candidates: [{ source_job_id: "100" }] },
    exactJobs: { jobs: [worksheetJob("100", ["f1"])], failures: [] },
    brain: { ok: true, jobs_written: 1, source_job_ids_written: ["100"], creates_new_full_epoch: false },
    prepared: { ok: true },
    worksheet: { ok: true, cross_job_removals: [{ source_job_id: "200" }] },
    ownerToken: "t",
    assertOwner: async () => ({ ok: true })
  });
  assert.equal(crossFail.ok, false);
  assert.equal(crossFail.status, "cross_job_worksheet_deletion");
  console.log("ok 15-20: prepared/worksheet scope; reconcile exact-job only; cross-job fails closed");
}

// 21–25. stage / validation / lock failures leave cursor unchanged
{
  async function failAt(step) {
    const cursorStore = createMemoryIncrementalCursorStore({
      [ORG]: {
        advanced_to: "2026-08-16T00:00:00.000Z",
        rolling: { after_source_job_id: "50", cycle_count: 2 }
      }
    });
    const res = await runMorawareIncrementalPopulation({
      dryRun: false,
      liveWrite: true,
      allowLivePopulation: true,
      organizationId: ORG,
      now: new Date("2026-08-17T12:00:00.000Z"),
      deps: {
        cursorStore,
        acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
        releaseLock: async () => ({ released: true }),
        assertOwner: async () =>
          step === "lock" ? { ok: false, code: "population_lock_lost" } : { ok: true },
        resolvePopulation: async () => basePopulation(),
        listCandidateRows: async () => [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
        fetchExactJobs: async () =>
          step === "exact"
            ? { ok: false, status: "exact_boom" }
            : { ok: true, jobs: [worksheetJob("100", ["f1"])], failures: [] },
        importBrain: async () =>
          step === "brain"
            ? { ok: false, status: "brain_boom" }
            : {
                ok: true,
                jobs_written: 1,
                source_job_ids_written: ["100"],
                creates_new_full_epoch: false,
                watermark_advanced: false
              },
        refreshPreparedJobFacts: async () =>
          step === "prepared" ? { ok: false, status: "prepared_boom" } : { ok: true, facts_upserted: 1 },
        refreshWorksheetFacts: async () =>
          step === "worksheet"
            ? { ok: false, status: "worksheet_boom" }
            : { ok: true, writes: { upserts: 1, deletes: 0 } },
        validate: async () =>
          step === "validation" ? { ok: false, status: "validation_boom" } : { ok: true, status: "validated" }
      }
    });
    const cur = await cursorStore.readCursor(ORG);
    assert.equal(cur.advanced_to, "2026-08-16T00:00:00.000Z");
    assert.equal(cur.rolling.after_source_job_id, "50");
    assert.equal(cur.rolling.cycle_count, 2);
    assert.equal(res.cursor_advance.advance, false);
    return res;
  }
  assert.equal((await failAt("brain")).status, "brain_boom");
  assert.equal((await failAt("prepared")).status, "prepared_boom");
  assert.equal((await failAt("worksheet")).status, "worksheet_boom");
  assert.equal((await failAt("validation")).status, "validation_boom");
  assert.equal((await failAt("lock")).status, "population_lock_lost");
  console.log("ok 21-25: Brain/prepared/worksheet/validation/lock failures leave cursor unchanged");
}

// 26–27. cursor advances only after total success (creation + rolling together)
{
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: {
      advanced_to: "2026-08-16T00:00:00.000Z",
      rolling: { after_source_job_id: null, cycle_count: 0 }
    }
  });
  const res = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    rollingBatchSize: 2,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: {
      cursorStore,
      acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
      releaseLock: async () => ({ released: true }),
      assertOwner: async () => ({ ok: true }),
      resolvePopulation: async () =>
        basePopulation({ current_source_job_ids: ["37286", "37287", "37288"] }),
      listCandidateRows: async () => [{ id: "41456", creationDate: "2026-08-16T12:00:00.000Z" }],
      fetchExactJobs: async ({ sourceJobIds }) => ({
        ok: true,
        jobs: sourceJobIds.map((id) => worksheetJob(id, [`f-${id}`])),
        failures: []
      }),
      importBrain: async ({ jobs }) => ({
        ok: true,
        jobs_written: jobs.length,
        source_job_ids_written: jobs.map((j) => j.source_job_id),
        creates_new_full_epoch: false,
        watermark_advanced: false
      }),
      refreshPreparedJobFacts: async ({ jobs }) => ({
        ok: true,
        facts_upserted: jobs.length,
        account_rollups: "deferred_remaining_optimization"
      }),
      refreshWorksheetFacts: async () => ({ ok: true, writes: { upserts: 3, deletes: 0 } })
    }
  });
  assert.equal(res.ok, true);
  assert.equal(res.cursor_advance.advance, true);
  const cur = await cursorStore.readCursor(ORG);
  assert.equal(cur.advanced_to, "2026-08-17T12:00:00.000Z");
  assert.equal(cur.rolling.after_source_job_id, "37287");
  console.log("ok 26-27: creation + rolling cursors advance together after total success");
}

// 28. replay after partial prior write is idempotent (brain upsert keys)
{
  const rows1 = buildIncrementalBrainJobRows([worksheetJob("100", ["f1"])], {
    organizationId: ORG,
    syncRunId: "r1",
    seenAt: "2026-08-17T12:00:00.000Z"
  });
  const rows2 = buildIncrementalBrainJobRows([worksheetJob("100", ["f1", "f2"])], {
    organizationId: ORG,
    syncRunId: "r2",
    seenAt: "2026-08-17T13:00:00.000Z"
  });
  assert.equal(rows1[0].source_job_id, rows2[0].source_job_id);
  assert.equal(rows1[0].organization_id, rows2[0].organization_id);
  const ws = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetJob("100", ["f1", "f2"])],
    existingRowsByJobId: new Map([["100", [{ source_form_id: "f1" }]]])
  });
  const keys = new Set(ws.upsert_rows.map((r) => `${r.organization_id}|${r.import_group_id}|${r.source_job_id}|${r.source_form_id}`));
  assert.equal(keys.size, ws.upsert_rows.length);
  console.log("ok 28: replay upsert keys remain unique / idempotent");
}

// 29–31. FULL epoch unchanged; watermark not advanced; rollups deferred
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
  assert.notEqual(CENSUS_SCOPE_INCREMENTAL, CENSUS_SCOPE_FULL);
  const strategy = describeMorawareIncrementalStrategy();
  assert.equal(strategy.api_capability.view222_identity_authority, false);
  assert.equal(strategy.api_capability.fuzzy_identity_matching, false);
  assert.equal(strategy.api_capability.moraware_writeback, false);
  assert.equal(strategy.api_capability.quickbooks_writes, false);
  assert.equal(strategy.api_capability.account_directory_writes, false);
  console.log("ok 29-36: FULL/watermark/rollups deferred; no View222/fuzzy/writeback/QB/AD");
}

// 37–38. lock released in finally on success and failure
{
  const okCtx = successDeps();
  await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: okCtx.deps
  });
  assert.equal(okCtx.released, true);

  let releasedFail = false;
  await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    now: new Date("2026-08-17T12:00:00.000Z"),
    deps: {
      cursorStore: createMemoryIncrementalCursorStore({ [ORG]: { advanced_to: "2026-08-16T00:00:00.000Z" } }),
      acquireLock: async ({ token }) => ({ acquired: true, owner_token: token }),
      releaseLock: async () => {
        releasedFail = true;
        return { released: true };
      },
      assertOwner: async () => ({ ok: true }),
      resolvePopulation: async () => basePopulation(),
      listCandidateRows: async () => [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }],
      fetchExactJobs: async () => ({ ok: false, status: "exact_boom" }),
      importBrain: async () => ({ ok: true }),
      refreshPreparedJobFacts: async () => ({ ok: true }),
      refreshWorksheetFacts: async () => ({ ok: true })
    }
  });
  assert.equal(releasedFail, true);
  console.log("ok 37-38: lock released in finally on success and failure");
}

// 39. dry-run remains mutation incapable
{
  const deps = createLiveReadDryRunDeps({
    listCandidateRows: async () => [],
    fetchExactJobs: async () => ({ ok: true, jobs: [] }),
    resolvePopulation: async () => ({ available: true }),
    readCursor: async () => ({})
  });
  await assert.rejects(() => deps.importBrain({}), /DRY_RUN_MUTATION_REFUSED/);
  await assert.rejects(() => deps.acquireLock({}), /DRY_RUN_MUTATION_REFUSED/);
  console.log("ok 39: dry-run remains mutation incapable");
}

// list helper: sample incomplete normalization
{
  const incomplete = normalizeIncrementalListDiscoveryResult({
    ok: false,
    status: "CREATION_DISCOVERY_INCOMPLETE",
    pagination_complete: false
  });
  assert.equal(incomplete.ok, false);
  const completeArr = normalizeIncrementalListDiscoveryResult([{ id: "1" }]);
  assert.equal(completeArr.ok, true);
  console.log("ok: list discovery normalization fail-closed");
}

// Brain import refuses without live gates / lock (no network)
{
  const refused = await importIncrementalMorawareBrainJobs(
    {},
    {
      organizationId: ORG,
      parentFullEpochId: EPOCH_A,
      jobs: [worksheetJob("1", ["f"])],
      liveWrite: false,
      allowLivePopulation: false,
      ownerToken: "x"
    }
  );
  assert.equal(refused.status, "live_population_not_enabled");
  console.log("ok: Brain incremental import refuses without live gates");
}

console.log("\nmorawareIncrementalLiveMutation.test.mjs — all passed\n");
