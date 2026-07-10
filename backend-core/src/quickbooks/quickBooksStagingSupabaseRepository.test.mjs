/**
 * quickBooksStagingSupabaseRepository — Phase 3B tests with a MOCKED Supabase client only.
 *
 * No real Supabase, no network, no credentials. All export data is fake; the mock records
 * calls so we can assert tables/counts/conflict keys and audit writes. raw_payload legitimately
 * appears in upsert payloads (the DB write); the PII assertions target the audit/control
 * surfaces (runs, updates, error/finding inserts, result) — never the upsert payloads.
 *
 * Run: node backend-core/src/quickbooks/quickBooksStagingSupabaseRepository.test.mjs
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { importQuickBooksStaging } from "./quickBooksStagingImport.js";
import { createQuickBooksStagingSupabaseRepository } from "./quickBooksStagingSupabaseRepository.js";
import { QB_STAGING_UNIQUE_KEYS } from "./quickBooksStaging.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ORG_ID = "00000000-0000-0000-0000-000000000abc";

// ── Mock Supabase client (records calls; models runs store for resume/finalize) ──
function createMockSupabase(opts = {}) {
  const failUpsertOnTable = opts.failUpsertOnTable ?? null;
  const state = {
    upserts: [], // { table, rows, onConflict }
    inserts: [], // { table, rows }  (qb_sync_errors / qb_data_quality_findings)
    updates: [], // { table, patch, filters }
    runs: new Map(), // id -> run row
    runsByChunkKey: new Map(), // "org|run|chunk" -> id
    tableRowKeys: new Map(), // table -> Set(conflictKey)
    upsertCallsByTable: new Map(),
  };
  let idSeq = 0;
  const chunkKey = (r) => `${r.organization_id}|${r.qb_run_id}|${r.chunk_index}`;

  function makeBuilder(table) {
    const q = { table, op: null, payload: null, onConflict: null, filters: {} };
    const exec = async () => {
      if (q.op === "insert") {
        if (table === "qb_sync_runs") {
          const row = Array.isArray(q.payload) ? q.payload[0] : q.payload;
          const id = `mock-run-${++idSeq}`;
          state.runs.set(id, { id, ...row });
          if (row.chunk_index !== null && row.chunk_index !== undefined) {
            state.runsByChunkKey.set(chunkKey(row), id);
          }
          return { data: { id }, error: null };
        }
        const rows = Array.isArray(q.payload) ? q.payload : [q.payload];
        state.inserts.push({ table, rows });
        return { data: null, error: null };
      }
      if (q.op === "upsert") {
        state.upsertCallsByTable.set(table, (state.upsertCallsByTable.get(table) ?? 0) + 1);
        if (failUpsertOnTable && table === failUpsertOnTable) {
          return { data: null, error: { code: "MOCKFAIL", message: "RAW_DB_UPSERT_ERROR should never leak" } };
        }
        const rows = Array.isArray(q.payload) ? q.payload : [q.payload];
        state.upserts.push({ table, rows, onConflict: q.onConflict });
        const cols = (q.onConflict ?? "").split(",").filter(Boolean);
        if (!state.tableRowKeys.has(table)) state.tableRowKeys.set(table, new Set());
        const set = state.tableRowKeys.get(table);
        for (const r of rows) set.add(cols.map((c) => `${c}=${r[c]}`).join("\u0000"));
        return { data: null, error: null };
      }
      if (q.op === "update") {
        state.updates.push({ table, patch: q.payload, filters: q.filters });
        if (table === "qb_sync_runs" && q.filters.id) {
          const run = state.runs.get(q.filters.id);
          if (run) Object.assign(run, q.payload);
        }
        return { data: null, error: null };
      }
      if (q.op === "select" && table === "qb_sync_runs") {
        const id = state.runsByChunkKey.get(`${q.filters.organization_id}|${q.filters.qb_run_id}|${q.filters.chunk_index}`) ?? null;
        return { data: id ? { id } : null, error: null };
      }
      return { data: null, error: null };
    };
    const b = {
      insert(rows) { q.op = "insert"; q.payload = rows; return b; },
      upsert(rows, options) { q.op = "upsert"; q.payload = rows; q.onConflict = options?.onConflict ?? null; return b; },
      update(patch) { q.op = "update"; q.payload = patch; return b; },
      select() { if (!q.op) q.op = "select"; return b; },
      eq(col, val) { q.filters[col] = val; return b; },
      maybeSingle() { return exec(); },
      single() { return exec(); },
      then(onF, onR) { return exec().then(onF, onR); },
    };
    return b;
  }

  return { client: { from: makeBuilder }, state };
}

// ── Fake export helpers ─────────────────────────────────────────────────────
async function makeTempExportFolder() {
  return fs.mkdtemp(path.join(os.tmpdir(), "qb-supa-test-"));
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
function fakeNestedLine(inv, ln) {
  return { "@elementName": "InvoiceLineRet", TxnLineID: `FAKE-LINE-${inv}-${ln}`, ItemRef: { ListID: `FAKE-ITEM-${inv}-${ln}` } };
}
function fakeInvoice(i, { linesPerInvoice = 2, ...overrides } = {}) {
  const invoice = { TxnID: `FAKE-INV-${i}`, EditSequence: String(200 + i), TxnDate: "2026-01-15", TimeModified: "2026-06-01T00:00:00", CustomerRef: { ListID: `FAKE-CUST-${i}` }, ...overrides };
  invoice.InvoiceLineRet = Array.from({ length: linesPerInvoice }, (_, j) => fakeNestedLine(i, j + 1));
  return invoice;
}
function fakeStandaloneLine(i) {
  return { "@elementName": "InvoiceLineRet", TxnLineID: `FAKE-STANDALONE-${i}`, ItemRef: { ListID: `FAKE-ITEM-${i}` } };
}
function fakeCompanyRecord(overrides = {}) {
  return { "@elementName": "CompanyRet", CompanyName: "FAKE_COMPANY", ...overrides };
}
async function writeCleanExport(dir, { customerCount = 2, invoiceCount = 2, linesPerInvoice = 2, company = fakeCompanyRecord() } = {}) {
  const derived = invoiceCount * linesPerInvoice;
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-130918-fake",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [
      { EntityType: "company", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "customers", BatchCount: 1, RecordCount: customerCount, Errors: [] },
      { EntityType: "invoices", BatchCount: 1, RecordCount: invoiceCount, Errors: [] },
    ],
    Errors: [],
  });
  await writeCompanyJson(dir, [company]);
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", Array.from({ length: customerCount }, (_, i) => fakeCustomer(i + 1))));
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", Array.from({ length: invoiceCount }, (_, i) => fakeInvoice(i + 1, { linesPerInvoice }))));
  await writeJson(path.join(dir, "invoice-lines", "batch-001.json"), fakeListBatch("invoice-lines", Array.from({ length: derived }, (_, i) => fakeStandaloneLine(i + 1))));
}

const repoFor = (mock) => createQuickBooksStagingSupabaseRepository({ getSupabase: () => mock.client });

// ── Test 1: clean import calls repo with expected tables/counts + conflict keys ─
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 3, invoiceCount: 2, linesPerInvoice: 2 });
  const mock = createMockSupabase();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repoFor(mock) });

  assert.equal(result.status, "success", `expected success, got ${result.status}: ${JSON.stringify(result.failReasons)}`);
  // Expected distinct rows per table.
  assert.equal(mock.state.tableRowKeys.get("brain_quickbooks_company")?.size, 1);
  assert.equal(mock.state.tableRowKeys.get("brain_quickbooks_customers")?.size, 3);
  assert.equal(mock.state.tableRowKeys.get("brain_quickbooks_invoices")?.size, 2);
  assert.equal(mock.state.tableRowKeys.get("brain_quickbooks_invoice_lines")?.size, 4);
  // A run was created and finalized success.
  assert.equal(mock.state.runs.size, 1);
  const run = [...mock.state.runs.values()][0];
  assert.equal(run.status, "success");
  assert.ok(run.finished_at, "run finalized with finished_at");
  assert.ok(run.updated_at, "run updated_at advanced on finalize");

  // Conflict keys used per table match QB_STAGING_UNIQUE_KEYS exactly.
  const onConflictByTable = {};
  for (const u of mock.state.upserts) onConflictByTable[u.table] = u.onConflict;
  assert.equal(onConflictByTable["brain_quickbooks_company"], QB_STAGING_UNIQUE_KEYS.company.join(","));
  assert.equal(onConflictByTable["brain_quickbooks_customers"], QB_STAGING_UNIQUE_KEYS.customers.join(","));
  assert.equal(onConflictByTable["brain_quickbooks_invoices"], QB_STAGING_UNIQUE_KEYS.invoices.join(","));
  assert.equal(onConflictByTable["brain_quickbooks_invoice_lines"], QB_STAGING_UNIQUE_KEYS["invoice-lines"].join(","));
  assert.equal(onConflictByTable["brain_quickbooks_invoice_lines"], "organization_id,qb_txn_id,line_seq_number");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: clean import upserts expected tables/counts with correct conflict keys; run finalized success");
}

// ── Test 2: every upsert stamps last_seen_at/updated_at; omits first_seen_at/created_at ─
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 1, invoiceCount: 1, linesPerInvoice: 1 });
  const mock = createMockSupabase();
  await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repoFor(mock) });

  for (const u of mock.state.upserts) {
    for (const row of u.rows) {
      assert.ok(row.last_seen_at, `${u.table} row stamped last_seen_at`);
      assert.ok(row.updated_at, `${u.table} row stamped updated_at`);
      assert.ok(!("first_seen_at" in row), `${u.table} row omits first_seen_at (DB default on insert)`);
      assert.ok(!("created_at" in row), `${u.table} row omits created_at (DB default on insert)`);
    }
  }
  console.log("ok: upsert payloads stamp last_seen_at/updated_at and omit insert-only timestamps");
}

// ── Test 3: chunk resume — createSyncRun upserts-or-returns-existing ─────────
{
  const mock = createMockSupabase();
  const repo = repoFor(mock);
  const chunkRun = { organization_id: FAKE_ORG_ID, source_system: "quickbooks", qb_run_id: "run-A", qb_xml_version: "16.0", mode: "manual-import", status: "running", import_group_id: "grp-1", chunk_index: 0, chunk_count: 3 };

  const first = await repo.createSyncRun(chunkRun);
  const second = await repo.createSyncRun(chunkRun); // same chunk -> resume existing
  assert.equal(first.id, second.id, "same chunk returns the existing run id");
  assert.equal(mock.state.runs.size, 1, "no duplicate run row for the same chunk");

  // A different chunk_index in the same group creates a new run.
  const third = await repo.createSyncRun({ ...chunkRun, chunk_index: 1 });
  assert.notEqual(third.id, first.id);
  assert.equal(mock.state.runs.size, 2);

  // Non-chunked runs always insert a fresh row (audit history).
  const mock2 = createMockSupabase();
  const repo2 = repoFor(mock2);
  const r1 = await repo2.createSyncRun({ organization_id: FAKE_ORG_ID, source_system: "quickbooks", qb_run_id: "run-B", qb_xml_version: null, mode: "manual-import", status: "running" });
  const r2 = await repo2.createSyncRun({ organization_id: FAKE_ORG_ID, source_system: "quickbooks", qb_run_id: "run-B", qb_xml_version: null, mode: "manual-import", status: "running" });
  assert.notEqual(r1.id, r2.id, "non-chunked runs are not deduped");
  assert.equal(mock2.state.runs.size, 2);
  console.log("ok: chunk resume returns existing run; new chunk/new non-chunked run inserts fresh");
}

// ── Test 4: an upsert failure finalizes the run failed with a safe message ───
{
  const dir = await makeTempExportFolder();
  await writeCleanExport(dir, { customerCount: 2, invoiceCount: 1, linesPerInvoice: 1 });
  const mock = createMockSupabase({ failUpsertOnTable: "brain_quickbooks_customers" });

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repoFor(mock) });

  assert.equal(result.status, "failed");
  assert.equal(result.ok, false);
  const run = [...mock.state.runs.values()][0];
  assert.equal(run.status, "failed", "run finalized failed");
  assert.ok(run.finished_at, "finished_at set on failed finalize");
  // Safe message only — the raw DB error text must never surface.
  assert.equal(run.error_message, "import aborted during write phase (MOCKFAIL)");
  assert.doesNotMatch(JSON.stringify({ result, runs: [...mock.state.runs.values()], updates: mock.state.updates }), /RAW_DB_UPSERT_ERROR/);

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: upsert failure finalizes run 'failed' with sanitized code-only message");
}

// ── Test 5: error + finding batch writes happen through insert ───────────────
{
  const dir = await makeTempExportFolder();
  // company declared but company.json missing -> a company error.
  // customers omit EditSequence -> missing_edit_sequence findings.
  await writeJson(path.join(dir, "manifest.json"), {
    RunId: "20260710-fake-audit",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: dir,
    Entities: [
      { EntityType: "company", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "customers", BatchCount: 1, RecordCount: 2, Errors: [] },
    ],
    Errors: [],
  });
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", [
    { ListID: "FAKE-CUST-1", IsActive: "true" },
    { ListID: "FAKE-CUST-2", IsActive: "true" },
  ]));
  const mock = createMockSupabase();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repoFor(mock) });

  const errorInserts = mock.state.inserts.filter((i) => i.table === "qb_sync_errors");
  const findingInserts = mock.state.inserts.filter((i) => i.table === "qb_data_quality_findings");
  assert.ok(errorInserts.length >= 1, "qb_sync_errors batch insert happened");
  assert.ok(errorInserts.some((i) => i.rows.some((r) => /company\.json missing/.test(r.message))), "company error recorded");
  assert.ok(findingInserts.length >= 1, "qb_data_quality_findings batch insert happened");
  assert.ok(findingInserts.some((i) => i.rows.some((r) => r.finding_type === "missing_edit_sequence")), "finding recorded");
  assert.equal(result.status, "partial");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: error + finding batch inserts happen through the Supabase repo");
}

// ── Test 6: no PII sentinel leaks into audit/control surfaces ────────────────
{
  const dir = await makeTempExportFolder();
  const piiCompany = fakeCompanyRecord({ CompanyName: "SENTINEL_PII_CO", Email: "SENTINEL_PII_EMAIL" });
  const piiCustomer = fakeCustomer(1, { FullName: "SENTINEL_PII_NAME", BillAddress: { Addr1: "SENTINEL_PII_ADDR" } });
  const piiInvoice = fakeInvoice(1, { linesPerInvoice: 1, RefNumber: "SENTINEL_PII_REF", Memo: "SENTINEL_PII_MEMO" });
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
  await writeJson(path.join(dir, "customers", "batch-001.json"), fakeListBatch("customers", [piiCustomer]));
  await writeJson(path.join(dir, "invoices", "batch-001.json"), fakeListBatch("invoices", [piiInvoice]));
  const mock = createMockSupabase();

  const result = await importQuickBooksStaging(dir, { organizationId: FAKE_ORG_ID, repository: repoFor(mock) });

  // Audit/control surfaces: runs, update patches, error/finding inserts, and the result.
  const auditBlob = JSON.stringify({
    result,
    runs: [...mock.state.runs.values()],
    updates: mock.state.updates,
    auditInserts: mock.state.inserts, // qb_sync_errors / qb_data_quality_findings only
  });
  assert.doesNotMatch(auditBlob, /SENTINEL_PII/, "no PII in runs/updates/audit inserts/result");
  // Sanity: the record body legitimately reaches the staging UPSERT payload (the DB write).
  assert.match(JSON.stringify(mock.state.upserts), /SENTINEL_PII_NAME/, "raw_payload carries the record to staging");

  await fs.rm(dir, { recursive: true, force: true });
  console.log("ok: no PII sentinels in runs/updates/audit inserts/result (only in staging upsert payloads)");
}

// ── Test 7: repo creates no client, reads no env, requires injection ─────────
{
  assert.throws(() => createQuickBooksStagingSupabaseRepository(), /getSupabase is required/);
  assert.throws(() => createQuickBooksStagingSupabaseRepository({}), /getSupabase is required/);

  const src = await fs.readFile(path.join(HERE, "quickBooksStagingSupabaseRepository.js"), "utf8");
  assert.doesNotMatch(src, /createClient\s*\(/, "repo must not create a Supabase client");
  assert.doesNotMatch(src, /(from|require\()\s*['"]@supabase/, "repo must not runtime-import @supabase (DI only)");
  assert.doesNotMatch(src, /process\.env/, "repo must not read env (no credentials)");
  console.log("ok: repo takes an injected client only — creates no client, reads no env (no VM creds)");
}

// ── Test 8 (B2): intra-chunk duplicate conflict keys are de-duped (last wins) ─
{
  const mock = createMockSupabase();
  const repo = repoFor(mock);
  const rows = [
    { organization_id: FAKE_ORG_ID, qb_list_id: "DUP", raw_payload: { v: "FIRST" } },
    { organization_id: FAKE_ORG_ID, qb_list_id: "DUP", raw_payload: { v: "LAST" } },
    { organization_id: FAKE_ORG_ID, qb_list_id: "OTHER", raw_payload: { v: "X" } },
  ];

  let res;
  await assert.doesNotReject(async () => {
    res = await repo.upsertRows("brain_quickbooks_customers", rows, ["organization_id", "qb_list_id"], []);
  });

  // total reflects the ORIGINAL attempted input rows, not the de-duped write count.
  assert.equal(res.total, 3);
  const upsert = mock.state.upserts.find((u) => u.table === "brain_quickbooks_customers");
  assert.equal(upsert.rows.length, 2, "duplicate conflict key collapsed; distinct key retained");
  const dup = upsert.rows.find((r) => r.qb_list_id === "DUP");
  assert.equal(dup.raw_payload.v, "LAST", "the last row wins for the duplicate conflict key");
  console.log("ok (B2): intra-chunk duplicate conflict keys de-duped (last wins); total reflects input");
}

console.log("\nAll quickBooksStagingSupabaseRepository tests passed.");
