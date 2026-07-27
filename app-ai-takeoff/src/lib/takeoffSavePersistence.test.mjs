/**
 * Takeoff Save draft persistence + canonical reload authority.
 *
 * Exercises real saveTakeoffCorrection + getLatestTakeoffResult with in-memory
 * mock Supabase — the same service/read-model boundary production uses.
 *
 * Run: npm run eos:test:takeoff-save-persistence
 */
import assert from "node:assert/strict";
import {
  getLatestTakeoffResult,
  saveTakeoffCorrection
} from "../../../backend-core/src/takeoff/takeoffWorkspaceService.mjs";
import { selectAuthoritativeTakeoffResult } from "../../../backend-core/src/takeoff/takeoffAuthoritativeResult.mjs";
import { takeoffDraftsSemanticallyEqual } from "../../../backend-core/src/takeoff/takeoffDraftEquality.mjs";
import {
  applyLocalBacksplashToggle,
  applyLocalExposedEdgeConfirm,
  isTakeoffWorksheetDirty,
  nextExplicitMutationRevision,
  reconcileSuccessfulTakeoffSave,
  saveTakeoffDraftExplicit
} from "./takeoffExplicitSave.mjs";
import { buildFinishedEdgeFromExposedSides } from "../../../backend-core/src/takeoff/takeoffExposedEdges.mjs";

console.log("\ntakeoffSavePersistence.test.mjs\n");

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FILE_ID = "a1111111-1111-4111-8111-111111111111";
const JOB_ID = "b2222222-2222-4222-8222-222222222222";
const RESULT_A = "c3333333-3333-4333-8333-333333333333";
const RESULT_B = "d4444444-4444-4444-8444-444444444444";
const RESULT_C = "e5555555-5555-4555-8555-555555555555";
const USER_ID = "f6666666-6666-4666-8666-666666666666";
const STALE_BASE = "13333333-3333-4333-8333-333333333333";

function fivePieceDraft(backsplashAll = false) {
  const runs = [1, 2, 3, 4, 5].map((n) => ({
    id: `run-${n}`,
    label: `Piece ${n}`,
    pieceType: "counter",
    lengthIn: 40 + n,
    depthIn: 25.5,
    quantity: 1,
    backsplashEligible: backsplashAll,
    ...(backsplashAll
      ? {
          backsplashEligibilitySource: "estimator_confirmed",
          backsplashEligibilityUpdatedAt: "2026-07-21T16:00:00.000Z",
          backsplashEligibleLengthIn: 40 + n
        }
      : {}),
    finishedEdge: null,
    notes: "",
    cutouts: []
  }));
  return {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        roomType: "Kitchen",
        areas: [
          {
            id: "area-1",
            label: "Main",
            backsplashIncluded: true,
            backsplashHeightIn: 4,
            runs
          }
        ]
      }
    ]
  };
}

function makeFileRow() {
  return {
    id: FILE_ID,
    organization_id: ORG_ID,
    status: "active",
    original_filename: "plan.pdf",
    file_role: "cabinet_plan",
    visibility: "internal",
    mime_type: "application/pdf",
    file_size_bytes: 100,
    created_at: "2026-06-01T00:00:00.000Z",
    metadata: {}
  };
}

