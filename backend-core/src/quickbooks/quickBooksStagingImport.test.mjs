/**
 * quickBooksStagingImport — Phase 3A import orchestrator tests (fake repo, fake data only).
 *
 * No real Supabase, no network, no service-role env. All export data is obviously fake;
 * no real QuickBooks names/addresses/amounts/memos appear. Table rows in the in-memory
 * repo legitimately hold raw_payload (that is the "database"); the PII test asserts no
 * sentinel leaks into the RESULT/RESPONSE/errors/findings/run metadata (the "output").
 *
 * Run: node backend-core/src/quickbooks/quickBooksStagingImport.test.mjs
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { importQuickBooksStaging, buildImportResponse } from "./quickBooksStagingImport.js";
import { createInMemoryQuickBooksStagingRepository } from "./quickBooksStagingRepository.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(HERE, "../scripts");
const FAKE_ORG_ID = "00000000-0000-0000-0000-000000000abc";

async function makeTempExportFolder() {
  return fs.mkdtemp(path.join(os.tmpdir(), "qb-import-test-"));
}
async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
async function writeCompanyJson(dir, records) {
  await writeJson(path.join(dir, "company.json"), { entityType: "company", recordCount: records.length, records });
}
function fakeListBatch(entityType, batchNumber, records) {
  return { entityType, batchNumber, recordCount: records.length, records };
}
function fakeCustomer(i, overrides = {}) {
  return { ListID: `FAKE-CUST-${i}`, EditSequence: String(100 + i), TimeModified: "2026-01-01T00:00:00", IsActive: "true", ...overrides };
}
function fakeNestedLine(invoiceI, lineI) {
  return { "@elementName": "InvoiceLineRet", TxnLineID: `FAKE-LINE-${invoiceI}-${lineI}`, ItemRef: { ListID: `FAKE-ITEM-${invoiceI}-${lineI}` } };
}
function fakeInvoice(i, { linesPerInvoice = 2, ...overrides } = {}) {
  const invoice = { TxnID: `FAKE-INV-${i}`, EditSequence: String(200 + i), TxnDate: "2026-01-15", TimeModified: "2026-06-01T00:00:00", CustomerRef: { ListID: `FAKE-CUST-${i}` }, ...overrides };
  invoice.InvoiceLineRet = linesPerInvoice === 1 ? fakeNestedLine(i, 1) : Array.from({ length: linesPerInvoice }, (_, j) => fakeNestedLine(i, j + 1));
  return invoice;
}
function fakeStandaloneLine(i) {
  return { "@elementName": "InvoiceLineRet", TxnLineID: `FAKE-STANDALONE-${i}`, ItemRef: { ListID: `FAKE-ITEM-${i}` } };
}
function fakeCompanyRecord(overrides = {}) {
  return { "@elementName": "CompanyRet", CompanyName: "FAKE_COMPANY", ...overrides };
}

/** company(1) + customers(N) + invoices(M x linesPerInvoice) + matching standalone folder. */
async function writeCleanExport(dir, { customerCount = 3, invoiceCount = 2, linesPerInvoice = 2, company = fakeCompanyRecord() } = {}) {
  const derivedLineTotal = invoiceCount * linesPerInvoice;
  const entities = [
    { EntityType: "company", BatchCount: 1, RecordCount: 1, Errors: [] },
    { EntityType: "customers", BatchCount: 1, RecordCount: customerCount, Errors: [] },
    { EntityType: "invoices", BatchCount: 1, RecordCount: invoiceCount, Errors: [] },
  ];
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-130918-fake",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: entities,
    Errors: [],
  });
  await writeCompanyJson(dir, [company]);
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", 1, Array.from({ length: customerCount }, (_, i) => fakeCustomer(i + 1))));
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, Array.from({ length: invoiceCount }, (_, i) => fakeInvoice(i + 1, { linesPerInvoice }))));
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeListBatch("invoice-lines", 1, Array.from({ length: derivedLineTotal }, (_, i) => fakeStandaloneLine(i + 1))));
}

