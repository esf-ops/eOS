function env(name: string): string {
  return String((import.meta as unknown as { env?: Record<string, string> }).env?.[name] ?? "").trim();
}

function normalizedBackendBaseUrl(): string {
  const raw = env("VITE_BACKEND_URL");
  if (raw) {
    return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
  }
  if (import.meta.env.DEV) return "http://localhost:3001";
  return "";
}

function normalizedHomeUrl(): string {
  const raw = env("VITE_HOME_URL");
  if (raw) return raw.replace(/\/+$/, "");
  return import.meta.env.DEV ? "http://localhost:5177" : "https://www.eliteosfab.com";
}

export type OrgDirectoryRuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  backendBaseUrl: string;
  homeUrl: string;
};

/** Non-secret diagnostics for missing deploy env (never includes keys). */
export function readOrgDirectoryConfig(): { config: OrgDirectoryRuntimeConfig | null; missing: string[] } {
  const missing: string[] = [];
  const supabaseUrl = env("VITE_SUPABASE_URL");
  const supabaseAnonKey = env("VITE_SUPABASE_ANON_KEY");
  const backendBaseUrl = normalizedBackendBaseUrl();

  if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY");
  if (!backendBaseUrl) missing.push("VITE_BACKEND_URL");

  if (missing.length > 0) {
    return { config: null, missing };
  }

  return {
    config: {
      supabaseUrl,
      supabaseAnonKey,
      backendBaseUrl,
      homeUrl: normalizedHomeUrl()
    },
    missing: []
  };
}

export const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

if (import.meta.env.DEV) {
  const { config } = readOrgDirectoryConfig();
  if (config) {
    console.info(`[app-org-directory] VITE_BACKEND_URL → API base: ${config.backendBaseUrl}`);
  }
}
