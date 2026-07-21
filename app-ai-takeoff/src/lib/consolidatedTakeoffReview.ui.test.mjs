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
const styles = readFileSync(join(root, "styles.css"), "utf8");
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
assert.ok(component.includes("data-testid=\"ctr-room\""));
assert.ok(component.includes("data-testid=\"ctr-room-empty\""));
assert.ok(component.includes("roomSections"));
assert.ok(component.includes("No pieces in this room yet."));
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
assert.ok(component.includes("handleAutoAppendAi"));
assert.ok(component.includes("pendingAiAvailable"));
assert.ok(component.includes("applyPendingAiFromLatest"));
assert.ok(component.includes("data-testid=\"ctr-ai-findings-preview\""));
assert.ok(component.includes("data-testid=\"ctr-pending-ai-append\""));
assert.ok(component.includes("data-testid=\"ctr-ai-append-notice\""));
assert.ok(!component.includes("data-testid=\"ctr-save-merge-ai\""));
assert.ok(!component.includes("Save &amp; merge") && !component.includes("Save & merge"));
assert.ok(component.includes("Auto-append AI findings"));
assert.ok(component.includes("lastMergedAiResultId") || component.includes("aiHandling"));
assert.ok(component.includes("summarizeAiFindingsPreview"));
assert.ok(draftHelper.includes("AI findings appending"));
assert.ok(component.includes("saveMergeTakeoffDrafts"));
assert.ok(component.includes("pendingServerTakeoffRef"));
assert.ok(component.includes("hasEstimatorOwnedGeometry"));
assert.ok(component.includes("data-testid=\"ctr-remove-room\""));
assert.ok(component.includes("data-testid=\"ctr-remove-piece\""));
assert.ok(component.includes("Remove room"));
assert.ok(component.includes("Remove piece"));
assert.ok(component.includes("deletedRoomIds"));
assert.ok(component.includes("deletedRunIds"));
assert.ok(component.includes("handleRemoveRoom"));
assert.ok(component.includes("handleRemovePiece"));
assert.ok(component.includes("pendingAiMerge"));
assert.ok(
  component.includes("included") || component.includes("Include piece"),
  "include/exclude checkbox remains separate from remove"
);
assert.ok(!component.includes("Mark") || !component.includes("verified"));
assert.ok(!component.includes("Continue review"));
assert.ok(component.includes("approveAndBuildEstimate"));
assert.ok(component.includes("eliteos-takeoff-approved"));
assert.ok(api.includes("approve-and-build-estimate"));
assert.ok(component.includes("Add piece"));
assert.ok(component.includes("Add room"));
assert.ok(draftHelper.includes("export function addManualRoom"));
assert.ok(draftHelper.includes("_estimatorOwned"));

// Legibility: full labels, no cryptic abbreviations as primary headers, no clipping classes.
assert.ok(component.includes("Length (in)"));
assert.ok(component.includes("Depth (in)"));
assert.ok(component.includes("Square feet"));
assert.ok(component.includes(">Backsplash</th>") || component.includes("Backsplash</th>"));
assert.ok(component.includes("data-testid=\"ctr-backsplash-eligible\""));
assert.ok(component.includes("data-testid=\"ctr-cutouts\""));
assert.ok(component.includes("Include backsplash for this run"));
assert.ok(component.includes("Mark the countertop runs that meet a wall or cabinet"));
assert.ok(!component.includes("Backsplash height (in)"));
assert.ok(!component.includes("data-testid=\"ctr-backsplash-height\""));
assert.ok(component.includes("normalizeTakeoffBacksplashEligibility"));
assert.ok(component.includes("htmlFor={bsId}"));
// Structured cutouts popover — no freeform "sink:1" text input remains.
assert.ok(component.includes("htmlFor={boxId}"));
assert.ok(component.includes("TAKEOFF_CUTOUT_TYPES"));
assert.ok(component.includes("data-testid=\"ctr-cutouts-summary\""));
assert.ok(!component.includes('placeholder="sink:1"'));
assert.ok(styles.includes('input:not([type="checkbox"]):not([type="radio"])'));
assert.ok(styles.includes("isolation: isolate"));
assert.ok(component.includes("data-testid=\"ctr-room-name\""));
assert.ok(component.includes("data-testid=\"ctr-piece-name\""));
assert.ok(component.includes("data-testid=\"ctr-toggle-plan\""));
assert.ok(styles.includes("ctr-col-piece"));
assert.ok(styles.includes("min-width: 12rem"));
assert.ok(!styles.includes("text-overflow: ellipsis") || styles.includes("text-overflow: unset"));
assert.ok(styles.includes("overflow: visible"));

// Save status must not publish "idle" as business status in the header when idle.
assert.ok(component.includes("saveStatus !== \"idle\""));

assert.ok(scopePanel.includes("No approved measured scope yet."));
assert.ok(scopePanel.includes("Build or review the Takeoff above"));
assert.ok(scopePanel.includes("seed pricing scope"));
assert.ok(scopePanel.includes("eq-custom-lines"));
assert.ok(scopePanel.includes("eq-include-backsplash"));
assert.ok(scopePanel.includes('value={scope.pricingBasis || "wholesale"}'));

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

console.log("  ✓ worksheet legibility; auto AI append; scope backsplash/custom lines wiring");
console.log("\nconsolidatedTakeoffReview.ui.test.mjs — passed\n");
