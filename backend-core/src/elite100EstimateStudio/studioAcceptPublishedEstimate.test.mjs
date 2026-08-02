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
  // 4. Selection-only changes without a server configured total cannot accept
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
    (e) => e?.code === "acceptance_blocked_configured_total_unavailable"
  );
  console.log("ok: 4 selection-only without server total blocks accept");
}

{
  // 4b. Selection-only with authoritative server total accepts as configured
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const acceptSvc = createStudioFinalAcceptanceService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    env: TEST_ENV
  });
  const estimate = await seedApprovedEstimate(studioRepo, { total: 12500 });
  const selectionId = randomUUID();
  const result = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: { id: PUB_ID, status: "active", revision_number: 1 },
    estimate,
    selection: { id: selectionId },
    configuration: {
      selectedMaterial: { colorName: "Aurataj", materialGroup: "C", roomId: "kitchen" },
      selectedEdgeProfile: { profileToken: "edge_small_ogee", profileName: "Small Ogee" }
    },
    customerCalc: {
      pricingAuthority: "authoritative_backend_reprice",
      publishedBaselineTotal: 12500,
      baselineDisplayTotal: 12500,
      configuredDisplayTotal: 14000,
      pricedSelectionTotal: 14000,
      displayTotalDelta: 1500
    },
    confirm: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.acceptance.acceptedAsConfigured, true);
  assert.equal(result.acceptance.acceptedAsPublished, false);
  assert.equal(result.acceptance.customerDisplayTotal, 14000);
  assert.equal(result.acceptance.acceptedSelectionId, selectionId);
  assert.equal(result.sideEffects.revisionCreated, false);
  assert.equal(result.sideEffects.markedSold, false);

  const reused = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: { id: PUB_ID, status: "active", revision_number: 1 },
    estimate,
    configuration: {
      selectedMaterial: { colorName: "Aurataj", materialGroup: "C", roomId: "kitchen" }
    },
    customerCalc: {
      pricingAuthority: "authoritative_backend_reprice",
      pricedSelectionTotal: 99999,
      configuredDisplayTotal: 99999
    },
    confirm: true
  });
  assert.equal(reused.reused, true);
  assert.equal(reused.acceptance.customerDisplayTotal, 14000);
  console.log("ok: 4b selection-only accepts configured total; duplicate is idempotent");
}

{
  // 4b2. Regression: stale pricedSelectionTotal=published must not beat
  // totals.configuredDisplayTotal (public "Your estimate") for configured accept.
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const acceptSvc = createStudioFinalAcceptanceService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    env: TEST_ENV
  });
  const estimate = await seedApprovedEstimate(studioRepo, { total: 4130 });
  const result = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: { id: PUB_ID, status: "active", revision_number: 1 },
    estimate,
    selection: { id: randomUUID() },
    configuration: {
      selectedMaterial: { colorName: "Aurataj", materialGroup: "C", roomId: "kitchen" },
      selectedEdgeProfile: { profileToken: "edge_small_ogee", profileName: "Small Ogee" }
    },
    customerCalc: {
      pricingAuthority: "authoritative_backend_reprice",
      publishedBaselineTotal: 4130,
      baselineDisplayTotal: 4130,
      // Stale top-level priced field aligned to published baseline…
      pricedSelectionTotal: 4130,
      configuredDisplayTotal: 4130,
      // …while public UI "Your estimate" reads nested configured total.
      totals: {
        baselineDisplayTotal: 4130,
        configuredDisplayTotal: 4524,
        displayDelta: 394
      },
      roomPricing: { projectTotal: 4524 },
      displayTotalDelta: 394
    },
    confirm: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.acceptance.acceptedAsConfigured, true);
  assert.equal(
    result.acceptance.customerDisplayTotal,
    4524,
    "acceptedAsConfigured must persist configured total, not published"
  );
  assert.equal(result.acceptance.totals?.acceptedConfiguredTotal, 4524);
  assert.notEqual(result.acceptance.customerDisplayTotal, 4130);
  console.log("ok: 4b2 acceptedAsConfigured displays configured total, not published");
}

{
  // 4c. Fail-closed / frozen configured total cannot be accepted
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
          selectedMaterial: { colorName: "Aurataj", roomId: "kitchen" }
        },
        customerCalc: {
          pricingAuthority: "published_baseline_frozen",
          pricedSelectionTotal: 14000,
          configuredDisplayTotal: 14000
        },
        confirm: true
      }),
    (e) => e?.code === "acceptance_blocked_configured_total_unavailable"
  );
  console.log("ok: 4c fail-closed configured total blocks accept");
}

{
  // 5. Unclassified open review request still blocks accept-as-published
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
  console.log("ok: 5 unclassified review_requested blocks accept of original");
}

