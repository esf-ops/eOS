/**
 * ensureEditableEstimateDraft — idempotent transparent draft acquisition.
 * Run: node backend-core/src/elite100EstimateStudio/ensureEditableEstimateDraft.test.mjs
 */
import assert from "node:assert/strict";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nensureEditableEstimateDraft.test.mjs\n");

const repo = new InMemoryStudioEstimateRepository();
let reopenCalls = 0;
const studio = createStudioEstimateService({
  repository: repo,
  env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
  loadTakeoffWorkspace: async () => ({
    reviewStatus: "approved",
    approvedAt: new Date().toISOString()
  }),
  loadLatestTakeoffResult: async () => null,
  reopenTakeoffForRevision: async () => {
    reopenCalls += 1;
    throw new Error("simulated takeoff reopen failure");
  }
});

const r1 = await repo.create({
  organizationId: ORG,
  intakeCaseId: CASE_ID,
  takeoffJobId: TAKEOFF,
  createdByUserId: ACTOR,
  status: STUDIO_ESTIMATE_STATUSES.APPROVED,
  revision: 1,
  scope: {
    projectName: "Persistent Workspace",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        included: true,
        pieces: [
          { id: "island", name: "Kitchen Island", included: true, lengthIn: 96, depthIn: 36 }
        ]
      }
    ],
    customLineItems: [
      {
        id: "tear",
        name: "Tear Out",
        quantity: 1,
        unitPrice: 750,
        commercialRole: "customer_charge",
        percentageEligible: true,
        customerFacing: true
      }
    ],
    estimateWideAdjustment: { active: true, percentage: 3, reason: "Spahn", source: "manual" },
    roomConfigurations: {
      bath: { vanityProgram: { apply: true, packageCode: "37_S" } }
    }
  },
  calculationSnapshot: {
    fingerprint: "fp-r1",
    pricingVersion: 4,
    totals: { customerDisplayTotal: 5280, exactTotal: 5278.66 }
  },
  approval: {
    approvedAt: new Date().toISOString(),
    calculationFingerprint: "fp-r1",
    customerDisplayTotal: 5280
  }
});

const first = await studio.ensureEditableEstimateDraft({
  organizationId: ORG,
  estimateId: r1.id,
  basedOnRevisionId: r1.id,
  actorUserId: ACTOR
});
assert.equal(first.ok, true);
assert.equal(first.created, true);
assert.equal(first.reused, false);
assert.equal(first.estimate.revision, 2);
assert.equal(first.estimate.scope.rooms[0].pieces[0].name, "Kitchen Island");
assert.equal(first.estimate.scope.customLineItems[0].name, "Tear Out");
assert.equal(first.estimate.scope.estimateWideAdjustment.percentage, 3);
assert.ok(first.estimate.scope.roomConfigurations?.bath);
assert.equal(reopenCalls, 1, "takeoff reopen attempted");

const r1After = await repo.getById(ORG, r1.id);
assert.equal(r1After.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
assert.equal(r1After.scope.customLineItems[0].unitPrice, 750);
assert.equal(r1After.calculationSnapshot.fingerprint, "fp-r1");

const second = await studio.ensureEditableEstimateDraft({
  organizationId: ORG,
  estimateId: r1.id,
  basedOnRevisionId: r1.id,
  actorUserId: ACTOR
});
assert.equal(second.reused, true);
assert.equal(second.created, false);
assert.equal(second.estimate.id, first.estimate.id);
assert.equal(second.estimate.revision, 2);

const third = await studio.ensureEditableEstimateDraft({
  organizationId: ORG,
  estimateId: first.estimate.id,
  actorUserId: ACTOR
});
assert.equal(third.reused, true);
assert.equal(third.estimate.id, first.estimate.id);

// Auto-fork on updateScope applies to draft; R1 untouched
const patched = await studio.updateScope({
  organizationId: ORG,
  estimateId: r1.id,
  actorUserId: ACTOR,
  body: {
    scope: {
      estimateWideAdjustment: {
        active: true,
        percentage: 3,
        reason: "Spahn & Rose account pricing",
        source: "manual"
      }
    }
  }
});
assert.equal(patched.id, first.estimate.id);
assert.equal(patched.revision, 2);
assert.equal(patched.scope.estimateWideAdjustment.reason, "Spahn & Rose account pricing");
const r1Final = await repo.getById(ORG, r1.id);
assert.equal(r1Final.scope.estimateWideAdjustment.reason, "Spahn");
assert.equal(r1Final.status, STUDIO_ESTIMATE_STATUSES.APPROVED);

// forbidAutoFork still rejects
let blocked = false;
try {
  await studio.updateScope({
    organizationId: ORG,
    estimateId: r1.id,
    actorUserId: ACTOR,
    body: { forbidAutoFork: true, scope: { projectName: "nope" } }
  });
} catch (e) {
  blocked = e?.code === "estimate_revision_not_editable";
}
assert.equal(blocked, true);

console.log("ok: ensureEditableEstimateDraft idempotent + soft takeoff reopen + auto-fork");
console.log("\nensureEditableEstimateDraft.test.mjs: ok\n");
