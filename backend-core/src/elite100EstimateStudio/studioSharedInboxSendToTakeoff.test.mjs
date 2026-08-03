/**
 * Shared Inbox → AI Takeoff handoff + manual image plan override.
 * Run: node --experimental-strip-types backend-core/src/elite100EstimateStudio/studioSharedInboxSendToTakeoff.test.mjs
 */
import assert from "node:assert/strict";
import { createStudioSharedInboxService } from "./studioSharedInboxService.mjs";
import { selectSupportedPdfAttachment } from "../takeoff/intakeOpenEstimateService.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

console.log("\nstudioSharedInboxSendToTakeoff.test.mjs\n");

function baseEnv() {
  return {
    QUOTE_INTAKE_GRAPH_ENABLED: "1",
    QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED: "1",
    QUOTE_INTAKE_GRAPH_MAILBOX: "quotes@example.com",
    QUOTE_INTAKE_GRAPH_TENANT_ID: "t",
    QUOTE_INTAKE_GRAPH_CLIENT_ID: "c",
    QUOTE_INTAKE_GRAPH_CLIENT_SECRET: "s"
  };
}

{
  const pdf = selectSupportedPdfAttachment({
    attachments: [{ id: "a1", support: "direct_pdf", safeFilename: "a.pdf" }]
  });
  assert.equal(pdf.id, "a1");

  const img = selectSupportedPdfAttachment({
    attachments: [
      {
        id: "a2",
        support: "direct_image_plan",
        safeFilename: "kitchen-plan.jpg",
        mimeType: "image/jpeg"
      }
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
        {
          id: "a3",
          support: "image_needs_review",
          mimeType: "image/jpeg",
          safeFilename: "photo.jpg",
          sourceAttachmentId: "graph-a3"
        }
      ]
    },
    { selectedAttachmentId: "a3", markAsPlan: true }
  );
  assert.equal(marked.id, "a3");

  const byGraphKey = selectSupportedPdfAttachment(
    {
      attachments: [
        {
          id: "uuid-9",
          support: "image_needs_review",
          mimeType: "image/jpeg",
          safeFilename: "photo.jpg",
          sourceAttachmentId: "graph-a3"
        }
      ]
    },
    { selectedAttachmentId: "graph-a3", markAsPlan: true }
  );
  assert.equal(byGraphKey.id, "uuid-9");

  const octetJpg = selectSupportedPdfAttachment(
    {
      attachments: [
        {
          id: "a4",
          support: "metadata_only",
          mimeType: "application/octet-stream",
          safeFilename: "scan.jpg",
          sourceAttachmentId: "g4"
        }
      ]
    },
    { selectedAttachmentId: "a4", markAsPlan: true }
  );
  assert.equal(octetJpg.id, "a4");

  console.log("ok: selectSupportedPdfAttachment accepts PDF/image plan + markAsPlan");
}

{
  let openCalls = 0;
  /** @type {object[]} */
  const openBodies = [];
  const openEstimate = async (deps) => {
    openCalls += 1;
    openBodies.push(deps.body);
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
    env: baseEnv(),
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
  assert.equal(openBodies[0]?.manualPlanOverride, false);

  const second = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-1",
    actorUserId: USER,
    attachmentKey: "att-graph-1",
    confirm: true
  });
  assert.equal(second.takeoffJobId, "job-1");
  assert.equal(openCalls, 2, "openEstimate still called; idempotency lives in openEstimate/createWorkspace");

  console.log("ok: direct_image_plan send succeeds without manual override");
}

