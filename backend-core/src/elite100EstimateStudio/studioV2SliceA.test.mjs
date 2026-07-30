/**
 * Elite 100 Studio V2 Slice A — service + route contract tests.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceA.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";
import { MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";
import { isCurrentActivePublicationForEstimate, isHistoricalPublicationForEstimate } from "./studioPublicationSummary.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CASE_EMPTY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nstudioV2SliceA.test.mjs\n");

function baseScope(overrides = {}) {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Acme Homes",
    projectName: "Lakeview Kitchen",
    projectAddress: "100 Main St",
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        included: true,
        pieces: [
          {
            id: "run-1",
            name: "Main run",
            pieceType: "counter",
            included: true,
            lengthIn: 96,
            depthIn: 25.5,
            sqft: 17
          }
        ]
      }
    ],
    addOns: { "qty-sink": 1 },
    ...overrides
  };
}

const fakeCalc = {
  fingerprint: "v2-test-fp",
  calculatedAt: "2026-07-30T12:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: {
    exactTotal: 1234.56,
    customerDisplayTotal: 1240
  },
  reviewSummary: {
    materialSubtotal: 800,
    fabricationSubtotal: 400
  },
  warnings: [{ code: "edge_review", message: "Review finished edge" }],
  unresolvedItems: []
};

{
  // 1. GET working-draft returns safe empty state for no estimate.
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: null,
    lifecycleRepository: null
  });
  const empty = await v2.getWorkingDraft({ organizationId: ORG, intakeCaseId: CASE_EMPTY });
  assert.equal(empty.ok, true);
  assert.equal(empty.code, STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
  assert.equal(empty.empty, true);
  assert.equal(empty.scopeSummary.empty, true);
  assert.equal(empty.projectHeader.estimateId, null);
  console.log("ok: 1 GET working-draft safe empty for no estimate");
}

{
  // 2. GET working-draft returns project/scope summary for existing estimate.
  const repo = new InMemoryStudioEstimateRepository();
  const row = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: "takeoff-1",
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async getWorkspacePublicationSummary() {
        return {
          publicationSummary: {
            state: "not_published",
            active: false,
            historical: false,
            publicationId: null,
            estimateId: row.id,
            revision: 1,
            publishedAt: null,
            expiresAt: null,
            customerActivityState: "none",
            customerActivityLabel: "Not published",
            customerUrlAvailable: false,
            customerUrl: null,
            reviewRequestOpen: false,
            reviewRequestId: null,
            statusLabel: "Not published",
            linkStatus: null
          },
          publications: [],
          activePublication: null,
          reviewRequests: []
        };
      }
    },
    lifecycleRepository: null
  });
  const draft = await v2.getWorkingDraft({ organizationId: ORG, intakeCaseId: CASE_ID });
  assert.equal(draft.ok, true);
  assert.equal(draft.code, null);
  assert.equal(draft.projectHeader.projectName, "Lakeview Kitchen");
  assert.equal(draft.projectHeader.customerName, "Acme Homes");
  assert.equal(draft.projectHeader.originType, "ai_takeoff");
  assert.equal(draft.scopeSummary.roomCount, 1);
  assert.ok(draft.scopeSummary.pieceCount >= 1);
  assert.equal(draft.lastCalculation.available, true);
  assert.equal(draft.lastCalculation.total, 1240);
  console.log("ok: 2 GET working-draft project/scope for existing estimate");
}

{
  // 3 + 4. Calculate wrapper does not call ensure-editable-draft or refresh-from-takeoff;
  // returns existing v4 calculation result.
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: "takeoff-1",
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    revision: 1,
    scope: baseScope()
  });

  let ensureCalls = 0;
  let refreshCalls = 0;
  let calcCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => {
      calcCalls += 1;
      return { ...fakeCalc, totals: { ...fakeCalc.totals, customerDisplayTotal: 1310 } };
    },
    studioEstimateService: {
      repository: repo,
      safeEstimateView(row, extras = {}) {
        return { ...row, calculation: row.calculationSnapshot || null, ...extras };
      },
      async ensureEditableEstimateDraft() {
        ensureCalls += 1;
        throw new Error("ensureEditableEstimateDraft must not be called");
      },
      async refreshScopeFromTakeoff() {
        refreshCalls += 1;
        throw new Error("refreshScopeFromTakeoff must not be called");
      },
      async calculate() {
        throw new Error("V1 calculate must not be used by V2 wrapper");
      }
    },
    studioDigitalEstimateService: null,
    lifecycleRepository: null
  });

  const result = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR
  });
  assert.equal(result.ok, true);
  assert.equal(calcCalls, 1);
  assert.equal(ensureCalls, 0);
  assert.equal(refreshCalls, 0);
  assert.equal(result.sideEffects.ensureEditableDraft, false);
  assert.equal(result.sideEffects.refreshFromTakeoff, false);
  assert.equal(result.sideEffects.scopeMutated, false);
  assert.equal(result.calculation.total, 1310);
  assert.equal(result.calculation.pricingVersion, 4);
  assert.equal(result.persisted, true);

  const src = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  assert.ok(!src.includes("ensureEditableEstimateDraft("));
  assert.ok(!src.includes("refreshScopeFromTakeoff("));
  assert.ok(!src.includes("studioEstimateService.calculate("));
  assert.ok(src.includes("calculateImpl") || src.includes("calculateStudioEstimateV4"));
  console.log("ok: 3–4 calculate wrapper is side-effect free and returns v4 result");
}

{
  // 5 + 6. Publish refuses non-approved; never calls simplified-publish.
  const repo = new InMemoryStudioEstimateRepository();
  const draftRow = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope({ estimateOrigin: MANUAL_ESTIMATE_ORIGIN, physicalScopeSource: MANUAL_ESTIMATE_ORIGIN }),
    calculationSnapshot: fakeCalc
  });

  let simplifiedCalls = 0;
  let strictPublishCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        strictPublishCalls += 1;
        return {
          ok: true,
          publication: { id: "pub-1", status: "active" },
          customerUrl: "https://example.test/de/x",
          envelope: { configured: true },
          publishedConfiguration: {
            customerChoiceGroups: ["material_color", "sink"],
            allowedOptionKeys: ["qty-sink"]
          }
        };
      }
    },
    lifecycleRepository: null
  });
  // Inject a fake simplified service on the digital estimate object to prove we don't call it.
  v2._internals.studioDigitalEstimateService.publishDigitalEstimate = async () => {
    simplifiedCalls += 1;
  };

  await assert.rejects(
    () =>
      v2.publishApproved({
        organizationId: ORG,
        estimateId: draftRow.id,
        actorUserId: ACTOR,
        body: { confirm: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED
  );
  assert.equal(strictPublishCalls, 0);
  assert.equal(simplifiedCalls, 0);

  await repo.update(
    ORG,
    draftRow.id,
    { status: STUDIO_ESTIMATE_STATUSES.APPROVED, approval: { approvedAt: new Date().toISOString() } },
    ACTOR
  );
  const published = await v2.publishApproved({
    organizationId: ORG,
    estimateId: draftRow.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(published.ok, true);
  assert.equal(strictPublishCalls, 1);
  assert.equal(simplifiedCalls, 0);
  assert.equal(published.sideEffects.simplifiedPublish, false);

  const routeSrc = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");
  const svcSrc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  assert.ok(!routeSrc.includes("simplified-publish"));
  assert.ok(!svcSrc.includes("createStudioSimplifiedWorkflowService"));
  assert.ok(!svcSrc.includes("studioSimplifiedWorkflow"));
  assert.ok(!/\.publishDigitalEstimate\s*\(/.test(svcSrc));
  console.log("ok: 5–6 publish refuses non-approved and never calls simplified-publish");
}

{
  // 7. Customer activity read model distinguishes active vs historical publications.
  const estimate = { id: "est-1", revision: 2, status: "priced" };
  const activePub = {
    id: "pub-active",
    status: "active",
    revisionNumber: 2,
    customerUrl: "https://example.test/de/active"
  };
  const historicalPub = {
    id: "pub-old",
    status: "superseded",
    revisionNumber: 1,
    customerUrl: "https://example.test/de/old"
  };
  assert.equal(isCurrentActivePublicationForEstimate(estimate, activePub), true);
  assert.equal(isHistoricalPublicationForEstimate(estimate, historicalPub), true);
  assert.equal(isCurrentActivePublicationForEstimate(estimate, historicalPub), false);

  const repo = new InMemoryStudioEstimateRepository();
  const row = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 2,
    scope: baseScope()
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async getWorkspacePublicationSummary() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            historical: false,
            publicationId: "pub-active",
            estimateId: row.id,
            revision: 2,
            publishedAt: "2026-07-01T00:00:00.000Z",
            expiresAt: null,
            customerActivityState: "customer_viewed",
            customerActivityLabel: "Customer viewed",
            customerUrlAvailable: true,
            customerUrl: "https://example.test/de/active",
            reviewRequestOpen: false,
            reviewRequestId: null,
            statusLabel: "Published",
            linkStatus: "active"
          },
          publications: [activePub, historicalPub],
          activePublication: activePub,
          reviewRequests: []
        };
      }
    },
    lifecycleRepository: {
      async getAcceptanceForEstimate() {
        return null;
      }
    }
  });
  const activity = await v2.getCustomerActivity({ organizationId: ORG, intakeCaseId: CASE_ID });
  assert.equal(activity.ok, true);
  assert.ok(activity.activePublication);
  assert.equal(activity.activePublication.active, true);
  assert.ok(activity.historicalPublications.some((p) => p.historical === true));
  assert.equal(activity.activity.viewed, true);
  console.log("ok: 7 customer activity distinguishes active vs historical publications");
}

{
  // 8. V1 route remains untouched/default; V2 is additive sibling.
  const v1Routes = readFileSync(join(__dirname, "elite100EstimateStudioRoutes.js"), "utf8");
  const v2Routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");
  const quoteRoutes = readFileSync(
    join(root, "backend-core/src/quotes/quoteRoutes.js"),
    "utf8"
  );
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  assert.ok(v1Routes.includes("/api/elite100-estimate-studio/intake-cases/:caseId/estimate"));
  assert.ok(!v1Routes.includes("/api/elite100-studio-v2/"));
  assert.ok(v2Routes.includes("/api/elite100-studio-v2/cases/:caseId/working-draft"));
  assert.ok(v2Routes.includes("/api/elite100-studio-v2/cases/:caseId/working-draft/calculate"));
  assert.ok(v2Routes.includes("/api/elite100-studio-v2/approved/:estimateId/publish"));
  assert.ok(v2Routes.includes("/api/elite100-studio-v2/cases/:caseId/customer-activity"));
  assert.ok(quoteRoutes.includes("maybeAttachElite100StudioV2Routes"));
  assert.ok(quoteRoutes.includes("maybeAttachElite100EstimateStudioRoutes"));
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(studioApp.includes("StudioV2EstimatorShell"));
  assert.ok(studioApp.includes("studioV2Preview"));
  assert.ok(
    studioApp.includes('studioV2Preview && studioV2UiEnabled()') ||
      studioApp.includes("studioV2Preview && studioV2UiEnabled()")
  );
  // Default path still mounts V1 workspace when preview flag is off.
  assert.match(studioApp, /EstimateTakeoffWorkspace[\s\S]*caseId=\{estimateWorkspaceCaseId\}/);
  console.log("ok: 8 V1 routes untouched; V2 additive; V1 remains default mount");
}

{
  // Forbidden V1 orchestration imports must not appear in V2 shell.
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateDigitalEstimatePanel["']/.test(shell));
  assert.ok(!/from\s+["'].*ActiveReviewPublishPanel["']/.test(shell));
  assert.ok(!/from\s+["'].*CommercialConfigurationSection["']/.test(shell));
  assert.ok(!/import\s+.*deriveAiEstimatorStage/.test(shell));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("simplified-publish"));
  console.log("ok: V2 shell does not reuse forbidden V1 orchestration components");
}

console.log("\nAll Studio V2 Slice A tests passed.\n");
