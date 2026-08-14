import {
  QB_FINANCE_CASH_EVENT_ROLES,
  QB_FINANCE_DOMAINS,
  QB_FINANCE_OPENING_AS_OF_DATE,
  QB_FINANCE_REPORT_BASIS_CANONICAL
} from "../quickbooksFinanceFoundation/constants.js";
import { detectReceivePaymentDepositDoubleCount } from "../quickbooksFinanceFoundation/cashNormalize.js";
import { officialStatementSource } from "../quickbooksFinanceFoundation/reconcileReports.js";
import {
  BANK_ACCOUNT_TYPES,
  DEFAULT_FINANCE_STALE_AFTER_SECONDS,
  FINANCE_BILL_LIST_LIMIT,
  FINANCE_DUE_DATE_COVERAGE_MIN,
  FINANCE_LIST_LIMIT,
  FINANCE_METRIC_STATES,
  FINANCE_PNL_SOURCE_VIEW
} from "./constants.js";
import { applyFreshness, available, roundMoney, unavailable } from "./metric.js";
import { shiftYears, ymdUtc } from "./periods.js";
import {
  balanceSheetPresentation,
  buildReportHierarchy,
  compareStatementLines,
  pnlHeadlineFromLines,
  selectBalanceSheetSnapshot,
  selectOpeningBalanceSheet,
  selectPnlSnapshot
} from "./reportModel.js";
import { createFinanceReadStore } from "./store.js";
import {
  headlineFromMonthlyLineSets,
  isDerivedPnlPreset,
  publicYtdWindows,
  selectContiguousMonthlyPnlWindows
} from "./ytdAggregate.js";

function uuidOk(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

export function resolveFinanceOrganizationId(req) {
  const fromUser = String(req?.user?.organization_id ?? "").trim();
  if (uuidOk(fromUser)) return fromUser;
  return null;
}

export function readStaleAfterSeconds(env = process.env) {
  const n = Number.parseInt(String(env.QB_FINANCE_STALE_AFTER_SECONDS ?? ""), 10);
  if (Number.isFinite(n) && n >= 60) return n;
  return DEFAULT_FINANCE_STALE_AFTER_SECONDS;
}

function domainFreshness(run, now, staleAfterSeconds) {
  if (!run) {
    return {
      domain: null,
      status: "missing",
      state: "unavailable",
      last_success_at: null,
      coverage_start: null,
      coverage_end: null,
      stale: false,
      warning_count: 0,
      error_summary: null,
      notes: "Awaiting first Finance sync for this domain."
    };
  }
  const completed = run.completed_at || run.started_at;
  const ageMs = completed ? now.getTime() - new Date(completed).getTime() : null;
  const stale = run.status === "success" && ageMs != null && ageMs / 1000 > staleAfterSeconds;
  let state = "available";
  if (run.status === "failed") state = "unavailable";
  else if (run.status === "running") state = "warning";
  else if (stale) state = "stale";
  else if (run.status === "partial") state = "warning";
  const warnings = Array.isArray(run.warnings) ? run.warnings : [];
  return {
    domain: run.domain,
    status: run.status,
    state,
    last_success_at: run.status === "success" || run.status === "partial" ? run.completed_at : null,
    last_completed_at: run.completed_at || null,
    coverage_start: run.coverage_start_date || null,
    coverage_end: run.coverage_end_date || null,
    stale,
    warning_count: warnings.length,
    error_summary: run.status === "failed" ? safeErrorSummary(run.error_summary) : null,
    notes: run.status === "failed" ? "Latest Finance refresh failed." : null
  };
}

function safeErrorSummary(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (/token|secret|password|service.role/i.test(s)) return "Refresh failed. See operator logs.";
  return s.slice(0, 240);
}

function overallFreshness(domains) {
  const values = Object.values(domains || {});
  if (values.every((d) => d.state === "unavailable")) return "unavailable";
  if (values.some((d) => d.status === "failed")) return "warning";
  if (values.some((d) => d.stale)) return "stale";
  if (values.some((d) => d.state === "warning")) return "warning";
  return "available";
}

function agingBuckets() {
  return {
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
    unknown: 0
  };
}

function daysPastDue(dueDate, asOf) {
  if (!dueDate) return null;
  const a = Date.parse(`${dueDate}T00:00:00Z`);
  const b = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86400000);
}

function assignAging(buckets, amount, dueDate, asOf) {
  const n = roundMoney(amount) || 0;
  const days = daysPastDue(dueDate, asOf);
  if (days == null) {
    buckets.unknown += n;
    return "unknown";
  }
  if (days <= 0) {
    buckets.current += n;
    return "current";
  }
  if (days <= 30) {
    buckets.days_1_30 += n;
    return "1_30";
  }
  if (days <= 60) {
    buckets.days_31_60 += n;
    return "31_60";
  }
  if (days <= 90) {
    buckets.days_61_90 += n;
    return "61_90";
  }
  buckets.days_90_plus += n;
  return "90_plus";
}

function roundBuckets(buckets) {
  const out = {};
  for (const [k, v] of Object.entries(buckets)) out[k] = roundMoney(v) || 0;
  return out;
}

function snapshotMeta(snap) {
  if (!snap) return null;
  return {
    report_type: snap.report_type,
    source_view: snap.source_view,
    report_basis: snap.report_basis,
    period_start: snap.period_start || null,
    period_end: snap.period_end || null,
    as_of_date: snap.as_of_date || null,
    is_opening: snap.is_opening === true,
    captured_at: snap.captured_at || null
  };
}

