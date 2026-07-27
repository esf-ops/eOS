/**
 * Correction-workspace regression after explicit Save draft migration.
 * Run: node app-ai-takeoff/src/lib/takeoffCorrectionCoordinator.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatTakeoffSaveStatus,
  pieceRequiresExposedEdgeConfirmation,
  invalidateFinishedEdgeConfirmation,
  applyRunPatchWithEdgeInvalidation
} from "./takeoffCorrectionCoordinator.mjs";
import { calculateExposedEdgeInches } from "../../../backend-core/src/takeoff/takeoffExposedEdges.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\ntakeoffCorrectionCoordinator.test.mjs (explicit-save regression)\n");

assert.equal(formatTakeoffSaveStatus("dirty"), "Unsaved changes");
assert.equal(pieceRequiresExposedEdgeConfirmation({ included: true, pieceType: "splash" }), false);
assert.equal(
  invalidateFinishedEdgeConfirmation({ finishedEdgeConfirmed: true }).finishedEdgeConfirmed,
  false
);

const confirmed = {
  finishedEdgeConfirmed: true,
  approved: true,
  totalFinishedEdgeLengthIn: 166
};
const afterBs = applyRunPatchWithEdgeInvalidation(
  { finishedEdge: confirmed, lengthIn: 86 },
  { backsplashEligible: true },
  { invalidateEdge: false }
);
assert.equal(afterBs.finishedEdge.finishedEdgeConfirmed, true);

const island = calculateExposedEdgeInches(
  { lengthIn: 56, depthIn: 27, quantity: 1 },
  { front: true, back: true, left: true, right: true }
);
assert.equal(island.totalLf, 13.83);

const review = readFileSync(
  join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);
assert.match(review, /saveTakeoffDraftExplicit/);
assert.equal(/drainCorrectionQueue|beginCorrectionSend|scheduleSave/.test(review), false);
assert.match(review, /ExposedSidesDialog/);
assert.equal(/<details[\s\S]*ctr-exposed-edges/.test(review), false);

const styles = readFileSync(join(root, "app-ai-takeoff/src/styles.css"), "utf8");
assert.equal(/ctr-table-wrap:has\(\.ctr-exposed-edges/.test(styles), false);
assert.match(styles, /ctr-edge-dialog-backdrop/);

console.log("ok: autosave queue removed; geometry + explicit-save contracts held");
console.log("\ntakeoffCorrectionCoordinator.test.mjs: ok\n");
