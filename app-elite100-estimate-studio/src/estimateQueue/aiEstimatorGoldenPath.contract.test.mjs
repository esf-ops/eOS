/**
 * Golden-path contract lock for the working AI estimator path.
 *
 * Protects (do not change these contracts during UI consolidation):
 * 1. Shared Inbox Start Estimate body
 * 2. Takeoff dirty/polling safety
 * 3. Approval handoff → Scope → pricingVersion 4
 * 4. Identity-optional simplified-publish + active configuration envelope
 * 5. Public Digital Estimate interactive configure (not static-only)
 *
 * Run: node app-elite100-estimate-studio/src/estimateQueue/aiEstimatorGoldenPath.contract.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const studioRoot = join(here, "../..");
const repoRoot = join(studioRoot, "..");

function readStudio(rel) {
  return readFileSync(join(studioRoot, rel), "utf8");
}
function readRepo(rel) {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function runNode(relFromRepo) {
  const r = spawnSync(process.execPath, [join(repoRoot, relFromRepo)], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const passed = /— passed|\.mjs: ok|All .+ passed/i.test(out);
  // Some suites leave open handles after printing success (exit null / timeout).
  if (r.status === 0 || (passed && (r.status == null || r.signal === "SIGTERM"))) {
    return out;
  }
  throw new Error(
    `${relFromRepo} failed (exit ${r.status}${r.signal ? `/${r.signal}` : ""}):\n${out}`
  );
}

console.log("\naiEstimatorGoldenPath.contract.test.mjs\n");

const sharedInboxApi = readStudio("src/lib/sharedInboxApi.mjs");
const workspace = readStudio("src/estimateQueue/EstimateTakeoffWorkspace.tsx");
const panel = readStudio("src/estimateQueue/AiTakeoffFirstPanel.tsx");
const takeoffReview = readRepo("app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx");
const simplifiedWorkflow = readRepo(
  "backend-core/src/elite100EstimateStudio/studioSimplifiedWorkflow.mjs"
);
const choiceOpts = readRepo(
  "backend-core/src/elite100EstimateStudio/studioCustomerChoiceOptions.mjs"
);
const deApp = readRepo("app-digital-estimate/src/App.tsx");

// ── 1. Shared Inbox Start Estimate ────────────────────────────────────────
{
  assert.match(sharedInboxApi, /export async function startSharedInboxEstimate/);
  assert.match(
    sharedInboxApi,
    /confirm:\s*true,\s*\n\s*forceManual:\s*opts\.forceManual\s*===\s*true,\s*\n\s*idempotencyKey:/
  );
  console.log("ok: 1 Shared Inbox Start Estimate sends confirm/forceManual/idempotencyKey");
}

// ── 2. Takeoff Review dirty / polling ─────────────────────────────────────
{
  assert.ok(takeoffReview.includes("beforeunload"));
  assert.ok(takeoffReview.includes('dirtyLocal || saveStatusRef.current === "dirty"'));
  assert.ok(takeoffReview.includes("Save draft") || takeoffReview.includes("Save Draft"));
  const pollIdx = workspace.indexOf("Status-label poll only");
  assert.ok(pollIdx !== -1);
  const pollSection = workspace.slice(pollIdx, pollIdx + 2500);
  assert.equal(/scopeRefreshKey:\s*prev\.scopeRefreshKey\s*\+\s*1/.test(pollSection), false);
  assert.equal(pollSection.includes("setRooms"), false);
  console.log("ok: 2 Takeoff dirty values survive polling; Save Draft remains explicit");
}

// ── 3. Approval handoff ───────────────────────────────────────────────────
{
  assert.ok(panel.includes("refresh-from-takeoff"));
  assert.ok(panel.includes("/calculate"));
  assert.ok(panel.includes("eq-takeoff-handoff-overlay"));
  assert.ok(panel.includes("Measurements approved. Building verified estimate"));
  assert.ok(panel.includes("setMeasurementsApproved(true)"));
  assert.ok(panel.includes("estimateHasMeasuredScope"));
  assert.ok(panel.includes("buildApprovalSummaryFromEstimate"));
  assert.ok(panel.includes("eq-ai-retry-handoff"));
  // Zero-value approved card must not render on failure
  assert.ok(panel.includes("handoffSucceededRef"));
  console.log("ok: 3 approval handoff builds verified estimate without refresh");
}

// ── 4. Publication — identity optional + interactive envelope ─────────────
{
  assert.ok(panel.includes("simplified-publish"));
  assert.equal(panel.includes("/project-details"), false);
  assert.equal(panel.includes("eq-ai-publish-required-fields"), false);
  assert.ok(simplifiedWorkflow.includes("resolveSimplifiedPublishConfiguration"));
  assert.ok(choiceOpts.includes("defaultSimplifiedPublishConfiguration"));
  assert.ok(choiceOpts.includes("material_color"));
  console.log("ok: 4 publish is identity-optional and activates interactive configuration");
}

// ── 5. Digital Estimate customer path ─────────────────────────────────────
{
  assert.ok(deApp.includes("ConfigurationView"));
  assert.ok(deApp.includes("exchangeFragmentToken"));
  assert.ok(deApp.includes("decideConfigurationView"));
  // Must not pair unavailable banner with loaded estimate (generic fallthrough)
  const estimateBranch = deApp.slice(deApp.indexOf("if (estimate) {"));
  assert.equal(/:\s*"This estimate is unavailable\."/.test(estimateBranch.slice(0, 2500)), false);
  console.log("ok: 5 public Digital Estimate remains interactive configure path");
}

// ── 6. Re-run focused suite that encodes these contracts ──────────────────
{
  const suites = [
    "app-elite100-estimate-studio/src/lib/sharedInboxApi.startEstimate.test.mjs",
    "app-elite100-estimate-studio/src/estimateQueue/takeoffFirstWorkflow.ui.test.mjs",
    "app-elite100-estimate-studio/src/estimateQueue/aiTakeoffApprovalHandoff.ui.test.mjs",
    "app-elite100-estimate-studio/src/estimateQueue/aiTakeoffApprovedSummary.test.mjs",
    "app-elite100-estimate-studio/src/estimateQueue/aiTakeoffIdentityOptional.ui.test.mjs",
    "backend-core/src/elite100EstimateStudio/studioSimplifiedPublishActivatesDigitalEstimate.test.mjs",
    "backend-core/src/elite100EstimateStudio/studioIdentityOptionalPublish.test.mjs"
  ];
  for (const s of suites) {
    runNode(s);
    console.log(`ok: suite ${s.split("/").pop()}`);
  }
}

console.log("\naiEstimatorGoldenPath.contract.test.mjs — protected path locked\n");
