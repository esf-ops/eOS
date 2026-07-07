/**
 * eliteOS HR Head — Workforce Quality API (supervisor-logged mistakes + weekly grades).
 *
 * Auth: requireAuth() + requireHeadAccess("hr")
 * Any user with HR head access may view the team dashboard and log mistakes.
 * Category admin remains manager-only (admin, executive, hr, super_admin).
 */

import express from "express";
import { logAction } from "../auth/auditLog.js";
import {
  buildCategoryBreakdown,
  computeLetterGrade,
  computeSectionLetterGrade,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_SEVERITY_WEIGHTS,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEK_START_DAY,
  formatSectionActualDisplay,
  formatWeekLabel,
  gradeTrend,
  isWorkforceManager,
  listRecentWeekStarts,
  sumWeightedMistakes,
  todayIsoInTimezone,
  weekEndForWeekStart,
  weekStartForIsoDate
} from "./workforceGradeEngine.js";
import { ensureDefaultGradingSections, mapSectionRow } from "./workforceGradingSections.js";
import {
  buildMetricValueFromBody,
  buildQuickCountLogEntry,
  buildScorecardReportHtml,
  buildScorecardReportText,
  buildScorecardRows,
  buildScorecardWeekOptions,
  effectiveIncidentCount,
  mapIncidentRow,
  mapWeekValueRow,
  readQuickCount,
  scorecardWeekMeta,
  upsertWeekSnapshots
} from "./workforceScorecard.js";
import { parseWorkforceEmployeeKey } from "./workforceRoster.js";
import {
  ensureTestRosterMembers,
  loadWorkforceTeam,
  workforceRefFromDbRow,
  workforceRefToDbColumns,
  workforceSnapshotKey
} from "./workforceTeamLoad.js";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";

export const HR_HEAD_SLUG = "hr";

const jsonParser = express.json({ limit: "256kb" });

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
}

const HR_CLIENT_ERRORS = Object.freeze({
  load: "Unable to load HR workforce data.",
  save: "Unable to save HR workforce data.",
  categories: "Unable to update mistake categories."
});

/**
 * @param {import("express").Response} res
 * @param {unknown} e
 * @param {string} [clientMessage]
 */
function respondServerError(res, e, clientMessage = HR_CLIENT_ERRORS.load) {
  console.error("[hr-workforce]", e);
  res.status(500).json({ ok: false, error: clientMessage });
}

function pickStr(v) {
  return String(v ?? "").trim();
}

function isMissingTableError(error) {
  const msg = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return code === "42P01" || (msg.includes("relation") && msg.includes("does not exist"));
}

/**
 * @param {Record<string, unknown>} body
 */
