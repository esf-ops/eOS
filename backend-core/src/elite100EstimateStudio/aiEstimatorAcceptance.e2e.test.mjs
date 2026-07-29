/**
 * End-to-end acceptance: initial AI estimate + measurement revision.
 * Protects the working technical path under the consolidated estimator UI contracts.
 *
 * Run: node backend-core/src/elite100EstimateStudio/aiEstimatorAcceptance.e2e.test.mjs
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
import { createStudioEstimateService, seedScopeFromTakeoffPayload } from "./studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import { createStudioSimplifiedWorkflowService } from "./studioSimplifiedWorkflow.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { decideConfigurationView } from "../../../app-digital-estimate/src/configurationBootstrap.ts";
import { deriveAiEstimatorStage, shouldOfferPublishRevised } from "../../../app-elite100-estimate-studio/src/estimateQueue/deriveAiEstimatorStage.mjs";
import { buildApprovalSummaryFromEstimate, estimateHasMeasuredScope } from "../../../app-elite100-estimate-studio/src/estimateQueue/aiTakeoffApprovedSummary.mjs";
import { buildAiEstimatorSummary } from "./studioAiEstimatorSummary.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

function kitchenTakeoffPayload({ sinkLengthIn = 96 } = {}) {
  return {
    takeoffJobId: TAKEOFF_ID,
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        guidedShapeGroups: [
          {
            label: "Kitchen",
            shapeType: "counter",
            pieces: [
              { label: "Cooktop wall", pieceType: "counter", lengthIn: 112.5, depthIn: 25.5 },
              { label: "Sink wall", pieceType: "counter", lengthIn: sinkLengthIn, depthIn: 25.5 },
              { label: "Cooktop wall FHB", pieceType: "counter", lengthIn: 112.5, depthIn: 18 },
              { label: "Sink wall FHB", pieceType: "counter", lengthIn: sinkLengthIn, depthIn: 18 }
            ]
          }
        ],
        backsplash: { lengthIn: 208.5, heightIn: 4 },
        finishedEdgeLf: 26.25,
        openings: { sink: 1, cooktop: 1, outlet: 1 }
      }
    ]
  };
}

async function harness() {
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
    loadLatestTakeoffResult: async () => ({
      id: "result-1",
      importPayload: kitchenTakeoffPayload()
    })
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
  const workflow = createStudioSimplifiedWorkflowService({
    env: ENV_ON,
    sharedInboxService: {
      async importMessage({ confirm, forceManual, idempotencyKey }) {
        assert.equal(confirm, true);
        return {
          ok: true,
          forceManual: forceManual === true,
          idempotencyKey: idempotencyKey || null,
          intakeCaseId: CASE_ID,
          takeoffJobId: TAKEOFF_ID
        };
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
  return { studio, studioRepo, workflow, pubSvc, digitalEstimateService };
}

console.log("\naiEstimatorAcceptance.e2e.test.mjs\n");

{
  // Shared Inbox start contract
  const { workflow } = await harness();
  const started = await workflow.startEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    messageKey: "msg-1",
    confirm: true,
    forceManual: false,
    idempotencyKey: "acc-start-1"
  });
  assert.equal(started.ok, true);
  console.log("ok: Shared Inbox Start Estimate confirm/idempotency path");
}

{
  const { studio, studioRepo, workflow, pubSvc } = await harness();

  // Seed + approve geometry via takeoff payload (simulates Save Draft / approve / handoff)
  const payload = kitchenTakeoffPayload({ sinkLengthIn: 96 });
  const seeded = seedScopeFromTakeoffPayload(payload, { materialGroup: "Group Promo" });
  const sinkFromSeed = (seeded.rooms || [])
    .flatMap((r) => r.pieces || [])
    .find((p) => /sink/i.test(String(p.name || p.label || "")));
  assert.ok(sinkFromSeed, "seed includes Sink wall");
  assert.equal(Number(sinkFromSeed.lengthIn), 96);

  const row = await studioRepo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: TAKEOFF_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    revision: 1,
    scope: {
      ...seeded,
      addOns: {
        ...(seeded.addOns || {}),
        "qty-sink": 1,
        "qty-cook": 1,
        "qty-outlet": 1,
        "qty-bar": 0
      },
      customerName: "",
      customerEmail: "",
      projectName: "",
      materialGroup: "Group Promo",
      pricingBasis: "direct"
    }
  });

  // Reload persistence check: dimensions survive
  const reloaded = await studioRepo.getById(ORG, row.id);
  const sinkPiece = (reloaded.scope.rooms || [])
    .flatMap((r) => r.pieces || [])
    .find((p) => /sink/i.test(String(p.name || p.label || "")));
  assert.ok(sinkPiece, "sink wall piece present after reload");
  assert.equal(Number(sinkPiece.lengthIn), 96);

  const refreshed = { estimate: await studio.getById(ORG, row.id) };
  void refreshed;
  const priced = await studio.calculate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(priced.pricingVersion ?? priced.calculation?.pricingVersion ?? priced.calculationSnapshot?.pricingVersion, 4);
  assert.ok(estimateHasMeasuredScope(priced));
  const summary = buildApprovalSummaryFromEstimate(priced);
  assert.ok(summary && summary.countertopSf > 0, "non-zero approved card");
  assert.ok(Number(summary.customerDisplayTotal) > 0, "positive starting total");
  assert.ok(priced.aiEstimatorSummary, "aiEstimatorSummary attached");
  assert.ok(priced.aiEstimatorSummary.rooms?.length >= 1, "room-by-room scope");
  assert.equal(priced.aiEstimatorSummary.measurements.openingsByType.kitchenSink, 1);
  assert.equal(priced.aiEstimatorSummary.measurements.openingsByType.cooktop, 1);
  assert.equal(priced.aiEstimatorSummary.measurements.openingsByType.outlet, 1);
  assert.ok(
    priced.aiEstimatorSummary.pricing.customerSafeGroups?.length >= 1,
    "customer-safe price groups"
  );
  // No duplicate kitchen sink cutout in authoritative cutout charge path
  const cutoutsTotal =
    priced.calculationSnapshot?.elite100?.rooms?.[0]?.cutouts?.kitchenSinkCharge ??
    priced.calculation?.elite100?.rooms?.[0]?.cutouts?.kitchenSinkCharge;
  if (cutoutsTotal != null) {
    assert.equal(Number(cutoutsTotal), 200);
  }

  assert.equal(
    deriveAiEstimatorStage({ measurementsApproved: true, estimateRevision: 1 }),
    "approved"
  );

  const published = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "acc-pub-1" }
  });
  assert.ok(published.customerUrl);
  assert.equal(published.publication?.envelope?.configured, true);

  const token =
    published.publication?.accessToken ||
    published.accessToken ||
    (String(published.customerUrl).match(/\/e\/([^/?#]+)/) || [])[1];
  assert.ok(token);

  const exchange = await pubSvc.exchangePublicationToken({ rawToken: token });
  assert.equal(exchange.state.lifecycle, "active");
  assert.ok(exchange.state.configuration);
  const decision = decideConfigurationView({
    uiEnabled: true,
    lifecycle: exchange.state.lifecycle,
    hasConfiguration: true,
    hasEstimate: true
  });
  assert.equal(decision.mode, "configure");

  const mat = (exchange.state.configuration.options || [])
    .map((o) => o.optionKey || o.option_key)
    .find((k) => String(k).startsWith("material:"));
  assert.ok(mat);
  await pubSvc.saveSelections({
    rawSecret: exchange.rawSecret,
    body: {
      items: [{ optionKey: mat, quantity: 1 }],
      expectedRowVersion: exchange.state.session.rowVersion,
      idempotencyKey: `sel-${randomUUID()}`
    }
  });
  const resumed = await pubSvc.resumeFromSessionSecret({ rawSecret: exchange.rawSecret });
  assert.equal(Number(resumed.configuration.currentSelections?.[mat] || 0), 1);
  console.log("ok: initial estimate — approve, publish, customer configure + persist");

  // ── Revision acceptance ────────────────────────────────────────────────
  const opened = await studio.openMeasurementRevision({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(opened.estimate.revision, 2);
  assert.ok(opened.priorEstimate, "priorEstimate returned for comparison");
  assert.equal(opened.priorEstimate.revision, 1);
  assert.ok(opened.estimate.aiEstimatorSummary?.comparison, "comparison on revision draft");
  const prior = await studioRepo.getById(ORG, row.id);
  assert.equal(prior.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);

  // Change sink 96 → 120 and persist (save draft / reload)
  const revScope = {
    ...opened.estimate.scope,
    rooms: (opened.estimate.scope.rooms || []).map((r) => ({
      ...r,
      pieces: (r.pieces || []).map((p) =>
        /sink/i.test(String(p.name || p.label || ""))
          ? { ...p, lengthIn: 120 }
          : p
      )
    }))
  };
  await studio.updateScope({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: { scope: revScope }
  });
  const afterNav = await studio.getById(ORG, opened.estimate.id);
  const sink2 = (afterNav.scope.rooms || [])
    .flatMap((r) => r.pieces || [])
    .find((p) => /sink/i.test(String(p.name || p.label || "")));
  assert.equal(Number(sink2.lengthIn), 120, "120 survives navigate/reload");

  // Re-approve via calculate on revised scope (handoff analogue)
  const priced2 = await studio.calculate({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(priced2.revision, 2);
  const summary2 = buildApprovalSummaryFromEstimate(priced2);
  assert.ok(summary2.countertopSf > summary.countertopSf || summary2.customerDisplayTotal !== summary.customerDisplayTotal);
  const cmp = buildAiEstimatorSummary({
    estimate: priced2,
    priorEstimate: opened.priorEstimate
  }).comparison;
  assert.ok(
    cmp?.changedItems?.some((c) => c.from === 96 && c.to === 120),
    "comparison shows 96 → 120"
  );

  assert.equal(
    shouldOfferPublishRevised({
      publishedRevision: 1,
      estimateRevision: 2,
      measurementsApproved: true
    }),
    true
  );

  const published2 = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "acc-pub-2" }
  });
  assert.ok(published2.customerUrl);
  const token2 =
    published2.publication?.accessToken ||
    published2.accessToken ||
    (String(published2.customerUrl).match(/\/e\/([^/?#]+)/) || [])[1];
  const exchange2 = await pubSvc.exchangePublicationToken({ rawToken: token2 });
  assert.equal(exchange2.state.lifecycle, "active");
  assert.ok(exchange2.state.configuration);
  assert.equal(
    decideConfigurationView({
      uiEnabled: true,
      lifecycle: "active",
      hasConfiguration: true,
      hasEstimate: true
    }).mode,
    "configure"
  );

  // R1 still preserved
  const hist = await studioRepo.getById(ORG, row.id);
  assert.equal(hist.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  assert.equal(hist.revision, 1);
  console.log("ok: estimator revision R1→R2 publish + customer configure");
}

console.log("\naiEstimatorAcceptance.e2e.test.mjs — passed\n");
