/**
 * Durable AI generation worker tests.
 * Run: node backend-core/src/takeoff/takeoffGenerationWorker.test.mjs
 */
import assert from "node:assert/strict";
import {
  isStaleAiGenerationJob,
  processQueuedAiTakeoffJobs
} from "./takeoffGenerationWorker.mjs";

console.log("\ntakeoffGenerationWorker.test.mjs\n");

{
  const now = Date.parse("2026-07-19T12:00:00.000Z");
  const fresh = {
    status: "processing",
    started_at: "2026-07-19T11:59:30.000Z",
    metadata: {
      processing: {
        mode: "ai_generate",
        phase: "extraction",
        startedAt: "2026-07-19T11:59:30.000Z",
        runId: "run-1"
      }
    }
  };
  assert.equal(isStaleAiGenerationJob(fresh, { now, staleMs: 90_000 }), false);

  const stale = {
    ...fresh,
    started_at: "2026-07-19T11:50:00.000Z",
    metadata: {
      processing: {
        mode: "ai_generate",
        phase: "extraction",
        startedAt: "2026-07-19T11:50:00.000Z",
        runId: "run-1"
      }
    }
  };
  assert.equal(isStaleAiGenerationJob(stale, { now, staleMs: 90_000 }), true);

  const queued = {
    status: "processing",
    started_at: "2026-07-19T11:59:00.000Z",
    metadata: {
      processing: {
        mode: "ai_generate",
        phase: "queued",
        startedAt: "2026-07-19T11:59:00.000Z",
        runId: "run-2"
      }
    }
  };
  assert.equal(isStaleAiGenerationJob(queued, { now, staleMs: 90_000 }), true);
  console.log("  ✓ stale detection for hosted waitUntil death");
}

{
  const jobs = [
    {
      id: "job-1",
      organization_id: "org-1",
      status: "processing",
      review_status: "needs_review",
      started_at: "2026-07-19T11:00:00.000Z",
      updated_at: "2026-07-19T11:00:00.000Z",
      metadata: {
        processing: {
          mode: "ai_generate",
          phase: "queued",
          startedAt: "2026-07-19T11:00:00.000Z",
          runId: "run-old"
        }
      }
    }
  ];

  const supabase = {
    from(table) {
      assert.equal(table, "quote_takeoff_jobs");
      const api = {
        _filters: [],
        select() {
          return api;
        },
        eq(col, val) {
          api._filters.push([col, val]);
          return api;
        },
        neq() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        update(patch) {
          api._patch = patch;
          return api;
        },
        maybeSingle() {
          const row = { ...jobs[0], ...(api._patch || {}) };
          return Promise.resolve({ data: row, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: jobs, error: null }).then(resolve, reject);
        }
      };
      return api;
    }
  };

  let ran = 0;
  const result = await processQueuedAiTakeoffJobs({
    supabase,
    env: {
      TAKEOFF_AI_ENABLED: "1",
      OPENAI_API_KEY: "sk-test",
      TAKEOFF_AI_STALE_MS: "1000"
    },
    staleMs: 1000,
    limit: 1,
    runExtraction: async () => {
      ran += 1;
      return { ok: true };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.processed, 1);
  assert.equal(ran, 1);
  assert.equal(result.attempts[0].ok, true);
  console.log("  ✓ hosted-compatible claimer runs extraction durably");
}

{
  const result = await processQueuedAiTakeoffJobs({
    supabase: {
      from() {
        throw new Error("should not query when AI disabled");
      }
    },
    env: { TAKEOFF_AI_ENABLED: "0" }
  });
  assert.equal(result.skipped, true);
  assert.equal(result.code, "takeoff_ai_disabled");
  console.log("  ✓ worker skips when AI disabled");
}

console.log("\ntakeoffGenerationWorker.test.mjs — passed\n");
