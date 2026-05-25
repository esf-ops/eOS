/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HEAD_URL_QUOTE_LIBRARY?: string;
  /**
   * Optional override for the eliteOS Home / Launcher URL used by the topbar
   * user menu's "Open Home" action. Defaults to `https://www.eliteosfab.com`
   * when unset.
   */
  readonly VITE_HEAD_URL_HOME?: string;
}