function makeJobRow(overrides = {}) {
  return {
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
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

function makeResultRow(id, takeoff, overrides = {}) {
  return {
    id,
    organization_id: ORG_ID,
    takeoff_job_id: JOB_ID,
    schema_version: "1.0",
    raw_ai_result_json: {
      _meta: {
        provider: "openai",
        ...(overrides.clientMutationRevision
          ? { clientMutationRevision: overrides.clientMutationRevision }
          : {})
      }
    },
    normalized_takeoff_json: takeoff,
    computed_measurements_json: { countertopExactSf: 10, backsplashExactSf: 0 },
    validation_diagnostics_json: { errorCount: 0, warningCount: 0, hasErrors: false },
    import_plan_json: { canImport: true, items: [] },
    review_status: "needs_review",
    created_at: overrides.created_at ?? "2026-06-01T01:00:00.000Z",
    ...overrides
  };
}

function makeMockSupabase({
  jobRow,
  resultRows = [],
  resultInsertIds = [RESULT_B, RESULT_C],
  insertError = null,
  capturedInserts = []
} = {}) {
  const tableData = {
    quote_files: [makeFileRow()],
    quote_takeoff_jobs: [jobRow],
    quote_takeoff_results: [...resultRows],
    quote_file_events: []
  };
  let insertCount = 0;

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
          if (insertError) return resolve({ data: null, error: insertError });
          const arr = Array.isArray(opData) ? opData : [opData];
          const now = new Date().toISOString();
          const newRows = arr.map((r) => {
            const id = r.id ?? resultInsertIds[insertCount++] ?? `mock-${insertCount}`;
            return { created_at: now, updated_at: now, ...r, id };
          });
          tableData[table].push(...newRows);
          capturedInserts.push({ table, rows: [...newRows] });
          return resolve(wantsSelect ? { data: newRows, error: null } : { error: null });
        }
        if (opType === "update") {
          tableData[table] = tableData[table].map((row) => {
            const matches = state.eqFilters.every(
              ({ col, val }) => String(row[col] ?? "") === val
            );
            return matches ? { ...row, ...opData } : row;
          });
          return resolve({ error: null });
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

function assertAllBacksplash(takeoff, expected) {
  const runs = takeoff.rooms[0].areas[0].runs;
  assert.equal(runs.length, 5);
  for (const run of runs) {
    assert.equal(
      run.backsplashEligible === true,
      expected,
      `${run.id} backsplashEligible expected ${expected}`
    );
  }
}

// ─── SAVE / RELOAD: A → B with all-five backsplash ───────────────────────────
{
  const draftA = fivePieceDraft(false);
  const capturedInserts = [];
  const { supabase, tableData } = makeMockSupabase({
    jobRow: makeJobRow(),
    resultRows: [makeResultRow(RESULT_A, draftA)],
    resultInsertIds: [RESULT_B],
    capturedInserts
  });

  let local = structuredClone(draftA);
  for (const run of local.rooms[0].areas[0].runs) {
    local = applyLocalBacksplashToggle(
      local,
      { roomId: "room-1", areaId: "area-1", runId: run.id },
      true,
      run.lengthIn
    );
  }
  assert.equal(
    isTakeoffWorksheetDirty({
      localDraft: local,
      canonicalDraft: draftA,
      localExcludedRunIds: [],
      canonicalExcludedRunIds: []
    }),
    true
  );

  const saved = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: local,
    baseResultId: RESULT_A,
    clientMutationRevision: 1
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.unchanged, false);
  assert.equal(saved.resultId, RESULT_B);
  assert.equal(saved.clientMutationRevision, 1);
  assertAllBacksplash(saved.normalizedTakeoffJson, true);
  assertAllBacksplash(saved.takeoffResult, true);
  assert.equal(
    tableData.quote_takeoff_jobs[0].result_summary.resultRowId,
    RESULT_B,
    "result_summary promotes B"
  );

  const adopted = reconcileSuccessfulTakeoffSave({
    response: saved,
    healDraft: (d) => d,
    fallbackDraft: local,
    excludedRunIds: []
  });
  assert.equal(adopted.resultId, RESULT_B);
  assert.equal(adopted.clientMutationRevision, 1);
  assert.equal(
    isTakeoffWorksheetDirty({
      localDraft: adopted.draft,
      canonicalDraft: adopted.canonicalDraft,
      localExcludedRunIds: [],
      canonicalExcludedRunIds: []
    }),
    false,
    "hydrated worksheet clean after success"
  );

  const reloaded = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID
  });
  assert.equal(reloaded.resultId, RESULT_B, "production reload returns B");
  assertAllBacksplash(reloaded.normalizedTakeoffJson, true);
  assert.equal(reloaded.clientMutationRevision, 1);
  console.log("ok: save/reload — A→B all-five backsplash + atomic reconcile");
}

