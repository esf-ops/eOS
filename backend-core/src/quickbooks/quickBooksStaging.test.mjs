/**
 * quickBooksStaging — Phase 2 staging row builder tests.
 *
 * All test data is fake / placeholder.  No real QuickBooks customer names,
 * vendor names, addresses, invoice numbers, dollar amounts, or any other PII
 * appears anywhere in this file.
 *
 * Run: node backend-core/src/quickbooks/quickBooksStaging.test.mjs
 */

import assert from "node:assert/strict";

import {
  buildStagingBatch,
  buildStagingRow,
  classifyQbEntityKind,
  detectEditSequenceChange,
  extractInvoiceLineFields,
  extractListEntityFields,
  extractTxnEntityFields,
  getStagingUpsertConfig,
  parseQbBoolean,
  parseQbDate,
  parseQbTimestamp,
  QB_LIST_ENTITY_FOLDERS,
  QB_TXN_ENTITY_FOLDERS,
  STAGING_TABLE_BY_FOLDER,
} from "./quickBooksStaging.js";

// ── Fake QB record factories ───────────────────────────────────────────────
// Field values are obviously fake/opaque identifiers.  No real customer data.

function fakeListRecord(overrides = {}) {
  return {
    ListID:        "FAKE-LIST-001",
    TimeCreated:   "2020-01-01T00:00:00",
    TimeModified:  "2026-01-01T00:00:00",
    EditSequence:  "100",
    IsActive:      "true",
    // FullName, Name, and all other PII fields intentionally omitted --
    // they would be present in real records but live in raw_payload only.
    ...overrides,
  };
}

function fakeTxnRecord(overrides = {}) {
  return {
    TxnID:         "FAKE-TXN-001",
    TimeCreated:   "2026-01-15T00:00:00",
    TimeModified:  "2026-06-01T00:00:00",
    EditSequence:  "200",
    TxnDate:       "2026-01-15",
    CustomerRef:   { ListID: "FAKE-LIST-CUST-001" },
    ...overrides,
  };
}

function fakeInvoiceLineRecord(overrides = {}) {
  return {
    TxnLineID:   "FAKE-LINE-001",
    ItemRef:     { ListID: "FAKE-LIST-ITEM-001" },
    _lineType:   "InvoiceLineRet",
    ...overrides,
  };
}

const FAKE_ORG_ID   = "00000000-0000-0000-0000-000000000001";
const FAKE_RUN_ID   = "00000000-0000-0000-0000-000000000002";
const FAKE_CTX      = { organizationId: FAKE_ORG_ID, syncRunId: FAKE_RUN_ID };

// ── parseQbBoolean ─────────────────────────────────────────────────────────

assert.equal(parseQbBoolean("true"),  true,  "string 'true' -> true");
assert.equal(parseQbBoolean("false"), false, "string 'false' -> false");
assert.equal(parseQbBoolean(true),    true,  "boolean true -> true");
assert.equal(parseQbBoolean(false),   false, "boolean false -> false");
assert.equal(parseQbBoolean(null),    null,  "null -> null");
assert.equal(parseQbBoolean("yes"),   null,  "unexpected string -> null");
console.log("ok: parseQbBoolean handles QB boolean string conventions");

// ── parseQbDate ────────────────────────────────────────────────────────────

assert.equal(parseQbDate("2026-01-15"),    "2026-01-15", "YYYY-MM-DD accepted");
assert.equal(parseQbDate("2026-1-15"),     null,         "non-padded rejected");
assert.equal(parseQbDate("2026-01-15T00"), null,         "timestamp rejected for date parser");
assert.equal(parseQbDate(null),            null,         "null -> null");
assert.equal(parseQbDate(20260115),        null,         "number -> null");
console.log("ok: parseQbDate accepts only YYYY-MM-DD");

// ── parseQbTimestamp ───────────────────────────────────────────────────────

assert.equal(parseQbTimestamp("2026-01-15T00:00:00"),   "2026-01-15T00:00:00", "ISO timestamp accepted");
assert.equal(parseQbTimestamp("2026-01-15T00:00:00Z"),  "2026-01-15T00:00:00Z", "Z suffix accepted");
assert.equal(parseQbTimestamp("2026-01-15"),            null, "date-only rejected for timestamp parser");
assert.equal(parseQbTimestamp(null),                    null, "null -> null");
console.log("ok: parseQbTimestamp accepts ISO 8601 timestamps only");

