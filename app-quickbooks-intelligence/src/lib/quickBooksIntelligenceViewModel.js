/**
 * QuickBooks Intelligence view-model helpers (Phase 4D/4F).
 * Pure functions over the executive API response.
 * Never surfaces raw_payload, addresses, memos, or vendor/customer names.
 */

/**
 * @typedef {object} QbIntelMetadata
 * @property {string} [organization_id]
 * @property {string} [generated_at]
 * @property {string} [as_of_date]
 * @property {number|null} [page_size]
 * @property {number|null} [max_rows]
 * @property {boolean} [include_invoice_lines]
 * @property {Record<string, number>|null} [staging_row_counts]
 * @property {number} [insight_list_count]
 * @property {string|null} [preset]
 * @property {string|null} [date_from]
 * @property {string|null} [date_to]
 * @property {string|null} [sort]
 * @property {boolean} [is_partial]
 */

/**
 * @typedef {object} QbIntelSnapshot
 * @property {boolean} [ok]
 * @property {string} [organization_id]
 * @property {string} [generated_at]
 * @property {string} [as_of_date]
 * @property {object} [period]
 * @property {QbIntelMetadata} [metadata]
 * @property {object} [invoice_summary]
 * @property {object} [payment_summary_period]
 * @property {object} [estimate_summary]
 * @property {object} [sales_order_summary]
 * @property {object[]} [monthly_trend]
 * @property {object} [top_lists]
 * @property {object[]} [insight_groups]
 * @property {object} [ar_summary]
 * @property {object} [revenue_summary]
 * @property {object} [payment_summary]
 * @property {object} [estimate_sales_order_invoice_flow]
 * @property {object} [sales_rep_summary]
 * @property {object} [customer_activity_trend]
 * @property {object} [insights]
 * @property {object[]} [insight_list]
 */

export const QB_INTEL_ENDPOINT = "/api/admin/quickbooks/intelligence/executive";

/**
 * Head default sample size for the executive preview.
 * Uses 250 (not 500) after production statement timeouts (57014) on unbounded loads.
 * Phase 4G will replace sample loads with DB-side aggregates.
 */
export const QB_INTEL_DEFAULT_MAX_ROWS = 250;

/** Head default page size for staging reads. */
export const QB_INTEL_DEFAULT_PAGE_SIZE = 100;

/** Default period preset (current year-to-date). */
export const QB_INTEL_DEFAULT_PRESET = "ytd";

/** Default list sort for risk-oriented sections. */
export const QB_INTEL_DEFAULT_SORT = "risk_desc";

/** Visible note for the bounded executive preview (no AI). */
export const QB_INTEL_PREVIEW_NOTE =
  "Snapshot is currently optimized for fast executive preview. Full-scale aggregates are coming next.";

export const QB_INTEL_PRESET_OPTIONS = Object.freeze([
  { value: "ytd", label: "Year to date" },
  { value: "current_year", label: "Current year" },
  { value: "previous_year", label: "Previous year" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "last_12_months", label: "Last 12 months" },
]);

export const QB_INTEL_SORT_OPTIONS = Object.freeze([
  { value: "risk_desc", label: "Risk / amount" },
  { value: "amount_desc", label: "Amount" },
  { value: "newest", label: "Newest" },
]);

/**
 * Build the executive intelligence path with bounded + period query params.
 *
 * @param {{
 *   maxRows?: number,
 *   pageSize?: number,
 *   preset?: string,
 *   year?: number|string,
 *   dateFrom?: string,
 *   dateTo?: string,
 *   sort?: string,
 *   asOfDate?: string,
 * }} [opts]
 * @returns {string}
 */