function emptyPayload(reason) {
  return {
    ok: true,
    report_basis: QB_FINANCE_REPORT_BASIS_CANONICAL,
    official_statement_source: officialStatementSource(),
    unavailable_reason: reason,
    metrics: {}
  };
}

export function createFinanceReadService({ getSupabase, env = process.env, now = () => new Date() } = {}) {
  const staleAfter = readStaleAfterSeconds(env);

  async function context(req) {
    const organizationId = resolveFinanceOrganizationId(req);
    const at = now();
    if (!organizationId) {
      return { organizationId: null, at, store: null, missingOrg: true };
    }
    const store = createFinanceReadStore(getSupabase());
    return { organizationId, at, store, missingOrg: false };
  }

  async function loadDomainHealth(store, organizationId, at) {
    const { rows, error } = await store.loadLatestSyncRuns(organizationId);
    const domains = {};
    for (const domain of QB_FINANCE_DOMAINS) {
      domains[domain] = {
        ...domainFreshness(rows?.[domain], at, staleAfter),
        domain
      };
    }
    return { domains, error, freshness: overallFreshness(domains) };
  }

  async function loadExactPnlBundle(store, organizationId, period) {
    const { rows: snaps, error } = await store.loadReportSnapshots(organizationId, "profit_and_loss");
    if (error) {
      return emptyPnlBundle({ error, notes: "P&L store is unavailable." });
    }
    const snapshot = selectPnlSnapshot(snaps, {
      periodStart: period.period_start,
      periodEnd: period.period_end
    });
    if (!snapshot) {
      return emptyPnlBundle({
        notes: "No Accrual ProfitAndLossStandard snapshot matches this period."
      });
    }
    const { rows: lines, error: lineErr } = await store.loadReportLines(organizationId, snapshot.id);
    if (lineErr) {
      return emptyPnlBundle({
        error: lineErr,
        snapshot,
        notes: "P&L store is unavailable."
      });
    }
    return {
      error: null,
      snapshot,
      lines,
      headline: pnlHeadlineFromLines(lines),
      is_derived: false,
      coverage_complete: true,
      windows: [{ period_start: snapshot.period_start, period_end: snapshot.period_end }],
      period_start: snapshot.period_start,
      period_end: snapshot.period_end,
      notes: null,
      hierarchy_available: true
    };
  }

  async function loadDerivedYtdBundle(store, organizationId, period, { requireExactEnd = false } = {}) {
    const year = Number(String(period.period_start || "").slice(0, 4));
    const { rows: snaps, error } = await store.loadReportSnapshots(organizationId, "profit_and_loss");
    if (error) {
      return emptyPnlBundle({
        error,
        is_derived: true,
        notes: "P&L store is unavailable."
      });
    }
    const selected = selectContiguousMonthlyPnlWindows(snaps, {
      year,
      throughEnd: period.period_end,
      requireExactEnd
    });
    if (!selected.ok) {
      return emptyPnlBundle({
        is_derived: true,
        notes: selected.reason,
        period_start: selected.period_start || period.period_start,
        period_end: selected.period_end || null,
        windows: publicYtdWindows(selected.windows)
      });
    }
    const lineSets = [];
    for (const snap of selected.windows) {
      const loaded = await store.loadReportLines(organizationId, snap.id);
      if (loaded.error) {
        return emptyPnlBundle({
          error: loaded.error,
          is_derived: true,
          notes: "P&L store is unavailable."
        });
      }
      lineSets.push(loaded.rows);
    }
    return {
      error: null,
      snapshot: null,
      lines: [],
      headline: headlineFromMonthlyLineSets(lineSets),
      is_derived: true,
      coverage_complete: true,
      windows: publicYtdWindows(selected.windows),
      period_start: selected.period_start,
      period_end: selected.period_end,
      notes: null,
      hierarchy_available: false,
      hierarchy_notes:
        "Detailed YTD hierarchy is unavailable: stored report lines have no stable account identity across monthly snapshots. Control totals are the sum of monthly Accrual ProfitAndLossStandard report facts."
    };
  }

  function emptyPnlBundle({
    error = null,
    snapshot = null,
    notes = null,
    is_derived = false,
    period_start = null,
    period_end = null,
    windows = []
  } = {}) {
    return {
      error,
      snapshot,
      lines: [],
      headline: null,
      is_derived,
      coverage_complete: false,
      windows,
      period_start,
      period_end,
      notes,
      hierarchy_available: false
    };
  }

  function loadPnlBundle(store, organizationId, period, opts = {}) {
    if (!period) return Promise.resolve(emptyPnlBundle({ notes: "P&L period is missing." }));
    if (isDerivedPnlPreset(period.preset) || opts.derived) {
      return loadDerivedYtdBundle(store, organizationId, period, opts);
    }
    return loadExactPnlBundle(store, organizationId, period);
  }

  async function loadBsBundle(store, organizationId, asOf) {
    const { rows: snaps, error } = await store.loadReportSnapshots(organizationId, "balance_sheet");
    if (error) return { error, snapshot: null, opening: null, lines: [] };
    const snapshot = selectBalanceSheetSnapshot(snaps, { asOf, allowOpening: false });
    const opening = selectOpeningBalanceSheet(snaps);
    let lines = [];
    if (snapshot) {
      const loaded = await store.loadReportLines(organizationId, snapshot.id);
      if (loaded.error) return { error: loaded.error, snapshot, opening, lines: [] };
      lines = loaded.rows;
    }
    return { error: null, snapshot, opening, lines };
  }

  async function getOverview(req, query = {}) {
    const ctx = await context(req);
    if (ctx.missingOrg) {
      return {
        ...emptyPayload("missing_organization"),
        notes: "Finance facts are organization-scoped. This user has no organization_id."
      };
    }
    const ytd = {
      preset: "ytd",
      period_start: `${ctx.at.getUTCFullYear()}-01-01`,
      period_end: ymdUtc(ctx.at)
    };
    const [health, pnl, bs, ar, ap, cash] = await Promise.all([
      loadDomainHealth(ctx.store, ctx.organizationId, ctx.at),
      loadPnlBundle(ctx.store, ctx.organizationId, ytd),
      loadBsBundle(ctx.store, ctx.organizationId, ymdUtc(ctx.at)),
      buildAr(ctx, ymdUtc(ctx.at)),
      buildAp(ctx, ymdUtc(ctx.at)),
      buildCash(ctx)
    ]);

    const freshness = health.freshness;
    const h = pnl.headline;
    const ytdStart = pnl.period_start || ytd.period_start;
    const ytdEnd = pnl.period_end;
    const pnlNotes = pnl.error
      ? "P&L store is unavailable."
      : !pnl.coverage_complete
        ? pnl.notes || "YTD Accrual P&L cannot be derived from stored monthly snapshots."
        : null;
    const pnlPeriod = {
      source: "qb_finance_report_snapshots",
      period_start: ytdStart,
      period_end: ytdEnd,
      is_derived: pnl.is_derived === true,
      notes: pnl.coverage_complete
        ? "Sum of contiguous monthly Accrual ProfitAndLossStandard snapshots."
        : null
    };

    const metrics = {
      revenue: applyFreshness(
        h?.revenue != null
          ? available("revenue", "Revenue", h.revenue, pnlPeriod)
          : unavailable("revenue", "Revenue", pnlNotes, { period_start: ytdStart, period_end: ytdEnd }),
        freshness
      ),
      gross_profit: applyFreshness(
        h?.gross_profit != null
          ? available("gross_profit", "Gross Profit", h.gross_profit, pnlPeriod)
          : unavailable("gross_profit", "Gross Profit", pnlNotes, { period_start: ytdStart, period_end: ytdEnd }),
        freshness
      ),
      gross_margin_pct:
        h?.gross_margin_pct != null
          ? {
              key: "gross_margin_pct",
              label: "Gross Margin",
              value: h.gross_margin_pct,
              state:
                freshness === "stale" ? FINANCE_METRIC_STATES.STALE : FINANCE_METRIC_STATES.AVAILABLE,
              source: "qb_finance_report_snapshots",
              as_of: null,
              period_start: ytdStart,
              period_end: ytdEnd,
              is_derived: pnl.is_derived === true,
              notes: pnlPeriod.notes
            }
          : unavailable(
              "gross_margin_pct",
              "Gross Margin",
              pnlNotes || "Gross margin requires Revenue and Gross Profit from Accrual P&L snapshots.",
              { period_start: ytdStart, period_end: ytdEnd }
            ),
      operating_expenses: applyFreshness(
        h?.operating_expenses != null
          ? available("operating_expenses", "Operating Expenses", h.operating_expenses, pnlPeriod)
          : unavailable("operating_expenses", "Operating Expenses", pnlNotes, {
              period_start: ytdStart,
              period_end: ytdEnd
            }),
        freshness
      ),
      net_income: applyFreshness(
        h?.net_income != null
          ? available("net_income", "Net Income", h.net_income, pnlPeriod)
          : unavailable("net_income", "Net Income", pnlNotes, { period_start: ytdStart, period_end: ytdEnd }),
        freshness
      ),
      cash: cash.position,
      open_ar: ar.total,
      overdue_ar: ar.overdue,
      open_ap: ap.total,
      overdue_ap: ap.overdue
    };

    const identity = bs.lines.length ? balanceSheetPresentation(bs.lines).identity : null;

    return {
      ok: true,
      report_basis: QB_FINANCE_REPORT_BASIS_CANONICAL,
      official_statement_source: officialStatementSource(),
      as_of: ymdUtc(ctx.at),
      ytd_period: {
        preset: "ytd",
        period_start: ytdStart,
        period_end: ytdEnd,
        is_derived: pnl.is_derived === true,
        coverage_complete: pnl.coverage_complete === true,
        contributing_windows: pnl.windows || []
      },
      freshness,
      metrics,
      pnl_trend: await monthlyPnlTrend(ctx.store, ctx.organizationId),
      working_capital: workingCapital(ar.total, ap.total),
      ar_attention: ar.attention,
      ap_attention: ap.attention,
      balance_sheet_identity: identity
        ? {
            status: identity.status,
            delta: identity.delta,
            total_assets: identity.eliteos_value,
            total_liabilities_and_equity: identity.quickbooks_value,
            as_of_date: bs.snapshot?.as_of_date || null
          }
        : { status: "unavailable", delta: null, notes: "No current Accrual Balance Sheet snapshot." },
      latest_accounting_snapshot_date: bs.snapshot?.as_of_date || pnl.period_end || null,
      domains: health.domains,
      warnings: collectWarnings(health, pnl, bs, ar, ap, cash)
    };
  }

  async function monthlyPnlTrend(store, organizationId) {
    const { rows: snaps, error } = await store.loadReportSnapshots(organizationId, "profit_and_loss");
    if (error || !snaps?.length) {
      return { state: "unavailable", points: [], notes: error ? "P&L store is unavailable." : "Not enough monthly P&L snapshots." };
    }
    const monthly = snaps.filter(
      (s) =>
        s.is_opening !== true &&
        s.period_start &&
        String(s.period_start).slice(8) === "01" &&
        s.control_totals
    );
    const byStart = new Map();
    for (const s of monthly) {
      const existing = byStart.get(s.period_start);
      if (!existing || String(s.captured_at) > String(existing.captured_at)) byStart.set(s.period_start, s);
    }
    const points = [...byStart.values()]
      .sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)))
      .slice(-6)
      .map((s) => ({
        period_start: s.period_start,
        period_end: s.period_end,
        revenue: roundMoney(s.control_totals?.total_income),
        net_income: roundMoney(s.control_totals?.net_income)
      }));
    if (points.length < 2) {
      return { state: "unavailable", points, notes: "Need at least two monthly Accrual P&L snapshots for a trend." };
    }
    return { state: "available", points, notes: null };
  }

  function workingCapital(arMetric, apMetric) {
    if (arMetric?.value == null || apMetric?.value == null) {
      return unavailable("working_capital", "Working capital (A/R − A/P)", "Requires both Open A/R and Open A/P.");
    }
    return available("working_capital", "Working capital (A/R − A/P)", arMetric.value - apMetric.value, {
      source: "sales_quickbooks_open_ar_current + qb_finance_open_ap_current"
    });
  }

  async function buildAr(ctx, asOf) {
    const { rows, error, truncated } = await ctx.store.loadOpenAr(ctx.organizationId);
    if (error) {
      const u = unavailable("open_ar", "Open A/R", "Open A/R facts are unavailable.");
      return {
        total: u,
        overdue: unavailable("overdue_ar", "Overdue A/R", "Open A/R facts are unavailable."),
        aging: { state: "unavailable", buckets: null, notes: "Open A/R facts are unavailable." },
        customers: [],
        invoices: [],
        attention: { state: "unavailable", items: [] },
        payments: { state: "unavailable", items: [] },
        error
      };
    }
    const openRows = (rows || []).filter((r) => Number(r.balance) > 0);
    const totalAmt = roundMoney(openRows.reduce((s, r) => s + (Number(r.balance) || 0), 0)) || 0;
    const withDue = openRows.filter((r) => r.due_date);
    const coverage = openRows.length ? withDue.length / openRows.length : 0;
    const overdueAmt = roundMoney(
      withDue.filter((r) => r.due_date < asOf).reduce((s, r) => s + (Number(r.balance) || 0), 0)
    );
    const buckets = agingBuckets();
    for (const row of openRows) assignAging(buckets, row.balance, row.due_date, asOf);
    const agingOk = openRows.length === 0 || coverage >= FINANCE_DUE_DATE_COVERAGE_MIN;
    const byCustomer = new Map();
    for (const row of openRows) {
      const name = String(row.customer_name || "").trim() || "Unnamed customer";
      const cur = byCustomer.get(name) || { customer_name: name, open_amount: 0, overdue_amount: 0, invoice_count: 0 };
      cur.open_amount += Number(row.balance) || 0;
      if (row.due_date && row.due_date < asOf) cur.overdue_amount += Number(row.balance) || 0;
      cur.invoice_count += 1;
      byCustomer.set(name, cur);
    }
    const customers = [...byCustomer.values()]
      .sort((a, b) => b.open_amount - a.open_amount)
      .slice(0, FINANCE_LIST_LIMIT)
      .map((c) => ({
        customer_name: c.customer_name,
        open_amount: roundMoney(c.open_amount),
        overdue_amount: roundMoney(c.overdue_amount),
        invoice_count: c.invoice_count
      }));
    const invoices = openRows.slice(0, FINANCE_LIST_LIMIT).map((r) => ({
      customer_name: r.customer_name || "Unnamed customer",
      reference_number: r.reference_number || null,
      invoice_date: r.invoice_date || null,
      due_date: r.due_date || null,
      original_amount: roundMoney(r.original_amount),
      open_amount: roundMoney(r.balance)
    }));
    const pay = await ctx.store.loadPaymentApplications(ctx.organizationId);
    const payments = pay.error
      ? { state: "unavailable", items: [], notes: "Payment applications are unavailable." }
      : {
          state: "available",
          items: (pay.rows || []).slice(0, FINANCE_LIST_LIMIT).map((p) => ({
            customer_name: p.customer_name || "Unnamed customer",
            payment_date: p.payment_date || null,
            applied_amount: roundMoney(p.applied_amount),
            applied_reference_number: p.applied_reference_number || null,
            applied_txn_type: p.applied_txn_type || null
          }))
        };

    return {
      total: available("open_ar", "Open A/R", totalAmt, {
        source: "sales_quickbooks_open_ar_current",
        as_of: asOf,
        notes: truncated ? "Open A/R list was truncated; totals may be incomplete." : "Current open invoices as of last Sales QuickBooks refresh."
      }),
      overdue:
        withDue.length === 0 && openRows.length > 0
          ? unavailable("overdue_ar", "Overdue A/R", "DueDate coverage is missing; overdue is not inferred from invoice date.")
          : available("overdue_ar", "Overdue A/R", overdueAmt || 0, {
              source: "sales_quickbooks_open_ar_current.due_date",
              as_of: asOf
            }),
      aging: agingOk
        ? { state: "available", buckets: roundBuckets(buckets), due_date_coverage: roundMoney(coverage) }
        : {
            state: "unavailable",
            buckets: null,
            due_date_coverage: roundMoney(coverage),
            notes: "Customer aging is unavailable until DueDate coverage is sufficient. Invoice date is never used as a substitute."
          },
      customers,
      invoices,
      attention: {
        state: "available",
        items: customers.filter((c) => (c.overdue_amount || 0) > 0).slice(0, 8)
      },
      payments,
      error: null
    };
  }

  async function buildAp(ctx, asOf) {
    const { rows, error, truncated } = await ctx.store.loadOpenAp(ctx.organizationId);
    if (error) {
      return {
        total: unavailable("open_ap", "Open A/P", "Open A/P facts are unavailable."),
        overdue: unavailable("overdue_ap", "Overdue A/P", "Open A/P facts are unavailable."),
        aging: { state: "unavailable", buckets: null },
        vendors: [],
        bills: [],
        applications: { state: "unavailable", items: [] },
        attention: { state: "unavailable", items: [] },
        error
      };
    }
    const openRows = (rows || []).filter((r) => Number(r.open_amount) > 0);
    const totalAmt = roundMoney(openRows.reduce((s, r) => s + (Number(r.open_amount) || 0), 0)) || 0;
    const withDue = openRows.filter((r) => r.due_date);
    const coverage = openRows.length ? withDue.length / openRows.length : 0;
    const overdueAmt = roundMoney(
      withDue.filter((r) => r.due_date < asOf).reduce((s, r) => s + (Number(r.open_amount) || 0), 0)
    );
    const dueSoonAmt = roundMoney(
      withDue
        .filter((r) => r.due_date >= asOf && daysPastDue(r.due_date, asOf) >= -7)
        .reduce((s, r) => s + (Number(r.open_amount) || 0), 0)
    );
    const buckets = agingBuckets();
    for (const row of openRows) assignAging(buckets, row.open_amount, row.due_date, asOf);
    const agingOk = openRows.length === 0 || coverage >= FINANCE_DUE_DATE_COVERAGE_MIN;
    const byVendor = new Map();
    for (const row of openRows) {
      const name = String(row.vendor_name || "").trim() || "Unnamed vendor";
      const cur = byVendor.get(name) || { vendor_name: name, open_amount: 0, overdue_amount: 0, bill_count: 0 };
      cur.open_amount += Number(row.open_amount) || 0;
      if (row.due_date && row.due_date < asOf) cur.overdue_amount += Number(row.open_amount) || 0;
      cur.bill_count += 1;
      byVendor.set(name, cur);
    }
    const vendors = [...byVendor.values()]
      .sort((a, b) => b.open_amount - a.open_amount)
      .slice(0, FINANCE_LIST_LIMIT)
      .map((v) => ({
        vendor_name: v.vendor_name,
        open_amount: roundMoney(v.open_amount),
        overdue_amount: roundMoney(v.overdue_amount),
        bill_count: v.bill_count
      }));
    const billRows = await ctx.store.loadBills(ctx.organizationId);
    const bills = (billRows.rows || [])
      .filter((b) => b.is_paid !== true && Number(b.open_amount) > 0)
      .slice(0, FINANCE_BILL_LIST_LIMIT)
      .map((b) => ({
        vendor_name: b.vendor_name || "Unnamed vendor",
        reference_number: b.reference_number || null,
        bill_date: b.txn_date || null,
        due_date: b.due_date || null,
        terms_name: b.terms_name || null,
        original_amount: roundMoney(b.amount),
        open_amount: roundMoney(b.open_amount),
        is_paid: b.is_paid === true
      }));
    const apps = await ctx.store.loadBillApplications(ctx.organizationId);
    return {
      total: available("open_ap", "Open A/P", totalAmt, {
        source: "qb_finance_open_ap_current",
        as_of: asOf,
        notes: truncated ? "Open A/P list was truncated; totals may be incomplete." : "Current unpaid bills as of last A/P Finance refresh."
      }),
      overdue:
        withDue.length === 0 && openRows.length > 0
          ? unavailable("overdue_ap", "Overdue A/P", "Bill DueDate coverage is missing; overdue is not inferred.")
          : available("overdue_ap", "Overdue / past-due A/P", overdueAmt || 0, {
              source: "qb_finance_open_ap_current.due_date",
              as_of: asOf
            }),
      due: available("due_ap", "Due A/P", dueSoonAmt || 0, {
        source: "qb_finance_open_ap_current.due_date",
        notes: "Open bills due within 7 days, when DueDate is present."
      }),
      aging: agingOk
        ? { state: "available", buckets: roundBuckets(buckets), due_date_coverage: roundMoney(coverage) }
        : {
            state: "unavailable",
            buckets: null,
            notes: "Vendor aging is unavailable until DueDate coverage is sufficient."
          },
      vendors,
      bills,
      applications: apps.error
        ? { state: "unavailable", items: [] }
        : {
            state: "available",
            items: (apps.rows || []).slice(0, FINANCE_LIST_LIMIT).map((a) => ({
              vendor_name: a.vendor_name || "Unnamed vendor",
              payment_date: a.payment_date || null,
              payment_method: a.payment_method || null,
              applied_amount: roundMoney(a.applied_amount),
              applied_reference_number: a.applied_reference_number || null,
              applied_balance_remaining: roundMoney(a.applied_balance_remaining)
            }))
          },
      attention: { state: "available", items: vendors.filter((v) => (v.overdue_amount || 0) > 0).slice(0, 8) },
      error: null
    };
  }

  async function buildCash(ctx) {
    const [events, deposits, checks, transfers, balances, undeposited] = await Promise.all([
      ctx.store.loadCashEvents(ctx.organizationId),
      ctx.store.loadDeposits(ctx.organizationId),
      ctx.store.loadChecks(ctx.organizationId),
      ctx.store.loadTransfers(ctx.organizationId),
      ctx.store.loadAccountBalances(ctx.organizationId),
      ctx.store.loadUndeposited(ctx.organizationId)
    ]);

    const byRole = {};
    for (const role of QB_FINANCE_CASH_EVENT_ROLES) {
      byRole[role] = { event_role: role, count: 0, amount: 0 };
    }
    for (const e of events.rows || []) {
      const role = e.event_role;
      if (!byRole[role]) byRole[role] = { event_role: role, count: 0, amount: 0 };
      byRole[role].count += 1;
      byRole[role].amount += Number(e.amount) || 0;
    }
    for (const role of Object.keys(byRole)) {
      byRole[role].amount = roundMoney(byRole[role].amount);
    }

    const collisions = detectReceivePaymentDepositDoubleCount(events.rows || []);

    const bankRows = (balances.rows || []).filter((r) =>
      BANK_ACCOUNT_TYPES.includes(String(r.account_type || "").trim().toLowerCase())
    );
    let position;
    if (balances.error) {
      position = unavailable("cash", "QuickBooks cash (bank accounts)", "Account balance facts are unavailable.");
    } else if (!bankRows.length) {
      position = unavailable(
        "cash",
        "QuickBooks cash (bank accounts)",
        "No Bank-type account balances are stored. This is accounting cash from QuickBooks, not a live bank feed."
      );
    } else {
      const sum = roundMoney(bankRows.reduce((s, r) => s + Number(r.balance ?? r.account_balance ?? 0), 0));
      position = available("cash", "QuickBooks cash (bank accounts)", sum, {
        source: "qb_finance_account_balances_current",
        notes: "Sum of Bank-type QuickBooks account balances. Not a live bank-feed balance. Do not add customer receipts to bank deposits."
      });
    }

    const undepositedSum = roundMoney(
      (undeposited.rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    );

    const trendMap = new Map();
    for (const e of events.rows || []) {
      if (e.event_role !== "bank_deposit" && e.event_role !== "bank_disbursement") continue;
      const month = String(e.txn_date || "").slice(0, 7);
      if (!month) continue;
      const cur = trendMap.get(month) || { month, bank_deposit: 0, bank_disbursement: 0 };
      cur[e.event_role] += Number(e.amount) || 0;
      trendMap.set(month, cur);
    }
    const trendPoints = [...trendMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((p) => ({
        month: p.month,
        bank_deposit: roundMoney(p.bank_deposit),
        bank_disbursement: roundMoney(p.bank_disbursement)
      }));

    return {
      position,
      undeposited: undeposited.error
        ? unavailable("undeposited", "Undeposited funds", "Undeposited queue is unavailable.")
        : available("undeposited", "Undeposited funds", undepositedSum || 0, {
            source: "qb_finance_undeposited_current",
            notes: "Not added into bank-account cash."
          }),
      by_event_role: Object.values(byRole),
      anti_double_count: {
        do_not_sum: ["customer_receipt", "bank_deposit"],
        cash_in_kpi_uses: ["bank_deposit"],
        would_double_count_if_summed: collisions.would_double_count_if_summed,
        notes:
          "Customer receipts and bank deposits are different cash events. Deposit lines may reference the same ReceivePayment. Never add receipt + deposit as two inflows."
      },
      recent_deposits: (deposits.rows || []).map((d) => ({
        txn_date: d.txn_date,
        deposit_to_account_name: d.deposit_to_account_name || null,
        amount: roundMoney(d.total_deposit),
        memo: d.memo || null
      })),
      recent_checks: (checks.rows || []).map((c) => ({
        txn_date: c.txn_date,
        payee_name: c.payee_name || null,
        bank_account_name: c.bank_account_name || null,
        reference_number: c.reference_number || null,
        amount: roundMoney(c.amount)
      })),
      recent_transfers: (transfers.rows || []).map((t) => ({
        txn_date: t.txn_date,
        from_account_name: t.from_account_name || null,
        to_account_name: t.to_account_name || null,
        amount: roundMoney(t.amount)
      })),
      trend: trendPoints.length
        ? { state: "available", points: trendPoints }
        : { state: "unavailable", points: [], notes: "No cash-event dates available for a trend." },
      source_label: "QuickBooks accounting cash",
      truncated: events.truncated === true,
      error: events.error
    };
  }

  function collectWarnings(health, pnl, bs, ar, ap, cash) {
    const out = [];
    if (health.error) out.push("Finance sync-run metadata is unavailable.");
    if (pnl.error) out.push("Profit & Loss snapshots could not be read.");
    if (bs.error) out.push("Balance Sheet snapshots could not be read.");
    if (ar.error) out.push("Open A/R could not be read.");
    if (ap.error) out.push("Open A/P could not be read.");
    if (cash.error) out.push("Cash events could not be read.");
    return out;
  }

  async function getPnl(req, query) {
    const ctx = await context(req);
    if (ctx.missingOrg) return { ...emptyPayload("missing_organization"), lines: [], headline: null };
    const current = await loadPnlBundle(ctx.store, ctx.organizationId, query.period);
    const representedStart = current.period_start || query.period?.period_start || null;
    const representedEnd = current.period_end || null;
    let compare = emptyPnlBundle({});
    let compareEquivalent = false;
    if (query.compare && current.coverage_complete && representedStart && representedEnd) {
      const comparePeriod = isDerivedPnlPreset(query.period?.preset)
        ? {
            preset: "prior_ytd",
            period_start: shiftYears(representedStart, -1),
            period_end: shiftYears(representedEnd, -1)
          }
        : query.compare;
      compare = await loadPnlBundle(ctx.store, ctx.organizationId, comparePeriod, {
        derived: isDerivedPnlPreset(query.period?.preset),
        requireExactEnd: isDerivedPnlPreset(query.period?.preset)
      });
      compareEquivalent =
        compare.coverage_complete === true &&
        compare.period_start === comparePeriod.period_start &&
        compare.period_end === comparePeriod.period_end;
    }

    const periodPayload = {
      preset: query.period?.preset || null,
      period_start: representedStart,
      period_end: representedEnd,
      is_derived: current.is_derived === true,
      coverage_complete: current.coverage_complete === true
    };
    const derivedCompare = isDerivedPnlPreset(query.period?.preset);
    const expectedCompareStart = derivedCompare ? shiftYears(representedStart, -1) : query.compare?.period_start || null;
    const expectedCompareEnd = derivedCompare ? shiftYears(representedEnd, -1) : query.compare?.period_end || null;
    const comparePayload = query.compare
      ? {
          preset: derivedCompare ? "prior_ytd" : query.compare.preset || null,
          period_start: compareEquivalent ? compare.period_start : expectedCompareStart,
          period_end: compareEquivalent ? compare.period_end : expectedCompareEnd,
          is_derived: derivedCompare,
          coverage_complete: compareEquivalent,
          notes: compareEquivalent
            ? null
            : compare.notes ||
              (derivedCompare
                ? "Comparison is unavailable because an equivalent prior period cannot be constructed from stored snapshots."
                : "No Accrual ProfitAndLossStandard snapshot matches the comparison period.")
        }
      : null;

    if (!current.coverage_complete) {
      return {
        ok: true,
        report_basis: QB_FINANCE_REPORT_BASIS_CANONICAL,
        official_statement_source: officialStatementSource(),
        source_view: FINANCE_PNL_SOURCE_VIEW,
        period: periodPayload,
        compare: comparePayload,
        period_start: representedStart,
        period_end: representedEnd,
        comparison_period_start: comparePayload?.period_start || null,
        comparison_period_end: comparePayload?.period_end || null,
        is_derived: current.is_derived === true,
        coverage_complete: false,
        state: "unavailable",
        notes: current.error
          ? "P&L store is unavailable."
          : current.notes || "No Accrual ProfitAndLossStandard snapshot matches this period.",
        snapshot: snapshotMeta(current.snapshot),
        compare_snapshot: null,
        headline: null,
        compare_headline: null,
        lines: [],
        hierarchy: [],
        hierarchy_state: "unavailable",
        contributing_windows: current.windows || []
      };
    }

    const compareHeadline = compareEquivalent ? compare.headline : null;
    const lines = current.hierarchy_available
      ? compareEquivalent
        ? compareStatementLines(current.lines, compare.lines)
        : current.lines.map((l) => ({
            label: l.label,
            row_type: l.row_type,
            line_order: l.line_order,
            current_amount: roundMoney(l.amount),
            compare_amount: null,
            variance_amount: null,
            variance_pct: null
          }))
      : [];

    return {
      ok: true,
      report_basis: QB_FINANCE_REPORT_BASIS_CANONICAL,
      official_statement_source: officialStatementSource(),
      source_view: FINANCE_PNL_SOURCE_VIEW,
      period: periodPayload,
      compare: comparePayload,
      period_start: representedStart,
      period_end: representedEnd,
      comparison_period_start: compareEquivalent ? compare.period_start : comparePayload?.period_start || null,
      comparison_period_end: compareEquivalent ? compare.period_end : comparePayload?.period_end || null,
      is_derived: current.is_derived === true,
      coverage_complete: true,
      state: "available",
      snapshot: snapshotMeta(current.snapshot),
      compare_snapshot: compareEquivalent ? snapshotMeta(compare.snapshot) : null,
      headline: current.headline,
      compare_headline: compareHeadline,
      lines,
      hierarchy: current.hierarchy_available ? buildReportHierarchy(current.lines) : [],
      hierarchy_state: current.hierarchy_available ? "available" : "unavailable",
      hierarchy_notes: current.hierarchy_available ? null : current.hierarchy_notes || null,
      contributing_windows: current.windows || []
    };
  }

  async function getBalanceSheet(req, query) {
    const ctx = await context(req);
    if (ctx.missingOrg) return { ...emptyPayload("missing_organization") };
    const asOf = query.as_of;
    const bundle = await loadBsBundle(ctx.store, ctx.organizationId, asOf);
    if (!bundle.snapshot) {
      return {
        ok: true,
        report_basis: QB_FINANCE_REPORT_BASIS_CANONICAL,
        as_of: asOf,
        state: "unavailable",
        notes: bundle.error
          ? "Balance Sheet store is unavailable."
          : "No current Accrual BalanceSheetStandard snapshot at or before this as-of date. Opening 2024-12-31 is not used as the current statement.",
        opening: snapshotMeta(bundle.opening),
        snapshot: null,
        identity: null,
        totals: { total_assets: null, total_liabilities_and_equity: null },
        assets: [],
        liabilities: [],
        equity: [],
        hierarchy: []
      };
    }
    const presented = balanceSheetPresentation(bundle.lines);
    return {
      ok: true,
      report_basis: QB_FINANCE_REPORT_BASIS_CANONICAL,
      as_of: asOf,
      state: "available",
      snapshot: snapshotMeta(bundle.snapshot),
      opening: snapshotMeta(bundle.opening) || {
        as_of_date: QB_FINANCE_OPENING_AS_OF_DATE,
        is_opening: true,
        state: "unavailable",
        notes: "Opening Accrual Balance Sheet as-of 2024-12-31 is not stored."
      },
      identity: {
        status: presented.identity.status,
        delta: presented.identity.delta,
        tolerance_abs: presented.identity.tolerance_abs,
        total_assets: presented.identity.eliteos_value,
        total_liabilities_and_equity: presented.identity.quickbooks_value
      },
      totals: presented.totals,
      assets: presented.assets,
      liabilities: presented.liabilities,
      equity: presented.equity,
      hierarchy: presented.hierarchy
    };
  }

  async function getAr(req) {
    const ctx = await context(req);
    if (ctx.missingOrg) return { ...emptyPayload("missing_organization") };
    const asOf = ymdUtc(ctx.at);
    const ar = await buildAr(ctx, asOf);
    return {
      ok: true,
      as_of: asOf,
      source: "sales_quickbooks_open_ar_current",
      definition:
        "Open A/R is the current unpaid invoice snapshot from Sales QuickBooks Financial Truth. Overdue and aging use Invoices.DueDate only — never invoice Date.",
      total: ar.total,
      overdue: ar.overdue,
      aging: ar.aging,
      customers: ar.customers,
      invoices: ar.invoices,
      recent_payments: ar.payments,
      attention: ar.attention
    };
  }

  async function getAp(req) {
    const ctx = await context(req);
    if (ctx.missingOrg) return { ...emptyPayload("missing_organization") };
    const asOf = ymdUtc(ctx.at);
    const ap = await buildAp(ctx, asOf);
    return {
      ok: true,
      as_of: asOf,
      source: "qb_finance_open_ap_current",
      definition:
        "Open A/P is the current unpaid bill snapshot from Finance A/P prepared facts. Overdue uses bill DueDate when present.",
      total: ap.total,
      overdue: ap.overdue,
      due: ap.due,
      aging: ap.aging,
      vendors: ap.vendors,
      bills: ap.bills,
      applications: ap.applications,
      attention: ap.attention
    };
  }

  async function getCash(req) {
    const ctx = await context(req);
    if (ctx.missingOrg) return { ...emptyPayload("missing_organization") };
    const cash = await buildCash(ctx);
    return {
      ok: true,
      source_label: cash.source_label,
      definition:
        "QuickBooks accounting cash. Bank-account cash is the sum of Bank-type account balances. Cash events keep customer_receipt and bank_deposit as separate roles and must not be added together.",
      position: cash.position,
      undeposited: cash.undeposited,
      by_event_role: cash.by_event_role,
      anti_double_count: cash.anti_double_count,
      recent_deposits: cash.recent_deposits,
      recent_checks: cash.recent_checks,
      recent_transfers: cash.recent_transfers,
      trend: cash.trend
    };
  }

  async function getReconciliation(req) {
    const ctx = await context(req);
    if (ctx.missingOrg) return { ...emptyPayload("missing_organization") };
    const [health, recon, bs] = await Promise.all([
      loadDomainHealth(ctx.store, ctx.organizationId, ctx.at),
      ctx.store.loadReconciliationResults(ctx.organizationId),
      loadBsBundle(ctx.store, ctx.organizationId, ymdUtc(ctx.at))
    ]);
    const identity = bs.lines.length ? balanceSheetPresentation(bs.lines).identity : null;
    return {
      ok: true,
      report_basis: QB_FINANCE_REPORT_BASIS_CANONICAL,
      as_of: ymdUtc(ctx.at),
      freshness: health.freshness,
      domains: health.domains,
      balance_sheet_identity: identity
        ? {
            status: identity.status,
            delta: identity.delta,
            tolerance_abs: identity.tolerance_abs,
            total_assets: identity.eliteos_value,
            total_liabilities_and_equity: identity.quickbooks_value,
            as_of_date: bs.snapshot?.as_of_date || null
          }
        : { status: "unavailable", delta: null, notes: "No current Accrual Balance Sheet snapshot." },
      results: recon.error
        ? []
        : (recon.rows || []).map((r) => ({
            check_type: r.check_type,
            report_basis: r.report_basis,
            period_start: r.period_start,
            period_end: r.period_end,
            as_of_date: r.as_of_date,
            eliteos_value: roundMoney(r.eliteos_value),
            quickbooks_value: roundMoney(r.quickbooks_value),
            delta: roundMoney(r.delta),
            status: r.status,
            created_at: r.created_at
          })),
      opening_as_of: QB_FINANCE_OPENING_AS_OF_DATE
    };
  }

  return { getOverview, getPnl, getBalanceSheet, getAr, getAp, getCash, getReconciliation };
}
