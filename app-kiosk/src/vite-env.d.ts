/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KIOSK_ELITE100_URL?: string;
  readonly VITE_KIOSK_PRODUCT_CATALOG_URL?: string;
  readonly VITE_KIOSK_LIVE_INVENTORY_URL?: string;
  readonly VITE_KIOSK_VISUALIZER_URL?: string;
  readonly VITE_KIOSK_PUBLIC_BASE_URL?: string;
  readonly VITE_KIOSK_IDLE_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
