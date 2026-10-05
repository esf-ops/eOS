import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildEliteosSupabaseAuthOptions } from "../../../shared/eliteos-supabase/eliteosSupabaseAuthOptions";

let client: SupabaseClient | null = null;

/** Anon client for the shared eliteOS session only. All quote data goes through the Brain. */
export function getSupabase(): SupabaseClient | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) return null;
  if (!client) client = createClient(url, anonKey, { auth: buildEliteosSupabaseAuthOptions(url) });
  return client;
}
