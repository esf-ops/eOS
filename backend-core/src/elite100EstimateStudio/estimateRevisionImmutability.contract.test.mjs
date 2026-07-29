/**
 * Approved/published revision freeze + Account Adjustment reconciliation.
 * Run: node backend-core/src/elite100EstimateStudio/estimateRevisionImmutability.contract.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { buildCommercialConfiguration } from "./studioCommercialConfiguration.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nestimateRevisionImmutability.contract.test.mjs\n");

function money(n) {
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  });
}

{
  const commercial = readFileSync(
    join(
      root,
      "app-elite100-estimate-studio/src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"
    ),
    "utf8"
  );
  assert.match(commercial, /Verified base estimate/);
  assert.match(commercial, /Eligible additional charges/);
  assert.match(commercial, /Account-adjustment basis/);
  assert.match(commercial, /Non-percentage customer credit/);
  assert.match(commercial, /Updated exact total/);
  assert.match(commercial, /Customer display total/);
  assert.equal(commercial.includes("Current customer total"), false);
  assert.match(commercial, /data-editable=\{props\.editable \? "1" : "0"\}/);
  assert.match(commercial, /Read-only for this revision/);
  assert.match(commercial, /not in percentage basis/);
  // Save Draft / Add item only inside editable branches
  assert.match(commercial, /\{props\.editable \? \([\s\S]*Save Draft/);
  assert.match(commercial, /\{props\.editable \? \([\s\S]*eq-add-custom-line/);
  console.log("ok: Account Adjustment labels + readonly gates in Estimate Adjustments UI");
}

{
  const workspace = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/AiEstimatorWorkspace.tsx"),
    "utf8"
  );
  assert.match(workspace, /adjustmentsEditable/);
  assert.match(workspace, /!measurementsApproved/);
  assert.match(workspace, /Edit Estimate/);
  assert.equal(workspace.includes("Create Measurement Revision"), false);
  assert.equal(workspace.includes("Approve Revised Measurements"), false);
  assert.match(workspace, /Publish Revised Estimate/);
  console.log("ok: production workspace freezes adjustments when estimate approved");
}

{
  const harness = readFileSync(
    join(root, "app-elite100-estimate-studio/src/review/EstimateRecordReviewApp.tsx"),
    "utf8"
  );
  assert.match(harness, /commercialEditable/);
  assert.match(harness, /revision_draft/);
  assert.equal(harness.includes('stage === "approved"'), true);
  // approved stage must not force commercial editable
  assert.doesNotMatch(
    harness,
    /commercialEditable\s*=\s*[\s\S]{0,200}stage === "approved"/
  );
  console.log("ok: review harness commercialEditable excludes approved/published");
}

{
  const fixtures = await import(
    pathToFileURL(join(root, "app-elite100-estimate-studio/src/review/munstermanFixtures.mjs")).href
  );
  const approved = fixtures.buildScenario("approved");
  assert.equal(approved.commercial.editable, false);
  assert.equal(approved.takeoffMode, "readonly");
  const adj = approved.commercial.estimateAdjustment;
  assert.equal(adj.verifiedBaseExact, 4122);
  assert.equal(adj.eligibleAdditionalChargesExact, 1100);
  assert.equal(adj.eligibleBasisExact, 5222);
  assert.equal(adj.exactAdjustment, 156.66);
  assert.equal(adj.nonPercentageCommercialExact, -100);
  assert.equal(adj.adjustedExactTotal, 5278.66);
  assert.equal(adj.customerDisplayTotal, 5280);
  assert.equal(money(adj.verifiedBaseExact), "$4,122.00");
  assert.equal(money(adj.eligibleAdditionalChargesExact), "$1,100.00");
  assert.equal(money(adj.eligibleBasisExact), "$5,222.00");
  assert.equal(money(adj.exactAdjustment), "$156.66");
  assert.equal(money(adj.nonPercentageCommercialExact), "-$100.00");
  assert.equal(money(adj.adjustedExactTotal), "$5,278.66");
  assert.equal(money(adj.customerDisplayTotal), "$5,280.00");

  const published = fixtures.buildScenario("published");
  assert.equal(published.commercial.editable, false);
  assert.equal(published.takeoffMode, "readonly");

  const r2 = fixtures.buildScenario("r2");
  assert.equal(r2.commercial.editable, true);
  assert.equal(r2.takeoffMode, "editable");
  assert.match(r2.revisionBanner || "", /Editing Revision R2/);
  assert.equal((r2.revisionBanner || "").includes("measurement revision"), false);

  console.log("ok: fixture approved/published frozen; R2 editable; math presentation");
}

{
  // Server read-model reconciliation for the Munsterman-shaped commercial payload
  const estimate = {
    status: "approved",
    approval: { approvedAt: "2026-07-29T14:00:00.000Z" },
    revision: 1,
    scope: {
      customLineItems: [
        {
          id: "tear",
          name: "Tear Out",
          quantity: 1,
          unitPrice: 750,
          commercialRole: "customer_charge",
          percentageEligible: true,
          customerFacing: true
        },
        {
          id: "crane",
          name: "Crane",
          quantity: 1,
          unitPrice: 350,
          commercialRole: "customer_charge",
          percentageEligible: true,
          customerFacing: true
        },
        {
          id: "credit",
          name: "Courtesy credit",
          quantity: 1,
          unitPrice: -100,
          commercialRole: "customer_credit",
          percentageEligible: false,
          customerFacing: true
        }
      ],
      estimateWideAdjustment: {
        active: true,
        percentage: 3,
        reason: "Spahn & Rose account pricing",
        source: "manual"
      }
    },
    calculation: {
      totals: {
        roomTotalsSum: 4122,
        exactTotal: 5278.66,
        accountAdjustment: 156.66,
        customerDisplayTotal: 5280,
        estimateCustomerFacingTotal: 1000,
        estimateHiddenCustomerChargeTotal: 0
      }
    }
  };
  const cfg = buildCommercialConfiguration(estimate);
  assert.equal(cfg.editable, false);
  assert.equal(cfg.estimateAdjustment.verifiedBaseExact, 4122);
  assert.equal(cfg.estimateAdjustment.eligibleAdditionalChargesExact, 1100);
  assert.equal(cfg.estimateAdjustment.eligibleBasisExact, 5222);
  assert.equal(cfg.estimateAdjustment.exactAdjustment, 156.66);
  assert.equal(cfg.estimateAdjustment.nonPercentageCommercialExact, -100);
  assert.equal(cfg.estimateAdjustment.adjustedExactTotal, 5278.66);
  assert.equal(cfg.estimateAdjustment.customerDisplayTotal, 5280);
  console.log("ok: buildCommercialConfiguration reconciliation fixture math");
}

{
  const repo = new InMemoryStudioEstimateRepository();
  const studio = createStudioEstimateService({
    repository: repo,
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    loadTakeoffWorkspace: async () => ({
      reviewStatus: "approved",
      approvedAt: new Date().toISOString()
    }),
    loadLatestTakeoffResult: async () => null
  });

  const r1Scope = {
    projectName: "Munsterman Plan",
    rooms: [
      {
        id: "room-kitchen-1",
        name: "Kitchen",
        included: true,
        pieces: [
          { id: "p-sink", name: "Sink wall", included: true, lengthIn: 96, depthIn: 25.5 }
        ]
      }
    ],
    customLineItems: [
      {
        id: "tear",
        name: "Tear Out",
        quantity: 1,
        unitPrice: 750,
        commercialRole: "customer_charge",
        percentageEligible: true,
        customerFacing: true
      }
    ],
    estimateWideAdjustment: {
      active: true,
      percentage: 3,
      reason: "Spahn & Rose account pricing",
      source: "manual"
    }
  };

  const created = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: TAKEOFF,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: r1Scope,
    calculationSnapshot: {
      fingerprint: "fp-r1-immutable",
      pricingVersion: 4,
      totals: {
        roomTotalsSum: 4122,
        exactTotal: 5278.66,
        accountAdjustment: 156.66,
        customerDisplayTotal: 5280
      }
    },
    approval: {
      approvedAt: new Date().toISOString(),
      calculationFingerprint: "fp-r1-immutable",
      customerDisplayTotal: 5280
    }
  });

  const r1Before = JSON.stringify(await repo.getById(ORG, created.id));

  let approvedRejected = false;
  try {
    await studio.updateScope({
      organizationId: ORG,
      estimateId: created.id,
      actorUserId: ACTOR,
      body: {
        scope: {
          estimateWideAdjustment: {
            active: true,
            percentage: 5,
            reason: "should not stick",
            source: "manual"
          }
        }
      }
    });
  } catch (e) {
    approvedRejected =
      e?.code === "estimate_revision_not_editable" && e?.statusCode === 409;
  }
  assert.equal(approvedRejected, true, "approved R1 rejected");

  // Published snapshot (approval + publication marker) also rejected
  const stored = repo.byId.get(created.id);
  assert.ok(stored);
  stored.publishedAt = new Date().toISOString();
  stored.publication = { active: true, customerUrl: "https://example.test/de/r1" };
  let publishedRejected = false;
  try {
    await studio.updateScope({
      organizationId: ORG,
      estimateId: created.id,
      actorUserId: ACTOR,
      body: { scope: { projectName: "mutated" } }
    });
  } catch (e) {
    publishedRejected =
      e?.code === "estimate_revision_not_editable" && e?.statusCode === 409;
  }
  assert.equal(publishedRejected, true, "published R1 rejected");

  const opened = await studio.openMeasurementRevision({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(opened.estimate.revision, 2);

  const patched = await studio.updateScope({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: {
      scope: {
        estimateWideAdjustment: {
          active: true,
          percentage: 3,
          reason: "Spahn & Rose account pricing",
          source: "manual"
        },
        customLineItems: [
          ...(opened.estimate.scope.customLineItems || []),
          {
            id: "crane",
            name: "Crane",
            quantity: 1,
            unitPrice: 350,
            commercialRole: "customer_charge",
            percentageEligible: true,
            customerFacing: true
          }
        ]
      }
    }
  });
  assert.equal(patched.scope.estimateWideAdjustment.percentage, 3);
  assert.ok(
    (patched.scope.customLineItems || []).some((l) => l.name === "Crane"),
    "draft R2 accepts commercial mutation"
  );

  const r1After = JSON.stringify(await repo.getById(ORG, created.id));
  // Strip volatile published fields we added for the published check — compare core snapshot
  const beforeObj = JSON.parse(r1Before);
  const afterObj = JSON.parse(r1After);
  assert.equal(afterObj.scope.estimateWideAdjustment.percentage, 3);
  assert.equal(afterObj.scope.estimateWideAdjustment.reason, "Spahn & Rose account pricing");
  assert.equal(afterObj.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.deepEqual(afterObj.scope.customLineItems, beforeObj.scope.customLineItems);
  assert.deepEqual(afterObj.scope.rooms, beforeObj.scope.rooms);
  assert.equal(afterObj.calculationSnapshot?.fingerprint, "fp-r1-immutable");
  console.log("ok: API guard — approved/published rejected; draft R2 accepted; R1 scope unchanged");
}

{
  const takeoff = readFileSync(
    join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.match(takeoff, /Editing Revision R\$\{urlWorkspace\.revisionNumber\}/);
  assert.equal(takeoff.includes("Editing measurement revision"), false);
  console.log("ok: Takeoff uses Editing Revision Rn wording");
}

console.log("\nestimateRevisionImmutability.contract.test.mjs: ok\n");
