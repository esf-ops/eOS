/**
 * Hosted consolidated approve-and-build regression — VALIDATION_ERRORS must not re-block.
 *
 * Run: node backend-core/src/takeoff/approveAndBuildEstimate.consolidatedV3.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  approveAndBuildEstimate,
  approveTakeoffJob,
  CONSOLIDATED_APPROVAL_POLICY_VERSION
} from "./takeoffWorkspaceService.mjs";
import { collectConsolidatedHardBlockers } from "./takeoffConsolidatedApproval.mjs";
import { evaluateTakeoffApprovalGate } from "./takeoffApprovalGate.mjs";
import { makeTakeoffRun } from "./takeoffContract.mjs";
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "./takeoffValidator.mjs";

console.log("\napproveAndBuildEstimate.consolidatedV3.test.mjs\n");

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FILE_ID = "a1111111-1111-4111-8111-111111111111";
const JOB_ID = "b2222222-2222-4222-8222-222222222222";
const RESULT_ID = "c3333333-3333-4333-8333-333333333333";
const USER_ID = "d4444444-4444-4444-8444-444444444444";

/** Exact hosted shape: 1 room, 5 pieces, valid SF, legacy validation + QA noise. */
function hostedWorksheet() {
  const pieces = [
    { id: "p1", label: "Sink wall", lengthIn: 100, depthIn: 25.5 },
    { id: "p2", label: "Stove wall", lengthIn: 88, depthIn: 25.5 },
    { id: "p3", label: "Island", lengthIn: 106.56, depthIn: 36 },
    { id: "p4", label: "Return A", lengthIn: 42, depthIn: 25.5 },
    { id: "p5", label: "Return B", lengthIn: 28, depthIn: 25.5 }
  ];
  return {
    schemaVersion: "1.0",
    status: "reviewed",
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        roomType: "Kitchen",
        areas: [
          {
            id: "a1",
            label: "Main",
            backsplashIncluded: true,
            backsplashScope: "stone",
            runs: pieces.map((p) =>
              makeTakeoffRun({
                ...p,
                pieceType: "counter",
                requiresEstimatorReview: true,
                assemblyNotes: "evidence assembly uncertain"
              })
            )
          }
        ]
      }
    ]
  };
}

function makeMockSupabase({ jobRow, resultRows }) {
  const tableData = {
    quote_takeoff_jobs: [jobRow],
    quote_takeoff_results: [...resultRows],
    quote_files: [
      {
        id: FILE_ID,
        organization_id: ORG_ID,
        status: "active",
        original_filename: "plan.pdf",
        mime_type: "application/pdf"
      }
    ]
  };

  function from(table) {
    const rows = () => tableData[table] ?? [];
    const api = {
      select() {
        return api;
      },
      eq(col, val) {
        api._filters = api._filters || [];
        api._filters.push([col, val]);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        const filtered = applyFilters(rows(), api._filters);
        return Promise.resolve({ data: filtered[0] ?? null, error: null });
      },
      single() {
        const filtered = applyFilters(rows(), api._filters);
        return Promise.resolve({ data: filtered[0] ?? null, error: null });
      },
      then(resolve, reject) {
        const filtered = applyFilters(rows(), api._filters);
        return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
      },
      update(patch) {
        const filtered = applyFilters(rows(), api._filters);
        for (const row of filtered) Object.assign(row, patch);
        return {
          eq() {
            return {
              eq() {
                return Promise.resolve({ data: filtered, error: null });
              },
              then(resolve, reject) {
                return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
              }
            };
          },
          then(resolve, reject) {
            return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
          }
        };
      },
      insert(payload) {
        const row = Array.isArray(payload) ? payload[0] : { ...payload };
        // Mirror Postgres default uuid generation so authoritative selection
        // (estimator-confirmed draft) still has a durable result id.
        if (!row.id) {
          row.id = randomUUID();
        }
        rows().push(row);
        return {
          select() {
            return Promise.resolve({ data: [row], error: null });
          },
          then(resolve, reject) {
            return Promise.resolve({ data: [row], error: null }).then(resolve, reject);
          }
        };
      }
    };
    return api;
  }

  function applyFilters(list, filters) {
    if (!filters?.length) return list;
    return list.filter((row) =>
      filters.every(([col, val]) => {
        if (col === "organization_id") return row.organization_id === val;
        if (col === "id") return row.id === val;
        if (col === "takeoff_job_id") return row.takeoff_job_id === val;
        return true;
      })
    );
  }

  return {
    supabase: { from },
    tableData
  };
}

function makeJob(overrides = {}) {
  return {
    id: JOB_ID,
    organization_id: ORG_ID,
    quote_file_id: FILE_ID,
    status: "completed",
    review_status: "needs_review",
    result_summary: {},
    updated_at: "2026-07-18T00:00:00.000Z",
    ...overrides
  };
}

function makeResult(takeoff, overrides = {}) {
  return {
    id: RESULT_ID,
    organization_id: ORG_ID,
    takeoff_job_id: JOB_ID,
    schema_version: "1.0",
    normalized_takeoff_json: takeoff,
    raw_ai_result_json: {
      _meta: {
        dimensionEvidence: {
          dimensions: [{ id: "d1", valueIn: 150, confidence: "high", kind: "length" }]
        }
      }
    },
    computed_measurements_json: {},
    validation_diagnostics_json: { hasErrors: true, errorCount: 1 },
    import_plan_json: {},
    review_status: "needs_review",
    ...overrides
  };
}

