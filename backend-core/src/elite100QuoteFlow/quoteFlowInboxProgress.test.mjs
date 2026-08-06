/**
 * Quote Flow Inbox — takeoff progress / failure / stale fields.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowInboxProgress.test.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  buildInboxTakeoffTimeline,
  mapQuoteFlowTakeoffProgress,
  presentQuoteFlowInboxItem,
  resolveInboxQueueItemKey,
  resolveInboxStaleProcessing,
  resolveTakeoffElapsedSeconds,
  sanitizeTakeoffErrorMessage
} from "./quoteFlowInboxPresenter.mjs";
import { createQuoteFlowService } from "./quoteFlowService.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nquoteFlowInboxProgress.test.mjs\n");

const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE = "case-progress-1";

function baseItem(overrides = {}) {
  return {
    messageKey: "msg-1",
    receivedAt: "2026-08-06T14:00:00.000Z",
    sender: "Buyer Co",
    subject: "Kitchen remodel",
    bodyPreview: "Please quote",
    intakeCaseId: CASE,
    planSelectionRequired: false,
    attachments: [
      {
        attachmentKey: "att-1",
        filename: "test2.pdf",
        contentType: "application/pdf",
        supportedForTakeoff: true,
        canMarkAsPlan: false
      }
    ],
    aiTakeoff: {
      state: "not_started",
      takeoffJobId: null,
      reviewReady: false,
      label: "Not started"
    },
    ...overrides
  };
}

{
  const active = presentQuoteFlowInboxItem(
    baseItem({
      aiTakeoff: {
        state: "processing",
        takeoffJobId: JOB,
        reviewReady: false,
        label: "Processing",
        startedAt: "2026-08-06T14:10:00.000Z",
        updatedAt: "2026-08-06T14:12:00.000Z",
        planFilename: "test2.pdf"
      }
    })
  );
  assert.equal(active.takeoffStatus.key, "takeoff_processing");
  assert.equal(active.takeoffJobId, JOB);
  assert.equal(active.takeoffPlanFilename, "test2.pdf");
  assert.equal(active.takeoffStartedAt, "2026-08-06T14:10:00.000Z");
  assert.equal(active.takeoffUpdatedAt, "2026-08-06T14:12:00.000Z");
  assert.ok(Number.isFinite(active.takeoffElapsedSeconds));
  assert.equal(active.progress.indeterminate, true);
  assert.equal(active.progress.percent, null);
  assert.match(active.takeoffStatusLabel || active.takeoffStatus.label, /processing|Waiting|AI Takeoff/i);
  assert.equal(active.queueItemKey, `takeoff:${JOB}`);
  assert.equal(active.nextRecommendedAction?.key, "track_progress");
  assert.ok(Array.isArray(active.takeoffTimeline));
  assert.ok(active.takeoffTimeline.some((s) => /processing|queued/i.test(s.label)));
  assert.doesNotMatch(JSON.stringify(active), /eyJ|service_role|Bearer /i);
  console.log("ok: active takeoff progress fields");
}

{
  const failed = presentQuoteFlowInboxItem(
    baseItem({
      aiTakeoff: {
        state: "failed",
        takeoffJobId: JOB,
        reviewReady: false,
        label: "Failed",
        startedAt: "2026-08-06T13:00:00.000Z",
        updatedAt: "2026-08-06T13:05:00.000Z",
        failedAt: "2026-08-06T13:05:00.000Z",
        errorMessage: "Plan unreadable — low contrast (Bearer sk_live_secret123)",
        failureStage: "extraction",
        planFilename: "test2.pdf"
      }
    })
  );
  assert.equal(failed.takeoffStatus.key, "takeoff_failed");
  assert.equal(failed.canRetryTakeoff, true);
  assert.equal(failed.canStartTakeoff, true);
  assert.match(failed.takeoffErrorMessageSafe || "", /Plan unreadable/);
  assert.doesNotMatch(failed.takeoffErrorMessageSafe || "", /Bearer|sk_live/);
  assert.equal(failed.takeoffFailureStage, "extraction");
  assert.equal(failed.takeoffPlanFilename, "test2.pdf");
  assert.equal(failed.nextAction?.key, "retry_takeoff");
  assert.ok(failed.takeoffTimeline.some((s) => /Failed/i.test(s.label)));
  console.log("ok: safe failure fields + retry");
}

{
  const noDetail = presentQuoteFlowInboxItem(
    baseItem({
      aiTakeoff: {
        state: "failed",
        takeoffJobId: JOB,
        reviewReady: false,
        label: "Failed"
      }
    })
  );
  assert.equal(
    noDetail.takeoffErrorMessageSafe,
    "AI Takeoff failed, but no detailed reason was returned."
  );
  console.log("ok: fallback failure message");
}

{
  const returned = presentQuoteFlowInboxItem(
    baseItem({
      aiTakeoff: {
        state: "needs_review",
        takeoffJobId: JOB,
        reviewReady: true,
        label: "Needs review",
        updatedAt: "2026-08-06T15:00:00.000Z"
      }
    })
  );
  assert.equal(returned.takeoffStatus.key, "takeoff_returned");
  assert.equal(returned.takeoffStatus.label, "Takeoff returned");
  assert.equal(returned.nextAction?.label, "View in Estimate Queue");
  assert.equal(returned.queueHint, "View in Estimate Queue");
  assert.equal(returned.progress.percent, 100);
  assert.ok(returned.takeoffTimeline.some((s) => /Estimate Queue/i.test(s.label)));
  console.log("ok: returned points to Estimate Queue");
}

{
  const now = Date.parse("2026-08-06T16:00:00.000Z");
  const warn = resolveInboxStaleProcessing({
    statusKey: "takeoff_processing",
    startedAt: "2026-08-06T15:40:00.000Z",
    now
  });
  assert.equal(warn.isLongRunning, true);
  assert.equal(warn.isStaleProcessing, false);
  assert.match(warn.staleLabel || "", /longer than expected/i);

  const stale = resolveInboxStaleProcessing({
    statusKey: "takeoff_processing",
    startedAt: "2026-08-06T14:00:00.000Z",
    now
  });
  assert.equal(stale.isStaleProcessing, true);
  assert.match(stale.staleLabel || "", /stale/i);

  const fresh = resolveInboxStaleProcessing({
    statusKey: "takeoff_processing",
    startedAt: "2026-08-06T15:55:00.000Z",
    now
  });
  assert.equal(fresh.isStaleProcessing, false);
  assert.equal(fresh.isLongRunning, false);
  assert.equal(resolveTakeoffElapsedSeconds("2026-08-06T15:59:00.000Z", now), 60);
  console.log("ok: stale processing thresholds");
}

{
  assert.equal(sanitizeTakeoffErrorMessage("Plan failed"), "Plan failed");
  assert.match(sanitizeTakeoffErrorMessage("Bearer abc.def token") || "", /\[redacted\]/);
  assert.doesNotMatch(sanitizeTakeoffErrorMessage("Bearer abc.def boom") || "", /Bearer abc/);
  assert.equal(resolveInboxQueueItemKey({ takeoffJobId: JOB }), `takeoff:${JOB}`);
  const prog = mapQuoteFlowTakeoffProgress({ statusKey: "takeoff_processing" });
  assert.equal(prog.indeterminate, true);
  assert.equal(prog.percent, null);
  const timeline = buildInboxTakeoffTimeline({
    receivedAt: "2026-08-06T14:00:00.000Z",
    planFilename: "a.pdf",
    startedAt: "2026-08-06T14:10:00.000Z",
    statusKey: "takeoff_queued"
  });
  assert.ok(timeline.length >= 3);
  console.log("ok: sanitize + timeline helpers");
}

{
  /** @type {any} */
  let currentItem = baseItem({
    aiTakeoff: {
      state: "failed",
      takeoffJobId: "old-failed-job",
      reviewReady: false,
      label: "Failed",
      errorMessage: "old failure"
    }
  });
  const startFreshFlags = [];
  const svc = createQuoteFlowService({
    sharedInboxService: {
      async listInbox() {
        return { ok: true, items: [currentItem], total: 1 };
      },
      async getMessage() {
        return { ok: true, item: currentItem };
      },
      async sendToAiTakeoff(args) {
        startFreshFlags.push(args.startFresh === true);
        assert.equal(args.startFresh, true);
        currentItem = baseItem({
          aiTakeoff: {
            state: "processing",
            takeoffJobId: "fresh-job-2",
            reviewReady: false,
            label: "Processing",
            startedAt: new Date().toISOString()
          }
        });
        return {
          ok: true,
          intakeCaseId: CASE,
          takeoffJobId: "fresh-job-2",
          created: true,
          reused: false,
          alreadyRunning: false,
          attachmentKey: args.attachmentKey,
          attachmentName: "test2.pdf",
          item: currentItem
        };
      }
    },
    estimateRepository: {
      async getActiveByIntakeCase() {
        return null;
      }
    },
    inboxStateStore: {
      async readState() {
        return { dismissedMessageKeys: {}, openedMessageKeys: {} };
      },
      async dismiss() {
        return { ok: true };
      },
      async restore() {
        return { ok: true };
      },
      async markOpened() {
        return { ok: true };
      }
    }
  });

  const retry = await svc.startTakeoff({
    organizationId: "org-1",
    messageKey: "msg-1",
    attachmentKey: "att-1",
    confirm: true
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.takeoffJobId, "fresh-job-2");
  assert.equal(retry.alreadyRunning, false);
  assert.ok(startFreshFlags.every((f) => f === true));
  assert.equal(retry.item?.takeoffJobId, "fresh-job-2");
  console.log("ok: failed retry starts fresh job");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /start-takeoff/);
  assert.doesNotMatch(
    readFileSync(join(__dirname, "quoteFlowInboxPresenter.mjs"), "utf8"),
    /service_role|raw_ai_result_json/
  );
  console.log("ok: no secrets in presenter");
}

console.log("\nquoteFlowInboxProgress.test.mjs: ok\n");
