/**
 * Elite 100 Quote Flow — Slice 1B Inbox + start-takeoff.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowSlice1b.test.mjs
 */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { attachElite100QuoteFlowRoutes } from "./elite100QuoteFlowRoutes.js";
import { createQuoteFlowService, isOfficialScopeSet } from "./quoteFlowService.mjs";
import { presentQuoteFlowInboxItem } from "./quoteFlowInboxPresenter.mjs";
import { ELITE100_QUOTE_FLOW_HEAD_SLUG } from "./elite100QuoteFlowConfig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowSlice1b.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const MSG = "AAMk-msg-1";
const ATT_PDF = "att-pdf-1";
const ATT_BAD = "att-bad-1";
const JOB = "job-takeoff-1";

function baseItem(overrides = {}) {
  return {
    messageKey: MSG,
    receivedAt: "2026-08-04T12:00:00.000Z",
    sender: "Buyer Co",
    subject: "Kitchen quote",
    bodyPreview: "Please quote",
    intakeCaseId: "case-1",
    estimateId: null,
    planSelectionRequired: false,
    attachments: [
      {
        attachmentKey: ATT_PDF,
        filename: "plan.pdf",
        contentType: "application/pdf",
        support: "direct_pdf",
        supportedForTakeoff: true,
        canMarkAsPlan: false
      },
      {
        attachmentKey: ATT_BAD,
        filename: "note.txt",
        contentType: "text/plain",
        support: "unsupported_item",
        supportedForTakeoff: false,
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
  assert.equal(isOfficialScopeSet(null), false);
  assert.equal(isOfficialScopeSet({ status: "draft", scope: { rooms: [] } }), false);
  assert.equal(
    isOfficialScopeSet({
      status: "ready_to_price",
      scope: { rooms: [{ id: "r1", pieces: [{ lengthIn: 24, depthIn: 25 }] }] }
    }),
    true
  );
  assert.equal(
    isOfficialScopeSet({
      status: "draft",
      scope: {
        rooms: [
          {
            id: "r1",
            included: true,
            pieces: [{ id: "p1", lengthIn: 30, depthIn: 25, excluded: false }]
          }
        ]
      }
    }),
    true
  );
  console.log("ok: already-scoped detection");
}

{
  const presented = presentQuoteFlowInboxItem(baseItem());
  // Single supported plan → ready to start (needs_attachment_selection only when multi/choice).
  assert.equal(presented.takeoffStatus.key, "ready_to_start");
  assert.equal(presented.sender, "Buyer Co");
  assert.equal(presented.senderLabel, "Buyer Co");
  assert.equal(presented.group.key, "needs_action");
  assert.equal(presented.bestPlanCandidate?.filename, "plan.pdf");
  const objectSender = presentQuoteFlowInboxItem(
    baseItem({
      sender: {
        displayName: "Dave Untiedt",
        safeAddressLabel: "d***@builder.com",
        emailPresent: true
      }
    })
  );
  assert.equal(typeof objectSender.sender, "string");
  assert.equal(objectSender.sender, "Dave Untiedt");
  assert.equal(objectSender.senderLabel, "Dave Untiedt");
  const emailOnly = presentQuoteFlowInboxItem(
    baseItem({
      sender: { displayName: "", safeAddressLabel: "", emailPresent: true }
    })
  );
  assert.equal(emailOnly.sender, "Email on file");
  const missing = presentQuoteFlowInboxItem(baseItem({ sender: null }));
  assert.equal(missing.sender, "Unknown contact");
  console.log("ok: inbox presenter normalizes production sender object to display string");
}
{
  const presented = presentQuoteFlowInboxItem(baseItem());
  assert.equal(presented.takeoffStatus.key, "ready_to_start");
  const multi = presentQuoteFlowInboxItem(
    baseItem({
      planSelectionRequired: true,
      attachments: [
        {
          attachmentKey: "a1",
          filename: "a.pdf",
          contentType: "application/pdf",
          supportedForTakeoff: true,
          canMarkAsPlan: false
        },
        {
          attachmentKey: "a2",
          filename: "b.pdf",
          contentType: "application/pdf",
          supportedForTakeoff: true,
          canMarkAsPlan: false
        }
      ]
    })
  );
  assert.equal(multi.takeoffStatus.key, "needs_attachment_selection");
  const returned = presentQuoteFlowInboxItem(
    baseItem({
      aiTakeoff: {
        state: "needs_review",
        takeoffJobId: JOB,
        reviewReady: true,
        label: "Needs review"
      }
    })
  );
  assert.equal(returned.takeoffStatus.key, "takeoff_returned");
  assert.equal(returned.queueHint, "View in Estimate Queue");
  assert.equal(returned.viewQueue, true);
  assert.equal(returned.progress.percent, 100);
  const scoped = presentQuoteFlowInboxItem(baseItem({ estimateId: "est-1" }), {
    alreadyScoped: true
  });
  assert.equal(scoped.takeoffStatus.key, "already_scoped");
  assert.equal(scoped.viewEstimates, true);
  assert.equal(scoped.queueHint, "View in Estimates");
  assert.equal(scoped.progress.stageKey, "scope_set");
  console.log("ok: takeoff status presenter");
}

function mockSharedInbox({ item = baseItem(), sendImpl } = {}) {
  let sendCalls = 0;
  return {
    sendCalls: () => sendCalls,
    async listInbox() {
      return { ok: true, items: [item], total: 1, limit: 50, offset: 0, mailboxDisplay: "quotes@" };
    },
    async getMessage() {
      return { ok: true, item, mailboxDisplay: "quotes@" };
    },
    async sendToAiTakeoff(args) {
      sendCalls += 1;
      if (typeof sendImpl === "function") return sendImpl(args, sendCalls);
      const att = String(args.attachmentKey || "");
      if (!att) {
        const err = new Error("Select a plan attachment");
        err.code = "attachment_required";
        err.statusCode = 400;
        throw err;
      }
      if (att === ATT_BAD) {
        const err = new Error("Unsupported");
        err.code = "attachment_not_supported";
        err.statusCode = 400;
        throw err;
      }
      // Default mock: first call creates; subsequent calls while "active" reuse.
      const activeReuse = sendCalls > 1;
      return {
        ok: true,
        intakeCaseId: "case-1",
        takeoffJobId: JOB,
        created: !activeReuse,
        reused: activeReuse,
        alreadyRunning: activeReuse,
        startFresh: args.startFresh === true,
        attachmentKey: att,
        attachmentName: "plan.pdf",
        item: {
          ...item,
          aiTakeoff: {
            state: "processing",
            takeoffJobId: JOB,
            reviewReady: false,
            label: "Processing"
          }
        },
        sideEffects: {
          calculated: false,
          approved: false,
          published: false,
          digitalEstimateCreated: false,
          sold: false,
          studioEstimateEnsured: false
        }
      };
    }
  };
}

{
  const shared = mockSharedInbox();
  const svc = createQuoteFlowService({
    sharedInboxService: shared,
    estimateRepository: { getActiveByIntakeCase: async () => null }
  });
  const list = await svc.listInbox({ organizationId: ORG });
  assert.equal(list.ok, true);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].messageKey, MSG);
  assert.equal(list.items[0].attachments.length, 2);
  console.log("ok: Inbox route service returns rows");

  const detail = await svc.getMessage({ organizationId: ORG, messageKey: MSG });
  assert.equal(detail.item.attachments[0].filename, "plan.pdf");
  assert.equal(detail.item.attachments[0].supportedForTakeoff, true);
  console.log("ok: Message detail returns attachments");

  const started = await svc.startTakeoff({
    organizationId: ORG,
    messageKey: MSG,
    attachmentKey: ATT_PDF,
    confirm: true
  });
  assert.equal(started.takeoffJobId, JOB);
  assert.equal(started.created, true);
  assert.equal(started.message, "AI Takeoff started.");
  assert.equal(started.sideEffects.calculated, false);
  assert.equal(started.sideEffects.published, false);
  assert.equal(started.sideEffects.sold, false);
  console.log("ok: Supported PDF can start AI Takeoff");

  const again = await svc.startTakeoff({
    organizationId: ORG,
    messageKey: MSG,
    attachmentKey: ATT_PDF,
    confirm: true
  });
  assert.equal(again.takeoffJobId, JOB);
  assert.equal(again.reused, true);
  assert.equal(again.alreadyRunning, true);
  assert.equal(again.message, "AI Takeoff is already running.");
  assert.equal(shared.sendCalls(), 2);
  console.log("ok: Duplicate start while active reuses same takeoff job");

  await assert.rejects(
    () =>
      svc.startTakeoff({
        organizationId: ORG,
        messageKey: MSG,
        attachmentKey: ATT_BAD,
        confirm: true
      }),
    (e) => e.code === "attachment_not_supported"
  );
  console.log("ok: Unsupported attachment rejected safely");

  await assert.rejects(
    () =>
      svc.startTakeoff({
        organizationId: ORG,
        messageKey: MSG,
        attachmentKey: null,
        confirm: true
      }),
    (e) => e.code === "attachment_required"
  );
  console.log("ok: Multiple attachments require explicit selection");
}

{
  const shared = mockSharedInbox();
  const svc = createQuoteFlowService({
    sharedInboxService: shared,
    estimateRepository: {
      getActiveByIntakeCase: async () => ({
        status: "ready_to_price",
        scope: {
          rooms: [
            {
              id: "r1",
              pieces: [{ id: "p1", lengthIn: 24, depthIn: 25 }]
            }
          ]
        }
      })
    }
  });
  await assert.rejects(
    () =>
      svc.startTakeoff({
        organizationId: ORG,
        messageKey: MSG,
        attachmentKey: ATT_PDF,
        confirm: true
      }),
    (e) =>
      (e.code === "already_scoped" || e.code === "takeoff_not_allowed") &&
      /Open in Estimates/i.test(String(e.message || ""))
  );
  assert.equal(shared.sendCalls(), 0);
  console.log("ok: Already-scoped estimate blocks AI Takeoff rerun");
}

{
  /** @type {"none"|"active"|"returned"|"failed"} */
  let phase = "none";
  let jobSeq = 0;
  /** @type {string|null} */
  let currentJob = null;
  /** @type {boolean[]} */
  const startFreshFlags = [];

  const shared = mockSharedInbox({
    sendImpl: async (args) => {
      startFreshFlags.push(args.startFresh === true);
      assert.equal(args.startFresh, true, "Quote Flow must request startFresh");
      if (phase === "active" && currentJob) {
        return {
          ok: true,
          intakeCaseId: "case-1",
          takeoffJobId: currentJob,
          created: false,
          reused: true,
          alreadyRunning: true,
          attachmentKey: args.attachmentKey,
          item: baseItem({
            aiTakeoff: {
              state: "processing",
              takeoffJobId: currentJob,
              reviewReady: false,
              label: "Processing"
            }
          }),
          sideEffects: {
            calculated: false,
            approved: false,
            published: false,
            digitalEstimateCreated: false,
            sold: false,
            studioEstimateEnsured: false
          }
        };
      }
      // Returned / failed / none → mint a new job (do not reuse old terminal jobs).
      jobSeq += 1;
      currentJob = `job-fresh-${jobSeq}`;
      phase = "active";
      return {
        ok: true,
        intakeCaseId: "case-1",
        takeoffJobId: currentJob,
        created: true,
        reused: false,
        alreadyRunning: false,
        attachmentKey: args.attachmentKey,
        item: baseItem({
          aiTakeoff: {
            state: "queued",
            takeoffJobId: currentJob,
            reviewReady: false,
            label: "Queued"
          }
        }),
        sideEffects: {
          calculated: false,
          approved: false,
          published: false,
          digitalEstimateCreated: false,
          sold: false,
          studioEstimateEnsured: false
        }
      };
    }
  });

  const svc = createQuoteFlowService({
    sharedInboxService: shared,
    estimateRepository: { getActiveByIntakeCase: async () => null }
  });

  const first = await svc.startTakeoff({
    organizationId: ORG,
    messageKey: MSG,
    attachmentKey: ATT_PDF,
    confirm: true
  });
  assert.equal(first.created, true);
  assert.equal(first.message, "AI Takeoff started.");
  assert.equal(first.takeoffJobId, "job-fresh-1");

  const duringActive = await svc.startTakeoff({
    organizationId: ORG,
    messageKey: MSG,
    attachmentKey: ATT_PDF,
    confirm: true
  });
  assert.equal(duringActive.alreadyRunning, true);
  assert.equal(duringActive.takeoffJobId, "job-fresh-1");
  assert.equal(duringActive.message, "AI Takeoff is already running.");

  phase = "returned";
  const afterReturned = await svc.startTakeoff({
    organizationId: ORG,
    messageKey: MSG,
    attachmentKey: ATT_PDF,
    confirm: true
  });
  assert.equal(afterReturned.created, true);
  assert.equal(afterReturned.takeoffJobId, "job-fresh-2");
  assert.notEqual(afterReturned.takeoffJobId, "job-fresh-1");
  assert.equal(afterReturned.message, "AI Takeoff started.");

  phase = "failed";
  const afterFailed = await svc.startTakeoff({
    organizationId: ORG,
    messageKey: MSG,
    attachmentKey: ATT_PDF,
    confirm: true
  });
  assert.equal(afterFailed.created, true);
  assert.equal(afterFailed.takeoffJobId, "job-fresh-3");
  assert.ok(startFreshFlags.every((f) => f === true));
  console.log("ok: startFresh — returned/failed mint new jobs; active reuses");
}

function mockSupabase({ headRows = [], userKind = "internal" } = {}) {
  return {
    from(table) {
      if (table === "user_profiles") {
        const result = { data: [{ user_kind: userKind }], error: null };
        const single = { data: { user_kind: userKind }, error: null };
        const api = {
          select: () => api,
          eq: () => api,
          limit: async () => result,
          maybeSingle: async () => single
        };
        return api;
      }
      if (table === "user_head_access") {
        const rows = headRows;
        const api = {
          select: () => api,
          eq: () => Promise.resolve({ data: rows, error: null })
        };
        return api;
      }
      if (table === "organizations") {
        const api = {
          select: () => api,
          eq: () => api,
          limit: async () => ({
            data: [{ id: ORG, organization_key: "elite_stone_fabrication" }],
            error: null
          }),
          maybeSingle: async () => ({
            data: { id: ORG, organization_key: "elite_stone_fabrication" },
            error: null
          })
        };
        return api;
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            limit: async () => ({ data: [], error: null })
          })
        })
      };
    }
  };
}

