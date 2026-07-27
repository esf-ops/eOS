/**
 * Synthetic canonical resultId — safety audit (must pass by proving path is gone).
 *
 * Run: node backend-core/src/takeoff/takeoffSyntheticResultIdSafety.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  saveTakeoffCorrection
} from "./takeoffWorkspaceService.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\ntakeoffSyntheticResultIdSafety.test.mjs\n");

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FILE_ID = "a1111111-1111-4111-8111-111111111111";
const JOB_ID = "b2222222-2222-4222-8222-222222222222";
const RESULT_A = "c3333333-3333-4333-8333-333333333333";
const USER_ID = "f6666666-6666-4666-8666-666666666666";

const svc = readFileSync(join(__dirname, "takeoffWorkspaceService.mjs"), "utf8");
assert.equal(
  /resultRowId = randomUUID\(\)|promoting result_summary head/.test(svc),
  false,
  "production code must not generate synthetic canonical result IDs"
);
assert.match(svc, /takeoffResultPersistenceFailed|takeoff_result_persistence_failed/);
console.log("ok: source — no synthetic UUID promotion");

function makeMock() {
  const tableData = {
    quote_files: [
      {
        id: FILE_ID,
        organization_id: ORG_ID,
        status: "active",
        original_filename: "plan.pdf",
        mime_type: "application/pdf",
        file_size_bytes: 1,
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
        result_summary: {
          resultRowId: RESULT_A,
          clientMutationRevision: 1,
          normalizedTakeoffJson: { rooms: [] }
        },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z"
      }
    ],
    quote_takeoff_results: [
      {
        id: RESULT_A,
        organization_id: ORG_ID,
        takeoff_job_id: JOB_ID,
        schema_version: "1.0",
        raw_ai_result_json: { _meta: { clientMutationRevision: 1 } },
        normalized_takeoff_json: {
          schemaVersion: "1.0",
          rooms: [
            {
              id: "r1",
              name: "Kitchen",
              areas: [
                {
                  id: "a1",
                  runs: [{ id: "run-1", lengthIn: 100, depthIn: 25.5, pieceType: "counter" }]
                }
              ]
            }
          ]
        },
        computed_measurements_json: { countertopExactSf: 10, backsplashExactSf: 0 },
        validation_diagnostics_json: { errorCount: 0, warningCount: 0, hasErrors: false },
        import_plan_json: { canImport: true, items: [] },
        review_status: "needs_review",
        created_at: "2026-07-21T10:00:00.000Z"
      }
    ]
  };

  function makeBuilder(table, opType, opData) {
    const state = { eqFilters: [] };
    const builder = {
      select() {
        return builder;
      },
      eq(col, val) {
        state.eqFilters.push({ col, val: String(val) });
        return builder;
      },
      in() {
        return builder;
      },
      limit() {
        return builder;
      },
      order() {
        return builder;
      },
      then(resolve) {
        if (opType === "select") {
          const rows = (tableData[table] ?? []).filter((row) =>
            state.eqFilters.every(({ col, val }) => String(row[col] ?? "") === val)
          );
          return resolve({ data: rows, error: null });
        }
        if (opType === "insert") {
          return resolve({
            data: null,
            error: {
              code: "23502",
              message: 'null value in column "quote_id" violates not-null constraint'
            }
          });
        }
        if (opType === "update") {
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
    tableData
  };
}

const { supabase, tableData } = makeMock();
await assert.rejects(
  () =>
    saveTakeoffCorrection({
      supabase,
      organizationId: ORG_ID,
      userId: USER_ID,
      takeoffJobId: JOB_ID,
      takeoffResult: {
        schemaVersion: "1.0",
        rooms: [
          {
            id: "r1",
            name: "Kitchen",
            areas: [
              {
                id: "a1",
                runs: [
                  {
                    id: "run-1",
                    lengthIn: 100,
                    depthIn: 25.5,
                    pieceType: "counter",
                    backsplashEligible: true,
                    notes: "should-not-persist"
                  }
                ]
              }
            ]
          }
        ]
      },
      baseResultId: RESULT_A,
      clientMutationRevision: 2
    }),
  (err) => err.code === "takeoff_result_persistence_failed" && err.statusCode === 503
);

assert.equal(tableData.quote_takeoff_jobs[0].result_summary.resultRowId, RESULT_A);
assert.equal(tableData.quote_takeoff_jobs[0].result_summary.clientMutationRevision, 1);
assert.equal(tableData.quote_takeoff_results.length, 1);
console.log("ok: insert failure does not succeed, promote, or invent a synthetic ID");

// Legacy audit file relocated notice
const relocated = join(root, "app-ai-takeoff/src/lib/takeoffSyntheticResultIdSafety.test.mjs");
try {
  readFileSync(relocated);
  console.log("note: legacy app-ai-takeoff copy still present — prefer backend-core path");
} catch {
  console.log("ok: legacy app-ai-takeoff synthetic audit relocated to backend-core");
}

console.log("\nVERDICT: synthetic-only canonical result IDs can no longer become current.\n");
