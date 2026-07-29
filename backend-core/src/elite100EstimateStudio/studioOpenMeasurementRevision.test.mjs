/**
 * openMeasurementRevision — preserves prior approved revision, opens draft R+1.
 * Run: node backend-core/src/elite100EstimateStudio/studioOpenMeasurementRevision.test.mjs
 */
import assert from "node:assert/strict";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nstudioOpenMeasurementRevision.test.mjs\n");

const repo = new InMemoryStudioEstimateRepository();
const studio = createStudioEstimateService({
  repository: repo,
  env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
  loadTakeoffWorkspace: async () => ({ reviewStatus: "approved", approvedAt: new Date().toISOString() }),
  loadLatestTakeoffResult: async () => null
});

const created = await repo.create({
  organizationId: ORG,
  intakeCaseId: CASE_ID,
  takeoffJobId: TAKEOFF,
  createdByUserId: ACTOR,
  status: STUDIO_ESTIMATE_STATUSES.APPROVED,
  revision: 1,
  scope: {
    projectName: "",
    rooms: [
      {
        id: "room-kitchen-1",
        name: "Kitchen",
        included: true,
        pieces: [
          {
            id: "p-sink",
            name: "Sink wall",
            included: true,
            lengthIn: 96,
            depthIn: 25.5
          }
        ]
      }
    ]
  },
  calculationSnapshot: {
    fingerprint: "fp-r1",
    pricingVersion: 4,
    totals: { customerDisplayTotal: 4200 }
  },
  approval: {
    approvedAt: new Date().toISOString(),
    calculationFingerprint: "fp-r1",
    customerDisplayTotal: 4200
  }
});

const opened = await studio.openMeasurementRevision({
  organizationId: ORG,
  estimateId: created.id,
  actorUserId: ACTOR,
  body: { confirm: true }
});
assert.equal(opened.ok, true);
assert.equal(opened.reused, false);
assert.equal(opened.estimate.revision, 2);
assert.equal(opened.estimate.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
assert.equal(opened.estimate.takeoffJobId, TAKEOFF);
assert.equal(opened.estimate.scope.rooms[0].pieces[0].lengthIn, 96, "preload prior dimensions");

const prior = await repo.getById(ORG, created.id);
assert.equal(prior.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED, "R1 preserved as superseded");
assert.equal(prior.approval?.customerDisplayTotal, 4200);

const again = await studio.openMeasurementRevision({
  organizationId: ORG,
  estimateId: opened.estimate.id,
  actorUserId: ACTOR,
  body: { confirm: true }
});
assert.equal(again.reused, true, "already-draft revision is reused");
assert.equal(again.estimate.id, opened.estimate.id);

let denied = false;
try {
  await studio.openMeasurementRevision({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: {}
  });
} catch (e) {
  denied = true;
  assert.equal(e.code, "confirm_required");
}
assert.equal(denied, true);

console.log("ok: openMeasurementRevision preserves R1 and opens R2 draft");
console.log("\nstudioOpenMeasurementRevision.test.mjs — passed\n");
