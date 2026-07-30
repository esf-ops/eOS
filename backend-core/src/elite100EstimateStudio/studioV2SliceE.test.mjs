/**
 * Elite 100 Studio V2 Slice E — Working Draft approval snapshot contracts.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceE.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CASE_EMPTY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nstudioV2SliceE.test.mjs\n");

function baseScope(overrides = {}) {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Acme Homes",
    projectName: "Lakeview Kitchen",
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          {
            id: "run-1",
            name: "Main run",
            pieceType: "counter",
            included: true,
            lengthIn: 96,
            depthIn: 25.5,
            quantity: 1,
            sqft: 17
          }
        ]
      }
    ],
    addOns: { "qty-sink": 1 },
    customLineItems: [],
    ...overrides
  };
}

const fakeCalc = {
  fingerprint: "v2e-fp",
  calculatedAt: "2026-07-30T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 1000, customerDisplayTotal: 1010, exactInternalTotal: 980 },
  warnings: [],
  unresolvedItems: []
};

function pricedRow(extra = {}) {
  return {
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc,
    staleReason: null,
    ...extra
  };
}

{
  // 1. POST approve rejects no estimate
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.approveWorkingDraft({
        organizationId: ORG,
        intakeCaseId: CASE_EMPTY,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NO_ESTIMATE
  );
  console.log("ok: 1 POST approve rejects no estimate");
}

{
  // 2. POST approve rejects non-editable/approved/frozen
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    ...pricedRow({
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      approval: { approvedAt: "2026-07-30T12:00:00.000Z", calculationFingerprint: "v2e-fp" }
    })
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.approveWorkingDraft({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  console.log("ok: 2 POST approve rejects approved/frozen");
}

{
  // 3. POST approve rejects unpriced
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: null
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.approveWorkingDraft({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NOT_PRICED
  );
  console.log("ok: 3 POST approve rejects unpriced");
}

{
  // 4. POST approve rejects stale calculation
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create(
    pricedRow({
      status: STUDIO_ESTIMATE_STATUSES.PRICED,
      staleReason: "Estimate options changed — recalculate",
      calculationSnapshot: fakeCalc
    })
  );
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.approveWorkingDraft({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.CALCULATION_STALE
  );
  console.log("ok: 4 POST approve rejects stale calculation");
}

{
  // 5. POST approve rejects missing confirmed true
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create(pricedRow());
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.approveWorkingDraft({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: false }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  console.log("ok: 5 POST approve rejects missing confirmed true");
}

{
  // 6–11. Approves priced/current draft without forbidden orchestration / publish
  const repo = new InMemoryStudioEstimateRepository();
  const created = await repo.create(pricedRow());
  let publishCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioEstimateService: {
      async ensureEditableEstimateDraft() {
        throw new Error("must not call ensureEditableEstimateDraft");
      },
      async openMeasurementRevision() {
        throw new Error("must not call openMeasurementRevision");
      },
      async refreshScopeFromTakeoff() {
        throw new Error("must not call refreshScopeFromTakeoff");
      },
      async approve() {
        throw new Error("must not call V1 approve");
      }
    },
    studioDigitalEstimateService: {
      async publish() {
        publishCalls += 1;
        throw new Error("must not publish");
      },
      async simplifiedPublish() {
        publishCalls += 1;
        throw new Error("must not simplified-publish");
      }
    }
  });

  const result = await v2.approveWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { confirmed: true, clientMutationId: "approve-1", approvalNote: "Ready for DE" }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.equal(result.estimateId, created.id);
  assert.ok(result.approvedAt);
  assert.equal(result.approvedBy, ACTOR);
  assert.equal(result.calculation.total, 1010);
  assert.equal(result.approvedSummary.approved, true);
  assert.equal(result.scopeEditable, false);
  assert.deepEqual(result.sideEffects, {
    ensureEditableDraft: false,
    refreshFromTakeoff: false,
    openMeasurementRevision: false,
    autoFork: false,
    v1Approve: false,
    publish: false,
    simplifiedPublish: false
  });
  assert.equal(publishCalls, 0);

  const row = await repo.getById(ORG, created.id);
  assert.equal(row.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.equal(row.approval.calculationFingerprint, "v2e-fp");
  assert.equal(row.approval.approvalNote, "Ready for DE");

  const svcSrc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  assert.ok(!svcSrc.includes("ensureEditableEstimateDraft("));
  assert.ok(!svcSrc.includes("openMeasurementRevision("));
  assert.ok(!svcSrc.includes("refreshScopeFromTakeoff("));
  assert.ok(!svcSrc.includes("studioEstimateService.approve("));
  assert.ok(!svcSrc.includes("simplifiedPublish("));
  assert.ok(svcSrc.includes("refreshTakeoffGate"), "documents why V1 approve is avoided");
  console.log("ok: 6–11 approve persists snapshot without V1 orchestration or publish");
}

{
  // 12. Approved result is read-only to PATCH scope/options
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create(pricedRow());
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await v2.approveWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  await assert.rejects(
    () =>
      v2.patchWorkingDraftScope({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: {
          scope: {
            rooms: [
              {
                id: "kitchen",
                name: "Kitchen",
                roomType: "Kitchen",
                pieces: [
                  {
                    id: "run-1",
                    name: "Main run",
                    lengthIn: 120,
                    depthIn: 25.5,
                    quantity: 1,
                    included: true
                  }
                ]
              }
            ]
          }
        }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  await assert.rejects(
    () =>
      v2.patchWorkingDraftOptions({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: {
          options: {
            customerLines: [{ label: "Crane", amount: 50, kind: "charge" }]
          }
        }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  console.log("ok: 12 approved result is read-only to PATCH scope/options");
}

{
  // 13. V1 route remains untouched/default
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(studioApp.includes("StudioV2EstimatorShell"));
  console.log("ok: 13 V1 route remains untouched/default");
}

{
  // Frontend / source contracts
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ApprovalPanel.tsx"),
    "utf8"
  );
  const routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");

  assert.ok(!/from\s+["'].*ActiveReviewPublishPanel["']/.test(panel));
  assert.ok(!/from\s+["'].*EstimateDigitalEstimatePanel["']/.test(panel));
  assert.ok(!/from\s+["'].*ActiveReviewPublishPanel["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateDigitalEstimatePanel["']/.test(shell));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(panel));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(panel));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!panel.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!panel.includes("simplified-publish"));
  assert.ok(panel.includes('data-testid="studio-v2-approve"'));
  assert.ok(panel.includes('data-testid="studio-v2-approval-confirm"'));
  assert.ok(panel.includes('data-testid="studio-v2-create-revision"'));
  assert.ok(panel.includes("Create editable revision"));
  assert.ok(!panel.includes("later slice"));
  assert.ok(panel.includes("Unsaved scope changes"));
  assert.ok(panel.includes("Unsaved estimate option changes"));
  assert.ok(panel.includes("Calculation is stale"));
  assert.ok(panel.includes("Estimate is not calculated"));
  assert.ok(shell.includes("working-draft/approve"));
  assert.ok(shell.includes("create-revision"));
  assert.ok(routes.includes("/api/elite100-studio-v2/cases/:caseId/working-draft/approve"));
  assert.ok(
    routes.includes("/api/elite100-studio-v2/cases/:caseId/approved/:estimateId/create-revision")
  );
  console.log("ok: frontend/source contracts for Approval panel");
}

console.log("\nAll Studio V2 Slice E tests passed.\n");
