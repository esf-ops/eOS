/**
 * Weekly Operations Scorecard row builder and snapshot helpers.
 * @module workforceScorecard
 */

import {
  computeOverallCompanyGrade,
  computeSectionLetterGrade,
  formatScorecardReportLine,
  formatSectionActualDisplay,
  formatWeekLabel,
  gradeTrend,
  normalizeValuePayload,
  shiftWeekStart,
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

    return {
      ...section,
      incidentCount,
      detailMistakeCount,
      quickCount,
      isMetricTotal: isMetricTotalSection(section),
      actualDisplay: formatSectionActualDisplay(section, incidentCount, weekValue),
      letterGrade,
      priorLetterGrade: priorGrade,
      trend: letterGrade ? gradeTrend(letterGrade, priorGrade) : "neutral",
      weekValue
    };
  });

  rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return {
    rows,
    overallGrade: computeOverallCompanyGrade(rows)
  };
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
 * @param {{ weekLabel?: string, overallGrade?: string|null, mistakesSummary?: Array<object> }} [meta]
 */
export function buildScorecardReportText(rows, meta = {}) {
  const gradeRows = rows.filter((row) => !isMetricTotalSection(row));
  const metricRows = rows.filter((row) => isMetricTotalSection(row));
  const lines = [];

  if (meta.weekLabel) lines.push(meta.weekLabel, "");
  lines.push(`Overall Grade: ${meta.overallGrade ?? "—"}`, "", "Grades", "");

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

      return `<article class="hr-report-card">
  <header class="hr-report-card-head">
    <h4>${escapeHtml(row.name)}</h4>
    ${gradeHtml}
  </header>
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

/**
 * @param {Array<object>} rows
 * @param {{ weekLabel?: string, overallGrade?: string|null, mistakesSummary?: Array<object> }} meta
 */
export function buildScorecardReportHtml(rows, meta = {}) {
  const gradeRows = rows.filter((row) => !isMetricTotalSection(row));
  const metricRows = rows.filter((row) => isMetricTotalSection(row));
  const mistakes = meta.mistakesSummary ?? [];

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
  <section class="hr-report-block hr-report-overall">
    <h3>Overall Grade</h3>
    <div class="hr-report-overall-grade">${reportGradeCell(meta.overallGrade ?? null)}</div>
  </section>
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
