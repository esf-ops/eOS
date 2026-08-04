/**
 * Shared Inbox send-to-takeoff + image plan UI contracts.
 * Run: node app-elite100-estimate-studio/src/estimateQueue/sharedInboxPlanTakeoff.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const page = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/SharedInboxPage.tsx"),
  "utf8"
);
const api = readFileSync(
  join(root, "app-elite100-estimate-studio/src/lib/sharedInboxApi.mjs"),
  "utf8"
);
const readModel = readFileSync(
  join(root, "backend-core/src/elite100EstimateStudio/studioSharedInboxReadModel.mjs"),
  "utf8"
);
const service = readFileSync(
  join(root, "backend-core/src/elite100EstimateStudio/studioSharedInboxService.mjs"),
  "utf8"
);
const routes = readFileSync(
  join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
  "utf8"
);
const appSrc = readFileSync(
  join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"),
  "utf8"
);

console.log("\nsharedInboxPlanTakeoff.ui.test.mjs\n");

assert.match(readModel, /direct_image_plan/);
assert.match(readModel, /Supported image plan/);
assert.doesNotMatch(
  readModel,
  /No currently supported plan PDF is attached\. You can still import for manual estimate work\./
);
assert.match(
  readModel,
  /No currently supported plan PDF or image is attached/
);
console.log("ok: read model understands image plans; old PDF-only copy gone");

assert.match(page, /planSupportSummary/);
assert.match(page, /Supported image plan|planSupportSummary\?\.label/);
assert.match(page, /shared-inbox-send-to-takeoff/);
assert.match(page, /Send to AI Takeoff/);
assert.match(page, /Mark as plan for AI Takeoff/);
assert.match(page, /Open Studio V2|Continue in Studio V2/);
assert.match(page, /shared-inbox-open-studio-v2|shared-inbox-detail-open-studio-v2/);
assert.match(page, /studioV2:\s*true/);
assert.match(page, /onOpenEstimate\([\s\S]*studioV2:\s*true/);
assert.doesNotMatch(page, /Open AI Takeoff Lab/);
assert.match(appSrc, /setStudioV2Preview\(true\)/);
assert.match(appSrc, /applyStudioV2WorkspaceUrl/);
assert.match(appSrc, /onOpenTakeoffReview/);
assert.match(appSrc, /takeoffReviewReturnToV2|Back to Studio V2/);
assert.match(
  readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"), "utf8"),
  /studio-v2-takeoff-status-card|Open Takeoff Review/
);
assert.match(
  readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"), "utf8"),
  /Create Studio V2 Draft/
);
assert.doesNotMatch(
  readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/StudioV2EstimatorShell.tsx"), "utf8"),
  /Create or open it in V1 first/
);
assert.match(
  readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx"), "utf8"),
  /AI Takeoff Review/
);
assert.doesNotMatch(
  readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx"), "utf8"),
  />Estimate workspace</
);
console.log("ok: successful handoff → Studio V2; Takeoff Review preserved as supporting tool");

assert.match(page, /manualPlanOverride:\s*true/);
assert.match(page, /shared-inbox-mark-as-plan/);
assert.match(page, /Choose the plan file to send to AI Takeoff/);
assert.match(page, /choose_plan|Choose plan/);
assert.match(page, /shared-inbox-choose-plan-hint/);
assert.match(page, /shared-inbox-attachment-error/);
assert.match(page, /AI Takeoff could not import this file/);
assert.match(page, /setFocusAttachmentsForKey|focusAttachmentsForKey/);
assert.match(
  page,
  /data-testid="shared-inbox-send-to-takeoff"[\s\S]{0,220}onClick=\{\(\) => void runSendToAiTakeoff\(selected, a\)\}/
);
assert.match(page, /manualPlanOverride:\s*true/);
console.log("ok: multi-plan Choose plan UX + import_failed copy");

assert.match(api, /send-to-takeoff/);
assert.match(api, /sendSharedInboxToAiTakeoff/);
assert.match(api, /confirm:\s*true/);
assert.match(api, /manualPlanOverride/);
assert.match(api, /AI Takeoff could not import this file/);
console.log("ok: Inbox UI shows image plan label + Send / Mark / Lab actions");

assert.match(routes, /send-to-takeoff/);
assert.match(service, /sendToAiTakeoff/);
assert.match(service, /buildImportFailedDiagnostic|inbox-takeoff-import-failed-v1/);
assert.match(service, /studioEstimateEnsured:\s*false/);
assert.match(service, /calculated:\s*false/);
assert.match(service, /published:\s*false/);
assert.match(service, /sold:\s*false/);
assert.match(page, /startSharedInboxEstimate/);
assert.match(page, /resume_estimate|Start Estimate|primaryAction/);
assert.match(
  page,
  /const\s*\[\s*importingKey\s*,\s*setImportingKey\s*\]\s*=\s*useState/
);
console.log("ok: handoff route + no calculate/publish/sold; Start/Resume anchors remain");

console.log("\nsharedInboxPlanTakeoff.ui.test.mjs: ok\n");
