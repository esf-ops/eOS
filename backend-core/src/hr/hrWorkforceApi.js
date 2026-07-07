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
  sumWeightedMistakes,
  todayIsoInTimezone,
  weekEndForWeekStart,
  weekStartForIsoDate
} from "./workforceGradeEngine.js";
import { ensureDefaultGradingSections, mapSectionRow } from "./workforceGradingSections.js";
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
    const { data, error } = await db
      .from("workforce_section_week_values")
      .select("section_id, actual_numeric, actual_display")
      .eq("organization_id", organizationId)
      .eq("week_start", weekStart);
    if (error) {
      if (isMissingTableError(error)) return new Map();
      throw error;
    }
    const map = new Map();
    for (const row of data ?? []) {
      map.set(String(row.section_id), {
        actualNumeric: row.actual_numeric != null ? Number(row.actual_numeric) : null,
        actualDisplay: row.actual_display ?? null
      });
    }
    return map;
  } catch (e) {
    if (isMissingTableError(e)) return new Map();
    throw e;
  }
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
        .select("section_id, week_start, actual_numeric, actual_display")
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

    const incidentCount = countByKey.get(key) ?? 0;
    const rawValue = valueByKey.get(key);
    const weekValue = rawValue
      ? {
          actualNumeric: rawValue.actual_numeric != null ? Number(rawValue.actual_numeric) : null,
          actualDisplay: rawValue.actual_display ?? null
        }
      : {};
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

      const tz = settings.timezone;
      const weekStartDay = settings.week_start_day;
      const currentWeekStart = weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), weekStartDay);
      const currentWeekEnd = weekEndForWeekStart(currentWeekStart);

      const sections = await loadGradingSections(db(), organizationId);
      if (!sections.length) {
        return res.json({
          ok: true,
          canManageCategories,
          gradingMode: "sections",
          weekStart: currentWeekStart,
          weekEnd: currentWeekEnd,
          weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
          rows: [],
          schemaReady: sectionSeed.schemaReady,
          warning: sectionSeed.schemaReady
            ? null
            : "Apply eliteos_workforce_quality_sections_v1.sql to enable section grading."
        });
      }

      let currentMistakes = [];
      try {
        const { data, error } = await db()
          .from("workforce_mistakes")
          .select("id, section_id, severity, category_label, occurred_at, description")
          .eq("organization_id", organizationId)
          .eq("week_start", currentWeekStart)
          .not("section_id", "is", null);
        if (error) {
          if (isMissingTableError(error)) {
            return res.json({
              ok: true,
              canManageCategories,
              gradingMode: "sections",
              weekStart: currentWeekStart,
              weekEnd: currentWeekEnd,
              weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
              rows: sections.map((s) => ({
                ...s,
                incidentCount: 0,
                actualDisplay: formatSectionActualDisplay(s, 0),
                letterGrade: s.gradingEnabled ? computeSectionLetterGrade(s, 0) : null,
                priorLetterGrade: null,
                trend: "neutral"
              })),
              schemaReady: false,
              warning: "Apply workforce quality SQL migrations to persist section incidents."
            });
          }
          throw error;
        }
        currentMistakes = data ?? [];
      } catch (e) {
        if (isMissingTableError(e)) {
          return res.json({
            ok: true,
            canManageCategories,
            gradingMode: "sections",
            weekStart: currentWeekStart,
            weekEnd: currentWeekEnd,
            weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
            rows: [],
            schemaReady: false,
            warning: "Apply workforce quality SQL migrations to enable section grading."
          });
        }
        throw e;
      }

      const weekValues = await loadSectionWeekValues(db(), organizationId, currentWeekStart);

      /** @type {Map<string, object[]>} */
      const incidentsBySection = new Map();
      for (const m of currentMistakes) {
        const sid = String(m.section_id);
        if (!incidentsBySection.has(sid)) incidentsBySection.set(sid, []);
        incidentsBySection.get(sid).push(m);
      }

      const priorWeekStart = weekStartForIsoDate(
        (() => {
          const d = new Date(`${currentWeekStart}T12:00:00`);
          d.setDate(d.getDate() - 7);
          return d.toISOString().slice(0, 10);
        })(),
        weekStartDay
      );

      let priorSnapshots = [];
      const { data: snapData, error: snapErr } = await db()
        .from("workforce_section_week_snapshots")
        .select("section_id, letter_grade")
        .eq("organization_id", organizationId)
        .eq("week_start", priorWeekStart);
      if (!snapErr) priorSnapshots = snapData ?? [];

      const priorBySection = new Map();
      for (const s of priorSnapshots) {
        priorBySection.set(String(s.section_id), s.letter_grade);
      }

      const rows = sections.map((section) => {
        const incidents = incidentsBySection.get(section.sectionId) ?? [];
        const incidentCount = incidents.length;
        const weekValue = weekValues.get(section.sectionId) ?? {};
        const letterGrade = computeSectionLetterGrade(section, incidentCount, weekValue);
        const priorGrade = priorBySection.get(section.sectionId) ?? null;
        return {
          ...section,
          incidentCount,
          actualDisplay: formatSectionActualDisplay(section, incidentCount, weekValue),
          letterGrade,
          priorLetterGrade: priorGrade,
          trend: letterGrade ? gradeTrend(letterGrade, priorGrade) : "neutral",
          recentIncidents: incidents.slice(0, 5)
        };
      });

      rows.sort((a, b) => {
        const gradeOrder = { F: 0, D: 1, C: 2, B: 3, A: 4 };
        const ga = a.letterGrade ? (gradeOrder[a.letterGrade] ?? -1) : 99;
        const gb = b.letterGrade ? (gradeOrder[b.letterGrade] ?? -1) : 99;
        if (ga !== gb) return ga - gb;
        return (b.incidentCount ?? 0) - (a.incidentCount ?? 0);
      });

      res.json({
        ok: true,
        canManageCategories,
        gradingMode: "sections",
        schemaReady: sectionSeed.schemaReady,
        weekStart: currentWeekStart,
        weekEnd: currentWeekEnd,
        weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
        rows
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
          "id, section_id, logged_by_user_id, category_id, category_label, severity, description, occurred_at, week_start, created_at"
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
      const description = pickStr(body.description) || null;
      const occurredAtRaw = pickStr(body.occurred_at ?? body.occurredAt);

      if (!sectionId) {
        return res.status(400).json({ ok: false, error: "section_id is required." });
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
        severity: "minor",
        description,
        occurred_at: occurredAt.toISOString(),
        week_start: weekStart
      };

      const { data, error } = await db().from("workforce_mistakes").insert(row).select("*").single();
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
      const actualNumericRaw = body.actual_numeric ?? body.actualNumeric;
      const actualDisplay = pickStr(body.actual_display ?? body.actualDisplay) || null;
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
        .select("id, name, metric_kind, goal_numeric, goal_display, grading_enabled, unit_label")
        .eq("organization_id", organizationId)
        .eq("id", sectionId)
        .maybeSingle();
      if (sectionErr) throw sectionErr;
      if (!section) return res.status(404).json({ ok: false, error: "Section not found." });

      const actualNumeric =
        actualNumericRaw != null && actualNumericRaw !== "" ? Number(actualNumericRaw) : null;
      if (actualNumericRaw != null && actualNumericRaw !== "" && !Number.isFinite(actualNumeric)) {
        return res.status(400).json({ ok: false, error: "actual_numeric must be a number." });
      }

      const mapped = mapSectionRow(section);
      const display =
        actualDisplay ||
        formatSectionActualDisplay(mapped, 0, {
          actualNumeric,
          actualDisplay: null
        });

      const row = {
        organization_id: organizationId,
        section_id: sectionId,
        week_start: weekStart,
        actual_numeric: actualNumeric,
        actual_display: display,
        logged_by_user_id: String(user.id),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await db()
        .from("workforce_section_week_values")
        .upsert(row, { onConflict: "organization_id,section_id,week_start" })
        .select("*")
        .single();
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
