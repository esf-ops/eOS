/**
 * takeoffWorkspaceService — unit tests (v4.5).
 *
 * All tests use mock Supabase clients. No real DB/storage calls.
 *
 * Covers:
 *   - Validation: org UUID, file UUID, takeoffResult shape
 *   - createTakeoffWorkspace: inserts quote_takeoff_jobs row (quote_id null),
 *       updates quote_files.takeoff_job_id, logs linked_to_takeoff event,
 *       idempotent on re-call, cross-org file rejected (403)
 *   - getTakeoffWorkspace: loads from quote_takeoff_jobs, cross-org returns 404,
 *       legacy v4 fallback, workspace-not-found
 *   - saveTakeoffResult: inserts quote_takeoff_results row, server recompute verified,
 *       updates quote_takeoff_jobs, job-not-found → 404, cross-org → 404
 *   - getLatestTakeoffResult: reads from quote_takeoff_results, falls back to
 *       job.result_summary, legacy v4 fallback, cross-org → 404, no result → 404
 *   - No quote mutation in any path
 *   - storage_path never returned
 *
 * Run: npm run eos:test:takeoff-workspace-service
 */
import assert from "node:assert/strict";
import {
  isUuid,
  workspaceError,
  createTakeoffWorkspace,
  getTakeoffWorkspace,
  saveTakeoffResult,
  getLatestTakeoffResult,
  listTakeoffResults,
  getResultById,
} from "./takeoffWorkspaceService.mjs";
import { buildSpec73Fixture } from "./fixtures/spec73.fixture.mjs";

// ── Test IDs ──────────────────────────────────────────────────────────────────

const ORG_ID     = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FILE_ID    = "a1111111-1111-4111-8111-111111111111";
const JOB_ID     = "b2222222-2222-4222-8222-222222222222";
const RESULT_ID  = "c3333333-3333-4333-8333-333333333333";
const USER_ID    = "d4444444-4444-4444-8444-444444444444";
const OTHER_ORG  = "f5555555-5555-4555-8555-555555555555";

// ── Mock Supabase factory ─────────────────────────────────────────────────────

