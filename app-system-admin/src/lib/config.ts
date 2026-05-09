function requiredEnv(name: string): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env?.[name];
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required env var: ${name}`);
  return s;
}

/** Match app-executive: no trailing slash; strip trailing `/api` so paths like `/api/me` resolve correctly. */
function normalizedBackendBaseUrl(): string {
  const raw = String(
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BACKEND_URL ?? "http://localhost:3001"
  )
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  return raw || "http://localhost:3001";
}

export const config = {
  supabaseUrl: requiredEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: requiredEnv("VITE_SUPABASE_ANON_KEY"),
  backendBaseUrl: normalizedBackendBaseUrl()
};

if (import.meta.env.DEV) {
  console.info(`[app-system-admin] VITE_BACKEND_URL → API base: ${config.backendBaseUrl}`);
}