// ── classifyQbEntityKind ───────────────────────────────────────────────────

assert.equal(classifyQbEntityKind("company"),          "company");
assert.equal(classifyQbEntityKind("customers"),        "list");
assert.equal(classifyQbEntityKind("items"),            "list");
assert.equal(classifyQbEntityKind("vendors"),          "list");
assert.equal(classifyQbEntityKind("accounts"),         "list");
assert.equal(classifyQbEntityKind("classes"),          "list");
assert.equal(classifyQbEntityKind("sales-reps"),       "list");
assert.equal(classifyQbEntityKind("terms"),            "list");
assert.equal(classifyQbEntityKind("invoices"),         "transaction");
assert.equal(classifyQbEntityKind("payments"),         "transaction");
assert.equal(classifyQbEntityKind("bills"),            "transaction");
assert.equal(classifyQbEntityKind("purchase-orders"),  "transaction");
assert.equal(classifyQbEntityKind("estimates"),        "transaction");
assert.equal(classifyQbEntityKind("sales-orders"),     "transaction");
assert.equal(classifyQbEntityKind("invoice-lines"),    "invoice-lines");
assert.equal(classifyQbEntityKind("unknown-entity"),   "unknown");
console.log("ok: classifyQbEntityKind covers all 15 known entity folders");

// Every folder listed in QB_LIST_ENTITY_FOLDERS must map to 'list'.
for (const folder of QB_LIST_ENTITY_FOLDERS) {
  assert.equal(classifyQbEntityKind(folder), "list", `${folder} must be 'list'`);
}
// Every folder in QB_TXN_ENTITY_FOLDERS must map to 'transaction'.
for (const folder of QB_TXN_ENTITY_FOLDERS) {
  assert.equal(classifyQbEntityKind(folder), "transaction", `${folder} must be 'transaction'`);
}
console.log("ok: all QB_LIST_ENTITY_FOLDERS map to 'list'; all QB_TXN_ENTITY_FOLDERS map to 'transaction'");

// ── STAGING_TABLE_BY_FOLDER ────────────────────────────────────────────────

{
  const expectedTables = [
    ["company",          "brain_quickbooks_company"],
    ["customers",        "brain_quickbooks_customers"],
    ["items",            "brain_quickbooks_items"],
    ["vendors",          "brain_quickbooks_vendors"],
    ["accounts",         "brain_quickbooks_accounts"],
    ["classes",          "brain_quickbooks_classes"],
    ["sales-reps",       "brain_quickbooks_sales_reps"],
    ["terms",            "brain_quickbooks_terms"],
    ["invoices",         "brain_quickbooks_invoices"],
    ["invoice-lines",    "brain_quickbooks_invoice_lines"],
    ["payments",         "brain_quickbooks_payments"],
    ["bills",            "brain_quickbooks_bills"],
    ["purchase-orders",  "brain_quickbooks_purchase_orders"],
    ["estimates",        "brain_quickbooks_estimates"],
    ["sales-orders",     "brain_quickbooks_sales_orders"],
  ];
  for (const [folder, expectedTable] of expectedTables) {
    assert.equal(STAGING_TABLE_BY_FOLDER[folder], expectedTable, `${folder} -> ${expectedTable}`);
  }
  console.log("ok: STAGING_TABLE_BY_FOLDER maps all 15 folders to correct table names");
}

// ── extractListEntityFields ────────────────────────────────────────────────

{
  const result = extractListEntityFields(fakeListRecord());
  assert.ok(result.valid);
  assert.equal(result.qb_list_id,       "FAKE-LIST-001");
  assert.equal(result.qb_edit_sequence, "100");
  assert.equal(result.time_created,     "2020-01-01T00:00:00");
  assert.equal(result.time_modified,    "2026-01-01T00:00:00");
  assert.equal(result.is_active,        true);
  console.log("ok: extractListEntityFields extracts safe fields from a valid list record");
}

