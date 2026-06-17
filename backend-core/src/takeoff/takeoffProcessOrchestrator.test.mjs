/**
 * takeoffProcessOrchestrator.test.mjs — Phase E async processing skeleton tests.
 *
 * Run: npm run eos:test:takeoff-process-orchestrator
 */
import assert from "node:assert/strict";
import {
  readTakeoffAsyncConfig,
  buildProcessingStatus,
  startTakeoffProcessing,
  PROCESSING_PHASES,
} from "./takeoffProcessOrchestrator.mjs";

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FILE_ID = "a1111111-1111-4111-8111-111111111111";
const JOB_ID = "b2222222-2222-4222-8222-222222222222";
const OTHER_ORG = "f5555555-5555-4555-8555-555555555555";
const USER_ID = "d4444444-4444-4444-8444-444444444444";

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] == null) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function makeMockSupabase({ jobRow, resultInsertError = null } = {}) {
  const tableData = {
    quote_takeoff_jobs: jobRow ? [{ ...jobRow }] : [],
    quote_takeoff_results: [],
  };

  function makeBuilder(table, opType, opData) {
    const state = { eqFilters: [] };
    let wantsSelect = false;
    const builder = {
      select() {
        if (opType === "insert") wantsSelect = true;
        return builder;
      },
      eq(col, val) {
        state.eqFilters.push({ col, val: String(val) });
        return builder;
      },
      limit() {
        return builder;
      },
      then(resolve) {
        if (opType === "select") {
          let rows = (tableData[table] ?? []).filter((row) =>
            state.eqFilters.every(({ col, val }) => String(row[col] ?? "") === val)
          );
          return resolve({ data: rows, error: null });
        }
        if (opType === "insert") {
          if (resultInsertError) return resolve({ data: null, error: resultInsertError });
          const row = { id: "result-stub-1", ...opData };
          tableData.quote_takeoff_results.push(row);
          return resolve(wantsSelect ? { data: [row], error: null } : { error: null });
        }
        if (opType === "update") {
          const idx = tableData[table].findIndex((row) =>
            state.eqFilters.every(({ col, val }) => String(row[col] ?? "") === val)
          );
          if (idx >= 0) {
            tableData[table][idx] = { ...tableData[table][idx], ...opData };
          }
          return resolve({ error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  return {
    supabase: {
      from(table) {
        return {
          select: () => makeBuilder(table, "select"),
          insert: (data) => makeBuilder(table, "insert", data),
          update: (data) => makeBuilder(table, "update", data),
        };
      },
    },
    tableData,
  };
}

function makeJobRow(overrides = {}) {
  return {
    id: JOB_ID,
    organization_id: ORG_ID,
    quote_file_id: FILE_ID,
    status: "pending",
    review_status: "needs_review",
    metadata: {},
    error_message: null,
    started_at: null,
    ...overrides,
  };
}

// ── readTakeoffAsyncConfig ────────────────────────────────────────────────────

{
  withEnv({ TAKEOFF_ASYNC_STUB: null, TAKEOFF_ASYNC_WORKER_ENABLED: null, NODE_ENV: "production" }, () => {
    const cfg = readTakeoffAsyncConfig();
    assert.equal(cfg.stubEnabled, false);
    assert.equal(cfg.asyncStartAllowed, false);
  });
  console.log("ok: production without flags → async not allowed");
}

{
  withEnv({ TAKEOFF_ASYNC_STUB: "1", NODE_ENV: "production" }, () => {
    const cfg = readTakeoffAsyncConfig();
    assert.equal(cfg.stubEnabled, false, "stub disabled in production even with flag");
  });
  console.log("ok: stub blocked in production");
}

{
  withEnv({ TAKEOFF_ASYNC_STUB: "1", NODE_ENV: "development" }, () => {
    const cfg = readTakeoffAsyncConfig();
    assert.equal(cfg.stubEnabled, true);
    assert.equal(cfg.asyncStartAllowed, true);
  });
  console.log("ok: stub enabled in development");
}

{
  withEnv({ TAKEOFF_ASYNC_WORKER_ENABLED: "1", NODE_ENV: "production" }, () => {
    const cfg = readTakeoffAsyncConfig();
    assert.equal(cfg.workerEnabled, true);
    assert.equal(cfg.asyncStartAllowed, true);
  });
  console.log("ok: worker flag enables async in production");
}

// ── buildProcessingStatus ───────────────────────────────────────────────────

{
  const proc = buildProcessingStatus({
    status: "processing",
    metadata: {
      processing: {
        runId: "run-1",
        phase: PROCESSING_PHASES.DOWNLOAD,
        phaseLabel: "Preparing plan file",
        pageProgress: { current: 1, total: 6 },
      },
    },
  });
  assert.equal(proc.phase, PROCESSING_PHASES.DOWNLOAD);
  assert.equal(proc.pageProgress?.current, 1);
  assert.ok(!("storage_path" in proc));
  console.log("ok: buildProcessingStatus from metadata");
}

{
  const proc = buildProcessingStatus({
    status: "failed",
    error_message: "download failed",
    metadata: { processing: { error: "download failed" } },
  });
  assert.equal(proc.asyncStatus, "failed");
  assert.match(proc.error ?? "", /download failed/i);
  console.log("ok: buildProcessingStatus failed state");
}

// ── worker_not_configured ─────────────────────────────────────────────────────

{
  await assert.rejects(
    () =>
      startTakeoffProcessing({
        supabase: makeMockSupabase({ jobRow: makeJobRow() }).supabase,
        organizationId: ORG_ID,
        userId: USER_ID,
        takeoffJobId: JOB_ID,
        asyncConfig: { stubEnabled: false, workerEnabled: false, asyncStartAllowed: false },
      }),
    (err) => err.statusCode === 503 && err.code === "worker_not_configured"
  );
  console.log("ok: worker_not_configured when async not allowed");
}

// ── cross-org ─────────────────────────────────────────────────────────────────

{
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow({ organization_id: OTHER_ORG }),
  });
  await assert.rejects(
    () =>
      startTakeoffProcessing({
        supabase,
        organizationId: ORG_ID,
        userId: USER_ID,
        takeoffJobId: JOB_ID,
        asyncConfig: { stubEnabled: true, workerEnabled: false, asyncStartAllowed: true },
      }),
    /not found/i
  );
  console.log("ok: cross-org job not visible");
}

// ── already processing ────────────────────────────────────────────────────────

{
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow({
      status: "processing",
      metadata: {
        processing: { runId: "existing-run", phase: PROCESSING_PHASES.EXTRACTION },
      },
    }),
  });
  await assert.rejects(
    () =>
      startTakeoffProcessing({
        supabase,
        organizationId: ORG_ID,
        userId: USER_ID,
        takeoffJobId: JOB_ID,
        asyncConfig: { stubEnabled: true, workerEnabled: false, asyncStartAllowed: true },
      }),
    (err) => err.statusCode === 409 && err.code === "already_processing"
  );
  console.log("ok: already processing → 409");
}

// ── stub success ──────────────────────────────────────────────────────────────

{
  const { supabase, tableData } = makeMockSupabase({ jobRow: makeJobRow() });
  const result = await startTakeoffProcessing({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    asyncConfig: { stubEnabled: true, workerEnabled: false, asyncStartAllowed: true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.reviewStatus, "needs_review");
  assert.equal(tableData.quote_takeoff_jobs[0].status, "completed");
  assert.equal(tableData.quote_takeoff_results.length, 1);
  assert.equal(tableData.quote_takeoff_results[0].raw_ai_result_json._meta.stub, true);
  assert.ok(result.resultRowId);
  assert.ok(!("storagePath" in result));
  console.log("ok: stub pipeline completes with fixture result");
}

// ── worker queue only (no stub) ───────────────────────────────────────────────

{
  const { supabase, tableData } = makeMockSupabase({ jobRow: makeJobRow() });
  const result = await startTakeoffProcessing({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    asyncConfig: { stubEnabled: false, workerEnabled: true, asyncStartAllowed: true },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.status, "processing");
  assert.equal(result.mode, "worker");
  assert.equal(tableData.quote_takeoff_jobs[0].status, "processing");
  assert.equal(tableData.quote_takeoff_results.length, 0, "no result until worker runs");
  console.log("ok: worker mode queues without persisting result");
}

console.log("\ntakeoffProcessOrchestrator: all tests passed");
