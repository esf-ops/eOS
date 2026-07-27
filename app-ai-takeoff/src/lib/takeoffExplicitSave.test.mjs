/**
 * Explicit Save draft + centered exposed-edge dialog.
 * Run: node app-ai-takeoff/src/lib/takeoffExplicitSave.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyLocalBacksplashToggle,
  applyLocalExposedEdgeConfirm,
  formatTakeoffSaveStatus,
  isTakeoffWorksheetDirty,
  nextExplicitMutationRevision,
  pieceRequiresExposedEdgeConfirmation,
  saveTakeoffDraftExplicit
} from "./takeoffExplicitSave.mjs";
import { patchRunGeometry } from "./consolidatedWorksheetRows.mjs";
import {
  calculateExposedEdgeInches,
  buildFinishedEdgeFromExposedSides
} from "../../../backend-core/src/takeoff/takeoffExposedEdges.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\ntakeoffExplicitSave.test.mjs\n");

function sampleDraft() {
  return {
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        areas: [
          {
            id: "a1",
            runs: [
              {
                id: "c1",
                label: "Island",
                pieceType: "counter",
                lengthIn: 56,
                depthIn: 27,
                quantity: 1,
                finishedEdge: {
                  finishedEdgeConfirmed: true,
                  approved: true,
                  totalFinishedEdgeLengthIn: 166,
                  exposedSides: { front: true, back: true, left: true, right: true }
                }
              }
            ]
          }
        ]
      }
    ]
  };
}

// --- Network spy: local backsplash sends zero corrections ---
{
  let correctionCalls = 0;
  const saveCorrection = async () => {
    correctionCalls += 1;
    return { resultId: "x", savedAt: "t" };
  };
  const draft = sampleDraft();
  const next = applyLocalBacksplashToggle(
    draft,
    { roomId: "r1", areaId: "a1", runId: "c1" },
    true,
    56
  );
  assert.equal(next.rooms[0].areas[0].runs[0].backsplashEligible, true);
  assert.equal(
    next.rooms[0].areas[0].runs[0].finishedEdge.finishedEdgeConfirmed,
    true,
    "backsplash must not clear edge confirmation"
  );
  assert.equal(
    next.rooms[0].areas[0].runs[0].finishedEdge.totalFinishedEdgeLengthIn,
    166,
    "backsplash must not change edge LF"
  );
  assert.equal(correctionCalls, 0);
  // Handler itself never calls save — only Save draft does.
  await saveTakeoffDraftExplicit({
    saveCorrection,
    takeoffResult: next,
    baseResultId: "base-1",
    clientMutationRevision: 3,
    reviewState: { excludedRunIds: [] }
  });
  assert.equal(correctionCalls, 1, "Save draft sends exactly one correction");
  console.log("ok: backsplash handler network-spy — 0 then Save draft = 1");
}

// --- Confirm exposed edges local-only ---
{
  let correctionCalls = 0;
  const saveCorrection = async () => {
    correctionCalls += 1;
    return { resultId: "y" };
  };
  const payload = buildFinishedEdgeFromExposedSides({
    lengthIn: 56,
    depthIn: 27,
    quantity: 1,
    exposedSides: { front: true, back: true, left: true, right: true },
    topology: "island",
    confirm: true
  });
  const next = applyLocalExposedEdgeConfirm(
    sampleDraft(),
    { roomId: "r1", areaId: "a1", runId: "c1" },
    payload
  );
  assert.equal(next.rooms[0].areas[0].runs[0].finishedEdge.finishedEdgeConfirmed, true);
  assert.equal(correctionCalls, 0);
  // Explicit double Save still one-at-a-time when guarded by caller; API itself is one call.
  await saveTakeoffDraftExplicit({
    saveCorrection,
    takeoffResult: next,
    baseResultId: "b",
    clientMutationRevision: nextExplicitMutationRevision(1),
    reviewState: {}
  });
  assert.equal(correctionCalls, 1);
  console.log("ok: Confirm exposed edges network-spy — 0 corrections; Save = 1");
}

assert.equal(formatTakeoffSaveStatus("dirty"), "Unsaved changes");
assert.equal(formatTakeoffSaveStatus("saving"), "Saving…");
assert.equal(formatTakeoffSaveStatus("saved"), "Saved");
assert.equal(formatTakeoffSaveStatus("conflict"), "Conflict — review latest draft");

assert.equal(
  isTakeoffWorksheetDirty({
    localDraft: { a: 1 },
    canonicalDraft: { a: 1 },
    localExcludedRunIds: [],
    canonicalExcludedRunIds: []
  }),
  false
);
assert.equal(
  isTakeoffWorksheetDirty({
    localDraft: { a: 2 },
    canonicalDraft: { a: 1 },
    localExcludedRunIds: [],
    canonicalExcludedRunIds: []
  }),
  true
);

const afterLen = patchRunGeometry(
  sampleDraft(),
  { roomId: "r1", areaId: "a1", runId: "c1" },
  { lengthIn: 90 }
);
assert.equal(afterLen.rooms[0].areas[0].runs[0].finishedEdge.finishedEdgeConfirmed, false);

assert.equal(pieceRequiresExposedEdgeConfirmation({ included: true, pieceType: "splash" }), false);
assert.equal(pieceRequiresExposedEdgeConfirmation({ included: true, pieceType: "counter" }), true);

const island = calculateExposedEdgeInches(
  { lengthIn: 56, depthIn: 27, quantity: 1 },
  { front: true, back: true, left: true, right: true }
);
assert.equal(island.totalLf, 13.83);

// Source contracts
const review = readFileSync(
  join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);
const dialog = readFileSync(
  join(root, "app-ai-takeoff/src/components/ExposedSidesDialog.tsx"),
  "utf8"
);
const trigger = readFileSync(
  join(root, "app-ai-takeoff/src/components/ExposedSidesEditor.tsx"),
  "utf8"
);
const styles = readFileSync(join(root, "app-ai-takeoff/src/styles.css"), "utf8");

assert.match(review, /saveTakeoffDraftExplicit/);
assert.match(review, /applyLocalBacksplashToggle/);
assert.match(review, /applyLocalExposedEdgeConfirm/);
assert.equal(/drainCorrectionQueue|scheduleSave|noteLocalDraftEdit/.test(review), false);
assert.equal(/debounceMs/.test(review), false);
assert.match(review, /Save the Takeoff draft before approval/);
assert.match(review, /ExposedSidesDialog/);
assert.match(review, /ExposedSidesTrigger/);
assert.match(review, /scrollLeft = 0/);
assert.match(review, /ctr-table-wrap/);
console.log("ok: review uses explicit Save only; no autosave queue");

assert.match(dialog, /createPortal/);
assert.match(dialog, /document\.body/);
assert.match(dialog, /role="dialog"/);
assert.match(dialog, /aria-modal="true"/);
assert.match(dialog, /ctr-edge-dialog-backdrop/);
assert.match(dialog, /position: fixed|ctr-edge-dialog-backdrop/);
assert.equal(/<details/.test(dialog), false);
assert.equal(/saveTakeoffCorrection|persistDraft|updateDraft/.test(dialog), false);
console.log("ok: dialog portals to document.body; not a details popover");

assert.match(trigger, /aria-expanded/);
assert.match(trigger, /aria-controls/);
assert.equal(/<details/.test(trigger), false);
assert.equal(/createPortal/.test(trigger), false);
console.log("ok: trigger is button-only; no in-cell editor");

assert.match(styles, /ctr-edge-dialog-backdrop/);
assert.match(styles, /--ctr-worksheet-min-width/);
assert.equal(/ctr-exposed-edges-pop|ctr-exposed-edges-menu/.test(styles), false);
assert.equal(/ctr-table-wrap:has\(\.ctr-exposed-edges/.test(styles), false);
assert.match(styles, /@media \(max-width: 1200px\)/);
console.log("ok: old edge popover CSS removed; dialog + layout contracts");

// Dialog parent contract: portal target is document.body (outside worksheet)
assert.match(dialog, /createPortal\([\s\S]*,\s*document\.body\s*\)/);
console.log("ok: dialog-parent DOM contract — document.body portal");

console.log("\ntakeoffExplicitSave.test.mjs: ok\n");
