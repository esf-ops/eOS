import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

let _auditAdminClientInstance = null;
function supabaseAdminClient() {
  if (!_auditAdminClientInstance) {
    const url = requiredEnv("SUPABASE_URL");
    const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    _auditAdminClientInstance = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _auditAdminClientInstance;
}

function clientIp(req) {
  const xf = String(req?.header?.("x-forwarded-for") ?? req?.headers?.["x-forwarded-for"] ?? "").trim();
  if (xf) return xf.split(",")[0].trim();
  return String(req?.ip ?? "").trim();
}

function userAgent(req) {
  return String(req?.headers?.["user-agent"] ?? "").trim();
}

function requestId(req) {
  return (
    String(req?.headers?.["x-vercel-id"] ?? "").trim() ||
    String(req?.headers?.["x-request-id"] ?? "").trim() ||
    String(req?.headers?.["cf-ray"] ?? "").trim() ||
    null
  );
}

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const redacted = { ...metadata };
  delete redacted.password;
  delete redacted.pass;
  delete redacted.token;
  delete redacted.access_token;
  delete redacted.refresh_token;
  delete redacted.authorization;
  delete redacted.jwt;
  delete redacted.SUPABASE_SERVICE_ROLE_KEY;
  return redacted;
}

function isSchemaColumnError(error) {
  const msg = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return code === "42703" || msg.includes("column") || msg.includes("schema cache");
}

async function safeInsertWithFallback(supabase, table, row, fallbackRow) {
  const first = await supabase.from(table).insert(row);
  if (!first.error) return { ok: true };
  if (fallbackRow && isSchemaColumnError(first.error)) {
    const retry = await supabase.from(table).insert(fallbackRow);
    if (!retry.error) return { ok: true, fallback: true };
    console.warn(`[audit] ${table} fallback insert failed:`, retry.error.message);
    return { ok: false, error: retry.error.message };
  }
  console.warn(`[audit] ${table} insert failed:`, first.error.message);
  return { ok: false, error: first.error.message };
}

async function updateProfileSeen(supabase, user, eventType) {
  const uid = user?.id ? String(user.id) : "";
  if (!uid) return;
  const now = new Date().toISOString();
  const first = await supabase
    .from("user_profiles")
    .update({
      last_login_at: now,
      last_seen_at: now,
      updated_at: now
    })
    .eq("id", uid);
  if (!first.error) return;
  if (isSchemaColumnError(first.error)) {
    const fallback = await supabase
      .from("user_profiles")
      .update({
        last_login_at: now,
        updated_at: now
      })
      .eq("id", uid);
    if (fallback.error) console.warn("[audit] profile last_login_at update failed:", fallback.error.message);
    return;
  }
  console.warn(`[audit] profile seen update failed (${eventType ?? "event"}):`, first.error.message);
}

export async function recordActionLog({
  user,
  toolSlug,
  head,
  actionType,
  entityType,
  entityId,
  entityLabel,
  jobId,
  outcome = "success",
  beforeJson,
  afterJson,
  metadata,
  req
}) {
  const supabase = supabaseAdminClient();
  const tool = toolSlug ?? head ?? null;
  const safeMeta = safeMetadata(metadata);
  const row = {
    organization_id: user?.organization_id ?? null,
    actor_user_id: user?.id ?? null,
    actor_email: user?.email ?? null,
    tool_slug: tool,
    action_type: actionType ?? null,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    entity_label: entityLabel ?? null,
    outcome,
    before_json: beforeJson ?? null,
    after_json: afterJson ?? null,
    metadata: safeMeta ?? {},
    ip_address: clientIp(req),
    user_agent: userAgent(req),
    request_id: requestId(req),
    // Legacy columns retained for current deployed schema.
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    user_role: user?.role ?? null,
    head: tool,
    job_id: jobId ?? null,
    created_at: new Date().toISOString()
  };
  const fallbackRow = {
    user_id: row.user_id,
    user_email: row.user_email,
    user_role: row.user_role,
    head: row.head,
    action_type: row.action_type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    job_id: row.job_id,
    metadata: row.metadata,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    created_at: row.created_at
  };
  return await safeInsertWithFallback(supabase, "eos_action_log", row, fallbackRow);
}

export async function recordAuthEvent({
  user,
  eventType,
  toolSlug,
  success = true,
  failureReason,
  sessionId,
  metadata,
  req
}) {
  const supabase = supabaseAdminClient();
  const safeMeta = safeMetadata(metadata);
  const row = {
    organization_id: user?.organization_id ?? null,
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    email: user?.email ?? null,
    event_type: eventType ?? null,
    tool_slug: toolSlug ?? null,
    success,
    failure_reason: failureReason ?? null,
    ip_address: clientIp(req),
    user_agent: userAgent(req),
    session_id: sessionId ?? null,
    request_id: requestId(req),
    metadata: safeMeta ?? {},
    created_at: new Date().toISOString()
  };
  const fallbackRow = {
    user_id: row.user_id,
    user_email: row.user_email,
    event_type: row.event_type,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    metadata: row.metadata,
    created_at: row.created_at
  };
  const result = await safeInsertWithFallback(supabase, "eos_login_log", row, fallbackRow);
  if (success) await updateProfileSeen(supabase, user, eventType);
  return result;
}

export async function logAction(args) {
  return await recordActionLog({
    ...args,
    toolSlug: args?.toolSlug ?? args?.head
  });
}

export async function logLoginEvent(args) {
  return await recordAuthEvent(args);
}

