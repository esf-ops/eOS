function requiredEnv(name: string): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env?.[name];
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required env var: ${name}`);
  return s;
}

function normalizedBackendBaseUrl(): string {
  const raw = String(
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BACKEND_URL ?? "http://localhost:3001"
  )
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  return raw || "http://localhost:3001";
}

const env = import.meta.env;

/** Local defaults align with sibling Vite configs (override per machine via VITE_*_URL). */
const HEAD_URL_DEFAULTS: Record<string, string> = {
  executive: "http://localhost:5175",
  brain_health: "http://localhost:5174",
  system_admin: "http://localhost:5176"
};

const HEAD_ENV_KEYS: Record<string, string> = {
  executive: "VITE_EXECUTIVE_URL",
  brain_health: "VITE_BRAIN_HEALTH_URL",
  system_admin: "VITE_SYSTEM_ADMIN_URL"
};

/** Returns absolute URL when we know where the head runs; otherwise null → “Coming soon”. */
export function resolveHeadLaunchUrl(slug: string): string | null {
  const s = String(slug ?? "").trim();
  const key = HEAD_ENV_KEYS[s];
  if (key) {
    const raw = String((env as Record<string, string | undefined>)[key] ?? "").trim();
    if (raw) return raw.replace(/\/+$/, "");
    const d = HEAD_URL_DEFAULTS[s];
    return d ?? null;
  }
  return null;
}

export const config = {
  supabaseUrl: requiredEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: requiredEnv("VITE_SUPABASE_ANON_KEY"),
  backendBaseUrl: normalizedBackendBaseUrl()
};

export const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

if (import.meta.env.DEV) {
  console.info(`[app-home] VITE_BACKEND_URL → API base: ${config.backendBaseUrl}`);
}