// ─── UNCHANGED SAVE: no-op, no new row, no 409 ───────────────────────────────
{
  const draftB = fivePieceDraft(true);
  const capturedInserts = [];
  const { supabase, tableData } = makeMockSupabase({
    jobRow: makeJobRow({
      result_summary: {
        resultRowId: RESULT_B,
        clientMutationRevision: 1,
        lastCorrectionId: "corr-1",
        savedAt: "2026-07-21T17:00:00.000Z",
        normalizedTakeoffJson: draftB,
        estimatorConfirmed: { confirmedAt: "2026-07-21T17:00:00.000Z" }
      }
    }),
    resultRows: [
      makeResultRow(RESULT_B, draftB, {
        clientMutationRevision: 1,
        created_at: "2026-07-21T17:00:00.000Z",
        raw_ai_result_json: {
          _corrections: [{ id: "corr-1" }],
          _meta: {
            estimatorConfirmed: { confirmedAt: "2026-07-21T17:00:00.000Z" },
            clientMutationRevision: 1
          }
        }
      })
    ],
    resultInsertIds: [RESULT_C],
    capturedInserts
  });
  const beforeCount = tableData.quote_takeoff_results.length;
  const noop = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: structuredClone(draftB),
    baseResultId: RESULT_B,
    clientMutationRevision: 2
  });
  assert.equal(noop.ok, true);
  assert.equal(noop.unchanged, true);
  assert.equal(noop.resultId, RESULT_B);
  assert.equal(noop.clientMutationRevision, 1, "unchanged does not bump revision");
  assert.equal(tableData.quote_takeoff_results.length, beforeCount);
  assert.equal(capturedInserts.length, 0);
  console.log("ok: unchanged Save — idempotent, zero inserts, no 409");
}

// ─── Client skip when clean ──────────────────────────────────────────────────
{
  let posts = 0;
  const draft = fivePieceDraft(false);
  await saveTakeoffDraftExplicit({
    saveCorrection: async () => {
      posts += 1;
      return {};
    },
    takeoffResult: draft,
    baseResultId: RESULT_A,
    clientMutationRevision: 1,
    reviewState: {},
    canonicalDraft: draft,
    skipIfUnchanged: true
  });
  assert.equal(posts, 0);
  console.log("ok: client unchanged Save — zero POSTs");
}

// ─── A → B → A-like content → C ──────────────────────────────────────────────
{
  const draftA = fivePieceDraft(false);
  const capturedInserts = [];
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow(),
    resultRows: [makeResultRow(RESULT_A, draftA)],
    resultInsertIds: [RESULT_B, RESULT_C],
    capturedInserts
  });

  const withBs = fivePieceDraft(true);
  const savedB = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: withBs,
    baseResultId: RESULT_A,
    clientMutationRevision: 1
  });
  assert.equal(savedB.resultId, RESULT_B);
  assertAllBacksplash(
    (
      await getLatestTakeoffResult({
        supabase,
        organizationId: ORG_ID,
        takeoffJobId: JOB_ID
      })
    ).normalizedTakeoffJson,
    true
  );

  await new Promise((r) => setTimeout(r, 2));
  const backToA = fivePieceDraft(false);
  const savedC = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: backToA,
    baseResultId: RESULT_B,
    clientMutationRevision: 2
  });
  assert.equal(savedC.resultId, RESULT_C);
  assert.notEqual(savedC.resultId, RESULT_A);
  const latest = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID
  });
  assert.equal(latest.resultId, RESULT_C);
  assertAllBacksplash(latest.normalizedTakeoffJson, false);
  assert.equal(capturedInserts.length, 2);
  console.log("ok: A→B→A-like creates C without 409");
}

