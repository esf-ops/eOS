/**
 * Physical Takeoff result persistence — no synthetic canonical IDs.
 *
 * Run: npm run eos:test:takeoff-physical-result-persistence
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approveAndBuildEstimate,
  getLatestTakeoffResult,
  getResultById,
  saveTakeoffCorrection
} from "../../../backend-core/src/takeoff/takeoffWorkspaceService.mjs";
import { seedScopeFromTakeoffPayload } from "../../../backend-core/src/elite100EstimateStudio/studioEstimateService.mjs";
import { buildFinishedEdgeFromExposedSides } from "../../../backend-core/src/takeoff/takeoffExposedEdges.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\ntakeoffPhysicalResultPersistence.test.mjs\n");

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FILE_ID = "a1111111-1111-4111-8111-111111111111";
const JOB_ID = "b2222222-2222-4222-8222-222222222222";
const RESULT_A = "c3333333-3333-4333-8333-333333333333";
const RESULT_B = "d4444444-4444-4444-8444-444444444444";
const RESULT_C = "e5555555-5555-4555-8555-555555555555";
const USER_ID = "f6666666-6666-4666-8666-666666666666";

function draft(backsplash, notes, edgeConfirmed = true) {
  const edge = buildFinishedEdgeFromExposedSides({
    lengthIn: 100,
    depthIn: 25.5,
    quantity: 1,
    exposedSides: { front: true, back: false, left: true, right: false },
    confirm: edgeConfirmed
  });
  return {
    schemaVersion: "1.0",
    status: "reviewed",
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        roomType: "Kitchen",
        _estimatorOwned: true,
        areas: [
          {
            id: "area-1",
            label: "Main",
            backsplashIncluded: true,
            backsplashHeightIn: 4,
            runs: [1, 2, 3, 4, 5].map((n) => ({
              id: `run-${n}`,
              label: `Piece ${n}`,
              pieceType: "counter",
              lengthIn: 100,
              depthIn: 25.5,
              quantity: 1,
              _manual: true,
              notes: n === 1 ? notes : "",
              backsplashEligible: backsplash,
              ...(backsplash
                ? {
                    backsplashEligibilitySource: "estimator_confirmed",
                    backsplashEligibilityUpdatedAt: "2026-07-21T16:00:00.000Z",
                    backsplashEligibleLengthIn: 100
                  }
                : {}),
              finishedEdge: n === 1 ? edge : null,
              cutouts: []
            }))
          }
        ]
      }
    ]
  };
}

function reviewState(takeoff) {
  const roomCompleteness = {};
  for (const room of takeoff.rooms ?? []) roomCompleteness[room.id] = true;
  return {
    excludedRunIds: [],
    flagResolutions: {},
    roomCompleteness,
    referenceTotalAcks: {},
    evidenceAcks: {}
  };
}

function makeMock({ resultRows = [], resultInsertIds = [RESULT_B, RESULT_C], insertError = null }) {
  const tableData = {
    quote_files: [
      {
        id: FILE_ID,
        organization_id: ORG_ID,
        status: "active",
        original_filename: "plan.pdf",
        file_role: "cabinet_plan",
        visibility: "internal",
        mime_type: "application/pdf",
        file_size_bytes: 10,
        created_at: "2026-06-01T00:00:00.000Z",
        metadata: {}
      }
    ],
    quote_takeoff_jobs: [
      {
        id: JOB_ID,
        organization_id: ORG_ID,
        quote_id: null,
        quote_file_id: FILE_ID,
        status: "completed",
        review_status: "needs_review",
        source_type: "ai_takeoff_lab",
        created_by_user_id: USER_ID,
        metadata: {},
        result_summary: {},
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z"
      }
    ],
    quote_takeoff_results: [...resultRows],
    quote_file_events: []
  };
  let insertCount = 0;
  const capturedInserts = [];

  function makeBuilder(table, opType, opData) {
    const state = { eqFilters: [], orderCol: null, orderAsc: true, limitN: null };
    let wantsSelect = false;
    const builder = {
      select() {
        if (opType === "insert" || opType === "update") wantsSelect = true;
        return builder;
      },
      eq(col, val) {
        state.eqFilters.push({ col, val: String(val) });
        return builder;
      },
      in() {
        return builder;
      },
      limit(n) {
        state.limitN = n;
        return builder;
      },
      order(col, opts) {
        state.orderCol = col;
        state.orderAsc = opts?.ascending ?? true;
        return builder;
      },
      then(resolve) {
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
              return asc ? (av < bv ? -1 : av > bv ? 1 : 0) : av > bv ? -1 : av < bv ? 1 : 0;
            });
          }
          if (state.limitN != null) rows = rows.slice(0, state.limitN);
          return resolve({ data: rows, error: null });
        }
        if (opType === "insert") {
          if (table === "quote_takeoff_results" && insertError) {
            return resolve({ data: null, error: insertError });
          }
          const arr = Array.isArray(opData) ? opData : [opData];
          const now = new Date().toISOString();
          const newRows = arr.map((r) => {
            const id = r.id ?? resultInsertIds[insertCount++] ?? `mock-${insertCount}`;
            return { created_at: now, ...r, id };
          });
          tableData[table].push(...newRows);
          capturedInserts.push({ table, rows: newRows });
          return resolve(wantsSelect ? { data: newRows, error: null } : { error: null });
        }
        if (opType === "update") {
          const matched = [];
          tableData[table] = tableData[table].map((row) => {
            const matches = state.eqFilters.every(
              ({ col, val }) => String(row[col] ?? "") === val
            );
            if (!matches) return row;
            const next = { ...row, ...opData };
            matched.push(next);
            return next;
          });
          return resolve(wantsSelect ? { data: matched, error: null } : { error: null });
        }
        return resolve({ data: null, error: null });
      }
    };
    return builder;
  }

  return {
    supabase: {
      from(table) {
        return {
          select() {
            return makeBuilder(table, "select", null);
          },
          insert(data) {
            return makeBuilder(table, "insert", data);
          },
          update(fields) {
            return makeBuilder(table, "update", fields);
          }
        };
      }
    },
    tableData,
    capturedInserts
  };
}

function makeA() {
  return {
    id: RESULT_A,
    organization_id: ORG_ID,
    takeoff_job_id: JOB_ID,
    quote_id: null,
    schema_version: "1.0",
    raw_ai_result_json: { _meta: { clientMutationRevision: 1 } },
    normalized_takeoff_json: draft(false, "result-A"),
    computed_measurements_json: { countertopExactSf: 88.5, backsplashExactSf: 0 },
    validation_diagnostics_json: { errorCount: 0, warningCount: 0, hasErrors: false },
    import_plan_json: { canImport: true, items: [] },
    review_status: "needs_review",
    created_at: "2026-07-21T10:00:00.000Z"
  };
}

// Source contract: no synthetic promotion in production service
{
  const svc = readFileSync(
    join(root, "backend-core/src/takeoff/takeoffWorkspaceService.mjs"),
    "utf8"
  );
  assert.equal(/promoting result_summary head|summaryOnlyPromotion: true/.test(svc), false);
  assert.match(svc, /takeoff_result_persistence_failed/);
  assert.match(svc, /takeoff_result_not_persisted/);
  assert.match(svc, /assertPhysicalTakeoffResult/);
  console.log("ok: 1 — no synthetic canonical ID promotion in service");
}

// Insert failure structured
{
  const { supabase, tableData, capturedInserts } = makeMock({
    resultRows: [makeA()],
    insertError: {
      code: "23502",
      message: 'null value in column "quote_id" violates not-null constraint'
    }
  });
  tableData.quote_takeoff_jobs[0].result_summary = {
    resultRowId: RESULT_A,
    clientMutationRevision: 1
  };
  await assert.rejects(
    () =>
      saveTakeoffCorrection({
        supabase,
        organizationId: ORG_ID,
        userId: USER_ID,
        takeoffJobId: JOB_ID,
        takeoffResult: draft(true, "corrected-result-B"),
        baseResultId: RESULT_A,
        clientMutationRevision: 2
      }),
    (e) => e.code === "takeoff_result_persistence_failed" && e.statusCode === 503
  );
  assert.equal(capturedInserts.length, 0);
  assert.equal(tableData.quote_takeoff_jobs[0].result_summary.resultRowId, RESULT_A);
  assert.equal(tableData.quote_takeoff_jobs[0].result_summary.clientMutationRevision, 1);
  console.log("ok: 2–6 insert failure preserves pointer/revision; no synthetic ID");
}

// Physical save A→B + consumers
{
  const { supabase, tableData, capturedInserts } = makeMock({
    resultRows: [makeA()],
    resultInsertIds: [RESULT_B]
  });
  const corrected = draft(true, "corrected-result-B");
  const saved = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: corrected,
    baseResultId: RESULT_A,
    clientMutationRevision: 2,
    reviewState: reviewState(corrected)
  });
  assert.equal(saved.resultId, RESULT_B);
  assert.equal(saved.unchanged, false);
  assert.ok(tableData.quote_takeoff_results.some((r) => r.id === RESULT_B));
  assert.equal(tableData.quote_takeoff_jobs[0].result_summary.resultRowId, RESULT_B);
  assert.equal(
    tableData.quote_takeoff_results.find((r) => r.id === RESULT_B).quote_id,
    null,
    "Studio job with no legacy quote → quote_id null"
  );
  assert.equal(capturedInserts.length, 1);

  const latest = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID
  });
  assert.equal(latest.resultId, RESULT_B);
  assert.equal(latest.normalizedTakeoffJson.rooms[0].areas[0].runs[0].notes, "corrected-result-B");
  assert.equal(
    latest.normalizedTakeoffJson.rooms[0].areas[0].runs[0].backsplashEligible,
    true
  );

  const byId = await getResultById({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
    resultId: RESULT_B
  });
  assert.equal(byId.resultId, RESULT_B);
  assert.equal(byId.normalizedTakeoffJson.rooms[0].areas[0].runs[0].notes, "corrected-result-B");
  console.log("ok: 8–18 physical B save/reload/getResultById");
}

// Second save B→C + A-like content
{
  const { supabase, tableData } = makeMock({
    resultRows: [makeA()],
    resultInsertIds: [RESULT_B, RESULT_C]
  });
  const b = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: draft(true, "B"),
    baseResultId: RESULT_A,
    clientMutationRevision: 2
  });
  await new Promise((r) => setTimeout(r, 2));
  const c = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: draft(false, "result-A-like"),
    baseResultId: b.resultId,
    clientMutationRevision: 3
  });
  assert.equal(c.resultId, RESULT_C);
  assert.notEqual(c.resultId, RESULT_A);
  assert.equal(tableData.quote_takeoff_jobs[0].result_summary.resultRowId, RESULT_C);
  const latest = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID
  });
  assert.equal(latest.resultId, RESULT_C);
  assert.equal(latest.normalizedTakeoffJson.rooms[0].areas[0].runs[0].notes, "result-A-like");
  console.log("ok: 26–40 A→B→A-like physical C");
}

// Approval + scope seed from physical B
{
  const { supabase, tableData } = makeMock({
    resultRows: [makeA()],
    resultInsertIds: [RESULT_B]
  });
  const corrected = draft(true, "corrected-result-B");
  const saved = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: corrected,
    baseResultId: RESULT_A,
    clientMutationRevision: 2,
    reviewState: reviewState(corrected)
  });
  assert.equal(saved.resultId, RESULT_B);

  const approved = await approveAndBuildEstimate({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: null,
    reviewState: reviewState(corrected),
    confirmAdvisories: true
  });
  assert.equal(approved.reviewStatus, "approved");
  assert.equal(approved.approvedResultId, RESULT_B);
  const physicalB = tableData.quote_takeoff_results.find((r) => r.id === RESULT_B);
  assert.equal(physicalB.review_status, "approved");
  const physicalA = tableData.quote_takeoff_results.find((r) => r.id === RESULT_A);
  assert.equal(physicalA.review_status, "needs_review");
  assert.equal(tableData.quote_takeoff_jobs[0].result_summary.resultRowId, RESULT_B);
  assert.equal(tableData.quote_takeoff_jobs[0].result_summary.clientMutationRevision, 2);

  const after = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID
  });
  assert.equal(after.resultId, RESULT_B);
  assert.equal(after.normalizedTakeoffJson.rooms[0].areas[0].runs[0].notes, "corrected-result-B");
  assert.equal(after.reviewStatus, "approved");

  const scope = seedScopeFromTakeoffPayload(approved.importPayload, null);
  assert.ok(scope.rooms?.length >= 1);
  const pieceNotes = JSON.stringify(scope);
  assert.equal(pieceNotes.includes("result-A"), false);
  assert.ok(approved.importPayload.takeoffResultId === RESULT_B);
  console.log("ok: 41–55 approve physical B + scope seeds B; A remains historical");
}

// Migration file present (not applied)
{
  const sql = readFileSync(
    join(root, "backend-core/supabase/eliteos_quote_takeoff_results_quote_id_nullable_v1.sql"),
    "utf8"
  );
  assert.match(sql, /ALTER COLUMN quote_id DROP NOT NULL/);
  assert.match(sql, /DO NOT APPLY AUTOMATICALLY/);
  console.log("ok: Path B migration file present (manual apply)");
}

console.log("\nAll physical Takeoff result persistence tests passed.\n");
