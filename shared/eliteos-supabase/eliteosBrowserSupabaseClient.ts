/// <reference types="vite/client" />
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createChunkedCookieAuthStorage } from "./chunkedCookieStorage";

/**
 * Supabase auth storage key — matches @supabase/supabase-js default for a project URL host.
 */
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
 * Optional override via VITE_ELITEOS_AUTH_COOKIE_DOMAIN — set to "false" to force localStorage on prod,
 * or ".yourcompany.com" for non-eliteosfab staging.
 *
 * When unset: if hostname is eliteosfab.com or *.eliteosfab.com, defaults to ".eliteosfab.com".
 * Localhost / unknown hosts → localStorage (per-origin), unchanged dev behavior.
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

/**
 * Single-browser Supabase client for eliteOS heads + Home: shared cookie session across subdomains when applicable.
 */
export function createEliteosBrowserSupabaseClient(supabaseUrl: string, supabaseAnonKey: string): SupabaseClient {
  const storageKey = supabaseAuthStorageKeyFromUrl(supabaseUrl);
  const cookieDomain = resolveEliteosAuthCookieDomain();

  const auth =
    cookieDomain != null
      ? {
          storage: createChunkedCookieAuthStorage({
            cookieDomain,
            secure: useSecureCookies(),
            sameSite: "Lax" as const
          }),
          storageKey,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      : {
          storageKey,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        };

  return createClient(supabaseUrl, supabaseAnonKey, { auth });
}