// ─── Insert failure must NOT synthesize a result ID ──────────────────────────
{
  const oldEstimatorDraft = fivePieceDraft(false);
  const newDraft = fivePieceDraft(true);
  const oldRow = makeResultRow(RESULT_A, oldEstimatorDraft, {
    created_at: "2026-07-21T10:00:00.000Z",
    raw_ai_result_json: {
      _corrections: [{ id: "old" }],
      _meta: {
        estimatorConfirmed: { confirmedAt: "2026-07-21T10:00:00.000Z" },
        clientMutationRevision: 48
      }
    }
  });
  const priorSummary = {
    resultRowId: RESULT_A,
    clientMutationRevision: 48,
    lastCorrectionId: "old",
    normalizedTakeoffJson: oldEstimatorDraft
  };
  const capturedInserts = [];
  const { supabase, tableData } = makeMockSupabase({
    jobRow: makeJobRow({ result_summary: priorSummary }),
    resultRows: [oldRow],
    resultInsertIds: [],
    insertError: {
      code: "23502",
      message: 'null value in column "quote_id" violates not-null constraint'
    },
    capturedInserts
  });

  await assert.rejects(
    () =>
      saveTakeoffCorrection({
        supabase,
        organizationId: ORG_ID,
        userId: USER_ID,
        takeoffJobId: JOB_ID,
        takeoffResult: newDraft,
        baseResultId: RESULT_A,
        clientMutationRevision: 49
      }),
    (err) =>
      err.statusCode === 503 && err.code === "takeoff_result_persistence_failed",
    "insert failure must be structured Save failure"
  );
  assert.equal(capturedInserts.length, 0);
  assert.equal(
    tableData.quote_takeoff_jobs[0].result_summary.resultRowId,
    RESULT_A,
    "current pointer must not change on insert failure"
  );
  assert.equal(
    tableData.quote_takeoff_jobs[0].result_summary.clientMutationRevision,
    48,
    "revision must not increment on insert failure"
  );
  console.log("ok: insert failure → takeoff_result_persistence_failed; no synthetic ID");
}

// ─── Newer result_summary still beats older estimator row on reload ──────────
{
  const older = makeResultRow(RESULT_A, fivePieceDraft(false), {
    created_at: "2026-07-21T10:00:00.000Z",
    raw_ai_result_json: {
      _corrections: [{ id: "old" }],
      _meta: {
        estimatorConfirmed: { confirmedAt: "2026-07-21T10:00:00.000Z" },
        clientMutationRevision: 1
      }
    }
  });
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow({
      result_summary: {
        resultRowId: RESULT_B,
        clientMutationRevision: 2,
        lastCorrectionId: "corr-new",
        savedAt: "2026-07-21T12:00:00.000Z",
        normalizedTakeoffJson: fivePieceDraft(true),
        estimatorConfirmed: { confirmedAt: "2026-07-21T12:00:00.000Z" }
      }
    }),
    resultRows: [
      older,
      makeResultRow(RESULT_B, fivePieceDraft(true), {
        created_at: "2026-07-21T12:00:00.000Z",
        raw_ai_result_json: {
          _corrections: [{ id: "corr-new" }],
          _meta: {
            estimatorConfirmed: { confirmedAt: "2026-07-21T12:00:00.000Z" },
            clientMutationRevision: 2
          }
        }
      })
    ]
  });
  const latest = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID
  });
  assert.equal(latest.resultId, RESULT_B);
  assertAllBacksplash(latest.normalizedTakeoffJson, true);
  console.log("ok: physical B via result_summary.resultRowId wins over older A");
}

// ─── Exposed edges + notes round-trip ───────────────────────────────────────
{
  let draft = fivePieceDraft(false);
  const edge = buildFinishedEdgeFromExposedSides({
    lengthIn: 41,
    depthIn: 25.5,
    quantity: 1,
    exposedSides: { front: true, back: false, left: true, right: false }
  });
  draft = applyLocalExposedEdgeConfirm(
    draft,
    { roomId: "room-1", areaId: "area-1", runId: "run-1" },
    edge
  );
  draft.rooms[0].areas[0].runs[0].notes = "island overhang";
  draft.rooms[0].areas[0].runs[0].cutouts = [{ type: "sink", count: 1, notes: "" }];
  draft = applyLocalBacksplashToggle(
    draft,
    { roomId: "room-1", areaId: "area-1", runId: "run-2" },
    true,
    42
  );

  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow(),
    resultRows: [makeResultRow(RESULT_A, fivePieceDraft(false))],
    resultInsertIds: [RESULT_B]
  });
  const saved = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: draft,
    baseResultId: RESULT_A,
    clientMutationRevision: 1
  });
  const latest = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID
  });
  const run1 = latest.normalizedTakeoffJson.rooms[0].areas[0].runs[0];
  const run2 = latest.normalizedTakeoffJson.rooms[0].areas[0].runs[1];
  assert.equal(run1.notes, "island overhang");
  assert.equal(run1.finishedEdge?.finishedEdgeConfirmed, true);
  assert.equal(run1.cutouts[0].type, "sink");
  assert.equal(run2.backsplashEligible, true);
  assert.equal(saved.resultId, latest.resultId);
  console.log("ok: exposed edges / notes / cutouts / backsplash round-trip");
}

