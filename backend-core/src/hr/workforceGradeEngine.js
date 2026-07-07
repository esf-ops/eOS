/**
 * Pure workforce grading helpers — weekly buckets, letter grades, snapshots.
 * @module workforceGradeEngine
 */

export const DEFAULT_TIMEZONE = "America/Chicago";
export const DEFAULT_WEEK_START_DAY = 1; // Monday

export const DEFAULT_GRADE_THRESHOLDS = Object.freeze([
  { grade: "A", maxMistakes: 1 },
  { grade: "B", maxMistakes: 3 },
  { grade: "C", maxMistakes: 6 },
  { grade: "D", maxMistakes: 10 }
]);

/** @deprecated Use computeZeroGoalCountGrade for ops scorecard count sections. */
export const SECTION_ZERO_GOAL_THRESHOLDS = Object.freeze([
  { grade: "A", maxMistakes: 0 },
  { grade: "B", maxMistakes: 1 },
  { grade: "C", maxMistakes: 4 }
]);

/**
 * Count-based mistake sections: 0=A, 1=B, 2=C, 3=D, 4+=F
 * @param {number} incidentCount
 */
export function computeZeroGoalCountGrade(incidentCount) {
  const count = Math.max(0, Number(incidentCount) || 0);
  if (count === 0) return "A";
  if (count === 1) return "B";
  if (count === 2) return "C";
  if (count === 3) return "D";
  return "F";
}

/** @deprecated Use computeZeroGoalCountGrade for ops scorecard count sections. */
export function computeSectionCountGrade(incidentCount) {
  return computeZeroGoalCountGrade(incidentCount);
}

/**
 * Template/Install lead times — median days: <=14=A, 15-16=C, 17+=F
 * @param {number|null|undefined} medianDays
 */
export function computeLeadTimeMedianGrade(medianDays) {
  const median = Number(medianDays);
  if (!Number.isFinite(median)) return null;
  if (median <= 14) return "A";
  if (median <= 16) return "C";
  return "F";
}

/**
 * Production weekly SF: >=9250=A, 8750-9249=B, below 8750=F
 * @param {number|null|undefined} weeklySf
 */
export function computeProductionWeeklyGrade(weeklySf) {
  const weekly = Number(weeklySf);
  if (!Number.isFinite(weekly)) return null;
  if (weekly >= 9250) return "A";
  if (weekly >= 8750) return "B";
  return "F";
}

/**
 * Shop machinery downtime hours:
 * 0–2 = A, >2–4 = B, >4–6 = C, >6–8 = D, >8 = F
 * @param {number|null|undefined} hours
 */
export function computeDowntimeHoursGrade(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return null;
  if (h <= 2) return "A";
  if (h <= 4) return "B";
  if (h <= 6) return "C";
  if (h <= 8) return "D";
  return "F";
}

/** @deprecated */
export function computeSectionDaysGrade(actualDays, goalDays) {
  return computeLeadTimeMedianGrade(actualDays);
}

/** @deprecated */
export function computeSectionProductionGrade(actualSf, goalSf) {
  void goalSf;
  return computeProductionWeeklyGrade(actualSf);
}

/** @deprecated */
export function computeSectionHoursGrade(actualHours, goalHours = 0) {
  void goalHours;
  return computeDowntimeHoursGrade(actualHours);
}

/**
 * @typedef {object} SectionWeekValue
 * @property {number|null} [actualNumeric]
 * @property {string|null} [actualDisplay]
 * @property {Record<string, unknown>} [valuePayload]
 */

/**
 * @param {Record<string, unknown>|null|undefined} raw
 */
export function normalizeValuePayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

/**
 * @param {object} section
 * @param {number} incidentCount
 * @param {SectionWeekValue} [weekValue]
 */
export function computeSectionLetterGrade(section, incidentCount, weekValue = {}) {
  if (!section?.gradingEnabled) return null;

  const kind = String(section.metricKind ?? "count");
  const payload = normalizeValuePayload(weekValue.valuePayload);

  if (kind === "count") {
    return computeZeroGoalCountGrade(incidentCount);
  }

  if (kind === "days") {
    const median = payload.median_days ?? weekValue.actualNumeric;
    return computeLeadTimeMedianGrade(median);
  }
  if (kind === "production") {
    const weekly = payload.weekly_sf ?? weekValue.actualNumeric;
    return computeProductionWeeklyGrade(weekly);
  }
  if (kind === "hours") {
    const hours = payload.hours ?? weekValue.actualNumeric ?? incidentCount;
    return computeDowntimeHoursGrade(hours);
  }
  if (kind === "currency") {
    return null;
  }

  return computeZeroGoalCountGrade(incidentCount);
}

