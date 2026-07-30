/**
 * Persistent AI Takeoff — rendered stage contracts (source inspection).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/aiEstimatorPersistentTakeoff.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = readFileSync(join(root, "src/estimateQueue/AiEstimatorWorkspace.tsx"), "utf8");
const takeoff = readFileSync(
  join(root, "../app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);

console.log("\naiEstimatorPersistentTakeoff.ui.test.mjs\n");

{
  assert.ok(workspace.includes("eq-ai-persistent-takeoff") || workspace.includes("eq-ai-takeoff-surface"));
  assert.ok(workspace.includes('data-takeoff-mode={takeoffMode}'));
  // The iframe src must never carry stage-derived mode: that rebuilt the iframe
  // on every approval/publication transition. Mode now only drives badges.
  assert.equal(workspace.includes("mode: takeoffMode"), false, "iframe src must not depend on stage");
  assert.ok(workspace.includes('mode: "editable"'));
  assert.ok(
    /const takeoffSrc = useMemo\([\s\S]*?\}, \[takeoffJobId\]\);/.test(workspace),
    "takeoff src depends on takeoffJobId only"
  );
  assert.equal(workspace.includes("const showTakeoff ="), false, "Takeoff must not be stage-gated away");
  assert.ok(workspace.includes("Approved Takeoff — Revision"));
  assert.ok(workspace.includes("Published measurements — Revision"));
  assert.ok(workspace.includes("eq-ai-takeoff-collapse"));
  assert.ok(workspace.includes("eq-ai-stage-actions"));
  assert.equal(workspace.includes("eq-ai-sticky-actions"), false);
  console.log("ok: A–E shell — Takeoff always mounted; stage cards below");
}

{
  // Draft editable vs approved readonly modes
  assert.ok(workspace.includes('? "editable"'));
  assert.ok(workspace.includes(': "readonly"'));
  assert.ok(takeoff.includes('data-mode={isReadonly ? "readonly" : "editable"}'));
  assert.ok(takeoff.includes('urlWorkspace.mode === "readonly"'));
  assert.ok(takeoff.includes("{!isReadonly ? ("));
  assert.ok(takeoff.includes('data-testid="ctr-save-draft"'));
  assert.ok(takeoff.includes('data-testid="ctr-approve-build"'));
  // Both controls live inside !isReadonly branches (not merely disabled).
  const actionsSlice = takeoff.slice(takeoff.lastIndexOf('className="ctr-actions"'));
  assert.ok(actionsSlice.includes("!isReadonly"));
  assert.ok(actionsSlice.includes('data-testid="ctr-save-draft"'));
  assert.ok(actionsSlice.includes('data-testid="ctr-approve-build"'));
  assert.ok(actionsSlice.indexOf("!isReadonly") < actionsSlice.indexOf('data-testid="ctr-save-draft"'));
  console.log("ok: readonly hides Save Draft + Approve");
}

{
  assert.ok(workspace.includes("eq-ai-approved-measurements"));
  assert.ok(workspace.includes("eq-publish-digital-estimate"));
  assert.ok(workspace.includes("eq-ai-published-estimate"));
  assert.ok(workspace.includes("eq-ai-edit-measurements"));
  assert.ok(workspace.includes("eq-ai-revision-comparison") || workspace.includes("MeasurementRevisionComparison"));
  assert.ok(workspace.includes("eq-ai-takeoff-dual-revision-notice"));
  console.log("ok: approved/published/revision actions present");
}

console.log("\nAll aiEstimatorPersistentTakeoff UI tests passed.\n");
