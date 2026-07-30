/**
 * Elite 100 Studio V2 Slice H — pricing basis / price group / markup controls.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceH.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";
import {
  normalizeStudioV2PricingBasis,
  normalizeStudioV2MaterialGroup,
  normalizeStudioV2PricingPatch
} from "./studioV2Pricing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CASE_EMPTY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nstudioV2SliceH.test.mjs\n");

function baseScope(overrides = {}) {
  return {
    ...emptyStudioEstimateScope(),
    customerName: "Acme Homes",
    projectName: "Lakeview Kitchen",
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
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

const fakeCalc = {
  fingerprint: "v2h-fp",
  calculatedAt: "2026-07-30T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  pricingBasis: "wholesale",
  totals: { exactTotal: 1000, customerDisplayTotal: 1010 },
  warnings: [],
  unresolvedItems: []
};

{
  assert.equal(normalizeStudioV2PricingBasis("Wholesale"), "wholesale");
  assert.equal(normalizeStudioV2PricingBasis("direct"), "direct");
  assert.equal(normalizeStudioV2PricingBasis("retail"), "retail");
  assert.equal(normalizeStudioV2PricingBasis("bogus"), null);
  assert.equal(normalizeStudioV2MaterialGroup("Promo"), "Group Promo");
  assert.equal(normalizeStudioV2MaterialGroup("B"), "Group B");
  assert.equal(normalizeStudioV2MaterialGroup("Group C"), "Group C");
  assert.equal(normalizeStudioV2MaterialGroup("Remnant"), "Remnant");
  assert.equal(normalizeStudioV2MaterialGroup("ZZZ"), null);
  console.log("ok: pricing basis / material group normalizers");
}

{
  // 1. PATCH pricing rejects no estimate
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.patchWorkingDraftPricing({
        organizationId: ORG,
        intakeCaseId: CASE_EMPTY,
        actorUserId: ACTOR,
        body: { pricing: { pricingBasis: "direct" } }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NO_ESTIMATE
  );
  console.log("ok: 1 PATCH pricing rejects no estimate");
}

{
  // 2. Approved snapshot rejects pricing edits
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
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
      calculationFingerprint: "v2h-fp"
    }
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.patchWorkingDraftPricing({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { pricing: { pricingBasis: "direct", materialGroup: "Group B" } }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  console.log("ok: 2 Approved snapshot rejects pricing edits");
}

{
  // 3. Invalid pricing basis / price group rejected
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    revision: 1,
    scope: baseScope()
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.patchWorkingDraftPricing({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { pricing: { pricingBasis: "contractor" } }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  await assert.rejects(
    () =>
      v2.patchWorkingDraftPricing({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { pricing: { materialGroup: "Group Z" } }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  console.log("ok: 3 Invalid pricing basis / price group rejected");
}

{
  // 4–5. Pricing edit marks calc stale / ready_to_price; calculate uses updated context
  const repo = new InMemoryStudioEstimateRepository();
  const row = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc
  });
  /** @type {object|null} */
  let seenScope = null;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async ({ scope }) => {
      seenScope = scope;
      return {
        ...fakeCalc,
        fingerprint: "v2h-fp-2",
        pricingBasis: scope.pricingBasis === "wholesale" ? "wholesale" : "direct_retail",
        totals: { exactTotal: 2200, customerDisplayTotal: 2200 }
      };
    },
    studioEstimateService: {
      async ensureEditableEstimateDraft() {
        throw new Error("must not call ensureEditableEstimateDraft");
      },
      async refreshScopeFromTakeoff() {
        throw new Error("must not call refreshScopeFromTakeoff");
      },
      async updateScope() {
        throw new Error("must not call updateScope");
      }
    }
  });

  const patched = await v2.patchWorkingDraftPricing({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      pricing: { pricingBasis: "direct", materialGroup: "Group B", priceGroup: "B" },
      clientMutationId: "pricing-1"
    }
  });
  assert.equal(patched.ok, true);
  assert.equal(patched.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  assert.equal(patched.editablePricing.pricingBasis, "direct");
  assert.equal(patched.editablePricing.materialGroup, "Group B");
  assert.equal(patched.lastCalculation?.available, false);
  assert.equal(patched.sideEffects.ensureEditableDraft, false);
  assert.equal(patched.sideEffects.refreshFromTakeoff, false);
  assert.equal(patched.sideEffects.updateScope, false);

  const stored = await repo.getById(ORG, row.id);
  assert.equal(stored.scope.pricingBasis, "direct");
  assert.equal(stored.scope.materialGroup, "Group B");
  assert.equal(stored.calculationSnapshot, null);
  assert.match(String(stored.staleReason || ""), /Pricing settings changed/);

  const calc = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(calc.ok, true);
  assert.equal(seenScope?.pricingBasis, "direct");
  assert.equal(seenScope?.materialGroup, "Group B");
  assert.equal(calc.calculation.total, 2200);
  console.log("ok: 4–5 Pricing edit clears calc; calculate uses updated context");
}

{
  // Retail alias persists; estimate-wide adjustment requires reason when active
  const bad = normalizeStudioV2PricingPatch({
    existingScope: baseScope(),
    pricing: {
      estimateWideAdjustment: { active: true, percentage: 5, reason: "" }
    },
    actorUserId: ACTOR,
    env: {}
  });
  assert.equal(bad.ok, false);

  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    revision: 1,
    scope: baseScope()
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  const patched = await v2.patchWorkingDraftPricing({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      pricing: {
        pricingBasis: "retail",
        materialGroup: "Promo",
        estimateWideAdjustment: {
          active: true,
          percentage: 3,
          reason: "Preferred customer"
        }
      }
    }
  });
  assert.equal(patched.editablePricing.pricingBasis, "retail");
  assert.equal(patched.editablePricing.materialGroup, "Group Promo");
  assert.equal(patched.editablePricing.estimateWideAdjustment.active, true);
  assert.equal(patched.editablePricing.estimateWideAdjustment.percentage, 3);
  console.log("ok: retail + estimate-wide adjustment persist");
}

{
  // Frontend / source contracts
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2PricingControlsPanel.tsx"),
    "utf8"
  );
  const approval = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ApprovalPanel.tsx"),
    "utf8"
  );
  const routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  const svc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");

  assert.ok(panel.includes('data-testid="studio-v2-pricing-controls"'));
  assert.ok(panel.includes('data-testid="studio-v2-pricing-basis"'));
  assert.ok(panel.includes('data-testid="studio-v2-price-group"'));
  assert.ok(panel.includes('data-testid="studio-v2-save-pricing"'));
  assert.ok(panel.includes("Pricing controls are read-only"));
  assert.ok(shell.includes("StudioV2PricingControlsPanel"));
  assert.ok(shell.includes("working-draft/pricing"));
  assert.ok(shell.includes("pricingDirty"));
  assert.ok(shell.includes("Save Pricing first before calculating."));
  assert.ok(approval.includes("unsaved_pricing"));
  assert.ok(routes.includes("/api/elite100-studio-v2/cases/:caseId/working-draft/pricing"));
  assert.ok(svc.includes("patchWorkingDraftPricing"));
  assert.ok(!svc.includes("ensureEditableEstimateDraft("));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateScopePanel["']/.test(panel));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(!shell.includes("studio-v2-pricing-basis-placeholder"));
  console.log("ok: frontend/source contracts for Pricing Controls");
}

console.log("\nAll Studio V2 Slice H tests passed.\n");
