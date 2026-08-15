/**
 * Account Directory Financial Intelligence Slice A — identity + paging tests.
 * Run: node backend-core/src/accountDirectory/accountDirectoryFinancialIntelligence.test.mjs
 */

import assert from "node:assert/strict";
import {
  AD_FINANCIALS_PAGE_SIZE,
  buildOpenArAging,
  classifyArAgingBucket,
  collectActiveQuickbooksRootListIds,
  emptyFinancialsProfile,
  getAccountDirectoryFinancials,
  resolvePaymentTermsLabel,
  scrubFinancialIds,
  sumLinkedOpenAr,
  sumLinkedTransactionsInRange,
  ytdStartForAsOf
} from "./accountDirectoryFinancialIntelligence.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOT_A = "80010327-1759266211";
const ROOT_B = "80010E11-1770822810";
const ROOT_OTHER = "99999999-9999999999";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function assertNoIds(payload) {
  const json = JSON.stringify(payload);
  assert.equal(
    /qb_customer_list_id|qb_root_customer_list_id|external_id|terms_list_id|80010327|80010E11|99999999/i.test(
      json
    ),
    false
  );
}

/**
 * Fake PostgREST-style builder with paging + .in() filters.
 */
function createFakeSupabase({ syncRun, transactions = [], openAr = [] }) {
  /** @type {{ table: string, from: number, to: number }[]} */
  const rangeCalls = [];

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
        rangeCalls.push({ table, from, to });
        return api;
      },
      limit(n) {
        state.limit = n;
        return api;
      },
      maybeSingle() {
        state.single = true;
        return api;
      },
      then(onFulfilled, onRejected) {
        let rows = allRows.filter((row) => {
          for (const [col, val] of Object.entries(state.filters)) {
            if (String(row[col]) !== String(val)) return false;
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
            const av = String(a[ord.col] ?? "");
            const bv = String(b[ord.col] ?? "");
            const cmp = av.localeCompare(bv);
            return ord.ascending ? cmp : -cmp;
          });
        }

        if (state.single) {
          const row = rows[0] || null;
          return Promise.resolve({ data: row, error: null }).then(onFulfilled, onRejected);
        }

        if (state.limit != null) {
          rows = rows.slice(0, state.limit);
        } else if (state.from != null && state.to != null) {
          rows = rows.slice(state.from, state.to + 1);
        }

        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      }
    };
    return api;
  }

  const supabase = {
    from(table) {
      if (table === "sales_quickbooks_sync_runs") {
        return makeBuilder(table, syncRun ? [syncRun] : []);
      }
      if (table === "sales_quickbooks_financial_transactions") {
        return makeBuilder(table, transactions);
      }
      if (table === "sales_quickbooks_open_ar_current") {
        return makeBuilder(table, openAr);
      }
      throw new Error(`unexpected table ${table}`);
    }
  };

  return { supabase, rangeCalls };
}

function makeStore({ links = [], account = { id: ACCOUNT, displayName: "Acme" } } = {}) {
  return {
    async getAccount(orgId, accountId) {
      assert.equal(orgId, ORG);
      if (accountId !== ACCOUNT) return null;
      return account;
    },
    async listExternalLinks(orgId, accountId) {
      assert.equal(orgId, ORG);
      assert.equal(accountId, ACCOUNT);
      return links;
    }
  };
}

function okSync(overrides = {}) {
  return {
    id: RUN_ID,
    organization_id: ORG,
    status: "success",
    completed_at: "2026-08-13T12:00:00.000Z",
    coverage_start_date: "2026-01-01",
    coverage_end_date: "2026-08-13",
    worker_version: "1.1.0",
    company_name: "Elite Stone Fabrications",
    warnings: [],
    ...overrides
  };
}

