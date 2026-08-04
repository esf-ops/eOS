/**
 * Elite 100 Quote Flow — Slice 1C Estimate Queue + Set Scope.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowSlice1c.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuoteFlowSetScopeService } from "./quoteFlowSetScope.mjs";
import { presentQuoteFlowQueueItem } from "./quoteFlowQueuePresenter.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowSlice1c.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "case-queue-1";
const JOB = "22222222-2222-4222-8222-222222222222";
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
    ...overrides
  };
}

{
  const item = presentQuoteFlowQueueItem(queueRow());
  assert.equal(item.status.key, "ready_for_review");
  assert.equal(item.actionLabel, "Review Takeoff");
  const scoped = presentQuoteFlowQueueItem(queueRow({ workflowStatus: "Scope in progress" }), {
    alreadyScoped: true,
    estimateId: EST
  });
  assert.equal(scoped.status.key, "scope_set");
  console.log("ok: queue presenter");
}

{
  /** @type {any} */
  let estimateState = null;
  let approveCalls = 0;
  let refreshCalls = 0;
  let createCalls = 0;

  const queueService = {
    async listQueue() {
      return { cases: [queueRow()] };
    }
  };

  const estimateRepository = {
    async getActiveByIntakeCase() {
      return estimateState;
    }
  };

  const studioEstimateService = {
    repository: estimateRepository,
    async getOrCreateForCase() {
      createCalls += 1;
      if (!estimateState) {
        estimateState = {
          id: EST,
          status: "draft",
          intakeCaseId: CASE,
          takeoffJobId: JOB,
          scope: { rooms: [] }
        };
      }
      return estimateState;
    },
    async refreshScopeFromTakeoff() {
      refreshCalls += 1;
      estimateState = {
        id: EST,
        status: "ready_to_price",
        intakeCaseId: CASE,
        takeoffJobId: JOB,
        scope: { rooms: scopedRooms }
      };
      return { estimate: estimateState };
    }
  };

  const svc = createQuoteFlowSetScopeService({
    queueService,
    estimateRepository,
    studioEstimateService,
    approveAndBuildEstimate: async () => {
      approveCalls += 1;
      return { reviewStatus: "approved", takeoffJobId: JOB };
    },
    getTakeoffWorkspace: async () => ({
      status: "completed",
      reviewStatus: "needs_review",
      canApprove: true
    }),
    getLatestTakeoffResult: async () => ({
      id: "result-1",
      computedMeasurementsJson: { roomCount: 1, pieceCount: 1 }
    }),
    getSupabase: () => ({})
  });

  const list = await svc.listQueue({ organizationId: ORG });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].takeoffJobId, JOB);
  assert.equal(list.items[0].status.key, "ready_for_review");
  console.log("ok: Queue route lists returned takeoff jobs");

  const detail = await svc.getQueueDetail({ organizationId: ORG, takeoffJobId: JOB });
  assert.equal(detail.review.takeoffJobId, JOB);
  assert.equal(detail.review.canSetScope, true);
  console.log("ok: Queue detail returns review metadata");

  const first = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: JOB,
    confirm: true
  });
  assert.equal(first.estimateId, EST);
  assert.equal(first.created, true);
  assert.equal(first.sideEffects.calculated, false);
  assert.equal(first.sideEffects.approved, false);
  assert.equal(first.sideEffects.published, false);
  assert.equal(first.sideEffects.sold, false);
  assert.equal(first.sideEffects.accepted, false);
  assert.equal(approveCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(createCalls, 1);
  assert.equal(isOfficialScopeSet(estimateState), true);
  assert.equal(estimateState.scope.rooms.length, 1);
  console.log("ok: Set Scope creates official scope");

  const roomsBefore = estimateState.scope.rooms.length;
  const second = await svc.setScope({
    organizationId: ORG,
    takeoffJobId: JOB,
    confirm: true
  });
  assert.equal(second.reused, true);
  assert.equal(second.alreadyScoped, true);
  assert.equal(second.estimateId, EST);
  assert.equal(estimateState.scope.rooms.length, roomsBefore);
  assert.equal(approveCalls, 1); // no second approve when already scoped
  assert.equal(refreshCalls, 1); // no re-seed
  console.log("ok: Set Scope retry reuses existing scope; no duplicate rooms");

  await assert.rejects(
    () => svc.setScope({ organizationId: ORG, takeoffJobId: JOB, confirm: false }),
    (e) => e.code === "set_scope_confirm_required"
  );
  console.log("ok: Set Scope requires confirm");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /\/api\/elite100-quote-flow\/queue/);
  assert.match(routes, /set-scope/);
  assert.doesNotMatch(routes, /publishDigitalEstimate|markSold|calculateStudio|approveWorkingDraft|takeoff-finish/);
  const setScopeSrc = readFileSync(join(__dirname, "quoteFlowSetScope.mjs"), "utf8");
  assert.match(setScopeSrc, /refreshScopeFromTakeoff/);
  assert.match(setScopeSrc, /approveAndBuildEstimate/);
  assert.match(setScopeSrc, /NO_SIDE_EFFECTS|calculated: false/);
  console.log("ok: route/source contracts; no calculate/approve/publish/sold");
}

{
  const ui = readFileSync(
    join(root, "app-elite100-quote-flow/src/queue/EstimateQueuePage.tsx"),
    "utf8"
  );
  assert.match(ui, /Review Takeoff/);
  assert.match(ui, /Set Scope|Use these measurements/);
  assert.match(ui, /quoteFlowSetScope/);
  assert.match(ui, /["']1["']/);
  assert.doesNotMatch(ui, /Approve Estimate/);
  assert.doesNotMatch(ui, /\bV1\b|\bV2\b|Studio V2/);
  const label = readFileSync(
    join(root, "app-ai-takeoff/src/lib/consolidatedApproveClick.mjs"),
    "utf8"
  );
  assert.match(label, /quoteFlowSetScope/);
  assert.match(label, /Use these measurements/);
  console.log("ok: UI uses Set Scope / Use these measurements; no V1/V2");
}

console.log("\nquoteFlowSlice1c.test.mjs: ok\n");
