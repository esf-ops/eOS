/**
 * Account 360 Phase 3 — historical customer sales + staff-safe allowlist.
 * Run: node backend-core/src/accountDirectory/accountDirectoryCustomerHistory.test.mjs
 */

import assert from "node:assert/strict";
import {
  ACCOUNT_360_FORBIDDEN_SENTINEL_KEYS,
  payloadContainsForbiddenFinance,
  scrubAccount360Payload
} from "./accountDirectoryStaffSafeFinancials.mjs";
import {
  buildCustomerHistoryModel,
  describeAmountChange,
  loadStaffSafeCustomerTransactions,
  resolveEquivalentYoyWindow,
  sumRowsByFamily
} from "./accountDirectoryCustomerHistory.mjs";
import { getAccountDirectoryFinancials } from "./accountDirectoryFinancialIntelligence.mjs";
import {
  getAccountDirectoryHistoryTransactions,
  getAccountDirectoryTrend
} from "./accountDirectory360.mjs";
import { capabilitiesForRole } from "./accountDirectoryAuth.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOT_A = "80010327-1759266211";
const ROOT_JOB = "800115FA-1776866951";
const ROOT_OTHER = "99999999-9999999999";

function assertNoIds(payload) {
  const json = JSON.stringify(payload);
  assert.equal(
    /qb_customer_list_id|qb_root_customer_list_id|external_id|entity_id|qb_txn_id|80010327|800115FA|99999999/i.test(
      json
    ),
    false
  );
}

function createFakeSupabase({
  syncRun,
  financeRun = null,
  transactions = [],
  financeTxns = [],
  facts = [],
  openAr = []
}) {
  function makeBuilder(table, allRows) {
    const state = {
      filters: {},
      inFilters: {},
      gte: {},
      lte: {},
      order: [],
      from: null,
      to: null,
      limit: null,
      single: false
    };
    const api = {
      select() {
        return api;
      },
      eq(col, val) {
        state.filters[col] = val;
        return api;
      },
      in(col, vals) {
        state.inFilters[col] = new Set((vals || []).map(String));
        return api;
      },
      gte(col, val) {
        state.gte[col] = val;
        return api;
      },
      lte(col, val) {
        state.lte[col] = val;
        return api;
      },
      order(col, opts = {}) {
        state.order.push({ col, ascending: opts.ascending !== false });
        return api;
      },
      range(from, to) {
        state.from = from;
        state.to = to;
        return api;
      },
      limit(n) {
        state.limit = n;
        return api;
      },
      maybeSingle() {
        state.limit = 1;
        state.single = true;
        return api;
      },
      then(onFulfilled, onRejected) {
        let rows = allRows.filter((row) => {
          for (const [col, val] of Object.entries(state.filters)) {
            if (String(row[col] ?? "") !== String(val)) return false;
          }
          for (const [col, set] of Object.entries(state.inFilters)) {
            if (!set.has(String(row[col] ?? ""))) return false;
          }
          for (const [col, val] of Object.entries(state.gte)) {
            if (String(row[col]) < String(val)) return false;
          }
          for (const [col, val] of Object.entries(state.lte)) {
            if (String(row[col]) > String(val)) return false;
          }
          return true;
        });
        for (const ord of state.order) {
          rows = [...rows].sort((a, b) => {
            const cmp = String(a[ord.col] ?? "").localeCompare(String(b[ord.col] ?? ""));
            return ord.ascending ? cmp : -cmp;
          });
        }
        if (state.single) {
          return Promise.resolve({ data: rows[0] || null, error: null }).then(onFulfilled, onRejected);
        }
        if (state.limit != null) rows = rows.slice(0, state.limit);
        else if (state.from != null && state.to != null) rows = rows.slice(state.from, state.to + 1);
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      }
    };
    return api;
  }

  return {
    from(table) {
      if (table === "sales_quickbooks_sync_runs") return makeBuilder(table, syncRun ? [syncRun] : []);
      if (table === "sales_quickbooks_financial_transactions") return makeBuilder(table, transactions);
      if (table === "sales_quickbooks_open_ar_current") return makeBuilder(table, openAr);
      if (table === "qb_finance_sync_runs") return makeBuilder(table, financeRun ? [financeRun] : []);
      if (table === "qb_finance_transaction_index") return makeBuilder(table, financeTxns);
      if (table === "ad_qb_customer_facts") return makeBuilder(table, facts);
      throw new Error(`unexpected table ${table}`);
    }
  };
}

function makeStore(links) {
  return {
    async getAccount(orgId, accountId) {
      if (orgId !== ORG || accountId !== ACCOUNT) return null;
      return { id: ACCOUNT, displayName: "Acme" };
    },
    async listExternalLinks(orgId, accountId) {
      if (orgId !== ORG || accountId !== ACCOUNT) return [];
      return links;
    }
  };
}

