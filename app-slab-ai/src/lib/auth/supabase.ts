import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

function publicEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = publicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = publicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  if (!browserClient) {
    browserClient = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

export function getAccessTokenFromHeader(authorization: string | null): string | null {
  const h = String(authorization ?? "").trim();
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
