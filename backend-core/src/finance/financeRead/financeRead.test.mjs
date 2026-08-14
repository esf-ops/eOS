/**
 * Finance Head read APIs — authorization, org isolation, Accrual snapshots,
 * unavailable-vs-zero, cash event roles, browser-safe scrubbing.
 * Run: npm run eos:test:finance-read
 */

import assert from "node:assert/strict";
import { attachFinanceReadRoutes, FINANCE_HEAD_SLUG } from "./financeReadApi.js";
import { resolvePnlPeriod } from "./periods.js";
import { selectBalanceSheetSnapshot, selectPnlSnapshot } from "./reportModel.js";
import { selectContiguousMonthlyPnlWindows } from "./ytdAggregate.js";
import { isForbiddenFinanceKey, scrubFinanceValueForBrowser, assertNoForbiddenKeys } from "./serialize.js";
import { createFinanceReadService } from "./service.js";
import { FINANCE_METRIC_STATES } from "./constants.js";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-08-14T15:00:00Z");

function createMemorySupabase(tables) {
  return {
    from(table) {
      const source = tables[table];
      const missing = source === undefined;
      const rows = missing ? [] : [...source];
      const state = {
        filters: [],
        orders: [],
        limit: null,
        range: null,
        maybeSingle: false
      };
      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          state.filters.push((r) => r[col] === val);
          return api;
        },
        in(col, vals) {
          state.filters.push((r) => vals.includes(r[col]));
          return api;
        },
        gte(col, val) {
          state.filters.push((r) => String(r[col] ?? "") >= String(val));
          return api;
        },
        lte(col, val) {
          state.filters.push((r) => String(r[col] ?? "") <= String(val));
          return api;
        },
        order(col, opts = {}) {
          state.orders.push({ col, ascending: opts.ascending !== false });
          return api;
        },
        limit(n) {
          state.limit = n;
          return api;
        },
        range(from, to) {
          state.range = [from, to];
          return api;
        },
        maybeSingle() {
          state.maybeSingle = true;
          return execute();
        },
        then(resolve, reject) {
          return execute().then(resolve, reject);
        }
      };
      function execute() {
        if (missing) {
          return Promise.resolve({
            data: null,
            error: { code: "PGRST205", message: `Could not find the table '${table}' in the schema cache` }
          });
        }
        let out = rows.filter((r) => state.filters.every((f) => f(r)));
        for (const o of state.orders) {
          out.sort((a, b) => {
            const av = a[o.col];
            const bv = b[o.col];
            if (av === bv) return 0;
            const cmp = String(av ?? "") < String(bv ?? "") ? -1 : 1;
            return o.ascending ? cmp : -cmp;
          });
        }
        if (state.range) out = out.slice(state.range[0], state.range[1] + 1);
        else if (state.limit != null) out = out.slice(0, state.limit);
        if (state.maybeSingle) return Promise.resolve({ data: out[0] ?? null, error: null });
        return Promise.resolve({ data: out, error: null });
      }
      return api;
    }
  };
}

function lastDay(year, monthIndex0) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).toISOString().slice(0, 10);
}

function pnlLineSet(income, cogs, expense) {
  const gp = income - cogs;
  const ni = gp - expense;
  return [
    { line_order: 0, label: "Income", amount: null, row_type: "Header" },
    { line_order: 1, label: "Fixture Stone Sales", amount: income, row_type: "Data" },
    { line_order: 2, label: "Total Income", amount: income, row_type: "Total" },
    { line_order: 3, label: "Cost of Goods Sold", amount: null, row_type: "Header" },
    { line_order: 4, label: "Slab Cost", amount: cogs, row_type: "Data" },
    { line_order: 5, label: "Total COGS", amount: cogs, row_type: "Total" },
    { line_order: 6, label: "Gross Profit", amount: gp, row_type: "Total" },
    { line_order: 7, label: "Expense", amount: null, row_type: "Header" },
    { line_order: 8, label: "Rent", amount: expense, row_type: "Data" },
    { line_order: 9, label: "Total Expense", amount: expense, row_type: "Total" },
    { line_order: 10, label: "Net Income", amount: ni, row_type: "Total" }
  ];
}