{
  /** @type {object[]} */
  const openBodies = [];
  let openCalls = 0;
  const svc = createStudioSharedInboxService({
    env: baseEnv(),
    quoteIntakeRepository: {
      async getCase() {
        return {
          id: "case-pdf",
          attachments: [
            {
              id: "pdf-1",
              sourceAttachmentId: "att-pdf",
              support: "direct_pdf",
              safeFilename: "plan.pdf",
              mimeType: "application/pdf"
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
          graphMessageId: "msg-pdf",
          subject: "PDF",
          bodyPreview: "plan",
          hasAttachments: true,
          eligibilityHint: "already_imported",
          alreadyImported: true,
          existingCaseId: "case-pdf",
          sender: { displayName: "Customer", emailPresent: true },
          attachments: [
            {
              sourceAttachmentId: "att-pdf",
              name: "plan.pdf",
              mimeType: "application/pdf",
              support: "direct_pdf",
              sizeBytes: 2048
            }
          ]
        }
      ]
    }),
    openEstimate: async (deps) => {
      openCalls += 1;
      openBodies.push(deps.body);
      return {
        ok: true,
        takeoffJobId: "job-pdf",
        created: openCalls === 1,
        reused: openCalls > 1
      };
    }
  });

  const r = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-pdf",
    attachmentKey: "att-pdf",
    confirm: true
  });
  assert.equal(r.takeoffJobId, "job-pdf");
  assert.equal(openBodies[0]?.manualPlanOverride, false);
  assert.equal(openBodies[0]?.markAsPlan, false);
  assert.ok(!("markAsPlan" in openBodies[0]) || openBodies[0].markAsPlan === false);

  const r2 = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-pdf",
    attachmentKey: "att-pdf",
    confirm: true
  });
  assert.equal(r2.takeoffJobId, "job-pdf");
  assert.equal(openCalls, 2);
  assert.ok(openBodies.every((b) => b.manualPlanOverride === false));
  console.log("ok: direct_pdf send succeeds without manual override; duplicate reuses path");
}

