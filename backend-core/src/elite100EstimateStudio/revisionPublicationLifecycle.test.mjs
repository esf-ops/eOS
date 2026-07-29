/**
 * Revision publication lifecycle:
 * R1 stays active published while R2 drafts / approves; supersede only after R2 publish.
 *
 * Run: node backend-core/src/elite100EstimateStudio/revisionPublicationLifecycle.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createInMemoryConfigurationRepository } from "../digitalEstimate/configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "../digitalEstimate/configuration/pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { createInMemoryAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { createPublicConfigurationService } from "../digitalEstimate/configuration/publicConfigurationService.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import { createStudioSimplifiedWorkflowService } from "./studioSimplifiedWorkflow.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function kitchenScope() {
  return {
    materialGroup: "Group Promo",
    pricingBasis: "direct",
    edgeEligibleLinearFeet: 10,
    addOns: { "qty-sink": 1 },
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          {
            id: "p1",
            name: "Sink wall",
            pieceType: "counter",
            measurementMode: "dimensions",
            lengthIn: 96,
            depthIn: 25.5,
            quantity: 1,
            included: true
          }
        ]
      }
    ]
  };
}

async function harness({ failPublish = false } = {}) {
  const studioRepo = new InMemoryStudioEstimateRepository();
  const deRepo = createInMemoryDigitalEstimateRepository();
  const pricing = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const amendmentRepo = createInMemoryAmendmentRepository({
    deRepository: deRepo,
    configurationRepository: cfgRepo
  });
  const studio = createStudioEstimateService({
    env: ENV_ON,
    repository: studioRepo,
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    }),
    loadLatestTakeoffResult: async () => null
  });
  Object.defineProperty(studio, "repositoryMode", { value: "memory" });
  const configurationStudioService = createConfigurationStudioService({
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    deRepository: deRepo,
    env: ENV_ON
  });
  const digitalEstimateService = createStudioEstimateDigitalEstimateService({
    env: ENV_ON,
    studioEstimateService: studio,
    digitalEstimateRepository: deRepo,
    configurationStudioService,
    amendmentRepository: amendmentRepo,
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    })
  });
  if (failPublish) {
    const original = digitalEstimateService.publish.bind(digitalEstimateService);
    digitalEstimateService.publish = async () => {
      const err = new Error("simulated publish failure");
      err.statusCode = 503;
      err.code = "publish_failed";
      throw err;
    };
    void original;
  }
  const workflow = createStudioSimplifiedWorkflowService({
    env: ENV_ON,
    sharedInboxService: {
      async importMessage() {
        return { ok: true, intakeCaseId: CASE_ID, takeoffJobId: TAKEOFF };
      }
    },
    studioEstimateService: studio,
    digitalEstimateService
  });
  const pubSvc = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  return { studio, studioRepo, workflow, pubSvc, deRepo };
}

console.log("\nrevisionPublicationLifecycle.test.mjs\n");

{
  const { studio, studioRepo, workflow, pubSvc } = await harness();
  const row = await studioRepo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: TAKEOFF,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    revision: 1,
    scope: kitchenScope()
  });
  await studio.calculate({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: {} });
  const pub1 = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: `life-pub-1-${randomUUID()}` }
  });
  assert.ok(pub1.customerUrl);
  const token1 =
    pub1.publication?.accessToken ||
    pub1.accessToken ||
    (String(pub1.customerUrl).match(/\/e\/([^/?#]+)/) || [])[1];

  // 1. open measurement revision creates R2 without superseding R1
  const opened = await studio.openMeasurementRevision({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(opened.estimate.revision, 2);
  const r1AfterOpen = await studioRepo.getById(ORG, row.id);
  assert.notEqual(r1AfterOpen.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  assert.ok(r1AfterOpen.approval, "R1 approval intact");

  // 3. public customer link still resolves R1 before R2 publish
  const exchange1 = await pubSvc.exchangePublicationToken({ rawToken: token1 });
  assert.equal(exchange1.state.lifecycle, "active");

  // 2. approving R2 does not supersede R1
  await studio.calculate({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: {}
  });
  const r1AfterApprove = await studioRepo.getById(ORG, row.id);
  assert.notEqual(r1AfterApprove.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);

  // 5. successful R2 publication activates R2 and only then supersedes R1
  const pub2 = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: `life-pub-2-${randomUUID()}` }
  });
  assert.ok(pub2.customerUrl);
  const r1AfterPub2 = await studioRepo.getById(ORG, row.id);
  assert.equal(r1AfterPub2.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  const r2 = await studioRepo.getById(ORG, opened.estimate.id);
  assert.notEqual(r2.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  assert.equal(r2.revision, 2);

  // 6. revision history retains both snapshots
  const history = await studioRepo.listByIntakeCase(ORG, CASE_ID);
  assert.equal(history.length, 2);
  assert.ok(history.some((h) => h.revision === 1 && h.approval));
  assert.ok(history.some((h) => h.revision === 2));

  console.log("ok: open/approve preserve R1; publish supersedes; history retained");
}

{
  // 4. failed R2 publication leaves R1 active
  const CASE2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
  const { studio, studioRepo, workflow, pubSvc } = await harness();
  const row = await studioRepo.create({
    organizationId: ORG,
    intakeCaseId: CASE2,
    takeoffJobId: TAKEOFF,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    revision: 1,
    scope: kitchenScope()
  });
  await studio.calculate({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: {} });
  const pub1 = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: `life-fail-1-${randomUUID()}` }
  });
  const token1 =
    pub1.publication?.accessToken ||
    pub1.accessToken ||
    (String(pub1.customerUrl).match(/\/e\/([^/?#]+)/) || [])[1];

  const opened = await studio.openMeasurementRevision({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  await studio.calculate({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: {}
  });

  // Force publish failure via a broken digitalEstimateService
  const failHarness = await harness({ failPublish: true });
  // Re-bind: use same studio rows but failing workflow — instead stub on this workflow's DE service
  let failed = false;
  try {
    // Directly call supersede path is not reached if publish throws — simulate with failing DE
    const de = createStudioEstimateDigitalEstimateService({
      env: ENV_ON,
      studioEstimateService: studio,
      digitalEstimateRepository: createInMemoryDigitalEstimateRepository(),
      configurationStudioService: createConfigurationStudioService({
        configurationRepository: createInMemoryConfigurationRepository({
          pricingPolicyRepository: createInMemoryPricingPolicyRepository()
        }),
        pricingPolicyRepository: createInMemoryPricingPolicyRepository(),
        deRepository: createInMemoryDigitalEstimateRepository(),
        env: ENV_ON
      }),
      amendmentRepository: createInMemoryAmendmentRepository({
        deRepository: createInMemoryDigitalEstimateRepository(),
        configurationRepository: createInMemoryConfigurationRepository({
          pricingPolicyRepository: createInMemoryPricingPolicyRepository()
        })
      }),
      loadTakeoffWorkspace: async () => ({ reviewStatus: "approved", approvedAt: new Date().toISOString() })
    });
    de.publish = async () => {
      const err = new Error("simulated publish failure");
      err.statusCode = 503;
      throw err;
    };
    const failWorkflow = createStudioSimplifiedWorkflowService({
      env: ENV_ON,
      sharedInboxService: { async importMessage() { return { ok: true }; } },
      studioEstimateService: studio,
      digitalEstimateService: de
    });
    await failWorkflow.publishDigitalEstimate({
      organizationId: ORG,
      estimateId: opened.estimate.id,
      actorUserId: ACTOR,
      body: { confirm: true, idempotencyKey: `life-fail-2-${randomUUID()}` }
    });
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "R2 publish failed");
  const r1 = await studioRepo.getById(ORG, row.id);
  assert.notEqual(r1.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED, "R1 remains active after failed R2 publish");
  const exchange = await pubSvc.exchangePublicationToken({ rawToken: token1 });
  assert.equal(exchange.state.lifecycle, "active", "R1 customer link still usable");
  const r2 = await studioRepo.getById(ORG, opened.estimate.id);
  assert.ok(r2.calculationSnapshot || r2.approval || r2.status === STUDIO_ESTIMATE_STATUSES.PRICED || r2.status === STUDIO_ESTIMATE_STATUSES.APPROVED);
  void failHarness;
  console.log("ok: failed R2 publish leaves R1 active + customer link usable");
}

console.log("\nrevisionPublicationLifecycle.test.mjs — passed\n");
