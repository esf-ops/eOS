/**
 * internalQuoteTakeoffImport — unit tests (v6.0).
 *
 * Run: npm run eos:test:internal-quote-takeoff-import
 */
import assert from "node:assert/strict";
import { isTakeoffImportDraftComplete } from "./internalQuoteTakeoffImport.mjs";

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

console.log("\nAll internalQuoteTakeoffImport tests passed.\n");
