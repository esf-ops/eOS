/**
 * studioEstimateQueueWorkflow — unit tests
 * Run: node backend-core/src/elite100EstimateStudio/studioEstimateQueueWorkflow.test.mjs
 */
import assert from "node:assert/strict";
import {
  deriveNeedsAttention,
  deriveQueueOpenTarget,
  deriveQueueWorkflowStatus,
  workflowStatusesForFilter
} from "./studioEstimateQueueWorkflow.mjs";
import { createStudioEstimateQueueService } from "./studioEstimateQueueService.mjs";

console.log("\nstudioEstimateQueueWorkflow.test.mjs\n");

// 1. Workflow status across lifecycle
{
  assert.equal(deriveQueueWorkflowStatus({}), "New");
  assert.equal(
    deriveQueueWorkflowStatus({ takeoffJobStatus: "processing" }),
    "Takeoff processing"
  );
  assert.equal(
    deriveQueueWorkflowStatus({ takeoffJobStatus: "queued" }),
    "Takeoff queued"
  );
  assert.equal(
    deriveQueueWorkflowStatus({
      takeoffReviewStatus: "needs_review",
      firstOpenedAt: "2026-01-01",
      pieceCount: 2
    }),
    "Takeoff draft ready"
  );
  assert.equal(
    deriveQueueWorkflowStatus({
      takeoffJobStatus: "completed",
      takeoffReviewStatus: "needs_review",
      firstOpenedAt: "2026-01-01"
    }),
    "Takeoff queued",
    "empty/placeholder result must not map to draft ready"
  );
  assert.equal(
    deriveQueueWorkflowStatus({
      takeoffJobStatus: "processing",
      pieceCount: 1,
      estimatorDraftPresent: true
    }),
    "Takeoff processing · manual draft in progress"
  );
  assert.equal(
    deriveQueueWorkflowStatus({
      takeoffReviewStatus: "approved",
      estimateStatus: "needs_takeoff_approval"
    }),
    "Needs estimator review"
  );
  assert.equal(
    deriveQueueWorkflowStatus({ estimateStatus: "ready_to_price", firstOpenedAt: "x" }),
    "Scope in progress"
  );
  assert.equal(
    deriveQueueWorkflowStatus({ estimateStatus: "approved" }),
    "Ready for approval"
  );
  assert.equal(
    deriveQueueWorkflowStatus({ publicationStatus: "active" }),
    "Published"
  );
  assert.equal(
    deriveQueueWorkflowStatus({ publicationStatus: "active", customerViewed: true }),
    "Customer reviewing"
  );
  assert.equal(
    deriveQueueWorkflowStatus({ reviewOperatorStatus: "new" }),
    "Customer submitted"
  );
  assert.equal(deriveQueueWorkflowStatus({ takeoffJobStatus: "failed" }), "Takeoff failed");
  assert.equal(deriveQueueWorkflowStatus({ accepted: true }), "Customer submitted");
  assert.equal(deriveQueueWorkflowStatus({ sold: true }), "Sold");
  console.log("  ✓ T1 workflow status derivation");
}

// 2. Needs attention vs waiting on customer
{
  const waiting = deriveNeedsAttention(
    { publicationStatus: "active", firstOpenedAt: "x" },
    "Published"
  );
  assert.equal(waiting.needsAttention, false);

  const ready = deriveNeedsAttention(
    { takeoffReviewStatus: "needs_review", firstOpenedAt: "x" },
    "Takeoff draft ready"
  );
  assert.equal(ready.needsAttention, true);
  assert.ok(ready.reasons.includes("takeoff_needs_review"));

  const unread = deriveNeedsAttention({}, "New");
  assert.equal(unread.needsAttention, true);
  assert.ok(unread.reasons.includes("new_unread"));

  const approvedNotPub = deriveNeedsAttention(
    { estimateStatus: "approved", firstOpenedAt: "x" },
    "Ready for approval"
  );
  assert.equal(approvedNotPub.needsAttention, true);
  console.log("  ✓ T2 needs-attention vs waiting-on-customer");
}

