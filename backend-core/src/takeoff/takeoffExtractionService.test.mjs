/**
 * Tests for takeoffExtractionService — AI extraction orchestration.
 *
 * All tests use mocked AI providers and a mocked Supabase client.
 * No real OpenAI API calls are made. No real Supabase DB calls are made.
 *
 * Test coverage:
 *   1.  AI disabled → 403 (configOverride)
 *   2.  Invalid takeoffJobId (not UUID) → 400
 *   3.  Job not found (cross-org or missing) → 404
 *   4.  Job found but no quote_file_id → 400
 *   5.  File not found → 404
 *   6.  File belongs to different org → 403
 *   7.  File is deleted → 410
 *   8.  File is archived → 410
 *   9.  Storage download fails → 503
 *  10.  AI provider throws (e.g. 413 too large) → rethrows
 *  11.  AI returns invalid JSON → 422 extraction_failed
 *  12.  Valid AI JSON → recomputed server-side + inserted + completed
 *  13.  Valid AI JSON with quote_id NOT NULL error → falls back to result_summary
 *  14.  review_status is always 'needs_review' — never 'approved'
 *  15.  No quote mutation — quote_headers table never touched
 *  16.  storage_path never returned in response
 *  17.  Provider called with expected metadata (mimeType, originalFilename, promptVersion)
 */

import assert from "node:assert/strict";
import { runAiTakeoffExtraction } from "./takeoffExtractionService.mjs";
import { buildSpec73Fixture }     from "./fixtures/spec73.fixture.mjs";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID   = "11111111-1111-4111-8111-111111111111";
const JOB_ID   = "22222222-2222-4222-8222-222222222222";
const FILE_ID  = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";

const MOCK_JOB_ROW = {
  id:              JOB_ID,
  organization_id: ORG_ID,
  quote_file_id:   FILE_ID,
  status:          "pending",
  source_type:     "ai_takeoff_lab",
  metadata:        {},
};

const MOCK_FILE_ROW = {
  id:                FILE_ID,
  organization_id:   ORG_ID,
  status:            "active",
  storage_path:      `takeoff/${ORG_ID}/${JOB_ID}/plan.pdf`,
  storage_bucket:    "eliteos-quote-files",
  mime_type:         "application/pdf",
  original_filename: "kitchen_plan.pdf",
  file_size_bytes:   512000,
};

// ── Provider helpers ──────────────────────────────────────────────────────────

/**
 * A mock provider that succeeds with the Spec 73 fixture JSON.
 * Accepts a providerFn signature and returns ExtractionOutput.
 */
function makeSuccessProvider(overrides = {}) {
  const fixture = buildSpec73Fixture();
  return async ({ mimeType, originalFilename, promptVersion, modelName }) => ({
    rawText:     JSON.stringify(fixture),
    parsed:      fixture,
    parseError:  null,
    modelUsed:   modelName ?? "gpt-4o",
    usage:       { promptTokens: 200, completionTokens: 800 },
    _calledWith: { mimeType, originalFilename, promptVersion, modelName },
    ...overrides,
  });
}

/** A mock provider that returns invalid JSON. */
function makeInvalidJsonProvider() {
  return async () => ({
    rawText:    "This is not JSON at all.",
    parsed:     null,
    parseError: "Unexpected token T in JSON",
    modelUsed:  "gpt-4o",
    usage:      { promptTokens: 100, completionTokens: 50 },
  });
}

/** A mock provider that throws (e.g. file too large). */
function makeThrowingProvider(msg = "File too large", statusCode = 413) {
  return async () => {
    throw Object.assign(new Error(msg), { statusCode });
  };
}

// ── Supabase mock factory ──────────────────────────────────────────────────────

/**
 * Build a mock Supabase client for extraction service tests.
 *
 * @param {{
 *   jobRow?: object|null,
 *   fileRow?: object|null,
 *   resultInsertError?: object|null,
 *   trackMutations?: boolean
 * }} opts
 */
