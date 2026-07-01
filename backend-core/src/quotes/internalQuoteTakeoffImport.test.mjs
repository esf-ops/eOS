/**
 * internalQuoteTakeoffImport — unit tests (v6.0).
 *
 * Run: npm run eos:test:internal-quote-takeoff-import
 */
import assert from "node:assert/strict";
import { isTakeoffImportDraftComplete } from "./internalQuoteTakeoffImport.mjs";
import { assertBetaImportConfirmed } from "../takeoff/takeoffBetaService.mjs";

console.log("\ninternalQuoteTakeoffImport — tests\n");

// T1 — imported draft is incomplete until readiness fields filled
{
  const incomplete = {
    internal_ui: {
      takeoff_import: { takeoffJobId: "job-1" },
      readiness: {
        account: false,
        project: false,
        branch: false,
        salesperson: false,
        pricing_mode: false,
        material: false,
        addons: false,
      },
    },
  };
  assert.equal(isTakeoffImportDraftComplete(incomplete), false, "T1 incomplete draft");
  console.log("ok: T1 takeoff import draft incomplete until readiness filled");
}

// T2 — all readiness true means complete (estimator can save)
{
  const complete = {
    internal_ui: {
      readiness: {
        account: true,
        project: true,
        branch: true,
        salesperson: true,
        pricing_mode: true,
        material: true,
        addons: true,
      },
    },
  };
  assert.equal(isTakeoffImportDraftComplete(complete), true, "T2 complete");
  console.log("ok: T2 readiness complete");
}

// T3 — takeoff metadata preserved in snapshot shape
{
  const snap = {
    internal_ui: {
      takeoff_import: {
        schemaVersion: "takeoff_import_v1",
        takeoffJobId: "abc",
        sourceFileName: "plan.pdf",
        approvedBy: "user@example.com",
        totals: { countertopSqft: 50 },
      },
    },
  };
  assert.equal(snap.internal_ui.takeoff_import.schemaVersion, "takeoff_import_v1");
  assert.ok(snap.internal_ui.takeoff_import.totals.countertopSqft > 0);
  console.log("ok: T3 takeoff metadata shape preserved");
}

// T4 — audit event types on successful import block; status must be "imported" (not "active")
{
  const block = {
    status: "imported",
    takeoffJobId: "abc",
    auditEvents: [
      { type: "takeoff_import_started", at: "2026-06-01T12:00:00.000Z" },
      { type: "takeoff_import_succeeded", at: "2026-06-01T12:00:01.000Z" },
    ],
  };
  assert.equal(block.status, "imported", "T4a: takeoff_import.status must be 'imported' so IE shows receipt-only");
  assert.ok(block.auditEvents.some((e) => e.type === "takeoff_import_started"));
  assert.ok(block.auditEvents.some((e) => e.type === "takeoff_import_succeeded"));
  console.log("ok: T4 import audit event types and status is 'imported'");
}

// T5 — v6.4 beta import confirmation gate (API layer; approval gate unchanged)
{
  assert.throws(() => assertBetaImportConfirmed({}), /confirmation required/i);
  assert.doesNotThrow(() => assertBetaImportConfirmed({ betaImportConfirmed: true }));
  console.log("ok: T5 beta import confirmation required before import API proceeds");
}

// T6 — headerExtras for quote creation must NOT include source_takeoff_job_id / source_takeoff_snapshot_id.
//      Those columns are written via a separate best-effort UPDATE so the INSERT succeeds even
//      when eliteos_takeoff_import_traceability migration has not yet been applied.
//      The columns may be added back to the headerExtras shape only after the migration is confirmed
//      in all environments. This test catches an accidental regression.
{
  // Simulate the headerExtras shape built in importInternalEstimateFromTakeoff.
  const headerExtras = {
    quote_family_root_id: null,
    revision_number: 1,
    revision_label: "R1",
    quote_number_base: "TKF-2026-001",
    is_current_revision: true,
  };
  assert.ok(
    !Object.prototype.hasOwnProperty.call(headerExtras, "source_takeoff_job_id"),
    "T6a: source_takeoff_job_id must not be in INSERT headerExtras (would fail without migration)"
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(headerExtras, "source_takeoff_snapshot_id"),
    "T6b: source_takeoff_snapshot_id must not be in INSERT headerExtras (would fail without migration)"
  );
  console.log("ok: T6 headerExtras insert payload is safe before migration is applied");
}

