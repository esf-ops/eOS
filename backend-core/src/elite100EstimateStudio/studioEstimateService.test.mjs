/**
 * Studio estimate service + pricing tests.
 * Run: node backend-core/src/elite100EstimateStudio/studioEstimateService.test.mjs
 */
import assert from "node:assert/strict";
import { InMemoryStudioEstimateRepository } from "./studioEstimateRepository.mjs";
import { createStudioEstimateService, seedScopeFromTakeoffPayload } from "./studioEstimateService.mjs";
import {
  calculateStudioEstimate,
  collectUnresolvedItems
} from "./studioEstimatePricing.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import {
  resolveStudioMaterialRatePerSf,
  WATTS_PROMO_RATE_PER_SF
} from "./studioEstimateTrustedAccounts.mjs";
import { ESF_DIRECT_PRICE_PER_SQFT, PROTOTYPE_TIER_PRICE_PER_SQFT } from "../quotes/quoteCalculator.js";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WATTS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPAHN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_MARKUP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

console.log("\nstudioEstimateService.test.mjs\n");

{
  const rate = resolveStudioMaterialRatePerSf({
    materialGroup: "Group Promo",
    pricingBasis: "direct",
    partnerAccountId: WATTS_ID,
    env: { ELITE100_TRUSTED_WATTS_PARTNER_ACCOUNT_IDS: WATTS_ID }
  });
  assert.equal(rate.rate, WATTS_PROMO_RATE_PER_SF);
  assert.equal(rate.wattsOverrideApplied, true);

  const normal = resolveStudioMaterialRatePerSf({
    materialGroup: "Group Promo",
    pricingBasis: "direct",
    partnerAccountId: null,
    env: {}
  });
  assert.equal(normal.rate, ESF_DIRECT_PRICE_PER_SQFT["Group Promo"]);
  console.log("ok: Watts Promo override uses trusted partner_account_id only");
}

{
  assert.equal(ESF_DIRECT_PRICE_PER_SQFT["Group A"], 77);
  assert.equal(PROTOTYPE_TIER_PRICE_PER_SQFT["Group A"], 57);
  assert.equal(ESF_DIRECT_PRICE_PER_SQFT["Remnant"], 50);
  console.log("ok: Direct/Wholesale material tables match quoteCalculator authority");
}

{
  const env = {
    ELITE100_TRUSTED_SPAHN_PARTNER_ACCOUNT_IDS: SPAHN_ID,
    ELITE100_INTERNAL_MARKUP_ALLOWED_USER_IDS: USER_MARKUP
  };
  const scope = {
    materialGroup: "Group Promo",
    pricingBasis: "direct",
    partnerAccountId: SPAHN_ID,
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        included: true,
        countertopSqft: 100,
        backsplashSqft: 0,
        pieces: []
      }
    ],
    addOns: { "qty-sink": 1, tearout: 1 },
    edgeMode: "included",
    internalMarkupPercent: 0
  };
  const calc = await calculateStudioEstimate({ scope, actorUserId: USER_MARKUP, env });
  // 100 * 70 = 7000 material; tax 140; sink 200; tearout 750; subtotal 8090; spahn 3% = 242.7
  assert.equal(calc.material.subtotal, 7000);
  assert.equal(calc.material.useTaxAmount, 140);
  assert.equal(calc.fabrication.subtotal, 950);
  assert.equal(calc.account.spahnTrusted, true);
  assert.equal(calc.account.accountAdjustment, 242.7);
  assert.equal(calc.totals.exactInternalTotal, 8332.7);
  console.log("ok: 2% use tax once; Spahn 3% after tax; known add-ons");
}

{
  const items = collectUnresolvedItems({ addOns: { "qty-blanco": 1 }, edgeMode: "waterfall" });
  assert.ok(items.some((i) => i.code === "qty-blanco"));
  assert.ok(items.some((i) => i.code === "waterfall_commercial"));
  console.log("ok: unresolved commercial items detected");
}

