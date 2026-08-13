/**
 * QuickBooks Financial Truth Beta — safety + contract tests.
 * Run: node backend-core/src/sales/quickbooksFinancialTruth/quickbooksFinancialTruth.test.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFixtureQuickBooksFinancialTruthProvider,
  detectSupportedCDataQuickBooksClient,
  getQuickBooksFinancialTruth,
  getQuickBooksFinancialTruthSafe,
  QB_FINANCIAL_TRUTH_STATUSES,
  sanitizeFinancialTruthDiagnostics
} from "./index.js";
import {
  PREPARED_FACTS_PAGE_SIZE,
  sumCurrentOpenAr,
  sumTransactionsInRange
} from "./preparedFactsProvider.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Disabled by default — Moraware path must remain independent
{
  const row = await getQuickBooksFinancialTruth({
    startDate: "2026-01-01",
    endDate: "2026-08-10",
    env: { QB_FINANCIAL_TRUTH_ENABLED: "0" }
  });
  assert.equal(row.status, QB_FINANCIAL_TRUTH_STATUSES.DISABLED);
  assert.equal(row.source, "quickbooks_desktop");
  assert.equal(row.estimates.amount, null);
  assert.equal(row.sales_orders.amount, null);
  assert.equal(row.invoices.amount, null);
  assert.equal(row.payments.amount, null);
  assert.equal(row.open_ar.amount, null);
  assert.ok(Array.isArray(row.warnings) && row.warnings.length >= 1);
  assert.equal(row.date_range.start_date, "2026-01-01");
  assert.equal(row.date_range.end_date, "2026-08-10");
  const json = JSON.stringify(row);
  assert.equal(/slabos_ro|Basic\s+[A-Za-z0-9+/=]{8,}/i.test(json), false);
  assert.equal(/"password"\s*:/.test(json), false);
  console.log("ok: QB disabled returns null amounts (not fake $0) + no credentials");
}

// Enabled without prepared-facts context → unavailable (not ok, not zeros)
{
  const row = await getQuickBooksFinancialTruth({
    startDate: "2026-01-01",
    endDate: "2026-03-31",
    env: {
      QB_FINANCIAL_TRUTH_ENABLED: "1",
      QB_SALES_SYNC_INGEST_TOKEN: "super-secret-should-never-leak"
    }
  });
  assert.equal(row.status, QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE);
  assert.equal(row.estimates.amount, null);
  assert.equal(row.sales_orders.amount, null);
  assert.notEqual(row.estimates.amount, 0);
  const json = JSON.stringify(row);
  assert.equal(/super-secret-should-never-leak/.test(json), false);
  assert.match(String(row.warnings[0] || ""), /unavailable|prepared-facts|organization/i);
  console.log("ok: enabled without prepared facts is unavailable; token never in response");
}

// Fixture maps five financial fields; Sales Orders not Booked
{
  const provider = createFixtureQuickBooksFinancialTruthProvider({
    estimates: { count: 2, amount: 1000 },
    sales_orders: { count: 1, amount: 800 },
    invoices: { count: 1, amount: 750 },
    payments: { count: 1, amount: 500 },
    open_ar: { invoice_count: 1, amount: 250 }
  });
  const row = await getQuickBooksFinancialTruth({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    env: { QB_FINANCIAL_TRUTH_ENABLED: "1" },
    provider
  });
  assert.equal(row.status, "ok");
  assert.equal(row.estimates.amount, 1000);
  assert.equal(row.sales_orders.amount, 800);
  assert.equal(row.invoices.amount, 750);
  assert.equal(row.payments.amount, 500);
  assert.equal(row.open_ar.amount, 250);
  assert.equal(row.diagnostics.label_sales_orders, "Sales Orders $");
  const json = JSON.stringify(row);
  assert.equal(/\bBooked\b|\bSold\b/i.test(json), false);
  console.log("ok: fixture maps five fields; Sales Orders label retained");
}

// Fail-soft: provider throw does not reject
{
  const row = await getQuickBooksFinancialTruthSafe({
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    env: { QB_FINANCIAL_TRUTH_ENABLED: "1" },
    provider: {
      async getQuickBooksFinancialTruth() {
        throw new Error("Authorization: Basic dXNlcjpwYXNz and password=boom");
      }
    }
  });
  assert.equal(row.status, "unavailable");
  const json = JSON.stringify(row);
  assert.equal(/dXNlcjpwYXNz|password=boom|Basic\s+dXNl/i.test(json), false);
  console.log("ok: provider exception is fail-soft + redacted");
}

// Sanitize strips secret keys
{
  const cleaned = sanitizeFinancialTruthDiagnostics({
    password: "nope",
    nested: { authorization: "Basic abc", ok: true },
    message: "failed Basic YWJjZGVmZ2hpams= mid"
  });
  assert.equal(cleaned.password, "[redacted]");
  assert.equal(cleaned.nested.authorization, "[redacted]");
  assert.equal(cleaned.nested.ok, true);
  assert.equal(cleaned.message, "[redacted]");
  console.log("ok: diagnostics sanitizer redacts secrets");
}

// Detect no supported client in this repo runtime
{
  const det = detectSupportedCDataQuickBooksClient({
    env: {},
    requireResolve: () => {
      throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" });
    }
  });
  assert.equal(det.available, false);
  assert.match(det.reason, /No supported CData/);
  console.log("ok: supported CData client detection reports missing");
}

// Source scan: no write provider methods in this package
{
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".js") && !f.endsWith(".mjs")) continue;
    if (f.endsWith(".test.mjs")) continue;
    const src = await fs.readFile(path.join(dir, f), "utf8");
    assert.equal(/EstimateAdd|InvoiceAdd|SalesOrderAdd|ReceivePaymentAdd|TxnDelRq|ListDelRq/.test(src), false, f);
    assert.equal(/\b(EstimateAddRq|InvoiceAddRq|SalesOrderAddRq|ReceivePaymentAddRq)\b/.test(src), false, f);
    assert.equal(/thryve/i.test(src), false, f);
  }
  console.log("ok: financial truth package has no write methods / thryve identity");
}

// Open A/R basis documented as as-of refresh
{
  const row = await getQuickBooksFinancialTruth({
    env: { QB_FINANCIAL_TRUTH_ENABLED: "0" }
  });
  assert.equal(row.open_ar.basis, "as_of_refresh");
  assert.match(row.open_ar.basis_note, /as of refresh/i);
  console.log("ok: Open A/R basis documented as as-of refresh");
}

// --- Prepared-facts paging (would fail under single uncapped PostgREST select) ---

/**
 * Fake Supabase client that supports the prepared-facts paging chain and
 * returns only the requested .range() slice (simulating PostgREST max-rows).
 */
