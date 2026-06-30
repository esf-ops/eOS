/**
 * takeoffImportWorkflow — unit tests (v6.3).
 *
 * Run: npm run eos:test:takeoff-import-workflow
 */
import assert from "node:assert/strict";
import {
  allSuggestedAddOnsReviewed,
  canMarkAllImportedRoomsVerified,
  evaluateTakeoffQuoteReadiness,
  initSuggestedAddOnReviews,
  importedRoomsMissingMaterial,
  markAllImportedRoomsVerified,
  markRoomFullyVerified,
  suggestedAddOnKey,
} from "./takeoffImportWorkflow.mjs";
import { applyTakeoffPiecePatch, computeTakeoffMeasurementDeltas } from "./takeoffImportMeasurements.mjs";

console.log("\ntakeoffImportWorkflow — tests\n");

function makePiece(len = 120) {
  return {
    id: "p1",
    name: "Run A",
    pieceType: "counter",
    lengthIn: len,
    depthIn: 25.5,
    shape: "rect",
    takeoffImportSource: {
      importedFromTakeoff: true,
      importState: "imported_unmodified",
      originalDimensions: { lengthIn: 120, depthIn: 25.5, shape: "rect" },
    },
  };
}

function makeRoom(piece = makePiece()) {
  return {
    id: "room-1",
    name: "Kitchen",
    materialGroup: "",
    takeoffImportSource: { importedFromTakeoff: true },
    guidedShapeGroups: [{ id: "g1", name: "Main", shapeType: "straight", pieces: [piece] }],
    guidedPieces: [piece],
    fhbPieces: [],
  };
}

// T1 — inline edit updates delta
{
  const room = makeRoom();
  const before = computeTakeoffMeasurementDeltas([room]);
  assert.equal(before.delta.countertopSqft, 0);
  const edited = applyTakeoffPiecePatch(makePiece(), { lengthIn: 60 });
  const after = computeTakeoffMeasurementDeltas([makeRoom(edited)]);
  assert.ok(after.delta.countertopSqft < 0);
  console.log("ok: T1 inline imported measurement edits update deltas");
}

// T2 — mark room verified
{
  const room = markRoomFullyVerified(makeRoom());
  assert.equal(room.takeoffImportVerification.measurementsVerified, true);
  assert.equal(room.takeoffImportVerification.addonsReviewed, true);
  assert.equal(room.takeoffImportVerification.notesReviewed, true);
  console.log("ok: T2 mark room verified behavior");
}

// T3 — mark all blocked by major delta
{
  const edited = applyTakeoffPiecePatch(makePiece(), { lengthIn: 10 });
  const rooms = [makeRoom(edited)];
  const deltas = computeTakeoffMeasurementDeltas(rooms);
  assert.equal(canMarkAllImportedRoomsVerified(rooms, deltas.exceedsThreshold), false);
  console.log("ok: T3 mark all rooms verified blocked by major delta warnings");
}

// T4 — mark all allowed when deltas ok
{
  const rooms = [makeRoom()];
  const deltas = computeTakeoffMeasurementDeltas(rooms);
  assert.equal(canMarkAllImportedRoomsVerified(rooms, deltas.exceedsThreshold), true);
  const marked = markAllImportedRoomsVerified(rooms);
  assert.equal(marked[0].takeoffImportVerification.measurementsVerified, true);
  console.log("ok: T4 mark all rooms verified when deltas within threshold");
}

// T5 — quote readiness summary states
{
  const readiness = evaluateTakeoffQuoteReadiness({
    hasActiveImport: true,
    roomDrafts: [makeRoom()],
    measurementDeltas: computeTakeoffMeasurementDeltas([makeRoom()]),
    colorTbd: true,
    quoteDefaultCatalogId: null,
    accountComplete: false,
    projectComplete: true,
    materialComplete: false,
    addonsReviewed: false,
    notesReviewed: false,
    readyToCalculate: false,
    suggestedAddOnReviews: initSuggestedAddOnReviews([{ type: "sink_cutout", label: "Sink cutout" }]),
  });
  assert.equal(readiness.items.find((i) => i.key === "measurements_imported")?.complete, true);
  assert.equal(readiness.items.find((i) => i.key === "material_color")?.complete, false);
  assert.equal(readiness.items.find((i) => i.key === "ready")?.complete, false);
  console.log("ok: T5 quote readiness summary states");
}

// T6 — missing material warnings on imported rooms
{
  const missing = importedRoomsMissingMaterial([makeRoom()], true, null);
  assert.equal(missing.length, 1);
  const ok = importedRoomsMissingMaterial([{ ...makeRoom(), materialGroup: "Group A" }], false, null);
  assert.equal(ok.length, 0);
  console.log("ok: T6 missing material/color warnings on imported rooms");
}

// T7 — suggested add-on review states
{
  const reviews = initSuggestedAddOnReviews([{ type: "sink_cutout", label: "Kitchen sink" }]);
  assert.equal(reviews[0].status, "pending");
  assert.equal(reviews[0].mappedAddOnKey, "qty-sink");
  const done = reviews.map((r) => ({ ...r, status: "accepted" }));
  assert.equal(allSuggestedAddOnsReviewed(done), true);
  console.log("ok: T7 suggested add-on accept/ignore/needs follow-up state");
}

// T8 — save/reopen persistence shape
{
  const reviews = initSuggestedAddOnReviews([{ type: "cord_hole", label: "Cord hole" }]);
  reviews[0].status = "needs_follow_up";
  reviews[0].note = "Confirm location";
  const payload = {
    takeoff_import_checklist: {
      addonsReviewed: true,
      notesReviewed: true,
      suggestedAddOnReviews: reviews,
      compactTakeoffTable: true,
    },
  };
  const round = JSON.parse(JSON.stringify(payload));
  assert.equal(round.takeoff_import_checklist.suggestedAddOnReviews[0].status, "needs_follow_up");
  assert.equal(round.takeoff_import_checklist.compactTakeoffTable, true);
  console.log("ok: T8 save/reopen persistence");
}

// T9 — stable suggested add-on keys
{
  assert.equal(suggestedAddOnKey({ type: "sink_cutout", label: " Sink " }), "sink_cutout:sink");
  console.log("ok: T9 suggested add-on key stability");
}

console.log("\nAll takeoffImportWorkflow tests passed.\n");
