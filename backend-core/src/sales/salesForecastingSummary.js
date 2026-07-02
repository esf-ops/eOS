/**
 * Forecast summary for Sales Command Center (quote_forecast_events).
 */

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Array<object>} events
 * @param {{ start: string, end: string }} dateRange
 */
export function summarizeForecasts(events = [], dateRange = null) {
  const filtered = events.filter((e) => {
    if (!dateRange?.start) return true;
    const d = str(e.forecast_date || e.created_at || e.event_date).slice(0, 10);
    if (!d) return true;
    return d >= dateRange.start && d <= dateRange.end;
  });

  let forecastValue = 0;
  let forecastSqft = 0;
  const byMonth = new Map();
  const byRep = new Map();

  for (const e of filtered) {
    const value = num(e.forecast_value ?? e.quote_value);
    const sqft = num(e.forecast_sqft ?? e.estimated_sqft);
    const prob = num(e.probability_percent) / 100;
    const weighted = value * (prob || 1);
    forecastValue += weighted;
    forecastSqft += sqft * (prob || 1);

    const month = str(e.forecast_month || e.forecast_date || e.created_at).slice(0, 7) || "Undated";
    const rep = str(e.sales_rep) || "Unassigned";
    byMonth.set(month, (byMonth.get(month) || 0) + weighted);
    byRep.set(rep, (byRep.get(rep) || 0) + weighted);
  }

  return {
    forecastEventCount: filtered.length,
    forecastValue: Math.round(forecastValue),
    forecastSqft: Math.round(forecastSqft * 100) / 100,
    forecastByMonth: [...byMonth.entries()]
      .map(([month, value]) => ({ month, value: Math.round(value) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    forecastByRep: [...byRep.entries()]
      .map(([rep, value]) => ({ rep, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value),
    quoteForecastRows: filtered.slice(0, 50).map((e) => ({
      quoteId: e.quote_id,
      eventType: e.event_type,
      salesRep: e.sales_rep,
      branch: e.branch,
      forecastValue: num(e.forecast_value),
      probabilityPercent: num(e.probability_percent),
      forecastDate: e.forecast_date || e.created_at
    }))
  };
}

/**
 * Forecast volume in next N days from today.
 * @param {Array<object>} events
 * @param {string} todayYmd
 * @param {number} days
 */
export function forecastWindowSummary(events, todayYmd, days = 30) {
  const end = addDaysYmd(todayYmd, days);
  let value = 0;
  let sqft = 0;
  for (const e of events) {
    const d = str(e.forecast_date || e.created_at).slice(0, 10);
    if (!d || d < todayYmd || d > end) continue;
    value += num(e.forecast_value) * (num(e.probability_percent) / 100 || 1);
    sqft += num(e.forecast_sqft ?? e.estimated_sqft);
  }
  return { days, forecastValue: Math.round(value), forecastSqft: Math.round(sqft * 100) / 100 };
}

function addDaysYmd(ymd, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(ymd));
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
