/**
 * Studio publish/polling cleanup contracts (static source checks).
 * Run: node app-elite100-estimate-studio/src/milestone7.publishPolling.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const panel = readFileSync(
  join(root, "src/estimateQueue/EstimateDigitalEstimatePanel.tsx"),
  "utf8"
);
const workspace = readFileSync(
  join(root, "src/estimateQueue/EstimateTakeoffWorkspace.tsx"),
  "utf8"
);
const queue = readFileSync(join(root, "src/estimateQueue/EstimateQueuePage.tsx"), "utf8");
const api = readFileSync(join(root, "src/lib/api.ts"), "utf8");
const takeoff = readFileSync(
  join(root, "../app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);

assert.ok(panel.includes('PublishUiState = "idle" | "publishing" | "published" | "failed"'));
assert.ok(panel.includes("publishInFlightRef"));
assert.ok(panel.includes("PUBLISH_CLIENT_TIMEOUT_MS"));
assert.ok(panel.includes("AbortController"));
assert.ok(panel.includes("isAbortError"));
assert.ok(panel.includes("Unable to publish the Digital Estimate. No customer link was changed."));
assert.ok(panel.includes("Publishing…"));
assert.ok(panel.includes("Digital Estimate published."));

assert.ok(api.includes("timeoutMs"));
assert.ok(api.includes("isAbortError"));
assert.ok(api.includes("AbortController"));

assert.ok(workspace.includes("20_000"));
assert.ok(workspace.includes("visibilitychange"));
assert.ok(workspace.includes("takeoffFrameMounted"));
assert.ok(workspace.includes("ac.abort()"));
assert.ok(!workspace.includes("2000)"), "must not use 2s takeoff poll");

assert.ok(queue.includes("isAbortError"));
assert.ok(queue.includes("AbortController"));
assert.ok(queue.includes("eq-queue-retry"));

assert.ok(takeoff.includes("20_000"));
assert.ok(takeoff.includes("visibilitychange"));
assert.ok(!takeoff.includes("2500)"), "must not use 2.5s latest poll");

console.log("ok: milestone7 publish/polling UI contracts");
