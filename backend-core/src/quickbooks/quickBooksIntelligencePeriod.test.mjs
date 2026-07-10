/**
 * Phase 4F period resolution + date-scoped aggregate tests.
 * Fake/sentinel data only — no live Supabase, no PII assertions beyond sentinels.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertNoRawPayload } from "./quickBooksIntelligenceFacts.js";
import {
  resolveIntelligencePeriod,
  isDateInInclusiveRange,
  listMonthsInRange,
} from "./quickBooksIntelligencePeriod.js";
import {
  buildPeriodScopedIntelligence,
  filterDatasetByTxnPeriod,
  groupAndCapInsights,
  buildPeriodMonthlyTrend,
} from "./quickBooksIntelligencePeriodAggregates.js";
import { parseIntelligenceQuery } from "./quickBooksIntelligenceApi.js";

const ORG = "00000000-0000-4000-8000-0000000000fa";
const NOW = new Date("2026-07-10T15:00:00.000Z");

function fakeDataset() {
  return {
    organizationId: ORG,
    asOfDate: "2026-07-10",
    customers: [
      { qb_list_id: "FAKE-CUST-A", is_active: true, time_modified: null, time_created: null },
      { qb_list_id: "FAKE-CUST-B", is_active: true, time_modified: null, time_created: null },
    ],
    invoices: [
      {
        qb_txn_id: "FAKE-INV-2025",
        qb_customer_list_id: "FAKE-CUST-A",
        txn_date: "2025-11-01",
        due_date: "2025-11-15",
        total_amount: 9000,
        balance_remaining: 0,
        is_paid: true,
        qb_sales_rep_list_id: null,
        linked_txns: [],
      },
      {
        qb_txn_id: "FAKE-INV-1",
        qb_customer_list_id: "FAKE-CUST-A",
        txn_date: "2026-05-01",
        due_date: "2026-05-15",
        total_amount: 5000,
        balance_remaining: 2500,
        is_paid: false,
        qb_sales_rep_list_id: "FAKE-REP-1",
        linked_txns: [],
      },
      {
        qb_txn_id: "FAKE-INV-2",
        qb_customer_list_id: "FAKE-CUST-B",
        txn_date: "2026-06-15",
        due_date: "2026-07-20",
        total_amount: 1000,
        balance_remaining: 1000,
        is_paid: false,
        qb_sales_rep_list_id: null,
        linked_txns: [],
      },
    ],
    payments: [
      {
        qb_txn_id: "FAKE-PAY-1",
        qb_customer_list_id: "FAKE-CUST-A",
        txn_date: "2026-06-01",
        total_amount: 2500,
        linked_txns: [{ qb_txn_id: "FAKE-INV-1", txn_type: "Invoice" }],
      },
      {
        qb_txn_id: "FAKE-PAY-OLD",
        qb_customer_list_id: "FAKE-CUST-A",
        txn_date: "2025-12-01",
        total_amount: 100,
        linked_txns: [],
      },
    ],
    estimates: [
      {
        qb_txn_id: "FAKE-EST-1",
        qb_customer_list_id: "FAKE-CUST-B",
        txn_date: "2026-02-01",
        total_amount: 3000,
        is_fully_invoiced: false,
        linked_txns: [],
      },
      {
        qb_txn_id: "FAKE-EST-OLD",
        qb_customer_list_id: "FAKE-CUST-A",
        txn_date: "2024-01-01",
        total_amount: 50,
        is_fully_invoiced: false,
        linked_txns: [],
      },
    ],
    salesOrders: [
      {
        qb_txn_id: "FAKE-SO-1",
        qb_customer_list_id: "FAKE-CUST-A",
        txn_date: "2026-03-01",
        total_amount: 800,
        is_fully_invoiced: false,
        linked_txns: [],
      },
    ],
    salesReps: [{ qb_list_id: "FAKE-REP-1", is_active: true, time_modified: null, time_created: null }],
  };
}

describe("quickBooksIntelligencePeriod", () => {
  it("defaults to current-year YTD", () => {
    const period = resolveIntelligencePeriod({}, NOW);
    assert.equal(period.preset, "ytd");
    assert.equal(period.date_from, "2026-01-01");
    assert.equal(period.date_to, "2026-07-10");
    assert.equal(period.as_of, "2026-07-10");
    assert.equal(period.sort, "risk_desc");
  });

  it("resolves explicit year=2026", () => {
    const period = resolveIntelligencePeriod({ year: 2026 }, NOW);
    assert.equal(period.date_from, "2026-01-01");
    assert.equal(period.date_to, "2026-07-10");
    assert.equal(period.year, 2026);
  });

  it("resolves custom date_from/date_to", () => {
    const period = resolveIntelligencePeriod({
      date_from: "2026-03-01",
      date_to: "2026-03-31",
    }, NOW);
    assert.equal(period.preset, "custom");
    assert.equal(period.date_from, "2026-03-01");
    assert.equal(period.date_to, "2026-03-31");
  });

  it("checks inclusive date ranges", () => {
    assert.equal(isDateInInclusiveRange("2026-05-01", "2026-01-01", "2026-07-10"), true);
    assert.equal(isDateInInclusiveRange("2025-12-31", "2026-01-01", "2026-07-10"), false);
    assert.equal(isDateInInclusiveRange(null, "2026-01-01", "2026-07-10"), false);
  });

  it("lists months in range ascending", () => {
    assert.deepEqual(listMonthsInRange("2026-05-01", "2026-07-10"), [
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });
});

describe("parseIntelligenceQuery period defaults", () => {
  it("defaults to YTD when period params omitted", () => {
    const parsed = parseIntelligenceQuery({}, NOW);
    assert.equal(parsed.preset, "ytd");
    assert.equal(parsed.dateFrom, "2026-01-01");
    assert.equal(parsed.dateTo, "2026-07-10");
    assert.equal(parsed.sort, "risk_desc");
    assert.equal(parsed.insightListLimit, 10);
  });

  it("accepts year and sort", () => {
    const parsed = parseIntelligenceQuery({ year: "2026", sort: "newest" }, NOW);
    assert.equal(parsed.year, 2026);
    assert.equal(parsed.sort, "newest");
  });
});

describe("quickBooksIntelligencePeriodAggregates", () => {
  it("filters invoices/payments/estimates/sales orders by txn_date", () => {
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    const filtered = filterDatasetByTxnPeriod(fakeDataset(), period);
    assert.equal(filtered.invoices.length, 2);
    assert.equal(filtered.payments.length, 1);
    assert.equal(filtered.estimates.length, 1);
    assert.equal(filtered.salesOrders.length, 1);
    assert.equal(
      filtered.invoices.some((i) => i.qb_txn_id === "FAKE-INV-2025"),
      false,
    );
    assertNoRawPayload(filtered);
  });

  it("builds monthly trend sorted by month", () => {
    const period = resolveIntelligencePeriod({ preset: "ytd" }, NOW);
    const filtered = filterDatasetByTxnPeriod(fakeDataset(), period);
    const months = buildPeriodMonthlyTrend({ ...filtered, asOfDate: period.as_of }, period);
    assert.ok(months.length >= 6);
    assert.equal(months[0].month <= months[1].month, true);
    const may = months.find((m) => m.month === "2026-05");
    assert.ok(may);
    assert.equal(may.invoice_count, 1);
    assert.equal(may.invoice_total, 5000);
  });

  it("builds period-scoped aggregates with capped grouped insights", () => {
    const period = resolveIntelligencePeriod({ year: 2026, sort: "amount_desc" }, NOW);
    const aggregates = buildPeriodScopedIntelligence(fakeDataset(), period, {
      isPartial: true,
      maxRows: 250,
      pageSize: 100,
      insightListLimit: 10,
    });

    assert.equal(aggregates.period.preset, "ytd");
    assert.equal(aggregates.period.date_from, "2026-01-01");
    assert.equal(aggregates.period.is_partial, true);
    assert.equal(aggregates.invoice_summary.invoice_count, 2);
    assert.equal(aggregates.invoice_summary.billed_total, 6000);
    assert.equal(aggregates.payment_summary_period.payment_count, 1);
    assert.equal(aggregates.payment_summary_period.collected_total, 2500);
    assert.equal(aggregates.estimate_summary.estimate_count, 1);
    assert.equal(aggregates.sales_order_summary.sales_order_count, 1);
    assert.ok(aggregates.ar_summary.open_invoice_count >= 1);
    assert.ok(Array.isArray(aggregates.monthly_trend));
    assert.ok(aggregates.top_lists.top_customers_by_revenue.length <= 10);
    assert.ok(aggregates.insight_list.length <= 10);
    assert.ok(Array.isArray(aggregates.insight_groups));
    for (const g of aggregates.insight_groups) {
      assert.ok(g.items.length <= 3);
    }
    assertNoRawPayload(aggregates);
    const json = JSON.stringify(aggregates);
    assert.equal(json.includes("raw_payload"), false);
    assert.equal(json.includes("SENTINEL"), false);
    assert.equal(json.includes("BillAddress"), false);
  });

  it("groups and caps insight lists", () => {
    const flat = [];
    for (let i = 0; i < 20; i++) {
      flat.push({
        insight: "estimate_to_invoice_leakage",
        severity: "medium",
        qb_txn_id: `FAKE-EST-${i}`,
        summary: `leak ${i}`,
        detail: {},
      });
    }
    flat.push({
      insight: "overdue_ar_risks",
      severity: "high",
      qb_txn_id: "FAKE-INV-1",
      summary: "overdue",
      detail: {},
    });
    const { priority_insights, insight_groups } = groupAndCapInsights(flat, 10, 3);
    assert.equal(priority_insights.length, 10);
    const leak = insight_groups.find((g) => g.insight === "estimate_to_invoice_leakage");
    assert.ok(leak);
    assert.equal(leak.count, 20);
    assert.equal(leak.items.length, 3);
  });
});
