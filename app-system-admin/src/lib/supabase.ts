import { createEliteosBrowserSupabaseClient } from "../../../shared/eliteos-supabase/eliteosBrowserSupabaseClient";
import { config } from "./config";

export const supabase = createEliteosBrowserSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);
