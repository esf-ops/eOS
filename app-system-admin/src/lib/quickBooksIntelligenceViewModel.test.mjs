/**
 * Phase 4D QuickBooks Intelligence UI — view-model + markup tests.
 * Fake API snapshots only. No network. No secrets.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertSafeIntelligenceSnapshot,
  findForbiddenKeys,
  formatOpaqueId,
  renderIntelligenceStateMarkup,
  resolveIntelligenceViewState,
} from "./quickBooksIntelligenceViewModel.js";

const ORG = "00000000-0000-4000-8000-0000000000fa";

function fakeSnapshot(overrides = {}) {
  return {
    ok: true,
    organization_id: ORG,
    generated_at: "2026-07-10T19:00:00.000Z",
    as_of_date: "2026-07-10",
    metadata: {
      organization_id: ORG,
      generated_at: "2026-07-10T19:00:00.000Z",
      as_of_date: "2026-07-10",
      page_size: 500,
      max_rows: null,
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
      insight_list_count: 2,
    },
    ar_summary: {
      open_invoice_count: 2,
      open_balance_total: 3300,
      overdue_invoice_count: 2,
      overdue_balance_total: 3300,
      buckets: {
        current: { invoice_count: 0, balance_total: 0 },
        "1_30": { invoice_count: 0, balance_total: 0 },
        "31_60": { invoice_count: 1, balance_total: 2500 },
        "61_90": { invoice_count: 1, balance_total: 800 },
        "90_plus": { invoice_count: 0, balance_total: 0 },
        unknown: { invoice_count: 0, balance_total: 0 },
      },
    },
    revenue_summary: {
      customers: [
        {
          qb_customer_list_id: "FAKE-CUST-A",
          billed_total: 6000,
          open_balance_total: 2500,
          invoice_count: 2,
        },
      ],
      totals: { customer_count: 1, billed_total: 6000, open_balance_total: 2500 },
    },
    payment_summary: {
      customers: [
        {
          qb_customer_list_id: "FAKE-CUST-A",
          payment_count: 1,
          avg_days_to_pay: 24,
          last_payment_date: "2026-06-30",
        },
      ],
      totals: { customer_count: 1, payment_count: 1, payment_total: 1000 },
    },
    estimate_sales_order_invoice_flow: {
      estimates: {
        count: 2,
        linked_to_invoice_count: 1,
        unlinked_count: 1,
        total_amount: 4500,
      },
      sales_orders: {
        count: 1,
        linked_to_invoice_count: 0,
        unlinked_count: 1,
        total_amount: 400,
      },
      invoices: { count: 3, total_amount: 6800 },
    },
    sales_rep_summary: {
      sales_reps: [
        {
          qb_sales_rep_list_id: "FAKE-REP-1",
          known_in_sales_reps: true,
          invoice_count: 2,
          customer_count: 1,
          billed_total: 6000,
          open_balance_total: 2500,
        },
      ],
      unassigned: { invoice_count: 1 },
    },
    customer_activity_trend: {
      months: [
        { month: "2026-05", invoice_count: 2, payment_count: 1, active_customer_count: 1 },
        { month: "2026-06", invoice_count: 1, payment_count: 1, active_customer_count: 1 },
      ],
    },
    insights: {
      overdue_ar_risks: { count: 1, items: [] },
      slow_paying_customers: { count: 0, items: [] },
      high_value_customers: { count: 1, items: [] },
      dormant_customers: { count: 0, items: [] },
      estimate_to_invoice_leakage: { count: 1, items: [] },
      unpaid_invoice_risk: { count: 1, items: [] },
    },
    insight_list: [
      {
        insight: "overdue_ar_risks",
        severity: "high",
        qb_txn_id: "FAKE-INV-1",
        qb_customer_list_id: "FAKE-CUST-A",
        summary: "overdue_ar days=56",
      },
      {
        insight: "estimate_to_invoice_leakage",
        severity: "medium",
        qb_txn_id: "FAKE-EST-2",
        summary: "estimate_leakage reason=unlinked_estimate",
      },
    ],
    ...overrides,
  };
}

describe("quickBooksIntelligenceViewModel safety", () => {
  it("accepts a clean fake snapshot", () => {
    assert.doesNotThrow(() => assertSafeIntelligenceSnapshot(fakeSnapshot()));
    assert.deepEqual(findForbiddenKeys(fakeSnapshot()), []);
  });

  it("flags raw_payload and PII-like keys", () => {
    const dirty = fakeSnapshot({
      ar_summary: { open_invoice_count: 1, raw_payload: { Memo: "nope" } },
    });
    const hits = findForbiddenKeys(dirty);
    assert.ok(hits.some((h) => h.includes("raw_payload")));
    assert.throws(() => assertSafeIntelligenceSnapshot(dirty), /Unsafe/);
  });

  it("formats opaque ids without names", () => {
    assert.equal(formatOpaqueId("FAKE-CUST-A", "customer"), "customer · FAKE-CUST-A");
    assert.match(formatOpaqueId("FAKE-VERY-LONG-CUSTOMER-LIST-ID-001", "customer"), /…/);
  });
});

describe("resolveIntelligenceViewState", () => {
  it("loading state", () => {
    const state = resolveIntelligenceViewState({
      loading: true,
      error: "",
      statusCode: null,
      data: null,
    });
    assert.equal(state.kind, "loading");
    const html = renderIntelligenceStateMarkup(state);
    assert.match(html, /data-state="loading"/);
    assert.equal(html.includes("raw_payload"), false);
  });

  it("error state", () => {
    const state = resolveIntelligenceViewState({
      loading: false,
      error: "QuickBooks intelligence snapshot failed",
      statusCode: 500,
      data: null,
    });
    assert.equal(state.kind, "error");
    assert.match(renderIntelligenceStateMarkup(state), /data-state="error"/);
  });

  it("unauthorized state", () => {
    const state = resolveIntelligenceViewState({
      loading: false,
      error: "Forbidden.",
      statusCode: 403,
      data: null,
    });
    assert.equal(state.kind, "unauthorized");
    assert.match(renderIntelligenceStateMarkup(state), /data-state="unauthorized"/);
  });

  it("successful ready render includes sections, insights, metadata", () => {
    const state = resolveIntelligenceViewState({
      loading: false,
      error: "",
      statusCode: 200,
      data: fakeSnapshot(),
    });
    assert.equal(state.kind, "ready");
    const html = renderIntelligenceStateMarkup(state);
    assert.match(html, /data-state="ready"/);
    assert.match(html, /data-section="executive"/);
    assert.match(html, /data-section="ar-risk"/);
    assert.match(html, /data-section="revenue"/);
    assert.match(html, /data-section="payments"/);
    assert.match(html, /data-section="flow"/);
    assert.match(html, /data-section="sales-reps"/);
    assert.match(html, /data-section="activity"/);
    assert.match(html, /data-section="insights"/);
    assert.match(html, /data-section="metadata"/);
    assert.match(html, /data-insight="overdue_ar_risks"/);
    assert.match(html, /Overdue AR/);
    assert.match(html, /generated_at=/);
    assert.match(html, /max_rows=full org/);
    assert.match(html, /page_size=500/);
    assert.equal(html.includes("raw_payload"), false);
    assert.equal(html.includes("SENTINEL"), false);
    assert.equal(html.includes("BillAddress"), false);
    assert.equal(html.includes("Memo"), false);
  });

  it("partial state when max_rows is set", () => {
    const snap = fakeSnapshot();
    snap.metadata.max_rows = 50;
    const state = resolveIntelligenceViewState({
      loading: false,
      error: "",
      statusCode: 200,
      data: snap,
    });
    assert.equal(state.kind, "partial");
    assert.match(renderIntelligenceStateMarkup(state), /data-state="partial"/);
  });

  it("rejects dirty snapshot during resolve", () => {
    assert.throws(
      () =>
        resolveIntelligenceViewState({
          loading: false,
          error: "",
          statusCode: 200,
          data: fakeSnapshot({ revenue_summary: { raw_payload: { Name: "x" } } }),
        }),
      /Unsafe/,
    );
  });
});
