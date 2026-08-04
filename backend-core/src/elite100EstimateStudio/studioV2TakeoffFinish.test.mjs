/**
 * Studio V2 takeoff finish — Use these measurements.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2TakeoffFinish.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES, emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";
import { seedScopeFromTakeoffPayload } from "./studioEstimateService.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const JOB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

console.log("\nstudioV2TakeoffFinish.test.mjs\n");

function sampleImportPayload() {
  return {
    schemaVersion: "1",
    takeoffJobId: JOB,
    takeoffResultId: "result-1",
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        guidedShapeGroups: [
          {
            label: "Main",
            shapeType: "counter",
            pieces: [
              {
                label: "Main Run",
                pieceType: "counter",
                lengthIn: 96,
                depthIn: 25.5,
                shape: "rect"
              }
            ]
          }
        ],
        pieces: [{ name: "Main Run", reviewStatus: "approved" }]
      }
    ],
    fabricationQuantities: { addOnQuantities: { "qty-sink": 1 } },
    scopeSummary: { edgeEligibleLinearFeet: 8 }
  };
}

function serviceWithTakeoff(repo, opts = {}) {
  let approveCalls = 0;
  return {
    v2: createStudioV2Service({
      repository: repo,
      env: {},
      calculateStudioEstimateImpl: async () => {
        throw new Error("calculate must not run during takeoff finish");
      },
      approveAndBuildEstimate: async () => {
        approveCalls += 1;
        if (opts.approveFail) {
          const err = new Error("blocking");
          err.code = "approval_hard_blockers";
          err.statusCode = 422;
          throw err;
        }
        return { ok: true, reviewStatus: "approved" };
      },
      loadTakeoffWorkspace: async () => ({
        reviewStatus: "approved",
        approvedAt: "2026-08-04T00:00:00.000Z",
        approvedByUserId: ACTOR,
        latestResult: { id: "result-1" }
      }),
      loadLatestTakeoffResult: async () => ({
        id: "result-1",
        importPayload: sampleImportPayload(),
        normalizedTakeoffJson: {
          rooms: [{ name: "Kitchen", areas: [{ runs: [{ lengthIn: 96, depthIn: 25.5 }] }] }]
        },
        reviewState: {},
        computedMeasurementsJson: {},
        validationDiagnosticsJson: { diagnostics: [] }
      }),
      studioDigitalEstimateService: {
        async publish() {
          throw new Error("must not publish");
        },
        async assessReadiness() {
          return null;
        },
        async getWorkspacePublicationSummary() {
          return { publicationSummary: { state: "not_published", active: false } };
        }
      }
    }),
    getApproveCalls: () => approveCalls
  };
}

{
  const repo = new InMemoryStudioEstimateRepository();
  const { v2, getApproveCalls } = serviceWithTakeoff(repo);
  const first = await v2.finishTakeoffIntoWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { confirmed: true, takeoffJobId: JOB }
  });
  assert.equal(first.ok, true);
  assert.equal(first.finished, true);
  assert.ok(first.estimateId);
  assert.ok(first.scopeSummary?.roomCount >= 1);
  assert.equal(first.sideEffects.calculated, false);
  assert.equal(first.sideEffects.published, false);
  assert.equal(first.sideEffects.sold, false);
  assert.ok(getApproveCalls() >= 1);

  const row = await repo.getActiveByIntakeCase(ORG, CASE_ID);
  assert.equal(row.takeoffJobId, JOB);
  assert.ok(!row.approval);
  assert.ok(!row.calculationSnapshot);

  const second = await v2.finishTakeoffIntoWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { confirmed: true, takeoffJobId: JOB }
  });
  assert.equal(second.ok, true);
  assert.equal(second.alreadyLoaded, true);
  assert.equal(second.estimateId, first.estimateId);
  assert.match(String(second.message || ""), /loaded into this draft/i);
  const listed = await repo.listByIntakeCase(ORG, CASE_ID);
  assert.equal(listed.filter((r) => r.status !== STUDIO_ESTIMATE_STATUSES.SUPERSEDED).length, 1);
  console.log("ok: finish creates draft+imports; retry is idempotent / already-loaded");
}

{
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: JOB,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    scope: {
      ...emptyStudioEstimateScope(),
      estimateOrigin: "email_ai_takeoff",
      physicalScopeSource: "takeoff",
      rooms: seedScopeFromTakeoffPayload(sampleImportPayload(), emptyStudioEstimateScope()).rooms
    }
  });
  const { v2 } = serviceWithTakeoff(repo);
  const again = await v2.finishTakeoffIntoWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { confirmed: true, takeoffJobId: JOB }
  });
  assert.equal(again.alreadyLoaded, true);
  console.log("ok: already-loaded scope returns neutral loaded state");
}

{
  await assert.rejects(
    () =>
      serviceWithTakeoff(new InMemoryStudioEstimateRepository()).v2.finishTakeoffIntoWorkingDraft({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { confirmed: false, takeoffJobId: JOB }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  console.log("ok: confirm required");
}

{
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2TakeoffReviewPanel.tsx"),
    "utf8"
  );
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const importPanel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2TakeoffImportPanel.tsx"),
    "utf8"
  );
  const editor = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ScopeEditor.tsx"),
    "utf8"
  );
  const routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");
  const approveClick = readFileSync(
    join(root, "app-ai-takeoff/src/lib/consolidatedApproveClick.mjs"),
    "utf8"
  );

  assert.match(panel, /studioV2Finish=1/);
  assert.match(panel, /Use these measurements/);
  assert.match(panel, /aiTakeoffHeadUrl/);
  assert.doesNotMatch(panel, /from\s+["'].*AiEstimatorWorkspace["']/);
  assert.doesNotMatch(panel, /completeApprovalHandoff|refresh-from-takeoff/);
  assert.match(shell, /StudioV2TakeoffReviewPanel/);
  assert.match(shell, /fetchIntakeSourcePlans|planPreviewUrl/);
  assert.doesNotMatch(shell, /Create or open it in V1 first/);
  assert.doesNotMatch(shell, /Open in V1 \(Legacy fallback\)/);
  assert.match(importPanel, /Use these measurements/);
  assert.match(importPanel, /Takeoff scope is loaded into this draft/);
  assert.match(importPanel, /No takeoff has been started for this case/);
  assert.doesNotMatch(importPanel, /must be reviewed and approved before importing/);
  assert.doesNotMatch(editor, /Plan preview will be added when V2 intake\/attachment links are wired/);
  assert.match(routes, /takeoff-finish/);
  assert.match(approveClick, /Use these measurements/);
  assert.doesNotMatch(
    readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8").slice(
      readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8").indexOf(
        "async function finishTakeoffIntoWorkingDraft"
      ),
      readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8").indexOf(
        "async function finishTakeoffIntoWorkingDraft"
      ) + 4500
    ),
    /calculateWorkingDraft|publishApproved|markSold|simplified-publish|ensure-editable-draft/
  );
  console.log("ok: UI/route contracts for embedded Takeoff Review + finish");
}

console.log("\nAll Studio V2 takeoff-finish tests passed.\n");