// Helpers
{
  assert.equal(ytdStartForAsOf("2026-08-13"), "2026-01-01");
  const scrubbed = scrubFinancialIds({
    amount: 1,
    qb_root_customer_list_id: ROOT_A,
    nested: { external_id: "x", ok: true }
  });
  assert.equal(scrubbed.qb_root_customer_list_id, undefined);
  assert.equal(scrubbed.nested.external_id, undefined);
  assert.equal(scrubbed.nested.ok, true);
  assert.deepEqual(collectActiveQuickbooksRootListIds([
    { isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A },
    { isActive: false, externalSystem: "quickbooks_desktop", externalId: ROOT_B },
    { isActive: true, externalSystem: "other", externalId: "NOPE" },
    { isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }
  ]), [ROOT_A]);
  console.log("ok: helpers / scrub / root collection");
}

// 1. Unlinked — nulls, no name matching
{
  const nameTwinTxns = [
    {
      organization_id: ORG,
      transaction_type: "invoice",
      transaction_date: "2026-06-01",
      source_id: "I1",
      amount: 9999,
      customer_name: "Acme",
      qb_root_customer_list_id: ROOT_OTHER
    }
  ];
  const { supabase } = createFakeSupabase({ syncRun: okSync(), transactions: nameTwinTxns, openAr: [] });
  const profile = await getAccountDirectoryFinancials({
    supabase,
    store: makeStore({ links: [] }),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    now: new Date("2026-08-13T18:00:00.000Z")
  });
  assert.equal(profile.status, "unlinked");
  assert.equal(profile.linked, false);
  assert.equal(profile.summary.openAr, null);
  assert.equal(profile.summary.invoicedYtd, null);
  assert.notEqual(profile.summary.invoicedYtd, 0);
  assert.match(profile.warnings.join(" "), /linked to QuickBooks/i);
  assertNoIds(profile);
  console.log("ok: 1 unlinked → nulls, no name match");
}

// 2 + 3 + 4. Linked root only; job under root included; same name other root excluded
{
  const transactions = [
    {
      organization_id: ORG,
      transaction_type: "invoice",
      transaction_date: "2026-03-01",
      source_id: "I-ROOT",
      amount: 100,
      customer_name: "Acme",
      qb_customer_list_id: ROOT_A,
      qb_root_customer_list_id: ROOT_A
    },
    {
      organization_id: ORG,
      transaction_type: "invoice",
      transaction_date: "2026-04-01",
      source_id: "I-JOB",
      amount: 50,
      customer_name: "Acme:Job",
      qb_customer_list_id: "JOB-CHILD-1",
      qb_root_customer_list_id: ROOT_A
    },
    {
      organization_id: ORG,
      transaction_type: "invoice",
      transaction_date: "2026-05-01",
      source_id: "I-OTHER",
      amount: 777,
      customer_name: "Acme",
      qb_customer_list_id: ROOT_OTHER,
      qb_root_customer_list_id: ROOT_OTHER
    },
    {
      organization_id: ORG,
      transaction_type: "payment",
      transaction_date: "2026-06-01",
      source_id: "P1",
      amount: 40,
      customer_name: "Acme",
      qb_root_customer_list_id: ROOT_A
    },
    {
      organization_id: ORG,
      transaction_type: "sales_order",
      transaction_date: "2026-02-01",
      source_id: "S1",
      amount: 30,
      customer_name: "Acme",
      qb_root_customer_list_id: ROOT_A
    },
    {
      organization_id: ORG,
      transaction_type: "estimate",
      transaction_date: "2026-01-15",
      source_id: "E1",
      amount: 20,
      customer_name: "Acme",
      qb_root_customer_list_id: ROOT_A
    }
  ];
  const openAr = [
    {
      organization_id: ORG,
      source_invoice_id: "AR1",
      balance: 25,
      invoice_date: "2026-01-10",
      reference_number: "100",
      customer_name: "Acme",
      original_amount: 25,
      qb_root_customer_list_id: ROOT_A
    },
    {
      organization_id: ORG,
      source_invoice_id: "AR-OTHER",
      balance: 500,
      invoice_date: "2026-01-01",
      customer_name: "Acme",
      qb_root_customer_list_id: ROOT_OTHER
    }
  ];
  const { supabase } = createFakeSupabase({ syncRun: okSync(), transactions, openAr });
  const profile = await getAccountDirectoryFinancials({
    supabase,
    store: makeStore({
      links: [{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]
    }),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "999999" },
    now: new Date("2026-08-13T18:00:00.000Z")
  });
  assert.equal(profile.status, "ok");
  assert.equal(profile.summary.invoicedYtd, 150);
  assert.equal(profile.summary.collectedYtd, 40);
  assert.equal(profile.summary.salesOrdersYtd, 30);
  assert.equal(profile.summary.quotedYtd, 20);
  assert.equal(profile.summary.openAr, 25);
  assert.equal(profile.summary.openInvoiceCount, 1);
  assert.equal(profile.oldestOpenInvoice?.ageDays != null, true);
  assert.equal(profile.openInvoices.items.length, 1);
  assert.equal(profile.openInvoices.items[0].open_amount, 25);
  assert.equal(profile.monthlyTrend.status, "ok");
  const june = profile.monthlyTrend.points.find((p) => p.month === "2026-06");
  assert.equal(june.collected, 40);
  assert.equal(june.invoiced, 0);
  assert.equal(JSON.stringify(profile).includes("total_assets"), false);
  assert.equal(JSON.stringify(profile).includes("net_income"), false);
  assertNoIds(profile);
  console.log("ok: 2/3/4 linked root + job included; name twin other root excluded");
}