function makeFileRow(overrides = {}) {
  return {
    id: FILE_ID,
    organization_id: ORG_ID,
    status: "active",
    original_filename: "kitchen_plan.pdf",
    file_role: "cabinet_plan",
    visibility: "internal",
    mime_type: "application/pdf",
    file_size_bytes: 204800,
    created_at: "2026-06-01T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

function makeJobRow(overrides = {}) {
  return {
    id: JOB_ID,
    organization_id: ORG_ID,
    quote_id: null,
    quote_file_id: FILE_ID,
    status: "pending",
    review_status: "needs_review",
    source_type: "ai_takeoff_lab",
    created_by_user_id: USER_ID,
    metadata: { source: "ai_takeoff_lab", schemaVersion: "1.0" },
    result_summary: {},
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeResultRow(overrides = {}) {
  const fixture = buildSpec73Fixture();
  return {
    id: RESULT_ID,
    organization_id: ORG_ID,
    takeoff_job_id: JOB_ID,
    schema_version: "1.0",
    normalized_takeoff_json: fixture,
    computed_measurements_json: { countertopExactSf: 59.96, backsplashExactSf: 6.61 },
    validation_diagnostics_json: { errorCount: 0, warningCount: 0 },
    import_plan_json: { canImport: true, items: [] },
    review_status: "needs_review",
    created_at: "2026-06-01T01:00:00.000Z",
    ...overrides,
  };
}

/**
 * Build a mock Supabase client that simulates the tables used by takeoffWorkspaceService.
 *
 * Supports: select (with eq/order/limit), insert (with auto-ID + .select()), update.
 * Does NOT enforce DB constraints (NOT NULL, FK, CHECK) — those are tested in integration.
 */
function makeMockSupabase({
  fileRow   = null,
  jobRow    = null,
  resultRows = [],
  jobInsertId    = JOB_ID,
  resultInsertId = RESULT_ID,
  insertError = null,
  updateError = null,
  capturedInserts = [],
  capturedUpdates = [],
} = {}) {
  const tableData = {
    quote_files:          fileRow  ? [fileRow]  : [],
    quote_takeoff_jobs:   jobRow   ? [jobRow]   : [],
    quote_takeoff_results: [...resultRows],
    quote_file_events:    [],
  };

  const insertCounts = {};

  function nextId(table) {
    const n = (insertCounts[table] ?? 0);
    insertCounts[table] = n + 1;
    if (table === "quote_takeoff_jobs")    return n === 0 ? jobInsertId    : `mock-job-${n}`;
    if (table === "quote_takeoff_results") return n === 0 ? resultInsertId : `mock-result-${n}`;
    return `mock-${table}-${n}`;
  }

  function makeBuilder(table, opType, opData) {
    const state = { eqFilters: [], orderCol: null, orderAsc: true, limitN: null };
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
      limit(n) { state.limitN = n; return builder; },
      order(col, opts) {
        state.orderCol = col;
        state.orderAsc = opts?.ascending ?? true;
        return builder;
      },
      then(resolve) {
        // SELECT
        if (opType === "select") {
          let rows = (tableData[table] ?? []).filter((row) =>
            state.eqFilters.every(({ col, val }) => String(row[col] ?? "") === val)
          );
          if (state.orderCol) {
            const col = state.orderCol;
            const asc = state.orderAsc;
            rows = [...rows].sort((a, b) => {
              const av = a[col] ?? "";
              const bv = b[col] ?? "";
              return asc ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
            });
          }
          if (state.limitN != null) rows = rows.slice(0, state.limitN);
          return resolve({ data: rows, error: null });
        }

        // INSERT
        if (opType === "insert") {
          if (insertError) return resolve({ data: null, error: insertError });
          const arr = Array.isArray(opData) ? opData : [opData];
          const now = new Date().toISOString();
          const newRows = arr.map((r) => ({
            created_at: now,
            updated_at: now,
            result_summary: {},
            ...r,
            id: r.id ?? nextId(table),
          }));
          if (!tableData[table]) tableData[table] = [];
          tableData[table].push(...newRows);
          capturedInserts.push({ table, rows: [...newRows] });
          return resolve(wantsSelect ? { data: newRows, error: null } : { error: null });
        }

        // UPDATE
        if (opType === "update") {
          if (updateError) return resolve({ error: updateError });
          if (tableData[table]) {
            tableData[table] = tableData[table].map((row) => {
              const matches = state.eqFilters.every(
                ({ col, val }) => String(row[col] ?? "") === val
              );
              return matches ? { ...row, ...opData } : row;
            });
          }
          capturedUpdates.push({ table, fields: opData, eqFilters: [...state.eqFilters] });
          return resolve({ error: null });
        }

        return resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  const supabase = {
    from(table) {
      return {
        select()        { return makeBuilder(table, "select", null);   },
        insert(data)    { return makeBuilder(table, "insert", data);   },
        update(fields)  { return makeBuilder(table, "update", fields); },
      };
    },
  };

  return { supabase, tableData, capturedInserts, capturedUpdates };
}

// ═══════════════════════════════════════════════════════════════════════════════
// isUuid
// ═══════════════════════════════════════════════════════════════════════════════

{
  assert.ok(isUuid(ORG_ID), "valid uuid accepted");
  assert.ok(!isUuid("not-a-uuid"), "non-uuid rejected");
  assert.ok(!isUuid(""), "empty string rejected");
  assert.ok(!isUuid(null), "null rejected");
  console.log("ok: isUuid");
}

// ═══════════════════════════════════════════════════════════════════════════════
// workspaceError
// ═══════════════════════════════════════════════════════════════════════════════

{
  const e = workspaceError("bad input", 422);
  assert.equal(e.message, "bad input");
  assert.equal(e.statusCode, 422);
  assert.equal(e.isValidationError, true);

  const srv = workspaceError("oops", 503);
  assert.equal(srv.isValidationError, false);
  console.log("ok: workspaceError");
}

// ═══════════════════════════════════════════════════════════════════════════════
// createTakeoffWorkspace — validation rejections
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase();

  await assert.rejects(
    () => createTakeoffWorkspace({ supabase, organizationId: "", userId: null, quoteFileId: FILE_ID }),
    /organizationId must be a valid UUID/,
    "empty organizationId rejected"
  );

  await assert.rejects(
    () => createTakeoffWorkspace({ supabase, organizationId: ORG_ID, userId: null, quoteFileId: "bad-id" }),
    /quoteFileId must be a valid UUID/,
    "invalid quoteFileId rejected"
  );

  console.log("ok: createTakeoffWorkspace — validation rejections");
}

// ═══════════════════════════════════════════════════════════════════════════════
// createTakeoffWorkspace — file not found
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({ fileRow: null });

  await assert.rejects(
    () => createTakeoffWorkspace({ supabase, organizationId: ORG_ID, userId: USER_ID, quoteFileId: FILE_ID }),
    /not found/i,
    "missing file → 404"
  );

  console.log("ok: createTakeoffWorkspace — file not found");
}

// ═══════════════════════════════════════════════════════════════════════════════
// createTakeoffWorkspace — cross-org file rejected
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow({ organization_id: OTHER_ORG }) });

  await assert.rejects(
    () => createTakeoffWorkspace({ supabase, organizationId: ORG_ID, userId: USER_ID, quoteFileId: FILE_ID }),
    /does not belong to this organization/,
    "cross-org file → 403"
  );

  console.log("ok: createTakeoffWorkspace — cross-org file rejected");
}

// ═══════════════════════════════════════════════════════════════════════════════
// createTakeoffWorkspace — success: inserts quote_takeoff_jobs row
// ═══════════════════════════════════════════════════════════════════════════════

{
  const inserts = [];
  const updates = [];
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow(),
    capturedInserts: inserts,
    capturedUpdates: updates,
  });

  const result = await createTakeoffWorkspace({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    quoteFileId: FILE_ID,
  });

  // Returns real job ID, NOT the quoteFileId.
  assert.equal(result.takeoffJobId, JOB_ID, "takeoffJobId is the inserted job ID");
  assert.notEqual(result.takeoffJobId, FILE_ID, "takeoffJobId is not the quoteFileId");
  assert.equal(result.reviewStatus, "needs_review");
  assert.ok(result.startedAt, "startedAt present");
  assert.equal(result.hasSavedResult, false);
  assert.equal(result.file.originalFilename, "kitchen_plan.pdf");
  assert.ok(!("storagePath" in result.file), "storage_path not exposed");

  // quote_takeoff_jobs row inserted with quote_id = null.
  const jobInsert = inserts.find((i) => i.table === "quote_takeoff_jobs");
  assert.ok(jobInsert, "quote_takeoff_jobs insert called");
  const jobData = jobInsert.rows[0];
  assert.equal(jobData.quote_id, null, "quote_id is null (pre-quote flow)");
  assert.equal(jobData.quote_file_id, FILE_ID, "quote_file_id set");
  assert.equal(jobData.organization_id, ORG_ID, "organization_id set");
  assert.equal(jobData.source_type, "ai_takeoff_lab", "source_type = ai_takeoff_lab");
  assert.equal(jobData.created_by_user_id, USER_ID, "created_by_user_id set");

  // quote_files.takeoff_job_id updated.
  const fileUpdate = updates.find((u) => u.table === "quote_files");
  assert.ok(fileUpdate, "quote_files update called");
  assert.equal(fileUpdate.fields.takeoff_job_id, JOB_ID, "quote_files.takeoff_job_id set to job ID");

  // linked_to_takeoff audit event logged.
  const eventInsert = inserts.find((i) => i.table === "quote_file_events");
  assert.ok(eventInsert, "quote_file_events insert called");
  const eventData = eventInsert.rows[0];
  assert.equal(eventData.action, "linked_to_takeoff");
  assert.equal(eventData.quote_file_id, FILE_ID);
  assert.equal(eventData.metadata?.takeoff_job_id, JOB_ID);

  // No quote_headers mutation.
  const quoteMutation = inserts.some((i) => i.table === "quote_headers") ||
    updates.some((u) => u.table === "quote_headers");
  assert.equal(quoteMutation, false, "no quote_headers mutation");

  console.log("ok: createTakeoffWorkspace — success + quote_takeoff_jobs row created");
}

