/**
 * Supabase service-role client for report-feed scripts only.
 *
 * Rules:
 * - Backend/script use only. Never imported by frontend code.
 * - SUPABASE_WRITE_ENABLED=1 must be set before calling createWriteCapableClient().
 * - Credentials read from env; never logged.
 */

import { createClient } from "@supabase/supabase-js";

function envStr(name) {
  return String(process.env[name] ?? "").trim();
}

function requiredEnv(name) {
  const v = envStr(name);
  if (!v) throw new Error(`reportFeedDbClient: missing required env var ${name}`);
  return v;
}

/**
 * Create a read-only Supabase client (no write gate required).
 * Suitable for loadReportFeedContract queries.
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createReadClient() {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Create a write-capable Supabase client.
 * Throws unless SUPABASE_WRITE_ENABLED=1 is explicitly set.
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createWriteCapableClient() {
  const writeEnabled = envStr("SUPABASE_WRITE_ENABLED");
  if (writeEnabled !== "1") {
    throw new Error(
      "reportFeedDbClient: SUPABASE_WRITE_ENABLED must be set to '1' to perform DB writes. " +
        "Set SUPABASE_WRITE_ENABLED=1 explicitly for this operation."
    );
  }
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
