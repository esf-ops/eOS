/**
 * Phase 4G aggregate repository tests — mocked Supabase only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import {
  QB_INTELLIGENCE_AGGREGATE_RPC,
  buildAggregatePriorityInsights,
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

describe("quickBooksIntelligenceAggregateRepository helpers", () => {
  it("detects missing RPC errors", () => {
    assert.equal(isMissingAggregateRpcError({ code: "PGRST202", message: "Could not find the function" }), true);
    assert.equal(isMissingAggregateRpcError({ code: "42883", message: "function does not exist" }), true);
    assert.equal(isMissingAggregateRpcError({ code: "57014", message: "timeout" }), false);
  });

  it("sanitizes errors without leaking payload text", () => {
    const err = sanitizeAggregateRepositoryError({
      code: "PGRST202",
      message: "Could not find the function SENTINEL_NAME raw_payload",
    });
    assert.equal(err.missingRpc, true);
    assert.equal(String(err.message).includes("SENTINEL"), false);
    assert.equal(String(err.message).includes("raw_payload"), false);
  });

  it("shapes full aggregate snapshot without raw_payload", () => {
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    const snapshot = shapeFullAggregateSnapshot(fakeAggregatePayload(), period, ORG);
    assert.equal(snapshot.mode, "full_aggregate");
    assert.equal(snapshot.is_sample_limited, false);
    assert.equal(snapshot.invoice_summary.invoice_count, 120);
    assert.ok(snapshot.insight_list.length <= 10);
    assertNoRawPayload(snapshot);
    assert.equal(JSON.stringify(snapshot).includes("raw_payload"), false);
  });

  it("builds capped priority insights from top lists", () => {
    const bits = buildAggregatePriorityInsights(fakeAggregatePayload(), 10);
    assert.ok(bits.insight_list.length <= 10);
    assert.ok(bits.insight_groups.every((g) => g.items.length <= 3));
  });
});

describe("createQuickBooksIntelligenceAggregateRepository", () => {
  it("calls RPC with organization and date bounds", async () => {
    /** @type {object|null} */
    let rpcArgs = null;
    const repo = createQuickBooksIntelligenceAggregateRepository({
      getSupabase: () => ({
        rpc: async (name, args) => {
          rpcArgs = { name, args };
          return { data: fakeAggregatePayload(), error: null };
        },
      }),
    });
    const period = resolveIntelligencePeriod({ year: 2026 }, NOW);
    const data = await repo.loadExecutiveAggregate(ORG, period, { topN: 10 });
    assert.equal(rpcArgs.name, QB_INTELLIGENCE_AGGREGATE_RPC);
    assert.equal(rpcArgs.name, "qb_intelligence_executive_aggregate");
    assert.equal(rpcArgs.args.p_organization_id, ORG);
    assert.equal(rpcArgs.args.p_date_from, "2026-01-01");
    assert.equal(rpcArgs.args.p_date_to, "2026-07-10");
    assert.equal(rpcArgs.args.p_as_of, "2026-07-10");
    assert.equal(rpcArgs.args.p_sort, "risk_desc");
    assert.equal(rpcArgs.args.p_top_n, 10);
    assert.deepEqual(Object.keys(rpcArgs.args).sort(), [
      "p_as_of",
      "p_date_from",
      "p_date_to",
      "p_organization_id",
      "p_sort",
      "p_top_n",
    ]);
    assert.equal(data.is_sample_limited, false);
    assertNoRawPayload(data);
  });

  it("marks missing RPC for fallback", async () => {
    const repo = createQuickBooksIntelligenceAggregateRepository({
      getSupabase: () => ({
        rpc: async () => ({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        }),
      }),
    });
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    await assert.rejects(
      () => repo.loadExecutiveAggregate(ORG, period),
      (err) => {
        assert.equal(err.missingRpc, true);
        assert.equal(err.fallback_reason, "aggregate_rpc_unavailable");
        assert.equal(String(err.message).includes("raw_payload"), false);
        return true;
      },
    );
  });

  it("marks aggregate timeout without missingRpc", async () => {
    const repo = createQuickBooksIntelligenceAggregateRepository({
      getSupabase: () => ({
        rpc: async () => ({
          data: null,
          error: { code: "57014", message: "canceling statement due to statement timeout SENTINEL" },
        }),
      }),
    });
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    await assert.rejects(
      () => repo.loadExecutiveAggregate(ORG, period),
      (err) => {
        assert.equal(err.aggregateTimeout, true);
        assert.equal(err.missingRpc, false);
        assert.equal(err.code, "57014");
        assert.equal(err.message, "QuickBooks full aggregate timed out");
        assert.equal(err.fallback_used, false);
        assert.equal(err.fallback_reason, null);
        assert.equal(String(err.message).includes("SENTINEL"), false);
        return true;
      },
    );
  });
});

describe("loadExecutiveIntelligenceSnapshot aggregate preference", () => {
  it("returns full_aggregate when RPC succeeds", async () => {
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    const snapshot = await loadExecutiveIntelligenceSnapshot(
      {
        loadExecutiveAggregate: async () => fakeAggregatePayload(),
        loadOrgCurrentDataset: async () => {
          throw new Error("sample path should not run");
        },
      },
      ORG,
      { now: NOW, mode: "auto" },
    );
    assert.equal(snapshot.mode, "full_aggregate");
    assert.equal(snapshot.is_sample_limited, false);
    assert.equal(snapshot.attempted_mode, "auto");
    assert.equal(snapshot.aggregate_attempted, true);
    assert.equal(snapshot.aggregate_available, true);
    assert.equal(snapshot.fallback_used, false);
    assert.equal(snapshot.fallback_reason, null);
    assert.equal(snapshot.period.date_from, period.date_from);
    assertNoRawPayload(snapshot);
  });

  it("falls back to sample_preview when RPC missing", async () => {
    const snapshot = await loadExecutiveIntelligenceSnapshot(
      {
        loadExecutiveAggregate: async () => {
          const err = new Error("QuickBooks intelligence aggregate RPC is not installed");
          // @ts-ignore
          err.missingRpc = true;
          // @ts-ignore
          err.code = "PGRST202";
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
    assert.equal(snapshot.is_sample_limited, true);
    assert.equal(snapshot.attempted_mode, "auto");
    assert.equal(snapshot.aggregate_attempted, true);
    assert.equal(snapshot.aggregate_available, false);
    assert.equal(snapshot.fallback_used, true);
    assert.equal(snapshot.fallback_reason, "aggregate_rpc_unavailable");
    assert.equal(snapshot.load_meta.aggregate_fallback_reason, "aggregate_rpc_unavailable");
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
        assert.equal(err.mode, "full_aggregate");
        assert.equal(err.aggregate_attempted, true);
        assert.equal(err.fallback_used, false);
        assert.equal(err.fallback_reason, null);
        assert.equal(err.message, "QuickBooks full aggregate timed out");
        return true;
      },
    );
  });
});