// ── Test 1: clean import writes the expected rows to the fake repo ───────────
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 3, invoiceCount: 2, linesPerInvoice: 2 });
  const repo = createInMemoryQuickBooksStagingRepository();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });

  assert.equal(result.status, "success");
  assert.equal(result.ok, true);
  assert.equal(repo.getTableCount("brain_quickbooks_company"), 1);
  assert.equal(repo.getTableCount("brain_quickbooks_customers"), 3);
  assert.equal(repo.getTableCount("brain_quickbooks_invoices"), 2);
  assert.equal(repo.getTableCount("brain_quickbooks_invoice_lines"), 4);
  assert.equal(result.manifestTotal, 6);
  assert.equal(result.builtPrimaryTotal, 6);
  assert.equal(result.derivedInvoiceLineCount, 4);
  assert.equal(result.totalStagingRows, 10);
  assert.equal(result.totalFailures, 0);
  // Audit run recorded as success.
  const runs = repo.getRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "success");
  assert.equal(runs[0].qb_run_id, "20260710-130918-fake");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: clean import writes expected rows to fake repo; run status=success");
}

// ── Test 2: repeated import is idempotent by conflict key ───────────────────
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 3, invoiceCount: 2, linesPerInvoice: 2 });
  const repo = createInMemoryQuickBooksStagingRepository();

  const first = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });
  const firstCustomers = repo.getTableCount("brain_quickbooks_customers");
  const firstLines = repo.getTableCount("brain_quickbooks_invoice_lines");

  const second = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });

  // Row counts unchanged (upsert on conflict key, not duplicate insert).
  assert.equal(repo.getTableCount("brain_quickbooks_customers"), firstCustomers);
  assert.equal(repo.getTableCount("brain_quickbooks_invoice_lines"), firstLines);
  assert.equal(repo.getTableCount("brain_quickbooks_company"), 1);
  // First run inserts, second run updates.
  assert.equal(first.perEntity.customers.inserted, 3);
  assert.equal(first.perEntity.customers.updated, 0);
  assert.equal(second.perEntity.customers.inserted, 0);
  assert.equal(second.perEntity.customers.updated, 3);
  assert.equal(second.perEntity["invoice-lines"].inserted, 0);
  assert.equal(second.perEntity["invoice-lines"].updated, 4);
  assert.equal(second.status, "success");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: repeated import is idempotent by conflict key (updates, not duplicate inserts)");
}

// ── Test 3: failures abort BEFORE any writes when a gate fails ───────────────
{
  const dir = await makeTempExportFolder();
  // Manifest customers RecordCount 5 but only 2 discovered -> count-mismatch gate.
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-gatefail",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "customers", BatchCount: 1, RecordCount: 5, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", 1, [fakeCustomer(1), fakeCustomer(2)]));
  const repo = createInMemoryQuickBooksStagingRepository();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });

  assert.equal(result.status, "failed");
  assert.equal(result.ok, false);
  assert.ok(result.blockReasons.length > 0);
  assert.equal(result.syncRunId, null, "no run opened on gate failure");
  // Zero repository interaction: no runs, no tables.
  assert.equal(repo.getRuns().length, 0);
  assert.equal(repo.getTableNames().length, 0);
  assert.equal(repo.getErrors().length, 0);

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: gate failure aborts before any repository writes (no run, no tables)");
}

// ── Test 4: per-record malformed data is isolated safely ────────────────────
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
  const repo = createInMemoryQuickBooksStagingRepository();

  let result;
  await assert.doesNotReject(async () => {
    result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });
  });

  assert.equal(repo.getTableCount("brain_quickbooks_customers"), 2, "two valid rows written");
  assert.equal(result.perEntity.customers.stagingRowCount, 2);
  assert.equal(result.perEntity.customers.failureCount, 2);
  assert.equal(result.status, "partial");
  assert.equal(result.ok, false);
  // Safe error rows recorded, run finalized partial.
  assert.ok(repo.getErrors().length >= 2);
  assert.equal(repo.getRuns()[0].status, "partial");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: per-record malformed data isolated to failures; valid rows still written (partial)");
}

