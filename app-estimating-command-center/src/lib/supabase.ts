import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildEliteosSupabaseAuthOptions } from "../../../shared/eliteos-supabase/eliteosSupabaseAuthOptions";

let _client: SupabaseClient | null = null;

/** Anon client for the shared slabOS session only. Never query QuickBooks/Moraware tables from the browser. */
export function getSupabase(): SupabaseClient | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey, { auth: buildEliteosSupabaseAuthOptions(url) });
  }
  return _client;
}