function monthlyPnl({ id, org = ORG_A, year, monthIndex0, periodEnd = null, income, cogs, expense, captured }) {
  const start = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
  const end = periodEnd || lastDay(year, monthIndex0);
  const gp = income - cogs;
  const ni = gp - expense;
  return {
    snap: {
      id,
      organization_id: org,
      report_type: "profit_and_loss",
      source_view: "ProfitAndLossStandard",
      report_basis: "Accrual",
      period_start: start,
      period_end: end,
      as_of_date: null,
      is_opening: false,
      control_totals: { total_income: income, total_cogs: cogs, total_expense: expense, net_income: ni },
      captured_at: captured
    },
    lines: pnlLineSet(income, cogs, expense).map((l) => ({ ...l, organization_id: org, snapshot_id: id }))
  };
}

const MONTHLY_2026 = [];
for (let m = 0; m < 7; m += 1) {
  MONTHLY_2026.push(
    monthlyPnl({
      id: `snap-pnl-2026-${String(m + 1).padStart(2, "0")}`,
      year: 2026,
      monthIndex0: m,
      income: 100,
      cogs: 40,
      expense: 10,
      captured: `2026-${String(m + 2).padStart(2, "0")}-01T12:00:00Z`
    })
  );
}
MONTHLY_2026.push(
  monthlyPnl({
    id: "snap-pnl-2026-08",
    year: 2026,
    monthIndex0: 7,
    periodEnd: "2026-08-14",
    income: 50,
    cogs: 20,
    expense: 5,
    captured: "2026-08-14T12:00:00Z"
  })
);

const YTD_2026 = {
  revenue: 750,
  cogs: 300,
  gross_profit: 450,
  operating_expenses: 75,
  net_income: 375,
  gross_margin_pct: 60
};

const fixtureLinesPnl = pnlLineSet(400000, 160000, 40000);

const fixtureLinesBs = [
  { line_order: 0, label: "Assets", amount: null, row_type: "Header" },
  { line_order: 1, label: "Checking", amount: 88000, row_type: "Data" },
  { line_order: 2, label: "Total Assets", amount: 9987679.41, row_type: "Total" },
  { line_order: 3, label: "Liabilities", amount: null, row_type: "Header" },
  { line_order: 4, label: "Accounts Payable", amount: 12000, row_type: "Data" },
  { line_order: 5, label: "Equity", amount: null, row_type: "Header" },
  { line_order: 6, label: "Retained Earnings", amount: 9975679.41, row_type: "Data" },
  { line_order: 7, label: "Total Liabilities & Equity", amount: 9987679.41, row_type: "Total" }
];