{
  // Record with missing ListID returns invalid result with a safe reason string.
  const result = extractListEntityFields({ EditSequence: "1" });
  assert.ok(!result.valid);
  assert.ok(typeof result.reason === "string" && result.reason.length > 0);
  // Reason must not contain record content (there's nothing to leak here, but verify shape).
  assert.doesNotMatch(result.reason, /FAKE|real|customer|name|address/i);
  console.log("ok: extractListEntityFields rejects record with missing ListID, safe reason only");
}

{
  // Non-object input.
  assert.ok(!extractListEntityFields(null).valid);
  assert.ok(!extractListEntityFields("string").valid);
  assert.ok(!extractListEntityFields(42).valid);
  console.log("ok: extractListEntityFields rejects non-object inputs");
}

{
  // term_type is extracted when opts.termType is supplied.
  const result = extractListEntityFields(fakeListRecord(), { termType: "date-driven" });
  assert.ok(result.valid);
  assert.equal(result.term_type, "date-driven");
  console.log("ok: extractListEntityFields includes term_type when supplied");
}

{
  // item_type is extracted when supplied.
  const result = extractListEntityFields(fakeListRecord(), { itemType: "ItemInventoryRet" });
  assert.ok(result.valid);
  assert.equal(result.item_type, "ItemInventoryRet");
  console.log("ok: extractListEntityFields includes item_type when supplied");
}

{
  // account_type is extracted from the record itself.
  const result = extractListEntityFields(
    fakeListRecord({ AccountType: "Income" }),
    { accountType: "Income" }
  );
  assert.ok(result.valid);
  assert.equal(result.account_type, "Income");
  console.log("ok: extractListEntityFields includes account_type when supplied");
}

{
  // Extracted fields must NEVER include a named field for customer name, address,
  // dollar amount, or any other PII — only opaque IDs, version, dates, and booleans.
  const record = fakeListRecord({
    FullName:       "DO NOT EXTRACT",
    CompanyName:    "DO NOT EXTRACT",
    BillAddress:    { Addr1: "DO NOT EXTRACT" },
    AltPhone:       "DO NOT EXTRACT",
    Email:          "DO NOT EXTRACT",
  });
  const result = extractListEntityFields(record);
  assert.ok(result.valid);
  const resultStr = JSON.stringify(result);
  assert.doesNotMatch(resultStr, /DO NOT EXTRACT/, "PII fields must not appear in extracted staging fields");
  console.log("ok: extractListEntityFields never surfaces PII in named staging fields");
}

// ── extractTxnEntityFields ─────────────────────────────────────────────────

{
  const result = extractTxnEntityFields(fakeTxnRecord());
  assert.ok(result.valid);
  assert.equal(result.qb_txn_id,          "FAKE-TXN-001");
  assert.equal(result.qb_edit_sequence,   "200");
  assert.equal(result.txn_date,           "2026-01-15");
  assert.equal(result.time_created,       "2026-01-15T00:00:00");
  assert.equal(result.time_modified,      "2026-06-01T00:00:00");
  assert.equal(result.qb_customer_list_id,"FAKE-LIST-CUST-001");
  console.log("ok: extractTxnEntityFields extracts safe fields from a valid transaction record");
}

{
  // Bill/PO with VendorRef instead of CustomerRef.
  const result = extractTxnEntityFields(fakeTxnRecord({
    TxnID:       "FAKE-TXN-BILL-001",
    CustomerRef: undefined,
    VendorRef:   { ListID: "FAKE-LIST-VEND-001" },
  }));
  assert.ok(result.valid);
  assert.equal(result.qb_vendor_list_id, "FAKE-LIST-VEND-001");
  assert.ok(!("qb_customer_list_id" in result));
  console.log("ok: extractTxnEntityFields handles VendorRef (bills/POs)");
}

{
  assert.ok(!extractTxnEntityFields({ EditSequence: "1" }).valid, "missing TxnID -> invalid");
  assert.ok(!extractTxnEntityFields(null).valid, "null -> invalid");
  console.log("ok: extractTxnEntityFields rejects records with missing TxnID");
}

{
  // PII fields must not appear in extracted staging fields.
  const record = fakeTxnRecord({
    RefNumber: "DO NOT EXTRACT",
    Memo:      "DO NOT EXTRACT",
    CustomerRef: { ListID: "FAKE-LIST-CUST-001", FullName: "DO NOT EXTRACT" },
    SubTotal:  "DO NOT EXTRACT",
    TotalAmount: "DO NOT EXTRACT",
  });
  const result = extractTxnEntityFields(record);
  assert.ok(result.valid);
  const resultStr = JSON.stringify(result);
  assert.doesNotMatch(resultStr, /DO NOT EXTRACT/, "PII fields must not appear in extracted txn staging fields");
  console.log("ok: extractTxnEntityFields never surfaces PII in named staging fields");
}

