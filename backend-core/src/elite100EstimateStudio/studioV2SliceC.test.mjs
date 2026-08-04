/**
 * Elite 100 Studio V2 Slice C — controlled Takeoff import contracts.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceC.test.mjs
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
const CASE_EMPTY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

console.log("\nstudioV2SliceC.test.mjs\n");

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
        pieces: [
          {
            name: "Main Run",
            finishedEdge: {
              frontEdgeLengthIn: 96,
              totalFinishedEdgeLengthIn: 96,
              approved: true
            },
            reviewStatus: "approved"
          }
        ]
      }
    ],
    fabricationQuantities: { addOnQuantities: { "qty-sink": 1 } },
    scopeSummary: { edgeEligibleLinearFeet: 8 }
  };
}

function emptyAiRow(overrides = {}) {
  return {
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: JOB,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL,
    revision: 1,
    scope: {
      ...emptyStudioEstimateScope(),
      projectName: "Import Me",
      customerName: "Acme",
      estimateOrigin: "email_ai_takeoff",
      physicalScopeSource: "takeoff",
      rooms: []
    },
    ...overrides
  };
}

const fakeCalc = {
  fingerprint: "v2c-fp",
  calculatedAt: "2026-07-30T19:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 900, customerDisplayTotal: 910 },
  warnings: [],
  unresolvedItems: []
};

function serviceWithTakeoff(repo, opts = {}) {
  const importPayload = opts.importPayload ?? sampleImportPayload();
  const reviewStatus = opts.reviewStatus ?? "approved";
  return createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async ({ scope }) => ({
      ...fakeCalc,
      totals: {
        exactTotal: Number(scope?.rooms?.[0]?.pieces?.[0]?.lengthIn) || 0,
        customerDisplayTotal: Number(scope?.rooms?.[0]?.pieces?.[0]?.lengthIn) || 0
      }
    }),
    loadTakeoffWorkspace: async () =>
      opts.noWorkspace
        ? (() => {
            const err = new Error("missing");
            err.statusCode = 404;
            throw err;
          })()
        : {
            reviewStatus,
            approvedAt: "2026-07-30T00:00:00.000Z",
            approvedByUserId: ACTOR,
            latestResult: { id: "result-1" }
          },
    loadLatestTakeoffResult: async () =>
      opts.noLatest
        ? null
        : {
            id: "result-1",
            importPayload: opts.skipFrozen ? null : importPayload,
            normalizedTakeoffJson: opts.normalized || {
              rooms: [{ name: "Kitchen", areas: [{ runs: [{ lengthIn: 96, depthIn: 25.5 }] }] }]
            },
            reviewState: {},
            computedMeasurementsJson: {},
            validationDiagnosticsJson: { diagnostics: [] }
          },
    studioEstimateService: {
      repository: repo,
      safeEstimateView(row, extras = {}) {
        return { ...row, calculation: row.calculationSnapshot || null, ...extras };
      },
      async ensureEditableEstimateDraft() {
        throw new Error("must not call ensureEditableEstimateDraft");
      },
      async refreshScopeFromTakeoff() {
        throw new Error("must not call refreshScopeFromTakeoff");
      },
      async updateScope() {
        throw new Error("must not call updateScope");
      },
      async approve() {
        throw new Error("must not approve");
      }
    },
    studioDigitalEstimateService: {
      async publish() {
        throw new Error("must not publish");
      }
    }
  });
}

{
  // 1. Preview returns no_takeoff_available when no takeoff exists
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    ...emptyAiRow({ takeoffJobId: null, intakeCaseId: CASE_ID })
  });
  const v2 = serviceWithTakeoff(repo);
  await assert.rejects(
    () => v2.previewTakeoffImport({ organizationId: ORG, intakeCaseId: CASE_ID }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NO_TAKEOFF_AVAILABLE
  );
  console.log("ok: 1 preview no_takeoff_available");
}

{
  // 2 + 3. Preview returns mapped scope; does not mutate estimate
  const repo = new InMemoryStudioEstimateRepository();
  const row = await repo.create(emptyAiRow());
  const before = structuredClone(await repo.getById(ORG, row.id));
  const v2 = serviceWithTakeoff(repo);
  const preview = await v2.previewTakeoffImport({ organizationId: ORG, intakeCaseId: CASE_ID });
  assert.equal(preview.ok, true);
  assert.ok(preview.scopeSummary.roomCount >= 1);
  assert.ok(preview.editableScope.rooms.length >= 1);
  assert.equal(preview.currentScopeEmpty, true);
  assert.ok(preview.allowedModes.includes("replace_empty"));
  const after = await repo.getById(ORG, row.id);
  assert.deepEqual(after.scope.rooms, before.scope.rooms);
  assert.equal(after.status, before.status);
  console.log("ok: 2–3 preview maps scope and does not mutate");
}

{
  // 4. Apply rejects no estimate
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = serviceWithTakeoff(repo);
  await assert.rejects(
    () =>
      v2.applyTakeoffImport({
        organizationId: ORG,
        intakeCaseId: CASE_EMPTY,
        actorUserId: ACTOR,
        body: { mode: "replace_empty", confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NO_ESTIMATE
  );
  console.log("ok: 4 apply rejects no estimate");
}

{
  // 5. Apply rejects approved/frozen
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create(
    emptyAiRow({
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      approval: { approvedAt: new Date().toISOString() },
      scope: seedScopeFromTakeoffPayload(sampleImportPayload(), emptyStudioEstimateScope())
    })
  );
  const v2 = serviceWithTakeoff(repo);
  await assert.rejects(
    () =>
      v2.applyTakeoffImport({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { mode: "replace_all", confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  console.log("ok: 5 apply rejects approved/frozen");
}

{
  // 6. Apply rejects existing non-empty scope unless replace_all + confirmed
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create(
    emptyAiRow({
      status: STUDIO_ESTIMATE_STATUSES.DRAFT,
      scope: seedScopeFromTakeoffPayload(sampleImportPayload(), {
        ...emptyStudioEstimateScope(),
        projectName: "Existing"
      })
    })
  );
  const v2 = serviceWithTakeoff(repo);
  await assert.rejects(
    () =>
      v2.applyTakeoffImport({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: { mode: "replace_empty", confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.EXISTING_SCOPE_CONFIRMATION_REQUIRED
  );
  console.log("ok: 6 apply rejects non-empty without replace_all");
}

{
  // 7 + 9–11. Apply persists on empty Working Draft without V1 orchestration
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create(emptyAiRow());
  const v2 = serviceWithTakeoff(repo);
  const applied = await v2.applyTakeoffImport({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { mode: "replace_empty", confirmed: true, clientMutationId: "imp-1" }
  });
  assert.equal(applied.ok, true);
  assert.ok(applied.scopeSummary.roomCount >= 1);
  assert.ok(applied.editableScope.rooms[0].pieces.length >= 1);
  assert.equal(applied.sideEffects.ensureEditableDraft, false);
  assert.equal(applied.sideEffects.refreshFromTakeoff, false);
  assert.equal(applied.sideEffects.approve, false);
  assert.equal(applied.sideEffects.publish, false);
  assert.equal(applied.takeoffImportNeeded, false);

  const svcSrc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  assert.ok(!svcSrc.includes("refreshScopeFromTakeoff("));
  assert.ok(!svcSrc.includes("ensureEditableEstimateDraft("));
  assert.ok(!svcSrc.includes("studioEstimateService.refreshScopeFromTakeoff"));
  console.log("ok: 7,9–11 apply persists empty draft without V1 orchestration");

  // 12. Calculate after import uses imported scope
  const calc = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR
  });
  assert.equal(calc.ok, true);
  assert.equal(calc.calculation.total, 96);
  console.log("ok: 12 calculate after import uses imported scope");
}

{
  // 8. Apply replaces scope only with explicit replace_all + confirmed
  const repo = new InMemoryStudioEstimateRepository();
  const existing = seedScopeFromTakeoffPayload(sampleImportPayload(), emptyStudioEstimateScope());
  existing.rooms[0].pieces[0].lengthIn = 40;
  existing.rooms[0].pieces[0].name = "Old Run";
  await repo.create(
    emptyAiRow({
      status: STUDIO_ESTIMATE_STATUSES.DRAFT,
      scope: existing
    })
  );
  const v2 = serviceWithTakeoff(repo);
  const applied = await v2.applyTakeoffImport({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: { mode: "replace_all", confirmed: true }
  });
  assert.equal(applied.ok, true);
  assert.ok(applied.editableScope.rooms[0].pieces.some((p) => Number(p.lengthIn) === 96));
  console.log("ok: 8 apply replace_all overwrites existing scope");
}

{
  // Frontend / route contracts
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2TakeoffImportPanel.tsx"),
    "utf8"
  );
  const editor = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ScopeEditor.tsx"),
    "utf8"
  );
  const routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(panel));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(panel));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(editor));
  assert.ok(!shell.includes("refresh-from-takeoff"));
  assert.ok(!panel.includes("refresh-from-takeoff"));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!panel.includes("ensure-editable-draft"));
  assert.ok(panel.includes('data-testid="studio-v2-takeoff-apply"'));
  assert.ok(panel.includes("Use these measurements"));
  assert.ok(panel.includes("Save or discard unsaved scope changes"));
  assert.ok(panel.includes("replace the current Working Draft scope"));
  assert.ok(shell.includes("StudioV2TakeoffReviewPanel"));
  assert.ok(shell.includes("Scope changed — recalculate to update total."));
  assert.ok(routes.includes("/api/elite100-studio-v2/cases/:caseId/takeoff-import-preview"));
  assert.ok(routes.includes("/api/elite100-studio-v2/cases/:caseId/takeoff-import-apply"));
  assert.ok(routes.includes("/api/elite100-studio-v2/cases/:caseId/takeoff-finish"));
  console.log("ok: frontend/source contracts for Takeoff Import panel");
}

{
  // takeoff_not_ready when reviewStatus is not approved and no frozen payload
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create(emptyAiRow());
  const v2 = serviceWithTakeoff(repo, { reviewStatus: "pending", skipFrozen: true });
  await assert.rejects(
    () => v2.previewTakeoffImport({ organizationId: ORG, intakeCaseId: CASE_ID }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.TAKEOFF_NOT_READY
  );
  console.log("ok: takeoff_not_ready when unapproved");
}

console.log("\nAll Studio V2 Slice C tests passed.\n");
