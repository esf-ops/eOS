function normalizedBackendBaseUrl(): string {
  const raw = String(import.meta.env.VITE_BACKEND_URL ?? "").trim();
  if (raw) {
    const normalized = raw.replace(/\/+$/, "").replace(/\/api$/i, "");
    if (!import.meta.env.DEV && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(normalized)) {
      throw new Error("VITE_BACKEND_URL cannot point to localhost in production.");
    }
    return normalized;
  }
  if (import.meta.env.DEV) return "http://localhost:3001";
  throw new Error("Missing required env var: VITE_BACKEND_URL");
}

function normalizedUrl(raw: unknown, devFallback: string, prodFallback: string): string {
  const s = String(raw ?? "").trim();
  if (s) return s.replace(/\/+$/, "");
  return import.meta.env.DEV ? devFallback : prodFallback;
}

export const config = {
  backendBaseUrl: normalizedBackendBaseUrl(),
  homeUrl: normalizedUrl(import.meta.env.VITE_HOME_URL ?? import.meta.env.VITE_HEAD_URL_HOME, "http://localhost:5177", "https://www.eliteosfab.com"),
  quoteLibraryUrl: normalizedUrl(import.meta.env.VITE_HEAD_URL_QUOTE_LIBRARY, "http://localhost:5183", ""),
  /** Dev-only: skip sign-in and price against the local harness. Always false in production builds. */
  preview: import.meta.env.DEV && String(import.meta.env.VITE_ESTIMATE_BUILDER_PREVIEW ?? "").trim() === "1"
};
