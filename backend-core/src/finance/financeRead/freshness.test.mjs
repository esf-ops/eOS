/**
 * Cadence-aware Finance freshness contract.
 * Run: node backend-core/src/finance/financeRead/freshness.test.mjs
 */

import assert from "node:assert/strict";
import {
  applyFreshness,
  buildDomainHealthMap,
  combineFactAndDomainFreshness,
  DEFAULT_FINANCE_INTRADAY_STALE_AFTER_SECONDS,
  DEFAULT_FINANCE_NIGHTLY_STALE_AFTER_SECONDS,
  domainFreshness,
  FINANCE_METRIC_FRESHNESS_OWNER,
  overallFreshness,
  ownerFreshnessState,
  readDomainStaleAfterSeconds
} from "./freshness.mjs";
import { FINANCE_METRIC_STATES } from "./constants.js";
import { createFinanceReadService } from "./service.js";

const ORG = "11111111-1111-4111-8111-111111111111";

/** 2026-08-17 09:00 America/Chicago = 14:00 UTC (CDT) */
const AT_9AM_CT = new Date("2026-08-17T14:00:00.000Z");

function successRun(domain, completedAt, extra = {}) {
  return {
    domain,
    status: "success",
    started_at: completedAt,
    completed_at: completedAt,
    coverage_start_date: "2026-01-01",
    coverage_end_date: "2026-08-17",
    warnings: [],
    ...extra
  };
}

/** Observed production morning schedule (Central → UTC). */
function morningRuns20260817() {
  return {
    revenue_ar: successRun("revenue_ar", "2026-08-17T13:22:00.000Z"), // 08:22 CT
    ap: successRun("ap", "2026-08-17T13:33:00.000Z"), // 08:33 CT
    cash: successRun("cash", "2026-08-17T13:40:00.000Z"), // 08:40 CT
    accounting: successRun("accounting", "2026-08-17T06:11:00.000Z"), // 01:11 CT
    master: successRun("master", "2026-08-17T06:25:00.000Z") // 01:25 CT
  };
}

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
        ilike() {
          return api;
        },
        gte(col, val) {
          state.filters.push((r) => String(r[col] ?? "") >= String(val));
          return api;
        },
        lt(col, val) {
          state.filters.push((r) => r[col] != null && String(r[col]) < String(val));
          return api;
        },
        lte(col, val) {
          state.filters.push((r) => String(r[col] ?? "") <= String(val));
          return api;
        },
        is(col, val) {
          state.filters.push((r) => (val == null ? r[col] == null : r[col] === val));
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
        if (state.orders.length) {
          out.sort((a, b) => {
            for (const o of state.orders) {
              const av = a[o.col];
              const bv = b[o.col];
              if (av === bv) continue;
              const cmp = String(av ?? "") < String(bv ?? "") ? -1 : 1;
              return o.ascending ? cmp : -cmp;
            }
            return 0;
          });
        }
        if (state.range) out = out.slice(state.range[0], state.range[1] + 1);
        else if (state.limit != null) out = out.slice(0, state.limit);
        if (state.maybeSingle) {
          return Promise.resolve({ data: out[0] || null, error: null });
        }
        return Promise.resolve({ data: out, error: null });
      }
      return api;
    }
  };
}