// ── Test 5: invoice-lines are derived from invoices (standalone folder ignored) ─
{
  const dir = await makeTempExportFolder();
  // Invoices: 2 with 3 lines, 1 with 1 line = 7 derived lines. Standalone folder = 7 (match).
  const invoices = [fakeInvoice(1, { linesPerInvoice: 3 }), fakeInvoice(2, { linesPerInvoice: 3 }), fakeInvoice(3, { linesPerInvoice: 1 })];
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-derive",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "invoices", BatchCount: 1, RecordCount: 3, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, invoices));
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeListBatch("invoice-lines", 1, Array.from({ length: 7 }, (_, i) => fakeStandaloneLine(i + 1))));
  const repo = createInMemoryQuickBooksStagingRepository();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });

  assert.equal(result.perEntity["invoice-lines"].source, "derived-from-invoices");
  assert.equal(repo.getTableCount("brain_quickbooks_invoice_lines"), 7);
  assert.equal(result.perEntity["invoice-lines"].stagingRowCount, 7);
  assert.equal(result.perEntity["invoice-lines"].standaloneFolderCount, 7);
  // Derived line rows carry parent qb_txn_id + a non-null line_seq_number.
  const lineRows = repo.getTableRows("brain_quickbooks_invoice_lines");
  assert.ok(lineRows.every((r) => typeof r.qb_txn_id === "string" && Number.isInteger(r.line_seq_number)));
  assert.equal(result.status, "success");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: invoice-lines derived from invoices; standalone folder is cross-check only");
}

// ── Test 6: company is imported ─────────────────────────────────────────────
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 1, invoiceCount: 1, linesPerInvoice: 1 });
  const repo = createInMemoryQuickBooksStagingRepository();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });

  assert.equal(repo.getTableCount("brain_quickbooks_company"), 1);
  assert.equal(result.perEntity.company.stagingRowCount, 1);
  assert.equal(result.perEntity.company.failureCount, 0);
  const companyRow = repo.getTableRows("brain_quickbooks_company")[0];
  assert.equal(companyRow.organization_id, FAKE_ORG_ID);
  assert.equal(companyRow.qb_xml_version, "16.0", "company qb_xml_version sourced from ctx");
  assert.equal(result.status, "success");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: company imported from root company.json with qb_xml_version from ctx");
}

// ── Test 7: audit/run status — success vs partial vs none ───────────────────
{
  // success covered in Test 1; partial in Test 4; failed-gate (no run) in Test 3.
  // Here assert a missing company file (declared in manifest) yields partial + a company error.
  const dir = await makeTempExportFolder();
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-nocompany",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [
      { EntityType: "company", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "customers", BatchCount: 1, RecordCount: 1, Errors: [] },
    ],
    Errors: [],
  });
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", 1, [fakeCustomer(1)]));
  // no company.json
  const repo = createInMemoryQuickBooksStagingRepository();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });

  assert.equal(result.status, "partial");
  assert.equal(result.perEntity.company.failureCount, 1);
  assert.equal(repo.getTableCount("brain_quickbooks_customers"), 1, "other entities still imported");
  assert.equal(repo.getRuns()[0].status, "partial");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: audit run status reflects partial when a declared entity fails to build");
}