function makeSupabase({
  jobRow    = MOCK_JOB_ROW,
  fileRow   = MOCK_FILE_ROW,
  resultInsertError = null,
  trackMutations    = false,
} = {}) {
  const mutations = {
    jobUpdates:        [],
    resultInserts:     [],
    quoteHeaderTouched: false,
  };

  const db = {
    _mutations: mutations,

    from(table) {
      if (table === "quote_takeoff_jobs") {
        return {
          select() {
            return {
              eq(col1, val1) {
                return {
                  eq(col2, val2) {
                    return {
                      limit() {
                        const rows = (
                          jobRow &&
                          (col1 === "id" ? jobRow.id === val1 : true) &&
                          (col2 === "organization_id" ? jobRow.organization_id === val2 : true)
                        ) ? [jobRow] : [];
                        return Promise.resolve({ data: rows, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
          update(fields) {
            return {
              eq() {
                return {
                  eq() {
                    if (trackMutations) mutations.jobUpdates.push(fields);
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
          insert(payload) {
            return {
              select() {
                if (trackMutations) mutations.resultInserts.push(payload);
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      if (table === "quote_files") {
        return {
          select() {
            return {
              eq(col, val) {
                return {
                  limit() {
                    const rows = (fileRow && fileRow.id === val) ? [fileRow] : [];
                    return Promise.resolve({ data: rows, error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "quote_takeoff_results") {
        return {
          insert(payload) {
            return {
              select() {
                if (trackMutations) mutations.resultInserts.push(payload);
                if (resultInsertError) {
                  return Promise.resolve({ data: null, error: resultInsertError });
                }
                return Promise.resolve({
                  data: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", ...payload }],
                  error: null,
                });
              },
            };
          },
        };
      }

      if (table === "quote_headers") {
        // Should never be called.
        mutations.quoteHeaderTouched = true;
        const never = () => Promise.resolve({ data: null, error: null });
        return {
          select() { return { eq() { return { limit: never }; } }; },
          update() { return { eq() { return { eq: never }; } }; },
        };
      }

      // Unknown table — fail loudly so test catches it.
      const unknownErr = () => Promise.resolve({ data: null, error: { message: `Unknown table: ${table}` } });
      return {
        select() { return { eq() { return { eq() { return { limit: unknownErr }; } }; } }; },
      };
    },

    storage: {
      from(/* bucket */) {
        return {
          async download(/* path */) {
            const mockContent = Buffer.from("mock PDF content for test");
            const blob = new Blob([mockContent], { type: "application/pdf" });
            return { data: blob, error: null };
          },
        };
      },
    },
  };

  return db;
}

// ── Config helpers ────────────────────────────────────────────────────────────

const ENABLED_CONFIG  = { enabled: true,  providerName: "openai", modelName: "gpt-4o", apiKey: "sk-test" };
const DISABLED_CONFIG = { enabled: false, providerName: "openai", modelName: "gpt-4o", apiKey: null };

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    if (e.stack) console.error(e.stack.split("\n").slice(1, 4).join("\n"));
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("\ntakeoffExtractionService — tests\n");

// 1. AI disabled → 403
await test("AI disabled → 403", async () => {
  const supabase = makeSupabase();
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase,
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId: JOB_ID,
      configOverride: DISABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 403, "expected 403 statusCode");
      assert.match(e.message, /not enabled/i);
      return true;
    }
  );
});

// 2. Invalid takeoffJobId (not UUID) → 400
await test("invalid takeoffJobId → 400", async () => {
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase:     makeSupabase(),
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId: "not-a-uuid",
      configOverride: ENABLED_CONFIG,
      providerFn:   makeSuccessProvider(),
    }),
    (e) => {
      assert.equal(e.statusCode, 400);
      assert.match(e.message, /uuid/i);
      return true;
    }
  );
});

// 3. Job not found (missing or cross-org) → 404
await test("job not found → 404", async () => {
  const supabase = makeSupabase({ jobRow: null });
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase,
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeSuccessProvider(),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 404);
      assert.match(e.message, /not found/i);
      return true;
    }
  );
});

// 4. Job found but no quote_file_id → 400
await test("job without quote_file_id → 400", async () => {
  const supabase = makeSupabase({
    jobRow: { ...MOCK_JOB_ROW, quote_file_id: null },
  });
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase,
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeSuccessProvider(),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 400);
      assert.match(e.message, /no source file/i);
      return true;
    }
  );
});

// 5. File not found → 404
await test("source file not found → 404", async () => {
  const supabase = makeSupabase({ fileRow: null });
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase,
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeSuccessProvider(),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 404);
      assert.match(e.message, /not found/i);
      return true;
    }
  );
});

// 6. File belongs to different org → 403
await test("file org mismatch → 403", async () => {
  const supabase = makeSupabase({
    fileRow: { ...MOCK_FILE_ROW, organization_id: OTHER_ORG },
  });
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase,
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeSuccessProvider(),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 403);
      assert.match(e.message, /does not belong/i);
      return true;
    }
  );
});

// 7. File deleted → 410
await test("file deleted → 410", async () => {
  const supabase = makeSupabase({
    fileRow: { ...MOCK_FILE_ROW, status: "deleted" },
  });
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase,
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeSuccessProvider(),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 410);
      return true;
    }
  );
});

// 8. File archived → 410
await test("file archived → 410", async () => {
  const supabase = makeSupabase({
    fileRow: { ...MOCK_FILE_ROW, status: "archived" },
  });
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase,
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeSuccessProvider(),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 410);
      return true;
    }
  );
});

// 9. Storage download fails → 503
await test("storage download failure → 503", async () => {
  const supabaseWithBadStorage = makeSupabase();
  // Override storage to simulate failure.
  supabaseWithBadStorage.storage = {
    from() {
      return {
        download() {
          return Promise.resolve({ data: null, error: { message: "Access denied" } });
        },
      };
    },
  };
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase:       supabaseWithBadStorage,
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeSuccessProvider(),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 503);
      assert.match(e.message, /retrieve source file/i);
      return true;
    }
  );
});

