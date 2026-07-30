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

{
  // QA hardening: working-draft read model prefers calculationSnapshot elite100
  // over staff-safe calculation that omits room SF/rates (SF flicker root cause).
  const { buildStudioV2CalculationResult } = await import("./studioV2WorkingDraft.mjs");
  const { buildStudioV2EditableOptions } = await import("./studioV2EstimateOptions.mjs");
  const { buildStudioV2EditablePricing } = await import("./studioV2Pricing.mjs");

  const fullSnap = {
    fingerprint: "snap-full",
    calculatedAt: "2026-07-30T19:00:00.000Z",
    pricingVersion: 4,
    pricingBasis: "wholesale",
    totals: {
      exactTotal: 6980,
      customerDisplayTotal: 6980,
      accountAdjustment: 209.4
    },
    reviewSummary: {
      countertopMaterialTotal: 5000,
      materialTaxTotal: 300,
      countertopMaterialGroups: ["Group Promo"],
      totalBillableStoneSf: 42
    },
    scopeBilling: { billableStoneSf: 42 },
    elite100: {
      rooms: [
        {
          materialGroup: "Group Promo",
          materialRatePerSf: 55,
          measuredCountertopSf: 40,
          billedCountertopSf: 42
        }
      ]
    },
    fabrication: { customLineItems: [] }
  };
  const strippedSafeView = {
    fingerprint: fullSnap.fingerprint,
    calculatedAt: fullSnap.calculatedAt,
    totals: fullSnap.totals,
    scopeBilling: fullSnap.scopeBilling,
    fabrication: fullSnap.fabrication,
    reviewSummary: fullSnap.reviewSummary,
    pricingVersion: 4
    // intentionally no elite100
  };

  const calcFromPost = buildStudioV2CalculationResult(
    {
      scope: baseScope({
        pricingBasis: "wholesale",
        materialGroup: "Group Promo",
        estimateWideAdjustment: {
          active: true,
          percentage: 3,
          reason: "s&r",
          source: "manual"
        }
      }),
      calculation: strippedSafeView,
      calculationSnapshot: fullSnap
    },
    fullSnap
  );
  const calcFromGet = buildStudioV2CalculationResult({
    scope: baseScope({
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      estimateWideAdjustment: {
        active: true,
        percentage: 3,
        reason: "s&r",
        source: "manual"
      }
    }),
    calculation: strippedSafeView,
    calculationSnapshot: fullSnap
  });

  assert.equal(calcFromPost.pricingBreakdown.measuredSf, 40);
  assert.equal(calcFromPost.pricingBreakdown.billedSf, 42);
  assert.equal(calcFromPost.pricingBreakdown.materialRatePerSf, 55);
  assert.equal(calcFromPost.pricingBreakdown.materialSubtotal, 5000);
  assert.equal(calcFromPost.pricingBreakdown.materialUseTax, 300);
  assert.equal(calcFromGet.pricingBreakdown.measuredSf, 40);
  assert.equal(calcFromGet.pricingBreakdown.billedSf, 42);
  assert.equal(calcFromGet.pricingBreakdown.materialRatePerSf, 55);
  assert.equal(calcFromGet.pricingBreakdown.materialSubtotal, 5000);
  assert.equal(calcFromGet.pricingBreakdown.materialUseTax, 300);
  assert.equal(calcFromGet.pricingBreakdown.selectedPricingBasis, "wholesale");
  assert.equal(calcFromGet.pricingBreakdown.selectedPriceGroup, "Group Promo");
  console.log("ok: calculate + working-draft expose consistent pricingBreakdown SF/rate");

  // Stale snapshot still exposes selected basis/group from scope
  const staleOnlyScope = buildStudioV2CalculationResult({
    scope: baseScope({ pricingBasis: "direct", materialGroup: "Group D" }),
    calculation: null,
    calculationSnapshot: null
  });
  assert.equal(staleOnlyScope.available, false);
  assert.equal(staleOnlyScope.pricingBreakdown.selectedPricingBasis, "direct");
  assert.equal(staleOnlyScope.pricingBreakdown.selectedPriceGroup, "Group D");
  assert.equal(staleOnlyScope.pricingBreakdown.materialRatePerSf, null);
  assert.equal(staleOnlyScope.pricingBreakdown.measuredSf, null);
  console.log("ok: selected basis/group visible when calculation unavailable");

  // Manual estimate-wide adjustment is not labeled as account pricing rule
  const opts = buildStudioV2EditableOptions({
    scope: baseScope({
      estimateWideAdjustment: {
        active: true,
        percentage: 3,
        reason: "s&r",
        source: "manual"
      }
    }),
    calculationSnapshot: fullSnap
  });
  assert.equal(opts.accountAdjustment.active, true);
  assert.equal(opts.accountAdjustment.source, "manual");
  assert.equal(opts.accountAdjustment.kind, "estimate_wide_adjustment");
  assert.equal(opts.accountAdjustment.amountExact, 209.4);
  assert.equal(opts.accountAdjustment.amountKnown, true);

  const optsNoAmount = buildStudioV2EditableOptions({
    scope: baseScope({
      estimateWideAdjustment: {
        active: true,
        percentage: 3,
        reason: "s&r",
        source: "manual"
      }
    }),
    calculation: { totals: {} },
    calculationSnapshot: null
  });
  assert.equal(optsNoAmount.accountAdjustment.amountKnown, false);
  assert.equal(optsNoAmount.accountAdjustment.amountExact, null);

  const pricingDto = buildStudioV2EditablePricing(
    {
      scope: baseScope({
        estimateWideAdjustment: {
          active: true,
          percentage: 3,
          reason: "s&r",
          source: "manual"
        }
      })
    },
    { actorUserId: ACTOR, env: {} }
  );
  assert.equal(pricingDto.accountAdjustment.active, false);
  assert.equal(pricingDto.estimateWideAdjustment.active, true);
  assert.equal(pricingDto.estimateWideAdjustment.source, "manual");
  console.log("ok: manual EWA not labeled as account adjustment; amountKnown gated");
}

