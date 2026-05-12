import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!config.supabase) return null;
  if (!_client) {
    _client = createClient(config.supabase.url, config.supabase.anonKey);
  }
  return _client;
}