// ═══════════════════════════════════════════════════════════════════════════════
// createTakeoffWorkspace — idempotent (job already exists for this file)
// ═══════════════════════════════════════════════════════════════════════════════

{
  const inserts = [];
  // Pre-existing job with matching quote_file_id + organization_id.
  const existingJob = makeJobRow({ id: JOB_ID, created_at: "2026-06-01T00:00:00.000Z" });
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow(),
    jobRow: existingJob,
    capturedInserts: inserts,
  });

  const result = await createTakeoffWorkspace({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    quoteFileId: FILE_ID,
  });

  assert.equal(result.takeoffJobId, JOB_ID, "returns existing job ID");
  assert.equal(result.startedAt, "2026-06-01T00:00:00.000Z", "existing startedAt preserved");
  assert.equal(inserts.filter((i) => i.table === "quote_takeoff_jobs").length, 0,
    "no new job row inserted");

  console.log("ok: createTakeoffWorkspace — idempotent");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getTakeoffWorkspace — validation rejections
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase();

  await assert.rejects(
    () => getTakeoffWorkspace({ supabase, organizationId: "", takeoffJobId: JOB_ID }),
    /organizationId must be a valid UUID/
  );
  await assert.rejects(
    () => getTakeoffWorkspace({ supabase, organizationId: ORG_ID, takeoffJobId: "bad" }),
    /takeoffJobId must be a valid UUID/
  );
  console.log("ok: getTakeoffWorkspace — validation rejections");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getTakeoffWorkspace — cross-org: job not visible to other org (returns 404)
