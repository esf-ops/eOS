/**
 * Production / staging URLs for eliteOS heads — read from env only (no secrets).
 * Prefer `HEAD_URL_*` on backend-core; Vercel preview hosts belong in env, not source.
 */

const SLUG_TO_ENV_KEYS = Object.freeze({
  public_quote: ["HEAD_URL_PUBLIC_QUOTE"],
  quote: ["HEAD_URL_INTERNAL_ESTIMATE", "HEAD_URL_QUOTE"],
  pricing_admin: ["HEAD_URL_PRICING_ADMIN"],
  sales: ["HEAD_URL_SALES"],
  system_admin: ["HEAD_URL_SYSTEM_ADMIN"],
  executive: ["HEAD_URL_EXECUTIVE"],
  brain_health: ["HEAD_URL_BRAIN_HEALTH"],
  production: ["HEAD_URL_PRODUCTION"],
  shop_tv: ["HEAD_URL_SHOP_TV"],
  install: ["HEAD_URL_INSTALL"],
  purchasing: ["HEAD_URL_PURCHASING"],
  customer_service: ["HEAD_URL_CUSTOMER_SERVICE"],
  hr: ["HEAD_URL_HR"],
  safety: ["HEAD_URL_SAFETY"],
  marketing: ["HEAD_URL_MARKETING"],
  finance: ["HEAD_URL_FINANCE"],
  reports: ["HEAD_URL_REPORTS"],
  partner_quote: ["HEAD_URL_PARTNER_QUOTE"],
  dealer_resources: ["HEAD_URL_DEALER_RESOURCES"]
});

function firstTrimmedEnv(keys) {
  for (const k of keys) {
    const v = String(process.env[k] ?? "").trim();
    if (v) return v.replace(/\/+$/, "");
  }
  return "";
}

/**
 * @param {string} slug
 * @returns {string} absolute URL or empty string
 */
export function resolveHeadDeploymentUrl(slug) {
  const s = String(slug ?? "").trim();
  const keys = SLUG_TO_ENV_KEYS[s];
  if (!keys) return "";
  return firstTrimmedEnv(keys);
}

/**
 * @param {string} url
 * @returns {'live' | 'testing' | 'planned'}
 */
export function inferHeadDeploymentStatus(url) {
  const u = String(url ?? "").trim();
  if (!u) return "planned";
  try {
    const { hostname } = new URL(u);
    const h = hostname.toLowerCase();
    if (h.endsWith(".vercel.app") || h.includes("localhost") || h === "127.0.0.1") return "testing";
    return "live";
  } catch {
    return "planned";
  }
}
