/**
 * Review Takeoff split layout contracts (Quote Flow embed).
 * Run: node app-ai-takeoff/src/lib/reviewTakeoffSplit.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clampReviewSplitRatio,
  ratioFromPointerClientX,
  readStoredReviewSplitRatio,
  resolveReviewSplitPreset,
  writeStoredReviewSplitRatio,
  CTR_SPLIT_DEFAULT_RATIO
} from "./reviewSplitLayout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(root, "components/ConsolidatedTakeoffReview.tsx"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const planPanel = readFileSync(join(root, "components/TakeoffPlanPreviewPanel.tsx"), "utf8");
const rowsHelper = readFileSync(join(root, "lib/consolidatedWorksheetRows.mjs"), "utf8");
const qfStyles = readFileSync(
  join(root, "../../app-elite100-quote-flow/src/styles.css"),
  "utf8"
);

console.log("\nreviewTakeoffSplit.ui.test.mjs\n");

assert.match(component, /data-testid="ctr-split-layout"/);
assert.match(component, /data-testid="ctr-plan-preview"/);
assert.match(component, /data-testid="ctr-worksheet-pane"/);
assert.match(component, /data-testid="ctr-split-divider"/);
assert.match(component, /Resize plan and worksheet panes/);
assert.match(component, /setPointerCapture/);
assert.match(component, /onPointerDown=\{onSplitPointerDown\}/);
assert.match(component, /onPointerMove=\{onSplitPointerMove\}/);
assert.match(component, /data-testid="ctr-layout-split"/);
assert.match(component, /data-testid="ctr-layout-larger-plan"/);
assert.match(component, /data-testid="ctr-layout-larger-worksheet"/);
assert.match(component, /data-testid="ctr-layout-reset"/);
assert.match(component, /Split view/);
assert.match(component, /Larger plan/);
assert.match(component, /Larger worksheet/);
assert.match(component, /Reset layout/);
assert.match(component, /writeStoredReviewSplitRatio/);
assert.match(component, /readStoredReviewSplitRatio/);
assert.match(component, /data-testid="ctr-toggle-plan"/);
assert.match(component, /Open plan/);
assert.match(planPanel, /Open plan/);
assert.match(component, /data-testid="ctr-plan-fullscreen"/);
assert.match(component, /data-testid="ctr-reviewing-label"/);
assert.match(component, /ctr-row--focused/);
assert.match(component, /focusPieceRow/);
assert.match(component, /data-testid="ctr-save-draft"/);
assert.match(component, /data-testid="ctr-add-room"/);
assert.match(component, /data-testid="ctr-add-piece"/);
assert.match(component, /ctr-layout--narrow|ctr-layout--stacked/);
assert.match(styles, /ctr-split-divider/);
assert.match(styles, /--ctr-plan-ratio/);
assert.match(styles, /min-width:\s*360px/);
assert.match(styles, /min-width:\s*520px/);
assert.doesNotMatch(styles, /\.ctr-plan\s*\{[^}]*resize:\s*both/);
assert.match(styles, /ctr-row--focused/);
assert.match(styles, /@media \(max-width: 1100px\)/);
assert.match(rowsHelper, /sourcePages/);
assert.match(planPanel, /focusPage/);
assert.match(qfStyles, /qf-queue__frame-wrap--command/);

{
  const store = {
    data: {},
    getItem(k) {
      return this.data[k] ?? null;
    },
    setItem(k, v) {
      this.data[k] = String(v);
    }
  };
  writeStoredReviewSplitRatio(store, 0.55);
  assert.equal(readStoredReviewSplitRatio(store), clampReviewSplitRatio(0.55));
  assert.equal(resolveReviewSplitPreset("reset"), CTR_SPLIT_DEFAULT_RATIO);
  assert.ok(resolveReviewSplitPreset("largerPlan") > resolveReviewSplitPreset("largerWorksheet"));
  const dragged = ratioFromPointerClientX(200, { left: 0, width: 1000 });
  assert.ok(dragged >= clampReviewSplitRatio(0.22, 1000));
  assert.ok(dragged <= clampReviewSplitRatio(0.72, 1000));
}

console.log("  ✓ split layout, presets, storage, row focus, save controls");
console.log("\nreviewTakeoffSplit.ui.test.mjs — passed\n");
