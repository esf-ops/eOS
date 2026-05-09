/**
 * Calls GET /api/titans/today with a Supabase user JWT.
 * Requires: SUPABASE_URL, SUPABASE_ANON_KEY, EOS_TEST_EMAIL, EOS_TEST_PASSWORD
 */
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

/** Read HTTP body exactly once — JSON object, plain string, or null. */
async function readJsonOrText(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
  if (error) throw new Error(`signInWithPassword: ${error.message}`);

  const accessToken = data?.session?.access_token ?? "";
  if (!accessToken) throw new Error("No access_token from Supabase");

  const userEmail = String(data?.user?.email ?? email);
  console.log("login:", {
    status: "ok",
    userEmail,
    accessToken: redactToken(accessToken)
  });

  const apiBase = String(process.env.EOS_API_BASE_URL ?? "http://localhost:3001").trim();
  const titansUrl = new URL(`${apiBase.replace(/\/$/, "")}/api/titans/today`);
  if (process.env.EOS_TEST_TITANS_DATE) {
    titansUrl.searchParams.set("date", String(process.env.EOS_TEST_TITANS_DATE).trim());
  }
  if (process.env.EOS_TEST_TITANS_LIMIT) {
    titansUrl.searchParams.set("limit", String(process.env.EOS_TEST_TITANS_LIMIT).trim());
  }

  let res;
  try {
    res = await fetch(titansUrl.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` }
    });
  } catch (err) {
    console.error("Backend not reachable. Start npm run eos:server first.");
    console.error(String(err?.message || err));
    process.exitCode = 1;
    return;
  }

  const body = await readJsonOrText(res);

  console.log("GET /api/titans/today", {
    url: titansUrl.toString(),
    status: res.status,
    ok: res.ok
  });

  if (res.status === 401 || res.status === 403) {
    console.error("Authenticated user does not have access or token is invalid.");
    if (typeof body === "string") console.error("body (text):", body);
    else if (body && typeof body === "object") console.error("body:", body);
    process.exitCode = 1;
    return;
  }

  if (body && typeof body === "object" && body !== null) {
    if (body.ok === true) {
      const jobs = Array.isArray(body.jobs) ? body.jobs : [];
      console.log("summary:", {
        ok: body.ok,
        label: body.label,
        localDate: body.localDate,
        activeTitanJobs: body.activeTitanJobs,
        completedToday: body.completedToday,
        heldOrNeedsReview: body.heldOrNeedsReview,
        totalSqftToday: body.totalSqftToday,
        averageCompletionPace: body.averageCompletionPace,
        jobCount: jobs.length,
        emptyStateMessage: body.emptyStateMessage ?? null
      });
      console.log("first 5 jobs:", jobs.slice(0, 5));
      if (Array.isArray(body.notes)) console.log("notes:", body.notes);
    } else {
      console.log("error or unexpected JSON body:", body);
    }
    return;
  }

  console.log("body (non-JSON or empty):", body);
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
