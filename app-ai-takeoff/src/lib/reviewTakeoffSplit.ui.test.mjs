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
  CTR_SPLIT_COMPACT_DEFAULT_RATIO,
  CTR_SPLIT_DEFAULT_RATIO,
  defaultReviewSplitRatio,
  ratioFromPointerClientX,
  readStoredReviewSplitRatio,
  resolveReviewSplitPreset,
  waterfallCollapsedSummary,
  writeStoredReviewSplitRatio
} from "./reviewSplitLayout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(root, "components/ConsolidatedTakeoffReview.tsx"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const planPanel = readFileSync(join(root, "components/TakeoffPlanPreviewPanel.tsx"), "utf8");
const rowsHelper = readFileSync(join(root, "lib/consolidatedWorksheetRows.mjs"), "utf8");
const exposed = readFileSync(join(root, "components/ExposedSidesEditor.tsx"), "utf8");
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
assert.match(component, /data-testid="ctr-room-add-piece"/);
assert.match(component, /data-testid="ctr-remove-room"/);
assert.match(component, /ctr-layout--narrow|ctr-layout--stacked/);
assert.match(component, /QUOTE_FLOW_REQUEST_SAVE_DRAFT/);
assert.match(component, /TAKEOFF_REVIEW_DIRTY/);
assert.match(styles, /ctr-split-divider/);
assert.match(styles, /--ctr-plan-ratio/);
assert.match(styles, /min-width:\s*320px/);
assert.match(styles, /min-width:\s*520px/);
assert.doesNotMatch(styles, /\.ctr-plan\s*\{[^}]*resize:\s*both/);
assert.match(styles, /ctr-row--focused/);
assert.match(styles, /@media \(max-width: 1100px\)/);
assert.match(styles, /@media \(min-width: 1601px\)/);
assert.match(rowsHelper, /sourcePages/);
assert.match(planPanel, /focusPage/);
assert.match(qfStyles, /qf-queue__frame-wrap--command/);

// Length / Depth prominence + compact secondary controls
assert.match(component, /ctr-col-dim--primary/);
assert.match(component, /Length \(in\)/);
assert.match(component, /Depth \(in\)/);
assert.match(styles, /\.ctr-dim-input[\s\S]*font-size:\s*1\.05rem/);
assert.match(styles, /\.ctr-dim-input[\s\S]*font-weight:\s*700/);
assert.match(styles, /--ctr-col-dim:\s*112px/);
assert.match(styles, /--ctr-col-edge:\s*108px/);
assert.match(exposed, /return "Set edges"/);
assert.match(component, /data-testid="ctr-room-piece-count"/);
assert.match(component, /\+ Add piece/);

// Collapsible waterfall — collapsed when empty, functionality preserved
assert.match(component, /data-testid="ctr-waterfall-physical-scope"/);
assert.match(component, /data-testid="ctr-waterfall-toggle"/);
assert.match(component, /data-testid="ctr-waterfall-collapsed-summary"/);
assert.match(component, /data-testid="ctr-waterfall-add-collapsed"/);
assert.match(component, /waterfallCollapsedSummary/);
assert.match(component, /waterfallOpenOverride/);
assert.match(component, /data-testid="ctr-waterfall-physical-body"/);
assert.match(component, /data-testid="ctr-add-left-waterfall"/);
assert.match(component, /data-testid="ctr-add-right-waterfall"/);
assert.match(component, /data-testid="ctr-waterfall-width"/);
assert.match(component, /data-testid="ctr-waterfall-height"/);
assert.match(styles, /ctr-waterfall-physical--collapsed/);
assert.equal(waterfallCollapsedSummary(0), "Waterfall panels · None added");

// Independent worksheet scroll
assert.match(styles, /ctr-table-wrap/);
assert.match(styles, /\.ctr-layout:not\(\.ctr-layout--narrow\):not\(\.ctr-layout--stacked\):not\(\.ctr-layout--plan-collapsed\) \.ctr-table-wrap/);

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
  assert.equal(readStoredReviewSplitRatio(store, 1920), clampReviewSplitRatio(0.55, 1920));
  assert.equal(defaultReviewSplitRatio(1366), CTR_SPLIT_COMPACT_DEFAULT_RATIO);
  assert.equal(resolveReviewSplitPreset("reset", 1366), clampReviewSplitRatio(0.28, 1366));
  assert.equal(resolveReviewSplitPreset("split", 1920), CTR_SPLIT_DEFAULT_RATIO);
  assert.ok(resolveReviewSplitPreset("largerPlan") > resolveReviewSplitPreset("largerWorksheet"));
  const dragged = ratioFromPointerClientX(200, { left: 0, width: 1000 });
  assert.ok(dragged >= clampReviewSplitRatio(0.2, 1000));
  assert.ok(dragged <= clampReviewSplitRatio(0.72, 1000));
}

console.log("  ✓ split layout, compact waterfall, dim prominence, responsive defaults");
console.log("\nreviewTakeoffSplit.ui.test.mjs — passed\n");
