/**
 * Tests for takeoffGenerationOrchestrator — async AI generation queue + config.
 */
import assert from "node:assert/strict";
import {
  readTakeoffGenerateConfig,
  startAiTakeoffGeneration,
} from "./takeoffGenerationOrchestrator.mjs";
import { PROCESSING_PHASES } from "./takeoffProcessOrchestrator.mjs";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const FILE_ID = "33333333-3333-4333-8333-333333333333";

function mockSupabase(jobRow, opts = {}) {
  const updates = [];
  return {
    updates,
    from(table) {
      assert.equal(table, "quote_takeoff_jobs");
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    limit() {
                      return Promise.resolve({ data: [jobRow], error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update(fields) {
          updates.push(fields);
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
    storage: opts.storage,
  };
}

// ── readTakeoffGenerateConfig ─────────────────────────────────────────────────

{
  const prev = { ...process.env };
  try {
    delete process.env.TAKEOFF_GENERATE_SYNC;
    delete process.env.TAKEOFF_GENERATE_ASYNC;
    delete process.env.VERCEL;
    assert.equal(readTakeoffGenerateConfig().asyncEnabled, false);

    process.env.VERCEL = "1";
    assert.equal(readTakeoffGenerateConfig().asyncEnabled, true);

    process.env.TAKEOFF_GENERATE_SYNC = "1";
    assert.equal(readTakeoffGenerateConfig().asyncEnabled, false);

    delete process.env.TAKEOFF_GENERATE_SYNC;
    delete process.env.VERCEL;
    process.env.TAKEOFF_GENERATE_ASYNC = "1";
    assert.equal(readTakeoffGenerateConfig().asyncEnabled, true);
    console.log("ok: readTakeoffGenerateConfig");
  } finally {
    process.env = prev;
  }
}

// ── startAiTakeoffGeneration returns 202-shaped payload ───────────────────────

{
  const prev = {
    TAKEOFF_AI_ENABLED: process.env.TAKEOFF_AI_ENABLED,
    TAKEOFF_AI_PROVIDER: process.env.TAKEOFF_AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  process.env.TAKEOFF_AI_ENABLED = "1";
  process.env.TAKEOFF_AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-key";

  const jobRow = {
    id: JOB_ID,
    organization_id: ORG_ID,
    quote_file_id: FILE_ID,
    status: "pending",
    review_status: "needs_review",
    metadata: {},
    error_message: null,
    started_at: null,
  };

  let scheduled = false;
  const supabase = mockSupabase(jobRow);

  const result = await startAiTakeoffGeneration({
    supabase,
    organizationId: ORG_ID,
    userId: "user-1",
    takeoffJobId: JOB_ID,
    scheduleFn: async () => {
      scheduled = true;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.takeoffJobId, JOB_ID);
  assert.equal(result.status, "processing");
  assert.equal(result.mode, "ai_generate");
  assert.ok(result.runId);
  assert.equal(result.processing?.phase, PROCESSING_PHASES.QUEUED);
  assert.equal(scheduled, true);
  assert.ok(supabase.updates.some((u) => u.status === "processing"));
  console.log("ok: startAiTakeoffGeneration accepted payload");

  process.env.TAKEOFF_AI_ENABLED = prev.TAKEOFF_AI_ENABLED;
  process.env.TAKEOFF_AI_PROVIDER = prev.TAKEOFF_AI_PROVIDER;
  process.env.OPENAI_API_KEY = prev.OPENAI_API_KEY;
}

console.log("takeoffGenerationOrchestrator.test.mjs: all passed");