// 5. Multiple linked roots aggregate + warning, no IDs
{
  const transactions = [
    {
      organization_id: ORG,
      transaction_type: "invoice",
      transaction_date: "2026-03-01",
      source_id: "I1",
      amount: 10,
      qb_root_customer_list_id: ROOT_A
    },
    {
      organization_id: ORG,
      transaction_type: "invoice",
      transaction_date: "2026-03-02",
      source_id: "I2",
      amount: 15,
      qb_root_customer_list_id: ROOT_B
    }
  ];
  const { supabase } = createFakeSupabase({ syncRun: okSync(), transactions, openAr: [] });
  const profile = await getAccountDirectoryFinancials({
    supabase,
    store: makeStore({
      links: [
        { isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A },
        { isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_B }
      ]
    }),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "admin",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "999999" },
    now: new Date("2026-08-13T18:00:00.000Z")
  });
  assert.equal(profile.summary.invoicedYtd, 25);
  assert.match(profile.warnings.join(" "), /2 linked QuickBooks customer records/);
  assertNoIds(profile);
  console.log("ok: 5 multi-root aggregate + staff-safe warning");
}

// 6. >1000 transactions paging
{
  const transactions = [];
  let expected = 0;
  for (let i = 0; i < 1575; i += 1) {
    const amount = (i % 5) + 1;
    expected += amount;
    transactions.push({
      organization_id: ORG,
      transaction_type: "invoice",
      transaction_date: "2026-06-01",
      source_id: `INV-${String(i).padStart(5, "0")}`,
      amount,
      qb_root_customer_list_id: ROOT_A
    });
  }
  const { supabase, rangeCalls } = createFakeSupabase({ syncRun: okSync(), transactions, openAr: [] });
  const sum = await sumLinkedTransactionsInRange(supabase, {
    organizationId: ORG,
    rootListIds: [ROOT_A],
    transactionType: "invoice",
    startDate: "2026-01-01",
    endDate: "2026-12-31"
  });
  assert.equal(sum.count, 1575);
  assert.equal(sum.amount, expected);
  assert.ok(rangeCalls.filter((c) => c.table.includes("financial_transactions") || true).length >= 2);
  assert.ok(rangeCalls.length >= 2);
  console.log("ok: 6 >1000 transactions all included via paging");
}

