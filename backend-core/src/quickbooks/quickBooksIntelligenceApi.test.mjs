/**
 * Phase 4C QuickBooks intelligence API + smoke script tests.
 * Mocks / fake data only — no live Supabase, no secrets in assertions beyond sentinels.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import {
  attachQuickBooksIntelligenceRoutes,
  buildQuickBooksIntelligenceApiResponse,
  createQuickBooksIntelligenceHandlers,
  mapQuickBooksIntelligenceError,
  parseIntelligenceQuery,
  resolveQuickBooksOrganizationId,
  QB_INTELLIGENCE_API_DEFAULT_MAX_ROWS,
  QB_INTELLIGENCE_API_DEFAULT_PAGE_SIZE,
  QB_INTELLIGENCE_API_MAX_ROWS_CEILING,
  QB_INTELLIGENCE_API_PAGE_SIZE_CEILING,
} from "./quickBooksIntelligenceApi.js";
import {
  formatSmokeResultLines,
  parsePositiveIntEnv,
  REQUIRED_ENV,
  runSmokeCli,
  SMOKE_DEFAULT_MAX_ROWS,
} from "../scripts/smokeQuickBooksIntelligence.mjs";

const ORG = "00000000-0000-4000-8000-0000000000fa";
const SECRET = "SENTINEL_SERVICE_ROLE_SECRET_DO_NOT_PRINT";

function fakeSnapshot(overrides = {}) {
  return {
    organization_id: ORG,
    as_of_date: "2026-07-10",
    generated_at: "2026-07-10T19:00:00.000Z",
    period: {
      preset: "ytd",
      date_from: "2026-01-01",
      date_to: "2026-07-10",
      as_of: "2026-07-10",
      sort: "risk_desc",
      year: 2026,
      is_partial: true,
      is_sample_limited: true,
      max_rows: 50,
      page_size: 50,
    },
    mode: "sample_preview",
    is_sample_limited: true,
    load_meta: {
      page_size: 50,
      include_invoice_lines: false,
      staging_row_counts: {
        customers: 2,
        invoices: 3,
        payments: 1,
        estimates: 2,
        sales_orders: 1,
        sales_reps: 1,
        invoice_lines: 0,
      },
    },
    invoice_summary: {
      invoice_count: 3,
      billed_total: 6000,
      open_total: 3300,
      customer_count: 1,
    },
    payment_summary_period: {
      payment_count: 1,
      collected_total: 1000,
      customer_count: 0,
    },
    estimate_summary: {
      estimate_count: 2,
      estimate_total: 100,
      linked_count: 0,
      unlinked_count: 2,
      conversion_rate: 0,
    },
    sales_order_summary: {
      sales_order_count: 1,
      sales_order_total: 50,
      linked_count: 0,
      unlinked_count: 1,
    },
    monthly_trend: [{ month: "2026-06", invoice_count: 1, invoice_total: 1000, payment_count: 0, payment_total: 0, estimate_count: 0, estimate_total: 0 }],
    top_lists: {
      top_customers_by_revenue: [],
      top_open_ar_customers: [],
      top_estimate_leakage: [],
      top_payment_customers: [],
    },
    insight_groups: [],
    ar_summary: {
      asOfDate: "2026-07-10",
      open_invoice_count: 2,
      open_balance_total: 3300,
      overdue_invoice_count: 2,
      overdue_balance_total: 3300,
      buckets: {},
    },
    revenue_summary: {
      asOfDate: "2026-07-10",
      customers: [{ qb_customer_list_id: "FAKE-CUST-A", billed_total: 6000, open_balance_total: 2500 }],
      totals: { customer_count: 1, billed_total: 6000, open_balance_total: 2500 },
    },
    payment_summary: {
      asOfDate: "2026-07-10",
      customers: [],
      totals: { customer_count: 0, payment_count: 1, payment_total: 1000 },
    },
    estimate_sales_order_invoice_flow: {
      estimates: { count: 2 },
      sales_orders: { count: 1 },
      invoices: { count: 3 },
    },
    sales_rep_summary: { sales_reps: [{ qb_sales_rep_list_id: "FAKE-REP-1" }], unassigned: {} },
    customer_activity_trend: { months: [{ month: "2026-06" }] },
    insights: {
      overdue_ar_risks: { insight: "overdue_ar_risks", count: 1, items: [] },
      slow_paying_customers: { insight: "slow_paying_customers", count: 0, items: [] },
      high_value_customers: { insight: "high_value_customers", count: 1, items: [] },
      dormant_customers: { insight: "dormant_customers", count: 0, items: [] },
      estimate_to_invoice_leakage: { insight: "estimate_to_invoice_leakage", count: 1, items: [] },
      unpaid_invoice_risk: { insight: "unpaid_invoice_risk", count: 1, items: [] },
    },
    insight_list: [
      {
        insight: "overdue_ar_risks",
        severity: "high",
        qb_txn_id: "FAKE-INV-1",
        qb_customer_list_id: "FAKE-CUST-A",
        summary: "overdue_ar days=56",
        detail: { balance_remaining: 2500 },
      },
    ],
    ...overrides,
  };
}

function createFakeApp() {
  /** @type {Array<{ method: string, path: string, handlers: Function[] }>} */
  const routes = [];
  return {
    routes,
    get(path, ...handlers) {
      routes.push({ method: "GET", path, handlers });
    },
  };
}

