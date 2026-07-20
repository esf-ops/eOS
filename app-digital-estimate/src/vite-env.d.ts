/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  /** Public Supabase project URL — used at build time for CSP img-src (Storage images). */
  readonly VITE_SUPABASE_URL?: string;
  /** UI-only; never grants access. Exact "true" enables public configuration experience. */
  readonly VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED?: string; // kill-switch: exact "false" forces legacy
  /** UI-only; never grants access. Exact "true" shows review-request panel. */
  readonly VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
