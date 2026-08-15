/**
 * Account 360 — identity, trend math, timeline, health, no company Finance leakage.
 * Run: node backend-core/src/accountDirectory/accountDirectory360.test.mjs
 */

import assert from "node:assert/strict";
import {
  buildRelationshipHealth,
  getAccountDirectoryOpenInvoices,
  getAccountDirectoryRelationship,
  getAccountDirectoryTimeline,
  getAccountDirectoryTrend,
  loadListFinancialIntel,
  listIntelPublic
} from "./accountDirectory360.mjs";
import {
  buildCustomerMonthlyPoints,
  resolveCustomerTrendWindow
} from "./accountDirectoryCustomerTrend.mjs";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { createAccountDirectoryService } from "./accountDirectoryService.mjs";
import { attachAccountDirectoryRoutes } from "./accountDirectoryApi.js";
import { ACCOUNT_DIRECTORY_HEAD_SLUG } from "./accountDirectoryAuth.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOT_A = "80010327-1759266211";
const ROOT_OTHER = "99999999-9999999999";

function assertNoIds(payload) {
  const json = JSON.stringify(payload);
  assert.equal(
    /qb_customer_list_id|qb_root_customer_list_id|external_id|terms_list_id|80010327|80010E11|99999999/i.test(json),
    false
  );
}

