/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_HOME_URL?: string;
  readonly VITE_HEAD_URL_HOME?: string;
  readonly VITE_HEAD_URL_QUOTE_LIBRARY?: string;
  readonly VITE_ELITEOS_AUTH_COOKIE_DOMAIN?: string;
  readonly VITE_ESTIMATE_BUILDER_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
