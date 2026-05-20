import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildEliteosSupabaseAuthOptions } from "../../../shared/eliteos-supabase/eliteosSupabaseAuthOptions";
import { readOrgDirectoryConfig } from "./config";

let _client: SupabaseClient | null = null;

/** Org Directory — anon Supabase client with shared `.eliteosfab.com` auth storage. */
export function getSupabase(): SupabaseClient | null {
  const { config } = readOrgDirectoryConfig();
  if (!config) return null;
  if (!_client) {
    _client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: buildEliteosSupabaseAuthOptions(config.supabaseUrl)
    });
  }
  return _client;
}
