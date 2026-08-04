/**
 * Quote Flow Estimate Queue UI contracts (Slice 1C).
 * Run: node app-elite100-quote-flow/src/queue/quoteFlowQueue.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");

console.log("\nquoteFlowQueue.ui.test.mjs\n");

const queue = readFileSync(join(appRoot, "src/queue/EstimateQueuePage.tsx"), "utf8");
const api = readFileSync(join(appRoot, "src/lib/quoteFlowQueueApi.ts"), "utf8");
const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");

assert.match(queue, /data-testid="qf-queue-page"/);
assert.match(queue, /data-testid="qf-queue-list"/);
assert.match(queue, /data-testid="qf-queue-row"/);
assert.match(queue, /data-testid="qf-queue-review"/);
assert.match(queue, /data-testid="qf-queue-set-scope"/);
assert.match(queue, /data-testid="qf-queue-takeoff-iframe"/);
assert.match(queue, /Review Takeoff/);
assert.match(queue, /Set Scope/);
assert.match(queue, /Use these measurements/);
assert.match(queue, /Scope is set for this estimate/);
assert.match(api, /\/api\/elite100-quote-flow\/queue/);
assert.match(api, /set-scope/);
assert.match(app, /EstimateQueuePage/);
assert.doesNotMatch(queue, /Approve Estimate/);
assert.doesNotMatch(queue, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish/);
console.log("ok: Estimate Queue rows + Review Takeoff + Set Scope; no V1/V2");

console.log("\nquoteFlowQueue.ui.test.mjs: ok\n");
