/**
 * Weekly Operations Scorecard row builder and snapshot helpers.
 * @module workforceScorecard
 */

import {
  computeOverallCompanyGrade,
  computeSectionLetterGrade,
  formatGradeTrendDisplay,
  formatScorecardReportLine,
  formatSectionActualDisplay,
  formatWeekLabel,
  gradeTrend,
  normalizeValuePayload,
  shiftWeekStart,
  shortSectionName,
  todayIsoInTimezone,
  weekEndForWeekStart,
  weekStartForIsoDate
} from "./workforceGradeEngine.js";
import { isMetricTotalSection, mapSectionRow } from "./workforceGradingSections.js";

/**
 * Weekly incident count for grading: max(detail mistakes, quick_count).
 * @param {number} detailCount
 * @param {object} [weekValue]
 */
export function effectiveIncidentCount(detailCount, weekValue = {}) {
  const payload = normalizeValuePayload(weekValue.valuePayload);
  const quickRaw = payload.quick_count;
  const details = Math.max(0, Number(detailCount) || 0);
  if (quickRaw != null && quickRaw !== "") {
    const quick = Math.max(0, Math.round(Number(quickRaw)));
    if (Number.isFinite(quick)) return Math.max(details, quick);
  }
  return details;
}

/**
 * @param {object} [weekValue]
 */
export function readQuickCount(weekValue = {}) {
  const payload = normalizeValuePayload(weekValue.valuePayload);
  if (payload.quick_count == null || payload.quick_count === "") return null;
  const n = Math.max(0, Math.round(Number(payload.quick_count)));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} row
 */
export function mapWeekValueRow(row) {
  return {
    actualNumeric: row.actual_numeric != null ? Number(row.actual_numeric) : null,
    actualDisplay: row.actual_display ?? null,
    valuePayload: row.value_payload && typeof row.value_payload === "object" ? row.value_payload : {}
  };
}

/**
 * @param {Array<object>} sections
 * @param {Array<object>} mistakes
 * @param {Map<string, object>} weekValues
 * @param {Map<string, string|null>} [priorGrades]
 */
export function buildScorecardRows(sections, mistakes, weekValues, priorGrades = new Map()) {
  /** @type {Map<string, object[]>} */
  const incidentsBySection = new Map();
  for (const m of mistakes ?? []) {
    const sid = String(m.section_id);
    if (!incidentsBySection.has(sid)) incidentsBySection.set(sid, []);
    incidentsBySection.get(sid).push(m);
  }

  const rows = sections.map((section) => {
    const incidents = incidentsBySection.get(section.sectionId) ?? [];
    const detailMistakeCount = incidents.length;
    const weekValue = weekValues.get(section.sectionId) ?? {};
    const incidentCount = effectiveIncidentCount(detailMistakeCount, weekValue);
    const quickCount = readQuickCount(weekValue);
    const letterGrade = computeSectionLetterGrade(section, incidentCount, weekValue);
    const priorGrade = priorGrades.get(section.sectionId) ?? null;
    const trend = letterGrade ? gradeTrend(letterGrade, priorGrade) : "neutral";

    return {
      ...section,
      incidentCount,
      detailMistakeCount,
      quickCount,
      isMetricTotal: isMetricTotalSection(section),
      actualDisplay: formatSectionActualDisplay(section, incidentCount, weekValue),
      letterGrade,
      priorLetterGrade: priorGrade,
      trend,
      trendLabel: letterGrade ? formatGradeTrendDisplay(section.name, letterGrade, priorGrade, trend) : null,
      weekValue
    };
  });

  rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const overallGrade = computeOverallCompanyGrade(rows);
  const insights = buildScorecardInsights(rows, overallGrade);

  return {
    rows,
    overallGrade,
    executiveSummary: insights.executiveSummary,
    narrative: insights.narrative
  };
}

const GRADE_SCORE = Object.freeze({ A: 4, B: 3, C: 2, D: 1, F: 0 });

/**
 * @param {Array<object>} rows
 */