// ─── Real stale tab still 409s ───────────────────────────────────────────────
{
  const draftA = fivePieceDraft(false);
  const { supabase } = makeMockSupabase({
    jobRow: makeJobRow(),
    resultRows: [makeResultRow(RESULT_A, draftA)],
    resultInsertIds: [RESULT_B]
  });
  await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: fivePieceDraft(true),
    baseResultId: RESULT_A,
    clientMutationRevision: 1
  });
  await assert.rejects(
    () =>
      saveTakeoffCorrection({
        supabase,
        organizationId: ORG_ID,
        userId: USER_ID,
        takeoffJobId: JOB_ID,
        takeoffResult: fivePieceDraft(false),
        baseResultId: RESULT_A,
        clientMutationRevision: 2
      }),
    (err) =>
      err.statusCode === 409 &&
      err.code === "stale_takeoff_correction" &&
      err.latestResultId === RESULT_B,
    "tab B stale base must 409"
  );
  const latest = await getLatestTakeoffResult({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID
  });
  assert.equal(latest.resultId, RESULT_B);
  assertAllBacksplash(latest.normalizedTakeoffJson, true);
  console.log("ok: two-tab stale Save returns 409; B remains current");
}

// ─── Zero side effects on Save ───────────────────────────────────────────────
{
  const { supabase, tableData } = makeMockSupabase({
    jobRow: makeJobRow({ review_status: "needs_review" }),
    resultRows: [makeResultRow(RESULT_A, fivePieceDraft(false))],
    resultInsertIds: [RESULT_B]
  });
  const saved = await saveTakeoffCorrection({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: fivePieceDraft(true),
    baseResultId: RESULT_A,
    clientMutationRevision: 1
  });
  assert.equal(saved.reviewStatus, "needs_review");
  assert.equal(tableData.quote_takeoff_jobs[0].review_status, "needs_review");
  assert.equal(tableData.quote_takeoff_jobs[0].result_summary.approvedAt, null);
  assert.ok(!("estimateId" in saved));
  assert.ok(!("publicationId" in saved));
  console.log("ok: Save does not approve Takeoff / estimate / publish");
}

// ─── Mutation revision authority ─────────────────────────────────────────────
{
  assert.equal(nextExplicitMutationRevision(48), 49);
  const adopted = reconcileSuccessfulTakeoffSave({
    response: { resultId: RESULT_B, clientMutationRevision: 49, normalizedTakeoffJson: fivePieceDraft(true) },
    healDraft: (d) => d,
    fallbackDraft: fivePieceDraft(false),
    excludedRunIds: []
  });
  assert.equal(adopted.clientMutationRevision, 49);
  assert.equal(nextExplicitMutationRevision(adopted.clientMutationRevision), 50);
  console.log("ok: mutation revision — request N+1, adopt server-confirmed N+1");
}

// ─── Semantic equality / authority helpers ───────────────────────────────────
{
  const a = fivePieceDraft(false);
  const b = structuredClone(a);
  b.rooms[0].areas[0].runs[0].backsplashEligible = undefined;
  assert.equal(takeoffDraftsSemanticallyEqual(a, b), true);
  const picked = selectAuthoritativeTakeoffResult(
    [makeResultRow(RESULT_A, fivePieceDraft(false))],
    {
      jobResultSummary: {
        resultRowId: RESULT_B,
        lastCorrectionId: "c",
        clientMutationRevision: 2,
        savedAt: "2026-07-21T18:00:00.000Z",
        normalizedTakeoffJson: fivePieceDraft(true),
        estimatorConfirmed: { confirmedAt: "2026-07-21T18:00:00.000Z" }
      }
    }
  );
  assert.equal(picked.row.id, RESULT_B);
  assertAllBacksplash(picked.row.normalized_takeoff_json, true);
  console.log("ok: semantic equality + authoritative selector");
}

console.log("\nAll takeoff save persistence tests passed.\n");
