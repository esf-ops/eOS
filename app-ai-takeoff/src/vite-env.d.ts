/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_BACKEND_URL?: string;
  /** eliteOS Home Launcher URL — used for brand link and "Open Home" in user menu. */
  readonly VITE_HEAD_URL_HOME?: string;
  /** Override .eliteosfab.com cookie domain (set "false" to disable cookie storage). */
  readonly VITE_ELITEOS_AUTH_COOKIE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
