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

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowPublicAcceptance.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const ACTOR = "actor-qf-accept-1";
const CASE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
  const pubSvc = createPublicConfigurationService({
    env: ENV,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricingPolicy
  });
  const reviewSvc = createReviewRequestService({
    env: ENV,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    amendmentRepository: amendmentRepo
  });
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
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
    deRepo
  };
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
    body: { confirm: true }
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
    body: { confirm: true }
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

console.log("\nquoteFlowPublicAcceptance.test.mjs: ok\n");