{
  await assert.rejects(
    () =>
      calculateStudioEstimate({
        scope: {
          materialGroup: "Group A",
          pricingBasis: "direct",
          rooms: [{ id: "r1", included: true, countertopSqft: 10, backsplashSqft: 0, pieces: [] }],
          addOns: {},
          internalMarkupPercent: 10
        },
        actorUserId: "unauthorized-user",
        env: { ELITE100_INTERNAL_MARKUP_ALLOWED_USER_IDS: USER_MARKUP }
      }),
    (e) => e.code === "markup_forbidden"
  );
  console.log("ok: unauthorized internal markup rejected");
}

{
  const repo = new InMemoryStudioEstimateRepository();
  let takeoffApproved = false;
  let resultId = "result-1";
  const service = createStudioEstimateService({
    repository: repo,
    env: {},
    loadTakeoffWorkspace: async () => ({
      takeoffJobId: "job-1",
      reviewStatus: takeoffApproved ? "approved" : "needs_review",
      approvedAt: takeoffApproved ? "2026-07-16T00:00:00Z" : null,
      latestResult: { id: resultId }
    }),
    loadLatestTakeoffResult: async () => ({
      id: resultId,
      normalizedTakeoffJson: {
        rooms: [
          {
            id: "room-1",
            name: "Kitchen",
            areas: [
              {
                runs: [{ id: "run-1", label: "Run A", lengthIn: 96, depthIn: 25.5, shape: "rect" }]
              }
            ]
          }
        ]
      },
      computedMeasurementsJson: {},
      validationDiagnosticsJson: { diagnostics: [] },
      reviewState: null
    }),
    calculateStudioEstimateImpl: async ({ scope }) =>
      calculateStudioEstimate({
        scope,
        actorUserId: USER_MARKUP,
        env: { ELITE100_INTERNAL_MARKUP_ALLOWED_USER_IDS: USER_MARKUP }
      })
  });

  const first = await service.getOrCreateForCase({
    organizationId: ORG_A,
    intakeCaseId: "case-1",
    takeoffJobId: "job-1",
    actorUserId: "user-1"
  });
  assert.equal(first.status, STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL);

  await assert.rejects(
    () =>
      service.calculate({
        organizationId: ORG_A,
        estimateId: first.id,
        actorUserId: "user-1",
        body: {}
      }),
    (e) => e.code === "needs_takeoff_approval"
  );
  console.log("ok: cannot calculate before Takeoff approval");

  takeoffApproved = true;
  const seeded = await service.getOrCreateForCase({
    organizationId: ORG_A,
    intakeCaseId: "case-1",
    takeoffJobId: "job-1",
    actorUserId: "user-1"
  });
  assert.equal(seeded.id, first.id);
  assert.ok(seeded.scope.rooms.length >= 1);
  assert.equal(seeded.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  console.log("ok: approved Takeoff seeds room scope; reopen returns same estimate");

  await assert.rejects(
    () =>
      service.calculate({
        organizationId: ORG_A,
        estimateId: seeded.id,
        actorUserId: USER_MARKUP,
        body: { exactInternalTotal: 1, organizationId: ORG_B, useTaxPercent: 99 }
      }),
    (e) => e.code === "forbidden_caller_authority"
  );
  console.log("ok: client-supplied totals/rates/org are rejected");

  const priced = await service.calculate({
    organizationId: ORG_A,
    estimateId: seeded.id,
    actorUserId: USER_MARKUP,
    body: {}
  });
  assert.equal(priced.status, STUDIO_ESTIMATE_STATUSES.PRICED);
  assert.ok(priced.calculation?.totals?.exactInternalTotal > 0);

  await service.updateScope({
    organizationId: ORG_A,
    estimateId: priced.id,
    actorUserId: "user-1",
    body: { addOns: { "qty-sink": 1 }, unresolvedManualReview: false }
  });
  const priced2 = await service.calculate({
    organizationId: ORG_A,
    estimateId: priced.id,
    actorUserId: USER_MARKUP,
    body: {}
  });
  // Force unresolved item then ensure approval blocks without manual review.
  await service.updateScope({
    organizationId: ORG_A,
    estimateId: priced2.id,
    actorUserId: "user-1",
    body: { addOns: { "qty-blanco": 1 }, unresolvedManualReview: false }
  });
  const pricedBlocked = await service.calculate({
    organizationId: ORG_A,
    estimateId: priced2.id,
    actorUserId: USER_MARKUP,
    body: {}
  });
  await assert.rejects(
    () =>
      service.approve({
        organizationId: ORG_A,
        estimateId: pricedBlocked.id,
        actorUserId: "user-1",
        body: { confirm: true }
      }),
    (e) => e.code === "unresolved_items"
  );
  await service.updateScope({
    organizationId: ORG_A,
    estimateId: priced2.id,
    actorUserId: "user-1",
    body: { addOns: { "qty-sink": 1 }, unresolvedManualReview: false }
  });
  const priced2b = await service.calculate({
    organizationId: ORG_A,
    estimateId: priced2.id,
    actorUserId: USER_MARKUP,
    body: {}
  });
  const approved = await service.approve({
    organizationId: ORG_A,
    estimateId: priced2b.id,
    actorUserId: "user-1",
    body: { confirm: true }
  });
  assert.equal(approved.status, STUDIO_ESTIMATE_STATUSES.APPROVED);

  const again = await service.approve({
    organizationId: ORG_A,
    estimateId: priced2b.id,
    actorUserId: "user-1",
    body: { confirm: true }
  });
  assert.equal(again.approval.calculationFingerprint, approved.approval.calculationFingerprint);
  console.log("ok: approve idempotent for same calculation snapshot");
  console.log("ok: unresolved commercial items block approval");

  await service.updateScope({
    organizationId: ORG_A,
    estimateId: priced2b.id,
    actorUserId: "user-1",
    body: { materialGroup: "Group B" }
  });
  const stale = await service.getOrCreateForCase({
    organizationId: ORG_A,
    intakeCaseId: "case-1",
    takeoffJobId: "job-1",
    actorUserId: "user-1"
  });
  assert.notEqual(stale.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.ok(stale.staleReason);
  assert.notEqual(stale.id, priced2b.id, "scope change after approval opens a new revision");
  assert.equal(stale.revision, Number(priced2b.revision || 1) + 1);
  const history = await repo.listByIntakeCase(ORG_A, "case-1");
  const prior = history.find((r) => r.id === priced2b.id);
  assert.equal(prior?.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  assert.equal(prior?.approval?.calculationFingerprint, approved.approval.calculationFingerprint);
  console.log("ok: approval becomes stale after scope change; approved snapshot preserved");

  // Approve while Takeoff snapshot is still result-1, then flip snapshot.
  const priced3 = await service.calculate({
    organizationId: ORG_A,
    estimateId: stale.id,
    actorUserId: USER_MARKUP,
    body: {}
  });
  await service.approve({
    organizationId: ORG_A,
    estimateId: priced3.id,
    actorUserId: "user-1",
    body: { confirm: true }
  });
  resultId = "result-2";
  const afterTakeoffChange = await service.getOrCreateForCase({
    organizationId: ORG_A,
    intakeCaseId: "case-1",
    takeoffJobId: "job-1",
    actorUserId: "user-1"
  });
  assert.notEqual(afterTakeoffChange.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  console.log("ok: approval becomes stale after Takeoff snapshot change");

  const otherOrg = await service.getOrCreateForCase({
    organizationId: ORG_B,
    intakeCaseId: "case-1",
    takeoffJobId: "job-9",
    actorUserId: "user-2"
  });
  assert.notEqual(otherOrg.id, first.id);
  assert.equal(await repo.getById(ORG_B, first.id), null);
  console.log("ok: different organizations cannot access each other's estimates");
}

{
  const payload = {
    takeoffJobId: "job",
    takeoffResultId: "res",
    rooms: [
      {
        name: "Bath",
        type: "Bathroom",
        guidedShapeGroups: [
          {
            label: "Vanity",
            shapeType: "rect",
            pieces: [{ label: "Top", pieceType: "counter", lengthIn: 60, depthIn: 22, shape: "rect" }]
          }
        ],
        pieces: [{ name: "Top", pieceType: "counter", lengthIn: 60, depthIn: 22, sqft: 9.17 }]
      }
    ]
  };
  const scope = seedScopeFromTakeoffPayload(payload);
  assert.equal(scope.rooms[0].name, "Bath");
  assert.ok(scope.rooms[0].pieces.length >= 1);
  console.log("ok: Takeoff payload seeds room/piece scope");
}

console.log("\nAll studioEstimateService tests passed.\n");
