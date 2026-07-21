/**
 * Piece-row identity regression tests — editing one worksheet row must never
 * change another row (fix for duplicate/missing AI run ids fanning one edit
 * out to every row in the room).
 *
 * Run: node app-ai-takeoff/src/lib/takeoffPieceRowIdentity.test.mjs
 */
import assert from "node:assert/strict";
import { flattenPieces, patchRun, reassignRun, renameRoom, sfFrom } from "./consolidatedWorksheetRows.mjs";
import { addManualPiece, markRunEstimatorOwned } from "./emptyManualTakeoffDraft.mjs";
import {
  applyDeletionTombstones,
  ensureUniqueTakeoffIdentity,
  removePieceFromTakeoff
} from "../../../backend-core/src/takeoff/takeoffAuthoritativeResult.mjs";
import { listIncludedPieces } from "../../../backend-core/src/takeoff/takeoffConsolidatedApproval.mjs";
import { planTakeoffImport } from "../../../backend-core/src/takeoff/takeoffImportPlanner.mjs";
import { computeTakeoffMeasurements } from "../../../backend-core/src/takeoff/takeoffMeasurementCalc.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

console.log("\ntakeoffPieceRowIdentity.test.mjs\n");

/**
 * The bug reproduction shape: an AI draft where all four Kitchen runs carry the
 * same placeholder id — exactly what the model can emit despite the prompt
 * asking for per-run uuids.
 */
function duplicateIdAiDraft() {
  return {
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        areas: [
          {
            id: "area-main",
            label: "Main",
            backsplashScope: "stone",
            runs: [
              { id: "<uuid>", label: "Piece 1", lengthIn: 100, depthIn: 25.5, quantity: 1, shape: "rect", pieceType: "counter" },
              { id: "<uuid>", label: "Piece 2", lengthIn: 80, depthIn: 25.5, quantity: 1, shape: "rect", pieceType: "counter" },
              { id: "<uuid>", label: "Piece 3", lengthIn: 60, depthIn: 25.5, quantity: 1, shape: "rect", pieceType: "counter" },
              { id: "<uuid>", label: "Piece 4", lengthIn: 40, depthIn: 25.5, quantity: 1, shape: "rect", pieceType: "counter" }
            ]
          }
        ]
      },
      {
        id: "room-bath",
        name: "Bath",
        areas: [
          {
            id: "area-bath",
            label: "Main",
            backsplashScope: "stone",
            runs: [{ id: "run-bath-1", label: "Vanity", lengthIn: 48, depthIn: 22, quantity: 1, shape: "rect", pieceType: "counter" }]
          }
        ]
      }
    ]
  };
}

function healed() {
  const { takeoff, changed } = ensureUniqueTakeoffIdentity(duplicateIdAiDraft());
  assert.equal(changed, true, "duplicate placeholder ids must trigger healing");
  return takeoff;
}

function kitchenRows(draft) {
  return flattenPieces(draft, new Set()).filter((r) => r.roomId === "room-kitchen");
}

// 1. Four pieces can have four distinct names — identity healing gives each row its own id,
//    so four separate label patches land on four separate rows.
{
  let draft = healed();
  const rows = kitchenRows(draft);
  assert.equal(rows.length, 4);
  const names = ["Left run", "Right run", "Island", "Bar"];
  rows.forEach((row, i) => {
    draft = patchRun(draft, { roomId: row.roomId, areaId: row.areaId, runId: row.runId }, { label: names[i] });
  });
  assert.deepEqual(kitchenRows(draft).map((r) => r.pieceName), names);
  console.log("  ✓ 1. four pieces hold four distinct names");
}

// 2. Editing piece 2 changes only piece 2.
{
  const draft = healed();
  const rows = kitchenRows(draft);
  const next = patchRun(draft, { roomId: rows[1].roomId, areaId: rows[1].areaId, runId: rows[1].runId }, { label: "Left run" });
  const after = kitchenRows(next);
  assert.deepEqual(after.map((r) => r.pieceName), ["Piece 1", "Left run", "Piece 3", "Piece 4"]);
  console.log("  ✓ 2. editing piece 2 changes only piece 2");
}

