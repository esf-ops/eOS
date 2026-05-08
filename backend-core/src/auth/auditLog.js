import { createClient } from "@supabase/supabase-js";

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

function clientIp(req) {
  const xf = String(req?.header?.("x-forwarded-for") ?? req?.headers?.["x-forwarded-for"] ?? "").trim();
  if (xf) return xf.split(",")[0].trim();
  return String(req?.ip ?? "").trim();
}

function userAgent(req) {
  return String(req?.headers?.["user-agent"] ?? "").trim();
}

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const redacted = { ...metadata };
  delete redacted.password;
  delete redacted.token;
  delete redacted.jwt;
  delete redacted.SUPABASE_SERVICE_ROLE_KEY;
  return redacted;
}

export async function logAction({ user, head, actionType, entityType, entityId, jobId, metadata, req }) {
  const supabase = supabaseAdminClient();
  const row = {
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    user_role: user?.role ?? null,
    head: head ?? null,
    action_type: actionType ?? null,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    job_id: jobId ?? null,
    metadata: safeMetadata(metadata),
    ip_address: clientIp(req),
    user_agent: userAgent(req),
    created_at: new Date().toISOString()
  };
  const { error } = await supabase.from("eos_action_log").insert(row);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function logLoginEvent({ user, eventType, metadata, req }) {
  const supabase = supabaseAdminClient();
  const row = {
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    event_type: eventType ?? null,
    ip_address: clientIp(req),
    user_agent: userAgent(req),
    metadata: safeMetadata(metadata),
    created_at: new Date().toISOString()
  };
  const { error } = await supabase.from("eos_login_log").insert(row);
  if (error) throw new Error(error.message);
  return { ok: true };
}

