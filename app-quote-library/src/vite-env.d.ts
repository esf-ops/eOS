/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_BACKEND_URL: string;
  /** Optional; defaults to https://internal.eliteosfab.com */
  readonly VITE_HEAD_URL_INTERNAL_ESTIMATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
