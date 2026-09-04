/**
 * Quote Flow Set Scope — Brain latency safe optimizations.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowSetScopePerf.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoteFlowSetScopeService } from "./quoteFlowSetScope.mjs";
import { createRequestStageTimer } from "../lib/requestStageTimer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nquoteFlowSetScopePerf.test.mjs\n");

{
  const timer = createRequestStageTimer("unit", { enabled: true, log: false });
  timer.mark("a");
  await new Promise((r) => setTimeout(r, 5));
  timer.mark("b");
  const out = timer.finish();
  assert.equal(out.label, "unit");
  assert.ok(out.totalMs >= 5);
  assert.ok(typeof out.stages.a === "number");
  assert.ok(typeof out.stages.b === "number");
  console.log("ok: request stage timer");
}

{
  const src = readFileSync(join(__dirname, "quoteFlowSetScope.mjs"), "utf8");
  assert.match(src, /resolveIntakeCaseForTakeoffJob/);
  assert.match(src, /quote_intake_takeoff_links/);
  assert.match(src, /createTakeoffResultCache/);
  assert.match(src, /isOfficialScopeSet\(ensuredEstimate\)/);
  assert.doesNotMatch(
    src,
    /const afterEnsure = await alreadyScopedForCase\(organizationId, intakeCaseId\);/
  );
  assert.match(src, /Promise\.all\(\[\s*alreadyScopedForCase/);
  console.log("ok: setScope uses direct intake lookup + no duplicate afterEnsure scoped reload");
}

{
  // Direct link lookup must not call listQueue.
  let listQueueCalls = 0;
  const CASE = "case-perf-1";
  const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const svc = createQuoteFlowSetScopeService({
    queueService: {
      listQueue: async () => {
        listQueueCalls += 1;
        return { cases: [] };
      }
    },
    getSupabase: () => ({
      from(table) {
        if (table === "quote_intake_takeoff_links") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [{ intake_case_id: CASE }],
                error: null
              });
            }
          };
        }
        throw new Error(`unexpected table ${table}`);
      }
    }),
    estimateRepository: {
      getActiveByIntakeCase: async () => ({
        id: "est-1",
        status: "ready_to_price",
        scope: {
          rooms: [
            {
              id: "r1",
              included: true,
              pieces: [{ id: "p1", lengthIn: 10, depthIn: 25, included: true }]
            }
          ]
        },
        projectName: "Perf"
      })
    },
    studioEstimateService: {
      getOrCreateForCase: async () => {
        throw new Error("should not create when already scoped");
      },
      refreshScopeFromTakeoff: async () => {
        throw new Error("should not refresh when already scoped");
      },
      updateScope: async () => {
        throw new Error("should not update when already scoped");
      }
    }
  });

  const res = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: JOB,
    confirm: true,
    projectName: "Perf Quote"
  });
  assert.equal(listQueueCalls, 0, "direct link lookup must skip full queue list");
  assert.equal(res.reused, true);
  assert.equal(res.intakeCaseId, CASE);
  console.log("ok: already-scoped Set Scope resolves intake via link without listQueue");
}

{
  // Fallback to queue scan when link/estimate miss.
  let listQueueCalls = 0;
  const CASE = "case-fallback";
  const JOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const ORG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  const svc = createQuoteFlowSetScopeService({
    queueService: {
      listQueue: async () => {
        listQueueCalls += 1;
        return {
          cases: [
            {
              id: CASE,
              takeoffJobId: JOB,
              status: { key: "ready_for_review" }
            }
          ]
        };
      }
    },
    getSupabase: () => ({
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({ data: [], error: null });
          }
        };
      }
    }),
    estimateRepository: {
      getActiveByIntakeCase: async () => ({
        id: "est-f",
        status: "ready_to_price",
        scope: {
          rooms: [
            {
              id: "r1",
              included: true,
              pieces: [{ id: "p1", lengthIn: 12, depthIn: 25, included: true }]
            }
          ]
        }
      })
    }
  });

  const res = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: JOB,
    confirm: true,
    projectName: "Fallback Quote"
  });
  assert.ok(listQueueCalls >= 1);
  assert.equal(res.intakeCaseId, CASE);
  console.log("ok: Set Scope falls back to queue scan when link missing");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /X-Eliteos-Perf|attachRequestTimingHeader/);
  assert.match(routes, /_timing: timer/);
  console.log("ok: set-scope route exposes optional perf timing");
}

console.log("\nquoteFlowSetScopePerf.test.mjs: ok\n");
