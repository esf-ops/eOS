/**
 * Full Finance Foundation Phase 1 tests (synthetic only — no ODBC / no backfill).
 * Run: node backend-core/src/finance/quickbooksFinanceFoundation/quickbooksFinanceFoundation.test.mjs
 */

import assert from "node:assert/strict";
import {
  requireQuickBooksFinanceSyncToken,
  constantTimeEqualString,
  validateBeginPayload,
  validateCheckpointPayload,
  validateUpsertPayload,
  validateOpenApReplacePayload,
  validateReportSnapshotPayload,
  validateCompletePayload,
  classifyCashEvent,
  buildDepositCashEvents,
  detectReceivePaymentDepositDoubleCount,
  extractBalanceSheetControlTotals,
  reconcileBalanceSheetIdentity,
  officialStatementSource,
  shouldSkipCheckpoint,
  remainingWindows,
  nextCheckpointStatus,
  scrubFinanceIdsForBrowser,
  upsertDatasetRows,
  QB_FINANCE_WRITE_TABLES,
  QB_FINANCE_FORBIDDEN_WRITE_TABLES,
  QB_FINANCE_OPENING_AS_OF_DATE,
  QB_FINANCE_HISTORICAL_START
} from "./index.js";

const org = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

{
  const env = {
    QB_FINANCE_SYNC_INGEST_TOKEN: "finance-token-value-32chars!!!!",
    QB_SALES_SYNC_INGEST_TOKEN: "sales-token-value-32chars!!!!!!",
    QB_AD_CUSTOMER_SYNC_INGEST_TOKEN: "ad-token-value-32chars!!!!!!!!!"
  };
  const res = mockRes();
  const ok = requireQuickBooksFinanceSyncToken(
    { header: (n) => (String(n).toLowerCase() === "authorization" ? "Bearer wrong-token-value-32chars!!!!!" : "") },
    res,
    env
  );
  assert.equal(ok, false);
  assert.equal(res.statusCode, 401);
  console.log("ok: finance ingest auth rejects invalid token");
}

{
  const env = {
    QB_FINANCE_SYNC_INGEST_TOKEN: "finance-token-value-32chars!!!!",
    QB_SALES_SYNC_INGEST_TOKEN: "finance-token-value-32chars!!!!"
  };
  const res = mockRes();
  const ok = requireQuickBooksFinanceSyncToken(
    { header: () => "Bearer finance-token-value-32chars!!!!" },
    res,
    env
  );
  assert.equal(ok, false);
  assert.equal(res.statusCode, 500);
  console.log("ok: finance token must not equal sales token");
}

{
  const env = { QB_FINANCE_SYNC_INGEST_TOKEN: "finance-token-value-32chars!!!!" };
  const res = mockRes();
  const ok = requireQuickBooksFinanceSyncToken(
    { header: (n) => (String(n).toLowerCase() === "authorization" ? "Bearer finance-token-value-32chars!!!!" : "") },
    res,
    env
  );
  assert.equal(ok, true);
  assert.equal(constantTimeEqualString("abc", "abc"), true);
  console.log("ok: finance ingest auth accepts matching bearer token");
}

{
  const parsed = validateBeginPayload({
    organization_id: org,
    domain: "ap",
    run_kind: "incremental",
    coverage_start_date: "2026-08-01",
    coverage_end_date: "2026-08-14",
    report_basis: "Accrual"
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.domain, "ap");
  console.log("ok: begin payload accepts isolated AP domain");
}

{
  const parsed = validateBeginPayload({
    organization_id: org,
    domain: "accounting",
    run_kind: "opening",
    coverage_end_date: "2025-01-01"
  });
  assert.equal(parsed.ok, false);
  console.log("ok: opening run rejects non-2024-12-31 as-of");
}

{
  const empty = validateOpenApReplacePayload({
    organization_id: org,
    sync_run_id: runId,
    open_ap: []
  });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(" "), /refusing to wipe/i);
  console.log("ok: empty open_ap without allow flag rejected");
}

