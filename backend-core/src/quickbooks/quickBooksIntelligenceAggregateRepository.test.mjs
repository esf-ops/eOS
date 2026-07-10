/**
 * Phase 4G.3 aggregate repository tests — mocked Supabase only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import {
  QB_INTELLIGENCE_AGGREGATE_RPC,
  QB_INTELLIGENCE_SECTION_RPCS,
  buildAggregatePriorityInsights,
  classifySectionResult,
  createQuickBooksIntelligenceAggregateRepository,
  isMissingAggregateRpcError,
  sanitizeAggregateRepositoryError,
  shapeFullAggregateSnapshot,
} from "./quickBooksIntelligenceAggregateRepository.js";
import { loadExecutiveIntelligenceSnapshot } from "./quickBooksIntelligenceService.js";
import { resolveIntelligencePeriod } from "./quickBooksIntelligencePeriod.js";

const ORG = "00000000-0000-4000-8000-0000000000fa";
const NOW = new Date("2026-07-10T15:00:00.000Z");

function fakeAggregatePayload() {
  return {
    ok: true,
    mode: "full_aggregate",
    is_sample_limited: false,
    organization_id: ORG,
    as_of_date: "2026-07-10",
    staging_row_counts: { invoices: 1000, payments: 500, estimates: 200 },
    invoice_summary: {
      invoice_count: 120,
      billed_total: 500000,
      open_total: 80000,
      customer_count: 40,
    },
    payment_summary_period: {
      payment_count: 90,
      collected_total: 420000,
      customer_count: 35,
    },
    estimate_summary: {
      estimate_count: 20,
      estimate_total: 90000,
      linked_count: 12,
      unlinked_count: 8,
      conversion_rate: 60,
    },
    sales_order_summary: {
      sales_order_count: 10,
      sales_order_total: 40000,
      linked_count: 4,
      unlinked_count: 6,
    },
    ar_summary: {
      asOfDate: "2026-07-10",
      open_invoice_count: 15,
      open_balance_total: 80000,
      overdue_invoice_count: 5,
      overdue_balance_total: 20000,
      buckets: {
        current: { invoice_count: 10, balance_total: 60000 },
        "1_30": { invoice_count: 2, balance_total: 8000 },
        "31_60": { invoice_count: 1, balance_total: 4000 },
        "61_90": { invoice_count: 1, balance_total: 4000 },
        "90_plus": { invoice_count: 1, balance_total: 4000 },
        unknown: { invoice_count: 0, balance_total: 0 },
      },
    },
    monthly_trend: [
      {
        month: "2026-01",
        invoice_count: 10,
        invoice_total: 10000,
        payment_count: 5,
        payment_total: 8000,
        estimate_count: 2,
        estimate_total: 3000,
      },
    ],
    top_lists: {
      top_customers_by_revenue: [
        { rank: 1, qb_customer_list_id: "FAKE-CUST-A", billed_total: 10000, invoice_count: 2 },
      ],
      top_open_ar_customers: [
        { rank: 1, qb_customer_list_id: "FAKE-CUST-B", open_balance_total: 5000, open_invoice_count: 1 },
      ],
      top_payment_customers: [
        { rank: 1, qb_customer_list_id: "FAKE-CUST-A", payment_total: 4000, payment_count: 2 },
      ],
      top_estimate_leakage: [
        {
          rank: 1,
          qb_txn_id: "FAKE-EST-1",
          qb_customer_list_id: "FAKE-CUST-C",
          total_amount: 2500,
          reason: "unlinked_estimate",
        },
      ],
    },
  };
}

/** @param {Record<string, { data?: unknown, error?: object|null }>} responses */
function mockSupabase(responses) {
  /** @type {Array<{ name: string, args: object }>} */
  const calls = [];
  return {
    calls,
    client: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        const entry = responses[name];
        if (!entry) {
          return {
            data: null,
            error: { code: "PGRST202", message: `Could not find the function ${name}` },
          };
        }
        return { data: entry.data ?? null, error: entry.error ?? null };
      },
    },
  };
}