// 3. Editing length changes only one row.
{
  const draft = healed();
  const rows = kitchenRows(draft);
  const next = patchRun(draft, { roomId: rows[2].roomId, areaId: rows[2].areaId, runId: rows[2].runId }, { lengthIn: 999, sf: sfFrom(999, rows[2].depthIn) });
  const after = kitchenRows(next);
  assert.deepEqual(after.map((r) => r.lengthIn), [100, 80, 999, 40]);
  console.log("  ✓ 3. editing length changes only one row");
}

// 4. Editing depth changes only one row.
{
  const draft = healed();
  const rows = kitchenRows(draft);
  const next = patchRun(draft, { roomId: rows[0].roomId, areaId: rows[0].areaId, runId: rows[0].runId }, { depthIn: 30 });
  const after = kitchenRows(next);
  assert.deepEqual(after.map((r) => r.depthIn), [30, 25.5, 25.5, 25.5]);
  console.log("  ✓ 4. editing depth changes only one row");
}

// 5. Editing quantity changes only one row.
{
  const draft = healed();
  const rows = kitchenRows(draft);
  const next = patchRun(draft, { roomId: rows[3].roomId, areaId: rows[3].areaId, runId: rows[3].runId }, { quantity: 5 });
  const after = kitchenRows(next);
  assert.deepEqual(after.map((r) => r.quantity), [1, 1, 1, 5]);
  console.log("  ✓ 5. editing quantity changes only one row");
}

// 6. Moving one piece to another room moves only that piece.
{
  const draft = healed();
  const rows = kitchenRows(draft);
  const next = reassignRun(draft, rows[1].roomId, rows[1].runId, "room-bath");
  const kitchenAfter = kitchenRows(next);
  const bathAfter = flattenPieces(next, new Set()).filter((r) => r.roomId === "room-bath");
  assert.deepEqual(kitchenAfter.map((r) => r.pieceName), ["Piece 1", "Piece 3", "Piece 4"]);
  assert.deepEqual(bathAfter.map((r) => r.pieceName).sort(), ["Piece 2", "Vanity"]);
  console.log("  ✓ 6. moving one piece to another room changes only that piece");
}

// 7. Adding a piece creates a unique stable id, distinct from every existing id.
{
  const draft = healed();
  const before = new Set(flattenPieces(draft, new Set()).map((r) => r.runId));
  const next = addManualPiece(draft, "room-kitchen", { label: "Added piece" });
  const rows = flattenPieces(next, new Set());
  const added = rows.find((r) => r.pieceName === "Added piece");
  assert.ok(added && added.runId, "added piece has an id");
  assert.ok(!before.has(added.runId), "added piece id is unique");
  assert.equal(new Set(rows.map((r) => r.runId)).size, rows.length, "all run ids remain unique");
  // Stability: re-running identity healing must not rewrite already-unique ids.
  assert.equal(ensureUniqueTakeoffIdentity(next).changed, false);
  console.log("  ✓ 7. adding a piece creates a unique stable id");
}

// 8. Deleting one piece does not shift another piece's values (and tombstones
//    cannot collaterally delete other rows).
{
  const draft = healed();
  const rows = kitchenRows(draft);
  const pack = removePieceFromTakeoff(draft, rows[1].roomId, rows[1].runId);
  assert.deepEqual(pack.deletedRunIds, [rows[1].runId]);
  const after = kitchenRows(pack.takeoff);
  assert.deepEqual(after.map((r) => r.pieceName), ["Piece 1", "Piece 3", "Piece 4"]);
  assert.deepEqual(after.map((r) => r.lengthIn), [100, 60, 40]);
  // Applying the tombstone again (reload path) removes nothing else.
  const reloaded = applyDeletionTombstones(pack.takeoff, { deletedRunIds: pack.deletedRunIds });
  assert.equal(kitchenRows(reloaded).length, 3);
  console.log("  ✓ 8. deleting one piece does not shift another piece's values");
}