// ═══════════════════════════════════════════════════════════════════════════════

{
  // Job belongs to OTHER_ORG; query filtered by ORG_ID returns empty → 404.
  const { supabase } = makeMockSupabase({ jobRow: makeJobRow({ organization_id: OTHER_ORG }) });

  await assert.rejects(
    () => getTakeoffWorkspace({ supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID }),
    /not found/i,
    "cross-org job not visible → 404"
  );

  console.log("ok: getTakeoffWorkspace — cross-org not visible");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getTakeoffWorkspace — success
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow(),
    jobRow: makeJobRow(),
  });

  const result = await getTakeoffWorkspace({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
  });

  assert.equal(result.takeoffJobId, JOB_ID);
  assert.equal(result.reviewStatus, "needs_review");
  assert.equal(result.isWorkspace, true);
  assert.equal(result.hasSavedResult, false, "no results yet");
  assert.ok(result.file, "file metadata present");
  assert.equal(result.file.originalFilename, "kitchen_plan.pdf");
  assert.ok(!("storagePath" in result.file), "storage_path not exposed");

  console.log("ok: getTakeoffWorkspace — success");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getTakeoffWorkspace — hasSavedResult true when result row exists
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow(),
    jobRow: makeJobRow(),
    resultRows: [makeResultRow()],
  });

  const result = await getTakeoffWorkspace({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
  });

  assert.equal(result.hasSavedResult, true, "hasSavedResult true when result row exists");
  console.log("ok: getTakeoffWorkspace — hasSavedResult reflects result rows");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getTakeoffWorkspace — legacy v4 fallback (file metadata workspace)
// ═══════════════════════════════════════════════════════════════════════════════

{
  // No job row; file has metadata.takeoffWorkspace (v4 format).
  const v4FileId = FILE_ID; // In v4, the file ID was the workspace ID.
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow({
      metadata: {
        takeoffWorkspace: { startedAt: "2026-05-01T00:00:00Z", reviewStatus: "needs_review" },
        takeoffResult: { savedAt: "2026-05-01T01:00:00Z" },
      },
    }),
    jobRow: null, // No real job row.
  });

  const result = await getTakeoffWorkspace({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: v4FileId,
  });

  assert.equal(result.legacyV4, true, "legacyV4 flag set");
  assert.equal(result.hasSavedResult, true, "hasSavedResult true from metadata");
  assert.ok(!("storagePath" in result.file), "storage_path not exposed");

  console.log("ok: getTakeoffWorkspace — legacy v4 fallback");
}

// ═══════════════════════════════════════════════════════════════════════════════
// saveTakeoffResult — validation rejections
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({ jobRow: makeJobRow() });

  await assert.rejects(
    () => saveTakeoffResult({
      supabase, organizationId: ORG_ID, userId: null, takeoffJobId: JOB_ID, takeoffResult: null,
    }),
    /takeoffResult must be a TakeoffResult object/,
    "null takeoffResult rejected"
  );

  await assert.rejects(
    () => saveTakeoffResult({
      supabase, organizationId: ORG_ID, userId: null, takeoffJobId: JOB_ID,
      takeoffResult: { rooms: "wrong" },
    }),
    /takeoffResult\.rooms must be an array/,
    "invalid rooms rejected"
  );

  console.log("ok: saveTakeoffResult — validation rejections");
}