function formatNumber(n) {
  return Number(n).toLocaleString("en-US");
}

function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

/**
 * @param {object} section
 * @param {number} incidentCount
 * @param {SectionWeekValue} [weekValue]
 */
export function formatSectionActualDisplay(section, incidentCount, weekValue = {}) {
  if (weekValue.actualDisplay) return String(weekValue.actualDisplay);

  const kind = String(section.metricKind ?? "count");
  const payload = normalizeValuePayload(weekValue.valuePayload);

  if (kind === "currency") {
    const amount = payload.currency ?? weekValue.actualNumeric;
    if (amount != null) return formatCurrency(amount);
    return "—";
  }

  if (kind === "days") {
    const median = payload.median_days;
    const average = payload.average_days;
    if (median != null && average != null) {
      return `${median} days median/${average} days average`;
    }
    if (median != null) return `${median} days median`;
    if (weekValue.actualNumeric != null) return `${weekValue.actualNumeric} days`;
    return "—";
  }

  if (kind === "production") {
    const weekly = payload.weekly_sf ?? weekValue.actualNumeric;
    const daily = payload.daily_sf ?? (weekly != null ? Math.round(Number(weekly) / 5) : null);
    if (weekly != null && daily != null) {
      return `${formatNumber(weekly)}sf weekly/${formatNumber(daily)}sf daily`;
    }
    return "—";
  }

  if (kind === "hours") {
    const hours = payload.hours ?? weekValue.actualNumeric ?? incidentCount;
    return `${hours}hrs`;
  }

  return String(Math.max(0, incidentCount));
}

/**
 * @param {object} section
 * @param {object} row
 */
export function formatScorecardReportLine(section, row) {
  const name = String(section.name ?? row.name ?? "");
  const actual = String(row.actualDisplay ?? "—");
  const goal = String(section.goalDisplay ?? row.goalDisplay ?? "0");

  if (String(section.metricKind ?? row.metricKind) === "currency") {
    return `${name} = ${actual} *The goal for this number is yet to be finalized.`;
  }

  const grade = row.letterGrade ?? "—";
  return `${name} = ${actual} *Goal = ${goal} Grade = ${grade}`;
}

/**
 * Compute overall company grade as average of graded section letter scores.
 * @param {Array<{ letterGrade?: string|null, gradingEnabled?: boolean }>} rows
 */
export function computeOverallCompanyGrade(rows) {
  const order = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const graded = (rows ?? []).filter((r) => r.letterGrade && r.gradingEnabled !== false);
  if (!graded.length) return null;

  const avg =
    graded.reduce((sum, r) => sum + (order[String(r.letterGrade).toUpperCase()] ?? 0), 0) / graded.length;

  if (avg >= 3.5) return "A";
  if (avg >= 2.5) return "B";
  if (avg >= 1.5) return "C";
  if (avg >= 0.5) return "D";
  return "F";
}

export const DEFAULT_SEVERITY_WEIGHTS = Object.freeze({
  minor: 1,
  moderate: 2,
  major: 3
});

export const MANAGER_ROLES = new Set(["admin", "executive", "hr", "super_admin"]);

/**
 * @param {string|null|undefined} role
 */
export function isManagerRole(role) {
  return MANAGER_ROLES.has(String(role ?? "").trim().toLowerCase());
}

/**
 * @param {{ role?: string|null }|null|undefined} user
 */
export function isWorkforceManager(user) {
  return isManagerRole(user?.role);
}

/**
 * @param {Date|string} [date]
 * @param {string} [timezone]
 */
export function todayIsoInTimezone(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(d);
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @param {number} [weekStartDay] 0=Sun … 6=Sat
 */
export function weekStartForIsoDate(isoDate, weekStartDay = DEFAULT_WEEK_START_DAY) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${isoDate}`);
  const day = d.getDay();
  const diff = (day + 7 - weekStartDay) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} weekStartIso YYYY-MM-DD
 */
export function weekEndForWeekStart(weekStartIso) {
  const d = new Date(`${weekStartIso}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} weekStartIso YYYY-MM-DD
 * @param {number} [weekStartDay]
 */
