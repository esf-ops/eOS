function requiredEnv(name: string): string {
  const v = (import.meta as any).env?.[name];
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required env var: ${name}`);
  return s;
}

export const config = {
  supabaseUrl: requiredEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: requiredEnv("VITE_SUPABASE_ANON_KEY"),
  backendBaseUrl: String((import.meta as any).env?.VITE_BACKEND_URL ?? "http://localhost:3001").trim()
};

