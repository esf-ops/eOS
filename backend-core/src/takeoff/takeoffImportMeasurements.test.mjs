/**
 * takeoffImportMeasurements — unit tests (v6.2).
 *
 * Run: npm run eos:test:takeoff-import-measurements
 */
import assert from "node:assert/strict";
import {
  applyTakeoffPiecePatch,
  buildTakeoffSourceMetaForImport,
  computeTakeoffMeasurementDeltas,
  duplicateTakeoffPiece,
  excludeImportedPieceFromQuote,
  restoreTakeoffOriginalDimensions,
  splitTakeoffPiece,
  sumTakeoffMeasurementTotalsFromRooms,
} from "./takeoffImportMeasurements.mjs";
import { takeoffImportPayloadToRoomDrafts } from "./takeoffImportPayload.mjs";
import { calculateQuote } from "../quotes/quoteCalculator.js";

console.log("\ntakeoffImportMeasurements — tests\n");

function makePiece(overrides = {}) {
  return {
    id: "p1",
    name: "Run A",
    pieceType: "counter",
    lengthIn: 120,
    depthIn: 25.5,
    shape: "rect",
    takeoffImportSource: buildTakeoffSourceMetaForImport({
      takeoffJobId: "job-1",
      takeoffSnapshotId: "snap-1",
      lengthIn: 120,
      depthIn: 25.5,
      sourcePage: 2,
    }),
    ...overrides,
  };
}

function makeRoom(pieces) {
  return {
    id: "room-1",
    name: "Kitchen",
    roomType: "Kitchen",
    calcMode: "Guided Shape",
    takeoffImportSource: { importedFromTakeoff: true, takeoffJobId: "job-1" },
    guidedShapeGroups: [{ id: "g1", name: "Main", shapeType: "straight", pieces }],
    guidedPieces: pieces,
    fhbPieces: [],
    linear: { wallFt: 0, splashIn: 4, islandL: 0, islandW: 0 },
    direct: { counter: 0, splash: 0 },
    fhbMode: "Off",
    fhbDirectSf: 0,
    fhbOutlets: 0,
    addons: {},
  };
}

// T1 — edited piece preserves source metadata
{
  const piece = makePiece();
  const edited = applyTakeoffPiecePatch(piece, { lengthIn: 96 });
  assert.equal(edited.takeoffImportSource.importedFromTakeoff, true);
  assert.equal(edited.takeoffImportSource.takeoffJobId, "job-1");
  assert.equal(edited.takeoffImportSource.importState, "imported_edited");
  assert.equal(edited.takeoffImportSource.originalDimensions.lengthIn, 120);
  console.log("ok: T1 edited piece preserves source metadata");
}

// T2 — edited-after-import state
{
  const piece = makePiece();
  const edited = applyTakeoffPiecePatch(piece, { depthIn: 26 });
  assert.equal(edited.takeoffImportSource.importState, "imported_edited");
  console.log("ok: T2 edited-after-import state");
}

// T3 — imported vs current delta calculation
{
  const piece = makePiece();
  const room = makeRoom([piece]);
  const before = computeTakeoffMeasurementDeltas([room]);
  assert.equal(before.delta.countertopSqft, 0);
  const editedPiece = applyTakeoffPiecePatch(piece, { lengthIn: 60 });
  const after = computeTakeoffMeasurementDeltas([makeRoom([editedPiece])]);
  assert.ok(after.delta.countertopSqft < 0);
  console.log("ok: T3 imported vs current delta calculation");
}

// T4 — restore original imported dimensions
{
  const piece = makePiece();
  const edited = applyTakeoffPiecePatch(piece, { lengthIn: 80, depthIn: 24 });
  const restored = restoreTakeoffOriginalDimensions(edited);
  assert.equal(restored.lengthIn, 120);
  assert.equal(restored.depthIn, 25.5);
  assert.equal(restored.takeoffImportSource.importState, "imported_unmodified");
  console.log("ok: T4 restore original imported dimensions");
}

// T5 — exclude imported piece
{
  const piece = makePiece();
  const excluded = excludeImportedPieceFromQuote(piece);
  assert.equal(excluded.lengthIn, 0);
  assert.equal(excluded.takeoffImportSource.importState, "imported_excluded");
  const totals = sumTakeoffMeasurementTotalsFromRooms([makeRoom([excluded])], "current");
  assert.equal(totals.countertopSqft, 0);
  console.log("ok: T5 exclude imported piece");
}