{
  let opened = false;
  const svc = createStudioSharedInboxService({
    env: baseEnv(),
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
      opened = true;
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
    (e) => e.statusCode === 400 && e.code === "attachment_not_supported"
  );
  assert.equal(opened, false);
  console.log("ok: image_needs_review without manual override is rejected");
}

{
  /** @type {object[]} */
  const openBodies = [];
  let openCalls = 0;
  const svc = createStudioSharedInboxService({
    env: baseEnv(),
    quoteIntakeRepository: {
      async getCase() {
        return {
          id: "case-review",
          attachments: [
            {
              id: "att-uuid-photo",
              sourceAttachmentId: "att-photo",
              support: "image_needs_review",
              safeFilename: "IMG_99.jpg",
              mimeType: "image/jpeg",
              retrievalState: "not_applicable"
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
          graphMessageId: "msg-review",
          subject: "Dave photos",
          bodyPreview: "please quote",
          hasAttachments: true,
          eligibilityHint: "manual_review",
          alreadyImported: true,
          existingCaseId: "case-review",
          sender: { displayName: "Dave", emailPresent: true },
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
    importFn: async () => {
      throw new Error("should not re-import already imported");
    },
    openEstimate: async (deps) => {
      openCalls += 1;
      openBodies.push(deps.body);
      assert.equal(deps.body.attachmentKey, "att-photo");
      assert.equal(deps.body.markAsPlan, true);
      assert.equal(deps.body.manualPlanOverride, true);
      // Resolve the way production openEstimate does.
      const caseRow = await deps.repository.getCase(ORG, deps.intakeCaseId);
      const selected = selectSupportedPdfAttachment(caseRow, {
        selectedAttachmentId: "att-photo",
        markAsPlan: true
      });
      assert.equal(selected.sourceAttachmentId, "att-photo");
      return {
        ok: true,
        takeoffJobId: "job-review",
        created: openCalls === 1,
        reused: openCalls > 1,
        attachmentName: "IMG_99.jpg"
      };
    }
  });

  const first = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-review",
    actorUserId: USER,
    attachmentKey: "att-photo",
    confirm: true,
    manualPlanOverride: true
  });
  assert.equal(first.takeoffJobId, "job-review");
  assert.equal(first.created, true);
  assert.equal(first.sideEffects.studioEstimateEnsured, false);

  const second = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-review",
    actorUserId: USER,
    attachmentKey: "att-photo",
    confirm: true,
    markAsPlan: true
  });
  assert.equal(second.takeoffJobId, "job-review");
  assert.equal(openCalls, 2);
  assert.ok(openBodies.every((b) => b.manualPlanOverride === true));
  console.log("ok: image_needs_review with manual override succeeds; duplicate reuses job path");
}

{
  const svc = createStudioSharedInboxService({
    env: baseEnv(),
    quoteIntakeRepository: {},
    previewFn: async () => ({
      mailboxDisplay: "quotes@example.com",
      messages: [
        {
          graphMessageId: "msg-doc",
          subject: "Doc",
          bodyPreview: "hi",
          hasAttachments: true,
          eligibilityHint: "manual_review",
          alreadyImported: false,
          existingCaseId: null,
          sender: { displayName: "Customer", emailPresent: true },
          attachments: [
            {
              sourceAttachmentId: "att-doc",
              name: "notes.docx",
              mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              support: "metadata_only",
              sizeBytes: 1200
            }
          ]
        }
      ]
    }),
    openEstimate: async () => {
      throw new Error("should not open for unsupported override");
    }
  });

  await assert.rejects(
    () =>
      svc.sendToAiTakeoff({
        organizationId: ORG,
        messageKey: "msg-doc",
        attachmentKey: "att-doc",
        confirm: true,
        manualPlanOverride: true
      }),
    (e) => e.statusCode === 400 && e.code === "attachment_not_supported"
  );
  console.log("ok: unsupported non-image with manual override is rejected");
}

// Production Dave Untiedt shape: Graph AAMk key + phone JPG filenames + missing/octet MIME,
// persisted case rows without sourceAttachmentId.
{
  const GRAPH_KEY =
    "AAMkAGI2TH93AAA=EAAAAAAopaqueGraphAttachmentKeyExample==";
  const FILENAME = "1000005197.jpg";
  /** @type {object[]} */
  const openBodies = [];
  let openCalls = 0;

  const svc = createStudioSharedInboxService({
    env: baseEnv(),
    quoteIntakeRepository: {
      async getCase() {
        return {
          id: "case-dave",
          attachments: [
            {
              id: "uuid-5197",
              sourceAttachmentId: null,
              support: "image_needs_review",
              safeFilename: FILENAME,
              mimeType: "application/octet-stream"
            },
            {
              id: "uuid-5196",
              sourceAttachmentId: null,
              support: "image_needs_review",
              safeFilename: "1000005196.jpg",
              mimeType: "application/octet-stream"
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
          graphMessageId: "msg-dave",
          subject: "Quote request",
          bodyPreview: "please quote",
          hasAttachments: true,
          eligibilityHint: "already_imported",
          alreadyImported: true,
          existingCaseId: "case-dave",
          sender: { displayName: "Dave Untiedt", emailPresent: true },
          attachments: [
            {
              sourceAttachmentId: GRAPH_KEY,
              name: FILENAME,
              mimeType: "application/octet-stream",
              support: "image_needs_review",
              sizeBytes: 447146
            },
            {
              sourceAttachmentId: `${GRAPH_KEY}-2`,
              name: "1000005196.jpg",
              mimeType: null,
              support: "image_needs_review",
              sizeBytes: 378156
            }
          ]
        }
      ]
    }),
    openEstimate: async (deps) => {
      openCalls += 1;
      openBodies.push(deps.body);
      assert.equal(deps.body.attachmentKey, GRAPH_KEY);
      assert.equal(deps.body.attachmentFilename, FILENAME);
      assert.equal(deps.body.manualPlanOverride, true);
      assert.equal(deps.body.markAsPlan, true);
      const caseRow = await deps.repository.getCase(ORG, deps.intakeCaseId);
      const selected = selectSupportedPdfAttachment(caseRow, {
        selectedAttachmentKey: deps.body.attachmentKey,
        selectedFilename: deps.body.attachmentFilename,
        markAsPlan: true
      });
      assert.equal(selected.id, "uuid-5197");
      assert.equal(selected.safeFilename, FILENAME);
      return {
        ok: true,
        takeoffJobId: "job-dave",
        created: openCalls === 1,
        reused: openCalls > 1,
        attachmentName: FILENAME
      };
    }
  });

  await assert.rejects(
    () =>
      svc.sendToAiTakeoff({
        organizationId: ORG,
        messageKey: "msg-dave",
        attachmentKey: GRAPH_KEY,
        confirm: true
      }),
    (e) => e.code === "attachment_not_supported"
  );

  const first = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-dave",
    attachmentKey: GRAPH_KEY,
    confirm: true,
    manualPlanOverride: true,
    markAsPlan: true
  });
  assert.equal(first.takeoffJobId, "job-dave");
  assert.equal(first.created, true);

  const second = await svc.sendToAiTakeoff({
    organizationId: ORG,
    messageKey: "msg-dave",
    attachmentKey: GRAPH_KEY,
    confirm: true,
    manualPlanOverride: true,
    markAsPlan: true
  });
  assert.equal(second.takeoffJobId, "job-dave");
  assert.equal(openCalls, 2);
  console.log("ok: Graph-style JPG (AAMk + 1000005197.jpg) manual override succeeds + duplicate");
}

{
  for (const sample of [
    {
      key: "AAMk-png",
      name: "layout.png",
      mime: "image/png",
      id: "uuid-png"
    },
    {
      key: "AAMk-webp",
      name: "scan.webp",
      mime: null,
      id: "uuid-webp"
    },
    {
      key: "AAMk-jpeg-mime",
      name: "photo.jpeg",
      mime: "image/jpeg",
      id: "uuid-jpeg"
    }
  ]) {
    const svc = createStudioSharedInboxService({
      env: baseEnv(),
      quoteIntakeRepository: {
        async getCase() {
          return {
            id: `case-${sample.id}`,
            attachments: [
              {
                id: sample.id,
                sourceAttachmentId: null,
                support: "image_needs_review",
                safeFilename: sample.name,
                mimeType: sample.mime || "application/octet-stream"
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
            graphMessageId: `msg-${sample.id}`,
            subject: "img",
            bodyPreview: "hi",
            hasAttachments: true,
            eligibilityHint: "already_imported",
            alreadyImported: true,
            existingCaseId: `case-${sample.id}`,
            sender: { displayName: "Customer", emailPresent: true },
            attachments: [
              {
                sourceAttachmentId: sample.key,
                name: sample.name,
                mimeType: sample.mime,
                support: "image_needs_review",
                sizeBytes: 100
              }
            ]
          }
        ]
      }),
      openEstimate: async (deps) => {
        const caseRow = await deps.repository.getCase(ORG, deps.intakeCaseId);
        const selected = selectSupportedPdfAttachment(caseRow, {
          selectedAttachmentKey: deps.body.attachmentKey,
          selectedFilename: deps.body.attachmentFilename,
          markAsPlan: true
        });
        assert.equal(selected.id, sample.id);
        return { ok: true, takeoffJobId: `job-${sample.id}`, created: true };
      }
    });
    const r = await svc.sendToAiTakeoff({
      organizationId: ORG,
      messageKey: `msg-${sample.id}`,
      attachmentKey: sample.key,
      confirm: true,
      manualPlanOverride: true
    });
    assert.equal(r.takeoffJobId, `job-${sample.id}`);
  }
  console.log("ok: PNG / WEBP / image/jpeg MIME manual overrides succeed");
}

{
  const svc = createStudioSharedInboxService({
    env: baseEnv(),
    quoteIntakeRepository: {},
    previewFn: async () => ({
      mailboxDisplay: "quotes@example.com",
      messages: [
        {
          graphMessageId: "msg-inline",
          subject: "sig",
          bodyPreview: "hi",
          hasAttachments: true,
          eligibilityHint: "manual_review",
          alreadyImported: false,
          existingCaseId: null,
          sender: { displayName: "Customer", emailPresent: true },
          attachments: [
            {
              sourceAttachmentId: "AAMk-inline",
              name: "signature.jpg",
              mimeType: "image/jpeg",
              support: "inline_ignored",
              isInline: true,
              sizeBytes: 20
            }
          ]
        }
      ]
    }),
    openEstimate: async () => {
      throw new Error("inline must not open");
    }
  });
  await assert.rejects(
    () =>
      svc.sendToAiTakeoff({
        organizationId: ORG,
        messageKey: "msg-inline",
        attachmentKey: "AAMk-inline",
        confirm: true,
        manualPlanOverride: true
      }),
    (e) => e.code === "attachment_not_supported"
  );
  console.log("ok: inline/signature JPG manual override rejects");
}

console.log("\nstudioSharedInboxSendToTakeoff.test.mjs: ok\n");
