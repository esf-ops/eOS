/**
 * dryRunQuickBooksStagingImport — Phase 2B staging dry-run tests (fake data only).
 *
 * All export folders/records built here are obviously fake. No real QuickBooks customer
 * names, vendor names, addresses, invoice numbers, dollar amounts, or PII appear.
 *
 * Run: node backend-core/src/scripts/dryRunQuickBooksStagingImport.test.mjs
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDryRunReport,
  buildDryRunReportLines,
  computeBlockReasons,
  printDryRunReport,
} from "./dryRunQuickBooksStagingImport.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QB_DIR = path.resolve(HERE, "../quickbooks");
const FAKE_ORG_ID = "00000000-0000-0000-0000-000000000abc";

async function makeTempExportFolder() {
  return fs.mkdtemp(path.join(os.tmpdir(), "qb-dryrun-test-"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

/** Write a raw string as the file's entire JSON content (used for C#-object-string batches). */
async function writeRaw(filePath, rawJsonText) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, rawJsonText, "utf8");
}

function fakeListBatch(entityType, batchNumber, records) {
  return { entityType, batchNumber, recordCount: records.length, records };
}

function fakeCustomer(i, overrides = {}) {
  return {
    ListID: `FAKE-CUST-${i}`,
    EditSequence: String(100 + i),
    TimeCreated: "2020-01-01T00:00:00",
    TimeModified: "2026-01-01T00:00:00",
    IsActive: "true",
    ...overrides,
  };
}

/** A single nested invoice line element (as the connector nests it inside InvoiceRet). */
function fakeNestedLine(invoiceI, lineI, overrides = {}) {
  return {
    "@elementName": "InvoiceLineRet",
    TxnLineID: `FAKE-LINE-${invoiceI}-${lineI}`,
    ItemRef: { ListID: `FAKE-ITEM-${invoiceI}-${lineI}` },
    ...overrides,
  };
}

/** An invoice with `linesPerInvoice` nested InvoiceLineRet elements (array or single). */
function fakeInvoice(i, { linesPerInvoice = 2, ...overrides } = {}) {
  const invoice = {
    TxnID: `FAKE-INV-${i}`,
    EditSequence: String(200 + i),
    TxnDate: "2026-01-15",
    TimeCreated: "2026-01-15T00:00:00",
    TimeModified: "2026-06-01T00:00:00",
    CustomerRef: { ListID: `FAKE-CUST-${i}` },
    ...overrides,
  };
  if (linesPerInvoice === 1) {
    invoice.InvoiceLineRet = fakeNestedLine(i, 1);
  } else if (linesPerInvoice > 1) {
    invoice.InvoiceLineRet = Array.from({ length: linesPerInvoice }, (_, j) => fakeNestedLine(i, j + 1));
  }
  return invoice;
}

/** A standalone invoice-lines folder record (informational cross-check only). */
function fakeStandaloneLine(i) {
  return { "@elementName": "InvoiceLineRet", TxnLineID: `FAKE-STANDALONE-LINE-${i}`, ItemRef: { ListID: `FAKE-ITEM-${i}` } };
}

/**
 * Build a minimal valid materialized export.
 * Invoice lines live NESTED inside invoices (authoritative). The standalone
 * invoice-lines folder is written with a matching count as an informational cross-check.
 */
async function writeCleanExport(dir, { customerCount = 2, invoiceCount = 2, linesPerInvoice = 2 } = {}) {
  const customers = Array.from({ length: customerCount }, (_, i) => fakeCustomer(i + 1));
  const invoices = Array.from({ length: invoiceCount }, (_, i) => fakeInvoice(i + 1, { linesPerInvoice }));
  const derivedLineTotal = invoiceCount * linesPerInvoice;
  const standaloneLines = Array.from({ length: derivedLineTotal }, (_, i) => fakeStandaloneLine(i + 1));

  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-130918-fake",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [
      { EntityType: "customers", BatchCount: 1, RecordCount: customerCount, Errors: [] },
      { EntityType: "invoices", BatchCount: 1, RecordCount: invoiceCount, Errors: [] },
    ],
    Errors: [],
  });

  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", 1, customers));
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, invoices));
  // Standalone invoice-lines folder: informational cross-check only, NOT the staging source.
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeListBatch("invoice-lines", 1, standaloneLines));
}

