/**
 * Quote Flow Estimate Queue — non-destructive archive / restore.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowQueueArchive.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoteFlowSetScopeService } from "./quoteFlowSetScope.mjs";
import {
  isRecentQueueProcessing,
  presentQuoteFlowQueueItem,
  resolveQuoteFlowQueueItemKey
} from "./quoteFlowQueuePresenter.mjs";
import {
  createMemoryQuoteFlowQueueStateStore,
  QUOTE_FLOW_QUEUE_INTEGRATION_KEY
} from "./quoteFlowQueueStateStore.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowQueueArchive.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "case-arch-1";
const JOB = "22222222-2222-4222-8222-222222222301";
const JOB2 = "22222222-2222-4222-8222-222222222302";

function queueRow(overrides = {}) {
  return {
    id: CASE,
    takeoffJobId: JOB,
    studioEstimateId: null,
    customerName: "Archive Co",
    projectName: "Kitchen",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review",
    planFilename: "kitchen-plan.pdf",
    receivedAt: "2026-08-04T12:00:00.000Z",
    ...overrides
  };
}

{
  const ready = presentQuoteFlowQueueItem(queueRow());
  assert.equal(ready.queueItemKey, `takeoff:${JOB}`);
  assert.equal(resolveQuoteFlowQueueItemKey({ intakeCaseId: "c1" }), "intake:c1");
  assert.equal(resolveQuoteFlowQueueItemKey({ messageKey: "m1" }), "message:m1");
  assert.match(resolveQuoteFlowQueueItemKey({ workflowStatus: "x", receivedAt: "t" }), /^fallback:/);

  const recent = presentQuoteFlowQueueItem(
    queueRow({
      workflowStatus: "Takeoff processing",
      takeoffJobStatus: "processing",
      takeoffReviewStatus: null,
      takeoffStartedAt: new Date().toISOString()
    })
  );
  assert.equal(recent.status.key, "takeoff_processing");
  assert.equal(recent.recentProcessing, true);
  assert.equal(
    isRecentQueueProcessing(recent, { now: Date.now(), recentMs: 60_000 }),
    true
  );

  const stale = presentQuoteFlowQueueItem(
    queueRow({
      takeoffJobId: JOB2,
      workflowStatus: "Takeoff processing",
      takeoffJobStatus: "processing",
      takeoffReviewStatus: null,
      takeoffStartedAt: "2020-01-01T00:00:00.000Z"
    })
  );
  assert.equal(stale.recentProcessing, false);
  console.log("ok: stable queue item keys + recent processing");
}

{
  /** @type {any[]} */
  const rows = [
    queueRow(),
    queueRow({
      id: "case-arch-2",
      takeoffJobId: JOB2,
      customerName: "Fail Co",
      workflowStatus: "Takeoff failed",
      takeoffJobStatus: "failed",
      takeoffReviewStatus: null
    })
  ];
  let deleteCalls = 0;
  let cancelCalls = 0;
  const queueStateStore = createMemoryQuoteFlowQueueStateStore();
  const svc = createQuoteFlowSetScopeService({
    queueService: {
      async listQueue() {
        return { cases: rows };
      }
    },
    estimateRepository: {
      async getActiveByIntakeCase() {
        return null;
      }
    },
    queueStateStore,
    getSupabase: () => ({
      from() {
        deleteCalls += 1;
        return {
          delete() {
            deleteCalls += 1;
            return this;
          },
          update() {
            cancelCalls += 1;
            return this;
          },
          eq() {
            return this;
          }
        };
      }
    })
  });

  const activeBefore = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "active", archiveView: "active" }
  });
  assert.equal(activeBefore.items.length, 2);
  assert.equal(activeBefore.items.every((i) => i.archived !== true), true);

  const key = activeBefore.items[0].queueItemKey;
  assert.equal(key, `takeoff:${JOB}`);

  const archived = await svc.archiveQueueItem({
    organizationId: ORG,
    queueItemKey: key,
    actorUserId: "user-1"
  });
  assert.equal(archived.ok, true);
  assert.equal(archived.archived, true);
  assert.equal(archived.takeoffCancelled, false);
  assert.equal(archived.takeoffDeleted, false);
  assert.equal(archived.intakeDeleted, false);
  assert.equal(archived.estimateDeleted, false);
  assert.equal(archived.emailDeleted, false);
  assert.equal(archived.sideEffects.takeoffCancelled, false);
  assert.equal(cancelCalls, 0);
  assert.equal(deleteCalls, 0);

  const activeAfter = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "active", archiveView: "active" }
  });
  assert.equal(activeAfter.items.length, 1);
  assert.equal(
    activeAfter.items.some((i) => i.queueItemKey === key),
    false,
    "default active list excludes archived"
  );

  const archivedOnly = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "active", archiveView: "archived" }
  });
  assert.equal(archivedOnly.items.length, 1);
  assert.equal(archivedOnly.items[0].queueItemKey, key);
  assert.equal(archivedOnly.items[0].archived, true);

  const allView = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "active", archiveView: "all" }
  });
  assert.equal(allView.items.length, 2);
  assert.equal(allView.items.filter((i) => i.archived).length, 1);

  // Persist by stable key across another list call
  const again = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "active", archiveView: "active" }
  });
  assert.equal(again.items.some((i) => i.queueItemKey === key), false);

  const restored = await svc.restoreQueueItem({
    organizationId: ORG,
    queueItemKey: key,
    actorUserId: "user-1"
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.restored, true);
  assert.equal(restored.takeoffCancelled, false);
  assert.equal(restored.takeoffDeleted, false);

  const activeRestored = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "active", archiveView: "active" }
  });
  assert.equal(activeRestored.items.length, 2);
  assert.equal(activeRestored.items.some((i) => i.queueItemKey === key), true);
  console.log("ok: archive filters + restore + non-destructive");
}

