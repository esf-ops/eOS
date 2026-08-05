/**
 * Elite 100 Quote Flow — Slice 1C Estimate Queue as Scope Creation Queue.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowSlice1c.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoteFlowSetScopeService } from "./quoteFlowSetScope.mjs";
import { presentQuoteFlowQueueItem, sortQuoteFlowQueueItems } from "./quoteFlowQueuePresenter.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowSlice1c.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "case-queue-1";
const CASE2 = "case-queue-2";
const JOB = "22222222-2222-4222-8222-222222222222";
const JOB2 = "22222222-2222-4222-8222-222222222223";
const JOB_FAIL = "22222222-2222-4222-8222-222222222224";
const EST = "33333333-3333-4333-8333-333333333333";

const scopedRooms = [
  {
    id: "r1",
    included: true,
    pieces: [{ id: "p1", lengthIn: 96, depthIn: 25.5, excluded: false }]
  }
];

function queueRow(overrides = {}) {
  return {
    id: CASE,
    takeoffJobId: JOB,
    studioEstimateId: null,
    customerName: "Buyer Co",
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
  const item = presentQuoteFlowQueueItem(queueRow());
  assert.equal(item.status.key, "ready_for_review");
  assert.equal(item.actionLabel, "Review Takeoff");
  assert.equal(item.group.key, "ready");
  assert.equal(item.customerDisplay, "Buyer Co");
  assert.equal(item.planFilename, "kitchen-plan.pdf");
  assert.doesNotMatch(item.requestTitle, /not identified|not named/i);

  const failed = presentQuoteFlowQueueItem(
    queueRow({
      takeoffJobId: JOB_FAIL,
      workflowStatus: "Takeoff failed",
      takeoffJobStatus: "failed",
      failureReason: "Plan unreadable"
    })
  );
  assert.equal(failed.status.key, "takeoff_failed");
  assert.equal(failed.canCreateManualScope, true);
  assert.equal(failed.action, "needs_decision");
  assert.equal(failed.actionLabel, "Needs decision");
  assert.equal(failed.failureReason, "Plan unreadable");
  assert.equal(item.rowAction, "review_takeoff");
  assert.match(item.defaultEstimateName || item.estimateName || "", /Kitchen|plan|Buyer/i);

  const processing = presentQuoteFlowQueueItem(
    queueRow({
      workflowStatus: "Takeoff processing",
      takeoffJobStatus: "processing",
      takeoffReviewStatus: null
    })
  );
  assert.equal(processing.status.key, "takeoff_processing");
  assert.equal(processing.action, "waiting");
  assert.match(processing.status.label, /Waiting on AI Takeoff/);

  const scoped = presentQuoteFlowQueueItem(queueRow({ workflowStatus: "Scope in progress" }), {
    alreadyScoped: true,
    estimateId: EST
  });
  assert.equal(scoped.status.key, "scope_set");
  console.log("ok: queue presenter statuses + safe labels");
}

{
  /** @type {Map<string, any>} */
  const estimatesByCase = new Map();
  let approveCalls = 0;
  let refreshCalls = 0;
  let createCalls = 0;
  let updateScopeCalls = 0;

  const rows = [
    queueRow(),
    queueRow({
      id: CASE2,
      takeoffJobId: JOB2,
      customerName: "Done Co",
      projectName: "Bath",
      workflowStatus: "Takeoff draft ready"
    }),
    queueRow({
      id: "case-fail",
      takeoffJobId: JOB_FAIL,
      customerName: "Fail Co",
      projectName: "Garage",
      workflowStatus: "Takeoff failed",
      takeoffJobStatus: "failed",
      takeoffReviewStatus: null
    })
  ];
  // CASE2 is already scoped.
  estimatesByCase.set(CASE2, {
    id: EST,
    status: "ready_to_price",
    intakeCaseId: CASE2,
    takeoffJobId: JOB2,
    scope: { rooms: scopedRooms }
  });

  const queueService = {
    async listQueue() {
      return { cases: rows };
    }
  };

  const estimateRepository = {
    async getActiveByIntakeCase(_org, caseId) {
      return estimatesByCase.get(String(caseId)) || null;
    }
  };

  const studioEstimateService = {
    repository: estimateRepository,
    async getOrCreateForCase({ intakeCaseId, takeoffJobId }) {
      createCalls += 1;
      const existing = estimatesByCase.get(String(intakeCaseId));
      if (existing) return existing;
      const created = {
        id: `est-${intakeCaseId}`,
        status: "draft",
        intakeCaseId,
        takeoffJobId,
        scope: { rooms: [] }
      };
      estimatesByCase.set(String(intakeCaseId), created);
      return created;
    },
    async refreshScopeFromTakeoff({ estimateId }) {
      refreshCalls += 1;
      for (const [caseId, est] of estimatesByCase.entries()) {
        if (est.id === estimateId) {
          const next = {
            ...est,
            status: "ready_to_price",
            scope: { rooms: scopedRooms }
          };
          estimatesByCase.set(caseId, next);
          return { estimate: next };
        }
      }
      return { estimate: null };
    },
    async updateScope({ estimateId, body }) {
      updateScopeCalls += 1;
      for (const [caseId, est] of estimatesByCase.entries()) {
        if (est.id === estimateId) {
          const patch = body?.scope && typeof body.scope === "object" ? body.scope : {};
          const rooms = Array.isArray(patch.rooms) ? patch.rooms : est.scope?.rooms || [];
          const next = {
            ...est,
            status: "ready_to_price",
            scope: {
              ...(est.scope || {}),
              ...patch,
              rooms
            }
          };
          estimatesByCase.set(caseId, next);
          return { estimate: next };
        }
      }
      return { estimate: null };
    }
  };

  /** @type {any[]} */
  const approveArgs = [];
  let reopenCalls = 0;

  const svc = createQuoteFlowSetScopeService({
    queueService,
    estimateRepository,
    studioEstimateService,
    approveAndBuildEstimate: async (args) => {
      approveCalls += 1;
      approveArgs.push(args);
      return { reviewStatus: "approved", takeoffJobId: JOB };
    },
    reopenTakeoffJobForMeasurementRevision: async () => {
      reopenCalls += 1;
      return { ok: true, alreadyEditable: false, reviewStatus: "needs_review" };
    },
    getTakeoffWorkspace: async () => ({
      status: "completed",
      reviewStatus: "needs_review",
      canApprove: true
    }),
    getLatestTakeoffResult: async () => ({
      id: "result-1",
      computedMeasurementsJson: { roomCount: 1, pieceCount: 2, totalSf: 40 }
    }),
    getSupabase: () => ({})
  });

  const list = await svc.listQueue({ organizationId: ORG });
  assert.equal(list.items.every((i) => i.alreadyScoped !== true), true);
  assert.equal(
    list.items.some((i) => i.takeoffJobId === JOB2),
    false,
    "already-scoped excluded from active queue"
  );
  assert.equal(list.items.some((i) => i.takeoffJobId === JOB), true);
  assert.equal(list.items.some((i) => i.takeoffJobId === JOB_FAIL), true);
  assert.equal(list.groups.ready.length >= 1, true);
  assert.equal(list.groups.failed.length, 1);
  console.log("ok: Queue excludes already-scoped; ready + failed remain");

  const scopedOnly = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "scoped" }
  });
  assert.equal(scopedOnly.items.length, 1);
  assert.equal(scopedOnly.items[0].takeoffJobId, JOB2);
  console.log("ok: filter=scoped returns scoped only (Estimates owns follow-on)");

  const detail = await svc.getQueueDetail({ organizationId: ORG, takeoffJobId: JOB });
  assert.equal(detail.review.takeoffJobId, JOB);
  assert.equal(detail.review.canSetScope, true);
  assert.equal(detail.item.summary.roomCount, 1);
  console.log("ok: Queue detail returns review metadata");

  const first = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: JOB,
    confirm: true
  });
  assert.equal(first.estimateId, `est-${CASE}`);
  assert.equal(first.created, true);
  assert.equal(first.message, "Scope is set for this estimate.");
  assert.equal(first.sideEffects.calculated, false);
  assert.equal(first.sideEffects.approved, false);
  assert.equal(first.sideEffects.published, false);
  assert.equal(first.sideEffects.sold, false);
  assert.equal(first.sideEffects.accepted, false);
  assert.equal(approveCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(createCalls >= 1, true);
  assert.equal(isOfficialScopeSet(estimatesByCase.get(CASE)), true);
  assert.equal(approveArgs[0]?.reopenIfApproved, false);
  console.log("ok: AI Takeoff Set Scope creates official scope");

  const afterScope = await svc.listQueue({ organizationId: ORG });
  assert.equal(
    afterScope.items.some((i) => i.takeoffJobId === JOB),
    false,
    "scoped item leaves active queue"
  );
  console.log("ok: after Set Scope item leaves Estimate Queue");

  const second = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: JOB,
    confirm: true
  });
  assert.equal(second.reused, true);
  assert.equal(second.alreadyScoped, true);
  assert.equal(second.message, "Scope is set for this estimate.");
  assert.equal(approveCalls, 1);
  assert.equal(refreshCalls, 1);
  console.log("ok: already_scoped treated as success");

  await assert.rejects(
    () => svc.setScope({ organizationId: ORG, takeoffJobId: JOB, confirm: false }),
    (e) => e.code === "set_scope_confirm_required"
  );
  console.log("ok: Set Scope requires confirm");

  const manualRooms = [
    {
      id: "mr1",
      name: "Kitchen",
      included: true,
      pieces: [
        {
          id: "mp1",
          name: "Island",
          lengthIn: 84,
          depthIn: 36,
          quantity: 1,
          included: true
        }
      ]
    }
  ];
  const manual = await svc.setManualScope({
    organizationId: ORG,
    takeoffJobId: JOB_FAIL,
    confirm: true,
    rooms: manualRooms,
    projectName: "Hoskins Williams Job",
    estimateName: "Hoskins Williams Job"
  });
  assert.equal(manual.ok, true);
  assert.equal(manual.created, true);
  assert.equal(manual.message, "Scope is set for this estimate.");
  assert.equal(manual.projectName, "Hoskins Williams Job");
  assert.equal(updateScopeCalls >= 1, true);
  assert.equal(isOfficialScopeSet(estimatesByCase.get("case-fail")), true);
  assert.equal(estimatesByCase.get("case-fail")?.scope?.projectName, "Hoskins Williams Job");
  assert.equal(manual.sideEffects.calculated, false);
  assert.equal(manual.sideEffects.published, false);
  console.log("ok: Manual Set Scope creates official scope with estimate name");

  const afterManual = await svc.listQueue({ organizationId: ORG });
  assert.equal(
    afterManual.items.some((i) => i.takeoffJobId === JOB_FAIL),
    false
  );
  console.log("ok: manual-scoped failed takeoff leaves queue");
}

