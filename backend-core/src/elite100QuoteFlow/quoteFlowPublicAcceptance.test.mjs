/**
 * Quote Flow–published Digital Estimate must reuse the existing public final
 * acceptance path (acceptedAsPublished / acceptedAsConfigured). No sold/handoff/QB/email.
 *
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowPublicAcceptance.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createQuoteFlowDigitalEstimateService } from "./quoteFlowDigitalEstimate.mjs";
import { createQuoteFlowReviewService } from "./quoteFlowReview.mjs";
import { createQuoteFlowPricingService } from "./quoteFlowPricing.mjs";
import { createQuoteFlowActivityService } from "./quoteFlowActivity.mjs";
import { createQuoteFlowAcceptedReportService } from "./quoteFlowAcceptedReport.mjs";
import { calculateStudioEstimateV4 } from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createStudioEstimateDigitalEstimateService } from "../elite100EstimateStudio/studioEstimateDigitalEstimateService.mjs";
import { createInMemoryConfigurationRepository } from "../digitalEstimate/configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "../digitalEstimate/configuration/pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { createPublicConfigurationService } from "../digitalEstimate/configuration/publicConfigurationService.mjs";
import { createReviewRequestService } from "../digitalEstimate/configuration/reviewRequestService.mjs";
import { createInMemoryAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { createInMemoryStudioLifecycleRepository } from "../elite100EstimateStudio/studioLifecycleRepository.mjs";
import { createStudioFinalAcceptanceService } from "../elite100EstimateStudio/studioFinalAcceptanceService.mjs";
import { InMemoryStudioEstimateRepository } from "../elite100EstimateStudio/inMemoryStudioEstimateRepository.mjs";
import { emptyStudioEstimateScope } from "../elite100EstimateStudio/studioEstimateTypes.mjs";
import { classifyCustomerConfigurationForReview } from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";
import { buildStudioSalesOrderPlan } from "../elite100EstimateStudio/qbSalesOrder/studioSalesOrderPlan.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowPublicAcceptance.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "actor-qf-accept-1";
const CASE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CASE_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CASE_E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CASE_F = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const ENV = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1",
  ELITE100_QUOTE_FLOW_ENABLED: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

async function seedApprovedEstimate(studioRepo, pricing, review, { caseId, name }) {
  const row = await studioRepo.create({
    organizationId: ORG,
    intakeCaseId: caseId,
    createdByUserId: ACTOR,
    status: "ready_to_price",
    revision: 1,
    scope: {
      ...emptyStudioEstimateScope(),
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          included: true,
          pieces: [
            {
              id: "p1",
              name: "Island",
              lengthIn: 96,
              depthIn: 25.5,
              quantity: 1,
              included: true,
              openEdgeLf: 37.5,
              finishedEdgeLf: 37.5
            }
          ]
        }
      ],
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      projectName: name,
      customerName: "Acme",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      addOns: { "qty-sink": 1 }
    },
    calculationSnapshot: null,
    approval: null,
    staleReason: null
  });
  await pricing.calculatePricing({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      pricing: {
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        customLineItems: []
      }
    }
  });
  await review.approveReview({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  return row;
}

function harness() {
  const studioRepo = new InMemoryStudioEstimateRepository();
  const deRepo = createInMemoryDigitalEstimateRepository();
  const pricingPolicy = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({
    pricingPolicyRepository: pricingPolicy
  });
  const amendmentRepo = createInMemoryAmendmentRepository({
    deRepository: deRepo,
    configurationRepository: cfgRepo
  });
  const cfgStudio = createConfigurationStudioService({
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricingPolicy,
    deRepository: deRepo,
    env: ENV
  });
  const studioEstimateService = {
    repository: studioRepo,
    repositoryMode: "memory",
    async getById(organizationId, estimateId) {
      return studioRepo.getById(organizationId, estimateId);
    },
    safeEstimateView(e) {
      return e;
    }
  };
  const studioDE = createStudioEstimateDigitalEstimateService({
    env: ENV,
    studioEstimateService,
    digitalEstimateRepository: deRepo,
    configurationStudioService: cfgStudio,
    amendmentRepository: amendmentRepo,
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    })
  });
  const qfDigital = createQuoteFlowDigitalEstimateService({
    estimateRepository: studioRepo,
    studioEstimateService,
    studioDigitalEstimateService: studioDE,
    env: ENV,
    preferInteractiveConfiguration: true
  });
  const pricing = createQuoteFlowPricingService({
    estimateRepository: studioRepo,
    calculateStudioEstimate: calculateStudioEstimateV4,
    env: ENV
  });
  const review = createQuoteFlowReviewService({
    estimateRepository: studioRepo,
    env: ENV
  });
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const pubSvc = createPublicConfigurationService({
    env: ENV,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricingPolicy,
    lifecycleRepository: lifecycle
  });
  const reviewSvc = createReviewRequestService({
    env: ENV,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    amendmentRepository: amendmentRepo
  });
  const acceptSvc = createStudioFinalAcceptanceService({
    env: ENV,
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    amendmentRepository: amendmentRepo
  });
  const activity = createQuoteFlowActivityService({
    estimateRepository: studioRepo,
    studioEstimateService,
    studioDigitalEstimateService: studioDE,
    digitalEstimateRepository: deRepo,
    configurationRepository: cfgRepo,
    configurationStudioService: cfgStudio,
    lifecycleRepository: lifecycle,
    env: ENV
  });
  const acceptedReport = createQuoteFlowAcceptedReportService({
    estimateRepository: studioRepo,
    studioEstimateService,
    lifecycleRepository: lifecycle,
    env: ENV
  });
  return {
    studioRepo,
    pricing,
    review,
    qfDigital,
    pubSvc,
    reviewSvc,
    acceptSvc,
    activity,
    acceptedReport,
    deRepo,
    cfgRepo,
    pricingPolicy,
    lifecycle
  };
}

function edgeChangeSelections(state) {
  const edges = (state.configuration?.options || []).filter((o) =>
    String(o.optionKey || "").startsWith("edge:")
  );
  const pickEdge =
    edges.find((e) => String(e.optionKey).includes("large_ogee")) ||
    edges.find((e) => String(e.optionKey).includes("ogee")) ||
    edges[2] ||
    edges[1];
  assert.ok(pickEdge, "interactive envelope must expose edge options");
  const selections = { ...(state.configuration?.currentSelections || {}) };
  for (const k of Object.keys(selections)) {
    if (k.startsWith("edge:kitchen:")) delete selections[k];
  }
  selections[pickEdge.optionKey] = 1;
  return selections;
}

{
  // Contract: public Accept CTAs remain in app-digital-estimate; QF does not invent acceptance.
  const view = readFileSync(
    join(root, "app-digital-estimate/src/ConfigurationView.tsx"),
    "utf8"
  );
  assert.match(view, /Accept estimate/);
  assert.match(view, /canAcceptAsConfigured|acceptMode/);
  assert.match(view, /reviewAllowsConfigured|canAcceptConfigured/);
  const qfDe = readFileSync(join(__dirname, "quoteFlowDigitalEstimate.mjs"), "utf8");
  assert.doesNotMatch(qfDe, /acceptFinalEstimate|createStudioFinalAcceptanceService/);
  assert.match(qfDe, /assertStudioV2InteractivePublishResult/);
  console.log("ok: 1 public Accept path reused; QF publish stays interactive-only");
}

{
  const h = harness();
  const row = await seedApprovedEstimate(h.studioRepo, h.pricing, h.review, {
    caseId: CASE_A,
    name: "QF Accept Published"
  });
  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(published.ok, true);
  assert.equal(published.sideEffects.sold, false);
  assert.equal(published.sideEffects.accepted, false);
  assert.equal(published.sideEffects.emailed, false);
  assert.equal(published.sideEffects.handoffCreated, false);
  assert.ok(published.accessToken);

  const exchanged = await h.pubSvc.exchangePublicationToken({
    rawToken: published.accessToken
  });
  assert.equal(exchanged.state.lifecycle, "active");
  assert.equal(
    exchanged.state.configuration?.customerConfiguration?.canSubmitForFinalReview,
    true,
    "unchanged QF publication allows Accept as published"
  );
  const previewJson = JSON.stringify(exchanged.state).toLowerCase();
  assert.equal(previewJson.includes("exactinternaltotal"), false);
  assert.equal(previewJson.includes("shop scrap"), false);

  const accept = await h.acceptSvc.acceptFinalEstimate({
    rawSecret: exchanged.rawSecret,
    body: { confirm: true, expectedSessionId: exchanged.state.session.id }
  });
  assert.equal(accept.ok, true);
  assert.equal(accept.acceptance.acceptedAsPublished, true);
  assert.equal(accept.acceptance.acceptedAsConfigured, false);
  assert.equal(accept.sideEffects.markedSold, false);
  assert.equal(accept.sideEffects.emailSent, false);
  assert.equal(accept.sideEffects.quickbooksWritten, false);
  assert.equal(accept.sideEffects.revisionCreated, false);

  const act = await h.activity.getActivity({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR
  });
  assert.ok(act.acceptance?.acceptedAt, "Activity acceptance card must show acceptedAt");
  assert.match(String(act.summary?.acceptanceStatus?.key || ""), /^accepted_as_/);
  assert.match(String(act.summary?.acceptanceStatus?.label || ""), /Accepted/i);
  assert.equal(act.sideEffects?.sold, false);
  assert.equal(act.sideEffects?.handoffCreated, false);

  const report = await h.acceptedReport.getAcceptedReport({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR
  });
  assert.equal(report.status, "accepted");
  console.log("ok: 2 QF publish → acceptAsPublished → Activity Accepted + report");
}

{
  const h = harness();
  const row = await seedApprovedEstimate(h.studioRepo, h.pricing, h.review, {
    caseId: CASE_B,
    name: "QF Accept Configured"
  });
  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const exchanged = await h.pubSvc.exchangePublicationToken({
    rawToken: published.accessToken
  });
  const secret = exchanged.rawSecret;
  const state = exchanged.state;
  const edges = (state.configuration?.options || []).filter((o) =>
    String(o.optionKey || "").startsWith("edge:")
  );
  const pickEdge =
    edges.find((e) => String(e.optionKey).includes("large_ogee")) ||
    edges.find((e) => String(e.optionKey).includes("ogee")) ||
    edges[2] ||
    edges[1];
  assert.ok(pickEdge, "interactive envelope must expose edge options");

  const selections = { ...(state.configuration?.currentSelections || {}) };
  for (const k of Object.keys(selections)) {
    if (k.startsWith("edge:kitchen:")) delete selections[k];
  }
  selections[pickEdge.optionKey] = 1;

  // Baseline sidesplash:none must not force physical_scope.
  const preClass = classifyCustomerConfigurationForReview({ quantities: selections });
  assert.equal(preClass.requiresEliteReview, false);
  assert.notEqual(preClass.reviewKind, "physical_scope");

  const saved = await h.pubSvc.saveSelections({
    rawSecret: secret,
    body: {
      expectedRowVersion: state.session.rowVersion,
      idempotencyKey: "qf-accept-save-1",
      selections
    }
  });
  assert.equal(saved.customerConfiguration?.requiresEstimatorReview, false);
  assert.notEqual(saved.customerConfiguration?.reviewKind, "physical_scope");
  assert.equal(
    saved.customerConfiguration?.canAcceptAsConfigured === true ||
      saved.customerConfiguration?.canSubmitForFinalReview === true,
    true,
    "selection-only save must keep an Accept affordance"
  );

  const sent = await h.reviewSvc.createReviewRequest({
    rawSecret: secret,
    body: {
      confirm: true,
      expectedRowVersion: saved.session.rowVersion,
      idempotencyKey: "qf-accept-review-1"
    }
  });
  assert.equal(sent.reviewRequest?.requiresEliteReview, false);
  assert.equal(sent.reviewRequest?.canAcceptConfigured, true);
  assert.notEqual(sent.reviewRequest?.reviewKind, "physical_scope");

  const accept = await h.acceptSvc.acceptFinalEstimate({
    rawSecret: secret,
    body: { confirm: true, expectedSessionId: exchanged.state.session.id }
  });
  assert.equal(accept.ok, true);
  assert.equal(accept.acceptance.acceptedAsConfigured, true);
  assert.equal(accept.acceptance.acceptedAsPublished, false);
  assert.equal(accept.sideEffects.markedSold, false);
  assert.equal(accept.sideEffects.emailSent, false);
  assert.equal(accept.sideEffects.quickbooksWritten, false);
  assert.equal(accept.sideEffects.morawareWritten, false);
  assert.equal(accept.sideEffects.revisionCreated, false);
  assert.equal(accept.sideEffects.autoApproved, false);
  assert.equal(accept.sideEffects.autoPublished, false);

  const storedConfigured = await h.lifecycle.getAcceptanceByPublication(ORG, published.publication?.publicationId);
  const configuredSafe = storedConfigured.customerSafeSnapshotJson ?? storedConfigured.customer_safe_snapshot_json;
  const configuredFrozen = configuredSafe?.acceptedRoomPricing;
  const configuredTotal = Number(storedConfigured.customerDisplayTotal ?? storedConfigured.customer_display_total);
  assert.ok(configuredFrozen, "configured acceptance freezes the reconciled configured breakdown");
  assert.equal(
    configuredFrozen.rooms.reduce((s, r) => s + r.roomTotalDetail.amountCents, 0) +
      (configuredFrozen.projectAddOns || []).reduce((s, a) => s + Math.round(Number(a.amount || 0) * 100), 0),
    Math.round(configuredTotal * 100),
    "configured breakdown reconciles to the accepted total"
  );

  const act = await h.activity.getActivity({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR
  });
  assert.ok(act.acceptance?.acceptedAt);
  assert.equal(act.summary?.acceptanceStatus?.key, "accepted_as_configured");

  const report = await h.acceptedReport.getAcceptedReport({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR
  });
  assert.equal(report.status, "accepted");
  console.log(
    "ok: 3 selection-only send → acceptedAsConfigured; Activity/report; no sold/handoff/QB/email"
  );
}

{
  // Server-side lock: once accepted, selections cannot change (browser lock is not authority).
  const h = harness();
  const row = await seedApprovedEstimate(h.studioRepo, h.pricing, h.review, {
    caseId: CASE_C,
    name: "QF Locked After Accept"
  });
  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const exchanged = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  const accept = await h.acceptSvc.acceptFinalEstimate({
    rawSecret: exchanged.rawSecret,
    body: { confirm: true, expectedSessionId: exchanged.state.session.id }
  });
  assert.equal(accept.ok, true);
  const before = await h.lifecycle.getAcceptanceByPublication(ORG, published.publication?.publicationId);
  assert.ok(before, "acceptance row must exist before the locked save attempt");

  await assert.rejects(
    h.pubSvc.saveSelections({
      rawSecret: exchanged.rawSecret,
      body: {
        expectedRowVersion: exchanged.state.session.rowVersion,
        idempotencyKey: "qf-locked-save-1",
        selections: edgeChangeSelections(exchanged.state)
      }
    }),
    (e) => e.code === "configuration_locked" && e.statusCode === 423 && e.recoverable === false
  );
  const after = await h.lifecycle.getAcceptanceByPublication(ORG, published.publication?.publicationId);
  assert.deepEqual(after, before, "acceptance row must be unchanged");
  console.log("ok: 4 saveSelections after acceptance → 423 configuration_locked (server-enforced)");
}

{
  // Acceptance lookup failure fails closed instead of reopening configuration.
  const h = harness();
  const row = await seedApprovedEstimate(h.studioRepo, h.pricing, h.review, {
    caseId: CASE_D,
    name: "QF Lock Lookup Failure"
  });
  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const failingSvc = createPublicConfigurationService({
    env: ENV,
    deRepository: h.deRepo,
    configurationRepository: h.cfgRepo,
    pricingPolicyRepository: h.pricingPolicy,
    lifecycleRepository: {
      async getAcceptanceByPublication() {
        throw Object.assign(new Error("db down"), { code: "studio_lifecycle_persistence_unavailable" });
      }
    }
  });
  const exchanged = await failingSvc.exchangePublicationToken({ rawToken: published.accessToken });
  await assert.rejects(
    failingSvc.saveSelections({
      rawSecret: exchanged.rawSecret,
      body: {
        expectedRowVersion: exchanged.state.session.rowVersion,
        idempotencyKey: "qf-lock-lookup-fail-1",
        selections: edgeChangeSelections(exchanged.state)
      }
    }),
    (e) => e.code === "persistence_failed" && e.statusCode === 503
  );
  console.log("ok: 5 acceptance lookup failure → save fails closed (503)");
}

{
  // Acceptance binds to the configuration version the customer is viewing.
  const h = harness();
  const row = await seedApprovedEstimate(h.studioRepo, h.pricing, h.review, {
    caseId: CASE_E,
    name: "QF Accept Stale Version"
  });
  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const exchanged = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  const viewedVersion = exchanged.state.session.rowVersion;
  const saved = await h.pubSvc.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      expectedRowVersion: viewedVersion,
      idempotencyKey: "qf-other-window-save-1",
      selections: edgeChangeSelections(exchanged.state)
    }
  });
  assert.notEqual(saved.session.rowVersion, viewedVersion, "save must advance the row version");

  await assert.rejects(
    h.acceptSvc.acceptFinalEstimate({
      rawSecret: exchanged.rawSecret,
      body: { confirm: true, expectedSessionId: exchanged.state.session.id, expectedRowVersion: viewedVersion }
    }),
    (e) => e.code === "configuration_changed" && e.statusCode === 409
  );
  assert.equal(
    await h.lifecycle.getAcceptanceByPublication(ORG, published.publication?.publicationId),
    null,
    "stale acceptance must not write an acceptance row"
  );

  const accept = await h.acceptSvc.acceptFinalEstimate({
    rawSecret: exchanged.rawSecret,
    body: { confirm: true, expectedSessionId: exchanged.state.session.id, expectedRowVersion: saved.session.rowVersion }
  });
  assert.equal(accept.ok, true);
  console.log("ok: 6 accept with stale row version → 409 configuration_changed; current version accepts");
}

{
  // Reopened link: the new session displays the prior session's priced draft, so
  // acceptance must record that draft — never silently fall back to the published total.
  const h = harness();
  const row = await seedApprovedEstimate(h.studioRepo, h.pricing, h.review, {
    caseId: "abababab-abab-4bab-8bab-abababababab",
    name: "QF Reopened Link Accept"
  });
  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const first = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  const saved = await h.pubSvc.saveSelections({
    rawSecret: first.rawSecret,
    body: {
      expectedRowVersion: first.state.session.rowVersion,
      idempotencyKey: "qf-reopen-save-1",
      selections: edgeChangeSelections(first.state)
    }
  });
  const savedTotal = Number(saved.calculation?.totals?.configuredDisplayTotal ?? saved.calculation?.configuredDisplayTotal);

  const reopened = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  assert.notEqual(reopened.state.session.id, first.state.session.id, "reopening the link starts a new session");

  await assert.rejects(
    h.acceptSvc.acceptFinalEstimate({
      rawSecret: reopened.rawSecret,
      body: { confirm: true, expectedSessionId: reopened.state.session.id, expectedAcceptMode: "published" }
    }),
    (e) => e.code === "configuration_changed" && e.statusCode === 409,
    "a customer shown the published total must not have a configured total recorded"
  );

  const accept = await h.acceptSvc.acceptFinalEstimate({
    rawSecret: reopened.rawSecret,
    body: { confirm: true, expectedSessionId: reopened.state.session.id, expectedAcceptMode: "configured" }
  });
  assert.equal(accept.acceptance.acceptedAsConfigured, true);
  assert.equal(accept.acceptance.acceptedAsPublished, false);
  assert.ok(Number.isFinite(savedTotal), "saved draft is priced");
  assert.equal(Number(accept.acceptance.customerDisplayTotal), savedTotal, "records the draft total the customer saw");
  console.log("ok: 6b reopened link → accepts the restored priced draft; mode mismatch → 409");
}

{
  // Custom slab package: confirm gate → approve → publish → accept, with no cost leakage.
  const h = harness();
  const row = await h.studioRepo.create({
    organizationId: ORG,
    intakeCaseId: CASE_F,
    createdByUserId: ACTOR,
    status: "ready_to_price",
    revision: 1,
    scope: {
      ...emptyStudioEstimateScope(),
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          included: true,
          pieces: [
            { id: "k1", name: "Island", lengthIn: 96, depthIn: 25.5, quantity: 1, included: true, openEdgeLf: 0, finishedEdgeLf: 0 }
          ]
        },
        {
          id: "bath",
          name: "Hall Bath",
          roomType: "Bathroom",
          included: true,
          pieces: [
            { id: "b1", name: "Vanity", lengthIn: 49, depthIn: 22, quantity: 1, included: true, openEdgeLf: 0, finishedEdgeLf: 0 }
          ]
        }
      ],
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      projectName: "QF Custom Slab",
      customerName: "Acme",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      addOns: {}
    },
    calculationSnapshot: null,
    approval: null,
    staleReason: null
  });
  const slab = {
    id: "taj",
    colorName: "Taj Mahal",
    supplier: "Arizona Tile",
    slabLengthIn: 126,
    slabWidthIn: 63,
    costPerSlab: 1850.5
  };
  const pricingBody = (pkg) => ({
    pricing: {
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      customLineItems: [],
      slabPackages: [pkg],
      roomSelections: [{ roomId: "kitchen", slabPackageId: "taj" }]
    }
  });

  await assert.rejects(
    h.pricing.calculatePricing({
      organizationId: ORG,
      estimateId: row.id,
      actorUserId: ACTOR,
      body: { pricing: { roomSelections: [{ roomId: "kitchen", slabPackageId: "nope" }] } }
    }),
    (e) => e.code === "pricing_invalid",
    "room cannot reference a package that does not exist"
  );

  const first = await h.pricing.calculatePricing({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: pricingBody(slab)
  });
  const draftPkg = first.slabPackages.packages[0];
  assert.equal(draftPkg.calculated.suggestedQuantity, 1, "17 sf × 1.2 on a 55.125 sf slab → 1");
  assert.ok(draftPkg.issues.some((m) => /confirm the slab quantity/.test(m)));
  await assert.rejects(
    h.review.approveReview({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } }),
    (e) => e.code === "review_not_ready",
    "unconfirmed slab quantity must block approval"
  );

  const confirmed = await h.pricing.calculatePricing({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: pricingBody({ ...slab, confirmedSlabQuantity: 1 })
  });
  assert.deepEqual(confirmed.slabPackages.packages[0].issues, []);
  assert.equal(confirmed.slabPackages.packages[0].calculated.total, 4163.63, "1 × $1,850.50 × 2.25, exact cents");
  await h.review.approveReview({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } });
  const priced = await h.studioRepo.getById(ORG, row.id);
  const calcTotal = priced.calculationSnapshot.totals.customerDisplayTotal;

  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const exchanged = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  const optionKeys = (exchanged.state.configuration?.options || []).map((o) => String(o.optionKey));
  assert.equal(
    optionKeys.some((k) => /^(material|backsplash|sidesplash):kitchen:/.test(k)),
    false,
    "slab room must not offer collection color swaps or extra stone area"
  );
  assert.ok(optionKeys.some((k) => k.startsWith("material:bath:")), "Elite 100 room keeps color choices");

  const accept = await h.acceptSvc.acceptFinalEstimate({
    rawSecret: exchanged.rawSecret,
    body: { confirm: true, expectedSessionId: exchanged.state.session.id, expectedRowVersion: exchanged.state.session.rowVersion }
  });
  assert.equal(accept.ok, true);
  const stored = await h.lifecycle.getAcceptanceByPublication(ORG, published.publication?.publicationId);
  assert.equal(Number(stored.customerDisplayTotal ?? stored.customer_display_total), calcTotal);
  assert.equal(Math.round(calcTotal * 100) / 100, calcTotal, "accepted total carries exact cents");

  for (const [label, payload] of [
    ["public state", exchanged.state],
    ["acceptance response", accept],
    ["stored acceptance", stored]
  ]) {
    const json = JSON.stringify(payload).toLowerCase();
    for (const secret of ["costperslab", "1850.5", "costmultiplier", "2.25", "arizona tile", "slablengthin", "suggestedquantity"]) {
      assert.equal(json.includes(secret), false, `${label} must not expose ${secret}`);
    }
  }
  const est = exchanged.state.estimate;
  assert.equal(est.totals.estimatedProjectTotal, calcTotal, "public total is the exact calculator total");
  const roomPricing = est.roomPricing;
  const kitchenRoom = roomPricing.rooms.find((r) => r.roomName === "Kitchen");
  const bathRoom = roomPricing.rooms.find((r) => r.roomName === "Hall Bath");
  assert.equal(kitchenRoom.selectedMaterial, "Taj Mahal", "slab room shows its package, not a collection group");
  assert.equal(bathRoom.selectedMaterial, "Group Promo");
  const calcRooms = priced.calculationSnapshot.elite100.rooms;
  assert.equal(kitchenRoom.roomTotalDetail.amountCents, Math.round(calcRooms.find((r) => r.roomId === "kitchen").exactTotal * 100));
  assert.equal(bathRoom.roomTotalDetail.amountCents, Math.round(calcRooms.find((r) => r.roomId === "bath").exactTotal * 100));
  assert.equal(
    roomPricing.rooms.reduce((s, r) => s + r.roomTotalDetail.amountCents, 0),
    Math.round(calcTotal * 100),
    "room breakdown reconciles to the published total"
  );

  const safe = stored.customerSafeSnapshotJson ?? stored.customer_safe_snapshot_json;
  const frozen = safe?.acceptedRoomPricing;
  assert.ok(frozen, "accepted snapshot freezes the reconciled room breakdown");
  assert.deepEqual(
    frozen.rooms.map((r) => [r.roomName, r.roomTotalDetail.amountCents]),
    roomPricing.rooms.map((r) => [r.roomName, r.roomTotalDetail.amountCents]),
    "frozen breakdown equals what the customer saw"
  );
  const plan = buildStudioSalesOrderPlan({
    organizationId: ORG,
    soldSnapshot: { id: "sold-f", organization_id: ORG, studio_estimate_id: CASE_F, acceptance_id: stored.id, publication_id: published.publication?.publicationId },
    acceptance: { ...stored, organization_id: ORG, customer_safe_snapshot_json: safe, customer_display_total: calcTotal },
    mapping: {
      companyIdentity: "Elite Stone TEST",
      items: {
        room_material: { itemFullName: "Countertops:Installed", salesTaxCodeFullName: "Non" },
        "addon:*": { itemFullName: "Fabrication:Other", salesTaxCodeFullName: "Non" },
        credit: { itemFullName: "Adjustments:Credit", salesTaxCodeFullName: "Non" },
        "project:*": { itemFullName: "Services:Project", salesTaxCodeFullName: "Non" }
      }
    },
    customerJob: { fullName: "Synthetic Customer:Slab Kitchen" }
  });
  assert.equal(plan.ok, true, JSON.stringify(plan.blockers));
  assert.equal(plan.totalCents, Math.round(calcTotal * 100), "sales order plan equals the accepted total to the cent");
  const planJson = JSON.stringify(plan).toLowerCase();
  for (const secret of ["costperslab", "1850.5", "arizona tile", "costmultiplier"]) {
    assert.equal(planJson.includes(secret), false, `sales order plan must not carry ${secret}`);
  }
  console.log("ok: 7 custom slab confirm gate → publish (no slab-room swaps) → accept; no cost leakage");
}

async function publishManuallyAdjusted(h, caseId, name) {
  const row = await seedApprovedEstimate(h.studioRepo, h.pricing, h.review, { caseId, name });
  await h.pricing.calculatePricing({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      pricing: {
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        customLineItems: [],
        estimateWideAdjustment: { active: true, source: "manual", percentage: 5, reason: "Builder discount" }
      }
    }
  });
  await h.review.approveReview({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } });
  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  return { row, published };
}

{
  // Manual adjustment stays fixed: view-only publish, customer accepts the exact quote.
  const h = harness();
  const { row, published } = await publishManuallyAdjusted(h, "12121212-1212-4121-8121-121212121212", "QF Manual Adjusted");
  assert.equal(published.customerCanChangeOnline, false, "manual adjustment publishes without online changes");
  assert.equal(published.onlineChanges.customerCanChangeOnline, false);
  const priced = await h.studioRepo.getById(ORG, row.id);
  const approvedTotal = priced.calculationSnapshot.totals.customerDisplayTotal;
  const ewa = priced.calculationSnapshot.totals.estimateWideAdjustment;
  assert.equal(ewa?.source, "manual");
  assert.ok(Number(ewa?.exactAdjustment) > 0, "adjustment applied in the approved total");
  assert.equal(ewa.customerDisplayTotal, approvedTotal);

  const exchanged = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  assert.equal(exchanged.state.lifecycle, "blocked");
  assert.equal(exchanged.state.readMode, "baseline");
  assert.equal(exchanged.state.configuration, null, "no online changes offered");
  assert.equal(exchanged.state.estimate.totals.estimatedProjectTotal, approvedTotal);

  await assert.rejects(
    h.pubSvc.saveSelections({
      rawSecret: exchanged.rawSecret,
      body: { expectedRowVersion: exchanged.state.session.rowVersion, idempotencyKey: "qf-manual-save", selections: { "edge:kitchen:edge_small_ogee": 1 } }
    }),
    "a view-only publication must refuse selection changes"
  );

  const accept = await h.acceptSvc.acceptFinalEstimate({
    rawSecret: exchanged.rawSecret,
    body: { confirm: true, expectedSessionId: exchanged.state.session.id, expectedRowVersion: exchanged.state.session.rowVersion }
  });
  assert.equal(accept.ok, true);
  assert.equal(accept.acceptance.acceptedAsPublished, true);
  assert.equal(accept.acceptance.acceptedAsConfigured, false);
  assert.equal(accept.acceptance.customerDisplayTotal, approvedTotal, "accepted at the approved adjusted total");
  assert.equal(accept.sideEffects.markedSold, false);
  const stored = await h.lifecycle.getAcceptanceByPublication(ORG, published.publication?.publicationId);
  const safe = stored.customerSafeSnapshotJson ?? stored.customer_safe_snapshot_json;
  assert.equal(safe.acceptanceMode, "as_quoted");
  assert.ok(safe.acceptedRoomPricing, "accepted breakdown frozen and reconciled for the sales order");

  const again = await h.acceptSvc.acceptFinalEstimate({ rawSecret: exchanged.rawSecret, body: { confirm: true, expectedSessionId: exchanged.state.session.id } });
  assert.equal(again.reused, true, "acceptance lock: a second accept reuses the first");
  console.log("ok: 8 manual adjustment → view-only publish → accept as quoted at the approved total; lock holds");
}

{
  // The frozen quote itself must validate: tampered snapshot or stale approval blocks acceptance.
  const h = harness();
  const { published } = await publishManuallyAdjusted(h, "13131313-1313-4131-8131-131313131313", "QF Tampered");
  const pubId = published.publication?.publicationId;
  const tampered = await h.deRepo.getSnapshotByPublicationId(ORG, pubId);
  tampered.customer_snapshot_json.totals.estimatedProjectTotal = 1;
  const tamperedAccept = createStudioFinalAcceptanceService({
    env: ENV,
    lifecycleRepository: h.lifecycle,
    studioEstimateRepository: h.studioRepo,
    deRepository: { ...h.deRepo, getSnapshotByPublicationId: async () => structuredClone(tampered) },
    configurationRepository: h.cfgRepo
  });
  const exchanged = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  await assert.rejects(
    tamperedAccept.acceptFinalEstimate({ rawSecret: exchanged.rawSecret, body: { confirm: true, expectedSessionId: exchanged.state.session.id } }),
    (e) =>
      e.code === "acceptance_blocked_frozen_quote_invalid" &&
      e.statusCode === 409 &&
      e.reasons.includes("frozen_quote_integrity_failed") &&
      /can't be accepted online because/.test(e.message)
  );
  assert.equal(await h.lifecycle.getAcceptanceByPublication(ORG, pubId), null);

  const h2 = harness();
  const { row: row2, published: pub2 } = await publishManuallyAdjusted(h2, "14141414-1414-4141-8141-141414141414", "QF Stale");
  await h2.studioRepo.update(ORG, row2.id, { staleReason: "Scope changed — recalculate" });
  const ex2 = await h2.pubSvc.exchangePublicationToken({ rawToken: pub2.accessToken });
  await assert.rejects(
    h2.acceptSvc.acceptFinalEstimate({ rawSecret: ex2.rawSecret, body: { confirm: true, expectedSessionId: ex2.state.session.id } }),
    (e) => e.code === "acceptance_blocked_frozen_quote_invalid" && e.reasons.includes("estimate_approval_stale")
  );
  console.log("ok: 9 tampered frozen quote or stale approval → acceptance blocked with the reason; nothing written");
}

{
  // One browser, two estimate links: the shared session cookie now points at B while the page shows A.
  const h = harness();
  const { published: pubA } = await publishManuallyAdjusted(h, "15151515-1515-4151-8151-151515151515", "QF Tab A");
  const { published: pubB } = await publishManuallyAdjusted(h, "16161616-1616-4161-8161-161616161616", "QF Tab B");
  const exA = await h.pubSvc.exchangePublicationToken({ rawToken: pubA.accessToken });
  const exB = await h.pubSvc.exchangePublicationToken({ rawToken: pubB.accessToken });
  await assert.rejects(
    h.acceptSvc.acceptFinalEstimate({
      rawSecret: exB.rawSecret,
      body: { confirm: true, expectedSessionId: exA.state.session.id, expectedRowVersion: exA.state.session.rowVersion }
    }),
    (e) => e.code === "session_mismatch" && e.statusCode === 409
  );
  await assert.rejects(
    h.acceptSvc.acceptFinalEstimate({ rawSecret: exB.rawSecret, body: { confirm: true } }),
    (e) => e.code === "session_binding_missing" && e.statusCode === 409
  );
  assert.equal(await h.lifecycle.getAcceptanceByPublication(ORG, pubA.publication?.publicationId), null);
  assert.equal(await h.lifecycle.getAcceptanceByPublication(ORG, pubB.publication?.publicationId), null);
  console.log("ok: 9b acceptance bound to the viewed estimate; another tab's cookie cannot accept it");
}

{
  // Room-level colors (Set Scope / pricing) survive publication into the customer snapshot.
  const h = harness();
  const room = (id, name) => ({
    id,
    name,
    roomType: "Kitchen",
    included: true,
    pieces: [{ id: `${id}-p1`, name: "Run", lengthIn: 96, depthIn: 25.5, quantity: 1, included: true, openEdgeLf: 8, finishedEdgeLf: 8 }]
  });
  const row = await h.studioRepo.create({
    organizationId: ORG,
    intakeCaseId: "15151515-1515-4151-8151-151515151515",
    createdByUserId: ACTOR,
    status: "ready_to_price",
    revision: 1,
    scope: {
      ...emptyStudioEstimateScope(),
      rooms: [room("kitchen", "Kitchen"), room("bath", "Hall Bath"), room("laundry", "Laundry"), room("bar", "Bar")],
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      colorName: "Project White",
      projectName: "QF Room Colors",
      customerName: "Acme",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      addOns: {}
    },
    calculationSnapshot: null,
    approval: null,
    staleReason: null
  });
  await h.pricing.calculatePricing({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      pricing: {
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        colorName: "Project White",
        customLineItems: [],
        roomSelections: [
          { roomId: "kitchen", colorNameOverride: "Calacatta Fioressa" },
          { roomId: "bath", colorTbd: true },
          { roomId: "bar", materialGroupOverride: "Group C" }
        ]
      }
    }
  });
  const priced = await h.studioRepo.getById(ORG, row.id);
  assert.equal(priced.scope.rooms.find((r) => r.id === "bath").colorTbd, true, "room TBD persisted in scope");
  await h.review.approveReview({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } });
  const published = await h.qfDigital.publishDigitalEstimate({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const snap = await h.deRepo.getSnapshotByPublicationId(ORG, published.publication?.publicationId);
  const colors = Object.fromEntries(snap.customer_snapshot_json.rooms.map((r) => [r.name, r.colorLabel || null]));
  assert.deepEqual(colors, {
    Kitchen: "Calacatta Fioressa",
    "Hall Bath": null,
    Laundry: "Project White",
    Bar: null
  }, "room color override > room TBD > group override (no inherited project color) > project color");
  const exchanged = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  const publicColors = Object.fromEntries((exchanged.state.estimate.rooms || []).map((r) => [r.name, r.colorLabel || null]));
  assert.equal(publicColors.Kitchen, "Calacatta Fioressa", "customer sees the room color");
  console.log("ok: 10 room-level Set Scope colors carried through pricing → publish → customer snapshot");
}

{
  // Staff sink selection: catalog sink replaces the generic add-on, cutout charged once,
  // published by name per room, customer switch priced as the difference only.
  const h = harness();
  const K160 = "kansas:3018UM18";
  const K220 = "kansas:3018UM16";
  const VOVAL = "kansas:VC1613WH";
  const piece = (id, extra) => ({ id, name: "Run", lengthIn: 96, depthIn: 25.5, quantity: 1, included: true, openEdgeLf: 8, finishedEdgeLf: 8, ...extra });
  const row = await h.studioRepo.create({
    organizationId: ORG,
    intakeCaseId: "16161616-1616-4161-8161-161616161616",
    createdByUserId: ACTOR,
    status: "ready_to_price",
    revision: 1,
    scope: {
      ...emptyStudioEstimateScope(),
      rooms: [
        { id: "kitchen", name: "Kitchen", roomType: "Kitchen", included: true, pieces: [piece("k1", { kitchenSinkCutouts: 1 })] },
        {
          id: "bath",
          name: "Hall Bath",
          roomType: "vanity",
          included: true,
          pieces: [piece("b1", { lengthIn: 49, depthIn: 22.5, vanityBarSinkCutouts: 1 })]
        }
      ],
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      projectName: "QF Sinks",
      customerName: "Acme",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      addOns: { "qty-ss": 1 }
    },
    calculationSnapshot: null,
    approval: null,
    staleReason: null
  });
  const price = (extra = {}) =>
    h.pricing.calculatePricing({
      organizationId: ORG,
      estimateId: row.id,
      actorUserId: ACTOR,
      body: { pricing: { pricingBasis: "wholesale", materialGroup: "Group Promo", customLineItems: [], ...extra } }
    });

  await price();
  const draft = await h.pricing.getPricing({ organizationId: ORG, estimateId: row.id });
  assert.deepEqual(
    draft.sinkSelections.rooms.map((r) => [r.roomId, r.kitchenOpenings, r.vanityOpenings, r.decisionRequired]),
    [["kitchen", 1, 0, true], ["bath", 0, 1, true]]
  );
  assert.ok(draft.sinkSelections.catalog.some((p) => p.productId === K160 && p.sellPrice === 160));
  await assert.rejects(
    h.review.approveReview({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } }),
    (e) => e.code === "review_not_ready" && /Select the sink for Kitchen, Hall Bath/.test(JSON.stringify(e.diagnostic)),
    "approval blocked until staff decide every sink"
  );
  await assert.rejects(
    price({ sinkSelections: [{ roomId: "bath", mode: "catalog", productId: K160 }] }),
    (e) => e.code === "pricing_invalid" && /not a vanity sink/.test(JSON.stringify(e)),
    "a kitchen sink cannot be put on a vanity opening"
  );

  // Vanity switch: customer-provided first, then staff switch it to a stock oval sink.
  await price({ sinkSelections: [{ roomId: "kitchen", mode: "catalog", productId: K160 }, { roomId: "bath", mode: "customer_provided" }] });
  const cp = await h.studioRepo.getById(ORG, row.id);
  const cpBath = cp.calculationSnapshot.elite100.rooms.find((r) => r.roomId === "bath");
  assert.equal(cpBath.sinks[0].customerSupplied, true);
  await price({ sinkSelections: [{ roomId: "bath", mode: "catalog", productId: VOVAL }] });
  const priced = await h.studioRepo.getById(ORG, row.id);
  const calcRooms = Object.fromEntries(priced.calculationSnapshot.elite100.rooms.map((r) => [r.roomId, r]));
  assert.equal(calcRooms.kitchen.cutouts.kitchenSinkQty, 1, "kitchen cutout counted once");
  assert.equal(calcRooms.kitchen.cutouts.kitchenSinkCharge, 200);
  assert.equal(calcRooms.kitchen.sinkProductsTotal, 160, "chosen catalog sink priced");
  assert.equal(calcRooms.bath.cutouts.vanitySinkCharge, 100);
  assert.equal(calcRooms.bath.sinkProductsTotal, 35, "vanity switched to stock oval sink");
  const fabLines = JSON.stringify(priced.calculationSnapshot.fabrication?.customLineItems || []);
  assert.equal(/legacy retired SKU/.test(fabLines), false, "generic ESF stainless add-on replaced, not stacked");

  await h.review.approveReview({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } });
  const calcTotal = priced.calculationSnapshot.totals.customerDisplayTotal;
  const published = await h.qfDigital.publishDigitalEstimate({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } });
  const snap = await h.deRepo.getSnapshotByPublicationId(ORG, published.publication?.publicationId);
  const rp = snap.customer_snapshot_json.roomPricing;
  const linesOf = (id) => rp.rooms.find((r) => r.roomId === id).customerFacingLines.map((l) => [l.label, l.amountCents]);
  assert.deepEqual(linesOf("kitchen").filter(([l]) => /sink/i.test(l)), [
    ["Kitchen sink cutout", 20000],
    ["Sink — 3018UM18 Super Single Large Bowl UM Stainless Steel Sink 18GA", 16000]
  ]);
  assert.deepEqual(linesOf("bath").filter(([l]) => /sink/i.test(l)), [
    ["Vanity/bar sink cutout", 10000],
    ["Sink — VC1613 Oval China Sink White", 3500]
  ]);
  assert.equal(JSON.stringify(rp).includes("Customer-provided sink"), false);
  assert.equal(rp.totalCents, Math.round(calcTotal * 100));
  assert.equal(rp.reconciliationStatus, "reconciled");

  // Customer: the staff sink is the published default; switching is priced as the difference.
  const exchanged = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  const opts = exchanged.state.configuration.options.map((o) => String(o.optionKey));
  assert.equal(opts.includes("sink:kitchen:none"), false, "staff-decided sink cannot be removed online");
  const cfgOptions = exchanged.state.configuration.options;
  const current = {
    ...Object.fromEntries(cfgOptions.filter((o) => Number(o.defaultQty) > 0).map((o) => [o.optionKey, Number(o.defaultQty)])),
    ...(exchanged.state.configuration.currentSelections || {})
  };
  assert.equal(Number(current[`sink:kitchen:esf:${K160}`]), 1, "published staff sink selected by default");
  const effect = (id) => cfgOptions.find((o) => o.optionKey === `sink:kitchen:esf:${id}`)?.priceEffectLabel;
  assert.equal(effect(K160), "Included in your estimate");
  assert.equal(effect(K220), "+$60", "alternative sink shows the difference from the published sink");
  assert.equal(effect("kansas:3018UM18ADA"), "No change", "same-price alternative shows no change");
  let version = exchanged.state.session.rowVersion;
  let n = 0;
  const saveSink = async (kitchenKey) => {
    const selections = { ...current };
    for (const k of Object.keys(selections)) if (k.startsWith("sink:kitchen:")) delete selections[k];
    selections[kitchenKey] = 1;
    const saved = await h.pubSvc.saveSelections({
      rawSecret: exchanged.rawSecret,
      body: { expectedRowVersion: version, idempotencyKey: `qf-sink-${++n}`, selections }
    });
    version = saved.session.rowVersion;
    lastSaved = saved;
    return Math.round(Number(saved.calculation?.configuredDisplayTotal) * 100);
  };
  let lastSaved = null;
  const kitchenSinkLines = () =>
    (lastSaved.calculation?.roomPricing?.rooms || [])
      .find((r) => r.roomName === "Kitchen")
      ?.addOnLines.filter((l) => /sink/i.test(l.label) && !/cutout/i.test(l.label))
      .map((l) => [l.label, Math.round(Number(l.amount) * 100)]);
  const base = Math.round(calcTotal * 100);
  assert.equal(await saveSink(`sink:kitchen:esf:${K160}`), base, "keeping the published sink costs nothing");
  assert.equal(await saveSink(`sink:kitchen:esf:${K220}`), base + 6000, "$160 → $220 sink is +$60, cutout not recharged");
  const switched = kitchenSinkLines();
  assert.equal(switched.length, 1, `one sink line after a switch, got ${JSON.stringify(switched)}`);
  assert.match(switched[0][0], /3018UM16/);
  assert.doesNotMatch(switched[0][0], /replaces|ESF Sink — /);
  assert.equal(switched[0][1], 22000, "chosen sink at its full price");
  const sinkChangeRows = (lastSaved.calculation?.roomPricingChanges?.rows || [])
    .filter((r) => r.roomName === "Kitchen" && /sink/i.test(`${r.originalLabel} ${r.updatedLabel}`) && !/cutout/i.test(`${r.originalLabel} ${r.updatedLabel}`));
  assert.equal(sinkChangeRows.length, 1, `staff before/after shows one sink row, got ${JSON.stringify(sinkChangeRows)}`);
  assert.equal(Math.round(Number(sinkChangeRows[0].amountDeltaCents ?? sinkChangeRows[0].amountDelta * 100)), 6000);
  assert.doesNotMatch(sinkChangeRows[0].updatedLabel, /replaces|ESF Sink — /);
  assert.equal(await saveSink(`sink:kitchen:esf:${K160}`), base, "switching back returns to the published total");
  assert.equal(await saveSink("sink:kitchen:customer_provided"), base - 16000, "customer-provided credits the published sink");
  console.log("ok: 11 staff sinks → catalog price replaces add-on, cutout once, named per room; customer switch = difference");
}

{
  // Vanity Program room: sink bundled; no cutout charge line, no catalog sink swap online.
  const h = harness();
  const row = await h.studioRepo.create({
    organizationId: ORG,
    intakeCaseId: "17171717-1717-4171-8171-171717171717",
    createdByUserId: ACTOR,
    status: "ready_to_price",
    revision: 1,
    scope: {
      ...emptyStudioEstimateScope(),
      rooms: [
        {
          id: "bath",
          name: "Bathroom Vanity",
          roomType: "vanity",
          included: true,
          pieces: [{ id: "v1", name: "Vanity", included: true, lengthIn: 37, depthIn: 22.5, quantity: 1, cutouts: [{ type: "vanity_bar_sink", quantity: 1 }] }]
        }
      ],
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      projectName: "QF Vanity Program",
      customerName: "Acme",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      addOns: {}
    },
    calculationSnapshot: null,
    approval: null,
    staleReason: null
  });
  const price = (extra) =>
    h.pricing.calculatePricing({
      organizationId: ORG,
      estimateId: row.id,
      actorUserId: ACTOR,
      body: { pricing: { pricingBasis: "wholesale", materialGroup: "Group Promo", customLineItems: [], ...extra } }
    });
  await price({ vanityPrograms: [{ roomId: "bath", apply: true }] });
  await assert.rejects(
    price({ sinkSelections: [{ roomId: "bath", mode: "catalog", productId: "kansas:VC1613WH" }] }),
    (e) => e.code === "pricing_invalid" && /includes the sink/.test(JSON.stringify(e))
  );
  await price({ sinkSelections: [{ roomId: "bath", mode: "program", sinkType: "rectangular_white" }], vanityPrograms: [{ roomId: "bath", apply: true }] });
  const priced = await h.studioRepo.getById(ORG, row.id);
  assert.equal(priced.scope.roomConfigurations.bath.vanityProgram.sinkType, "rectangular_white", "program sink type survives re-saving the election");
  const bath = priced.calculationSnapshot.elite100.rooms[0];
  assert.equal(bath.vanityProgram?.qualifies, true);
  assert.equal(bath.cutouts.vanitySinkCharge, 0, "program bundles the cutout");
  await h.review.approveReview({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } });
  const published = await h.qfDigital.publishDigitalEstimate({ organizationId: ORG, estimateId: row.id, actorUserId: ACTOR, body: { confirm: true } });
  const snap = await h.deRepo.getSnapshotByPublicationId(ORG, published.publication?.publicationId);
  const lines = snap.customer_snapshot_json.roomPricing.rooms[0].customerFacingLines.map((l) => [l.label, l.amountCents]);
  assert.deepEqual(lines.filter(([l]) => /sink/i.test(l)), [["Sink and sink cutout (included in Vanity Program)", 0]], "inclusion shown, no $100 cutout charge");
  const exchanged = await h.pubSvc.exchangePublicationToken({ rawToken: published.accessToken });
  const sinkOpts = (exchanged.state.configuration?.options || []).filter((o) => String(o.optionKey).startsWith("sink:bath:"));
  assert.equal(sinkOpts.length, 0, "no catalog sink swaps on the included program sink");
  console.log("ok: 12 Vanity Program sink stays included: no cutout charge, program sink type kept, no swaps");
}

console.log("\nquoteFlowPublicAcceptance.test.mjs: ok\n");
