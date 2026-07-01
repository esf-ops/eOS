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
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_SEVERITY_WEIGHTS,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEK_START_DAY,
  formatWeekLabel,
  gradeTrend,
  isWorkforceManager,
  sumWeightedMistakes,
  todayIsoInTimezone,
  weekEndForWeekStart,
  weekStartForIsoDate
} from "./workforceGradeEngine.js";
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
      await ensureDefaultCategory(db(), organizationId);
      await ensureTestRosterMembers(db(), organizationId);
      await closePastWeekSnapshots(db(), organizationId, settings);

      const tz = settings.timezone;
      const weekStartDay = settings.week_start_day;
      const currentWeekStart = weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), weekStartDay);
      const currentWeekEnd = weekEndForWeekStart(currentWeekStart);

      const team = await loadWorkforceTeam(db(), organizationId);
      const teamKeys = new Set(team.map((m) => m.employeeKey));

      if (!team.length) {
        return res.json({
          ok: true,
          canManageCategories,
          weekStart: currentWeekStart,
          weekEnd: currentWeekEnd,
          weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
          rows: [],
          schemaReady: true
        });
      }

      let currentMistakes = [];
      try {
        const { data, error } = await db()
          .from("workforce_mistakes")
          .select(
            "id, employee_user_id, employee_roster_id, severity, category_label, occurred_at, description"
          )
          .eq("organization_id", organizationId)
          .eq("week_start", currentWeekStart);
        if (error) {
          if (isMissingTableError(error)) {
            return res.json({
              ok: true,
              canManageCategories,
              weekStart: currentWeekStart,
              weekEnd: currentWeekEnd,
              weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
              rows: team.map((m) => ({
                employeeKey: m.employeeKey,
                employeeId: m.employeeId,
                employeeSource: m.employeeSource,
                fullName: m.fullName,
                email: m.email,
                role: m.role,
                jobTitle: m.jobTitle,
                department: m.department,
                isTest: m.isTest,
                letterGrade: "A",
                mistakeCount: 0,
                weightedMistakeCount: 0,
                priorLetterGrade: null,
                trend: "neutral",
                recentMistakes: []
              })),
              schemaReady: false,
              warning:
                "Apply eliteos_workforce_quality_v1.sql and eliteos_workforce_quality_roster_v1.sql to persist mistakes."
            });
          }
          throw error;
        }
        currentMistakes = (data ?? []).filter((m) => {
          const ref = workforceRefFromDbRow(m);
          return ref && teamKeys.has(workforceSnapshotKey(ref));
        });
      } catch (e) {
        if (isMissingTableError(e)) {
          return res.json({
            ok: true,
            canManageCategories,
            weekStart: currentWeekStart,
            weekEnd: currentWeekEnd,
            weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
            rows: [],
            schemaReady: false,
            warning: "Apply workforce quality SQL migrations to enable grading."
          });
        }
        throw e;
      }

      /** @type {Map<string, object[]>} */
      const mistakesByKey = new Map();
      for (const m of currentMistakes) {
        const ref = workforceRefFromDbRow(m);
        if (!ref) continue;
        const k = workforceSnapshotKey(ref);
        if (!mistakesByKey.has(k)) mistakesByKey.set(k, []);
        mistakesByKey.get(k).push(m);
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
        .from("workforce_grade_week_snapshots")
        .select("employee_user_id, employee_roster_id, letter_grade")
        .eq("organization_id", organizationId)
        .eq("week_start", priorWeekStart);
      if (!snapErr) priorSnapshots = snapData ?? [];

      const priorByKey = new Map();
      for (const s of priorSnapshots) {
        const ref = workforceRefFromDbRow(s);
        if (ref) priorByKey.set(workforceSnapshotKey(ref), s.letter_grade);
      }

      const rows = team.map((m) => {
        const mistakes = mistakesByKey.get(m.employeeKey) ?? [];
        const mistakeCount = mistakes.length;
        const letterGrade = computeLetterGrade(mistakeCount, settings.grade_thresholds);
        const priorGrade = priorByKey.get(m.employeeKey) ?? null;
        return {
          employeeKey: m.employeeKey,
          employeeId: m.employeeId,
          employeeSource: m.employeeSource,
          fullName: m.fullName,
          email: m.email,
          role: m.role,
          jobTitle: m.jobTitle,
          department: m.department,
          isTest: m.isTest,
          letterGrade,
          mistakeCount,
          weightedMistakeCount: sumWeightedMistakes(mistakes, settings.severity_weights),
          priorLetterGrade: priorGrade,
          trend: gradeTrend(letterGrade, priorGrade),
          recentMistakes: mistakes.slice(0, 5)
        };
      });

      rows.sort((a, b) => {
        const gradeOrder = { F: 0, D: 1, C: 2, B: 3, A: 4 };
        const ga = gradeOrder[a.letterGrade] ?? -1;
        const gb = gradeOrder[b.letterGrade] ?? -1;
        if (ga !== gb) return ga - gb;
        return b.mistakeCount - a.mistakeCount;
      });

      res.json({
        ok: true,
        canManageCategories,
        schemaReady: true,
        weekStart: currentWeekStart,
        weekEnd: currentWeekEnd,
        weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
        gradeThresholds: settings.grade_thresholds,
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

      const employeeKey = pickStr(req.query?.employee_key ?? req.query?.employeeKey ?? req.query?.employee_id);
      const weekStartParam = pickStr(req.query?.week_start ?? req.query?.weekStart);

      const settings = await loadGradeSettings(db(), organizationId);
      const tz = settings.timezone;
      const weekStart =
        weekStartParam ||
        weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), settings.week_start_day);

      let q = db()
        .from("workforce_mistakes")
        .select(
          "id, employee_user_id, employee_roster_id, logged_by_user_id, category_id, category_label, severity, description, occurred_at, week_start, created_at"
        )
        .eq("organization_id", organizationId)
        .eq("week_start", weekStart)
        .order("occurred_at", { ascending: false });

      const parsed = employeeKey ? parseWorkforceEmployeeKey(employeeKey) : null;
      if (parsed) {
        const cols = workforceRefToDbColumns(parsed);
        q =
          parsed.source === "roster"
            ? q.eq("employee_roster_id", parsed.id)
            : q.eq("employee_user_id", parsed.id);
        void cols;
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
      const employeeRef = parseEmployeeRefFromBody(body);
      const categoryId = pickStr(body.category_id ?? body.categoryId) || null;
      let categoryLabel = pickStr(body.category_label ?? body.categoryLabel);
      const severity = pickStr(body.severity) || "minor";
      const description = pickStr(body.description) || null;
      const occurredAtRaw = pickStr(body.occurred_at ?? body.occurredAt);

      if (!employeeRef) {
        return res.status(400).json({ ok: false, error: "employee_key or employee_id is required." });
      }
      if (!["minor", "moderate", "major"].includes(severity)) {
        return res.status(400).json({ ok: false, error: "severity must be minor, moderate, or major." });
      }

      const settings = await loadGradeSettings(db(), organizationId);
      const tz = settings.timezone;
      const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
      if (Number.isNaN(occurredAt.getTime())) {
        return res.status(400).json({ ok: false, error: "Invalid occurred_at." });
      }

      const occurredIso = todayIsoInTimezone(occurredAt, tz);
      const weekStart = weekStartForIsoDate(occurredIso, settings.week_start_day);

      if (categoryId) {
        const { data: cat } = await db()
          .from("workforce_mistake_categories")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("id", categoryId)
          .maybeSingle();
        if (cat?.name) categoryLabel = cat.name;
      }
      if (!categoryLabel) {
        await ensureDefaultCategory(db(), organizationId);
        categoryLabel = "Other";
      }

      const row = {
        organization_id: organizationId,
        ...workforceRefToDbColumns(employeeRef),
        logged_by_user_id: String(user.id),
        category_id: categoryId,
        category_label: categoryLabel,
        severity,
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
              "Workforce quality tables not installed. Apply eliteos_workforce_quality_v1.sql and eliteos_workforce_quality_roster_v1.sql."
          });
        }
        throw error;
      }

      await logAction({
        user,
        head: HR_HEAD_SLUG,
        actionType: "workforce_mistake_logged",
        entityType: "workforce_mistake",
        entityId: data?.id,
        entityLabel: categoryLabel,
        metadata: {
          employee_key: workforceSnapshotKey(employeeRef),
          severity,
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

      const employeeKey = pickStr(req.query?.employee_key ?? req.query?.employeeKey ?? req.query?.employee_id);
      const weeks = Math.min(52, Math.max(1, Number(req.query?.weeks) || 12));

      if (!employeeKey) {
        return res.status(400).json({ ok: false, error: "employee_key is required." });
      }

      const parsed = parseWorkforceEmployeeKey(employeeKey);
      if (!parsed) {
        return res.status(400).json({ ok: false, error: "Invalid employee_key." });
      }

      await closePastWeekSnapshots(db(), organizationId, await loadGradeSettings(db(), organizationId));

      let q = db()
        .from("workforce_grade_week_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .order("week_start", { ascending: false })
        .limit(weeks);

      q =
        parsed.source === "roster"
          ? q.eq("employee_roster_id", parsed.id)
          : q.eq("employee_user_id", parsed.id);

      const { data, error } = await q;
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

      res.json({ ok: true, employeeKey, snapshots, schemaReady: true });
    } catch (e) {
      respondServerError(res, e, HR_CLIENT_ERRORS.load);
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