{
  const objectLabels = presentQuoteFlowQueueItem({
    id: "c",
    takeoffJobId: JOB,
    customerName: {
      displayName: "Dave Untiedt",
      safeAddressLabel: "d***@x.com",
      emailPresent: true
    },
    projectName: "Project not named",
    planFilename: "plan.pdf",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review"
  });
  assert.equal(objectLabels.customerDisplay, "Dave Untiedt");
  assert.equal(objectLabels.defaultEstimateName, "plan");
  assert.doesNotMatch(JSON.stringify(objectLabels), /AAMk|Unknown contact — Unknown contact/);

  const weak = presentQuoteFlowQueueItem({
    id: "w",
    takeoffJobId: "job-w",
    customerName: "Customer not identified",
    projectName: "Project not named",
    subject: "Relihan VanderSchot Finals Plans",
    workflowStatus: "Takeoff draft ready",
    takeoffJobStatus: "completed",
    takeoffReviewStatus: "needs_review"
  });
  assert.equal(weak.defaultEstimateName, "Relihan VanderSchot Finals Plans");
  assert.doesNotMatch(`${weak.customerDisplay} — ${weak.projectDisplay}`, /Unknown contact — Unknown contact/);

  const sorted = sortQuoteFlowQueueItems([
    presentQuoteFlowQueueItem(
      queueRow({
        id: "f",
        takeoffJobId: "j-f",
        workflowStatus: "failed",
        takeoffJobStatus: "failed"
      })
    ),
    presentQuoteFlowQueueItem(queueRow({ id: "r", takeoffJobId: "j-r" }))
  ]);
  assert.equal(sorted[0].status.key, "ready_for_review");
  console.log("ok: labels fallback + ready group sorts first");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /\/api\/elite100-quote-flow\/queue/);
  assert.match(routes, /set-scope/);
  assert.match(routes, /set-manual-scope/);
  assert.doesNotMatch(
    routes,
    /publishDigitalEstimate|markSold|calculateStudio|approveWorkingDraft|takeoff-finish/
  );
  const setScopeSrc = readFileSync(join(__dirname, "quoteFlowSetScope.mjs"), "utf8");
  assert.match(setScopeSrc, /refreshScopeFromTakeoff/);
  assert.match(setScopeSrc, /approveAndBuildEstimate/);
  assert.match(setScopeSrc, /reopenTakeoffJobForMeasurementRevision|reopenIfApproved/);
  assert.match(setScopeSrc, /freezeReviewedMeasurements/);
  assert.match(setScopeSrc, /setManualScope/);
  assert.match(setScopeSrc, /alreadyScoped !== true/);
  assert.match(setScopeSrc, /NO_SIDE_EFFECTS|calculated: false/);
  console.log("ok: route/source contracts; no calculate/approve/publish/sold");
}