// ── Test 1: a clean materialized export passes ──────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 3, invoiceCount: 2 });

  const report = await buildDryRunReport(dir, { organizationId: FAKE_ORG_ID });

  assert.equal(report.ok, true, "clean export should pass");
  assert.equal(report.blocked, false);
  assert.equal(report.result, "DRY RUN PASS");
  assert.equal(report.runId, "20260710-130918-fake");
  assert.equal(report.qbXmlVersion, "16.0");
  assert.equal(report.perEntity.customers.sourceRecordCount, 3);
  assert.equal(report.perEntity.customers.stagingRowCount, 3);
  assert.equal(report.perEntity.customers.failureCount, 0);
  assert.equal(report.perEntity.invoices.stagingRowCount, 2);
  // invoice-lines are DERIVED from the 2 invoices x 2 lines = 4.
  assert.equal(report.perEntity["invoice-lines"].source, "derived-from-invoices");
  assert.equal(report.perEntity["invoice-lines"].stagingRowCount, 4);
  assert.equal(report.perEntity["invoice-lines"].failureCount, 0);
  assert.equal(report.perEntity["invoice-lines"].standaloneFolderCount, 4, "standalone cross-check matches");
  assert.equal((report.warnings ?? []).length, 0, "no mismatch warning when counts agree");
  // customers(3) + invoices(2) + derived lines(4) = 9
  assert.equal(report.totalStagingRows, 9);
  assert.equal(report.totalFailures, 0);

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: clean export -> DRY RUN PASS; invoice-lines derived from invoices with matching cross-check");
}

// ── Test 2: selfReportedOnlyFileCount blocks the import ─────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-selfreport",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "customers", BatchCount: 1, RecordCount: 2, Errors: [] }],
    Errors: [],
  });
  // A C#-anonymous-object-string batch (records not materialized).
  await writeRaw(
    path.join(dir, "customers", "batch-001.json"),
    JSON.stringify("{ entityType = customers, batchNumber = 1, recordCount = 2, records = System.Collections.Generic.List`1[System.Object] }")
  );

  const report = await buildDryRunReport(dir, { organizationId: FAKE_ORG_ID });

  assert.equal(report.ok, false, "self-reported-only export must fail closed");
  assert.equal(report.blocked, true);
  assert.equal(report.result, "DRY RUN FAIL");
  assert.ok(
    report.blockReasons.some((r) => r.includes("selfReportedOnlyFileCount")),
    "block reasons should cite selfReportedOnlyFileCount"
  );
  // Must not have built any staging rows once blocked.
  assert.equal(report.totalStagingRows, 0);

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: selfReportedOnlyFileCount > 0 blocks import (DRY RUN FAIL, no rows built)");
}

// ── Test 3: malformed/null records are isolated to failures, batch does not crash ─
{
  const dir = await makeTempExportFolder();
  const records = [null, fakeCustomer(1), "not-an-object", fakeCustomer(2)];
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-malformed",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "customers", BatchCount: 1, RecordCount: records.length, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", 1, records));

  let report;
  await assert.doesNotReject(async () => {
    report = await buildDryRunReport(dir, { organizationId: FAKE_ORG_ID });
  }, "dry run must not crash on malformed/null records");

  assert.equal(report.blocked, false, "malformed records do not trip a validation gate");
  assert.equal(report.perEntity.customers.sourceRecordCount, 4);
  assert.equal(report.perEntity.customers.stagingRowCount, 2, "two valid records build");
  assert.equal(report.perEntity.customers.failureCount, 2, "null + non-object isolated as failures");
  assert.equal(report.perEntity.customers.failureReasons["record is not a plain object"], 2, "safe reason tallied");
  assert.equal(report.ok, false, "any failure fails the dry run");
  assert.equal(report.result, "DRY RUN FAIL");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: malformed/null records isolated to failures without crashing the batch");
}