// ═══════════════════════════════════════════════════════════════════════════════
// saveTakeoffResult — job not found → 404
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({ jobRow: null, fileRow: null });
  const fixture = buildSpec73Fixture();

  await assert.rejects(
    () => saveTakeoffResult({
      supabase, organizationId: ORG_ID, userId: null,
      takeoffJobId: JOB_ID, takeoffResult: fixture,
    }),
    /not found/i,
    "missing job → 404"
  );

  console.log("ok: saveTakeoffResult — job not found → 404");
}

// ═══════════════════════════════════════════════════════════════════════════════
// saveTakeoffResult — cross-org: job not visible → 404
// ═══════════════════════════════════════════════════════════════════════════════

{
  // Job org_id = OTHER_ORG; query filtered by ORG_ID returns nothing → 404.
  const { supabase } = makeMockSupabase({ jobRow: makeJobRow({ organization_id: OTHER_ORG }) });
  const fixture = buildSpec73Fixture();

  await assert.rejects(
    () => saveTakeoffResult({
      supabase, organizationId: ORG_ID, userId: null,
      takeoffJobId: JOB_ID, takeoffResult: fixture,
    }),
    /not found/i,
    "cross-org job → 404"
  );

  console.log("ok: saveTakeoffResult — cross-org not visible");
}

// ═══════════════════════════════════════════════════════════════════════════════
// saveTakeoffResult — success: inserts quote_takeoff_results + server recompute
// ═══════════════════════════════════════════════════════════════════════════════

{
  const inserts = [];
  const updates = [];
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow(),
    capturedInserts: inserts,
    capturedUpdates: updates,
  });
  const fixture = buildSpec73Fixture();

  const result = await saveTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: fixture,
  });

  assert.equal(result.ok, true);
  assert.equal(result.takeoffJobId, JOB_ID);
  assert.ok(result.savedAt, "savedAt present");
  assert.equal(result.reviewStatus, "needs_review");

  // Server-side recomputed summary for Spec 73.
  assert.ok(Math.abs(result.summary.countertopExactSf - 59.96) < 0.01, "Spec 73 countertop sf correct");
  assert.ok(Math.abs(result.summary.backsplashExactSf - 6.61) < 0.01, "Spec 73 backsplash sf correct");
  assert.equal(result.summary.roomCount, fixture.rooms.length);

  // quote_takeoff_results row inserted.
  const resultInsert = inserts.find((i) => i.table === "quote_takeoff_results");
  assert.ok(resultInsert, "quote_takeoff_results insert called");
  const rowData = resultInsert.rows[0];
  assert.equal(rowData.organization_id, ORG_ID, "organization_id set on result row");
  assert.equal(rowData.takeoff_job_id, JOB_ID, "takeoff_job_id set");
  assert.ok(rowData.normalized_takeoff_json, "normalized_takeoff_json stored");
  assert.ok(rowData.computed_measurements_json, "computed_measurements_json stored");
  assert.ok(rowData.validation_diagnostics_json, "validation_diagnostics_json stored");
  assert.ok(rowData.import_plan_json, "import_plan_json stored");
  assert.equal(rowData.raw_ai_result_json, null, "raw_ai_result_json null for lab source");

  // quote_takeoff_jobs.status + result_summary updated.
  const jobUpdate = updates.find((u) => u.table === "quote_takeoff_jobs");
  assert.ok(jobUpdate, "quote_takeoff_jobs update called");
  assert.equal(jobUpdate.fields.status, "completed", "job status → completed");
  assert.ok(jobUpdate.fields.result_summary?.normalizedTakeoffJson, "result_summary has full JSON");

  // storage_path never returned.
  assert.ok(!("storage_path" in result), "storage_path not in result");
  assert.ok(!("storagePath" in result), "storagePath not in result");

  // No quote_headers mutation.
  const quoteMutation = inserts.some((i) => i.table === "quote_headers") ||
    updates.some((u) => u.table === "quote_headers");
  assert.equal(quoteMutation, false, "no quote mutation");

  console.log("ok: saveTakeoffResult — success + quote_takeoff_results row + server recompute");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getLatestTakeoffResult — no result → 404
