/**
 * Studio workspace action sequencing — UI contracts (source-level).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/studioWorkspaceSequencing.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const header = read("app-elite100-estimate-studio/src/estimateQueue/EstimateWorkflowHeader.tsx");
const workspace = read("app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx");
const scopePanel = read("app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx");
const projectDetails = read("app-elite100-estimate-studio/src/estimateQueue/ProjectDetailsPanel.tsx");
const manualEditor = read("app-elite100-estimate-studio/src/estimateQueue/ManualPhysicalScopeEditor.tsx");
const api = read("app-elite100-estimate-studio/src/lib/api.ts");

console.log("\nstudioWorkspaceSequencing.ui.test.mjs\n");

// EstimateWorkflowHeader — transient recovery chrome
assert.match(header, /eq-workflow-header/);
assert.match(header, /Service temporarily unavailable/);
assert.match(header, /Refresh status/);
assert.match(header, /data-testid="eq-workflow-historical-approval"/);

// Workspace wires workflow header + coherent refresh after manual scope mutations
assert.match(workspace, /EstimateWorkflowHeader/);
assert.match(workspace, /onActiveEstimateChange/);
assert.match(manualEditor, /onActiveEstimateChange/);
assert.match(workspace, /refreshKey=\{state\.scopeRefreshKey\}/);
assert.match(workspace, /ManualPhysicalScopeEditor[\s\S]{0,1200}refreshKey/);

// EstimateScopePanel — calculate gated; no silent save-before-calculate when dirty
assert.match(scopePanel, /isTransientHttpError|transientFailureMessage/);
assert.match(scopePanel, /workflowAllowsAction|allowedActions|workflow\?/);

const calculateFn =
  scopePanel.match(/async function calculate\(\)[\s\S]*?(?=\n  async function |\n  if \(loadError\))/m)?.[0] ||
  "";
assert.ok(calculateFn.length > 0, "calculate() function present");
assert.match(
  calculateFn,
  /Save Pricing Setup before calculating|Save Pricing before calculating|pricingDirty|save_pricing/
);
assert.doesNotMatch(
  calculateFn,
  /if\s*\(\s*dirty\s*\)\s*\{[\s\S]{0,240}apiPatch[\s\S]{0,400}\/calculate/
);
assert.match(scopePanel, /disabled=\{[^}]*(dirty|pricingDirty|workflow|allowedActions)/);
assert.match(scopePanel, /eq-calculate-estimate/);

// Approve disabled before priced / when workflow disallows approve
assert.match(scopePanel, /eq-approve-estimate/);
assert.match(
  scopePanel,
  /disabled=\{[^}]*estimate\.status\s*!==\s*"priced"|workflowAllowsAction\(workflow,\s*"approve"\)|!workflowAllowsAction/
);

// Historical approval test id (header or scope panel)
assert.ok(
  /eq-historical-approval|eq-workflow-historical-approval/.test(header + scopePanel),
  "historical approval test id"
);

// ProjectDetailsPanel — transient errors preserve form
assert.match(projectDetails, /isTransientHttpError/);
assert.match(projectDetails, /transientFailureMessage/);
assert.match(projectDetails, /setProjectName\(next\.projectName\)|setProjectName\(baseline\.projectName\)/);
assert.doesNotMatch(
  projectDetails.match(/catch\s*\([^)]*\)\s*\{[\s\S]{0,400}setProjectName\(\s*""\s*\)/)?.[0] || "",
  /setProjectName\(\s*""\s*\)/
);

// api.ts — transient gateway statuses
assert.match(api, /export function isTransientHttpError/);
assert.match(api, /502|503|504/);
assert.match(api, /export function transientFailureMessage/);

// Recovery / retry paths must never auto-publish
const recoverySources = [workspace, header, scopePanel, manualEditor].join("\n");
const recoveryBlocks = recoverySources.match(
  /(?:onRetry|transientError|resolve_failure|refresh_status|eq-workflow-retry)[\s\S]{0,1200}/g
) || [];
for (const block of recoveryBlocks) {
  assert.doesNotMatch(block, /publishDigitalEstimate/);
}
assert.doesNotMatch(
  workspace.match(/EstimateWorkflowHeader[\s\S]{0,2500}/)?.[0] || workspace,
  /publishDigitalEstimate/
);

console.log("ok: Studio workspace sequencing UI contracts");
console.log("\nstudioWorkspaceSequencing.ui.test.mjs: ok\n");
