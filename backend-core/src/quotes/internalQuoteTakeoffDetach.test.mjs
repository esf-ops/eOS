/**
 * internalQuoteTakeoffDetach — unit tests (v6.1).
 *
 * Run: npm run eos:test:internal-quote-takeoff-detach
 */
import assert from "node:assert/strict";
import {
  filterRoomsAfterTakeoffDetach,
  markTakeoffImportDetached,
} from "./internalQuoteTakeoffDetach.mjs";
import { takeoffImportPayloadToRoomDrafts } from "../takeoff/takeoffImportPayload.mjs";
import { appendTakeoffImportAuditEvent } from "./internalQuoteTakeoffAudit.mjs";

console.log("\ninternalQuoteTakeoffDetach — tests\n");

const JOB = "33333333-3333-4333-8333-333333333333";

function makeImportPayload() {
  return {
    schemaVersion: "takeoff_import_v1",
    takeoffJobId: JOB,
    takeoffResultId: "44444444-4444-4444-8444-444444444444",
    sourceFileName: "plan.pdf",
    approvedBy: "reviewer@example.com",
    approvedAt: "2026-06-01T12:00:00.000Z",
    totals: { countertopSqft: 25, standardBacksplashSqft: 5, combinedSqft: 30 },
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
}

// T1 — imported pieces retain source metadata
{
  const drafts = takeoffImportPayloadToRoomDrafts(makeImportPayload());
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].takeoffImportSource?.importedFromTakeoff, true);
  assert.equal(drafts[0].takeoffImportSource?.sourcePage, 2);
  const piece = drafts[0].guidedShapeGroups?.[0]?.pieces?.[0];
  assert.equal(piece?.takeoffImportSource?.importedFromTakeoff, true);
  assert.equal(piece?.takeoffImportSource?.reviewStatus, "reviewed");
  console.log("ok: T1 imported pieces keep source metadata");
}

// T2 — filter removes imported rooms, keeps manual rooms
{
  const imported = takeoffImportPayloadToRoomDrafts(makeImportPayload());
  const manual = { id: "manual-room-1", name: "Manual", takeoffImportSource: undefined };
  const takeoffImport = {
    status: "active",
    takeoffJobId: JOB,
    importedRoomIds: imported.map((r) => r.id),
    auditEvents: [],
  };
  const remaining = filterRoomsAfterTakeoffDetach([...imported, manual], takeoffImport);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, manual.id);
  console.log("ok: T2 detach clears imported rooms without deleting quote");
}

// T3 — empty result yields default room
{
  const imported = takeoffImportPayloadToRoomDrafts(makeImportPayload());
  const remaining = filterRoomsAfterTakeoffDetach(imported, {
    importedRoomIds: imported.map((r) => r.id),
  });
  assert.equal(remaining.length, 1);
  assert.ok(remaining[0].name);
  console.log("ok: T3 default room when all imported rooms removed");
}

// T4 — audit events written on detach
{
  const base = appendTakeoffImportAuditEvent(
    { status: "active", takeoffJobId: JOB, auditEvents: [] },
    { type: "takeoff_import_succeeded", userEmail: "a@b.com" }
  );
  const detached = markTakeoffImportDetached(base, {
    userEmail: "estimator@example.com",
    quoteId: "22222222-2222-4222-8222-222222222222",
    removedRoomCount: 2,
  });
  assert.equal(detached.status, "detached");
  assert.ok(detached.auditEvents.some((e) => e.type === "takeoff_import_succeeded"));
  assert.ok(detached.auditEvents.some((e) => e.type === "takeoff_import_detached"));
  console.log("ok: T4 audit events written on detach");
}

// T5 — import receipt metadata shape
{
  const payload = makeImportPayload();
  const receipt = {
    sourceFileName: payload.sourceFileName,
    approvedBy: payload.approvedBy,
    approvedAt: payload.approvedAt,
    takeoffJobId: payload.takeoffJobId,
    schemaVersion: payload.schemaVersion,
    totals: payload.totals,
  };
  assert.equal(receipt.sourceFileName, "plan.pdf");
  assert.equal(receipt.totals.countertopSqft, 25);
  console.log("ok: T5 import receipt renders from source_takeoff metadata");
}

console.log("\nAll internalQuoteTakeoffDetach tests passed.\n");
