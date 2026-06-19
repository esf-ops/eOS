function requiredEnv(name: string): string {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env?.[name];
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required env var: ${name}`);
  return s;
}

const env = import.meta.env;

/**
 * Same rules as `backend-core/src/me/headDeploymentUrls.js` — production Home must never surface dev targets.
 */
export function isUnsafeLauncherHeadUrl(url: string): boolean {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();

    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host === "127.0.0.1" || host === "0.0.0.0") return true;
    if (host === "[::1]" || host === "::1") return true;

    if (host.startsWith("169.254.")) return true;

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

    const m172 = /^172\.(\d{1,3})\./.exec(host);
    if (m172) {
      const seg = Number(m172[1]);
      if (!Number.isNaN(seg) && seg >= 16 && seg <= 31) return true;
    }

    if (host.endsWith(".local")) return true;

    return false;
  } catch {
    return true;
  }
}

/** Built app served to end users (not Vite dev server). */
function isProductionHomeRuntime(): boolean {
  return !import.meta.env.DEV;
}

/**
 * Normalizes a launcher URL for Home cards. In production builds, drops unsafe hosts and non-HTTPS targets.
 */
export function sanitizeLauncherLaunchUrl(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (isUnsafeLauncherHeadUrl(raw)) return null;
  if (isProductionHomeRuntime()) {
    try {
      if (new URL(raw).protocol !== "https:") return null;
    } catch {
      return null;
    }
  }
  return raw;
}

function envPick(key?: string): string {
  if (!key) return "";
  const raw = String((env as Record<string, string | undefined>)[key] ?? "").trim();
  return raw ? raw.replace(/\/+$/, "") : "";
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

/** Local defaults align with sibling Vite configs — used only when `import.meta.env.DEV` (never in production bundles). */
const HEAD_URL_DEFAULTS: Record<string, string> = {
  executive: "http://localhost:5175",
  brain_health: "http://localhost:5174",
  system_admin: "http://localhost:5176",
  sales: "http://localhost:5178",
  quote: "http://localhost:5180",
  quote_library: "http://localhost:5183",
  pricing_admin: "http://localhost:5182",
  custom_quote: "http://localhost:5187",
  install_dashboard: "http://localhost:5189",
  public_quote: "http://localhost:5179",
  app_home: "http://localhost:5177"
};

/** Preferred env keys — URLs should come from backend `/api/me/heads` when deployed; these are SPA fallbacks. */
const HEAD_ENV_KEYS: Record<string, string> = {
  executive: "VITE_HEAD_URL_EXECUTIVE",
  brain_health: "VITE_HEAD_URL_BRAIN_HEALTH",
  system_admin: "VITE_HEAD_URL_SYSTEM_ADMIN",
  sales: "VITE_HEAD_URL_SALES",
  quote: "VITE_HEAD_URL_INTERNAL_ESTIMATE",
  quote_library: "VITE_HEAD_URL_QUOTE_LIBRARY",
  pricing_admin: "VITE_HEAD_URL_PRICING_ADMIN",
  custom_quote: "VITE_HEAD_URL_CUSTOM_QUOTE",
  install_dashboard: "VITE_HEAD_URL_INSTALL_DASHBOARD",
  public_quote: "VITE_HEAD_URL_PUBLIC_QUOTE",
  org_directory: "VITE_HEAD_URL_ORG_DIRECTORY",
  app_home: "VITE_HEAD_URL_APP_HOME"
};

/** Legacy variable names (still honored if VITE_HEAD_URL_* is unset). */
const HEAD_LEGACY_ENV_KEYS: Record<string, string> = {
  executive: "VITE_EXECUTIVE_URL",
  brain_health: "VITE_BRAIN_HEALTH_URL",
  system_admin: "VITE_SYSTEM_ADMIN_URL",
  sales: "VITE_SALES_URL",
  quote: "VITE_QUOTE_URL"
};

/**
 * SPA fallback when `/api/me/heads` omits `url` — localhost defaults apply **only in dev**.
 * Production builds never infer localhost (prevents eliteOS Home on eliteosfab.com showing broken dev links).
 */
export function resolveHeadLaunchUrl(slug: string): string | null {
  const s = String(slug ?? "").trim();
  const primaryKey = HEAD_ENV_KEYS[s];
  const legacyKey = HEAD_LEGACY_ENV_KEYS[s];
  const fromEnv = envPick(primaryKey) || envPick(legacyKey);
  if (fromEnv) return sanitizeLauncherLaunchUrl(fromEnv);
  if (isProductionHomeRuntime()) return null;
  const d = HEAD_URL_DEFAULTS[s];
  return d ?? null;
}

export const config = {
  supabaseUrl: requiredEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: requiredEnv("VITE_SUPABASE_ANON_KEY"),
  backendBaseUrl: normalizedBackendBaseUrl()
};

export const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

if (import.meta.env.DEV) {
  console.info(`[eliteOS Home] VITE_BACKEND_URL → API base: ${config.backendBaseUrl}`);
}
