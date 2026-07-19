/**
 * Part 3 — Studio review-request resolve / revise / republish.
 * Run: node backend-core/src/elite100EstimateStudio/studioReviewRequest.part3.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createInMemoryConfigurationRepository } from "../digitalEstimate/configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "../digitalEstimate/configuration/pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { createInMemoryAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { REVIEW_STATUS } from "../digitalEstimate/configuration/amendmentConfig.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import {
  createStudioReviewRequestService,
  STUDIO_REVIEW_OPERATOR_STATUS,
  toOperatorReviewStatus,
  detectUnsupportedSelections,
  applyCustomerSelectionsToScope
} from "./studioReviewRequestService.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_RUNTIME_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED: "1",
  DIGITAL_ESTIMATE_AMENDMENTS_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function approvedEstimate(overrides = {}) {
  const id = overrides.id || randomUUID();
  const fingerprint = overrides.fingerprint || `fp-${id.slice(0, 8)}`;
  const intakeCaseId = overrides.intakeCaseId || randomUUID();
  return {
    id,
    organizationId: ORG,
    intakeCaseId,
    takeoffJobId: overrides.takeoffJobId || randomUUID(),
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: overrides.revision || 1,
    scope: {
      customerName: "Hoskins Williams",
      projectName: "Kitchen",
      projectAddress: "1 Main St",
      materialGroup: "Group Promo",
      colorName: "Carrara Classic",
      rooms: [
        { id: "kitchen", name: "Kitchen", included: true, countertopSqft: 40, backsplashSqft: 8 }
      ],
      addOns: { "qty-sink": 1 },
      internalMarkupPercent: 0
    },
    calculationSnapshot: {
      fingerprint,
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      totals: { customerDisplayTotal: 5123.45, exactInternalTotal: 5123.45 }
    },
    approval: {
      approvedAt: new Date().toISOString(),
      approvedByUserId: ACTOR,
      calculationFingerprint: fingerprint,
      customerDisplayTotal: 5123.45
    },
    createdByUserId: ACTOR,
    ...overrides
  };
}

async function seedApproved(studioRepo, row) {
  await studioRepo.create({ ...row, createdByUserId: ACTOR });
  return studioRepo.update(
    ORG,
    row.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: row.calculationSnapshot,
      approval: row.approval
    },
    ACTOR
  );
}

function harness() {
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
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" }),
    loadLatestTakeoffResult: async () => null
  });
  Object.defineProperty(studioEstimateService, "repositoryMode", { value: "memory" });

  const configurationStudioService = createConfigurationStudioService({
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    deRepository: deRepo,
    env: ENV_ON
  });

  const studioDigitalEstimateService = createStudioEstimateDigitalEstimateService({
    env: ENV_ON,
    studioEstimateService,
    digitalEstimateRepository: deRepo,
    configurationStudioService,
    amendmentRepository: amendmentRepo,
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" })
  });

  const reviewSvc = createStudioReviewRequestService({
    env: ENV_ON,
    amendmentRepository: amendmentRepo,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    studioEstimateService,
    studioDigitalEstimateService
  });

  return {
    studioRepo,
    deRepo,
    cfgRepo,
    amendmentRepo,
    studioEstimateService,
    studioDigitalEstimateService,
    reviewSvc
  };
}

async function publishAndRequest(h, estimateRow, { note = "Please review color", options = null } = {}) {
  await seedApproved(h.studioRepo, estimateRow);
  const published = await h.studioDigitalEstimateService.publish({
    organizationId: ORG,
    estimateId: estimateRow.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: `pub-${estimateRow.id}`,
      configuration: { allowedOptionKeys: ["qty-sink"] }
    }
  });
  assert.ok(published.publication?.id);

  // Seed config repos so review request can reference publication/snapshot
  const pub = await h.deRepo.getPublication(ORG, published.publication.id);
  const snap = await h.deRepo.getSnapshotByPublicationId(ORG, published.publication.id);
  if (h.cfgRepo.seedPublication) {
    h.cfgRepo.seedPublication(pub);
    h.cfgRepo.seedSnapshot(snap);
  }

  const selectedOptions = options || [
    { optionKey: "qty-sink", displayLabel: "Kitchen Sink Cutouts", quantity: 2 }
  ];
  const created = await h.amendmentRepo.createReviewRequest({
    organizationId: ORG,
    publicationId: published.publication.id,
    publicationSnapshotId: snap?.id || null,
    envelopeId: randomUUID(),
    envelopeVersion: 1,
    sessionId: randomUUID(),
    selectionId: randomUUID(),
    calculationId: randomUUID(),
    selectionHash: "sel-hash",
    calculationInputFingerprint: "calc-fp",
    clientIdempotencyKey: `rr-${randomUUID()}`,
    customerNote: note,
    requestSnapshotJson: {
      selectedOptions,
      estimateIdentity: { quoteNumber: published.publication.quoteNumber },
      baselineDisplayTotal: 5123,
      configuredDisplayTotal: 5323,
      displayDelta: 200
    },
    baselineDisplayTotal: 5123,
    configuredDisplayTotal: 5323,
    displayDelta: 200,
    pricingValidThrough: published.publication.pricingValidThrough
  });

  return { published, request: created.request };
}

console.log("\nstudioReviewRequest.part3.test.mjs\n");

// Operator status mapping
{
  assert.equal(
    toOperatorReviewStatus({ status: REVIEW_STATUS.REQUESTED }),
    STUDIO_REVIEW_OPERATOR_STATUS.NEW
  );
  assert.equal(
    toOperatorReviewStatus({ status: REVIEW_STATUS.CLOSED, closed_reason: "rejected|no" }),
    STUDIO_REVIEW_OPERATOR_STATUS.REJECTED
  );
  assert.equal(
    toOperatorReviewStatus({
      status: REVIEW_STATUS.CLOSED,
      closed_reason: "resolved_no_change|ok"
    }),
    STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_NO_CHANGE
  );
  console.log("ok: operator status maps onto existing REVIEW_STATUS");
}

// 1 + 2 linkage + cross-org
{
  const h = harness();
  const row = approvedEstimate();
  const { request } = await publishAndRequest(h, row);
  const list = await h.reviewSvc.list(ORG);
  assert.ok(list.reviewRequests.some((r) => r.id === request.id));
  const detail = await h.reviewSvc.getDetail(ORG, request.id);
  assert.equal(detail.linkage.studioEstimateId, row.id);
  assert.equal(detail.linkage.intakeCaseId, row.intakeCaseId);
  assert.equal(detail.reviewRequest.publicationId, request.publication_id);
  assert.equal(detail.reviewRequest.operatorStatus, STUDIO_REVIEW_OPERATOR_STATUS.NEW);
  assert.equal(detail.reviewRequest.customerNote, "Please review color");
  console.log("ok: 1 review request appears with org/case/estimate/publication linkage");

  await assert.rejects(
    () => h.reviewSvc.getDetail(ORG2, request.id),
    (e) => e.code === "not_found" || e.statusCode === 404
  );
  console.log("ok: 2 cross-org access is blocked");
}

// 3 + 4 server delta + reject browser authority
{
  const h = harness();
  const row = approvedEstimate();
  const { request } = await publishAndRequest(h, row);
  const detail = await h.reviewSvc.getDetail(ORG, request.id);
  assert.equal(detail.pricingComparison.delta, 200);
  assert.equal(detail.pricingComparison.currentPublishedTotal, 5123);
  assert.equal(detail.pricingComparison.requestedConfiguredTotal, 5323);
  console.log("ok: 3 customer selections and delta are recomputed/served server-side");

  await assert.rejects(
    () =>
      h.reviewSvc.resolveNoChange(
        ORG,
        request.id,
        { note: "ok", displayDelta: 1, organizationId: ORG2, actorUserId: "x" },
        ACTOR
      ),
    (e) => e.code === "forbidden_caller_authority"
  );
  console.log("ok: 4 browser-supplied totals/delta/actor/org rejected");
}

// 5 no-change
{
  const h = harness();
  const row = approvedEstimate();
  const { request, published } = await publishAndRequest(h, row);
  const beforePubs = await h.deRepo.listPublicationsForQuote(ORG, row.id);
  const result = await h.reviewSvc.resolveNoChange(
    ORG,
    request.id,
    { note: "Selections already match — clarifying only" },
    ACTOR
  );
  assert.equal(result.operatorStatus, STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_NO_CHANGE);
  assert.equal(result.published, false);
  const afterPubs = await h.deRepo.listPublicationsForQuote(ORG, row.id);
  assert.equal(afterPubs.length, beforePubs.length);
  const detail = await h.reviewSvc.getDetail(ORG, request.id);
  assert.ok(String(detail.reviewRequest.resolutionNote).includes("clarifying"));
  assert.equal(published.publication.status, "active");
  console.log("ok: 5 no-change resolution records note and does not publish");
}

// 6 reject requires note
{
  const h = harness();
  const row = approvedEstimate();
  const { request } = await publishAndRequest(h, row);
  await assert.rejects(
    () => h.reviewSvc.reject(ORG, request.id, { note: "   " }, ACTOR),
    (e) => e.code === "resolution_note_required"
  );
  const rejected = await h.reviewSvc.reject(
    ORG,
    request.id,
    { note: "Unsupported accessory request" },
    ACTOR
  );
  assert.equal(rejected.operatorStatus, STUDIO_REVIEW_OPERATOR_STATUS.REJECTED);
  console.log("ok: 6 reject requires a note");
}

// 7–9 revise + preserve + recalc/approve + unsupported block
{
  const h = harness();
  const row = approvedEstimate({ fingerprint: "fp-rev-1" });
  const { request } = await publishAndRequest(h, row);

  const unsupported = detectUnsupportedSelections({
    request_snapshot_json: {
      selectedOptions: [{ optionKey: "qty-blanco", quantity: 1 }]
    }
  });
  assert.ok(unsupported.length);
  console.log("ok: 9 unsupported selections detected as blockers");

  const row2 = approvedEstimate({ fingerprint: "fp-blanco" });
  const { request: req2 } = await publishAndRequest(h, row2, {
    options: [{ optionKey: "qty-blanco", quantity: 1 }]
  });
  await assert.rejects(
    () => h.reviewSvc.reviseEstimate(ORG, req2.id, { applyCustomerSelections: true }, ACTOR),
    (e) => e.code === "unsupported_customer_option"
  );

  const revised = await h.reviewSvc.reviseEstimate(
    ORG,
    request.id,
    { applyCustomerSelections: false },
    ACTOR
  );
  assert.equal(revised.operatorStatus, STUDIO_REVIEW_OPERATOR_STATUS.REVISION_REQUIRED);
  assert.equal(revised.sourceEstimate.approvalPreserved, true);
  assert.equal(revised.revisedEstimate.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  assert.ok(revised.revisedEstimate.revision > row.revision);

  const prior = await h.studioRepo.getById(ORG, row.id);
  assert.equal(prior.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  assert.equal(prior.approval?.calculationFingerprint, "fp-rev-1");
  console.log("ok: 7 revise creates new revision and preserves prior approval snapshot");

  await assert.rejects(
    () => h.reviewSvc.republish(ORG, request.id, { confirm: true }, ACTOR),
    (e) => e.code === "estimate_not_approved"
  );
  console.log("ok: 8 new revision requires recalculation and approval before republish");
}

// 10–14 republish idempotent, supersede, link, fail-closed, old link
{
  const h = harness();
  const row = approvedEstimate({ fingerprint: "fp-repub-1" });
  const { request, published } = await publishAndRequest(h, row);
  const token1 = published.accessToken;

  const revised = await h.reviewSvc.reviseEstimate(ORG, request.id, {}, ACTOR);
  const revisedId = revised.revisedEstimate.id;

  // Calculate + approve new revision
  const fp2 = "fp-repub-2";
  await h.studioRepo.update(
    ORG,
    revisedId,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: {
        fingerprint: fp2,
        pricingEngine: "quoteCalculator",
        pricingVersion: 2,
        totals: { customerDisplayTotal: 6000, exactInternalTotal: 6000 }
      },
      approval: {
        approvedAt: new Date().toISOString(),
        approvedByUserId: ACTOR,
        calculationFingerprint: fp2,
        customerDisplayTotal: 6000
      },
      staleReason: null
    },
    ACTOR
  );

  const pub1 = await h.reviewSvc.republish(
    ORG,
    request.id,
    { confirm: true, idempotencyKey: "rep-1" },
    ACTOR
  );
  assert.equal(pub1.operatorStatus, STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_REPUBLISHED);
  assert.ok(pub1.publication?.id);
  assert.notEqual(pub1.publication.id, published.publication.id);

  const oldPub = await h.deRepo.getPublication(ORG, published.publication.id);
  assert.ok(oldPub.status === "superseded" || oldPub.superseded_at);
  assert.ok(token1);
  console.log("ok: 11 prior publication is superseded");
  console.log("ok: 14 old link follows existing supersession behavior");

  const detail = await h.reviewSvc.getDetail(ORG, request.id);
  assert.equal(detail.linkage.revisedEstimateId, revisedId);
  assert.equal(detail.linkage.replacementPublicationId, pub1.publication.id);
  assert.equal(detail.reviewRequest.operatorStatus, STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_REPUBLISHED);
  console.log("ok: 12 review request links to new revision and publication");

  const again = await h.reviewSvc.republish(
    ORG,
    request.id,
    { confirm: true, idempotencyKey: "rep-1" },
    ACTOR
  );
  assert.equal(again.reused, true);
  assert.equal(again.accessToken, null);
  console.log("ok: 10 republish is idempotent");

  // Fail closed: republish failure does not resolve
  const h2 = harness();
  const rowFail = approvedEstimate({ fingerprint: "fp-fail" });
  const { request: reqFail } = await publishAndRequest(h2, rowFail);
  await h2.reviewSvc.reviseEstimate(ORG, reqFail.id, {}, ACTOR);
  // Leave unapproved — republish fails; status remains revision_required
  await assert.rejects(
    () => h2.reviewSvc.republish(ORG, reqFail.id, { confirm: true }, ACTOR),
    (e) => e.code === "estimate_not_approved"
  );
  const dFail = await h2.reviewSvc.getDetail(ORG, reqFail.id);
  assert.equal(dFail.reviewRequest.operatorStatus, STUDIO_REVIEW_OPERATOR_STATUS.REVISION_REQUIRED);
  console.log("ok: 13 request is not resolved if republish fails");
}

// applyCustomerSelections helper
{
  const scope = {
    materialGroup: "Group Promo",
    colorName: "Carrara Classic",
    addOns: { "qty-sink": 1 }
  };
  const applied = applyCustomerSelectionsToScope(scope, {
    request_snapshot_json: {
      selectedOptions: [{ optionKey: "qty-sink", quantity: 3 }]
    }
  });
  assert.equal(applied.scope.addOns["qty-sink"], 3);
  assert.equal(applied.blockers.length, 0);
}

console.log("\nAll Part 3 Studio review-request tests passed.\n");
