import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function redactToken(token) {
  const t = String(token ?? "");
  if (!t) return "";
  if (t.length <= 16) return "[REDACTED]";
  return `${t.slice(0, 8)}…${t.slice(-6)}`;
}

async function main() {
  const url = requiredEnv("SUPABASE_URL");
  const anon = requiredEnv("SUPABASE_ANON_KEY");

  const email = requiredEnv("EOS_TEST_EMAIL");
  requiredEnv("EOS_TEST_PASSWORD");
  const password = String(process.env.EOS_TEST_PASSWORD);

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Supabase signInWithPassword failed: ${error.message}`);

  const accessToken = data?.session?.access_token ?? "";
  if (!accessToken) throw new Error("No access_token returned from Supabase");

  console.log("Login ok:", {
    userId: data?.user?.id ?? null,
    email: data?.user?.email ?? null,
    accessToken: redactToken(accessToken)
  });

  const apiBase = String(process.env.EOS_API_BASE_URL ?? "http://localhost:3001").trim();
  const authHeader = { authorization: `Bearer ${accessToken}` };

  const res = await fetch(`${apiBase}/api/me`, {
    method: "GET",
    headers: authHeader
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave as text
  }

  console.log("/api/me response:", {
    status: res.status,
    ok: res.ok,
    body: json ?? text
  });

  const adminRes = await fetch(`${apiBase}/api/admin/users`, {
    method: "GET",
    headers: authHeader
  });
  const adminText = await adminRes.text();
  let adminJson = null;
  try {
    adminJson = JSON.parse(adminText);
  } catch {
    // leave as text
  }

  const rows = Array.isArray(adminJson?.rows) ? adminJson.rows : [];
  const preview = rows.slice(0, 5).map((u) => ({
    email: u?.email ?? "",
    full_name: u?.full_name ?? "",
    role: u?.role ?? "",
    is_active: u?.is_active ?? null
  }));

  console.log("/api/admin/users response:", {
    status: adminRes.status,
    ok: adminRes.ok,
    userCount: rows.length,
    preview,
    body: adminJson && !rows.length ? adminJson : undefined,
    raw: adminJson ? undefined : adminText
  });
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});