// ── extractInvoiceLineFields ───────────────────────────────────────────────

{
  const result = extractInvoiceLineFields(fakeInvoiceLineRecord(), "FAKE-TXN-INV-001", "2026-01-15", 0);
  assert.ok(result.valid);
  assert.equal(result.qb_txn_id,       "FAKE-TXN-INV-001");
  assert.equal(result.qb_txn_line_id,  "FAKE-LINE-001");
  assert.equal(result.line_seq_number, 0);
  assert.equal(result.txn_date,        "2026-01-15");
  assert.equal(result.qb_item_list_id, "FAKE-LIST-ITEM-001");
  assert.equal(result.line_type,       "InvoiceLineRet");
  console.log("ok: extractInvoiceLineFields extracts safe fields from a valid line record");
}

{
  // Line with no TxnLineID (fallback to line_seq_number only).
  const result = extractInvoiceLineFields(
    { ItemRef: { ListID: "FAKE-LIST-ITEM-002" } },
    "FAKE-TXN-INV-002",
    "2026-02-01",
    3
  );
  assert.ok(result.valid);
  assert.equal(result.qb_txn_line_id,  null, "absent TxnLineID -> null");
  assert.equal(result.line_seq_number, 3);
  console.log("ok: extractInvoiceLineFields handles missing TxnLineID gracefully");
}

{
  // Missing parent TxnID -> invalid.
  const result = extractInvoiceLineFields(fakeInvoiceLineRecord(), null, "2026-01-15", 0);
  assert.ok(!result.valid);
  console.log("ok: extractInvoiceLineFields rejects missing parentTxnId");
}

{
  // PII (amounts, descriptions) must not appear in line staging fields.
  const line = {
    TxnLineID:   "FAKE-LINE-002",
    ItemRef:     { ListID: "FAKE-LIST-ITEM-003", FullName: "DO NOT EXTRACT" },
    Quantity:    "DO NOT EXTRACT",
    Amount:      "DO NOT EXTRACT",
    Desc:        "DO NOT EXTRACT",
  };
  const result = extractInvoiceLineFields(line, "FAKE-TXN-INV-003", "2026-03-01", 1);
  assert.ok(result.valid);
  assert.doesNotMatch(JSON.stringify(result), /DO NOT EXTRACT/);
  console.log("ok: extractInvoiceLineFields never surfaces PII in named staging fields");
}

// ── buildStagingRow ────────────────────────────────────────────────────────

{
  const result = buildStagingRow("customers", fakeListRecord(), FAKE_CTX);
  assert.ok(result.ok);
  assert.equal(result.tableName, "brain_quickbooks_customers");
  assert.equal(result.row.organization_id, FAKE_ORG_ID);
  assert.equal(result.row.sync_run_id,     FAKE_RUN_ID);
  assert.equal(result.row.source_system,   "quickbooks");
  assert.equal(result.row.qb_list_id,      "FAKE-LIST-001");
  assert.deepEqual(result.row.raw_payload, fakeListRecord());
  console.log("ok: buildStagingRow produces a valid customers staging row");
}

{
  const result = buildStagingRow("invoices", fakeTxnRecord(), FAKE_CTX);
  assert.ok(result.ok);
  assert.equal(result.tableName, "brain_quickbooks_invoices");
  assert.equal(result.row.qb_txn_id, "FAKE-TXN-001");
  assert.equal(result.row.txn_date,  "2026-01-15");
  assert.deepEqual(result.row.raw_payload, fakeTxnRecord());
  console.log("ok: buildStagingRow produces a valid invoices staging row");
}

{
  // Unknown entity folder -> ok: false, no throw.
  const result = buildStagingRow("unknown-entity", fakeListRecord(), FAKE_CTX);
  assert.ok(!result.ok);
  assert.ok(typeof result.reason === "string");
  assert.equal(result.entityFolderName, "unknown-entity");
  console.log("ok: buildStagingRow returns ok:false for unknown entity folder, no throw");
}

