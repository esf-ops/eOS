/// <reference types="vite/client" />
/**
 * eliteOS shared Supabase **auth options** only — does **not** import `@supabase/supabase-js`
 * so each Vite app resolves that package from its own `node_modules` during Rollup builds (e.g. Vercel).
 *
 * Each app: `createClient(url, anonKey, { auth: buildEliteosSupabaseAuthOptions(url) })`.
 */

import {
  createChunkedCookieAuthStorage,
  type ChunkedCookieStorageOptions,
  type EliteosAuthStorage
} from "./chunkedCookieStorage";

export { createChunkedCookieAuthStorage as createEliteosCookieStorage } from "./chunkedCookieStorage";
export type { ChunkedCookieStorageOptions, EliteosAuthStorage } from "./chunkedCookieStorage";

/** Matches GoTrue default storage key for a Supabase project URL. */
export function supabaseAuthStorageKeyFromUrl(supabaseUrl: string): string {
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split(".")[0] || "local";
    return `sb-${ref}-auth-token`;
  } catch {
    return "sb-auth-token";
  }
}

/**
 * Optional `VITE_ELITEOS_AUTH_COOKIE_DOMAIN`: `"false"` forces default per-origin storage.
 * When unset on `eliteosfab.com` / `*.eliteosfab.com`, uses `.eliteosfab.com`.
 */
export function resolveEliteosAuthCookieDomain(): string | null {
  try {
    const envRaw = import.meta.env?.VITE_ELITEOS_AUTH_COOKIE_DOMAIN as string | undefined;
    if (envRaw === "false" || envRaw === "off" || envRaw === "0") return null;
    if (envRaw != null && envRaw.trim() !== "") return envRaw.trim();

    if (typeof window === "undefined") return null;
    const h = window.location.hostname;
    if (h === "eliteosfab.com" || h.endsWith(".eliteosfab.com")) {
      return ".eliteosfab.com";
    }
    return null;
  } catch {
    return null;
  }
}

function useSecureCookies(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

/** Options passed to `createClient(url, key, { auth })` for eliteOS staff heads + Home. */
export type EliteosSupabaseAuthOptions = {
  storageKey: string;
  persistSession: boolean;
  autoRefreshToken: boolean;
  detectSessionInUrl: boolean;
  storage?: EliteosAuthStorage;
};

export function buildEliteosSupabaseAuthOptions(supabaseUrl: string): EliteosSupabaseAuthOptions {
  const storageKey = supabaseAuthStorageKeyFromUrl(supabaseUrl);
  const cookieDomain = resolveEliteosAuthCookieDomain();

  if (cookieDomain != null) {
    const cookieOpts: ChunkedCookieStorageOptions = {
      cookieDomain,
      secure: useSecureCookies(),
      sameSite: "Lax"
    };
    return {
      storageKey,
      storage: createChunkedCookieAuthStorage(cookieOpts),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    };
  }

  return {
    storageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  };
}
