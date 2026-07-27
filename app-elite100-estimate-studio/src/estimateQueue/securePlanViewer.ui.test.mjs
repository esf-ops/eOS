/**
 * Secure Plan Viewer UI contracts (source-level; no browser / no real mailbox).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/securePlanViewer.ui.test.mjs
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
const workspace = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx"),
  "utf8"
);
const modal = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/PlanViewerModal.tsx"),
  "utf8"
);
const api = readFileSync(
  join(root, "app-elite100-estimate-studio/src/lib/securePlanViewerApi.mjs"),
  "utf8"
);
const styles = readFileSync(join(root, "app-elite100-estimate-studio/src/styles.css"), "utf8");

console.log("\nsecurePlanViewer.ui.test.mjs\n");

assert.match(page, /shared-inbox-view-plan/);
assert.match(page, /View plan/);
assert.match(page, /Preview not supported/);
assert.match(page, /shared-inbox-preview-unsupported/);
assert.match(page, /PlanViewerModal/);
assert.match(page, /fetchSharedInboxPlanContent/);
assert.match(page, /sourceContext="shared-inbox"/);
assert.match(page, /Plans open in the secure Studio viewer/);
assert.equal(/dangerouslySetInnerHTML/.test(page), false);
assert.equal(/graph\.microsoft|contentUrl|downloadUrl|attachmentUrl/i.test(page), false);
console.log("ok: 37–38 Shared Inbox View plan / Preview not supported");

const fetchCallSites = page.match(/fetchSharedInboxPlanContent\s*\(/g) || [];
assert.equal(fetchCallSites.length, 1, "bytes fetched only via explicit View plan loadContent");
assert.match(page, /loadContent=\{async \(\) => \{[\s\S]*?fetchSharedInboxPlanContent/);
assert.match(page, /setPlanViewer\(/);
assert.ok(page.indexOf("setSelectedKey") < page.indexOf("setPlanViewer"));
assert.equal(/fetchSharedInboxPlanContent\s*\(/.test(page.split("loadInbox")[1]?.split("PlanViewerModal")[0] || ""), false);
console.log("ok: 39–41 list/detail do not auto-fetch bytes; View plan fetches selected attachment");

assert.match(modal, /createObjectURL/);
assert.match(modal, /revokeObjectURL/);
assert.match(modal, /plan-viewer-pdf|plan-viewer-image/);
assert.match(modal, /plan-viewer-retry/);
assert.match(modal, /Retry viewing plan/);
assert.match(modal, /You do not have access to this plan/);
assert.match(modal, /status === 401 \|\| e\.status === 403/);
assert.equal(/dangerouslySetInnerHTML/.test(modal), false);
assert.equal(/localStorage|sessionStorage/.test(modal), false);
console.log("ok: 42–48 Blob URL lifecycle, retry, auth clear, no storage cache");

assert.equal(/importSharedInboxMessage/.test(page.split("shared-inbox-view-plan")[1]?.slice(0, 400) || ""), false);
assert.equal(/Approve Takeoff|startTakeoff|createRevision|publish/i.test(modal), false);
console.log("ok: 49–53 View plan does not import / Takeoff / publish");

assert.match(workspace, /eq-source-plan/);
assert.match(workspace, /No plan attached/);
assert.match(workspace, /eq-view-plan/);
assert.match(workspace, /View plan/);
assert.match(workspace, /fetchIntakeSourcePlans/);
assert.match(workspace, /fetchIntakePlanContent/);
assert.match(workspace, /eq-source-plan-select|Additional plans/);
assert.match(workspace, /Manual estimates without plans remain valid/);
assert.match(workspace, /eq-takeoff-view-source-plan/);
assert.match(workspace, /View source plan/);
assert.match(workspace, /sourceContext: "ai-takeoff"/);
assert.match(workspace, /PlanViewerModal/);
console.log("ok: 54–65 Source & Plan + Takeoff view source plan wiring");

assert.match(api, /Authorization.*Bearer/);
assert.match(api, /cache: "no-store"/);
assert.match(api, /shared-inbox\/\$\{encodeURIComponent\(messageKey\)\}\/attachments/);
assert.match(api, /intake-cases\/\$\{encodeURIComponent\(caseId\)\}\/attachments/);
assert.equal(/createSignedUrl|graph\.microsoft/i.test(api), false);
console.log("ok: securePlanViewerApi uses authenticated blob fetch only");

assert.match(styles, /\.si-plan-viewer/);
assert.match(styles, /\.eq-source-plan/);
console.log("ok: viewer + source-plan styles present");

console.log("\nsecurePlanViewer.ui.test.mjs: ok\n");
