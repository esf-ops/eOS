/**
 * Elite 100 Studio V2 Slice F — strict Digital Estimate publish contracts.
 * Run: node backend-core/src/elite100EstimateStudio/studioV2SliceF.test.mjs
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

console.log("\nstudioV2SliceF.test.mjs\n");

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
  fingerprint: "v2f-fp",
  calculatedAt: "2026-07-30T18:00:00.000Z",
  pricingVersion: 4,
  pricingEngine: "elite100-room-pricing-v1",
  totals: { exactTotal: 1000, customerDisplayTotal: 1010 },
  warnings: [],
  unresolvedItems: []
};

async function createApproved(repo, extra = {}) {
  return repo.create({
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
      calculationFingerprint: "v2f-fp"
    },
    staleReason: null,
    ...extra
  });
}

{
  // 1. Publish rejects unapproved draft with approve_required
  const repo = new InMemoryStudioEstimateRepository();
  const draft = await repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    revision: 1,
    scope: baseScope(),
    calculationSnapshot: fakeCalc
  });
  let publishCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        publishCalls += 1;
        return { ok: true, publication: { id: "pub-x" }, customerUrl: "https://example.test/de/x" };
      }
    }
  });
  await assert.rejects(
    () =>
      v2.publishApproved({
        organizationId: ORG,
        estimateId: draft.id,
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED
  );
  assert.equal(publishCalls, 0);
  console.log("ok: 1 Publish rejects unapproved draft with approve_required");
}

{
  // 2. Publish rejects no estimate
  const repo = new InMemoryStudioEstimateRepository();
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        throw new Error("must not publish");
      }
    }
  });
  await assert.rejects(
    () =>
      v2.publishApproved({
        organizationId: ORG,
        estimateId: "missing-estimate-id",
        actorUserId: ACTOR,
        body: { confirmed: true }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.NO_ESTIMATE
  );
  console.log("ok: 2 Publish rejects no estimate");
}

{
  // 3. Publish requires confirmed true
  const repo = new InMemoryStudioEstimateRepository();
  const row = await createApproved(repo);
  let publishCalls = 0;
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        publishCalls += 1;
        return { ok: true };
      }
    }
  });
  await assert.rejects(
    () =>
      v2.publishApproved({
        organizationId: ORG,
        estimateId: row.id,
        actorUserId: ACTOR,
        body: { confirmed: false }
      }),
    (e) => e?.code === STUDIO_V2_ERROR_CODES.VALIDATION_FAILED
  );
  assert.equal(publishCalls, 0);
  console.log("ok: 3 Publish requires confirmed true");
}

{
  // 4–11. Publish succeeds; no forbidden orchestration; returns active summary
  const repo = new InMemoryStudioEstimateRepository();
  const row = await createApproved(repo);
  let publishCalls = 0;
  let simplifiedCalls = 0;
  let calcCalls = 0;
  let approveCalls = 0;
  /** @type {object|null} */
  let seenBody = null;

  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => {
      calcCalls += 1;
      return fakeCalc;
    },
    studioEstimateService: {
      async ensureEditableEstimateDraft() {
        throw new Error("must not call ensureEditableEstimateDraft");
      },
      async openMeasurementRevision() {
        throw new Error("must not call openMeasurementRevision");
      },
      async refreshScopeFromTakeoff() {
        throw new Error("must not call refreshScopeFromTakeoff");
      },
      async approve() {
        approveCalls += 1;
        throw new Error("must not auto-approve");
      }
    },
    studioDigitalEstimateService: {
      async publish({ body }) {
        publishCalls += 1;
        seenBody = body;
        return {
          ok: true,
          publication: {
            id: "pub-active",
            status: "active",
            publishedAt: "2026-07-30T19:00:00.000Z",
            customerUrl: "https://example.test/de/active"
          },
          customerUrl: "https://example.test/de/active",
          linkStatus: "active",
          staffNotice: "Published."
        };
      },
      async simplifiedPublish() {
        simplifiedCalls += 1;
        throw new Error("must not simplified-publish");
      },
      async publishDigitalEstimate() {
        simplifiedCalls += 1;
        throw new Error("must not publishDigitalEstimate");
      },
      async getWorkspacePublicationSummary() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            statusLabel: "Published",
            publicationId: "pub-active",
            estimateId: row.id,
            revision: 1,
            customerUrl: "https://example.test/de/active",
            publishedAt: "2026-07-30T19:00:00.000Z"
          },
          activePublication: {
            id: "pub-active",
            status: "active",
            revisionNumber: 1,
            customerUrl: "https://example.test/de/active",
            publishedAt: "2026-07-30T19:00:00.000Z"
          },
          publications: [
            {
              id: "pub-active",
              status: "active",
              revisionNumber: 1,
              customerUrl: "https://example.test/de/active",
              publishedAt: "2026-07-30T19:00:00.000Z"
            }
          ],
          reviewRequests: []
        };
      }
    }
  });

  const published = await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: {
      confirmed: true,
      deliveryMode: "link_only",
      autoApprove: true,
      autoCalculate: true,
      sendEmail: true,
      clientMutationId: "pub-1"
    }
  });

  assert.equal(published.ok, true);
  assert.equal(publishCalls, 1);
  assert.equal(simplifiedCalls, 0);
  assert.equal(calcCalls, 0);
  assert.equal(approveCalls, 0);
  assert.equal(published.estimateId, row.id);
  assert.equal(published.caseId, CASE_ID);
  assert.equal(published.publication.customerUrl, "https://example.test/de/active");
  assert.equal(published.publication.active, true);
  assert.equal(published.clientMutationId, "pub-1");
  assert.equal(published.sideEffects.simplifiedPublish, false);
  assert.equal(published.sideEffects.autoApprove, false);
  assert.equal(published.sideEffects.autoCalculate, false);
  assert.equal(published.sideEffects.ensureEditableDraft, false);
  assert.equal(published.sideEffects.scopeMutated, false);
  assert.equal(seenBody?.confirm, true);
  assert.equal(seenBody?.deliveryMode, "link_only");
  assert.equal(seenBody?.autoApprove, undefined);
  assert.equal(seenBody?.autoCalculate, undefined);
  assert.equal(seenBody?.sendEmail, undefined);

  const svcSrc = readFileSync(join(__dirname, "studioV2Service.mjs"), "utf8");
  assert.ok(!svcSrc.includes("createStudioSimplifiedWorkflowService"));
  assert.ok(!svcSrc.includes("ensureEditableEstimateDraft("));
  assert.ok(!svcSrc.includes("openMeasurementRevision("));
  assert.ok(!svcSrc.includes("refreshScopeFromTakeoff("));
  assert.ok(!/\.publishDigitalEstimate\s*\(/.test(svcSrc));
  console.log("ok: 4–11 Publish succeeds without forbidden orchestration");
}

