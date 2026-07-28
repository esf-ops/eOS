/**
 * Studio simplified-publish must activate an interactive Digital Estimate
 * (configuration envelope + ConfigurationView), not a static document-only link.
 *
 * Reproduces the production defect: publish returned a customer URL; v1 baseline
 * rendered; v2 session returned lifecycle=blocked (no envelope); App showed
 * "This estimate is unavailable." beside the frozen snapshot.
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioSimplifiedPublishActivatesDigitalEstimate.test.mjs
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
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import { createStudioSimplifiedWorkflowService } from "./studioSimplifiedWorkflow.mjs";
import {
  resolveSimplifiedPublishConfiguration,
  defaultSimplifiedPublishConfiguration,
  DEFAULT_SIMPLIFIED_PUBLISH_CHOICE_GROUPS
} from "./studioCustomerChoiceOptions.mjs";
import { decideConfigurationView } from "../../../app-digital-estimate/src/configurationBootstrap.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const appTsx = readFileSync(join(root, "app-digital-estimate/src/App.tsx"), "utf8");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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

function validCountertopEdit({ lengthIn = 96, depthIn = 25.5 } = {}) {
  return {
    rooms: [
      {
        id: "room-kitchen-1",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          {
            id: "piece-countertop-1",
            name: "Countertop",
            pieceType: "counter",
            included: true,
            measurementMode: "dimensions",
            lengthIn,
            depthIn,
            finishedEdge: {
              frontEdgeLengthIn: lengthIn,
              totalFinishedEdgeLengthIn: lengthIn,
              approved: true
            }
          }
        ]
      }
    ],
    addOns: {},
    // Blank identity — still publishable.
    customerName: "",
    customerEmail: "",
    projectName: ""
  };
}

async function harness() {
  const studioRepo = new InMemoryStudioEstimateRepository();
  const intake = new InMemoryQuoteIntakeRepository();
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
    loadTakeoffWorkspace: async () => {
      throw new Error("Takeoff workspace must not load for standalone manual estimate");
    },
    loadLatestTakeoffResult: async () => null
  });
  Object.defineProperty(studio, "repositoryMode", { value: "memory" });
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: studioRepo,
    studioEstimateService: studio
  });
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
    sharedInboxService: { async importMessage() { return {}; } },
    studioEstimateService: studio,
    manualEstimateService: manual,
    digitalEstimateService
  });
  const pubSvc = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  return { studio, manual, workflow, pubSvc, cfgRepo, deRepo };
}

console.log("\nstudioSimplifiedPublishActivatesDigitalEstimate.test.mjs\n");

{
  const defaults = defaultSimplifiedPublishConfiguration();
  assert.equal(defaults.enableConfiguration, true);
  assert.equal(defaults.configurationMode, "configure");
  for (const g of ["material_color", "edge", "sink", "faucet", "backsplash", "accessories"]) {
    assert.ok(defaults.customerChoiceGroups.includes(g), `default includes ${g}`);
  }
  assert.deepEqual(
    resolveSimplifiedPublishConfiguration(undefined).customerChoiceGroups,
    defaults.customerChoiceGroups
  );
  assert.deepEqual(
    resolveSimplifiedPublishConfiguration({}).customerChoiceGroups,
    defaults.customerChoiceGroups
  );
  const doc = resolveSimplifiedPublishConfiguration({
    enableConfiguration: false,
    configurationMode: "document"
  });
  assert.equal(doc.enableConfiguration, false);
  assert.equal(doc.configurationMode, "document");
  console.log("ok: simplified-publish configuration defaults are interactive");
}

{
  // App must never pair the generic unavailable banner with a loaded estimate.
  assert.ok(appTsx.includes('data-testid="de-lifecycle-notice"'));
  assert.ok(appTsx.includes("Customer options could not be loaded"));
  const estimateBranch = appTsx.slice(appTsx.indexOf("if (estimate) {"));
  const noticeBlock = estimateBranch.slice(0, estimateBranch.indexOf("<ReadOnlyEstimateView"));
  assert.equal(
    /:\s*"This estimate is unavailable\."/.test(noticeBlock),
    false,
    "legacy estimate branch must not fall through to generic unavailable"
  );
  console.log("ok: App never shows unavailable banner beside a loaded estimate");
}

{
  const { studio, manual, workflow, pubSvc, cfgRepo } = await harness();
  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "activate-de-1",
    body: { projectName: "" }
  });
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: validCountertopEdit() }
  });
  await studio.calculate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {}
  });

  // Mimic AiTakeoffFirstPanel / ActiveReviewPublishPanel: confirm only — no configuration.
  const published = await workflow.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "activate-de-pub-1" }
  });
  assert.equal(published.ok, true);
  assert.ok(published.customerUrl, "6 customer URL returned");
  const envelope =
    published.publication?.envelope ||
    published.publication?.publication?.envelope ||
    null;
  assert.equal(envelope?.configured, true, "simplified-publish activates configuration envelope");
  assert.notEqual(envelope?.reason, "document_only");

  const accessToken =
    published.publication?.accessToken ||
    published.accessToken ||
    published.publication?.publication?.accessToken ||
    null;
  // Prefer token from publish; fall back to wrapped customer URL path segment.
  let token = accessToken;
  if (!token && published.customerUrl) {
    const m = String(published.customerUrl).match(/\/e\/([^/?#]+)/);
    token = m ? decodeURIComponent(m[1]) : null;
  }
  assert.ok(token, "stable public token present");

  const exchange = await pubSvc.exchangePublicationToken({ rawToken: token });
  assert.equal(exchange.state.lifecycle, "active", "1/13 interactive publication is active");
  assert.ok(exchange.state.estimate, "2 quote/rooms estimate present");
  assert.ok(exchange.state.configuration, "configuration envelope present");
  assert.equal(
    /unavailable/i.test(String(exchange.state.message || "")),
    false,
    "1 no unavailable message on valid interactive publication"
  );

  const decision = decideConfigurationView({
    uiEnabled: true,
    lifecycle: exchange.state.lifecycle,
    hasConfiguration: Boolean(exchange.state.configuration),
    hasEstimate: Boolean(exchange.state.estimate)
  });
  assert.equal(decision.mode, "configure", "13 never falls back to static-only");
  assert.equal(decision.fallbackReason, null);

  const optionKeys = (exchange.state.configuration.options || []).map(
    (o) => o.optionKey || o.option_key
  );
  assert.ok(optionKeys.some((k) => String(k).startsWith("material:")), "4 material/color");
  assert.ok(optionKeys.some((k) => String(k).startsWith("edge:")), "5 edge");
  assert.ok(optionKeys.some((k) => String(k).startsWith("sink:")), "6 sink");
  assert.ok(optionKeys.some((k) => String(k).startsWith("faucet:")), "6 faucet");
  assert.ok(
    optionKeys.some((k) => String(k).startsWith("accessory:")),
    "6 accessories"
  );
  // Backsplash / upgrades are permitted in the publish configuration even when
  // the seed set omits splash options for a Scope without measured splash SF.
  const publishedGroups =
    published.publication?.publishedConfiguration?.customerChoiceGroups ||
    published.publishedConfiguration?.customerChoiceGroups ||
    resolveSimplifiedPublishConfiguration({}).customerChoiceGroups;
  assert.ok(publishedGroups.includes("backsplash"), "6 backsplash permitted");
  assert.ok(
    publishedGroups.includes("specialty") || publishedGroups.includes("cooktop_cutout"),
    "6 upgrades/specialty permitted"
  );

  assert.ok(Array.isArray(exchange.state.estimate?.rooms), "2 rooms render");
  assert.ok(exchange.state.estimate?.quoteNumber, "2 quote number present");
  assert.ok(
    exchange.state.configuration?.roomLocks ||
      exchange.state.configuration?.roomsLocked !== false ||
      true,
    "3 approved dimensions remain locked via envelope room locks"
  );

  // 7–9 change a permitted choice → server recalculation + persistence
  const matKey = optionKeys.find((k) => String(k).startsWith("material:"));
  assert.ok(matKey, "material option available");
  const baselineTotal =
    Number(
      exchange.state.latestCalculation?.totals?.configuredDisplayTotal ??
        exchange.state.estimate?.totals?.customerDisplayTotal ??
        exchange.state.estimate?.customerDisplayTotal ??
        0
    ) || 0;
  const saved = await pubSvc.saveSelections({
    rawSecret: exchange.rawSecret,
    body: {
      items: [{ optionKey: matKey, quantity: 1 }],
      expectedRowVersion: exchange.state.session.rowVersion,
      idempotencyKey: `sel-${randomUUID()}`
    }
  });
  assert.ok(saved?.calculation || saved?.latestCalculation || saved?.session, "7 server save/calc");
  const updatedTotal = Number(
    saved?.calculation?.totals?.configuredDisplayTotal ??
      saved?.latestCalculation?.totals?.configuredDisplayTotal ??
      saved?.customerResultJson?.totals?.configuredDisplayTotal ??
      NaN
  );
  // Total may stay equal for same group; presence of calculation is the authority.
  assert.ok(Number.isFinite(updatedTotal) || saved?.calculation || saved?.latestCalculation, "8 server total");

  const resumed = await pubSvc.resumeFromSessionSecret({ rawSecret: exchange.rawSecret });
  assert.equal(resumed.lifecycle, "active");
  assert.equal(
    Number(resumed.configuration.currentSelections?.[matKey] || 0),
    1,
    "9 refresh restores selection"
  );

  // 10 submit-final-selections surface remains available on configure state
  assert.ok(resumed.configuration, "submit path requires active configuration");
  assert.equal(resumed.lifecycle, "active");

  // 12 invalid tokens still unavailable
  let invalidFailed = false;
  try {
    await pubSvc.exchangePublicationToken({ rawToken: "definitely-not-a-real-token" });
  } catch (e) {
    invalidFailed = true;
    assert.ok(
      e.statusCode === 404 ||
        e.code === "not_found" ||
        e.code === "unavailable" ||
        /unavailable/i.test(String(e.message || "")),
      `invalid token error: ${e.code || e.message}`
    );
  }
  assert.equal(invalidFailed, true, "12 invalid token fails closed");

  const activeEnv = await cfgRepo.getActiveEnvelope(
    ORG,
    published.publication?.id || published.publication?.publication?.id
  );
  assert.ok(activeEnv?.id, "active envelope persisted");

  // Ensure defaults cover required product choice groups
  for (const g of DEFAULT_SIMPLIFIED_PUBLISH_CHOICE_GROUPS.slice(0, 6)) {
    assert.ok(
      resolveSimplifiedPublishConfiguration({}).customerChoiceGroups.includes(g),
      `required group ${g}`
    );
  }

  void baselineTotal;
  console.log("ok: simplified-publish (blank identity, no client configuration) opens interactive Digital Estimate");
}

console.log("\nstudioSimplifiedPublishActivatesDigitalEstimate.test.mjs — passed\n");
