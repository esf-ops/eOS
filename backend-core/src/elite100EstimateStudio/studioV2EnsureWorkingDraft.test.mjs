/**
 * Studio V2 — create/reuse working draft from Inbox case (no V1 required).
 * Run: node backend-core/src/elite100EstimateStudio/studioV2EnsureWorkingDraft.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { createStudioV2Service } from "./studioV2Service.mjs";
import { STUDIO_V2_ERROR_CODES } from "./studioV2Errors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF_JOB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

console.log("\nstudioV2EnsureWorkingDraft.test.mjs\n");

{
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => {
      throw new Error("calculate must not run during draft create");
    },
    studioDigitalEstimateService: {
      async publish() {
        throw new Error("publish must not run during draft create");
      },
      async assessReadiness() {
        return null;
      }
    },
    lifecycleRepository: null
  });

  await assert.rejects(
    () =>
      v2.ensureWorkingDraft({
        organizationId: ORG,
        intakeCaseId: CASE_ID,
        actorUserId: ACTOR,
        confirm: false
      }),
    (err) => err?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  console.log("ok: 1 confirm required");
}

{
  const repo = new InMemoryStudioEstimateRepository();
  let calcCalls = 0;
  let publishCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => {
      calcCalls += 1;
      return {};
    },
    studioDigitalEstimateService: {
      async publish() {
        publishCalls += 1;
        throw new Error("publish must not run");
      },
      async assessReadiness() {
        return null;
      },
      async getWorkspacePublicationSummary() {
        return { publicationSummary: { state: "not_published", active: false } };
      }
    },
    lifecycleRepository: null,
    resolveTakeoffJobIdForCase: async () => TAKEOFF_JOB
  });

  const created = await v2.ensureWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    takeoffJobId: TAKEOFF_JOB,
    confirm: true
  });

  assert.equal(created.ok, true);
  assert.equal(created.created, true);
  assert.equal(created.reused, false);
  assert.ok(created.estimateId);
  assert.notEqual(created.code, STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
  assert.equal(created.takeoffJobId, TAKEOFF_JOB);
  assert.deepEqual(created.sideEffects, {
    calculated: false,
    approved: false,
    published: false,
    sold: false,
    revised: false,
    accepted: false
  });
  assert.equal(calcCalls, 0);
  assert.equal(publishCalls, 0);

  const row = await repo.getActiveByIntakeCase(ORG, CASE_ID);
  assert.ok(row);
  assert.equal(row.intakeCaseId, CASE_ID);
  assert.equal(row.takeoffJobId, TAKEOFF_JOB);
  assert.equal(row.status, STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL);
  assert.equal(row.scope?.pricingBasis, "wholesale");
  assert.ok(!row.approval);
  assert.ok(!row.calculationSnapshot);
  assert.ok(!row.publishedAt);
  console.log("ok: 2 creates editable draft linked to case + takeoff; no side effects");
}

{
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => ({}),
    studioDigitalEstimateService: {
      async assessReadiness() {
        return null;
      },
      async getWorkspacePublicationSummary() {
        return { publicationSummary: { state: "not_published", active: false } };
      }
    },
    lifecycleRepository: null,
    resolveTakeoffJobIdForCase: async () => TAKEOFF_JOB
  });

  const first = await v2.ensureWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    confirm: true
  });
  const second = await v2.ensureWorkingDraft({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    actorUserId: ACTOR,
    confirm: true
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reused, true);
  assert.equal(first.estimateId, second.estimateId);
  const listed = await repo.listByIntakeCase(ORG, CASE_ID);
  assert.equal(listed.filter((r) => r.status !== STUDIO_ESTIMATE_STATUSES.SUPERSEDED).length, 1);
  console.log("ok: 3 double-click / retry reuses existing draft");
}

{
  const routes = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/elite100StudioV2Routes.js"),
    "utf8"
  );
  assert.match(routes, /app\.post\(\s*"\/api\/elite100-studio-v2\/cases\/:caseId\/working-draft"/);
  assert.match(routes, /ensureWorkingDraft/);
  assert.doesNotMatch(routes, /autoApprove|autoCalculate|simplified-publish|ensure-editable-draft|markSold/);

  const serviceSrc = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/studioV2Service.mjs"),
    "utf8"
  );
  assert.match(serviceSrc, /async function ensureWorkingDraft/);
  assert.match(serviceSrc, /Does not calculate, approve, publish/);
  assert.doesNotMatch(
    serviceSrc.slice(serviceSrc.indexOf("async function ensureWorkingDraft"), serviceSrc.indexOf("async function loadPublicationBundle")),
    /refreshTakeoffGate|calculateStudioEstimateV4|publishApproved|markSold|acceptedAsConfigured/
  );
  console.log("ok: 4 route + service avoid calculate/approve/publish/sold paths");
}

console.log("\nAll Studio V2 ensure-working-draft tests passed.\n");
