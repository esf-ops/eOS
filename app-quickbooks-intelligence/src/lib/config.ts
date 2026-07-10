function requiredEnv(name: string): string {
  const v = (import.meta as { env?: Record<string, string> }).env?.[name];
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required env var: ${name}`);
  return s;
}

function normalizedBackendBaseUrl(): string {
  const raw = String((import.meta as { env?: Record<string, string> }).env?.VITE_BACKEND_URL ?? "http://localhost:3001")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  return raw || "http://localhost:3001";
}

export const config = {
  supabaseUrl: requiredEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: requiredEnv("VITE_SUPABASE_ANON_KEY"),
  backendBaseUrl: normalizedBackendBaseUrl(),
  homeUrl: String((import.meta as { env?: Record<string, string> }).env?.VITE_HOME_URL ?? "").trim(),
};

if (import.meta.env.DEV) {
  console.info(`[app-quickbooks-intelligence] Brain API base: ${config.backendBaseUrl}`);
}