export function computeOverallGradeAverage(rows) {
  const graded = (rows ?? []).filter((r) => r.letterGrade && r.gradingEnabled !== false);
  if (!graded.length) return null;
  return (
    graded.reduce((sum, r) => sum + (GRADE_SCORE[String(r.letterGrade).toUpperCase()] ?? 0), 0) / graded.length
  );
}

/**
 * @param {Array<object>} rows
 * @param {string|null} overallGrade
 */
export function formatOverallPerformanceLabel(rows, overallGrade) {
  const avg = computeOverallGradeAverage(rows);
  if (avg == null || !overallGrade) return overallGrade ?? "—";

  const bands = {
    A: [3.5, 4],
    B: [2.5, 3.5],
    C: [1.5, 2.5],
    D: [0.5, 1.5],
    F: [0, 0.5]
  };
  const band = bands[String(overallGrade).toUpperCase()];
  if (!band) return overallGrade;
  const [lo, hi] = band;
  const span = hi - lo || 1;
  const pos = (avg - lo) / span;
  if (pos >= 0.65) return `${overallGrade}+`;
  if (pos <= 0.35) return `${overallGrade}-`;
  return overallGrade;
}

/**
 * @param {Array<object>} rows
 */
function findRowByMetricKind(rows, kind) {
  return rows.find((row) => String(row.metricKind) === kind) ?? null;
}

/**
 * @param {object|null} row
 */
function readMetricNumber(row, payloadKey) {
  if (!row) return null;
  const payload = normalizeValuePayload(row.weekValue?.valuePayload);
  const raw = payload[payloadKey] ?? row.weekValue?.actualNumeric;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Array<object>} rows
 * @param {string|null} overallGrade
 */
export function buildExecutiveSummary(rows, overallGrade) {
  /** @type {Record<string, number>} */
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const row of rows ?? []) {
    if (!row.letterGrade || row.gradingEnabled === false) continue;
    const key = String(row.letterGrade).toUpperCase();
    if (key in gradeCounts) gradeCounts[key] += 1;
  }

  const totalMistakes = (rows ?? [])
    .filter((row) => String(row.metricKind) === "count")
    .reduce((sum, row) => sum + Math.max(0, Number(row.incidentCount) || 0), 0);

  const gradedRows = (rows ?? []).filter((row) => row.letterGrade && row.gradingEnabled !== false);
  const worstRow = [...gradedRows].sort((a, b) => {
    const ga = GRADE_SCORE[String(a.letterGrade).toUpperCase()] ?? 5;
    const gb = GRADE_SCORE[String(b.letterGrade).toUpperCase()] ?? 5;
    if (ga !== gb) return ga - gb;
    return (Number(b.incidentCount) || 0) - (Number(a.incidentCount) || 0);
  })[0];

  const productionRow = findRowByMetricKind(rows, "production");
  const leadTimeRow = findRowByMetricKind(rows, "days");
  const quoteRow = findRowByMetricKind(rows, "currency");

  return {
    overallGrade: overallGrade ?? null,
    overallPerformanceLabel: formatOverallPerformanceLabel(rows, overallGrade),
    gradeCounts,
    totalMistakes,
    worstPerformingArea: worstRow?.name ?? null,
    quoteVolume: readMetricNumber(quoteRow, "currency"),
    quoteVolumeDisplay: quoteRow?.actualDisplay ?? null,
    productionSf: readMetricNumber(productionRow, "weekly_sf"),
    productionGoalSf: productionRow?.goalNumeric ?? null,
    productionDisplay: productionRow?.actualDisplay ?? null,
    medianLeadTime: readMetricNumber(leadTimeRow, "median_days"),
    medianLeadTimeGoal: leadTimeRow?.goalNumeric ?? null,
    medianLeadTimeDisplay: leadTimeRow?.actualDisplay ?? null
  };
}

/**
 * @param {Array<object>} rows
 * @param {object} summary
 */
