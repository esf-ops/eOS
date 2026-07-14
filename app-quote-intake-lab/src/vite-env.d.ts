/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HEAD_URL_HOME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