async function invokeRoute(route, req) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  let idx = 0;
  const run = async () => {
    const handler = route.handlers[idx++];
    if (!handler) return;
    let nextCalled = false;
    await handler(req, res, async (err) => {
      if (err) throw err;
      nextCalled = true;
      await run();
    });
    // Final handler may not call next.
    if (!nextCalled && idx < route.handlers.length && res.body == null) {
      await run();
    }
  };
  await run();
  return res;
}

describe("quickBooksIntelligenceApi helpers", () => {
  it("resolves organization_id from query, user, then env", () => {
    assert.equal(
      resolveQuickBooksOrganizationId({ query: { organization_id: ORG } }),
      ORG,
    );
    assert.equal(
      resolveQuickBooksOrganizationId({ query: {}, user: { organization_id: ORG } }),
      ORG,
    );
    assert.equal(
      resolveQuickBooksOrganizationId({ query: {}, user: {} }, { QB_IMPORT_ORGANIZATION_ID: ORG }),
      ORG,
    );
    assert.equal(resolveQuickBooksOrganizationId({ query: {}, user: {} }, {}), "");
  });

  it("parses intelligence query with ceilings", () => {
    const parsed = parseIntelligenceQuery({
      as_of_date: "2026-07-10",
      page_size: "25",
      max_rows: "99999",
      include_invoice_lines: "true",
      insight_list_limit: "10",
    }, new Date("2026-07-10T12:00:00.000Z"));
    assert.equal(parsed.asOfDate, "2026-07-10");
    assert.equal(parsed.pageSize, 25);
    assert.equal(parsed.maxRows, QB_INTELLIGENCE_API_MAX_ROWS_CEILING);
    assert.equal(parsed.includeInvoiceLines, true);
    assert.equal(parsed.insightListLimit, 10);
    assert.equal(parsed.preset, "ytd");
    assert.equal(parsed.dateFrom, "2026-01-01");
  });

  it("applies bounded defaults when max_rows and page_size are omitted", () => {
    const parsed = parseIntelligenceQuery({}, new Date("2026-07-10T12:00:00.000Z"));
    assert.equal(parsed.maxRows, QB_INTELLIGENCE_API_DEFAULT_MAX_ROWS);
    assert.equal(parsed.pageSize, QB_INTELLIGENCE_API_DEFAULT_PAGE_SIZE);
    assert.equal(parsed.maxRows, 500);
    assert.equal(parsed.pageSize, 100);
    assert.equal(parsed.preset, "ytd");
  });

  it("caps excessive page_size", () => {
    const parsed = parseIntelligenceQuery({ page_size: "9999", max_rows: "100" });
    assert.equal(parsed.pageSize, QB_INTELLIGENCE_API_PAGE_SIZE_CEILING);
    assert.equal(parsed.pageSize, 500);
    assert.equal(parsed.maxRows, 100);
  });

  it("maps 57014 to a friendly timeout error without sensitive details", () => {
    const err = new Error("RAW_DB_ERROR SENTINEL_NAME canceling statement due to statement timeout");
    // @ts-ignore
    err.code = "57014";
    const mapped = mapQuickBooksIntelligenceError(err);
    assert.equal(mapped.status, 504);
    assert.equal(mapped.body.ok, false);
    assert.equal(mapped.body.code, "57014");
    assert.match(String(mapped.body.error), /timed out/i);
    assert.deepEqual(mapped.body.recommended, { max_rows: 50, page_size: 50 });
    const serialized = JSON.stringify(mapped.body);
    assert.equal(serialized.includes("SENTINEL_NAME"), false);
    assert.equal(serialized.includes("raw_payload"), false);
    assert.equal(serialized.includes("canceling statement"), false);
  });

  it("builds sanitized API response without raw_payload", () => {
    const body = buildQuickBooksIntelligenceApiResponse(fakeSnapshot(), {
      maxRows: 50,
      pageSize: 50,
    });
    assert.equal(body.ok, true);
    assert.equal(body.organization_id, ORG);
    assert.ok(body.ar_summary);
    assert.ok(body.revenue_summary);
    assert.ok(body.payment_summary);
    assert.ok(body.estimate_sales_order_invoice_flow);
    assert.ok(body.sales_rep_summary);
    assert.ok(body.customer_activity_trend);
    assert.ok(body.insight_list);
    assert.equal(body.metadata.max_rows, 50);
    assert.equal(body.metadata.page_size, 50);
    assertNoRawPayload(body);
    assert.equal(JSON.stringify(body).includes("raw_payload"), false);
  });

  it("rejects snapshot that still carries raw_payload", () => {
    assert.throws(
      () =>
        buildQuickBooksIntelligenceApiResponse(
          fakeSnapshot({ ar_summary: { raw_payload: { x: 1 } } }),
        ),
      /raw_payload/,
    );
  });
});