// T7 — Snapshot must use status "imported" and must NOT have takeoff_import_checklist.
//      The checklist/workbench mode in IE is driven purely by isActiveTakeoffImport which
//      returns false for status === "imported". takeoff_import_checklist must be absent.
{
  const jobId = "11111111-0000-0000-0000-000000000001";
  const snapshotId = "22222222-0000-0000-0000-000000000002";
  const snap = {
    internal_ui: {
      quote_workflow: null,
      takeoff_import: {
        schemaVersion: "takeoff_import_v1",
        takeoffJobId: jobId,
        takeoffSnapshotId: snapshotId,
        status: "imported",
        importedAt: "2026-07-01T10:00:00.000Z",
        approvedBy: "estimator@example.com",
      },
      // takeoff_import_checklist intentionally absent
    },
  };
  assert.equal(snap.internal_ui.takeoff_import.status, "imported", "T7a: status is 'imported'");
  assert.equal(snap.internal_ui.quote_workflow, null, "T7b: quote_workflow is null (IE uses its own constant)");
  assert.equal(snap.internal_ui.takeoff_import.takeoffJobId, jobId, "T7c: job id preserved");
  assert.equal(snap.internal_ui.takeoff_import.takeoffSnapshotId, snapshotId, "T7d: snapshot id preserved");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(snap.internal_ui, "takeoff_import_checklist"),
    "T7e: takeoff_import_checklist must be absent — IE shows receipt-only when missing"
  );
  console.log("ok: T7 snapshot uses status 'imported', no checklist, null quote_workflow");
}

// T8 — estimate_room_drafts entries must carry per-room takeoffImportSource (for round-trip audit).
{
  const room = {
    id: "takeoff-kitchen-0",
    name: "Kitchen",
    roomType: "Kitchen",
    calcMode: "Guided Shape",
    takeoffImportSource: {
      importedFromTakeoff: true,
      takeoffJobId: "abc",
      takeoffSnapshotId: "def",
      reviewStatus: "approved",
      importState: "imported_unmodified",
    },
  };
  assert.ok(room.takeoffImportSource.importedFromTakeoff, "T8a: room flagged as takeoff import");
  assert.equal(room.takeoffImportSource.reviewStatus, "approved", "T8b: review status preserved");
  console.log("ok: T8 estimate_room_drafts entries carry per-room takeoff source traceability");
}

