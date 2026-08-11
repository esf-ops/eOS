/**
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowVanityDepth.test.mjs
 */
import assert from "node:assert/strict";
import {
  normalizeVanityQuotedDepth,
  VANITY_QUOTED_DEPTH_IN
} from "./quoteFlowVanityDepth.mjs";
import {
  classifyPlanFileSupport,
  looksLikeLikelyInlineEmailImage
} from "../quoteIntake/quoteIntakePlanAttachmentSupport.mjs";

console.log("\nquoteFlowVanityDepth.test.mjs\n");

{
  const vanity = normalizeVanityQuotedDepth(
    { name: "Vanity top", pieceType: "counter", lengthIn: 60, depthIn: 21.5, quantity: 1 },
    { roomName: "Bathrooms", roomType: "Bathroom" }
  );
  assert.equal(vanity.depthIn, VANITY_QUOTED_DEPTH_IN);
  assert.equal(vanity.rawAiDepthIn, 21.5);
  assert.equal(vanity.normalizedBy, "vanity_overhang_default");
  assert.match(String(vanity.normalizationNote), /21\.5/);
  console.log("ok: vanity 21.5 → 22.5 overhang default");
}

{
  const kitchen = normalizeVanityQuotedDepth(
    { name: "Sink run", pieceType: "counter", lengthIn: 96, depthIn: 21.5, quantity: 1 },
    { roomName: "Kitchen", roomType: "Kitchen" }
  );
  assert.equal(kitchen.depthIn, 21.5);
  assert.equal(kitchen.normalizedBy, undefined);
  console.log("ok: non-vanity 21.5 does not normalize");
}

{
  const staff = normalizeVanityQuotedDepth(
    {
      name: "Vanity top",
      lengthIn: 48,
      depthIn: 21.5,
      depthStaffEdited: true
    },
    { roomName: "Bath", roomType: "Bath" }
  );
  assert.equal(staff.depthIn, 21.5);
  console.log("ok: staff-edited depth is not overwritten");
}

{
  const already = normalizeVanityQuotedDepth(
    { name: "Vanity", depthIn: 22.5 },
    { roomName: "Powder", roomType: "Powder" }
  );
  assert.equal(already.depthIn, 22.5);
  assert.equal(already.normalizedBy, undefined);
  console.log("ok: already 22.5 vanity left alone");
}

{
  assert.equal(
    looksLikeLikelyInlineEmailImage({
      name: "image001.jpg",
      contentType: "image/jpeg",
      sizeBytes: 12_000
    }),
    true
  );
  assert.equal(
    classifyPlanFileSupport({
      name: "image001.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 12_000,
      isFileAttachment: true
    }),
    "likely_inline_image"
  );
  assert.equal(
    classifyPlanFileSupport({
      name: "Renewed-Mercer Pre Bathrooms Countertops.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 850_000,
      isFileAttachment: true
    }),
    "direct_image_plan"
  );
  console.log("ok: inline image filtered; real plan JPG supported");
}

console.log("\nquoteFlowVanityDepth.test.mjs: ok\n");
