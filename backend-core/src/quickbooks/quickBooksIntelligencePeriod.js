/**
 * quickBooksIntelligencePeriod — Phase 4F date-period resolution.
 *
 * Pure helpers for year / preset / custom date ranges. No Supabase. No PII.
 * Default: current calendar year-to-date (YTD).
 */

/** @typedef {"ytd"|"current_year"|"last_90_days"|"last_12_months"|"previous_year"|"custom"} QbIntelPreset */
/** @typedef {"newest"|"amount_desc"|"risk_desc"} QbIntelSort */

export const QB_INTEL_PRESETS = Object.freeze([
  "ytd",
  "current_year",
  "last_90_days",
  "last_12_months",
  "previous_year",
  "custom",
]);

export const QB_INTEL_SORTS = Object.freeze(["newest", "amount_desc", "risk_desc"]);

export const QB_INTEL_DEFAULT_PRESET = "ytd";
export const QB_INTEL_DEFAULT_SORT = "risk_desc";

/**
 * @param {unknown} value
 * @returns {string|null} YYYY-MM-DD
 */
export function parseIsoDateOnly(value) {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD (UTC)
 */
export function todayUtcIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * @param {Date} date
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
export function addDaysUtcIso(date, days) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {number} year
 * @returns {{ date_from: string, date_to: string }}
 */
export function yearBounds(year) {
  const y = Math.floor(Number(year));
  return {
    date_from: `${y}-01-01`,
    date_to: `${y}-12-31`,
  };
}

/**
 * Resolve an intelligence reporting period.
 *
 * Precedence:
 * 1. Explicit date_from + date_to (preset becomes custom unless already custom)
 * 2. year=YYYY → full calendar year (clamped to today for date_to when year is current)
 * 3. preset (default ytd)
 *
 * @param {{
 *   preset?: string|null,
 *   year?: string|number|null,
 *   date_from?: string|null,
 *   date_to?: string|null,
 *   as_of_date?: string|null,
 *   sort?: string|null,
 * }} [input]
 * @param {Date} [now]
 * @returns {{
 *   preset: QbIntelPreset,
 *   date_from: string,
 *   date_to: string,
 *   as_of: string,
 *   sort: QbIntelSort,
 *   year: number|null,
 * }}
 */
export function resolveIntelligencePeriod(input = {}, now = new Date()) {
  const clockToday = todayUtcIso(now);
  const asOfExplicit = parseIsoDateOnly(input.as_of_date);
  // Anchor YTD / relative presets to as_of when provided so callers (and tests)
  // stay deterministic without depending on the host clock alone.
  const anchorIso = asOfExplicit ?? clockToday;
  const anchorDate = new Date(`${anchorIso}T00:00:00.000Z`);
  const currentYear = anchorDate.getUTCFullYear();
  const today = anchorIso;

  const sortRaw = String(input.sort ?? "").trim().toLowerCase();
  /** @type {QbIntelSort} */
  const sort = QB_INTEL_SORTS.includes(/** @type {QbIntelSort} */ (sortRaw))
    ? /** @type {QbIntelSort} */ (sortRaw)
    : QB_INTEL_DEFAULT_SORT;

  const explicitFrom = parseIsoDateOnly(input.date_from);
  const explicitTo = parseIsoDateOnly(input.date_to);
  const yearRaw = Number(input.year);
  const hasYear = Number.isFinite(yearRaw) && yearRaw >= 1990 && yearRaw <= 2100;
  const year = hasYear ? Math.floor(yearRaw) : null;

  const presetRaw = String(input.preset ?? "").trim().toLowerCase();
  /** @type {QbIntelPreset} */
  let preset = QB_INTEL_PRESETS.includes(/** @type {QbIntelPreset} */ (presetRaw))
    ? /** @type {QbIntelPreset} */ (presetRaw)
    : QB_INTEL_DEFAULT_PRESET;

  /** @type {string} */
  let date_from;
  /** @type {string} */
  let date_to;

  if (explicitFrom && explicitTo) {
    date_from = explicitFrom <= explicitTo ? explicitFrom : explicitTo;
    date_to = explicitFrom <= explicitTo ? explicitTo : explicitFrom;
    preset = "custom";
  } else if (year != null) {
    const bounds = yearBounds(year);
    date_from = bounds.date_from;
    date_to = year === currentYear ? today : bounds.date_to;
    if (year === currentYear) {
      preset =
        preset === "current_year" ? "current_year" : preset === "custom" ? "ytd" : "ytd";
    } else if (year === currentYear - 1) preset = "previous_year";
    else preset = "custom";
  } else {
    switch (preset) {
      case "current_year": {
        date_from = `${currentYear}-01-01`;
        date_to = `${currentYear}-12-31`;
        break;
      }
      case "previous_year": {
        const y = currentYear - 1;
        date_from = `${y}-01-01`;
        date_to = `${y}-12-31`;
        break;
      }
      case "last_90_days": {
        date_to = today;
        date_from = addDaysUtcIso(anchorDate, -89);
        break;
      }
      case "last_12_months": {
        date_to = today;
        const start = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() - 11, 1));
        date_from = start.toISOString().slice(0, 10);
        break;
      }
      case "custom": {
        date_from = `${currentYear}-01-01`;
        date_to = today;
        preset = "ytd";
        break;
      }
      case "ytd":
      default: {
        date_from = `${currentYear}-01-01`;
        date_to = today;
        preset = "ytd";
        break;
      }
    }
  }

  const as_of = asOfExplicit ?? (date_to <= clockToday ? date_to : clockToday);

  return {
    preset,
    date_from,
    date_to,
    as_of,
    sort,
    year: year ?? Number(date_from.slice(0, 4)),
  };
}

/**
 * Inclusive YYYY-MM-DD range check.
 *
 * @param {string|null|undefined} date
 * @param {string} dateFrom
 * @param {string} dateTo
 * @returns {boolean}
 */
export function isDateInInclusiveRange(date, dateFrom, dateTo) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date >= dateFrom && date <= dateTo;
}

/**
 * @param {string} dateFrom
 * @param {string} dateTo
 * @returns {string[]} YYYY-MM keys ascending
 */
export function listMonthsInRange(dateFrom, dateTo) {
  const start = parseIsoDateOnly(dateFrom);
  const end = parseIsoDateOnly(dateTo);
  if (!start || !end || start > end) return [];
  const out = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const endY = Number(end.slice(0, 4));
  const endM = Number(end.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
