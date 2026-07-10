/**
 * Phase 4A QuickBooks intelligence — fake-data unit tests only.
 * Never connects to Supabase. Never uses service-role keys.
 * Sentinel IDs/amounts only — no real customer names, addresses, or memos.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertNoRawPayload,
  extractCustomerFact,
  extractEstimateFact,
  extractInvoiceFact,
  extractLinkedTxnRefs,
  extractPaymentFact,
  parseQbMoney,
} from "./quickBooksIntelligenceFacts.js";
import {
  buildIntelligenceDataset,
  createInMemoryIntelligenceSource,
  dedupeCurrentByNaturalKey,
  filterOrgCurrentRows,
} from "./quickBooksIntelligenceDataset.js";
import {
  buildAllQuickBooksReadModels,
  buildCustomerActivityTrend,
  buildCustomerRevenueSummary,
  buildEstimateSalesOrderInvoiceFlow,
  buildInvoiceAgingSummary,
  buildPaymentHistorySummary,
  buildSalesRepSummary,
  daysBetween,
  invoiceAgingBucket,
} from "./quickBooksIntelligenceRead.js";
import {
  buildAllQuickBooksInsights,
  insightDormantCustomers,
  insightEstimateToInvoiceLeakage,
  insightHighValueCustomers,
  insightOverdueArRisks,
  insightSlowPayingCustomers,
  insightUnpaidInvoiceRisk,
} from "./quickBooksIntelligenceInsights.js";

const ORG = "00000000-0000-4000-8000-0000000000fa";
const ORG_OTHER = "00000000-0000-4000-8000-0000000000fb";
const AS_OF = "2026-07-10";

const CUST_A = "FAKE-CUST-A";
const CUST_B = "FAKE-CUST-B";
const CUST_C = "FAKE-CUST-C";
const REP_1 = "FAKE-REP-1";

function stagingCustomer(listId, org = ORG, overrides = {}) {
  return {
    organization_id: org,
    qb_list_id: listId,
    is_active: true,
    time_modified: "2026-01-01T00:00:00",
    sync_run_id: "FAKE-RUN-1",
    raw_payload: {
      ListID: listId,
      IsActive: "true",
      // Sentinel only — must never appear in facts/read models.
      Name: "SENTINEL_NAME_DO_NOT_SURFACE",
      BillAddress: { Addr1: "SENTINEL_ADDR_DO_NOT_SURFACE" },
    },
    ...overrides,
  };
}

function stagingInvoice(txnId, customerId, opts = {}) {
  const {
    org = ORG,
    txnDate = "2026-06-01",
    dueDate = "2026-06-15",
    total = "1000.00",
    balance = "1000.00",
    isPaid = "false",
    salesRepId = null,
    linkedTxn = null,
    syncRunId = "FAKE-RUN-1",
    lastSeenAt = null,
  } = opts;
  return {
    organization_id: org,
    qb_txn_id: txnId,
    qb_customer_list_id: customerId,
    txn_date: txnDate,
    sync_run_id: syncRunId,
    last_seen_at: lastSeenAt,
    raw_payload: {
      TxnID: txnId,
      TxnDate: txnDate,
      DueDate: dueDate,
      TotalAmount: total,
      BalanceRemaining: balance,
      IsPaid: isPaid,
      CustomerRef: { ListID: customerId, FullName: "SENTINEL_NAME_DO_NOT_SURFACE" },
      Memo: "SENTINEL_MEMO_DO_NOT_SURFACE",
      ...(salesRepId ? { SalesRepRef: { ListID: salesRepId } } : {}),
      ...(linkedTxn ? { LinkedTxn: linkedTxn } : {}),
    },
  };
}

function stagingPayment(txnId, customerId, opts = {}) {
  const {
    org = ORG,
    txnDate = "2026-06-20",
    total = "500.00",
    linkedInvoiceId = null,
  } = opts;
  return {
    organization_id: org,
    qb_txn_id: txnId,
    qb_customer_list_id: customerId,
    txn_date: txnDate,
    raw_payload: {
      TxnID: txnId,
      TxnDate: txnDate,
      TotalAmount: total,
      CustomerRef: { ListID: customerId, FullName: "SENTINEL_NAME_DO_NOT_SURFACE" },
      ...(linkedInvoiceId
        ? { LinkedTxn: { TxnID: linkedInvoiceId, TxnType: "Invoice" } }
        : {}),
    },
  };
}

function stagingEstimate(txnId, customerId, opts = {}) {
  const {
    org = ORG,
    txnDate = "2026-03-01",
    total = "2000.00",
    isFullyInvoiced = "false",
    isActive = "true",
    linkedInvoiceId = null,
  } = opts;
  return {
    organization_id: org,
    qb_txn_id: txnId,
    qb_customer_list_id: customerId,
    txn_date: txnDate,
    raw_payload: {
      TxnID: txnId,
      TxnDate: txnDate,
      TotalAmount: total,
      IsFullyInvoiced: isFullyInvoiced,
      IsActive: isActive,
      CustomerRef: { ListID: customerId },
      ...(linkedInvoiceId
        ? { LinkedTxn: { TxnID: linkedInvoiceId, TxnType: "Invoice" } }
        : {}),
    },
  };
}

function buildFakeSnapshot() {
  return {
    organizationId: ORG,
    asOfDate: AS_OF,
    customers: [
      stagingCustomer(CUST_A),
      stagingCustomer(CUST_B),
      stagingCustomer(CUST_C),
      // Other org must be ignored.
      stagingCustomer("FAKE-CUST-OTHER", ORG_OTHER),
    ],
    invoices: [
      stagingInvoice("FAKE-INV-1", CUST_A, {
        txnDate: "2026-05-01",
        dueDate: "2026-05-15",
        total: "5000.00",
        balance: "2500.00",
        salesRepId: REP_1,
      }),
      stagingInvoice("FAKE-INV-2", CUST_A, {
        txnDate: "2026-06-01",
        dueDate: "2026-07-20",
        total: "1000.00",
        balance: "0.00",
        isPaid: "true",
        salesRepId: REP_1,
      }),
      stagingInvoice("FAKE-INV-3", CUST_B, {
        txnDate: "2026-04-01",
        dueDate: "2026-04-15",
        total: "800.00",
        balance: "800.00",
      }),
      stagingInvoice("FAKE-INV-OTHER", "FAKE-CUST-OTHER", { org: ORG_OTHER }),
    ],
    payments: [
      stagingPayment("FAKE-PAY-1", CUST_A, {
        txnDate: "2026-06-30",
        total: "1000.00",
        linkedInvoiceId: "FAKE-INV-2",
      }),
      stagingPayment("FAKE-PAY-2", CUST_A, {
        txnDate: "2026-05-20",
        total: "2500.00",
        linkedInvoiceId: "FAKE-INV-1",
      }),
    ],
    estimates: [
      stagingEstimate("FAKE-EST-1", CUST_A, {
        total: "3000.00",
        linkedInvoiceId: "FAKE-INV-1",
      }),
      stagingEstimate("FAKE-EST-2", CUST_B, {
        txnDate: "2026-01-01",
        total: "1500.00",
      }),
      stagingEstimate("FAKE-EST-3", CUST_C, {
        txnDate: "2026-02-01",
        total: "900.00",
        isFullyInvoiced: "true",
        linkedInvoiceId: "FAKE-INV-MISSING",
      }),
    ],
    salesOrders: [
      {
        organization_id: ORG,
        qb_txn_id: "FAKE-SO-1",
        qb_customer_list_id: CUST_A,
        txn_date: "2026-05-15",
        raw_payload: {
          TxnID: "FAKE-SO-1",
          TxnDate: "2026-05-15",
          TotalAmount: "400.00",
          IsFullyInvoiced: "false",
          CustomerRef: { ListID: CUST_A },
        },
      },
    ],
    salesReps: [
      {
        organization_id: ORG,
        qb_list_id: REP_1,
        is_active: true,
        raw_payload: { ListID: REP_1, Initial: "XX", IsActive: "true" },
      },
    ],
  };
}

describe("quickBooksIntelligenceFacts", () => {
  it("parses money scalars including #text wrappers", () => {
    assert.equal(parseQbMoney("1,234.50"), 1234.5);
    assert.equal(parseQbMoney({ "#text": "99.00" }), 99);
    assert.equal(parseQbMoney("not-a-number"), null);
  });

  it("extracts invoice facts without names/memos/raw_payload", () => {
    const fact = extractInvoiceFact(
      stagingInvoice("FAKE-INV-X", CUST_A, { salesRepId: REP_1, balance: "12.34" }),
    );
    assert.ok(fact);
    assert.equal(fact.qb_txn_id, "FAKE-INV-X");
    assert.equal(fact.qb_customer_list_id, CUST_A);
    assert.equal(fact.qb_sales_rep_list_id, REP_1);
    assert.equal(fact.balance_remaining, 12.34);
    assert.equal(fact.is_paid, false);
    assert.equal("raw_payload" in fact, false);
    assert.equal("Name" in fact, false);
    assert.equal("Memo" in fact, false);
    assertNoRawPayload(fact);
  });

  it("extracts linked txn refs as opaque ids only", () => {
    const refs = extractLinkedTxnRefs([
      { TxnID: "FAKE-L1", TxnType: "Invoice", Amount: "DO-NOT-USE" },
      { TxnID: { "#text": "FAKE-L2" }, TxnType: { "#text": "Estimate" } },
    ]);
    assert.deepEqual(refs, [
      { qb_txn_id: "FAKE-L1", txn_type: "Invoice" },
      { qb_txn_id: "FAKE-L2", txn_type: "Estimate" },
    ]);
  });

  it("extracts customer/payment/estimate facts without PII fields", () => {
    const c = extractCustomerFact(stagingCustomer(CUST_A));
    const p = extractPaymentFact(stagingPayment("FAKE-PAY-X", CUST_A));
    const e = extractEstimateFact(stagingEstimate("FAKE-EST-X", CUST_A));
    assert.equal(c.qb_list_id, CUST_A);
    assert.equal(p.total_amount, 500);
    assert.equal(e.total_amount, 2000);
    for (const f of [c, p, e]) {
      assertNoRawPayload(f);
      assert.equal(JSON.stringify(f).includes("SENTINEL"), false);
    }
  });
});

describe("quickBooksIntelligenceDataset", () => {
  it("filters to organization and ignores sync_run_id exclusivity", () => {
    const rows = [
      stagingInvoice("FAKE-INV-1", CUST_A, { syncRunId: "FAKE-RUN-OLD" }),
      stagingInvoice("FAKE-INV-2", CUST_A, { syncRunId: "FAKE-RUN-NEW" }),
      stagingInvoice("FAKE-INV-OTHER", CUST_A, { org: ORG_OTHER }),
    ];
    const filtered = filterOrgCurrentRows(rows, ORG);
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((r) => r.organization_id === ORG));
  });

  it("dedupes by natural key preferring newer last_seen_at", () => {
    const rows = [
      stagingInvoice("FAKE-INV-1", CUST_A, {
        syncRunId: "FAKE-RUN-OLD",
        lastSeenAt: "2026-01-01T00:00:00Z",
        total: "1.00",
        balance: "1.00",
      }),
      stagingInvoice("FAKE-INV-1", CUST_A, {
        syncRunId: "FAKE-RUN-NEW",
        lastSeenAt: "2026-07-01T00:00:00Z",
        total: "2.00",
        balance: "2.00",
      }),
    ];
    const deduped = dedupeCurrentByNaturalKey(rows, (r) => r.qb_txn_id);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].sync_run_id, "FAKE-RUN-NEW");
  });

  it("builds sanitized dataset without raw_payload", () => {
    const dataset = buildIntelligenceDataset(buildFakeSnapshot());
    assert.equal(dataset.organizationId, ORG);
    assert.equal(dataset.customers.length, 3);
    assert.equal(dataset.invoices.length, 3);
    assert.equal(dataset.payments.length, 2);
    assertNoRawPayload(dataset);
    assert.equal(JSON.stringify(dataset).includes("SENTINEL"), false);
    assert.equal(JSON.stringify(dataset).includes("raw_payload"), false);
  });

  it("in-memory source returns empty for other org", async () => {
    const source = createInMemoryIntelligenceSource(buildFakeSnapshot());
    const other = await source.loadOrgCurrentDataset(ORG_OTHER, { asOfDate: AS_OF });
    assert.equal(other.invoices.length, 0);
    assert.equal(other.customers.length, 0);
  });
});

describe("quickBooksIntelligenceRead", () => {
  const dataset = buildIntelligenceDataset(buildFakeSnapshot());

  it("computes customer revenue summary", () => {
    const summary = buildCustomerRevenueSummary(dataset);
    assertNoRawPayload(summary);
    const a = summary.customers.find((c) => c.qb_customer_list_id === CUST_A);
    assert.ok(a);
    assert.equal(a.invoice_count, 2);
    assert.equal(a.billed_total, 6000);
    assert.equal(a.open_balance_total, 2500);
    assert.equal(a.paid_invoice_count, 1);
    assert.ok(summary.totals.billed_total >= 6800);
  });

  it("computes invoice aging buckets", () => {
    assert.equal(daysBetween("2026-05-15", AS_OF), 56);
    assert.equal(invoiceAgingBucket(dataset.invoices.find((i) => i.qb_txn_id === "FAKE-INV-1"), AS_OF), "31_60");
    const aging = buildInvoiceAgingSummary(dataset);
    assert.ok(aging.open_invoice_count >= 2);
    assert.ok(aging.overdue_balance_total >= 2500);
    assert.ok(aging.buckets["31_60"].invoice_count >= 1);
    assertNoRawPayload(aging);
  });

  it("computes payment history with avg days to pay", () => {
    const hist = buildPaymentHistorySummary(dataset);
    const a = hist.customers.find((c) => c.qb_customer_list_id === CUST_A);
    assert.ok(a);
    assert.equal(a.payment_count, 2);
    // INV-2 (2026-06-01) -> PAY-1 (2026-06-30) = 29 days
    // INV-1 (2026-05-01) -> PAY-2 (2026-05-20) = 19 days
    assert.equal(a.avg_days_to_pay, 24);
    assertNoRawPayload(hist);
  });

  it("computes estimate/SO/invoice flow", () => {
    const flow = buildEstimateSalesOrderInvoiceFlow(dataset);
    assert.equal(flow.estimates.count, 3);
    assert.equal(flow.estimates.linked_to_invoice_count, 2); // EST-1 linked + EST-3 fully invoiced
    assert.equal(flow.estimates.unlinked_count, 1);
    assert.equal(flow.sales_orders.count, 1);
    assert.equal(flow.sales_orders.unlinked_count, 1);
    assertNoRawPayload(flow);
  });

  it("computes sales rep summary", () => {
    const reps = buildSalesRepSummary(dataset);
    assert.equal(reps.sales_reps.length, 1);
    assert.equal(reps.sales_reps[0].qb_sales_rep_list_id, REP_1);
    assert.equal(reps.sales_reps[0].known_in_sales_reps, true);
    assert.equal(reps.sales_reps[0].billed_total, 6000);
    assert.ok(reps.unassigned.invoice_count >= 1);
    assertNoRawPayload(reps);
  });

  it("computes customer activity trend by month", () => {
    const trend = buildCustomerActivityTrend(dataset);
    assert.ok(trend.months.some((m) => m.month === "2026-05"));
    assert.ok(trend.months.some((m) => m.month === "2026-06"));
    assertNoRawPayload(trend);
  });

  it("buildAllQuickBooksReadModels returns all keys without raw_payload", () => {
    const all = buildAllQuickBooksReadModels(dataset);
    for (const key of [
      "customer_revenue",
      "invoice_aging",
      "payment_history",
      "estimate_sales_order_invoice_flow",
      "sales_rep_summary",
      "customer_activity_trend",
    ]) {
      assert.ok(all[key], key);
    }
    assertNoRawPayload(all);
    assert.equal(JSON.stringify(all).includes("SENTINEL"), false);
  });
});

describe("quickBooksIntelligenceInsights", () => {
  const dataset = buildIntelligenceDataset(buildFakeSnapshot());

  it("flags overdue AR risks", () => {
    const insight = insightOverdueArRisks(dataset);
    assert.ok(insight.count >= 2);
    assert.ok(insight.items.every((i) => i.days_overdue > 0));
    assert.ok(insight.items.some((i) => i.qb_txn_id === "FAKE-INV-1"));
    assertNoRawPayload(insight);
  });

  it("flags slow-paying customers", () => {
    // Lower threshold so FAKE-CUST-A (avg 24) is not required; CUST_B has overdue open AR.
    const insight = insightSlowPayingCustomers(dataset, { minAvgDaysToPay: 20 });
    assert.ok(insight.items.some((i) => i.qb_customer_list_id === CUST_A));
    assert.ok(insight.items.some((i) => i.qb_customer_list_id === CUST_B));
    assertNoRawPayload(insight);
  });

  it("ranks high-value customers", () => {
    const insight = insightHighValueCustomers(dataset, { topN: 2 });
    assert.equal(insight.items[0].qb_customer_list_id, CUST_A);
    assert.equal(insight.items[0].rank, 1);
    assert.ok(insight.items[0].billed_total >= (insight.items[1]?.billed_total ?? 0));
    assertNoRawPayload(insight);
  });

  it("flags dormant customers", () => {
    const insight = insightDormantCustomers(dataset, { lookbackDays: 60 });
    // CUST_C has no invoices/payments in snapshot.
    assert.ok(insight.items.some((i) => i.qb_customer_list_id === CUST_C));
    assertNoRawPayload(insight);
  });

  it("flags estimate-to-invoice leakage", () => {
    const insight = insightEstimateToInvoiceLeakage(dataset);
    assert.ok(insight.items.some((i) => i.qb_txn_id === "FAKE-EST-2"));
    assert.equal(
      insight.items.some((i) => i.qb_txn_id === "FAKE-EST-1"),
      false,
    );
    assertNoRawPayload(insight);
  });

  it("ranks unpaid invoice risk", () => {
    const insight = insightUnpaidInvoiceRisk(dataset);
    assert.ok(insight.count >= 2);
    assert.ok(insight.items[0].risk_score >= insight.items[1].risk_score);
    assert.ok(insight.items.every((i) => i.balance_remaining > 0));
    assertNoRawPayload(insight);
  });

  it("buildAllQuickBooksInsights covers all insight keys", () => {
    const all = buildAllQuickBooksInsights(dataset);
    for (const key of [
      "overdue_ar_risks",
      "slow_paying_customers",
      "high_value_customers",
      "dormant_customers",
      "estimate_to_invoice_leakage",
      "unpaid_invoice_risk",
    ]) {
      assert.ok(all[key], key);
      assert.equal(all[key].insight, key);
    }
    assertNoRawPayload(all);
    assert.equal(JSON.stringify(all).includes("SENTINEL"), false);
    assert.equal(JSON.stringify(all).includes("SERVICE_ROLE"), false);
    assert.equal(JSON.stringify(all).includes("supabase"), false);
  });
});