// ── Test 8: no PII sentinels leak into result/response/errors/findings/run ──
{
  const dir = await makeTempExportFolder();
  const piiCompany = fakeCompanyRecord({ CompanyName: "SENTINEL_PII_CO", Email: "SENTINEL_PII_EMAIL" });
  const piiCustomer = fakeCustomer(1, { FullName: "SENTINEL_PII_NAME", BillAddress: { Addr1: "SENTINEL_PII_ADDR" } });
  const piiInvoice = fakeInvoice(1, { linesPerInvoice: 2, RefNumber: "SENTINEL_PII_REF", Memo: "SENTINEL_PII_MEMO" });
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-pii",
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
  await writeCompanyJson(dir, [piiCompany]);
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", 1, [piiCustomer]));
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, [piiInvoice]));
  const repo = createInMemoryQuickBooksStagingRepository();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });
  const response = buildImportResponse(result);

  // The RESULT and RESPONSE (what a caller logs/returns) must never carry PII.
  assert.doesNotMatch(JSON.stringify(result), /SENTINEL_PII/, "result must not contain PII");
  assert.doesNotMatch(JSON.stringify(response), /SENTINEL_PII/, "response must not contain PII");
  // Audit errors/findings/run metadata (operator-visible) must never carry PII.
  assert.doesNotMatch(JSON.stringify(repo.getErrors()), /SENTINEL_PII/, "error rows must not contain PII");
  assert.doesNotMatch(JSON.stringify(repo.getFindings()), /SENTINEL_PII/, "finding rows must not contain PII");
  assert.doesNotMatch(JSON.stringify(repo.getRuns()), /SENTINEL_PII/, "run metadata must not contain PII");
  // Sanity: the staged data (the "DB") legitimately holds the record body.
  assert.match(JSON.stringify(repo.getTableRows("brain_quickbooks_customers")), /SENTINEL_PII_NAME/, "raw_payload preserves the record in staging");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: no PII sentinels leak into result/response/errors/findings/run metadata");
}

// ── Test 9: buildImportResponse status codes ────────────────────────────────
{
  assert.equal(buildImportResponse({ status: "success" }).statusCode, 200);
  assert.equal(buildImportResponse({ status: "partial" }).statusCode, 207);
  assert.equal(buildImportResponse({ status: "failed" }).statusCode, 422);
  const body = buildImportResponse({ status: "success", runId: "r", syncRunId: "s", totalStagingRows: 5, perEntity: {} }).body;
  assert.equal(body.result, "success");
  assert.equal(body.totalStagingRows, 5);
  console.log("ok: buildImportResponse maps status -> HTTP-style code with safe body");
}

