/**
 * Quote Pipeline — authenticated recall for sales / managers / admins.
 * All quote sources share quote_headers; list/detail respect assignment-based visibility for sales reps.
 *
 * TODO: Narrow permissions with explicit sales_manager role and user↔rep identity mapping when available.
 * TODO: Sales reps currently matched via sales_rep text vs profile full_name / email — normalize in DB later.
 */
import express from "express";

import { logAction } from "../auth/auditLog.js";
import { isPublicQuoteSource } from "./quoteSourceConfig.js";
import { buildLeadAssignmentRow } from "./quoteTerritoryAssignment.js";

const jsonParser = express.json({ limit: "2mb" });

/** Same role set as Sales Head read APIs — paired with `sales` head access. */
const PIPELINE_ROLES = Object.freeze(["admin", "executive", "sales", "finance", "marketing"]);

const ALLOWED_STATUS_PATCH = new Set(["lead_submitted", "reviewing", "contacted", "quoted", "won", "lost", "archived"]);

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function pipelineCanViewAll(user) {
  const r = String(user?.role ?? "").trim();
  return r === "admin" || r === "executive";
}

function userMatchesSalesRep(user, salesRep) {
  const sr = norm(salesRep);
  if (!sr) return false;
  const fn = norm(user?.fullName);
  const em = norm(user?.email);
  if (fn && (sr === fn || sr.includes(fn) || fn.includes(sr))) return true;
  if (em && (sr === em || sr === em.split("@")[0])) return true;
  return false;
}

function canViewQuoteRow(user, row) {
  if (pipelineCanViewAll(user)) return true;
  return userMatchesSalesRep(user, row?.sales_rep) || norm(row?.customer_email) === norm(user?.email);
}

function shouldRedactPartnerPricing(user, quoteSource) {
  if (isPublicQuoteSource(quoteSource)) return false;
  const r = String(user?.role ?? "").trim();
  if (r === "admin" || r === "executive") return false;
  return true;
}

function redactDetailPayload(detail, user) {
  const src = detail?.header?.quote_source;
  if (!shouldRedactPartnerPricing(user, src)) return detail;
  const h = detail.header || {};
  return {
    ...detail,
    header: {
      ...h,
      calculation_snapshot: {
        _redacted: true,
        _reason: "Partner or internal wholesale detail is limited for this role. Use admin or executive for full economics.",
        grand_total: h.grand_total ?? null,
        estimated_sqft: h.estimated_sqft ?? null,
        quote_source: src
      }
    },
    line_items: [],
    warnings: [...(detail.warnings || []), "Line-level wholesale pricing hidden for this role."]
  };
}

function parseFilters(req) {
  const q = req.query || {};
  return {
    quote_source: String(q.quote_source || "").trim() || undefined,
    quote_status: String(q.quote_status || "").trim() || undefined,
    sales_rep: String(q.sales_rep || "").trim() || undefined,
    branch: String(q.branch || "").trim() || undefined,
    search: String(q.search || "").trim().slice(0, 120) || undefined,
    date_from: String(q.date_from || "").trim() || undefined,
    date_to: String(q.date_to || "").trim() || undefined,
    min_value: q.min_value != null && q.min_value !== "" ? Number(q.min_value) : undefined,
    max_value: q.max_value != null && q.max_value !== "" ? Number(q.max_value) : undefined,
    limit: Math.min(200, Math.max(1, Number.parseInt(String(q.limit || "50"), 10) || 50))
  };
}

