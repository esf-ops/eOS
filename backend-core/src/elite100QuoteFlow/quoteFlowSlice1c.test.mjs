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
    quoteName: "Kitchen",
    requestSubject: "Kitchen",
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
    confirm: true,
    projectName: "Slice1c Kitchen Quote"
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
    confirm: true,
    projectName: "Slice1c Kitchen Quote"
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
  assert.equal(objectLabels.defaultEstimateName, "Quote name required");
  assert.equal(objectLabels.quoteNameRequired, true);
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
  assert.match(routes, /queue\/:queueItemKey\/archive/);
  assert.match(routes, /queue\/:queueItemKey\/restore/);
  const setScopeSrc = readFileSync(join(__dirname, "quoteFlowSetScope.mjs"), "utf8");
  assert.match(setScopeSrc, /refreshScopeFromTakeoff/);
  assert.match(setScopeSrc, /approveAndBuildEstimate/);
  assert.match(setScopeSrc, /reopenTakeoffJobForMeasurementRevision|reopenIfApproved/);
  assert.match(setScopeSrc, /freezeReviewedMeasurements/);
  assert.match(setScopeSrc, /setManualScope/);
  assert.match(setScopeSrc, /alreadyScoped !== true/);
  assert.match(setScopeSrc, /NO_SIDE_EFFECTS|calculated: false/);
  // Set Scope path itself must not publish/sold/calculate — later Quote Flow slices
  // mount DE publish on the shared routes file (allowed outside set-scope).
  assert.doesNotMatch(
    setScopeSrc,
    /publishDigitalEstimate|markSold|calculateStudio|approveWorkingDraft|takeoff-finish/
  );
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
    confirm: true,
    projectName: "Approved Takeoff Quote"
  });
  assert.equal(res.ok, true);
  assert.equal(res.message, "Scope is set for this estimate.");
  assert.equal(approveCalls, 1);
  assert.equal(isOfficialScopeSet(estimatesByCase.get(approvedCase)), true);
  console.log("ok: already-approved unscoped takeoff Set Scope succeeds without Edit Measurements blocker");
}

{
  // No live client payload, but saved draft exists → Set Scope uses stored takeoff + openEdgeLf.
  const estimatesByCase = new Map();
  let approveCalls = 0;
  let updateScopeCalls = 0;
  let latestCalls = 0;
  const savedJob = "22222222-2222-4222-8222-222222222228";
  const savedCase = "case-saved-draft";
  const rows = [
    queueRow({
      id: savedCase,
      takeoffJobId: savedJob,
      takeoffReviewStatus: "needs_review"
    })
  ];
  const savedDraft = {
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        areas: [
          {
            id: "a1",
            runs: [
              {
                id: "run-island",
                label: "Island",
                included: true,
                lengthIn: 96,
                depthIn: 25.5,
                finishedEdge: { totalFinishedEdgeLengthIn: 147, approved: true }
              }
            ]
          }
        ]
      }
    ]
  };
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
          const next = {
            ...est,
            status: "ready_to_price",
            scope: {
              rooms: [
                {
                  id: "r1",
                  name: "Kitchen",
                  included: true,
                  pieces: [
                    {
                      id: "p1",
                      name: "Island",
                      takeoffRunId: "run-island",
                      lengthIn: 96,
                      depthIn: 25.5,
                      quantity: 1,
                      included: true,
                      finishedEdge: { totalFinishedEdgeLengthIn: 147, approved: true }
                    }
                  ]
                }
              ]
            }
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
          const next = {
            ...est,
            scope: { ...(est.scope || {}), ...patch, rooms: patch.rooms || est.scope?.rooms }
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
      // No live client payload — approve loads saved result itself.
      assert.equal(args.takeoffResult, undefined);
      return { reviewStatus: "approved", takeoffJobId: savedJob };
    },
    getLatestTakeoffResult: async () => {
      latestCalls += 1;
      return { normalizedTakeoffJson: savedDraft, takeoffResult: savedDraft };
    },
    getSupabase: () => ({})
  });
  const res = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: savedJob,
    confirm: true,
    projectName: "Saved Draft Scope"
  });
  assert.equal(res.ok, true);
  assert.equal(res.message, "Scope is set for this estimate.");
  assert.equal(approveCalls, 1);
  assert.ok(latestCalls >= 1, "saved draft loaded for openEdgeLf fallback");
  assert.ok(updateScopeCalls >= 1, "openEdgeLf stamp persisted");
  const scoped = estimatesByCase.get(savedCase);
  assert.equal(isOfficialScopeSet(scoped), true);
  assert.equal(scoped.scope.rooms[0].pieces[0].openEdgeLf, 12.25);
  assert.equal(scoped.scope.rooms[0].pieces[0].exposedEdgeLf, 12.25);
  assert.equal(scoped.scope.rooms[0].pieces[0].finishedEdgeLf, 12.25);
  const after = await svc.listQueue({ organizationId: ORG });
  assert.equal(after.items.some((i) => i.takeoffJobId === savedJob), false);
  console.log("ok: Set Scope without live payload uses saved draft + openEdgeLf");
}

