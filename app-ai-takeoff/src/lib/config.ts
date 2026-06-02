/** AI Takeoff Lab — runtime configuration from Vite env vars. */

function env(name: string): string {
  return String((import.meta as unknown as { env?: Record<string, string> }).env?.[name] ?? "").trim();
}

export function backendBaseUrl(): string {
  const raw = env("VITE_BACKEND_URL") || "http://localhost:3001";
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
}

export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = env("VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