// 10. AI provider throws (e.g. file too large) → rethrows with original status
await test("provider throws → error propagated", async () => {
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase:       makeSupabase(),
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeThrowingProvider("File too large for AI", 413),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 413);
      assert.match(e.message, /too large/i);
      return true;
    }
  );
});

// 11. AI returns invalid JSON → 422 extraction_failed
await test("invalid AI JSON → 422 extraction_failed", async () => {
  await assert.rejects(
    () => runAiTakeoffExtraction({
      supabase:       makeSupabase(),
      organizationId: ORG_ID,
      userId: null,
      takeoffJobId:   JOB_ID,
      providerFn:     makeInvalidJsonProvider(),
      configOverride: ENABLED_CONFIG,
    }),
    (e) => {
      assert.equal(e.statusCode, 422);
      assert.equal(e.code, "extraction_failed");
      assert.match(e.message, /invalid json/i);
      return true;
    }
  );
});

// 12. Valid AI JSON → success — recomputed server-side, result inserted, job = completed
await test("valid AI JSON → success with server-side recompute", async () => {
  const supabase = makeSupabase({ trackMutations: true });
  const result = await runAiTakeoffExtraction({
    supabase,
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn:     makeSuccessProvider(),
    configOverride: ENABLED_CONFIG,
  });

  assert.equal(result.ok, true, "ok should be true");
  assert.equal(result.reviewStatus, "needs_review", "review_status must be needs_review");
  assert.ok(result.normalizedTakeoffJson, "normalizedTakeoffJson must be present");
  assert.equal(result.normalizedTakeoffJson.status, "draft", "status must be draft");
  assert.ok(result.computedMeasurementsJson, "computedMeasurementsJson must be present");
  assert.ok(result.validationDiagnosticsJson, "validationDiagnosticsJson must be present");
  assert.ok(result.importPlanJson, "importPlanJson must be present");
  assert.ok(result.summary, "summary must be present");
  assert.ok(result.summary.countertopExactSf > 0, "countertopExactSf must be > 0 (server recomputed)");

  // Verify Spec 73 values are correctly recomputed.
  assert.ok(
    Math.abs(result.summary.countertopExactSf - 59.96) < 0.01,
    `Expected ~59.96 sf, got ${result.summary.countertopExactSf}`
  );

  // Verify job was set to completed.
  const completedUpdate = supabase._mutations.jobUpdates.find((u) => u.status === "completed");
  assert.ok(completedUpdate, "job must be updated to completed");
  assert.equal(completedUpdate.review_status, "needs_review");
  assert.ok(completedUpdate.result_summary?.aiExtraction, "result_summary.aiExtraction must be true");

  // Verify result was inserted.
  const resultInsert = supabase._mutations.resultInserts[0];
  assert.ok(resultInsert, "quote_takeoff_results row must be inserted");
  assert.equal(resultInsert.review_status, "needs_review");
  assert.ok(resultInsert.normalized_takeoff_json, "normalized JSON must be in result row");
  assert.ok(resultInsert.computed_measurements_json, "computed JSON must be in result row");
});

