import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function env(name: string): string {
  return String((import.meta as unknown as { env?: Record<string, string> }).env?.[name] ?? "").trim();
}

/** Internal Estimate Head — own Supabase anon client (do not import from app-quote). */
export function getSupabase(): SupabaseClient | null {
  const url = env("VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey);
  }
  return _client;
}
