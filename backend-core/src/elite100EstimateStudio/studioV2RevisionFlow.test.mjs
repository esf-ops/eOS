/**
 * Studio V2 — approved-estimate create-revision flow.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2RevisionFlow.test.mjs
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

console.log("\nstudioV2RevisionFlow.test.mjs\n");

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
    customLineItems: [{ id: "cli-1", label: "Tear Out", amount: 250, kind: "charge" }],
    estimateWideAdjustment: { active: true, percentage: 3, reason: "Trusted", source: "manual" },
    ...overrides
  };
}

const fakeCalc = {
  fingerprint: "v2-rev-fp",
  calculatedAt: "2026-07-30T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 1000, customerDisplayTotal: 1010, exactInternalTotal: 980 },
  warnings: [],
  unresolvedItems: []
};

function forbiddenStudioService() {
  return {
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
  };
}

async function seedApproved(repo, extra = {}, deps = {}) {
  const created = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc,
    staleReason: null,
    ...extra
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioEstimateService: forbiddenStudioService(),
    ...deps
  });
  await v2.approveWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  return { created, v2 };
}

{
  // 1. Approved V2 estimate can create editable revision
  const repo = new InMemoryStudioEstimateRepository();
  let publishCalls = 0;
  const { created, v2 } = await seedApproved(repo, {}, {
    studioDigitalEstimateService: {
      async publish() {
        publishCalls += 1;
        throw new Error("must not publish");
      },
      async simplifiedPublish() {
        publishCalls += 1;
        throw new Error("must not simplified-publish");
      },
      async assessReadiness() {
        return {
          publicationSummary: {
            active: true,
            state: "published",
            customerUrl: "https://example.test/e/token-r1",
            publicationId: "pub-r1"
          },
          activePublication: { id: "pub-r1", status: "active" },
          publications: [{ id: "pub-r1", status: "active" }]
        };
      }
    }
  });

  const result = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true, reason: "Customer changed island size" }
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.reused, false);
  assert.equal(result.revision, 2);
  assert.equal(result.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  assert.equal(result.scopeEditable, true);
  assert.equal(result.basedOnEstimateId, created.id);
  assert.equal(result.basedOnRevision, 1);
  assert.ok(result.revisionSummary.message.includes("R2"));
  assert.ok(result.revisionSummary.customerLinkNote);
  assert.equal(result.sideEffects.publish, false);
  assert.equal(result.sideEffects.ensureEditableDraft, false);
  assert.equal(result.sideEffects.refreshFromTakeoff, false);
  assert.equal(result.sideEffects.openMeasurementRevision, false);
  assert.equal(result.sideEffects.takeoffReopen, false);
  assert.equal(result.sideEffects.autoApprove, false);
  assert.equal(result.sideEffects.autoCalculate, false);
  assert.equal(result.sideEffects.sourceMutated, false);
  assert.equal(publishCalls, 0);
  assert.equal(result.lastCalculation?.available, false);
  console.log("ok: 1 approved estimate creates editable R2");
}

{
  // 2. Source approved estimate remains unchanged
  const repo = new InMemoryStudioEstimateRepository();
  const { created, v2 } = await seedApproved(repo);
  const before = await repo.getById(ORG, created.id);
  await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  const after = await repo.getById(ORG, created.id);
  assert.equal(after.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.equal(after.revision, 1);
  assert.equal(after.approval?.calculationFingerprint, before.approval?.calculationFingerprint);
  assert.equal(after.calculationSnapshot?.fingerprint, "v2-rev-fp");
  assert.equal(after.scope.rooms[0].pieces[0].lengthIn, 96);
  assert.equal(after.scope.customLineItems[0].amount, 250);
  assert.equal(after.supersededAt, null);
  console.log("ok: 2 source approved snapshot unchanged");
}

{
  // 3. New revision copies scope/pricing/options
  const repo = new InMemoryStudioEstimateRepository();
  const { created, v2 } = await seedApproved(repo);
  const result = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  const r2 = await repo.getById(ORG, result.estimateId);
  assert.equal(r2.scope.rooms[0].pieces[0].name, "Main run");
  assert.equal(r2.scope.customLineItems[0].label, "Tear Out");
  assert.equal(r2.scope.estimateWideAdjustment.percentage, 3);
  assert.equal(r2.scope.addOns["qty-sink"], 1);
  assert.equal(r2.scope.studioV2RevisionOrigin.basedOnEstimateId, created.id);
  console.log("ok: 3 new revision copies scope/pricing/options");
}

{
  // 4. New revision clears approval/publication authority
  const repo = new InMemoryStudioEstimateRepository();
  const { created, v2 } = await seedApproved(repo);
  const result = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  const r2 = await repo.getById(ORG, result.estimateId);
  assert.equal(r2.approval, null);
  assert.equal(r2.approvedAt, null);
  assert.equal(r2.calculationSnapshot, null);
  assert.ok(r2.staleReason);
  assert.notEqual(r2.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  console.log("ok: 4 new revision clears approval/calc authority");
}

{
  // 5. New revision editable via V2 scope/pricing/options endpoints
  const repo = new InMemoryStudioEstimateRepository();
  const { created, v2 } = await seedApproved(repo);
  const forked = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  const scopePatch = await v2.patchWorkingDraftScope({
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
            included: true,
            pieces: [
              {
                id: "run-1",
                name: "Main run",
                pieceType: "counter",
                included: true,
                lengthIn: 110,
                depthIn: 25.5,
                quantity: 1
              }
            ]
          }
        ]
      }
    }
  });
  assert.equal(scopePatch.estimateId, forked.estimateId);
  assert.equal(scopePatch.ok, true);

  const optionsPatch = await v2.patchWorkingDraftOptions({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      options: {
        customerLines: [{ label: "Crane", amount: 75, kind: "charge" }]
      }
    }
  });
  assert.equal(optionsPatch.ok, true);

  const pricingPatch = await v2.patchWorkingDraftPricing({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      pricing: {
        estimateWideAdjustment: { active: true, percentage: 5, reason: "Rev2", source: "manual" }
      }
    }
  });
  assert.equal(pricingPatch.ok, true);

  const r1 = await repo.getById(ORG, created.id);
  assert.equal(r1.scope.rooms[0].pieces[0].lengthIn, 96);
  console.log("ok: 5 R2 editable via V2 endpoints; R1 untouched");
}

{
  // 6–7. No auto-publish; prior publication stays on R1
  const repo = new InMemoryStudioEstimateRepository();
  let publishCalls = 0;
  /** @type {{ id: string, status: string, estimateId: string|null, customerUrl: string }} */
  const activePub = {
    id: "pub-r1",
    status: "active",
    estimateId: null,
    customerUrl: "https://example.test/e/token-r1"
  };
  const de = {
    async publish() {
      publishCalls += 1;
      return { customerUrl: "should-not-happen" };
    },
    async simplifiedPublish() {
      publishCalls += 1;
      throw new Error("must not simplified-publish");
    },
    async assessReadiness(_org, estimateId) {
      if (estimateId && estimateId === activePub.estimateId) {
        return {
          publicationSummary: {
            active: true,
            state: "published",
            customerUrl: activePub.customerUrl,
            publicationId: activePub.id
          },
          activePublication: activePub,
          publications: [activePub]
        };
      }
      return {
        publicationSummary: { active: false, state: "not_published" },
        activePublication: null,
        publications: []
      };
    }
  };
  const { created, v2 } = await seedApproved(repo, {}, { studioDigitalEstimateService: de });
  activePub.estimateId = created.id;

  const forked = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  assert.equal(publishCalls, 0);
  assert.equal(forked.revisionSummary.priorPublished, true);

  const r1Pub = await de.assessReadiness(ORG, created.id);
  assert.equal(r1Pub.activePublication.id, "pub-r1");
  const r2Pub = await de.assessReadiness(ORG, forked.estimateId);
  assert.equal(r2Pub.activePublication, null);
  console.log("ok: 6–7 no auto-publish; customer link remains on R1");
}