async function requestApp(app, path, init = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

{
  const shared = mockSharedInbox();
  const svc = createQuoteFlowService({
    sharedInboxService: shared,
    estimateRepository: { getActiveByIntakeCase: async () => null }
  });
  const app = express();
  attachElite100QuoteFlowRoutes(app, {
    requireAuth: () => (req, _res, next) => {
      req.user = {
        id: "u-granted",
        email: "est@example.com",
        role: "estimator",
        isActive: true,
        user_kind: "internal"
      };
      next();
    },
    getSupabase: () =>
      mockSupabase({ headRows: [{ head_slug: ELITE100_QUOTE_FLOW_HEAD_SLUG }] }),
    env: { ELITE100_QUOTE_FLOW_ENABLED: "1" },
    quoteFlowService: svc,
    quoteFlowSetScopeService: {
      listQueue: async () => ({ ok: true, items: [], total: 0 }),
      getQueueDetail: async () => {
        const err = new Error("not found");
        err.code = "takeoff_not_found";
        err.statusCode = 404;
        throw err;
      },
      setScope: async () => {
        const err = new Error("not implemented in 1b harness");
        err.code = "takeoff_unavailable";
        err.statusCode = 503;
        throw err;
      }
    },
    sharedInboxService: shared,
    studioEstimateRepository: { getActiveByIntakeCase: async () => null },
    // Avoid constructing real studio stack when service is injected:
    studioEstimateService: {
      repository: { getActiveByIntakeCase: async () => null }
    },
    quoteIntakeRepository: {},
    studioEstimateQueueService: { listQueue: async () => ({ cases: [] }) }
  });

  const list = await requestApp(app, "/api/elite100-quote-flow/inbox");
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.items[0].messageKey, MSG);

  const detail = await requestApp(app, `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}`);
  assert.equal(detail.status, 200);
  assert.ok(Array.isArray(detail.body.item.attachments));

  const started = await requestApp(
    app,
    `/api/elite100-quote-flow/inbox/${encodeURIComponent(MSG)}/start-takeoff`,
    {
      method: "POST",
      body: JSON.stringify({ confirm: true, attachmentKey: ATT_PDF })
    }
  );
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.takeoffJobId, JOB);
  assert.equal(started.body.sideEffects.calculated, false);
  assert.equal(started.body.sideEffects.approved, false);
  assert.equal(started.body.sideEffects.published, false);
  assert.equal(started.body.sideEffects.sold, false);
  console.log("ok: HTTP inbox + start-takeoff; no calculate/approve/publish/sold");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /\/api\/elite100-quote-flow\/inbox/);
  assert.match(routes, /start-takeoff/);
  assert.doesNotMatch(routes, /publishDigitalEstimate|markSold|calculateStudio|approveWorkingDraft/);
  const svc = readFileSync(join(__dirname, "quoteFlowService.mjs"), "utf8");
  assert.match(svc, /already_scoped|isOfficialScopeSet/);
  assert.match(svc, /sendToAiTakeoff/);
  console.log("ok: route/source contracts");
}

{
  const ui = readFileSync(
    join(root, "app-elite100-quote-flow/src/inbox/InboxPage.tsx"),
    "utf8"
  );
  assert.match(ui, /Start AI Takeoff|Select for AI Takeoff/);
  assert.match(ui, /qf-inbox/);
  assert.doesNotMatch(ui, /\bV1\b|\bV2\b|Studio V2/);
  console.log("ok: UI source contracts for Inbox actions");
}

console.log("\nquoteFlowSlice1b.test.mjs: ok\n");
