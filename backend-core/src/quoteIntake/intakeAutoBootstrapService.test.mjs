/**
 * Slice 1 — auto open-estimate + AI queue after intake.
 * Run: node backend-core/src/quoteIntake/intakeAutoBootstrapService.test.mjs
 */
import assert from "node:assert/strict";
import {
  bootstrapIntakeCaseTakeoff,
  bootstrapIntakeCasesAfterImport,
  selectSingleSupportedPdfAttachment
} from "./intakeAutoBootstrapService.mjs";
import {
  mergeAiDraftPreservingConfirmed,
  selectAuthoritativeTakeoffResult
} from "../takeoff/takeoffAuthoritativeResult.mjs";
import { deriveQueueWorkflowStatus } from "../elite100EstimateStudio/studioEstimateQueueWorkflow.mjs";

const ORG = "11111111-1111-1111-1111-111111111111";
const CASE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const JOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

console.log("\nintakeAutoBootstrapService.test.mjs\n");

function makeRepo(caseRow) {
  return {
    async getCase(organizationId, id) {
      assert.equal(organizationId, ORG);
      if (id !== CASE) return null;
      return caseRow;
    }
  };
}

const singlePdfCase = {
  id: CASE,
  attachments: [
    {
      id: "att-1",
      contentType: "application/pdf",
      safeFilename: "plan.pdf",
      kind: "supported_pdf"
    }
  ]
};

{
  assert.equal(selectSingleSupportedPdfAttachment({ attachments: [] }).ok, false);
  assert.equal(
    selectSingleSupportedPdfAttachment({
      attachments: [
        { contentType: "application/pdf", safeFilename: "a.pdf" },
        { contentType: "application/pdf", safeFilename: "b.pdf" }
      ]
    }).reason,
    "multi_pdf_ambiguous"
  );
  assert.equal(selectSingleSupportedPdfAttachment(singlePdfCase).ok, true);
  console.log("  ✓ PDF selection gate");
}

{
  let openCalls = 0;
  let aiCalls = 0;
  const openEstimate = async () => {
    openCalls += 1;
    return {
      takeoffJobId: JOB,
      created: openCalls === 1,
      reused: openCalls > 1,
      linkStatus: "queued"
    };
  };
  const startAi = async () => {
    aiCalls += 1;
    return { ok: true, accepted: true, reused: aiCalls > 1, status: "processing", runId: "run-1" };
  };
  const scheduleCalls = [];
  const scheduleFn = (fn) => {
    scheduleCalls.push(fn);
    // Do not await AI work — async boundary
  };

  const first = await bootstrapIntakeCaseTakeoff({
    repository: makeRepo(singlePdfCase),
    organizationId: ORG,
    intakeCaseId: CASE,
    actorUserId: "user-1",
    env: {
      QUOTE_INTAKE_API_ENABLED: "1",
      QUOTE_INTAKE_AUTOMATIC_TAKEOFF: "1",
      TAKEOFF_AI_ENABLED: "1",
      OPENAI_API_KEY: "sk-test"
    },
    getSupabase: () => ({}),
    openEstimate,
    startAi,
    scheduleFn,
    ensureStudioEstimate: async ({ takeoffJobId }) => ({
      id: "est-1",
      takeoffJobId,
      status: "needs_takeoff_approval"
    })
  });

  assert.equal(first.ok, true);
  assert.equal(first.openEstimate.takeoffJobId, JOB);
  assert.equal(first.aiQueued, true);
  assert.equal(first.studioEstimate.id, "est-1");
  assert.equal(openCalls, 1);
  assert.equal(aiCalls, 1);
  // Intake returns before AI completion (scheduleFn not required when startAi returns 202-style)
  assert.ok(first.message.includes("continue building"));

  const second = await bootstrapIntakeCaseTakeoff({
    repository: makeRepo(singlePdfCase),
    organizationId: ORG,
    intakeCaseId: CASE,
    env: {
      QUOTE_INTAKE_API_ENABLED: "1",
      TAKEOFF_AI_ENABLED: "1",
      OPENAI_API_KEY: "sk-test"
    },
    getSupabase: () => ({}),
    openEstimate,
    startAi,
    ensureStudioEstimate: async () => ({ id: "est-1" })
  });
  assert.equal(second.openEstimate.reused, true);
  assert.equal(openCalls, 2);
  assert.equal(aiCalls, 2);
  console.log("  ✓ auto open-estimate + AI queue; duplicate bootstrap reuses");
}