{
  const queueStateStore = createMemoryQuoteFlowQueueStateStore();
  const startedAt = new Date().toISOString();
  const svc = createQuoteFlowSetScopeService({
    queueService: {
      async listQueue() {
        return {
          cases: [
            queueRow({
              workflowStatus: "Takeoff processing",
              takeoffJobStatus: "processing",
              takeoffReviewStatus: null,
              takeoffStartedAt: startedAt
            })
          ]
        };
      }
    },
    estimateRepository: {
      async getActiveByIntakeCase() {
        return null;
      }
    },
    queueStateStore
  });

  const list = await svc.listQueue({ organizationId: ORG });
  assert.equal(list.items[0].recentProcessing, true);
  const key = list.items[0].queueItemKey;
  const res = await svc.archiveQueueItem({ organizationId: ORG, queueItemKey: key });
  assert.equal(res.ok, true);
  assert.equal(res.takeoffCancelled, false);
  const after = await svc.listQueue({
    organizationId: ORG,
    query: { archiveView: "active" }
  });
  assert.equal(after.items.length, 0);
  console.log("ok: recent processing archive remains non-destructive");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /queue\/:queueItemKey\/archive/);
  assert.match(routes, /queue\/:queueItemKey\/restore/);
  assert.match(routes, /action:\s*"queue\.archive"/);
  assert.match(routes, /takeoffCancelled:\s*false/);
  assert.doesNotMatch(routes, /cancelTakeoff|deleteTakeoff|ai\.cancel/i);

  const store = readFileSync(join(__dirname, "quoteFlowQueueStateStore.mjs"), "utf8");
  assert.match(store, new RegExp(QUOTE_FLOW_QUEUE_INTEGRATION_KEY));
  assert.match(store, /archivedQueueItemKeys/);
  assert.doesNotMatch(store, /from\(["']takeoff|\.rpc\(|cancelTakeoff/i);

  const setScope = readFileSync(join(__dirname, "quoteFlowSetScope.mjs"), "utf8");
  assert.match(setScope, /archiveView/);
  assert.match(setScope, /archiveQueueItem/);
  assert.match(setScope, /restoreQueueItem/);
  console.log("ok: routes + store are config-only (no cancel/delete)");
}

console.log("\nquoteFlowQueueArchive.test.mjs: ok\n");
