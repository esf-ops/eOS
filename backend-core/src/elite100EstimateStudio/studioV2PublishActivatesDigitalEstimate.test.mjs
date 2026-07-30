/**
 * Studio V2 strict publish must activate an interactive Digital Estimate
 * (configuration envelope + ConfigurationView), not a static document-only link.
 *
 * Mirrors studioSimplifiedPublishActivatesDigitalEstimate.test.mjs for the V2 path:
 * POST V2 publishApproved → DE publish → public token exchange → configure mode.
 *
 * Also proves republish repairs a prior document-only publication.
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioV2PublishActivatesDigitalEstimate.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";
import { decideConfigurationView } from "../../../app-digital-estimate/src/configurationBootstrap.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

const fakeCalc = {
  fingerprint: "v2-interactive-fp",
  calculatedAt: "2026-07-30T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 4380, customerDisplayTotal: 4380 },
  warnings: [],
  unresolvedItems: [],
  fabrication: {
    customLineItems: [
      {
        commercialRole: "customer_charge",
        customerFacing: true,
        name: "Sink",
        lineTotal: 200
      },
      {
        commercialRole: "legacy_hidden_customer_charge",
        customerFacing: false,
        name: "Adjustment",
        internalNotes: "PIA seam complexity — internal only",
        lineTotal: 150
      },
      {
        commercialRole: "internal_only",
        customerFacing: false,
        name: "Shop scrap",
        internalNotes: "Internal cost note",
        lineTotal: 75
      }
    ]
  }
};

function approvedScope() {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Acme Homes",
    projectName: "Lakeview Kitchen",
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    pricingBasis: "wholesale",
    materialGroup: "B",
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
    customLineItems: fakeCalc.fabrication.customLineItems
  };
}

async function harness({ withConfigurationService = true } = {}) {
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

  const configurationStudioService = withConfigurationService
    ? createConfigurationStudioService({
        configurationRepository: cfgRepo,
        pricingPolicyRepository: pricing,
        deRepository: deRepo,
        env: ENV_ON
      })
    : null;

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

  const v2 = createStudioV2Service({
    env: ENV_ON,
    repository: studioRepo,
    studioEstimateService: studio,
    studioDigitalEstimateService: digitalEstimateService,
    calculateStudioEstimateImpl: async () => fakeCalc
  });

  const pubSvc = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });

  return { studioRepo, deRepo, cfgRepo, v2, pubSvc, digitalEstimateService };
}

async function createApprovedEstimate(studioRepo) {
  return studioRepo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    sourceTakeoffResultId: "result-1",
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: approvedScope(),
    calculationSnapshot: fakeCalc,
    pricingEngine: "elite100-room-pricing-v1",
    pricingVersion: 4,
    approval: {
      approvedAt: "2026-07-30T17:00:00.000Z",
      approvedByUserId: ACTOR,
      calculationFingerprint: "v2-interactive-fp",
      customerDisplayTotal: 4380
    },
    staleReason: null
  });
}

function tokenFromCustomerUrl(url) {
  const m = String(url || "").match(/\/e\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

console.log("\nstudioV2PublishActivatesDigitalEstimate.test.mjs\n");

{
  // Source contracts: V2 remains strict / link-only / no simplified workflow
  const pub = readFileSync(join(__dirname, "studioV2Publish.mjs"), "utf8");
  const svc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  assert.ok(pub.includes("resolveSimplifiedPublishConfiguration"));
  assert.ok(pub.includes("assertStudioV2InteractivePublishResult"));
  assert.ok(svc.includes("assertStudioV2InteractivePublishResult"));
  assert.ok(!svc.includes("createStudioSimplifiedWorkflowService"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  console.log("ok: V2 interactive publish source contracts (strict/link-only)");
}

{
  const { studioRepo, cfgRepo, v2, pubSvc } = await harness();
  const row = await createApprovedEstimate(studioRepo);

  const published = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true, deliveryMode: "link_only", clientMutationId: `v2-int-${randomUUID()}` }
  });

  assert.equal(published.ok, true);
  assert.ok(published.customerUrl, "customer URL returned");
  assert.match(String(published.customerUrl), /\/e\//, "customer URL uses /e/ token path");
  assert.equal(published.envelope?.configured, true, "V2 publish activates configuration envelope");
  assert.equal(published.sideEffects.simplifiedPublish, false);
  assert.equal(published.sideEffects.autoApprove, false);
  assert.equal(published.sideEffects.autoCalculate, false);
  assert.equal(published.sideEffects.ensureEditableDraft, false);
  assert.equal(published.sideEffects.refreshFromTakeoff, false);

  const token = tokenFromCustomerUrl(published.customerUrl);
  assert.ok(token, "stable public token present");

  const exchange = await pubSvc.exchangePublicationToken({ rawToken: token });
  assert.equal(exchange.state.lifecycle, "active");
  assert.ok(exchange.state.estimate, "estimate present");
  assert.ok(exchange.state.configuration, "configuration envelope present on public session");

  const decision = decideConfigurationView({
    uiEnabled: true,
    lifecycle: exchange.state.lifecycle,
    hasConfiguration: Boolean(exchange.state.configuration),
    hasEstimate: Boolean(exchange.state.estimate)
  });
  assert.equal(decision.mode, "configure");
  assert.equal(decision.fallbackReason, null);
  assert.notEqual(decision.fallbackReason, "configuration_absent");

  const optionKeys = (exchange.state.configuration.options || []).map(
    (o) => o.optionKey || o.option_key
  );
  assert.ok(optionKeys.some((k) => String(k).startsWith("material:")), "material options present");
  assert.ok(optionKeys.some((k) => String(k).startsWith("sink:")), "sink options present");

  // Hidden internal reason must not appear in public configuration / estimate payload.
  const publicJson = JSON.stringify(exchange.state);
  assert.equal(/PIA seam complexity/i.test(publicJson), false, "hidden internal reason not exposed");
  assert.equal(/Internal cost note/i.test(publicJson), false, "internal-only reason not exposed");
  assert.equal(/Shop scrap/i.test(publicJson), false, "internal-only label not exposed");

  const customerTotal = Number(
    exchange.state.estimate?.totals?.customerDisplayTotal ??
      exchange.state.estimate?.customerDisplayTotal ??
      exchange.state.latestCalculation?.totals?.configuredDisplayTotal ??
      NaN
  );
  // Baseline snapshot total should match approved V2 total when available.
  if (Number.isFinite(customerTotal)) {
    assert.equal(customerTotal, 4380, "customer total matches approved V2 total");
  }

  const activeEnv = await cfgRepo.getActiveEnvelope(
    ORG,
    published.publication?.publicationId || published.publication?.id
  );
  assert.ok(activeEnv?.id, "active envelope persisted for publication");

  console.log("ok: V2 strict publish opens interactive Digital Estimate (configure mode)");
}

{
  // Republish repairs a prior document-only publication on the same revision.
  const { studioRepo, cfgRepo, v2, pubSvc, digitalEstimateService } = await harness();
  const row = await createApprovedEstimate(studioRepo);

  // First publish without interactive configuration (simulates pre-fix production).
  const docOnly = await digitalEstimateService.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      configuration: { enableConfiguration: false, configurationMode: "document" }
    }
  });
  assert.equal(docOnly.envelope?.configured, false);
  assert.ok(docOnly.customerUrl);
  const docToken = tokenFromCustomerUrl(docOnly.customerUrl);
  const docExchange = await pubSvc.exchangePublicationToken({ rawToken: docToken });
  const docDecision = decideConfigurationView({
    uiEnabled: true,
    lifecycle: docExchange.state.lifecycle,
    hasConfiguration: Boolean(docExchange.state.configuration),
    hasEstimate: Boolean(docExchange.state.estimate)
  });
  assert.equal(
    docDecision.fallbackReason === "configuration_absent" || docDecision.mode === "legacy",
    true,
    "document-only publish yields configuration_absent / legacy"
  );

  // V2 republish with interactive defaults must repair the active publication.
  const repaired = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true, clientMutationId: `v2-repair-${randomUUID()}` }
  });
  assert.equal(repaired.ok, true);
  assert.equal(repaired.envelope?.configured, true);
  assert.ok(
    repaired.envelope?.updated === true ||
      repaired.envelope?.repaired === true ||
      repaired.configurationUpdated === true ||
      repaired.customerUrl,
    "republish refreshes interactive configuration on active link"
  );

  const token = tokenFromCustomerUrl(repaired.customerUrl || docOnly.customerUrl);
  const exchange = await pubSvc.exchangePublicationToken({ rawToken: token });
  assert.ok(exchange.state.configuration, "repaired publication exposes configuration");
  const decision = decideConfigurationView({
    uiEnabled: true,
    lifecycle: exchange.state.lifecycle,
    hasConfiguration: Boolean(exchange.state.configuration),
    hasEstimate: Boolean(exchange.state.estimate)
  });
  assert.equal(decision.mode, "configure");
  assert.equal(decision.fallbackReason, null);

  const activeEnv = await cfgRepo.getActiveEnvelope(
    ORG,
    repaired.publication?.publicationId || docOnly.publication?.id
  );
  assert.ok(activeEnv?.id, "active envelope after repair");

  console.log("ok: V2 republish repairs document-only publication into interactive DE");
}

{
  // Without configurationStudioService, interactive V2 publish must fail closed (not silent URL).
  const { studioRepo, v2 } = await harness({ withConfigurationService: false });
  const row = await createApprovedEstimate(studioRepo);
  await assert.rejects(
    () =>
      v2.publishApproved({
        organizationId: ORG,
        estimateId: row.id,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) =>
      e?.code === STUDIO_V2_ERROR_CODES.CONFIGURATION_ENVELOPE_REQUIRED ||
      e?.code === "DE-CONFIGURATION-UNAVAILABLE" ||
      e?.code === "DE-ENVELOPE-ACTIVATION-FAILED"
  );
  console.log("ok: V2 interactive publish fails closed when configuration service unavailable");
}

console.log("\nstudioV2PublishActivatesDigitalEstimate.test.mjs — passed\n");