describe("quickBooksIntelligenceApi route auth + handler", () => {
  it("wires quickbooks_intelligence head slug and allowed roles", () => {
    const app = createFakeApp();
    let headSlug = null;
    let roles = null;
    attachQuickBooksIntelligenceRoutes(app, {
      requireAuth: () => (_req, res, next) => next(),
      requireRole: (allowed) => {
        roles = allowed;
        return (_req, res, next) => next();
      },
      requireHeadAccess: (slug) => {
        headSlug = slug;
        return (_req, res, next) => next();
      },
      getSupabase: () => ({}),
      loadExecutiveSnapshot: async () => fakeSnapshot(),
    });
    assert.equal(headSlug, "quickbooks_intelligence");
    assert.deepEqual(roles, ["admin", "super_admin", "executive", "finance", "accounting"]);
  });

  it("blocks unauthorized requests before handler", async () => {
    const app = createFakeApp();
    attachQuickBooksIntelligenceRoutes(app, {
      requireAuth: () => (_req, res) => res.status(401).json({ ok: false, error: "Unauthorized" }),
      requireRole: () => (_req, res, next) => next(),
      requireHeadAccess: () => (_req, res, next) => next(),
      getSupabase: () => ({}),
      loadExecutiveSnapshot: async () => {
        throw new Error("should not load");
      },
    });

    const route = app.routes.find((r) => r.path === "/api/admin/quickbooks/intelligence/executive");
    assert.ok(route);
    const res = await invokeRoute(route, { query: { organization_id: ORG }, user: null });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.ok, false);
  });

  it("blocks disallowed role", async () => {
    const app = createFakeApp();
    attachQuickBooksIntelligenceRoutes(app, {
      requireAuth: () => (_req, res, next) => next(),
      requireRole: () => (_req, res) => res.status(403).json({ ok: false, error: "Forbidden" }),
      requireHeadAccess: () => (_req, res, next) => next(),
      getSupabase: () => ({}),
      loadExecutiveSnapshot: async () => fakeSnapshot(),
    });
    const route = app.routes[0];
    const res = await invokeRoute(route, {
      query: { organization_id: ORG },
      user: { id: "u1", role: "viewer" },
    });
    assert.equal(res.statusCode, 403);
  });

  it("blocks missing quickbooks_intelligence head access", async () => {
    const app = createFakeApp();
    attachQuickBooksIntelligenceRoutes(app, {
      requireAuth: () => (_req, res, next) => next(),
      requireRole: () => (_req, res, next) => next(),
      requireHeadAccess: () => (_req, res) =>
        res.status(403).json({ ok: false, error: "You do not have access to this head." }),
      getSupabase: () => ({}),
      loadExecutiveSnapshot: async () => fakeSnapshot(),
    });
    const route = app.routes[0];
    const res = await invokeRoute(route, {
      query: { organization_id: ORG },
      user: { id: "u1", role: "admin" },
    });
    assert.equal(res.statusCode, 403);
  });

  it("returns sanitized executive snapshot for authorized admin", async () => {
    const app = createFakeApp();
    let loadedOrg = null;
    let loadedOpts = null;
    attachQuickBooksIntelligenceRoutes(app, {
      requireAuth: () => (_req, res, next) => next(),
      requireRole: () => (_req, res, next) => next(),
      requireHeadAccess: () => (_req, res, next) => next(),
      getSupabase: () => ({}),
      createRepository: () => ({
        loadOrgCurrentDataset: async () => {
          throw new Error("repo should not be used when loadExecutiveSnapshot is injected");
        },
      }),
      loadExecutiveSnapshot: async (_repo, organizationId, opts) => {
        loadedOrg = organizationId;
        loadedOpts = opts;
        return fakeSnapshot();
      },
    });

    const route = app.routes[0];
    const res = await invokeRoute(route, {
      query: { organization_id: ORG, max_rows: "50", page_size: "25" },
      user: { id: "u1", role: "admin", organization_id: ORG },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(loadedOrg, ORG);
    assert.equal(loadedOpts.maxRows, 50);
    assert.equal(loadedOpts.pageSize, 25);
    assert.ok(res.body.ar_summary);
    assert.ok(res.body.revenue_summary);
    assert.ok(res.body.payment_summary);
    assert.ok(res.body.estimate_sales_order_invoice_flow);
    assert.ok(res.body.sales_rep_summary);
    assert.ok(res.body.customer_activity_trend);
    assert.ok(Array.isArray(res.body.insight_list));
    assert.equal(res.body.metadata.max_rows, 50);
    assertNoRawPayload(res.body);
    assert.equal(JSON.stringify(res.body).includes("raw_payload"), false);
    assert.equal(JSON.stringify(res.body).includes(SECRET), false);
  });

  it("applies bounded defaults when query omits max_rows and page_size", async () => {
    let loadedOpts = null;
    const handlers = createQuickBooksIntelligenceHandlers({
      getSupabase: () => ({}),
      env: {},
      loadExecutiveSnapshot: async (_repo, _org, opts) => {
        loadedOpts = opts;
        return fakeSnapshot();
      },
    });
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
    };
    await handlers.getExecutiveSnapshot(
      { query: {}, user: { id: "u1", role: "admin", organization_id: ORG } },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(loadedOpts.maxRows, QB_INTELLIGENCE_API_DEFAULT_MAX_ROWS);
    assert.equal(loadedOpts.pageSize, QB_INTELLIGENCE_API_DEFAULT_PAGE_SIZE);
    assert.equal(res.body.metadata.max_rows, 500);
    assert.equal(res.body.metadata.page_size, 100);
    assertNoRawPayload(res.body);
  });

  it("returns friendly 57014 timeout payload from handler", async () => {
    const handlers = createQuickBooksIntelligenceHandlers({
      getSupabase: () => ({}),
      env: {},
      loadExecutiveSnapshot: async () => {
        const err = new Error("RAW_DB_ERROR SENTINEL_NAME canceling statement due to statement timeout");
        // @ts-ignore
        err.code = "57014";
        throw err;
      },
    });
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
    };
    await handlers.getExecutiveSnapshot(
      { query: { max_rows: "500" }, user: { id: "u1", organization_id: ORG } },
      res,
    );
    assert.equal(res.statusCode, 504);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, "57014");
    assert.deepEqual(res.body.recommended, { max_rows: 50, page_size: 50 });
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes("SENTINEL_NAME"), false);
    assert.equal(serialized.includes("raw_payload"), false);
    assert.equal(serialized.includes("canceling statement"), false);
  });

  it("handler returns 400 when organization_id missing", async () => {
    const handlers = createQuickBooksIntelligenceHandlers({
      getSupabase: () => ({}),
      env: {},
      loadExecutiveSnapshot: async () => fakeSnapshot(),
    });
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
    };
    await handlers.getExecutiveSnapshot({ query: {}, user: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.ok, false);
  });
});

