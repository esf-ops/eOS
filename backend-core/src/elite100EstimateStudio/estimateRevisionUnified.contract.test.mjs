/**
 * Unified estimate revision editing + commercial save route regression.
 * Run: node backend-core/src/elite100EstimateStudio/estimateRevisionUnified.contract.test.mjs
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

console.log("\nestimateRevisionUnified.contract.test.mjs\n");

{
  const workspace = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/AiEstimatorWorkspace.tsx"),
    "utf8"
  );
  assert.match(
    workspace,
    /apiPatch\(\s*`\/api\/elite100-estimate-studio\/estimates\/\$\{encodeURIComponent\(estimateId\)\}`/
  );
  assert.equal(
    workspace.includes("/estimates/${encodeURIComponent(estimateId)}/scope"),
    false,
    "must not POST obsolete …/scope path"
  );
  assert.match(workspace, /Your estimate adjustments were not saved\. Try again\./);
  assert.match(workspace, /eq-edit-estimate/);
  assert.equal(workspace.includes("Create Measurement Revision"), false);
  assert.match(workspace, /editEstimate/);
  assert.match(workspace, /setRevisionSaveStatus\("Saved"\)/);
  assert.match(workspace, /setRevisionSaveStatus\("Save failed"\)/);
  console.log("ok: production commercial-save route + Edit Estimate + save-status truth");
}

{
  const commercial = readFileSync(
    join(
      root,
      "app-elite100-estimate-studio/src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"
    ),
    "utf8"
  );
  assert.match(commercial, /async function save\(/);
  assert.match(commercial, /await props\.onSave\(/);
  assert.match(commercial, /remain dirty so Saved cannot appear after failure/);
  const sections = readFileSync(
    join(
      root,
      "app-elite100-estimate-studio/src/estimateQueue/estimateRecord/EstimateRecordSections.tsx"
    ),
    "utf8"
  );
  assert.match(sections, /Edit Estimate/);
  assert.match(sections, /eq-edit-estimate/);
  assert.equal(sections.includes("Create Measurement Revision"), false);
  console.log("ok: failed-save status truth + unified Edit Estimate labels");
}

{
  const routes = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
    "utf8"
  );
  assert.match(routes, /app\.patch\(\s*"\/api\/elite100-estimate-studio\/estimates\/:estimateId"/);
  assert.match(routes, /open-measurement-revision/);
  assert.equal(routes.includes('"/api/elite100-estimate-studio/estimates/:estimateId/scope"'), false);
  console.log("ok: backend exposes PATCH estimate + open-measurement-revision only");
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

  const created = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: TAKEOFF,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: {
      projectName: "",
      rooms: [
        {
          id: "room-kitchen-1",
          name: "Kitchen",
          included: true,
          pieces: [
            {
              id: "p-sink",
              name: "Sink wall",
              included: true,
              lengthIn: 96,
              depthIn: 25.5
            },
            {
              id: "p-island",
              name: "Kitchen Island",
              included: true,
              lengthIn: 84,
              depthIn: 36
            }
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
        active: false,
        percentage: 0,
        reason: "",
        source: "manual"
      }
    },
    calculationSnapshot: {
      fingerprint: "fp-r1",
      pricingVersion: 4,
      totals: { customerDisplayTotal: 4122, exactInternalTotal: 4122 }
    },
    approval: {
      approvedAt: new Date().toISOString(),
      calculationFingerprint: "fp-r1",
      customerDisplayTotal: 4122
    }
  });

  const opened = await studio.openMeasurementRevision({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(opened.ok, true);
  assert.equal(opened.estimate.revision, 2);
  assert.equal(opened.estimate.scope.rooms[0].pieces[0].lengthIn, 96);
  assert.equal(opened.estimate.scope.rooms[0].pieces[1].name, "Kitchen Island");
  assert.ok(
    Array.isArray(opened.estimate.scope.customLineItems),
    "R2 preloads commercial custom lines"
  );

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
        customLineItems: opened.estimate.scope.customLineItems
      }
    }
  });
  assert.equal(patched.scope.estimateWideAdjustment.percentage, 3);
  assert.equal(patched.scope.estimateWideAdjustment.reason, "Spahn & Rose account pricing");

  const calculated = await studio.calculate({
    organizationId: ORG,
    estimateId: opened.estimate.id,
    actorUserId: ACTOR,
    body: {}
  });
  assert.ok(calculated.calculationSnapshot || calculated.calculation);

  const prior = await repo.getById(ORG, created.id);
  assert.equal(prior.status, STUDIO_ESTIMATE_STATUSES.APPROVED, "R1 preserved");
  assert.notEqual(prior.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);

  const reloaded = await repo.getById(ORG, opened.estimate.id);
  assert.equal(reloaded.scope.estimateWideAdjustment.percentage, 3, "3% persists after reload");
  console.log("ok: unified Edit Estimate revision + 3% save/reload + R1 preservation");
}

console.log("\nAll estimateRevisionUnified contracts passed.\n");
