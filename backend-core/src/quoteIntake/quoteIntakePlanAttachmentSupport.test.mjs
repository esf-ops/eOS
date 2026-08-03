/**
 * Quote Intake plan attachment support — PDF + conservative image plans.
 * Run: node --experimental-strip-types backend-core/src/quoteIntake/quoteIntakePlanAttachmentSupport.test.mjs
 */
import assert from "node:assert/strict";
import {
  canMarkAsPlanForTakeoff,
  classifyPlanFileSupport,
  filenameLooksPlanLike,
  isAutoSupportedTakeoffSupport,
  planSupportLabel,
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
      isFileAttachment: true
    }),
    "image_needs_review"
  );
  assert.equal(
    classifyAttachmentMeta({
      "@odata.type": "#microsoft.graph.fileAttachment",
      id: "att-photo",
      name: "vacation.png",
      contentType: "image/png",
      size: 900,
      isInline: false
    }).support,
    "image_needs_review"
  );
  assert.equal(filenameLooksPlanLike("vacation.png"), false);
  assert.equal(canMarkAsPlanForTakeoff("image_needs_review"), true);
  assert.equal(isAutoSupportedTakeoffSupport("image_needs_review"), false);
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