export function buildWeeklyNarrative(rows, summary) {
  const performance = summary.overallPerformanceLabel ?? summary.overallGrade ?? "—";
  const worstNames = [...(rows ?? [])]
    .filter((row) => row.letterGrade && row.gradingEnabled !== false)
    .sort((a, b) => {
      const ga = GRADE_SCORE[String(a.letterGrade).toUpperCase()] ?? 5;
      const gb = GRADE_SCORE[String(b.letterGrade).toUpperCase()] ?? 5;
      if (ga !== gb) return ga - gb;
      return (Number(b.incidentCount) || 0) - (Number(a.incidentCount) || 0);
    })
    .slice(0, 3)
    .map((row) => shortSectionName(row.name));

  const parts = [`Overall performance was ${performance} this week.`];

  if (worstNames.length) {
    parts.push(`The biggest issues were ${worstNames.join(", ")}.`);
  }

  if (summary.productionSf != null) {
    const goal = summary.productionGoalSf != null ? summary.productionGoalSf.toLocaleString("en-US") : "goal";
    parts.push(
      `Production was ${summary.productionSf.toLocaleString("en-US")} SF against a ${goal} SF goal.`
    );
  }

  if (summary.medianLeadTime != null) {
    const goal = summary.medianLeadTimeGoal != null ? summary.medianLeadTimeGoal : "goal";
    parts.push(`Median lead time was ${summary.medianLeadTime} days against a ${goal} day goal.`);
  }

  return parts.join(" ");
}

/**
 * @param {Array<object>} rows
 * @param {string|null} overallGrade
 */
export function buildScorecardInsights(rows, overallGrade) {
  const executiveSummary = buildExecutiveSummary(rows, overallGrade);
  const narrative = buildWeeklyNarrative(rows, executiveSummary);
  return { executiveSummary, narrative };
}

/**
 * @param {object} m
 */
export function mapIncidentRow(m) {
  return {
    id: String(m.id),
    entryKind: "detail",
    sectionId: String(m.section_id),
    weekStart: m.week_start ?? null,
    occurredAt: m.occurred_at,
    severity: m.severity ?? "minor",
    jobCustomer: m.job_customer ?? null,
    personInvolved: m.person_involved ?? null,
    description: m.description ?? null,
    categoryLabel: m.category_label ?? null,
    sectionName: m.section_name ?? m.sectionName ?? null
  };
}

/**
 * Synthetic log row when a section uses quick-count entry.
 * @param {object} section
 * @param {number} quickCount
 * @param {string} weekStart
 */
export function buildQuickCountLogEntry(section, quickCount, weekStart) {
  return {
    id: `quick-count:${section.sectionId}:${weekStart}`,
    entryKind: "quick_count",
    sectionId: section.sectionId,
    weekStart,
    occurredAt: `${weekStart}T12:00:00.000Z`,
    severity: null,
    jobCustomer: null,
    personInvolved: null,
    description: `Quick count set to ${quickCount} for the week`,
    categoryLabel: section.name,
    sectionName: section.name
  };
}

/**
 * @param {Array<object>} rows
 * @param {{ weekLabel?: string, overallGrade?: string|null, mistakesSummary?: Array<object>, executiveSummary?: object, narrative?: string }} [meta]
 */
