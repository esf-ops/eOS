/**
 * Shared helpers for Partner Setup Admin (Pricing Admin + quote pricing admin APIs).
 */

import { isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { resolveHeadAccessContext } from "../me/launcherHeads.js";
import { tableHasOrganizationId } from "../organizations/organizationContext.js";
import { pickPartnerAccountFromAccesses } from "./partnerQuoteSanitize.js";

export function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

export function normalizeAccountSlug(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || null;
}

const PARTNER_ACCESS_ROLES = new Set(["partner_admin", "partner_user", "viewer"]);

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} partnerId
 * @param {string} organizationId
 */
export async function loadPartnerAccountForOrg(db, partnerId, organizationId) {
  const { data, error } = await db.from("quote_partner_accounts").select("*").eq("id", partnerId).limit(1);
  if (error) {
    if (isMissingRelationError(error)) return { row: null, missing: true };
    throw error;
  }
  const row = data?.[0];
  if (!row) return { row: null, missing: false };
  const hasOrg = await tableHasOrganizationId(db, "quote_partner_accounts");
  if (hasOrg && organizationId && row.organization_id != null && String(row.organization_id) !== String(organizationId)) {
    return { row: null, missing: false };
  }
  return { row, missing: false };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 */
export async function attachCurrentAssignmentsToPartners(db, partners) {
  const rows = partners ?? [];
  if (!rows.length) return rows.map((p) => ({ ...p, current_pricing_assignment: null }));
  const ids = rows.map((p) => p.id);
  const { data: assigns, error: aErr } = await db
    .from("quote_partner_pricing_assignments")
    .select("*")
    .in("partner_account_id", ids)
    .eq("is_active", true);
  if (aErr) throw aErr;
  const structIds = [...new Set((assigns || []).map((a) => a.pricing_structure_id).filter(Boolean))];
  let structById = {};
  if (structIds.length) {
    const { data: structs, error: sErr } = await db
      .from("quote_pricing_structures")
      .select("id,code,name,pricing_mode,is_active")
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

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} partnerId
 */
export async function endActiveAssignmentsForPartner(db, partnerId) {
  const nowIso = new Date().toISOString();
  const { error } = await db
    .from("quote_partner_pricing_assignments")
    .update({ is_active: false, ends_at: nowIso })
    .eq("partner_account_id", partnerId)
    .eq("is_active", true);
  if (error) throw error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} email
 */
export async function findUserProfileByEmail(db, email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const { data, error } = await db.from("user_profiles").select("id,email,full_name,user_kind,is_active").ilike("email", e).limit(5);
  if (error) throw error;
  const exact = (data || []).find((r) => String(r.email || "").trim().toLowerCase() === e);
  return exact || data?.[0] || null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} userId
 */
export async function userHasPartnerQuoteHead(db, userId) {
  const { data, error } = await db
    .from("user_head_access")
    .select("head_slug")
    .eq("user_id", userId)
    .eq("head_slug", "partner_quote")
    .limit(1);
  if (error) {
    if (isMissingRelationError(error)) return false;
    throw error;
  }
  return Boolean(data?.length);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} userId
 */
export async function ensurePartnerQuoteHeadAccess(db, userId) {
  if (!isKnownHeadSlug("partner_quote")) return { ok: false, error: "partner_quote head unknown" };
  const has = await userHasPartnerQuoteHead(db, userId);
  if (has) return { ok: true, granted: false, already_present: true };
  const { error } = await db.from("user_head_access").insert({ user_id: userId, head_slug: "partner_quote" });
  if (error) throw error;
  return { ok: true, granted: true, already_present: false };
}

/**
 * Admin-side partner context simulation for a specific user (no bearer token).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ organizationId: string, userId: string, partnerAccountId: string }} params
 */
export async function simulatePartnerContextForUser(db, params) {
  const { organizationId, userId, partnerAccountId } = params;
  const { data: accessRows, error: aErr } = await db
    .from("quote_partner_user_access")
    .select("partner_account_id,role,is_active")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true);
  if (aErr) {
    if (isMissingRelationError(aErr)) {
      return { ok: false, code: "partner_foundation_missing", error: "quote_partner_user_access not installed" };
    }
    throw aErr;
  }
  const picked = pickPartnerAccountFromAccesses(accessRows || [], { partnerAccountId });
  if ("error" in picked) {
    return { ok: false, code: picked.code, error: picked.error };
  }
  const { row: partner } = await loadPartnerAccountForOrg(db, partnerAccountId, organizationId);
  if (!partner) return { ok: false, code: "partner_account_not_found", error: "Partner account not found for organization" };

  const { data: asn } = await db
    .from("quote_partner_pricing_assignments")
    .select("pricing_structure_id")
    .eq("partner_account_id", partnerAccountId)
    .eq("is_active", true)
    .order("starts_at", { ascending: false })
    .limit(1);
  let structure = null;
  const psId = asn?.[0]?.pricing_structure_id;
  if (psId) {
    const { data: srows } = await db.from("quote_pricing_structures").select("id,code,name").eq("id", psId).limit(1);
    structure = srows?.[0] || null;
  }

  return {
    ok: true,
    partner_role: picked.role,
    partner_account: {
      id: partner.id,
      account_slug: partner.account_slug ?? null,
      display_name: partner.display_name || partner.account_name
    },
    pricing: structure ? { structure_code: structure.code, structure_name: structure.name } : null
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {Record<string, unknown>} partnerRow
 */
export async function buildPartnerSetupStatus(db, organizationId, partnerRow) {
  const partnerId = String(partnerRow.id);
  const checks = {
    partner_account_exists: { ok: true, label: "Partner account exists" },
    active_pricing_assignment: { ok: false, label: "Active pricing assignment" },
    partner_user_access: { ok: false, label: "Partner user access row(s)", count: 0 },
    partner_quote_head_access: { ok: false, label: "partner_quote head on assigned users" },
    branding_configured: { ok: false, optional: true, label: "Branding (optional)" },
    context_route_ready: { ok: false, label: "Partner context would resolve" },
    submit_my_quotes_verified: {
      ok: false,
      label: "Submit / my-quotes verified",
      note: "Not verified in setup admin — run pilot tests after context passes"
    },
    external_launch_ready: {
      ok: false,
      label: "External partner launch",
      blocked_reason: "Blocked until RLS and cross-tenant leakage tests pass"
    }
  };

  const { data: asn } = await db
    .from("quote_partner_pricing_assignments")
    .select("id,pricing_structure_id")
    .eq("partner_account_id", partnerId)
    .eq("is_active", true)
    .limit(1);
  if (asn?.length) {
    checks.active_pricing_assignment.ok = true;
    checks.active_pricing_assignment.assignment_id = asn[0].id;
    checks.active_pricing_assignment.pricing_structure_id = asn[0].pricing_structure_id;
  }

  let accessRows = [];
  try {
    const { data, error } = await db
      .from("quote_partner_user_access")
      .select("id,user_id,role,is_active,created_at")
      .eq("organization_id", organizationId)
      .eq("partner_account_id", partnerId)
      .order("created_at", { ascending: false });
    if (error && !isMissingRelationError(error)) throw error;
    accessRows = (data || []).filter((r) => r.is_active !== false);
  } catch (e) {
    if (!isMissingRelationError(e)) throw e;
  }

  checks.partner_user_access.count = accessRows.length;
  checks.partner_user_access.ok = accessRows.length > 0;

  const userDetails = [];
  let allHaveHead = accessRows.length > 0;
  let allContextOk = accessRows.length > 0;

  for (const acc of accessRows) {
    const uid = String(acc.user_id);
    const { data: prof } = await db.from("user_profiles").select("id,email,full_name,user_kind,is_active").eq("id", uid).limit(1);
    const profile = prof?.[0] || null;
    const hasHead = await userHasPartnerQuoteHead(db, uid);
    if (!hasHead) allHaveHead = false;
    const sim = await simulatePartnerContextForUser(db, {
      organizationId,
      userId: uid,
      partnerAccountId: partnerId
    });
    if (!sim.ok) allContextOk = false;
    userDetails.push({
      access_id: acc.id,
      user_id: uid,
      email: profile?.email ?? null,
      full_name: profile?.full_name ?? null,
      user_kind: profile?.user_kind ?? null,
      role: acc.role,
      has_partner_quote_head: hasHead,
      context_simulation: sim
    });
  }

  checks.partner_quote_head_access.ok = allHaveHead && accessRows.length > 0;
  checks.partner_quote_head_access.users = userDetails.map((u) => ({
    user_id: u.user_id,
    email: u.email,
    has_partner_quote_head: u.has_partner_quote_head
  }));

  try {
    const { data: brand } = await db
      .from("quote_partner_branding_settings")
      .select("id,display_name_override,logo_url,primary_color")
      .eq("partner_account_id", partnerId)
      .eq("is_active", true)
      .limit(1);
    if (brand?.length) {
      checks.branding_configured.ok = true;
      checks.branding_configured.branding_id = brand[0].id;
    }
  } catch (e) {
    if (!isMissingRelationError(e)) throw e;
  }

  checks.context_route_ready.ok =
    checks.partner_account_exists.ok &&
    checks.active_pricing_assignment.ok &&
    checks.partner_user_access.ok &&
    checks.partner_quote_head_access.ok &&
    allContextOk;

  const readyForPilot = checks.context_route_ready.ok;
  const blockers = Object.entries(checks)
    .filter(([, v]) => v.optional !== true && !v.ok && v.label)
    .map(([, v]) => v.label);

  return {
    partner_account_id: partnerId,
    checks,
    summary: {
      ready_for_partner_context_api: readyForPilot,
      ready_for_app_partner_quote_scaffold: readyForPilot,
      ready_for_external_partner_login: false,
      blockers
    },
    assigned_users: userDetails
  };
}

/**
 * pricing_admin OR system_admin head (admin/super_admin role bypass unchanged).
 * @param {{ getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function requirePartnerSetupAdminHead({ getSupabase }) {
  return async function partnerSetupHeadGate(req, res, next) {
    try {
      const u = req.user;
      if (!u?.id) return res.status(401).json({ ok: false, error: "Unauthorized" });
      if (u.isActive === false) {
        return res.status(403).json({ ok: false, error: "You do not have access to partner setup admin." });
      }
      const r = String(u.role ?? "").trim();
      if (r === "admin" || r === "super_admin") return next();

      const ctx = await resolveHeadAccessContext(getSupabase(), u);
      if (!ctx.ok || !ctx.active) {
        return res.status(403).json({ ok: false, error: "You do not have access to partner setup admin." });
      }
      if (ctx.actionableGrantSet.has("pricing_admin") || ctx.actionableGrantSet.has("system_admin")) {
        return next();
      }
      return res.status(403).json({ ok: false, error: "You do not have access to partner setup admin." });
    } catch (e) {
      console.error("requirePartnerSetupAdminHead failed", e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  };
}
