/**
 * Published estimate reopen — UI contracts (source-level).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/studioPublishedReopen.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const workspace = read("app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx");
const summary = read("app-elite100-estimate-studio/src/estimateQueue/EstimatePublicationSummary.tsx");
const scope = read("app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx");
const de = read("app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx");
const app = read("app-elite100-estimate-studio/src/StudioApp.tsx");
const workflow = read("backend-core/src/elite100EstimateStudio/studioWorkspaceWorkflow.mjs");
const routes = read("backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js");

console.log("\nstudioPublishedReopen.ui.test.mjs\n");

assert.match(summary, /eq-publication-summary/);
assert.match(summary, /Open customer view/);
assert.match(summary, /Copy customer link/);
assert.match(summary, /View publication details/);
assert.doesNotMatch(summary, /publishDigitalEstimate/);
assert.doesNotMatch(summary.match(/copyLink[\s\S]{0,800}/)?.[0] || "", /apiPost|\/publish|\/revoke|\/replace/);

assert.match(workspace, /EstimatePublicationSummary/);
assert.match(workspace, /eq-completed-sections|collapseCompleted/);
assert.match(workspace, /eq-publication-summary/);
assert.match(workspace, /focus === "digital"|initialFocus === "digital"/);

assert.match(scope, /collapseCompleted/);
assert.match(scope, /eq-scope-collapsed|eq-expand-pricing-sections/);
assert.match(scope, /onPublicationSummary/);

assert.match(de, /estimate-digital-estimate-panel/);
assert.match(de, /publicationSummary/);
assert.match(de, /Publication status could not be refreshed/);
assert.match(de, /isTransientHttpError/);

assert.match(workflow, /currentStage = "published"/);
assert.match(workflow, /wait_for_customer/);
assert.match(workflow, /open_customer_view/);
assert.doesNotMatch(
  workflow.match(/publicationActive[\s\S]{0,1200}/)?.[0] || "",
  /nextRequiredAction = "calculate"/
);

assert.match(routes, /getWorkspacePublicationSummary/);
assert.match(app, /setWorkspaceFocus\("review"\)/);

// Open/copy must not call mutation endpoints in summary or workspace handlers
const openCopyBlocks = [summary, workspace].join("\n");
assert.doesNotMatch(
  openCopyBlocks.match(/eq-open-customer-view[\s\S]{0,600}/)?.[0] || "",
  /\/digital-estimate\/publish|replaceDigitalEstimate|revokeDigitalEstimate/
);

console.log("ok: published reopen UI contracts");
console.log("\nstudioPublishedReopen.ui.test.mjs: ok\n");
