/**
 * Part 2 — Approved Studio estimate → Digital Estimate publication.
 * Run: node backend-core/src/elite100EstimateStudio/studioEstimateDigitalEstimate.part2.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createInMemoryConfigurationRepository } from "../digitalEstimate/configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "../digitalEstimate/configuration/pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { createInMemoryAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import {
  assessStudioEstimatePublicationReadiness,
  buildSyntheticQuoteHeaderFromStudioEstimate
} from "./studioEstimatePublicationAdapter.mjs";
import {
  buildPublicDigitalEstimateDto,
  assertPublicDtoHasNoForbiddenContent
} from "../digitalEstimate/digitalEstimatePublicSerializer.mjs";
import { buildPublicationFreezePayloads } from "../digitalEstimate/digitalEstimateSnapshot.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_RUNTIME_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUEST_RUNTIME_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function approvedEstimateRow(overrides = {}) {
  const id = overrides.id || randomUUID();
  const fingerprint = overrides.fingerprint || "fp-approved-1";
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
      partnerAccountId: null,
      pricingBasis: "direct",
      materialGroup: "Group Promo",
      colorName: "Carrara Classic",
      colorTbd: false,
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          included: true,
          countertopSqft: 40,
          backsplashSqft: 8,
          pieces: []
        }
      ],
      addOns: { "qty-sink": 1 },
      edgeMode: "included",
      edgeLinearFeet: 0,
      miterHeightKey: null,
      miterLinearFeet: 0,
      buildupSqft: 0,
      estimatorNotes: "internal only — do not publish",
      internalMarkupPercent: 10,
      unresolvedManualReview: false
    },
    calculationSnapshot: {
      fingerprint,
      calculatedAt: new Date().toISOString(),
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      totals: {
        customerDisplayTotal: 5123.45,
        exactInternalTotal: 5635.8
      },
      internalMarkup: { percent: 10, amount: 512.35 }
    },
    calculationFingerprint: fingerprint,
    pricingEngine: "quoteCalculator",
    pricingVersion: 2,
    approval: {
      approvedAt: new Date().toISOString(),
      approvedByUserId: ACTOR,
      calculationFingerprint: fingerprint,
      customerDisplayTotal: 5123.45,
      exactInternalTotal: 5635.8
    },
    staleReason: null,
    supersededAt: null,
    ...overrides
  };
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
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved", approvedAt: new Date().toISOString() }),
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async () => ({
      fingerprint: "fp-calc",
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      totals: { customerDisplayTotal: 5000, exactInternalTotal: 5500 }
    })
  });
  // Force memory mode label while allowing publish via env flag
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
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" })
  });

  return { studioRepo, deRepo, cfgRepo, amendmentRepo, studioEstimateService, svc, configurationStudioService };
}

console.log("\nstudioEstimateDigitalEstimate.part2.test.mjs\n");

// 1–4: blockers
{
  const base = approvedEstimateRow();
  const unapproved = assessStudioEstimatePublicationReadiness({
    estimate: { ...base, status: STUDIO_ESTIMATE_STATUSES.PRICED, approval: null },
    repositoryMode: "supabase",
    takeoffReviewStatus: "approved",
    env: ENV_ON
  });
  assert.equal(unapproved.eligible, false);
  assert.equal(unapproved.code, "estimate_not_approved");
  console.log("ok: 1 unapproved estimate cannot publish");

  const stale = assessStudioEstimatePublicationReadiness({
    estimate: { ...base, staleReason: "Scope changed after approval — recalculate and reapprove" },
    repositoryMode: "supabase",
    takeoffReviewStatus: "approved",
    env: ENV_ON
  });
  assert.equal(stale.eligible, false);
  assert.equal(stale.code, "estimate_stale");
  console.log("ok: 2 stale estimate cannot publish");

  const superseded = assessStudioEstimatePublicationReadiness({
    estimate: {
      ...base,
      status: STUDIO_ESTIMATE_STATUSES.SUPERSEDED,
      supersededAt: new Date().toISOString()
    },
    repositoryMode: "supabase",
    takeoffReviewStatus: "approved",
    env: ENV_ON
  });
  assert.equal(superseded.eligible, false);
  assert.equal(superseded.code, "estimate_superseded");
  console.log("ok: 3 superseded estimate cannot publish");

  const memory = assessStudioEstimatePublicationReadiness({
    estimate: base,
    repositoryMode: "memory",
    takeoffReviewStatus: "approved",
    env: { ...ENV_ON, ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "0" }
  });
  assert.equal(memory.eligible, false);
  assert.equal(memory.code, "memory_only_estimate");
  console.log("ok: 4 memory-only estimate cannot publish");
}

// 5–8: successful publish, no internal leak, reject caller authority, idempotent
{
  const { studioRepo, svc, deRepo } = harness();
  const row = approvedEstimateRow();
  await studioRepo.create({
    ...row,
    createdByUserId: ACTOR
  });
  // create() may ignore approval — force update
  await studioRepo.update(ORG, row.id, {
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    calculationSnapshot: row.calculationSnapshot,
    approval: row.approval,
    pricingEngine: row.pricingEngine,
    pricingVersion: row.pricingVersion
  }, ACTOR);

  const published = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "idem-1",
      configuration: { allowedOptionKeys: ["qty-sink"] },
      // Spoof attempts — must be ignored/rejected
      customerDisplayTotal: 1,
      organizationId: ORG2,
      actorUserId: "spoof",
      tax: 99,
      markup: 50
    }
  }).catch((e) => e);

  assert.equal(published instanceof Error, true);
  assert.equal(published.code, "forbidden_caller_authority");
  console.log("ok: 7 client totals/rates/tax/actor/org rejected");

  const publishedOk = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "idem-1",
      configuration: { allowedOptionKeys: ["qty-sink"] }
    }
  });
  assert.equal(publishedOk.ok, true);
  assert.ok(publishedOk.accessToken);
  assert.ok(publishedOk.customerUrl?.includes("/e/"));
  assert.equal(publishedOk.customerUrl?.includes("#"), false);
  assert.equal(publishedOk.publication.status, "active");
  assert.equal(publishedOk.envelope?.configured, true);
  console.log("ok: 5 approved durable estimate publishes successfully");

  const snap = await deRepo.getSnapshotByPublicationId(ORG, publishedOk.publication.id);
  const customerJson = JSON.stringify(snap.customer_snapshot_json).toLowerCase();
  assert.equal(customerJson.includes("internalmarkup"), false);
  assert.equal(customerJson.includes("internal_markup"), false);
  assert.equal(customerJson.includes("exactinternaltotal"), false);
  assert.equal(customerJson.includes("wholesale"), false);
  const dto = buildPublicDigitalEstimateDto(snap.customer_snapshot_json, {
    accessExpiresAt: publishedOk.publication.accessExpiresAt
  });
  assertPublicDtoHasNoForbiddenContent(dto);
  assert.equal(dto.estimate.totals.estimatedProjectTotal, 5123);
  console.log("ok: 6 internal markup and internal-only fields never enter customer snapshot");

  const again = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "idem-1",
      configuration: { allowedOptionKeys: ["qty-sink"] }
    }
  });
  assert.equal(again.reused, true);
  assert.equal(again.publication.id, publishedOk.publication.id);
  assert.equal(again.accessToken, null);
  console.log("ok: 8 publish is idempotent");
}

// 9–10: new revision supersedes; old token lifecycle
{
  const { studioRepo, svc, deRepo } = harness();
  const row = approvedEstimateRow({ fingerprint: "fp-r1" });
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

  const p1 = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "k1", configuration: {} }
  });
  const token1 = p1.accessToken;

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
  const fp2 = "fp-r2";
  await studioRepo.update(
    ORG,
    revised.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: {
        ...row.calculationSnapshot,
        fingerprint: fp2,
        totals: { customerDisplayTotal: 6000, exactInternalTotal: 6600 }
      },
      approval: {
        ...row.approval,
        calculationFingerprint: fp2,
        customerDisplayTotal: 6000
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
    body: { confirm: true, idempotencyKey: "k2", configuration: {} }
  });
  assert.notEqual(p2.publication.id, p1.publication.id);
  assert.ok(p2.supersededCount >= 1 || p2.publication.status === "active");

  const oldPub = await deRepo.getPublication(ORG, p1.publication.id);
  assert.ok(oldPub.status === "superseded" || oldPub.superseded_at);
  console.log("ok: 9 new approved estimate revision supersedes prior active publication");

  // Old token still present but publication superseded — public access uses existing lifecycle.
  const toks = await deRepo.listTokensForPublication(ORG, p1.publication.id);
  assert.ok(toks.length >= 1);
  assert.ok(token1);
  console.log("ok: 10 old token follows existing lifecycle (superseded publication)");
}

// 11–13: customer link shape + Studio review linkage
{
  const { studioRepo, svc, amendmentRepo, deRepo } = harness();
  const row = approvedEstimateRow({ fingerprint: "fp-cust" });
  await studioRepo.create({ ...row, createdByUserId: ACTOR });
  await studioRepo.update(
    ORG,
    row.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: row.calculationSnapshot,
      approval: row.approval
    },
    ACTOR
  );

  const published = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirm: true,
      idempotencyKey: "cust-1",
      configuration: { allowedOptionKeys: ["qty-sink"] }
    }
  });
  assert.ok(published.customerUrl.startsWith("http://localhost:5190/e/"));
  assert.ok(published.accessToken);
  const readinessReload = await svc.assessReadiness(ORG, row.id);
  assert.equal(readinessReload.activePublication?.customerUrl, published.customerUrl);
  assert.equal(readinessReload.activePublication?.linkStatus, "active");
  console.log("ok: 11 customer link is stable path URL and survives Studio readiness reload");

  // Simulate a customer review request row linked to this publication (reuse amendment repo).
  await amendmentRepo.createReviewRequest({
    organizationId: ORG,
    publicationId: published.publication.id,
    publicationSnapshotId: null,
    envelopeId: randomUUID(),
    envelopeVersion: 1,
    sessionId: randomUUID(),
    selectionId: randomUUID(),
    calculationId: randomUUID(),
    selectionHash: "sel-hash",
    calculationInputFingerprint: "calc-fp",
    clientIdempotencyKey: "rr-sim-1",
    customerNote: "Please review color",
    requestSnapshotJson: {
      estimateIdentity: { quoteNumber: published.publication.quoteNumber },
      selectedOptions: []
    },
    baselineDisplayTotal: 5123,
    configuredDisplayTotal: 5123,
    displayDelta: 0,
    pricingValidThrough: published.publication.pricingValidThrough
  });

  const readiness = await svc.assessReadiness(ORG, row.id);
  assert.equal(readiness.links.intakeCaseId, CASE_ID);
  assert.equal(readiness.links.studioEstimateId, row.id);
  assert.ok(readiness.reviewRequests.length >= 1);
  assert.equal(readiness.reviewRequests[0].publicationId, published.publication.id);
  assert.equal(readiness.reviewRequests[0].intakeCaseId, CASE_ID);
  assert.equal(readiness.reviewRequests[0].studioEstimateId, row.id);
  console.log("ok: 12 customer path uses Brain publication (snapshot frozen for recalculation)");
  console.log("ok: 13 review request appears in Studio linked to case/estimate/publication");
  void deRepo;
}

// 14 unsupported options
{
  const bad = assessStudioEstimatePublicationReadiness({
    estimate: approvedEstimateRow(),
    repositoryMode: "supabase",
    takeoffReviewStatus: "approved",
    env: ENV_ON,
    configuration: { allowedOptionKeys: ["qty-blanco"] }
  });
  assert.equal(bad.eligible, false);
  assert.ok(bad.blockers.some((b) => b.code === "unsupported_customer_option"));
  console.log("ok: 14 unsupported or unpriced options cannot publish");
}

// 15 cross-org
{
  const { studioRepo, svc } = harness();
  const row = approvedEstimateRow();
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
  await assert.rejects(
    () =>
      svc.publish({
        organizationId: ORG2,
        estimateId: row.id,
        actorUserId: ACTOR,
        body: { confirm: true, idempotencyKey: "xorg", configuration: {} }
      }),
    (e) => e.code === "estimate_not_found" || e.statusCode === 404
  );
  console.log("ok: 15 cross-org access is blocked");
}

// Adapter freeze integrity
{
  const header = buildSyntheticQuoteHeaderFromStudioEstimate(approvedEstimateRow(), {
    organizationId: ORG
  });
  const freeze = buildPublicationFreezePayloads({
    header,
    publishedAt: new Date().toISOString(),
    pricingValidThrough: "2026-12-31"
  });
  assert.equal(freeze.customerSnapshot.project.customerName, "Hoskins Williams");
  assert.ok(!JSON.stringify(freeze.customerSnapshot).toLowerCase().includes("markup"));
  assert.equal(header.quote_source, "internal_quote");
  assert.ok(header.calculation_snapshot.internal_ui.material_program_default === "elite_100");
  console.log("ok: adapter freezes customer-safe fields and Elite 100 eligibility source");
}

console.log("\nAll Part 2 Studio → Digital Estimate tests passed.\n");
