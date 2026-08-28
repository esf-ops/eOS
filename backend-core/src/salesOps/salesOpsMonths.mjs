/**
 * Explicit calendar-month helpers for Sales Ops plans.
 * Stored YYYY-MM rows are the target authority. Interpolation is a write-time helper only.
 */

export const PERIOD_RE = /^[0-9]{4}-[0-9]{2}$/;

const MONTH_LABELS = Object.freeze([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
]);

export function isPeriod(value) {
  return PERIOD_RE.test(String(value ?? "").trim());
}

export function periodFromDate(value) {
  const s = String(value ?? "").trim();
  if (isPeriod(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  return "";
}

export function periodLabel(period) {
  if (!isPeriod(period)) return String(period ?? "");
  return MONTH_LABELS[Number(period.slice(5, 7)) - 1] || period.slice(5, 7);
}

export function periodYear(period) {
  return isPeriod(period) ? period.slice(0, 4) : "";
}

export function addMonths(period, delta) {
  if (!isPeriod(period)) return "";
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + Number(delta);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function enumerateMonths(start, end) {
  const a = periodFromDate(start);
  const b = periodFromDate(end);
  if (!a || !b) return [];
  if (a > b) return [];
  const out = [];
  let cur = a;
  while (cur <= b) {
    out.push(cur);
    cur = addMonths(cur, 1);
    if (out.length > 240) break;
  }
  return out;
}

export function currentPeriod(now = new Date()) {
  if (typeof now === "string") return periodFromDate(now) || "";
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function roundSf(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Linear interpolation across inclusive months. Each output row is an explicit stored target.
 */
export function generateLinearRamp({ startMonth, startSf, endMonth, endSf } = {}) {
  const start = periodFromDate(startMonth);
  const end = periodFromDate(endMonth);
  if (!start || !end) {
    const err = new Error("Ramp requires a start month and an end month.");
    err.code = "ramp_range_required";
    throw err;
  }
  if (start > end) {
    const err = new Error("Ramp start month must be on or before the end month.");
    err.code = "ramp_range_invalid";
    throw err;
  }
  const from = Number(startSf);
  const to = Number(endSf);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    const err = new Error("Ramp start and end square-foot values must be numbers.");
    err.code = "ramp_values_required";
    throw err;
  }
  const months = enumerateMonths(start, end);
  if (!months.length) return [];
  const last = months.length - 1;
  return months.map((period, i) => {
    const t = last === 0 ? 1 : i / last;
    const installedTarget = roundSf(from + (to - from) * t);
    return toPeriodTarget(period, installedTarget);
  });
}

/**
 * Write-time helper: interpolate explicit monthly targets between milestone anchors.
 * Generated rows are stored values, not a runtime formula. Does not invent months
 * before the first anchor or after the last.
 */
export function generateMilestoneRamp(anchors = []) {
  const cleaned = [];
  const seen = new Set();
  for (const raw of anchors) {
    const period = periodFromDate(raw?.period || raw?.month);
    const sf = Number(raw?.sf ?? raw?.installedTarget);
    if (!period || !Number.isFinite(sf)) {
      const err = new Error("Each milestone needs a YYYY-MM period and a numeric SF value.");
      err.code = "milestone_invalid";
      throw err;
    }
    if (seen.has(period)) {
      const err = new Error("Milestone periods must be unique.");
      err.code = "milestone_duplicate";
      throw err;
    }
    seen.add(period);
    cleaned.push({ period, sf });
  }
  cleaned.sort((a, b) => a.period.localeCompare(b.period));
  if (cleaned.length < 2) {
    const err = new Error("Milestone ramp needs at least two anchors.");
    err.code = "milestone_required";
    throw err;
  }
  const months = enumerateMonths(cleaned[0].period, cleaned.at(-1).period);
  return months.map((period) => {
    const exact = cleaned.find((a) => a.period === period);
    if (exact) return toPeriodTarget(period, roundSf(exact.sf));
    let prev = cleaned[0];
    let next = cleaned.at(-1);
    for (const anchor of cleaned) {
      if (anchor.period < period) prev = anchor;
      if (anchor.period > period) {
        next = anchor;
        break;
      }
    }
    const span = enumerateMonths(prev.period, next.period);
    const i = span.indexOf(period);
    const last = span.length - 1;
    const t = last <= 0 ? 1 : i / last;
    return toPeriodTarget(period, roundSf(prev.sf + (next.sf - prev.sf) * t));
  });
}

export function toPeriodTarget(period, installedTarget, extras = {}) {
  const p = String(period);
  const installed = Number(installedTarget ?? 0);
  return {
    period: p,
    label: extras.label || periodLabel(p),
    year: extras.year || periodYear(p),
    installedTarget: Number.isFinite(installed) ? installed : 0,
    rollingThreeMonthTarget: Number(extras.rollingThreeMonthTarget ?? 0),
    qualifiedPipelineTarget: Number(extras.qualifiedPipelineTarget ?? 0)
  };
}

export function applyRollingConvenience(rows) {
  const sorted = [...(rows || [])].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  return sorted.map((row, i) => {
    const window = sorted.slice(Math.max(0, i - 2), i + 1);
    const rolling = window.reduce((s, r) => s + Number(r.installedTarget ?? 0), 0);
    const installed = Number(row.installedTarget ?? 0);
    return {
      ...row,
      rollingThreeMonthTarget: roundSf(rolling),
      qualifiedPipelineTarget:
        row.qualifiedPipelineTarget != null && Number(row.qualifiedPipelineTarget) !== 0
          ? Number(row.qualifiedPipelineTarget)
          : roundSf(installed * 3)
    };
  });
}

export function mergeExplicitMonthlyTargets(existing, startDate, endDate) {
  const months = enumerateMonths(startDate, endDate);
  const byPeriod = new Map();
  for (const row of existing || []) {
    if (!isPeriod(row.period)) continue;
    byPeriod.set(row.period, toPeriodTarget(row.period, row.installedTarget, row));
  }
  const merged = months.map((period) => byPeriod.get(period) || toPeriodTarget(period, 0));
  return applyRollingConvenience(merged);
}

export function uniquePeriodTargets(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!isPeriod(row?.period)) {
      const err = new Error("Each monthly target must use YYYY-MM.");
      err.code = "period_invalid";
      throw err;
    }
    if (seen.has(row.period)) {
      const err = new Error("Each month may have only one target.");
      err.code = "period_duplicate";
      throw err;
    }
    seen.add(row.period);
    out.push(toPeriodTarget(row.period, row.installedTarget, row));
  }
  out.sort((a, b) => a.period.localeCompare(b.period));
  return out;
}
