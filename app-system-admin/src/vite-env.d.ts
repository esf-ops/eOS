/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** eliteOS Home / Launcher URL used by the user menu's "Open Home" action. */
  readonly VITE_HEAD_URL_HOME?: string;
  /** Pricing Admin head URL — used by an existing in-app cross-link card. */
  readonly VITE_HEAD_URL_PRICING_ADMIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
