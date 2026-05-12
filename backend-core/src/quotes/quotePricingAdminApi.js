/**
 * System-admin quote pricing & partner assignment APIs.
 * Mounted from quoteRoutes.js — requires auth, admin role, and system_admin head access.
 */
import express from "express";

import {
  getDefaultOrganization,
  mergeRowOrganizationId,
  organizationScopeOrFilter,
  resolveOrganizationContext,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";
import { listSalesDirectoryUsers } from "./salesDirectoryUsers.js";
import {
  getForecastValueRollup,
  getQuoteMetricsByBranch,
  getQuoteMetricsByPartner,
  getQuoteMetricsBySalesRep,
  getQuotePipelineSummary
} from "./quoteAnalytics.js";

const jsonParser = express.json({ limit: "2mb" });

const MIN_PUBLIC_RETAIL_MARKUP = 25;

const TERRITORY_MATCH_TYPES = new Set(["zip", "city", "county", "state", "branch", "manual"]);

function validateTerritoryBody(body, partial = {}) {
  const b = body && typeof body === "object" ? body : {};
  const match_type = String(b.match_type ?? partial.match_type ?? "zip").trim();
  if (!TERRITORY_MATCH_TYPES.has(match_type)) {
    return { ok: false, error: `match_type must be one of: ${[...TERRITORY_MATCH_TYPES].join(", ")}` };
  }
  const match_value = String(b.match_value ?? partial.match_value ?? "").trim();
  if (!match_value) return { ok: false, error: "match_value is required" };
  const territory_name = String(b.territory_name ?? partial.territory_name ?? "").trim() || "Territory";
  const row = {
    territory_name,
    match_type,
    match_value,
    branch: b.branch !== undefined ? (b.branch === null ? null : String(b.branch).trim()) : partial.branch ?? null,
    assigned_sales_rep:
      b.assigned_sales_rep !== undefined ?
        b.assigned_sales_rep === null ? null : String(b.assigned_sales_rep).trim()
      : partial.assigned_sales_rep ?? null,
    assigned_sales_rep_email:
      b.assigned_sales_rep_email !== undefined ?
        b.assigned_sales_rep_email === null ? null : String(b.assigned_sales_rep_email).trim()
      : partial.assigned_sales_rep_email ?? null,
    priority: b.priority != null && b.priority !== "" ? Number(b.priority) : partial.priority ?? 100,
    is_active: b.is_active !== undefined ? Boolean(b.is_active) : partial.is_active !== undefined ? partial.is_active : true,
    metadata: (() => {
      const base =
        partial.metadata && typeof partial.metadata === "object" && !Array.isArray(partial.metadata) ? { ...partial.metadata } : {};
      if (b.metadata !== undefined) {
        const incoming =
          b.metadata && typeof b.metadata === "object" && !Array.isArray(b.metadata) ? { ...b.metadata } : {};
        return { ...base, ...incoming };
      }
      return Object.keys(base).length ? base : {};
    })()
  };
  if (!Number.isFinite(row.priority)) row.priority = 100;
  return { ok: true, row };
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function sanitizeSearchToken(raw) {
  return String(raw ?? "")
    .trim()
    .slice(0, 80)
    .replace(/%/g, "")
    .replace(/,/g, " ")
    .replace(/[()]/g, " ");
}

function publicRetailMarkupErrorIfInvalid(row) {
  if (String(row.pricing_mode || "").trim() === "public_retail") {
    const m = Number(row.retail_markup_percent);
    if (!Number.isFinite(m) || m < MIN_PUBLIC_RETAIL_MARKUP) {
      return {
        ok: false,
        error: `public_retail pricing_mode requires retail_markup_percent >= ${MIN_PUBLIC_RETAIL_MARKUP}`
      };
    }
  }
  return { ok: true };
}

async function attachActiveRuleCounts(db, structures) {
  const rows = structures ?? [];
  if (!rows.length) {
    return rows.map((s) => ({ ...s, active_rule_count: 0, active_partner_assignment_count: 0 }));
  }
  const ids = rows.map((r) => r.id);
  const { data: ruleRows, error } = await db
    .from("quote_pricing_rules")
    .select("pricing_structure_id")
    .in("pricing_structure_id", ids)
    .eq("is_active", true);
  if (error) throw error;
  const counts = {};
  for (const r of ruleRows || []) {
    const k = r.pricing_structure_id;
    counts[k] = (counts[k] || 0) + 1;
  }
  const { data: asnRows, error: aErr } = await db
    .from("quote_partner_pricing_assignments")
    .select("pricing_structure_id")
    .in("pricing_structure_id", ids)
    .eq("is_active", true);
  if (aErr) throw aErr;
  const pCounts = {};
  for (const r of asnRows || []) {
    const k = r.pricing_structure_id;
    pCounts[k] = (pCounts[k] || 0) + 1;
  }
  return rows.map((s) => ({
    ...s,
    active_rule_count: counts[s.id] ?? 0,
    active_partner_assignment_count: pCounts[s.id] ?? 0
  }));
}

async function attachCurrentAssignmentsToPartners(db, partners) {
  const rows = partners ?? [];
  if (!rows.length) return rows.map((p) => ({ ...p, current_pricing_assignment: null }));
  const { data: assigns, error: aErr } = await db
    .from("quote_partner_pricing_assignments")
    .select("*")
    .eq("is_active", true);
  if (aErr) throw aErr;
  const structIds = [...new Set((assigns || []).map((a) => a.pricing_structure_id).filter(Boolean))];
  let structById = {};
  if (structIds.length) {
    const { data: structs, error: sErr } = await db
      .from("quote_pricing_structures")
      .select("id,code,name,pricing_mode")
      .in("id", structIds);
    if (sErr) throw sErr;
    structById = Object.fromEntries((structs || []).map((s) => [s.id, s]));
  }
  return rows.map((p) => {
    const a = (assigns || []).find((x) => x.partner_account_id === p.id) || null;
    if (!a) return { ...p, current_pricing_assignment: null };
    return {
      ...p,
      current_pricing_assignment: {
        ...a,
        pricing_structure: structById[a.pricing_structure_id] || null
      }
    };
  });
}

async function endActiveAssignmentsForPartner(db, partnerId) {
  const nowIso = new Date().toISOString();
  const { error } = await db
    .from("quote_partner_pricing_assignments")
    .update({ is_active: false, ends_at: nowIso })
    .eq("partner_account_id", partnerId)
    .eq("is_active", true);
  if (error) throw error;
}

async function clearOtherPublicDefaults(db, exceptId, orgId, hasStructureOrgCol) {
  let q = db
    .from("quote_pricing_structures")
    .update({ is_public_default: false, updated_at: new Date().toISOString() })
    .eq("is_public_default", true)
    .neq("id", exceptId);
  if (hasStructureOrgCol && orgId) {
    const filt = organizationScopeOrFilter(orgId);
    if (filt) q = q.or(filt);
  }
  const { error } = await q;
  if (error) throw error;
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachQuotePricingAdminApi(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  const headAccessSystemAdmin = requireHeadAccess("system_admin", { getSupabase });
  const supabaseGetter = () => getSupabase();
  const adminStack = [requireAuth(), requireRole(["admin"]), headAccessSystemAdmin];

  /**
   * Active sales-eligible users for assignment dropdowns (territories admin, future partner owner).
   * Internal quote tooling should call this same route. Not public.
   */
  app.get("/api/admin/sales-users", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const users = await listSalesDirectoryUsers(db, { warn: (o) => console.warn(o) });
      res.json({ ok: true, users });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-pricing-structures", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      let q = db.from("quote_pricing_structures").select("*").order("code");
      if (orgId) {
        const has = await tableHasOrganizationId(db, "quote_pricing_structures");
        const filt = has ? organizationScopeOrFilter(orgId) : null;
        if (filt) q = q.or(filt);
      }
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const rows = await attachActiveRuleCounts(db, data ?? []);
      res.json({ ok: true, installed: true, rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-pricing-structures/:id", ...adminStack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasStructOrg = await tableHasOrganizationId(db, "quote_pricing_structures");
      const { data, error } = await db.from("quote_pricing_structures").select("*").eq("id", id).limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const row = data?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "pricing structure not found" });
      if (hasStructOrg && orgId && row.organization_id != null && String(row.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "pricing structure not found" });
      }
      const [withCount] = await attachActiveRuleCounts(db, [row]);
      const { data: partnerRows, error: pErr } = await db
        .from("quote_partner_pricing_assignments")
        .select("id,partner_account_id,starts_at")
        .eq("pricing_structure_id", id)
        .eq("is_active", true);
      if (pErr) throw pErr;
      const partnerIds = [...new Set((partnerRows || []).map((r) => r.partner_account_id))];
      let partnersUsing = [];
      if (partnerIds.length) {
        const { data: pr, error: prErr } = await db
          .from("quote_partner_accounts")
          .select("id,account_name,account_type")
          .in("id", partnerIds);
        if (prErr) throw prErr;
        partnersUsing = pr ?? [];
      }
      res.json({ ok: true, installed: true, row: withCount, partners_using: partnersUsing });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/quote-pricing-structures", ...adminStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasStructOrg = await tableHasOrganizationId(db, "quote_pricing_structures");
      const b = req.body || {};
      const pricing_mode = String(b.pricing_mode || "custom").trim();
      const retail_markup_percent =
        b.retail_markup_percent != null && b.retail_markup_percent !== ""
          ? Number(b.retail_markup_percent)
          : pricing_mode === "public_retail"
            ? 25
            : 0;
      const row = mergeRowOrganizationId(
        {
          name: String(b.name || "").trim() || "Unnamed",
          code: String(b.code || "").trim() || `STRUCT-${Date.now()}`,
          description: b.description != null ? String(b.description) : null,
          pricing_mode,
          retail_markup_percent,
          is_public_default: Boolean(b.is_public_default),
          is_active: b.is_active !== false,
          metadata: typeof b.metadata === "object" && b.metadata ? b.metadata : {}
        },
        orgId,
        hasStructOrg && Boolean(orgId)
      );
      const chk = publicRetailMarkupErrorIfInvalid(row);
      if (!chk.ok) return res.status(400).json({ ok: false, error: chk.error });
      const { data, error } = await db.from("quote_pricing_structures").insert(row).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        if (String(error.code) === "23505") {
          return res.status(409).json({ ok: false, error: "duplicate code or constraint violation", details: error.message });
        }
        throw error;
      }
      const inserted = data?.[0];
      if (inserted?.is_public_default) {
        await clearOtherPublicDefaults(db, inserted.id, orgId, hasStructOrg);
      }
      res.json({ ok: true, row: inserted ?? null });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/admin/quote-pricing-structures/:id", ...adminStack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasStructOrg = await tableHasOrganizationId(db, "quote_pricing_structures");
      const { data: existingRows, error: exErr } = await db.from("quote_pricing_structures").select("*").eq("id", id).limit(1);
      if (exErr) {
        if (isMissingRelationError(exErr)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw exErr;
      }
      const existing = existingRows?.[0];
      if (!existing) return res.status(404).json({ ok: false, error: "pricing structure not found" });
      if (
        hasStructOrg &&
        orgId &&
        existing.organization_id != null &&
        String(existing.organization_id) !== String(orgId)
      ) {
        return res.status(404).json({ ok: false, error: "pricing structure not found" });
      }
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (b.name != null) patch.name = String(b.name).trim() || existing.name;
      if (b.code != null) patch.code = String(b.code).trim() || existing.code;
      if (b.description !== undefined) patch.description = b.description === null ? null : String(b.description);
      if (b.pricing_mode != null) patch.pricing_mode = String(b.pricing_mode).trim();
      if (b.retail_markup_percent != null) patch.retail_markup_percent = Number(b.retail_markup_percent);
      if (b.is_public_default !== undefined) patch.is_public_default = Boolean(b.is_public_default);
      if (b.is_active !== undefined) patch.is_active = Boolean(b.is_active);
      if (b.metadata !== undefined) patch.metadata = typeof b.metadata === "object" && b.metadata ? b.metadata : {};
      const merged = { ...existing, ...patch };
      const chk = publicRetailMarkupErrorIfInvalid(merged);
      if (!chk.ok) return res.status(400).json({ ok: false, error: chk.error });
      const { data, error } = await db.from("quote_pricing_structures").update(patch).eq("id", id).select("*").limit(1);
      if (error) {
        if (String(error.code) === "23505") {
          return res.status(409).json({ ok: false, error: "duplicate code or constraint violation", details: error.message });
        }
        throw error;
      }
      const updated = data?.[0];
      if (updated?.is_public_default) await clearOtherPublicDefaults(db, id, orgId, hasStructOrg);
      const [withCount] = await attachActiveRuleCounts(db, [updated]);
      res.json({ ok: true, row: withCount });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-pricing-rules", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const sid = String(req.query.pricing_structure_id || "").trim();
      const category = String(req.query.category || "").trim();
      const itemCode = String(req.query.item_code || "").trim();
      const search = sanitizeSearchToken(req.query.search);
      const isActiveQ = req.query.is_active;
      const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit || "200"), 10) || 200));

      let q = db.from("quote_pricing_rules").select("*");
      if (!sid && orgId) {
        const has = await tableHasOrganizationId(db, "quote_pricing_rules");
        const filt = has ? organizationScopeOrFilter(orgId) : null;
        if (filt) q = q.or(filt);
      }
      if (sid) {
        if (!isUuid(sid)) return res.status(400).json({ ok: false, error: "invalid pricing_structure_id" });
        q = q.eq("pricing_structure_id", sid);
      }
      if (category) q = q.eq("category", category);
      if (itemCode) q = q.eq("item_code", itemCode);
      if (isActiveQ === "true" || isActiveQ === "1") q = q.eq("is_active", true);
      else if (isActiveQ === "false" || isActiveQ === "0") q = q.eq("is_active", false);
      if (search) {
        const safe = search.replace(/%/g, "");
        const pat = `%${safe}%`;
        q = q.or(`item_name.ilike.${pat},item_code.ilike.${pat}`);
      }
      q = q.order("category", { ascending: true }).order("item_code", { ascending: true });
      if (!sid) q = q.limit(Math.min(50, limit));
      else q = q.limit(limit);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote platform tables not installed." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-pricing-rules/:id", ...adminStack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { data, error } = await db.from("quote_pricing_rules").select("*").eq("id", id).limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const row = data?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "pricing rule not found" });
      res.json({ ok: true, installed: true, row });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/quote-pricing-rules", ...adminStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasRulesOrg = await tableHasOrganizationId(db, "quote_pricing_rules");
      const b = req.body || {};
      const sid = String(b.pricing_structure_id || "").trim();
      if (!isUuid(sid)) return res.status(400).json({ ok: false, error: "pricing_structure_id must be a valid uuid" });
      const row = mergeRowOrganizationId(
        {
          pricing_structure_id: sid,
          category: String(b.category || "").trim() || "custom",
          item_code: String(b.item_code || "").trim() || "item",
          item_name: String(b.item_name || "").trim() || "Item",
          unit_type: String(b.unit_type || "").trim() || "each",
          base_cost: b.base_cost != null && b.base_cost !== "" ? Number(b.base_cost) : null,
          price: b.price != null && b.price !== "" ? Number(b.price) : null,
          markup_percent: b.markup_percent != null && b.markup_percent !== "" ? Number(b.markup_percent) : null,
          min_charge: b.min_charge != null && b.min_charge !== "" ? Number(b.min_charge) : null,
          is_active: b.is_active !== false,
          metadata: typeof b.metadata === "object" && b.metadata ? b.metadata : {},
          updated_at: new Date().toISOString()
        },
        orgId,
        hasRulesOrg && Boolean(orgId)
      );
      const { data, error } = await db.from("quote_pricing_rules").insert(row).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      res.json({ ok: true, row: data?.[0] ?? null });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/admin/quote-pricing-rules/:id", ...adminStack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (b.pricing_structure_id != null) {
        const sid = String(b.pricing_structure_id).trim();
        if (!isUuid(sid)) return res.status(400).json({ ok: false, error: "invalid pricing_structure_id" });
        patch.pricing_structure_id = sid;
      }
      if (b.category != null) patch.category = String(b.category).trim();
      if (b.item_code != null) patch.item_code = String(b.item_code).trim();
      if (b.item_name != null) patch.item_name = String(b.item_name).trim();
      if (b.unit_type != null) patch.unit_type = String(b.unit_type).trim();
      if (b.base_cost !== undefined) patch.base_cost = b.base_cost === null ? null : Number(b.base_cost);
      if (b.price !== undefined) patch.price = b.price === null ? null : Number(b.price);
      if (b.markup_percent !== undefined) patch.markup_percent = b.markup_percent === null ? null : Number(b.markup_percent);
      if (b.min_charge !== undefined) patch.min_charge = b.min_charge === null ? null : Number(b.min_charge);
      if (b.is_active !== undefined) patch.is_active = Boolean(b.is_active);
      if (b.metadata !== undefined) patch.metadata = typeof b.metadata === "object" && b.metadata ? b.metadata : {};
      const { data, error } = await db.from("quote_pricing_rules").update(patch).eq("id", id).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const row = data?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "pricing rule not found" });
      res.json({ ok: true, row });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-partners", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      let q = db.from("quote_partner_accounts").select("*").order("account_name");
      if (orgId) {
        const has = await tableHasOrganizationId(db, "quote_partner_accounts");
        const filt = has ? organizationScopeOrFilter(orgId) : null;
        if (filt) q = q.or(filt);
      }
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const rows = await attachCurrentAssignmentsToPartners(db, data ?? []);
      res.json({ ok: true, installed: true, rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-partners/:id", ...adminStack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasPartnerOrg = await tableHasOrganizationId(db, "quote_partner_accounts");
      const { data, error } = await db.from("quote_partner_accounts").select("*").eq("id", id).limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const row = data?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "partner not found" });
      if (hasPartnerOrg && orgId && row.organization_id != null && String(row.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "partner not found" });
      }
      const [withAsn] = await attachCurrentAssignmentsToPartners(db, [row]);
      res.json({ ok: true, installed: true, row: withAsn });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/quote-partners", ...adminStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasPartnerOrg = await tableHasOrganizationId(db, "quote_partner_accounts");
      const b = req.body || {};
      const row = mergeRowOrganizationId(
        {
          account_name: String(b.account_name || "").trim() || "Unnamed partner",
          account_type: String(b.account_type || "dealer").trim() || "dealer",
          monday_account_id: b.monday_account_id != null ? String(b.monday_account_id).trim() || null : null,
          moraware_account_id: b.moraware_account_id != null ? String(b.moraware_account_id).trim() || null : null,
          default_sales_rep: b.default_sales_rep != null ? String(b.default_sales_rep).trim() || null : null,
          default_branch: b.default_branch != null ? String(b.default_branch).trim() || null : null,
          is_active: b.is_active !== false,
          metadata: typeof b.metadata === "object" && b.metadata ? b.metadata : {}
        },
        orgId,
        hasPartnerOrg && Boolean(orgId)
      );
      const { data, error } = await db.from("quote_partner_accounts").insert(row).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      res.json({ ok: true, row: data?.[0] ?? null });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/admin/quote-partners/:id", ...adminStack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasPartnerOrg = await tableHasOrganizationId(db, "quote_partner_accounts");
      const { data: existingRows, error: exErr } = await db.from("quote_partner_accounts").select("*").eq("id", id).limit(1);
      if (exErr) {
        if (isMissingRelationError(exErr)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw exErr;
      }
      const existing = existingRows?.[0];
      if (!existing) return res.status(404).json({ ok: false, error: "partner not found" });
      if (hasPartnerOrg && orgId && existing.organization_id != null && String(existing.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "partner not found" });
      }
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (b.account_name != null) patch.account_name = String(b.account_name).trim();
      if (b.account_type != null) patch.account_type = String(b.account_type).trim();
      if (b.monday_account_id !== undefined) patch.monday_account_id = b.monday_account_id == null ? null : String(b.monday_account_id).trim();
      if (b.moraware_account_id !== undefined) {
        patch.moraware_account_id = b.moraware_account_id == null ? null : String(b.moraware_account_id).trim();
      }
      if (b.default_sales_rep !== undefined) {
        patch.default_sales_rep = b.default_sales_rep == null ? null : String(b.default_sales_rep).trim();
      }
      if (b.default_branch !== undefined) patch.default_branch = b.default_branch == null ? null : String(b.default_branch).trim();
      if (b.is_active !== undefined) patch.is_active = Boolean(b.is_active);
      if (b.metadata !== undefined) patch.metadata = typeof b.metadata === "object" && b.metadata ? b.metadata : {};
      const { data, error } = await db.from("quote_partner_accounts").update(patch).eq("id", id).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const row = data?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "partner not found" });
      const [withAsn] = await attachCurrentAssignmentsToPartners(db, [row]);
      res.json({ ok: true, row: withAsn });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-partners/:id/pricing-assignment", ...adminStack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { data: history, error } = await db
        .from("quote_partner_pricing_assignments")
        .select("*")
        .eq("partner_account_id", id)
        .order("starts_at", { ascending: false })
        .limit(25);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const current = (history || []).find((h) => h.is_active) || null;
      let pricing_structure = null;
      if (current?.pricing_structure_id) {
        const { data: srows } = await db
          .from("quote_pricing_structures")
          .select("id,code,name,pricing_mode,retail_markup_percent,is_active")
          .eq("id", current.pricing_structure_id)
          .limit(1);
        pricing_structure = srows?.[0] || null;
      }
      res.json({ ok: true, installed: true, current: current ? { ...current, pricing_structure } : null, history: history ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/quote-partners/:id/pricing-assignment", ...adminStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const partnerId = String(req.params.id || "").trim();
      const pricing_structure_id = String(req.body?.pricing_structure_id || "").trim();
      if (!isUuid(partnerId) || !isUuid(pricing_structure_id)) {
        return res.status(400).json({ ok: false, error: "partner id and pricing_structure_id must be valid uuids" });
      }
      const userEmail = String(req.user?.email || req.user?.id || "admin");
      const { data: pRow, error: pErr } = await db.from("quote_partner_accounts").select("id").eq("id", partnerId).limit(1);
      if (pErr) {
        if (isMissingRelationError(pErr)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw pErr;
      }
      if (!pRow?.length) return res.status(404).json({ ok: false, error: "partner not found" });
      const { data: sRow, error: sErr } = await db.from("quote_pricing_structures").select("id").eq("id", pricing_structure_id).limit(1);
      if (sErr) throw sErr;
      if (!sRow?.length) return res.status(404).json({ ok: false, error: "pricing structure not found" });

      await endActiveAssignmentsForPartner(db, partnerId);

      const nowIso = new Date().toISOString();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasAsnOrg = await tableHasOrganizationId(db, "quote_partner_pricing_assignments");
      const insertRow = mergeRowOrganizationId(
        {
          partner_account_id: partnerId,
          pricing_structure_id,
          assigned_by: userEmail,
          is_active: true,
          starts_at: nowIso,
          metadata: typeof req.body?.metadata === "object" && req.body.metadata ? req.body.metadata : {}
        },
        orgId,
        hasAsnOrg && Boolean(orgId)
      );
      const { data, error } = await db.from("quote_partner_pricing_assignments").insert(insertRow).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw error;
      }
      const assignment = data?.[0] ?? null;
      let pricing_structure = null;
      if (assignment) {
        const { data: srows } = await db
          .from("quote_pricing_structures")
          .select("id,code,name,pricing_mode,retail_markup_percent,is_active")
          .eq("id", pricing_structure_id)
          .limit(1);
        pricing_structure = srows?.[0] || null;
      }
      res.json({ ok: true, assignment: assignment ? { ...assignment, pricing_structure } : null });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quotes", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50));
      let q = db
        .from("quote_headers")
        .select("id,quote_number,quote_status,quote_source,customer_name,grand_total,sales_rep,branch,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (orgId) {
        const has = await tableHasOrganizationId(db, "quote_headers");
        const filt = has ? organizationScopeOrFilter(orgId) : null;
        if (filt) q = q.or(filt);
      }
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote platform tables not installed." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quotes/:id", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "id required" });
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasHeaderOrg = await tableHasOrganizationId(db, "quote_headers");
      const { data: h, error: hErr } = await db.from("quote_headers").select("*").eq("id", id).limit(1);
      if (hErr) {
        if (isMissingRelationError(hErr)) {
          return res.status(503).json({ ok: false, installed: false, message: "Quote platform tables not installed." });
        }
        throw hErr;
      }
      if (!h?.length) return res.status(404).json({ ok: false, error: "quote not found" });
      const header = h[0];
      if (hasHeaderOrg && orgId && header.organization_id != null && String(header.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "quote not found" });
      }
      const [{ data: lines }, { data: rooms }] = await Promise.all([
        db.from("quote_line_items").select("*").eq("quote_id", id).order("sort_order"),
        db.from("quote_rooms").select("*").eq("quote_id", id).order("sort_order")
      ]);
      res.json({ ok: true, installed: true, quote: header, line_items: lines ?? [], rooms: rooms ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-analytics/summary", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasHeaderOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;
      const organizationScope = { organizationId: orgId, hasOrganizationIdColumn: hasHeaderOrg };
      const startDate = String(req.query.startDate || "").trim() || undefined;
      const endDate = String(req.query.endDate || "").trim() || undefined;
      const pipeline = await getQuotePipelineSummary({ startDate, endDate, db, organizationScope });
      const byRep = await getQuoteMetricsBySalesRep({ startDate, endDate, db, organizationScope });
      const byBranch = await getQuoteMetricsByBranch({ startDate, endDate, db, organizationScope });
      const byPartner = await getQuoteMetricsByPartner({ startDate, endDate, db, organizationScope });
      const forecast = await getForecastValueRollup({ startDate, endDate, db, organizationScope });
      res.json({ ok: true, pipeline, byRep, byBranch, byPartner, forecast });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-source-configs", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      let q = db.from("quote_source_configs").select("*").order("quote_source");
      if (orgId) {
        const has = await tableHasOrganizationId(db, "quote_source_configs");
        const filt = has ? organizationScopeOrFilter(orgId) : null;
        if (filt) q = q.or(filt);
      }
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "quote_source_configs not installed." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/quote-source-configs", ...adminStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasCfgOrg = await tableHasOrganizationId(db, "quote_source_configs");
      const raw = req.body && typeof req.body === "object" ? req.body : {};
      const row = mergeRowOrganizationId(raw, orgId, hasCfgOrg && Boolean(orgId));
      const { data, error } = await db.from("quote_source_configs").insert(row).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "quote_source_configs not installed." });
        }
        throw error;
      }
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/admin/quote-source-configs/:id", ...adminStack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const patch = { ...(req.body || {}), updated_at: new Date().toISOString() };
      delete patch.id;
      const { data, error } = await db.from("quote_source_configs").update(patch).eq("id", id).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "quote_source_configs not installed." });
        }
        throw error;
      }
      if (!data?.length) return res.status(404).json({ ok: false, error: "not found" });
      res.json({ ok: true, row: data[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/quote-sales-territories", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      let q = db.from("quote_sales_territories").select("*").order("priority", { ascending: true });
      if (orgId) {
        const has = await tableHasOrganizationId(db, "quote_sales_territories");
        const filt = has ? organizationScopeOrFilter(orgId) : null;
        if (filt) q = q.or(filt);
      }
      if (String(req.query.activeOnly || "") === "1") {
        q = q.eq("is_active", true);
      }
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "quote_sales_territories not installed." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/quote-sales-territories", ...adminStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasTerrOrg = await tableHasOrganizationId(db, "quote_sales_territories");
      const chk = validateTerritoryBody(req.body, {});
      if (!chk.ok) return res.status(400).json({ ok: false, error: chk.error });
      const insertRow = mergeRowOrganizationId(chk.row, orgId, hasTerrOrg && Boolean(orgId));
      const { data, error } = await db.from("quote_sales_territories").insert(insertRow).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "quote_sales_territories not installed." });
        }
        throw error;
      }
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/admin/quote-sales-territories/:id", ...adminStack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasTerrOrg = await tableHasOrganizationId(db, "quote_sales_territories");
      const { data: existingRows, error: exErr } = await db.from("quote_sales_territories").select("*").eq("id", id).limit(1);
      if (exErr) {
        if (isMissingRelationError(exErr)) {
          return res.status(503).json({ ok: false, installed: false, message: "quote_sales_territories not installed." });
        }
        throw exErr;
      }
      const existing = existingRows?.[0];
      if (!existing) return res.status(404).json({ ok: false, error: "not found" });
      if (hasTerrOrg && orgId && existing.organization_id != null && String(existing.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "not found" });
      }
      const raw = req.body || {};
      const body = { ...raw };
      if (raw.metadata !== undefined) {
        const em = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? { ...existing.metadata } : {};
        const bm = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? { ...raw.metadata } : {};
        body.metadata = { ...em, ...bm };
      }
      const merged = { ...existing, ...body };
      const chk = validateTerritoryBody(merged, existing);
      if (!chk.ok) return res.status(400).json({ ok: false, error: chk.error });
      const patch = { ...chk.row, updated_at: new Date().toISOString() };
      const { data, error } = await db.from("quote_sales_territories").update(patch).eq("id", id).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "quote_sales_territories not installed." });
        }
        throw error;
      }
      if (!data?.length) return res.status(404).json({ ok: false, error: "not found" });
      res.json({ ok: true, row: data[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/saas-foundation-status", ...adminStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const defaultOrg = await getDefaultOrganization(db);
      res.json({
        ok: true,
        current_organization_display_name: orgCtx.displayName || defaultOrg?.display_name || "Elite Stone Fabrication",
        current_organization_key: orgCtx.organizationKey || defaultOrg?.organization_key || null,
        saas_foundation_installed: Boolean(defaultOrg?.id),
        warnings: orgCtx.warnings || []
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  console.log(
    "[quote-pricing-admin] mounted sales-users, quote-pricing-structures*, quote-pricing-rules*, quote-partners*, pricing-assignment, quotes*, quote-analytics/summary, quote-source-configs*, quote-sales-territories*, saas-foundation-status"
  );
}