// ── Test 10: no Supabase client / network dependency in the import path ──────
{
  const filesToScan = [
    path.join(HERE, "quickBooksStagingImport.js"),
    path.join(HERE, "quickBooksStagingRepository.js"),
    path.join(HERE, "quickBooksStaging.js"),
    path.join(HERE, "quickBooksExportReader.js"),
    path.join(HERE, "quickBooksExportSummary.js"),
    path.join(HERE, "quickBooksJsonFileReader.js"),
    path.join(HERE, "quickBooksExportValidation.js"),
    path.join(SCRIPTS_DIR, "dryRunQuickBooksStagingImport.mjs"),
  ];
  for (const file of filesToScan) {
    const src = await fs.readFile(file, "utf8");
    // Import/usage-oriented (does not flag documentation prose mentioning Supabase).
    assert.doesNotMatch(src, /(from|require\()\s*['"]@supabase|createClient\s*\(/i, `${path.basename(file)} must not import/use the Supabase client`);
    assert.doesNotMatch(src, /(from|require\()\s*['"]node:https?['"]|require\(['"]https?['"]\)/i, `${path.basename(file)} must not import http/https`);
    assert.doesNotMatch(src, /process\.env\.[A-Z_]*SERVICE_ROLE/i, `${path.basename(file)} must not read service-role env`);
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${path.basename(file)} must not call fetch()`);
  }
  console.log("ok: import path uses no Supabase client, no http/https, no service-role env, no fetch()");
}

// ── Test 11 (F1): a write-phase throw finalizes the run "failed", never stuck "running" ─
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 2, invoiceCount: 1, linesPerInvoice: 1 });
  const base = createInMemoryQuickBooksStagingRepository();
  let calls = 0;
  // Throw on the 2nd upsert call (company is call 1, customers is call 2).
  const throwingRepo = {
    ...base,
    upsertRows: async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error("simulated db failure");
      return base.upsertRows(...args);
    },
  };

  let result;
  await assert.doesNotReject(async () => {
    result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: throwingRepo });
  }, "import must not throw; it finalizes the run failed and returns a failed result");

  assert.equal(result.status, "failed");
  assert.equal(result.ok, false);
  assert.ok(result.syncRunId, "the opened run id is returned");
  assert.ok(result.failReasons.some((r) => /aborted during write phase/.test(r)));
  // The run row must be finalized "failed" (not left "running") with finished_at set.
  const run = base.getRuns()[0];
  assert.equal(run.status, "failed");
  assert.ok(run.finished_at, "finished_at set on failed finalize");
  // Safe message only — no PII/record content (there is none here, but assert shape).
  assert.doesNotMatch(JSON.stringify(base.getRuns()), /simulated db failure/, "raw error message not stored verbatim");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok (F1): write-phase throw finalizes run 'failed' with safe message, no throw to caller");
}

// ── Test 12 (F3): derived invoice-line upserts are chunked ACROSS invoices ───
{
  const dir = await makeTempExportFolder();
  // 10 invoices x 1 line = 10 derived lines; chunkSize 4 -> ceil(10/4)=3 line upsert calls,
  // NOT 10 (which is what per-invoice upserting would produce).
  const invoices = Array.from({ length: 10 }, (_, i) => fakeInvoice(i + 1, { linesPerInvoice: 1 }));
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-chunk",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [{ EntityType: "invoices", BatchCount: 1, RecordCount: 10, Errors: [] }],
    Errors: [],
  });
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", 1, invoices));
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeListBatch("invoice-lines", 1, Array.from({ length: 10 }, (_, i) => fakeStandaloneLine(i + 1))));
  const repo = createInMemoryQuickBooksStagingRepository();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo, chunkSize: 4 });

  assert.equal(repo.getTableCount("brain_quickbooks_invoice_lines"), 10, "all 10 derived lines staged");
  assert.equal(repo.getUpsertCallCount("brain_quickbooks_invoice_lines"), 3, "chunked across invoices (3 calls), not once per invoice (10)");
  assert.equal(result.status, "success");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok (F3): derived invoice-line upserts are batched across invoices into chunkSize chunks");
}

// ── Test 13 (F4): chunk/resume metadata flows into the audit run ────────────
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 1, invoiceCount: 1, linesPerInvoice: 1 });
  const repo = createInMemoryQuickBooksStagingRepository();

  await importQuickBooksStaging(dir, {
    organizationId: FAKE_ORG_ID,
    repository: repo,
    importGroupId: "group-xyz",
    chunkIndex: 2,
    chunkCount: 5,
  });

  const run = repo.getRuns()[0];
  assert.equal(run.import_group_id, "group-xyz");
  assert.equal(run.chunk_index, 2);
  assert.equal(run.chunk_count, 5);
  console.log("ok (F4): import options importGroupId/chunkIndex/chunkCount recorded on the run");
}

// ── Test 14 (F5): repeated import advances last_seen_at/updated_at in staging ─
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 1, invoiceCount: 1, linesPerInvoice: 1 });
  const repo = createInMemoryQuickBooksStagingRepository();

  await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });
  const firstRow = { ...repo.getTableRows("brain_quickbooks_customers")[0] };

  await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repo });
  const secondRow = repo.getTableRows("brain_quickbooks_customers")[0];

  assert.equal(repo.getTableCount("brain_quickbooks_customers"), 1, "still one row after re-import");
  assert.equal(secondRow.first_seen_at, firstRow.first_seen_at, "first_seen_at preserved across re-import");
  assert.ok(secondRow.last_seen_at > firstRow.last_seen_at, "last_seen_at advances on re-import");
  assert.ok(secondRow.updated_at > firstRow.updated_at, "updated_at advances on re-import");
  // Finalized run also carries finished_at.
  assert.ok(repo.getRuns().every((r) => r.finished_at), "each run finalized with finished_at");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok (F5): repeated import advances last_seen_at/updated_at; first_seen_at preserved");
}

console.log("\nAll quickBooksStagingImport tests passed.");