function sectionResponses(overrides = {}) {
  return {
    [QB_INTELLIGENCE_SECTION_RPCS.staging_counts]: {
      data: { invoices: 1000, payments: 500 },
    },
    [QB_INTELLIGENCE_SECTION_RPCS.invoice_summary]: {
      data: fakeAggregatePayload().invoice_summary,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.payment_summary]: {
      data: fakeAggregatePayload().payment_summary_period,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.estimate_summary]: {
      data: fakeAggregatePayload().estimate_summary,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.sales_order_summary]: {
      data: fakeAggregatePayload().sales_order_summary,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.ar_aging]: {
      data: fakeAggregatePayload().ar_summary,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.monthly_trend]: {
      data: fakeAggregatePayload().monthly_trend,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.top_customers]: {
      data: fakeAggregatePayload().top_lists.top_customers_by_revenue,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.top_open_ar]: {
      data: fakeAggregatePayload().top_lists.top_open_ar_customers,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.top_payment_customers]: {
      data: fakeAggregatePayload().top_lists.top_payment_customers,
    },
    [QB_INTELLIGENCE_SECTION_RPCS.top_estimate_leakage]: {
      data: fakeAggregatePayload().top_lists.top_estimate_leakage,
    },
    ...overrides,
  };
}

describe("quickBooksIntelligenceAggregateRepository helpers", () => {
  it("detects missing RPC errors", () => {
    assert.equal(isMissingAggregateRpcError({ code: "PGRST202", message: "Could not find the function" }), true);
    assert.equal(isMissingAggregateRpcError({ code: "57014", message: "timeout" }), false);
  });

  it("sanitizes missing section RPC errors with clear diagnostic", () => {
    const err = sanitizeAggregateRepositoryError({
      code: "PGRST202",
      message: "Could not find the function SENTINEL_NAME raw_payload",
    });
    assert.equal(err.missingRpc, true);
    assert.equal(err.fallback_reason, "section_rpcs_unavailable");
    assert.match(String(err.message), /4G\.3/);
    assert.equal(String(err.message).includes("SENTINEL"), false);
    assert.equal(String(err.message).includes("raw_payload"), false);
  });

  it("classifies section results safely", () => {
    assert.equal(
      classifySectionResult({
        status: "rejected",
        reason: { code: "57014", message: "canceling statement SENTINEL" },
      }).status,
      "timeout",
    );
  });

  it("shapes full aggregate snapshot without raw_payload", () => {
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    const snapshot = shapeFullAggregateSnapshot(fakeAggregatePayload(), period, ORG);
    assert.equal(snapshot.mode, "full_aggregate");
    assertNoRawPayload(snapshot);
  });

  it("builds capped priority insights from top lists", () => {
    const bits = buildAggregatePriorityInsights(fakeAggregatePayload(), 10);
    assert.ok(bits.insight_list.length <= 10);
  });
});

describe("createQuickBooksIntelligenceAggregateRepository section RPCs", () => {
  it("calls section RPCs with organization and date bounds", async () => {
    const mock = mockSupabase(sectionResponses());
    const repo = createQuickBooksIntelligenceAggregateRepository({
      getSupabase: () => mock.client,
    });
    const period = resolveIntelligencePeriod({ year: 2026 }, NOW);
    const data = await repo.loadExecutiveAggregate(ORG, period, { topN: 10 });

    const invoiceCall = mock.calls.find((c) => c.name === QB_INTELLIGENCE_SECTION_RPCS.invoice_summary);
    assert.ok(invoiceCall);
    assert.equal(invoiceCall.args.p_organization_id, ORG);
    assert.equal(invoiceCall.args.p_date_from, "2026-01-01");
    assert.equal(invoiceCall.args.p_date_to, "2026-07-10");
    assert.equal(data.aggregate_version, "v3_sections");
    assert.equal(mock.calls.some((c) => c.name === QB_INTELLIGENCE_AGGREGATE_RPC), false);
    assertNoRawPayload(data);
  });

  it("returns partial aggregate when optional section times out", async () => {
    const mock = mockSupabase(
      sectionResponses({
        [QB_INTELLIGENCE_SECTION_RPCS.monthly_trend]: {
          data: null,
          error: { code: "57014", message: "canceling statement due to statement timeout" },
        },
      }),
    );
    const repo = createQuickBooksIntelligenceAggregateRepository({
      getSupabase: () => mock.client,
    });
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    const data = await repo.loadExecutiveAggregate(ORG, period, { topN: 10 });
    assert.equal(data.is_section_partial, true);
    assert.ok(data.failed_sections.includes("monthly_trend"));
  });

  it("does not return full_aggregate when a core section times out", async () => {
    const mock = mockSupabase(
      sectionResponses({
        [QB_INTELLIGENCE_SECTION_RPCS.invoice_summary]: {
          data: null,
          error: { code: "57014", message: "canceling statement due to statement timeout SENTINEL" },
        },
      }),
    );
    const repo = createQuickBooksIntelligenceAggregateRepository({
      getSupabase: () => mock.client,
    });
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    await assert.rejects(
      () => repo.loadExecutiveAggregate(ORG, period),
      (err) => {
        assert.equal(err.code, "57014");
        assert.equal(err.message, "QuickBooks full aggregate timed out");
        return true;
      },
    );
  });

  it("does not fall back to slow orchestrator when section RPCs are missing", async () => {
    const mock = mockSupabase({
      [QB_INTELLIGENCE_AGGREGATE_RPC]: { data: fakeAggregatePayload() },
    });
    const repo = createQuickBooksIntelligenceAggregateRepository({
      getSupabase: () => mock.client,
    });
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    await assert.rejects(
      () => repo.loadExecutiveAggregate(ORG, period),
      (err) => {
        assert.equal(err.missingRpc, true);
        assert.equal(err.fallback_reason, "section_rpcs_unavailable");
        assert.equal(mock.calls.some((c) => c.name === QB_INTELLIGENCE_AGGREGATE_RPC), false);
        return true;
      },
    );
  });
});

