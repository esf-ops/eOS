/**
 * Fixes for first live incremental failure:
 * activity schema, sync-run finalization, partial reporting, replay.
 * No live Moraware. No production Supabase writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BRAIN_MORAWARE_JOB_ACTIVITY_WRITE_COLUMNS,
  buildIncrementalBrainActivityRows,
  finalizeMorawareSyncRunFailure,
  importIncrementalMorawareBrainJobs,
  sanitizeMorawareSyncRunErrorMessage
} from "./morawareIncrementalBrainImport.mjs";
import { summarizeImportGroupRows } from "./morawareSyncHealth.js";
import { runMorawareIncrementalPopulation } from "./morawareIncrementalPopulation.mjs";
import { createMemoryIncrementalCursorStore } from "./morawareIncrementalCursor.mjs";
import { createLiveReadDryRunDeps } from "./morawareIncrementalLiveReadDryRun.mjs";
import {
  acquireMorawarePopulationLock,
  createMorawarePopulationLockOwnerToken
} from "./morawarePopulationLock.mjs";

const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const EPOCH_A = "c3a0e6e5-b5af-499c-87a8-73d720d485be";
const FULL_START = "2026-08-15T18:48:47.614Z";

function createPartialBrainImportDb({ failActivities = true } = {}) {
  const locks = new Map();
  const syncRuns = new Map();
  const jobs = new Map();
  const activities = new Map();
  const audit = { syncUpdates: [], jobUpserts: 0, activityUpserts: 0 };

  function lockApi() {
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
    function matches(row) {
      for (const f of state.filters) {
        if (f.op === "eq" && String(row[f.col] ?? "") !== String(f.val ?? "")) return false;
        if (f.op === "lt" && String(row[f.col] ?? "") >= String(f.val ?? "")) return false;
      }
      return true;
    }
    function execute() {
      if (state.op === "insert") {
        const row = { ...state.payload };
        const name = String(row.lock_name ?? "");
        if (locks.has(name)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        locks.set(name, row);
        return { data: [row], error: null };
      }
      const matched = [...locks.values()].filter(matches);
      if (state.op === "select") return { data: matched, error: null };
      if (state.op === "update") {
        const updated = matched.map((row) => {
          const next = { ...row, ...state.payload };
          locks.set(String(next.lock_name), next);
          return next;
        });
        return { data: updated, error: null };
      }
      if (state.op === "delete") {
        const removed = [];
        for (const row of matched) {
          locks.delete(String(row.lock_name));
          removed.push(row);
        }
        return { data: removed, error: null };
      }
      return { data: null, error: null };
    }
    return api;
  }

  return {
    audit,
    from(table) {
      if (table === "eos_sync_locks") return lockApi();
      if (table === "moraware_sync_runs") {
        return {
          insert(row) {
            const id = row.id || `sync-${syncRuns.size + 1}`;
            const full = { ...row, id };
            syncRuns.set(id, full);
            return {
              select() {
                return {
                  limit() {
                    return { data: [{ id }], error: null };
                  }
                };
              }
            };
          },
          update(patch) {
            audit.syncUpdates.push(patch);
            return {
              eq(_col, id) {
                const prev = syncRuns.get(id) || { id };
                syncRuns.set(id, { ...prev, ...patch });
                if (Object.hasOwn(patch, "error_summary")) {
                  return { error: { message: "column moraware_sync_runs.error_summary does not exist" } };
                }
                return { error: null };
              }
            };
          }
        };
      }
      if (table === "brain_moraware_jobs") {
        return {
          upsert(rows) {
            audit.jobUpserts += rows.length;
            for (const r of rows) jobs.set(`${r.organization_id}:${r.source_job_id}`, r);
            return { error: null };
          }
        };
      }
      if (table === "brain_moraware_job_activities") {
        return {
          upsert(rows) {
            if (failActivities) {
              return {
                error: {
                  message:
                    "Could not find the 'activity_name' column of 'brain_moraware_job_activities' in the schema cache"
                }
              };
            }
            audit.activityUpserts += rows.length;
            for (const r of rows) activities.set(`${r.organization_id}:${r.source_activity_id}`, r);
            return { error: null };
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

console.log("\n=== incremental brain import / resolver fix suite ===\n");

{
  const jobs = [
    {
      source_job_id: "41456",
      activities: [
        {
          id: "act-1",
          name: "Template",
          activityType: "Fabrication",
          status: "Scheduled",
          phaseName: "Shop",
          startDate: "2026-08-16T10:00:00.000Z",
          schedTime: "10:00",
          duration: 60
        }
      ]
    }
  ];
  const rows = buildIncrementalBrainActivityRows(jobs, {
    organizationId: ORG,
    syncRunId: "run-1",
    seenAt: "2026-08-17T17:36:04.841Z"
  });
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.activity_type_name, "Fabrication");
  assert.equal(row.activity_status_name, "Scheduled");
  assert.equal(row.phase_name, "Shop");
  assert.equal(row.scheduled_date, "2026-08-16");
  assert.equal(row.scheduled_time, "10:00");
  assert.equal(row.duration_minutes, 60);
  assert.equal(Object.hasOwn(row, "activity_name"), false);
  assert.equal(Object.hasOwn(row, "activity_status"), false);
  assert.equal(Object.hasOwn(row, "start_date"), false);
  for (const key of Object.keys(row)) {
    assert.ok(BRAIN_MORAWARE_JOB_ACTIVITY_WRITE_COLUMNS.includes(key), `unexpected activity column: ${key}`);
  }
  console.log("ok 1-6: activity rows use production schema; activity_name/status never emitted");
}

{
  const jobs = [
    {
      source_job_id: "37286",
      raw_payload: {
        activities: [{ source_activity_id: "a1", activity_type_name: "Install", activity_status_name: "Done" }]
      }
    }
  ];
  const a = buildIncrementalBrainActivityRows(jobs, { organizationId: ORG, syncRunId: "r1" });
  const b = buildIncrementalBrainActivityRows(jobs, { organizationId: ORG, syncRunId: "r1" });
  assert.equal(a[0].source_activity_id, b[0].source_activity_id);
  assert.equal(a[0].activity_type_name, b[0].activity_type_name);
  console.log("ok 7: activity upsert identity is idempotent");
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
  const res = await finalizeMorawareSyncRunFailure(sb, {
    syncRunId: "0a4b1ab3-78a8-47de-8177-7c4d759dc2e7",
    startedAt: "2026-08-17T17:36:04.718Z",
    errorMessage: "Could not find the 'activity_name' column"
  });
  assert.equal(res.ok, true);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].status, "failed");
  assert.ok(patches[0].finished_at);
  assert.match(patches[0].error_message, /activity_name/);
  assert.equal(Object.hasOwn(patches[0], "error_summary"), false);
  assert.ok(Number.isFinite(patches[0].duration_ms));
  console.log("ok 8-12: failure finalization uses status/finished_at/error_message; never error_summary");
}

{
  const msg = sanitizeMorawareSyncRunErrorMessage(
    "boom Bearer SECRETTOKEN123 api_key=supersecret password:hunter2 eyJhbGciOiJIUzI1NiJ9.aaa.bbb"
  );
  assert.doesNotMatch(msg, /SECRETTOKEN123/);
  assert.doesNotMatch(msg, /supersecret/);
  assert.doesNotMatch(msg, /hunter2/);
  assert.match(msg, /\[redacted/);
  console.log("ok 11b: error_message sanitizes credentials");
}

{
  const db = createPartialBrainImportDb({ failActivities: true });
  const token = createMorawarePopulationLockOwnerToken();
  await acquireMorawarePopulationLock(db, { ownerToken: token, lockedBy: "test" });

  const jobs = Array.from({ length: 39 }, (_, i) => {
    const id = i < 25 ? String(37286 + i) : String(41456 + (i - 25));
    return {
      source_job_id: id,
      name: `Job ${id}`,
      activities: [{ id: `${id}-a0`, activityType: "Cut", status: "Open", startDate: "2026-08-16" }]
    };
  });

  const result = await importIncrementalMorawareBrainJobs(db, {
    organizationId: ORG,
    parentFullEpochId: EPOCH_A,
    jobs,
    ownerToken: token,
    liveWrite: true,
    allowLivePopulation: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "brain_import_failed");
  assert.equal(result.failed_stage, "brain_activities");
  assert.equal(result.jobs_attempted, 39);
  assert.equal(result.jobs_written, 39);
  assert.equal(result.activities_attempted, 39);
  assert.equal(result.activities_written, 0);
  assert.equal(db.audit.jobUpserts, 39);
  assert.equal(db.audit.activityUpserts, 0);
  assert.match(result.error, /activity_name/);
  assert.equal(result.sync_run_finalize?.ok, true);
  assert.equal(db.audit.syncUpdates.some((u) => Object.hasOwn(u, "error_summary")), false);
  assert.equal(db.audit.syncUpdates.at(-1)?.status, "failed");
  assert.ok(db.audit.syncUpdates.at(-1)?.error_message);
  assert.match(result.error, /activity_name/);
  assert.doesNotMatch(result.error, /finalize/i);
  console.log("ok 13/25: partial failure reporting preserves jobs_written=39; finalize does not mask pipeline error");
}

{
  const db = createPartialBrainImportDb({ failActivities: false });
  const token = createMorawarePopulationLockOwnerToken();
  await acquireMorawarePopulationLock(db, { ownerToken: token, lockedBy: "test" });
  const jobs = [
    { source_job_id: "41456", name: "New", activities: [{ id: "41456-a0", activityType: "Cut", status: "Open" }] },
    { source_job_id: "37286", name: "Rolling", activities: [{ id: "37286-a0", activityType: "Cut", status: "Open" }] }
  ];
  const first = await importIncrementalMorawareBrainJobs(db, {
    organizationId: ORG,
    parentFullEpochId: EPOCH_A,
    jobs,
    ownerToken: token,
    liveWrite: true,
    allowLivePopulation: true
  });
  assert.equal(first.ok, true);
  assert.equal(first.jobs_written, 2);
  assert.equal(first.activities_written, 2);
  const second = await importIncrementalMorawareBrainJobs(db, {
    organizationId: ORG,
    parentFullEpochId: EPOCH_A,
    jobs,
    ownerToken: token,
    liveWrite: true,
    allowLivePopulation: true
  });
  assert.equal(second.ok, true);
  assert.equal(second.jobs_written, 2);
  assert.equal(second.activities_written, 2);
  console.log("ok 27: retry of pre-written jobs/activities is idempotent");
}

{
  const fullChunks = Array.from({ length: 2 }, (_, i) => ({
    id: `f${i + 1}`,
    status: "success",
    started_at: `2026-08-15T18:4${i}:00.000Z`,
    finished_at: `2026-08-15T19:0${i}:00.000Z`,
    mode: "baseline_2026-real-snapshot",
    metadata: {
      import_group_id: EPOCH_A,
      census_scope: "full",
      chunk_index: i + 1,
      chunk_count: 2,
      uncapped: true
    }
  }));
  const stuck = {
    id: "0a4b1ab3-78a8-47de-8177-7c4d759dc2e7",
    status: "running",
    started_at: "2026-08-17T17:36:04.718Z",
    finished_at: null,
    mode: "incremental-worker-import",
    runner: "moraware-incremental",
    metadata: {
      import_group_id: EPOCH_A,
      census_scope: "incremental",
      parent_full_epoch_id: EPOCH_A
    }
  };
  const summary = summarizeImportGroupRows([...fullChunks, stuck], stuck);
  assert.equal(summary.complete, true);
  assert.equal(summary.incremental_overlay_runs, 1);
  assert.equal(summary.full_census_attempted_runs, 2);
  assert.match(String(summary.finished_at), /^2026-08-15/);
  console.log("ok 17/24: FULL health/group completeness excludes stuck incremental overlay");
}

{
  const cursorStore = createMemoryIncrementalCursorStore({
    [ORG]: {
      strategy: "creation_window_plus_rolling_exact_refresh",
      advanced_to: null,
      rolling: { after_source_job_id: null, cycle_count: 0 }
    }
  });
  let released = false;
  const result = await runMorawareIncrementalPopulation({
    dryRun: false,
    liveWrite: true,
    allowLivePopulation: true,
    organizationId: ORG,
    rollingBatchSize: 25,
    liveCandidateCeiling: 50,
    deps: {
      cursorStore,
      resolvePopulation: async () => ({
        available: true,
        organization_id: ORG,
        full_census_import_group_id: EPOCH_A,
        full_census_started_at: FULL_START,
        current_source_job_ids: ["37286", "37287"]
      }),
      acquireLock: async () => ({
        acquired: true,
        owner_token: "owner-test",
        already_owned: false
      }),
      assertOwner: async () => ({ ok: true }),
      releaseLock: async () => {
        released = true;
        return { released: true };
      },
      listCandidateRows: async () => ({
        ok: true,
        status: "COMPLETE_LIST_DISCOVERY",
        rows: [
          { source_job_id: "41456", creationDate: "2026-08-16T12:00:00.000Z" },
          { source_job_id: "41457", creationDate: "2026-08-16T13:00:00.000Z" }
        ],
        pagination_complete: true,
        pages_fetched: 1,
        rows_scanned: 2,
        termination_reason: "natural_page_end_all_processes"
      }),
      fetchExactJobs: async ({ sourceJobIds }) => ({
        ok: true,
        jobs: sourceJobIds.map((id) => ({
          source_job_id: id,
          name: `Job ${id}`,
          forms_authoritative_complete: true,
          raw_payload: { forms: [], activities: [{ id: `${id}-a`, activityType: "Cut", status: "Open" }] }
        })),
        failed: []
      }),
      importBrain: async () => ({
        ok: false,
        status: "brain_import_failed",
        error: "activity schema",
        failed_stage: "brain_activities",
        jobs_attempted: 39,
        jobs_written: 39,
        activities_attempted: 39,
        activities_written: 0,
        creates_new_full_epoch: false,
        watermark_advanced: false
      }),
      refreshPreparedJobFacts: async () => {
        throw new Error("prepared must not run after brain failure");
      },
      refreshWorksheetFacts: async () => {
        throw new Error("worksheet must not run after brain failure");
      }
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "brain_import_failed");
  assert.equal(result.cursor_advance?.advance, false);
  const cursor = await cursorStore.readCursor(ORG);
  assert.equal(cursor.advanced_to, null);
  assert.equal(cursor.rolling.after_source_job_id, null);
  assert.equal(released, true);
  assert.equal(result.stages.preparedFactsOk, false);
  assert.equal(result.stages.worksheetFactsOk, false);
  console.log("ok 26/28-31: activity failure leaves cursors unchanged; lock released; prepared/worksheet/cursor last");
}

{
  const dry = createLiveReadDryRunDeps({});
  await assert.rejects(() => dry.importBrain({ jobs: [] }), /importBrain|refused|mutation/i);
  console.log("ok 32: dry-run path remains mutation-incapable at Brain import boundary");
}

{
  const src = readFileSync(new URL("./morawareIncrementalBrainImport.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /error_summary\s*:/);
  assert.doesNotMatch(src, /^\s*activity_name\s*:/m);
  assert.doesNotMatch(src, /^\s*activity_status\s*:/m);
  assert.doesNotMatch(src, /quickbooks/i);
  assert.doesNotMatch(src, /account_directory/i);
  console.log("ok 33-35: no error_summary write key / bad activity columns / QB / AD in brain import");
}

console.log("\nAll incremental brain import fix tests passed.\n");
