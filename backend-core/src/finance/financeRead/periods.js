import { FINANCE_PNL_PRESETS } from "./constants.js";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value) {
  return YMD.test(String(value ?? "").trim());
}

export function ymdUtc(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmdUtc(value) {
  const s = String(value ?? "").trim();
  if (!isYmd(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function lastDayOfMonthUtc(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

export function shiftYears(ymd, years) {
  const d = parseYmdUtc(ymd);
  if (!d) return null;
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return ymdUtc(d);
}

/**
 * Explicit, validated P&L windows. Defaults to current calendar month (UTC).
 * Does not invent fiscal calendars.
 */
export function resolvePnlPeriod(query = {}, now = new Date()) {
  const today = ymdUtc(now);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const presetRaw = String(query.preset ?? query.period ?? "").trim().toLowerCase();
  const preset = FINANCE_PNL_PRESETS.includes(presetRaw) ? presetRaw : "";
  const compareRaw = String(query.compare ?? query.compare_preset ?? "").trim().toLowerCase();
  const comparePreset = FINANCE_PNL_PRESETS.includes(compareRaw) ? compareRaw : "";

  const explicitStart = String(query.period_start ?? query.date_from ?? "").trim();
  const explicitEnd = String(query.period_end ?? query.date_to ?? "").trim();

  let period = null;
  if (explicitStart || explicitEnd) {
    if (!isYmd(explicitStart) || !isYmd(explicitEnd)) {
      return { ok: false, error: "period_start and period_end must be YYYY-MM-DD." };
    }
    if (explicitStart > explicitEnd) {
      return { ok: false, error: "period_start must be on or before period_end." };
    }
    const startD = parseYmdUtc(explicitStart);
    const endD = parseYmdUtc(explicitEnd);
    const days = (endD.getTime() - startD.getTime()) / 86400000;
    if (days > 366) {
      return { ok: false, error: "P&L period cannot exceed 366 days." };
    }
    period = {
      preset: "explicit",
      period_start: explicitStart,
      period_end: explicitEnd
    };
  } else if (preset === "previous_month") {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    period = {
      preset,
      period_start: ymdUtc(new Date(Date.UTC(py, pm, 1))),
      period_end: ymdUtc(lastDayOfMonthUtc(py, pm))
    };
  } else if (preset === "ytd") {
    period = {
      preset,
      period_start: `${y}-01-01`,
      period_end: today
    };
  } else if (preset === "prior_ytd") {
    period = {
      preset,
      period_start: `${y - 1}-01-01`,
      period_end: shiftYears(today, -1)
    };
  } else {
    period = {
      preset: preset || "current_month",
      period_start: ymdUtc(new Date(Date.UTC(y, m, 1))),
      period_end: today
    };
  }

  let compare = null;
  if (comparePreset === "previous_month" || (!comparePreset && period.preset === "current_month")) {
    const start = parseYmdUtc(period.period_start);
    const pm = start.getUTCMonth() === 0 ? 11 : start.getUTCMonth() - 1;
    const py = start.getUTCMonth() === 0 ? start.getUTCFullYear() - 1 : start.getUTCFullYear();
    compare = {
      preset: "previous_month",
      period_start: ymdUtc(new Date(Date.UTC(py, pm, 1))),
      period_end: ymdUtc(lastDayOfMonthUtc(py, pm))
    };
  } else if (comparePreset === "prior_ytd" || (!comparePreset && (period.preset === "ytd" || period.preset === "prior_ytd"))) {
    compare = {
      preset: "prior_ytd",
      period_start: shiftYears(period.period_start, -1),
      period_end: shiftYears(period.period_end, -1)
    };
  } else if (comparePreset === "current_month" || comparePreset === "ytd" || comparePreset === "previous_month") {
    const resolved = resolvePnlPeriod({ preset: comparePreset }, now);
    if (resolved.ok) compare = resolved.period;
  }

  return {
    ok: true,
    period,
    compare,
    as_of: today
  };
}

export function resolveAsOfDate(query = {}, now = new Date()) {
  const raw = String(query.as_of ?? query.as_of_date ?? "").trim();
  if (!raw) return { ok: true, as_of: ymdUtc(now) };
  if (!isYmd(raw)) return { ok: false, error: "as_of must be YYYY-MM-DD." };
  return { ok: true, as_of: raw };
}
