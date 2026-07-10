/**
 * importQuickBooksStaging (Phase 3C CLI) — tests with mocked env/injected repo only.
 *
 * No real Supabase, no network, no credentials. Uses dependency injection so the CLI logic
 * is exercised without constructing a Supabase client. Fake data only.
 *
 * Run: node backend-core/src/scripts/importQuickBooksStaging.test.mjs
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runImportCli, formatImportResultLines } from "./importQuickBooksStaging.mjs";
import { createInMemoryQuickBooksStagingRepository } from "../quickbooks/quickBooksStagingRepository.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ORG_ID = "00000000-0000-0000-0000-000000000abc";
const SECRET_SENTINEL = "SENTINEL_SERVICE_ROLE_SECRET";

async function makeTempExportFolder() {
  return fs.mkdtemp(path.join(os.tmpdir(), "qb-cli-test-"));
}
async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
async function writeCompanyJson(dir, records) {
  await writeJson(path.join(dir, "company.json"), { entityType: "company", recordCount: records.length, records });
}
function fakeListBatch(entityType, records) {
  return { entityType, batchNumber: 1, recordCount: records.length, records };
}
function fakeCustomer(i, overrides = {}) {
  return { ListID: `FAKE-CUST-${i}`, EditSequence: String(100 + i), TimeModified: "2026-01-01T00:00:00", IsActive: "true", ...overrides };
}
function fakeInvoice(i, { linesPerInvoice = 1, ...overrides } = {}) {
  const invoice = { TxnID: `FAKE-INV-${i}`, EditSequence: String(200 + i), TxnDate: "2026-01-15", TimeModified: "2026-06-01T00:00:00", CustomerRef: { ListID: `FAKE-CUST-${i}` }, ...overrides };
  invoice.InvoiceLineRet = Array.from({ length: linesPerInvoice }, (_, j) => ({ "@elementName": "InvoiceLineRet", TxnLineID: `FAKE-LINE-${i}-${j + 1}`, ItemRef: { ListID: `FAKE-ITEM-${i}-${j + 1}` } }));
  return invoice;
}
function fakeStandaloneLine(i) {
  return { "@elementName": "InvoiceLineRet", TxnLineID: `FAKE-STANDALONE-${i}`, ItemRef: { ListID: `FAKE-ITEM-${i}` } };
}

/** Env with all four required keys (fake values; service-role uses a detectable sentinel). */
function fakeEnv(dir, overrides = {}) {
  return {
    QB_IMPORT_ORGANIZATION_ID: FAKE_ORG_ID,
    QB_IMPORT_EXPORT_FOLDER: dir,
    SUPABASE_URL: "https://fake.supabase.local",
    SUPABASE_SERVICE_ROLE_KEY: SECRET_SENTINEL,
    ...overrides,
  };
}

// The in-memory fake stands in for the Supabase repository (Phase 3B is tested separately);
// this proves the CLI wiring: env -> repository -> orchestrator -> format -> exit code.
const injectInMemoryRepo = { createRepository: () => createInMemoryQuickBooksStagingRepository() };
const dummyGetSupabase = () => ({});

async function writeCleanExport(dir, { pii = false } = {}) {
  const company = pii ? { "@elementName": "CompanyRet", CompanyName: "SENTINEL_PII_CO" } : { "@elementName": "CompanyRet", CompanyName: "FAKE_CO" };
  const customer = pii ? fakeCustomer(1, { FullName: "SENTINEL_PII_NAME", BillAddress: { Addr1: "SENTINEL_PII_ADDR" } }) : fakeCustomer(1);
  const invoice = pii ? fakeInvoice(1, { linesPerInvoice: 2, Memo: "SENTINEL_PII_MEMO" }) : fakeInvoice(1, { linesPerInvoice: 2 });
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-130918-fake",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [
      { EntityType: "company", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "customers", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "invoices", BatchCount: 1, RecordCount: 1, Errors: [] },
    ],
    Errors: [],
  });
  await writeCompanyJson(dir, [company]);
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", [customer]));
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", [invoice]));
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeListBatch("invoice-lines", [fakeStandaloneLine(1), fakeStandaloneLine(2)]));
}

// ── Test 1: missing env fails safely (no throw, exit 1, no secret leak) ──────
{
  for (const key of ["QB_IMPORT_ORGANIZATION_ID", "QB_IMPORT_EXPORT_FOLDER", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const env = fakeEnv("/tmp/whatever");
    delete env[key];
    let out;
    await assert.doesNotReject(async () => {
      out = await runImportCli({ env, getSupabase: dummyGetSupabase, ...injectInMemoryRepo });
    });
    assert.equal(out.exitCode, 1, `missing ${key} must exit 1`);
    assert.ok(out.lines.some((l) => /Missing required env/.test(l) && l.includes(key)), `names ${key}`);
    assert.doesNotMatch(out.lines.join("\n"), new RegExp(SECRET_SENTINEL), "never print secret values");
  }
  // Fully empty env.
  const out = await runImportCli({ env: {}, getSupabase: dummyGetSupabase, ...injectInMemoryRepo });
  assert.equal(out.exitCode, 1);
  assert.equal(out.result, null);
  console.log("ok: missing env fails safely (exit 1, names only, no secret leak, no throw)");
}

// ── Test 2: clean import prints safe counts only; exit 0; no PII/secret leak ─
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { pii: true });
  const out = await runImportCli({ env: fakeEnv(dir), getSupabase: dummyGetSupabase, ...injectInMemoryRepo });

  assert.equal(out.exitCode, 0, `expected success; got: ${JSON.stringify(out.result?.failReasons)}`);
  assert.equal(out.result.status, "success");
  const text = out.lines.join("\n");
  assert.match(text, /Result: SUCCESS/);
  assert.match(text, /Total staging rows: 5/); // company1 + customers1 + invoices1 + derived lines2
  assert.match(text, /company: source=1 staged=1/);
  assert.match(text, /invoice-lines: source=2 staged=2 failed=0 .*\[derived-from-invoices\]/);
  // No PII, no secret anywhere in the printed output.
  assert.doesNotMatch(text, /SENTINEL_PII/, "no PII in CLI output");
  assert.doesNotMatch(text, new RegExp(SECRET_SENTINEL), "no service-role secret in CLI output");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: clean import prints safe counts only; exit 0; no PII/secret leak");
}

