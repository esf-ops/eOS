/**
 * Phase 4B QuickBooks intelligence Supabase repository + service tests.
 * Mocked Supabase only — no network, no credentials, fake sentinel data only.
 *
 * Run: node backend-core/src/quickbooks/quickBooksIntelligenceSupabaseRepository.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import {
  createQuickBooksIntelligenceSupabaseRepository,
  QB_INTELLIGENCE_DEFAULT_PAGE_SIZE,
  QB_INTELLIGENCE_SELECT,
  QB_INTELLIGENCE_TABLES,
  resolveIntelligencePageSize,
} from "./quickBooksIntelligenceSupabaseRepository.js";
import {
  createQuickBooksIntelligenceService,
  flattenInsightList,
  loadExecutiveIntelligenceSnapshot,
} from "./quickBooksIntelligenceService.js";

const ORG = "00000000-0000-4000-8000-0000000000fa";
const ORG_OTHER = "00000000-0000-4000-8000-0000000000fb";
const AS_OF = "2026-07-10";
const CUST_A = "FAKE-CUST-A";
const CUST_B = "FAKE-CUST-B";
const REP_1 = "FAKE-REP-1";

/**
 * Mock Supabase that serves in-memory table rows with select/eq/order/range.
 * Records query metadata for assertions. Never holds credentials.
 */
function createMockSupabase(tables) {
  /** @type {Array<{ table: string, columns: string, filters: object, from: number, to: number }>} */
  const selects = [];
  let failTable = null;

  function makeBuilder(table) {
    const q = {
      table,
      columns: null,
      filters: {},
      orderCol: null,
      from: null,
      to: null,
    };

    const exec = async () => {
      if (failTable && table === failTable) {
        return {
          data: null,
          error: { code: "57014", message: "RAW_TIMEOUT_SHOULD_NEVER_LEAK SENTINEL_NAME" },
        };
      }
      selects.push({
        table,
        columns: q.columns,
        filters: { ...q.filters },
        from: q.from,
        to: q.to,
      });

      let rows = Array.isArray(tables[table]) ? [...tables[table]] : [];
      if (q.filters.organization_id != null) {
        rows = rows.filter((r) => r.organization_id === q.filters.organization_id);
      }
      if (q.orderCol) {
        rows.sort((a, b) => String(a[q.orderCol]).localeCompare(String(b[q.orderCol])));
      }
      if (q.from != null && q.to != null) {
        rows = rows.slice(q.from, q.to + 1);
      }
      return { data: rows, error: null };
    };

    const b = {
      select(columns) {
        q.columns = columns;
        return b;
      },
      eq(col, val) {
        q.filters[col] = val;
        return b;
      },
      order(col) {
        q.orderCol = col;
        return b;
      },
      range(from, to) {
        q.from = from;
        q.to = to;
        return exec();
      },
      then(onF, onR) {
        return exec().then(onF, onR);
      },
    };
    return b;
  }

  return {
    client: { from: makeBuilder },
    selects,
    failOnTable(table) {
      failTable = table;
    },
  };
}