{
  // List record with missing ListID -> ok: false with safe reason.
  const result = buildStagingRow("vendors", { EditSequence: "1" }, FAKE_CTX);
  assert.ok(!result.ok);
  assert.ok(typeof result.reason === "string" && result.reason.length > 0);
  console.log("ok: buildStagingRow returns ok:false for list record with missing ListID");
}

{
  // raw_payload must be the full original record object (not filtered).
  const fullRecord = fakeListRecord({ SomeExtraField: "extra" });
  const result = buildStagingRow("accounts", fullRecord, FAKE_CTX);
  assert.ok(result.ok);
  assert.deepEqual(result.row.raw_payload, fullRecord);
  console.log("ok: buildStagingRow stores the full record in raw_payload unchanged");
}

{
  // invoice-lines entity kind.
  const lineRecord = {
    InvoiceTxnID:   "FAKE-TXN-INV-LINE-001",
    InvoiceTxnDate: "2026-04-01",
    TxnLineID:      "FAKE-LINE-X001",
    ItemRef:        { ListID: "FAKE-LIST-ITEM-010" },
    _lineIndex:     5,
    _lineType:      "InvoiceLineRet",
  };
  const result = buildStagingRow("invoice-lines", lineRecord, FAKE_CTX);
  assert.ok(result.ok, `invoice-lines staging failed: ${result.reason}`);
  assert.equal(result.tableName, "brain_quickbooks_invoice_lines");
  assert.equal(result.row.qb_txn_id,      "FAKE-TXN-INV-LINE-001");
  assert.equal(result.row.qb_txn_line_id, "FAKE-LINE-X001");
  assert.equal(result.row.txn_date,       "2026-04-01");
  assert.equal(result.row.line_seq_number, 5);
  console.log("ok: buildStagingRow handles invoice-lines entity kind");
}

{
  // Terms entity: term_type set from record._termType.
  const standardTerm = fakeListRecord({ _termType: "standard" });
  const result = buildStagingRow("terms", standardTerm, FAKE_CTX);
  assert.ok(result.ok);
  assert.equal(result.row.term_type, "standard");
  console.log("ok: buildStagingRow sets term_type from record._termType for terms entity");
}

{
  // Items entity: item_type from record._itemType.
  const inventoryItem = fakeListRecord({ _itemType: "ItemInventoryRet" });
  const result = buildStagingRow("items", inventoryItem, FAKE_CTX);
  assert.ok(result.ok);
  assert.equal(result.row.item_type, "ItemInventoryRet");
  console.log("ok: buildStagingRow sets item_type from record._itemType for items entity");
}

{
  // Accounts entity: account_type from AccountType field.
  const incomeAccount = fakeListRecord({ AccountType: "Income" });
  const result = buildStagingRow("accounts", incomeAccount, FAKE_CTX);
  assert.ok(result.ok);
  assert.equal(result.row.account_type, "Income");
  console.log("ok: buildStagingRow sets account_type from AccountType for accounts entity");
}

// ── Idempotency: same record input produces identical staging row ───────────

{
  const record = fakeListRecord();
  const result1 = buildStagingRow("customers", record, FAKE_CTX);
  const result2 = buildStagingRow("customers", record, FAKE_CTX);
  assert.ok(result1.ok && result2.ok);
  // Compare every field except raw_payload reference (deepEqual handles it).
  assert.deepEqual(result1.row, result2.row);
  console.log("ok: buildStagingRow is idempotent -- same input produces identical row");
}

// ── buildStagingBatch ──────────────────────────────────────────────────────

{
  const records = [fakeListRecord(), fakeListRecord({ ListID: "FAKE-LIST-002", EditSequence: "101" })];
  const { rows, tableName, failures } = buildStagingBatch("customers", records, FAKE_CTX);
  assert.equal(rows.length, 2);
  assert.equal(tableName, "brain_quickbooks_customers");
  assert.equal(failures.length, 0);
  assert.equal(rows[0].qb_list_id, "FAKE-LIST-001");
  assert.equal(rows[1].qb_list_id, "FAKE-LIST-002");
  console.log("ok: buildStagingBatch processes all valid records in a batch");
}

