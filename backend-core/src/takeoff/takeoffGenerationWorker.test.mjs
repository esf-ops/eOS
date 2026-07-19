/**
 * Durable AI generation worker tests.
 * Run: node backend-core/src/takeoff/takeoffGenerationWorker.test.mjs
 */
import assert from "node:assert/strict";
import {
  isClaimableAiGenerationJob,
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

  // Fresh queued phase must claim immediately (no 15s delay).
  const queuedFresh = {
    status: "processing",
    started_at: "2026-07-19T11:59:55.000Z",
    metadata: {
      processing: {
        mode: "ai_generate",
        phase: "queued",
        startedAt: "2026-07-19T11:59:55.000Z",
        runId: "run-2"
      }
    }
  };
  assert.equal(isClaimableAiGenerationJob(queuedFresh, { now, staleMs: 90_000 }), true);

  const pendingStatus = {
    status: "pending",
    started_at: "2026-07-19T11:59:59.000Z",
    metadata: { processing: { mode: "ai_generate", phase: "queued" } }
  };
  assert.equal(isClaimableAiGenerationJob(pendingStatus, { now, staleMs: 90_000 }), true);

  const done = {
    status: "processing",
    metadata: { processing: { mode: "ai_generate", phase: "done" } }
  };
  assert.equal(isClaimableAiGenerationJob(done, { now, staleMs: 90_000 }), false);
  console.log("  ✓ claimable: immediate for queued; stale-only for active extraction");
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
      if (table === "quote_intake_takeoff_links") {
        return {
          update() {
            return this;
          },
          eq() {
            return this;
          },
          select() {
            return Promise.resolve({ data: [{ id: "link-1" }], error: null });
          }
        };
      }
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
        in() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        update(patch) {
          api._patch = { ...(api._patch || {}), ...patch };
          if (patch.metadata) jobs[0].metadata = patch.metadata;
          if (patch.status) jobs[0].status = patch.status;
          return api;
        },
        maybeSingle() {
          const row = {
            ...jobs[0],
            ...(api._patch || {}),
            metadata: api._patch?.metadata || jobs[0].metadata
          };
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
  assert.ok(result.claimed >= 1 || result.processed >= 1);
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
