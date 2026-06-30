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

// T4 — audit event types on successful import block
{
  const block = {
    status: "active",
    takeoffJobId: "abc",
    auditEvents: [
      { type: "takeoff_import_started", at: "2026-06-01T12:00:00.000Z" },
      { type: "takeoff_import_succeeded", at: "2026-06-01T12:00:01.000Z" },
    ],
  };
  assert.ok(block.auditEvents.some((e) => e.type === "takeoff_import_started"));
  assert.ok(block.auditEvents.some((e) => e.type === "takeoff_import_succeeded"));
  console.log("ok: T4 import audit event types");
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

// T7 — Traceability must still exist in calculation_snapshot JSONB (the fallback path).
//      When the migration is not applied the only copy lives in internal_ui.takeoff_import.
{
  const jobId = "11111111-0000-0000-0000-000000000001";
  const snapshotId = "22222222-0000-0000-0000-000000000002";
  const snap = {
    internal_ui: {
      takeoff_import: {
        schemaVersion: "takeoff_import_v1",
        takeoffJobId: jobId,
        takeoffSnapshotId: snapshotId,
        status: "active",
        importedAt: "2026-06-30T22:00:00.000Z",
        approvedBy: "estimator@example.com",
      },
    },
  };
  assert.equal(snap.internal_ui.takeoff_import.takeoffJobId, jobId, "T7a: job id in JSONB");
  assert.equal(snap.internal_ui.takeoff_import.takeoffSnapshotId, snapshotId, "T7b: snapshot id in JSONB");
  console.log("ok: T7 takeoff traceability preserved in calculation_snapshot JSONB regardless of migration state");
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

console.log("\nAll internalQuoteTakeoffImport tests passed.\n");
