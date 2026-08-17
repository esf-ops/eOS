/**
 * Timestamp semantics: frozen window time vs lifecycle wall-clock.
 * No live Moraware. No production Supabase writes.
 */
import assert from "node:assert/strict";
import {
  buildAdvancedCursorState,
  buildFailedCursorAttemptState,
  createMemoryIncrementalCursorStore,
  buildIncrementalDiscoveryWindow
} from "./morawareIncrementalCursor.mjs";
import { runMorawareIncrementalPopulation } from "./morawareIncrementalPopulation.mjs";
import { finalizeMorawareSyncRunFailure } from "./morawareIncrementalBrainImport.mjs";

const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const EPOCH_A = "c3a0e6e5-b5af-499c-87a8-73d720d485be";
const FULL_START = "2026-08-15T18:48:47.614Z";
const WINDOW_NOW = new Date("2026-08-17T17:32:23.459Z");
const FAILURE_AT = new Date("2026-08-17T17:36:05.000Z");
const SUCCESS_AT = new Date("2026-08-17T17:36:10.000Z");

console.log("\n=== incremental timestamp semantics ===\n");

{
  const window = buildIncrementalDiscoveryWindow({
    cursor: { advanced_to: null },
    now: WINDOW_NOW,
    parentFullEpochId: EPOCH_A,
    parentFullStartedAt: FULL_START
  });
  assert.equal(window.ok, true);
  assert.equal(window.cursor_end, WINDOW_NOW.toISOString());
  assert.equal(window.projected_advanced_to_after_success, WINDOW_NOW.toISOString());
  console.log("ok 1-3: frozen window now defines cursor_end + projected advanced_to");
}

{
  const prior = {
    advanced_to: null,
    rolling: { after_source_job_id: "100", cycle_count: 2 }
  };
  const failed = buildFailedCursorAttemptState({
    previousCursor: prior,
    failureReason: "brain_import_failed",
    attemptAt: FAILURE_AT
  });
  assert.equal(failed.last_failure_at, FAILURE_AT.toISOString());
  assert.equal(failed.last_attempt_at, FAILURE_AT.toISOString());
  assert.equal(failed.advanced_to, null);
  assert.equal(failed.rolling.after_source_job_id, "100");
  assert.equal(failed.rolling.cycle_count, 2);
  assert.ok(Date.parse(failed.last_failure_at) > Date.parse(WINDOW_NOW.toISOString()));
  console.log("ok 4-8 (unit): failure wall-clock ≠ window; cursors preserved");
}

{
  const window = {
    cursor_end: WINDOW_NOW.toISOString(),
    overlap_ms: 3600000,
    parent_full_epoch_id: EPOCH_A
  };
  const advanced = buildAdvancedCursorState({
    previousCursor: { advanced_to: null, rolling: { after_source_job_id: null, cycle_count: 0 } },
    window,
    parentFullEpochId: EPOCH_A,
    rollingBatch: {
      next_after_source_job_id: "37310",
      batch_size_selected: 25,
      start_source_job_id: "37286",
      end_source_job_id: "37310",
      wrapped: false
    },
    successAt: SUCCESS_AT,
    jobsRefreshed: 39
  });
  assert.equal(advanced.advanced_to, WINDOW_NOW.toISOString());
  assert.equal(advanced.last_success_at, SUCCESS_AT.toISOString());
  assert.equal(advanced.last_attempt_at, SUCCESS_AT.toISOString());
  assert.ok(Date.parse(advanced.last_success_at) > Date.parse(advanced.advanced_to));
  assert.equal(advanced.rolling.after_source_job_id, "37310");
  console.log("ok 9-11 (unit): advanced_to=window_end; last_success_at=completion wall-clock");
}

