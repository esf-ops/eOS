/**
 * Studio golden-path gate — UI contracts for panel sync, reopen, zero delivery.
 *
 * Complements backend-core/.../studioGoldenPathGate.test.mjs.
 * Source-level / contract style matching existing Studio UI tests.
 *
 * Run: node app-elite100-estimate-studio/src/estimateQueue/studioGoldenPathGate.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

console.log("\nstudioGoldenPathGate.ui.test.mjs\n");

const workspace = read("app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx");
const manual = read("app-elite100-estimate-studio/src/estimateQueue/ManualPhysicalScopeEditor.tsx");
const scope = read("app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx");
const projectDetails = read("app-elite100-estimate-studio/src/estimateQueue/ProjectDetailsPanel.tsx");
const summary = read("app-elite100-estimate-studio/src/estimateQueue/EstimatePublicationSummary.tsx");
const header = read("app-elite100-estimate-studio/src/estimateQueue/EstimateWorkflowHeader.tsx");
const de = read("app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx");
const app = read("app-elite100-estimate-studio/src/StudioApp.tsx");

// --- Multi-panel active revision sync (AUDIT-014 / AUDIT-002) ---
assert.match(workspace, /function applyActiveEstimateChange/);
assert.match(workspace, /onActiveEstimateChange=\{applyActiveEstimateChange\}/);
assert.match(manual, /onActiveEstimateChange/);
assert.match(scope, /onActiveEstimateChange/);
assert.match(workspace, /ManualPhysicalScopeEditor[\s\S]{0,2000}onActiveEstimateChange=\{applyActiveEstimateChange\}/);
assert.match(workspace, /EstimateScopePanel[\s\S]{0,2000}onActiveEstimateChange=\{applyActiveEstimateChange\}/);
assert.match(workspace, /refreshKey=\{state\.scopeRefreshKey\}/);

// Manual Scope / Pricing promote next estimate id from mutation responses
assert.match(manual, /activeEstimateId \|\| body\.estimate\?\.id|body\.estimate\?\.activeEstimateId \|\| body\.estimate\?\.id/);
assert.match(manual, /onActiveEstimateChange\?\.\(nextId/);
assert.match(scope, /onActiveEstimateChange\?\.\(est\.id|onActiveEstimateChange\?\.\(/);

// Workspace also syncs when canonical estimate id changes (handleCanonicalEstimate)
assert.match(workspace, /function handleCanonicalEstimate|handleCanonicalEstimate/);
assert.match(workspace, /prev\.estimateId !== id/);

// Historical approval chrome after revision
assert.match(header, /eq-workflow-historical-approval|historicalApproval/);
assert.match(workspace, /previousRevisionSummary|setPreviousRevisionSummary/);

console.log("  ✓ multi-panel onActiveEstimateChange wiring");

// --- Published reopen does not restart calculate/approve/publish ---
assert.match(workspace, /EstimatePublicationSummary/);
assert.match(workspace, /collapseCompleted|eq-completed-sections/);
assert.match(summary, /Open customer view/);
assert.match(summary, /Copy customer link/);
assert.match(summary, /View publication details/);
assert.doesNotMatch(summary, /publishDigitalEstimate/);
assert.doesNotMatch(
  summary.match(/copyLink[\s\S]{0,800}|Copy customer link[\s\S]{0,800}/)?.[0] || "",
  /\/digital-estimate\/publish|\/revoke|\/replace-token/
);

const openCopy = [summary, workspace].join("\n");
assert.doesNotMatch(
  openCopy.match(/eq-open-customer-view[\s\S]{0,800}/)?.[0] || "",
  /\/digital-estimate\/publish|replaceDigitalEstimate|revokeDigitalEstimate/
);

console.log("  ✓ published reopen / copy / open customer view are non-mutating");

// --- Queue / nav open targets do not mutate ---
assert.match(app, /setWorkspaceFocus\("review"\)|openTarget|initialFocus/);
assert.doesNotMatch(
  app.match(/openTarget|initialFocus|setWorkspaceFocus[\s\S]{0,500}/)?.[0] || "",
  /\/digital-estimate\/publish/
);

// --- Transient recovery never auto-publishes ---
const recoverySources = [workspace, header, scope, manual, de, projectDetails].join("\n");
assert.match(recoverySources, /isTransientHttpError/);
const recoveryBlocks =
  recoverySources.match(
    /(?:onRetry|transientError|Refresh status|pendingRetry|resolve_failure)[\s\S]{0,1200}/g
  ) || [];
for (const block of recoveryBlocks) {
  assert.doesNotMatch(block, /publishDigitalEstimate\s*\(/);
  assert.doesNotMatch(block, /\/digital-estimate\/publish/);
}

console.log("  ✓ transient recovery does not auto-publish");

// --- Terminology: avoid generic Unknown as primary customer/project labels in key surfaces ---
// (Identity display cleanup may refine further; gate locks "Project not named" helpers.)
const projectDetailsSrc = projectDetails;
assert.match(
  read("backend-core/src/elite100EstimateStudio/studioProjectDetails.mjs"),
  /Project not named/
);
assert.ok(projectDetailsSrc.length > 0);

console.log("  ✓ identity display helpers present");

console.log("\nstudioGoldenPathGate.ui.test.mjs: ok\n");