{
  const dirty = {
    amount: 10,
    net_income: 999,
    gross_profit: 888,
    qb_txn_id: "TXN",
    nested: { entity_id: ROOT_A, payroll: 1, ok: true }
  };
  for (const key of ACCOUNT_360_FORBIDDEN_SENTINEL_KEYS) dirty[key] = `sentinel-${key}`;
  const clean = scrubAccount360Payload(dirty);
  assert.equal(clean.amount, 10);
  assert.equal(clean.nested.ok, true);
  for (const key of ACCOUNT_360_FORBIDDEN_SENTINEL_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(clean, key), false);
  }
  assert.equal(clean.nested.entity_id, undefined);
  assert.equal(clean.nested.payroll, undefined);
  assert.equal(payloadContainsForbiddenFinance(clean), false);
  console.log("ok: sentinel forbidden keys cannot survive scrubber");
}

{
  const yoy = resolveEquivalentYoyWindow("2026-08-14", "2025-01-01", "2026-08-14");
  assert.equal(yoy.comparable, true);
  assert.equal(yoy.current.start, "2026-01-01");
  assert.equal(yoy.current.end, "2026-08-14");
  assert.equal(yoy.prior.start, "2025-01-01");
  assert.equal(yoy.prior.end, "2025-08-14");
  const short = resolveEquivalentYoyWindow("2026-08-14", "2026-06-15", "2026-08-14");
  assert.equal(short.comparable, false);
  const change = describeAmountChange("Invoiced dollars", 118, 100, true);
  assert.equal(change.percent, 18);
  assert.match(change.text, /18% higher/);
  console.log("ok: equivalent-period YoY; short coverage unavailable");
}

{
  const rows = [
    { type: "invoice", date: "2026-03-01", amount: 50 },
    { type: "invoice", date: "2025-03-01", amount: 25 },
    { type: "invoice", date: "2024-03-01", amount: 999 }
  ];
  const inside = sumRowsByFamily(rows, "2025-01-01", "2026-08-14");
  assert.equal(inside.invoices.amount, 75);
  assert.equal(inside.invoices.count, 2);
  const zeroMonth = sumRowsByFamily(rows, "2025-07-01", "2025-07-31");
  assert.equal(zeroMonth.invoices.amount, 0);
  assert.equal(zeroMonth.invoices.count, 0);
  console.log("ok: zero activity inside coverage vs excluded outside coverage");
}

{
  const model = buildCustomerHistoryModel({
    rows: [
      { type: "estimate", date: "2025-02-01", amount: 10 },
      { type: "sales_order", date: "2025-02-01", amount: 8 },
      { type: "invoice", date: "2025-02-01", amount: 5 },
      { type: "payment", date: "2025-02-01", amount: 4 }
    ],
    coverageStart: "2025-01-01",
    coverageEnd: "2026-08-14",
    asOfDate: "2026-08-14",
    source: "finance_transaction_index",
    freshness: { isStale: false }
  });
  assert.equal(model.coverage.provenComplete, false);
  assert.match(model.coverage.label, /Jan 2025|History available/i);
  assert.equal(model.commercialActivity.label, "Commercial activity");
  assert.match(model.commercialActivity.notes, /not a job-level conversion funnel/i);
  const json = JSON.stringify(model);
  assert.equal(/\bSold\b|win rate|gross_profit/i.test(json), false);
  assert.equal(/Lifetime/i.test(model.coverage.label), false);
  const feb = model.periods.find((p) => p.month === "2025-02");
  const jan = model.periods.find((p) => p.month === "2025-01");
  assert.equal(feb.invoiced, 5);
  assert.equal(jan.invoiced, 0);
  assert.equal(model.periods.some((p) => p.open_ar != null || p.ar != null), false);
  console.log("ok: history model coverage, commercial activity, zero month, no A/R series");
}