function parseEmployeeRefFromBody(body) {
  const key = pickStr(body?.employee_key ?? body?.employeeKey);
  if (key) {
    const parsed = parseWorkforceEmployeeKey(key);
    if (parsed) return parsed;
  }
  const rosterId = pickStr(body?.employee_roster_id ?? body?.employeeRosterId);
  if (rosterId) return { source: "roster", id: rosterId };
  const userId = pickStr(body?.employee_user_id ?? body?.employeeUserId ?? body?.employee_id ?? body?.employeeId);
  if (!userId) return null;
  const source = pickStr(body?.employee_source ?? body?.employeeSource);
  if (source === "roster") return { source: "roster", id: userId };
  const fromKey = parseWorkforceEmployeeKey(userId);
  if (fromKey) return fromKey;
  return { source: "user", id: userId };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
async function loadGradeSettings(db, organizationId) {
  const defaults = {
    timezone: DEFAULT_TIMEZONE,
    week_start_day: DEFAULT_WEEK_START_DAY,
    grade_thresholds: DEFAULT_GRADE_THRESHOLDS,
    severity_weights: DEFAULT_SEVERITY_WEIGHTS
  };
  try {
    const { data, error } = await db
      .from("workforce_grade_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return defaults;
      throw error;
    }
    if (!data) return defaults;
    return {
      timezone: pickStr(data.timezone) || DEFAULT_TIMEZONE,
      week_start_day: Number(data.week_start_day ?? DEFAULT_WEEK_START_DAY),
      grade_thresholds: Array.isArray(data.grade_thresholds) ? data.grade_thresholds : DEFAULT_GRADE_THRESHOLDS,
      severity_weights:
        data.severity_weights && typeof data.severity_weights === "object"
          ? data.severity_weights
          : DEFAULT_SEVERITY_WEIGHTS
    };
  } catch (e) {
    if (isMissingTableError(e)) return defaults;
    throw e;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
async function ensureDefaultCategory(db, organizationId) {
  try {
    const { data, error } = await db
      .from("workforce_mistake_categories")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(1);
    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
    if (data?.length) return data[0].id;
    const { data: inserted, error: insErr } = await db
      .from("workforce_mistake_categories")
      .insert({
        organization_id: organizationId,
        name: "Other",
        sort_order: 0,
        is_active: true
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return inserted?.id ?? null;
  } catch (e) {
    if (isMissingTableError(e)) return null;
    throw e;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
async function loadGradingSections(db, organizationId) {
  try {
    const { data, error } = await db
      .from("workforce_grading_sections")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
    return (data ?? []).map(mapSectionRow);
  } catch (e) {
    if (isMissingTableError(e)) return [];
    throw e;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} weekStart
 */
async function loadSectionWeekValues(db, organizationId, weekStart) {
  try {
    let res = await db
      .from("workforce_section_week_values")
      .select("section_id, actual_numeric, actual_display, value_payload")
      .eq("organization_id", organizationId)
      .eq("week_start", weekStart);
    if (res.error) {
      const msg = String(res.error.message ?? "").toLowerCase();
      if (msg.includes("value_payload")) {
        res = await db
          .from("workforce_section_week_values")
          .select("section_id, actual_numeric, actual_display")
          .eq("organization_id", organizationId)
          .eq("week_start", weekStart);
      }
    }
    if (res.error) {
      if (isMissingTableError(res.error)) return new Map();
      throw res.error;
    }
    const map = new Map();
    for (const row of res.data ?? []) {
      map.set(String(row.section_id), mapWeekValueRow(row));
    }
    return map;
  } catch (e) {
    if (isMissingTableError(e)) return new Map();
    throw e;
  }
}

async function loadExistingWeekValue(db, organizationId, sectionId, weekStart) {
  try {
    let res = await db
      .from("workforce_section_week_values")
      .select("actual_numeric, actual_display, value_payload")
      .eq("organization_id", organizationId)
      .eq("section_id", sectionId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (res.error) {
      const msg = String(res.error.message ?? "").toLowerCase();
      if (msg.includes("value_payload")) {
        res = await db
          .from("workforce_section_week_values")
          .select("actual_numeric, actual_display")
          .eq("organization_id", organizationId)
          .eq("section_id", sectionId)
          .eq("week_start", weekStart)
          .maybeSingle();
      }
    }
    if (res.error) {
      if (isMissingTableError(res.error)) return null;
      throw res.error;
    }
    return res.data ? mapWeekValueRow(res.data) : null;
  } catch (e) {
    if (isMissingTableError(e)) return null;
    throw e;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} weekStart
 * @param {object} settings
 * @param {number} [weekCount]
 */
async function loadMistakesLogWeeks(db, organizationId, weekStart, settings, weekCount = 8) {
  const sections = await loadGradingSections(db, organizationId);
  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));
  const weekStarts = listRecentWeekStarts(weekStart, settings.timezone, settings.week_start_day, weekCount);

  const fullSelect =
    "id, section_id, severity, category_label, occurred_at, description, job_customer, person_involved, week_start";
  const basicSelect = "id, section_id, severity, category_label, occurred_at, description, week_start";

  let mistakeRes = await db
    .from("workforce_mistakes")
    .select(fullSelect)
    .eq("organization_id", organizationId)
    .in("week_start", weekStarts)
    .not("section_id", "is", null)
    .order("occurred_at", { ascending: false });

  if (mistakeRes.error) {
    const msg = String(mistakeRes.error.message ?? "").toLowerCase();
    if (msg.includes("job_customer") || msg.includes("person_involved")) {
      mistakeRes = await db
        .from("workforce_mistakes")
        .select(basicSelect)
        .eq("organization_id", organizationId)
        .in("week_start", weekStarts)
        .not("section_id", "is", null)
        .order("occurred_at", { ascending: false });
    }
  }

  if (mistakeRes.error && !isMissingTableError(mistakeRes.error)) throw mistakeRes.error;
  const mistakeData = mistakeRes.error ? [] : mistakeRes.data ?? [];

  /** @type {Map<string, object>} */
  const weekValuesByKey = new Map();
  for (const ws of weekStarts) {
    const values = await loadSectionWeekValues(db, organizationId, ws);
    for (const [sectionId, value] of values) {
      weekValuesByKey.set(`${sectionId}::${ws}`, value);
    }
  }

  const weeks = weekStarts.map((ws) => {
    const weekMistakes = mistakeData.filter((m) => m.week_start === ws);
    const mapped = weekMistakes.map((m) => {
      const section = sectionById.get(String(m.section_id));
      return mapIncidentRow({ ...m, section_name: section?.name ?? null });
    });

    for (const section of sections) {
      if (section.metricKind !== "count") continue;
      const weekValue = weekValuesByKey.get(`${section.sectionId}::${ws}`) ?? {};
      const quickCount = readQuickCount(weekValue);
      if (quickCount != null && quickCount > 0) {
        mapped.unshift(buildQuickCountLogEntry(section, quickCount, ws));
      }
    }

    return {
      ...scorecardWeekMeta(ws),
      mistakes: mapped
    };
  });

  return { weeks, sections };
}

/**
 * @param {import("express").Request} req
 * @param {object} settings
 */
function resolveRequestedWeekStart(req, settings) {
  const tz = settings.timezone;
  const weekStartDay = settings.week_start_day;
  const param = pickStr(req.query?.week_start ?? req.query?.weekStart ?? req.body?.week_start ?? req.body?.weekStart);
  if (param) return weekStartForIsoDate(param, weekStartDay);
  return weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), weekStartDay);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} weekStart
 * @param {object} settings
 */
async function loadScorecardPayload(db, organizationId, weekStart, settings) {
  const sections = await loadGradingSections(db, organizationId);
  if (!sections.length) {
    return { sections, rows: [], overallGrade: null, mistakes: [], weekValues: new Map() };
  }

  const fullSelect =
    "id, section_id, severity, category_label, occurred_at, description, job_customer, person_involved";
  const basicSelect = "id, section_id, severity, category_label, occurred_at, description";

  let mistakeData = [];
  let mistakeRes = await db
    .from("workforce_mistakes")
    .select(fullSelect)
    .eq("organization_id", organizationId)
    .eq("week_start", weekStart)
    .not("section_id", "is", null)
    .order("occurred_at", { ascending: false });

  if (mistakeRes.error) {
    const msg = String(mistakeRes.error.message ?? "").toLowerCase();
    if (msg.includes("job_customer") || msg.includes("person_involved")) {
      mistakeRes = await db
        .from("workforce_mistakes")
        .select(basicSelect)
        .eq("organization_id", organizationId)
        .eq("week_start", weekStart)
        .not("section_id", "is", null)
        .order("occurred_at", { ascending: false });
    }
  }

  if (mistakeRes.error && !isMissingTableError(mistakeRes.error)) throw mistakeRes.error;
  mistakeData = mistakeRes.error ? [] : mistakeRes.data ?? [];

  const weekValues = await loadSectionWeekValues(db, organizationId, weekStart);

  const priorWeekStart = (() => {
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() - 7);
    return weekStartForIsoDate(d.toISOString().slice(0, 10), settings.week_start_day);
  })();

  const { data: priorSnapshots } = await db
    .from("workforce_section_week_snapshots")
    .select("section_id, letter_grade")
    .eq("organization_id", organizationId)
    .eq("week_start", priorWeekStart);

  const priorGrades = new Map();
  for (const s of priorSnapshots ?? []) {
    priorGrades.set(String(s.section_id), s.letter_grade);
  }

  const { rows, overallGrade } = buildScorecardRows(
    sections,
    mistakeData,
    weekValues,
    priorGrades
  );

  return {
    sections,
    rows,
    overallGrade,
    mistakes: mistakeData,
    weekValues
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {object} settings
 */
async function closePastSectionSnapshots(db, organizationId, settings) {
  const tz = settings.timezone;
  const weekStartDay = settings.week_start_day;
  const currentWeekStart = weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), weekStartDay);

  const sections = await loadGradingSections(db, organizationId);
  if (!sections.length) return;

  let mistakes = [];
  let weekValues = [];
  try {
    const [mistakeRes, valueRes] = await Promise.all([
      db
        .from("workforce_mistakes")
        .select("section_id, week_start")
        .eq("organization_id", organizationId)
        .lt("week_start", currentWeekStart)
        .not("section_id", "is", null),
      db
        .from("workforce_section_week_values")
        .select("section_id, week_start, actual_numeric, actual_display, value_payload")
        .eq("organization_id", organizationId)
        .lt("week_start", currentWeekStart)
    ]);
    if (mistakeRes.error && !isMissingTableError(mistakeRes.error)) throw mistakeRes.error;
    if (valueRes.error && !isMissingTableError(valueRes.error)) throw valueRes.error;
    mistakes = mistakeRes.data ?? [];
    weekValues = valueRes.data ?? [];
  } catch (e) {
    if (isMissingTableError(e)) return;
    throw e;
  }

  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));

  /** @type {Map<string, number>} */
  const countByKey = new Map();
  for (const m of mistakes) {
    const sid = String(m.section_id);
    const key = `${sid}::${m.week_start}`;
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  /** @type {Map<string, object>} */
  const valueByKey = new Map();
  for (const v of weekValues) {
    valueByKey.set(`${String(v.section_id)}::${v.week_start}`, v);
  }

  const keys = new Set([...countByKey.keys(), ...valueByKey.keys()]);
  for (const key of keys) {
    const [sectionId, weekStart] = key.split("::");
    const section = sectionById.get(sectionId);
    if (!section) continue;

    const { data: existing } = await db
      .from("workforce_section_week_snapshots")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("section_id", sectionId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (existing?.id) continue;

    const detailCount = countByKey.get(key) ?? 0;
    const rawValue = valueByKey.get(key);
    const weekValue = rawValue ? mapWeekValueRow(rawValue) : {};
    const incidentCount = effectiveIncidentCount(detailCount, weekValue);
    const letterGrade = computeSectionLetterGrade(section, incidentCount, weekValue);
    const actualDisplay = formatSectionActualDisplay(section, incidentCount, weekValue);

    await db.from("workforce_section_week_snapshots").insert({
      organization_id: organizationId,
      section_id: sectionId,
      week_start: weekStart,
      incident_count: incidentCount,
      actual_display: actualDisplay,
      letter_grade: letterGrade,
      goal_display: section.goalDisplay
    });
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {object} settings
 */
async function closePastWeekSnapshots(db, organizationId, settings) {
  const tz = settings.timezone;
  const weekStartDay = settings.week_start_day;
  const currentWeekStart = weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), weekStartDay);

  let mistakes;
  try {
    const { data, error } = await db
      .from("workforce_mistakes")
      .select("employee_user_id, employee_roster_id, week_start, severity, category_label")
      .eq("organization_id", organizationId)
      .lt("week_start", currentWeekStart);
    if (error) {
      if (isMissingTableError(error)) return;
      throw error;
    }
    mistakes = data ?? [];
  } catch (e) {
    if (isMissingTableError(e)) return;
    throw e;
  }

  /** @type {Map<string, Array<object>>} */
  const byKey = new Map();
  for (const m of mistakes) {
    const ref = workforceRefFromDbRow(m);
    if (!ref) continue;
    const key = `${workforceSnapshotKey(ref)}::${m.week_start}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(m);
  }

  for (const [key, rows] of byKey) {
    const [refKey, weekStart] = key.split("::");
    const [source, id] = refKey.split(":");
    const ref = { source, id };
    const cols = workforceRefToDbColumns(ref);

    let existingQ = db
      .from("workforce_grade_week_snapshots")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("week_start", weekStart);
    existingQ =
      ref.source === "roster"
        ? existingQ.eq("employee_roster_id", ref.id)
        : existingQ.eq("employee_user_id", ref.id);
    const { data: existing } = await existingQ.maybeSingle();
    if (existing?.id) continue;

    const count = rows.length;
    const weighted = sumWeightedMistakes(rows, settings.severity_weights);
    const letterGrade = computeLetterGrade(count, settings.grade_thresholds);
    await db.from("workforce_grade_week_snapshots").insert({
      organization_id: organizationId,
      ...cols,
      week_start: weekStart,
      mistake_count: count,
      weighted_mistake_count: weighted,
      letter_grade: letterGrade,
      category_breakdown: buildCategoryBreakdown(rows)
    });
  }
}

/**
 * @param {import("express").Express} app
 * @param {{
 *   requireAuth: Function,
 *   requireHeadAccess: Function,
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient
 * }} deps
 */
export function attachHrWorkforceRoutes(app, { requireAuth, requireHeadAccess, getSupabase }) {
  if (typeof requireAuth !== "function") throw new Error("attachHrWorkforceRoutes: requireAuth required");
  if (typeof requireHeadAccess !== "function") {
    throw new Error("attachHrWorkforceRoutes: requireHeadAccess required");
  }
  if (typeof getSupabase !== "function") throw new Error("attachHrWorkforceRoutes: getSupabase required");

  const headAccess = requireHeadAccess(HR_HEAD_SLUG, { getSupabase });
  const guard = [requireAuth(), headAccess];
  const db = () => getSupabase();

  async function orgId(req) {
    const ctx = await resolveOrganizationContext({ req, supabase: db(), mode: "authenticated" });
    return ctx.organizationId || null;
  }

  app.get("/api/hr/workforce/dashboard", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "Organization context required." });
      }

      const canManageCategories = isWorkforceManager(user);
      const settings = await loadGradeSettings(db(), organizationId);
      const sectionSeed = await ensureDefaultGradingSections(db(), organizationId, isMissingTableError);
      await closePastSectionSnapshots(db(), organizationId, settings);

      const weekStart = resolveRequestedWeekStart(req, settings);
      const { weekEnd, weekLabel } = scorecardWeekMeta(weekStart);
      const weekOptions = await buildScorecardWeekOptions(db(), organizationId, settings, isMissingTableError);

      let payload;
      try {
        payload = await loadScorecardPayload(db(), organizationId, weekStart, settings);
      } catch (e) {
        if (isMissingTableError(e)) {
          return res.json({
            ok: true,
            canManageCategories,
            gradingMode: "scorecard",
            weekStart,
            weekEnd,
            weekLabel,
            weekOptions,
            rows: [],
            overallGrade: null,
            schemaReady: false,
            warning: "Apply workforce quality SQL migrations to enable section grading."
          });
        }
        throw e;
      }

      if (!payload.sections.length) {
        return res.json({
          ok: true,
          canManageCategories,
          gradingMode: "scorecard",
          weekStart,
          weekEnd,
          weekLabel,
          weekOptions,
          rows: [],
          overallGrade: null,
          schemaReady: sectionSeed.schemaReady,
          warning: sectionSeed.schemaReady
            ? null
            : "Apply eliteos_workforce_quality_sections_v1.sql to enable section grading."
        });
      }

      res.json({
        ok: true,
        canManageCategories,
        gradingMode: "scorecard",
        schemaReady: sectionSeed.schemaReady,
        weekStart,
        weekEnd,
        weekLabel,
        weekOptions,
        overallGrade: payload.overallGrade,
        rows: payload.rows,
        mistakes: (payload.mistakes ?? []).map(mapIncidentRow)
      });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.load);
    }
  });

  app.get("/api/hr/workforce/mistakes", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const sectionId = pickStr(req.query?.section_id ?? req.query?.sectionId);
      const weekStartParam = pickStr(req.query?.week_start ?? req.query?.weekStart);

      const settings = await loadGradeSettings(db(), organizationId);
      const tz = settings.timezone;
      const weekStart =
        weekStartParam ||
        weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), settings.week_start_day);

      let q = db()
        .from("workforce_mistakes")
        .select(
          "id, section_id, logged_by_user_id, category_id, category_label, severity, description, job_customer, person_involved, occurred_at, week_start, created_at"
        )
        .eq("organization_id", organizationId)
        .eq("week_start", weekStart)
        .order("occurred_at", { ascending: false });

      if (sectionId) {
        q = q.eq("section_id", sectionId);
      } else {
        q = q.not("section_id", "is", null);
      }

      const { data, error } = await q;
      if (error) {
        if (isMissingTableError(error)) {
          return res.json({ ok: true, mistakes: [], schemaReady: false });
        }
        throw error;
      }

      res.json({ ok: true, weekStart, mistakes: data ?? [], schemaReady: true });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.load);
    }
  });

  app.post("/api/hr/workforce/mistakes", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const body = req.body ?? {};
      const sectionId = pickStr(body.section_id ?? body.sectionId);
      const severity = pickStr(body.severity) || "minor";
      const jobCustomer = pickStr(body.job_customer ?? body.jobCustomer) || null;
      const personInvolved = pickStr(body.person_involved ?? body.personInvolved) || null;
      const notes = pickStr(body.notes) || null;
      let description = pickStr(body.description) || null;
      const occurredAtRaw = pickStr(body.occurred_at ?? body.occurredAt);
      const employeeRef = parseEmployeeRefFromBody(body);

      if (!sectionId) {
        return res.status(400).json({ ok: false, error: "section_id is required." });
      }
      if (!["minor", "moderate", "major"].includes(severity)) {
        return res.status(400).json({ ok: false, error: "severity must be minor, moderate, or major." });
      }
      if (notes) {
        description = description ? `${description}\n\nNotes: ${notes}` : `Notes: ${notes}`;
      }

      const settings = await loadGradeSettings(db(), organizationId);
      const tz = settings.timezone;
      const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
      if (Number.isNaN(occurredAt.getTime())) {
        return res.status(400).json({ ok: false, error: "Invalid occurred_at." });
      }

      const occurredIso = todayIsoInTimezone(occurredAt, tz);
      const weekStart = weekStartForIsoDate(occurredIso, settings.week_start_day);

      const { data: section, error: sectionErr } = await db()
        .from("workforce_grading_sections")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("id", sectionId)
        .eq("is_active", true)
        .maybeSingle();
      if (sectionErr) {
        if (isMissingTableError(sectionErr)) {
          return res.status(503).json({
            ok: false,
            error: "Section grading tables not installed. Apply eliteos_workforce_quality_sections_v1.sql."
          });
        }
        throw sectionErr;
      }
      if (!section) {
        return res.status(404).json({ ok: false, error: "Grading section not found." });
      }

      const row = {
        organization_id: organizationId,
        section_id: sectionId,
        employee_user_id: null,
        employee_roster_id: null,
        logged_by_user_id: String(user.id),
        category_id: null,
        category_label: section.name,
        severity,
        job_customer: jobCustomer,
        person_involved: personInvolved,
        description,
        occurred_at: occurredAt.toISOString(),
        week_start: weekStart
      };

      if (employeeRef) {
        const cols = workforceRefToDbColumns(employeeRef);
        Object.assign(row, cols);
      }

      let insertResult = await db().from("workforce_mistakes").insert(row).select("*").single();
      if (insertResult.error) {
        const msg = String(insertResult.error.message ?? "").toLowerCase();
        if (msg.includes("job_customer") || msg.includes("person_involved")) {
          delete row.job_customer;
          delete row.person_involved;
          insertResult = await db().from("workforce_mistakes").insert(row).select("*").single();
        }
      }
      const { data, error } = insertResult;
      if (error) {
        if (isMissingTableError(error)) {
          return res.status(503).json({
            ok: false,
            error:
              "Workforce quality tables not installed. Apply eliteos_workforce_quality_v1.sql and eliteos_workforce_quality_sections_v1.sql."
          });
        }
        throw error;
      }

      await logAction({
        user,
        head: HR_HEAD_SLUG,
        actionType: "workforce_section_incident_logged",
        entityType: "workforce_mistake",
        entityId: data?.id,
        entityLabel: section.name,
        metadata: {
          section_id: sectionId,
          week_start: weekStart
        },
        req
      });

      res.status(201).json({ ok: true, mistake: data });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.save);
    }
  });

  app.get("/api/hr/workforce/mistakes/log", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const settings = await loadGradeSettings(db(), organizationId);
      const weekStart = resolveRequestedWeekStart(req, settings);
      const weekCount = Math.min(12, Math.max(1, Number(req.query?.weeks) || 8));

      try {
        const { weeks } = await loadMistakesLogWeeks(db(), organizationId, weekStart, settings, weekCount);
        res.json({
          ok: true,
          selectedWeekStart: weekStart,
          weeks,
          schemaReady: true
        });
      } catch (e) {
        if (isMissingTableError(e)) {
          return res.json({ ok: true, selectedWeekStart: weekStart, weeks: [], schemaReady: false });
        }
        throw e;
      }
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.load);
    }
  });

  app.patch("/api/hr/workforce/mistakes/:id", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const mistakeId = pickStr(req.params?.id);
      if (!mistakeId) return res.status(400).json({ ok: false, error: "Mistake id required." });

      const { data: existing, error: loadErr } = await db()
        .from("workforce_mistakes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", mistakeId)
        .maybeSingle();
      if (loadErr) {
        if (isMissingTableError(loadErr)) {
          return res.status(503).json({ ok: false, error: "Workforce quality tables not installed." });
        }
        throw loadErr;
      }
      if (!existing) return res.status(404).json({ ok: false, error: "Mistake not found." });

      const body = req.body ?? {};
      const settings = await loadGradeSettings(db(), organizationId);
      const tz = settings.timezone;

      /** @type {Record<string, unknown>} */
      const patch = { updated_at: new Date().toISOString() };

      if (body.section_id != null || body.sectionId != null) {
        const sectionId = pickStr(body.section_id ?? body.sectionId);
        if (!sectionId) return res.status(400).json({ ok: false, error: "Invalid section_id." });
        const { data: section, error: sectionErr } = await db()
          .from("workforce_grading_sections")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("id", sectionId)
          .eq("is_active", true)
          .maybeSingle();
        if (sectionErr) throw sectionErr;
        if (!section) return res.status(404).json({ ok: false, error: "Grading section not found." });
        patch.section_id = sectionId;
        patch.category_label = section.name;
      }

      if (body.severity != null) {
        const severity = pickStr(body.severity) || "minor";
        if (!["minor", "moderate", "major"].includes(severity)) {
          return res.status(400).json({ ok: false, error: "severity must be minor, moderate, or major." });
        }
        patch.severity = severity;
      }

      if (body.job_customer != null || body.jobCustomer != null) {
        patch.job_customer = pickStr(body.job_customer ?? body.jobCustomer) || null;
      }
      if (body.person_involved != null || body.personInvolved != null) {
        patch.person_involved = pickStr(body.person_involved ?? body.personInvolved) || null;
      }
      if (body.description != null) patch.description = pickStr(body.description) || null;

      if (body.notes != null) {
        const notes = pickStr(body.notes);
        if (notes) {
          const base = pickStr(body.description ?? existing.description);
          patch.description = base ? `${base}\n\nNotes: ${notes}` : `Notes: ${notes}`;
        }
      }

      if (body.occurred_at != null || body.occurredAt != null) {
        const occurredAtRaw = pickStr(body.occurred_at ?? body.occurredAt);
        const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date(existing.occurred_at);
        if (Number.isNaN(occurredAt.getTime())) {
          return res.status(400).json({ ok: false, error: "Invalid occurred_at." });
        }
        patch.occurred_at = occurredAt.toISOString();
        const occurredIso = todayIsoInTimezone(occurredAt, tz);
        patch.week_start = weekStartForIsoDate(occurredIso, settings.week_start_day);
      }

      let updateResult = await db()
        .from("workforce_mistakes")
        .update(patch)
        .eq("organization_id", organizationId)
        .eq("id", mistakeId)
        .select("*")
        .single();
      if (updateResult.error) {
        const msg = String(updateResult.error.message ?? "").toLowerCase();
        if (msg.includes("job_customer") || msg.includes("person_involved")) {
          delete patch.job_customer;
          delete patch.person_involved;
          updateResult = await db()
            .from("workforce_mistakes")
            .update(patch)
            .eq("organization_id", organizationId)
            .eq("id", mistakeId)
            .select("*")
            .single();
        }
      }
      const { data, error } = updateResult;
      if (error) throw error;

      await logAction({
        user,
        head: HR_HEAD_SLUG,
        actionType: "workforce_section_incident_updated",
        entityType: "workforce_mistake",
        entityId: mistakeId,
        entityLabel: data?.category_label ?? "Mistake",
        metadata: {
          section_id: data?.section_id,
          week_start: data?.week_start
        },
        req
      });

      res.json({ ok: true, mistake: data });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.save);
    }
  });

  app.delete("/api/hr/workforce/mistakes/:id", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const mistakeId = pickStr(req.params?.id);
      if (!mistakeId) return res.status(400).json({ ok: false, error: "Mistake id required." });

      const { data: existing, error: loadErr } = await db()
        .from("workforce_mistakes")
        .select("id, section_id, week_start, category_label")
        .eq("organization_id", organizationId)
        .eq("id", mistakeId)
        .maybeSingle();
      if (loadErr) {
        if (isMissingTableError(loadErr)) {
          return res.status(503).json({ ok: false, error: "Workforce quality tables not installed." });
        }
        throw loadErr;
      }
      if (!existing) return res.status(404).json({ ok: false, error: "Mistake not found." });

      const { error } = await db()
        .from("workforce_mistakes")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", mistakeId);
      if (error) throw error;

      await logAction({
        user,
        head: HR_HEAD_SLUG,
        actionType: "workforce_section_incident_deleted",
        entityType: "workforce_mistake",
        entityId: mistakeId,
        entityLabel: existing.category_label ?? "Mistake",
        metadata: {
          section_id: existing.section_id,
          week_start: existing.week_start
        },
        req
      });

      res.json({ ok: true, deleted: true, id: mistakeId });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.save);
    }
  });

  app.get("/api/hr/workforce/history", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const sectionId = pickStr(req.query?.section_id ?? req.query?.sectionId);
      const weeks = Math.min(52, Math.max(1, Number(req.query?.weeks) || 12));

      if (!sectionId) {
        return res.status(400).json({ ok: false, error: "section_id is required." });
      }

      await closePastSectionSnapshots(db(), organizationId, await loadGradeSettings(db(), organizationId));

      const { data, error } = await db()
        .from("workforce_section_week_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("section_id", sectionId)
        .order("week_start", { ascending: false })
        .limit(weeks);

      if (error) {
        if (isMissingTableError(error)) {
          return res.json({ ok: true, snapshots: [], schemaReady: false });
        }
        throw error;
      }

      const snapshots = (data ?? []).map((s) => ({
        ...s,
        weekLabel: formatWeekLabel(s.week_start, weekEndForWeekStart(s.week_start))
      }));

      res.json({ ok: true, sectionId, snapshots, schemaReady: true });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.load);
    }
  });

  app.get("/api/hr/workforce/sections", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      await ensureDefaultGradingSections(db(), organizationId, isMissingTableError);
      const sections = await loadGradingSections(db(), organizationId);

      res.json({ ok: true, sections, schemaReady: sections.length > 0 });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.load);
    }
  });

  app.post("/api/hr/workforce/sections/:id/value", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const sectionId = pickStr(req.params?.id);
      const body = req.body ?? {};
      const weekStartParam = pickStr(body.week_start ?? body.weekStart);

      if (!sectionId) {
        return res.status(400).json({ ok: false, error: "Section id required." });
      }

      const settings = await loadGradeSettings(db(), organizationId);
      const tz = settings.timezone;
      const weekStart =
        weekStartParam ||
        weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), settings.week_start_day);

      const { data: section, error: sectionErr } = await db()
        .from("workforce_grading_sections")
        .select("id, name, metric_kind, goal_numeric, goal_display, grading_enabled, unit_label, sort_order")
        .eq("organization_id", organizationId)
        .eq("id", sectionId)
        .maybeSingle();
      if (sectionErr) throw sectionErr;
      if (!section) return res.status(404).json({ ok: false, error: "Section not found." });

      const mapped = mapSectionRow(section);
      const existingWeekValue = await loadExistingWeekValue(db(), organizationId, sectionId, weekStart);
      const existingPayload =
        existingWeekValue?.valuePayload && typeof existingWeekValue.valuePayload === "object"
          ? existingWeekValue.valuePayload
          : {};
      const { payload, actualNumeric, actualDisplay } = buildMetricValueFromBody(mapped, body);
      const mergedPayload = { ...existingPayload, ...payload };

      const row = {
        organization_id: organizationId,
        section_id: sectionId,
        week_start: weekStart,
        actual_numeric: actualNumeric,
        actual_display: actualDisplay,
        value_payload: mergedPayload,
        logged_by_user_id: String(user.id),
        updated_at: new Date().toISOString()
      };

      let upsertResult = await db()
        .from("workforce_section_week_values")
        .upsert(row, { onConflict: "organization_id,section_id,week_start" })
        .select("*")
        .single();
      if (upsertResult.error) {
        const msg = String(upsertResult.error.message ?? "").toLowerCase();
        if (msg.includes("value_payload")) {
          delete row.value_payload;
          upsertResult = await db()
            .from("workforce_section_week_values")
            .upsert(row, { onConflict: "organization_id,section_id,week_start" })
            .select("*")
            .single();
        }
      }
      const { data, error } = upsertResult;
      if (error) {
        if (isMissingTableError(error)) {
          return res.status(503).json({
            ok: false,
            error: "Apply eliteos_workforce_quality_sections_v1.sql to record section values."
          });
        }
        throw error;
      }

      res.json({ ok: true, value: data });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.save);
    }
  });

  app.post("/api/hr/workforce/sections/:id/quick-count", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const sectionId = pickStr(req.params?.id);
      const body = req.body ?? {};
      const weekStartParam = pickStr(body.week_start ?? body.weekStart);
      const countRaw = body.count ?? body.quick_count ?? body.quickCount;

      if (!sectionId) {
        return res.status(400).json({ ok: false, error: "Section id required." });
      }
      if (countRaw == null || countRaw === "") {
        return res.status(400).json({ ok: false, error: "count is required." });
      }
      const count = Math.max(0, Math.round(Number(countRaw)));
      if (!Number.isFinite(count)) {
        return res.status(400).json({ ok: false, error: "count must be a number." });
      }

      const settings = await loadGradeSettings(db(), organizationId);
      const tz = settings.timezone;
      const weekStart =
        weekStartParam ||
        weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), settings.week_start_day);

      const { data: section, error: sectionErr } = await db()
        .from("workforce_grading_sections")
        .select("id, name, metric_kind, goal_numeric, goal_display, grading_enabled, unit_label, sort_order")
        .eq("organization_id", organizationId)
        .eq("id", sectionId)
        .maybeSingle();
      if (sectionErr) throw sectionErr;
      if (!section) return res.status(404).json({ ok: false, error: "Section not found." });

      const mapped = mapSectionRow(section);
      if (mapped.metricKind !== "count") {
        return res.status(400).json({ ok: false, error: "Quick count is only available for count-based sections." });
      }

      const existingWeekValue = await loadExistingWeekValue(db(), organizationId, sectionId, weekStart);
      const existingPayload =
        existingWeekValue?.valuePayload && typeof existingWeekValue.valuePayload === "object"
          ? existingWeekValue.valuePayload
          : {};
      const mergedPayload = { ...existingPayload, quick_count: count };
      const weekValue = { valuePayload: mergedPayload };
      const actualDisplay = formatSectionActualDisplay(mapped, effectiveIncidentCount(0, weekValue), weekValue);

      const row = {
        organization_id: organizationId,
        section_id: sectionId,
        week_start: weekStart,
        actual_numeric: count,
        actual_display: actualDisplay,
        value_payload: mergedPayload,
        logged_by_user_id: String(user.id),
        updated_at: new Date().toISOString()
      };

      let upsertResult = await db()
        .from("workforce_section_week_values")
        .upsert(row, { onConflict: "organization_id,section_id,week_start" })
        .select("*")
        .single();
      if (upsertResult.error) {
        const msg = String(upsertResult.error.message ?? "").toLowerCase();
        if (msg.includes("value_payload")) {
          delete row.value_payload;
          upsertResult = await db()
            .from("workforce_section_week_values")
            .upsert(row, { onConflict: "organization_id,section_id,week_start" })
            .select("*")
            .single();
        }
      }
      const { data, error } = upsertResult;
      if (error) {
        if (isMissingTableError(error)) {
          return res.status(503).json({
            ok: false,
            error: "Apply eliteos_workforce_quality_sections_v1.sql to record section values."
          });
        }
        throw error;
      }

      await logAction({
        user,
        head: HR_HEAD_SLUG,
        actionType: "workforce_section_quick_count_saved",
        entityType: "workforce_section_week_values",
        entityId: sectionId,
        entityLabel: mapped.name,
        metadata: {
          section_id: sectionId,
          week_start: weekStart,
          quick_count: count
        },
        req
      });

      res.json({ ok: true, value: data, quickCount: count });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.save);
    }
  });

  app.post("/api/hr/workforce/report/generate", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const settings = await loadGradeSettings(db(), organizationId);
      await ensureDefaultGradingSections(db(), organizationId, isMissingTableError);
      const weekStart = resolveRequestedWeekStart(req, settings);
      const { weekEnd, weekLabel } = scorecardWeekMeta(weekStart);

      const payload = await loadScorecardPayload(db(), organizationId, weekStart, settings);
      if (!payload.rows.length) {
        return res.status(400).json({ ok: false, error: "No grading sections configured for this organization." });
      }

      await upsertWeekSnapshots(db(), organizationId, weekStart, payload.rows);
      const mistakesSummary = (payload.mistakes ?? []).map((m) => {
        const section = payload.sections.find((s) => s.sectionId === String(m.section_id));
        return mapIncidentRow({ ...m, section_name: section?.name ?? null });
      });
      const reportText = buildScorecardReportText(payload.rows, {
        weekLabel,
        overallGrade: payload.overallGrade,
        mistakesSummary
      });
      const reportHtml = buildScorecardReportHtml(payload.rows, {
        weekLabel,
        overallGrade: payload.overallGrade,
        mistakesSummary
      });

      await logAction({
        user,
        head: HR_HEAD_SLUG,
        actionType: "workforce_weekly_report_generated",
        entityType: "workforce_section_week_snapshots",
        entityId: weekStart,
        entityLabel: weekLabel,
        metadata: {
          week_start: weekStart,
          overall_grade: payload.overallGrade,
          section_count: payload.rows.length
        },
        req
      });

      res.json({
        ok: true,
        frozen: true,
        weekStart,
        weekEnd,
        weekLabel,
        overallGrade: payload.overallGrade,
        reportText,
        reportHtml,
        rows: payload.rows
      });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.save);
    }
  });

  app.get("/api/hr/workforce/categories", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      await ensureDefaultCategory(db(), organizationId);

      const { data, error } = await db()
        .from("workforce_mistake_categories")
        .select("id, name, is_active, sort_order, created_at, updated_at")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        if (isMissingTableError(error)) {
          return res.json({ ok: true, categories: [], schemaReady: false });
        }
        throw error;
      }

      res.json({ ok: true, categories: data ?? [], schemaReady: true });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.load);
    }
  });

  app.post("/api/hr/workforce/categories", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      if (!isWorkforceManager(req.user)) {
        return res.status(403).json({ ok: false, error: "Only managers may manage categories." });
      }

      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const name = pickStr(req.body?.name);
      if (!name) return res.status(400).json({ ok: false, error: "name is required." });

      const sortOrder = Number(req.body?.sort_order ?? req.body?.sortOrder ?? 100);

      const { data, error } = await db()
        .from("workforce_mistake_categories")
        .insert({
          organization_id: organizationId,
          name,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
          is_active: true
        })
        .select("*")
        .single();

      if (error) throw error;
      res.status(201).json({ ok: true, category: data });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.categories);
    }
  });

  app.patch("/api/hr/workforce/categories/:id", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      if (!isWorkforceManager(req.user)) {
        return res.status(403).json({ ok: false, error: "Only managers may manage categories." });
      }

      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const id = pickStr(req.params?.id);
      if (!id) return res.status(400).json({ ok: false, error: "Category id required." });

      /** @type {Record<string, unknown>} */
      const patch = { updated_at: new Date().toISOString() };
      if (req.body?.name != null) patch.name = pickStr(req.body.name);
      if (req.body?.is_active != null) patch.is_active = Boolean(req.body.is_active);
      if (req.body?.sort_order != null) patch.sort_order = Number(req.body.sort_order);

      const { data, error } = await db()
        .from("workforce_mistake_categories")
        .update(patch)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ ok: false, error: "Category not found." });
      res.json({ ok: true, category: data });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.categories);
    }
  });

  app.get("/api/hr/workforce/employees", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      await ensureTestRosterMembers(db(), organizationId);
      const team = await loadWorkforceTeam(db(), organizationId);

      res.json({
        ok: true,
        canManageCategories: isWorkforceManager(user),
        employees: team.map((m) => ({
          id: m.employeeId,
          employeeKey: m.employeeKey,
          employeeSource: m.employeeSource,
          fullName: m.fullName,
          email: m.email,
          role: m.role,
          jobTitle: m.jobTitle,
          department: m.department,
          isTest: m.isTest
        }))
      });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.load);
    }
  });
}
