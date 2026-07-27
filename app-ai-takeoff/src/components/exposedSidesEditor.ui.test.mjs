/**
 * Exposed-edge UI contracts (source-level).
 * Run: node app-ai-takeoff/src/components/exposedSidesEditor.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const editor = readFileSync(join(__dirname, "ExposedSidesEditor.tsx"), "utf8");
const review = readFileSync(join(__dirname, "ConsolidatedTakeoffReview.tsx"), "utf8");

console.log("\nexposedSidesEditor.ui.test.mjs\n");

assert.match(editor, /onChange=\{\(e\) => \{\s*setSides/);
assert.equal(/saveTakeoffCorrection|persistDraft|updateDraft/.test(editor), false);
assert.match(editor, /onConfirm/);
assert.match(editor, /disabled=\{disabled \|\| saving\}/);
assert.match(editor, /Saving…/);
assert.match(editor, /await onConfirm/);
assert.match(editor, /ctr-cancel-exposed-edges/);
assert.match(editor, /aria-expanded=\{open\}/);
assert.match(review, /edgeConfirmSavingRunId === row\.runId/);
assert.match(review, /correctionNotes: "Confirm exposed edges"/);
assert.match(review, /drainCorrectionQueue/);
console.log("ok: toggles are local-only; confirm serializes one correction; closes after success");

assert.match(editor, /ctr-edge-\$\{key\}-exposed/);
assert.match(editor, /\["back", "Back"/);
assert.match(editor, /ctr-edge-front-exposed|front.*exposed/i);
assert.match(editor, /htmlFor=\{id\}/);
assert.match(editor, /name=\{`exposed-side-\$\{row\.runId\}-\$\{key\}`\}/);
console.log("ok: four sides + label/id/name accessibility");

assert.match(editor, /staleConflict/);
assert.match(editor, /Review latest draft/);
assert.equal(/automatically replay|retryCorrection/.test(editor), false);
console.log("ok: 409 recovery is explicit; no auto-replay");

console.log("\nexposedSidesEditor.ui.test.mjs: ok\n");
