import type { SupabaseClient } from "@supabase/supabase-js";
import { createEliteosBrowserSupabaseClient } from "../../../shared/eliteos-supabase/eliteosBrowserSupabaseClient";

let _client: SupabaseClient | null = null;

function env(name: string): string {
  return String((import.meta as unknown as { env?: Record<string, string> }).env?.[name] ?? "").trim();
}

/** Quote Library Head — anon Supabase client only (no service role in the browser). */
export function getSupabase(): SupabaseClient | null {
  const url = env("VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createEliteosBrowserSupabaseClient(url, anonKey);
  }
  return _client;
}