{
  // Neither live payload nor saved/approved measurements → Set Scope fails (parent shows Save draft first).
  const estimatesByCase = new Map();
  const emptyJob = "22222222-2222-4222-8222-222222222229";
  const emptyCase = "case-no-measurements";
  const rows = [
    queueRow({
      id: emptyCase,
      takeoffJobId: emptyJob,
      takeoffReviewStatus: "needs_review"
    })
  ];
  const svc = createQuoteFlowSetScopeService({
    queueService: { async listQueue() { return { cases: rows }; } },
    estimateRepository: {
      async getActiveByIntakeCase(_org, caseId) {
        return estimatesByCase.get(String(caseId)) || null;
      }
    },
    studioEstimateService: {
      repository: {
        async getActiveByIntakeCase(_org, caseId) {
          return estimatesByCase.get(String(caseId)) || null;
        }
      },
      async getOrCreateForCase() {
        throw new Error("should not create estimate without measurements");
      },
      async refreshScopeFromTakeoff() {
        throw new Error("should not refresh without measurements");
      }
    },
    approveAndBuildEstimate: async () => {
      const err = new Error("No saved result found for this takeoff workspace");
      err.statusCode = 404;
      throw err;
    },
    getLatestTakeoffResult: async () => {
      const err = new Error("No saved result found for this takeoff workspace");
      err.statusCode = 404;
      throw err;
    },
    getSupabase: () => ({})
  });
  await assert.rejects(
    () =>
      svc.setScope({
        organizationId: ORG,
        takeoffJobId: emptyJob,
        confirm: true,
        projectName: "Empty Measurements Quote"
      }),
    (err) => {
      const msg = String(err?.message || "");
      const code = String(err?.code || "");
      assert.match(code || msg, /takeoff_not_ready|No saved result|Review measurements/i);
      return true;
    }
  );
  console.log("ok: Set Scope without live or saved measurements fails clearly");
}

