/**
 * previewQuickBooksExport — CLI output formatting tests (fake fixture data only).
 * Run: node backend-core/src/scripts/previewQuickBooksExport.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
// Uses production-matching counts (312 files, 31127 records) from the
// 2026-07-10 full-materialized archive so the assertion covers the exact values
// that appeared fused in the real CLI output (terminal line-wrap artefact).
{
  const line = formatEntitySummaryLine("sales-orders", {
    inManifest: true,
    folderExists: true,
    manifestBatchCount: 312,
    manifestRecordCount: 31127,
    discoveredJsonFileCount: 312,
    discoveredRecordCount: 31127,
    manifestErrorCount: 0,
    unreadableFileCount: 0,
    unrecognizedShapeFileCount: 0,
    selfReportedOnlyFileCount: 0,
  });

  assert.equal(
    line,
    "  sales-orders: inManifest=true folderExists=true manifestBatchCount=312 manifestRecordCount=31127 " +
      "discoveredJsonFileCount=312 discoveredRecordCount=31127 manifestErrorCount=0 unreadableFileCount=0 " +
      "unrecognizedShapeFileCount=0 selfReportedOnlyFileCount=0"
  );
  // Specifically assert the space that appeared missing in the real terminal output.
  assert.match(line, /discoveredJsonFileCount=312 discoveredRecordCount=31127/);
  assert.doesNotMatch(line, /discoveredJsonFileCount=312discoveredRecordCount/);
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
    selfReportedOnlyFileCount: 0,
  });

  assert.doesNotMatch(line, /[a-zA-Z]+@[a-zA-Z]+\.[a-zA-Z]+/); // no email-shaped content
  assert.doesNotMatch(line, /\$\d/); // no dollar amounts
  assert.match(line, /^ {2}customers: (\w+=\S+ ?)+$/);
  console.log("ok: formatEntitySummaryLine output contains only safe key=value tokens");
}

// ── buildSummaryOutputLines: the sales-orders line in the real assembled output is correct ─
// (this is the single source of truth `printSummary` logs from — no separate inline
// template-literal path exists that could drift out of sync with formatEntitySummaryLine)
// Production-matching counts (312/31127) from the 2026-07-10 full-materialized archive.
{
  const fakeSummary = {
    exportFolderPath: "/fake/export/path",
    manifestValid: true,
    runId: "fake-run-id",
    qbXmlVersion: "16.0",
    startedAt: "2026-07-01T00:00:00Z",
    completedAt: "2026-07-01T01:00:00Z",
    totalEntityTypesInManifest: 1,
    totalManifestRecordCount: 31127,
    totalDiscoveredRecordCount: 31127,
    manifestTopLevelErrorCount: 0,
    perEntity: {
      "sales-orders": {
        inManifest: true,
        folderExists: true,
        manifestBatchCount: 312,
        manifestRecordCount: 31127,
        discoveredJsonFileCount: 312,
        discoveredRecordCount: 31127,
        manifestErrorCount: 0,
        unreadableFileCount: 0,
        unrecognizedShapeFileCount: 0,
        selfReportedOnlyFileCount: 0,
      },
    },
    missingFolders: [],
    unknownFolders: [],
    warnings: [],
  };

  const lines = buildSummaryOutputLines(fakeSummary);
  const salesOrdersLine = lines.find((line) => line.includes("sales-orders:"));
  assert.ok(salesOrdersLine, "expected a sales-orders line in the assembled output");
  assert.match(salesOrdersLine, /discoveredJsonFileCount=312 discoveredRecordCount=31127/);
  assert.doesNotMatch(salesOrdersLine, /discoveredJsonFileCount=312discoveredRecordCount/);
  console.log("ok: buildSummaryOutputLines assembles a correctly spaced sales-orders line");
}

// ── printSummary: the actual console.log output (what the real CLI prints) is correct ─
// Production-matching counts (312/31127) from the 2026-07-10 full-materialized archive.
// This is the authoritative test: it captures what console.log actually emits and
// asserts the exact string, including the space between discoveredJsonFileCount=312
// and discoveredRecordCount=31127 that appeared absent in the real terminal output.
{
  const fakeSummary = {
    exportFolderPath: "/fake/export/path",
    manifestValid: true,
    runId: "fake-run-id",
    qbXmlVersion: "16.0",
    startedAt: "2026-07-01T00:00:00Z",
    completedAt: "2026-07-01T01:00:00Z",
    totalEntityTypesInManifest: 1,
    totalManifestRecordCount: 31127,
    totalDiscoveredRecordCount: 31127,
    manifestTopLevelErrorCount: 0,
    perEntity: {
      "sales-orders": {
        inManifest: true,
        folderExists: true,
        manifestBatchCount: 312,
        manifestRecordCount: 31127,
        discoveredJsonFileCount: 312,
        discoveredRecordCount: 31127,
        manifestErrorCount: 0,
        unreadableFileCount: 0,
        unrecognizedShapeFileCount: 0,
        selfReportedOnlyFileCount: 0,
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
    "  sales-orders: inManifest=true folderExists=true manifestBatchCount=312 manifestRecordCount=31127 " +
      "discoveredJsonFileCount=312 discoveredRecordCount=31127 manifestErrorCount=0 unreadableFileCount=0 " +
      "unrecognizedShapeFileCount=0 selfReportedOnlyFileCount=0"
  );
  // Belt-and-suspenders: explicitly assert the space that appeared missing in real terminal output.
  assert.match(salesOrdersLine, /discoveredJsonFileCount=312 discoveredRecordCount=31127/);
  assert.doesNotMatch(salesOrdersLine, /discoveredJsonFileCount=312discoveredRecordCount/);
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

// ── CLI subprocess test: exercise the real entrypoint via child_process ───────
// Spawns the actual CLI script as a child process (not an imported function), so
// it proves the emitted stdout bytes — not just in-process string values — have
// the correct spacing.  Uses production-matching counts: 312 files / 31127 records
// (311 files × 100 records + 1 file × 27 records) for sales-orders only, so the
// assert covers exactly the token pair that appeared fused in the real CLI output.
{
  const testDir = await makeTempExportFolder();

  await writeJson(path.join(testDir, "manifest.json"), {
    RunId: "fake-subprocess-run",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: testDir,
    Entities: [{ EntityType: "sales-orders", BatchCount: 312, RecordCount: 31127, Errors: [] }],
    Errors: [],
  });

  // 311 batch files × 100 records + 1 batch file × 27 records = 312 files, 31127 records.
  for (let i = 1; i <= 311; i++) {
    const batchNum = String(i).padStart(3, "0");
    await writeJson(
      path.join(testDir, "sales-orders", `batch-${batchNum}.json`),
      fakeBatchFile("sales-orders", i, 100)
    );
  }
  await writeJson(
    path.join(testDir, "sales-orders", "batch-312.json"),
    fakeBatchFile("sales-orders", 312, 27)
  );

  const scriptPath = fileURLToPath(new URL("./previewQuickBooksExport.mjs", import.meta.url));
  const stdout = execFileSync(process.execPath, [scriptPath, testDir], { encoding: "utf8" });

  const salesOrdersLine = stdout.split("\n").find((line) => line.includes("sales-orders:"));
  assert.ok(salesOrdersLine, "expected CLI stdout to include a sales-orders: line");

  // The critical assertion: the emitted stdout byte sequence must contain a space
  // between discoveredJsonFileCount=312 and discoveredRecordCount=31127.
  assert.match(salesOrdersLine, /discoveredJsonFileCount=312 discoveredRecordCount=31127/);
  assert.doesNotMatch(salesOrdersLine, /discoveredJsonFileCount=312discoveredRecordCount/);

  // Safety: no raw record identifiers must appear in stdout.
  assert.doesNotMatch(stdout, /FAKE-sales-orders-\d/);

  await fs.rm(testDir, { recursive: true, force: true });
  console.log("ok: CLI subprocess stdout has correctly spaced sales-orders line with exact production counts (312/31127)");
}

console.log("\nAll previewQuickBooksExport formatting tests passed.");
