/**
 * Review split layout helpers — unit tests.
 * Run: node app-ai-takeoff/src/lib/reviewSplitLayout.test.mjs
 */
import assert from "node:assert/strict";
import {
  CTR_SPLIT_COMPACT_DEFAULT_RATIO,
  CTR_SPLIT_DEFAULT_RATIO,
  CTR_SPLIT_STORAGE_KEY,
  clampReviewSplitRatio,
  defaultReviewSplitRatio,
  parseStoredReviewSplitRatio,
  ratioFromPointerClientX,
  readStoredReviewSplitRatio,
  resolveReviewSplitPreset,
  waterfallCollapsedSummary,
  writeStoredReviewSplitRatio
} from "./reviewSplitLayout.mjs";

console.log("\nreviewSplitLayout.test.mjs\n");

assert.equal(defaultReviewSplitRatio(1920), CTR_SPLIT_DEFAULT_RATIO);
assert.equal(defaultReviewSplitRatio(1536), CTR_SPLIT_COMPACT_DEFAULT_RATIO);
assert.equal(defaultReviewSplitRatio(1366), CTR_SPLIT_COMPACT_DEFAULT_RATIO);
assert.ok(CTR_SPLIT_COMPACT_DEFAULT_RATIO >= 0.25 && CTR_SPLIT_COMPACT_DEFAULT_RATIO <= 0.3);

assert.equal(clampReviewSplitRatio(0.4), 0.4);
assert.equal(clampReviewSplitRatio(Number.NaN), defaultReviewSplitRatio(0));
assert.ok(clampReviewSplitRatio(0.01) >= 0.2);
assert.ok(clampReviewSplitRatio(0.99) <= 0.72);

{
  const width = 1200;
  const clamped = clampReviewSplitRatio(0.1, width);
  assert.ok(clamped * width >= 320 - 1);
  assert.ok((1 - clamped) * width >= 520 - 1);
}

assert.equal(parseStoredReviewSplitRatio(null), null);
assert.equal(parseStoredReviewSplitRatio("nope"), null);
assert.equal(parseStoredReviewSplitRatio("0.55"), clampReviewSplitRatio(0.55));

{
  const store = {
    data: /** @type {Record<string, string>} */ ({}),
    getItem(k) {
      return this.data[k] ?? null;
    },
    setItem(k, v) {
      this.data[k] = String(v);
    }
  };
  assert.equal(readStoredReviewSplitRatio(store, 1920), CTR_SPLIT_DEFAULT_RATIO);
  assert.equal(readStoredReviewSplitRatio(store, 1366), CTR_SPLIT_COMPACT_DEFAULT_RATIO);
  writeStoredReviewSplitRatio(store, 0.55);
  assert.equal(store.data[CTR_SPLIT_STORAGE_KEY], String(clampReviewSplitRatio(0.55)));
  assert.equal(readStoredReviewSplitRatio(store, 1366), clampReviewSplitRatio(0.55, 1366));
}

assert.equal(resolveReviewSplitPreset("split", 1920), clampReviewSplitRatio(0.4, 1920));
assert.equal(resolveReviewSplitPreset("reset", 1366), clampReviewSplitRatio(0.28, 1366));
assert.ok(resolveReviewSplitPreset("largerPlan", 1366) > resolveReviewSplitPreset("split", 1366));
assert.ok(
  resolveReviewSplitPreset("largerWorksheet", 1366) <= resolveReviewSplitPreset("split", 1366)
);

{
  const ratio = ratioFromPointerClientX(400, { left: 0, width: 1000 });
  assert.equal(ratio, clampReviewSplitRatio(0.4, 1000));
}

assert.equal(waterfallCollapsedSummary(0), "Waterfall panels · None added");
assert.equal(waterfallCollapsedSummary(1), "Waterfall panels · 1 panel");
assert.equal(waterfallCollapsedSummary(3), "Waterfall panels · 3 panels");

console.log("  ✓ clamp, storage, presets, compact defaults, waterfall summary");
console.log("\nreviewSplitLayout.test.mjs — passed\n");
