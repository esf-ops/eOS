/**
 * Governed Sales Ops performance math.
 * Missing actuals stay null. Zero is a real measured value, never a stand-in for unavailable.
 */

export const ACTUAL_SF_STATUSES = Object.freeze([
  "AVAILABLE",
  "PARTIAL",
  "IDENTITY_UNLINKED",
  "SOURCE_UNAVAILABLE",
  "NOT_APPLICABLE",
  "ACTUAL_SF_DEFINITION_REQUIRED"
]);

export const ACTUAL_SF_DEFINITION_STATUS = "ACTUAL_SF_DEFINITION_REQUIRED";

export function asNumberOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function varianceSf(actualSf, goalSf) {
  const actual = asNumberOrNull(actualSf);
  const goal = asNumberOrNull(goalSf);
  if (actual == null || goal == null) return null;
  return Math.round((actual - goal) * 100) / 100;
}

export function attainmentPct(actualSf, goalSf) {
  const actual = asNumberOrNull(actualSf);
  const goal = asNumberOrNull(goalSf);
  if (actual == null || goal == null || goal === 0) return null;
  return Math.round((actual / goal) * 1000) / 10;
}

export function sumKnown(values) {
  let total = 0;
  let known = 0;
  for (const v of values || []) {
    const n = asNumberOrNull(v);
    if (n == null) continue;
    total += n;
    known += 1;
  }
  return { total: known ? Math.round(total * 100) / 100 : null, known };
}

export function monthRow({ period, goalSf, actualSf, actualStatus }) {
  const goal = asNumberOrNull(goalSf);
  const actual = asNumberOrNull(actualSf);
  const status = ACTUAL_SF_STATUSES.includes(actualStatus) ? actualStatus : ACTUAL_SF_DEFINITION_STATUS;
  return {
    period,
    goalSf: goal,
    actualSf: actual,
    varianceSf: varianceSf(actual, goal),
    attainmentPct: attainmentPct(actual, goal),
    actualStatus: status
  };
}

export function ytdFromMonths(months, throughPeriod) {
  const inYear = (months || []).filter((m) => String(m.period).startsWith(String(throughPeriod).slice(0, 4)));
  const through = inYear.filter((m) => m.period <= throughPeriod);
  const goals = sumKnown(through.map((m) => m.goalSf));
  const actuals = sumKnown(through.map((m) => m.actualSf));
  const allActualsPresent = through.length > 0 && through.every((m) => m.actualSf != null);
  return {
    goalSf: goals.total,
    actualSf: actuals.known ? actuals.total : null,
    varianceSf: varianceSf(actuals.known ? actuals.total : null, goals.total),
    attainmentPct: attainmentPct(actuals.known ? actuals.total : null, goals.total),
    complete: allActualsPresent
  };
}

export function rollingActual(months, throughPeriod, count = 3) {
  const prior = [...(months || [])]
    .filter((m) => m.period <= throughPeriod && m.actualSf != null)
    .sort((a, b) => a.period.localeCompare(b.period));
  const window = prior.slice(-Number(count));
  if (window.length < Number(count)) return null;
  return sumKnown(window.map((m) => m.actualSf)).total;
}

export function accountShare(creditedSf, monthlyActualSf) {
  const part = asNumberOrNull(creditedSf);
  const whole = asNumberOrNull(monthlyActualSf);
  if (part == null || whole == null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
