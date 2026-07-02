/**
 * quickBooksExportSummary — unit tests (fake fixture data only, no real QuickBooks data).
 * Run: node backend-core/src/quickbooks/quickBooksExportSummary.test.mjs
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readQuickBooksExport } from "./quickBooksExportReader.js";
import { buildQuickBooksExportSummary } from "./quickBooksExportSummary.js";

async function makeTempExportFolder() {
  return fs.mkdtemp(path.join(os.tmpdir(), "qb-export-summary-test-"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function fakeManifest(overrides = {}) {
  return {
    RunId: "20260701-165230-ab8fe650",
    StartedAt: "2026-07-01T16:52:30Z",
    CompletedAt: "2026-07-01T17:41:05Z",
    QbXmlVersion: "13.0",
    CompanyFile: "(currently open company file)",
    MaxReturned: 100,
    SelectedEntities: ["all"],
    ExportDirectory: "/fake/exports/2026-07-01-165230",
    Entities: [],
    Errors: [],
    ...overrides,
  };
}

function fakeBatchFile(entityType, batchNumber, recordCount) {
  return {
    entityType,
    batchNumber,
    recordCount,
    records: Array.from({ length: recordCount }, (_, i) => ({
      "@elementName": `${entityType}Ret`,
      ListID: `FAKE-${entityType}-${batchNumber}-${i}`,
    })),
  };
}

// ── valid manifest with matching discovered files ─────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(
    path.join(dir, "manifest.json"),
    fakeManifest({
      Entities: [
        { EntityType: "customers", BatchCount: 1, RecordCount: 2, Errors: [] },
        { EntityType: "items", BatchCount: 1, RecordCount: 1, Errors: [] },
      ],
    })
  );
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeBatchFile("customers", 1, 2));
  await writeJson(path.join(dir, "items", "batch-001.json"), fakeBatchFile("items", 1, 1));

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);

  assert.equal(summary.manifestValid, true);
  assert.equal(summary.runId, "20260701-165230-ab8fe650");
  assert.equal(summary.qbXmlVersion, "13.0");
  assert.equal(summary.totalEntityTypesInManifest, 2);
  assert.equal(summary.totalManifestRecordCount, 3);
  assert.equal(summary.totalDiscoveredRecordCount, 3);
  assert.equal(summary.manifestTopLevelErrorCount, 0);
  assert.equal(summary.perEntity.customers.discoveredRecordCount, 2);
  assert.equal(summary.perEntity.customers.manifestRecordCount, 2);
  assert.equal(summary.warnings.length, 0);
  console.log("ok: valid manifest, matching discovered files, no warnings");
}

// ── missing manifest ───────────────────────────────────────────────────────────
{
  const dir = await makeTempExportFolder();

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);

  assert.equal(summary.manifestValid, false);
  assert.equal(summary.runId, null);
  assert.ok(summary.warnings.some((w) => /not found or unreadable/.test(w)));
  console.log("ok: missing manifest produces invalid summary with warning");
}

// ── missing entity folder ──────────────────────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(
    path.join(dir, "manifest.json"),
    fakeManifest({
      Entities: [{ EntityType: "vendors", BatchCount: 1, RecordCount: 5, Errors: [] }],
    })
  );
  // Intentionally do not create the vendors/ folder on disk.

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);

  assert.ok(summary.missingFolders.includes("vendors"));
  assert.equal(summary.perEntity.vendors.folderExists, false);
  assert.equal(summary.perEntity.vendors.inManifest, true);
  // All 14 known folders are missing here except none were created.
  assert.equal(summary.missingFolders.length, 14);
  console.log("ok: missing entity folder is reported");
}

// ── invoice-lines folder exists but missing from manifest ────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(
    path.join(dir, "manifest.json"),
    fakeManifest({
      Entities: [{ EntityType: "invoices", BatchCount: 1, RecordCount: 3, Errors: [] }],
    })
  );
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeBatchFile("invoices", 1, 3));
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeBatchFile("invoice-lines", 1, 7));

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);

  assert.equal(summary.perEntity["invoice-lines"].folderExists, true);
  assert.equal(summary.perEntity["invoice-lines"].inManifest, false);
  assert.ok(summary.warnings.some((w) => /invoice-lines folder exists on disk but is not represented/.test(w)));
  console.log("ok: invoice-lines folder without manifest entry triggers warning");
}

// ── entity errors present ──────────────────────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(
    path.join(dir, "manifest.json"),
    fakeManifest({
      Entities: [
        {
          EntityType: "estimates",
          BatchCount: 0,
          RecordCount: 0,
          Errors: ["[estimates] batch 1 statusCode=1000 message=There has been an internal error"],
        },
      ],
      Errors: ["[estimates] batch 1 statusCode=1000 message=There has been an internal error"],
    })
  );

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);

  assert.equal(summary.perEntity.estimates.manifestErrorCount, 1);
  assert.equal(summary.manifestTopLevelErrorCount, 1);
  assert.ok(summary.warnings.some((w) => /\[estimates\] manifest reports 1 error/.test(w)));
  assert.ok(summary.warnings.some((w) => /manifest\.json reports 1 top-level error/.test(w)));
  console.log("ok: entity errors surface as warnings");
}

// ── unknown extra folder ignored safely ───────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(
    path.join(dir, "manifest.json"),
    fakeManifest({
      Entities: [{ EntityType: "customers", BatchCount: 1, RecordCount: 1, Errors: [] }],
    })
  );
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeBatchFile("customers", 1, 1));
  await fs.mkdir(path.join(dir, "some-future-tool-output"), { recursive: true });

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);

  assert.ok(summary.unknownFolders.includes("some-future-tool-output"));
  assert.ok(!summary.warnings.some((w) => w.includes("some-future-tool-output")));
  assert.equal(summary.manifestValid, true);
  console.log("ok: unknown extra folder is ignored safely (no crash, no spurious warning)");
}

// ── never returns raw record fields ───────────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(
    path.join(dir, "manifest.json"),
    fakeManifest({
      Entities: [{ EntityType: "customers", BatchCount: 1, RecordCount: 1, Errors: [] }],
    })
  );
  await writeJson(path.join(dir, "customers", "batch-001.json"), {
    entityType: "customers",
    batchNumber: 1,
    recordCount: 1,
    records: [{ Name: "Fake Test Customer", Phone: "555-000-0000", Balance: "1234.56" }],
  });

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);
  const serialized = JSON.stringify(summary);

  assert.doesNotMatch(serialized, /Fake Test Customer/);
  assert.doesNotMatch(serialized, /555-000-0000/);
  assert.doesNotMatch(serialized, /1234\.56/);
  assert.equal(summary.perEntity.customers.selfReportedOnlyFileCount, 0);
  console.log("ok: summary never contains raw record fields");
}

// ── csharp-object-string batch produces not-ingest-ready warning ──────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(
    path.join(dir, "manifest.json"),
    fakeManifest({
      Entities: [{ EntityType: "bills", BatchCount: 1, RecordCount: 100, Errors: [] }],
    })
  );
  const csharpString =
    "{ entityType = bills, batchNumber = 1, recordCount = 100, records = System.Collections.Generic.List`1[System.Object] }";
  await writeJson(path.join(dir, "bills", "batch-001.json"), csharpString);

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);

  assert.equal(summary.perEntity.bills.selfReportedOnlyFileCount, 1);
  assert.equal(summary.perEntity.bills.discoveredRecordCount, 100);
  const warning = summary.warnings.find((w) => /bills.*self-reported.*not ingest-ready/i.test(w));
  assert.ok(warning, `expected a not-ingest-ready warning for bills; got: ${JSON.stringify(summary.warnings)}`);
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /System\.Collections/);
  assert.doesNotMatch(serialized, /System\.Object/);
  console.log("ok: csharp-object-string batch produces selfReportedOnlyFileCount and not-ingest-ready warning");
}

// ── manifest RecordCount mismatch with discovered materialized records fires warning ─
{
  const dir = await makeTempExportFolder();
  await writeJson(
    path.join(dir, "manifest.json"),
    fakeManifest({
      Entities: [{ EntityType: "vendors", BatchCount: 1, RecordCount: 10, Errors: [] }],
    })
  );
  // Only 3 real records on disk — manifest says 10
  await writeJson(path.join(dir, "vendors", "batch-001.json"), fakeBatchFile("vendors", 1, 3));

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);

  assert.equal(summary.perEntity.vendors.manifestRecordCount, 10);
  assert.equal(summary.perEntity.vendors.discoveredRecordCount, 3);
  const mismatchWarning = summary.warnings.find((w) => /vendors.*10.*3|vendors.*does not match/i.test(w));
  assert.ok(mismatchWarning, `expected a mismatch warning for vendors; got: ${JSON.stringify(summary.warnings)}`);
  console.log("ok: manifest RecordCount mismatch with discovered records fires mismatch warning");
}

console.log("\nAll quickBooksExportSummary tests passed.");