// 7. >1000 open A/R paging
{
  const openAr = [];
  let expected = 0;
  for (let i = 0; i < 1205; i += 1) {
    const balance = (i % 7) + 0.5;
    expected += balance;
    openAr.push({
      organization_id: ORG,
      source_invoice_id: `AR-${String(i).padStart(5, "0")}`,
      balance,
      invoice_date: "2026-01-01",
      qb_root_customer_list_id: ROOT_A
    });
  }
  const { supabase, rangeCalls } = createFakeSupabase({ syncRun: okSync(), transactions: [], openAr });
  const sum = await sumLinkedOpenAr(supabase, { organizationId: ORG, rootListIds: [ROOT_A] });
  assert.equal(sum.invoice_count, 1205);
  assert.equal(sum.amount, Math.round(expected * 100) / 100);
  assert.ok(rangeCalls.length >= 2);
  console.log("ok: 7 >1000 open A/R balances all included via paging");
}

// 8. Stale keeps totals
{
  const { supabase } = createFakeSupabase({
    syncRun: okSync({ completed_at: "2026-08-01T00:00:00.000Z" }),
    transactions: [
      {
        organization_id: ORG,
        transaction_type: "invoice",
        transaction_date: "2026-02-01",
        source_id: "I1",
        amount: 88,
        qb_root_customer_list_id: ROOT_A
      }
    ],
    openAr: []
  });
  const profile = await getAccountDirectoryFinancials({
    supabase,
    store: makeStore({
      links: [{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]
    }),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "3600" },
    now: new Date("2026-08-13T18:00:00.000Z")
  });
  assert.equal(profile.status, "stale");
  assert.equal(profile.summary.invoicedYtd, 88);
  assert.match(profile.warnings.join(" "), /stale/i);
  console.log("ok: 8 stale keeps real totals + warning");
}

// 9. Query failure → unavailable, not zeros
{
  const supabase = {
    from(table) {
      if (table === "sales_quickbooks_sync_runs") {
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          in() {
            return api;
          },
          order() {
            return api;
          },
          limit() {
            return api;
          },
          async maybeSingle() {
            return { data: okSync(), error: null };
          }
        };
        return api;
      }
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        gte() {
          return this;
        },
        lte() {
          return this;
        },
        order() {
          return this;
        },
        range() {
          return this;
        },
        limit() {
          return this;
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: null, error: { message: "boom" } }).then(onFulfilled, onRejected);
        }
      };
    }
  };
  const profile = await getAccountDirectoryFinancials({
    supabase,
    store: makeStore({
      links: [{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]
    }),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "999999" },
    now: new Date("2026-08-13T18:00:00.000Z")
  });
  assert.equal(profile.status, "unavailable");
  assert.equal(profile.summary.openAr, null);
  assert.equal(profile.summary.invoicedYtd, null);
  assert.notEqual(profile.summary.invoicedYtd, 0);
  console.log("ok: 9 query failure fail-soft unavailable (no fake zeroes)");
}

{
  const empty = emptyFinancialsProfile();
  assert.equal(empty.summary.openAr, null);
  assert.equal(AD_FINANCIALS_PAGE_SIZE, 1000);
  console.log("ok: empty template uses nulls");
}

// Slice B — DueDate aging / collection attention / terms
{
  const asOf = "2026-08-13";
  const cases = [
    ["2026-08-13", "current"],
    ["2026-08-14", "current"],
    ["2026-08-12", "1_30"],
    ["2026-07-14", "1_30"], // exactly 30 days
    ["2026-07-13", "31_60"], // 31
    ["2026-06-14", "31_60"], // 60
    ["2026-06-13", "61_90"], // 61
    ["2026-05-15", "61_90"], // 90
    ["2026-05-14", "90_plus"], // 91
    [null, "unknown"]
  ];
  for (const [due, expected] of cases) {
    assert.equal(classifyArAgingBucket(due, asOf).bucket, expected, `${due} → ${expected}`);
  }
  console.log("ok: A–I DueDate bucket boundaries");
}

