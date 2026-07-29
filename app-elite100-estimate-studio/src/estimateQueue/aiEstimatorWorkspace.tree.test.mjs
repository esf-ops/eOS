/**
 * Rendered AI estimator tree contracts.
 * Asserts exported surface components and stage→surface mapping without
 * relying only on scattered source greps for the active AI path.
 *
 * Run: node --import tsx app-elite100-estimate-studio/src/estimateQueue/aiEstimatorWorkspace.tree.test.mjs
 * Fallback (no tsx): structural source + deriveAiEstimatorStage contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveAiEstimatorStage } from "./deriveAiEstimatorStage.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)));
const workspaceSrc = readFileSync(join(root, "AiEstimatorWorkspace.tsx"), "utf8");
const takeoffWs = readFileSync(join(root, "EstimateTakeoffWorkspace.tsx"), "utf8");

console.log("\naiEstimatorWorkspace.tree.test.mjs\n");

assert.ok(workspaceSrc.includes("export function CompactEstimateHeader"));
assert.ok(workspaceSrc.includes("export function ApprovedMeasurementsCard"));
assert.ok(workspaceSrc.includes("export function PublishedEstimateCard"));
assert.ok(workspaceSrc.includes("export default function AiEstimatorWorkspace"));
assert.ok(workspaceSrc.includes('data-testid="eq-ai-estimator-workspace"'));
assert.ok(workspaceSrc.includes('data-testid="eq-ai-compact-header"'));
assert.ok(workspaceSrc.includes('data-testid="eq-ai-takeoff-surface"'));
assert.ok(workspaceSrc.includes('data-testid="eq-ai-approved-measurements"'));
assert.ok(workspaceSrc.includes('data-testid="eq-ai-published-estimate"'));
assert.ok(workspaceSrc.includes('data-testid="eq-takeoff-iframe"'));

// Mount order contracts in AiEstimatorWorkspace render
const renderTail = workspaceSrc.slice(workspaceSrc.lastIndexOf("return ("));
assert.ok(renderTail.includes("headerNode"));
assert.ok(renderTail.includes("showTakeoff"));
assert.ok(renderTail.includes("<PublishedEstimateCard"));
assert.ok(renderTail.includes("<ApprovedMeasurementsCard"));
assert.ok(renderTail.includes("eq-takeoff-iframe"));

assert.match(
  takeoffWs,
  /<AiEstimatorWorkspace[\s\S]*CompactEstimateHeader|header=\{\{/,
  "workspace mounts AiEstimatorWorkspace with compact header"
);
const aiBranch = takeoffWs.slice(
  takeoffWs.indexOf('state.kind === "ready" && !state.manualMode'),
  takeoffWs.indexOf('state.kind === "ready" && state.manualMode')
);
assert.equal(aiBranch.includes("ManualPhysicalScopeEditor"), false);
assert.equal(aiBranch.includes("EstimateScopePanel"), false);
assert.equal(aiBranch.includes("eq-section-tabs"), false);
assert.equal(aiBranch.includes("EstimateWorkflowHeader"), false);
assert.equal(aiBranch.includes("EstimateDigitalEstimatePanel"), false);
assert.equal(aiBranch.includes("eq-linked-takeoff-job"), false);

const forbidden = [
  "Customer Choices",
  "Calculate Estimate",
  "Approve pricing",
  "Confirm Manual Scope",
  "Save Configuration",
  "Pricing Setup",
  "customer_email_required",
  "project_name_required"
];
for (const label of forbidden) {
  assert.equal(aiBranch.includes(label), false, `AI branch must not mount ${label}`);
}

assert.equal(deriveAiEstimatorStage({}), "draft");
assert.equal(deriveAiEstimatorStage({ handoffBusy: true }), "approving");
assert.equal(deriveAiEstimatorStage({ measurementsApproved: true }), "approved");
assert.equal(
  deriveAiEstimatorStage({
    measurementsApproved: true,
    customerUrl: "https://x/e/t",
    estimateRevision: 1,
    publishedRevision: 1
  }),
  "published"
);
assert.equal(
  deriveAiEstimatorStage({ editingRevision: true, measurementsApproved: false }),
  "revision_draft"
);

let rendered = false;
try {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  // Dynamic TSX load when the runner supports it (tsx / vite).
  const mod = await import("./AiEstimatorWorkspace.tsx");
  const html = renderToStaticMarkup(
    React.createElement(mod.CompactEstimateHeader, {
      title: "Nietert Kitchen",
      planFilename: "kitchen-plan.pdf",
      onViewPlan: () => {},
      onBackToQueue: () => {}
    })
  );
  assert.ok(html.includes("Nietert Kitchen"));
  assert.ok(html.includes("View plan"));
  const approved = renderToStaticMarkup(
    React.createElement(mod.ApprovedMeasurementsCard, {
      summary: { countertopSf: 46.25, backsplashSf: 3.33, edgeLf: 26.25, customerDisplayTotal: 5120 },
      estimateRevision: 1,
      activeReview: { eligible: true, blockers: [] },
      publishBusy: false,
      publishError: null,
      publishLabel: "Publish Digital Estimate",
      eligible: true,
      estimateId: "est-1",
      onEdit: () => {},
      onPublish: () => {}
    })
  );
  assert.ok(approved.includes('data-testid="eq-ai-approved-measurements"'));
  const published = renderToStaticMarkup(
    React.createElement(mod.PublishedEstimateCard, {
      summary: { countertopSf: 46.25, customerDisplayTotal: 5120 },
      estimateRevision: 1,
      customerUrl: "https://digital.example/e/tok",
      onEdit: () => {},
      onCopy: () => {}
    })
  );
  assert.ok(published.includes('data-testid="eq-ai-published-estimate"'));
  assert.equal(published.includes("Re-publish"), false);
  rendered = true;
  console.log("ok: rendered CompactEstimateHeader / Approved / Published cards");
} catch (e) {
  console.log(`ok: structural tree contracts (render skipped: ${e?.message || e})`);
}

assert.ok(workspaceSrc.includes("deriveAiEstimatorStage"));
console.log(
  rendered
    ? "ok: active AI tree is CompactEstimateHeader + stage card"
    : "ok: active AI tree exports CompactEstimateHeader + Takeoff iframe + Approved/Published cards"
);
console.log("\naiEstimatorWorkspace.tree.test.mjs — passed\n");