{
  // Batch with one bad record: bad record goes to failures, good record succeeds.
  const records = [
    { EditSequence: "1" },               // no ListID -- will fail
    fakeListRecord({ ListID: "FAKE-LIST-OK" }),
  ];
  const { rows, failures } = buildStagingBatch("customers", records, FAKE_CTX);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].qb_list_id, "FAKE-LIST-OK");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].index, 0);
  assert.ok(typeof failures[0].reason === "string");
  console.log("ok: buildStagingBatch isolates failures and processes valid records");
}

{
  // Non-array records input.
  const { rows, failures } = buildStagingBatch("customers", null, FAKE_CTX);
  assert.equal(rows.length, 0);
  assert.equal(failures.length, 1);
  console.log("ok: buildStagingBatch handles non-array records input safely");
}

// ── getStagingUpsertConfig ─────────────────────────────────────────────────

{
  const cfg = getStagingUpsertConfig("customers");
  assert.ok(cfg !== null);
  assert.equal(cfg.tableName, "brain_quickbooks_customers");
  assert.deepEqual(cfg.conflictColumns, ["organization_id", "qb_list_id"]);
  assert.ok(cfg.updateColumns.includes("raw_payload"));
  assert.ok(cfg.updateColumns.includes("qb_edit_sequence"));
  assert.ok(cfg.updateColumns.includes("time_modified"));
  assert.ok(cfg.updateColumns.includes("last_seen_at"));
  console.log("ok: getStagingUpsertConfig returns correct config for customers");
}

{
  const cfg = getStagingUpsertConfig("terms");
  assert.ok(cfg !== null);
  assert.deepEqual(cfg.conflictColumns, ["organization_id", "qb_list_id", "term_type"]);
  console.log("ok: getStagingUpsertConfig uses term_type in conflict key for terms");
}

{
  const cfg = getStagingUpsertConfig("invoices");
  assert.ok(cfg !== null);
  assert.equal(cfg.tableName, "brain_quickbooks_invoices");
  assert.deepEqual(cfg.conflictColumns, ["organization_id", "qb_txn_id"]);
  assert.ok(cfg.updateColumns.includes("txn_date"));
  assert.ok(cfg.updateColumns.includes("qb_customer_list_id"));
  console.log("ok: getStagingUpsertConfig returns correct config for invoices");
}

{
  const cfg = getStagingUpsertConfig("bills");
  assert.ok(cfg !== null);
  assert.ok(cfg.updateColumns.includes("qb_vendor_list_id"), "bills update should include qb_vendor_list_id");
  assert.ok(!cfg.updateColumns.includes("qb_customer_list_id"), "bills should not include qb_customer_list_id");
  console.log("ok: getStagingUpsertConfig uses qb_vendor_list_id for bills");
}

{
  const cfg = getStagingUpsertConfig("invoice-lines");
  assert.ok(cfg !== null);
  assert.deepEqual(cfg.conflictColumns, ["organization_id", "qb_txn_id", "qb_txn_line_id"]);
  console.log("ok: getStagingUpsertConfig uses three-column conflict key for invoice-lines");
}

{
  const cfg = getStagingUpsertConfig("company");
  assert.ok(cfg !== null);
  assert.deepEqual(cfg.conflictColumns, ["organization_id"]);
  console.log("ok: getStagingUpsertConfig uses org-only conflict key for company singleton");
}

{
  assert.equal(getStagingUpsertConfig("unknown-entity"), null);
  console.log("ok: getStagingUpsertConfig returns null for unknown entity folder");
}

// ── getStagingUpsertConfig: all known folders have a config ────────────────

{
  const allFolders = [
    "company", "invoice-lines",
    ...QB_LIST_ENTITY_FOLDERS,
    ...QB_TXN_ENTITY_FOLDERS,
  ];
  for (const folder of allFolders) {
    const cfg = getStagingUpsertConfig(folder);
    assert.ok(cfg !== null, `getStagingUpsertConfig returned null for "${folder}"`);
    assert.ok(cfg.conflictColumns.length > 0, `${folder} must have at least one conflict column`);
    assert.ok(cfg.updateColumns.includes("raw_payload"), `${folder} must update raw_payload on conflict`);
    assert.ok(cfg.updateColumns.includes("last_seen_at"), `${folder} must update last_seen_at on conflict`);
  }
  console.log("ok: getStagingUpsertConfig is defined for all 15 entity folders");
}

