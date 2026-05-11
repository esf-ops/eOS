function requiredEnv(name: string): string {
  const v = import.meta.env[name];
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required env var: ${name}`);
  return s;
}

function normalizedBackendBaseUrl(): string {
  const raw = String(import.meta.env.VITE_BACKEND_URL ?? "").trim();
  if (raw) return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
  /** Dev default: empty → same origin; Vite proxies `/api` to backend (see vite.config.ts). */
  if (import.meta.env.DEV) return "";
  return "http://localhost:3001";
}

export const config = {
  supabaseUrl: requiredEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: requiredEnv("VITE_SUPABASE_ANON_KEY"),
  backendBaseUrl: normalizedBackendBaseUrl(),
  homeUrl: String(import.meta.env.VITE_HOME_URL ?? "http://localhost:5177").replace(/\/+$/, "")
};

if (import.meta.env.DEV) {
  console.info(
    `[app-sales] API base: ${config.backendBaseUrl || "(same-origin /api → Vite proxy → localhost:3001)"}`
  );
}
