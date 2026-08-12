/**
 * Review split layout helpers — unit tests.
 * Run: node app-ai-takeoff/src/lib/reviewSplitLayout.test.mjs
 */
import assert from "node:assert/strict";
import {
  CTR_SPLIT_DEFAULT_RATIO,
  CTR_SPLIT_STORAGE_KEY,
  clampReviewSplitRatio,
  parseStoredReviewSplitRatio,
  ratioFromPointerClientX,
  readStoredReviewSplitRatio,
  resolveReviewSplitPreset,
  writeStoredReviewSplitRatio
} from "./reviewSplitLayout.mjs";

console.log("\nreviewSplitLayout.test.mjs\n");

assert.equal(clampReviewSplitRatio(0.4), 0.4);
assert.equal(clampReviewSplitRatio(Number.NaN), CTR_SPLIT_DEFAULT_RATIO);
assert.ok(clampReviewSplitRatio(0.01) >= 0.22);
assert.ok(clampReviewSplitRatio(0.99) <= 0.72);

{
  const width = 1200;
  const clamped = clampReviewSplitRatio(0.1, width);
  assert.ok(clamped * width >= 360 - 1);
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
  assert.equal(readStoredReviewSplitRatio(store), CTR_SPLIT_DEFAULT_RATIO);
  writeStoredReviewSplitRatio(store, 0.55);
  assert.equal(store.data[CTR_SPLIT_STORAGE_KEY], String(clampReviewSplitRatio(0.55)));
  assert.equal(readStoredReviewSplitRatio(store), clampReviewSplitRatio(0.55));
}

assert.equal(resolveReviewSplitPreset("split"), clampReviewSplitRatio(0.4));
assert.equal(resolveReviewSplitPreset("reset"), clampReviewSplitRatio(0.4));
assert.ok(resolveReviewSplitPreset("largerPlan") > resolveReviewSplitPreset("split"));
assert.ok(resolveReviewSplitPreset("largerWorksheet") < resolveReviewSplitPreset("split"));

{
  const ratio = ratioFromPointerClientX(400, { left: 0, width: 1000 });
  assert.equal(ratio, clampReviewSplitRatio(0.4, 1000));
}

console.log("  ✓ clamp, storage, presets, pointer ratio");
console.log("\nreviewSplitLayout.test.mjs — passed\n");