// ── Test 3: a failed import (gate fail) exits nonzero ────────────────────────
{
  const dir = await makeTempExportFolder();
  // manifest customers=5 but only 1 discovered -> count-mismatch gate -> status failed.
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-gate",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "customers", BatchCount: 1, RecordCount: 5, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", [fakeCustomer(1)]));

  const out = await runImportCli({ env: fakeEnv(dir), getSupabase: dummyGetSupabase, ...injectInMemoryRepo });
  assert.equal(out.exitCode, 1);
  assert.equal(out.result.status, "failed");
  assert.match(out.lines.join("\n"), /Result: FAILED/);

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: failed import exits nonzero (Result: FAILED)");
}

// ── Test 4: partial status also exits nonzero (injected result) ─────────────
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir);
  const out = await runImportCli({
    env: fakeEnv(dir),
    getSupabase: dummyGetSupabase,
    createRepository: () => createInMemoryQuickBooksStagingRepository(),
    importQuickBooksStaging: async () => ({ status: "partial", runId: "r", syncRunId: "s", perEntity: {}, totalStagingRows: 3, totalFailures: 1, warnings: [], failReasons: [], blockReasons: [] }),
  });
  assert.equal(out.exitCode, 1, "partial must exit nonzero");
  assert.match(out.lines.join("\n"), /Result: PARTIAL/);

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: partial status exits nonzero");
}

// ── Test 5: an unexpected orchestrator throw is caught safely ───────────────
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir);
  const boom = new Error("RAW_ORCHESTRATOR_ERROR should never leak");
  boom.code = "EBOOM";
  const out = await runImportCli({
    env: fakeEnv(dir),
    getSupabase: dummyGetSupabase,
    createRepository: () => createInMemoryQuickBooksStagingRepository(),
    importQuickBooksStaging: async () => { throw boom; },
  });
  assert.equal(out.exitCode, 1);
  assert.equal(out.result, null);
  assert.match(out.lines.join("\n"), /Import failed unexpectedly \(EBOOM\)/);
  assert.doesNotMatch(out.lines.join("\n"), /RAW_ORCHESTRATOR_ERROR/, "no raw error text leaks");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: unexpected orchestrator throw is caught; exit 1; no raw error text");
}

// ── Test 6: formatImportResultLines is safe (counts/ids/reasons only) ────────
{
  const lines = formatImportResultLines(
    { status: "success", runId: "rid", syncRunId: "sid", qbXmlVersion: "16.0", perEntity: { customers: { sourceRecordCount: 2, stagingRowCount: 2, failureCount: 0, inserted: 2, updated: 0 } }, warnings: [], failReasons: [], blockReasons: [], manifestTotal: 2, builtPrimaryTotal: 2, derivedInvoiceLineCount: 0, totalStagingRows: 2, totalFailures: 0 },
    { organizationId: FAKE_ORG_ID, exportFolderPath: "/fake/path" }
  );
  const text = lines.join("\n");
  assert.match(text, /Result: SUCCESS/);
  assert.match(text, /customers: source=2 staged=2 failed=0 inserted=2 updated=0/);
  assert.doesNotMatch(text, /raw_payload|SENTINEL/);
  console.log("ok: formatImportResultLines emits counts/ids/reasons only");
}

// ── Test 7: no connector/VM dependency; no static @supabase import ───────────
{
  const src = await fs.readFile(path.join(HERE, "importQuickBooksStaging.mjs"), "utf8");
  assert.doesNotMatch(src, /quickbooks-sdk-connector/, "no QuickBooks connector dependency");
  assert.doesNotMatch(src, /QB_COMPANY_FILE|QBXMLRP2|COMReference/, "no VM/connector env or COM references");
  // Static @supabase import is forbidden; the client is built via a lazy dynamic import in main().
  assert.doesNotMatch(src, /(^|\n)\s*import\s+[^\n]*['"]@supabase/, "no static @supabase import");
  assert.match(src, /await import\(["']@supabase\/supabase-js["']\)/, "client built via lazy dynamic import");
  console.log("ok: CLI has no connector/VM dependency and no static @supabase import");
}

console.log("\nAll importQuickBooksStaging CLI tests passed.");