function financeTables(overrides = {}) {
  const runs = Object.values(morningRuns20260817()).map((r) => ({
    ...r,
    organization_id: ORG,
    id: `${r.domain}-run`
  }));
  return {
    qb_finance_sync_runs: runs,
    sales_quickbooks_sync_runs: [
      {
        id: "sales-run",
        organization_id: ORG,
        status: "success",
        started_at: "2026-08-17T12:56:00.000Z",
        completed_at: "2026-08-17T12:56:00.000Z",
        coverage_start_date: "2026-01-01",
        coverage_end_date: "2026-08-17",
        warnings: []
      }
    ],
    qb_finance_report_snapshots: [
      {
        organization_id: ORG,
        report_type: "profit_and_loss",
        source_view: "ProfitAndLossStandard",
        report_basis: "Accrual",
        period_start: "2026-08-01",
        period_end: "2026-08-17",
        as_of_date: null,
        is_opening: false,
        captured_at: "2026-08-17T06:11:00.000Z",
        control_totals: {
          total_income: 100000,
          total_cogs: 40000,
          total_expense: 30000,
          net_income: 30000
        },
        lines: []
      },
      {
        organization_id: ORG,
        report_type: "balance_sheet",
        source_view: "BalanceSheetStandard",
        report_basis: "Accrual",
        period_start: null,
        period_end: null,
        as_of_date: "2026-08-16",
        is_opening: false,
        captured_at: "2026-08-17T06:11:00.000Z",
        control_totals: {
          total_assets: 500000,
          total_liabilities_and_equity: 500000
        },
        lines: [
          { label: "Total Assets", row_type: "total", amount: 500000, line_order: 1 },
          { label: "Total Liabilities & Equity", row_type: "total", amount: 500000, line_order: 2 }
        ]
      }
    ],
    sales_quickbooks_open_ar_current: [
      {
        organization_id: ORG,
        customer_name: "Acme",
        balance: 1200,
        due_date: "2026-09-01",
        invoice_date: "2026-08-01",
        reference_number: "1001",
        original_amount: 1200,
        synced_at: "2026-08-17T12:56:00.000Z"
      }
    ],
    qb_finance_open_ap_current: [
      {
        organization_id: ORG,
        vendor_name: "Vendor Co",
        open_amount: 800,
        due_date: "2026-09-01",
        bill_date: "2026-08-01",
        reference_number: "B-1",
        original_amount: 800,
        synced_at: "2026-08-17T13:33:00.000Z"
      }
    ],
    qb_finance_bills: [],
    qb_finance_bill_applications: [],
    qb_finance_payment_applications: [],
    qb_finance_cash_events: [],
    qb_finance_deposits: [],
    qb_finance_checks: [],
    qb_finance_transfers: [],
    qb_finance_account_balances_current: [
      {
        organization_id: ORG,
        account_name: "Operating",
        account_type: "Bank",
        balance: 25000,
        account_balance: 25000,
        as_of_captured_at: "2026-08-17T06:25:00.000Z"
      }
    ],
    qb_finance_undeposited_current: [],
    qb_finance_reconciliation_results: [],
    ...overrides
  };
}

{
  assert.equal(DEFAULT_FINANCE_INTRADAY_STALE_AFTER_SECONDS, 4 * 60 * 60);
  assert.equal(DEFAULT_FINANCE_NIGHTLY_STALE_AFTER_SECONDS, 26 * 60 * 60);
  assert.equal(readDomainStaleAfterSeconds("ap", {}), 4 * 60 * 60);
  assert.equal(readDomainStaleAfterSeconds("accounting", {}), 26 * 60 * 60);
  assert.equal(readDomainStaleAfterSeconds("master", {}), 26 * 60 * 60);
  assert.equal(
    readDomainStaleAfterSeconds("accounting", { QB_FINANCE_ACCOUNTING_STALE_AFTER_SECONDS: "7200" }),
    7200
  );
  assert.equal(
    readDomainStaleAfterSeconds("ap", { QB_FINANCE_STALE_AFTER_SECONDS: "7200" }),
    7200
  );
  console.log("ok defaults + env overrides");
}

{
  const built = buildDomainHealthMap(morningRuns20260817(), AT_9AM_CT, {});
  for (const d of ["revenue_ar", "ap", "cash", "accounting", "master"]) {
    assert.equal(built.domains[d].stale, false, `${d} should not be stale at 09:00 CT`);
    assert.equal(built.domains[d].state, FINANCE_METRIC_STATES.AVAILABLE, d);
  }
  assert.equal(built.domains.accounting.presentation, "fresh_nightly");
  assert.equal(built.domains.master.presentation, "fresh_nightly");
  assert.equal(built.domains.ap.presentation, "fresh");
  assert.equal(built.freshness, FINANCE_METRIC_STATES.AVAILABLE);
  console.log("ok 2026-08-17 09:00 CT scenario — all domains fresh, overall available");
}

{
  const accountingOld = {
    ...morningRuns20260817(),
    accounting: successRun("accounting", "2026-08-15T06:11:00.000Z")
  };
  const built = buildDomainHealthMap(accountingOld, AT_9AM_CT, {});
  assert.equal(built.domains.accounting.stale, true);
  assert.equal(built.domains.accounting.state, FINANCE_METRIC_STATES.STALE);
  assert.equal(built.domains.ap.stale, false);
  assert.equal(built.freshness, FINANCE_METRIC_STATES.STALE);
  console.log("ok accounting beyond nightly threshold is stale; ap remains fresh");
}

{
  const masterOld = {
    ...morningRuns20260817(),
    master: successRun("master", "2026-08-15T06:25:00.000Z")
  };
  const built = buildDomainHealthMap(masterOld, AT_9AM_CT, {});
  assert.equal(built.domains.master.stale, true);
  assert.equal(built.domains.cash.stale, false);
  console.log("ok master beyond nightly threshold is stale; cash remains fresh");
}