// ═══════════════════════════════════════════════════════════════════════════════

{
  // Job exists but no result rows and empty result_summary.
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow({ result_summary: {} }),
    resultRows: [],
  });

  await assert.rejects(
    () => getLatestTakeoffResult({ supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID }),
    /No saved result found/,
    "missing result → 404"
  );

  console.log("ok: getLatestTakeoffResult — no result → 404");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getLatestTakeoffResult — reads from quote_takeoff_results
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow(),
    jobRow: makeJobRow(),
    resultRows: [makeResultRow()],
  });

  const loaded = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
  });

  assert.equal(loaded.takeoffJobId, JOB_ID);
  assert.ok(loaded.savedAt, "savedAt present");
  assert.ok(loaded.normalizedTakeoffJson, "normalizedTakeoffJson returned");
  assert.ok(loaded.computedMeasurementsJson, "computedMeasurementsJson returned (recomputed)");
  assert.ok(loaded.validationDiagnosticsJson, "validationDiagnosticsJson returned");
  assert.ok(loaded.importPlanJson, "importPlanJson returned");
  assert.ok(loaded.file, "file metadata present");
  assert.ok(!("storagePath" in loaded.file), "storage_path not exposed");

  // Server recomputed value should match Spec 73.
  assert.ok(
    Math.abs(loaded.computedMeasurementsJson.countertopExactSf - 59.96) < 0.01,
    "recomputed countertop sf correct"
  );

  console.log("ok: getLatestTakeoffResult — reads from quote_takeoff_results");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getLatestTakeoffResult — falls back to job.result_summary
// ═══════════════════════════════════════════════════════════════════════════════

{
  // No quote_takeoff_results rows, but job.result_summary has the data (quote_id NOT NULL fallback).
  const fixture = buildSpec73Fixture();
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow(),
    jobRow: makeJobRow({
      status: "completed",
      result_summary: {
        savedAt: "2026-06-01T02:00:00.000Z",
        schemaVersion: "1.0",
        reviewStatus: "needs_review",
        normalizedTakeoffJson: fixture,
        computedMeasurementsJson: { countertopExactSf: 59.96, backsplashExactSf: 6.61 },
        validationDiagnosticsJson: { errorCount: 0, warningCount: 0 },
        importPlanJson: { canImport: true },
      },
    }),
    resultRows: [], // No real result rows.
  });

  const loaded = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
  });

  assert.ok(loaded.normalizedTakeoffJson, "normalizedTakeoffJson from job.result_summary");
  assert.ok(
    Math.abs(loaded.computedMeasurementsJson.countertopExactSf - 59.96) < 0.01,
    "server recompute from fallback source"
  );
  assert.ok(!("storagePath" in loaded.file), "storage_path not exposed");

  console.log("ok: getLatestTakeoffResult — falls back to job.result_summary");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getLatestTakeoffResult — legacy v4 fallback (file metadata)
// ═══════════════════════════════════════════════════════════════════════════════

{
  const fixture = buildSpec73Fixture();
  // No job row; file ID used as workspace ID (v4 format).
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow({
      metadata: {
        takeoffWorkspace: { startedAt: "2026-05-01T00:00:00Z", reviewStatus: "needs_review" },
        takeoffResult: {
          savedAt: "2026-05-01T01:00:00Z",
          schemaVersion: "1.0",
          reviewStatus: "needs_review",
          normalizedTakeoffJson: fixture,
          computedMeasurementsJson: { countertopExactSf: 59.96 },
          validationDiagnosticsJson: { errorCount: 0, warningCount: 0 },
          importPlanJson: { canImport: true },
        },
      },
    }),
    jobRow: null,
  });

  const loaded = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: FILE_ID, // v4: file ID was the workspace ID
  });

  assert.equal(loaded.legacyV4, true, "legacyV4 flag set");
  assert.ok(loaded.normalizedTakeoffJson, "normalizedTakeoffJson from v4 metadata");
  assert.ok(!("storagePath" in loaded.file), "storage_path not exposed");

  console.log("ok: getLatestTakeoffResult — legacy v4 fallback");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getLatestTakeoffResult — cross-org: job not visible → 404
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({ jobRow: makeJobRow({ organization_id: OTHER_ORG }) });

  await assert.rejects(
    () => getLatestTakeoffResult({ supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID }),
    /not found/i,
    "cross-org result load → 404"
  );

  console.log("ok: getLatestTakeoffResult — cross-org not visible");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getLatestTakeoffResult — full round-trip via save then load
