import express from "express";
import { APPLICATION_ROLES, EOS_HEAD_SLUGS, isApplicationRole, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { logAction } from "../auth/auditLog.js";
import { requireAuth, requireRole } from "../auth/authMiddleware.js";

const parseJson = express.json();

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

async function enrichUserProfilesList(supabase, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const ids = rows.map((r) => String(r.id));

  /** @type {Map<string, string[]>} */
  let headsMap = new Map();
  /** @type {Map<string, any[]>} */
  let accMap = new Map();

  try {
    const { data: headRows } = await supabase
      .from("user_head_access")
      .select("user_id, head_slug")
      .in("user_id", ids);
    for (const h of headRows ?? []) {
      const uid = String(h.user_id);
      if (!headsMap.has(uid)) headsMap.set(uid, []);
      headsMap.get(uid).push(String(h.head_slug));
    }
  } catch (_) {
    headsMap = new Map();
  }

  try {
    const { data: accRows } = await supabase.from("user_account_access").select("*").in("user_id", ids);
    const dealerIds = [...new Set((accRows ?? []).map((r) => String(r.dealer_account_id)).filter(Boolean))];
    const pgIds = [
      ...new Set((accRows ?? []).map((r) => (r.pricing_group_id ? String(r.pricing_group_id) : "")).filter(Boolean))
    ];

    const dealerById = new Map();
    if (dealerIds.length) {
      const { data: drows } = await supabase.from("dealer_accounts").select("id,account_name").in("id", dealerIds);
      for (const d of drows ?? []) dealerById.set(String(d.id), d.account_name ?? null);
    }

    const pgById = new Map();
    if (pgIds.length) {
      const { data: grows } = await supabase.from("pricing_groups").select("id,code,label").in("id", pgIds);
      for (const g of grows ?? []) pgById.set(String(g.id), { code: g.code, label: g.label });
    }

    for (const a of accRows ?? []) {
      const uid = String(a.user_id);
      const pg = a.pricing_group_id ? pgById.get(String(a.pricing_group_id)) : null;
      const merged = {
        ...a,
        dealer_account_name: dealerById.get(String(a.dealer_account_id)) ?? null,
        pricing_group_code: pg?.code ?? null,
        pricing_group_label: pg?.label ?? null
      };
      if (!accMap.has(uid)) accMap.set(uid, []);
      accMap.get(uid).push(merged);
    }
  } catch (_) {
    accMap = new Map();
  }

  return rows.map((row) => {
    const uid = String(row.id);
    const accesses = accMap.get(uid) ?? [];
    const pricingLabelPrimary =
      accesses.find((a) => a.pricing_group_label)?.pricing_group_label ??
      accesses.find((a) => a.pricing_group_code)?.pricing_group_code ??
      null;
    const dealerPrimary = accesses.find((a) => a.dealer_account_name)?.dealer_account_name ?? null;
    const kind =
      row.user_kind != null
        ? String(row.user_kind)
        : accesses.length || ["dealer_admin", "dealer_user"].includes(String(row.role))
          ? "dealer_partner"
          : "internal";
    return {
      ...row,
      user_kind_normalized: kind,
      allowed_heads_list: headsMap.get(uid) ?? [],
      dealer_access: accesses,
      dealer_account_name_primary: dealerPrimary,
      pricing_group_summary: pricingLabelPrimary
    };
  });
}

export async function enrichUserProfileRowsForAdminList(supabase, rows) {
  return enrichUserProfilesList(supabase, rows);
}

async function loadSummaries(sb, userId) {
  const uid = pickStr(userId);
  let loginRecent = [];
  let loginTotal = 0;
  try {
    const { count } = await sb.from("eos_login_log").select("id", { count: "exact", head: true }).eq("user_id", uid);
    loginTotal = count ?? 0;
    const { data } = await sb
      .from("eos_login_log")
      .select("created_at,event_type,ip_address,user_agent")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(15);
    loginRecent = data ?? [];
  } catch (_) {
    loginRecent = [];
    loginTotal = 0;
  }

  let actionRecent = [];
  let actionTotal = 0;
  try {
    const { count } = await sb.from("eos_action_log").select("id", { count: "exact", head: true }).eq("user_id", uid);
    actionTotal = count ?? 0;
    const { data } = await sb
      .from("eos_action_log")
      .select("created_at,head,action_type,entity_type,entity_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(25);
    actionRecent = data ?? [];
  } catch (_) {
    actionRecent = [];
    actionTotal = 0;
  }

  return {
    login: { recent: loginRecent, total: loginTotal },
    actions: { recent: actionRecent, total: actionTotal }
  };
}

async function fetchUserDetailEnriched(sb, userId) {
  const uid = pickStr(userId);
  const { data: profRows, error: pe } = await sb
    .from("user_profiles")
    .select("id,email,full_name,role,department,is_active,user_kind,last_login_at,created_at,updated_at")
    .eq("id", uid)
    .limit(1);
  if (pe) throw new Error(pe.message);
  const profile = profRows?.[0] ?? null;
  if (!profile) return null;

  let heads = [];
  try {
    const { data: h } = await sb.from("user_head_access").select("head_slug,created_at").eq("user_id", uid);
    heads = h ?? [];
  } catch (_) {
    heads = [];
  }

  let dealerAccess = [];
  try {
    const { data: accRows } = await sb.from("user_account_access").select("*").eq("user_id", uid);
    const dealerIds = [...new Set((accRows ?? []).map((r) => String(r.dealer_account_id)).filter(Boolean))];
    const pgIds = [
      ...new Set((accRows ?? []).map((r) => (r.pricing_group_id ? String(r.pricing_group_id) : "")).filter(Boolean))
    ];

    const dealerById = new Map();
    if (dealerIds.length) {
      const { data: drows } = await sb.from("dealer_accounts").select("id,account_name,external_ref").in("id", dealerIds);
      for (const d of drows ?? []) dealerById.set(String(d.id), d);
    }
    const pgById = new Map();
    if (pgIds.length) {
      const { data: grows } = await sb.from("pricing_groups").select("id,code,label").in("id", pgIds);
      for (const g of grows ?? []) pgById.set(String(g.id), g);
    }
    dealerAccess =
      accRows?.map((a) => ({
        ...a,
        dealer_account: dealerById.get(String(a.dealer_account_id)) ?? null,
        pricing_group: a.pricing_group_id ? pgById.get(String(a.pricing_group_id)) ?? null : null
      })) ?? [];
  } catch (_) {
    dealerAccess = [];
  }

  const summaries = await loadSummaries(sb, uid);
  const enrichedList = await enrichUserProfilesList(sb, [profile]);
  const enriched = enrichedList?.[0] ?? profile;

  return {
    profile: enriched,
    head_access_rows: heads,
    dealer_account_access: dealerAccess,
    login_summary: summaries.login,
    action_summary: summaries.actions
  };
}

function parseUuidOrEmpty(v) {
  const s = pickStr(v);
  if (!s) return "";
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return re.test(s) ? s : "";
}

/**
 * @param {import("express").Application} app
 * @param {{ supabaseServerClient: () => import("@supabase/supabase-js").SupabaseClient }} ctx
 */
const USER_MANAGEMENT_SCHEMA_TABLES = {
  user_profiles: "user_profiles",
  dealer_accounts: "dealer_accounts",
  pricing_groups: "pricing_groups",
  user_head_access: "user_head_access",
  user_account_access: "user_account_access",
  dealer_user_settings: "dealer_user_settings"
};

export function attachAdvancedSystemAdminUserRoutes(app, ctx) {
  const sbFn = ctx.supabaseServerClient;
  const adminGuard = [requireAuth(), requireRole(["admin"])];

  /** Ping extension tables — empty table still counts as healthy. */
  app.get("/api/admin/user-management/schema-health", ...adminGuard, async (_req, res) => {
    try {
      const sb = sbFn();
      const tables = {};
      const missing = [];

      async function tableReachable(physical) {
        const head = await sb.from(physical).select("*", { head: true, count: "exact" });
        if (head.error == null) return true;
        const lim = await sb.from(physical).select("*").limit(1);
        return lim.error == null;
      }

      for (const [logical, physical] of Object.entries(USER_MANAGEMENT_SCHEMA_TABLES)) {
        const exists = await tableReachable(physical);
        tables[logical] = exists;
        if (!exists) missing.push(logical);
      }
      res.json({ ok: true, tables, missing });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Heads, roles, and master data used by System Admin UI. */
  app.get("/api/admin/reference", ...adminGuard, async (_req, res) => {
    try {
      const sb = sbFn();
      let dealers = [];
      let pricingGroups = [];
      try {
        const { data } = await sb.from("dealer_accounts").select("id,account_name,external_ref").order("account_name");
        dealers = data ?? [];
      } catch (_) {
        dealers = [];
      }
      try {
        const { data } = await sb.from("pricing_groups").select("id,code,label").order("code");
        pricingGroups = data ?? [];
      } catch (_) {
        pricingGroups = [];
      }
      res.json({
        ok: true,
        heads: [...EOS_HEAD_SLUGS],
        roles: [...APPLICATION_ROLES],
        dealers,
        pricing_groups: pricingGroups
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/users/invite", ...adminGuard, parseJson, async (req, res) => {
    try {
      const sb = sbFn();
      const emailRaw = pickStr(req.body?.email);
      const emailLower = emailRaw.toLowerCase();
      if (!emailLower) return res.status(400).json({ ok: false, error: "email required" });

      const redirectCandidate = pickStr(
        process.env.EOS_ADMIN_INVITE_REDIRECT_URL ||
          process.env.SUPABASE_AUTH_REDIRECT ||
          process.env.SITE_URL ||
          ""
      );
      const redirectTo = redirectCandidate || undefined;

      const fullNameInvite = req.body?.full_name != null ? pickStr(req.body.full_name) || null : null;
      const inviteOptions = redirectTo ? { redirectTo } : {};
      if (fullNameInvite) inviteOptions.data = { full_name: fullNameInvite };

      const inviteResp = await sb.auth.admin.inviteUserByEmail(emailLower, inviteOptions);
      if (inviteResp?.error) {
        return res.status(400).json({ ok: false, error: inviteResp.error.message });
      }

      const invitedUser = inviteResp?.data?.user;
      const uid = pickStr(invitedUser?.id);
      if (!uid) return res.status(500).json({ ok: false, error: "Invite response missing user id" });

      const fullNameProfile = fullNameInvite;
      const role = isApplicationRole(req.body?.role) ? pickStr(req.body.role) : "viewer";
      const department = req.body?.department != null ? pickStr(req.body.department) || null : null;
      const userKind = req.body?.user_kind === "dealer_partner" ? "dealer_partner" : "internal";
      const isActive = req.body?.is_active === false ? false : true;
      const iso = new Date().toISOString();

      const { data: existingProf } = await sb.from("user_profiles").select("id").eq("id", uid).maybeSingle();

      const profRow = {
        id: uid,
        email: emailLower,
        full_name: fullNameProfile,
        role,
        department,
        user_kind: userKind,
        is_active: isActive,
        updated_at: iso
      };

      if (!existingProf?.id) profRow.created_at = iso;

      const { error: pu } = await sb.from("user_profiles").upsert(profRow, { onConflict: "id" });
      if (pu) throw new Error(pu.message);

      await logAction({
        user: req.user,
        head: "system_admin",
        actionType: "invite_user",
        entityType: "user_profile",
        entityId: uid,
        jobId: null,
        metadata: {
          email: emailLower,
          role,
          user_kind: userKind
        },
        req
      });

      res.json({ ok: true, user_id: uid, email: emailLower });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/admin/users/:userId", ...adminGuard, async (req, res) => {
    try {
      const userId = pickStr(req.params.userId);
      if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
      const sb = sbFn();
      const detail = await fetchUserDetailEnriched(sb, userId);
      if (!detail) return res.status(404).json({ ok: false, error: "User not found" });
      res.json({ ok: true, ...detail });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/users/:userId/profile", ...adminGuard, parseJson, async (req, res) => {
    try {
      const userId = pickStr(req.params.userId);
      if (!userId) return res.status(400).json({ ok: false, error: "userId required" });

      const patch = { updated_at: new Date().toISOString() };
      const body = req.body ?? {};

      if (body.full_name !== undefined) patch.full_name = pickStr(body.full_name) || null;
      if (body.role !== undefined) {
        const r = pickStr(body.role);
        if (!isApplicationRole(r)) return res.status(400).json({ ok: false, error: `Invalid role: ${r}` });
        patch.role = r;
      }
      if (body.department !== undefined) patch.department = pickStr(body.department) || null;
      if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
      if (body.user_kind !== undefined) {
        const k = pickStr(body.user_kind);
        if (k !== "internal" && k !== "dealer_partner") {
          return res.status(400).json({ ok: false, error: "user_kind must be internal or dealer_partner" });
        }
        patch.user_kind = k;
      }

      const sb = sbFn();
      const { data, error } = await sb
        .from("user_profiles")
        .update(patch)
        .eq("id", userId)
        .select("id,email,full_name,role,department,is_active,user_kind,last_login_at,created_at,updated_at")
        .limit(1);
      if (error) throw new Error(error.message);
      if (!data?.[0]) return res.status(404).json({ ok: false, error: "User not found" });

      await logAction({
        user: req.user,
        head: "system_admin",
        actionType: "update_user_profile",
        entityType: "user_profile",
        entityId: userId,
        jobId: null,
        metadata: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
        req
      });

      res.json({ ok: true, profile: data[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/users/:userId/head-access", ...adminGuard, parseJson, async (req, res) => {
    try {
      const userId = pickStr(req.params.userId);
      if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
      const raw = req.body?.heads ?? req.body?.allowed_heads ?? [];
      const list = Array.isArray(raw) ? raw : [];
      const slugs = [...new Set(list.map((x) => pickStr(x)).filter(Boolean))];

      for (const s of slugs) {
        if (!isKnownHeadSlug(s)) return res.status(400).json({ ok: false, error: `Unknown head slug: ${s}` });
      }

      const sb = sbFn();
      const { error: delErr } = await sb.from("user_head_access").delete().eq("user_id", userId);
      if (delErr) throw new Error(delErr.message);

      if (slugs.length) {
        const rows = slugs.map((head_slug) => ({ user_id: userId, head_slug }));
        const { error: insErr } = await sb.from("user_head_access").insert(rows);
        if (insErr) throw new Error(insErr.message);
      }

      await logAction({
        user: req.user,
        head: "system_admin",
        actionType: "update_user_head_access",
        entityType: "user_profile",
        entityId: userId,
        jobId: null,
        metadata: { head_count: slugs.length, heads: slugs },
        req
      });

      res.json({ ok: true, heads: slugs });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/users/:userId/dealer-access", ...adminGuard, parseJson, async (req, res) => {
    try {
      const userId = pickStr(req.params.userId);
      if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
      const dealerAccountId = parseUuidOrEmpty(req.body?.dealer_account_id);
      if (!dealerAccountId) return res.status(400).json({ ok: false, error: "dealer_account_id required" });

      let pricingGroupId = null;
      if (req.body?.pricing_group_id != null && pickStr(req.body.pricing_group_id) !== "") {
        pricingGroupId = parseUuidOrEmpty(req.body.pricing_group_id);
        if (!pricingGroupId) return res.status(400).json({ ok: false, error: "Invalid pricing_group_id" });
      }

      const iso = new Date().toISOString();
      const row = {
        user_id: userId,
        dealer_account_id: dealerAccountId,
        dealer_role: req.body?.dealer_role != null ? pickStr(req.body.dealer_role) || null : null,
        pricing_group_id: pricingGroupId,
        can_view_all_dealer_quotes: Boolean(req.body?.can_view_all_dealer_quotes),
        can_manage_dealer_users: Boolean(req.body?.can_manage_dealer_users),
        is_active: req.body?.is_active === false ? false : true,
        updated_at: iso
      };

      const sb = sbFn();
      const { data, error } = await sb
        .from("user_account_access")
        .upsert(row, { onConflict: "user_id,dealer_account_id" })
        .select("*")
        .limit(1);
      if (error) throw new Error(error.message);

      await logAction({
        user: req.user,
        head: "system_admin",
        actionType: "update_user_dealer_access",
        entityType: "user_profile",
        entityId: userId,
        jobId: null,
        metadata: { dealer_account_id: dealerAccountId },
        req
      });

      res.json({ ok: true, dealer_access: data?.[0] ?? row });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/users/:userId/pricing-group", ...adminGuard, parseJson, async (req, res) => {
    try {
      const userId = pickStr(req.params.userId);
      if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
      const dealerAccountId = parseUuidOrEmpty(req.body?.dealer_account_id);
      if (!dealerAccountId) return res.status(400).json({ ok: false, error: "dealer_account_id required" });

      let pricingGroupId = null;
      if (req.body?.pricing_group_id != null && pickStr(req.body.pricing_group_id) !== "") {
        pricingGroupId = parseUuidOrEmpty(req.body.pricing_group_id);
        if (!pricingGroupId) return res.status(400).json({ ok: false, error: "Invalid pricing_group_id" });
      }

      const iso = new Date().toISOString();
      const sb = sbFn();
      const { data, error } = await sb
        .from("user_account_access")
        .update({ pricing_group_id: pricingGroupId, updated_at: iso })
        .eq("user_id", userId)
        .eq("dealer_account_id", dealerAccountId)
        .select("*")
        .limit(1);
      if (error) throw new Error(error.message);
      if (!data?.length) return res.status(404).json({ ok: false, error: "Dealer assignment not found for user" });

      await logAction({
        user: req.user,
        head: "system_admin",
        actionType: "update_user_pricing_group",
        entityType: "user_profile",
        entityId: userId,
        jobId: null,
        metadata: { dealer_account_id: dealerAccountId, pricing_group_id: pricingGroupId },
        req
      });

      res.json({ ok: true, dealer_access: data[0] });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/admin/users/:userId/send-password-reset", ...adminGuard, parseJson, async (req, res) => {
    try {
      const userId = pickStr(req.params.userId);
      if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
      const sb = sbFn();
      const { data: profile, error: pe } = await sb.from("user_profiles").select("email").eq("id", userId).maybeSingle();
      if (pe) throw new Error(pe.message);
      const email = pickStr(profile?.email);
      if (!email) return res.status(404).json({ ok: false, error: "Email not found on profile" });

      const redirectCandidate = pickStr(
        process.env.EOS_ADMIN_PASSWORD_RECOVERY_REDIRECT_URL ||
          process.env.SUPABASE_AUTH_REDIRECT ||
          process.env.SITE_URL ||
          ""
      );

      const linkParams =
        redirectCandidate ?
          { type: "recovery", email, options: { redirectTo: redirectCandidate } }
        : { type: "recovery", email };

      const generated = await sb.auth.admin.generateLink(linkParams);

      if (generated?.error) {
        return res.status(400).json({ ok: false, error: generated.error.message });
      }
      // Recovery link / OTP exist only server-side — never echoed to JSON clients.

      await logAction({
        user: req.user,
        head: "system_admin",
        actionType: "send_password_reset",
        entityType: "user_profile",
        entityId: userId,
        jobId: null,
        metadata: { email },
        req
      });

      res.json({ ok: true, dispatched: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