{
  // 8. GET working-draft returns new editable revision
  const repo = new InMemoryStudioEstimateRepository();
  const { created, v2 } = await seedApproved(repo);
  const forked = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  const draft = await v2.getWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR
  });
  assert.equal(draft.estimateId, forked.estimateId);
  assert.equal(draft.revision, 2);
  assert.equal(draft.scopeEditable, true);
  assert.equal(draft.revisionAffordance.canCreateRevision, false);
  assert.equal(draft.revisionAffordance.basedOnRevision, 1);
  console.log("ok: 8 GET working-draft returns R2 editable");
}

{
  // 9. Non-approved estimate cannot create revision
  const repo = new InMemoryStudioEstimateRepository();
  const created = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioEstimateService: forbiddenStudioService()
  });
  await assert.rejects(
    () =>
      v2.createRevisionFromApproved({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        estimateId: created.id,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.REVISION_REQUIRES_APPROVED
  );
  await assert.rejects(
    async () => {
      await v2.approveWorkingDraft({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: true }
      });
      await v2.createRevisionFromApproved({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        estimateId: created.id,
        actorUserId: ACTOR,
        body: { confirmed: false }
      });
    },
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  console.log("ok: 9 non-approved / unconfirmed rejected");
}

{
  // 10. No V1 refresh/ensure/simplified side effects in source
  const svcSrc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  const revSrc = readFileSync(join(__dirname, "studioV2Revision.mjs"), "utf8");
  const routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");
  assert.ok(!svcSrc.includes("ensureEditableEstimateDraft("));
  assert.ok(!svcSrc.includes("openMeasurementRevision("));
  assert.ok(!svcSrc.includes("refreshScopeFromTakeoff("));
  assert.ok(!svcSrc.includes("simplifiedPublish("));
  assert.ok(!svcSrc.includes("reopenTakeoff"));
  assert.ok(!revSrc.includes("ensureEditableEstimateDraft"));
  assert.ok(!revSrc.includes("refresh-from-takeoff"));
  assert.ok(svcSrc.includes("createSiblingRevisionFrom"));
  assert.ok(
    routes.includes(
      "/api/elite100-studio-v2/cases/:caseId/approved/:estimateId/create-revision"
    )
  );
  console.log("ok: 10 no V1 orchestration side effects");
}

{
  // Frontend contracts
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ApprovalPanel.tsx"),
    "utf8"
  );
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  assert.ok(panel.includes('data-testid="studio-v2-create-revision"'));
  assert.ok(panel.includes('data-testid="studio-v2-revision-confirm"'));
  assert.ok(panel.includes("Create editable revision"));
  assert.ok(panel.includes("frozen for history"));
  assert.ok(!panel.includes("later slice"));
  assert.ok(shell.includes("create-revision"));
  assert.ok(shell.includes("runCreateRevision"));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!shell.includes("refresh-from-takeoff"));
  console.log("ok: frontend create-revision contracts");
}

{
  // Idempotent reuse
  const repo = new InMemoryStudioEstimateRepository();
  const { created, v2 } = await seedApproved(repo);
  const first = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  const second = await v2.createRevisionFromApproved({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  assert.equal(second.reused, true);
  assert.equal(second.created, false);
  assert.equal(second.estimateId, first.estimateId);
  console.log("ok: create-revision idempotent reuse");
}

console.log("\nAll Studio V2 revision-flow tests passed.\n");
