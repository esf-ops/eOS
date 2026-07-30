/**
 * Elite 100 Studio V2 Slice D — estimate options / commercial configuration contracts.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceD.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";
import { STUDIO_COMMERCIAL_ROLES } from "./studioCommercialLines.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CASE_EMPTY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nstudioV2SliceD.test.mjs\n");

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
    customLineItems: [],
    ...overrides
  };
}

const fakeCalc = {
  fingerprint: "v2d-fp",
  calculatedAt: "2026-07-30T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 1000, customerDisplayTotal: 1010 },
  warnings: [],
  unresolvedItems: []
};

{
  // 1. PATCH options rejects no estimate
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.patchWorkingDraftOptions({
        organizationId: ORG,
        intakeCaseId: CASE_EMPTY,
        actorUserId: ACTOR,
        body: { options: { customerLines: [] } }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NO_ESTIMATE
  );
  console.log("ok: 1 PATCH options rejects no estimate");
}

{
  // 2. PATCH options rejects approved/frozen
  const repo = new InMemoryStudioEstimateRepository();
  const row = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: baseScope(),
    approval: { approvedAt: new Date().toISOString() }
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.patchWorkingDraftOptions({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: {
          options: {
            customerLines: [{ label: "Crane", amount: 250, kind: "charge" }]
          }
        }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  const still = await repo.getById(ORG, row.id);
  assert.equal((still.scope.customLineItems || []).length, 0);
  console.log("ok: 2 PATCH options rejects approved/frozen");
}

{
  // 3. Persist customer-facing charge
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
  const result = await v2.patchWorkingDraftOptions({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      options: {
        customerLines: [{ label: "Crane", amount: 250, kind: "charge" }]
      },
      clientMutationId: "opt-charge-1"
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.sideEffects.ensureEditableDraft, false);
  assert.equal(result.sideEffects.refreshFromTakeoff, false);
  assert.equal(result.sideEffects.openMeasurementRevision, false);
  assert.equal(result.sideEffects.approve, false);
  assert.equal(result.sideEffects.publish, false);
  const charge = result.editableOptions.customerLines.find((l) => l.label === "Crane");
  assert.ok(charge);
  assert.equal(charge.amount, 250);
  assert.equal(charge.commercialRole, STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE);
  const row = await repo.getActiveByIntakeCase(ORG, CASE_ID);
  assert.equal(row.scope.customLineItems.length, 1);
  assert.equal(row.scope.customLineItems[0].commercialRole, STUDIO_COMMERCIAL_ROLES.CUSTOMER_CHARGE);
  assert.equal(row.scope.customLineItems[0].customerFacing, true);
  console.log("ok: 3 PATCH options persists customer-facing charge");
}

{
  // 4. Persist customer-facing credit/discount
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
  const result = await v2.patchWorkingDraftOptions({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      options: {
        customerLines: [{ label: "Promo credit", amount: 100, kind: "credit" }]
      }
    }
  });
  assert.equal(result.ok, true);
  const credit = result.editableOptions.customerLines.find((l) => l.label === "Promo credit");
  assert.ok(credit);
  assert.equal(credit.kind, "credit");
  const row = await repo.getActiveByIntakeCase(ORG, CASE_ID);
  assert.equal(row.scope.customLineItems[0].commercialRole, STUDIO_COMMERCIAL_ROLES.CREDIT);
  assert.ok(Number(row.scope.customLineItems[0].unitPrice) < 0);
  assert.equal(row.scope.customLineItems[0].customerFacing, true);
  console.log("ok: 4 PATCH options persists customer-facing credit/discount");
}

{
  // 5. Persist internal-only without customer-facing exposure
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
  const result = await v2.patchWorkingDraftOptions({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      options: {
        internalLines: [{ internalReason: "Shop scrap allowance", amount: 75 }]
      }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.editableOptions.customerLines.length, 0);
  assert.equal(result.editableOptions.internalLines.length, 1);
  const row = await repo.getActiveByIntakeCase(ORG, CASE_ID);
  assert.equal(row.scope.customLineItems[0].commercialRole, STUDIO_COMMERCIAL_ROLES.INTERNAL_ONLY);
  assert.equal(row.scope.customLineItems[0].customerFacing, false);
  console.log("ok: 5 PATCH options persists internal-only line");
}

{
  // 6. Persist hidden customer-impacting with internal reason
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
  const result = await v2.patchWorkingDraftOptions({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      options: {
        hiddenCustomerImpactingLines: [
          {
            internalReason: "Seam complexity surcharge",
            customerSafeLabel: "Fabrication adjustment",
            amount: 120
          }
        ]
      }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.editableOptions.hiddenCustomerImpactingLines.length, 1);
  assert.match(
    result.editableOptions.hiddenCustomerImpactingLines[0].internalReason,
    /Seam complexity/
  );
  const row = await repo.getActiveByIntakeCase(ORG, CASE_ID);
  assert.equal(
    row.scope.customLineItems[0].commercialRole,
    STUDIO_COMMERCIAL_ROLES.LEGACY_HIDDEN_CUSTOMER_CHARGE
  );
  assert.equal(row.scope.customLineItems[0].customerFacing, false);
  console.log("ok: 6 PATCH options persists hidden customer-impacting line");
}

{
  // 7. Reject hidden/internal without reason
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
      v2.patchWorkingDraftOptions({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { options: { internalLines: [{ amount: 10 }] } }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  await assert.rejects(
    () =>
      v2.patchWorkingDraftOptions({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { options: { hiddenCustomerImpactingLines: [{ amount: 10 }] } }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  console.log("ok: 7 PATCH options rejects hidden/internal without reason");
}

{
  // 8–11. No ensure-editable-draft / open-measurement-revision / refresh-from-takeoff / approve / publish
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  const result = await v2.patchWorkingDraftOptions({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      options: {
        customerLines: [{ label: "Trip charge", amount: 50, kind: "charge" }]
      }
    }
  });
  assert.deepEqual(result.sideEffects, {
    ensureEditableDraft: false,
    refreshFromTakeoff: false,
    openMeasurementRevision: false,
    autoFork: false,
    updateScope: false,
    approve: false,
    publish: false
  });
  const svcSrc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  assert.ok(!svcSrc.includes("ensureEditableEstimateDraft("));
  assert.ok(!svcSrc.includes("openMeasurementRevision("));
  assert.ok(!svcSrc.includes("refreshScopeFromTakeoff("));
  const row = await repo.getActiveByIntakeCase(ORG, CASE_ID);
  assert.notEqual(row.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.equal(row.calculationSnapshot, null);
  assert.match(String(row.staleReason || ""), /options changed|recalculate/i);
  console.log("ok: 8–11 PATCH options does not call forbidden orchestration; clears calc");
}

{
  // 12. Calculate after saved options uses updated options
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    revision: 1,
    scope: baseScope()
  });
  let seenCustom = null;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async ({ scope }) => {
      seenCustom = scope?.customLineItems || [];
      return {
        ...fakeCalc,
        totals: { exactTotal: 1250, customerDisplayTotal: 1250 },
        fingerprint: `v2d-${(scope?.customLineItems || []).length}`
      };
    }
  });
  await v2.patchWorkingDraftOptions({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      options: {
        customerLines: [{ label: "Crane", amount: 250, kind: "charge" }]
      }
    }
  });
  const calc = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR
  });
  assert.equal(calc.ok, true);
  assert.equal(calc.calculation.total, 1250);
  assert.ok(Array.isArray(seenCustom));
  assert.equal(seenCustom.length, 1);
  assert.equal(seenCustom[0].name, "Crane");
  console.log("ok: 12 Calculate after saved options uses updated options");
}

{
  // 13. V1 route remains default (StudioApp still mounts EstimateTakeoffWorkspace)
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(studioApp.includes("StudioV2EstimatorShell"));
  assert.ok(studioApp.includes("studioV2=1") || studioApp.includes("studioV2"));
  console.log("ok: 13 V1 route remains untouched/default");
}

{
  // Frontend / source contracts
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimateOptionsPanel.tsx"),
    "utf8"
  );
  const routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");

  assert.ok(!/from\s+["'].*CommercialConfigurationSection["']/.test(shell));
  assert.ok(!/from\s+["'].*CommercialConfigurationSection["']/.test(panel));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(panel));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(panel));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!panel.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!panel.includes("simplified-publish"));
  assert.ok(panel.includes('data-testid="studio-v2-add-customer-charge"'));
  assert.ok(panel.includes('data-testid="studio-v2-add-customer-credit"'));
  assert.ok(panel.includes('data-testid="studio-v2-remove-customer-line"'));
  assert.ok(panel.includes('data-testid="studio-v2-add-internal-line"'));
  assert.ok(panel.includes('data-testid="studio-v2-add-hidden-line"'));
  assert.ok(panel.includes('data-testid="studio-v2-internal-collapsed"'));
  assert.ok(panel.includes("Hidden customer-impacting adjustments"));
  assert.ok(panel.includes("Affects customer total but does not expose the internal reason."));
  assert.ok(panel.includes('data-testid="studio-v2-dollar-amount"'));
  assert.ok(panel.includes("Unsaved estimate option changes"));
  assert.ok(shell.includes("working-draft/options"));
  assert.ok(shell.includes("Estimate options changed — recalculate to update total."));
  assert.ok(routes.includes("/api/elite100-studio-v2/cases/:caseId/working-draft/options"));
  console.log("ok: frontend/source contracts for Estimate Options panel");
}

console.log("\nAll Studio V2 Slice D tests passed.\n");