{
  for (const domain of ["revenue_ar", "ap", "cash"]) {
    const runs = {
      ...morningRuns20260817(),
      [domain]: successRun(domain, "2026-08-17T08:00:00.000Z") // >4h before 14:00Z
    };
    const built = buildDomainHealthMap(runs, AT_9AM_CT, {});
    assert.equal(built.domains[domain].stale, true, `${domain} should be stale`);
    assert.equal(built.domains.accounting.stale, false);
  }
  console.log("ok intraday domains stale after 4h without contaminating accounting");
}

{
  const failed = domainFreshness(
    { domain: "ap", status: "failed", completed_at: "2026-08-17T13:00:00.000Z", error_summary: "boom" },
    AT_9AM_CT,
    14400,
    { domain: "ap" }
  );
  assert.equal(failed.state, FINANCE_METRIC_STATES.UNAVAILABLE);
  assert.equal(failed.stale, false);

  const running = domainFreshness(
    { domain: "ap", status: "running", started_at: "2026-08-17T13:50:00.000Z" },
    AT_9AM_CT,
    14400,
    { domain: "ap" }
  );
  assert.equal(running.state, FINANCE_METRIC_STATES.WARNING);
  assert.equal(running.stale, false);

  const partial = domainFreshness(
    {
      domain: "ap",
      status: "partial",
      completed_at: "2026-08-17T13:33:00.000Z",
      warnings: ["x"]
    },
    AT_9AM_CT,
    14400,
    { domain: "ap" }
  );
  assert.equal(partial.state, FINANCE_METRIC_STATES.WARNING);
  assert.equal(partial.stale, false);
  console.log("ok failed/running/partial semantics preserved");
}

{
  const domains = {
    accounting: { state: FINANCE_METRIC_STATES.STALE },
    ap: { state: FINANCE_METRIC_STATES.AVAILABLE },
    cash: { state: FINANCE_METRIC_STATES.AVAILABLE },
    master: { state: FINANCE_METRIC_STATES.AVAILABLE },
    revenue_ar: { state: FINANCE_METRIC_STATES.AVAILABLE }
  };
  assert.equal(ownerFreshnessState(domains, FINANCE_METRIC_FRESHNESS_OWNER.revenue), "stale");
  assert.equal(ownerFreshnessState(domains, FINANCE_METRIC_FRESHNESS_OWNER.open_ap), "available");
  const pnl = applyFreshness(
    { key: "revenue", value: 1, state: FINANCE_METRIC_STATES.AVAILABLE },
    ownerFreshnessState(domains, "accounting")
  );
  const ap = applyFreshness(
    { key: "open_ap", value: 1, state: FINANCE_METRIC_STATES.AVAILABLE },
    ownerFreshnessState(domains, "ap")
  );
  assert.equal(pnl.state, FINANCE_METRIC_STATES.STALE);
  assert.equal(ap.state, FINANCE_METRIC_STATES.AVAILABLE);
  assert.equal(overallFreshness(domains), FINANCE_METRIC_STATES.STALE);
  console.log("ok stale accounting does not make AP metrics stale");
}

{
  const domains = {
    accounting: { state: FINANCE_METRIC_STATES.AVAILABLE },
    ap: { state: FINANCE_METRIC_STATES.STALE },
    cash: { state: FINANCE_METRIC_STATES.AVAILABLE },
    master: { state: FINANCE_METRIC_STATES.AVAILABLE },
    revenue_ar: { state: FINANCE_METRIC_STATES.AVAILABLE }
  };
  assert.equal(
    applyFreshness(
      { key: "revenue", value: 1, state: FINANCE_METRIC_STATES.AVAILABLE },
      ownerFreshnessState(domains, "accounting")
    ).state,
    FINANCE_METRIC_STATES.AVAILABLE
  );
  assert.equal(
    applyFreshness(
      { key: "open_ap", value: 1, state: FINANCE_METRIC_STATES.AVAILABLE },
      ownerFreshnessState(domains, "ap")
    ).state,
    FINANCE_METRIC_STATES.STALE
  );
  console.log("ok stale AP does not make P&L metrics stale");
}

{
  const domains = {
    accounting: { state: FINANCE_METRIC_STATES.AVAILABLE },
    ap: { state: FINANCE_METRIC_STATES.AVAILABLE },
    cash: { state: FINANCE_METRIC_STATES.STALE },
    master: { state: FINANCE_METRIC_STATES.AVAILABLE },
    revenue_ar: { state: FINANCE_METRIC_STATES.AVAILABLE }
  };
  assert.equal(ownerFreshnessState(domains, FINANCE_METRIC_FRESHNESS_OWNER.cash), "available");
  assert.equal(ownerFreshnessState(domains, FINANCE_METRIC_FRESHNESS_OWNER.cash_events), "stale");
  console.log("ok stale cash does not make master-owned bank balances stale");
}