describe("loadExecutiveIntelligenceSnapshot aggregate preference", () => {
  it("returns full_aggregate when section RPCs succeed", async () => {
    const snapshot = await loadExecutiveIntelligenceSnapshot(
      {
        loadExecutiveAggregate: async () => ({
          ...fakeAggregatePayload(),
          aggregate_version: "v3_sections",
        }),
        loadOrgCurrentDataset: async () => {
          throw new Error("sample path should not run");
        },
      },
      ORG,
      { now: NOW, mode: "auto" },
    );
    assert.equal(snapshot.mode, "full_aggregate");
    assert.equal(snapshot.aggregate_version, "v3_sections");
    assertNoRawPayload(snapshot);
  });

  it("falls back to sample_preview when section RPCs missing", async () => {
    const snapshot = await loadExecutiveIntelligenceSnapshot(
      {
        loadExecutiveAggregate: async () => {
          const err = sanitizeAggregateRepositoryError({
            code: "PGRST202",
            message: "Could not find the function",
          });
          throw err;
        },
        loadOrgCurrentDataset: async () => ({
          organizationId: ORG,
          asOfDate: "2026-07-10",
          customers: [],
          invoices: [
            {
              qb_txn_id: "FAKE-INV-1",
              qb_customer_list_id: "FAKE-CUST-A",
              txn_date: "2026-05-01",
              due_date: "2026-05-15",
              total_amount: 100,
              balance_remaining: 50,
              is_paid: false,
              linked_txns: [],
              qb_sales_rep_list_id: null,
            },
          ],
          payments: [],
          estimates: [],
          salesOrders: [],
          salesReps: [],
          load_meta: { page_size: 100, staging_row_counts: { invoices: 1 } },
        }),
      },
      ORG,
      { now: NOW, mode: "auto", maxRows: 250, pageSize: 100 },
    );
    assert.equal(snapshot.mode, "sample_preview");
    assert.equal(snapshot.fallback_reason, "section_rpcs_unavailable");
    assertNoRawPayload(snapshot);
  });

  it("does not fall back to sample_preview on aggregate 57014", async () => {
    let sampleCalled = false;
    await assert.rejects(
      () =>
        loadExecutiveIntelligenceSnapshot(
          {
            loadExecutiveAggregate: async () => {
              const err = new Error("canceling statement due to statement timeout");
              // @ts-ignore
              err.code = "57014";
              // @ts-ignore
              err.aggregateTimeout = true;
              throw err;
            },
            loadOrgCurrentDataset: async () => {
              sampleCalled = true;
              throw new Error("sample path should not run");
            },
          },
          ORG,
          { now: NOW, mode: "auto" },
        ),
      (err) => {
        assert.equal(sampleCalled, false);
        assert.equal(err.code, "57014");
        return true;
      },
    );
  });
});
