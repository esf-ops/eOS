interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_HEAD_URL_HOME?: string;
  /** UI-only; never grants access. Exact "true" shows Studio shell. */
  readonly VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED?: string;
  /** UI-only configuration builder gate; never grants access. Exact "true" shows config panel. */
  readonly VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED?: string;
  /** UI-only review queue gate; never grants access. Exact "true" shows review requests. */
  readonly VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED?: string;
  readonly VITE_HEAD_URL_DIGITAL_ESTIMATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