{
  const patches = [];
  const sb = {
    from(table) {
      assert.equal(table, "moraware_sync_runs");
      return {
        update(patch) {
          patches.push(patch);
          return {
            eq() {
              return { error: null };
            }
          };
        }
      };
    }
  };
  const started = "2026-08-17T17:36:04.718Z";
  const res = await finalizeMorawareSyncRunFailure(sb, {
    syncRunId: "sync-1",
    startedAt: started,
    errorMessage: "activity schema mismatch",
    clock: () => FAILURE_AT
  });
  assert.equal(res.ok, true);
  assert.equal(patches[0].status, "failed");
  assert.equal(patches[0].finished_at, FAILURE_AT.toISOString());
  assert.ok(Date.parse(patches[0].finished_at) >= Date.parse(started));
  assert.equal(patches[0].duration_ms, Date.parse(FAILURE_AT.toISOString()) - Date.parse(started));
  assert.ok(patches[0].duration_ms >= 0);
  // Never use window timestamp for duration
  assert.notEqual(patches[0].finished_at, WINDOW_NOW.toISOString());
  // Window-before-start would yield negative if misused — lifecycle clocks stay non-negative
  const negGuard = await finalizeMorawareSyncRunFailure(sb, {
    syncRunId: "sync-2",
    startedAt: started,
    errorMessage: "x",
    clock: () => WINDOW_NOW // earlier than started — clamp to 0, never negative
  });
  assert.equal(negGuard.ok, true);
  assert.equal(patches[1].duration_ms, 0);
  console.log("ok 12-14: sync_run finished_at/duration from actual lifecycle clocks");
}

function liveDeps({ cursorStore, failBrain = false }) {
  let released = false;
  return {
    cursorStore,
    released: () => released,
    resolvePopulation: async () => ({
      available: true,
      organization_id: ORG,
      full_census_import_group_id: EPOCH_A,
      full_census_started_at: FULL_START,
      current_source_job_ids: ["37286", "37287", "37288"]
    }),
    acquireLock: async () => ({ acquired: true, owner_token: "owner-ts", already_owned: false }),
    assertOwner: async () => ({ ok: true }),
    releaseLock: async () => {
      released = true;
      return { released: true };
    },
    listCandidateRows: async () => ({
      ok: true,
      status: "COMPLETE_LIST_DISCOVERY",
      rows: [{ source_job_id: "41456", creationDate: "2026-08-16T12:00:00.000Z" }],
      pagination_complete: true,
      pages_fetched: 1,
      rows_scanned: 1,
      termination_reason: "natural_page_end_all_processes"
    }),
    fetchExactJobs: async ({ sourceJobIds }) => ({
      ok: true,
      jobs: sourceJobIds.map((id) => ({
        source_job_id: id,
        name: `Job ${id}`,
        forms_authoritative_complete: true,
        raw_payload: { forms: [], activities: [] }
      })),
      failed: []
    }),
    importBrain: async ({ jobs } = {}) => {
      if (failBrain) {
        return {
          ok: false,
          status: "brain_import_failed",
          error: "activity schema",
          jobs_written: 0,
          creates_new_full_epoch: false,
          watermark_advanced: false
        };
      }
      const ids = (Array.isArray(jobs) ? jobs : [])
        .map((j) => String(j?.source_job_id || "").trim())
        .filter(Boolean);
      return {
        ok: true,
        status: "brain_incremental_upserted",
        jobs_written: ids.length,
        source_job_ids_written: ids,
        creates_new_full_epoch: false,
        watermark_advanced: false
      };
    },
    refreshPreparedJobFacts: async ({ jobs } = {}) => ({
      ok: true,
      jobs_refreshed: Array.isArray(jobs) ? jobs.length : 1
    }),
    refreshWorksheetFacts: async () => ({
      ok: true,
      upserted: 0,
      removed: 0,
      cross_job_removals: 0,
      jobs_with_mutations: 0
    })
  };
}