function baseTables() {
  return {
    qb_finance_report_snapshots: [
      ...MONTHLY_2026.map((m) => m.snap),
      {
        id: "snap-pnl-wide",
        organization_id: ORG_A,
        report_type: "profit_and_loss",
        source_view: "ProfitAndLossStandard",
        report_basis: "Accrual",
        period_start: "2026-01-01",
        period_end: "2026-08-14",
        as_of_date: null,
        is_opening: false,
        control_totals: { total_income: 400000, total_cogs: 160000, total_expense: 40000, net_income: 200000 },
        captured_at: "2026-08-14T11:00:00Z"
      },
      {
        id: "snap-bs-current",
        organization_id: ORG_A,
        report_type: "balance_sheet",
        source_view: "BalanceSheetStandard",
        report_basis: "Accrual",
        period_start: null,
        period_end: null,
        as_of_date: "2026-08-14",
        is_opening: false,
        control_totals: { total_assets: 9987679.41, total_liabilities_and_equity: 9987679.41 },
        captured_at: "2026-08-14T12:00:00Z"
      },
      {
        id: "snap-bs-opening",
        organization_id: ORG_A,
        report_type: "balance_sheet",
        source_view: "BalanceSheetStandard",
        report_basis: "Accrual",
        period_start: null,
        period_end: null,
        as_of_date: "2024-12-31",
        is_opening: true,
        control_totals: { total_assets: 100, total_liabilities_and_equity: 100 },
        captured_at: "2026-08-10T12:00:00Z"
      },
      {
        id: "snap-pnl-org-b",
        organization_id: ORG_B,
        report_type: "profit_and_loss",
        source_view: "ProfitAndLossStandard",
        report_basis: "Accrual",
        period_start: "2026-01-01",
        period_end: "2026-08-14",
        is_opening: false,
        control_totals: { total_income: 9, net_income: 9 },
        captured_at: "2026-08-14T12:00:00Z"
      }
    ],
    qb_finance_report_lines: [
      ...MONTHLY_2026.flatMap((m) => m.lines),
      ...fixtureLinesPnl.map((l) => ({ ...l, organization_id: ORG_A, snapshot_id: "snap-pnl-wide" })),
      ...fixtureLinesBs.map((l) => ({ ...l, organization_id: ORG_A, snapshot_id: "snap-bs-current" })),
      {
        organization_id: ORG_B,
        snapshot_id: "snap-pnl-org-b",
        line_order: 0,
        label: "Total Income",
        amount: 9,
        row_type: "Total"
      }
    ],
    qb_finance_sync_runs: [
      {
        organization_id: ORG_A,
        domain: "accounting",
        run_kind: "incremental",
        status: "success",
        started_at: "2026-08-14T11:00:00Z",
        completed_at: "2026-08-14T11:05:00Z",
        coverage_start_date: "2026-06-15",
        coverage_end_date: "2026-08-14",
        warnings: [],
        error_summary: null,
        report_basis: "Accrual"
      },
      {
        organization_id: ORG_A,
        domain: "cash",
        run_kind: "incremental",
        status: "success",
        started_at: "2026-08-14T11:00:00Z",
        completed_at: "2026-08-14T11:06:00Z",
        coverage_start_date: "2026-06-15",
        coverage_end_date: "2026-08-14",
        warnings: [],
        error_summary: null,
        report_basis: "Accrual"
      },
      {
        organization_id: ORG_A,
        domain: "ap",
        run_kind: "incremental",
        status: "success",
        started_at: "2026-08-14T11:00:00Z",
        completed_at: "2026-08-14T11:06:00Z",
        coverage_start_date: "2026-06-15",
        coverage_end_date: "2026-08-14",
        warnings: [],
        error_summary: null,
        report_basis: "Accrual"
      },
      {
        organization_id: ORG_A,
        domain: "revenue_ar",
        run_kind: "incremental",
        status: "success",
        started_at: "2026-08-14T11:00:00Z",
        completed_at: "2026-08-14T11:06:00Z",
        coverage_start_date: "2026-06-15",
        coverage_end_date: "2026-08-14",
        warnings: [],
        error_summary: null,
        report_basis: "Accrual"
      },
      {
        organization_id: ORG_A,
        domain: "master",
        run_kind: "incremental",
        status: "success",
        started_at: "2026-08-14T11:00:00Z",
        completed_at: "2026-08-14T11:06:00Z",
        coverage_start_date: "2026-06-15",
        coverage_end_date: "2026-08-14",
        warnings: [],
        error_summary: null,
        report_basis: "Accrual"
      }
    ],
    qb_finance_reconciliation_results: [
      {
        organization_id: ORG_A,
        check_type: "balance_sheet_identity",
        report_basis: "Accrual",
        as_of_date: "2026-08-14",
        eliteos_value: 9987679.41,
        quickbooks_value: 9987679.41,
        delta: 0,
        tolerance_abs: 1,
        status: "pass",
        created_at: "2026-08-14T12:00:00Z"
      }
    ],
    sales_quickbooks_open_ar_current: [
      {
        organization_id: ORG_A,
        customer_name: "Fixture Customer Alpha",
        balance: 12000,
        due_date: "2026-07-01",
        invoice_date: "2026-06-01",
        reference_number: "INV-100",
        original_amount: 12000,
        synced_at: "2026-08-14T11:00:00Z",
        qb_customer_list_id: "QB-CUST-SECRET",
        source_invoice_id: "TXN-SECRET"
      },
      {
        organization_id: ORG_A,
        customer_name: "Fixture Customer Beta",
        balance: 3000,
        due_date: "2026-09-01",
        invoice_date: "2026-08-01",
        reference_number: "INV-101",
        original_amount: 3000,
        synced_at: "2026-08-14T11:00:00Z"
      },
      {
        organization_id: ORG_B,
        customer_name: "Other Org Customer",
        balance: 999999,
        due_date: "2026-01-01",
        invoice_date: "2026-01-01",
        reference_number: "INV-OTHER",
        original_amount: 999999
      }
    ],
    qb_finance_payment_applications: [
      {
        organization_id: ORG_A,
        customer_name: "Fixture Customer Alpha",
        payment_date: "2026-08-10",
        applied_amount: 500,
        applied_reference_number: "INV-099",
        applied_txn_type: "Invoice",
        receive_payment_id: "PAY-SECRET",
        applied_to_ref_id: "INV-SECRET"
      }
    ],
    qb_finance_open_ap_current: [
      {
        organization_id: ORG_A,
        vendor_name: "Fixture Vendor Stone",
        open_amount: 8000,
        original_amount: 8000,
        due_date: "2026-07-15",
        bill_date: "2026-06-15",
        reference_number: "BILL-20",
        terms_name: "Net 30",
        qb_bill_id: "BILL-SECRET"
      },
      {
        organization_id: ORG_A,
        vendor_name: "Fixture Vendor Tools",
        open_amount: 0,
        original_amount: 400,
        due_date: "2026-08-01",
        bill_date: "2026-07-01",
        reference_number: "BILL-21"
      }
    ],
    qb_finance_bills: [
      {
        organization_id: ORG_A,
        vendor_name: "Fixture Vendor Stone",
        amount: 8000,
        open_amount: 8000,
        is_paid: false,
        txn_date: "2026-06-15",
        due_date: "2026-07-15",
        reference_number: "BILL-20",
        qb_bill_id: "BILL-SECRET"
      }
    ],
    qb_finance_bill_applications: [
      {
        organization_id: ORG_A,
        vendor_name: "Fixture Vendor Stone",
        payment_date: "2026-08-01",
        payment_method: "check",
        applied_amount: 200,
        applied_reference_number: "BILL-19",
        applied_balance_remaining: 0,
        bill_payment_id: "BP-SECRET"
      }
    ],
    qb_finance_cash_events: [
      {
        organization_id: ORG_A,
        event_role: "customer_receipt",
        source_txn_type: "ReceivePayment",
        source_txn_id: "PAY-1",
        txn_date: "2026-08-02",
        amount: 1500,
        account_name: "Undeposited Funds"
      },
      {
        organization_id: ORG_A,
        event_role: "bank_deposit",
        source_txn_type: "Deposit",
        source_txn_id: "DEP-1",
        txn_date: "2026-08-03",
        amount: 1500,
        account_name: "Checking"
      },
      {
        organization_id: ORG_A,
        event_role: "bank_deposit_line",
        source_txn_type: "DepositLineItem",
        source_txn_id: "DEP-1",
        linked_txn_type: "ReceivePayment",
        linked_txn_id: "PAY-1",
        txn_date: "2026-08-03",
        amount: 1500
      },
      {
        organization_id: ORG_A,
        event_role: "bank_disbursement",
        source_txn_type: "Check",
        source_txn_id: "CHK-1",
        txn_date: "2026-08-04",
        amount: 250
      },
      {
        organization_id: ORG_A,
        event_role: "transfer",
        source_txn_type: "Transfer",
        source_txn_id: "TR-1",
        txn_date: "2026-08-05",
        amount: 100
      }
    ],
    qb_finance_deposits: [
      {
        organization_id: ORG_A,
        txn_date: "2026-08-03",
        deposit_to_account_name: "Checking",
        total_deposit: 1500,
        qb_deposit_id: "DEP-SECRET"
      }
    ],
    qb_finance_checks: [
      {
        organization_id: ORG_A,
        txn_date: "2026-08-04",
        payee_name: "Fixture Payee",
        amount: 250,
        qb_check_id: "CHK-SECRET"
      }
    ],
    qb_finance_transfers: [
      {
        organization_id: ORG_A,
        txn_date: "2026-08-05",
        from_account_name: "Checking",
        to_account_name: "Savings",
        amount: 100,
        qb_transfer_id: "TR-SECRET"
      }
    ],
    qb_finance_account_balances_current: [
      {
        organization_id: ORG_A,
        account_name: "Checking",
        account_type: "Bank",
        balance: 88000,
        qb_account_id: "ACC-SECRET"
      },
      {
        organization_id: ORG_A,
        account_name: "Visa",
        account_type: "Credit Card",
        balance: -2000
      }
    ],
    qb_finance_undeposited_current: [
      { organization_id: ORG_A, amount: 400, customer_name: "Fixture Customer Alpha", txn_date: "2026-08-13" }
    ]
  };
}