export function buildScorecardReportText(rows, meta = {}) {
  const gradeRows = rows.filter((row) => !isMetricTotalSection(row));
  const metricRows = rows.filter((row) => isMetricTotalSection(row));
  const summary = meta.executiveSummary ?? buildExecutiveSummary(rows, meta.overallGrade ?? null);
  const lines = [];

  if (meta.weekLabel) lines.push(meta.weekLabel, "");
  lines.push("Executive Summary", "");
  lines.push(`Overall Grade: ${summary.overallGrade ?? meta.overallGrade ?? "—"}`);
  lines.push(`A grades: ${summary.gradeCounts?.A ?? 0}`);
  lines.push(`B grades: ${summary.gradeCounts?.B ?? 0}`);
  lines.push(`C grades: ${summary.gradeCounts?.C ?? 0}`);
  lines.push(`D grades: ${summary.gradeCounts?.D ?? 0}`);
  lines.push(`F grades: ${summary.gradeCounts?.F ?? 0}`);
  lines.push(`Total mistakes: ${summary.totalMistakes ?? 0}`);
  lines.push(`Worst performing area: ${summary.worstPerformingArea ?? "—"}`);
  lines.push(`Quote volume: ${summary.quoteVolumeDisplay ?? summary.quoteVolume ?? "—"}`);
  lines.push(`Production SF: ${summary.productionDisplay ?? summary.productionSf ?? "—"}`);
  lines.push(`Median lead time: ${summary.medianLeadTimeDisplay ?? summary.medianLeadTime ?? "—"}`);
  lines.push("");
  lines.push(meta.narrative ?? buildWeeklyNarrative(rows, summary), "", "Grades", "");

  for (const row of gradeRows) {
    lines.push(formatScorecardReportLine(row, row));
  }

  lines.push("", "Totals / Metrics", "");
  for (const row of metricRows) {
    lines.push(formatScorecardReportLine(row, row));
  }

  const mistakes = meta.mistakesSummary ?? [];
  lines.push("", "Mistakes Log Summary", "");
  if (!mistakes.length) {
    lines.push("No detailed mistakes logged this week.");
  } else {
    for (const m of mistakes) {
      const date = String(m.occurredAt ?? m.occurred_at ?? "").slice(0, 10);
      lines.push(
        `${date} · ${m.sectionName ?? m.categoryLabel ?? "—"} · ${m.jobCustomer ?? m.job_customer ?? "—"} · ${m.severity ?? "—"} · ${m.description ?? "—"}`
      );
    }
  }

  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportGradeCell(grade) {
  if (!grade) return "—";
  const g = escapeHtml(grade);
  return `<span class="hr-report-grade hr-report-grade--${g.toLowerCase()}">${g}</span>`;
}

function buildReportRowCards(sectionTitle, sectionRows) {
  if (!sectionRows.length) {
    return `<section class="hr-report-block"><h3>${escapeHtml(sectionTitle)}</h3><p class="hr-report-empty">No entries.</p></section>`;
  }

  const cards = sectionRows
    .map((row) => {
      const isCurrency = String(row.metricKind) === "currency";
      const gradeLabel = isCurrency ? "Tracked" : row.letterGrade ?? "—";
      const gradeHtml = isCurrency
        ? `<span class="hr-report-status">${escapeHtml(gradeLabel)}</span>`
        : reportGradeCell(row.letterGrade);
      const goalNote = isCurrency ? `<p class="hr-report-note">Goal pending finalization</p>` : "";
      const trendLine = row.trendLabel
        ? `<p class="hr-report-trend">${escapeHtml(row.trendLabel)}</p>`
        : "";

      return `<article class="hr-report-card">
  <header class="hr-report-card-head">
    <h4>${escapeHtml(row.name)}</h4>
    ${gradeHtml}
  </header>
  ${trendLine}
  <dl class="hr-report-card-metrics">
    <div><dt>Actual</dt><dd>${escapeHtml(row.actualDisplay ?? "—")}</dd></div>
    <div><dt>Goal</dt><dd>${escapeHtml(row.goalDisplay ?? "—")}</dd></div>
    <div><dt>Grade</dt><dd>${escapeHtml(gradeLabel)}</dd></div>
  </dl>
  ${goalNote}
</article>`;
    })
    .join("");

  return `<section class="hr-report-block"><h3>${escapeHtml(sectionTitle)}</h3><div class="hr-report-card-grid">${cards}</div></section>`;
}

function buildExecutiveSummaryHtml(summary, narrative) {
  const s = summary ?? {};
  const counts = s.gradeCounts ?? {};
  const quote =
    s.quoteVolume != null
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(s.quoteVolume))
      : s.quoteVolumeDisplay ?? "—";
  const production =
    s.productionSf != null ? `${Number(s.productionSf).toLocaleString("en-US")} SF` : s.productionDisplay ?? "—";
  const leadTime =
    s.medianLeadTime != null ? `${s.medianLeadTime} days` : s.medianLeadTimeDisplay ?? "—";

  return `<section class="hr-report-block hr-report-exec">
    <h3>Executive Summary</h3>
    <div class="hr-report-exec-grid">
      <article class="hr-report-exec-stat hr-report-exec-stat--hero">
        <span>Overall Grade</span>
        <strong>${reportGradeCell(s.overallGrade ?? null)}</strong>
      </article>
      <article class="hr-report-exec-stat"><span>A grades</span><strong>${counts.A ?? 0}</strong></article>
      <article class="hr-report-exec-stat"><span>B grades</span><strong>${counts.B ?? 0}</strong></article>
      <article class="hr-report-exec-stat"><span>C grades</span><strong>${counts.C ?? 0}</strong></article>
      <article class="hr-report-exec-stat"><span>D grades</span><strong>${counts.D ?? 0}</strong></article>
      <article class="hr-report-exec-stat"><span>F grades</span><strong>${counts.F ?? 0}</strong></article>
      <article class="hr-report-exec-stat"><span>Total mistakes</span><strong>${s.totalMistakes ?? 0}</strong></article>
      <article class="hr-report-exec-stat"><span>Worst area</span><strong>${escapeHtml(s.worstPerformingArea ?? "—")}</strong></article>
      <article class="hr-report-exec-stat"><span>Quote volume</span><strong>${escapeHtml(quote)}</strong></article>
      <article class="hr-report-exec-stat"><span>Production SF</span><strong>${escapeHtml(production)}</strong></article>
      <article class="hr-report-exec-stat"><span>Median lead time</span><strong>${escapeHtml(leadTime)}</strong></article>
    </div>
    <p class="hr-report-narrative">${escapeHtml(narrative ?? "")}</p>
  </section>`;
}