// ── Test 4: invoice-lines are derived from invoices, not the standalone folder ─
{
  const dir = await makeTempExportFolder();
  // Invoices carry the authoritative nested lines. The standalone invoice-lines folder
  // contains DIFFERENT/garbage records that must NOT be used as the staging source.
  const invoices = [fakeInvoice(1, { linesPerInvoice: 3 }), fakeInvoice(2, { linesPerInvoice: 1 })];
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-derive",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "invoices", BatchCount: 1, RecordCount: 2, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, invoices));
  // Standalone folder has a matching count (4) so no mismatch, but its records are ignored.
  const standalone = Array.from({ length: 4 }, (_, i) => fakeStandaloneLine(i + 1));
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeListBatch("invoice-lines", 1, standalone));

  const report = await buildDryRunReport(dir, { organizationId: FAKE_ORG_ID });

  assert.equal(report.perEntity["invoice-lines"].source, "derived-from-invoices");
  // 3 + 1 = 4 derived lines, all with parent qb_txn_id + non-null line_seq_number.
  assert.equal(report.perEntity["invoice-lines"].stagingRowCount, 4);
  assert.equal(report.perEntity["invoice-lines"].failureCount, 0);
  assert.equal(report.perEntity["invoice-lines"].standaloneFolderCount, 4);
  assert.equal(report.ok, true, "derived lines build cleanly -> PASS");
  assert.equal(report.result, "DRY RUN PASS");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: invoice-lines derived from invoices (standalone folder not used as source)");
}

// ── Test 4b: missing invoice TxnID fails the derived lines closed ───────────
{
  const dir = await makeTempExportFolder();
  const badInvoice = fakeInvoice(1, { linesPerInvoice: 2 });
  delete badInvoice.TxnID; // no parent key -> derived lines fail closed
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-notxn",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "invoices", BatchCount: 1, RecordCount: 1, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, [badInvoice]));

  const report = await buildDryRunReport(dir, { organizationId: FAKE_ORG_ID });

  // The invoice itself also fails to build (no TxnID), and its derived lines fail closed.
  assert.equal(report.perEntity["invoice-lines"].failureCount, 1);
  assert.ok(
    report.perEntity["invoice-lines"].failureReasons["parent invoice TxnID is missing or empty"] >= 1,
    "derived-line failure cites missing parent TxnID"
  );
  assert.equal(report.ok, false);
  assert.equal(report.result, "DRY RUN FAIL");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: missing invoice TxnID fails derived invoice-lines closed (DRY RUN FAIL)");
}

// ── Test 4c: standalone vs derived count mismatch produces a safe warning ────
{
  const dir = await makeTempExportFolder();
  const invoices = [fakeInvoice(1, { linesPerInvoice: 2 })]; // derived = 2
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-mismatch",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "invoices", BatchCount: 1, RecordCount: 1, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, invoices));
  // Standalone folder has 5 (!= derived 2) -> warning + data-quality finding, but not a fail.
  const standalone = Array.from({ length: 5 }, (_, i) => fakeStandaloneLine(i + 1));
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeListBatch("invoice-lines", 1, standalone));

  const report = await buildDryRunReport(dir, { organizationId: FAKE_ORG_ID });

  assert.equal(report.perEntity["invoice-lines"].stagingRowCount, 2);
  assert.equal(report.perEntity["invoice-lines"].standaloneFolderCount, 5);
  assert.equal(report.dataQualityFindingCounts["invoice_lines_standalone_vs_derived_mismatch"], 1);
  assert.ok(report.warnings.some((w) => /cross-check/.test(w)), "mismatch produces a safe warning");
  assert.equal(report.ok, true, "count mismatch is a warning, not a hard fail");
  assert.equal(report.result, "DRY RUN PASS");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: standalone vs derived invoice-lines mismatch -> safe warning + finding (not a fail)");
}

