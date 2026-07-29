/**
 * Persistent live Estimate Workspace contracts.
 * Run: node backend-core/src/elite100EstimateStudio/persistentLiveEstimateWorkspace.contract.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\npersistentLiveEstimateWorkspace.contract.test.mjs\n");

{
  const workspace = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/AiEstimatorWorkspace.tsx"),
    "utf8"
  );
  assert.match(workspace, /data-stable-mount="1"/);
  assert.match(workspace, /takeoffMountIdRef/);
  assert.equal(workspace.includes("takeoffRemountKey"), false);
  assert.equal(workspace.includes("takeoff-${takeoffRemountKey}-${takeoffMode}"), false);
  assert.match(workspace, /ensure-editable-draft/);
  assert.match(workspace, /We couldn’t start an editable draft\. Your published estimate was not changed\./);
  assert.equal(workspace.includes("Your estimate revision could not be opened"), false);
  assert.match(workspace, /Unified autosave/);
  assert.match(workspace, /Calculation updating/);
  assert.match(workspace, /mutationSeqRef/);
  assert.match(workspace, /persistentWorkspace/);
  // Stable src depends only on takeoffJobId
  assert.match(workspace, /}, \[takeoffJobId\]\);/);
  console.log("ok: Takeoff stable mount + transparent draft + unified autosave contracts");
}

{
  const sections = readFileSync(
    join(
      root,
      "app-elite100-estimate-studio/src/estimateQueue/estimateRecord/EstimateRecordSections.tsx"
    ),
    "utf8"
  );
  assert.match(sections, /Live Estimate/);
  assert.match(sections, /Draft estimate/);
  assert.equal(sections.includes('title="Verified Estimate"'), false);
  console.log("ok: Live Estimate section replaces approval-gated Verified Estimate");
}

{
  const commercial = readFileSync(
    join(
      root,
      "app-elite100-estimate-studio/src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"
    ),
    "utf8"
  );
  assert.match(commercial, /Additional Lines/);
  assert.match(commercial, /Add line/);
  assert.match(commercial, /Add Tear Out/);
  assert.match(commercial, /Save now/);
  assert.equal(commercial.includes("Add Crane $350"), false);
  assert.equal(commercial.includes('data-testid="eq-add-crane"'), false);
  assert.equal(commercial.includes("Add internal-only"), false);
  console.log("ok: Additional Lines simplification");
}

{
  const routes = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
    "utf8"
  );
  assert.match(routes, /ensure-editable-draft/);
  console.log("ok: ensure-editable-draft route exposed");
}

{
  // A. First edit on approved R1 auto-forks; Takeoff reopen soft-fails; R1 unchanged
  const repo = new InMemoryStudioEstimateRepository();
  let reopenCalls = 0;
  const studio = createStudioEstimateService({
    repository: repo,
    env: {},
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" }),
    loadLatestTakeoffResult: async () => null,
    reopenTakeoffForRevision: async () => {
      reopenCalls += 1;
      throw new Error("takeoff reopen blew up");
    }
  });
  const r1 = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: TAKEOFF,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: {
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          included: true,
          pieces: [
            { id: "sink", name: "Sink wall", included: true, lengthIn: 96, depthIn: 25.5 }
          ]
        }
      ],
      customLineItems: []
    },
    calculationSnapshot: {
      fingerprint: "fp-stable",
      pricingVersion: 4,
      totals: { exactTotal: 4122, customerDisplayTotal: 4120 }
    },
    approval: { approvedAt: new Date().toISOString(), calculationFingerprint: "fp-stable" }
  });

  const patched = await studio.updateScope({
    organizationId: ORG,
    estimateId: r1.id,
    actorUserId: ACTOR,
    body: {
      scope: {
        rooms: [
          {
            id: "kitchen",
            name: "Kitchen",
            included: true,
            pieces: [
              { id: "sink", name: "Sink wall", included: true, lengthIn: 120, depthIn: 25.5 }
            ]
          }
        ]
      }
    }
  });
  assert.equal(patched.revision, 2);
  assert.equal(patched.scope.rooms[0].pieces[0].lengthIn, 120);
  assert.equal(patched.transparentDraft, true);
  assert.equal(reopenCalls, 1);

  const prior = await repo.getById(ORG, r1.id);
  assert.equal(prior.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  assert.equal(prior.scope.rooms[0].pieces[0].lengthIn, 96);
  assert.equal(prior.calculationSnapshot.fingerprint, "fp-stable");

  // B. Live calculate without approval
  const calc = await studio.calculate({
    organizationId: ORG,
    estimateId: patched.id,
    actorUserId: ACTOR,
    body: {}
  });
  assert.ok(calc.calculation || calc.calculationSnapshot);
  assert.notEqual(calc.status, STUDIO_ESTIMATE_STATUSES.APPROVED);

  // C. Add Crane line + 3%
  const withCrane = await studio.updateScope({
    organizationId: ORG,
    estimateId: patched.id,
    actorUserId: ACTOR,
    body: {
      scope: {
        customLineItems: [
          {
            id: "crane",
            name: "Crane",
            quantity: 1,
            unitPrice: 350,
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
      }
    }
  });
  assert.equal(withCrane.scope.customLineItems[0].name, "Crane");
  assert.equal(withCrane.scope.estimateWideAdjustment.percentage, 3);

  console.log("ok: first-edit auto-fork + live calculate + crane line + R1 preservation");
}

console.log("\npersistentLiveEstimateWorkspace.contract.test.mjs: ok\n");