/**
 * @param {Array<object>} rows
 * @param {{ weekLabel?: string, overallGrade?: string|null, mistakesSummary?: Array<object>, executiveSummary?: object, narrative?: string }} meta
 */
export function buildScorecardReportHtml(rows, meta = {}) {
  const gradeRows = rows.filter((row) => !isMetricTotalSection(row));
  const metricRows = rows.filter((row) => isMetricTotalSection(row));
  const mistakes = meta.mistakesSummary ?? [];
  const summary = meta.executiveSummary ?? buildExecutiveSummary(rows, meta.overallGrade ?? null);
  const narrative = meta.narrative ?? buildWeeklyNarrative(rows, summary);

  const mistakeItems = mistakes.length
    ? `<ul class="hr-report-mistake-list">${mistakes
        .map((m) => {
          const date = escapeHtml(String(m.occurredAt ?? m.occurred_at ?? "").slice(0, 10));
          const section = escapeHtml(m.sectionName ?? m.categoryLabel ?? "—");
          const desc = escapeHtml(m.description ?? "—");
          const job = escapeHtml(m.jobCustomer ?? m.job_customer ?? "—");
          const sev = escapeHtml(m.severity ?? "—");
          return `<li><strong>${date}</strong> · ${section} · ${job} · ${sev}<span>${desc}</span></li>`;
        })
        .join("")}</ul>`
    : `<p class="hr-report-empty">No detailed mistakes logged this week.</p>`;

  return `<div class="hr-report-doc">
  <header class="hr-report-doc-head">
    <p class="hr-report-kicker">eliteOS · Weekly Operations Scorecard</p>
    <h2>${escapeHtml(meta.weekLabel ?? "Weekly Report")}</h2>
  </header>
  ${buildExecutiveSummaryHtml(summary, narrative)}
  ${buildReportRowCards("Grades", gradeRows)}
  ${buildReportRowCards("Totals / Metrics", metricRows)}
  <section class="hr-report-block">
    <h3>Mistakes Log Summary</h3>
    ${mistakeItems}
  </section>
</div>`;
}

/**
 * Build week selector options anchored to the current week.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {object} settings
 * @param {(error: unknown) => boolean} isMissingTableError
 */
