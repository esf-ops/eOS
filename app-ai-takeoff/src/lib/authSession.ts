import type { SupabaseClient } from "@supabase/supabase-js";

const REFRESH_WINDOW_SEC = 120;

/**
 * Returns a valid Bearer token, refreshing the session when near expiry.
 * Returns null if not signed in.
 */
export async function resolveAccessToken(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  let session = data.session;
  const expiresAt = session.expires_at;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt != null && expiresAt - nowSec < REFRESH_WINDOW_SEC) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) return null;
    session = refreshed.data.session;
  }

  const tok = String(session.access_token ?? "").trim();
  return tok || null;
}