// ── detectEditSequenceChange ───────────────────────────────────────────────

{
  assert.equal(detectEditSequenceChange("200", "100"), "changed",   "different sequences -> changed");
  assert.equal(detectEditSequenceChange("100", "100"), "unchanged", "same sequence -> unchanged");
  assert.equal(detectEditSequenceChange(null,  "100"), "unknown",   "null incoming -> unknown");
  assert.equal(detectEditSequenceChange("100", null),  "unknown",   "null stored -> unknown");
  assert.equal(detectEditSequenceChange(null,  null),  "unknown",   "both null -> unknown");
  console.log("ok: detectEditSequenceChange identifies changed/unchanged/unknown edit sequences");
}

{
  // Simulated incremental upsert: same record seen twice, edit sequence unchanged.
  const record = fakeListRecord({ EditSequence: "150" });
  const first  = buildStagingRow("customers", record, FAKE_CTX);
  const second = buildStagingRow("customers", record, FAKE_CTX);
  assert.ok(first.ok && second.ok);

  const changeStatus = detectEditSequenceChange(
    second.row.qb_edit_sequence,
    first.row.qb_edit_sequence
  );
  assert.equal(changeStatus, "unchanged");
  // Application code would skip raw_payload update on "unchanged" -- verify pattern.
  console.log("ok: detectEditSequenceChange enables idempotent re-import of unchanged records");
}

{
  // Same QB ID, new edit sequence -> changed -> raw_payload should be updated.
  const v1 = fakeListRecord({ EditSequence: "150" });
  const v2  = fakeListRecord({ EditSequence: "151" });
  const r1  = buildStagingRow("customers", v1, FAKE_CTX);
  const r2  = buildStagingRow("customers", v2, FAKE_CTX);
  assert.ok(r1.ok && r2.ok);
  assert.equal(r1.row.qb_list_id, r2.row.qb_list_id, "same QB ID -> same conflict key");
  assert.equal(
    detectEditSequenceChange(r2.row.qb_edit_sequence, r1.row.qb_edit_sequence),
    "changed"
  );
  console.log("ok: detectEditSequenceChange detects record modification via EditSequence bump");
}

// ── Privacy: staging row never exposes PII in named columns ───────────────

{
  // Build a maximal fake record with every PII-adjacent field set to a sentinel.
  const piiRecord = {
    ListID:         "FAKE-LIST-PII",
    EditSequence:   "999",
    TimeCreated:    "2020-01-01T00:00:00",
    TimeModified:   "2026-01-01T00:00:00",
    IsActive:       "true",
    FullName:       "SENTINEL_PII_NAME",
    CompanyName:    "SENTINEL_PII_COMPANY",
    Phone:          "SENTINEL_PII_PHONE",
    AltPhone:       "SENTINEL_PII_ALTPHONE",
    Fax:            "SENTINEL_PII_FAX",
    Email:          "SENTINEL_PII_EMAIL",
    BillAddress:    { Addr1: "SENTINEL_PII_ADDR" },
    ShipAddress:    { Addr1: "SENTINEL_PII_SHIP" },
    Notes:          "SENTINEL_PII_NOTES",
    AccountNumber:  "SENTINEL_PII_ACCNUM",
    CreditCardInfo: { CreditCardNumber: "SENTINEL_PII_CC" },
    TermsRef:       { FullName: "SENTINEL_PII_TERMS" },
  };

  const result = buildStagingRow("customers", piiRecord, FAKE_CTX);
  assert.ok(result.ok);

  // Destructure raw_payload out and check remaining named fields.
  const { raw_payload, ...namedFields } = result.row;
  const namedStr = JSON.stringify(namedFields);

  // None of the SENTINEL values should appear in named staging columns.
  assert.doesNotMatch(namedStr, /SENTINEL_PII/,
    "PII sentinel values must not appear in named staging columns (only in raw_payload)");

  // raw_payload IS allowed (and expected) to contain the full record.
  const payloadStr = JSON.stringify(raw_payload);
  assert.match(payloadStr, /SENTINEL_PII_NAME/,
    "raw_payload must preserve the full record including PII fields");

  console.log("ok: staging row named columns never expose PII; raw_payload preserves full record");
}

console.log("\nAll quickBooksStaging tests passed.");
