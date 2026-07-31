/**
 * Elite 100 Studio V2 Slice F — strict Digital Estimate publish contracts.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceF.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

console.log("\nstudioV2SliceF.test.mjs\n");

function baseScope(overrides = {}) {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Acme Homes",
    projectName: "Lakeview Kitchen",
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
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
    ...overrides
  };
}

function interactivePublishResult(overrides = {}) {
  const {
    publication: publicationOverride,
    publishedConfiguration: publishedConfigurationOverride,
    envelope: envelopeOverride,
    ...rest
  } = overrides;
  return {
    ok: true,
    publication: {
      id: "pub-active",
      status: "active",
      publishedAt: "2026-07-30T19:00:00.000Z",
      customerUrl: "https://example.test/e/tok-active",
      ...(publicationOverride || {})
    },
    customerUrl: "https://example.test/e/tok-active",
    linkStatus: "active",
    envelope: { configured: true, ...(envelopeOverride || {}) },
    publishedConfiguration: {
      customerChoiceGroups: ["material_color", "sink", "edge"],
      allowedOptionKeys: ["qty-sink"],
      ...(publishedConfigurationOverride || {})
    },
    staffNotice: "Published.",
    ...rest
  };
}

const fakeCalc = {
  fingerprint: "v2f-fp",
  calculatedAt: "2026-07-30T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 1000, customerDisplayTotal: 1010 },
  warnings: [],
  unresolvedItems: []
};

async function createApproved(repo, extra = {}) {
  return repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc,
    approval: {
      approvedAt: "2026-07-30T17:00:00.000Z",
      approvedByUserId: ACTOR,
      calculationFingerprint: "v2f-fp"
    },
    staleReason: null,
    ...extra
  });
}

{
  // 1. Publish rejects unapproved draft with approve_required
  const repo = new InMemoryStudioEstimateRepository();
  const draft = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc
  });
  let publishCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        publishCalls += 1;
        return { ok: true, publication: { id: "pub-x" }, customerUrl: "https://example.test/de/x" };
      }
    }
  });
  await assert.rejects(
    () =>
      v2.publishApproved({
        organizationId: ORG,
        estimateId: draft.id,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED
  );
  assert.equal(publishCalls, 0);
  console.log("ok: 1 Publish rejects unapproved draft with approve_required");
}

{
  // 2. Publish rejects no estimate
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        throw new Error("must not publish");
      }
    }
  });
  await assert.rejects(
    () =>
      v2.publishApproved({
        organizationId: ORG,
        estimateId: "missing-estimate-id",
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NO_ESTIMATE
  );
  console.log("ok: 2 Publish rejects no estimate");
}

{
  // 3. Publish requires confirmed true
  const repo = new InMemoryStudioEstimateRepository();
  const row = await createApproved(repo);
  let publishCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        publishCalls += 1;
        return { ok: true };
      }
    }
  });
  await assert.rejects(
    () =>
      v2.publishApproved({
        organizationId: ORG,
        estimateId: row.id,
        actorUserId: ACTOR,
        body: { confirmed: false }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  assert.equal(publishCalls, 0);
  console.log("ok: 3 Publish requires confirmed true");
}

{
  // 4–11. Publish succeeds; no forbidden orchestration; returns active summary
  const repo = new InMemoryStudioEstimateRepository();
  const row = await createApproved(repo);
  let publishCalls = 0;
  let simplifiedCalls = 0;
  let calcCalls = 0;
  let approveCalls = 0;
  /** @type {object|null} */
  let seenBody = null;

  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => {
      calcCalls += 1;
      return fakeCalc;
    },
    studioEstimateService: {
      async ensureEditableEstimateDraft() {
        throw new Error("must not call ensureEditableEstimateDraft");
      },
      async openMeasurementRevision() {
        throw new Error("must not call openMeasurementRevision");
      },
      async refreshScopeFromTakeoff() {
        throw new Error("must not call refreshScopeFromTakeoff");
      },
      async approve() {
        approveCalls += 1;
        throw new Error("must not auto-approve");
      }
    },
    studioDigitalEstimateService: {
      async publish({ body }) {
        publishCalls += 1;
        seenBody = body;
        return interactivePublishResult({
          publication: {
            id: "pub-active",
            status: "active",
            publishedAt: "2026-07-30T19:00:00.000Z",
            customerUrl: "https://example.test/e/tok-active"
          },
          customerUrl: "https://example.test/e/tok-active"
        });
      },
      async simplifiedPublish() {
        simplifiedCalls += 1;
        throw new Error("must not simplified-publish");
      },
      async publishDigitalEstimate() {
        simplifiedCalls += 1;
        throw new Error("must not publishDigitalEstimate");
      },
      async getWorkspacePublicationSummary() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            statusLabel: "Published",
            publicationId: "pub-active",
            estimateId: row.id,
            revision: 1,
            customerUrl: "https://example.test/e/tok-active",
            publishedAt: "2026-07-30T19:00:00.000Z"
          },
          activePublication: {
            id: "pub-active",
            status: "active",
            revisionNumber: 1,
            customerUrl: "https://example.test/e/tok-active",
            publishedAt: "2026-07-30T19:00:00.000Z"
          },
          publications: [
            {
              id: "pub-active",
              status: "active",
              revisionNumber: 1,
              customerUrl: "https://example.test/e/tok-active",
              publishedAt: "2026-07-30T19:00:00.000Z"
            }
          ],
          reviewRequests: []
        };
      }
    }
  });

  const published = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirmed: true,
      deliveryMode: "link_only",
      autoApprove: true,
      autoCalculate: true,
      sendEmail: true,
      clientMutationId: "pub-1"
    }
  });

  assert.equal(published.ok, true);
  assert.equal(publishCalls, 1);
  assert.equal(simplifiedCalls, 0);
  assert.equal(calcCalls, 0);
  assert.equal(approveCalls, 0);
  assert.equal(published.estimateId, row.id);
  assert.equal(published.caseId, CASE_ID);
  assert.equal(published.publication.customerUrl, "https://example.test/e/tok-active");
  assert.equal(published.publication.active, true);
  assert.equal(published.clientMutationId, "pub-1");
  assert.equal(published.envelope?.configured, true);
  assert.equal(published.sideEffects.simplifiedPublish, false);
  assert.equal(published.sideEffects.autoApprove, false);
  assert.equal(published.sideEffects.autoCalculate, false);
  assert.equal(published.sideEffects.ensureEditableDraft, false);
  assert.equal(published.sideEffects.scopeMutated, false);
  assert.equal(seenBody?.confirm, true);
  assert.equal(seenBody?.deliveryMode, "link_only");
  assert.equal(seenBody?.autoApprove, undefined);
  assert.equal(seenBody?.autoCalculate, undefined);
  assert.equal(seenBody?.sendEmail, undefined);
  // V2 publish must attach interactive customer options envelope (fixes DE
  // "Customer options could not be loaded" after document-only publish).
  assert.equal(seenBody?.configuration?.enableConfiguration, true);
  assert.equal(seenBody?.configuration?.configurationMode, "configure");
  assert.ok(Array.isArray(seenBody?.configuration?.customerChoiceGroups));
  assert.ok(seenBody.configuration.customerChoiceGroups.length > 0);
  assert.ok(Array.isArray(seenBody?.configuration?.allowedOptionKeys));
  assert.ok(seenBody.configuration.allowedOptionKeys.length > 0);

  // Guard: document-only DE result must fail closed for interactive V2 publish.
  const v2DocOnly = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        return {
          ok: true,
          publication: { id: "pub-doc", status: "active", customerUrl: "https://example.test/e/doc" },
          customerUrl: "https://example.test/e/doc",
          envelope: { configured: false, reason: "document_only" }
        };
      },
      async getWorkspacePublicationSummary() {
        return { publicationSummary: {}, publications: [], reviewRequests: [] };
      }
    }
  });
  await assert.rejects(
    () =>
      v2DocOnly.publishApproved({
        organizationId: ORG,
        estimateId: row.id,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.CONFIGURATION_ENVELOPE_REQUIRED
  );

  const svcSrc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  assert.ok(!svcSrc.includes("createStudioSimplifiedWorkflowService"));
  assert.ok(!svcSrc.includes("ensureEditableEstimateDraft("));
  assert.ok(!svcSrc.includes("openMeasurementRevision("));
  assert.ok(!svcSrc.includes("refreshScopeFromTakeoff("));
  assert.ok(!/\.publishDigitalEstimate\s*\(/.test(svcSrc));
  assert.ok(svcSrc.includes("assertStudioV2InteractivePublishResult"));
  console.log("ok: 4–11 Publish succeeds without forbidden orchestration");
}

{
  // 12. Customer activity reflects active publication after publish (via DE summary)
  const repo = new InMemoryStudioEstimateRepository();
  const row = await createApproved(repo);
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        return interactivePublishResult({
          publication: {
            id: "pub-active",
            status: "active",
            customerUrl: "https://example.test/e/tok-active"
          },
          customerUrl: "https://example.test/e/tok-active"
        });
      },
      async getWorkspacePublicationSummary() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            statusLabel: "Published",
            publicationId: "pub-active",
            customerUrl: "https://example.test/e/tok-active",
            customerActivityState: "customer_viewed"
          },
          activePublication: {
            id: "pub-active",
            status: "active",
            revisionNumber: 1,
            customerUrl: "https://example.test/e/tok-active"
          },
          publications: [
            {
              id: "pub-active",
              status: "active",
              revisionNumber: 1,
              customerUrl: "https://example.test/e/tok-active"
            },
            {
              id: "pub-old",
              status: "superseded",
              revisionNumber: 1,
              customerUrl: "https://example.test/e/tok-old"
            }
          ],
          reviewRequests: []
        };
      }
    }
  });
  await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  const activity = await v2.getCustomerActivity({
    organizationId: ORG,
    intakeCaseId: CASE_ID
  });
  assert.equal(activity.ok, true);
  assert.ok(activity.activePublication);
  assert.equal(activity.activePublication.publicationId, "pub-active");
  assert.equal(activity.activity.viewed, true);
  assert.equal(
    activity.activity.savedSelections,
    false,
    "without configurationRepository, savedSelections stays false (not inferred from activity state)"
  );
  assert.ok(activity.selectionReview);
  assert.equal(activity.selectionReview.hasSavedSelections, false);
  console.log("ok: 12 Customer activity reflects active publication after publish");
}

