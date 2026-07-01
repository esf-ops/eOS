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