{
  // Open edge LF carry-forward: AI Set Scope stamps canonical piece.openEdgeLf.
  const {
    resolvePieceOpenEdgeLf,
    stampPieceOpenEdgeLf,
    applyTakeoffOpenEdgeLfToOfficialRooms,
    stampOpenEdgeLfOnTakeoffResult
  } = await import("./quoteFlowOpenEdge.mjs");
  const { summarizeOfficialScope } = await import("./quoteFlowEstimatesPresenter.mjs");
  const { seedScopeFromTakeoffPayload } = await import(
    "../elite100EstimateStudio/studioEstimateService.mjs"
  );
  const { buildTakeoffImportPayload } = await import("../takeoff/takeoffImportPayload.mjs");

  assert.equal(resolvePieceOpenEdgeLf({ openEdgeLf: 8.5 }), 8.5);
  assert.equal(resolvePieceOpenEdgeLf({ exposedEdgeLf: 4 }), 4);
  assert.equal(
    resolvePieceOpenEdgeLf({ finishedEdge: { totalFinishedEdgeLengthIn: 36 } }),
    3
  );
  assert.equal(resolvePieceOpenEdgeLf({}), 0);
  assert.equal(resolvePieceOpenEdgeLf({ openEdgeLf: "", exposedEdgeLf: null }), 0);
  assert.equal(Number.isNaN(resolvePieceOpenEdgeLf({ openEdgeLf: "nope" })), false);
  // Explicit openEdgeLf:0 must not hide review finishedEdge inches (UI "X.XX LF" source).
  assert.equal(
    resolvePieceOpenEdgeLf({
      openEdgeLf: 0,
      finishedEdge: { totalFinishedEdgeLengthIn: 48.96 }
    }),
    4.08
  );
  assert.equal(stampPieceOpenEdgeLf({ name: "A" }).openEdgeLf, 0);
  assert.equal(stampPieceOpenEdgeLf({ name: "A", exposedEdgeLf: 7 }).openEdgeLf, 7);
  assert.equal(stampPieceOpenEdgeLf({ name: "A", exposedEdgeLf: 7 }).finishedEdgeLf, 7);
  console.log("ok: openEdgeLf resolve/stamp defaults blank to 0, never NaN");

  const takeoffWithOpen = {
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        areas: [
          {
            id: "a1",
            label: "Main",
            runs: [
              {
                id: "run-island",
                label: "Island",
                lengthIn: 96,
                depthIn: 25.5,
                included: true,
                openEdgeLf: 12.25
              }
            ]
          }
        ]
      }
    ]
  };
  const stampedDraft = stampOpenEdgeLfOnTakeoffResult({
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        areas: [
          {
            id: "a1",
            runs: [
              {
                id: "run-island",
                label: "Island",
                lengthIn: 96,
                depthIn: 25.5,
                included: true,
                finishedEdge: { totalFinishedEdgeLengthIn: 147, approved: true }
              }
            ]
          }
        ]
      }
    ]
  });
  assert.equal(stampedDraft.rooms[0].areas[0].runs[0].openEdgeLf, 12.25);
  console.log("ok: takeoff draft stamp carries finishedEdge inches → openEdgeLf");

  const officialFromExposed = applyTakeoffOpenEdgeLfToOfficialRooms(
    [
      {
        id: "r1",
        name: "Kitchen",
        included: true,
        pieces: [{ id: "run-island", name: "Island", takeoffRunId: "run-island", lengthIn: 96, depthIn: 25.5, quantity: 1, included: true }]
      }
    ],
    {
      rooms: [
        {
          areas: [
            {
              runs: [
                {
                  id: "run-island",
                  label: "Island",
                  included: true,
                  exposedEdgeLf: 9.5
                }
              ]
            }
          ]
        }
      ]
    }
  );
  assert.equal(officialFromExposed[0].pieces[0].openEdgeLf, 9.5);
  console.log("ok: exposedEdgeLf from takeoff carries into official openEdgeLf");

  const fromInches = applyTakeoffOpenEdgeLfToOfficialRooms(
    [
      {
        id: "r1",
        included: true,
        pieces: [{ id: "p1", name: "Island", takeoffRunId: "run1", lengthIn: 96, depthIn: 25.5, included: true }]
      }
    ],
    {
      rooms: [
        {
          areas: [
            {
              runs: [
                {
                  id: "run1",
                  label: "Island",
                  included: true,
                  finishedEdge: { totalFinishedEdgeLengthIn: 120 }
                }
              ]
            }
          ]
        }
      ]
    }
  );
  assert.equal(fromInches[0].pieces[0].openEdgeLf, 10);
  console.log("ok: finishedEdge.totalFinishedEdgeLengthIn converts inches → LF");

  // seedScopeFromTakeoffPayload now writes canonical openEdgeLf
  const payload = buildTakeoffImportPayload({
    takeoffJobId: JOB,
    takeoffResultId: "res-edge",
    takeoffResult: {
      schemaVersion: "1.0",
      status: "approved",
      rooms: [
        {
          id: "r1",
          name: "Kitchen",
          roomType: "Kitchen",
          areas: [
            {
              id: "a1",
              label: "Main",
              runs: [
                {
                  id: "run1",
                  label: "Island",
                  lengthIn: 96,
                  depthIn: 25.5,
                  pieceType: "counter",
                  included: true,
                  finishedEdge: {
                    approved: true,
                    finishedEdgeConfirmed: true,
                    totalFinishedEdgeLengthIn: 147,
                    frontEdgeLengthIn: 96
                  }
                }
              ]
            }
          ]
        }
      ]
    },
    requireApproved: false,
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
  const seeded = seedScopeFromTakeoffPayload(payload, { projectName: "Edge Job" });
  assert.equal(seeded.rooms[0].pieces[0].openEdgeLf, 12.25);
  assert.equal(seeded.rooms[0].pieces[0].finishedEdgeLf, 12.25);
  assert.equal(summarizeOfficialScope(seeded).openEdgeLf, 12.25);
  console.log("ok: seedScopeFromTakeoffPayload writes canonical openEdgeLf");

  // End-to-end Set Scope with dirty review payload including openEdgeLf
  const estimatesByCase = new Map();
  let approveCalls = 0;
  let updateScopeCalls = 0;
  const edgeJob = "22222222-2222-4222-8222-222222222227";
  const edgeCase = "case-edge-lf";
  const rows = [
    queueRow({
      id: edgeCase,
      takeoffJobId: edgeJob,
      takeoffReviewStatus: "needs_review"
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
          // Seeded without openEdgeLf (historical drop) — Set Scope must stamp it.
          const next = {
            ...est,
            status: "ready_to_price",
            scope: {
              rooms: [
                {
                  id: "r1",
                  name: "Kitchen",
                  included: true,
                  pieces: [
                    {
                      id: "p1",
                      name: "Island",
                      takeoffRunId: "run-island",
                      lengthIn: 96,
                      depthIn: 25.5,
                      quantity: 1,
                      included: true,
                      finishedEdge: { totalFinishedEdgeLengthIn: 147, approved: true }
                    }
                  ]
                }
              ]
            }
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
          const next = {
            ...est,
            scope: { ...(est.scope || {}), ...patch, rooms: patch.rooms || est.scope?.rooms }
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
      assert.equal(args.takeoffResult?.rooms?.[0]?.areas?.[0]?.runs?.[0]?.openEdgeLf, 12.25);
      return { reviewStatus: "approved", takeoffJobId: edgeJob };
    },
    reopenTakeoffJobForMeasurementRevision: async () => ({ ok: true }),
    getSupabase: () => ({})
  });
  const dirtyTakeoff = {
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        areas: [
          {
            id: "a1",
            runs: [
              {
                id: "run-island",
                label: "Island",
                lengthIn: 96,
                depthIn: 25.5,
                included: true,
                openEdgeLf: 12.25,
                finishedEdge: { totalFinishedEdgeLengthIn: 147, approved: true }
              }
            ]
          }
        ]
      }
    ]
  };
  const res = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: edgeJob,
    confirm: true,
    takeoffResult: dirtyTakeoff,
    reviewState: { excludedRunIds: [] },
    projectName: "Edge Carry Job"
  });
  assert.equal(res.ok, true);
  assert.equal(approveCalls, 1);
  assert.ok(updateScopeCalls >= 1, "openEdgeLf stamp persisted via updateScope");
  const scoped = estimatesByCase.get(edgeCase);
  assert.equal(scoped.scope.rooms[0].pieces[0].openEdgeLf, 12.25);
  assert.equal(summarizeOfficialScope(scoped.scope).openEdgeLf, 12.25);
  console.log("ok: dirty Set Scope with openEdgeLf saves + stamps official scope");

  // Manual scope preserves openEdgeLf through normalize
  const { validateAndNormalizeOfficialScopeRooms } = await import("./quoteFlowEstimates.mjs");
  const manual = validateAndNormalizeOfficialScopeRooms([
    {
      id: "r1",
      name: "Bath",
      included: true,
      pieces: [
        {
          id: "p1",
          name: "Vanity",
          lengthIn: 60,
          depthIn: 22,
          quantity: 1,
          included: true,
          openEdgeLf: 5.5
        }
      ]
    }
  ]);
  assert.equal(manual[0].pieces[0].openEdgeLf, 5.5);
  assert.equal(manual[0].pieces[0].finishedEdgeLf, 5.5);
  console.log("ok: manual scope openEdgeLf preserved by normalize");
}

