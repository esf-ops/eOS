/**
 * takeoffWorkspaceService — unit tests.
 *
 * All tests use mock Supabase clients. No real DB/storage calls.
 * Covers: validation, ownership, workspace creation (idempotent),
 *         result save (server recompute), latest result load, cross-org rejection.
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
} from "./takeoffWorkspaceService.mjs";
import { buildSpec73Fixture } from "./fixtures/spec73.fixture.mjs";

// ── Test IDs ──────────────────────────────────────────────────────────────────

const ORG_ID    = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FILE_ID   = "a1111111-1111-4111-8111-111111111111";
const USER_ID   = "c3333333-3333-4333-8333-333333333333";
const OTHER_ORG = "f5555555-5555-4555-8555-555555555555";

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
    created_at: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

function makeMockSupabase({
  fileRow = null,
  updateError = null,
  capturedUpdates = [],
} = {}) {
  const tableData = {
    quote_files: fileRow ? [fileRow] : [],
  };

  function makeSelectBuilder(table) {
    let _eqFilters = [];
    const builder = {
      select() { return builder; },
      eq(col, val) { _eqFilters.push({ col, val: String(val) }); return builder; },
      limit() { return builder; },
      then(resolve) {
        let rows = (tableData[table] ?? []).filter((row) =>
          _eqFilters.every(({ col, val }) => String(row[col] ?? "") === val)
        );
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  function makeUpdateBuilder(table, fields) {
    let _eqFilters = [];
    // Apply the update to in-memory data for subsequent reads.
    const builder = {
      eq(col, val) { _eqFilters.push({ col, val: String(val) }); return builder; },
      then(resolve) {
        capturedUpdates.push({ table, fields, eqFilters: [..._eqFilters] });
        if (updateError) return resolve({ error: updateError });
        // Mutate the row in tableData so subsequent reads reflect the update.
        if (tableData[table]) {
          tableData[table] = tableData[table].map((row) => {
            const matches = _eqFilters.every(({ col, val }) => String(row[col] ?? "") === val);
            if (!matches) return row;
            const merged = { ...row };
            for (const [k, v] of Object.entries(fields)) {
              merged[k] = v;
            }
            return merged;
          });
        }
        return resolve({ error: null });
      },
    };
    return builder;
  }

  const supabase = {
    from(table) {
      return {
        select() { return makeSelectBuilder(table); },
        update(fields) { return makeUpdateBuilder(table, fields); },
      };
    },
  };

  return { supabase, capturedUpdates };
}

// ── isUuid ────────────────────────────────────────────────────────────────────

{
  assert.ok(isUuid(ORG_ID), "valid uuid accepted");
  assert.ok(!isUuid("not-a-uuid"), "non-uuid rejected");
  assert.ok(!isUuid(""), "empty string rejected");
  assert.ok(!isUuid(null), "null rejected");
  console.log("ok: isUuid");
}

// ── workspaceError ────────────────────────────────────────────────────────────

{
  const e = workspaceError("bad input", 422);
  assert.equal(e.message, "bad input");
  assert.equal(e.statusCode, 422);
  assert.equal(e.isValidationError, true);

  const srv = workspaceError("oops", 503);
  assert.equal(srv.isValidationError, false);
  console.log("ok: workspaceError");
}

// ── createTakeoffWorkspace — validation rejections ────────────────────────────

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

// ── createTakeoffWorkspace — file not found ───────────────────────────────────

{
  const { supabase } = makeMockSupabase({ fileRow: null });

  await assert.rejects(
    () => createTakeoffWorkspace({ supabase, organizationId: ORG_ID, userId: USER_ID, quoteFileId: FILE_ID }),
    /not found/i,
    "missing file → 404"
  );

  console.log("ok: createTakeoffWorkspace — file not found");
}

// ── createTakeoffWorkspace — cross-org rejected ───────────────────────────────

{
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow({ organization_id: OTHER_ORG }) });

  await assert.rejects(
    () => createTakeoffWorkspace({ supabase, organizationId: ORG_ID, userId: USER_ID, quoteFileId: FILE_ID }),
    /does not belong to this organization/,
    "cross-org file → 403"
  );

  console.log("ok: createTakeoffWorkspace — cross-org rejected");
}

// ── createTakeoffWorkspace — success ─────────────────────────────────────────

{
  const updates = [];
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow(), capturedUpdates: updates });

  const result = await createTakeoffWorkspace({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    quoteFileId: FILE_ID,
  });

  assert.equal(result.takeoffJobId, FILE_ID, "takeoffJobId equals quoteFileId");
  assert.equal(result.reviewStatus, "needs_review");
  assert.ok(result.startedAt, "startedAt present");
  assert.equal(result.hasSavedResult, false);
  assert.equal(result.file.originalFilename, "kitchen_plan.pdf");
  assert.ok(!("storagePath" in result.file), "storage_path not exposed");

  assert.equal(updates.length, 1, "one update call");
  assert.ok(updates[0].fields.metadata?.takeoffWorkspace, "metadata.takeoffWorkspace set");
  assert.equal(updates[0].fields.metadata.takeoffWorkspace.startedByUserId, USER_ID);

  console.log("ok: createTakeoffWorkspace — success");
}

// ── createTakeoffWorkspace — idempotent (workspace already exists) ─────────────

{
  const existingWorkspace = {
    startedAt: "2026-06-01T00:00:00.000Z",
    startedByUserId: USER_ID,
    reviewStatus: "needs_review",
  };
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow({ metadata: { takeoffWorkspace: existingWorkspace } }),
  });

  const result = await createTakeoffWorkspace({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    quoteFileId: FILE_ID,
  });

  assert.equal(result.startedAt, existingWorkspace.startedAt, "existing startedAt preserved");
  console.log("ok: createTakeoffWorkspace — idempotent");
}

// ── getTakeoffWorkspace — cross-org rejected ──────────────────────────────────

{
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow({ organization_id: OTHER_ORG }) });

  await assert.rejects(
    () => getTakeoffWorkspace({ supabase, organizationId: ORG_ID, takeoffJobId: FILE_ID }),
    /does not belong to this organization/,
    "cross-org get → 403"
  );

  console.log("ok: getTakeoffWorkspace — cross-org rejected");
}

// ── getTakeoffWorkspace — success with saved result ───────────────────────────

{
  const { supabase } = makeMockSupabase({
    fileRow: makeFileRow({
      metadata: {
        takeoffWorkspace: { startedAt: "2026-06-01T00:00:00Z", reviewStatus: "needs_review" },
        takeoffResult: { savedAt: "2026-06-01T01:00:00Z" },
      },
    }),
  });

  const result = await getTakeoffWorkspace({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: FILE_ID,
  });

  assert.equal(result.takeoffJobId, FILE_ID);
  assert.equal(result.hasSavedResult, true, "hasSavedResult true");
  assert.equal(result.isWorkspace, true, "isWorkspace true");
  assert.ok(!("storagePath" in result.file), "storage_path not exposed");

  console.log("ok: getTakeoffWorkspace — success with saved result");
}

// ── saveTakeoffResult — validation rejections ─────────────────────────────────

{
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow() });

  await assert.rejects(
    () => saveTakeoffResult({ supabase, organizationId: ORG_ID, userId: null, takeoffJobId: FILE_ID, takeoffResult: null }),
    /takeoffResult must be a TakeoffResult object/,
    "null takeoffResult rejected"
  );

  await assert.rejects(
    () => saveTakeoffResult({ supabase, organizationId: ORG_ID, userId: null, takeoffJobId: FILE_ID, takeoffResult: { rooms: "wrong" } }),
    /takeoffResult\.rooms must be an array/,
    "invalid rooms rejected"
  );

  console.log("ok: saveTakeoffResult — validation rejections");
}

// ── saveTakeoffResult — cross-org rejected ────────────────────────────────────

{
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow({ organization_id: OTHER_ORG }) });
  const fixture = buildSpec73Fixture();

  await assert.rejects(
    () => saveTakeoffResult({ supabase, organizationId: ORG_ID, userId: null, takeoffJobId: FILE_ID, takeoffResult: fixture }),
    /does not belong to this organization/,
    "cross-org save → 403"
  );

  console.log("ok: saveTakeoffResult — cross-org rejected");
}

// ── saveTakeoffResult — success + server recompute ────────────────────────────

{
  const updates = [];
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow(), capturedUpdates: updates });
  const fixture = buildSpec73Fixture();

  const result = await saveTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: FILE_ID,
    takeoffResult: fixture,
  });

  assert.equal(result.ok, true);
  assert.equal(result.takeoffJobId, FILE_ID);
  assert.ok(result.savedAt, "savedAt present");
  assert.equal(result.reviewStatus, "needs_review");

  // Verify server-side recomputed summary for Spec 73.
  assert.ok(Math.abs(result.summary.countertopExactSf - 59.96) < 0.01, "Spec 73 countertop sf correct");
  assert.ok(Math.abs(result.summary.backsplashExactSf - 6.61) < 0.01, "Spec 73 backsplash sf correct");
  assert.equal(result.summary.roomCount, fixture.rooms.length);

  // Verify metadata was written.
  assert.equal(updates.length, 1, "one update call");
  const written = updates[0].fields.metadata;
  assert.ok(written.takeoffResult, "takeoffResult in metadata");
  assert.ok(written.takeoffResult.normalizedTakeoffJson, "normalizedTakeoffJson stored");
  assert.ok(written.takeoffResult.computedMeasurementsJson, "computedMeasurementsJson stored");
  assert.ok(written.takeoffResult.validationDiagnosticsJson, "validationDiagnosticsJson stored");
  assert.ok(written.takeoffResult.importPlanJson, "importPlanJson stored");
  assert.ok(!("storage_path" in result), "storage_path not in result");

  console.log("ok: saveTakeoffResult — success + server recompute");
}

// ── getLatestTakeoffResult — no result → 404 ─────────────────────────────────

{
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow({ metadata: {} }) });

  await assert.rejects(
    () => getLatestTakeoffResult({ supabase, organizationId: ORG_ID, takeoffJobId: FILE_ID }),
    /No saved result found/,
    "missing result → 404"
  );

  console.log("ok: getLatestTakeoffResult — no result → 404");
}

// ── getLatestTakeoffResult — success + server recompute ───────────────────────

{
  const fixture = buildSpec73Fixture();
  // Pre-save the result (simulates a prior saveTakeoffResult call).
  const updates = [];
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow(), capturedUpdates: updates });
  await saveTakeoffResult({ supabase, organizationId: ORG_ID, userId: USER_ID, takeoffJobId: FILE_ID, takeoffResult: fixture });

  // Now load it.
  const loaded = await getLatestTakeoffResult({ supabase, organizationId: ORG_ID, takeoffJobId: FILE_ID });

  assert.equal(loaded.takeoffJobId, FILE_ID);
  assert.ok(loaded.savedAt, "savedAt present");
  assert.ok(loaded.normalizedTakeoffJson, "normalizedTakeoffJson returned");
  assert.ok(loaded.computedMeasurementsJson, "computedMeasurementsJson returned");
  assert.ok(loaded.validationDiagnosticsJson, "validationDiagnosticsJson returned");
  assert.ok(loaded.importPlanJson, "importPlanJson returned");
  assert.ok(!("storagePath" in loaded.file), "storage_path not exposed");

  // Server recomputed values should match Spec 73.
  assert.ok(Math.abs(loaded.computedMeasurementsJson.countertopExactSf - 59.96) < 0.01, "loaded countertop sf correct");

  console.log("ok: getLatestTakeoffResult — success + server recompute");
}

// ── getLatestTakeoffResult — cross-org rejected ───────────────────────────────

{
  const { supabase } = makeMockSupabase({ fileRow: makeFileRow({ organization_id: OTHER_ORG }) });

  await assert.rejects(
    () => getLatestTakeoffResult({ supabase, organizationId: ORG_ID, takeoffJobId: FILE_ID }),
    /does not belong to this organization/,
    "cross-org load → 403"
  );

  console.log("ok: getLatestTakeoffResult — cross-org rejected");
}

console.log("\ntakeoffWorkspaceService: all tests passed");