function serviceFor(tables = baseTables()) {
  return createFinanceReadService({
    getSupabase: () => createMemorySupabase(tables),
    now: () => NOW
  });
}

const staffReq = { user: { id: "user-a", role: "finance", organization_id: ORG_A } };

{
  const period = resolvePnlPeriod({ preset: "ytd" }, NOW);
  assert.equal(period.ok, true);
  assert.equal(period.period.period_start, "2026-01-01");
  assert.equal(period.period.period_end, "2026-08-14");
  const bad = resolvePnlPeriod({ period_start: "2026-02-01", period_end: "2026-01-01" }, NOW);
  assert.equal(bad.ok, false);
}

{
  const snap = selectPnlSnapshot(
    baseTables().qb_finance_report_snapshots.filter((s) => s.organization_id === ORG_A),
    {
      periodStart: "2026-01-01",
      periodEnd: "2026-08-14"
    }
  );
  assert.equal(snap.id, "snap-pnl-wide");
  const cash = selectPnlSnapshot(
    [
      {
        id: "cash-basis",
        report_type: "profit_and_loss",
        source_view: "ProfitAndLossStandard",
        report_basis: "Cash",
        period_start: "2026-01-01",
        period_end: "2026-08-14",
        is_opening: false,
        captured_at: "2026-08-14T12:00:00Z"
      }
    ],
    { periodStart: "2026-01-01", periodEnd: "2026-08-14" }
  );
  assert.equal(cash, null);
  const opening = selectBalanceSheetSnapshot(baseTables().qb_finance_report_snapshots, {
    asOf: "2026-08-14",
    allowOpening: false
  });
  assert.equal(opening.id, "snap-bs-current");
  assert.equal(opening.is_opening, false);
}

