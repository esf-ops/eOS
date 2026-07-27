/**
 * Exposed-edge UI contracts — trigger + viewport dialog (no in-cell popover).
 * Run: node app-ai-takeoff/src/components/exposedSidesEditor.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const trigger = readFileSync(join(__dirname, "ExposedSidesEditor.tsx"), "utf8");
const dialog = readFileSync(join(__dirname, "ExposedSidesDialog.tsx"), "utf8");
const review = readFileSync(join(__dirname, "ConsolidatedTakeoffReview.tsx"), "utf8");

console.log("\nexposedSidesEditor.ui.test.mjs\n");

assert.equal(/<details/.test(trigger), false);
assert.equal(/saveTakeoffCorrection|persistDraft|updateDraft/.test(trigger), false);
assert.match(trigger, /aria-expanded/);
assert.match(trigger, /Set exposed sides|formatExposedSidesTriggerText/);
console.log("ok: trigger is local button; no in-cell details popover");

assert.match(dialog, /createPortal/);
assert.match(dialog, /document\.body/);
assert.match(dialog, /Confirm exposed edges/);
assert.match(dialog, /ctr-edge-front-exposed|front.*exposed/i);
assert.match(dialog, /htmlFor=\{id\}/);
assert.match(dialog, /name=\{`exposed-side-\$\{row\.runId\}-\$\{key\}`\}/);
assert.equal(/saveTakeoffCorrection|persistDraft/.test(dialog), false);
console.log("ok: dialog portals to body; Confirm is local-only");

assert.match(review, /applyLocalExposedEdgeConfirm/);
assert.match(review, /ExposedSidesDialog/);
assert.equal(/drainCorrectionQueue|scheduleSave/.test(review), false);
assert.match(review, /saveTakeoffDraftExplicit/);
console.log("ok: Confirm updates local draft; Save draft is sole writer");

assert.match(dialog, /staleConflict|Review latest draft|Escape/);
console.log("ok: Escape / cancel close without network");

console.log("\nexposedSidesEditor.ui.test.mjs: ok\n");
