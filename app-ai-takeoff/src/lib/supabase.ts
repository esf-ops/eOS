import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildEliteosSupabaseAuthOptions } from "@shared/eliteos-supabase/eliteosSupabaseAuthOptions";
import { supabaseEnv } from "./config";

let _client: SupabaseClient | null = null;

/** AI Takeoff Lab — own Supabase anon client (do not share with other heads). */
export function getSupabase(): SupabaseClient | null {
  const cfg = supabaseEnv();
  if (!cfg) return null;
  if (!_client) {
    _client = createClient(cfg.url, cfg.anonKey, {
      auth: buildEliteosSupabaseAuthOptions(cfg.url),
    });
  }
  return _client;
}