{
  assert.equal(isForbiddenFinanceKey("qb_txn_id"), true);
  assert.equal(isForbiddenFinanceKey("receive_payment_id"), true);
  const scrubbed = scrubFinanceValueForBrowser({
    customer_name: "Fixture Customer Alpha",
    qb_txn_id: "TXN",
    receive_payment_id: "PAY",
    nested: { snapshot_id: "abc", open_amount: 1 }
  });
  assert.equal(scrubbed.qb_txn_id, undefined);
  assert.equal(scrubbed.nested.snapshot_id, undefined);
  assert.equal(scrubbed.nested.open_amount, 1);
}

{
  const svc = serviceFor();
  const overview = await svc.getOverview(staffReq);
  assert.equal(overview.ok, true);
  assert.equal(overview.report_basis, "Accrual");
  assert.equal(overview.metrics.revenue.value, YTD_2026.revenue);
  assert.equal(overview.metrics.revenue.state, FINANCE_METRIC_STATES.AVAILABLE);
  assert.equal(overview.metrics.revenue.period_start, "2026-01-01");
  assert.equal(overview.metrics.revenue.period_end, "2026-08-14");
  assert.equal(overview.metrics.revenue.is_derived, true);
  assert.equal(overview.ytd_period.period_end, "2026-08-14");
  assert.equal(overview.ytd_period.is_derived, true);
  assert.equal(overview.metrics.gross_profit.value, YTD_2026.gross_profit);
  assert.equal(overview.metrics.net_income.value, YTD_2026.net_income);
  assert.equal(overview.metrics.gross_margin_pct.value, YTD_2026.gross_margin_pct);
  assert.equal(overview.metrics.cash.value, 88000);
  assert.equal(overview.metrics.open_ar.value, 15000);
  assert.equal(overview.metrics.overdue_ar.value, 12000);
  assert.equal(overview.metrics.open_ap.value, 8000);
  assert.equal(overview.balance_sheet_identity.status, "pass");
  assert.equal(overview.metrics.revenue.value === 0, false);
  assertNoForbiddenKeys(overview);
  assert.equal(JSON.stringify(overview).includes("QB-CUST-SECRET"), false);
  assert.equal(JSON.stringify(overview).includes("TXN-SECRET"), false);
  assert.equal(overview.metrics.open_ar.value !== 999999, true);
}