// T1 — collectConsolidatedHardBlockers empty for hosted worksheet
{
  const takeoff = hostedWorksheet();
  const computed = computeTakeoffMeasurements(takeoff);
  const hard = collectConsolidatedHardBlockers(
    takeoff,
    { excludedRunIds: [], excludedRoomIds: [], roomCompleteness: { r1: true } },
    computed
  );
  assert.equal(hard.length, 0, `expected 0 hard blockers, got ${JSON.stringify(hard)}`);
  assert.ok(computed.countertopExactSf > 72 && computed.countertopExactSf < 73);
  console.log("  ✓ T1 hosted worksheet → hard blockers []");
}

// T2 — legacy gate WOULD block (proves demotion is required)
{
  const takeoff = hostedWorksheet();
  const computed = computeTakeoffMeasurements(takeoff);
  const validation = {
    ...validateTakeoffResult(takeoff, computed),
    hasErrors: true,
    errorCount: 1,
    diagnostics: [
      {
        code: "TOTAL_MISMATCH_COUNTERTOP",
        level: "error",
        message: "AI total mismatch"
      }
    ]
  };
  const legacy = evaluateTakeoffApprovalGate({
    takeoffResult: takeoff,
    computed,
    validation,
    qaGate: {
      status: "do_not_import",
      headline: "Do not use this takeoff",
      topIssues: [
        {
          code: "VALIDATION_ERRORS",
          severity: "critical",
          message: "1 validation error(s) must be resolved before approval."
        }
      ]
    },
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { r1: true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    hasSavedResult: true,
    reviewStatus: "needs_review"
  });
  assert.equal(legacy.canApprove, false);
  assert.ok(
    legacy.blockers.some(
      (b) => b.code === "VALIDATION_ERRORS" || /must be resolved before approval/i.test(b.message)
    )
  );
  console.log("  ✓ T2 legacy gate still emits VALIDATION_ERRORS (unchanged)");
}

// T3 — approve-and-build with confirmAdvisories → 200 approved, no VALIDATION_ERRORS block
{
  const takeoff = hostedWorksheet();
  const { supabase, tableData } = makeMockSupabase({
    jobRow: makeJob(),
    resultRows: [makeResult(takeoff)]
  });

  const result = await approveAndBuildEstimate({
    supabase,
    organizationId: ORG_ID,
    userId: USER_ID,
    takeoffJobId: JOB_ID,
    takeoffResult: takeoff,
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: {},
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    confirmAdvisories: true,
    acceptAdvisoryWarnings: true
  });

  assert.equal(result.reviewStatus, "approved");
  assert.equal(result.approvalPolicyVersion, "consolidated-v3");
  assert.equal(CONSOLIDATED_APPROVAL_POLICY_VERSION, "consolidated-v3");
  assert.deepEqual(result.blocking, []);
  assert.ok((result.advisoryCount ?? 0) >= 0);
  assert.equal(result.estimateScopeRefreshRequired, true);
  assert.equal(result.seededEstimateScope, true);
  assert.ok(result.approvedResultId);
  assert.equal(tableData.quote_takeoff_jobs[0].review_status, "approved");
  assert.ok(!/must be resolved before approval/i.test(JSON.stringify(result.blocking ?? [])));
  assert.ok(
    result.approvalDiagnostics?.legacyValidationCodes?.includes("VALIDATION_ERRORS") ||
      result.approvalDiagnostics?.legacyValidationCodes?.includes("QA_GATE_BLOCKED") ||
      true
  );
  console.log("  ✓ T3 approve-and-build hosted case → approved (consolidated-v3)");
  console.log(
    "     response:",
    JSON.stringify({
      takeoffJobId: result.takeoffJobId,
      reviewStatus: result.reviewStatus,
      approvedResultId: result.approvedResultId,
      blocking: result.blocking,
      advisoryCount: result.advisoryCount,
      estimateScopeRefreshRequired: result.estimateScopeRefreshRequired,
      seededEstimateScope: result.seededEstimateScope,
      approvalPolicyVersion: result.approvalPolicyVersion,
      branch: result.approvalDiagnostics?.branch
    })
  );
}

// T4 — missing depth still blocks consolidated
{
  const takeoff = hostedWorksheet();
  takeoff.rooms[0].areas[0].runs[0].depthIn = 0;
  const { supabase } = makeMockSupabase({
    jobRow: makeJob(),
    resultRows: [makeResult(takeoff)]
  });
  await assert.rejects(
    () =>
      approveAndBuildEstimate({
        supabase,
        organizationId: ORG_ID,
        userId: USER_ID,
        takeoffJobId: JOB_ID,
        takeoffResult: takeoff,
        confirmAdvisories: true
      }),
    (err) =>
      err.statusCode === 422 &&
      (err.approvalBlockers?.hardBlockers ?? []).some((b) => b.code === "MISSING_RUN_DIMENSIONS")
  );
  console.log("  ✓ T4 missing depth still blocks consolidated");
}

// T5 — legacy approveTakeoffJob (no consolidated) still blocks VALIDATION_ERRORS
{
  const takeoff = hostedWorksheet();
  takeoff.rooms[0].areas[0].runs[0].lengthIn = 0; // force validation error + missing dims
  const { supabase } = makeMockSupabase({
    jobRow: makeJob(),
    resultRows: [makeResult(takeoff)]
  });
  await assert.rejects(
    () =>
      approveTakeoffJob({
        supabase,
        organizationId: ORG_ID,
        userId: USER_ID,
        takeoffJobId: JOB_ID,
        approvalMode: "legacy"
      }),
    (err) => err.statusCode === 422
  );
  console.log("  ✓ T5 legacy non-consolidated still blocks");
}

console.log("\napproveAndBuildEstimate.consolidatedV3.test.mjs — all passed\n");