{
  const asOf = "2026-08-13";
  const rows = [
    { balance: 100, due_date: "2026-09-01" }, // current
    { balance: 50, due_date: "2026-08-01" }, // 12d → 1_30
    { balance: 25, due_date: "2026-07-01" }, // 43d → 31_60
    { balance: 10, due_date: "2026-06-01" }, // 73d → 61_90
    { balance: 5, due_date: "2026-04-01" }, // 134d → 90+
    { balance: 7, due_date: null } // unknown
  ];
  const built = buildOpenArAging(rows, asOf);
  const sumBal =
    built.aging.current.balance +
    built.aging.days1to30.balance +
    built.aging.days31to60.balance +
    built.aging.days61to90.balance +
    built.aging.days90Plus.balance +
    built.aging.unknown.balance;
  assert.equal(Math.round(sumBal * 100) / 100, 197);
  assert.equal(built.overdueBalance, 90);
  assert.equal(built.overdueInvoiceCount, 4);
  assert.equal(built.aging.unknown.count, 1);
  assert.equal(built.collectionAttention.code, "priority");
  assert.equal(
    built.collectionAttention.reason,
    "4 invoices totaling $90 are overdue; oldest is 134 days past due."
  );
  console.log("ok: J aging balances reconcile to Open A/R; K priority when 90+");
}

{
  assert.equal(buildOpenArAging([{ balance: 10, due_date: "2026-09-01" }], "2026-08-13").collectionAttention.code, "current");
  assert.equal(buildOpenArAging([{ balance: 10, due_date: "2026-08-01" }], "2026-08-13").collectionAttention.code, "watch");
  assert.equal(buildOpenArAging([{ balance: 10, due_date: "2026-07-01" }], "2026-08-13").collectionAttention.code, "attention");
  assert.equal(buildOpenArAging([{ balance: 10, due_date: "2026-06-01" }], "2026-08-13").collectionAttention.code, "priority");
  assert.equal(buildOpenArAging([{ balance: 10, due_date: null }], "2026-08-13").collectionAttention.code, "unknown");
  console.log("ok: K collection attention codes");
}

{
  assert.deepEqual(resolvePaymentTermsLabel(["Net 30", "Net 30"]), {
    paymentTerms: "Net 30",
    warning: null
  });
  const multi = resolvePaymentTermsLabel(["Net 30", "Due on receipt"]);
  assert.equal(multi.paymentTerms, "Multiple");
  assert.match(String(multi.warning), /different payment terms/i);
  console.log("ok: L/M payment terms single vs Multiple");
}

{
  const scrubbed = scrubFinancialIds({
    paymentTerms: "Net 30",
    terms_list_id: "TERM-1",
    termsListId: "TERM-2"
  });
  assert.equal(scrubbed.paymentTerms, "Net 30");
  assert.equal(scrubbed.terms_list_id, undefined);
  assert.equal(scrubbed.termsListId, undefined);
  console.log("ok: N terms_list_id scrubbed from API payload");
}

