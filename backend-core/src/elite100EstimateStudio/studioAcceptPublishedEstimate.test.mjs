/**
 * Accept original published Digital Estimate (as-is) — safe closeout path.
 * Run: node backend-core/src/elite100EstimateStudio/studioAcceptPublishedEstimate.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createInMemoryStudioLifecycleRepository } from "./studioLifecycleRepository.mjs";
import { createStudioFinalAcceptanceService } from "./studioFinalAcceptanceService.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { createInMemoryAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { REVIEW_STATUS } from "../digitalEstimate/configuration/amendmentConfig.mjs";
import { buildPublicCustomerConfigurationReadModel } from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";
import { applyBaselineParityToCustomerCalculation } from "../digitalEstimate/configuration/baselineParityGuardrails.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PUB_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TEST_ENV = { DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0" };

console.log("\nstudioAcceptPublishedEstimate.test.mjs\n");

async function seedApprovedEstimate(repo, { total = 12500 } = {}) {
  return repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    scope: {
      ...emptyStudioEstimateScope(),
      customerName: "Acme",
      projectName: "Kitchen",
      estimateOrigin: "manual",
      physicalScopeSource: "manual",
      rooms: [{ id: "kitchen", name: "Kitchen", included: true, pieces: [] }]
    },
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    approval: {
      approvedAt: "2026-08-02T00:00:00.000Z",
      approvedByUserId: ACTOR,
      customerDisplayTotal: total,
      calculationFingerprint: "fp-accept"
    },
    calculationSnapshot: {
      fingerprint: "fp-accept",
      totals: { customerDisplayTotal: total, materialSubtotal: total }
    }
  });
}

{
  // 1–3. Accept unchanged published estimate
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const amendmentRepo = createInMemoryAmendmentRepository({});
  const acceptSvc = createStudioFinalAcceptanceService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    amendmentRepository: amendmentRepo,
    env: TEST_ENV
  });
  const estimate = await seedApprovedEstimate(studioRepo, { total: 12500 });
  const publication = {
    id: PUB_ID,
    status: "active",
    revision_number: 1,
    terms_version: "terms-v1"
  };
  const beforeScope = structuredClone(estimate.scope);
  const beforeCalc = structuredClone(estimate.calculationSnapshot);

  const result = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication,
    estimate,
    configuration: null,
    confirm: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.acceptance.status, "accepted");
  assert.equal(result.acceptance.acceptedAsPublished, true);
  assert.equal(result.acceptance.customerDisplayTotal, 12500);
  assert.equal(result.acceptance.publicationId, PUB_ID);
  assert.ok(result.acceptance.acceptedAt);
  assert.match(String(result.acceptance.statusLabel || ""), /Estimate accepted/i);
  assert.equal(result.sideEffects.markedSold, false);
  assert.equal(result.sideEffects.revisionCreated, false);
  assert.equal(result.sideEffects.autoApproved, false);
  assert.equal(result.sideEffects.autoPublished, false);
  assert.equal(result.sideEffects.autoCalculated, false);
  assert.equal(result.sideEffects.publicationChanged, false);

  const reloaded = await studioRepo.getById(ORG, estimate.id);
  assert.deepEqual(reloaded.scope, beforeScope);
  assert.deepEqual(reloaded.calculationSnapshot, beforeCalc);

  const v2 = createStudioV2Service({
    repository: studioRepo,
    env: {},
    lifecycleRepository: lifecycle,
    studioDigitalEstimateService: {
      async assessReadiness() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            publicationId: PUB_ID,
            reviewRequestOpen: false
          },
          activePublication: { id: PUB_ID, status: "active", revisionNumber: 1 },
          publications: [{ id: PUB_ID, status: "active", revisionNumber: 1 }],
          reviewRequests: []
        };
      }
    }
  });
  const activity = await v2.getCustomerActivity({
    organizationId: ORG,
    intakeCaseId: CASE_ID
  });
  assert.equal(activity.activity.accepted, true);
  assert.equal(activity.activity.reviewRequested, false);
  assert.equal(activity.acceptance.customerDisplayTotal, 12500);
  assert.equal(activity.acceptance.publicationId, PUB_ID);
  console.log("ok: 1–3 accept unchanged → accepted Yes; reviewRequested No; published total");
}

{
  // 4. Selection changes block accept
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const acceptSvc = createStudioFinalAcceptanceService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    env: TEST_ENV
  });
  const estimate = await seedApprovedEstimate(studioRepo);
  await assert.rejects(
    () =>
      acceptSvc.acceptResolvedContext({
        organizationId: ORG,
        publication: { id: PUB_ID, status: "active", revision_number: 1 },
        estimate,
        configuration: {
          selectedMaterial: { colorName: "Aurataj", materialGroup: "C", roomId: "kitchen" }
        },
        confirm: true
      }),
    (e) => e?.code === "acceptance_blocked_selection_changes"
  );
  console.log("ok: 4 changed selections block accept");
}

{
  // 5. Open review request blocks accept of stale original
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const amendmentRepo = createInMemoryAmendmentRepository({});
  await amendmentRepo.createReviewRequest({
    organizationId: ORG,
    publicationId: PUB_ID,
    publicationSnapshotId: null,
    envelopeId: randomUUID(),
    envelopeVersion: 1,
    sessionId: randomUUID(),
    selectionId: randomUUID(),
    calculationId: randomUUID(),
    selectionHash: "sel",
    calculationInputFingerprint: "fp",
    clientIdempotencyKey: "rr-1",
    customerNote: null,
    requestSnapshotJson: { version: 1 },
    baselineDisplayTotal: 12500,
    configuredDisplayTotal: 14000,
    displayDelta: 1500,
    pricingValidThrough: null
  });
  const acceptSvc = createStudioFinalAcceptanceService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    amendmentRepository: amendmentRepo,
    env: TEST_ENV
  });
  const estimate = await seedApprovedEstimate(studioRepo);
  await assert.rejects(
    () =>
      acceptSvc.acceptResolvedContext({
        organizationId: ORG,
        publication: { id: PUB_ID, status: "active", revision_number: 1 },
        estimate,
        configuration: null,
        confirm: true
      }),
    (e) => e?.code === "acceptance_blocked_review_requested"
  );
  const rows = await amendmentRepo.listReviewRequests(ORG, { limit: 5 });
  assert.equal(rows[0].status, REVIEW_STATUS.REQUESTED);
  console.log("ok: 5 review_requested blocks accept of original");
}

{
  // 6. Scope requests block accept
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const acceptSvc = createStudioFinalAcceptanceService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    env: TEST_ENV
  });
  const estimate = await seedApprovedEstimate(studioRepo);
  await assert.rejects(
    () =>
      acceptSvc.acceptResolvedContext({
        organizationId: ORG,
        publication: { id: PUB_ID, status: "active", revision_number: 1 },
        estimate,
        configuration: {
          requestedOpenings: [{ type: "kitchen_sink", quantity: 1 }]
        },
        confirm: true
      }),
    (e) =>
      e?.code === "acceptance_blocked_scope_review" ||
      e?.code === "acceptance_blocked_selection_changes"
  );
  console.log("ok: 6 physical scope requests block accept");
}

{
  // 7. Foundation / calc flags: unchanged allows; priced selection does not
  const empty = buildPublicCustomerConfigurationReadModel(null, {
    quantities: { "material:kitchen:e100-carrara": 1 }
  });
  assert.equal(empty.canSubmitForFinalReview, true, "baseline quantity enrichment is not a change");

  const changed = buildPublicCustomerConfigurationReadModel({
    selectedMaterial: { colorName: "Aurataj", roomId: "kitchen" }
  });
  assert.equal(changed.canSubmitForFinalReview, false);

  const baselineCalc = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 8230,
      configuredDisplayTotal: 8230,
      pricedSelectionTotal: 8230,
      displayTotalDelta: 0
    },
    { baselineDisplayTotal: 8230, scopeReviewRequired: false }
  );
  assert.equal(baselineCalc.canSubmitForFinalReview, true);

  const pricedCalc = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 8230,
      configuredDisplayTotal: 9120,
      pricedSelectionTotal: 9120,
      displayTotalDelta: 890
    },
    { baselineDisplayTotal: 8230, scopeReviewRequired: false }
  );
  assert.equal(pricedCalc.canSubmitForFinalReview, false);
  console.log("ok: 7 canSubmitForFinalReview flags for accept vs send-selections");
}

{
  // 8. Frontend / Studio contracts
  const view = readFileSync(
    join(__dirname, "../../../app-digital-estimate/src/ConfigurationView.tsx"),
    "utf8"
  );
  assert.ok(view.includes("Accept estimate"));
  assert.ok(view.includes("Estimate accepted") || view.includes("de-accepted-title"));
  assert.ok(view.includes("canAcceptPublishedEstimate"));
  assert.ok(view.includes("de-final-acceptance-modal"));
  assert.ok(view.includes("Elite has received your acceptance"));
  assert.equal(view.includes("Approve final estimate"), false);

  const panelSrc = readFileSync(
    join(
      __dirname,
      "../../../app-elite100-estimate-studio/src/estimateQueue/StudioV2CustomerSelectionReviewPanel.tsx"
    ),
    "utf8"
  );
  assert.ok(panelSrc.includes("studio-v2-accepted-flag"));
  assert.ok(panelSrc.includes("studio-v2-accepted-total"));
  assert.ok(panelSrc.includes("Accepted total"));

  const svc = readFileSync(join(__dirname, "studioFinalAcceptanceService.mjs"), "utf8");
  for (const forbidden of [
    "simplified-publish",
    "ensure-editable-draft",
    "refresh-from-takeoff",
    "markSold(true)",
    "autoApprove: true",
    "autoCalculate: true"
  ]) {
    assert.equal(svc.includes(forbidden), false, `must not ${forbidden}`);
  }
  console.log("ok: 8 frontend + Studio + no side-effect contracts");
}

console.log("\nAll accept-published-estimate tests passed.\n");