// 3–4. Search / filters via service
{
  const ORG = "11111111-1111-1111-1111-111111111111";
  const ORG_B = "22222222-2222-2222-2222-222222222222";
  const cases = [
    {
      id: "c1",
      organization_id: ORG,
      status: "qil_received",
      received_at: "2026-07-01T10:00:00Z",
      updated_at: "2026-07-01T10:00:00Z",
      mailbox_identity: "quotes@example.com"
    },
    {
      id: "c2",
      organization_id: ORG,
      status: "qil_takeoff_ready_for_review",
      received_at: "2026-07-02T10:00:00Z",
      updated_at: "2026-07-02T12:00:00Z",
      first_opened_at: "2026-07-02T11:00:00Z",
      assigned_estimator_user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    },
    {
      id: "c3",
      organization_id: ORG,
      status: "qil_received",
      received_at: "2026-07-03T10:00:00Z",
      updated_at: "2026-07-03T10:00:00Z",
      first_opened_at: "2026-07-03T10:30:00Z"
    }
  ];

  const svc = createStudioEstimateQueueService({
    listIntakeCases: async ({ organizationId }) => {
      assert.equal(organizationId, ORG);
      return { rows: cases.filter((c) => c.organization_id === organizationId), total: 3 };
    },
    listAttachments: async () =>
      new Map([
        [
          "c3",
          [
            {
              id: "a1",
              intake_case_id: "c3",
              safe_filename: "Kitchen Plan.pdf",
              mime_type: "application/pdf",
              support_classification: "supported"
            }
          ]
        ]
      ]),
    listTakeoffLinksByCaseIds: async () =>
      new Map([
        ["c2", { intake_case_id: "c2", takeoff_job_id: "tj1", relationship_status: "linked" }]
      ]),
    listTakeoffJobsByIds: async () =>
      new Map([
        [
          "tj1",
          {
            id: "tj1",
            status: "completed",
            review_status: "needs_review",
            result_summary: { roomCount: 1, pieceCount: 3, countertopExactSf: 40 }
          }
        ]
      ]),
    listStudioEstimatesByCaseIds: async () =>
      new Map([
        [
          "c3",
          {
            id: "e3",
            intake_case_id: "c3",
            status: "approved",
            scope_json: { customerName: "Acme Homes", projectName: "Oak St Kitchen", rooms: [] },
            revision: 1
          }
        ]
      ]),
    listPublicationsByEstimateIds: async () => new Map(),
    listOpenReviewRequests: async () => []
  });

  const all = await svc.listQueue({ organizationId: ORG, query: { limit: 50 } });
  assert.equal(all.cases.length, 3);

  const search = await svc.listQueue({
    organizationId: ORG,
    query: { search: "acme", limit: 50 }
  });
  assert.equal(search.cases.length, 1);
  assert.equal(search.cases[0].id, "c3");

  const takeoffFilter = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "takeoff", limit: 50 }
  });
  assert.ok(takeoffFilter.cases.some((c) => c.id === "c2"));
  assert.ok(
    takeoffFilter.cases.every((c) =>
      [
        "Takeoff queued",
        "Takeoff processing",
        "Takeoff processing · manual draft in progress",
        "Takeoff draft ready",
        "Needs estimator review",
        "Takeoff failed"
      ].includes(c.workflowStatus)
    )
  );

  // List + detail share the same mapper
  const c2 = takeoffFilter.cases.find((c) => c.id === "c2");
  assert.equal(
    c2.workflowStatus,
    deriveQueueWorkflowStatus({
      takeoffJobStatus: "completed",
      takeoffReviewStatus: "needs_review",
      firstOpenedAt: "2026-07-02T11:00:00Z",
      takeoffJobId: "tj1",
      pieceCount: 3,
      roomCount: 1
    })
  );

  const attention = await svc.listQueue({
    organizationId: ORG,
    query: { filter: "needs_attention", limit: 50 }
  });
  assert.ok(attention.cases.length >= 1);

  // 5. Cross-org excluded by listIntakeCases org filter
  const cross = createStudioEstimateQueueService({
    listIntakeCases: async ({ organizationId }) => ({
      rows: cases.filter((c) => c.organization_id === organizationId),
      total: 0
    }),
    listAttachments: async () => new Map(),
    listTakeoffLinksByCaseIds: async () => new Map(),
    listTakeoffJobsByIds: async () => new Map(),
    listStudioEstimatesByCaseIds: async () => new Map(),
    listPublicationsByEstimateIds: async () => new Map(),
    listOpenReviewRequests: async () => []
  });
  const other = await cross.listQueue({ organizationId: ORG_B, query: {} });
  assert.equal(other.cases.length, 0);

  // 6. Missing partial records do not crash
  const partial = await svc.listQueue({ organizationId: ORG, query: { filter: "all" } });
  assert.ok(partial.cases.find((c) => c.id === "c1"));

  // 8. No forbidden fields
  const serialized = JSON.stringify(partial);
  assert.equal(serialized.includes("sha256"), false);
  assert.equal(serialized.includes("graphImmutable"), false);
  assert.equal(serialized.includes("contentHash"), false);
  assert.equal(serialized.includes("storage_path"), false);
  assert.equal(serialized.includes("accessToken"), false);

  // 7. Preview safe summary
  const previewSvc = createStudioEstimateQueueService({
    getIntakeCaseDetail: async () => cases[2],
    listAttachments: async () =>
      new Map([
        [
          "c3",
          [
            {
              id: "a1",
              safe_filename: "Kitchen Plan.pdf",
              mime_type: "application/pdf",
              support_classification: "supported",
              size_bytes: 1234
            }
          ]
        ]
      ]),
    listTakeoffLinksByCaseIds: async () => new Map(),
    listTakeoffJobsByIds: async () => new Map(),
    listStudioEstimatesByCaseIds: async () =>
      new Map([
        [
          "c3",
          {
            id: "e3",
            intake_case_id: "c3",
            status: "approved",
            scope_json: {
              customerName: "Acme Homes",
              projectName: "Oak St Kitchen",
              rooms: [{ id: "r1", name: "Kitchen", countertopSqft: 40, pieces: [{ id: "p1", sqft: 40, verified: true }] }]
            }
          }
        ]
      ]),
    listPublicationsByEstimateIds: async () => new Map(),
    listOpenReviewRequests: async () => [],
    getLatestTakeoffSummary: async () => null
  });
  const preview = await previewSvc.getPreview({ organizationId: ORG, caseId: "c3" });
  assert.equal(preview.preview.customerName, "Acme Homes");
  assert.ok(preview.preview.attachments[0].filename);
  assert.equal(JSON.stringify(preview).includes("sha256"), false);
  assert.equal(preview.preview.workflowStatus, deriveQueueWorkflowStatus({
    estimateStatus: "approved",
    firstOpenedAt: "2026-07-03T10:30:00Z"
  }));

  // 9. Open target routing
  assert.equal(deriveQueueOpenTarget({ takeoffReviewStatus: "needs_review" }), "takeoff");
  assert.equal(
    deriveQueueOpenTarget({ takeoffReviewStatus: "approved", estimateStatus: "ready_to_price" }),
    "scope"
  );
  assert.equal(deriveQueueOpenTarget({ estimateStatus: "approved" }), "digital");
  assert.equal(deriveQueueOpenTarget({ reviewOperatorStatus: "new" }), "review");

  assert.ok(workflowStatusesForFilter("sent").has("Published"));

  console.log("  ✓ T3–T9 search/filter/org/partial/preview/routing/forbidden");
}

console.log("\nstudioEstimateQueueWorkflow.test.mjs — all passed\n");