function seedTables() {
  return {
    [QB_INTELLIGENCE_TABLES.customers]: [
      {
        id: "id-c1",
        organization_id: ORG,
        qb_list_id: CUST_A,
        is_active: true,
        time_modified: "2026-01-01T00:00:00",
        last_seen_at: "2026-07-01T00:00:00Z",
        raw_payload: {
          ListID: CUST_A,
          Name: "SENTINEL_NAME_DO_NOT_SURFACE",
          BillAddress: { Addr1: "SENTINEL_ADDR" },
        },
      },
      {
        id: "id-c2",
        organization_id: ORG,
        qb_list_id: CUST_B,
        is_active: true,
        time_modified: "2026-01-01T00:00:00",
        last_seen_at: "2026-07-01T00:00:00Z",
        raw_payload: { ListID: CUST_B, Name: "SENTINEL_NAME_DO_NOT_SURFACE" },
      },
      {
        id: "id-c-other",
        organization_id: ORG_OTHER,
        qb_list_id: "FAKE-CUST-OTHER",
        is_active: true,
        raw_payload: { ListID: "FAKE-CUST-OTHER", Name: "SENTINEL_OTHER" },
      },
    ],
    [QB_INTELLIGENCE_TABLES.invoices]: [
      {
        id: "id-i1",
        organization_id: ORG,
        qb_txn_id: "FAKE-INV-1",
        qb_customer_list_id: CUST_A,
        txn_date: "2026-05-01",
        last_seen_at: "2026-07-01T00:00:00Z",
        sync_run_id: "FAKE-RUN-OLD",
        raw_payload: {
          TxnID: "FAKE-INV-1",
          TxnDate: "2026-05-01",
          DueDate: "2026-05-15",
          TotalAmount: "5000.00",
          BalanceRemaining: "2500.00",
          IsPaid: "false",
          CustomerRef: { ListID: CUST_A, FullName: "SENTINEL_NAME_DO_NOT_SURFACE" },
          SalesRepRef: { ListID: REP_1 },
          Memo: "SENTINEL_MEMO_DO_NOT_SURFACE",
        },
      },
      {
        id: "id-i2",
        organization_id: ORG,
        qb_txn_id: "FAKE-INV-2",
        qb_customer_list_id: CUST_A,
        txn_date: "2026-06-01",
        last_seen_at: "2026-07-01T00:00:00Z",
        sync_run_id: "FAKE-RUN-NEW",
        raw_payload: {
          TxnID: "FAKE-INV-2",
          TxnDate: "2026-06-01",
          DueDate: "2026-07-20",
          TotalAmount: "1000.00",
          BalanceRemaining: "0.00",
          IsPaid: "true",
          CustomerRef: { ListID: CUST_A },
          SalesRepRef: { ListID: REP_1 },
        },
      },
      {
        id: "id-i3",
        organization_id: ORG,
        qb_txn_id: "FAKE-INV-3",
        qb_customer_list_id: CUST_B,
        txn_date: "2026-04-01",
        last_seen_at: "2026-07-01T00:00:00Z",
        raw_payload: {
          TxnID: "FAKE-INV-3",
          TxnDate: "2026-04-01",
          DueDate: "2026-04-15",
          TotalAmount: "800.00",
          BalanceRemaining: "800.00",
          IsPaid: "false",
          CustomerRef: { ListID: CUST_B },
        },
      },
      {
        id: "id-i-other",
        organization_id: ORG_OTHER,
        qb_txn_id: "FAKE-INV-OTHER",
        qb_customer_list_id: "FAKE-CUST-OTHER",
        txn_date: "2026-05-01",
        raw_payload: {
          TxnID: "FAKE-INV-OTHER",
          TotalAmount: "999.00",
          BalanceRemaining: "999.00",
          CustomerRef: { ListID: "FAKE-CUST-OTHER", FullName: "SENTINEL_OTHER" },
        },
      },
    ],
    [QB_INTELLIGENCE_TABLES.invoiceLines]: [
      {
        id: "id-l1",
        organization_id: ORG,
        qb_txn_id: "FAKE-INV-1",
        line_seq_number: 0,
        qb_txn_line_id: "FAKE-LINE-1",
        qb_item_list_id: "FAKE-ITEM-1",
        line_type: "InvoiceLineRet",
        txn_date: "2026-05-01",
        raw_payload: { Desc: "SENTINEL_DESC_DO_NOT_SURFACE", Amount: "5000.00" },
      },
      {
        id: "id-l2",
        organization_id: ORG,
        qb_txn_id: "FAKE-INV-1",
        line_seq_number: 1,
        qb_txn_line_id: "FAKE-LINE-2",
        qb_item_list_id: "FAKE-ITEM-2",
        line_type: "InvoiceLineRet",
        txn_date: "2026-05-01",
      },
      {
        id: "id-l-other",
        organization_id: ORG_OTHER,
        qb_txn_id: "FAKE-INV-OTHER",
        line_seq_number: 0,
        qb_item_list_id: "FAKE-ITEM-X",
        line_type: "InvoiceLineRet",
      },
    ],
    [QB_INTELLIGENCE_TABLES.payments]: [
      {
        id: "id-p1",
        organization_id: ORG,
        qb_txn_id: "FAKE-PAY-1",
        qb_customer_list_id: CUST_A,
        txn_date: "2026-06-30",
        raw_payload: {
          TxnID: "FAKE-PAY-1",
          TxnDate: "2026-06-30",
          TotalAmount: "1000.00",
          CustomerRef: { ListID: CUST_A, FullName: "SENTINEL_NAME_DO_NOT_SURFACE" },
          LinkedTxn: { TxnID: "FAKE-INV-2", TxnType: "Invoice" },
        },
      },
    ],
    [QB_INTELLIGENCE_TABLES.estimates]: [
      {
        id: "id-e1",
        organization_id: ORG,
        qb_txn_id: "FAKE-EST-1",
        qb_customer_list_id: CUST_A,
        txn_date: "2026-03-01",
        raw_payload: {
          TxnID: "FAKE-EST-1",
          TxnDate: "2026-03-01",
          TotalAmount: "3000.00",
          IsFullyInvoiced: "false",
          CustomerRef: { ListID: CUST_A },
          LinkedTxn: { TxnID: "FAKE-INV-1", TxnType: "Invoice" },
        },
      },
      {
        id: "id-e2",
        organization_id: ORG,
        qb_txn_id: "FAKE-EST-2",
        qb_customer_list_id: CUST_B,
        txn_date: "2026-01-01",
        raw_payload: {
          TxnID: "FAKE-EST-2",
          TxnDate: "2026-01-01",
          TotalAmount: "1500.00",
          IsFullyInvoiced: "false",
          CustomerRef: { ListID: CUST_B },
        },
      },
    ],
    [QB_INTELLIGENCE_TABLES.salesOrders]: [
      {
        id: "id-s1",
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
    [QB_INTELLIGENCE_TABLES.salesReps]: [
      {
        id: "id-r1",
        organization_id: ORG,
        qb_list_id: REP_1,
        is_active: true,
        raw_payload: { ListID: REP_1, Initial: "XX", IsActive: "true" },
      },
    ],
  };
}

describe("resolveIntelligencePageSize", () => {
  it("defaults and clamps page size", () => {
    assert.equal(resolveIntelligencePageSize(undefined), QB_INTELLIGENCE_DEFAULT_PAGE_SIZE);
    assert.equal(resolveIntelligencePageSize(0), QB_INTELLIGENCE_DEFAULT_PAGE_SIZE);
    assert.equal(resolveIntelligencePageSize(50), 50);
    assert.equal(resolveIntelligencePageSize(99999), 2000);
  });
});

describe("createQuickBooksIntelligenceSupabaseRepository", () => {
  it("requires injected getSupabase", () => {
    assert.throws(
      () => createQuickBooksIntelligenceSupabaseRepository({}),
      /getSupabase is required/,
    );
  });

  it("loads org-scoped facts without raw_payload or sentinel PII", async () => {
    const mock = createMockSupabase(seedTables());
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
      pageSize: 100,
    });

    const customers = await repo.loadCustomers(ORG);
    const invoices = await repo.loadInvoices(ORG);
    const payments = await repo.loadPayments(ORG);
    const estimates = await repo.loadEstimates(ORG);
    const salesOrders = await repo.loadSalesOrders(ORG);
    const salesReps = await repo.loadSalesReps(ORG);
    const lines = await repo.loadInvoiceLines(ORG);

    assert.equal(customers.length, 2);
    assert.equal(invoices.length, 3);
    assert.equal(payments.length, 1);
    assert.equal(estimates.length, 2);
    assert.equal(salesOrders.length, 1);
    assert.equal(salesReps.length, 1);
    assert.equal(lines.length, 2);

    const inv1 = invoices.find((i) => i.qb_txn_id === "FAKE-INV-1");
    assert.ok(inv1);
    assert.equal(inv1.balance_remaining, 2500);
    assert.equal(inv1.qb_sales_rep_list_id, REP_1);

    assert.equal(lines[0].qb_txn_id, "FAKE-INV-1");
    assert.equal(lines[0].line_seq_number, 0);

    for (const value of [customers, invoices, payments, estimates, salesOrders, salesReps, lines]) {
      assertNoRawPayload(value);
      assert.equal(JSON.stringify(value).includes("SENTINEL"), false);
      assert.equal(JSON.stringify(value).includes("raw_payload"), false);
    }

    // Never filtered by sync_run_id — both old and new run invoices present.
    assert.ok(mock.selects.every((s) => !("sync_run_id" in s.filters)));
    assert.ok(mock.selects.every((s) => s.filters.organization_id === ORG));
  });

  it("pages large tables with range chunks", async () => {
    const invoices = [];
    for (let i = 0; i < 5; i += 1) {
      invoices.push({
        id: `id-i-${String(i).padStart(3, "0")}`,
        organization_id: ORG,
        qb_txn_id: `FAKE-INV-PAGE-${i}`,
        qb_customer_list_id: CUST_A,
        txn_date: "2026-06-01",
        raw_payload: {
          TxnID: `FAKE-INV-PAGE-${i}`,
          TxnDate: "2026-06-01",
          TotalAmount: "10.00",
          BalanceRemaining: "0.00",
          IsPaid: "true",
          CustomerRef: { ListID: CUST_A },
        },
      });
    }
    const mock = createMockSupabase({
      ...seedTables(),
      [QB_INTELLIGENCE_TABLES.invoices]: invoices,
    });
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
      pageSize: 2,
    });

    const facts = await repo.loadInvoices(ORG);
    assert.equal(facts.length, 5);

    const invoiceSelects = mock.selects.filter((s) => s.table === QB_INTELLIGENCE_TABLES.invoices);
    assert.ok(invoiceSelects.length >= 3);
    assert.deepEqual(
      invoiceSelects.map((s) => [s.from, s.to]),
      [
        [0, 1],
        [2, 3],
        [4, 5],
      ],
    );
    assert.ok(invoiceSelects.every((s) => s.columns === QB_INTELLIGENCE_SELECT.invoices));
  });

  it("respects maxRows safety limit", async () => {
    const invoices = [];
    for (let i = 0; i < 10; i += 1) {
      invoices.push({
        id: `id-i-${i}`,
        organization_id: ORG,
        qb_txn_id: `FAKE-INV-MAX-${i}`,
        qb_customer_list_id: CUST_A,
        txn_date: "2026-06-01",
        raw_payload: {
          TxnID: `FAKE-INV-MAX-${i}`,
          TotalAmount: "1.00",
          BalanceRemaining: "0",
          IsPaid: "true",
          CustomerRef: { ListID: CUST_A },
        },
      });
    }
    const mock = createMockSupabase({
      [QB_INTELLIGENCE_TABLES.invoices]: invoices,
    });
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
      pageSize: 3,
    });
    const facts = await repo.loadInvoices(ORG, { maxRows: 4 });
    assert.equal(facts.length, 4);
  });

  it("omits raw_payload from invoice-line select by default", async () => {
    const mock = createMockSupabase(seedTables());
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
    });
    await repo.loadInvoiceLines(ORG);
    const lineSelect = mock.selects.find((s) => s.table === QB_INTELLIGENCE_TABLES.invoiceLines);
    assert.ok(lineSelect);
    assert.equal(lineSelect.columns, QB_INTELLIGENCE_SELECT.invoiceLines);
    assert.equal(lineSelect.columns.includes("raw_payload"), false);

    mock.selects.length = 0;
    await repo.loadInvoiceLines(ORG, { includeRawPayload: true });
    const withRaw = mock.selects.find((s) => s.table === QB_INTELLIGENCE_TABLES.invoiceLines);
    assert.equal(withRaw.columns, QB_INTELLIGENCE_SELECT.invoiceLinesWithRaw);
  });

  it("loadOrgCurrentDataset strips raw_payload and scopes to org", async () => {
    const mock = createMockSupabase(seedTables());
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
    });
    const dataset = await repo.loadOrgCurrentDataset(ORG, { asOfDate: AS_OF });
    assert.equal(dataset.organizationId, ORG);
    assert.equal(dataset.customers.length, 2);
    assert.equal(dataset.invoices.length, 3);
    assert.equal(dataset.invoiceLines.length, 0);
    assert.equal(dataset.load_meta.include_invoice_lines, false);
    assertNoRawPayload(dataset);
    assert.equal(JSON.stringify(dataset).includes("SENTINEL"), false);
  });

  it("loadOrgCurrentDataset can include invoice line facts", async () => {
    const mock = createMockSupabase(seedTables());
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
    });
    const dataset = await repo.loadOrgCurrentDataset(ORG, {
      asOfDate: AS_OF,
      includeInvoiceLines: true,
    });
    assert.equal(dataset.invoiceLines.length, 2);
    assert.equal(dataset.load_meta.staging_row_counts.invoice_lines, 2);
    assertNoRawPayload(dataset.invoiceLines);
  });

  it("sanitizes repository errors (no raw DB / PII leak)", async () => {
    const mock = createMockSupabase(seedTables());
    mock.failOnTable(QB_INTELLIGENCE_TABLES.invoices);
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
    });
    await assert.rejects(
      () => repo.loadInvoices(ORG),
      (err) => {
        assert.match(String(err.message), /qb intelligence repository/);
        assert.equal(err.code, "57014");
        assert.equal(String(err.message).includes("SENTINEL"), false);
        assert.equal(String(err.message).includes("RAW_TIMEOUT"), false);
        return true;
      },
    );
  });

  it("does not construct clients or read env", () => {
    const src = createQuickBooksIntelligenceSupabaseRepository.toString();
    // Factory body should not embed createClient / env reads; DI only.
    assert.equal(src.includes("createClient"), false);
    assert.equal(src.includes("process.env"), false);
    assert.equal(src.includes("SERVICE_ROLE"), false);
  });
});