{
  // Dirty measurement payload → reopen + approve with takeoffResult in one Set Scope.
  const estimatesByCase = new Map();
  let approveCalls = 0;
  let reopenCalls = 0;
  /** @type {any[]} */
  const approveArgs = [];
  const dirtyJob = "22222222-2222-4222-8222-222222222225";
  const dirtyCase = "case-dirty";
  const rows = [
    queueRow({
      id: dirtyCase,
      takeoffJobId: dirtyJob,
      takeoffReviewStatus: "approved"
    })
  ];
  const studioEstimateService = {
    repository: {
      async getActiveByIntakeCase(_org, caseId) {
        return estimatesByCase.get(String(caseId)) || null;
      }
    },
    async getOrCreateForCase({ intakeCaseId, takeoffJobId }) {
      const existing = estimatesByCase.get(String(intakeCaseId));
      if (existing) return existing;
      const created = {
        id: `est-${intakeCaseId}`,
        status: "draft",
        intakeCaseId,
        takeoffJobId,
        scope: { rooms: [] }
      };
      estimatesByCase.set(String(intakeCaseId), created);
      return created;
    },
    async refreshScopeFromTakeoff({ estimateId }) {
      for (const [caseId, est] of estimatesByCase.entries()) {
        if (est.id === estimateId) {
          const next = {
            ...est,
            status: "ready_to_price",
            scope: { rooms: scopedRooms }
          };
          estimatesByCase.set(caseId, next);
          return { estimate: next };
        }
      }
      return { estimate: null };
    },
    async updateScope({ estimateId, body }) {
      for (const [caseId, est] of estimatesByCase.entries()) {
        if (est.id === estimateId) {
          const next = {
            ...est,
            status: "ready_to_price",
            scope: { ...(est.scope || {}), ...(body?.scope || {}) }
          };
          estimatesByCase.set(caseId, next);
          return { estimate: next };
        }
      }
      return { estimate: null };
    }
  };
  const svc = createQuoteFlowSetScopeService({
    queueService: { async listQueue() { return { cases: rows }; } },
    estimateRepository: studioEstimateService.repository,
    studioEstimateService,
    approveAndBuildEstimate: async (args) => {
      approveCalls += 1;
      approveArgs.push(args);
      assert.equal(args.reopenIfApproved, true);
      assert.ok(args.takeoffResult?.rooms);
      return { reviewStatus: "approved", takeoffJobId: dirtyJob };
    },
    reopenTakeoffJobForMeasurementRevision: async () => {
      reopenCalls += 1;
      return { ok: true, reviewStatus: "needs_review" };
    },
    getSupabase: () => ({})
  });
  const dirtyResult = {
    rooms: [{ id: "r-edit", name: "Kitchen", areas: [{ id: "a1", runs: [{ id: "p1", lengthIn: 100, depthIn: 26, included: true }] }] }]
  };
  const res = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: dirtyJob,
    confirm: true,
    takeoffResult: dirtyResult,
    reviewState: { excludedRunIds: [] },
    projectName: "Edited Scope Name"
  });
  assert.equal(res.ok, true);
  assert.equal(res.message, "Scope is set for this estimate.");
  assert.equal(approveCalls, 1);
  assert.equal(reopenCalls >= 1, true);
  assert.equal(isOfficialScopeSet(estimatesByCase.get(dirtyCase)), true);
  const after = await svc.listQueue({ organizationId: ORG });
  assert.equal(after.items.some((i) => i.takeoffJobId === dirtyJob), false);
  console.log("ok: Set Scope with dirty edits reopens + saves + scopes in one action");
}

