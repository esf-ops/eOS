/**
 * Elite 100 Studio V2 Slice B — Working Draft scope editor contracts.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceB.test.mjs
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
const CASE_EMPTY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nstudioV2SliceB.test.mjs\n");

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

const fakeCalc = {
  fingerprint: "v2b-fp",
  calculatedAt: "2026-07-30T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 1000, customerDisplayTotal: 1010 },
  warnings: [],
  unresolvedItems: []
};

{
  // 1. PATCH scope rejects no estimate
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.patchWorkingDraftScope({
        organizationId: ORG,
        intakeCaseId: CASE_EMPTY,
        actorUserId: ACTOR,
        body: { scope: { rooms: [] } }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NO_ESTIMATE
  );
  console.log("ok: 1 PATCH scope rejects no estimate");
}

{
  // 2. PATCH scope rejects approved/frozen
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
      v2.patchWorkingDraftScope({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: {
          scope: {
            rooms: [
              {
                id: "kitchen",
                name: "Kitchen",
                roomType: "Kitchen",
                pieces: [
                  {
                    id: "run-1",
                    name: "Main run",
                    lengthIn: 120,
                    depthIn: 25.5,
                    quantity: 1,
                    included: true
                  }
                ]
              }
            ]
          }
        }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  const still = await repo.getById(ORG, row.id);
  assert.equal(still.scope.rooms[0].pieces[0].lengthIn, 96);
  console.log("ok: 2 PATCH scope rejects approved/frozen with approved_snapshot_readonly");
}

{
  // 3–6. Persist valid edit; no ensure-editable-draft / refresh-from-takeoff / publish / approve
  const repo = new InMemoryStudioEstimateRepository();
  await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: "takeoff-1",
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc
  });

  let ensureCalls = 0;
  let refreshCalls = 0;
  let approveCalls = 0;
  let publishCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async ({ scope }) => ({
      ...fakeCalc,
      totals: {
        exactTotal: Number(scope.rooms?.[0]?.pieces?.[0]?.lengthIn) || 0,
        customerDisplayTotal: Number(scope.rooms?.[0]?.pieces?.[0]?.lengthIn) || 0
      }
    }),
    studioEstimateService: {
      repository: repo,
      safeEstimateView(row, extras = {}) {
        return { ...row, calculation: row.calculationSnapshot || null, ...extras };
      },
      async ensureEditableEstimateDraft() {
        ensureCalls += 1;
        throw new Error("must not call ensureEditableEstimateDraft");
      },
      async updateScope() {
        throw new Error("must not call V1 updateScope");
      },
      async refreshScopeFromTakeoff() {
        refreshCalls += 1;
        throw new Error("must not call refreshScopeFromTakeoff");
      },
      async approve() {
        approveCalls += 1;
        throw new Error("must not approve");
      }
    },
    studioDigitalEstimateService: {
      async publish() {
        publishCalls += 1;
        throw new Error("must not publish");
      }
    }
  });

  const patched = await v2.patchWorkingDraftScope({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    body: {
      clientMutationId: "mut-1",
      scope: {
        rooms: [
          {
            id: "kitchen",
            name: "Kitchen Remodel",
            roomType: "Kitchen",
            included: true,
            pieces: [
              {
                id: "run-1",
                name: "Island run",
                included: true,
                lengthIn: 110,
                depthIn: 36,
                quantity: 1,
                finishedEdgeLf: 9.2
              },
              {
                id: "run-2",
                name: "Sink run",
                included: true,
                lengthIn: 48,
                depthIn: 25.5,
                quantity: 1
              }
            ]
          }
        ],
        openings: { kitchenSink: 2, vanityBarSink: 0, cooktop: 1, outlet: 0 }
      }
    }
  });

  assert.equal(patched.ok, true);
  assert.equal(patched.clientMutationId, "mut-1");
  assert.equal(patched.scopeSummary.pieceCount, 2);
  assert.equal(patched.editableScope.rooms[0].name, "Kitchen Remodel");
  assert.equal(patched.editableScope.rooms[0].pieces[0].lengthIn, 110);
  assert.equal(patched.editableScope.openings.kitchenSink, 2);
  assert.equal(patched.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  assert.equal(patched.sideEffects.ensureEditableDraft, false);
  assert.equal(patched.sideEffects.refreshFromTakeoff, false);
  assert.equal(patched.sideEffects.autoFork, false);
  assert.equal(patched.sideEffects.updateScope, false);
  assert.equal(patched.sideEffects.approve, false);
  assert.equal(patched.sideEffects.publish, false);
  assert.equal(ensureCalls, 0);
  assert.equal(refreshCalls, 0);
  assert.equal(approveCalls, 0);
  assert.equal(publishCalls, 0);

  const svcSrc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  assert.ok(!svcSrc.includes("ensureEditableEstimateDraft("));
  assert.ok(!svcSrc.includes("refreshScopeFromTakeoff("));
  assert.ok(!svcSrc.includes("studioEstimateService.updateScope"));
  assert.ok(!svcSrc.includes(".approve("));
  console.log("ok: 3–6 PATCH persists edit without V1 orchestration side effects");

  // 7. Calculate after saved scope uses updated scope
  const calc = await v2.calculateWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR
  });
  assert.equal(calc.ok, true);
  assert.equal(calc.calculation.total, 110);
  console.log("ok: 7 calculate after saved scope uses updated scope");
}

{
  // 8. V1 route remains untouched; V2 PATCH is additive
  const v1Routes = readFileSync(join(__dirname, "elite100EstimateStudioRoutes.js"), "utf8");
  const v2Routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  assert.ok(!v1Routes.includes("/api/elite100-studio-v2/"));
  assert.ok(v2Routes.includes("/api/elite100-studio-v2/cases/:caseId/working-draft/scope"));
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(studioApp.includes("studioV2Preview"));
  console.log("ok: 8 V1 routes untouched; V2 PATCH additive; V1 default mount");
}

{
  // Frontend / source contracts
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const editor = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ScopeEditor.tsx"),
    "utf8"
  );
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(shell));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(editor));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(editor));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(editor.includes('data-testid="studio-v2-add-room"'));
  assert.ok(editor.includes('data-testid="studio-v2-remove-room"'));
  assert.ok(editor.includes('data-testid="studio-v2-add-piece"'));
  assert.ok(editor.includes('data-testid="studio-v2-remove-piece"'));
  assert.ok(editor.includes('data-testid="studio-v2-scope-dirty"'));
  assert.ok(shell.includes("apiPatch"));
  assert.ok(shell.includes("/working-draft/scope"));
  assert.ok(shell.includes("Scope changed — recalculate to update total."));
  assert.ok(shell.includes("Save Scope first before calculating."));
  console.log("ok: frontend source contracts for scope editor + dirty/stale/save path");
}

{
  // published snapshot is read-only even when status is priced
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
  const active = await repo.getActiveByIntakeCase(ORG, CASE_ID);
  // Stamp publication markers the editability gate recognizes.
  active.publishedAt = "2026-07-30T00:00:00.000Z";
  active.publication = { active: true, customerUrl: "https://example.test/de/x" };
  repo.byId.set(active.id, active);

  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc
  });
  await assert.rejects(
    () =>
      v2.patchWorkingDraftScope({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        body: {
          scope: {
            rooms: [
              {
                id: "kitchen",
                name: "Kitchen",
                roomType: "Kitchen",
                pieces: [
                  {
                    id: "run-1",
                    name: "Main run",
                    lengthIn: 96,
                    depthIn: 25.5,
                    quantity: 1,
                    included: true
                  }
                ]
              }
            ]
          }
        }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
  );
  console.log("ok: published snapshot rejected with approved_snapshot_readonly");
}

console.log("\nAll Studio V2 Slice B tests passed.\n");
