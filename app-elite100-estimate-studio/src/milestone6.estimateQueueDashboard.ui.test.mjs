/**
 * Milestone 6 — Estimate Queue operational dashboard wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const queue = readFileSync(join(root, "src/estimateQueue/EstimateQueuePage.tsx"), "utf8");
const api = readFileSync(join(root, "src/lib/estimateQueueApi.mjs"), "utf8");
const app = readFileSync(join(root, "src/StudioApp.tsx"), "utf8");
const workspace = readFileSync(
  join(root, "src/estimateQueue/EstimateTakeoffWorkspace.tsx"),
  "utf8"
);

assert.ok(queue.includes("estimate-queue-dashboard"));
assert.ok(queue.includes("eq-queue-table"));
assert.ok(queue.includes("eq-queue-preview"));
assert.ok(queue.includes("Needs attention"));
assert.ok(queue.includes("Open in Estimate Studio"));
assert.ok(queue.includes("fetchEstimateQueue"));
assert.ok(api.includes("/api/elite100-estimate-studio/queue"));
assert.ok(api.includes("/preview"));
assert.ok(api.includes("/opened"));
assert.ok(app.includes("workspaceFocus") || app.includes("initialFocus"));
assert.ok(app.includes("openTarget"));
assert.ok(workspace.includes("initialFocus"));
assert.equal(queue.includes("graphImmutableMessageId"), false);
assert.equal(queue.includes("storage_path"), false);
assert.equal(queue.includes("sha256"), false);

console.log("\nmilestone6.estimateQueueDashboard.ui.test.mjs\n");
console.log("ok: dense queue dashboard + preview + openTarget wiring");
console.log("\nAll Milestone 6 Estimate Queue dashboard UI tests passed.\n");
