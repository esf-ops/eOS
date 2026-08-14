import { QB_FINANCE_REPORT_BASIS_CANONICAL } from "../quickbooksFinanceFoundation/constants.js";
import { FINANCE_PNL_SOURCE_VIEW } from "./constants.js";
import { ratioPct, roundMoney } from "./metric.js";
import { isYmd, parseYmdUtc, ymdUtc } from "./periods.js";
import { pnlHeadlineFromLines } from "./reportModel.js";

export function addDaysYmd(ymd, days) {
  const d = parseYmdUtc(ymd);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return ymdUtc(d);
}

export function isSameCalendarMonthWindow(periodStart, periodEnd) {
  if (!isYmd(periodStart) || !isYmd(periodEnd)) return false;
  const start = parseYmdUtc(periodStart);
  const end = parseYmdUtc(periodEnd);
  if (!start || !end) return false;
  return (
    start.getUTCDate() === 1 &&
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    periodStart <= periodEnd
  );
}

function isEligibleMonthlyPnl(snapshot) {
  return (
    snapshot &&
    snapshot.report_type === "profit_and_loss" &&
    String(snapshot.report_basis) === QB_FINANCE_REPORT_BASIS_CANONICAL &&
    snapshot.source_view === FINANCE_PNL_SOURCE_VIEW &&
    snapshot.is_opening !== true &&
    isSameCalendarMonthWindow(snapshot.period_start, snapshot.period_end)
  );
}

function monthKey(ymd) {
  return String(ymd || "").slice(0, 7);
}

function expectedMonthKeys(year, lastMonthIndex) {
  const keys = [];
  for (let m = 0; m <= lastMonthIndex; m += 1) {
    keys.push(`${year}-${String(m + 1).padStart(2, "0")}`);
  }
  return keys;
}

/**
 * Pick one Accrual monthly P&L snapshot per calendar month from Jan 1 of `year`
 * through `throughEnd`. Same-month windows only — multi-month snapshots are excluded
 * so they cannot be labeled YTD or double-counted with monthlies.
 */
export function selectContiguousMonthlyPnlWindows(snapshots, { year, throughEnd, requireExactEnd = false } = {}) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1900 || !isYmd(throughEnd)) {
    return { ok: false, coverage_complete: false, windows: [], reason: "YTD period is invalid." };
  }

  const eligible = (snapshots || []).filter(
    (s) =>
      isEligibleMonthlyPnl(s) &&
      String(s.period_start).startsWith(`${y}-`) &&
      String(s.period_end) <= throughEnd
  );

  const byMonth = new Map();
  for (const snap of eligible) {
    const key = monthKey(snap.period_start);
    const existing = byMonth.get(key);
    if (!existing || String(snap.captured_at || "") > String(existing.captured_at || "")) {
      byMonth.set(key, snap);
    }
  }

  const keys = [...byMonth.keys()].sort();
  if (!keys.length) {
    return {
      ok: false,
      coverage_complete: false,
      windows: [],
      period_start: `${y}-01-01`,
      period_end: null,
      reason: `No Accrual ProfitAndLossStandard monthly snapshots are stored for ${y}.`
    };
  }

  if (keys[0] !== `${y}-01`) {
    return {
      ok: false,
      coverage_complete: false,
      windows: [],
      period_start: `${y}-01-01`,
      period_end: null,
      reason: `YTD requires a January Accrual P&L snapshot. Earliest stored month is ${keys[0]}.`
    };
  }

  const last = byMonth.get(keys[keys.length - 1]);
  const lastMonthIndex = parseYmdUtc(last.period_start).getUTCMonth();
  const expected = expectedMonthKeys(y, lastMonthIndex);
  const missing = expected.filter((k) => !byMonth.has(k));
  if (missing.length) {
    return {
      ok: false,
      coverage_complete: false,
      windows: expected.filter((k) => byMonth.has(k)).map((k) => metaWindow(byMonth.get(k))),
      period_start: `${y}-01-01`,
      period_end: last.period_end,
      missing_months: missing,
      reason: `YTD Accrual P&L is unavailable because monthly snapshots are not contiguous from ${y}-01-01. Missing: ${missing.join(", ")}.`
    };
  }

  const windows = expected.map((k) => byMonth.get(k));
  for (let i = 1; i < windows.length; i += 1) {
    const prevEnd = windows[i - 1].period_end;
    const nextStart = windows[i].period_start;
    const expectedNext = addDaysYmd(prevEnd, 1);
    if (nextStart !== expectedNext) {
      return {
        ok: false,
        coverage_complete: false,
        windows: windows.map(metaWindow),
        period_start: `${y}-01-01`,
        period_end: windows[windows.length - 1].period_end,
        reason: `YTD Accrual P&L is unavailable because monthly snapshot dates overlap or leave a gap (${prevEnd} → ${nextStart}).`
      };
    }
  }

  const periodStart = windows[0].period_start;
  const periodEnd = windows[windows.length - 1].period_end;
  if (requireExactEnd && periodEnd !== throughEnd) {
    return {
      ok: false,
      coverage_complete: false,
      windows: windows.map(metaWindow),
      period_start: periodStart,
      period_end: periodEnd,
      reason: `Prior-year comparison needs an equivalent window ending ${throughEnd}. Stored Accrual coverage ends ${periodEnd || "unknown"}.`
    };
  }

  return {
    ok: true,
    coverage_complete: true,
    windows,
    period_start: periodStart,
    period_end: periodEnd,
    reason: null
  };
}

function metaWindow(snap) {
  return {
    period_start: snap.period_start,
    period_end: snap.period_end
  };
}

export function publicYtdWindows(windows) {
  return (windows || []).map((w) => ({
    period_start: w.period_start,
    period_end: w.period_end
  }));
}

export function sumPnlHeadlines(headlines) {
  const keys = [
    "revenue",
    "cogs",
    "gross_profit",
    "operating_expenses",
    "operating_income",
    "other_income",
    "other_expense",
    "net_income"
  ];
  const out = {};
  for (const key of keys) {
    let sum = 0;
    let seen = false;
    for (const h of headlines || []) {
      const n = roundMoney(h?.[key]);
      if (n == null) continue;
      sum += n;
      seen = true;
    }
    out[key] = seen ? roundMoney(sum) : null;
  }
  out.gross_margin_pct = ratioPct(out.gross_profit, out.revenue);
  return out;
}

export function headlineFromMonthlyLineSets(lineSets) {
  return sumPnlHeadlines((lineSets || []).map((lines) => pnlHeadlineFromLines(lines)));
}

export function isDerivedPnlPreset(preset) {
  return preset === "ytd" || preset === "prior_ytd";
}