{
  const { validateTransactionChunk, validateOpenArReplacePayload } = await import(
    "../sales/quickbooksFinancialTruth/syncIngest.js"
  );
  const txn = validateTransactionChunk({
    organization_id: ORG,
    sync_run_id: RUN_ID,
    transactions: [
      {
        transaction_type: "invoice",
        source_id: "I1",
        transaction_date: "2026-08-04",
        amount: 1370,
        due_date: "2026-09-03",
        terms_name: "Net 30",
        terms_list_id: "TERM-X",
        qb_customer_list_id: ROOT_A
      },
      {
        transaction_type: "payment",
        source_id: "P1",
        transaction_date: "2026-08-05",
        amount: 10,
        due_date: "2026-09-03",
        terms_name: "Net 30"
      }
    ]
  });
  assert.equal(txn.ok, true);
  assert.equal(txn.value.transactions[0].due_date, "2026-09-03");
  assert.equal(txn.value.transactions[0].terms_name, "Net 30");
  assert.equal(txn.value.transactions[0].terms_list_id, "TERM-X");
  assert.equal(txn.value.transactions[1].due_date, null);
  assert.equal(txn.value.transactions[1].terms_name, null);

  const ar = validateOpenArReplacePayload({
    organization_id: ORG,
    sync_run_id: RUN_ID,
    open_ar: [
      {
        source_invoice_id: "AR1",
        balance: 1370,
        invoice_date: "2026-08-04",
        due_date: "2026-09-03",
        terms_name: "Net 30",
        terms_list_id: "TERM-X"
      }
    ]
  });
  assert.equal(ar.ok, true);
  assert.equal(ar.value.openAr[0].due_date, "2026-09-03");
  assert.equal(ar.value.openAr[0].terms_name, "Net 30");
  console.log("ok: ingest accepts invoice/open-AR DueDate+Terms; non-invoice terms null");
}

{
  // Integration: linked profile returns aging + never exposes terms_list_id
  const transactions = [
    {
      organization_id: ORG,
      transaction_type: "invoice",
      transaction_date: "2026-08-04",
      source_id: "I-E55104",
      amount: 1370,
      terms_name: "Net 30",
      terms_list_id: "SECRET-TERM",
      qb_root_customer_list_id: ROOT_A
    }
  ];
  const openAr = [
    {
      organization_id: ORG,
      source_invoice_id: "AR1",
      balance: 1370,
      invoice_date: "2026-08-04",
      due_date: "2026-09-03",
      terms_name: "Net 30",
      terms_list_id: "SECRET-TERM",
      reference_number: "E55104",
      customer_name: "319 Decor + Design:Kleins",
      original_amount: 1370,
      qb_root_customer_list_id: ROOT_A
    }
  ];
  const { supabase } = createFakeSupabase({ syncRun: okSync(), transactions, openAr });
  const profile = await getAccountDirectoryFinancials({
    supabase,
    store: makeStore({
      links: [{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]
    }),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "999999" },
    now: new Date("2026-08-13T18:00:00.000Z")
  });
  assert.equal(profile.paymentTerms, "Net 30");
  assert.equal(profile.aging.current.balance, 1370);
  assert.equal(profile.collectionAttention.code, "current");
  assert.equal(profile.overdueBalance, 0);
  assertNoIds(profile);
  assert.equal(/SECRET-TERM|terms_list_id/i.test(JSON.stringify(profile)), false);
  console.log("ok: linked profile aging/terms; O identity scrub still holds");
}

{
  const openAr = [];
  for (let i = 0; i < 1205; i += 1) {
    openAr.push({
      organization_id: ORG,
      source_invoice_id: `AR-${String(i).padStart(5, "0")}`,
      balance: 1,
      invoice_date: "2026-01-01",
      due_date: i % 2 === 0 ? "2026-09-01" : "2026-07-01",
      qb_root_customer_list_id: ROOT_A
    });
  }
  const { supabase, rangeCalls } = createFakeSupabase({ syncRun: okSync(), transactions: [], openAr });
  const sum = await sumLinkedOpenAr(supabase, { organizationId: ORG, rootListIds: [ROOT_A] });
  assert.equal(sum.invoice_count, 1205);
  const built = buildOpenArAging(sum.rows, "2026-08-13");
  assert.equal(
    built.aging.current.count +
      built.aging.days1to30.count +
      built.aging.days31to60.count +
      built.aging.days61to90.count +
      built.aging.days90Plus.count +
      built.aging.unknown.count,
    1205
  );
  assert.ok(rangeCalls.length >= 2);
  console.log("ok: P >1000 open A/R paging still works with aging fields");
}

console.log("accountDirectoryFinancialIntelligence.test.mjs — all passed");
