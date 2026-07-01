/**
 * previewQuickBooksExport — CLI output formatting tests (fake fixture data only).
 * Run: node backend-core/src/scripts/previewQuickBooksExport.test.mjs
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readQuickBooksExport } from "../quickbooks/quickBooksExportReader.js";
import { buildQuickBooksExportSummary } from "../quickbooks/quickBooksExportSummary.js";
import { buildSummaryOutputLines, formatEntitySummaryLine, printSummary } from "./previewQuickBooksExport.mjs";

async function makeTempExportFolder() {
  return fs.mkdtemp(path.join(os.tmpdir(), "qb-preview-cli-test-"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function fakeBatchFile(entityType, batchNumber, recordCount) {
  return {
    entityType,
    batchNumber,
    recordCount,
    records: Array.from({ length: recordCount }, (_, i) => ({ ListID: `FAKE-${entityType}-${i}` })),
  };
}

function captureConsoleLog(fn) {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  return lines;
}

// ── formatEntitySummaryLine: fields are always separated by exactly one space ─
{
  const line = formatEntitySummaryLine("sales-orders", {
    inManifest: true,
    folderExists: true,
    manifestBatchCount: 310,
    manifestRecordCount: 30989,
    discoveredJsonFileCount: 310,
    discoveredRecordCount: 30989,
    manifestErrorCount: 0,
    unreadableFileCount: 0,
    unrecognizedShapeFileCount: 0,
  });

  assert.equal(
    line,
    "  sales-orders: inManifest=true folderExists=true manifestBatchCount=310 manifestRecordCount=30989 " +
      "discoveredJsonFileCount=310 discoveredRecordCount=30989 manifestErrorCount=0 unreadableFileCount=0 " +
      "unrecognizedShapeFileCount=0"
  );
  assert.match(line, /discoveredJsonFileCount=310 discoveredRecordCount=30989/);
  console.log("ok: formatEntitySummaryLine separates every field with exactly one space");
}

// ── formatEntitySummaryLine: never leaks raw record content, only safe counts/flags ─
{
  const line = formatEntitySummaryLine("customers", {
    inManifest: true,
    folderExists: true,
    manifestBatchCount: 365,
    manifestRecordCount: 36441,
    discoveredJsonFileCount: 365,
    discoveredRecordCount: 36441,
    manifestErrorCount: 0,
    unreadableFileCount: 0,
    unrecognizedShapeFileCount: 0,
  });

  assert.doesNotMatch(line, /[a-zA-Z]+@[a-zA-Z]+\.[a-zA-Z]+/); // no email-shaped content
  assert.doesNotMatch(line, /\$\d/); // no dollar amounts
  assert.match(line, /^ {2}customers: (\w+=\S+ ?)+$/);
  console.log("ok: formatEntitySummaryLine output contains only safe key=value tokens");
}

// ── buildSummaryOutputLines: the sales-orders line in the real assembled output is correct ─
// (this is the single source of truth `printSummary` logs from — no separate inline
// template-literal path exists that could drift out of sync with formatEntitySummaryLine)
{
  const fakeSummary = {
    exportFolderPath: "/fake/export/path",
    manifestValid: true,
    runId: "fake-run-id",
    qbXmlVersion: "16.0",
    startedAt: "2026-07-01T00:00:00Z",
    completedAt: "2026-07-01T01:00:00Z",
    totalEntityTypesInManifest: 1,
    totalManifestRecordCount: 30989,
    totalDiscoveredRecordCount: 30989,
    manifestTopLevelErrorCount: 0,
    perEntity: {
      "sales-orders": {
        inManifest: true,
        folderExists: true,
        manifestBatchCount: 310,
        manifestRecordCount: 30989,
        discoveredJsonFileCount: 310,
        discoveredRecordCount: 30989,
        manifestErrorCount: 0,
        unreadableFileCount: 0,
        unrecognizedShapeFileCount: 0,
      },
    },
    missingFolders: [],
    unknownFolders: [],
    warnings: [],
  };

  const lines = buildSummaryOutputLines(fakeSummary);
  const salesOrdersLine = lines.find((line) => line.includes("sales-orders:"));
  assert.ok(salesOrdersLine, "expected a sales-orders line in the assembled output");
  assert.match(salesOrdersLine, /discoveredJsonFileCount=310 discoveredRecordCount=30989/);
  assert.doesNotMatch(salesOrdersLine, /discoveredJsonFileCount=310discoveredRecordCount/);
  console.log("ok: buildSummaryOutputLines assembles a correctly spaced sales-orders line");
}

// ── printSummary: the actual console.log output (what the real CLI prints) is correct ─
{
  const fakeSummary = {
    exportFolderPath: "/fake/export/path",
    manifestValid: true,
    runId: "fake-run-id",
    qbXmlVersion: "16.0",
    startedAt: "2026-07-01T00:00:00Z",
    completedAt: "2026-07-01T01:00:00Z",
    totalEntityTypesInManifest: 1,
    totalManifestRecordCount: 30989,
    totalDiscoveredRecordCount: 30989,
    manifestTopLevelErrorCount: 0,
    perEntity: {
      "sales-orders": {
        inManifest: true,
        folderExists: true,
        manifestBatchCount: 310,
        manifestRecordCount: 30989,
        discoveredJsonFileCount: 310,
        discoveredRecordCount: 30989,
        manifestErrorCount: 0,
        unreadableFileCount: 0,
        unrecognizedShapeFileCount: 0,
      },
    },
    missingFolders: [],
    unknownFolders: [],
    warnings: [],
  };

  const printedLines = captureConsoleLog(() => printSummary(fakeSummary));
  const salesOrdersLine = printedLines.find((line) => line.includes("sales-orders:"));
  assert.ok(salesOrdersLine, "expected printSummary to have logged a sales-orders line");
  assert.equal(
    salesOrdersLine,
    "  sales-orders: inManifest=true folderExists=true manifestBatchCount=310 manifestRecordCount=30989 " +
      "discoveredJsonFileCount=310 discoveredRecordCount=30989 manifestErrorCount=0 unreadableFileCount=0 " +
      "unrecognizedShapeFileCount=0"
  );
  console.log("ok: printSummary logs a correctly spaced sales-orders line (the actual CLI output path)");
}

// ── Full pipeline integration: readQuickBooksExport -> buildQuickBooksExportSummary ─
// -> printSummary, on a fake export folder, exercising the exact real CLI code path ─
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "fake-run-id",
    StartedAt: "2026-07-01T00:00:00Z",
    CompletedAt: "2026-07-01T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "sales-orders", BatchCount: 1, RecordCount: 2, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "sales-orders", "batch-001.json"), fakeBatchFile("sales-orders", 1, 2));

  const readResult = await readQuickBooksExport(dir);
  const summary = buildQuickBooksExportSummary(readResult);
  const printedLines = captureConsoleLog(() => printSummary(summary));

  const salesOrdersLine = printedLines.find((line) => line.includes("sales-orders:"));
  assert.ok(salesOrdersLine, "expected a sales-orders line from the real read+summary+print pipeline");
  assert.match(salesOrdersLine, /discoveredJsonFileCount=1 discoveredRecordCount=2/);
  assert.doesNotMatch(salesOrdersLine, /discoveredJsonFileCount=1discoveredRecordCount/);

  const fullOutput = printedLines.join("\n");
  assert.doesNotMatch(fullOutput, /FAKE-sales-orders/); // no raw record IDs ever printed
  console.log("ok: full read+summary+print pipeline produces a correctly spaced per-entity line");
}

console.log("\nAll previewQuickBooksExport formatting tests passed.");
