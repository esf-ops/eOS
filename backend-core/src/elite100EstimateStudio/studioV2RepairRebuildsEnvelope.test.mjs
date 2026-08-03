/**
 * Studio V2 Republish / Repair must rebuild the active configuration envelope
 * and sanitize existing customer selections — even when a (stale) active
 * envelope already exists.
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioV2RepairRebuildsEnvelope.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createInMemoryConfigurationRepository } from "../digitalEstimate/configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "../digitalEstimate/configuration/pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { createInMemoryAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { createPublicConfigurationService } from "../digitalEstimate/configuration/publicConfigurationService.mjs";
import { hashCanonical } from "../digitalEstimate/configuration/configurationValidation.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";

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
  fingerprint: "v2-repair-fp",
  calculatedAt: "2026-08-03T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 4380, customerDisplayTotal: 4380 },
  warnings: [],
  unresolvedItems: [],
  fabrication: { customLineItems: [] }
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
        includeBacksplash: true,
        backsplashSqft: 12,
        backsplashHeightMode: "standard",
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
    customLineItems: []
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
      approvedAt: "2026-08-03T17:00:00.000Z",
      approvedByUserId: ACTOR,
      calculationFingerprint: "v2-repair-fp",
      customerDisplayTotal: 4380
    },
    staleReason: null
  });
}

function tokenFromCustomerUrl(url) {
  const m = String(url || "").match(/\/e\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function pickKey(keys, prefix) {
  return keys.find((k) => String(k).startsWith(prefix)) || null;
}

console.log("\nstudioV2RepairRebuildsEnvelope.test.mjs\n");

{
  const { studioRepo, deRepo, cfgRepo, v2, pubSvc } = await harness();
  const row = await createApprovedEstimate(studioRepo);

  const first = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true, clientMutationId: `v2-first-${randomUUID()}` }
  });
  assert.equal(first.ok, true);
  assert.equal(first.envelope?.configured, true);
  const publicationId = first.publication?.publicationId;
  assert.ok(publicationId, "publication id");
  const customerUrl = first.customerUrl;
  assert.ok(customerUrl);

  const token = tokenFromCustomerUrl(customerUrl);
  const exchange1 = await pubSvc.exchangePublicationToken({ rawToken: token });
  assert.ok(exchange1.state.configuration);
  const optionKeys = (exchange1.state.configuration.options || []).map(
    (o) => o.optionKey || o.option_key
  );
  const esfSink = optionKeys.find((k) => /^sink:kitchen:esf:/.test(String(k)));
  const cpSink = pickKey(optionKeys, "sink:kitchen:customer_provided");
  const noneSplash = pickKey(optionKeys, "backsplash:kitchen:none");
  const stdSplash = pickKey(optionKeys, "backsplash:kitchen:standard_4in");
  const materialAlt = optionKeys.find(
    (k) =>
      String(k).startsWith("material:kitchen:") &&
      !String(k).includes("baseline") &&
      Number(
        exchange1.state.configuration.options.find(
          (o) => (o.optionKey || o.option_key) === k
        )?.includedInBaseline
      ) !== 1
  );
  const materialAny = pickKey(optionKeys, "material:kitchen:");
  assert.ok(esfSink, "ESF sink option on envelope");
  assert.ok(cpSink, "customer_provided sink on envelope");
  assert.ok(noneSplash, "none backsplash on envelope");
  assert.ok(stdSplash || noneSplash, "backsplash options present");
  assert.ok(materialAny, "material option present");

  const envBefore = await cfgRepo.getActiveEnvelope(ORG, publicationId);
  assert.ok(envBefore?.id);

  // Contaminate saved selections on the current envelope (ESF + customer_provided + dual splash).
  const contaminatedQty = {
    [esfSink]: 1,
    [cpSink]: 1,
    [noneSplash]: 1,
    ...(stdSplash ? { [stdSplash]: 1 } : {}),
    [materialAny]: 1
  };
  await cfgRepo.saveRepairedPublicationSelection({
    organizationId: ORG,
    publicationId,
    envelopeId: envBefore.id,
    actorUserId: ACTOR,
    selectionPayload: contaminatedQty,
    selectionHash: hashCanonical(contaminatedQty),
    customerResultJson: {
      configuredDisplayTotal: 4380,
      baselineDisplayTotal: 4380,
      roomPricing: {
        rooms: [
          {
            roomKey: "kitchen",
            displayName: "Kitchen",
            addOnLines: [
              { optionKey: esfSink, label: "ESF Precis", lineTotal: 900 },
              { optionKey: cpSink, label: "Customer-provided sink", lineTotal: 0 }
            ]
          }
        ]
      }
    },
    baselineTotal: 4380,
    configuredTotal: 4380,
    sourceSelectionId: null
  });

  const pubsBefore = await deRepo.listPublicationsForQuote(ORG, row.id);
  assert.equal(pubsBefore.length, 1, "single publication before repair");

  // Repair on already-published revision (same fingerprint → idempotent reuse path).
  const repaired = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true, clientMutationId: `v2-repair-${randomUUID()}` }
  });

  assert.equal(repaired.ok, true);
  assert.equal(repaired.publication?.publicationId, publicationId, "same publication");
  assert.equal(repaired.customerUrl, customerUrl, "same customer link");
  assert.equal(repaired.envelope?.configured, true);
  assert.equal(repaired.envelope?.envelopeRebuilt, true, "envelope rebuilt");
  assert.equal(repaired.envelope?.activePublicationUnchanged, true);
  assert.ok(
    /configuration repaired|permissions updated/i.test(String(repaired.staffNotice || "")),
    `honest repair notice, got: ${repaired.staffNotice}`
  );
  assert.ok(
    repaired.repair?.envelopeRebuilt === true || repaired.envelope?.envelopeRebuilt === true
  );

  const pubsAfter = await deRepo.listPublicationsForQuote(ORG, row.id);
  assert.equal(pubsAfter.length, 1, "no duplicate publication");

  const envAfter = await cfgRepo.getActiveEnvelope(ORG, publicationId);
  assert.ok(envAfter?.id);
  assert.notEqual(envAfter.id, envBefore.id, "new active envelope after rebuild");

  const migrated = await cfgRepo.getLatestSelectionForPublicationEnvelope(
    ORG,
    publicationId,
    envAfter.id
  );
  assert.ok(migrated, "sanitized selection migrated to new envelope");
  const payload = migrated.selection_payload_json || {};
  const qtyObj =
    payload.quantities && typeof payload.quantities === "object"
      ? payload.quantities
      : payload;
  // Exclusive sanitize: ESF wins, customer_provided dropped; none splash wins over standard_4in.
  assert.equal(Number(qtyObj[esfSink]) || 0, 1, "ESF sink retained");
  assert.equal(Number(qtyObj[cpSink]) || 0, 0, "customer_provided sink dropped");
  assert.equal(Number(qtyObj[noneSplash]) || 0, 1, "none backsplash retained");
  if (stdSplash) {
    assert.equal(Number(qtyObj[stdSplash]) || 0, 0, "baseline splash dropped when none selected");
  }
  assert.ok(
    (repaired.envelope?.droppedOrCanonicalizedCount || 0) >= 1 ||
      (repaired.repair?.droppedOrCanonicalizedCount || 0) >= 1,
    "repair reports dropped/canonicalized stale keys"
  );

  // Public exchange after repair uses rebuilt envelope.
  const exchange2 = await pubSvc.exchangePublicationToken({ rawToken: token });
  assert.ok(exchange2.state.configuration);
  assert.equal(exchange2.state.configuration.envelopeId || exchange2.state.configuration.envelope_id || envAfter.id, envAfter.id);
  const postKeys = new Set(
    (exchange2.state.configuration.options || []).map((o) => o.optionKey || o.option_key)
  );
  assert.ok(postKeys.has(esfSink), "rebuilt envelope still has ESF sink");
  assert.ok(postKeys.has(noneSplash), "rebuilt envelope still has none splash");

  const secret = exchange2.rawSecret;
  assert.ok(secret);
  const rowVersion = exchange2.state.session?.rowVersion ?? exchange2.state.session?.row_version;
  assert.ok(rowVersion != null);

  const sinkSave = await pubSvc.saveSelections({
    rawSecret: secret,
    body: {
      expectedRowVersion: rowVersion,
      idempotencyKey: `sink-${randomUUID()}`,
      items: [{ optionKey: esfSink, quantity: 1 }]
    }
  });
  assert.equal(sinkSave.ok, true, "sink save succeeds after repair");

  const splashSave = await pubSvc.saveSelections({
    rawSecret: secret,
    body: {
      expectedRowVersion: sinkSave.session.rowVersion,
      idempotencyKey: `splash-${randomUUID()}`,
      items: [
        { optionKey: esfSink, quantity: 1 },
        { optionKey: noneSplash, quantity: 1 }
      ]
    }
  });
  assert.equal(splashSave.ok, true, "backsplash save succeeds after repair");

  const matKey = materialAlt || materialAny;
  const matSave = await pubSvc.saveSelections({
    rawSecret: secret,
    body: {
      expectedRowVersion: splashSave.session.rowVersion,
      idempotencyKey: `mat-${randomUUID()}`,
      items: [
        { optionKey: esfSink, quantity: 1 },
        { optionKey: noneSplash, quantity: 1 },
        { optionKey: matKey, quantity: 1 }
      ]
    }
  });
  assert.equal(matSave.ok, true, "material save succeeds after repair");

  await assert.rejects(
    () =>
      pubSvc.saveSelections({
        rawSecret: secret,
        body: {
          expectedRowVersion: matSave.session.rowVersion,
          idempotencyKey: `off-${randomUUID()}`,
          items: [
            { optionKey: esfSink, quantity: 1 },
            { optionKey: "sink:kitchen:not-a-real-option", quantity: 1 }
          ]
        }
      }),
    (e) =>
      e?.code === "selection_unavailable" ||
      e?.diagnosticCode === "DE-EXCHANGE-404" ||
      e?.diagnosticCode === "DE-OPTION-NOT-ALLOWED" ||
      /unavailable|not allowed|not on envelope/i.test(String(e?.message || ""))
  );

  console.log("ok: already-published repair rebuilds envelope, sanitizes, saves succeed, link stable");
}

{
  // First-time publish still creates a fresh interactive publication (unchanged behavior).
  const { studioRepo, deRepo, v2, pubSvc } = await harness();
  const row = await createApprovedEstimate(studioRepo);
  const published = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true, clientMutationId: `v2-fresh-${randomUUID()}` }
  });
  assert.equal(published.ok, true);
  assert.equal(published.reused, false);
  assert.equal(published.envelope?.configured, true);
  assert.ok(published.customerUrl);
  const pubs = await deRepo.listPublicationsForQuote(ORG, row.id);
  assert.equal(pubs.length, 1);
  const token = tokenFromCustomerUrl(published.customerUrl);
  const exchange = await pubSvc.exchangePublicationToken({ rawToken: token });
  assert.equal(exchange.state.lifecycle, "active");
  assert.ok(exchange.state.configuration);
  console.log("ok: first-time publish unchanged");
}

console.log("\nAll studioV2RepairRebuildsEnvelope tests passed.\n");
