/**
 * Partner Setup Admin — configure partner accounts, assignments, branding, and user access.
 * Primary UI: Pricing Admin (`/api/pricing-admin/partner-setup/*`).
 * Mirrors key admin paths under `/api/admin/quote-partners/*` for tooling parity.
 */

import express from "express";

import {
  mergeRowOrganizationId,
  resolveOrganizationContext,
  tableHasOrganizationId
} from "../organizations/organizationContext.js";
import {
  attachCurrentAssignmentsToPartners,
  buildPartnerSetupStatus,
  endActiveAssignmentsForPartner,
  ensurePartnerQuoteHeadAccess,
  findUserProfileByEmail,
  isMissingRelationError,
  isUuid,
  loadPartnerAccountForOrg,
  normalizeAccountSlug,
  requirePartnerSetupAdminHead,
  userHasPartnerQuoteHead
} from "./partnerSetupHelpers.js";

const jsonParser = express.json({ limit: "1mb" });

const PARTNER_ACCESS_ROLES = new Set(["partner_admin", "partner_user", "viewer"]);

function partnerAccountPatchFromBody(b) {
  const patch = { updated_at: new Date().toISOString() };
  if (b.account_name != null) patch.account_name = String(b.account_name).trim();
  if (b.account_type != null) patch.account_type = String(b.account_type).trim();
  if (b.account_slug != null) patch.account_slug = normalizeAccountSlug(b.account_slug);
  if (b.display_name != null) patch.display_name = String(b.display_name).trim() || null;
  if (b.status != null) {
    const st = String(b.status).trim().toLowerCase();
    patch.status = st === "inactive" ? "inactive" : "active";
    patch.is_active = st !== "inactive";
  }
  if (b.is_active !== undefined) {
    patch.is_active = Boolean(b.is_active);
    patch.status = patch.is_active ? "active" : "inactive";
  }
  if (b.monday_account_id !== undefined) patch.monday_account_id = b.monday_account_id == null ? null : String(b.monday_account_id).trim();
  if (b.moraware_account_id !== undefined) {
    patch.moraware_account_id = b.moraware_account_id == null ? null : String(b.moraware_account_id).trim();
  }
  if (b.default_sales_rep !== undefined) {
    patch.default_sales_rep = b.default_sales_rep == null ? null : String(b.default_sales_rep).trim();
  }
  if (b.default_branch !== undefined) patch.default_branch = b.default_branch == null ? null : String(b.default_branch).trim();
  if (b.metadata !== undefined) patch.metadata = typeof b.metadata === "object" && b.metadata ? b.metadata : {};
  return patch;
}

/**
 * @param {import("express").Express} app
 * @param {string} routePrefix — e.g. `/api/pricing-admin/partner-setup` or `/api/admin`
 * @param {import("express").RequestHandler[]} middlewareStack
 * @param {() => import("@supabase/supabase-js").SupabaseClient} supabaseGetter
 */