{
  // Already-approved takeoff without dirty payload still Set Scopes (no Edit Measurements blocker).
  const estimatesByCase = new Map();
  let approveCalls = 0;
  const approvedJob = "22222222-2222-4222-8222-222222222226";
  const approvedCase = "case-approved";
  const rows = [
    queueRow({
      id: approvedCase,
      takeoffJobId: approvedJob,
      takeoffReviewStatus: "approved"
    })
  ];
  const studioEstimateService = {
    repository: {
      async getActiveByIntakeCase(_org, caseId) {
        return estimatesByCase.get(String(caseId)) || null;
      }
    },
    async getOrCreateForCase({ intakeCaseId, takeoffJobId }) {
      const created = {
        id: `est-${intakeCaseId}`,
        status: "draft",
        intakeCaseId,
        takeoffJobId,
        scope: { rooms: [] }
      };
      estimatesByCase.set(String(intakeCaseId), created);
      return created;
    },
    async refreshScopeFromTakeoff({ estimateId }) {
      for (const [caseId, est] of estimatesByCase.entries()) {
        if (est.id === estimateId) {
          const next = { ...est, status: "ready_to_price", scope: { rooms: scopedRooms } };
          estimatesByCase.set(caseId, next);
          return { estimate: next };
        }
      }
      return { estimate: null };
    },
    async updateScope({ estimateId, body }) {
      for (const [caseId, est] of estimatesByCase.entries()) {
        if (est.id === estimateId) {
          const next = {
            ...est,
            status: "ready_to_price",
            scope: { ...(est.scope || {}), ...(body?.scope || {}) }
          };
          estimatesByCase.set(caseId, next);
          return { estimate: next };
        }
      }
      return { estimate: null };
    }
  };
  const svc = createQuoteFlowSetScopeService({
    queueService: { async listQueue() { return { cases: rows }; } },
    estimateRepository: studioEstimateService.repository,
    studioEstimateService,
    approveAndBuildEstimate: async () => {
      approveCalls += 1;
      const err = new Error(
        "Approved Takeoff measurements cannot be changed. Open Edit Measurements to start a new editable revision."
      );
      err.code = "takeoff_already_approved";
      err.statusCode = 409;
      throw err;
    },
    getSupabase: () => ({})
  });
  const res = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: approvedJob,
    confirm: true
  });
  assert.equal(res.ok, true);
  assert.equal(res.message, "Scope is set for this estimate.");
  assert.equal(approveCalls, 1);
  assert.equal(isOfficialScopeSet(estimatesByCase.get(approvedCase)), true);
  console.log("ok: already-approved unscoped takeoff Set Scope succeeds without Edit Measurements blocker");
}