{
  const svc = serviceFor();
  const other = await svc.getOverview({ user: { id: "u2", role: "finance", organization_id: ORG_B } });
  assert.notEqual(other.metrics.revenue?.value, YTD_2026.revenue);
  assert.equal(other.metrics.revenue?.state, "unavailable");
  assert.equal(other.metrics.open_ar.value, 999999);
}

{
  const svc = serviceFor();
  const missing = await svc.getOverview({ user: { id: "u3", role: "finance" } });
  assert.equal(missing.metrics.revenue, undefined);
  assert.equal(missing.unavailable_reason, "missing_organization");
}

{
  const tables = baseTables();
  tables.qb_finance_report_snapshots = tables.qb_finance_report_snapshots.filter((s) => s.report_type !== "profit_and_loss");
  const overview = await serviceFor(tables).getOverview(staffReq);
  assert.equal(overview.metrics.revenue.value, null);
  assert.equal(overview.metrics.revenue.state, "unavailable");
  assert.notEqual(overview.metrics.revenue.value, 0);
}

{
  const tables = baseTables();
  tables.sales_quickbooks_open_ar_current = [];
  const ar = await serviceFor(tables).getAr(staffReq);
  assert.equal(ar.total.value, 0);
  assert.equal(ar.total.state, "available");
}

{
  const tables = baseTables();
  delete tables.sales_quickbooks_open_ar_current;
  const ar = await serviceFor(tables).getAr(staffReq);
  assert.equal(ar.total.value, null);
  assert.equal(ar.total.state, "unavailable");
}

{
  const tables = baseTables();
  tables.sales_quickbooks_open_ar_current = tables.sales_quickbooks_open_ar_current.map((r) =>
    r.organization_id === ORG_A ? { ...r, due_date: null } : r
  );
  const ar = await serviceFor(tables).getAr(staffReq);
  assert.equal(ar.aging.state, "unavailable");
  assert.equal(ar.overdue.state, "unavailable");
  assert.equal(ar.total.state, "available");
}

{
  const pnl = await serviceFor().getPnl(staffReq, resolvePnlPeriod({ preset: "ytd" }, NOW));
  assert.equal(pnl.state, "available");
  assert.equal(pnl.is_derived, true);
  assert.equal(pnl.coverage_complete, true);
  assert.equal(pnl.period_start, "2026-01-01");
  assert.equal(pnl.period_end, "2026-08-14");
  assert.notEqual(pnl.period_end, "2026-01-31");
  assert.equal(pnl.headline.revenue, YTD_2026.revenue);
  assert.equal(pnl.headline.net_income, YTD_2026.net_income);
  assert.equal(pnl.headline.gross_profit, YTD_2026.gross_profit);
  assert.equal(pnl.headline.gross_margin_pct, YTD_2026.gross_margin_pct);
  assert.equal(pnl.source_view, "ProfitAndLossStandard");
  assert.equal(pnl.snapshot, null);
  assert.equal(pnl.hierarchy_state, "unavailable");
  assert.equal(pnl.lines.length, 0);
  assert.equal(pnl.compare.coverage_complete, false);
  assert.equal(pnl.compare_headline, null);
  assert.equal(pnl.contributing_windows.length, 8);
  assert.equal(pnl.contributing_windows[7].period_end, "2026-08-14");
  assert.equal(JSON.stringify(pnl).includes("snap-pnl-"), false);
}

{
  const current = await serviceFor().getPnl(staffReq, resolvePnlPeriod({ preset: "current_month" }, NOW));
  assert.equal(current.state, "available");
  assert.equal(current.is_derived, false);
  assert.equal(current.period_start, "2026-08-01");
  assert.equal(current.period_end, "2026-08-14");
  assert.equal(current.headline.revenue, 50);
  assert.equal(current.hierarchy_state, "available");
  assert.ok(current.lines.some((l) => l.label === "Gross Profit"));
}

{
  const prev = await serviceFor().getPnl(staffReq, resolvePnlPeriod({ preset: "previous_month" }, NOW));
  assert.equal(prev.is_derived, false);
  assert.equal(prev.period_start, "2026-07-01");
  assert.equal(prev.period_end, "2026-07-31");
  assert.equal(prev.headline.revenue, 100);
}