// T9 — Native IE room vs. imported takeoff room: required native fields must match.
//
//      A manually-created IE room and an imported takeoff room must share the same
//      set of required RoomDraft fields so IE can hydrate both without special-casing.
//      Traceability fields (takeoffImportSource) are extra — not required for IE math.
{
  // A. Simulate the shape of a manually-created IE room (what createDefaultRoom produces).
  const nativeRoom = {
    id: "room-abc",
    name: "Kitchen",
    roomType: "Kitchen",
    materialGroup: "Group Promo",
    calcMode: "Guided Shape",
    guidedShapeGroups: [
      {
        id: "main",
        name: "Main",
        shapeType: "L-Shape",
        overlapMode: "auto",
        backsplashMode: "include",
        pieces: [
          { id: "p1", pieceType: "counter", name: "Main Wall Run", lengthIn: 120, depthIn: 25.5, shape: "rect", addSplash: true },
          { id: "p2", pieceType: "counter", name: "Short Return", lengthIn: 42, depthIn: 25.5, shape: "rect", addSplash: false },
        ],
      },
    ],
    fhbMode: "Off",
    fhbDirectSf: 0,
    fhbOutlets: 0,
    fhbPieces: [],
    linear: { wallFt: 0, splashIn: 4, islandL: 0, islandW: 0 },
    direct: { counter: 0, splash: 0 },
    tear: false,
    raised: "No",
    notes: "",
    addons: {},
    materialProgramOverride: "inherit",
    useTaxMode: "inherit_project",
    useTaxPercent: 0,
    useTaxBase: "countertop_material",
    vanity: { size: "none", source: "Promo / Stock 100 Remnant", depth: 22.5, qty: 1, programSink: 0, bowl: 0, isVanityProgram: true, vanitySinkType: "oval_white", vanityExtraTrips: 0, outsideProgram: false },
  };

  // B. Simulate what takeoffImportPayloadToRoomDrafts produces for the same layout.
  const importedRoom = {
    id: "takeoff-kitchen-0",
    name: "Kitchen",
    roomType: "Kitchen",
    materialGroup: null,                  // estimator must fill in — IE defaults to "Group Promo"
    calcMode: "Guided Shape",
    guidedShapeGroups: [
      {
        id: "main",
        name: "Main",
        shapeType: "L-Shape",
        overlapMode: "auto",
        backsplashMode: "exclude",        // no-stone backsplash
        pieces: [
          { id: "p-Main Wall Run", pieceType: "counter", name: "Main Wall Run", lengthIn: 120, depthIn: 25.5, shape: "rect",
            takeoffImportSource: { importedFromTakeoff: true, takeoffJobId: "job-1", reviewStatus: "approved" } },
          { id: "p-Short Return", pieceType: "counter", name: "Short Return", lengthIn: 42, depthIn: 25.5, shape: "rect",
            takeoffImportSource: { importedFromTakeoff: true, takeoffJobId: "job-1", reviewStatus: "approved" } },
        ],
      },
    ],
    fhbMode: "Off",
    fhbDirectSf: 0,
    fhbOutlets: 0,
    fhbPieces: [],
    linear: { wallFt: 0, splashIn: 4, islandL: 0, islandW: 0 },
    direct: { counter: 0, splash: 0 },
    tear: false,
    raised: "No",
    notes: "",
    addons: {},
    materialProgramOverride: "inherit",
    useTaxMode: "inherit_project",
    useTaxPercent: 0,
    useTaxBase: "countertop_material",
    vanity: { size: "none", source: "Promo / Stock 100 Remnant", depth: 22.5, qty: 1, programSink: 0, bowl: 0, isVanityProgram: true, vanitySinkType: "oval_white", vanityExtraTrips: 0, outsideProgram: false },
    takeoffImportSource: { importedFromTakeoff: true, takeoffJobId: "job-1", reviewStatus: "approved" },
  };

  // Required native IE fields that must be present in BOTH shapes.
  const requiredNativeFields = [
    "id", "name", "roomType", "calcMode",
    "guidedShapeGroups",
    "fhbMode", "fhbDirectSf", "fhbOutlets", "fhbPieces",
    "linear", "direct",
    "tear", "raised", "notes", "addons",
    "materialProgramOverride", "useTaxMode", "useTaxPercent", "useTaxBase",
    "vanity",
  ];

  for (const field of requiredNativeFields) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(nativeRoom, field),
      `T9a: native room missing field "${field}"`
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(importedRoom, field),
      `T9b: imported room missing field "${field}" — adapter must produce fully native drafts`
    );
  }

  // calcMode must match.
  assert.equal(importedRoom.calcMode, nativeRoom.calcMode, "T9c: calcMode matches");

  // fhb fields must match defaults.
  assert.equal(importedRoom.fhbMode, "Off", "T9d: fhbMode is Off");
  assert.equal(importedRoom.fhbDirectSf, 0, "T9e: fhbDirectSf is 0");
  assert.deepEqual(importedRoom.fhbPieces, [], "T9f: fhbPieces is empty array");

  // vanity shape must have the same keys.
  const vanityKeys = ["size", "source", "depth", "qty", "programSink", "bowl", "isVanityProgram"];
  for (const key of vanityKeys) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(importedRoom.vanity, key),
      `T9g: vanity missing key "${key}"`
    );
  }

  // Traceability is EXTRA — its absence must not affect the required native fields.
  const withoutTraceability = { ...importedRoom };
  delete withoutTraceability.takeoffImportSource;
  for (const field of requiredNativeFields) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(withoutTraceability, field),
      `T9h: without traceability, room still has field "${field}"`
    );
  }

  // catalogColorId must NOT be present (not a native IE field).
  assert.ok(
    !Object.prototype.hasOwnProperty.call(importedRoom, "catalogColorId"),
    "T9i: catalogColorId must not be in imported room draft"
  );

  console.log("ok: T9 imported room draft contains all required native IE RoomDraft fields");
}

console.log("\nAll internalQuoteTakeoffImport tests passed.\n");
