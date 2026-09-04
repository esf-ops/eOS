/**
 * Takeoff workspace GET latency — parallel file/results, no duplicate id-count query.
 * Run: node backend-core/src/takeoff/takeoffWorkspacePerf.safe.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svc = readFileSync(join(__dirname, "takeoffWorkspaceService.mjs"), "utf8");
const routes = readFileSync(join(__dirname, "takeoffWorkspaceRoutes.js"), "utf8");

console.log("\ntakeoffWorkspacePerf.safe.test.mjs\n");

assert.match(svc, /loadRecentResultRows/);
assert.match(svc, /Promise\.all\(\[filePromise, resultsPromise\]\)/);
assert.match(svc, /Promise\.all\(\[resultsPromise, filePromise\]\)/);
assert.doesNotMatch(
  svc,
  /\.from\("quote_takeoff_results"\)\s*\n\s*\.select\("id"\)/
);
assert.match(svc, /_timing\?\.mark\?\./);
assert.match(routes, /createRequestStageTimer/);
assert.match(routes, /X-Eliteos-Perf|attachRequestTimingHeader/);
assert.match(routes, /getTakeoffWorkspace\(\{[\s\S]*_timing: timer/);
assert.match(routes, /getLatestTakeoffResult\(\{[\s\S]*_timing: timer/);

// Geometry / authority helpers must remain imported and used.
assert.match(svc, /selectAuthoritativeTakeoffResult/);
assert.match(svc, /computeTakeoffMeasurements/);
assert.match(svc, /evaluateTakeoffApprovalGate/);

console.log("ok: workspace + latest parallelize independent reads");
console.log("ok: id-only result count query removed");
console.log("ok: optional stage timing wired on GET routes");
console.log("\ntakeoffWorkspacePerf.safe.test.mjs: ok\n");