{
  // PRODUCTION PATH: getOrCreate seeds usable rooms (afterEnsure early-return).
  // Review UI shows exposed edge from finishedEdge.totalFinishedEdgeLengthIn only
  // (no piece.openEdgeLf). Live Set Scope payload must still stamp official openEdgeLf.
  const { summarizeOfficialScope } = await import("./quoteFlowEstimatesPresenter.mjs");
  const { validateAndNormalizeOfficialScopeRooms } = await import("./quoteFlowEstimates.mjs");
  const { buildTakeoffImportPayload } = await import("../takeoff/takeoffImportPayload.mjs");
  const { seedScopeFromTakeoffPayload } = await import(
    "../elite100EstimateStudio/studioEstimateService.mjs"
  );
  const { stampOpenEdgeLfOnTakeoffDraft } = await import(
    join(root, "app-ai-takeoff/src/lib/takeoffReviewReadyContract.mjs")
  );

  // Observed review display values (LF) → stored as inches on finishedEdge.
  const reviewLf = [4.08, 6.0, 24.5, 12.25, 5.71, 2.76];
  const reviewRuns = reviewLf.map((lf, i) => ({
    id: `run-${i + 1}`,
    label: i === 0 ? "Sink run" : `Piece ${i + 1}`,
    included: true,
    lengthIn: 60 + i * 6,
    depthIn: 25.5,
    // UI reads this — not openEdgeLf — via formatExposedSidesTriggerText
    finishedEdge: {
      totalFinishedEdgeLengthIn: Math.round(lf * 12 * 100) / 100,
      // Often present in review WITHOUT approved=true until Confirm
      approved: false,
      finishedEdgeConfirmed: false
    },
    // Estimator-confirmed kitchen sink cutout on Sink run (takeoff shape).
    ...(i === 0
      ? {
          cutouts: [
            { type: "kitchen_sink", quantity: 1, source: "estimator_confirmed" }
          ]
        }
      : {})
  }));
  const reviewDraft = {
    schemaVersion: "1.0",
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        areas: [{ id: "area-1", label: "Main", runs: reviewRuns }]
      }
    ]
  };

  // Save Draft / Set Scope live stamp mirrors iframe reply
  const stampedLive = stampOpenEdgeLfOnTakeoffDraft(structuredClone(reviewDraft));
  for (let i = 0; i < reviewLf.length; i += 1) {
    assert.equal(
      stampedLive.rooms[0].areas[0].runs[i].openEdgeLf,
      reviewLf[i],
      `live stamp run ${i + 1}`
    );
  }
  console.log("ok: realistic review finishedEdge inches → Save Draft / live stamp openEdgeLf");

  // Import must NOT replace review inches with draft_suggestion when inches exist
  const importPayload = buildTakeoffImportPayload({
    takeoffJobId: "22222222-2222-4222-8222-222222222230",
    takeoffResultId: "res-real-edge",
    takeoffResult: { ...reviewDraft, status: "approved" },
    reviewState: { excludedRunIds: [] },
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
  for (let i = 0; i < reviewLf.length; i += 1) {
    const piece = importPayload.rooms[0].pieces[i];
    assert.ok(piece, `import piece ${i + 1}`);
    assert.equal(piece.openEdgeLf, reviewLf[i], `import openEdgeLf piece ${i + 1}`);
    assert.equal(
      Number(piece.finishedEdge?.totalFinishedEdgeLengthIn),
      Math.round(reviewLf[i] * 12 * 100) / 100,
      `import finishedEdge inches piece ${i + 1}`
    );
    assert.notEqual(piece.finishedEdge?.source, "draft_suggestion");
  }
  const seeded = seedScopeFromTakeoffPayload(importPayload, { projectName: "20260529091846252" });
  assert.equal(seeded.rooms[0].pieces.length, 6);
  for (let i = 0; i < reviewLf.length; i += 1) {
    assert.equal(seeded.rooms[0].pieces[i].openEdgeLf, reviewLf[i], `seed piece ${i + 1}`);
  }
  assert.equal(summarizeOfficialScope(seeded).openEdgeLf, 55.3);
  console.log("ok: seedScopeFromTakeoffPayload writes openEdgeLf from review finishedEdge inches");

  // Normalizer must not wipe finishedEdge inches when openEdgeLf was historically 0
  const wipedRisk = validateAndNormalizeOfficialScopeRooms([
    {
      id: "r1",
      name: "Kitchen",
      included: true,
      pieces: [
        {
          id: "p1",
          name: "Piece 1",
          lengthIn: 60,
          depthIn: 25.5,
          quantity: 1,
          included: true,
          openEdgeLf: 0,
          finishedEdge: { totalFinishedEdgeLengthIn: 48.96 }
        }
      ]
    }
  ]);
  assert.equal(wipedRisk[0].pieces[0].openEdgeLf, 4.08);
  assert.equal(wipedRisk[0].pieces[0].finishedEdge.totalFinishedEdgeLengthIn, 48.96);
  console.log("ok: official scope normalizer does not wipe openEdgeLf / finishedEdge inches");

  // Set Scope afterEnsure path: getOrCreate already seeded rooms with openEdgeLf:0
  const estimatesByCase = new Map();
  let updateScopeCalls = 0;
  const realJob = "22222222-2222-4222-8222-222222222231";
  const realCase = "case-real-open-edge";
  const zeroedSeedRooms = [
    {
      id: "r1",
      name: "Kitchen",
      included: true,
      pieces: reviewRuns.map((run, i) => ({
        id: `p${i + 1}`,
        name: run.label,
        takeoffRunId: run.id,
        lengthIn: run.lengthIn,
        depthIn: run.depthIn,
        quantity: 1,
        included: true,
        openEdgeLf: 0,
        exposedEdgeLf: 0,
        finishedEdgeLf: 0,
        // Historical seed kept inches but wrote openEdgeLf:0
        finishedEdge: { ...run.finishedEdge }
      }))
    }
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
        status: "ready_to_price",
        intakeCaseId,
        takeoffJobId,
        scope: { rooms: structuredClone(zeroedSeedRooms), physicalScopeSource: "takeoff" }
      };
      estimatesByCase.set(String(intakeCaseId), created);
      return created;
    },
    async refreshScopeFromTakeoff() {
      throw new Error("refreshScopeFromTakeoff must not run on afterEnsure path");
    },
    async updateScope({ estimateId, body }) {
      updateScopeCalls += 1;
      for (const [caseId, est] of estimatesByCase.entries()) {
        if (est.id === estimateId) {
          const patch = body?.scope && typeof body.scope === "object" ? body.scope : {};
          const next = {
            ...est,
            scope: { ...(est.scope || {}), ...patch, rooms: patch.rooms || est.scope?.rooms }
          };
          estimatesByCase.set(caseId, next);
          return { estimate: next };
        }
      }
      return { estimate: null };
    }
  };
  const svc = createQuoteFlowSetScopeService({
    queueService: {
      async listQueue() {
        return {
          cases: [
            queueRow({
              id: realCase,
              takeoffJobId: realJob,
              takeoffReviewStatus: "needs_review",
              projectName: "20260529091846252"
            })
          ]
        };
      }
    },
    estimateRepository: studioEstimateService.repository,
    studioEstimateService,
    approveAndBuildEstimate: async () => ({ reviewStatus: "approved", takeoffJobId: realJob }),
    getSupabase: () => ({})
  });

  const res = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: realJob,
    confirm: true,
    projectName: "Open Edge Carry Quote",
    // Live iframe payload shape (finishedEdge inches; stamp adds openEdgeLf)
    takeoffResult: stampedLive
  });
  assert.equal(res.ok, true);
  assert.ok(updateScopeCalls >= 1, "afterEnsure path must persist openEdgeLf via updateScope");
  const scoped = estimatesByCase.get(realCase);
  assert.equal(isOfficialScopeSet(scoped), true);
  const pieces = scoped.scope.rooms[0].pieces;
  assert.equal(pieces.length, 6);
  for (let i = 0; i < reviewLf.length; i += 1) {
    assert.equal(pieces[i].openEdgeLf, reviewLf[i], `official piece ${i + 1} openEdgeLf`);
    assert.equal(pieces[i].exposedEdgeLf, reviewLf[i]);
    assert.equal(pieces[i].finishedEdgeLf, reviewLf[i]);
    assert.ok(Number(pieces[i].finishedEdge.totalFinishedEdgeLengthIn) > 0);
  }
  assert.equal(
    pieces[0].kitchenSinkCutouts,
    1,
    "afterEnsure Set Scope stamps Studio kitchenSinkCutouts from takeoff cutouts[]"
  );
  assert.equal(scoped.scope.addOns?.["qty-sink"], 1, "afterEnsure syncs qty-sink into official addOns");
  const summary = summarizeOfficialScope(scoped.scope);
  assert.equal(summary.openEdgeLf, 55.3);
  assert.equal(summary.pieceCount, 6);
  const after = await svc.listQueue({ organizationId: ORG });
  assert.equal(after.items.some((i) => i.takeoffJobId === realJob), false);

  // Saved-draft fallback (no live payload) still carries edges via getLatestTakeoffResult
  const estimatesByCase2 = new Map();
  const savedJob2 = "22222222-2222-4222-8222-222222222232";
  const savedCase2 = "case-real-saved-fallback";
  const studio2 = {
    repository: {
      async getActiveByIntakeCase(_org, caseId) {
        return estimatesByCase2.get(String(caseId)) || null;
      }
    },
    async getOrCreateForCase({ intakeCaseId, takeoffJobId }) {
      const created = {
        id: `est-${intakeCaseId}`,
        status: "ready_to_price",
        intakeCaseId,
        takeoffJobId,
        scope: { rooms: structuredClone(zeroedSeedRooms) }
      };
      estimatesByCase2.set(String(intakeCaseId), created);
      return created;
    },
    async refreshScopeFromTakeoff() {
      throw new Error("should not refresh on afterEnsure");
    },
    async updateScope({ estimateId, body }) {
      for (const [caseId, est] of estimatesByCase2.entries()) {
        if (est.id === estimateId) {
          const patch = body?.scope && typeof body.scope === "object" ? body.scope : {};
          const next = {
            ...est,
            scope: { ...(est.scope || {}), ...patch, rooms: patch.rooms || est.scope?.rooms }
          };
          estimatesByCase2.set(caseId, next);
          return { estimate: next };
        }
      }
      return { estimate: null };
    }
  };
  const svc2 = createQuoteFlowSetScopeService({
    queueService: {
      async listQueue() {
        return {
          cases: [queueRow({ id: savedCase2, takeoffJobId: savedJob2, takeoffReviewStatus: "needs_review" })]
        };
      }
    },
    estimateRepository: studio2.repository,
    studioEstimateService: studio2,
    approveAndBuildEstimate: async () => ({ reviewStatus: "approved" }),
    getLatestTakeoffResult: async () => ({
      normalizedTakeoffJson: reviewDraft,
      takeoffResult: reviewDraft
    }),
    getSupabase: () => ({})
  });
  const res2 = await svc2.setScope({
    organizationId: ORG,
    takeoffJobId: savedJob2,
    confirm: true,
    projectName: "Saved Draft Open Edge Quote"
  });
  assert.equal(res2.ok, true);
  const scoped2 = estimatesByCase2.get(savedCase2);
  assert.equal(summarizeOfficialScope(scoped2.scope).openEdgeLf, 55.3);
  console.log("ok: production afterEnsure Set Scope + saved-draft fallback carry review open edge LF");
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
  assert.match(ui, /Save draft first, then Set Scope/);
  assert.match(ui, /Review measurements\. Save draft if needed, then Set Scope from the Quote Flow/);
  assert.match(ui, /payload\?\.takeoffResult \|\| undefined/);
  assert.match(ui, /backend uses latest|saved reviewed takeoff|Save Draft/);
  assert.match(ui, /quoteFlowSetScope/);
  assert.match(ui, /Open in Estimates/);
  assert.match(ui, /filter:\s*["']active["']/);
  assert.match(ui, /qf-queue-manual-builder|OfficialScopeEditor/);
  assert.match(ui, /do not refetch takeoff detail|Do not refetch takeoff detail/);
  assert.doesNotMatch(ui, /if \(!payload\?\.takeoffResult\)/);
  assert.doesNotMatch(ui, /isValidQuoteFlowTriggerSetScope|QUOTE_FLOW_TRIGGER_SET_SCOPE|eliteos-quote-flow-trigger-set-scope/);
  assert.doesNotMatch(ui, /Approve Estimate/);
  assert.doesNotMatch(ui, /\bV1\b|\bV2\b|Studio V2/);
  assert.doesNotMatch(ui, /Use these measurements/);
  const setScopeSrc = readFileSync(join(__dirname, "quoteFlowSetScope.mjs"), "utf8");
  assert.match(setScopeSrc, /persistOpenEdgeLfOnEstimate/);
  assert.match(setScopeSrc, /applyTakeoffOpenEdgeLfToOfficialRooms/);
  assert.match(setScopeSrc, /loadSavedReviewedTakeoffResult|resolveTakeoffResultForOpenEdge/);
  assert.match(setScopeSrc, /stampOpenEdgeLfOnTakeoffResult/);
  assert.match(setScopeSrc, /getLatestTakeoffResult/);
  assert.match(setScopeSrc, /afterEnsure/);
  const takeoffUi = readFileSync(
    join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.match(takeoffUi, /QUOTE_FLOW_REQUEST_SET_SCOPE|eliteos-quote-flow-request-set-scope/);
  assert.doesNotMatch(takeoffUi, /QUOTE_FLOW_TRIGGER_SET_SCOPE|eliteos-quote-flow-trigger-set-scope/);
  assert.doesNotMatch(takeoffUi, /data-testid="ctr-quote-flow-set-scope"/);
  assert.match(takeoffUi, /data-testid="ctr-save-draft"/);
  assert.match(takeoffUi, /data-testid="ctr-quote-flow-set-scope-hint"/);
  assert.match(takeoffUi, /reopenIfApproved:\s*quoteFlowSetScope/);
  assert.match(takeoffUi, /stampOpenEdgeLfOnTakeoffDraft/);
  // Footer Save draft is always present (not gated behind !quoteFlowSetScope).
  const saveDraftStart = takeoffUi.indexOf('data-testid="ctr-save-draft"');
  const saveDraftBtn = takeoffUi.slice(saveDraftStart, saveDraftStart + 900);
  assert.match(saveDraftBtn, /Save draft/);
  assert.doesNotMatch(saveDraftBtn, /!quoteFlowSetScope/);
  assert.doesNotMatch(takeoffUi, /data-testid="ctr-approve-build"[\s\S]{0,200}quoteFlowSetScope/);
  assert.doesNotMatch(
    takeoffUi.slice(
      takeoffUi.indexOf("quoteFlowSetScope ? ("),
      takeoffUi.indexOf("ctr-quote-flow-set-scope-hint") + 120
    ),
    /Use these measurements/
  );
  const contract = readFileSync(
    join(root, "app-ai-takeoff/src/lib/takeoffReviewReadyContract.mjs"),
    "utf8"
  );
  assert.match(contract, /stampOpenEdgeLfOnTakeoffDraft/);
  assert.match(contract, /resolveRunOpenEdgeLf/);
  assert.match(contract, /openEdgeLf/);
  assert.doesNotMatch(contract, /QUOTE_FLOW_TRIGGER_SET_SCOPE|eliteos-quote-flow-trigger-set-scope/);
  const origins = readFileSync(
    join(root, "app-elite100-quote-flow/src/lib/takeoffPostMessageOrigins.mjs"),
    "utf8"
  );
  assert.match(origins, /requestSetScopePayloadFromIframe/);
  assert.doesNotMatch(origins, /QUOTE_FLOW_TRIGGER_SET_SCOPE|isValidQuoteFlowTriggerSetScope/);
  console.log("ok: header Set Scope only; Save Draft restored; openEdgeLf payload contract");
}

console.log("\nquoteFlowSlice1c.test.mjs: ok\n");