{
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: {
      advanced_to: null,
      rolling: { after_source_job_id: "200", cycle_count: 1 }
    }
  });
  const deps = liveDeps({ cursorStore, failBrain: true });
  const result = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    rollingBatchSize: 2,
    liveCandidateCeiling: 50,
    now: WINDOW_NOW,
    clock: () => FAILURE_AT,
    deps
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "brain_import_failed");
  assert.equal(result.window.cursor_end, WINDOW_NOW.toISOString());
  assert.equal(result.failure_at, FAILURE_AT.toISOString());
  assert.ok(Date.parse(result.failure_at) > Date.parse(result.window.cursor_end));

  const cursor = await cursorStore.readCursor(ORG);
  assert.equal(cursor.last_failure_at, FAILURE_AT.toISOString());
  assert.equal(cursor.last_attempt_at, FAILURE_AT.toISOString());
  assert.equal(cursor.advanced_to, null);
  assert.equal(cursor.rolling.after_source_job_id, "200");
  assert.equal(cursor.rolling.cycle_count, 1);
  assert.equal(deps.released(), true);
  console.log("ok 4-8/15-17: live failure uses wall-clock; cursors + lock unchanged");
}

{
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: {
      advanced_to: null,
      rolling: { after_source_job_id: null, cycle_count: 0 }
    }
  });
  const deps = liveDeps({ cursorStore, failBrain: false });
  const result = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    rollingBatchSize: 2,
    liveCandidateCeiling: 50,
    now: WINDOW_NOW,
    clock: () => SUCCESS_AT,
    deps
  });
  assert.equal(result.ok, true);
  const cursor = await cursorStore.readCursor(ORG);
  assert.equal(cursor.advanced_to, WINDOW_NOW.toISOString());
  assert.equal(cursor.last_success_at, SUCCESS_AT.toISOString());
  assert.ok(Date.parse(cursor.last_success_at) > Date.parse(cursor.advanced_to));
  assert.equal(cursor.last_failure_at, null);
  console.log("ok 9-11/15: success advanced_to=window; last_success_at=wall-clock");
}

{
  // Replay: same frozen window produces same coverage boundary after prior failure annotate
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: {
      advanced_to: null,
      rolling: { after_source_job_id: null, cycle_count: 0 },
      last_failure_at: FAILURE_AT.toISOString(),
      last_failure_reason: "brain_import_failed"
    }
  });
  const deps = liveDeps({ cursorStore, failBrain: false });
  const result = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    rollingBatchSize: 2,
    liveCandidateCeiling: 50,
    now: WINDOW_NOW,
    clock: () => SUCCESS_AT,
    deps
  });
  assert.equal(result.ok, true);
  const cursor = await cursorStore.readCursor(ORG);
  assert.equal(cursor.advanced_to, WINDOW_NOW.toISOString());
  console.log("ok 16: replay after failure annotation still advances from frozen window_end");
}

{
  const dry = await runMorawareIncrementalPopulation({
    dryRun: true,
    organizationId: ORG,
    now: WINDOW_NOW,
    clock: () => FAILURE_AT,
    deps: {
      cursorStore: createMemoryIncrementalCursorStore({}),
      resolvePopulation: async () => ({
        available: true,
        full_census_import_group_id: EPOCH_A,
        full_census_started_at: FULL_START,
        current_source_job_ids: []
      }),
      listCandidateRows: async () => [],
      acquireLock: async () => {
        throw new Error("dry-run must not acquire lock");
      }
    }
  });
  assert.equal(dry.dry_run, true);
  assert.equal(dry.actual_writes, 0);
  console.log("ok 18-19: dry-run mutation incapable; FULL watermark not involved");
}

{
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./morawareIncrementalPopulation.mjs", import.meta.url), "utf8")
  );
  assert.match(src, /attemptAt:\s*failureAt/);
  assert.match(src, /successAt,\s*$/m);
  assert.doesNotMatch(src, /attemptAt:\s*now\b/);
  assert.doesNotMatch(src, /successAt:\s*now\b/);
  assert.doesNotMatch(src, /moraware_writeback|quickbooks/i);
  console.log("ok 20: failure uses failureAt wall-clock; no writeback");
}

console.log("\nAll incremental timestamp semantics tests passed.\n");