describe("quickBooksIntelligenceService", () => {
  it("builds executive snapshot with read models + insight list", async () => {
    const mock = createMockSupabase(seedTables());
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
    });
    const snapshot = await loadExecutiveIntelligenceSnapshot(repo, ORG, {
      asOfDate: AS_OF,
      insightListLimit: 50,
    });

    assert.equal(snapshot.organization_id, ORG);
    assert.equal(snapshot.as_of_date, AS_OF);
    assert.ok(snapshot.ar_summary);
    assert.ok(snapshot.revenue_summary);
    assert.ok(snapshot.payment_summary);
    assert.ok(snapshot.estimate_sales_order_invoice_flow);
    assert.ok(snapshot.sales_rep_summary);
    assert.ok(snapshot.customer_activity_trend);
    assert.ok(snapshot.insights.overdue_ar_risks);
    assert.ok(Array.isArray(snapshot.insight_list));
    assert.ok(snapshot.insight_list.length > 0);
    assert.ok(snapshot.ar_summary.open_balance_total >= 2500);
    assert.ok(snapshot.revenue_summary.customers.some((c) => c.qb_customer_list_id === CUST_A));

    assertNoRawPayload(snapshot);
    const json = JSON.stringify(snapshot);
    assert.equal(json.includes("SENTINEL"), false);
    assert.equal(json.includes("raw_payload"), false);
    assert.equal(json.includes("SERVICE_ROLE"), false);
    assert.equal(json.includes("supabase"), false);
  });

  it("service factory delegates to loadExecutiveSnapshot", async () => {
    const mock = createMockSupabase(seedTables());
    const repo = createQuickBooksIntelligenceSupabaseRepository({
      getSupabase: () => mock.client,
    });
    const service = createQuickBooksIntelligenceService(repo);
    const snapshot = await service.loadExecutiveSnapshot(ORG, { asOfDate: AS_OF });
    assert.equal(snapshot.organization_id, ORG);
    assertNoRawPayload(snapshot);
  });

  it("flattenInsightList ranks high severity first", () => {
    const list = flattenInsightList({
      overdue_ar_risks: {
        items: [
          {
            qb_txn_id: "FAKE-1",
            qb_customer_list_id: CUST_A,
            severity: "low",
            days_overdue: 5,
          },
        ],
      },
      unpaid_invoice_risk: {
        items: [
          {
            qb_txn_id: "FAKE-2",
            qb_customer_list_id: CUST_B,
            is_overdue: true,
            risk_score: 99,
          },
        ],
      },
      slow_paying_customers: { items: [] },
      high_value_customers: { items: [] },
      dormant_customers: { items: [] },
      estimate_to_invoice_leakage: { items: [] },
    });
    assert.equal(list[0].insight, "unpaid_invoice_risk");
    assert.equal(list[0].severity, "high");
  });
});