function applyHeaderFilters(qb, f) {
  let q = qb;
  if (f.quote_source) q = q.eq("quote_source", f.quote_source);
  if (f.quote_status) q = q.eq("quote_status", f.quote_status);
  if (f.sales_rep) q = q.ilike("sales_rep", `%${f.sales_rep.replace(/%/g, "")}%`);
  if (f.branch) q = q.ilike("branch", `%${f.branch.replace(/%/g, "")}%`);
  if (f.date_from) q = q.gte("created_at", f.date_from);
  if (f.date_to) q = q.lte("created_at", f.date_to);
  if (Number.isFinite(f.min_value)) q = q.gte("grand_total", f.min_value);
  if (Number.isFinite(f.max_value)) q = q.lte("grand_total", f.max_value);
  if (f.search) {
    const s = f.search.replace(/%/g, "").slice(0, 80);
    const pat = `%${s}%`;
    q = q.or(`customer_name.ilike.${pat},quote_number.ilike.${pat},city.ilike.${pat},customer_email.ilike.${pat}`);
  }
  return q;
}

async function fetchOptional(db, run) {
  try {
    const { data, error } = await run(db);
    if (error) throw error;
    return { rows: data ?? [], missing: false };
  } catch (e) {
    if (isMissingRelationError(e)) return { rows: [], missing: true };
    throw e;
  }
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachQuotePipelineRoutes(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  const headAccessSales = requireHeadAccess("sales", { getSupabase });
  const stack = [requireAuth(), requireRole([...PIPELINE_ROLES]), headAccessSales];
  const supabaseGetter = () => getSupabase();

  app.get("/api/quotes/pipeline/summary", ...stack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const f = parseFilters(req);
      let qb = db.from("quote_headers").select("id,quote_source,quote_status,grand_total,created_at,sales_rep,branch");
      qb = applyHeaderFilters(qb, f);
      const { data: rows, error } = await qb.limit(5000);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "quote_headers not installed." });
        }
        throw error;
      }
      let list = rows ?? [];
      const user = req.user;
      if (!pipelineCanViewAll(user)) {
        list = list.filter((r) => canViewQuoteRow(user, r));
      }
      const now = Date.now();
      const dayMs = 86400000;
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const startWeek = new Date(startToday);
      startWeek.setDate(startWeek.getDate() - startWeek.getDay());
      const openStatuses = new Set(["lead_submitted", "reviewing", "contacted", "quoted", "draft", "submitted"]);
      let totalOpen = 0;
      let newToday = 0;
      let newWeek = 0;
      let publicVal = 0;
      let partnerVal = 0;
      let sumAll = 0;
      let needFollow = 0;
      for (const r of list) {
        const v = Number(r.grand_total) || 0;
        sumAll += v;
        const st = String(r.quote_status || "");
        if (openStatuses.has(st)) totalOpen += v;
        const ct = new Date(r.created_at || 0).getTime();
        if (ct >= startToday.getTime()) newToday += 1;
        if (ct >= startWeek.getTime()) newWeek += 1;
        const src = String(r.quote_source || "");
        if (src === "public_consumer") publicVal += v;
        if (src.includes("partner") || src === "partner_portal" || src === "partner_quote") partnerVal += v;
        if (st === "lead_submitted" || st === "reviewing") needFollow += 1;
      }
      res.json({
        ok: true,
        metrics: {
          total_open_quote_value: Math.round(totalOpen * 100) / 100,
          new_quotes_today: newToday,
          new_quotes_this_week: newWeek,
          public_quote_value: Math.round(publicVal * 100) / 100,
          partner_quote_value: Math.round(partnerVal * 100) / 100,
          average_quote_value: list.length ? Math.round((sumAll / list.length) * 100) / 100 : 0,
          follow_up_queue_count: needFollow,
          follow_up_note:
            "Follow-up count uses statuses lead_submitted + reviewing until a dedicated follow-up flag exists on quote_headers."
        },
        row_count_for_metrics: list.length
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/quotes/pipeline", ...stack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const f = parseFilters(req);
      let qb = db
        .from("quote_headers")
        .select(
          "id,quote_number,quote_source,quote_status,customer_name,customer_email,customer_phone,project_address,city,state,zip,sales_rep,branch,grand_total,estimated_sqft,created_at,monday_item_id,monday_board_id"
        )
        .order("created_at", { ascending: false });
      qb = applyHeaderFilters(qb, f);
      const { data: rows, error } = await qb.limit(f.limit);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "quote_headers not installed." });
        }
        throw error;
      }
      let list = rows ?? [];
      const user = req.user;
      if (!pipelineCanViewAll(user)) {
        list = list.filter((r) => canViewQuoteRow(user, r));
      }
      const ids = list.map((r) => r.id).filter(Boolean);
      let mondayLatest = new Map();
      let assignmentLatest = new Map();
      if (ids.length) {
        const { data: monRows } = await db
          .from("quote_monday_sync_log")
          .select("quote_id,status,created_at,error_message,monday_item_id")
          .in("quote_id", ids)
          .order("created_at", { ascending: false })
          .limit(ids.length * 5);
        for (const r of monRows || []) {
          if (!mondayLatest.has(r.quote_id)) mondayLatest.set(r.quote_id, r);
        }
        const { data: asnRows } = await db
          .from("quote_lead_assignments")
          .select("quote_id,assignment_source,assigned_sales_rep,branch,created_at,confidence")
          .in("quote_id", ids)
          .order("created_at", { ascending: false })
          .limit(ids.length * 5);
        for (const r of asnRows || []) {
          if (!assignmentLatest.has(r.quote_id)) assignmentLatest.set(r.quote_id, r);
        }
      }
      const enriched = list.map((r) => ({
        ...r,
        monday_sync: mondayLatest.get(r.id) || null,
        lead_assignment: assignmentLatest.get(r.id) || null
      }));
      res.json({ ok: true, rows: enriched });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/quotes/pipeline/:id", ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { data: h, error: hErr } = await db.from("quote_headers").select("*").eq("id", id).limit(1);
      if (hErr) {
        if (isMissingRelationError(hErr)) {
          return res.status(503).json({ ok: false, installed: false, message: "quote_headers not installed." });
        }
        throw hErr;
      }
      const header = h?.[0];
      if (!header) return res.status(404).json({ ok: false, error: "quote not found" });
      if (!canViewQuoteRow(req.user, header)) {
        return res.status(403).json({ ok: false, error: "You do not have access to this quote." });
      }

      const warnings = [];
      const submissions = await fetchOptional(db, (d) =>
        d.from("quote_submission_payloads").select("*").eq("quote_id", id).order("created_at", { ascending: false })
      );
      if (submissions.missing) warnings.push("quote_submission_payloads unavailable.");

      const forecast = await fetchOptional(db, (d) =>
        d.from("quote_forecast_events").select("*").eq("quote_id", id).order("event_at", { ascending: false })
      );
      if (forecast.missing) warnings.push("quote_forecast_events unavailable.");

      const assignments = await fetchOptional(db, (d) =>
        d.from("quote_lead_assignments").select("*").eq("quote_id", id).order("created_at", { ascending: false })
      );
      if (assignments.missing) warnings.push("quote_lead_assignments unavailable.");

      const mondayLog = await fetchOptional(db, (d) =>
        d.from("quote_monday_sync_log").select("*").eq("quote_id", id).order("created_at", { ascending: false })
      );
      if (mondayLog.missing) warnings.push("quote_monday_sync_log unavailable.");

      const statusHist = await fetchOptional(db, (d) =>
        d.from("quote_status_history").select("*").eq("quote_id", id).order("changed_at", { ascending: false })
      );
      if (statusHist.missing) warnings.push("quote_status_history unavailable.");

      const lines = await fetchOptional(db, (d) =>
        d.from("quote_line_items").select("*").eq("quote_id", id).order("sort_order")
      );
      if (lines.missing) warnings.push("quote_line_items unavailable.");

      const rooms = await fetchOptional(db, (d) =>
        d.from("quote_rooms").select("*").eq("quote_id", id).order("sort_order")
      );
      if (rooms.missing) warnings.push("quote_rooms unavailable.");

      const actions = await fetchOptional(db, (d) =>
        d
          .from("eos_action_log")
          .select("id,action_type,entity_type,entity_id,user_email,user_role,head,metadata,created_at")
          .eq("entity_id", id)
          .order("created_at", { ascending: false })
          .limit(100)
      );
      if (actions.missing) warnings.push("eos_action_log unavailable.");

      const detail = {
        header,
        submission_payloads: submissions.rows,
        forecast_events: forecast.rows,
        lead_assignments: assignments.rows,
        monday_sync_log: mondayLog.rows,
        status_history: statusHist.rows,
        line_items: lines.rows,
        rooms: rooms.rows,
        action_log: actions.rows,
        warnings
      };
      res.json({ ok: true, quote: redactDetailPayload(detail, req.user) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/quotes/pipeline/:id/timeline", ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { data: h, error: hErr } = await db.from("quote_headers").select("*").eq("id", id).limit(1);
      if (hErr) throw hErr;
      const header = h?.[0];
      if (!header) return res.status(404).json({ ok: false, error: "quote not found" });
      if (!canViewQuoteRow(req.user, header)) {
        return res.status(403).json({ ok: false, error: "You do not have access to this quote." });
      }

      const events = [];
      const warnings = [];

      events.push({
        type: "quote_created",
        at: header.created_at,
        label: "Quote created",
        detail: { quote_number: header.quote_number, quote_source: header.quote_source }
      });

      const { data: sh, error: shErr } = await db
        .from("quote_status_history")
        .select("*")
        .eq("quote_id", id)
        .order("changed_at", { ascending: true });
      if (shErr && !isMissingRelationError(shErr)) throw shErr;
      if (shErr) warnings.push("status_history_unavailable");
      for (const r of sh || []) {
        events.push({
          type: "status_change",
          at: r.changed_at,
          label: `Status ${r.old_status || "?"} → ${r.new_status}`,
          detail: { changed_by: r.changed_by, metadata: r.metadata }
        });
      }

      const { data: asn } = await db.from("quote_lead_assignments").select("*").eq("quote_id", id).order("created_at", { ascending: true });
      for (const r of asn || []) {
        events.push({
          type: "lead_assignment",
          at: r.created_at,
          label: "Lead assignment",
          detail: {
            assignment_source: r.assignment_source,
            assigned_sales_rep: r.assigned_sales_rep,
            branch: r.branch,
            confidence: r.confidence
          }
        });
      }

      const { data: fe } = await db.from("quote_forecast_events").select("*").eq("quote_id", id).order("event_at", { ascending: true });
      for (const r of fe || []) {
        events.push({
          type: "forecast",
          at: r.event_at,
          label: `Forecast · ${r.event_type}`,
          detail: {
            quote_value: r.quote_value,
            forecast_value: r.forecast_value,
            probability_percent: r.probability_percent
          }
        });
      }

      const { data: ml } = await db.from("quote_monday_sync_log").select("*").eq("quote_id", id).order("created_at", { ascending: true });
      for (const r of ml || []) {
        events.push({
          type: "monday_sync",
          at: r.created_at,
          label: `Monday sync · ${r.status}`,
          detail: { action: r.action, monday_item_id: r.monday_item_id, error_message: r.error_message }
        });
      }

      const { data: sp } = await db.from("quote_submission_payloads").select("*").eq("quote_id", id).order("created_at", { ascending: true });
      for (const r of sp || []) {
        events.push({
          type: "submission_payload",
          at: r.created_at,
          label: "Submission payload stored",
          detail: { quote_source: r.quote_source, id: r.id }
        });
      }

      const { data: al } = await db
        .from("eos_action_log")
        .select("id,action_type,entity_type,user_email,metadata,created_at")
        .eq("entity_id", id)
        .order("created_at", { ascending: true })
        .limit(200);
      for (const r of al || []) {
        events.push({
          type: "action_log",
          at: r.created_at,
          label: r.action_type || "action",
          detail: { user_email: r.user_email, metadata: r.metadata }
        });
      }

      events.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());

      res.json({ ok: true, quote_id: id, events, warnings });
    } catch (e) {
      if (isMissingRelationError(e)) {
        return res.status(503).json({ ok: false, installed: false, error: String(e?.message || e) });
      }
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/quotes/pipeline/:id/status", ...stack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const nextStatus = String(req.body?.quote_status || req.body?.status || "").trim();
      if (!ALLOWED_STATUS_PATCH.has(nextStatus)) {
        return res.status(400).json({ ok: false, error: `Invalid status. Allowed: ${[...ALLOWED_STATUS_PATCH].join(", ")}` });
      }
      const db = supabaseGetter();
      const { data: h, error: hErr } = await db.from("quote_headers").select("*").eq("id", id).limit(1);
      if (hErr) throw hErr;
      const header = h?.[0];
      if (!header) return res.status(404).json({ ok: false, error: "quote not found" });
      if (!canViewQuoteRow(req.user, header)) {
        return res.status(403).json({ ok: false, error: "You do not have access to this quote." });
      }

      const oldStatus = header.quote_status;
      const userEmail = String(req.user?.email || req.user?.id || "user");
      const { data: upd, error: uErr } = await db
        .from("quote_headers")
        .update({ quote_status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .limit(1);
      if (uErr) throw uErr;
      const updated = upd?.[0];

      try {
        await db.from("quote_status_history").insert({
          quote_id: id,
          old_status: oldStatus,
          new_status: nextStatus,
          changed_by: userEmail,
          metadata: { via: "quote_pipeline_api" }
        });
      } catch {
        /* optional */
      }

      try {
        await logAction({
          user: req.user,
          head: "quote_pipeline",
          actionType: "quote_status_patch",
          entityType: "quote_header",
          entityId: id,
          metadata: { old_status: oldStatus, new_status: nextStatus },
          req
        });
      } catch {
        /* non-fatal */
      }

      res.json({ ok: true, quote: updated });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/quotes/pipeline/:id/assign", ...stack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const b = req.body || {};
      const salesRep = String(b.sales_rep || "").trim();
      const salesRepEmail = String(b.sales_rep_email || "").trim();
      const branch = String(b.branch || "").trim();
      const assignmentSource = String(b.assignment_source || "manual").trim() || "manual";

      const db = supabaseGetter();
      const { data: h, error: hErr } = await db.from("quote_headers").select("*").eq("id", id).limit(1);
      if (hErr) throw hErr;
      const header = h?.[0];
      if (!header) return res.status(404).json({ ok: false, error: "quote not found" });
      if (!canViewQuoteRow(req.user, header)) {
        return res.status(403).json({ ok: false, error: "You do not have access to this quote." });
      }
      // TODO: restrict reassignment to managers once role model supports it; sales may reassign own territory for now.
      const { data: upd, error: uErr } = await db
        .from("quote_headers")
        .update({
          sales_rep: salesRep || null,
          branch: branch || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("*")
        .limit(1);
      if (uErr) throw uErr;
      const updated = upd?.[0];

      const assignmentResult = {
        assignment_source: assignmentSource,
        assigned_sales_rep: salesRep || null,
        assigned_sales_rep_email: salesRepEmail || null,
        branch: branch || null,
        matched_territory_id: null,
        confidence: "manual",
        metadata: { by: String(req.user?.email || "") }
      };
      try {
        await db.from("quote_lead_assignments").insert(buildLeadAssignmentRow({ quoteId: id, assignmentResult }));
      } catch {
        /* optional */
      }

      try {
        await logAction({
          user: req.user,
          head: "quote_pipeline",
          actionType: "quote_assign_patch",
          entityType: "quote_header",
          entityId: id,
          metadata: assignmentResult,
          req
        });
      } catch {
        /* non-fatal */
      }

      res.json({ ok: true, quote: updated, assignment: assignmentResult });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  console.log(
    "[quote-pipeline] mounted GET /api/quotes/pipeline/summary, GET /api/quotes/pipeline, GET /api/quotes/pipeline/:id, GET /api/quotes/pipeline/:id/timeline, PATCH status, PATCH assign (auth + sales head)"
  );
}