export function buildQuickBooksIntelligenceEndpoint(opts = {}) {
  const maxRows =
    Number.isFinite(Number(opts.maxRows)) && Number(opts.maxRows) > 0
      ? Math.floor(Number(opts.maxRows))
      : QB_INTEL_DEFAULT_MAX_ROWS;
  const pageSize =
    Number.isFinite(Number(opts.pageSize)) && Number(opts.pageSize) > 0
      ? Math.floor(Number(opts.pageSize))
      : QB_INTEL_DEFAULT_PAGE_SIZE;
  const params = new URLSearchParams({
    max_rows: String(maxRows),
    page_size: String(pageSize),
    preset: String(opts.preset ?? QB_INTEL_DEFAULT_PRESET),
    sort: String(opts.sort ?? QB_INTEL_DEFAULT_SORT),
  });
  if (opts.year != null && String(opts.year).trim()) params.set("year", String(opts.year));
  if (opts.dateFrom) params.set("date_from", String(opts.dateFrom));
  if (opts.dateTo) params.set("date_to", String(opts.dateTo));
  if (opts.asOfDate) params.set("as_of_date", String(opts.asOfDate));
  return `${QB_INTEL_ENDPOINT}?${params.toString()}`;
}

/** Keys that must never appear in UI-bound data. */
export const QB_INTEL_FORBIDDEN_KEYS = Object.freeze([
  "raw_payload",
  "BillAddress",
  "ShipAddress",
  "Memo",
  "FullName",
  "Name",
  "Addr1",
  "Addr2",
  "Phone",
  "Email",
  "RefNumber",
]);

/**
 * @param {unknown} value
 * @param {string[]} [path]
 * @returns {string[]}
 */
export function findForbiddenKeys(value, path = []) {
  /** @type {string[]} */
  const hits = [];
  if (value == null) return hits;
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...findForbiddenKeys(item, [...path, String(i)])));
    return hits;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (QB_INTEL_FORBIDDEN_KEYS.includes(k)) {
        hits.push([...path, k].join("."));
      }
      hits.push(...findForbiddenKeys(v, [...path, k]));
    }
  }
  return hits;
}

/**
 * @param {unknown} snapshot
 */
export function assertSafeIntelligenceSnapshot(snapshot) {
  const hits = findForbiddenKeys(snapshot);
  if (hits.length > 0) {
    throw new Error(`Unsafe QuickBooks intelligence fields: ${hits.slice(0, 5).join(", ")}`);
  }
}

/**
 * @param {unknown} n
 * @returns {string}
 */
export function formatCount(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString("en-US") : "—";
}

/**
 * @param {unknown} n
 * @returns {string}
 */
export function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(x);
}

/**
 * Opaque ID label for UI (never a display name).
 * @param {string|null|undefined} id
 * @param {string} kind
 */
export function formatOpaqueId(id, kind = "id") {
  const s = String(id ?? "").trim();
  if (!s) return `${kind} · unknown`;
  if (s.length <= 18) return `${kind} · ${s}`;
  return `${kind} · ${s.slice(0, 10)}…${s.slice(-4)}`;
}

/**
 * @param {string|null|undefined} iso
 */