{
  // Frontend contracts for QA hardening UX
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const optionsPanel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimateOptionsPanel.tsx"),
    "utf8"
  );
  const pricingPanel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2PricingControlsPanel.tsx"),
    "utf8"
  );
  const approval = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ApprovalPanel.tsx"),
    "utf8"
  );

  assert.ok(shell.includes("preferRicherCalculation"));
  assert.ok(shell.includes('calcStale\n    ? "stale"') || shell.includes('calcStale ? "stale"'));
  assert.ok(shell.includes("not calculated yet"));
  assert.ok(shell.includes("setCalcBusy(false)"));
  assert.ok(shell.includes("preferRicherCalculation(draftBody.lastCalculation"));
  assert.ok(optionsPanel.includes("Estimate-wide adjustment"));
  assert.ok(optionsPanel.includes("applied in calculation"));
  assert.ok(!optionsPanel.includes("<h3>Account adjustment</h3>"));
  assert.ok(pricingPanel.includes("No active account pricing rule on this estimate."));
  assert.ok(pricingPanel.includes('adj.source === "trusted_account_rule"'));
  assert.ok(approval.includes("unsaved_pricing"));
  assert.ok(approval.includes("calculation_stale"));
  assert.ok(shell.includes("pricingDirty"));
  assert.ok(shell.includes("Save Pricing first before calculating."));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("refresh-from-takeoff"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(shell));
  console.log("ok: QA hardening frontend status/label/loading contracts");
}