// ═══════════════════════════════════════════════════════════════════════════════

{
  const inserts = [];
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow(),
    jobRow: makeJobRow(),
    capturedInserts: inserts,
  });
  const fixture = buildSpec73Fixture();

  // Save first.
  await saveTakeoffResult({
    supabase, organizationId: ORG_ID, userId: USER_ID,
    takeoffJobId: JOB_ID, takeoffResult: fixture,
  });

  // Load — should find the inserted quote_takeoff_results row.
  const loaded = await getLatestTakeoffResult({
    supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID,
  });

  assert.equal(loaded.takeoffJobId, JOB_ID);
  assert.ok(loaded.normalizedTakeoffJson, "normalizedTakeoffJson present");
  assert.ok(
    Math.abs(loaded.computedMeasurementsJson.countertopExactSf - 59.96) < 0.01,
    "recomputed countertop sf correct on round-trip"
  );

  console.log("ok: getLatestTakeoffResult — save then load round-trip");
}

// ═══════════════════════════════════════════════════════════════════════════════
// listTakeoffResults — cross-org job not visible → 404
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({ jobRow: makeJobRow({ organization_id: OTHER_ORG }) });

  await assert.rejects(
    () => listTakeoffResults({ supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID }),
    /not found/i,
    "cross-org job → 404"
  );

  console.log("ok: listTakeoffResults — cross-org not visible");
}

// ═══════════════════════════════════════════════════════════════════════════════
// listTakeoffResults — returns empty array when no results exist
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow({ result_summary: {} }),
    resultRows: [],
  });

  const { ok, results } = await listTakeoffResults({
    supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID,
  });

  assert.equal(ok, true);
  assert.deepEqual(results, [], "empty results array when no rows");
  console.log("ok: listTakeoffResults — empty array when no results");
}

// ═══════════════════════════════════════════════════════════════════════════════
// listTakeoffResults — returns summaries from results table with _meta
// ═══════════════════════════════════════════════════════════════════════════════

{
  const resultRowWithMeta = makeResultRow({
    raw_ai_result_json: {
      _meta: { promptVersion: "v2", modelUsed: "gpt-4o", savedAt: "2026-06-02T00:00:00.000Z" },
    },
    computed_measurements_json: { countertopExactSf: 68.41, backsplashExactSf: 1.04, combinedExactSf: 69.45 },
    validation_diagnostics_json: { warningCount: 3, errorCount: 0 },
  });

  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow(),
    resultRows: [resultRowWithMeta],
  });

  const { ok, results } = await listTakeoffResults({
    supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID,
  });

  assert.equal(ok, true);
  assert.equal(results.length, 1, "one result summary returned");
  const r = results[0];
  assert.equal(r.id, RESULT_ID);
  assert.equal(r.promptVersion, "v2", "promptVersion from _meta");
  assert.equal(r.modelUsed, "gpt-4o", "modelUsed from _meta");
  assert.ok(Math.abs(r.computedCountertopSf - 68.41) < 0.01, "CT sf correct");
  assert.ok(Math.abs(r.computedBacksplashSf - 1.04) < 0.01, "BS sf correct");
  assert.equal(r.warningCount, 3, "warningCount correct");
  assert.equal(r.source, "results_table");
  // Never returns raw JSON or storage_path.
  assert.ok(!("normalized_takeoff_json" in r), "full JSON not in summary");
  assert.ok(!("storage_path" in r), "storage_path not in summary");
  console.log("ok: listTakeoffResults — summaries from results table with _meta");
}