function mountPartnerSetupRoutes(app, routePrefix, middlewareStack, supabaseGetter) {
  const stack = middlewareStack;
  const p = routePrefix.replace(/\/$/, "");

  app.get(`${p}/organization`, ...stack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const orgCtx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      res.json({
        ok: true,
        organization: {
          id: orgCtx.organizationId,
          key: orgCtx.organizationKey,
          display_name: orgCtx.displayName,
          source: orgCtx.source,
          warnings: orgCtx.warnings || []
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get(`${p}/pricing-structures`, ...stack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const hasOrg = await tableHasOrganizationId(db, "quote_pricing_structures");
      let q = db
        .from("quote_pricing_structures")
        .select("id,code,name,pricing_mode,is_active,retail_markup_percent")
        .order("name");
      if (orgId && hasOrg) q = q.or(`organization_id.eq.${orgId},organization_id.is.null`);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote pricing structures not installed." });
        }
        throw error;
      }
      const rows = (data || []).filter((r) => r.is_active !== false);
      res.json({ ok: true, rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  const partnersPath = p.endsWith("/admin") ? `${p}/quote-partners` : `${p}/partners`;

  app.get(partnersPath, ...stack, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      const has = await tableHasOrganizationId(db, "quote_partner_accounts");
      let q = db.from("quote_partner_accounts").select("*").order("account_name");
      if (orgId && has) q = q.eq("organization_id", orgId);
      const { data, error } = await q;
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [], message: "Quote partner tables not installed." });
        }
        throw error;
      }
      const rows = await attachCurrentAssignmentsToPartners(db, data ?? []);
      res.json({ ok: true, installed: true, organization_id: orgId, rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get(`${partnersPath}/:id`, ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row, missing } = await loadPartnerAccountForOrg(db, id, orgId);
      if (missing) return res.status(503).json({ ok: false, installed: false, message: "Partner tables not installed." });
      if (!row) return res.status(404).json({ ok: false, error: "partner not found" });
      const [withAsn] = await attachCurrentAssignmentsToPartners(db, [row]);
      res.json({ ok: true, row: withAsn });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post(partnersPath, ...stack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const hasPartnerOrg = await tableHasOrganizationId(db, "quote_partner_accounts");
      const b = req.body || {};
      const status = String(b.status || "active").trim().toLowerCase() === "inactive" ? "inactive" : "active";
      const row = mergeRowOrganizationId(
        {
          account_name: String(b.account_name || "").trim() || "Unnamed partner",
          account_type: String(b.account_type || "builder").trim() || "builder",
          account_slug: normalizeAccountSlug(b.account_slug || b.account_name),
          display_name: b.display_name != null ? String(b.display_name).trim() || null : null,
          status,
          is_active: status === "active",
          monday_account_id: b.monday_account_id != null ? String(b.monday_account_id).trim() || null : null,
          moraware_account_id: b.moraware_account_id != null ? String(b.moraware_account_id).trim() || null : null,
          default_sales_rep: b.default_sales_rep != null ? String(b.default_sales_rep).trim() || null : null,
          default_branch: b.default_branch != null ? String(b.default_branch).trim() || null : null,
          metadata: typeof b.metadata === "object" && b.metadata ? b.metadata : {}
        },
        orgId,
        hasPartnerOrg
      );
      const { data, error } = await db.from("quote_partner_accounts").insert(row).select("*").limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, message: "Partner tables not installed." });
        }
        throw error;
      }
      res.json({ ok: true, row: data?.[0] ?? null });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.patch(`${partnersPath}/:id`, ...stack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row: existing, missing } = await loadPartnerAccountForOrg(db, id, orgId);
      if (missing) return res.status(503).json({ ok: false, installed: false });
      if (!existing) return res.status(404).json({ ok: false, error: "partner not found" });
      const patch = partnerAccountPatchFromBody(req.body || {});
      const { data, error } = await db.from("quote_partner_accounts").update(patch).eq("id", id).select("*").limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "partner not found" });
      const [withAsn] = await attachCurrentAssignmentsToPartners(db, [row]);
      res.json({ ok: true, row: withAsn });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get(`${partnersPath}/:id/setup-status`, ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row, missing } = await loadPartnerAccountForOrg(db, id, orgId);
      if (missing) return res.status(503).json({ ok: false, installed: false });
      if (!row) return res.status(404).json({ ok: false, error: "partner not found" });
      const status = await buildPartnerSetupStatus(db, orgId, row);
      res.json({ ok: true, organization_id: orgId, partner: row, setup: status });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post(`${partnersPath}/:id/check-context`, ...stack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row, missing } = await loadPartnerAccountForOrg(db, id, orgId);
      if (missing) return res.status(503).json({ ok: false, installed: false });
      if (!row) return res.status(404).json({ ok: false, error: "partner not found" });
      const setup = await buildPartnerSetupStatus(db, orgId, row);
      res.json({
        ok: true,
        organization_id: orgId,
        partner_account_id: id,
        message: "Server-side readiness check (no partner bearer token required).",
        setup
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get(`${partnersPath}/:id/pricing-assignment`, ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row, missing } = await loadPartnerAccountForOrg(db, id, orgId);
      if (!row) return res.status(404).json({ ok: false, error: "partner not found" });
      if (missing) return res.status(503).json({ ok: false, installed: false });
      const { data: history, error } = await db
        .from("quote_partner_pricing_assignments")
        .select("*")
        .eq("partner_account_id", id)
        .order("starts_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      const current = (history || []).find((h) => h.is_active) || null;
      let pricing_structure = null;
      if (current?.pricing_structure_id) {
        const { data: srows } = await db
          .from("quote_pricing_structures")
          .select("id,code,name,pricing_mode,is_active")
          .eq("id", current.pricing_structure_id)
          .limit(1);
        pricing_structure = srows?.[0] || null;
      }
      res.json({ ok: true, organization_id: orgId, current: current ? { ...current, pricing_structure } : null, history: history ?? [] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post(`${partnersPath}/:id/pricing-assignment`, ...stack, jsonParser, async (req, res) => {
    try {
      const db = supabaseGetter();
      const partnerId = String(req.params.id || "").trim();
      const pricing_structure_id = String(req.body?.pricing_structure_id || "").trim();
      if (!isUuid(partnerId) || !isUuid(pricing_structure_id)) {
        return res.status(400).json({ ok: false, error: "partner id and pricing_structure_id must be valid uuids" });
      }
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row: partner, missing } = await loadPartnerAccountForOrg(db, partnerId, orgId);
      if (missing) return res.status(503).json({ ok: false, installed: false });
      if (!partner) return res.status(404).json({ ok: false, error: "partner not found" });
      const { data: sRow, error: sErr } = await db.from("quote_pricing_structures").select("id,code,name").eq("id", pricing_structure_id).limit(1);
      if (sErr) throw sErr;
      if (!sRow?.length) return res.status(404).json({ ok: false, error: "pricing structure not found" });

      await endActiveAssignmentsForPartner(db, partnerId);
      const userEmail = String(req.user?.email || req.user?.id || "admin");
      const hasAsnOrg = await tableHasOrganizationId(db, "quote_partner_pricing_assignments");
      const insertRow = mergeRowOrganizationId(
        {
          partner_account_id: partnerId,
          pricing_structure_id,
          assigned_by: userEmail,
          is_active: true,
          starts_at: new Date().toISOString(),
          metadata: typeof req.body?.metadata === "object" && req.body.metadata ? req.body.metadata : {}
        },
        orgId,
        hasAsnOrg
      );
      const { data, error } = await db.from("quote_partner_pricing_assignments").insert(insertRow).select("*").limit(1);
      if (error) throw error;
      const assignment = data?.[0] ?? null;
      res.json({
        ok: true,
        assignment: assignment
          ? { ...assignment, pricing_structure: { id: sRow[0].id, code: sRow[0].code, name: sRow[0].name } }
          : null
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get(`${partnersPath}/:id/branding`, ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row: partner } = await loadPartnerAccountForOrg(db, id, orgId);
      if (!partner) return res.status(404).json({ ok: false, error: "partner not found" });
      const { data, error } = await db
        .from("quote_partner_branding_settings")
        .select("*")
        .eq("partner_account_id", id)
        .limit(1);
      if (error) {
        if (isMissingRelationError(error)) {
          return res.json({ ok: true, installed: false, row: null, message: "Apply partner_quote_foundation_v1_additive.sql" });
        }
        throw error;
      }
      res.json({ ok: true, installed: true, row: data?.[0] ?? null });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post(`${partnersPath}/:id/branding`, ...stack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row: partner } = await loadPartnerAccountForOrg(db, id, orgId);
      if (!partner) return res.status(404).json({ ok: false, error: "partner not found" });
      const b = req.body || {};
      const payload = {
        organization_id: orgId,
        partner_account_id: id,
        logo_url: b.logo_url != null ? String(b.logo_url).trim() || null : null,
        primary_color: b.primary_color != null ? String(b.primary_color).trim() || null : null,
        secondary_color: b.secondary_color != null ? String(b.secondary_color).trim() || null : null,
        display_name_override: b.display_name_override != null ? String(b.display_name_override).trim() || null : null,
        footer_text: b.footer_text != null ? String(b.footer_text).trim() || null : null,
        terms_text: b.terms_text != null ? String(b.terms_text).trim() || null : null,
        is_active: b.is_active !== false,
        updated_at: new Date().toISOString()
      };
      const { data: existing } = await db.from("quote_partner_branding_settings").select("id").eq("partner_account_id", id).limit(1);
      let row;
      if (existing?.[0]?.id) {
        const { data, error } = await db
          .from("quote_partner_branding_settings")
          .update(payload)
          .eq("id", existing[0].id)
          .select("*")
          .limit(1);
        if (error) throw error;
        row = data?.[0];
      } else {
        const { data, error } = await db.from("quote_partner_branding_settings").insert(payload).select("*").limit(1);
        if (error) {
          if (isMissingRelationError(error)) {
            return res.status(503).json({ ok: false, installed: false, message: "Branding table not installed." });
          }
          throw error;
        }
        row = data?.[0];
      }
      res.json({ ok: true, row });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get(`${partnersPath}/:id/user-access`, ...stack, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row: partner } = await loadPartnerAccountForOrg(db, id, orgId);
      if (!partner) return res.status(404).json({ ok: false, error: "partner not found" });
      const { data, error } = await db
        .from("quote_partner_user_access")
        .select("id,user_id,role,is_active,created_at,updated_at")
        .eq("organization_id", orgId)
        .eq("partner_account_id", id)
        .order("created_at", { ascending: false });
      if (error) {
        if (isMissingRelationError(error)) {
          return res.status(503).json({ ok: false, installed: false, rows: [] });
        }
        throw error;
      }
      const rows = [];
      for (const acc of data || []) {
        const uid = String(acc.user_id);
        const { data: prof } = await db.from("user_profiles").select("id,email,full_name,user_kind,is_active").eq("id", uid).limit(1);
        const hasHead = await userHasPartnerQuoteHead(db, uid);
        rows.push({
          ...acc,
          user: prof?.[0] ?? null,
          has_partner_quote_head: hasHead
        });
      }
      res.json({ ok: true, rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post(`${partnersPath}/:id/user-access`, ...stack, jsonParser, async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "invalid id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { row: partner } = await loadPartnerAccountForOrg(db, id, orgId);
      if (!partner) return res.status(404).json({ ok: false, error: "partner not found" });

      const b = req.body || {};
      const role = String(b.role || "partner_user").trim();
      if (!PARTNER_ACCESS_ROLES.has(role)) {
        return res.status(400).json({ ok: false, error: "role must be partner_admin, partner_user, or viewer" });
      }
      let userId = String(b.user_id || "").trim();
      if (!userId && b.email) {
        const prof = await findUserProfileByEmail(db, b.email);
        if (!prof?.id) return res.status(404).json({ ok: false, error: "No user profile found for that email" });
        userId = String(prof.id);
      }
      if (!isUuid(userId)) return res.status(400).json({ ok: false, error: "user_id or email required" });

      const grantHead = b.grant_partner_quote_head !== false;
      let headResult = null;
      if (grantHead) headResult = await ensurePartnerQuoteHeadAccess(db, userId);

      const adminId = String(req.user?.id || "").trim() || null;
      const insertRow = {
        organization_id: orgId,
        partner_account_id: id,
        user_id: userId,
        role,
        is_active: true,
        created_by: adminId,
        updated_by: adminId
      };
      const { data: existing } = await db
        .from("quote_partner_user_access")
        .select("id")
        .eq("organization_id", orgId)
        .eq("partner_account_id", id)
        .eq("user_id", userId)
        .limit(1);
      let accessRow;
      if (existing?.[0]?.id) {
        const { data, error } = await db
          .from("quote_partner_user_access")
          .update({ role, is_active: true, updated_at: new Date().toISOString(), updated_by: adminId })
          .eq("id", existing[0].id)
          .select("*")
          .limit(1);
        if (error) throw error;
        accessRow = data?.[0];
      } else {
        const { data, error } = await db.from("quote_partner_user_access").insert(insertRow).select("*").limit(1);
        if (error) {
          if (isMissingRelationError(error)) {
            return res.status(503).json({ ok: false, installed: false, message: "quote_partner_user_access not installed." });
          }
          throw error;
        }
        accessRow = data?.[0];
      }

      const { data: prof } = await db.from("user_profiles").select("id,email,full_name,user_kind").eq("id", userId).limit(1);
      res.json({
        ok: true,
        row: accessRow,
        user: prof?.[0] ?? null,
        partner_quote_head: headResult,
        note: "External partner invites are not sent from this screen — assign existing internal/test users only."
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  const userAccessPatchPath =
    p.endsWith("/admin") ? `${p}/quote-partner-user-access/:accessId` : `${p}/user-access/:accessId`;

  app.patch(userAccessPatchPath, ...stack, jsonParser, async (req, res) => {
    try {
      const accessId = String(req.params.accessId || "").trim();
      if (!isUuid(accessId)) return res.status(400).json({ ok: false, error: "invalid access id" });
      const db = supabaseGetter();
      const { organizationId: orgId } = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
      if (!orgId) return res.status(503).json({ ok: false, error: "organization context required" });
      const { data: existing, error: exErr } = await db
        .from("quote_partner_user_access")
        .select("*")
        .eq("id", accessId)
        .limit(1);
      if (exErr) throw exErr;
      const row = existing?.[0];
      if (!row || String(row.organization_id) !== String(orgId)) {
        return res.status(404).json({ ok: false, error: "access row not found" });
      }
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString(), updated_by: String(req.user?.id || "").trim() || null };
      if (b.role != null) {
        const role = String(b.role).trim();
        if (!PARTNER_ACCESS_ROLES.has(role)) {
          return res.status(400).json({ ok: false, error: "invalid role" });
        }
        patch.role = role;
      }
      if (b.is_active !== undefined) patch.is_active = Boolean(b.is_active);
      const { data, error } = await db.from("quote_partner_user_access").update(patch).eq("id", accessId).select("*").limit(1);
      if (error) throw error;
      res.json({ ok: true, row: data?.[0] ?? null });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireRole: Function, requireHeadAccess: Function, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachPartnerSetupAdminApi(app, deps) {
  const { requireAuth, requireRole, getSupabase } = deps;
  const supabaseGetter = () => getSupabase();
  const partnerSetupHead = requirePartnerSetupAdminHead({ getSupabase });
  const pricingStack = [requireAuth(), requireRole(["admin", "finance", "executive"]), partnerSetupHead];
  const adminStack = [requireAuth(), requireRole(["admin", "finance", "executive"]), partnerSetupHead];

  mountPartnerSetupRoutes(app, "/api/pricing-admin/partner-setup", pricingStack, supabaseGetter);
  mountPartnerSetupRoutes(app, "/api/admin", adminStack, supabaseGetter);

  console.log(
    "[partner-setup-admin] mounted /api/pricing-admin/partner-setup/* and /api/admin/quote-partners/* setup routes (pricing_admin or system_admin)"
  );
}