export async function buildScorecardWeekOptions(db, organizationId, settings, isMissingTableError) {
  const tz = settings.timezone;
  const weekStartDay = settings.week_start_day;
  const currentWeekStart = weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), weekStartDay);
  const lastWeekStart = shiftWeekStart(currentWeekStart, -1, weekStartDay);

  /** @type {Set<string>} */
  const weekSet = new Set([currentWeekStart, lastWeekStart]);

  try {
    const results = await Promise.all([
      db
        .from("workforce_mistakes")
        .select("week_start")
        .eq("organization_id", organizationId)
        .not("section_id", "is", null),
      db.from("workforce_section_week_values").select("week_start").eq("organization_id", organizationId),
      db.from("workforce_section_week_snapshots").select("week_start").eq("organization_id", organizationId)
    ]);
    for (const res of results) {
      if (res.error) {
        if (isMissingTableError(res.error)) continue;
        throw res.error;
      }
      for (const row of res.data ?? []) {
        if (row.week_start) weekSet.add(String(row.week_start));
      }
    }
  } catch (e) {
    if (!isMissingTableError(e)) throw e;
  }

  const sorted = [...weekSet].sort((a, b) => b.localeCompare(a));
  const rest = sorted.filter((ws) => ws !== currentWeekStart);

  return [currentWeekStart, ...rest].map((weekStart) => ({
    ...scorecardWeekMeta(weekStart),
    isCurrentWeek: weekStart === currentWeekStart
  }));
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} weekStart
 * @param {Array<object>} rows
 */
export async function upsertWeekSnapshots(db, organizationId, weekStart, rows) {
  const snapshots = [];
  for (const row of rows) {
    const payload = {
      organization_id: organizationId,
      section_id: row.sectionId,
      week_start: weekStart,
      incident_count: row.incidentCount ?? 0,
      actual_display: row.actualDisplay ?? null,
      letter_grade: row.letterGrade ?? null,
      goal_display: row.goalDisplay ?? "0",
      snapshotted_at: new Date().toISOString()
    };

    const { data, error } = await db
      .from("workforce_section_week_snapshots")
      .upsert(payload, { onConflict: "organization_id,section_id,week_start" })
      .select("*")
      .single();
    if (error) throw error;
    snapshots.push(data);
  }
  return snapshots;
}

/**
 * @param {string} weekStart
 */
export function scorecardWeekMeta(weekStart) {
  const weekEnd = weekEndForWeekStart(weekStart);
  return {
    weekStart,
    weekEnd,
    weekLabel: formatWeekLabel(weekStart, weekEnd)
  };
}

/**
 * Build metric value payload + display from request body and section kind.
 * @param {object} section mapped section row
 * @param {Record<string, unknown>} body
 */
export function buildMetricValueFromBody(section, body) {
  const kind = String(section.metricKind ?? "count");
  /** @type {Record<string, unknown>} */
  const payload = {};
  let actualNumeric = null;
  let actualDisplay = null;

  if (kind === "days") {
    const median = body.median_days ?? body.medianDays;
    const average = body.average_days ?? body.averageDays;
    if (median != null && median !== "") payload.median_days = Number(median);
    if (average != null && average !== "") payload.average_days = Number(average);
    actualNumeric = payload.median_days != null ? Number(payload.median_days) : null;
  } else if (kind === "production") {
    const weekly = body.weekly_sf ?? body.weeklySf;
    const daily = body.daily_sf ?? body.dailySf;
    if (weekly != null && weekly !== "") payload.weekly_sf = Number(weekly);
    if (daily != null && daily !== "") payload.daily_sf = Number(daily);
    else if (payload.weekly_sf != null) payload.daily_sf = Math.round(Number(payload.weekly_sf) / 5);
    actualNumeric = payload.weekly_sf != null ? Number(payload.weekly_sf) : null;
  } else if (kind === "currency") {
    const currency = body.currency ?? body.actual_numeric ?? body.actualNumeric;
    if (currency != null && currency !== "") payload.currency = Number(currency);
    actualNumeric = payload.currency != null ? Number(payload.currency) : null;
  } else if (kind === "hours") {
    const hours = body.hours ?? body.actual_numeric ?? body.actualNumeric;
    if (hours != null && hours !== "") payload.hours = Number(hours);
    actualNumeric = payload.hours != null ? Number(payload.hours) : null;
  } else if (body.actual_numeric != null || body.actualNumeric != null) {
    actualNumeric = Number(body.actual_numeric ?? body.actualNumeric);
  }

  actualDisplay =
    String(body.actual_display ?? body.actualDisplay ?? "").trim() ||
    formatSectionActualDisplay(section, 0, { actualNumeric, valuePayload: payload });

  return { payload, actualNumeric, actualDisplay };
}

export { mapSectionRow };
