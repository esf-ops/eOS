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

function normalizedHomeUrl(): string {
  const raw = String(import.meta.env.VITE_HOME_URL ?? import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  return import.meta.env.DEV ? "http://localhost:5177" : "https://www.eliteosfab.com";
}

export const config = {
  backendBaseUrl: normalizedBackendBaseUrl(),
  homeUrl: normalizedHomeUrl(),
  /** Dev-only unauthenticated fixture preview. Always false in production builds. */
  fixturePreview: import.meta.env.DEV && String(import.meta.env.VITE_ECC_FIXTURE_PREVIEW ?? "").trim() === "1",
};