{
  const ui = readFileSync(
    join(root, "app-elite100-quote-flow/src/queue/EstimateQueuePage.tsx"),
    "utf8"
  );
  assert.match(ui, /Review Takeoff/);
  assert.match(ui, /Create Manual Scope/);
  assert.match(ui, /Set Scope/);
  assert.match(ui, /requestSetScopePayloadFromIframe/);
  assert.match(ui, /isValidQuoteFlowTriggerSetScope/);
  assert.match(ui, /Set Scope saves these reviewed measurements/);
  assert.match(ui, /quoteFlowSetScope/);
  assert.match(ui, /Open in Estimates/);
  assert.match(ui, /filter:\s*["']active["']/);
  assert.match(ui, /qf-queue-manual-builder|OfficialScopeEditor/);
  assert.match(ui, /do not refetch takeoff detail|Do not refetch takeoff detail/);
  assert.doesNotMatch(ui, /Approve Estimate/);
  assert.doesNotMatch(ui, /\bV1\b|\bV2\b|Studio V2/);
  assert.doesNotMatch(ui, /Use these measurements/);
  const takeoffUi = readFileSync(
    join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.match(takeoffUi, /QUOTE_FLOW_REQUEST_SET_SCOPE|eliteos-quote-flow-request-set-scope/);
  assert.match(takeoffUi, /QUOTE_FLOW_TRIGGER_SET_SCOPE|eliteos-quote-flow-trigger-set-scope/);
  assert.match(takeoffUi, /data-testid="ctr-quote-flow-set-scope"/);
  assert.match(takeoffUi, /reopenIfApproved:\s*quoteFlowSetScope/);
  // Save Draft must not render in quoteFlowSetScope footer (gated behind !quoteFlowSetScope).
  const saveDraftBlock = takeoffUi.slice(
    takeoffUi.indexOf('data-testid="ctr-add-piece"'),
    takeoffUi.indexOf('data-testid="ctr-quote-flow-set-scope"')
  );
  assert.match(saveDraftBlock, /!quoteFlowSetScope/);
  assert.match(saveDraftBlock, /ctr-save-draft/);
  assert.doesNotMatch(takeoffUi, /data-testid="ctr-approve-build"[\s\S]{0,200}quoteFlowSetScope/);
  assert.doesNotMatch(
    takeoffUi.slice(takeoffUi.indexOf("quoteFlowSetScope ? ("), takeoffUi.indexOf("ctr-quote-flow-set-scope") + 80),
    /Use these measurements/
  );
  console.log("ok: UI footer Set Scope; Save Draft hidden in Quote Flow mode");
}

console.log("\nquoteFlowSlice1c.test.mjs: ok\n");
