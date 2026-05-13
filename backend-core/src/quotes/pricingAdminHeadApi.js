/**
 * Pricing Admin Head — REST APIs for foundation tables (`eliteos_pricing_admin_foundation.sql`).
 * Auth: requireAuth + requireRole(admin|finance|executive) + requireHeadAccess("pricing_admin").
 * Admin role bypasses head check inside middleware but still passes role gate.
 */
import express from "express";

import {
  mergeRowOrganizationId,
  organizationScopeOrFilter,
  resolveOrganizationContext,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";
import { isPricingAdminFoundationInstalled, resolvePricingAdminConfig } from "./pricingConfigResolver.js";

const jsonParser = express.json({ limit: "512kb" });

const RATE_TYPES = new Set(["direct", "wholesale", "public", "partner_tier_1", "partner_tier_2", "partner_tier_3"]);

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function numOrUndef(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {Record<string, unknown>} row
 */
async function insertPricingAudit(db, row) {
  try {
    const { error } = await db.from("quote_pricing_audit_log").insert(row);
    if (error && isMissingRelationError(error)) return;
    if (error) console.warn("[pricing-admin] audit insert failed", error.message);
  } catch (e) {
    if (!isMissingRelationError(e)) console.warn("[pricing-admin] audit insert failed", e);
  }
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachPricingAdminHeadApi(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  const headAccessPricingAdmin = requireHeadAccess("pricing_admin", { getSupabase });
  const supabaseGetter = () => getSupabase();
  const pricingStack = [requireAuth(), requireRole(["admin", "finance", "executive"]), headAccessPricingAdmin];

  app.get("/api/pricing-admin/status", ...pricingStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const installed = await isPricingAdminFoundationInstalled(db);
      res.json({ ok: true, installed, message: installed ? "Pricing Admin tables present." : "Apply eliteos_pricing_admin_foundation.sql in Supabase." });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/pricing-admin/config-preview", ...pricingStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const cfg = await resolvePricingAdminConfig(db, { organizationId });
      res.json({ ok: true, ...cfg });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/pricing-admin/price-groups", ...pricingStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_price_groups");
      let q = db.from("quote_price_groups").select("*").order("sort_order", { ascending: true });
      const filt = orgId && hasOrg ? organizationScopeOrFilter(orgId) : null;
      if (filt) q = q.or(filt);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Pricing Admin foundation SQL not applied." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/pricing-admin/price-groups", ...pricingStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_price_groups");
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const group_code = String(b.group_code || "").trim().toLowerCase();
      const display_name = String(b.display_name || "").trim();
      if (!group_code || !display_name) return res.status(400).json({ ok: false, error: "group_code and display_name required" });
      const row = mergeRowOrganizationId(
        {
          group_code,
          display_name,
          sort_order: numOrUndef(b.sort_order) ?? 100,
          is_active: b.is_active !== undefined ? Boolean(b.is_active) : true
        },
        orgId,
        hasOrg && Boolean(orgId)
      );
      const { data, error } = await db.from("quote_price_groups").insert(row).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Pricing Admin foundation SQL not applied." });
        }
        throw error;
      }
      await insertPricingAudit(db, {
        organization_id: orgId,
        actor_user_id: String(req.user?.id || ""),
        action: "create",
        entity_type: "quote_price_groups",
        entity_id: data?.[0]?.id ?? null,
        before_value: null,
        after_value: data?.[0] ?? null
      });
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/pricing-admin/price-groups/:id", ...pricingStack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_price_groups");
      const { data: exRows, error: exErr } = await db.from("quote_price_groups").select("*").eq("id", id).limit(1);
      if (exErr) {
        if (isMissingRelationError(exErr)) return res.status(503).json({ ok: false, installed: false });
        throw exErr;
      }
      const existing = exRows?.[0];
      if (!existing) return res.status(404).json({ ok: false, error: "not found" });
      if (hasOrg && orgId && existing.organization_id != null && String(existing.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "not found" });
      }
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const patch = {
        display_name: b.display_name !== undefined ? String(b.display_name).trim() : existing.display_name,
        sort_order: b.sort_order !== undefined ? Number(b.sort_order) : existing.sort_order,
        is_active: b.is_active !== undefined ? Boolean(b.is_active) : existing.is_active,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await db.from("quote_price_groups").update(patch).eq("id", id).select("*").limit(1);
      if (error) throw error;
      await insertPricingAudit(db, {
        organization_id: orgId,
        actor_user_id: String(req.user?.id || ""),
        action: "update",
        entity_type: "quote_price_groups",
        entity_id: id,
        before_value: existing,
        after_value: data?.[0] ?? patch
      });
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/pricing-admin/rates", ...pricingStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_price_group_rates");
      let q = db.from("quote_price_group_rates").select("*").order("created_at", { ascending: false });
      const filt = orgId && hasOrg ? organizationScopeOrFilter(orgId) : null;
      if (filt) q = q.or(filt);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Pricing Admin foundation SQL not applied." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/pricing-admin/rates", ...pricingStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_price_group_rates");
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const price_group_id = String(b.price_group_id || "").trim();
      const rate_type = String(b.rate_type || "").trim();
      if (!isUuid(price_group_id)) return res.status(400).json({ ok: false, error: "price_group_id must be uuid" });
      if (!RATE_TYPES.has(rate_type)) return res.status(400).json({ ok: false, error: `invalid rate_type` });
      const rate = numOrUndef(b.rate_per_sqft);
      if (rate == null || rate < 0) return res.status(400).json({ ok: false, error: "rate_per_sqft required" });
      const row = mergeRowOrganizationId(
        {
          price_group_id,
          rate_type,
          rate_per_sqft: rate,
          effective_start_date: b.effective_start_date ? String(b.effective_start_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
          effective_end_date: b.effective_end_date ? String(b.effective_end_date).slice(0, 10) : null,
          is_active: b.is_active !== undefined ? Boolean(b.is_active) : true,
          created_by: String(req.user?.email || req.user?.id || "")
        },
        orgId,
        hasOrg && Boolean(orgId)
      );
      const { data, error } = await db.from("quote_price_group_rates").insert(row).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) return res.status(503).json({ ok: false, installed: false });
        throw error;
      }
      await insertPricingAudit(db, {
        organization_id: orgId,
        actor_user_id: String(req.user?.id || ""),
        action: "create",
        entity_type: "quote_price_group_rates",
        entity_id: data?.[0]?.id ?? null,
        before_value: null,
        after_value: data?.[0] ?? null
      });
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/pricing-admin/rates/:id", ...pricingStack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_price_group_rates");
      const { data: exRows, error: exErr } = await db.from("quote_price_group_rates").select("*").eq("id", id).limit(1);
      if (exErr) {
        if (isMissingRelationError(exErr)) return res.status(503).json({ ok: false, installed: false });
        throw exErr;
      }
      const existing = exRows?.[0];
      if (!existing) return res.status(404).json({ ok: false, error: "not found" });
      if (hasOrg && orgId && existing.organization_id != null && String(existing.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "not found" });
      }
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const rate_type = b.rate_type !== undefined ? String(b.rate_type).trim() : existing.rate_type;
      if (!RATE_TYPES.has(rate_type)) return res.status(400).json({ ok: false, error: "invalid rate_type" });
      const rate = b.rate_per_sqft !== undefined ? numOrUndef(b.rate_per_sqft) : existing.rate_per_sqft;
      if (rate == null || rate < 0) return res.status(400).json({ ok: false, error: "invalid rate_per_sqft" });
      const patch = {
        rate_type,
        rate_per_sqft: rate,
        effective_start_date:
          b.effective_start_date !== undefined ? String(b.effective_start_date).slice(0, 10) : existing.effective_start_date,
        effective_end_date:
          b.effective_end_date !== undefined ?
            b.effective_end_date === null ? null
            : String(b.effective_end_date).slice(0, 10)
          : existing.effective_end_date,
        is_active: b.is_active !== undefined ? Boolean(b.is_active) : existing.is_active,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await db.from("quote_price_group_rates").update(patch).eq("id", id).select("*").limit(1);
      if (error) throw error;
      await insertPricingAudit(db, {
        organization_id: orgId,
        actor_user_id: String(req.user?.id || ""),
        action: "update",
        entity_type: "quote_price_group_rates",
        entity_id: id,
        before_value: existing,
        after_value: data?.[0] ?? patch
      });
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/pricing-admin/addons", ...pricingStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_addon_catalog");
      let q = db.from("quote_addon_catalog").select("*").order("sort_order", { ascending: true });
      const filt = orgId && hasOrg ? organizationScopeOrFilter(orgId) : null;
      if (filt) q = q.or(filt);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Pricing Admin foundation SQL not applied." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/pricing-admin/addons", ...pricingStack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_addon_catalog");
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const addon_code = String(b.addon_code || "").trim().toLowerCase();
      const display_name = String(b.display_name || "").trim();
      if (!addon_code || !display_name) return res.status(400).json({ ok: false, error: "addon_code and display_name required" });
      const price = numOrUndef(b.base_price);
      if (price == null || price < 0) return res.status(400).json({ ok: false, error: "base_price required" });
      const row = mergeRowOrganizationId(
        {
          addon_code,
          display_name,
          category: String(b.category || "addon").trim() || "addon",
          base_price: price,
          pricing_mode: String(b.pricing_mode || "flat").trim() || "flat",
          applies_to: b.applies_to != null ? String(b.applies_to) : null,
          sort_order: numOrUndef(b.sort_order) ?? 200,
          is_active: b.is_active !== undefined ? Boolean(b.is_active) : true
        },
        orgId,
        hasOrg && Boolean(orgId)
      );
      const { data, error } = await db.from("quote_addon_catalog").insert(row).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) return res.status(503).json({ ok: false, installed: false });
        throw error;
      }
      await insertPricingAudit(db, {
        organization_id: orgId,
        actor_user_id: String(req.user?.id || ""),
        action: "create",
        entity_type: "quote_addon_catalog",
        entity_id: data?.[0]?.id ?? null,
        before_value: null,
        after_value: data?.[0] ?? null
      });
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/pricing-admin/addons/:id", ...pricingStack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_addon_catalog");
      const { data: exRows, error: exErr } = await db.from("quote_addon_catalog").select("*").eq("id", id).limit(1);
      if (exErr) {
        if (isMissingRelationError(exErr)) return res.status(503).json({ ok: false, installed: false });
        throw exErr;
      }
      const existing = exRows?.[0];
      if (!existing) return res.status(404).json({ ok: false, error: "not found" });
      if (hasOrg && orgId && existing.organization_id != null && String(existing.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "not found" });
      }
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const patch = {
        display_name: b.display_name !== undefined ? String(b.display_name).trim() : existing.display_name,
        category: b.category !== undefined ? String(b.category).trim() : existing.category,
        base_price: b.base_price !== undefined ? numOrUndef(b.base_price) : existing.base_price,
        pricing_mode: b.pricing_mode !== undefined ? String(b.pricing_mode).trim() : existing.pricing_mode,
        applies_to: b.applies_to !== undefined ? (b.applies_to === null ? null : String(b.applies_to)) : existing.applies_to,
        sort_order: b.sort_order !== undefined ? Number(b.sort_order) : existing.sort_order,
        is_active: b.is_active !== undefined ? Boolean(b.is_active) : existing.is_active,
        updated_at: new Date().toISOString()
      };
      if (patch.base_price != null && patch.base_price < 0) return res.status(400).json({ ok: false, error: "invalid base_price" });
      const { data, error } = await db.from("quote_addon_catalog").update(patch).eq("id", id).select("*").limit(1);
      if (error) throw error;
      await insertPricingAudit(db, {
        organization_id: orgId,
        actor_user_id: String(req.user?.id || ""),
        action: "update",
        entity_type: "quote_addon_catalog",
        entity_id: id,
        before_value: existing,
        after_value: data?.[0] ?? patch
      });
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/pricing-admin/rules", ...pricingStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_pricing_policy_rules");
      let q = db.from("quote_pricing_policy_rules").select("*").order("rule_key", { ascending: true });
      const filt = orgId && hasOrg ? organizationScopeOrFilter(orgId) : null;
      if (filt) q = q.or(filt);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Pricing Admin foundation SQL not applied." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch("/api/pricing-admin/rules/:ruleKey", ...pricingStack, jsonParser, async (req, res) => {
    try {
      const ruleKey = decodeURIComponent(String(req.params.ruleKey || "").trim());
      if (!ruleKey) return res.status(400).json({ ok: false, error: "ruleKey required" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_pricing_policy_rules");
      const defaultOrg = await getDefaultOrganization(db);
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const rule_value = b.rule_value !== undefined ? b.rule_value : b.ruleValue;
      if (rule_value !== undefined && rule_value !== null && typeof rule_value !== "object") {
        return res.status(400).json({ ok: false, error: "rule_value must be a JSON object" });
      }
      const filt = orgId && hasOrg ? organizationScopeOrFilter(orgId) : "organization_id.is.null";
      const { data: rows, error: findErr } = await db
        .from("quote_pricing_policy_rules")
        .select("*")
        .eq("rule_key", ruleKey)
        .or(filt)
        .order("organization_id", { ascending: false })
        .limit(20);
      if (findErr) {
        if (isMissingRelationError(findErr)) return res.status(503).json({ ok: false, installed: false });
        throw findErr;
      }
      const pick =
        (rows || []).find((r) => orgId && r.organization_id && String(r.organization_id) === String(orgId)) ||
        (rows || []).find((r) => r.organization_id == null);
      if (!pick) return res.status(404).json({ ok: false, error: "rule not found" });
      if (ruleKey === "public_consumer_markup_percent" && rule_value && Number(rule_value.percent) < 25) {
        return res.status(400).json({ ok: false, error: "public_consumer_markup_percent.percent must be >= 25" });
      }
      const patch = {
        rule_value: rule_value !== undefined ? rule_value : pick.rule_value,
        rule_name: b.rule_name !== undefined ? String(b.rule_name).trim() : pick.rule_name,
        is_active: b.is_active !== undefined ? Boolean(b.is_active) : pick.is_active,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await db.from("quote_pricing_policy_rules").update(patch).eq("id", pick.id).select("*").limit(1);
      if (error) throw error;
      await insertPricingAudit(db, {
        organization_id: orgId,
        actor_user_id: String(req.user?.id || ""),
        action: "update",
        entity_type: "quote_pricing_policy_rules",
        entity_id: pick.id,
        before_value: pick,
        after_value: data?.[0] ?? patch
      });
      res.json({ ok: true, row: data?.[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/pricing-admin/audit-log", ...pricingStack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_pricing_audit_log");
      let q = db.from("quote_pricing_audit_log").select("*").order("created_at", { ascending: false }).limit(100);
      if (orgId && hasOrg) q = q.or(`organization_id.eq.${orgId},organization_id.is.null`);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "quote_pricing_audit_log not installed." });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, rows: data ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  console.log(
    "[pricing-admin-head] mounted GET/POST/PATCH /api/pricing-admin/price-groups*, rates*, addons*, rules*, audit-log, status, config-preview"
  );
}
