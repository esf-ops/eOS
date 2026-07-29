/**
 * AI Measurements approved — project-details is no longer part of the compact
 * Takeoff-first publish path (identity is optional). ProjectDetailsPanel and
 * apiPatch remain for manual / advanced metadata edits elsewhere.
 *
 * Run: node app-elite100-estimate-studio/src/estimateQueue/aiTakeoffProjectDetailsSave.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const panel = readFileSync(join(root, "src/estimateQueue/AiEstimatorWorkspace.tsx"), "utf8");
const api = readFileSync(join(root, "src/lib/api.ts"), "utf8");
const projectPanel = readFileSync(join(root, "src/estimateQueue/ProjectDetailsPanel.tsx"), "utf8");

console.log("\naiTakeoffProjectDetailsSave.test.mjs\n");

assert.ok(api.includes("export function apiPatch"), "apiPatch helper still exists");
assert.ok(projectPanel.includes("apiPatch("), "ProjectDetailsPanel still PATCHes project-details");
assert.match(
  projectPanel,
  /\/project-details/,
  "manual project-details endpoint unchanged"
);

assert.equal(panel.includes("saveProjectFields"), false);
assert.equal(panel.includes("/project-details"), false);
assert.equal(panel.includes("eq-ai-publish-required-fields"), false);
assert.equal(panel.includes("Details saved."), false);
assert.ok(panel.includes("simplified-publish"));
assert.ok(panel.includes("eq-publish-digital-estimate"));
console.log("ok: AI panel does not call project-details; publish is identity-optional");
console.log("ok: ProjectDetailsPanel retains PATCH for optional metadata edits");
console.log("\naiTakeoffProjectDetailsSave.test.mjs — passed\n");