{
  const openEstimate = async () => ({
    takeoffJobId: JOB,
    created: true,
    reused: false,
    linkStatus: "queued"
  });
  const out = await bootstrapIntakeCaseTakeoff({
    repository: makeRepo(singlePdfCase),
    organizationId: ORG,
    intakeCaseId: CASE,
    env: {
      QUOTE_INTAKE_API_ENABLED: "1",
      TAKEOFF_AI_ENABLED: "0"
    },
    getSupabase: () => ({}),
    openEstimate,
    startAi: async () => {
      throw new Error("must not call AI when disabled");
    }
  });
  assert.equal(out.ok, true);
  assert.equal(out.openEstimate.takeoffJobId, JOB);
  assert.equal(out.aiQueued, false);
  assert.equal(out.aiSkippedReason, "takeoff_ai_disabled");
  console.log("  ✓ AI disabled still opens estimate for manual work");
}

{
  const batch = await bootstrapIntakeCasesAfterImport({
    repository: makeRepo(singlePdfCase),
    organizationId: ORG,
    caseIds: [CASE, CASE],
    env: { QUOTE_INTAKE_API_ENABLED: "1", TAKEOFF_AI_ENABLED: "0" },
    openEstimate: async () => ({
      takeoffJobId: JOB,
      created: false,
      reused: true,
      linkStatus: "queued"
    })
  });
  assert.equal(batch.attempted, true);
  assert.equal(batch.attempts.length, 1, "dedupe case ids");
  console.log("  ✓ import batch dedupes case ids");
}

{
  const multi = await bootstrapIntakeCaseTakeoff({
    repository: makeRepo({
      id: CASE,
      attachments: [
        { contentType: "application/pdf", safeFilename: "a.pdf" },
        { contentType: "application/pdf", safeFilename: "b.pdf" }
      ]
    }),
    organizationId: ORG,
    intakeCaseId: CASE,
    env: { QUOTE_INTAKE_API_ENABLED: "1" },
    openEstimate: async () => {
      throw new Error("must not open");
    }
  });
  assert.equal(multi.skipped, true);
  assert.equal(multi.code, "multi_pdf_ambiguous");
  console.log("  ✓ multi-PDF leaves case actionable without failing");
}

// Confirmed estimator work wins
{
  const confirmed = {
    rooms: [
      {
        id: "room-manual",
        name: "Manual Room",
        runs: [{ id: "run-1", lengthIn: 120, depthIn: 25.5 }]
      }
    ]
  };
  const ai = {
    rooms: [
      {
        id: "room-manual",
        name: "Manual Room",
        runs: [{ id: "run-1", lengthIn: 99, depthIn: 20 }]
      },
      {
        id: "room-ai",
        name: "AI Only",
        runs: [{ id: "run-ai", lengthIn: 60, depthIn: 24 }]
      }
    ]
  };
  const { merged, unconfirmedAiFindings } = mergeAiDraftPreservingConfirmed(confirmed, ai);
  const manual = merged.rooms.find((r) => r.id === "room-manual");
  assert.equal(manual.runs[0].lengthIn, 120, "confirmed measurement retained");
  assert.ok(merged.rooms.some((r) => r.id === "room-ai"));
  assert.ok(unconfirmedAiFindings.rooms.some((r) => r.roomId === "room-ai"));

  const approved = {
    id: "r-approved",
    review_status: "approved",
    created_at: "2026-01-01T00:00:00Z",
    normalized_takeoff_json: confirmed
  };
  const laterAi = {
    id: "r-ai",
    review_status: "needs_review",
    created_at: "2026-01-02T00:00:00Z",
    normalized_takeoff_json: ai,
    raw_ai_result_json: { _meta: {} }
  };
  const pick = selectAuthoritativeTakeoffResult([laterAi, approved]);
  assert.equal(pick.source, "approved");
  assert.equal(pick.row.id, "r-approved");

  const estimatorDraft = {
    id: "r-est",
    review_status: "needs_review",
    created_at: "2026-01-01T12:00:00Z",
    normalized_takeoff_json: confirmed,
    raw_ai_result_json: {
      _meta: { estimatorConfirmed: { confirmedAt: "2026-01-01T12:00:00Z" } }
    }
  };
  const pickEst = selectAuthoritativeTakeoffResult([laterAi, estimatorDraft]);
  assert.equal(pickEst.source, "estimator_draft");
  assert.equal(pickEst.row.id, "r-est");
  console.log("  ✓ merge precedence + authoritative selection");
}

{
  assert.equal(
    deriveQueueWorkflowStatus({ takeoffJobStatus: "queued", takeoffJobId: JOB }),
    "Takeoff queued"
  );
  assert.equal(
    deriveQueueWorkflowStatus({ takeoffJobStatus: "processing" }),
    "Takeoff processing"
  );
  assert.equal(
    deriveQueueWorkflowStatus({ takeoffJobStatus: "failed" }),
    "Takeoff failed"
  );
  console.log("  ✓ queue status vocabulary for takeoff lifecycle");
}

console.log("\nintakeAutoBootstrapService.test.mjs — all passed\n");
