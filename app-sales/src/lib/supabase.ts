import { createClient } from "@supabase/supabase-js";
import { buildEliteosSupabaseAuthOptions } from "../../../shared/eliteos-supabase/eliteosSupabaseAuthOptions";
import { config } from "./config";

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: buildEliteosSupabaseAuthOptions(config.supabaseUrl)
});
