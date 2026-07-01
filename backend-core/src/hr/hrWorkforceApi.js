/**
 * eliteOS HR Head — Workforce Quality API (supervisor-logged mistakes + weekly grades).
 *
 * Routes:
 *   GET  /api/hr/workforce/dashboard
 *   GET  /api/hr/workforce/mistakes
 *   POST /api/hr/workforce/mistakes
 *   GET  /api/hr/workforce/history
 *   GET  /api/hr/workforce/categories
 *   POST /api/hr/workforce/categories
 *   PATCH /api/hr/workforce/categories/:id
 *
 * Auth: requireAuth() + requireHeadAccess("hr")
 * Managers (admin, executive, hr, super_admin) log mistakes and see all employees.
 * Other users see only their own grades and history.
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
import { resolveOrganizationContext } from "../organizations/organizationContext.js";

export const HR_HEAD_SLUG = "hr";

const jsonParser = express.json({ limit: "256kb" });

function jsonNoStore(res) {
  res.set("Cache-Control", "no-store");
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
      .select("employee_user_id, week_start, severity, category_label")
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
    const key = `${m.employee_user_id}::${m.week_start}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(m);
  }

  for (const [key, rows] of byKey) {
    const [employeeUserId, weekStart] = key.split("::");
    const { data: existing } = await db
      .from("workforce_grade_week_snapshots")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("employee_user_id", employeeUserId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (existing?.id) continue;

    const count = rows.length;
    const weighted = sumWeightedMistakes(rows, settings.severity_weights);
    const letterGrade = computeLetterGrade(count, settings.grade_thresholds);
    await db.from("workforce_grade_week_snapshots").insert({
      organization_id: organizationId,
      employee_user_id: employeeUserId,
      week_start: weekStart,
      mistake_count: count,
      weighted_mistake_count: weighted,
      letter_grade: letterGrade,
      category_breakdown: buildCategoryBreakdown(rows)
    });
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string|null} filterEmployeeId
 */
