/**
 * Org Directory / Org Chart v1 — planning tool (does not change user_head_access).
 */

import express from "express";
import { logAction } from "../auth/auditLog.js";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import { buildEliteStarterChartData } from "./orgDirectoryStarter.js";

const jsonParser = express.json({ limit: "2mb" });

const RELATIONSHIP_TYPES = new Set(["direct", "dotted", "advisory", "partner_context"]);
const SEAT_STATUSES = new Set(["filled", "open", "future", "advisor"]);

function pickStr(v) {
  return v == null ? "" : String(v).trim();
}

function normalizeEmail(email) {
  return pickStr(email).toLowerCase();
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function emptyChartData() {
  return { departments: [], seats: [], relationships: [] };
}

function sanitizeChartData(input) {
  const raw = input && typeof input === "object" ? input : {};
  const departments = Array.isArray(raw.departments) ? raw.departments.slice(0, 200) : [];
  const seats = Array.isArray(raw.seats) ? raw.seats.slice(0, 500) : [];
  const relationships = Array.isArray(raw.relationships) ? raw.relationships.slice(0, 1000) : [];

  const deptOut = departments
    .map((d, i) => {
      if (!d || typeof d !== "object") return null;
      const id = pickStr(d.id) || `dept_${i + 1}`;
      return {
        id,
        name: pickStr(d.name) || "Department",
        color: pickStr(d.color) || "#64748b",
        sortOrder: Number.isFinite(Number(d.sortOrder)) ? Number(d.sortOrder) : i + 1
      };
    })
    .filter(Boolean);

  const seatOut = seats
    .map((s, i) => {
      if (!s || typeof s !== "object") return null;
      const id = pickStr(s.id) || `seat_${i + 1}`;
      const status = pickStr(s.status).toLowerCase();
      return {
        id,
        personName: pickStr(s.personName),
        title: pickStr(s.title) || "Role",
        departmentId: pickStr(s.departmentId) || null,
        branch: pickStr(s.branch),
        status: SEAT_STATUSES.has(status) ? status : "filled",
        notes: pickStr(s.notes).slice(0, 2000),
        recommendedHeads: Array.isArray(s.recommendedHeads)
          ? s.recommendedHeads.map((h) => pickStr(h)).filter(Boolean).slice(0, 30)
          : []
      };
    })
    .filter(Boolean);

  const seatIds = new Set(seatOut.map((s) => s.id));
  const relOut = relationships
    .map((r, i) => {
      if (!r || typeof r !== "object") return null;
      const fromSeatId = pickStr(r.fromSeatId);
      const toSeatId = pickStr(r.toSeatId);
      if (!fromSeatId || !toSeatId || !seatIds.has(fromSeatId) || !seatIds.has(toSeatId)) return null;
      const type = pickStr(r.type).toLowerCase();
      return {
        id: pickStr(r.id) || `rel_${i + 1}`,
        fromSeatId,
        toSeatId,
        type: RELATIONSHIP_TYPES.has(type) ? type : "direct",
        label: pickStr(r.label).slice(0, 200)
      };
    })
    .filter(Boolean);

  return { departments: deptOut, seats: seatOut, relationships: relOut };
}

function roleMayEditByDefault(role) {
  const r = pickStr(role).toLowerCase();
  return r === "admin" || r === "super_admin" || r === "executive";
}

async function resolveCanEdit(db, req, organizationId) {
  if (roleMayEditByDefault(req.user?.role)) return { can_edit: true, reason: "role" };
  const email = normalizeEmail(req.user?.email);
  const profileId = pickStr(req.user?.id);
  if (!organizationId) return { can_edit: false, reason: "no_org" };

  try {
    let q = db
      .from("org_directory_editors")
      .select("id,can_edit,user_email,user_profile_id")
      .eq("organization_id", organizationId)
      .eq("can_edit", true)
      .limit(20);
    const { data, error } = await q;
    if (error) {
      if (isMissingRelationError(error)) return { can_edit: false, reason: "editors_table_missing" };
      throw error;
    }
    for (const row of data || []) {
      if (profileId && pickStr(row.user_profile_id) === profileId) return { can_edit: true, reason: "editor_row" };
      if (email && normalizeEmail(row.user_email) === email) return { can_edit: true, reason: "editor_row" };
    }
  } catch (e) {
    if (isMissingRelationError(e)) return { can_edit: false, reason: "editors_table_missing" };
    throw e;
  }
  return { can_edit: false, reason: "not_listed" };
}

async function loadActiveChart(db, organizationId) {
  const { data, error } = await db
    .from("org_directory_charts")
    .select("id,organization_id,name,chart_data,is_active,created_at,updated_at,created_by,updated_by")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingRelationError(error)) return { missing: true, chart: null };
    throw error;
  }
  return { missing: false, chart: data?.[0] ?? null };
}

