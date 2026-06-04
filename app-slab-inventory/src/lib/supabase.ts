import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildEliteosSupabaseAuthOptions } from "../../../shared/eliteos-supabase/eliteosSupabaseAuthOptions";

let _client: SupabaseClient | null = null;

function env(name: string): string {
  return String((import.meta as unknown as { env?: Record<string, string> }).env?.[name] ?? "").trim();
}

/** Slab Inventory Head — own Supabase anon client (used only for auth/session). */
export function getSupabase(): SupabaseClient | null {
  const url = env("VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey, {
      auth: buildEliteosSupabaseAuthOptions(url)
    });
  }
  return _client;
}