{
  // 13. V1 route remains untouched/default
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(studioApp.includes("StudioV2EstimatorShell"));
  console.log("ok: 13 V1 route remains untouched/default");
}

{
  // Frontend / source contracts
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2PublishPanel.tsx"),
    "utf8"
  );
  const approval = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ApprovalPanel.tsx"),
    "utf8"
  );
  const routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");

  assert.ok(!/from\s+["'].*ActiveReviewPublishPanel["']/.test(panel));
  assert.ok(!/from\s+["'].*EstimateDigitalEstimatePanel["']/.test(panel));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(panel));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(panel));
  assert.ok(!panel.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!/simplifiedPublish|publishDigitalEstimate|createStudioSimplified/.test(panel));
  assert.ok(!/simplifiedPublish|publishDigitalEstimate|createStudioSimplified/.test(shell));
  assert.ok(panel.includes('data-testid="studio-v2-publish"'));
  assert.ok(panel.includes('data-testid="studio-v2-publish-confirm"'));
  assert.ok(panel.includes('data-testid="studio-v2-republish"'));
  assert.ok(panel.includes('data-testid="studio-v2-republish-confirm"'));
  assert.ok(panel.includes('data-testid="studio-v2-republish-hint"'));
  assert.ok(panel.includes("Republish / Repair Digital Estimate"));
  assert.ok(panel.includes("Refreshes the customer link configuration. Does not email the customer."));
  // Initial publish only when !published; repair when published — customer-viewed must not hide repair.
  assert.ok(panel.includes("approved && !published"));
  assert.ok(panel.includes("approved && published"));
  assert.ok(!panel.includes("customer viewed") || panel.includes("studio-v2-republish"));
  assert.ok(panel.includes("Approve required before publish."));
  assert.ok(shell.includes("/approved/"));
  assert.ok(shell.includes("working-draft/approve"));
  assert.ok(shell.includes("StudioV2PublishPanel"));
  assert.ok(shell.includes("StudioV2ApprovalPanel"));
  assert.ok(shell.includes('deliveryMode: "link_only"'));
  assert.ok(shell.includes("configuration_envelope_required"));
  assert.ok(shell.includes("Digital Estimate configuration could not be activated"));
  // No combined approve+publish action
  assert.ok(!shell.includes("approveAndPublish"));
  assert.ok(!shell.includes("approve+publish"));
  assert.ok(!panel.includes("Approve Estimate"));
  assert.ok(approval.includes("Approve Estimate"));
  assert.ok(routes.includes("/api/elite100-studio-v2/approved/:estimateId/publish"));
  console.log("ok: frontend/source contracts for Publish panel");
}

{
  // Production QA hardening — publish configuration + UX contracts
  const {
    sanitizeStudioV2PublishBody,
    resolveStudioV2PublishConfiguration
  } = await import("./studioV2Publish.mjs");
  const { buildStudioV2CalculationResult } = await import("./studioV2WorkingDraft.mjs");
  const { decideConfigurationView } = await import(
    "../../../app-digital-estimate/src/configurationBootstrap.ts"
  );

  const sanitized = sanitizeStudioV2PublishBody({ confirmed: true });
  assert.equal(sanitized.body.deliveryMode, "link_only");
  assert.equal(sanitized.body.configuration.enableConfiguration, true);
  assert.equal(sanitized.body.configuration.configurationMode, "configure");
  assert.ok(sanitized.body.configuration.customerChoiceGroups.includes("material_color"));
  assert.ok(sanitized.body.configuration.customerChoiceGroups.includes("sink"));
  assert.ok(sanitized.body.configuration.customerChoiceGroups.includes("edge"));

  const cfg = resolveStudioV2PublishConfiguration(undefined);
  assert.equal(cfg.enableConfiguration, true);
  assert.equal(cfg.configurationMode, "configure");
  assert.ok(Array.isArray(cfg.customerChoiceGroups) && cfg.customerChoiceGroups.length > 0);
  const view = decideConfigurationView({
    uiEnabled: true,
    lifecycle: "active",
    hasConfiguration: true,
    hasEstimate: true
  });
  assert.equal(view.mode, "configure");
  assert.equal(view.fallbackReason, null);
  const absent = decideConfigurationView({
    uiEnabled: true,
    lifecycle: "active",
    hasConfiguration: false,
    hasEstimate: true
  });
  assert.equal(absent.fallbackReason, "configuration_absent");
  assert.equal(absent.mode, "legacy");

  const calcResult = buildStudioV2CalculationResult({
    scope: {
      pricingBasis: "wholesale",
      materialGroup: "B",
      customLineItems: [
        {
          commercialRole: "customer_charge",
          customerFacing: true,
          name: "Sink",
          quantity: 1,
          unitPrice: 200,
          lineTotal: 200
        },
        {
          commercialRole: "legacy_hidden_customer_charge",
          customerFacing: false,
          name: "Adjustment",
          internalNotes: "PIA seam complexity",
          quantity: 1,
          unitPrice: 150,
          lineTotal: 150
        },
        {
          commercialRole: "internal_only",
          customerFacing: false,
          name: "Shop note",
          internalNotes: "Scrap allowance",
          quantity: 1,
          unitPrice: 75,
          lineTotal: 75
        }
      ]
    },
    calculation: {
      pricingBasis: "wholesale",
      pricingVersion: 4,
      totals: { customerDisplayTotal: 4380, exactTotal: 4380 },
      reviewSummary: {
        countertopMaterialTotal: 3000,
        materialTaxTotal: 180,
        countertopMaterialGroups: ["B"]
      },
      elite100: {
        rooms: [
          {
            materialGroup: "B",
            materialRatePerSf: 45,
            measuredCountertopSf: 40,
            billedCountertopSf: 42
          }
        ]
      },
      fabrication: {
        customLineItems: [
          {
            commercialRole: "customer_charge",
            customerFacing: true,
            lineTotal: 200
          },
          {
            commercialRole: "legacy_hidden_customer_charge",
            customerFacing: false,
            lineTotal: 150
          },
          {
            commercialRole: "internal_only",
            customerFacing: false,
            lineTotal: 75
          }
        ]
      },
      warnings: [],
      unresolvedItems: []
    }
  });
  assert.equal(calcResult.available, true);
  assert.equal(calcResult.pricingBreakdown.pricingBasis, "wholesale");
  assert.equal(calcResult.pricingBreakdown.priceGroup, "B");
  assert.equal(calcResult.pricingBreakdown.materialRatePerSf, 45);
  assert.equal(calcResult.pricingBreakdown.measuredSf, 40);
  assert.equal(calcResult.pricingBreakdown.billedSf, 42);
  assert.equal(calcResult.pricingBreakdown.customerFacingAdjustments, 200);
  assert.equal(calcResult.pricingBreakdown.hiddenCustomerImpactingAdjustments, 150);
  // Internal-only must not be counted in customer-facing or hidden customer-impacting buckets.
  assert.notEqual(calcResult.pricingBreakdown.customerFacingAdjustments, 275);
  assert.notEqual(calcResult.pricingBreakdown.hiddenCustomerImpactingAdjustments, 225);

  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimateOptionsPanel.tsx"),
    "utf8"
  );
  const approval = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ApprovalPanel.tsx"),
    "utf8"
  );
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );

  assert.ok(!shell.includes("Slice C Takeoff Import"));
  assert.ok(shell.includes("Studio V2 · Test Mode") || shell.includes("STUDIO V2 WORKSPACE"));
  assert.ok(shell.includes('data-testid="studio-v2-workflow-status"'));
  assert.ok(shell.includes('data-testid="studio-v2-calc-pricing-basis"'));
  assert.ok(shell.includes("StudioV2PricingControlsPanel") || shell.includes("working-draft/pricing"));
  assert.ok(!shell.includes("Pricing basis / price group editing will be added in the next slice."));
  assert.ok(panel.includes('data-testid="studio-v2-internal-collapsed"'));
  assert.ok(panel.includes("Internal cost notes — does not affect customer price"));
  assert.ok(panel.includes("Hidden customer-impacting adjustments"));
  assert.ok(panel.includes('data-testid="studio-v2-hidden-help"'));
  assert.ok(panel.includes("Affects customer total but does not expose the internal reason."));
  assert.ok(panel.includes("DollarAmountInput") || panel.includes('data-testid="studio-v2-dollar-amount"'));
  assert.ok(panel.includes("Amount ($)"));
  assert.ok(approval.includes('data-testid="studio-v2-approve-disabled-hint"'));
  assert.ok(approval.includes("is-disabled"));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateDigitalEstimatePanel["']/.test(shell));
  assert.ok(!/from\s+["'].*ActiveReviewPublishPanel["']/.test(shell));
  assert.ok(!/from\s+["'].*CommercialConfigurationSection["']/.test(shell));
  assert.ok(!/from\s+["'].*deriveAiEstimatorStage["']/.test(shell));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("open-measurement-revision"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!shell.includes("refresh-from-takeoff"));
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(studioApp.includes("studioV2=1") || studioApp.includes("studioV2"));
  console.log("ok: production QA hardening contracts");
}

{
  // Full interactive Digital Estimate path (V2 → public configure mode)
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    [join(__dirname, "studioV2PublishActivatesDigitalEstimate.test.mjs")],
    { stdio: "inherit" }
  );
  assert.equal(r.status, 0, "studioV2PublishActivatesDigitalEstimate.test.mjs must pass");
  console.log("ok: V2 interactive Digital Estimate activation suite");
}

console.log("\nAll Studio V2 Slice F tests passed.\n");