{
  // Estimate-wide adjustment must reach the calculator via Studio→Elite100 scope mapping
  // and change the server total (production bug: adapter dropped estimateWideAdjustment).
  const {
    mapStudioScopeToElite100Scope,
    calculateStudioEstimateV4
  } = await import("./elite100RoomPricingStudioAdapter.mjs");

  const pricedScope = baseScope({
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    edgeLinearFeet: 20,
    edgeMode: "included",
    edgeProfileToken: "edge_eased",
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
            measurementMode: "dimensions",
            lengthIn: 120,
            depthIn: 25.5,
            quantity: 1,
            sqft: 21.25
          }
        ]
      }
    ]
  });

  const mappedWithAdj = mapStudioScopeToElite100Scope({
    ...pricedScope,
    estimateWideAdjustment: {
      active: true,
      percentage: 10,
      reason: "s&r",
      source: "manual"
    }
  });
  assert.equal(mappedWithAdj.scope.estimateWideAdjustment.active, true);
  assert.equal(mappedWithAdj.scope.estimateWideAdjustment.percentage, 10);
  assert.equal(mappedWithAdj.scope.estimateWideAdjustment.reason, "s&r");
  assert.equal(mappedWithAdj.scope.estimateWideAdjustment.source, "manual");

  const baselineV4 = await calculateStudioEstimateV4({ scope: pricedScope, env: {} });
  const adjustedV4 = await calculateStudioEstimateV4({
    scope: {
      ...pricedScope,
      estimateWideAdjustment: {
        active: true,
        percentage: 10,
        reason: "s&r",
        source: "manual"
      }
    },
    env: {}
  });
  assert.ok(Number(baselineV4.totals.exactTotal) > 0, "baseline total must be positive");
  assert.ok(
    Number(adjustedV4.totals.exactTotal) > Number(baselineV4.totals.exactTotal),
    `10% adjustment must increase exactTotal (baseline=${baselineV4.totals.exactTotal}, adjusted=${adjustedV4.totals.exactTotal})`
  );
  assert.ok(
    Number(adjustedV4.totals.accountAdjustment) > 0,
    "calculator must return positive accountAdjustment amount"
  );
  assert.equal(adjustedV4.totals.estimateWideAdjustment?.percentage, 10);
  assert.ok(Number(adjustedV4.totals.estimateWideAdjustment?.exactAdjustment) > 0);

  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    revision: 1,
    scope: pricedScope
  });
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    // Real V4 path — proves Working Draft calculate honors persisted adjustment.
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

  const baseline = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {}
  });
  const baselineTotal = Number(baseline.calculation.total);
  assert.ok(baselineTotal > 0);

  const patched = await v2.patchWorkingDraftPricing({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      pricing: {
        estimateWideAdjustment: {
          active: true,
          percentage: 10,
          reason: "s&r",
          source: "manual"
        }
      }
    }
  });
  assert.equal(patched.editablePricing.estimateWideAdjustment.active, true);
  assert.equal(patched.editablePricing.estimateWideAdjustment.percentage, 10);
  assert.equal(patched.editablePricing.estimateWideAdjustment.reason, "s&r");
  const storedAfterPatch = await repo.getById(ORG, patched.estimateId);
  assert.equal(storedAfterPatch.scope.estimateWideAdjustment.active, true);
  assert.equal(storedAfterPatch.scope.estimateWideAdjustment.percentage, 10);
  assert.equal(storedAfterPatch.scope.estimateWideAdjustment.source, "manual");

  const withAdj = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {}
  });
  const adjustedTotal = Number(withAdj.calculation.total);
  assert.ok(
    adjustedTotal > baselineTotal,
    `Working Draft calculate with 10% EWA must raise total (baseline=${baselineTotal}, adjusted=${adjustedTotal})`
  );
  assert.ok(
    Number(withAdj.calculation.pricingBreakdown?.estimateWideAdjustmentAmount) > 0,
    "pricingBreakdown must surface real adjustment amount (not fake $0.00)"
  );
  assert.notEqual(
    withAdj.calculation.pricingBreakdown?.estimateWideAdjustmentAmount,
    0
  );

  const draft = await v2.getWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR
  });
  assert.ok(
    Number(draft.lastCalculation?.pricingBreakdown?.estimateWideAdjustmentAmount) > 0
  );
  assert.equal(draft.editableOptions?.accountAdjustment?.kind, "estimate_wide_adjustment");
  assert.equal(draft.editableOptions?.accountAdjustment?.amountKnown, true);
  assert.ok(Number(draft.editableOptions?.accountAdjustment?.amountExact) > 0);

  await v2.patchWorkingDraftPricing({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      pricing: {
        estimateWideAdjustment: {
          active: false,
          percentage: 0,
          reason: "",
          source: "manual"
        }
      }
    }
  });
  const cleared = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(
    Number(cleared.calculation.total),
    baselineTotal,
    "removing adjustment must restore baseline total after recalculate"
  );
  assert.ok(
    cleared.calculation.pricingBreakdown?.estimateWideAdjustmentAmount == null ||
      Number(cleared.calculation.pricingBreakdown.estimateWideAdjustmentAmount) === 0
  );

  const adapterSrc = readFileSync(join(__dirname, "elite100RoomPricingStudioAdapter.mjs"), "utf8");
  assert.ok(adapterSrc.includes("estimateWideAdjustment: normalizeEstimateWideAdjustment"));
  assert.ok(!adapterSrc.includes("ensureEditableEstimateDraft("));
  console.log(
    `ok: estimate-wide adjustment wiring (baseline=${baselineTotal}, +10%=${adjustedTotal}, cleared=${cleared.calculation.total})`
  );
}

console.log("\nAll Studio V2 Slice H tests passed.\n");
