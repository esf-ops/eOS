/** Countertop Visualizer — runtime configuration from Vite env vars. */

function env(name: string): string {
  return String(import.meta.env[name] ?? "").trim();
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

export const VISUALIZER_DISCLAIMER =
  "Concept visualization only. Not an estimate, measurement, layout, inventory reservation, or production drawing.";