// T6 — duplicate and split imported piece
{
  const piece = makePiece();
  const dup = duplicateTakeoffPiece(piece, "p2");
  assert.equal(dup.takeoffImportSource.importState, "manually_added_after_import");
  const split = splitTakeoffPiece(piece, "p3");
  assert.ok(split);
  assert.equal(split.original.lengthIn, 60);
  assert.equal(split.split.lengthIn, 60);
  console.log("ok: T6 duplicate/split imported piece");
}

// T7 — save/reopen shape preserves metadata
{
  const payload = {
    schemaVersion: "takeoff_import_v1",
    takeoffJobId: "33333333-3333-4333-8333-333333333333",
    takeoffResultId: "44444444-4444-4444-8444-444444444444",
    sourceFileName: "plan.pdf",
    approvedBy: "reviewer@example.com",
    approvedAt: "2026-06-01T12:00:00.000Z",
    totals: { countertopSqft: 25, combinedSqft: 25 },
    rooms: [
      {
        name: "Kitchen",
        type: "Kitchen",
        sourcePages: [2],
        guidedShapeGroups: [
          {
            label: "Main",
            shapeType: "straight",
            pieces: [{ label: "Run A", pieceType: "counter", lengthIn: 120, depthIn: 25.5, shape: "rect" }],
          },
        ],
        pieces: [{ name: "Run A", sourcePage: 2, reviewStatus: "reviewed" }],
      },
    ],
    suggestedAddOns: [],
    importWarnings: [],
  };
  const drafts = takeoffImportPayloadToRoomDrafts(payload);
  const piece = drafts[0].guidedShapeGroups[0].pieces[0];
  assert.equal(piece.takeoffImportSource.originalDimensions.lengthIn, 120);
  assert.equal(piece.takeoffImportSource.importState, "imported_unmodified");
  drafts[0].takeoffImportVerification = {
    measurementsVerified: true,
    addonsReviewed: true,
    notesReviewed: false,
    estimatorNote: "Checked on site",
  };
  const serialized = JSON.parse(JSON.stringify(drafts));
  assert.equal(serialized[0].takeoffImportVerification.measurementsVerified, true);
  assert.equal(serialized[0].guidedShapeGroups[0].pieces[0].takeoffImportSource.originalDimensions.lengthIn, 120);
  console.log("ok: T7 save/reopen preserves import metadata and verification state");
}

// T8 — pricing math unchanged when only metadata edits (same dimensions)
{
  const piece = makePiece();
  const room = makeRoom([piece]);
  const body = {
    quoteSource: "internal_quote",
    engine: "guided_shape_groups_v1",
    rooms: [room],
    internalMaterialBasis: "wholesale",
  };
  const calc1 = await calculateQuote(body, { db: null });
  const withMeta = makeRoom([
    {
      ...piece,
      takeoffImportSource: {
        ...piece.takeoffImportSource,
        importState: "imported_edited",
        reviewStatus: "edited",
      },
    },
  ]);
  const calc2 = await calculateQuote({ ...body, rooms: [withMeta] }, { db: null });
  assert.equal(
    Number(calc1.totals?.estimated_sqft ?? calc1.totals?.countertop_sqft ?? 0),
    Number(calc2.totals?.estimated_sqft ?? calc2.totals?.countertop_sqft ?? 0)
  );
  console.log("ok: T8 quote math unchanged when dimensions unchanged");
}

// T9 — no automatic material assignment on import payload
{
  const drafts = takeoffImportPayloadToRoomDrafts({
    schemaVersion: "takeoff_import_v1",
    takeoffJobId: "job-1",
    rooms: [
      {
        name: "Kitchen",
        guidedShapeGroups: [
          {
            label: "Main",
            shapeType: "straight",
            pieces: [{ label: "A", pieceType: "counter", lengthIn: 100, depthIn: 25.5, shape: "rect" }],
          },
        ],
        pieces: [],
      },
    ],
  });
  assert.ok(!drafts[0].materialGroup);
  assert.ok(!drafts[0].materialCatalogId);
  console.log("ok: T9 no automatic material/color/pricing assignment");
}

console.log("\nAll takeoffImportMeasurements tests passed.\n");