export function shiftWeekStart(weekStartIso, weekOffset, weekStartDay = DEFAULT_WEEK_START_DAY) {
  const d = new Date(`${weekStartIso}T12:00:00`);
  d.setDate(d.getDate() + weekOffset * 7);
  return weekStartForIsoDate(d.toISOString().slice(0, 10), weekStartDay);
}

/**
 * @param {Array<{ grade: string, maxMistakes: number }>} thresholds
 * @param {number} mistakeCount
 */
export function computeLetterGrade(mistakeCount, thresholds = DEFAULT_GRADE_THRESHOLDS) {
  const count = Math.max(0, Number(mistakeCount) || 0);
  const sorted = [...thresholds].sort((a, b) => a.maxMistakes - b.maxMistakes);
  for (const t of sorted) {
    if (count <= t.maxMistakes) return t.grade;
  }
  return "F";
}

/**
 * @param {Array<{ severity?: string }>} mistakes
 * @param {Record<string, number>} [weights]
 */
export function sumWeightedMistakes(mistakes, weights = DEFAULT_SEVERITY_WEIGHTS) {
  let total = 0;
  for (const m of mistakes ?? []) {
    const sev = String(m.severity ?? "minor").trim();
    total += Number(weights[sev] ?? weights.minor ?? 1);
  }
  return Math.round(total * 100) / 100;
}

/**
 * @param {Array<{ category_label?: string, categoryLabel?: string }>} mistakes
 */
export function buildCategoryBreakdown(mistakes) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const m of mistakes ?? []) {
    const label = String(m.category_label ?? m.categoryLabel ?? "Other").trim() || "Other";
    out[label] = (out[label] ?? 0) + 1;
  }
  return out;
}

/**
 * @param {string} weekStart
 * @param {string} weekEnd
 */
export function formatWeekLabel(weekStart, weekEnd) {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${weekStart} – ${weekEnd}`;
  }
  const opts = { month: "short", day: "numeric" };
  const a = start.toLocaleDateString(undefined, opts);
  const b = end.toLocaleDateString(undefined, { ...opts, year: "numeric" });
  return `${a} – ${b}`;
}

/**
 * Grade tone for UI badges.
 * @param {string} grade
 */
export function gradeTone(grade) {
  switch (String(grade ?? "").toUpperCase()) {
    case "A":
      return "success";
    case "B":
      return "info";
    case "C":
    case "D":
    case "F":
      return "warn";
    default:
      return "neutral";
  }
}

/**
 * Compare current grade to prior week for trend arrow.
 * @param {string|null} current
 * @param {string|null} prior
 */
export function gradeTrend(current, prior) {
  if (!prior || !current) return "neutral";
  const order = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  const c = order[String(current).toUpperCase()] ?? 0;
  const p = order[String(prior).toUpperCase()] ?? 0;
  if (c > p) return "up";
  if (c < p) return "down";
  return "flat";
}

/**
 * @param {string} name
 */
export function shortSectionName(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return "Section";
  const induced = raw.split(/ induced/i)[0]?.trim();
  if (induced && induced.length < raw.length) return induced;
  const slash = raw.split("/")[0]?.trim();
  if (slash && slash.length <= 28) return slash;
  return raw.length > 28 ? `${raw.slice(0, 26)}…` : raw;
}

/**
 * @param {string} name
 * @param {string|null} current
 * @param {string|null} prior
 * @param {string} [trend]
 */
export function formatGradeTrendDisplay(name, current, prior, trend = "neutral") {
  const short = shortSectionName(name);
  if (!current) return `${short}: —`;
  if (!prior) return `${short}: ${current}`;
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return `${short}: ${current} ${arrow} last week ${prior}`;
}

/**
 * @param {string|null|undefined} weekStart
 * @param {string} timezone
 * @param {number} weekStartDay
 */
export function listRecentWeekStarts(weekStart, timezone, weekStartDay, count = 8) {
  const base =
    weekStart ||
    weekStartForIsoDate(todayIsoInTimezone(new Date(), timezone), weekStartDay);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(shiftWeekStart(base, -i, weekStartDay));
  }
  return out;
}