function createFakeSupabase({
  syncRun,
  transactions = [],
  openAr = [],
  quotes = [],
  studio = []
}) {
  function makeBuilder(allRows) {
    const state = {
      filters: {},
      inFilters: {},
      gte: {},
      lte: {},
      isNull: [],
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
      is(col, val) {
        if (val === null) state.isNull.push(col);
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
          for (const col of state.isNull) {
            if (row[col] != null) return false;
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
      if (table === "sales_quickbooks_sync_runs") return makeBuilder(syncRun ? [syncRun] : []);
      if (table === "sales_quickbooks_financial_transactions") return makeBuilder(transactions);
      if (table === "sales_quickbooks_open_ar_current") return makeBuilder(openAr);
      if (table === "quote_headers") return makeBuilder(quotes);
      if (table === "studio_estimates") return makeBuilder(studio);
      throw new Error(`unexpected table ${table}`);
    }
  };
}

const syncRun = {
  id: "22222222-2222-4222-8222-222222222222",
  organization_id: ORG,
  status: "success",
  completed_at: "2026-08-13T12:00:00.000Z",
  coverage_start_date: "2026-01-01",
  coverage_end_date: "2026-08-13"
};

function storeFor(links) {
  return {
    async getAccount(orgId, accountId) {
      if (orgId !== ORG || accountId !== ACCOUNT) return null;
      return { id: ACCOUNT, displayName: "Acme", status: "active", organizationId: ORG };
    },
    async listExternalLinks(orgId, accountId) {
      assert.equal(orgId, ORG);
      assert.equal(accountId, ACCOUNT);
      return links;
    },
    async listContacts() {
      return [{ isPrimaryEstimating: true, isActive: true }];
    },
    async listLocations() {
      return [{ isPrimaryAccountLocation: true, isActive: true }];
    },
    async listAuditEvents() {
      return [
        { id: "e1", createdAt: "2026-08-01T00:00:00.000Z", action: "create_account", changedFields: [] }
      ];
    }
  };
}

{
  const window = resolveCustomerTrendWindow("trailing_12", "2026-08-13", "2026-01-01", "2026-08-13");
  assert.equal(window.ok, true);
  assert.equal(window.start, "2026-01-01");
  const points = buildCustomerMonthlyPoints(
    [
      { transaction_type: "invoice", transaction_date: "2026-03-15", amount: 100 },
      { transaction_type: "payment", transaction_date: "2026-03-20", amount: 40 },
      { transaction_type: "invoice", transaction_date: "2025-12-01", amount: 999 }
    ],
    ["2026-03"]
  );
  assert.equal(points[0].invoiced, 100);
  assert.equal(points[0].collected, 40);
  assert.equal(points.length, 1);
  const y2025 = resolveCustomerTrendWindow("2025", "2026-08-13", "2026-01-01", "2026-08-13");
  assert.equal(y2025.ok, false);
  console.log("ok: trend window / month math / coverage clip");
}

{
  const health = buildRelationshipHealth({
    account: { status: "active", hasPrimaryContact: false, hasPrimaryLocation: true, quickbooksLinked: true },
    financials: {
      linked: true,
      status: "ok",
      summary: { openAr: 500 },
      collectionAttention: {
        code: "priority",
        reason: "1 invoice totaling $500 is overdue; oldest is 90 days past due."
      },
      oldestOverdueInvoice: { daysOverdue: 90, referenceNumber: "INV-9" },
      daysSinceLastPayment: 200,
      recentActivity: [{ type: "invoice" }]
    },
    qbEnrichment: { code: "linked" }
  });
  assert.equal(health.state, "priority");
  assert.ok(health.signals.some((s) => s.code === "missing_primary_contact"));
  assert.ok(health.signals.some((s) => s.target === "Financials"));
  assert.equal(health.reason, "1 invoice totaling $500 is overdue; oldest is 90 days past due.");
  const reviewHealth = buildRelationshipHealth({
    account: { status: "active", hasPrimaryContact: true, hasPrimaryLocation: true, quickbooksLinked: false },
    financials: { linked: false, status: "unlinked" },
    qbEnrichment: { code: "needs_review" }
  });
  assert.equal(reviewHealth.state, "attention");
  assert.ok(reviewHealth.signals.some((s) => s.code === "qb_needs_review"));
  console.log("ok: deterministic health ranking");
}

{
  const supabase = createFakeSupabase({
    syncRun,
    transactions: [
      {
        organization_id: ORG,
        transaction_type: "invoice",
        transaction_date: "2026-03-01",
        source_id: "I1",
        amount: 80,
        qb_root_customer_list_id: ROOT_A
      },
      {
        organization_id: ORG,
        transaction_type: "invoice",
        transaction_date: "2026-03-01",
        source_id: "I-OTHER",
        amount: 5000,
        customer_name: "Acme",
        qb_root_customer_list_id: ROOT_OTHER
      }
    ],
    openAr: [
      {
        organization_id: ORG,
        source_invoice_id: "AR1",
        balance: 25,
        invoice_date: "2026-01-10",
        due_date: "2026-02-01",
        reference_number: "100",
        original_amount: 25,
        qb_root_customer_list_id: ROOT_A
      }
    ]
  });
  const trend = await getAccountDirectoryTrend({
    supabase,
    store: storeFor([{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "999999" },
    now: new Date("2026-08-13T18:00:00.000Z"),
    period: "ytd"
  });
  assert.equal(trend.status, "ok");
  const mar = trend.points.find((p) => p.month === "2026-03");
  assert.equal(mar.invoiced, 80);
  assert.equal(JSON.stringify(trend).includes("5000"), false);
  assertNoIds(trend);

  const invoices = await getAccountDirectoryOpenInvoices({
    supabase,
    store: storeFor([{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    page: 1,
    limit: 1
  });
  assert.equal(invoices.items.length, 1);
  assert.equal(invoices.pagination.limit, 1);
  assertNoIds(invoices);
  console.log("ok: exact-link trend + invoice page; name twin excluded");
}

{
  const supabase = createFakeSupabase({
    syncRun,
    transactions: [
      {
        organization_id: ORG,
        transaction_type: "payment",
        transaction_date: "2026-07-04",
        source_id: "P1",
        amount: 12,
        reference_number: "P-12",
        qb_root_customer_list_id: ROOT_A
      }
    ],
    quotes: [
      {
        id: "q1",
        organization_id: ORG,
        account_directory_account_id: ACCOUNT,
        quote_number: "ESF-W-000001",
        quote_status: "draft",
        grand_total: 1111,
        updated_at: "2026-07-20T00:00:00.000Z",
        archived_at: null
      },
      {
        id: "q-other",
        organization_id: ORG,
        account_directory_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        quote_number: "OTHER",
        grand_total: 9,
        updated_at: "2026-07-21T00:00:00.000Z",
        archived_at: null
      }
    ]
  });
  const timeline = await getAccountDirectoryTimeline({
    supabase,
    store: storeFor([{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    page: 1,
    limit: 2,
    family: "all"
  });
  assert.equal(timeline.pagination.has_more, true);
  assert.equal(timeline.items.length, 2);
  const ats = timeline.items.map((e) => e.at);
  assert.ok(String(ats[0]) >= String(ats[1]));
  assert.equal(JSON.stringify(timeline).includes("OTHER"), false);
  const qbOnly = await getAccountDirectoryTimeline({
    supabase,
    store: storeFor([{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    family: "quickbooks"
  });
  assert.ok(qbOnly.items.every((e) => e.family === "quickbooks"));
  assertNoIds(timeline);

  const relationship = await getAccountDirectoryRelationship({
    supabase,
    store: storeFor([{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]),
    organizationId: ORG,
    accountId: ACCOUNT,
    role: "sales",
    env: { QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS: "999999" },
    now: new Date("2026-08-13T18:00:00.000Z")
  });
  assert.equal(relationship.estimates.internal.items.length, 1);
  assert.equal(relationship.estimates.internal.items[0].quote_number, "ESF-W-000001");
  assert.equal(relationship.jobs.state, "unavailable");
  assert.equal(relationship.jobs.notes, "Moraware job history is not connected to Account Directory yet.");
  assert.equal(relationship.quoteFlow.state, "unavailable");
  assert.equal(JSON.stringify(relationship).includes("net_income"), false);
  assert.equal(JSON.stringify(relationship).includes("account_id"), false);
  assertNoIds(relationship);
  console.log("ok: timeline order/filter/bounds + exact estimate identity; Moraware withheld");
}

{
  const loaded = await loadListFinancialIntel(createFakeSupabase({
    syncRun,
    openAr: [
      {
        organization_id: ORG,
        source_invoice_id: "1",
        balance: 40,
        due_date: "2026-01-01",
        qb_root_customer_list_id: ROOT_A
      }
    ]
  }), {
    organizationId: ORG,
    directoryRows: [
      {
        account: { id: ACCOUNT },
        links: [{ isActive: true, externalSystem: "quickbooks_desktop", externalId: ROOT_A }]
      }
    ]
  });
  const pub = listIntelPublic(loaded.byAccount.get(ACCOUNT));
  assert.equal(pub.openAr, 40);
  assert.equal(pub.overdue, true);
  assert.equal(JSON.stringify(pub).includes(ROOT_A), false);
  console.log("ok: list intel batch + scrub");
}

{
  const memory = createAccountDirectoryMemoryStore();
  const service = createAccountDirectoryService({ store: memory });
  const created = await service.createAccount({
    organizationId: ORG,
    role: "admin",
    actorUserId: "u1",
    payload: { displayName: "Org A Co" }
  });
  const other = await service.createAccount({
    organizationId: ORG_B,
    role: "admin",
    actorUserId: "u1",
    payload: { displayName: "Org B Co" }
  });
  const listedA = await service.listAccounts({ organizationId: ORG, role: "sales" });
  const listedB = await service.listAccounts({ organizationId: ORG_B, role: "sales" });
  assert.equal(listedA.items.some((i) => i.id === created.id), true);
  assert.equal(listedA.items.some((i) => i.id === other.id), false);
  assert.equal(listedB.items.some((i) => i.id === other.id), true);
  console.log("ok: organization isolation on directory list");
}

{
  const routes = new Map();
  const app = {
    get(path, ...handlers) {
      routes.set(`GET ${path}`, handlers);
    },
    post() {},
    patch() {},
    delete() {}
  };
  attachAccountDirectoryRoutes(app, {
    requireAuth: () => (req, res, next) => (req.user ? next() : res.status(401).json({ ok: false })),
    requireHeadAccess: (slug) => {
      assert.equal(slug, ACCOUNT_DIRECTORY_HEAD_SLUG);
      return (req, res, next) => next();
    },
    getSupabase: () => createFakeSupabase({ syncRun, transactions: [], openAr: [] }),
    store: createAccountDirectoryMemoryStore()
  });
  for (const p of [
    "/api/account-directory/accounts/:accountId/financials",
    "/api/account-directory/accounts/:accountId/financials/trend",
    "/api/account-directory/accounts/:accountId/financials/invoices",
    "/api/account-directory/accounts/:accountId/relationship",
    "/api/account-directory/accounts/:accountId/timeline"
  ]) {
    assert.ok(routes.has(`GET ${p}`), p);
  }
  console.log("ok: 360 routes are GET-only Account Directory paths");
}

console.log("accountDirectory360.test.mjs: ok");