// 9. Save/reload preserves unique values — JSON round-trip keeps ids and names,
//    and re-hydration healing is a no-op on an already-healed draft.
{
  let draft = healed();
  const rows = kitchenRows(draft);
  const names = ["A", "B", "C", "D"];
  rows.forEach((row, i) => {
    draft = markRunEstimatorOwned(
      patchRun(draft, { roomId: row.roomId, areaId: row.areaId, runId: row.runId }, { label: names[i] }),
      row.roomId,
      row.runId
    );
  });
  const reloaded = JSON.parse(JSON.stringify(draft));
  const { takeoff: rehydrated, changed } = ensureUniqueTakeoffIdentity(reloaded);
  assert.equal(changed, false, "healed ids are stable across save/reload");
  assert.deepEqual(kitchenRows(rehydrated).map((r) => r.pieceName), names);
  assert.deepEqual(
    kitchenRows(rehydrated).map((r) => r.runId),
    kitchenRows(draft).map((r) => r.runId)
  );
  console.log("  ✓ 9. save/reload preserves unique ids and values");
}

// 10. Approve payload preserves unique piece identities (listIncludedPieces is
//     what the consolidated approval gate walks).
{
  const draft = healed();
  const pieces = listIncludedPieces(draft, { excludedRunIds: [] });
  assert.equal(pieces.length, 5);
  const ids = pieces.map((p) => p.run.id);
  assert.equal(new Set(ids).size, ids.length, "approve payload run ids are unique");
  console.log("  ✓ 10. approve payload preserves unique piece identities");
}

// 11. Estimate Scope receives all distinct pieces (import planner maps every run).
{
  const draft = { ...healed(), status: "reviewed" };
  const computed = computeTakeoffMeasurements(draft);
  const plan = planTakeoffImport(draft, computed);
  assert.equal(plan.canImport, true);
  const kitchenPlan = plan.rooms.find((r) => r.roomId === "room-kitchen");
  const labels = kitchenPlan.guidedShapeGroups.flatMap((g) => g.pieces.map((p) => p.label));
  for (const label of ["Piece 1", "Piece 2", "Piece 3", "Piece 4"]) {
    assert.ok(labels.includes(label), `scope plan includes ${label}`);
  }
  console.log("  ✓ 11. Estimate Scope plan receives all distinct pieces");
}

// 12. No duplicate React keys — worksheet row keys are unique after healing
//     (React key = row.key from flattenPieces).
{
  const rawKeys = flattenPieces(duplicateIdAiDraft(), new Set()).map((r) => r.key);
  assert.ok(new Set(rawKeys).size < rawKeys.length, "unhealed duplicate ids DO collide (the bug)");
  const keys = flattenPieces(healed(), new Set()).map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "healed row keys are unique");
  console.log("  ✓ 12. no duplicate row keys after identity healing");
}

// Wiring: the component must hydrate through identity healing and patch by
// room+area+run locator; the extraction service must heal at normalization.
{
  const here = dirname(fileURLToPath(import.meta.url));
  const component = readFileSync(
    join(here, "../components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  const extraction = readFileSync(
    join(here, "../../../backend-core/src/takeoff/takeoffExtractionService.mjs"),
    "utf8"
  );
  assert.ok(component.includes("ensureUniqueTakeoffIdentity"), "component heals drafts at hydration");
  assert.ok(component.includes("consolidatedWorksheetRows.mjs"), "component uses shared row helpers");
  assert.ok(component.includes("areaId: row.areaId"), "patches are area-scoped");
  assert.ok(extraction.includes("ensureUniqueTakeoffIdentity"), "extraction normalization heals AI ids");
  console.log("  ✓ wiring: hydration healing + area-scoped patch + extraction healing");
}

console.log("\ntakeoffPieceRowIdentity.test.mjs — passed\n");
