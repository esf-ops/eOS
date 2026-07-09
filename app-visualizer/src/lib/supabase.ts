import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./config";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const env = supabaseEnv();
  if (!env) return null;
  client = createClient(env.url, env.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