// ── Test 5: output never contains PII sentinel values ───────────────────────
{
  const dir = await makeTempExportFolder();
  const piiCustomer = fakeCustomer(1, {
    FullName: "SENTINEL_PII_NAME",
    CompanyName: "SENTINEL_PII_COMPANY",
    BillAddress: { Addr1: "SENTINEL_PII_ADDR" },
    Email: "SENTINEL_PII_EMAIL",
    Phone: "SENTINEL_PII_PHONE",
  });
  const piiInvoice = fakeInvoice(1, {
    RefNumber: "SENTINEL_PII_REF",
    Memo: "SENTINEL_PII_MEMO",
    TotalAmount: "SENTINEL_PII_AMOUNT",
  });
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-pii",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [
      { EntityType: "customers", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "invoices", BatchCount: 1, RecordCount: 1, Errors: [] },
    ],
    Errors: [],
  });
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", 1, [piiCustomer]));
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, [piiInvoice]));

  const report = await buildDryRunReport(dir, { organizationId: FAKE_ORG_ID });

  // The report object itself must not carry PII (no raw_payload retained).
  assert.doesNotMatch(JSON.stringify(report), /SENTINEL_PII/, "report object must not contain PII");

  // The rendered lines must not contain PII.
  const lines = buildDryRunReportLines(report).join("\n");
  assert.doesNotMatch(lines, /SENTINEL_PII/, "rendered report lines must not contain PII");

  // The actual printed CLI output must not contain PII.
  const printed = [];
  const originalLog = console.log;
  console.log = (line) => printed.push(String(line));
  try {
    printDryRunReport(report);
  } finally {
    console.log = originalLog;
  }
  assert.doesNotMatch(printed.join("\n"), /SENTINEL_PII/, "printed CLI output must not contain PII");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: dry-run report/output never contains PII sentinel values");
}

// ── Test 6: no Supabase client / network dependency imported by the dry-run path ─
{
  const filesToScan = [
    path.join(HERE, "dryRunQuickBooksStagingImport.mjs"),
    path.join(QB_DIR, "quickBooksStaging.js"),
    path.join(QB_DIR, "quickBooksExportReader.js"),
    path.join(QB_DIR, "quickBooksExportSummary.js"),
    path.join(QB_DIR, "quickBooksJsonFileReader.js"),
  ];

  for (const file of filesToScan) {
    const src = await fs.readFile(file, "utf8");
    assert.doesNotMatch(src, /@supabase|supabase-js|createClient\s*\(/i, `${path.basename(file)} must not use Supabase`);
    assert.doesNotMatch(src, /\bnode:https?\b|require\(['"]https?['"]\)/i, `${path.basename(file)} must not import http/https`);
    assert.doesNotMatch(src, /SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY/i, `${path.basename(file)} must not read service-role env`);
    // No live network fetch calls (allow the word in comments, but not an actual call).
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${path.basename(file)} must not call fetch()`);
  }
  console.log("ok: dry-run import path uses no Supabase client, no http/https, no service-role env, no fetch()");
}

// ── Test 7: computeBlockReasons gates (unit) ────────────────────────────────
{
  // manifest invalid
  assert.ok(computeBlockReasons({ manifestValid: false, perEntity: {} }).some((r) => /manifest/i.test(r)));

  // unreadable + unrecognized
  const reasons = computeBlockReasons({
    manifestValid: true,
    perEntity: {
      customers: {
        inManifest: true, folderExists: true, manifestRecordCount: 2, discoveredRecordCount: 2,
        selfReportedOnlyFileCount: 0, unreadableFileCount: 1, unrecognizedShapeFileCount: 1,
      },
    },
  });
  assert.ok(reasons.some((r) => r.includes("unreadableFileCount")));
  assert.ok(reasons.some((r) => r.includes("unrecognizedShapeFileCount")));

  // manifest count mismatch (non invoice-lines)
  const mismatch = computeBlockReasons({
    manifestValid: true,
    perEntity: {
      invoices: {
        inManifest: true, folderExists: true, manifestRecordCount: 5, discoveredRecordCount: 4,
        selfReportedOnlyFileCount: 0, unreadableFileCount: 0, unrecognizedShapeFileCount: 0,
      },
    },
  });
  assert.ok(mismatch.some((r) => /!= discovered/.test(r)));

  // invoice-lines mismatch is EXEMPT (derived, not in manifest)
  const linesExempt = computeBlockReasons({
    manifestValid: true,
    perEntity: {
      "invoice-lines": {
        inManifest: false, folderExists: true, manifestRecordCount: null, discoveredRecordCount: 999,
        selfReportedOnlyFileCount: 0, unreadableFileCount: 0, unrecognizedShapeFileCount: 0,
      },
    },
  });
  assert.equal(linesExempt.length, 0, "invoice-lines is exempt from the manifest count-match gate");

  console.log("ok: computeBlockReasons enforces all fail-closed gates and exempts invoice-lines counts");
}

console.log("\nAll dryRunQuickBooksStagingImport tests passed.");
