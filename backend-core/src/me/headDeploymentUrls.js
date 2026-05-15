/**
 * Production / staging URLs for eliteOS heads — read from env only (no secrets).
 * Prefer `HEAD_URL_*` on backend-core; Vercel preview hosts belong in env, not source.
 */

const SLUG_TO_ENV_KEYS = Object.freeze({
  public_quote: ["HEAD_URL_PUBLIC_QUOTE"],
  quote: ["HEAD_URL_INTERNAL_ESTIMATE", "HEAD_URL_QUOTE"],
  quote_library: ["HEAD_URL_QUOTE_LIBRARY"],
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

/** Env keys whose URLs become Browser `Origin` values allowed by backend-core CORS (scheme + host [+ port]). */
const HEAD_URL_ENV_KEYS_FOR_CORS = Object.freeze([
  "HEAD_URL_HOME",
  ...Array.from(new Set(Object.values(SLUG_TO_ENV_KEYS).flat()))
]);

function isProductionBrain() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
}

/**
 * URLs that must never be advertised as launcher targets when Brain runs in production
 * (localhost, loopback, typical LAN/private hosts).
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isUnsafeLauncherHeadUrl(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();

    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host === "127.0.0.1" || host === "0.0.0.0") return true;
    if (host === "[::1]" || host === "::1") return true;

    if (host.startsWith("169.254.")) return true;

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

    const m172 = /^172\.(\d{1,3})\./.exec(host);
    if (m172) {
      const seg = Number(m172[1]);
      if (!Number.isNaN(seg) && seg >= 16 && seg <= 31) return true;
    }

    if (host.endsWith(".local")) return true;

    return false;
  } catch {
    return true;
  }
}

/**
 * Strips unsafe launcher URLs when NODE_ENV=production so `/api/me/heads` never returns dev/loopback targets.
 *
 * @param {string} url
 * @returns {string}
 */
export function sanitizeLauncherHeadUrl(url) {
  const trimmed = String(url ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!isProductionBrain()) return trimmed;
  if (isUnsafeLauncherHeadUrl(trimmed)) return "";
  return trimmed;
}

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
  const raw = firstTrimmedEnv(keys);
  return sanitizeLauncherHeadUrl(raw);
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

/**
 * Absolute origins derived from `HEAD_URL_*` env (same URLs Brain advertises via `/api/me/heads`).
 * Keeps CORS aligned with configured head deployments without duplicating hosts in `EOS_ALLOWED_ORIGINS`.
 *
 * @returns {string[]}
 */
export function collectHeadEnvOriginsForCors() {
  const out = [];
  for (const key of HEAD_URL_ENV_KEYS_FOR_CORS) {
    const raw = String(process.env[key] ?? "").trim().replace(/\/+$/, "");
    if (!raw) continue;
    const sanitized = sanitizeLauncherHeadUrl(raw);
    if (!sanitized) continue;
    try {
      const u = new URL(sanitized);
      out.push(`${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}
