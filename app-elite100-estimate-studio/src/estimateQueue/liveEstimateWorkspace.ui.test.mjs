/**
 * Live Estimate workspace UI source contracts (no browser).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/liveEstimateWorkspace.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = readFileSync(join(root, "src/estimateQueue/AiEstimatorWorkspace.tsx"), "utf8");
const commercial = readFileSync(
  join(root, "src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"),
  "utf8"
);
const sections = readFileSync(
  join(root, "src/estimateQueue/estimateRecord/EstimateRecordSections.tsx"),
  "utf8"
);
const takeoff = readFileSync(
  join(root, "../app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);

console.log("\nliveEstimateWorkspace.ui.test.mjs\n");

{
  assert.ok(workspace.includes("eq-ai-persistent-takeoff"));
  assert.ok(workspace.includes("takeoffMountIdRef"));
  assert.ok(workspace.includes('data-stable-mount="1"'));
  assert.ok(/const takeoffSrc = useMemo\([\s\S]*?\}, \[takeoffJobId\]\)/.test(workspace));
  assert.equal(workspace.includes("mode: takeoffMode"), false);
  assert.equal(workspace.includes("eq-takeoff-handoff-overlay"), false);
  assert.ok(workspace.includes("eq-takeoff-inline-status"));
  console.log("ok: stable Takeoff mount; no overlay; src depends on takeoffJobId only");
}

{
  assert.ok(workspace.includes("createWorkspaceSaveQueue"));
  assert.ok(workspace.includes("WORKSPACE_SAVE_DEBOUNCE_MS = 600"));
  assert.ok(workspace.includes("ensureEditableDraft"));
  assert.ok(workspace.includes("acquireInFlightRef"));
  assert.ok(workspace.includes("isFreshCalculationResponse"));
  assert.ok(workspace.includes("TAKEOFF_REVIEW_DRAFT_SAVED") || workspace.includes("TAKEOFF_DRAFT_SAVED_MESSAGE"));
  assert.ok(workspace.includes("projectTakeoffDraft"));
  // Commercial path must not call refresh-from-takeoff inside runWorkspaceSave.
  const saveStart = workspace.indexOf("runWorkspaceSave");
  const saveSlice = workspace.slice(saveStart, saveStart + 2500);
  assert.equal(saveSlice.includes("refresh-from-takeoff"), false);
  console.log("ok: coalescing save; draft acquisition once; commercial save has no refresh");
}

{
  const order = [
    workspace.indexOf("eq-ai-takeoff-surface"),
    workspace.indexOf("<VerifiedEstimateSection"),
    workspace.indexOf("<CommercialConfigurationSection"),
    workspace.indexOf("<DigitalEstimateSection"),
    workspace.indexOf("<EstimateRevisionHistory")
  ];
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `section order index ${i}`);
  }
  assert.ok(sections.includes("Live Estimate") || workspace.includes("Live Estimate"));
  assert.ok(sections.includes("Not published") || workspace.includes("Not published"));
  console.log("ok: continuous section order; Live Estimate + Not published labels");
}

{
  assert.ok(commercial.includes("onQueueSave"));
  assert.ok(commercial.includes("hydrationKey"));
  assert.ok(commercial.includes("Add Tear Out"));
  assert.ok(commercial.includes("Add Vanity Program"));
  assert.ok(commercial.includes("Remove Vanity Program"));
  assert.equal(commercial.includes("Same trip"), false);
  assert.equal(commercial.includes("Needs confirmation"), false);
  assert.equal(commercial.includes("Add Crane"), false);
  assert.ok(commercial.includes("eq-waterfall-configuration"));
  assert.equal(commercial.includes("ctr-waterfall-width"), false);
  assert.ok(commercial.includes("onRequestAddIslandWaterfall"));
  console.log("ok: Estimate Options — next-state queue, one-click Vanity, no duplicate waterfall editor");
}

{
  assert.ok(takeoff.includes("TAKEOFF_REVIEW_DRAFT_SAVED"));
  assert.ok(takeoff.includes("ctr-add-left-waterfall"));
  assert.ok(takeoff.includes("ctr-add-right-waterfall"));
  // Production save path must emit the draft-saved signal (not only localReview).
  const prodSave = takeoff.indexOf("Physical Takeoff facts changed");
  assert.ok(prodSave > 0);
  assert.ok(takeoff.slice(prodSave, prodSave + 800).includes("TAKEOFF_REVIEW_DRAFT_SAVED"));
  console.log("ok: Takeoff emits draft-saved on production persist; island waterfall actions present");
}

console.log("\nliveEstimateWorkspace.ui.test.mjs — passed\n");
