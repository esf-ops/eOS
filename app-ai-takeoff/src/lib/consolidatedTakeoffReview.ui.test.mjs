/**
 * Consolidated Takeoff review UI — wiring tests (no browser).
 * Run: node app-ai-takeoff/src/lib/consolidatedTakeoffReview.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(root, "components/ConsolidatedTakeoffReview.tsx"), "utf8");
const main = readFileSync(join(root, "main.tsx"), "utf8");
const api = readFileSync(join(root, "lib/api.ts"), "utf8");
const clickHelper = readFileSync(join(root, "lib/consolidatedApproveClick.mjs"), "utf8");
const draftHelper = readFileSync(join(root, "lib/emptyManualTakeoffDraft.mjs"), "utf8");
const scopePanel = readFileSync(
  join(root, "../../app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"),
  "utf8"
);

console.log("\nconsolidatedTakeoffReview.ui.test.mjs\n");

assert.ok(main.includes("consolidated") && main.includes("ConsolidatedTakeoffReview"));
assert.ok(clickHelper.includes("Approve Takeoff & Build Estimate"));
assert.ok(component.includes("approveButtonLabel"));
assert.ok(component.includes("data-testid=\"consolidated-takeoff-review\""));
assert.ok(component.includes("data-testid=\"ctr-worksheet\""));
assert.ok(component.includes("data-testid=\"ctr-add-room\""));
assert.ok(component.includes("data-testid=\"ctr-add-piece\""));
assert.ok(component.includes("data-testid=\"ctr-save-draft\""));
assert.ok(component.includes("data-testid=\"ctr-retry-ai\""));
assert.ok(component.includes("data-testid=\"ctr-ai-banner\""));
assert.ok(component.includes("createEmptyManualTakeoffDraft"));
assert.ok(component.includes("AI Takeoff is processing. You may build or edit the takeoff now."));
assert.ok(component.includes("AI findings will be"));
assert.ok(component.includes("added when ready."));
assert.ok(
  !component.includes("this worksheet appears when the draft is ready"),
  "must not gate worksheet on AI draft"
);
assert.ok(component.includes("pendingAiMerge"));
assert.ok(component.includes("AI findings are ready. Save or discard your current edits before merging."));
assert.ok(!component.includes("Mark") || !component.includes("verified"));
assert.ok(!component.includes("Continue review"));
assert.ok(component.includes("approveAndBuildEstimate"));
assert.ok(component.includes("eliteos-takeoff-approved"));
assert.ok(api.includes("approve-and-build-estimate"));
assert.ok(component.includes("Add piece"));
assert.ok(component.includes("Add room"));
assert.ok(draftHelper.includes("export function addManualRoom"));
assert.ok(draftHelper.includes("_estimatorOwned"));

// Save status must not publish "idle" as business status in the header when idle.
assert.ok(component.includes("saveStatus !== \"idle\""));

assert.ok(scopePanel.includes("No approved measured scope yet."));
assert.ok(scopePanel.includes("Build or review the Takeoff above"));
assert.ok(scopePanel.includes("seed pricing scope"));

// Single deterministic click path — no two-step confirmation mode
assert.ok(component.includes("runConsolidatedApproveClick"));
assert.ok(component.includes("handleApproveClick"));
assert.ok(component.includes("window.confirm"));
assert.ok(component.includes("confirmAdvisories: true"));
assert.ok(component.includes("acceptAdvisoryWarnings: true"));
assert.ok(component.includes("ctr-approve-diag"));
assert.ok(!component.includes("confirm_advisory"));
assert.ok(!component.includes("confirmAdvisoriesRef"));
assert.ok(!component.includes("ctr-approve-advisory"));
assert.ok(!component.includes("handleApprove(false)"));
assert.ok(!component.includes("You may approve with these"));

assert.ok(clickHelper.includes("buildConfirmedApproveBody"));
assert.ok(clickHelper.includes("confirmAdvisories: true"));

console.log("  ✓ worksheet always editable; Add Room/Piece; merge guard; scope copy");
console.log("\nconsolidatedTakeoffReview.ui.test.mjs — passed\n");