{
  const bills = validateUpsertPayload({
    organization_id: org,
    sync_run_id: runId,
    dataset: "bills",
    rows: [
      {
        ID: "BILL-1",
        Date: "2026-08-02",
        DueDate: "2026-08-16",
        Terms: "Net 15",
        TermsId: "TERM-1",
        VendorId: "V-1",
        VendorName: "Stone Supply Co",
        Amount: 440.1,
        OpenAmount: 440.1,
        IsPaid: false,
        AccountsPayable: "Accounts Payable",
        AccountsPayableId: "AP-1",
        Memo: "legacy messy terms ok"
      }
    ]
  });
  assert.equal(bills.ok, true);
  assert.equal(bills.value.rows[0].qb_bill_id, "BILL-1");
  assert.equal(bills.value.rows[0].due_date, "2026-08-16");
  assert.equal(bills.value.rows[0].terms_name, "Net 15");
  console.log("ok: bills map live-proven DueDate/Terms/OpenAmount");
}

{
  const apps = validateUpsertPayload({
    organization_id: org,
    sync_run_id: runId,
    dataset: "payment_applications",
    rows: [
      {
        ReceivePaymentId: "PAY-1",
        AppliedToRefId: "INV-9",
        AppliedToAmount: 100,
        AppliedToPaymentAmount: 100,
        AppliedToTxnType: "Invoice",
        Date: "2026-08-03",
        CustomerId: "CUST-1"
      }
    ]
  });
  assert.equal(apps.ok, true);
  assert.equal(apps.value.rows[0].receive_payment_id, "PAY-1");
  assert.equal(apps.value.rows[0].applied_to_ref_id, "INV-9");
  console.log("ok: ReceivePaymentsAppliedTo mapping");
}

{
  const classified = classifyCashEvent({
    source_txn_type: "DepositLineItem",
    item_txn_type: "ReceivePayment",
    item_ref_id: "PAY-1"
  });
  assert.equal(classified.event_role, "bank_deposit_line");
  assert.equal(classified.linked_txn_id, "PAY-1");
  const events = [
    { event_role: "customer_receipt", source_txn_id: "PAY-1", amount: 250 },
    {
      event_role: "bank_deposit_line",
      linked_txn_type: "ReceivePayment",
      linked_txn_id: "PAY-1",
      amount: 250
    }
  ];
  const detected = detectReceivePaymentDepositDoubleCount(events);
  assert.equal(detected.would_double_count_if_summed, true);
  const built = buildDepositCashEvents({
    organizationId: org,
    deposits: [{ qb_deposit_id: "DEP-1", txn_date: "2026-08-04", total_deposit: 250 }],
    depositLines: [
      {
        qb_deposit_id: "DEP-1",
        source_line_id: "DEP-1|1",
        item_amount: 250,
        item_txn_type: "ReceivePayment",
        item_ref_id: "PAY-1"
      }
    ]
  });
  assert.equal(built.some((e) => e.event_role === "bank_deposit"), true);
  assert.equal(built.some((e) => e.event_role === "customer_receipt"), false);
  console.log("ok: ReceivePayment vs Deposit anti-double-count model");
}

{
  const lines = [
    { label: "Total Assets", amount: 9987679.41, row_type: "Total" },
    { label: "Total Liabilities & Equity", amount: 9987679.41, row_type: "Total" }
  ];
  const totals = extractBalanceSheetControlTotals(lines);
  assert.equal(totals.total_assets, 9987679.41);
  const identity = reconcileBalanceSheetIdentity(lines);
  assert.equal(identity.status, "pass");
  assert.equal(identity.delta, 0);
  const src = officialStatementSource();
  assert.equal(src.manufactured_from_forms, false);
  assert.equal(src.canonical_basis, "Accrual");
  console.log("ok: Accrual Balance Sheet identity reconciliation");
}

