/**
 * Shared Inbox → AI Takeoff handoff service contracts (no Graph / no DB).
 * Run: node --experimental-strip-types backend-core/src/elite100EstimateStudio/studioSharedInboxSendToTakeoff.test.mjs
 */
import assert from "node:assert/strict";
import { createStudioSharedInboxService } from "./studioSharedInboxService.mjs";
import { selectSupportedPdfAttachment } from "../takeoff/intakeOpenEstimateService.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

console.log("\nstudioSharedInboxSendToTakeoff.test.mjs\n");

{
  const pdf = selectSupportedPdfAttachment({
    attachments: [{ id: "a1", support: "direct_pdf", safeFilename: "a.pdf" }]
  });
  assert.equal(pdf.id, "a1");

  const img = selectSupportedPdfAttachment({
    attachments: [
      { id: "a2", support: "direct_image_plan", safeFilename: "kitchen-plan.jpg", mimeType: "image/jpeg" }
    ]
  });
  assert.equal(img.id, "a2");

  assert.throws(
    () =>
      selectSupportedPdfAttachment({
        attachments: [{ id: "a3", support: "image_needs_review", mimeType: "image/jpeg" }]
      }),
    /No supported plan/
  );

  const marked = selectSupportedPdfAttachment(
    {
      attachments: [
        { id: "a3", support: "image_needs_review", mimeType: "image/jpeg", safeFilename: "photo.jpg" }
      ]
    },
    { selectedAttachmentId: "a3", markAsPlan: true }
  );
  assert.equal(marked.id, "a3");
  console.log("ok: selectSupportedPdfAttachment accepts PDF/image plan + markAsPlan");
}

{
  let openCalls = 0;
  const openEstimate = async (deps) => {
    openCalls += 1;
    assert.equal(deps.organizationId, ORG);
    assert.equal(deps.intakeCaseId, "case-1");
    assert.equal(deps.body.attachmentKey, "att-graph-1");
    return {
      ok: true,
      takeoffJobId: "job-1",
      created: openCalls === 1,
      reused: openCalls > 1,
      attachmentName: "kitchen-plan.jpg"
    };
  };

  const svc = createStudioSharedInboxService({
    env: {
      QUOTE_INTAKE_GRAPH_ENABLED: "1",
      QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED: "1",
      QUOTE_INTAKE_GRAPH_MAILBOX: "quotes@example.com",
      QUOTE_INTAKE_GRAPH_TENANT_ID: "t",
      QUOTE_INTAKE_GRAPH_CLIENT_ID: "c",
      QUOTE_INTAKE_GRAPH_CLIENT_SECRET: "s"
    },
    quoteIntakeRepository: {
      async getCase() {
        return {
          id: "case-1",
          attachments: [
            {
              id: "att-uuid-1",
              sourceAttachmentId: "att-graph-1",
              support: "direct_image_plan",
              safeFilename: "kitchen-plan.jpg",
              mimeType: "image/jpeg"
            }
          ]
        };
      },
      async listTakeoffLinks() {
        return [];
      }
    },
    previewFn: async () => ({
      mailboxDisplay: "quotes@example.com",
      messages: [
        {
          graphMessageId: "msg-1",
          subject: "Quote",
          bodyPreview: "Please quote",
          hasAttachments: true,
          eligibilityHint: "already_imported",
          alreadyImported: true,
          existingCaseId: "case-1",
          sender: { displayName: "Customer", emailPresent: true },
          attachments: [
            {
              sourceAttachmentId: "att-graph-1",
              name: "kitchen-plan.jpg",
              mimeType: "image/jpeg",
              support: "direct_image_plan",
              sizeBytes: 1200
            }
          ]
        }
      ]
    }),
    openEstimate,
    getSupabase: () => null
  });

  const first = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-1",
    actorUserId: USER,
    attachmentKey: "att-graph-1",
    confirm: true
  });
  assert.equal(first.takeoffJobId, "job-1");
  assert.equal(first.sideEffects.calculated, false);
  assert.equal(first.sideEffects.published, false);
  assert.equal(first.sideEffects.sold, false);
  assert.equal(first.sideEffects.studioEstimateEnsured, false);

  const second = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-1",
    actorUserId: USER,
    attachmentKey: "att-graph-1",
    confirm: true
  });
  assert.equal(second.takeoffJobId, "job-1");
  assert.equal(openCalls, 2, "openEstimate still called; idempotency lives in openEstimate/createWorkspace");

  await assert.rejects(
    () =>
      svc.sendToAiTakeoff({
        organizationId: ORG,
        messageKey: "msg-1",
        actorUserId: USER,
        attachmentKey: "missing",
        confirm: true
      }),
    /attachment|not|found|available/i
  );

  console.log("ok: sendToAiTakeoff creates/reuses job without estimate side effects");
}

{
  const svc = createStudioSharedInboxService({
    env: {
      QUOTE_INTAKE_GRAPH_ENABLED: "1",
      QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED: "1",
      QUOTE_INTAKE_GRAPH_MAILBOX: "quotes@example.com",
      QUOTE_INTAKE_GRAPH_TENANT_ID: "t",
      QUOTE_INTAKE_GRAPH_CLIENT_ID: "c",
      QUOTE_INTAKE_GRAPH_CLIENT_SECRET: "s"
    },
    quoteIntakeRepository: {},
    previewFn: async () => ({
      mailboxDisplay: "quotes@example.com",
      messages: [
        {
          graphMessageId: "msg-2",
          subject: "Photo",
          bodyPreview: "hi",
          hasAttachments: true,
          eligibilityHint: "manual_review",
          alreadyImported: false,
          existingCaseId: null,
          sender: { displayName: "Customer", emailPresent: true },
          attachments: [
            {
              sourceAttachmentId: "att-photo",
              name: "IMG_99.jpg",
              mimeType: "image/jpeg",
              support: "image_needs_review",
              sizeBytes: 800
            }
          ]
        }
      ]
    }),
    openEstimate: async () => {
      throw new Error("should not open without markAsPlan");
    }
  });

  await assert.rejects(
    () =>
      svc.sendToAiTakeoff({
        organizationId: ORG,
        messageKey: "msg-2",
        attachmentKey: "att-photo",
        confirm: true,
        markAsPlan: false
      }),
    /not a supported plan/
  );
  console.log("ok: unsupported/uncertain image rejected without markAsPlan");
}

console.log("\nstudioSharedInboxSendToTakeoff.test.mjs: ok\n");
