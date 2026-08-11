/**
 * Quote Intake plan attachment support — PDF + conservative image plans.
 * Run: node --experimental-strip-types backend-core/src/quoteIntake/quoteIntakePlanAttachmentSupport.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildLiveManualPlanAttachmentCandidate,
  canMarkAsPlanForTakeoff,
  classifyPlanFileSupport,
  filenameLooksPlanLike,
  findScopedAttachment,
  isAutoSupportedTakeoffSupport,
  isSafeManualPlanImageOverride,
  planSupportLabel,
  requestHasManualPlanOverride,
  summarizeRowPlanSupport
} from "./quoteIntakePlanAttachmentSupport.mjs";
import { classifyAttachmentMeta } from "./quoteIntakeGraphNormalize.mjs";
import { isSupportedTakeoffPlan } from "./quoteIntakeAttachmentMeta.mjs";

console.log("\nquoteIntakePlanAttachmentSupport.test.mjs\n");

{
  assert.equal(
    classifyPlanFileSupport({
      mimeType: "application/pdf",
      name: "anything.pdf",
      isFileAttachment: true
    }),
    "direct_pdf"
  );
  assert.equal(
    classifyAttachmentMeta({
      "@odata.type": "#microsoft.graph.fileAttachment",
      id: "att-pdf",
      name: "kitchen.pdf",
      contentType: "application/pdf",
      size: 1000,
      isInline: false
    }).support,
    "direct_pdf"
  );
  console.log("ok: PDF remains supported");
}

{
  for (const [mime, name] of [
    ["image/jpeg", "kitchen-plan.jpg"],
    ["image/jpeg", "countertop-layout.jpeg"],
    ["image/png", "bathroom-plan.png"],
    ["image/webp", "vanity-sketch.webp"]
  ]) {
    assert.equal(
      classifyPlanFileSupport({ mimeType: mime, name, isFileAttachment: true }),
      "direct_image_plan",
      `${name} should be auto image plan`
    );
    assert.equal(
      classifyAttachmentMeta({
        "@odata.type": "#microsoft.graph.fileAttachment",
        id: `att-${name}`,
        name,
        contentType: mime,
        size: 2000,
        isInline: false
      }).support,
      "direct_image_plan"
    );
  }
  console.log("ok: plan-like JPG/JPEG/PNG/WEBP are supported image plans");
}

{
  assert.equal(
    classifyPlanFileSupport({
      mimeType: "image/jpeg",
      name: "IMG_1234.jpg",
      isFileAttachment: true,
      sizeBytes: 250_000
    }),
    "image_needs_review"
  );
  assert.equal(
    classifyAttachmentMeta({
      "@odata.type": "#microsoft.graph.fileAttachment",
      id: "att-photo",
      name: "vacation.png",
      contentType: "image/png",
      size: 250000,
      isInline: false
    }).support,
    "image_needs_review"
  );
  assert.equal(
    classifyAttachmentMeta({
      "@odata.type": "#microsoft.graph.fileAttachment",
      id: "att-tiny",
      name: "image001.jpg",
      contentType: "image/jpeg",
      size: 900,
      isInline: false
    }).support,
    "likely_inline_image"
  );
  assert.equal(filenameLooksPlanLike("vacation.png"), false);
  assert.equal(canMarkAsPlanForTakeoff("image_needs_review"), true);
  assert.equal(isAutoSupportedTakeoffSupport("image_needs_review"), false);
  assert.equal(
    isSafeManualPlanImageOverride({
      support: "image_needs_review",
      mimeType: "image/jpeg",
      name: "IMG_99.jpg"
    }),
    true
  );
  assert.equal(
    isSafeManualPlanImageOverride({
      support: "metadata_only",
      mimeType: "application/octet-stream",
      safeFilename: "scan.webp"
    }),
    true
  );
  assert.equal(
    isSafeManualPlanImageOverride({
      support: "metadata_only",
      mimeType: "application/pdf",
      name: "notes.docx"
    }),
    false
  );
  assert.equal(
    isSafeManualPlanImageOverride({
      support: "image_needs_review",
      mimeType: "image/jpeg",
      isInline: true
    }),
    false
  );
  assert.equal(requestHasManualPlanOverride({ manualPlanOverride: true }), true);
  assert.equal(requestHasManualPlanOverride({ markAsPlan: true }), true);
  assert.equal(requestHasManualPlanOverride({ markAsPlan: false }), false);

  const graphKey = "AAMkAGI2TH93AAA=EAAAAAAopaque==";
  const list = [
    {
      id: "uuid-1",
      sourceAttachmentId: null,
      safeFilename: "1000005197.jpg",
      support: "image_needs_review"
    },
    {
      id: "uuid-2",
      sourceAttachmentId: graphKey.slice(0, 20),
      safeFilename: "1000005196.jpg",
      support: "image_needs_review"
    }
  ];
  assert.equal(
    findScopedAttachment(list, {
      attachmentKey: graphKey,
      filename: "1000005197.jpg",
      allowFilenameFallback: true
    })?.id,
    "uuid-1"
  );
  assert.equal(
    findScopedAttachment(list, { attachmentKey: graphKey, allowFilenameFallback: false }),
    null
  );
  assert.equal(
    classifyPlanFileSupport({
      mimeType: "application/pdf",
      name: "plan.pdf",
      isFileAttachment: true
    }),
    "direct_pdf"
  );

  const live = buildLiveManualPlanAttachmentCandidate({
    liveAttachment: {
      attachmentKey: "AAkALgAAopaque",
      filename: "1000005197.jpg",
      contentType: "image/jpeg",
      isInline: false,
      support: "image_needs_review"
    },
    attachmentKey: "AAkALgAAopaque",
    providerMessageId: "graph-msg-1"
  });
  assert.ok(live);
  assert.equal(live.safeFilename, "1000005197.jpg");
  assert.equal(live.sourceAttachmentId, "AAkALgAAopaque");
  assert.equal(live.providerMessageId, "graph-msg-1");
  assert.equal(
    buildLiveManualPlanAttachmentCandidate({
      liveAttachment: {
        filename: "sig.jpg",
        contentType: "image/jpeg",
        isInline: true
      },
      attachmentKey: "inline-1"
    }),
    null
  );
  console.log("ok: unrelated images are not blindly auto-classified as plans");
}

{
  assert.equal(
    classifyAttachmentMeta({
      "@odata.type": "#microsoft.graph.fileAttachment",
      id: "att-inline",
      name: "plan.jpg",
      contentType: "image/jpeg",
      size: 100,
      isInline: true
    }).support,
    "inline_ignored"
  );
  console.log("ok: inline images never auto-classified as plans");
}

{
  assert.equal(isSupportedTakeoffPlan({ support: "direct_pdf" }), true);
  assert.equal(isSupportedTakeoffPlan({ support: "direct_image_plan" }), true);
  assert.equal(isSupportedTakeoffPlan({ support: "image_needs_review" }), false);
  assert.equal(planSupportLabel("direct_image_plan"), "Supported image plan");
  const summary = summarizeRowPlanSupport([
    { support: "direct_image_plan", supportedForTakeoff: true }
  ]);
  assert.equal(summary.label, "Supported image plan");
  assert.equal(summary.supported, true);
  console.log("ok: takeoff eligibility + row labels");
}

console.log("\nquoteIntakePlanAttachmentSupport.test.mjs: ok\n");