async function ensureActiveChart(db, organizationId, userId, { seedStarter = false } = {}) {
  const existing = await loadActiveChart(db, organizationId);
  if (existing.missing) return { ok: false, error: "org_directory_charts table missing — apply eliteos_org_directory_v1.sql" };
  if (existing.chart) {
    const chart_data = sanitizeChartData(existing.chart.chart_data);
    return { ok: true, chart: { ...existing.chart, chart_data }, created: false };
  }

  const chart_data = seedStarter ? buildEliteStarterChartData() : emptyChartData();
  const row = {
    organization_id: organizationId,
    name: "Organization Chart",
    chart_data,
    is_active: true,
    created_by: userId || null,
    updated_by: userId || null
  };
  const { data, error } = await db.from("org_directory_charts").insert(row).select("*").single();
  if (error) throw error;
  return { ok: true, chart: data, created: true, seeded: seedStarter };
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachOrgDirectoryRoutes(app, deps) {
  const { requireAuth, requireRole, requireHeadAccess, getSupabase } = deps;
  const viewStack = [requireAuth(), requireHeadAccess("org_directory", { getSupabase })];
  const editAdminStack = [requireAuth(), requireRole(["admin", "super_admin"]), requireHeadAccess("org_directory", { getSupabase })];

  app.get("/api/org-directory/me", ...viewStack, async (req, res) => {
    try {
      const db = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const organizationId = orgCtx.organizationId;
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "organization_id is required on your profile or tenant config." });
      }
      const edit = await resolveCanEdit(db, req, organizationId);
      res.json({
        ok: true,
        can_view: true,
        can_edit: edit.can_edit,
        edit_reason: edit.reason,
        organization_id: organizationId,
        user: {
          id: req.user?.id ?? null,
          email: req.user?.email ?? null,
          role: req.user?.role ?? null
        },
        planning_note: "Recommended heads are planning notes only — they do not change actual eliteOS permissions."
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/org-directory/chart", ...viewStack, async (req, res) => {
    try {
      const db = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const organizationId = orgCtx.organizationId;
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "organization_id is required." });
      }
      const seed = pickStr(req.query?.seed) === "starter" || pickStr(req.query?.seed_starter) === "1";
      const result = await ensureActiveChart(db, organizationId, req.user?.id, { seedStarter: seed });
      if (!result.ok) return res.status(503).json({ ok: false, error: result.error });
      const edit = await resolveCanEdit(db, req, organizationId);
      res.json({
        ok: true,
        chart: {
          id: result.chart.id,
          name: result.chart.name,
          chart_data: sanitizeChartData(result.chart.chart_data),
          updated_at: result.chart.updated_at
        },
        created: result.created,
        seeded: Boolean(result.seeded),
        can_edit: edit.can_edit
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/org-directory/chart", ...viewStack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const organizationId = orgCtx.organizationId;
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "organization_id is required." });
      }
      const edit = await resolveCanEdit(db, req, organizationId);
      if (!edit.can_edit) {
        return res.status(403).json({ ok: false, error: "You do not have edit access to the org chart." });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const chart_data = sanitizeChartData(body.chart_data ?? body);
      const name = pickStr(body.name) || "Organization Chart";

      const existing = await ensureActiveChart(db, organizationId, req.user?.id);
      if (!existing.ok) return res.status(503).json({ ok: false, error: existing.error });

      const { data, error } = await db
        .from("org_directory_charts")
        .update({
          name,
          chart_data,
          updated_by: req.user?.id ?? null,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.chart.id)
        .eq("organization_id", organizationId)
        .select("id,name,chart_data,updated_at")
        .single();
      if (error) throw error;

      try {
        await logAction({
          user: req.user,
          head: "org_directory",
          actionType: "org_chart_save",
          entityType: "org_directory_chart",
          entityId: data.id,
          metadata: {
            seat_count: chart_data.seats?.length ?? 0,
            department_count: chart_data.departments?.length ?? 0
          },
          req
        });
      } catch {
        /* non-fatal */
      }

      res.json({ ok: true, chart: data });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/org-directory/export", ...viewStack, async (req, res) => {
    try {
      const db = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const organizationId = orgCtx.organizationId;
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "organization_id is required." });
      }
      const existing = await ensureActiveChart(db, organizationId, req.user?.id);
      if (!existing.ok) return res.status(503).json({ ok: false, error: existing.error });
      const chart_data = sanitizeChartData(existing.chart.chart_data);
      res.json({
        ok: true,
        exported_at: new Date().toISOString(),
        organization_id: organizationId,
        chart_id: existing.chart.id,
        name: existing.chart.name,
        chart_data
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/org-directory/editors", ...editAdminStack, jsonParser, async (req, res) => {
    try {
      const db = getSupabase();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const organizationId = orgCtx.organizationId;
      if (!organizationId) {
        return res.status(400).json({ ok: false, error: "organization_id is required." });
      }
      const email = normalizeEmail(req.body?.user_email ?? req.body?.email);
      const profileId = pickStr(req.body?.user_profile_id);
      if (!email && !profileId) {
        return res.status(400).json({ ok: false, error: "user_email or user_profile_id is required." });
      }
      const row = {
        organization_id: organizationId,
        user_email: email || null,
        user_profile_id: profileId || null,
        can_edit: req.body?.can_edit !== false
      };
      const { data, error } = await db.from("org_directory_editors").upsert(row, { onConflict: "organization_id,user_email" }).select("*").single();
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, error: "org_directory_editors table missing — apply eliteos_org_directory_v1.sql" });
        }
        throw error;
      }
      res.json({ ok: true, editor: data });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
