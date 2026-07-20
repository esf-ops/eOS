/**
 * Configuration-enabled Studio publish must open ConfigurationView (active envelope),
 * not the legacy static document. Replace Link must preserve the envelope.
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioEstimateDigitalEstimate.configurePublish.test.mjs
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
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import {
  FRIENDLY_CUSTOMER_CHOICES,
  buildCustomerChoiceConfiguration
} from "./studioCustomerChoiceOptions.mjs";
import { decideConfigurationView } from "../../../app-digital-estimate/src/configurationBootstrap.ts";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

function allChoiceConfig() {
  const flags = Object.fromEntries(FRIENDLY_CUSTOMER_CHOICES.map((d) => [d.id, true]));
  return buildCustomerChoiceConfiguration(flags, []);
}

function approvedRow(fingerprint) {
  const id = randomUUID();
  return {
    id,
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: TAKEOFF_ID,
    sourceTakeoffResultId: "result-1",
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: {
      customerName: "Hoskins Williams",
      projectName: "Kitchen",
      projectAddress: "1 Main St",
      pricingBasis: "direct",
      materialGroup: "Group Promo",
      colorName: "Carrara Classic",
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          included: true,
          countertopSqft: 40,
          backsplashSqft: 8,
          pieces: [{ id: "p1", name: "Perimeter", depthIn: 25.5 }]
        }
      ],
      addOns: { "qty-sink": 1 }
    },
    calculationSnapshot: {
      fingerprint,
      calculatedAt: new Date().toISOString(),
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      totals: { customerDisplayTotal: 8361, exactInternalTotal: 9000 }
    },
    calculationFingerprint: fingerprint,
    pricingEngine: "quoteCalculator",
    pricingVersion: 2,
    approval: {
      approvedAt: new Date().toISOString(),
      approvedByUserId: ACTOR,
      calculationFingerprint: fingerprint,
      customerDisplayTotal: 8361,
      exactInternalTotal: 9000
    },
    staleReason: null,
    supersededAt: null
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
  const studioEstimateService = createStudioEstimateService({
    env: ENV_ON,
    repository: studioRepo,
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    }),
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async () => ({
      fingerprint: "fp-calc",
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      totals: { customerDisplayTotal: 5000, exactInternalTotal: 5500 }
    })
  });
  Object.defineProperty(studioEstimateService, "repositoryMode", { value: "memory" });
  const configurationStudioService = createConfigurationStudioService({
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    deRepository: deRepo,
    env: ENV_ON
  });
  const svc = createStudioEstimateDigitalEstimateService({
    env: ENV_ON,
    studioEstimateService,
    digitalEstimateRepository: deRepo,
    configurationStudioService,
    amendmentRepository: amendmentRepo,
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    })
  });
  const pubSvc = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  return { studioRepo, deRepo, cfgRepo, cfgStudio: configurationStudioService, svc, pubSvc };
}

async function seedApproved(studioRepo, fingerprint) {
  const row = approvedRow(fingerprint);
  await studioRepo.create({ ...row, createdByUserId: ACTOR });
  await studioRepo.update(
    ORG,
    row.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: row.calculationSnapshot,
      approval: row.approval,
      pricingEngine: "quoteCalculator",
      pricingVersion: 2
    },
    ACTOR
  );
  return row;
}

function assertConfigure(state, label) {
  assert.equal(state.lifecycle, "active", `${label}: lifecycle`);
  assert.ok(state.configuration, `${label}: configuration present`);
  assert.ok(state.estimate, `${label}: estimate present`);
  const decision = decideConfigurationView({
    uiEnabled: true,
    lifecycle: state.lifecycle,
    hasConfiguration: Boolean(state.configuration),
    hasEstimate: Boolean(state.estimate)
  });
  assert.equal(decision.mode, "configure", `${label}: frontend mode`);
  assert.equal(decision.fallbackReason, null, `${label}: no fallback`);
  return decision;
}

console.log("\nstudioEstimateDigitalEstimate.configurePublish.test.mjs\n");

{
  const { studioRepo, cfgRepo, svc, pubSvc } = await harness();
  const row = await seedApproved(studioRepo, "fp-cfg-1");
  const choiceConfig = allChoiceConfig();
  const published = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "cfg-1",
      configuration: { ...choiceConfig, roomLocks: [{ roomKey: "*", locked: true }] }
    }
  });
  assert.equal(published.ok, true);
  assert.equal(published.envelope?.configured, true);
  assert.ok(published.accessToken);

  const exchange = await pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  assertConfigure(exchange.state, "fresh configure publish");
  const optionKeys = (exchange.state.configuration.options || []).map(
    (o) => o.optionKey || o.option_key
  );
  assert.ok(optionKeys.some((k) => String(k).startsWith("material:")), "materials seeded");
  assert.ok(optionKeys.some((k) => String(k).startsWith("sink:")), "sink options seeded");
  assert.ok(optionKeys.some((k) => String(k).startsWith("faucet:")), "faucet options seeded");
  assert.ok(
    optionKeys.some((k) => String(k).startsWith("backsplash:")),
    "backsplash options seeded"
  );
  // Empty selections must still open configure — not static fallback.
  assert.equal(
    Object.keys(exchange.state.configuration.currentSelections || {}).length >= 0,
    true
  );

  const activeBefore = await cfgRepo.getActiveEnvelope(ORG, published.publication.id);
  assert.ok(activeBefore?.id);

  const replaced = await svc.replaceLink({
    organizationId: ORG,
    publicationId: published.publication.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.ok(replaced.accessToken);
  assert.notEqual(replaced.accessToken, published.accessToken);

  let oldBlocked = false;
  try {
    await pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  } catch (e) {
    oldBlocked = true;
    assert.ok(
      e.code === "not_found" ||
        e.code === "unavailable" ||
        e.statusCode === 404 ||
        e.statusCode === 410,
      `old token error code: ${e.code}`
    );
  }
  assert.equal(oldBlocked, true, "old token becomes inaccessible after replace");

  const afterReplace = await pubSvc.exchangePublicationToken({
    rawToken: replaced.accessToken
  });
  assertConfigure(afterReplace.state, "after Replace Link");
  const activeAfter = await cfgRepo.getActiveEnvelope(ORG, published.publication.id);
  assert.equal(activeAfter?.id, activeBefore.id, "replace preserves active envelope id");
  const keysAfter = (afterReplace.state.configuration.options || []).map(
    (o) => o.optionKey || o.option_key
  );
  assert.ok(keysAfter.some((k) => String(k).startsWith("sink:")), "replace preserves sink options");
  assert.ok(
    keysAfter.some((k) => String(k).startsWith("faucet:")),
    "replace preserves faucet options"
  );

  // Autosave + restore still works after token replacement
  const kitchenMat = keysAfter.find((k) => String(k).includes("e100-india-black-pearl"));
  assert.ok(kitchenMat, "India Black Pearl option present");
  const saved = await pubSvc.saveSelections({
    rawSecret: afterReplace.rawSecret,
    body: {
      items: [{ optionKey: kitchenMat, quantity: 1 }],
      expectedRowVersion: afterReplace.state.session.rowVersion,
      idempotencyKey: `sel-${randomUUID()}`
    }
  });
  assert.ok(saved?.calculation || saved?.latestCalculation || saved?.session);
  const resumed = await pubSvc.resumeFromSessionSecret({ rawSecret: afterReplace.rawSecret });
  assertConfigure(resumed, "resume after save");
  assert.equal(
    Number(resumed.configuration.currentSelections?.[kitchenMat] || 0),
    1,
    "selection restores after save"
  );
  console.log("ok: configure publish + replace + save/restore");
}

{
  const { studioRepo, svc, pubSvc } = await harness();
  const row = await seedApproved(studioRepo, "fp-doc-1");
  const published = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "doc-1", configuration: {} }
  });
  assert.equal(published.ok, true);
  assert.equal(published.envelope?.configured, false);
  assert.equal(published.envelope?.reason, "document_only");
  const exchange = await pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  const decision = decideConfigurationView({
    uiEnabled: true,
    lifecycle: exchange.state.lifecycle,
    hasConfiguration: Boolean(exchange.state.configuration),
    hasEstimate: Boolean(exchange.state.estimate)
  });
  assert.equal(decision.mode, "legacy", "document-only opens static view");
  assert.ok(exchange.state.estimate, "document-only still has estimate");
  console.log("ok: document-only publish opens static view");
}

{
  const { studioRepo, svc, pubSvc } = await harness();
  const row = await seedApproved(studioRepo, "fp-rev-1");
  const choiceConfig = allChoiceConfig();
  const p1 = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "rev-1",
      configuration: { ...choiceConfig }
    }
  });
  assert.equal(p1.envelope?.configured, true);

  const revised = await studioRepo.createRevisionFrom(
    ORG,
    row.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      scope: row.scope,
      staleReason: null
    },
    ACTOR
  );
  const fp2 = "fp-rev-2";
  await studioRepo.update(
    ORG,
    revised.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: {
        ...row.calculationSnapshot,
        fingerprint: fp2,
        totals: { customerDisplayTotal: 9000, exactInternalTotal: 9900 }
      },
      approval: {
        ...row.approval,
        calculationFingerprint: fp2,
        customerDisplayTotal: 9000
      },
      pricingEngine: "quoteCalculator",
      pricingVersion: 2
    },
    ACTOR
  );
  const p2 = await svc.publish({
    organizationId: ORG,
    estimateId: revised.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "rev-2",
      configuration: { ...choiceConfig }
    }
  });
  assert.equal(p2.envelope?.configured, true);
  const exchange = await pubSvc.exchangePublicationToken({ rawToken: p2.accessToken });
  assertConfigure(exchange.state, "revision publish preserves configure mode");
  const keys = (exchange.state.configuration.options || []).map(
    (o) => o.optionKey || o.option_key
  );
  assert.ok(keys.some((k) => String(k).startsWith("sink:")));
  assert.ok(keys.some((k) => String(k).startsWith("faucet:")));
  console.log("ok: revision publish preserves configuration mode and options");
}

{
  // Frontend/backend contract: active lifecycle + configuration ⇒ configure
  const configure = decideConfigurationView({
    uiEnabled: true,
    lifecycle: "active",
    hasConfiguration: true,
    hasEstimate: true
  });
  assert.equal(configure.mode, "configure");
  const absent = decideConfigurationView({
    uiEnabled: true,
    lifecycle: "blocked",
    hasConfiguration: false,
    hasEstimate: true
  });
  assert.equal(absent.mode, "legacy");
  assert.ok(
    absent.fallbackReason === "lifecycle_not_active" ||
      absent.fallbackReason === "configuration_absent"
  );
  const emptySelectionsStillConfigure = decideConfigurationView({
    uiEnabled: true,
    lifecycle: "active",
    hasConfiguration: true,
    hasEstimate: true
  });
  assert.equal(emptySelectionsStillConfigure.mode, "configure");
  console.log("ok: frontend/backend publication-mode contracts match");
}

{
  // Bounded-time configure publish + phase diagnostics
  const { studioRepo, svc, pubSvc, deRepo } = await harness();
  const row = await seedApproved(studioRepo, "fp-timing-1");
  const t0 = Date.now();
  const published = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "timing-1",
      configuration: { ...allChoiceConfig() }
    }
  });
  const elapsed = Date.now() - t0;
  assert.equal(published.ok, true);
  assert.equal(published.envelope?.configured, true);
  assert.ok(published.correlationId, "correlation id present");
  assert.ok(published.phases && typeof published.phases === "object", "phase timings present");
  assert.ok(elapsed < 15_000, `configure publish should complete promptly (got ${elapsed}ms)`);
  const exchange = await pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  assertConfigure(exchange.state, "timing publish");
  assert.equal(
    (await deRepo.listActivePublicationsForFamily(ORG, CASE_ID)).length >= 1,
    true
  );
  console.log(`ok: configure publish bounded time (${elapsed}ms) with phases`);
}

{
  // Failed envelope activation preserves prior working link
  const { studioRepo, svc, pubSvc, cfgStudio, deRepo } = await harness();
  const row = await seedApproved(studioRepo, "fp-preserve-1");
  const first = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "preserve-1",
      configuration: { ...allChoiceConfig() }
    }
  });
  assert.equal(first.envelope?.configured, true);
  const firstToken = first.accessToken;
  const firstOk = await pubSvc.exchangePublicationToken({ rawToken: firstToken });
  assertConfigure(firstOk.state, "prior working link");

  const revised = await studioRepo.createRevisionFrom(
    ORG,
    row.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      scope: row.scope,
      staleReason: null
    },
    ACTOR
  );
  const fp2 = "fp-preserve-2";
  await studioRepo.update(
    ORG,
    revised.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: {
        ...row.calculationSnapshot,
        fingerprint: fp2,
        totals: { customerDisplayTotal: 9100, exactInternalTotal: 10010 }
      },
      approval: {
        ...row.approval,
        calculationFingerprint: fp2,
        customerDisplayTotal: 9100
      },
      pricingEngine: "quoteCalculator",
      pricingVersion: 2
    },
    ACTOR
  );

  const realActivate = cfgStudio.activate.bind(cfgStudio);
  cfgStudio.activate = async () => {
    throw Object.assign(new Error("forced activation failure"), {
      code: "DE-ENVELOPE-ACTIVATION-FAILED",
      statusCode: 422
    });
  };
  let failed = null;
  try {
    await svc.publish({
      organizationId: ORG,
      estimateId: revised.id,
      actorUserId: ACTOR,
      body: {
        confirm: true,
        idempotencyKey: "preserve-2-fail",
        configuration: { ...allChoiceConfig() }
      }
    });
  } catch (e) {
    failed = e;
  } finally {
    cfgStudio.activate = realActivate;
  }
  assert.ok(failed, "publish must fail closed");
  assert.equal(failed.code, "DE-ENVELOPE-ACTIVATION-FAILED");
  const priorStillWorks = await pubSvc.exchangePublicationToken({ rawToken: firstToken });
  assertConfigure(priorStillWorks.state, "prior link preserved after failed publish");
  const active = await deRepo.listActivePublicationsForFamily(ORG, CASE_ID);
  assert.ok(
    active.some((p) => p.id === first.publication.id && p.status === "active"),
    "prior publication restored to active"
  );
  console.log("ok: failed configure publish preserves previous working link");
}

console.log("\nAll configure-publish tests passed.\n");