export function formatTimestamp(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * @param {unknown} severity
 * @returns {"high"|"medium"|"low"|"info"}
 */
export function normalizeSeverity(severity) {
  const s = String(severity ?? "").toLowerCase();
  if (s === "high" || s === "medium" || s === "low" || s === "info") return s;
  return "info";
}

/**
 * @param {{ loading: boolean, error: string, statusCode: number|null, data: QbIntelSnapshot|null }} input
 */
export function resolveIntelligenceViewState(input) {
  if (input.loading) {
    return { kind: /** @type {const} */ ("loading"), message: "Loading QuickBooks intelligence…" };
  }
  if (input.statusCode === 401 || input.statusCode === 403) {
    return {
      kind: /** @type {const} */ ("unauthorized"),
      message:
        input.error ||
        "Admin / finance access with quickbooks_intelligence head access is required.",
    };
  }
  if (input.error) {
    return { kind: /** @type {const} */ ("error"), message: input.error };
  }
  if (!input.data) {
    return {
      kind: /** @type {const} */ ("empty"),
      message: "No QuickBooks intelligence snapshot is available yet.",
    };
  }

  assertSafeIntelligenceSnapshot(input.data);
  const model = buildIntelligenceViewModel(input.data);
  if (model.isEmpty) {
    return {
      kind: /** @type {const} */ ("empty"),
      message: "QuickBooks staging is empty for this organization (or the sample returned no rows).",
      model,
    };
  }
  if (model.isPartial) {
    return { kind: /** @type {const} */ ("partial"), model };
  }
  return { kind: /** @type {const} */ ("ready"), model };
}

/**
 * @param {QbIntelSnapshot} snapshot
 */
export function buildIntelligenceViewModel(snapshot) {
  const meta = snapshot.metadata ?? {};
  const period = snapshot.period ?? {};
  const ar = snapshot.ar_summary ?? {};
  const revenue = snapshot.revenue_summary ?? {};
  const payments = snapshot.payment_summary ?? {};
  const paymentPeriod = snapshot.payment_summary_period ?? {};
  const invoiceSummary = snapshot.invoice_summary ?? {};
  const estimateSummary = snapshot.estimate_summary ?? {};
  const salesOrderSummary = snapshot.sales_order_summary ?? {};
  const flow = snapshot.estimate_sales_order_invoice_flow ?? {};
  const reps = snapshot.sales_rep_summary ?? {};
  const trend = snapshot.customer_activity_trend ?? {};
  const monthlyTrend = Array.isArray(snapshot.monthly_trend)
    ? snapshot.monthly_trend
    : Array.isArray(trend.months)
      ? trend.months
      : [];
  const topLists = snapshot.top_lists ?? {};
  const insights = snapshot.insights ?? {};
  const insightList = Array.isArray(snapshot.insight_list) ? snapshot.insight_list : [];
  const insightGroups = Array.isArray(snapshot.insight_groups) ? snapshot.insight_groups : [];

  const staging = meta.staging_row_counts ?? {};
  const stagingTotal = Object.values(staging).reduce((s, n) => s + (Number(n) || 0), 0);
  const maxRows = meta.max_rows == null ? null : Number(meta.max_rows);
  const isPartial =
    Boolean(period.is_partial ?? meta.is_partial) ||
    (maxRows != null && Number.isFinite(maxRows) && maxRows > 0);

  const dateFrom = period.date_from || meta.date_from || "—";
  const dateTo = period.date_to || meta.date_to || "—";
  const preset = period.preset || meta.preset || QB_INTEL_DEFAULT_PRESET;
  const sort = period.sort || meta.sort || QB_INTEL_DEFAULT_SORT;
  const periodLabel = `${String(preset).toUpperCase()} · ${dateFrom} → ${dateTo}`;

  const revenueCustomers = Array.isArray(topLists.top_customers_by_revenue)
    ? topLists.top_customers_by_revenue
    : Array.isArray(revenue.customers)
      ? revenue.customers
      : [];
  const paymentCustomers = Array.isArray(topLists.top_payment_customers)
    ? topLists.top_payment_customers
    : Array.isArray(payments.customers)
      ? payments.customers
      : [];
  const openArCustomers = Array.isArray(topLists.top_open_ar_customers)
    ? topLists.top_open_ar_customers
    : [];
  const leakageItems = Array.isArray(topLists.top_estimate_leakage)
    ? topLists.top_estimate_leakage.slice(0, 10)
    : [];
  const salesReps = Array.isArray(reps.sales_reps) ? reps.sales_reps : [];

  const billedTotal =
    invoiceSummary.billed_total ?? revenue.totals?.billed_total ?? flow.invoices?.total_amount;
  const collectedTotal =
    paymentPeriod.collected_total ?? payments.totals?.payment_total;
  const paymentCount =
    paymentPeriod.payment_count ?? payments.totals?.payment_count;
  const invoiceCount =
    invoiceSummary.invoice_count ?? flow.invoices?.count;
  const estimateCount =
    estimateSummary.estimate_count ?? flow.estimates?.count;
  const unlinkedEstimates =
    estimateSummary.unlinked_count ?? flow.estimates?.unlinked_count;
  const conversionRate = estimateSummary.conversion_rate;

  const executiveCards = [
    {
      id: "invoiced",
      label: "Invoiced (period)",
      value: formatMoney(billedTotal),
      hint: `${formatCount(invoiceCount)} invoices`,
      tone: "default",
    },
    {
      id: "collected",
      label: "Cash collected",
      value: formatMoney(collectedTotal),
      hint: `${formatCount(paymentCount)} payments`,
      tone: "default",
    },
    {
      id: "open_ar",
      label: "Open AR (as of)",
      value: formatMoney(ar.open_balance_total),
      hint: `${formatCount(ar.open_invoice_count)} open invoices`,
      tone: "default",
    },
    {
      id: "overdue_ar",
      label: "Overdue AR",
      value: formatMoney(ar.overdue_balance_total),
      hint: `${formatCount(ar.overdue_invoice_count)} overdue`,
      tone: Number(ar.overdue_invoice_count) > 0 ? "warn" : "default",
    },
    {
      id: "estimates",
      label: "Estimate conversion",
      value:
        conversionRate == null ? formatCount(estimateCount) : `${formatCount(conversionRate)}%`,
      hint: `${formatCount(unlinkedEstimates)} unlinked · ${formatCount(estimateCount)} estimates`,
      tone: Number(unlinkedEstimates) > 0 ? "warn" : "default",
    },
    {
      id: "insights",
      label: "Priority insights",
      value: formatCount(insightList.length || meta.insight_list_count),
      hint: `${formatCount(insightGroups.length)} groups`,
      tone: "default",
    },
  ];

  const agingBuckets = ["current", "1_30", "31_60", "61_90", "90_plus", "unknown"].map((key) => {
    const bucket = ar.buckets?.[key] ?? {};
    return {
      key,
      label: agingBucketLabel(key),
      invoice_count: Number(bucket.invoice_count) || 0,
      balance_total: Number(bucket.balance_total) || 0,
    };
  });

  const topRevenue = revenueCustomers.slice(0, 8).map((c, i) => ({
    rank: i + 1,
    label: formatOpaqueId(c.qb_customer_list_id, "customer"),
    billed: formatMoney(c.billed_total),
    open: formatMoney(c.open_balance_total),
    invoices: formatCount(c.invoice_count),
  }));

  const topPayments = paymentCustomers.slice(0, 8).map((c) => ({
    label: formatOpaqueId(c.qb_customer_list_id, "customer"),
    payments: formatCount(c.payment_count),
    avgDays: c.avg_days_to_pay == null ? "—" : formatCount(c.avg_days_to_pay),
    lastPayment: c.last_payment_date || "—",
  }));

  const flowCards = [
    {
      id: "estimates",
      title: "Estimates",
      count: formatCount(estimateCount ?? flow.estimates?.count),
      linked: formatCount(estimateSummary.linked_count ?? flow.estimates?.linked_to_invoice_count),
      unlinked: formatCount(unlinkedEstimates),
      amountHint: formatMoney(estimateSummary.estimate_total ?? flow.estimates?.total_amount),
    },
    {
      id: "sales_orders",
      title: "Sales orders",
      count: formatCount(salesOrderSummary.sales_order_count ?? flow.sales_orders?.count),
      linked: formatCount(salesOrderSummary.linked_count ?? flow.sales_orders?.linked_to_invoice_count),
      unlinked: formatCount(salesOrderSummary.unlinked_count ?? flow.sales_orders?.unlinked_count),
      amountHint: formatMoney(salesOrderSummary.sales_order_total ?? flow.sales_orders?.total_amount),
    },
    {
      id: "invoices",
      title: "Invoices",
      count: formatCount(invoiceCount ?? flow.invoices?.count),
      linked: "—",
      unlinked: "—",
      amountHint: formatMoney(billedTotal ?? flow.invoices?.total_amount),
    },
  ];

  const salesRepRows = salesReps.slice(0, 8).map((r) => ({
    label: formatOpaqueId(r.qb_sales_rep_list_id, "rep"),
    known: Boolean(r.known_in_sales_reps),
    invoices: formatCount(r.invoice_count),
    customers: formatCount(r.customer_count),
    billed: formatMoney(r.billed_total),
    open: formatMoney(r.open_balance_total),
  }));

  const maxInvoiceCount = Math.max(1, ...monthlyTrend.map((m) => Number(m.invoice_count) || 0));
  const activityMonths = monthlyTrend.map((m) => ({
    month: String(m.month ?? ""),
    invoice_count: Number(m.invoice_count) || 0,
    payment_count: Number(m.payment_count) || 0,
    invoice_total: Number(m.invoice_total) || 0,
    payment_total: Number(m.payment_total) || 0,
    estimate_count: Number(m.estimate_count) || 0,
    active_customers: Number(m.active_customer_count) || 0,
    barPct: Math.round(((Number(m.invoice_count) || 0) / maxInvoiceCount) * 100),
  }));

  const insightRows = insightList.slice(0, 10).map((item, index) => ({
    key: `${item.insight ?? "insight"}-${item.qb_txn_id ?? item.qb_customer_list_id ?? index}`,
    insight: String(item.insight ?? "insight"),
    insightLabel: insightTypeLabel(item.insight),
    severity: normalizeSeverity(item.severity),
    summary: String(item.summary ?? "").slice(0, 120),
    entity: item.qb_txn_id
      ? formatOpaqueId(item.qb_txn_id, "txn")
      : formatOpaqueId(item.qb_customer_list_id, "customer"),
  }));

  const insightGroupRows = insightGroups.map((g) => ({
    key: String(g.insight ?? "group"),
    label: insightTypeLabel(g.insight),
    count: Number(g.count) || 0,
    items: (Array.isArray(g.items) ? g.items : []).slice(0, 3).map((item, index) => ({
      key: `${g.insight}-${item.qb_txn_id ?? item.qb_customer_list_id ?? index}`,
      severity: normalizeSeverity(item.severity),
      summary: String(item.summary ?? "").slice(0, 100),
      entity: item.qb_txn_id
        ? formatOpaqueId(item.qb_txn_id, "txn")
        : formatOpaqueId(item.qb_customer_list_id, "customer"),
    })),
  }));

  const topOpenAr = openArCustomers.slice(0, 8).map((c, i) => ({
    rank: i + 1,
    label: formatOpaqueId(c.qb_customer_list_id, "customer"),
    open: formatMoney(c.open_balance_total),
    invoices: formatCount(c.open_invoice_count),
  }));

  const topLeakage = leakageItems.map((item, i) => ({
    rank: i + 1,
    label: item.qb_txn_id
      ? formatOpaqueId(item.qb_txn_id, "txn")
      : formatOpaqueId(item.qb_customer_list_id, "customer"),
    amount: formatMoney(item.total_amount),
    date: item.txn_date || "—",
  }));

  const insightKeyCounts = [
    "overdue_ar_risks",
    "slow_paying_customers",
    "high_value_customers",
    "dormant_customers",
    "estimate_to_invoice_leakage",
    "unpaid_invoice_risk",
  ].map((key) => ({
    key,
    label: insightTypeLabel(key),
    count: Number(insights[key]?.count) || 0,
  }));

  const isEmpty =
    stagingTotal === 0 &&
    Number(ar.open_invoice_count || 0) === 0 &&
    Number(invoiceCount || revenue.totals?.customer_count || 0) === 0 &&
    insightList.length === 0;

  return {
    organizationId: snapshot.organization_id || meta.organization_id || "—",
    generatedAt: formatTimestamp(snapshot.generated_at || meta.generated_at),
    asOfDate: snapshot.as_of_date || meta.as_of_date || period.as_of || "—",
    periodLabel,
    preset,
    sort,
    dateFrom,
    dateTo,
    pageSize: meta.page_size == null ? "—" : formatCount(meta.page_size),
    maxRows: maxRows == null ? "full org" : formatCount(maxRows),
    isPartial,
    isEmpty,
    stagingCounts: Object.entries(staging).map(([key, value]) => ({
      key,
      label: stagingLabel(key),
      value: formatCount(value),
    })),
    executiveCards,
    agingBuckets,
    topRevenue,
    topPayments,
    topOpenAr,
    topLeakage,
    flowCards,
    salesRepRows,
    unassignedRepInvoices: formatCount(reps.unassigned?.invoice_count),
    activityMonths,
    insightRows,
    insightGroupRows,
    insightKeyCounts,
  };
}

/**
 * @param {string} key
 */
function agingBucketLabel(key) {
  switch (key) {
    case "current":
      return "Current";
    case "1_30":
      return "1–30 days";
    case "31_60":
      return "31–60 days";
    case "61_90":
      return "61–90 days";
    case "90_plus":
      return "90+ days";
    default:
      return "Unknown";
  }
}

/**
 * @param {unknown} key
 */
export function insightTypeLabel(key) {
  switch (String(key ?? "")) {
    case "overdue_ar_risks":
      return "Overdue AR";
    case "slow_paying_customers":
      return "Slow paying";
    case "high_value_customers":
      return "High value";
    case "dormant_customers":
      return "Dormant";
    case "estimate_to_invoice_leakage":
      return "Estimate leakage";
    case "unpaid_invoice_risk":
      return "Unpaid risk";
    default:
      return String(key ?? "Insight").replace(/_/g, " ");
  }
}

/**
 * @param {string} key
 */
function stagingLabel(key) {
  switch (key) {
    case "customers":
      return "Customers";
    case "invoices":
      return "Invoices";
    case "payments":
      return "Payments";
    case "estimates":
      return "Estimates";
    case "sales_orders":
      return "Sales orders";
    case "sales_reps":
      return "Sales reps";
    case "invoice_lines":
      return "Invoice lines";
    default:
      return key.replace(/_/g, " ");
  }
}

/**
 * Lightweight HTML for structural tests (not used in production React tree).
 * @param {ReturnType<typeof resolveIntelligenceViewState>} state
 */
export function renderIntelligenceStateMarkup(state) {
  if (state.kind === "loading") {
    return `<div class="qb-intel qb-intel-loading" data-state="loading">${escapeHtml(state.message)}</div>`;
  }
  if (state.kind === "unauthorized") {
    return `<div class="qb-intel qb-intel-unauthorized" data-state="unauthorized">${escapeHtml(state.message)}</div>`;
  }
  if (state.kind === "error") {
    return `<div class="qb-intel qb-intel-error" data-state="error">${escapeHtml(state.message)}</div>`;
  }
  if (state.kind === "empty") {
    return `<div class="qb-intel qb-intel-empty" data-state="empty">${escapeHtml(state.message)}</div>`;
  }
  const model = state.model;
  const insights = (model.insightRows ?? [])
    .map(
      (row) =>
        `<li data-insight="${escapeHtml(row.insight)}" data-severity="${escapeHtml(row.severity)}">${escapeHtml(row.insightLabel)} · ${escapeHtml(row.summary)}</li>`,
    )
    .join("");
  const meta = `generated_at=${escapeHtml(model.generatedAt)}; period=${escapeHtml(model.periodLabel)}; max_rows=${escapeHtml(model.maxRows)}; page_size=${escapeHtml(model.pageSize)}`;
  const partialBanner =
    state.kind === "partial"
      ? `<div data-testid="qb-intel-partial">Partial sample: results are limited to ${escapeHtml(model.maxRows)} rows per staging entity.</div>`
      : "";
  const insightGroups = (model.insightGroupRows ?? [])
    .map(
      (g) =>
        `<div data-insight-group="${escapeHtml(g.key)}">${escapeHtml(g.label)} (${escapeHtml(String(g.count))})</div>`,
    )
    .join("");
  return [
    `<div class="qb-intel" data-state="${escapeHtml(state.kind)}">`,
    `<div data-testid="qb-intel-period">${escapeHtml(model.periodLabel)}</div>`,
    `<div data-testid="qb-intel-preview-note">${escapeHtml(QB_INTEL_PREVIEW_NOTE)}</div>`,
    partialBanner,
    `<section data-section="executive">${model.executiveCards.map((c) => c.id).join(",")}</section>`,
    `<section data-section="cash">${model.topPayments.length}</section>`,
    `<section data-section="revenue">${model.topRevenue.length}</section>`,
    `<section data-section="ar-risk">${model.agingBuckets.map((b) => b.key).join(",")}</section>`,
    `<section data-section="flow">${model.flowCards.map((c) => c.id).join(",")}</section>`,
    `<section data-section="activity">${model.activityMonths.length}</section>`,
    `<section data-section="insights"><ul>${insights}</ul>${insightGroups}</section>`,
    `<section data-section="metadata">${meta}; sample_limited=${state.kind === "partial" ? "yes" : "no"}</section>`,
    `</div>`,
  ].join("");
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
