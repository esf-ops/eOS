import { createClient } from "@supabase/supabase-js";

export const ALLOWED_ROLES = [
  "admin",
  "executive",
  "sales",
  "production",
  "shop_tv",
  "installer",
  "accounting",
  "purchasing",
  "customer_service",
  "viewer"
];

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function supabaseAdminClient() {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getBearerToken(req) {
  const h = String(req.header("authorization") ?? "").trim();
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function loadUserProfileOrNull(supabase, userId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,role,department,is_active")
    .eq("id", userId)
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

function emailPrefix(email) {
  const s = String(email ?? "").trim();
  if (!s) return "";
  const at = s.indexOf("@");
  return at >= 0 ? s.slice(0, at) : s;
}

function deriveFullName(authUser) {
  const meta = authUser?.user_metadata;
  const fromMeta =
    (meta && typeof meta === "object" && (meta.full_name || meta.fullName || meta.name)) || "";
  const picked = String(fromMeta ?? "").trim();
  if (picked) return picked;
  return emailPrefix(authUser?.email) || "";
}

async function insertBootstrapProfile(supabase, authUser) {
  const row = {
    id: authUser.id,
    email: String(authUser.email ?? "").trim() || null,
    full_name: deriveFullName(authUser) || null,
    role: "viewer",
    department: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("user_profiles").insert(row);
  if (error) throw new Error(error.message);

  // Log bootstrap event (never include token/secrets).
  const { error: logErr } = await supabase.from("eos_action_log").insert({
    user_id: authUser.id,
    user_email: String(authUser.email ?? "").trim() || null,
    user_role: "viewer",
    head: "auth",
    action_type: "bootstrap_user_profile",
    entity_type: "user_profile",
    entity_id: String(authUser.id),
    job_id: null,
    metadata: { bootstrap: true },
    ip_address: null,
    user_agent: null,
    created_at: new Date().toISOString()
  });
  if (logErr) {
    // Non-fatal: profile bootstrap should still succeed.
    console.warn("Failed to log bootstrap_user_profile action:", logErr.message);
  }

  return row;
}

async function loadOrBootstrapProfile(supabase, authUser) {
  const existing = await loadUserProfileOrNull(supabase, authUser.id);
  if (existing) return existing;

  // Always default to viewer; never auto-create admin users.
  try {
    await insertBootstrapProfile(supabase, authUser);
  } catch (e) {
    // Race-safe: if another request created it, load again.
    const again = await loadUserProfileOrNull(supabase, authUser.id);
    if (again) return again;
    throw e;
  }
  return await loadUserProfileOrNull(supabase, authUser.id);
}

function attachUser(req, authUser, profile) {
  req.user = {
    id: authUser.id,
    email: profile?.email || authUser.email || "",
    role: profile?.role || "viewer",
    fullName: profile?.full_name || "",
    department: profile?.department || "",
    isActive: profile?.is_active !== false
  };
}

export function requireAuth() {
  return async function requireAuthMiddleware(req, res, next) {
    try {
      const token = getBearerToken(req);
      if (!token) return res.status(401).json({ ok: false, error: "Missing bearer token" });

      const supabase = supabaseAdminClient();
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ ok: false, error: "Invalid token" });

      let profile;
      try {
        profile = await loadOrBootstrapProfile(supabase, data.user);
      } catch {
        return res.status(500).json({ ok: false, error: "Failed to create user profile" });
      }
      attachUser(req, data.user, profile);

      if (!req.user.isActive) return res.status(403).json({ ok: false, error: "User inactive" });
      next();
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  };
}

export function optionalAuth() {
  return async function optionalAuthMiddleware(req, _res, next) {
    try {
      const token = getBearerToken(req);
      if (!token) return next();

      const supabase = supabaseAdminClient();
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return next();

      const profile = await loadOrBootstrapProfile(supabase, data.user);
      attachUser(req, data.user, profile);
      next();
    } catch {
      next();
    }
  };
}

export function requireRole(allowedRoles) {
  const allow = Array.isArray(allowedRoles) ? allowedRoles : [];
  return function requireRoleMiddleware(req, res, next) {
    const role = String(req.user?.role ?? "");
    if (!role) return res.status(401).json({ ok: false, error: "Missing auth user" });
    if (role === "admin") return next();
    if (allow.includes(role)) return next();
    return res.status(403).json({ ok: false, error: "Forbidden" });
  };
}

