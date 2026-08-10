/**
 * estimateSalesTruth discovery — unit tests (synthetic fixtures only).
 * Run: node backend-core/src/quickbooks/estimateSalesTruth/estimateSalesTruthDiscovery.test.mjs
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  asArray,
  classifyRefNumberFormat,
  createFieldProfiler,
  daysBetween,
  extractEstimateRefNumbersFromMemo,
  fingerprintExportTree,
  parseQbMoney,
  textOf,
} from "./helpers.js";
import {
  buildSyntheticEstimateFixture,
  buildSyntheticInvoiceFixture,
  buildSyntheticPaymentFixture,
  buildSyntheticSalesOrderFixture,
  findObviousPiiLeaks,
  isObviousPiiFieldName,
  sanitizeQbValue,
} from "./sanitize.js";
import {
  FORBIDDEN_WRITE_APIS,
  buildQuickBooksEstimatePreview,
  findForbiddenWriteExports,
  validateQuickBooksEstimatePreview,
} from "./contracts.js";
import {
  analyzeEstimates,
  analyzeInvoices,
  analyzePayments,
  analyzeSalesOrders,
  buildExportInventory,
  runEstimateSalesTruthDiscovery,
} from "./discovery.js";
import * as discoveryPackage from "./index.js";
import { parseArgs } from "../../scripts/discoverQuickBooksEstimateSalesTruth.mjs";

const require = createRequire(import.meta.url);

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath, data, { bom = false } = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = JSON.stringify(data, null, 2);
  const payload = bom ? `\uFEFF${body}` : body;
  await fs.writeFile(filePath, payload, "utf8");
}

function fakeManifest(overrides = {}) {
  return {
    RunId: "test-run-est-truth",
    StartedAt: "2026-07-10T00:00:00Z",
    CompletedAt: "2026-07-10T01:00:00Z",
    QbXmlVersion: "16.0",
    CompanyFile: "(currently open company file)",
    ExportDirectory: "/fake/export",
    Entities: [
      { EntityType: "estimates", BatchCount: 1, RecordCount: 2, Errors: [] },
      { EntityType: "sales-orders", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "invoices", BatchCount: 1, RecordCount: 2, Errors: [] },
      { EntityType: "payments", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "customers", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "items", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "accounts", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "classes", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "sales-reps", BatchCount: 1, RecordCount: 1, Errors: [] },
      { EntityType: "terms", BatchCount: 1, RecordCount: 1, Errors: [] },
    ],
    Errors: [],
    ...overrides,
  };
}

function wrapText(tag, value) {
  return { "@elementName": tag, "#text": String(value) };
}

function estimateRecord({ txnId, ref, total, lines }) {
  return {
    "@elementName": "EstimateRet",
    TxnID: wrapText("TxnID", txnId),
    RefNumber: wrapText("RefNumber", ref),
    TxnDate: wrapText("TxnDate", "2024-01-15"),
    CustomerRef: { ListID: wrapText("ListID", "FAKE-CUST-1") },
    ClassRef: { ListID: wrapText("ListID", "FAKE-CLASS-1") },
    TemplateRef: { ListID: wrapText("ListID", "FAKE-TMPL-1") },
    TermsRef: { ListID: wrapText("ListID", "FAKE-TERM-1") },
    SalesRepRef: { ListID: wrapText("ListID", "FAKE-REP-1") },
    IsActive: wrapText("IsActive", "true"),
    Subtotal: wrapText("Subtotal", String(total)),
    SalesTaxPercentage: wrapText("SalesTaxPercentage", "0"),
    SalesTaxTotal: wrapText("SalesTaxTotal", "0"),
    TotalAmount: wrapText("TotalAmount", String(total)),
    ItemSalesTaxRef: { ListID: wrapText("ListID", "FAKE-TAX-1") },
    CustomerSalesTaxCodeRef: { ListID: wrapText("ListID", "FAKE-TAXCODE-1") },
    IsToBeEmailed: wrapText("IsToBeEmailed", "false"),
    BillAddress: { Addr1: wrapText("Addr1", "Redacted Addr") },
    EstimateLineRet: lines,
  };
}

async function buildSyntheticExport() {
  const dir = await makeTempDir("qb-est-truth-export-");
  await writeJson(path.join(dir, "manifest.json"), fakeManifest(), { bom: true });

  const lineItem = {
    "@elementName": "EstimateLineRet",
    TxnLineID: wrapText("TxnLineID", "L1"),
    ItemRef: { ListID: wrapText("ListID", "FAKE-ITEM-1") },
    Desc: wrapText("Desc", "Quartz material"),
    Quantity: wrapText("Quantity", "10"),
    Rate: wrapText("Rate", "100"),
    Amount: wrapText("Amount", "1000"),
    ClassRef: { ListID: wrapText("ListID", "FAKE-CLASS-1") },
    SalesTaxCodeRef: { ListID: wrapText("ListID", "FAKE-TAXCODE-1") },
  };
  const lineDesc = {
    "@elementName": "EstimateLineRet",
    TxnLineID: wrapText("TxnLineID", "L2"),
    Desc: wrapText("Desc", "Note only"),
  };

  await writeJson(
    path.join(dir, "estimates", "batch-001.json"),
    {
      entityType: "estimates",
      batchNumber: 1,
      recordCount: 2,
      records: [
        estimateRecord({
          txnId: "FAKE-EST-1",
          ref: "24-1001",
          total: 1000,
          lines: [lineItem, lineDesc],
        }),
        estimateRecord({
          txnId: "FAKE-EST-2",
          ref: "24-1002",
          total: 500,
          lines: [lineItem],
        }),
      ],
    },
    { bom: true }
  );

  await writeJson(path.join(dir, "sales-orders", "batch-001.json"), {
    entityType: "sales-orders",
    batchNumber: 1,
    recordCount: 1,
    records: [
      {
        "@elementName": "SalesOrderRet",
        TxnID: wrapText("TxnID", "FAKE-SO-1"),
        CustomerRef: { ListID: wrapText("ListID", "FAKE-CUST-1") },
        ClassRef: { ListID: wrapText("ListID", "FAKE-CLASS-1") },
        TxnDate: wrapText("TxnDate", "2024-01-20"),
        TotalAmount: wrapText("TotalAmount", "1100"),
        IsFullyInvoiced: wrapText("IsFullyInvoiced", "true"),
        IsManuallyClosed: wrapText("IsManuallyClosed", "false"),
        Memo: wrapText("Memo", "Estimate 24-1001:"),
        SalesRepRef: { ListID: wrapText("ListID", "FAKE-REP-1") },
        SalesOrderLineRet: [lineItem],
      },
    ],
  });

  await writeJson(path.join(dir, "invoices", "batch-001.json"), {
    entityType: "invoices",
    batchNumber: 1,
    recordCount: 2,
    records: [
      {
        "@elementName": "InvoiceRet",
        TxnID: wrapText("TxnID", "FAKE-INV-1"),
        CustomerRef: { ListID: wrapText("ListID", "FAKE-CUST-1") },
        ClassRef: { ListID: wrapText("ListID", "FAKE-CLASS-1") },
        TxnDate: wrapText("TxnDate", "2024-02-01"),
        TotalAmount: wrapText("TotalAmount", "1100"),
        BalanceRemaining: wrapText("BalanceRemaining", "0"),
        IsPaid: wrapText("IsPaid", "true"),
        Memo: wrapText("Memo", "Estimate 24-1001:"),
        SalesRepRef: { ListID: wrapText("ListID", "FAKE-REP-1") },
        InvoiceLineRet: [lineItem],
      },
      {
        // Elite Stone shape: no TotalAmount — Subtotal + SalesTaxTotal
        "@elementName": "InvoiceRet",
        TxnID: wrapText("TxnID", "FAKE-INV-2"),
        CustomerRef: { ListID: wrapText("ListID", "FAKE-CUST-1") },
        ClassRef: { ListID: wrapText("ListID", "FAKE-CLASS-1") },
        TxnDate: wrapText("TxnDate", "2024-02-02"),
        Subtotal: wrapText("Subtotal", "200"),
        SalesTaxTotal: wrapText("SalesTaxTotal", "14"),
        BalanceRemaining: wrapText("BalanceRemaining", "214"),
        IsPaid: wrapText("IsPaid", "false"),
        Memo: wrapText("Memo", "Estimate 24-1002:"),
        InvoiceLineRet: [lineItem],
      },
    ],
  });

  await writeJson(path.join(dir, "payments", "batch-001.json"), {
    entityType: "payments",
    batchNumber: 1,
    recordCount: 1,
    records: [
      {
        "@elementName": "ReceivePaymentRet",
        TxnID: wrapText("TxnID", "FAKE-PAY-1"),
        CustomerRef: { ListID: wrapText("ListID", "FAKE-CUST-1") },
        TxnDate: wrapText("TxnDate", "2024-02-05"),
        TotalAmount: wrapText("TotalAmount", "1100"),
        UnusedPayment: wrapText("UnusedPayment", "0"),
        PaymentMethodRef: { ListID: wrapText("ListID", "FAKE-PM-1") },
      },
    ],
  });

  for (const [folder, listId] of [
    ["customers", "FAKE-CUST-1"],
    ["items", "FAKE-ITEM-1"],
    ["accounts", "FAKE-ACCT-1"],
    ["classes", "FAKE-CLASS-1"],
    ["sales-reps", "FAKE-REP-1"],
    ["terms", "FAKE-TERM-1"],
  ]) {
    await writeJson(path.join(dir, folder, "batch-001.json"), {
      entityType: folder,
      batchNumber: 1,
      recordCount: 1,
      records: [
        {
          "@elementName": `${folder}Ret`,
          ListID: wrapText("ListID", listId),
          IsActive: wrapText("IsActive", "true"),
        },
      ],
    });
  }

  return dir;
}

// ── helpers ──────────────────────────────────────────────────────────────────
{
  assert.deepEqual(extractEstimateRefNumbersFromMemo("Estimate 24-1001:"), ["24-1001"]);
  assert.deepEqual(extractEstimateRefNumbersFromMemo("nope"), []);
  assert.equal(classifyRefNumberFormat("24-1001"), "YY-NNNN");
  assert.equal(classifyRefNumberFormat("03-20-6023"), "MM-DD-NNNN_legacy");
  assert.equal(daysBetween("2024-01-01", "2024-01-11"), 10);
  assert.equal(parseQbMoney({ "#text": "1,234.50" }), 1234.5);
  assert.equal(textOf({ "#text": "abc" }), "abc");
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray(1), [1]);
  const profiler = createFieldProfiler();
  profiler.observe({ A: 1, B: null });
  profiler.observe({ A: 2 });
  const snap = profiler.snapshot(0.9);
  assert.equal(snap.recordCount, 2);
  console.log("ok: helpers");
}

// ── sanitize / PII ───────────────────────────────────────────────────────────
{
  assert.equal(isObviousPiiFieldName("Email"), true);
  assert.equal(isObviousPiiFieldName("TxnID"), false);
  const fixture = buildSyntheticEstimateFixture();
  const leaks = findObviousPiiLeaks(fixture);
  assert.equal(leaks.length, 0, `unexpected PII leaks: ${leaks.join(", ")}`);
  const dirty = sanitizeQbValue({
    Email: "person@example.com",
    Phone: "(319) 555-0100",
    FullName: "Someone Real",
    TxnID: "FAKE-1",
  });
  assert.equal(findObviousPiiLeaks(dirty).length, 0);
  assert.ok(String(dirty.Email).startsWith("<redacted:"));
  assert.ok(buildSyntheticSalesOrderFixture());
  assert.ok(buildSyntheticInvoiceFixture());
  assert.ok(buildSyntheticPaymentFixture());
  console.log("ok: sanitize / PII fixtures");
}

// ── contracts: no write implementation ───────────────────────────────────────
{
  assert.throws(() => buildQuickBooksEstimatePreview({}), /future contract only/i);
  assert.throws(() => validateQuickBooksEstimatePreview({}), /future contract only/i);
  assert.ok(FORBIDDEN_WRITE_APIS.includes("EstimateAdd"));
  assert.deepEqual(findForbiddenWriteExports(discoveryPackage), []);
  // Source must not implement write calls or import CData/COM connectors
  const discoverySrc = await fs.readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "discovery.js"),
    "utf8"
  );
  assert.equal(/EstimateAdd\s*\(/.test(discoverySrc), false);
  assert.equal(/InvoiceAdd\s*\(|SalesOrderAdd\s*\(|ReceivePaymentAdd\s*\(/.test(discoverySrc), false);
  assert.equal(
    /from ['"].*cdata|require\(['"].*cdata|QBXMLRP2|RequestProcessor|Remote Connector/i.test(discoverySrc),
    false
  );
  console.log("ok: no write APIs / no CData");
}

// ── parseArgs ────────────────────────────────────────────────────────────────
{
  const a = parseArgs(["/tmp/export", "--out", "/tmp/out"]);
  assert.equal(a.exportDir, "/tmp/export");
  assert.equal(a.outDir, "/tmp/out");
  console.log("ok: parseArgs");
}

// ── export never modified + parsing + links + variance ───────────────────────
{
  const exportDir = await buildSyntheticExport();
  const before = await fingerprintExportTree(exportDir);
  const outDir = await makeTempDir("qb-est-truth-out-");

  const result = await runEstimateSalesTruthDiscovery(exportDir, { outputDir: outDir });
  const after = await fingerprintExportTree(exportDir);
  assert.equal(after.fingerprint, before.fingerprint, "export directory must not be modified");

  assert.equal(result.counts.estimates, 2);
  assert.equal(result.counts.estimateLines, 3);
  assert.equal(result.counts.salesOrders, 1);
  assert.equal(result.counts.invoices, 2);
  assert.equal(result.counts.payments, 1);

  const link = JSON.parse(await fs.readFile(path.join(outDir, "transaction-link-analysis.json"), "utf8"));
  assert.equal(link.confirmedLinks.count, 0);
  assert.equal(link.inferredLinks.salesOrders.inferredUnique, 1);
  assert.equal(link.inferredLinks.invoices.inferredUnique, 2);
  assert.equal(link.pathClassification.estimate_to_salesOrder_to_invoice, 1);

  const variance = JSON.parse(await fs.readFile(path.join(outDir, "amount-variance-analysis.json"), "utf8"));
  assert.equal(variance.estimateToSalesOrder.pairCount, 1);
  assert.equal(variance.estimateToSalesOrder.meanDelta, 100);
  assert.equal(variance.estimateToInvoice.pairCount, 2);
  assert.equal(variance.salesOrderToInvoice_sharedEstimate.pairCount, 1);
  assert.equal(variance.salesOrderToInvoice_sharedEstimate.meanDelta, 0);

  const inventory = JSON.parse(await fs.readFile(path.join(outDir, "export-inventory.json"), "utf8"));
  assert.equal(inventory.manifestValid, true);
  assert.ok(inventory.entities.estimates.folderExists);

  // Alternate shape: records as top-level array inside a non-standard wrapper should still be handled
  // by reader when entityType/records present — already covered via BOM batch files above.
  console.log("ok: discovery end-to-end on synthetic export");
}

// ── line aggregation via analyzeEstimates ────────────────────────────────────
{
  const exportDir = await buildSyntheticExport();
  const est = await analyzeEstimates(exportDir);
  assert.equal(est.profile.estimateCount, 2);
  assert.equal(est.lineProfile.lineCount, 3);
  assert.equal(est.lineProfile.itemLines, 2);
  assert.equal(est.lineProfile.descOnlyLines, 1);
  assert.equal(est.lineProfile.qtyRateAmount.consistentWithin5Cents, 2);

  const so = await analyzeSalesOrders(exportDir, est.refIndex);
  assert.equal(so.memoInference.inferredUnique, 1);
  const inv = await analyzeInvoices(exportDir, est.refIndex);
  assert.equal(inv.memoInference.inferredUnique, 2);
  assert.equal(inv.totalAmountSum, 1314); // 1100 + (200+14)
  const pay = await analyzePayments(exportDir);
  assert.equal(pay.count, 1);
  assert.equal(pay.withAppliedToTxn, 0);

  const inventory = await buildExportInventory(exportDir);
  assert.equal(inventory.runId, "test-run-est-truth");
  console.log("ok: line aggregation + confirmed vs inferred classification");
}

// ── package does not pull in network/CData modules ───────────────────────────
{
  const pkgDir = path.dirname(fileURLToPath(import.meta.url));
  const files = ["discovery.js", "contracts.js", "helpers.js", "index.js", "sanitize.js"];
  for (const f of files) {
    const src = await fs.readFile(path.join(pkgDir, f), "utf8");
    assert.equal(/\baxios\b|\bnode-fetch\b/i.test(src), false, f);
    assert.equal(/from ['"][^'"]*cdata|require\(['"][^'"]*cdata/i.test(src), false, f);
  }
  // Ensure require.resolve of a fake cdata module is not present
  assert.throws(() => require.resolve("cdata-remote-connector"), /Cannot find module/);
  console.log("ok: no cdata dependency");
}

console.log("All estimateSalesTruth discovery tests passed.");