{
  const snap = validateReportSnapshotPayload({
    organization_id: org,
    sync_run_id: runId,
    report_type: "balance_sheet",
    source_view: "BalanceSheetStandard",
    report_basis: "Accrual",
    as_of_date: QB_FINANCE_OPENING_AS_OF_DATE,
    is_opening: true,
    lines: [{ Label: "Total Assets", Total: 1, RowType: "Total" }]
  });
  assert.equal(snap.ok, true);
  const badOpen = validateReportSnapshotPayload({
    organization_id: org,
    sync_run_id: runId,
    report_type: "balance_sheet",
    source_view: "BalanceSheetStandard",
    as_of_date: "2025-01-01",
    is_opening: true,
    lines: []
  });
  assert.equal(badOpen.ok, false);
  console.log("ok: opening snapshot locked to 2024-12-31");
}

{
  assert.equal(shouldSkipCheckpoint({ status: "success" }, { force: false }), true);
  assert.equal(shouldSkipCheckpoint({ status: "failed" }, { force: false }), false);
  assert.equal(shouldSkipCheckpoint({ status: "success" }, { force: true }), false);
  const remaining = remainingWindows(
    [
      { period_start: "2025-01-01", period_end: "2025-01-31" },
      { period_start: "2025-08-01", period_end: "2025-08-31" }
    ],
    [{ period_start: "2025-01-01", period_end: "2025-01-31", status: "success" }]
  );
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].period_start, "2025-08-01");
  assert.equal(nextCheckpointStatus("pending", "start"), "running");
  console.log("ok: checkpoint resume skips successful months only");
}

{
  const complete = validateCompletePayload({
    organization_id: org,
    sync_run_id: runId,
    status: "success",
    row_counts: { bills: 2 }
  });
  assert.equal(complete.ok, true);
  const scrubbed = scrubFinanceIdsForBrowser({
    vendor_name: "Stone Supply Co",
    qb_vendor_id: "V-1",
    qb_bill_id: "BILL-1",
    open_amount: 10
  });
  assert.equal(scrubbed.vendor_name, "Stone Supply Co");
  assert.equal("qb_vendor_id" in scrubbed, false);
  assert.equal("qb_bill_id" in scrubbed, false);
  console.log("ok: complete payload + browser ID scrub");
}

{
  for (const forbidden of QB_FINANCE_FORBIDDEN_WRITE_TABLES) {
    assert.equal(QB_FINANCE_WRITE_TABLES.includes(forbidden), false);
  }
  assert.equal(QB_FINANCE_HISTORICAL_START, "2025-01-01");
  console.log("ok: finance writes isolated from Sales/AD identity tables");
}

{
  const ck = validateCheckpointPayload({
    organization_id: org,
    sync_run_id: runId,
    domain: "cash",
    dataset: "deposits",
    period_start: "2026-08-01",
    period_end: "2026-08-14",
    status: "success",
    row_count: 3
  });
  assert.equal(ck.ok, true);
  console.log("ok: checkpoint payload");
}

{
  const writes = [];
  const mockSb = {
    from(table) {
      return {
        upsert(rows, opts) {
          writes.push({ table, rows, opts });
          return Promise.resolve({ error: null, count: rows.length });
        }
      };
    }
  };
  const row = {
    organization_id: org,
    qb_bill_id: "BILL-1",
    amount: 10,
    synced_at: "2026-08-14T00:00:00.000Z",
    updated_at: "2026-08-14T00:00:00.000Z"
  };
  await upsertDatasetRows(mockSb, "bills", [row]);
  await upsertDatasetRows(mockSb, "bills", [row]);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].opts.onConflict, "organization_id,qb_bill_id");
  assert.equal(writes[1].table, "qb_finance_bills");
  console.log("ok: bills upsert is idempotent on natural key");
}

console.log("quickbooksFinanceFoundation.test.mjs — all passed");