{
  // 12. Customer activity reflects active publication after publish (via DE summary)
  const repo = new InMemoryStudioEstimateRepository();
  const row = await createApproved(repo);
  const v2 = createStudioV2Service({
    repository: repo,
    env: {},
    calculateStudioEstimateImpl: async () => fakeCalc,
    studioDigitalEstimateService: {
      async publish() {
        return {
          ok: true,
          publication: {
            id: "pub-active",
            status: "active",
            customerUrl: "https://example.test/de/active"
          },
          customerUrl: "https://example.test/de/active"
        };
      },
      async getWorkspacePublicationSummary() {
        return {
          publicationSummary: {
            state: "published_active",
            active: true,
            statusLabel: "Published",
            publicationId: "pub-active",
            customerUrl: "https://example.test/de/active",
            customerActivityState: "customer_viewed"
          },
          activePublication: {
            id: "pub-active",
            status: "active",
            revisionNumber: 1,
            customerUrl: "https://example.test/de/active"
          },
          publications: [
            {
              id: "pub-active",
              status: "active",
              revisionNumber: 1,
              customerUrl: "https://example.test/de/active"
            },
            {
              id: "pub-old",
              status: "superseded",
              revisionNumber: 1,
              customerUrl: "https://example.test/de/old"
            }
          ],
          reviewRequests: []
        };
      }
    }
  });
  await v2.publishApproved({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirmed: true }
  });
  const activity = await v2.getCustomerActivity({
    organizationId: ORG,
    intakeCaseId: CASE_ID
  });
  assert.equal(activity.ok, true);
  assert.ok(activity.activePublication);
  assert.equal(activity.activePublication.publicationId, "pub-active");
  assert.equal(activity.activity.viewed, true);
  console.log("ok: 12 Customer activity reflects active publication after publish");
}

{
  // 13. V1 route remains untouched/default
  const studioApp = readFileSync(
    join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
    "utf8"
  );
  assert.ok(studioApp.includes("EstimateTakeoffWorkspace"));
  assert.ok(studioApp.includes("StudioV2EstimatorShell"));
  console.log("ok: 13 V1 route remains untouched/default");
}

{
  // Frontend / source contracts
  const shell = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"),
    "utf8"
  );
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2PublishPanel.tsx"),
    "utf8"
  );
  const approval = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2ApprovalPanel.tsx"),
    "utf8"
  );
  const routes = readFileSync(join(__dirname, "elite100StudioV2Routes.js"), "utf8");

  assert.ok(!/from\s+["'].*ActiveReviewPublishPanel["']/.test(panel));
  assert.ok(!/from\s+["'].*EstimateDigitalEstimatePanel["']/.test(panel));
  assert.ok(!/from\s+["'].*AiEstimatorWorkspace["']/.test(panel));
  assert.ok(!/from\s+["'].*EstimateTakeoffWorkspace["']/.test(panel));
  assert.ok(!panel.includes("ensure-editable-draft"));
  assert.ok(!shell.includes("simplified-publish"));
  assert.ok(!shell.includes("ensure-editable-draft"));
  assert.ok(!/simplifiedPublish|publishDigitalEstimate|createStudioSimplified/.test(panel));
  assert.ok(!/simplifiedPublish|publishDigitalEstimate|createStudioSimplified/.test(shell));
  assert.ok(panel.includes('data-testid="studio-v2-publish"'));
  assert.ok(panel.includes('data-testid="studio-v2-publish-confirm"'));
  assert.ok(panel.includes("Approve required before publish."));
  assert.ok(shell.includes("/approved/"));
  assert.ok(shell.includes("working-draft/approve"));
  assert.ok(shell.includes("StudioV2PublishPanel"));
  assert.ok(shell.includes("StudioV2ApprovalPanel"));
  // No combined approve+publish action
  assert.ok(!shell.includes("approveAndPublish"));
  assert.ok(!shell.includes("approve+publish"));
  assert.ok(!panel.includes("Approve Estimate"));
  assert.ok(approval.includes("Approve Estimate"));
  assert.ok(routes.includes("/api/elite100-studio-v2/approved/:estimateId/publish"));
  console.log("ok: frontend/source contracts for Publish panel");
}

console.log("\nAll Studio V2 Slice F tests passed.\n");