describe("smokeQuickBooksIntelligence", () => {
  it("fails safely on missing env (names only)", async () => {
    const result = await runSmokeCli({ env: {} });
    assert.equal(result.exitCode, 1);
    assert.match(result.lines[0], /Missing required env:/);
    for (const key of REQUIRED_ENV) {
      assert.match(result.lines[0], new RegExp(key));
    }
    assert.equal(result.lines.join("\n").includes(SECRET), false);
  });

  it("prints safe counts only — no amounts, PII, secrets, or raw_payload", async () => {
    const snapshot = fakeSnapshot();
    // Inject a PII/amount-heavy snapshot; formatter must still avoid printing amounts/names.
    snapshot.revenue_summary.customers[0].Name = "SENTINEL_NAME_DO_NOT_SURFACE";

    const result = await runSmokeCli({
      env: {
        SUPABASE_URL: "https://fake.supabase.local",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
        QB_IMPORT_ORGANIZATION_ID: ORG,
        QB_INTELLIGENCE_SMOKE_MAX_ROWS: "50",
      },
      getSupabase: () => ({}),
      createRepository: () => ({ loadOrgCurrentDataset: async () => ({}) }),
      loadExecutiveSnapshot: async () => snapshot,
    });

    assert.equal(result.exitCode, 0);
    const out = result.lines.join("\n");
    assert.match(out, /ar_summary: true/);
    assert.match(out, /insight_list_count: 1/);
    assert.match(out, /staging_invoices: 3/);
    assert.match(out, /Result: OK/);
    assert.equal(out.includes(SECRET), false);
    assert.equal(out.includes("raw_payload"), false);
    assert.equal(out.includes("SENTINEL_NAME"), false);
    assert.equal(out.includes("2500"), false); // amount from detail
    assert.equal(out.includes("3300"), false); // open_balance_total
    assert.equal(out.includes("6000"), false); // billed_total
    assert.equal(out.includes("BillAddress"), false);
    assert.equal(out.includes("Memo"), false);
  });

  it("formatSmokeResultLines never embeds amount fields", () => {
    const lines = formatSmokeResultLines(fakeSnapshot(), {
      organizationId: ORG,
      maxRows: 50,
      pageSize: 50,
      asOfDate: "2026-07-10",
    });
    const out = lines.join("\n");
    assert.match(out, /ar_open_invoice_count: 2/);
    assert.equal(out.includes("open_balance_total"), false);
    assert.equal(out.includes("billed_total"), false);
    assert.equal(out.includes("payment_total"), false);
  });

  it("parsePositiveIntEnv clamps and defaults", () => {
    assert.equal(parsePositiveIntEnv(undefined, SMOKE_DEFAULT_MAX_ROWS, 500), 50);
    assert.equal(parsePositiveIntEnv("10", 50, 500), 10);
    assert.equal(parsePositiveIntEnv("9999", 50, 500), 500);
    assert.equal(parsePositiveIntEnv("nope", 50, 500), 50);
  });

  it("smoke failure returns safe message without raw error text", async () => {
    const result = await runSmokeCli({
      env: {
        SUPABASE_URL: "https://fake.supabase.local",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
        QB_IMPORT_ORGANIZATION_ID: ORG,
      },
      getSupabase: () => ({}),
      createRepository: () => ({}),
      loadExecutiveSnapshot: async () => {
        const err = new Error("RAW_DB_ERROR SENTINEL_NAME balance=9999.99");
        // @ts-ignore
        err.code = "57014";
        throw err;
      },
    });
    assert.equal(result.exitCode, 1);
    const out = result.lines.join("\n");
    assert.match(out, /smoke failed/i);
    assert.match(out, /57014/);
    assert.equal(out.includes("SENTINEL_NAME"), false);
    assert.equal(out.includes("9999.99"), false);
    assert.equal(out.includes(SECRET), false);
  });
});