// 13. review_status never 'approved' — always 'needs_review'
await test("review_status is always needs_review, never approved", async () => {
  const result = await runAiTakeoffExtraction({
    supabase:       makeSupabase(),
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn:     makeSuccessProvider(),
    configOverride: ENABLED_CONFIG,
  });
  assert.equal(result.reviewStatus, "needs_review");
  assert.notEqual(result.reviewStatus, "approved");
});

// 14. AI-provided totals stored but server recompute is authoritative
await test("server recompute overrides AI totals", async () => {
  // Provider returns a fixture with incorrect aiProvidedTotals.
  const fixtureWithWrongTotals = {
    ...buildSpec73Fixture(),
    aiProvidedTotals: { countertopExactSf: 99.0, backsplashExactSf: 99.0 },
  };
  const providerFn = async () => ({
    rawText:    JSON.stringify(fixtureWithWrongTotals),
    parsed:     fixtureWithWrongTotals,
    parseError: null,
    modelUsed:  "gpt-4o",
    usage:      { promptTokens: 200, completionTokens: 800 },
  });
  const result = await runAiTakeoffExtraction({
    supabase:       makeSupabase(),
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn,
    configOverride: ENABLED_CONFIG,
  });
  // Server recomputed should be correct (~59.96), not the bogus AI-provided 99.0.
  assert.ok(
    Math.abs(result.summary.countertopExactSf - 59.96) < 0.01,
    `Expected server-recomputed ~59.96, got ${result.summary.countertopExactSf}`
  );
});

// 15. No quote mutation — quote_headers table never touched
await test("quote_headers table is never touched", async () => {
  const supabase = makeSupabase({ trackMutations: true });
  await runAiTakeoffExtraction({
    supabase,
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn:     makeSuccessProvider(),
    configOverride: ENABLED_CONFIG,
  });
  assert.equal(
    supabase._mutations.quoteHeaderTouched,
    false,
    "quote_headers must never be touched"
  );
});

// 16. storage_path never returned in the service response
await test("storage_path never returned in result", async () => {
  const result = await runAiTakeoffExtraction({
    supabase:       makeSupabase(),
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn:     makeSuccessProvider(),
    configOverride: ENABLED_CONFIG,
  });
  const resultStr = JSON.stringify(result);
  assert.ok(!resultStr.includes("storage_path"), "storage_path must not appear in result");
  assert.ok(!resultStr.includes(MOCK_FILE_ROW.storage_path), "actual storage path must not appear");
});

