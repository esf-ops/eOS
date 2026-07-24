/**
 * Manual estimate UI contracts (source-level).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/manualEstimate.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cc = readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateCommandCenterPage.tsx"), "utf8");
const wizard = readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/ManualEstimateWizard.tsx"), "utf8");
const editor = readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/ManualPhysicalScopeEditor.tsx"), "utf8");
const workspace = readFileSync(join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx"), "utf8");

console.log("\nmanualEstimate.ui.test.mjs\n");

assert.match(cc, /ecc-new-estimate/);
assert.match(cc, /New Estimate/);
assert.match(cc, /ManualEstimateWizard/);
assert.match(wizard, /Start without plans/);
assert.match(wizard, /manual-estimates/);
assert.match(wizard, /Idempotency-Key/);
assert.match(wizard, /Start from plans/);
assert.doesNotMatch(wizard, /Duplicate existing/);
assert.match(editor, /Confirm Manual Scope/);
assert.match(editor, /manual-scope-confirm/);
assert.match(editor, /standard countertop pricing/);
assert.doesNotMatch(editor, /fixed 2026 Vanity Program is supported/i);
assert.match(editor, /confirm-manual-scope/);
assert.match(workspace, /manual-estimate-badge/);
assert.match(workspace, /ManualPhysicalScopeEditor/);
assert.match(workspace, /sourceType === "manual"/);
assert.match(workspace, /manual-next-step-scope/);
assert.match(workspace, /manual-next-step-customer/);
assert.match(wizard, /setIdemKey\(newIdempotencyKey\(\)\)/);
assert.match(wizard, /\[open\]/);
const app = readFileSync(join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"), "utf8");
assert.match(app, /manual-scope/);
assert.doesNotMatch(workspace, /useEffect\([\s\S]{0,200}confirm-manual-scope/);
assert.doesNotMatch(wizard, /publishDigitalEstimate|link-copied/);

console.log("ok: New Estimate launcher + manual scope + workspace contracts");
console.log("\nmanualEstimate.ui.test.mjs: ok\n");