async function loadActiveEmployees(db, organizationId, filterEmployeeId = null) {
  let q = db
    .from("user_profiles")
    .select("id, full_name, email, role, job_title, department, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (filterEmployeeId) q = q.eq("id", filterEmployeeId);
  else q = q.eq("organization_id", organizationId);

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return data ?? [];
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

  async function orgContext(req) {
    return resolveOrganizationContext({ req, supabase: db(), mode: "authenticated" });
  }

  async function orgId(req) {
    const ctx = await orgContext(req);
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

      const manager = isWorkforceManager(user);
      const settings = await loadGradeSettings(db(), organizationId);
      await ensureDefaultCategory(db(), organizationId);
      await closePastWeekSnapshots(db(), organizationId, settings);

      const tz = settings.timezone;
      const weekStartDay = settings.week_start_day;
      const currentWeekStart = weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), weekStartDay);
      const currentWeekEnd = weekEndForWeekStart(currentWeekStart);

      const employees = await loadActiveEmployees(
        db(),
        organizationId,
        manager ? null : String(user?.id ?? "")
      );

      const employeeIds = employees.map((e) => e.id).filter(Boolean);
      if (!employeeIds.length) {
        return res.json({
          ok: true,
          manager,
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
          .select("id, employee_user_id, severity, category_label, occurred_at, description")
          .eq("organization_id", organizationId)
          .eq("week_start", currentWeekStart)
          .in("employee_user_id", employeeIds);
        if (error) {
          if (isMissingTableError(error)) {
            return res.json({
              ok: true,
              manager,
              weekStart: currentWeekStart,
              weekEnd: currentWeekEnd,
              weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
              rows: [],
              schemaReady: false,
              warning: "Apply backend-core/supabase/eliteos_workforce_quality_v1.sql to enable grading."
            });
          }
          throw error;
        }
        currentMistakes = data ?? [];
      } catch (e) {
        if (isMissingTableError(e)) {
          return res.json({
            ok: true,
            manager,
            weekStart: currentWeekStart,
            weekEnd: currentWeekEnd,
            weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
            rows: [],
            schemaReady: false,
            warning: "Apply backend-core/supabase/eliteos_workforce_quality_v1.sql to enable grading."
          });
        }
        throw e;
      }

      /** @type {Map<string, object[]>} */
      const mistakesByEmployee = new Map();
      for (const m of currentMistakes) {
        const uid = String(m.employee_user_id);
        if (!mistakesByEmployee.has(uid)) mistakesByEmployee.set(uid, []);
        mistakesByEmployee.get(uid).push(m);
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
        .select("employee_user_id, letter_grade")
        .eq("organization_id", organizationId)
        .eq("week_start", priorWeekStart)
        .in("employee_user_id", employeeIds);
      if (!snapErr) priorSnapshots = snapData ?? [];

      const priorByEmployee = new Map(priorSnapshots.map((s) => [String(s.employee_user_id), s.letter_grade]));

      const rows = employees.map((emp) => {
        const uid = String(emp.id);
        const mistakes = mistakesByEmployee.get(uid) ?? [];
        const mistakeCount = mistakes.length;
        const letterGrade = computeLetterGrade(mistakeCount, settings.grade_thresholds);
        const priorGrade = priorByEmployee.get(uid) ?? null;
        return {
          employeeId: uid,
          fullName: pickStr(emp.full_name) || pickStr(emp.email) || uid,
          email: pickStr(emp.email),
          role: pickStr(emp.role),
          jobTitle: pickStr(emp.job_title),
          department: pickStr(emp.department),
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
        manager,
        schemaReady: true,
        weekStart: currentWeekStart,
        weekEnd: currentWeekEnd,
        weekLabel: formatWeekLabel(currentWeekStart, currentWeekEnd),
        gradeThresholds: settings.grade_thresholds,
        rows
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/hr/workforce/mistakes", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const manager = isWorkforceManager(user);
      const employeeId = pickStr(req.query?.employee_id ?? req.query?.employeeId);
      const weekStartParam = pickStr(req.query?.week_start ?? req.query?.weekStart);

      const settings = await loadGradeSettings(db(), organizationId);
      const tz = settings.timezone;
      const weekStart =
        weekStartParam ||
        weekStartForIsoDate(todayIsoInTimezone(new Date(), tz), settings.week_start_day);

      const targetEmployeeId = manager ? employeeId || null : String(user?.id ?? "");
      if (!manager && employeeId && employeeId !== targetEmployeeId) {
        return res.status(403).json({ ok: false, error: "You may only view your own mistakes." });
      }

      let q = db()
        .from("workforce_mistakes")
        .select(
          "id, employee_user_id, logged_by_user_id, category_id, category_label, severity, description, occurred_at, week_start, created_at"
        )
        .eq("organization_id", organizationId)
        .eq("week_start", weekStart)
        .order("occurred_at", { ascending: false });

      if (targetEmployeeId) q = q.eq("employee_user_id", targetEmployeeId);

      const { data, error } = await q;
      if (error) {
        if (isMissingTableError(error)) {
          return res.json({ ok: true, mistakes: [], schemaReady: false });
        }
        throw error;
      }

      res.json({ ok: true, weekStart, mistakes: data ?? [], schemaReady: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/hr/workforce/mistakes", ...guard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      if (!isWorkforceManager(user)) {
        return res.status(403).json({ ok: false, error: "Only supervisors and managers may log mistakes." });
      }

      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const body = req.body ?? {};
      const employeeUserId = pickStr(body.employee_user_id ?? body.employeeUserId);
      const categoryId = pickStr(body.category_id ?? body.categoryId) || null;
      let categoryLabel = pickStr(body.category_label ?? body.categoryLabel);
      const severity = pickStr(body.severity) || "minor";
      const description = pickStr(body.description) || null;
      const occurredAtRaw = pickStr(body.occurred_at ?? body.occurredAt);

      if (!employeeUserId) {
        return res.status(400).json({ ok: false, error: "employee_user_id is required." });
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
        employee_user_id: employeeUserId,
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
            error: "Workforce quality tables not installed. Apply eliteos_workforce_quality_v1.sql."
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
          employee_user_id: employeeUserId,
          severity,
          week_start: weekStart
        },
        req
      });

      res.status(201).json({ ok: true, mistake: data });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/hr/workforce/history", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const manager = isWorkforceManager(user);
      const employeeId = pickStr(req.query?.employee_id ?? req.query?.employeeId);
      const weeks = Math.min(52, Math.max(1, Number(req.query?.weeks) || 12));

      const targetEmployeeId = manager ? employeeId || String(user?.id ?? "") : String(user?.id ?? "");
      if (!targetEmployeeId) {
        return res.status(400).json({ ok: false, error: "employee_id required." });
      }
      if (!manager && employeeId && employeeId !== targetEmployeeId) {
        return res.status(403).json({ ok: false, error: "You may only view your own history." });
      }

      await closePastWeekSnapshots(db(), organizationId, await loadGradeSettings(db(), organizationId));

      const { data, error } = await db()
        .from("workforce_grade_week_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("employee_user_id", targetEmployeeId)
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

      res.json({ ok: true, employeeId: targetEmployeeId, snapshots, schemaReady: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
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
      res.status(500).json({ ok: false, error: String(e?.message || e) });
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
      res.status(500).json({ ok: false, error: String(e?.message || e) });
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
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/hr/workforce/employees", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const user = req.user;
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });

      const manager = isWorkforceManager(user);
      const employees = await loadActiveEmployees(
        db(),
        organizationId,
        manager ? null : String(user?.id ?? "")
      );

      res.json({
        ok: true,
        manager,
        employees: employees.map((e) => ({
          id: e.id,
          fullName: pickStr(e.full_name) || pickStr(e.email),
          email: pickStr(e.email),
          role: pickStr(e.role),
          jobTitle: pickStr(e.job_title),
          department: pickStr(e.department)
        }))
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