{
  // 5b. Selection-only open review can be accepted; review is closed
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const amendmentRepo = createInMemoryAmendmentRepository({});
  const created = await amendmentRepo.createReviewRequest({
    organizationId: ORG,
    publicationId: PUB_ID,
    publicationSnapshotId: null,
    envelopeId: randomUUID(),
    envelopeVersion: 1,
    sessionId: randomUUID(),
    selectionId: randomUUID(),
    calculationId: randomUUID(),
    selectionHash: "sel-only",
    calculationInputFingerprint: "fp",
    clientIdempotencyKey: "rr-selection-only",
    customerNote: null,
    requestSnapshotJson: {
      version: 1,
      reviewClassification: {
        hasSelectionOnlyChanges: true,
        hasPhysicalScopeRequests: false,
        requiresEliteReview: false,
        reviewKind: "selection_only",
        selectionSummary: [{ kind: "material", label: "Aurataj" }],
        scopeRequestSummary: []
      },
      selectedOptions: [
        { optionKey: "material:kitchen:aurataj", quantity: 1 }
      ]
    },
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
  const estimate = await seedApprovedEstimate(studioRepo, { total: 12500 });
  const result = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: { id: PUB_ID, status: "active", revision_number: 1 },
    estimate,
    configuration: {
      selectedMaterial: { colorName: "Aurataj", roomId: "kitchen" }
    },
    customerCalc: {
      pricingAuthority: "authoritative_backend_reprice",
      pricedSelectionTotal: 14000,
      configuredDisplayTotal: 14000,
      publishedBaselineTotal: 12500
    },
    confirm: true
  });
  assert.equal(result.acceptance.acceptedAsConfigured, true);
  assert.equal(result.acceptance.customerDisplayTotal, 14000);
  const rows = await amendmentRepo.listReviewRequests(ORG, { limit: 5 });
  const closed = rows.find((r) => r.id === created.request.id);
  assert.equal(closed.status, REVIEW_STATUS.CLOSED);
  console.log("ok: 5b selection-only review accepts configured and closes request");
}

{
  // 5c. Physical-scope open review blocks and is not closed
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const amendmentRepo = createInMemoryAmendmentRepository({});
  const created = await amendmentRepo.createReviewRequest({
    organizationId: ORG,
    publicationId: PUB_ID,
    publicationSnapshotId: null,
    envelopeId: randomUUID(),
    envelopeVersion: 1,
    sessionId: randomUUID(),
    selectionId: randomUUID(),
    calculationId: randomUUID(),
    selectionHash: "sel-scope",
    calculationInputFingerprint: "fp",
    clientIdempotencyKey: "rr-scope",
    customerNote: null,
    requestSnapshotJson: {
      version: 1,
      reviewClassification: {
        hasSelectionOnlyChanges: true,
        hasPhysicalScopeRequests: true,
        requiresEliteReview: true,
        reviewKind: "physical_scope",
        selectionSummary: [],
        scopeRequestSummary: [{ kind: "opening", label: "cooktop ×1" }]
      },
      projectNote: "Add waterfall"
    },
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
        configuration: {
          selectedMaterial: { colorName: "Aurataj", roomId: "kitchen" },
          requestedOpenings: [{ type: "cooktop", quantity: 1 }]
        },
        customerCalc: {
          pricingAuthority: "authoritative_backend_reprice",
          pricedSelectionTotal: 14000,
          configuredDisplayTotal: 14000
        },
        confirm: true
      }),
    (e) => e?.code === "acceptance_blocked_scope_review"
  );
  const rows = await amendmentRepo.listReviewRequests(ORG, { limit: 5 });
  assert.equal(rows.find((r) => r.id === created.request.id).status, REVIEW_STATUS.REQUESTED);
  console.log("ok: 5c physical-scope review blocks accept and stays open");
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
    (e) => e?.code === "acceptance_blocked_scope_review"
  );
  console.log("ok: 6 physical scope requests block accept");
}

{
  // 6b. Client-supplied totals are rejected
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const acceptSvc = createStudioFinalAcceptanceService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    env: TEST_ENV
  });
  assert.throws(
    () =>
      acceptSvc.rejectFinalAcceptanceAuthority({
        confirm: true,
        configuredDisplayTotal: 1,
        customerDisplayTotal: 2
      }),
    (e) => e?.code === "forbidden_caller_authority"
  );
  console.log("ok: 6b client-supplied acceptance totals rejected");
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
  assert.ok(view.includes("Accept estimate with these selections"));
  assert.ok(view.includes("canAcceptAsConfigured"));
  assert.ok(view.includes("acceptedDisplayTotal"));
  assert.ok(view.includes("de-accepted-total"));
  assert.ok(view.includes("Estimate accepted") || view.includes("de-accepted-title"));
  assert.ok(view.includes("canAcceptPublishedEstimate"));
  assert.ok(view.includes("de-final-acceptance-modal"));
  assert.ok(view.includes("Elite has received your acceptance"));
  assert.ok(view.includes("Elite review is required"));
  assert.ok(
    view.includes(
      "A newer estimate is available. Please use the latest estimate link from Elite."
    )
  );
  const acceptFn = view.slice(
    view.indexOf("async function onAcceptFinal"),
    view.indexOf("function applyPlumbingSource")
  );
  assert.equal(
    acceptFn.includes("onFatal("),
    false,
    "accept action must not wipe page on publication_superseded"
  );
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
  assert.ok(panelSrc.includes("studio-v2-accepted-mode"));
  assert.ok(panelSrc.includes("acceptedAsConfigured"));
  assert.ok(panelSrc.includes("Accepted total"));

  const publicSvc = readFileSync(
    join(__dirname, "../digitalEstimate/configuration/publicConfigurationService.mjs"),
    "utf8"
  );
  assert.ok(publicSvc.includes("canAcceptAsConfigured"));
  assert.ok(publicSvc.includes("resolveServerConfiguredAcceptanceTotal"));

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
  assert.ok(svc.includes("acceptedAsConfigured"));
  assert.ok(svc.includes("resolveServerConfiguredAcceptanceTotal"));
  assert.ok(svc.includes("acceptance_blocked_configured_total_unavailable"));
  console.log("ok: 8 frontend + Studio + no side-effect contracts");
}

console.log("\nAll accept-published-estimate tests passed.\n");
