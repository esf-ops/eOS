/**
 * Takeoff correction coordinator + worksheet layout contracts.
 * Run: node app-ai-takeoff/src/lib/takeoffCorrectionCoordinator.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCorrectionConflict,
  applyCorrectionFailure,
  applyCorrectionSuccess,
  applyRunPatchWithEdgeInvalidation,
  beginCorrectionSend,
  canStartCorrectionSend,
  clearConflictPause,
  createTakeoffCorrectionCoordinatorState,
  formatTakeoffSaveStatus,
  invalidateFinishedEdgeConfirmation,
  noteLocalDraftEdit,
  pieceRequiresExposedEdgeConfirmation,
  seedCoordinatorServerKeys
} from "./takeoffCorrectionCoordinator.mjs";
import {
  flattenPieces,
  patchRun,
  patchRunGeometry
} from "./consolidatedWorksheetRows.mjs";
import {
  calculateExposedEdgeInches,
  buildFinishedEdgeFromExposedSides
} from "../../../backend-core/src/takeoff/takeoffExposedEdges.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\ntakeoffCorrectionCoordinator.test.mjs\n");

// --- Coordinator: single in-flight + coalesce + send-time keys ---
{
  let state = createTakeoffCorrectionCoordinatorState();
  state = seedCoordinatorServerKeys(state, {
    resultId: "res-1",
    clientMutationRevision: 2
  });
  state = noteLocalDraftEdit(state, { v: 1 });
  state = noteLocalDraftEdit(state, { v: 2 });
  state = noteLocalDraftEdit(state, { v: 3 });
  assert.equal(state.pending.draft.v, 3, "coalesce to newest draft");
  assert.equal(state.localEditSequence, 3);

  const first = beginCorrectionSend(state);
  state = first.state;
  assert.ok(first.send);
  assert.equal(first.send.draft.v, 3);
  assert.equal(first.send.baseResultId, "res-1");
  assert.ok(first.send.clientMutationRevision > 2);
  assert.equal(canStartCorrectionSend(state), false, "no second send while in flight");

  // Newer edit while in flight
  state = noteLocalDraftEdit(state, { v: 4 });
  assert.equal(canStartCorrectionSend(state), false);

  state = applyCorrectionSuccess(state, {
    resultId: "res-2",
    clientMutationRevision: first.send.clientMutationRevision,
    requestSequence: first.send.sequence
  });
  assert.equal(state.latestResultId, "res-2");
  assert.equal(state.inFlight, false);
  assert.ok(state.pending, "newer local edit survives older success");
  assert.equal(state.pending.draft.v, 4);

  const second = beginCorrectionSend(state);
  assert.equal(second.send.baseResultId, "res-2", "second send uses new keys");
  assert.ok(second.send.clientMutationRevision > first.send.clientMutationRevision);
  console.log("ok: coalesce + one in-flight + send-time keys + reconcile");
}

// --- 409 pauses and preserves draft; no auto-replay ---
{
  let state = createTakeoffCorrectionCoordinatorState();
  state = seedCoordinatorServerKeys(state, { resultId: "a", clientMutationRevision: 1 });
  state = noteLocalDraftEdit(state, { keep: true, sides: ["front"] });
  const begun = beginCorrectionSend(state);
  state = begun.state;
  state = applyCorrectionConflict(
    state,
    { latestResultId: "b", latestClientMutationRevision: 9 },
    begun.send
  );
  assert.equal(state.conflictPaused, true);
  assert.equal(state.pending.draft.keep, true);
  assert.deepEqual(state.pending.draft.sides, ["front"]);
  assert.equal(canStartCorrectionSend(state), false, "409 stops automatic processing");
  state = noteLocalDraftEdit(state, { keep: true, sides: ["front"], note: "local" });
  assert.equal(canStartCorrectionSend(state), false);
  state = clearConflictPause(state);
  assert.equal(canStartCorrectionSend(state), true);
  console.log("ok: real 409 preserves draft and does not auto-replay");
}

// --- Failure keeps retryable pending ---
{
  let state = createTakeoffCorrectionCoordinatorState();
  state = noteLocalDraftEdit(state, { x: 1 });
  const begun = beginCorrectionSend(state);
  state = begun.state;
  state = noteLocalDraftEdit(state, { x: 2 });
  state = applyCorrectionFailure(state);
  assert.equal(state.saveUiStatus, "error");
  assert.equal(state.pending.draft.x, 2);
  console.log("ok: non-409 failure preserves newer pending");
}

// --- Save status labels ---
assert.equal(formatTakeoffSaveStatus("dirty"), "Unsaved changes");
assert.equal(formatTakeoffSaveStatus("saving"), "Saving…");
assert.equal(formatTakeoffSaveStatus("saved"), "Saved");
assert.equal(formatTakeoffSaveStatus("conflict"), "Conflict — review latest draft");
assert.equal(formatTakeoffSaveStatus("error"), "Save failed");
console.log("ok: save status labels");

// --- Backsplash / edge separation ---
{
  const confirmed = {
    finishedEdgeConfirmed: true,
    approved: true,
    totalFinishedEdgeLengthIn: 166,
    exposedSides: { front: true, back: true, left: true, right: true }
  };
  const afterBs = applyRunPatchWithEdgeInvalidation(
    { finishedEdge: confirmed, lengthIn: 86 },
    { backsplashEligible: true },
    { invalidateEdge: false }
  );
  assert.equal(afterBs.finishedEdge.finishedEdgeConfirmed, true);
  assert.equal(afterBs.finishedEdge.totalFinishedEdgeLengthIn, 166);

  const afterLen = patchRunGeometry(
    {
      rooms: [
        {
          id: "r1",
          areas: [{ id: "a1", runs: [{ id: "p1", lengthIn: 86, depthIn: 36, finishedEdge: confirmed }] }]
        }
      ]
    },
    { roomId: "r1", areaId: "a1", runId: "p1" },
    { lengthIn: 90 }
  );
  const run = afterLen.rooms[0].areas[0].runs[0];
  assert.equal(run.finishedEdge.finishedEdgeConfirmed, false);
  assert.equal(run.lengthIn, 90);
  console.log("ok: backsplash does not invalidate; length does");
}

assert.equal(
  pieceRequiresExposedEdgeConfirmation({ included: true, pieceType: "splash" }),
  false
);
assert.equal(
  pieceRequiresExposedEdgeConfirmation({ included: true, pieceType: "counter" }),
  true
);
assert.equal(
  pieceRequiresExposedEdgeConfirmation({ included: false, pieceType: "counter" }),
  false
);
console.log("ok: backsplash-only / excluded excluded from edge confirmation");

// Geometry regressions from exposed-edge module
{
  const island = calculateExposedEdgeInches(
    { lengthIn: 56, depthIn: 27, quantity: 1 },
    { front: true, back: true, left: true, right: true }
  );
  assert.equal(island.totalLf, 13.83);
  const penEnd = calculateExposedEdgeInches(
    { lengthIn: 86, depthIn: 36, quantity: 1 },
    { front: true, back: true, left: false, right: true }
  );
  assert.equal(penEnd.totalLf, 17.33);
  const penLong = calculateExposedEdgeInches(
    { lengthIn: 86, depthIn: 36, quantity: 1 },
    { front: true, back: false, left: true, right: true }
  );
  assert.equal(penLong.totalLf, 13.17);
  const qty = calculateExposedEdgeInches(
    { lengthIn: 56, depthIn: 27, quantity: 2 },
    { front: true, back: true, left: true, right: true }
  );
  assert.equal(qty.totalLf, 27.67);
  console.log("ok: geometry regressions 56×27 / 86×36 / qty");
}

// Flatten includes pieceType; notes patch does not clear confirmation
{
  const draft = {
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
                finishedEdge: {
                  finishedEdgeConfirmed: true,
                  approved: true,
                  totalFinishedEdgeLengthIn: 166
                }
              },
              {
                id: "s1",
                label: "4in BS",
                pieceType: "splash",
                lengthIn: 56,
                depthIn: 4,
                isBacksplash: true
              }
            ]
          }
        ]
      }
    ]
  };
  const rows = flattenPieces(draft, new Set());
  assert.equal(rows.find((r) => r.runId === "s1").pieceType, "splash");
  const noted = patchRun(draft, { roomId: "r1", areaId: "a1", runId: "c1" }, {
    notes: ["hello"]
  });
  assert.equal(
    noted.rooms[0].areas[0].runs[0].finishedEdge.finishedEdgeConfirmed,
    true
  );
  console.log("ok: flatten pieceType + notes do not invalidate");
}

assert.ok(invalidateFinishedEdgeConfirmation({ finishedEdgeConfirmed: true }));
assert.equal(
  invalidateFinishedEdgeConfirmation({ finishedEdgeConfirmed: true }).finishedEdgeConfirmed,
  false
);

// UI / CSS contracts
const review = readFileSync(
  join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);
const editor = readFileSync(
  join(root, "app-ai-takeoff/src/components/ExposedSidesEditor.tsx"),
  "utf8"
);
const styles = readFileSync(join(root, "app-ai-takeoff/src/styles.css"), "utf8");
const studioCss = readFileSync(
  join(root, "app-elite100-estimate-studio/src/styles.css"),
  "utf8"
);
const scopePanel = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"),
  "utf8"
);

assert.match(review, /drainCorrectionQueue/);
assert.match(review, /beginCorrectionSend|noteLocalDraftEdit/);
assert.match(review, /Confirm exposed edges for/);
assert.equal(/Confirm finished edges for/.test(review), false);
assert.match(review, /patchRunGeometry/);
assert.match(review, /flushBeforeStructuralChange/);
assert.match(review, /formatTakeoffSaveStatus/);
assert.match(review, /name=\{`length-\$\{row\.runId\}`\}/);
assert.match(review, /name=\{`notes-\$\{row\.runId\}`\}/);
assert.match(review, /colSpan=\{12\}/);
console.log("ok: review coordinator + approval copy + a11y names");

assert.match(editor, /aria-expanded=\{open\}/);
assert.match(editor, /aria-controls=\{panelId\}/);
assert.match(editor, /ctr-cancel-exposed-edges/);
assert.match(editor, /Escape/);
assert.match(editor, /await onConfirm/);
assert.match(editor, /summaryRef\.current\?\.focus/);
console.log("ok: editor close/focus/cancel/escape contracts");

assert.match(styles, /--ctr-col-edge/);
assert.match(styles, /\.ctr-col-edge/);
assert.match(styles, /ctr-table-wrap:has\(\.ctr-exposed-edges-pop\[open\]\)/);
assert.match(styles, /\.ctr-actions \{[\s\S]*position: relative/);
assert.equal(/\.ctr-actions \{[\s\S]*position: sticky/.test(styles), false);
assert.match(styles, /max-height: min\(60vh, 28rem\)/);
console.log("ok: CSS column + action bar + popover contracts");

assert.equal(/\n\s+grid-column:\s*1\s*\/\s*-1;\s*\n\}/.test(studioCss), false);
assert.match(scopePanel, /Takeoff worksheet needs review/);
assert.match(scopePanel, /eq-estimate-status/);
console.log("ok: Studio CSS orphan fixed + human status label");

// Zero side-effect contract: autosave path never calls approve/publish
assert.equal(/approveAndBuildEstimate\(/.test(review.split("drainCorrectionQueue")[1]?.slice(0, 800) || ""), false);
assert.match(review, /correctionNotes: "Confirm exposed edges"/);
console.log("ok: confirm still uses correction path only");

console.log("\ntakeoffCorrectionCoordinator.test.mjs: ok\n");