{
  const selected = selectContiguousMonthlyPnlWindows(baseTables().qb_finance_report_snapshots, {
    year: 2026,
    throughEnd: "2026-08-14"
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.period_start, "2026-01-01");
  assert.equal(selected.period_end, "2026-08-14");
  assert.equal(selected.windows.length, 8);
}

{
  const tables = baseTables();
  tables.qb_finance_report_snapshots = tables.qb_finance_report_snapshots.filter((s) => s.id !== "snap-pnl-2026-02");
  const pnl = await serviceFor(tables).getPnl(staffReq, resolvePnlPeriod({ preset: "ytd" }, NOW));
  assert.equal(pnl.state, "unavailable");
  assert.equal(pnl.coverage_complete, false);
  assert.match(String(pnl.notes), /2026-02/);
  assert.equal(pnl.headline, null);
  assert.notEqual(pnl.headline?.net_income, 0);
}

{
  const tables = baseTables();
  const extra = monthlyPnl({
    id: "snap-pnl-2026-01-old",
    year: 2026,
    monthIndex0: 0,
    income: 9999,
    cogs: 1,
    expense: 1,
    captured: "2026-01-15T12:00:00Z"
  });
  tables.qb_finance_report_snapshots.push(extra.snap);
  tables.qb_finance_report_lines.push(...extra.lines);
  const pnl = await serviceFor(tables).getPnl(staffReq, resolvePnlPeriod({ preset: "ytd" }, NOW));
  assert.equal(pnl.headline.revenue, YTD_2026.revenue);
}

{
  const tables = baseTables();
  for (let m = 0; m < 7; m += 1) {
    const row = monthlyPnl({
      id: `snap-pnl-2025-${String(m + 1).padStart(2, "0")}`,
      year: 2025,
      monthIndex0: m,
      income: 80,
      cogs: 30,
      expense: 8,
      captured: `2025-${String(m + 2).padStart(2, "0")}-01T12:00:00Z`
    });
    tables.qb_finance_report_snapshots.push(row.snap);
    tables.qb_finance_report_lines.push(...row.lines);
  }
  const aug = monthlyPnl({
    id: "snap-pnl-2025-08",
    year: 2025,
    monthIndex0: 7,
    periodEnd: "2025-08-14",
    income: 40,
    cogs: 15,
    expense: 4,
    captured: "2025-08-14T12:00:00Z"
  });
  tables.qb_finance_report_snapshots.push(aug.snap);
  tables.qb_finance_report_lines.push(...aug.lines);
  const pnl = await serviceFor(tables).getPnl(staffReq, resolvePnlPeriod({ preset: "ytd" }, NOW));
  assert.equal(pnl.compare.coverage_complete, true);
  assert.equal(pnl.comparison_period_start, "2025-01-01");
  assert.equal(pnl.comparison_period_end, "2025-08-14");
  assert.equal(pnl.compare_headline.revenue, 600);
}

{
  const tables = baseTables();
  for (let m = 0; m < 7; m += 1) {
    const row = monthlyPnl({
      id: `snap-pnl-2025-${String(m + 1).padStart(2, "0")}`,
      year: 2025,
      monthIndex0: m,
      income: 80,
      cogs: 30,
      expense: 8,
      captured: `2025-${String(m + 2).padStart(2, "0")}-01T12:00:00Z`
    });
    tables.qb_finance_report_snapshots.push(row.snap);
    tables.qb_finance_report_lines.push(...row.lines);
  }
  const aug = monthlyPnl({
    id: "snap-pnl-2025-08-full",
    year: 2025,
    monthIndex0: 7,
    periodEnd: "2025-08-31",
    income: 90,
    cogs: 20,
    expense: 5,
    captured: "2025-09-01T12:00:00Z"
  });
  tables.qb_finance_report_snapshots.push(aug.snap);
  tables.qb_finance_report_lines.push(...aug.lines);
  const pnl = await serviceFor(tables).getPnl(staffReq, resolvePnlPeriod({ preset: "ytd" }, NOW));
  assert.equal(pnl.state, "available");
  assert.equal(pnl.compare.coverage_complete, false);
  assert.equal(pnl.compare_headline, null);
  assert.equal(pnl.comparison_period_end, "2025-08-14");
}

{
  const bs = await serviceFor().getBalanceSheet(staffReq, { as_of: "2026-08-14" });
  assert.equal(bs.state, "available");
  assert.equal(bs.identity.status, "pass");
  assert.equal(bs.snapshot.is_opening, false);
  assert.equal(bs.opening.as_of_date, "2024-12-31");
}

{
  const cash = await serviceFor().getCash(staffReq);
  assert.equal(cash.position.value, 88000);
  const roles = Object.fromEntries(cash.by_event_role.map((r) => [r.event_role, r]));
  assert.equal(roles.customer_receipt.amount, 1500);
  assert.equal(roles.bank_deposit.amount, 1500);
  assert.equal(cash.anti_double_count.would_double_count_if_summed, true);
  assert.deepEqual(cash.anti_double_count.do_not_sum, ["customer_receipt", "bank_deposit"]);
  assertNoForbiddenKeys(cash);
}

{
  const recon = await serviceFor().getReconciliation(staffReq);
  assert.equal(recon.domains.accounting.status, "success");
  assert.equal(recon.balance_sheet_identity.status, "pass");
  assert.equal(recon.domains.master.domain, "master");
}

{
  const routes = new Map();
  const app = {
    get(path, ...handlers) {
      routes.set(`GET ${path}`, handlers);
    }
  };
  attachFinanceReadRoutes(app, {
    requireAuth: () => (req, res, next) => {
      if (!req.user) return res.status(401).json({ ok: false, error: "Unauthorized" });
      next();
    },
    requireRole: (roles) => (req, res, next) => {
      const role = req.user.role;
      if (role === "admin" || role === "super_admin" || roles.includes(role)) return next();
      return res.status(403).json({ ok: false, error: "Forbidden" });
    },
    requireHeadAccess: (slug) => (req, res, next) => {
      assert.equal(slug, FINANCE_HEAD_SLUG);
      if (req.user.role === "admin" || req.user.role === "super_admin") return next();
      if (!(req.user.heads || []).includes("finance")) {
        return res.status(403).json({ ok: false, error: "You do not have access to this head." });
      }
      next();
    },
    getSupabase: () => createMemorySupabase(baseTables()),
    now: () => NOW
  });

  async function invoke(path, req) {
    const handlers = routes.get(`GET ${path}`);
    const res = {
      statusCode: 200,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
      set() {
        return this;
      }
    };
    await new Promise((resolve) => {
      let i = 0;
      const next = (err) => {
        if (err) {
          res.status(500).json({ ok: false, error: String(err) });
          return resolve();
        }
        const h = handlers[i++];
        if (!h) return resolve();
        let advanced = false;
        const wrappedNext = (e) => {
          advanced = true;
          next(e);
        };
        Promise.resolve()
          .then(() => h(req, res, wrappedNext))
          .then(() => {
            if (!advanced) resolve();
          }, (e) => next(e));
      };
      next();
    });
    return res;
  }

  const unauth = await invoke("/api/finance/overview", { query: {} });
  assert.equal(unauth.statusCode, 401);

  const sales = await invoke("/api/finance/overview", {
    user: { id: "s", role: "sales", organization_id: ORG_A, heads: ["finance"] },
    query: {}
  });
  assert.equal(sales.statusCode, 403);

  const noHead = await invoke("/api/finance/overview", {
    user: { id: "f", role: "finance", organization_id: ORG_A, heads: [] },
    query: {}
  });
  assert.equal(noHead.statusCode, 403);

  const ok = await invoke("/api/finance/overview", {
    user: { id: "f", role: "finance", organization_id: ORG_A, heads: ["finance"] },
    query: {}
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.metrics.revenue.value, YTD_2026.revenue);
  assert.equal(ok.body.metrics.revenue.period_end, "2026-08-14");
  assertNoForbiddenKeys(ok.body);

  const badPnl = await invoke("/api/finance/pnl", {
    user: { id: "f", role: "finance", organization_id: ORG_A, heads: ["finance"] },
    query: { period_start: "nope", period_end: "2026-01-01" }
  });
  assert.equal(badPnl.statusCode, 400);

  for (const p of [
    "/api/finance/overview",
    "/api/finance/pnl",
    "/api/finance/balance-sheet",
    "/api/finance/ar",
    "/api/finance/ap",
    "/api/finance/cash",
    "/api/finance/reconciliation"
  ]) {
    assert.ok(routes.has(`GET ${p}`), p);
  }
}

console.log("financeRead.test.mjs: ok");