function createPagingSupabase({ table, rows, idKey }) {
  const sorted = [...rows].sort((a, b) => String(a[idKey]).localeCompare(String(b[idKey])));
  /** @type {{ from: number, to: number }[]} */
  const rangeCalls = [];

  function makeBuilder() {
    /** @type {{ filters: Record<string, unknown>, gte: Record<string, unknown>, lte: Record<string, unknown>, orderCol: string|null, from: number|null, to: number|null }} */
    const state = {
      filters: {},
      gte: {},
      lte: {},
      orderCol: null,
      from: null,
      to: null
    };
    const api = {
      select() {
        return api;
      },
      eq(col, val) {
        state.filters[col] = val;
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
      order(col) {
        state.orderCol = col;
        return api;
      },
      range(from, to) {
        state.from = from;
        state.to = to;
        rangeCalls.push({ from, to });
        return api;
      },
      then(onFulfilled, onRejected) {
        let filtered = sorted.filter((row) => {
          for (const [col, val] of Object.entries(state.filters)) {
            if (row[col] !== val) return false;
          }
          for (const [col, val] of Object.entries(state.gte)) {
            if (String(row[col]) < String(val)) return false;
          }
          for (const [col, val] of Object.entries(state.lte)) {
            if (String(row[col]) > String(val)) return false;
          }
          return true;
        });
        if (state.orderCol) {
          filtered = [...filtered].sort((a, b) =>
            String(a[state.orderCol]).localeCompare(String(b[state.orderCol]))
          );
        }
        const from = state.from ?? 0;
        const to = state.to ?? filtered.length - 1;
        const page = filtered.slice(from, to + 1);
        return Promise.resolve({ data: page, error: null }).then(onFulfilled, onRejected);
      }
    };
    return api;
  }

  return {
    rangeCalls,
    supabase: {
      from(name) {
        assert.equal(name, table);
        return makeBuilder();
      }
    }
  };
}

// A. Transaction paging >1000 rows
{
  const orgId = "11111111-1111-4111-8111-111111111111";
  const total = 1575;
  const rows = [];
  let expectedAmount = 0;
  for (let i = 0; i < total; i += 1) {
    const amount = (i % 17) + 1; // 1..17 deterministic
    expectedAmount += amount;
    rows.push({
      organization_id: orgId,
      transaction_type: "invoice",
      transaction_date: "2026-06-15",
      source_id: `INV-${String(i).padStart(5, "0")}`,
      amount
    });
  }
  expectedAmount = Math.round(expectedAmount * 100) / 100;

  const { supabase, rangeCalls } = createPagingSupabase({
    table: "sales_quickbooks_financial_transactions",
    rows,
    idKey: "source_id"
  });

  const result = await sumTransactionsInRange(supabase, {
    organizationId: orgId,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    transactionType: "invoice"
  });

  assert.equal(result.count, total);
  assert.equal(result.amount, expectedAmount);
  assert.ok(rangeCalls.length >= 2, `expected multiple pages, got ${rangeCalls.length}`);
  assert.deepEqual(rangeCalls[0], { from: 0, to: PREPARED_FACTS_PAGE_SIZE - 1 });
  assert.deepEqual(rangeCalls[1], {
    from: PREPARED_FACTS_PAGE_SIZE,
    to: PREPARED_FACTS_PAGE_SIZE * 2 - 1
  });
  // Old single-query (first 1000 only) would under-count:
  const firstPageOnly = rows.slice(0, PREPARED_FACTS_PAGE_SIZE).reduce((s, r) => s + r.amount, 0);
  assert.notEqual(result.amount, Math.round(firstPageOnly * 100) / 100);
  assert.ok(result.count > PREPARED_FACTS_PAGE_SIZE);
  console.log("ok: A transaction paging sums all 1575 rows across multiple .range() pages");
}

// B. Open A/R paging >1000 rows
{
  const orgId = "11111111-1111-4111-8111-111111111111";
  const total = 1205;
  const rows = [];
  let expectedAmount = 0;
  for (let i = 0; i < total; i += 1) {
    const balance = (i % 11) + 0.25;
    expectedAmount += balance;
    rows.push({
      organization_id: orgId,
      source_invoice_id: `AR-${String(i).padStart(5, "0")}`,
      balance
    });
  }
  expectedAmount = Math.round(expectedAmount * 100) / 100;

  const { supabase, rangeCalls } = createPagingSupabase({
    table: "sales_quickbooks_open_ar_current",
    rows,
    idKey: "source_invoice_id"
  });

  const result = await sumCurrentOpenAr(supabase, orgId);
  assert.equal(result.invoice_count, total);
  assert.equal(result.amount, expectedAmount);
  assert.ok(rangeCalls.length >= 2, `expected multiple pages, got ${rangeCalls.length}`);
  assert.deepEqual(rangeCalls[0], { from: 0, to: PREPARED_FACTS_PAGE_SIZE - 1 });
  const firstPageOnly = rows.slice(0, PREPARED_FACTS_PAGE_SIZE).reduce((s, r) => s + r.balance, 0);
  assert.notEqual(result.amount, Math.round(firstPageOnly * 100) / 100);
  console.log("ok: B open A/R paging sums all 1205 balances across multiple .range() pages");
}

// C. Small result set (<1000) still works; single page
{
  const orgId = "11111111-1111-4111-8111-111111111111";
  const rows = [
    {
      organization_id: orgId,
      transaction_type: "payment",
      transaction_date: "2026-07-01",
      source_id: "P-1",
      amount: 10.1
    },
    {
      organization_id: orgId,
      transaction_type: "payment",
      transaction_date: "2026-07-02",
      source_id: "P-2",
      amount: 20.2
    },
    {
      organization_id: orgId,
      transaction_type: "payment",
      transaction_date: "2026-07-03",
      source_id: "P-3",
      amount: 30.3
    }
  ];
  const { supabase, rangeCalls } = createPagingSupabase({
    table: "sales_quickbooks_financial_transactions",
    rows,
    idKey: "source_id"
  });
  const result = await sumTransactionsInRange(supabase, {
    organizationId: orgId,
    startDate: null,
    endDate: null,
    transactionType: "payment"
  });
  assert.equal(result.count, 3);
  assert.equal(result.amount, 60.6);
  assert.equal(rangeCalls.length, 1);
  console.log("ok: C small result set (<1000) returns correct total on a single page");
}

console.log("All QuickBooks Financial Truth Beta tests passed.");