{
  const domainState = FINANCE_METRIC_STATES.AVAILABLE;
  const escalated = combineFactAndDomainFreshness(
    domainState,
    "2026-08-16T06:25:00.000Z",
    AT_9AM_CT,
    DEFAULT_FINANCE_INTRADAY_STALE_AFTER_SECONDS
  );
  assert.equal(escalated, FINANCE_METRIC_STATES.STALE);
  const nightlyOk = combineFactAndDomainFreshness(
    domainState,
    "2026-08-17T06:25:00.000Z",
    AT_9AM_CT,
    DEFAULT_FINANCE_NIGHTLY_STALE_AFTER_SECONDS
  );
  assert.equal(nightlyOk, FINANCE_METRIC_STATES.AVAILABLE);
  console.log("ok prepared-fact timestamp combine");
}

{
  const svc = createFinanceReadService({
    getSupabase: () => createMemorySupabase(financeTables()),
    env: {},
    now: () => AT_9AM_CT
  });
  const overview = await svc.getOverview({ user: { organization_id: ORG } });
  assert.equal(overview.freshness, FINANCE_METRIC_STATES.AVAILABLE);
  assert.equal(overview.metrics.open_ap.state, FINANCE_METRIC_STATES.AVAILABLE);
  assert.equal(overview.metrics.cash.state, FINANCE_METRIC_STATES.AVAILABLE);
  assert.equal(overview.domains.accounting.presentation, "fresh_nightly");
  assert.equal(overview.domains.master.presentation, "fresh_nightly");
  assert.equal(overview.domains.ap.stale, false);

  const staleApTables = financeTables({
    qb_finance_sync_runs: Object.values({
      ...morningRuns20260817(),
      ap: successRun("ap", "2026-08-17T08:00:00.000Z")
    }).map((r) => ({ ...r, organization_id: ORG, id: `${r.domain}-run` }))
  });
  const svc2 = createFinanceReadService({
    getSupabase: () => createMemorySupabase(staleApTables),
    env: {},
    now: () => AT_9AM_CT
  });
  const overview2 = await svc2.getOverview({ user: { organization_id: ORG } });
  assert.equal(overview2.metrics.open_ap.state, FINANCE_METRIC_STATES.STALE);
  assert.equal(overview2.domains.accounting.state, FINANCE_METRIC_STATES.AVAILABLE);
  assert.equal(overview2.freshness, FINANCE_METRIC_STATES.STALE);

  const staleAccounting = financeTables({
    qb_finance_sync_runs: Object.values({
      ...morningRuns20260817(),
      accounting: successRun("accounting", "2026-08-15T06:11:00.000Z")
    }).map((r) => ({ ...r, organization_id: ORG, id: `${r.domain}-run` }))
  });
  const svc3 = createFinanceReadService({
    getSupabase: () => createMemorySupabase(staleAccounting),
    env: {},
    now: () => AT_9AM_CT
  });
  const overview3 = await svc3.getOverview({ user: { organization_id: ORG } });
  assert.equal(overview3.domains.accounting.state, FINANCE_METRIC_STATES.STALE);
  assert.equal(overview3.metrics.open_ap.state, FINANCE_METRIC_STATES.AVAILABLE);
  assert.equal(overview3.metrics.cash.state, FINANCE_METRIC_STATES.AVAILABLE);

  const staleCash = financeTables({
    qb_finance_sync_runs: Object.values({
      ...morningRuns20260817(),
      cash: successRun("cash", "2026-08-17T08:00:00.000Z")
    }).map((r) => ({ ...r, organization_id: ORG, id: `${r.domain}-run` }))
  });
  const svc4 = createFinanceReadService({
    getSupabase: () => createMemorySupabase(staleCash),
    env: {},
    now: () => AT_9AM_CT
  });
  const overview4 = await svc4.getOverview({ user: { organization_id: ORG } });
  assert.equal(overview4.domains.cash.state, FINANCE_METRIC_STATES.STALE);
  assert.equal(overview4.metrics.cash.state, FINANCE_METRIC_STATES.AVAILABLE, "bank balances follow master");
  console.log("ok overview metric ownership isolation");
}

console.log("\nAll Finance freshness tests passed.");
