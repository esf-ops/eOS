/**
 * Quote Flow Estimates UI contracts (Slice 1D).
 * Run: node app-elite100-quote-flow/src/estimates/quoteFlowEstimates.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");

console.log("\nquoteFlowEstimates.ui.test.mjs\n");

const page = readFileSync(join(appRoot, "src/estimates/EstimatesListPage.tsx"), "utf8");
const editor = readFileSync(join(appRoot, "src/estimates/OfficialScopeEditor.tsx"), "utf8");
const api = readFileSync(join(appRoot, "src/lib/quoteFlowEstimatesApi.ts"), "utf8");
const app = readFileSync(join(appRoot, "src/QuoteFlowApp.tsx"), "utf8");

assert.match(page, /data-testid="qf-estimates-page"/);
assert.match(page, /data-testid="qf-estimates-list"/);
assert.match(page, /data-testid="qf-estimates-row"/);
assert.match(page, /data-testid="qf-estimates-detail"/);
assert.match(page, /data-testid="qf-estimates-save-scope"/);
assert.match(page, /Save Scope/);
assert.match(page, /Coming later/);
assert.match(editor, /data-testid="qf-official-scope-editor"/);
assert.match(editor, /Official scope/);
assert.match(editor, /Manual edits here do not rerun AI Takeoff/);
assert.match(editor, /Add room/);
assert.match(editor, /Add piece/);
assert.match(editor, /Exclude piece/);
assert.match(api, /\/api\/elite100-quote-flow\/estimates/);
assert.match(api, /method:\s*["']PATCH["']/);
assert.match(app, /EstimatesListPage/);
assert.match(app, /authToken=\{sessionToken\}/);
assert.doesNotMatch(page, /qf-queue-takeoff-iframe|takeoff-iframe|ConsolidatedTakeoffReview/);
assert.doesNotMatch(editor, /iframe|quoteFlowSetScope|AI Takeoff review/);
assert.doesNotMatch(page + editor + api, /\bV1\b|\bV2\b|Studio V2|Estimate Workspace/);
assert.doesNotMatch(api, /digital-estimate|working-draft|takeoff-finish|calculate|approve/);
console.log("ok: Estimates list opens detail; Official Scope editor; no Takeoff iframe; no V1/V2");

console.log("\nquoteFlowEstimates.ui.test.mjs: ok\n");