// 17. Provider called with expected metadata
await test("provider called with expected metadata (mimeType, filename, promptVersion)", async () => {
  let capturedInput = null;
  const capturingProvider = async (input) => {
    capturedInput = input;
    const fixture = buildSpec73Fixture();
    return {
      rawText:    JSON.stringify(fixture),
      parsed:     fixture,
      parseError: null,
      modelUsed:  "gpt-4o",
      usage:      { promptTokens: 100, completionTokens: 500 },
    };
  };

  await runAiTakeoffExtraction({
    supabase:       makeSupabase(),
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn:     capturingProvider,
    configOverride: ENABLED_CONFIG,
  });

  assert.ok(capturedInput, "provider must have been called");
  assert.equal(capturedInput.mimeType,         MOCK_FILE_ROW.mime_type,          "mimeType mismatch");
  assert.equal(capturedInput.originalFilename, MOCK_FILE_ROW.original_filename,  "originalFilename mismatch");
  assert.equal(capturedInput.promptVersion,    "v2",                             "promptVersion must be v2");
  assert.ok(Buffer.isBuffer(capturedInput.fileBuffer), "fileBuffer must be a Buffer");
  assert.ok(capturedInput.fileBuffer.length > 0,       "fileBuffer must not be empty");
});

// 18. NOT NULL fallback — result stored in result_summary when quote_id constraint fires
await test("quote_id NOT NULL violation → graceful fallback to result_summary", async () => {
  const supabase = makeSupabase({
    trackMutations: true,
    resultInsertError: { code: "23502", message: "null value in column \"quote_id\"" },
  });

  const result = await runAiTakeoffExtraction({
    supabase,
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn:     makeSuccessProvider(),
    configOverride: ENABLED_CONFIG,
  });

  // Should still succeed — result saved in result_summary.
  assert.equal(result.ok, true);
  assert.equal(result.reviewStatus, "needs_review");

  // Job should still be completed.
  const completedUpdate = supabase._mutations.jobUpdates.find((u) => u.status === "completed");
  assert.ok(completedUpdate, "job should still be marked completed");
  assert.ok(completedUpdate.result_summary?.normalizedTakeoffJson, "normalizedTakeoffJson in result_summary");
});

// 19. resultRowId is returned in the response
await test("resultRowId returned in service response", async () => {
  const result = await runAiTakeoffExtraction({
    supabase:       makeSupabase(),
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn:     makeSuccessProvider(),
    configOverride: ENABLED_CONFIG,
  });
  // resultRowId is present in response (may be null if NOT NULL fallback, but key must exist)
  assert.ok("resultRowId" in result, "resultRowId must be present in response");
});

// 20. raw_ai_result_json includes _meta envelope with promptVersion and modelUsed
await test("raw_ai_result_json stored with _meta envelope", async () => {
  // Use trackMutations: true so _mutations.resultInserts captures the INSERT payload.
  const supabase = makeSupabase({ trackMutations: true });

  await runAiTakeoffExtraction({
    supabase,
    organizationId: ORG_ID,
    userId: null,
    takeoffJobId:   JOB_ID,
    providerFn:     makeSuccessProvider(),
    configOverride: ENABLED_CONFIG,
  });

  // resultInserts[0] is the quote_takeoff_results insert payload.
  const payload = supabase._mutations.resultInserts[0];
  assert.ok(payload, "quote_takeoff_results insert must have occurred");
  const storedRawJson = payload.raw_ai_result_json;
  assert.ok(storedRawJson, "raw_ai_result_json must be stored");
  assert.ok(storedRawJson._meta, "_meta key must be present in raw_ai_result_json");
  assert.ok(storedRawJson._meta.promptVersion, "_meta.promptVersion must be set");
  assert.ok(storedRawJson._meta.modelUsed, "_meta.modelUsed must be set");
  assert.ok(storedRawJson._meta.savedAt, "_meta.savedAt must be set");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