{
  const supabase = createFakeSupabase({
    syncRun: {
      organization_id: ORG,
      status: "success",
      completed_at: "2026-08-14T12:00:00.000Z",
      coverage_start_date: "2026-06-15",
      coverage_end_date: "2026-08-14"
    },
    financeRun: {
      organization_id: ORG,
      domain: "accounting",
      status: "success",
      completed_at: "2026-08-14T20:00:00.000Z",
      coverage_end_date: "2026-08-14"
    },
    facts: [
      { organization_id: ORG, qb_list_id: ROOT_JOB, parent_list_id: ROOT_A }
    ],
    financeTxns: [
      {
        organization_id: ORG,
        txn_type: "Invoice",
        txn_date: "2025-03-01",
        amount: 40,
        entity_id: ROOT_JOB,
        txn_line_id: "",
        reference_number: "E1",
        entity_name: "Acme:Job",
        qb_txn_id: "FORBIDDEN-TXN"
      },
      {
        organization_id: ORG,
        txn_type: "Invoice",
        txn_date: "2026-03-01",
        amount: 60,
        entity_id: ROOT_JOB,
        txn_line_id: "",
        reference_number: "E2",
        entity_name: "Acme:Job"
      },
      {
        organization_id: ORG,
        txn_type: "Bill",
        txn_date: "2025-03-01",
        amount: 50000,
        entity_id: ROOT_JOB,
        txn_line_id: ""
      },
      {
        organization_id: ORG,
        txn_type: "Invoice",
        txn_date: "2026-03-01",
        amount: 999,
        entity_id: ROOT_OTHER,
        txn_line_id: "",
        entity_name: "Acme"
      },
      {
        organization_id: ORG_B,
        txn_type: "Invoice",
        txn_date: "2026-03-01",
        amount: 80,
        entity_id: ROOT_JOB,
        txn_line_id: ""
      }
    ],
    transactions: [
      {
        organization_id: ORG,
        transaction_type: "invoice",
        transaction_date: "2026-07-01",
        amount: 7,
        qb_root_customer_list_id: ROOT_A
      }
    ],
    openAr: [
      {
        organization_id: ORG,
        balance: 12,
        invoice_date: "2026-07-01",
        due_date: "2026-08-01",
        qb_root_customer_list_id: ROOT_A,
        original_amount: 12,
        reference_number: "OPEN"
      }
    ]
  });
  const store = makeStore([
    { isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }
  ]);
  const profile = await getAccountDirectoryFinancials({
    supabase,
    store,
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "999999" },
    now: new Date("2026-08-14T21:00:00.000Z")
  });
  assert.equal(profile.summary.invoicedYtd, 60);
  assert.equal(profile.customerHistory.summary.invoices.amount, 100);
  assert.equal(profile.summary.openAr, 12);
  assert.equal(profile.customerHistory.comparable.available, true);
  assert.equal(profile.customerHistory.comparable.priorTotals.invoices.amount, 40);
  assert.equal(JSON.stringify(profile).includes("Bill"), false);
  assert.equal(JSON.stringify(profile).includes("50000"), false);
  assert.equal(payloadContainsForbiddenFinance(profile), false);
  assertNoIds(profile);
  assert.match(profile.coverage.historyLabel, /Jan 2025/i);

  const txns = await getAccountDirectoryHistoryTransactions({
    supabase,
    store,
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "office",
    page: 1,
    limit: 1,
    type: "invoice"
  });
  assert.equal(txns.items.length, 1);
  assert.equal(txns.pagination.has_more, true);
  assertNoIds(txns);

  const unlinked = await getAccountDirectoryFinancials({
    supabase,
    store: makeStore([]),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    now: new Date("2026-08-14T21:00:00.000Z")
  });
  assert.equal(unlinked.status, "unlinked");
  assert.equal(unlinked.summary.invoicedYtd, null);

  const otherOrg = await loadStaffSafeCustomerTransactions({
    supabase,
    organizationId: ORG_B,
    rootListIds: [ROOT_A],
    now: new Date("2026-08-14T21:00:00.000Z")
  });
  assert.equal(otherOrg.rows.length, 0);

  console.log("ok: finance history exact job walk, name-twin excluded, org isolation, A/R snapshot, bounds");
}

{
  const roles = ["sales", "estimator", "office", "customer_service", "admin", "shop", "unknown"];
  for (const role of roles) {
    assert.equal(capabilitiesForRole(role).has("account_directory_view"), true);
  }
  console.log("ok: VIEW is broad; owner-sensitive fields must stay omitted");
}

{
  const supabase = createFakeSupabase({
    syncRun: {
      organization_id: ORG,
      status: "success",
      completed_at: "2026-08-14T12:00:00.000Z",
      coverage_start_date: "2026-06-15",
      coverage_end_date: "2026-08-14"
    },
    financeRun: {
      organization_id: ORG,
      domain: "accounting",
      status: "success",
      completed_at: "2026-08-14T12:00:00.000Z",
      coverage_end_date: "2026-08-14"
    },
    facts: [],
    financeTxns: [
      {
        organization_id: ORG,
        txn_type: "Invoice",
        txn_date: "2026-01-15",
        amount: 10,
        entity_id: ROOT_A,
        txn_line_id: ""
      }
    ],
    openAr: []
  });
  const trend = await getAccountDirectoryTrend({
    supabase,
    store: makeStore([{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "999999" },
    now: new Date("2026-08-14T18:00:00.000Z"),
    period: "available"
  });
  assert.ok(trend.points.length >= 8);
  const jan = trend.points.find((p) => p.month === "2026-01");
  assert.equal(jan.invoiced, 10);
  assertNoIds(trend);
  console.log("ok: available-history trend uses finance coverage, not sales lookback");
}

console.log("accountDirectoryCustomerHistory.test.mjs — all passed");
