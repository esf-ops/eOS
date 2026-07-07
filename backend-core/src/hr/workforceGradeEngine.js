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

/** Stricter thresholds for zero-goal incident counts (matches weekly ops grading). */
export const SECTION_ZERO_GOAL_THRESHOLDS = Object.freeze([
  { grade: "A", maxMistakes: 0 },
  { grade: "B", maxMistakes: 1 },
  { grade: "C", maxMistakes: 4 }
]);

/**
 * @param {number} incidentCount
 * @param {Array<{ grade: string, maxMistakes: number }>} [thresholds]
 */
export function computeSectionCountGrade(incidentCount, thresholds = SECTION_ZERO_GOAL_THRESHOLDS) {
  return computeLetterGrade(incidentCount, thresholds);
}

/**
 * Grade days metric where lower is better (goal = max acceptable days).
 * @param {number|null|undefined} actualDays
 * @param {number|null|undefined} goalDays
 */
export function computeSectionDaysGrade(actualDays, goalDays) {
  const actual = Number(actualDays);
  const goal = Number(goalDays);
  if (!Number.isFinite(actual) || !Number.isFinite(goal)) return null;
  if (actual <= goal) return "A";
  if (actual <= goal + 1) return "B";
  if (actual <= goal + 3) return "C";
  return "F";
}

/**
 * Grade production metric where higher is better (goal = weekly SF target).
 * @param {number|null|undefined} actualSf
 * @param {number|null|undefined} goalSf
 */
export function computeSectionProductionGrade(actualSf, goalSf) {
  const actual = Number(actualSf);
  const goal = Number(goalSf);
  if (!Number.isFinite(actual) || !Number.isFinite(goal) || goal <= 0) return null;
  const pct = actual / goal;
  if (pct >= 1) return "A";
  if (pct >= 0.95) return "B";
  if (pct >= 0.85) return "C";
  return "F";
}

/**
 * Grade hours/downtime where lower is better.
 * @param {number|null|undefined} actualHours
 * @param {number|null|undefined} goalHours
 */
export function computeSectionHoursGrade(actualHours, goalHours = 0) {
  return computeSectionCountGrade(actualHours, SECTION_ZERO_GOAL_THRESHOLDS);
}

/**
 * @param {object} section
 * @param {number} incidentCount
 * @param {{ actualNumeric?: number|null, actualDisplay?: string|null }} [weekValue]
 */
export function computeSectionLetterGrade(section, incidentCount, weekValue = {}) {
  if (!section?.gradingEnabled) return null;

  const kind = String(section.metricKind ?? "count");
  const goal = section.goalNumeric;

  if (kind === "count") {
    return computeSectionCountGrade(incidentCount);
  }

  const actualNumeric = weekValue.actualNumeric;

  if (kind === "days") {
    return computeSectionDaysGrade(actualNumeric, goal);
  }
  if (kind === "production") {
    return computeSectionProductionGrade(actualNumeric, goal);
  }
  if (kind === "hours") {
    const hours = actualNumeric != null ? actualNumeric : incidentCount;
    return computeSectionHoursGrade(hours, goal ?? 0);
  }
  if (kind === "currency") {
    return null;
  }

  return computeSectionCountGrade(incidentCount);
}

/**
 * @param {object} section
 * @param {number} incidentCount
 * @param {{ actualNumeric?: number|null, actualDisplay?: string|null }} [weekValue]
 */
export function formatSectionActualDisplay(section, incidentCount, weekValue = {}) {
  if (weekValue.actualDisplay) return String(weekValue.actualDisplay);

  const kind = String(section.metricKind ?? "count");
  const numeric = weekValue.actualNumeric;

  if (kind === "currency" && numeric != null) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric);
  }
  if (kind === "production" && numeric != null) {
    const daily = Math.round(numeric / 5);
    return `${numeric.toLocaleString()}sf weekly / ${daily.toLocaleString()}sf daily`;
  }
  if (kind === "days" && numeric != null) {
    return `${numeric} days`;
  }
  if (kind === "hours") {
    const hrs = numeric != null ? numeric : incidentCount;
    return `${hrs}hrs`;
  }

  return String(Math.max(0, incidentCount));
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
      return "warn";
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