// ═══════════════════════════════════════════════════════════════════════════════
// listTakeoffResults — falls back to result_summary when no table rows
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow({
      status: "completed",
      result_summary: {
        aiExtraction: true,
        savedAt: "2026-06-01T05:00:00.000Z",
        schemaVersion: "1.0",
        reviewStatus: "needs_review",
        promptVersion: "v1",
        modelUsed: "gpt-4o",
        countertopExactSf: 76.97,
        backsplashExactSf: 0.00,
        combinedExactSf: 76.97,
        warningCount: 2,
        errorCount: 0,
        resultRowId: null,
      },
    }),
    resultRows: [],
  });

  const { ok, results } = await listTakeoffResults({
    supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID,
  });

  assert.equal(ok, true);
  assert.equal(results.length, 1, "fallback entry returned");
  const r = results[0];
  assert.equal(r.promptVersion, "v1", "promptVersion from result_summary");
  assert.equal(r.modelUsed, "gpt-4o", "modelUsed from result_summary");
  assert.ok(Math.abs(r.computedCountertopSf - 76.97) < 0.01, "CT sf from fallback");
  assert.equal(r.source, "result_summary");
  assert.ok(!("storage_path" in r), "storage_path not in fallback summary");
  console.log("ok: listTakeoffResults — falls back to result_summary");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getResultById — loads full result with recompute
// ═══════════════════════════════════════════════════════════════════════════════

{
  const resultRowWithMeta = makeResultRow({
    raw_ai_result_json: {
      _meta: { promptVersion: "v2", modelUsed: "gpt-4o", savedAt: "2026-06-02T00:00:00.000Z" },
    },
  });

  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow(),
    resultRows: [resultRowWithMeta],
  });

  const result = await getResultById({
    supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID, resultId: RESULT_ID,
  });

  assert.equal(result.ok, true);
  assert.equal(result.resultId, RESULT_ID);
  assert.equal(result.takeoffJobId, JOB_ID);
  assert.equal(result.promptVersion, "v2", "promptVersion from _meta");
  assert.equal(result.modelUsed, "gpt-4o", "modelUsed from _meta");
  assert.ok(result.normalizedTakeoffJson, "normalizedTakeoffJson returned");
  assert.ok(result.computedMeasurementsJson, "computedMeasurementsJson returned");
  assert.ok(result.validationDiagnosticsJson, "validationDiagnosticsJson returned");
  assert.ok(result.importPlanJson, "importPlanJson returned");
  // storage_path never returned.
  assert.ok(!("storage_path" in result), "storage_path not in result");
  // Full recompute should give Spec73 values.
  assert.ok(
    Math.abs(result.computedMeasurementsJson.countertopExactSf - 59.96) < 0.01,
    "fresh recompute gives correct CT sf"
  );
  console.log("ok: getResultById — full result with recompute");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getResultById — cross-org job not visible → 404
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({ jobRow: makeJobRow({ organization_id: OTHER_ORG }) });

  await assert.rejects(
    () => getResultById({
      supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID, resultId: RESULT_ID,
    }),
    /not found/i,
    "cross-org job → 404"
  );

  console.log("ok: getResultById — cross-org not visible");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getResultById — result not found → 404
// ═══════════════════════════════════════════════════════════════════════════════

{
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow(),
    resultRows: [], // no result rows
  });

  const OTHER_RESULT_ID = "e6666666-6666-4666-8666-666666666666";

  await assert.rejects(
    () => getResultById({
      supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID, resultId: OTHER_RESULT_ID,
    }),
    /not found/i,
    "missing result → 404"
  );

  console.log("ok: getResultById — result not found → 404");
}

// ═══════════════════════════════════════════════════════════════════════════════
// No quote mutation in listTakeoffResults / getResultById
// ═══════════════════════════════════════════════════════════════════════════════

{
  const inserts = [];
  const updates = [];
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow(),
    resultRows: [makeResultRow()],
    capturedInserts: inserts,
    capturedUpdates: updates,
  });

  await listTakeoffResults({ supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID });
  await getResultById({ supabase, organizationId: ORG_ID, takeoffJobId: JOB_ID, resultId: RESULT_ID });

  const quoteMutation =
    inserts.some((i) => i.table === "quote_headers") ||
    updates.some((u) => u.table === "quote_headers");
  assert.equal(quoteMutation, false, "no quote_headers mutation");
  assert.equal(inserts.length, 0, "no inserts in list/get operations");
  console.log("ok: listTakeoffResults + getResultById — no quote mutation, no inserts");
}

console.log("\ntakeoffWorkspaceService: all tests passed");
