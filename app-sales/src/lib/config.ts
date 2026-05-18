function requiredEnv(name: string): string {
  const v = import.meta.env[name];
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required env var: ${name}`);
  return s;
}

function normalizedBackendBaseUrl(): string {
  const raw = String(import.meta.env.VITE_BACKEND_URL ?? "").trim();
  if (raw) {
    const normalized = raw.replace(/\/+$/, "").replace(/\/api$/i, "");
    if (!import.meta.env.DEV && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(normalized)) {
      throw new Error("VITE_BACKEND_URL cannot point to localhost in production.");
    }
    return normalized;
  }
  /** Dev default: empty → same origin; Vite proxies `/api` to backend (see vite.config.ts). */
  if (import.meta.env.DEV) return "";
  throw new Error("Missing required env var: VITE_BACKEND_URL");
}

function normalizedHomeUrl(): string {
  const raw = String(import.meta.env.VITE_HOME_URL ?? "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  return import.meta.env.DEV ? "http://localhost:5177" : "https://www.eliteosfab.com";
}

export const config = {
  supabaseUrl: requiredEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: requiredEnv("VITE_SUPABASE_ANON_KEY"),
  backendBaseUrl: normalizedBackendBaseUrl(),
  homeUrl: normalizedHomeUrl()
};

if (import.meta.env.DEV) {
  console.info(
    `[app-sales] API base: ${config.backendBaseUrl || "(same-origin /api → Vite proxy → localhost:3001)"}`
  );
}
