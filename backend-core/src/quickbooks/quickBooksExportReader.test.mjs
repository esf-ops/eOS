/**
 * quickBooksExportReader — unit tests (fake fixture data only, no real QuickBooks data).
 * Run: node backend-core/src/quickbooks/quickBooksExportReader.test.mjs
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  findNestedManifestFolders,
  KNOWN_ENTITY_FOLDERS,
  listExportSubfolders,
  readEntityBatchFiles,
  readManifest,
  readQuickBooksExport,
  REQUIRED_MANIFEST_FIELDS,
} from "./quickBooksExportReader.js";

async function makeTempExportFolder() {
  return fs.mkdtemp(path.join(os.tmpdir(), "qb-export-reader-test-"));
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
    Entities: [
      { EntityType: "customers", BatchCount: 2, RecordCount: 3, Errors: [] },
    ],
    Errors: [],
    ...overrides,
  };
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
    records: Array.from({ length: recordCount }, (_, i) => ({
      "@elementName": `${entityType}Ret`,
      ListID: `FAKE-${entityType}-${batchNumber}-${i}`,
    })),
  };
}

// ── REQUIRED_MANIFEST_FIELDS / KNOWN_ENTITY_FOLDERS shape ────────────────────
{
  assert.deepEqual(
    [...REQUIRED_MANIFEST_FIELDS].sort(),
    ["CompanyFile", "CompletedAt", "Entities", "ExportDirectory", "Errors", "QbXmlVersion", "RunId", "StartedAt"].sort()
  );
  assert.equal(KNOWN_ENTITY_FOLDERS.length, 14);
  assert.ok(KNOWN_ENTITY_FOLDERS.includes("invoice-lines"));
  console.log("ok: constant shapes");
}

// ── readManifest: valid manifest ──────────────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "manifest.json"), fakeManifest());

  const result = await readManifest(dir);
  assert.equal(result.valid, true);
  assert.equal(result.manifest.RunId, "20260701-165230-ab8fe650");
  assert.deepEqual(result.errors, []);
  console.log("ok: readManifest valid manifest");
}

// ── readManifest: missing manifest ────────────────────────────────────────────
{
  const dir = await makeTempExportFolder();

  const result = await readManifest(dir);
  assert.equal(result.valid, false);
  assert.equal(result.manifest, null);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /not found or unreadable/);
  console.log("ok: readManifest missing manifest");
}

// ── readManifest: invalid JSON ────────────────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await fs.writeFile(path.join(dir, "manifest.json"), "{ not valid json", "utf8");

  const result = await readManifest(dir);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /not valid JSON/);
  console.log("ok: readManifest invalid JSON");
}

// ── readManifest: missing required fields ─────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "manifest.json"), { RunId: "abc", Entities: [], Errors: [] });

  const result = await readManifest(dir);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /missing required fields/);
  assert.match(result.errors[0], /StartedAt/);
  console.log("ok: readManifest missing required fields");
}

// ── readEntityBatchFiles: folder exists with batch files ─────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeBatchFile("customers", 1, 2));
  await writeJson(path.join(dir, "customers", "batch-002.json"), fakeBatchFile("customers", 2, 1));

  const result = await readEntityBatchFiles(dir, "customers");
  assert.equal(result.exists, true);
  assert.equal(result.jsonFileCount, 2);
  assert.equal(result.recordCount, 3);
  assert.equal(result.unreadableFileCount, 0);
  console.log("ok: readEntityBatchFiles with data");
}

// ── readEntityBatchFiles: missing entity folder ───────────────────────────────
{
  const dir = await makeTempExportFolder();

  const result = await readEntityBatchFiles(dir, "vendors");
  assert.equal(result.exists, false);
  assert.equal(result.jsonFileCount, 0);
  assert.equal(result.recordCount, 0);
  console.log("ok: readEntityBatchFiles missing folder");
}

// ── readEntityBatchFiles: skips unreadable batch file without crashing ───────
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "items", "batch-001.json"), fakeBatchFile("items", 1, 4));
  await fs.mkdir(path.join(dir, "items"), { recursive: true });
  await fs.writeFile(path.join(dir, "items", "batch-002.json"), "{ broken", "utf8");

  const result = await readEntityBatchFiles(dir, "items");
  assert.equal(result.exists, true);
  assert.equal(result.jsonFileCount, 2);
  assert.equal(result.recordCount, 4);
  assert.equal(result.unreadableFileCount, 1);
  console.log("ok: readEntityBatchFiles tolerates unreadable batch file");
}

// ── listExportSubfolders: missing export folder returns [] ───────────────────
{
  const missingDir = path.join(os.tmpdir(), "qb-export-reader-test-does-not-exist");
  const folders = await listExportSubfolders(missingDir);
  assert.deepEqual(folders, []);
  console.log("ok: listExportSubfolders handles missing folder");
}

// ── findNestedManifestFolders ─────────────────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "manifest.json"), fakeManifest());
  await writeJson(path.join(dir, "weird-nested-copy", "manifest.json"), fakeManifest());
  await fs.mkdir(path.join(dir, "plain-extra-folder"), { recursive: true });

  const nested = await findNestedManifestFolders(dir, ["weird-nested-copy", "plain-extra-folder"]);
  assert.deepEqual(nested, ["weird-nested-copy"]);
  console.log("ok: findNestedManifestFolders detects nested manifest only");
}

// ── readQuickBooksExport: full valid export with an unknown extra folder ─────
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
  await fs.mkdir(path.join(dir, "some-unrelated-tool-output"), { recursive: true });

  const result = await readQuickBooksExport(dir);
  assert.equal(result.manifestResult.valid, true);
  assert.equal(result.entityFolders.customers.exists, true);
  assert.equal(result.entityFolders.customers.recordCount, 2);
  assert.equal(result.entityFolders.vendors.exists, false);
  assert.ok(result.unknownFolders.includes("some-unrelated-tool-output"));
  assert.deepEqual(result.nestedManifestFolders, []);
  console.log("ok: readQuickBooksExport full valid export, unknown folder ignored safely");
}

// ── readQuickBooksExport: nested/duplicated export folder detection ──────────
{
  const dir = await makeTempExportFolder();
  const exportName = path.basename(dir);
  await writeJson(path.join(dir, "manifest.json"), fakeManifest());
  await writeJson(path.join(dir, exportName, "manifest.json"), fakeManifest());

  const result = await readQuickBooksExport(dir);
  assert.ok(result.nestedManifestFolders.includes(exportName));
  console.log("ok: readQuickBooksExport detects nested/duplicated export folder");
}

// ── readManifest: tolerates real-world UTF-8 BOM (as written by .NET Encoding.UTF8) ─
{
  const dir = await makeTempExportFolder();
  const text = JSON.stringify(fakeManifest(), null, 2);
  const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
  await fs.writeFile(path.join(dir, "manifest.json"), Buffer.concat([utf8Bom, Buffer.from(text, "utf8")]));

  const result = await readManifest(dir);
  assert.equal(result.valid, true);
  assert.equal(result.manifest.RunId, "20260701-165230-ab8fe650");
  console.log("ok: readManifest tolerates UTF-8 BOM from .NET Encoding.UTF8 writer");
}

// ── readEntityBatchFiles: batch file using PascalCase "Records" shape ────────
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "vendors", "batch-001.json"), {
    EntityType: "vendors",
    BatchNumber: 1,
    Records: [{ ListID: "V-1" }, { ListID: "V-2" }, { ListID: "V-3" }],
  });

  const result = await readEntityBatchFiles(dir, "vendors");
  assert.equal(result.exists, true);
  assert.equal(result.recordCount, 3);
  assert.equal(result.unrecognizedShapeFileCount, 0);
  console.log("ok: readEntityBatchFiles recognizes PascalCase Records shape");
}

// ── readEntityBatchFiles: unknown batch shape counts as 0, flags warning, never crashes ─
{
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "classes", "batch-001.json"), {
    entityType: "classes",
    note: "no array of records in this file at all",
  });

  const result = await readEntityBatchFiles(dir, "classes");
  assert.equal(result.exists, true);
  assert.equal(result.recordCount, 0);
  assert.equal(result.unrecognizedShapeFileCount, 1);
  assert.equal(result.unreadableFileCount, 0);
  console.log("ok: readEntityBatchFiles handles unknown batch shape without crashing");
}

// ── readEntityBatchFiles: real connector shape — batch file is a JSON string ─
// containing a C# anonymous-object .ToString() (confirmed real archived export shape) ─
{
  const dir = await makeTempExportFolder();
  const csharpObjectString =
    '{ entityType = customers, batchNumber = 1, recordCount = 2, records = System.Collections.Generic.List`1[System.Collections.Generic.Dictionary`2[System.String,System.Object]] (Fake Customer LLC, $42000.55, memo: do not leak this) }';
  await writeJson(path.join(dir, "customers", "batch-001.json"), csharpObjectString);

  const result = await readEntityBatchFiles(dir, "customers");
  assert.equal(result.exists, true);
  assert.equal(result.jsonFileCount, 1);
  assert.equal(result.recordCount, 2);
  assert.equal(result.unreadableFileCount, 0);
  assert.equal(result.unrecognizedShapeFileCount, 0);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Fake Customer LLC/);
  assert.doesNotMatch(serialized, /42000\.55/);
  assert.doesNotMatch(serialized, /do not leak this/);
  console.log("ok: readEntityBatchFiles counts real C# anonymous-object string batch shape, no leaks");
}

console.log("\nAll quickBooksExportReader tests passed.");
